const crypto = require("crypto");
const net = require("net");
const { EventEmitter } = require("events");

const { SCRCPY_SERVER, SCRCPY_VERSION, adbOn, adbSpawn } = require("./adb");

// ═══ MOBILE HOST: SCRCPY SESSION ══════════════════════════════════════════════
// One mirroring session = one scrcpy server on the phone (protocol v5.0.1):
//
//   adb push scrcpy-server → /data/local/tmp/scrcpy-server.jar
//   adb forward tcp:<port> localabstract:scrcpy_<scid>
//   adb shell … app_process / com.genymobile.scrcpy.Server 5.0.1 scid=… tunnel_forward=true …
//
// Metis then opens the sockets through the forward, in this order:
//   video   — dummy byte, codec id (u32), then per capture session a 12-byte
//             session packet (MSB set; width, height) and media packets with a
//             12-byte header (config/key-frame flags + PTS, size) — H.264 here.
//   audio   — (when asked for) codec id, or 0/1 if the phone cannot capture
//             audio (Android < 11) — video carries on — then media packets
//             with the same 12-byte header: Opus or raw 48 kHz s16le stereo.
//   control — control messages in, device messages (clipboard) out.
// The browser decodes the H.264 itself (WebCodecs); see routes/mobile.js.

const CTRL = { KEYCODE: 0, TEXT: 1, TOUCH: 2, SCROLL: 3, BACK_OR_SCREEN_ON: 4, EXPAND_NOTIFICATIONS: 5, EXPAND_SETTINGS: 6,
  COLLAPSE_PANELS: 7, GET_CLIPBOARD: 8, SET_CLIPBOARD: 9, SET_DISPLAY_POWER: 10, ROTATE: 11, START_APP: 16, RESET_VIDEO: 17 };
const POINTER_GENERIC_FINGER = 0xfffffffffffffffen;   // (u64) -2
const FLAG_CONFIG = 1n << 62n, FLAG_KEY = 1n << 61n, PTS_MASK = FLAG_KEY - 1n;
const err = (msg, status = 502) => Object.assign(new Error(msg), { status });

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on("error", reject);
  });
}

// Connect to the forward and wait for the dummy byte: adb accepts the TCP
// connection even before the server listens on the phone, and then drops it.
function connectWithDummy(port, deadline) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const sock = net.connect(port, "127.0.0.1");
      let done = false;
      const retry = () => { if (done) return; done = true; sock.destroy();
        if (Date.now() > deadline) return reject(err("the scrcpy server on the phone did not start"));
        setTimeout(attempt, 150); };
      sock.once("data", d => { if (done) return; done = true; sock.pause(); if (d.length > 1) sock.unshift(d.subarray(1)); resolve(sock); });
      sock.once("error", retry); sock.once("close", retry);
    };
    attempt();
  });
}
function connectPlain(port) {
  return new Promise((resolve, reject) => { const s = net.connect(port, "127.0.0.1", () => resolve(s)); s.once("error", reject); });
}

// ── Control message encoding (app/src/control_msg.c, v5.0.1) ─────────────────
const u16fp = f => Math.min(0xffff, Math.max(0, Math.round(f * 65536)));
const i16fp = f => Math.min(0x7fff, Math.max(-0x8000, Math.round(f * 32768)));
function position(buf, at, p) {
  buf.writeInt32BE(Math.round(p.x), at); buf.writeInt32BE(Math.round(p.y), at + 4);
  buf.writeUInt16BE(p.w, at + 8); buf.writeUInt16BE(p.h, at + 10);
}
function str(s, max) {
  let b = Buffer.from(String(s || ""), "utf8");
  if (b.length > max) b = b.subarray(0, max);
  const head = Buffer.alloc(4); head.writeUInt32BE(b.length);
  return Buffer.concat([head, b]);
}
const encode = {
  keycode(action, keycode, metastate = 0, repeat = 0) {
    const b = Buffer.alloc(14); b[0] = CTRL.KEYCODE; b[1] = action; b.writeUInt32BE(keycode >>> 0, 2);
    b.writeUInt32BE(repeat >>> 0, 6); b.writeUInt32BE(metastate >>> 0, 10); return b;
  },
  text: s => Buffer.concat([Buffer.from([CTRL.TEXT]), str(s, 300)]),
  // action: 0 down, 1 up, 2 move. pointer: a finger id, or -2 for "the mouse as a finger".
  touch(action, pointer, p, pressure) {
    const b = Buffer.alloc(32); b[0] = CTRL.TOUCH; b[1] = action;
    b.writeBigUInt64BE(pointer < 0 ? POINTER_GENERIC_FINGER : BigInt(pointer), 2);
    position(b, 10, p); b.writeUInt16BE(u16fp(pressure), 22); b.writeUInt32BE(0, 24); b.writeUInt32BE(0, 28); return b;
  },
  scroll(p, h, v) {
    const b = Buffer.alloc(21); b[0] = CTRL.SCROLL; position(b, 1, p);
    b.writeInt16BE(i16fp(Math.max(-1, Math.min(1, h / 16))), 13); b.writeInt16BE(i16fp(Math.max(-1, Math.min(1, v / 16))), 15);
    b.writeUInt32BE(0, 17); return b;
  },
  backOrScreenOn: action => Buffer.from([CTRL.BACK_OR_SCREEN_ON, action]),
  simple: type => Buffer.from([type]),
  getClipboard: copyKey => Buffer.from([CTRL.GET_CLIPBOARD, copyKey]),
  setClipboard(seq, text, paste) {
    const head = Buffer.alloc(10); head[0] = CTRL.SET_CLIPBOARD; head.writeBigUInt64BE(BigInt(seq), 1); head[9] = paste ? 1 : 0;
    return Buffer.concat([head, str(text, (1 << 18) - 14)]);
  },
  displayPower: on => Buffer.from([CTRL.SET_DISPLAY_POWER, on ? 1 : 0]),
  startApp(name) { let b = Buffer.from(String(name), "utf8").subarray(0, 255); return Buffer.concat([Buffer.from([CTRL.START_APP, b.length]), b]); },
};

// ── Session ──────────────────────────────────────────────────────────────────
// Emits: "session" {width,height}, "packet" {config,key,pts,data}, "audio"
// {config,pts,data}, "audioCodec" name, "audioOff" reason, "clipboard" text,
// "log" line, "close" reason.
// audio: false, or "opus" / "raw". audioDup: keep playing on the phone too
// (Android 13+; needs the "playback" audio source).
async function startSession(serial, { maxSize = 1600, bitRate = 8000000, maxFps = 60, turnScreenOff = false, audio = false, audioDup = false } = {}) {
  const s = new EventEmitter();
  const scid = crypto.randomInt(1, 0x7fffffff).toString(16).padStart(8, "0");
  const port = await freePort();
  let shell = null, video = null, audioSock = null, control = null, closed = false, lastLog = "";

  s.close = reason => {
    if (closed) return; closed = true;
    try { video && video.destroy(); } catch {}
    try { audioSock && audioSock.destroy(); } catch {}
    try { control && control.destroy(); } catch {}
    try { shell && shell.kill(); } catch {}
    adbOn(serial, ["forward", "--remove", "tcp:" + port], { timeout: 5000 }).catch(() => {});
    s.emit("close", reason || "closed");
  };
  s.send = buf => { if (control && !closed) control.write(buf); };

  try {
    await adbOn(serial, ["push", SCRCPY_SERVER.file, "/data/local/tmp/scrcpy-server.jar"], { timeout: 60000 });
    await adbOn(serial, ["forward", "tcp:" + port, "localabstract:scrcpy_" + scid], { timeout: 10000 });
    const audioParams = audio ? ["audio=true", "audio_codec=" + (audio === "opus" ? "opus" : "raw"), "audio_bit_rate=128000"]
      .concat(audioDup ? ["audio_source=playback", "audio_dup=true"] : []) : ["audio=false"];
    const params = [`scid=${scid}`, "log_level=info", "tunnel_forward=true", ...audioParams, "control=true", "video_codec=h264",
      `max_size=${maxSize | 0}`, `video_bit_rate=${bitRate | 0}`, `max_fps=${maxFps | 0}`, "send_device_meta=false",
      "clipboard_autosync=true", "stay_awake=true"];
    shell = adbSpawn(serial, ["shell", `CLASSPATH=/data/local/tmp/scrcpy-server.jar app_process / com.genymobile.scrcpy.Server ${SCRCPY_VERSION} ${params.join(" ")}`]);
    const onLog = d => String(d).split("\n").map(l => l.trim()).filter(Boolean).forEach(l => { lastLog = l; s.emit("log", l); });
    shell.stdout.on("data", onLog); shell.stderr.on("data", onLog);
    shell.on("exit", code => s.close(lastLog && /ERROR|Exception/.test(lastLog) ? lastLog : "the scrcpy server stopped (" + code + ")"));

    video = await connectWithDummy(port, Date.now() + 10000);
    if (audio) audioSock = await connectPlain(port);
    control = await connectPlain(port);
  } catch (e) { s.close(e.message); throw e; }

  // Video stream parser.
  let buf = Buffer.alloc(0), codecRead = false;
  video.on("data", chunk => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    for (;;) {
      if (!codecRead) {
        if (buf.length < 4) return;
        const codec = buf.readUInt32BE(0); buf = buf.subarray(4); codecRead = true;
        if (codec === 0 || codec === 1) return s.close(codec ? "the phone could not start video capture" : "video disabled by the phone");
        if (codec !== 0x68323634) return s.close("unexpected video codec 0x" + codec.toString(16));
        continue;
      }
      if (buf.length < 12) return;
      if (buf[0] & 0x80) {                                  // session packet
        s.emit("session", { width: buf.readUInt32BE(4), height: buf.readUInt32BE(8) });
        buf = buf.subarray(12); continue;
      }
      const size = buf.readUInt32BE(8);
      if (buf.length < 12 + size) return;
      const flags = buf.readBigUInt64BE(0);
      s.emit("packet", { config: !!(flags & FLAG_CONFIG), key: !!(flags & FLAG_KEY), pts: flags & FLAG_CONFIG ? 0n : flags & PTS_MASK,
        data: buf.subarray(12, 12 + size) });
      buf = buf.subarray(12 + size);
    }
  });
  video.on("close", () => s.close("video stream ended"));
  video.on("error", () => {});
  video.resume();

  // Audio stream: codec id, then packets — no session packets.
  if (audioSock) {
    let abuf = Buffer.alloc(0), acodec = null;
    audioSock.on("data", chunk => {
      abuf = abuf.length ? Buffer.concat([abuf, chunk]) : chunk;
      for (;;) {
        if (acodec === null) {
          if (abuf.length < 4) return;
          const id = abuf.readUInt32BE(0); abuf = abuf.subarray(4);
          if (id === 0 || id === 1) { acodec = "off"; s.emit("audioOff", id ? "the phone reported an audio error" : "this phone cannot capture audio (Android 11+ needed)"); return; }
          acodec = { 0x6f707573: "opus", 0x00726177: "raw" }[id] || "unknown";
          if (acodec === "unknown") { s.emit("audioOff", "unexpected audio codec 0x" + id.toString(16)); return; }
          s.emit("audioCodec", acodec);
          continue;
        }
        if (acodec === "off" || acodec === "unknown") { abuf = Buffer.alloc(0); return; }
        if (abuf.length < 12) return;
        const size = abuf.readUInt32BE(8);
        if (abuf.length < 12 + size) return;
        const flags = abuf.readBigUInt64BE(0);
        s.emit("audio", { config: !!(flags & FLAG_CONFIG), pts: flags & FLAG_CONFIG ? 0n : flags & PTS_MASK, data: abuf.subarray(12, 12 + size) });
        abuf = abuf.subarray(12 + size);
      }
    });
    audioSock.on("error", () => {});
    audioSock.on("close", () => {});              // losing audio alone does not end the session
  }

  // Device messages: clipboard (0), clipboard ack (1), uhid output (2).
  let cbuf = Buffer.alloc(0);
  control.on("data", chunk => {
    cbuf = Buffer.concat([cbuf, chunk]);
    for (;;) {
      if (!cbuf.length) return;
      const t = cbuf[0];
      if (t === 0) { if (cbuf.length < 5) return; const n = cbuf.readUInt32BE(1); if (cbuf.length < 5 + n) return;
        s.emit("clipboard", cbuf.subarray(5, 5 + n).toString("utf8")); cbuf = cbuf.subarray(5 + n); }
      else if (t === 1) { if (cbuf.length < 9) return; cbuf = cbuf.subarray(9); }
      else if (t === 2) { if (cbuf.length < 5) return; const n = cbuf.readUInt16BE(3); if (cbuf.length < 5 + n) return; cbuf = cbuf.subarray(5 + n); }
      else { cbuf = Buffer.alloc(0); return; }
    }
  });
  control.on("close", () => s.close("control channel closed"));
  control.on("error", () => {});
  if (turnScreenOff) setTimeout(() => s.send(encode.displayPower(false)), 1500);
  return s;
}

module.exports = { CTRL, encode, startSession };
