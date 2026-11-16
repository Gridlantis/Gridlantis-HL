const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { EventEmitter } = require("events");
const { execFile, spawn } = require("child_process");

const { SETTINGS, saveSettings } = require("../../settings");
const { TOOLS_DIR } = require("./adb");

// ═══ MOBILE HOST: AIRPLAY (iPhone / iPad / Mac) ═══════════════════════════════
// iOS has nothing like adb, so an iPhone cannot be controlled from Linux. It
// can mirror its screen and sound over AirPlay, though, and Metis receives it
// with UxPlay (an open-source AirPlay server). View and listen only.
//
// UxPlay builds a GStreamer pipeline whose parser/decoder/converter/sink are
// options, so instead of decoding and opening a window it hands the iPhone's
// H.264 straight on — no transcoding — and its audio as 48 kHz s16le PCM:
//   video: appsrc ! queue ! h264parse config-interval=-1 ! identity
//          ! video/x-h264,stream-format=byte-stream,alignment=au
//          ! tcpclientsink host=127.0.0.1 port=<V>
//   audio: … ! audioconvert ! audioresample ! volume ! level
//          ! audio/x-raw,format=S16LE,rate=48000,channels=2 ! tcpclientsink … port=<A>
// Metis listens on those two local ports and passes the stream to viewers in
// the same shape as a phone's (see routes/mobile.js), so one viewer serves both.
//
// Like adb, Metis keeps its own UxPlay: `apt-get download` + `dpkg -x` need no
// root. A system uxplay is used if there is one.

const UX_DIR = path.join(TOOLS_DIR, "uxplay");
const UX_ROOT = path.join(UX_DIR, "root");
const LOCAL_UXPLAY = path.join(UX_ROOT, "usr", "bin", "uxplay");
const LOCAL_LIBS = path.join(UX_ROOT, "usr", "lib", "x86_64-linux-gnu");
const err = (msg, status = 500) => Object.assign(new Error(msg), { status });

function systemUxplay() {
  for (const d of String(process.env.PATH || "").split(":")) {
    const p = path.join(d, "uxplay");
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch {}
  }
  return null;
}
const uxplayPath = () => (fs.existsSync(LOCAL_UXPLAY) ? LOCAL_UXPLAY : systemUxplay());
const run = (cmd, args, opts = {}) => new Promise((resolve, reject) =>
  execFile(cmd, args, Object.assign({ timeout: 180000 }, opts), (e, out, se) => e ? reject(err(String(se || e.message).trim().split("\n").pop(), 502)) : resolve(String(out))));

let INSTALLING = null;
function install() {
  if (INSTALLING) return INSTALLING;
  INSTALLING = (async () => {
    if (uxplayPath()) return;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "metis-uxplay-"));
    try {
      await run("apt-get", ["download", "uxplay", "libavahi-compat-libdnssd1"], { cwd: tmp });
      fs.mkdirSync(UX_ROOT, { recursive: true });
      for (const f of fs.readdirSync(tmp).filter(f => f.endsWith(".deb"))) await run("dpkg", ["-x", path.join(tmp, f), UX_ROOT]);
      if (!fs.existsSync(LOCAL_UXPLAY)) throw err("the uxplay package did not contain the program", 502);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  })().finally(() => { INSTALLING = null; });
  return INSTALLING;
}

// ── Settings ─────────────────────────────────────────────────────────────────
function cfg() {
  const c = Object.assign({ enabled: false, name: "Metis", pin: "" }, SETTINGS.airplay || {});
  if (!/^\d{4}$/.test(c.pin)) {                       // chosen once, then kept: the iPhone remembers the pairing
    c.pin = String(crypto.randomInt(0, 10000)).padStart(4, "0");
    SETTINGS.airplay = c; saveSettings();
  }
  return c;
}
function saveCfg(patch) { SETTINGS.airplay = Object.assign(cfg(), patch); saveSettings(); }

// ── Stream hub ───────────────────────────────────────────────────────────────
// Splits the Annex B byte stream into access units: SPS/PPS form a config
// packet, an IDR is a key frame. Keeps the frames since the last key frame so
// a viewer opening mid-stream starts at once instead of waiting for the next
// key frame, which an iPhone sends rarely.
const hub = new EventEmitter();
hub.setMaxListeners(50);
const GOP = { config: null, frames: [], bytes: 0 };
const GOP_MAX_BYTES = 24 * 1024 * 1024;
let streaming = false, lastData = 0;

function nalSplitter() {
  let buf = Buffer.alloc(0), prefix = [], frame = null;   // frame: { key, nals }
  // A frame (access unit) can be several slices; a slice whose first_mb_in_slice
  // is 0 (ue(v) "1" → top bit set) starts a new one. Emit a frame once the next
  // one — or anything that is not a slice — begins.
  const flush = () => {
    if (!frame) return;
    const data = Buffer.concat(frame.nals), key = frame.key; frame = null;
    if (key) { GOP.frames = []; GOP.bytes = 0; }
    if (GOP.bytes + data.length < GOP_MAX_BYTES) { GOP.frames.push({ key, data }); GOP.bytes += data.length; }
    else { GOP.frames = []; GOP.bytes = 0; }
    hub.emit("packet", { config: false, key, data });
  };
  const emit = nal => {
    const h = nal[2] === 1 ? 3 : 4, type = nal[h] & 0x1f;
    if (type === 1 || type === 5) {
      if (frame && (nal[h + 1] & 0x80)) flush();
      if (!frame) { frame = { key: false, nals: prefix }; prefix = []; }
      frame.nals.push(nal); if (type === 5) frame.key = true;
      return;
    }
    flush();
    if (type === 7 || type === 8) {
      GOP.config = type === 7 ? nal : Buffer.concat([GOP.config || Buffer.alloc(0), nal]);
      if (type === 8) hub.emit("packet", { config: true, key: false, data: GOP.config });
      return;
    }
    // Access unit delimiters (9) carry nothing a decoder needs and confuse
    // jMuxer; SEI and the like ride along with the next frame.
    if (type !== 9) prefix.push(nal);
  };
  return chunk => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    // Start codes are 00 00 01 (or 00 00 00 01). A NAL ends where the next starts,
    // so the last one waits for the next chunk.
    let start = -1, i = 0;
    for (; i + 3 <= buf.length; i++) {
      if (buf[i] === 0 && buf[i + 1] === 0 && buf[i + 2] === 1) {
        const s = i > 0 && buf[i - 1] === 0 ? i - 1 : i;
        if (start >= 0 && s > start) emit(buf.subarray(start, s));
        start = s; i += 2;
      }
    }
    buf = start >= 0 ? buf.subarray(start) : buf;
    if (buf.length > 32 * 1024 * 1024) buf = Buffer.alloc(0);   // garbage, not H.264
  };
}

let videoSrv = null, audioSrv = null, ports = null;
function listen() {
  if (ports) return Promise.resolve(ports);
  const mk = onConn => new Promise((resolve, reject) => {
    const srv = net.createServer(onConn);
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
  return Promise.all([
    mk(sock => {                                          // one connection per UxPlay video pipeline
      const split = nalSplitter();
      GOP.config = null; GOP.frames = []; GOP.bytes = 0;
      hub.emit("reset");
      sock.on("data", d => { lastData = Date.now(); if (!streaming) { streaming = true; hub.emit("state"); } split(d); });
      sock.on("error", () => {});
    }),
    mk(sock => {                                          // audio: raw PCM; UxPlay may open several
      // Whole stereo samples only (4 bytes): TCP splits anywhere.
      let rest = Buffer.alloc(0);
      sock.on("data", d => {
        const b = rest.length ? Buffer.concat([rest, d]) : d, n = b.length - (b.length % 4);
        rest = b.subarray(n);
        if (n) hub.emit("pcm", b.subarray(0, n));
      });
      sock.on("error", () => {});
    }),
  ]).then(([v, a]) => { videoSrv = v; audioSrv = a; ports = { video: v.address().port, audio: a.address().port }; return ports; });
}
// "Streaming" = video arrived in the last few seconds.
setInterval(() => { if (streaming && Date.now() - lastData > 4000) { streaming = false; hub.emit("state"); } }, 1000).unref();

// ── UxPlay process ───────────────────────────────────────────────────────────
let child = null, restartT = null, log = [], lastClient = null;
function pushLog(line) {
  log.push(line); if (log.length > 60) log.shift();
  const m = line.match(/Connection request from ([^ ]+)|Accepted IPv[46] client on socket \d+, connection from ([\d.:a-f]+)/i);
  if (m) lastClient = m[1] || m[2];
}
async function start() {
  const bin = uxplayPath();
  if (!bin) throw err("the AirPlay receiver is not installed", 409);
  if (child) return;
  const c = cfg();
  const p = await listen();
  const keyFile = path.join(UX_DIR, "server.pem"), regFile = path.join(UX_DIR, "register");
  fs.mkdirSync(UX_DIR, { recursive: true });
  const args = ["-n", c.name, "-nh", "-p", "-vsync", "no", "-nohold",
    "-pin", c.pin, "-key", keyFile, "-reg", regFile,
    "-vp", "h264parse config-interval=-1", "-vd", "identity",
    "-vc", "video/x-h264,stream-format=byte-stream,alignment=au",
    "-vs", `tcpclientsink host=127.0.0.1 port=${p.video}`,
    "-as", `audio/x-raw,format=S16LE,rate=48000,channels=2,layout=interleaved ! tcpclientsink host=127.0.0.1 port=${p.audio}`];
  const env = Object.assign({}, process.env, bin === LOCAL_UXPLAY ? { LD_LIBRARY_PATH: [LOCAL_LIBS, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":") } : {});
  child = spawn("stdbuf", ["-oL", "-eL", bin].concat(args), { env, stdio: ["ignore", "pipe", "pipe"] });
  const onOut = d => String(d).split("\n").map(s => s.trim()).filter(Boolean).forEach(pushLog);
  child.stdout.on("data", onOut); child.stderr.on("data", onOut);
  child.on("exit", code => {
    child = null; streaming = false; hub.emit("state");
    pushLog("uxplay exited (" + code + ")");
    // Keep it up while enabled; a crash should not need a visit to the page.
    if (cfg().enabled) { clearTimeout(restartT); restartT = setTimeout(() => start().catch(e => pushLog(e.message)), 5000); }
  });
  hub.emit("state");
}
async function newPin() {
  saveCfg({ pin: String(crypto.randomInt(0, 10000)).padStart(4, "0") });
  if (child) { stop(); await start(); }
  return status();
}
function stop() { clearTimeout(restartT); if (child) { child.kill("SIGTERM"); child = null; } streaming = false; hub.emit("state"); }

async function setEnabled(on, patch = {}) {
  saveCfg(Object.assign({}, patch, { enabled: !!on }));
  if (on) { stop(); await install(); await start(); } else stop();
  return status();
}
function status() {
  const c = cfg();
  return { installed: !!uxplayPath(), source: !uxplayPath() ? null : uxplayPath() === LOCAL_UXPLAY ? "metis" : "system",
    installing: !!INSTALLING, enabled: c.enabled, running: !!child, streaming, name: c.name, pin: c.pin,
    lastClient, log: log.slice(-12) };
}
// Late joiners get the cached config and frames since the last key frame.
const snapshot = () => (GOP.config ? [{ config: true, key: false, data: GOP.config }].concat(GOP.frames.map(f => ({ config: false, key: f.key, data: f.data }))) : []);

// Back on after a Metis restart if it was on.
setTimeout(() => { if (cfg().enabled) start().catch(e => pushLog(e.message)); }, 4000).unref();
process.on("exit", () => { try { child && child.kill(); } catch {} });

module.exports = { hub, install, newPin, setEnabled, snapshot, status, uxplayPath };
