const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { authenticated } = require("../session");
const adb = require("../domains/mobile/adb");
const airplay = require("../domains/mobile/airplay");
const { CTRL, encode, startSession } = require("../domains/mobile/scrcpy");
const { mobileHtml, viewerHtml } = require("../pages/mobile");

// Mobile host: Android phones over adb, mirrored and controlled through a
// scrcpy server on the phone — the QtScrcpy feature set in the browser.
const STATIC_ROOTS = {
  "/mobile/assets/": path.join(__dirname, "../ui/mobile"),
  "/mobile/shared/": path.join(__dirname, "../ui/shared"),
  "/mobile/vendor/": path.join(__dirname, "../ui/vendor/jmuxer"),
};
const USB_SCRIPT = path.join(__dirname, "../../tools/mobile/setup-usb.sh");
const SERIAL = /^[\w.:\-\[\]@ ]{1,120}$/;

// Uploads (push / install) stream straight to a temp file: APKs and videos
// are far bigger than readBody() is meant for.
function receiveFile(req, limit = 4 * 1024 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const file = path.join(os.tmpdir(), "openhl-mobile-" + crypto.randomBytes(6).toString("hex"));
    const out = fs.createWriteStream(file, { mode: 0o600 });
    let n = 0;
    req.on("data", c => { n += c.length; if (n > limit) { req.destroy(); out.destroy(); fs.unlink(file, () => {}); reject(Object.assign(new Error("file too large"), { status: 413 })); } });
    req.pipe(out);
    out.on("finish", () => resolve(file));
    out.on("error", reject); req.on("error", reject);
  });
}

module.exports = async function mobileRoutes(ctx) {
  const { req, res, parsed, pathname, json, html, readBody } = ctx;
  if (!pathname.startsWith("/mobile") && !pathname.startsWith("/api/mobile")) return;
  const body = async () => { const raw = (await readBody(64 * 1024)).toString(); return raw ? JSON.parse(raw) : {}; };
  const m = re => pathname.match(re);
  let mm;
  try {
    if (pathname === "/mobile" && req.method === "GET") return html(mobileHtml());
    if ((mm = m(/^\/mobile\/view\/([^/]+)$/)) && req.method === "GET") {
      const serial = decodeURIComponent(mm[1]);
      if (!SERIAL.test(serial)) { res.writeHead(302, { Location: "/mobile" }); return res.end(); }
      return html(viewerHtml(serial));
    }
    for (const [prefix, root] of Object.entries(STATIC_ROOTS)) {
      if (pathname.startsWith(prefix) && req.method === "GET") {
        const file = path.resolve(root, decodeURIComponent(pathname.slice(prefix.length)));
        if (!file.startsWith(root + path.sep)) return json({ error: "bad path" }, 400);
        let st; try { st = fs.statSync(file); } catch { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
        if (!st.isFile()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Content-Length": st.size, "Cache-Control": "no-cache" });
        return fs.createReadStream(file).pipe(res);
      }
    }

    // ── API ──────────────────────────────────────────────────────────────────
    if (pathname === "/api/mobile/tools" && req.method === "GET") return json(Object.assign(adb.toolsStatus(), { usbScript: USB_SCRIPT }));
    if (pathname === "/api/mobile/tools" && req.method === "POST") return json(await adb.installTools());
    if (pathname === "/api/mobile/devices" && req.method === "GET") {
      const tools = Object.assign(adb.toolsStatus(), { usbScript: USB_SCRIPT });
      if (!adb.adbPath()) return json({ devices: [], tools });
      return json({ devices: await adb.listDevices(parsed.searchParams.get("force") === "1"), tools });
    }
    // AirPlay receiver (iPhone / iPad): view and listen only.
    if (pathname === "/api/mobile/airplay" && req.method === "GET") return json(airplay.status());
    if (pathname === "/api/mobile/airplay" && req.method === "POST") {
      const b = await body();
      const name = typeof b.name === "string" && b.name.trim() ? { name: b.name.trim().replace(/[^\w .'-]/g, "").slice(0, 40) || "Open HL" } : {};
      return json(await airplay.setEnabled(b.enabled !== false, name));
    }
    if (pathname === "/api/mobile/airplay/pin" && req.method === "POST") return json(await airplay.newPin());
    if (pathname === "/api/mobile/pair" && req.method === "POST") { const b = await body(); return json({ ok: true, message: await adb.pair(String(b.address || "").trim(), String(b.code || "").trim()) }); }
    if (pathname === "/api/mobile/connect" && req.method === "POST") { const b = await body(); return json({ ok: true, message: await adb.connect(String(b.address || "").trim()) }); }
    if ((mm = m(/^\/api\/mobile\/([^/]+)\/(disconnect|wifi|push|install)$/)) && req.method === "POST") {
      const serial = decodeURIComponent(mm[1]);
      if (!SERIAL.test(serial)) return json({ error: "bad device" }, 400);
      if (mm[2] === "disconnect") return json({ ok: true, message: await adb.disconnect(serial) });
      if (mm[2] === "wifi") return json({ ok: true, message: await adb.enableWifi(serial) });
      const name = String(parsed.searchParams.get("name") || "file");
      const file = await receiveFile(req);
      try {
        if (mm[2] === "install") return json({ ok: true, message: await adb.installApk(serial, file) });
        return json({ ok: true, path: await adb.pushFile(serial, file, name) });
      } finally { fs.unlink(file, () => {}); }
    }
    return json({ error: "not found" }, 404);
  } catch (e) {
    if (!e.status || e.status >= 500) console.error("[mobile]", req.method, pathname, "-", e.message);
    return json({ error: e.message }, e.status || 500);
  }
};

// ── Mirroring over WebSocket ────────────────────────────────────────────────
// Server → browser, binary:  [1][flags: 1 config, 2 key][pts u64][H.264 data]
//                            [2][width u32][height u32]   (new capture session)
//                            [3][flags: 1 config][pts u64][audio data]
//                     text:  {type:"clipboard"|"status"|"error"|"audio"|"audioOff", …}
// Browser → server, text JSON input events, encoded here (domains/mobile/scrcpy).
const KEY_ACTIONS = new Set([0, 1]);
function handleInput(s, msg, state) {
  const p = () => ({ x: +msg.x || 0, y: +msg.y || 0, w: state.width, h: state.height });
  switch (msg.t) {
    case "touch": if ([0, 1, 2].includes(msg.a)) s.send(encode.touch(msg.a, Number.isInteger(msg.id) && msg.id >= 0 && msg.id < 1000 ? msg.id : -1, p(), msg.a === 1 ? 0 : 1)); break;
    case "scroll": s.send(encode.scroll(p(), +msg.dx || 0, +msg.dy || 0)); break;
    case "key": if (KEY_ACTIONS.has(msg.a) && Number.isInteger(msg.code)) s.send(encode.keycode(msg.a, msg.code, msg.meta >>> 0, msg.repeat >>> 0)); break;
    case "text": if (msg.s) s.send(encode.text(String(msg.s).slice(0, 300))); break;
    case "back": if (KEY_ACTIONS.has(msg.a)) s.send(encode.backOrScreenOn(msg.a)); break;
    case "clipboard": s.send(encode.setClipboard(++state.clipSeq, String(msg.s || ""), !!msg.paste)); break;
    case "getClipboard": s.send(encode.getClipboard(msg.cut ? 2 : 1)); break;
    case "power": s.send(encode.displayPower(!!msg.on)); break;
    case "cmd": {
      const c = { notifications: CTRL.EXPAND_NOTIFICATIONS, settings: CTRL.EXPAND_SETTINGS, collapse: CTRL.COLLAPSE_PANELS,
        rotate: CTRL.ROTATE, resetVideo: CTRL.RESET_VIDEO }[msg.c];
      if (c !== undefined) s.send(encode.simple(c));
      break;
    }
  }
}

// The AirPlay "device": every viewer shares UxPlay's one stream (an iPhone
// mirrors to one receiver), packets in the same shape as a phone's; input is
// ignored — iOS cannot be controlled from here.
const AIRPLAY = "airplay";
function airplayViewer(conn, socket, q) {
  const wantAudio = ["opus", "raw"].includes(q.get("audio"));
  const text = o => { try { conn.send(Buffer.from(JSON.stringify(o)), 1); } catch {} };
  const video = pk => {
    if (socket.writableLength > 4 * 1024 * 1024 && !pk.config && !pk.key) return;
    const h = Buffer.alloc(10); h[0] = 1; h[1] = (pk.config ? 1 : 0) | (pk.key ? 2 : 0); conn.send(Buffer.concat([h, pk.data]));
  };
  const reset = () => { const b = Buffer.alloc(9); b[0] = 2; conn.send(b); };       // size 0×0: "new stream, size from the video"
  const pcm = d => { if (socket.writableLength > 2 * 1024 * 1024) return; const h = Buffer.alloc(10); h[0] = 3; conn.send(Buffer.concat([h, d])); };
  const state = () => {
    const st = airplay.status();
    if (!st.running) text({ type: "status", text: "waiting", title: "The AirPlay receiver is off", hint: "Turn it on under Mobile host." });
    else if (!st.streaming) text({ type: "status", text: "waiting", title: "Waiting for an iPhone…",
      hint: `On the iPhone: Control Center → Screen Mirroring → "${st.name}". First time, enter PIN ${st.pin}.` });
    else text({ type: "status", text: "connected" });
  };
  airplay.hub.on("packet", video); airplay.hub.on("reset", reset); airplay.hub.on("state", state);
  if (wantAudio) { airplay.hub.on("pcm", pcm); text({ type: "audio", codec: "raw" }); }
  conn.on("close", () => { airplay.hub.off("packet", video); airplay.hub.off("reset", reset); airplay.hub.off("state", state); airplay.hub.off("pcm", pcm); });
  conn.on("message", () => {});
  reset();
  airplay.snapshot().forEach(video);
  state();
}

module.exports.handleUpgrade = function handleUpgrade(req, socket, head) {
  const ws = require("../ws");
  const url = new URL(req.url, "http://localhost");
  const mm = url.pathname.match(/^\/api\/mobile\/([^/]+)\/stream$/);
  if (!mm) return false;
  if (!authenticated(req)) { ws.reject(socket, 401, "Unauthorized"); return true; }
  const origin = req.headers.origin;
  if (origin) {
    let ok = false;
    try { ok = new URL(origin).host === req.headers.host; } catch {}
    if (!ok) { ws.reject(socket, 403, "Forbidden"); return true; }
  }
  const serial = decodeURIComponent(mm[1]);
  if (!SERIAL.test(serial)) { ws.reject(socket, 400, "Bad Request"); return true; }
  const conn = ws.accept(req, socket, head);
  if (!conn) return true;
  const q = url.searchParams;
  if (serial === AIRPLAY) { airplayViewer(conn, socket, q); return true; }
  const opts = { maxSize: Math.max(0, Math.min(4096, +q.get("max") || 1600)), bitRate: Math.max(500000, Math.min(50000000, +q.get("br") || 8000000)),
    maxFps: Math.max(5, Math.min(120, +q.get("fps") || 60)), turnScreenOff: q.get("screenOff") === "1",
    audio: ["opus", "raw"].includes(q.get("audio")) ? q.get("audio") : false, audioDup: q.get("audioDup") === "1" };
  const state = { width: 0, height: 0, clipSeq: 0, waitKey: false };
  const status = (o) => { try { conn.send(Buffer.from(JSON.stringify(o)), 1); } catch {} };
  let session = null, ended = false;
  conn.on("close", () => { ended = true; if (session) session.close("viewer left"); });
  status({ type: "status", text: "starting scrcpy on the phone…" });
  startSession(serial, opts).then(s => {
    session = s;
    if (ended) return s.close("viewer left");
    s.on("session", ({ width, height }) => {
      state.width = width; state.height = height;
      const b = Buffer.alloc(9); b[0] = 2; b.writeUInt32BE(width, 1); b.writeUInt32BE(height, 5); conn.send(b);
    });
    s.on("packet", pk => {
      // A slow viewer: drop frames until the next key frame rather than queue
      // seconds of video, and ask the phone for one.
      if (socket.writableLength > 4 * 1024 * 1024 && !pk.config) {
        if (!state.waitKey) { state.waitKey = true; s.send(encode.simple(CTRL.RESET_VIDEO)); }
        return;
      }
      if (state.waitKey && !pk.key && !pk.config) return;
      if (pk.key) state.waitKey = false;
      const h = Buffer.alloc(10); h[0] = 1; h[1] = (pk.config ? 1 : 0) | (pk.key ? 2 : 0); h.writeBigUInt64BE(pk.pts, 2);
      conn.send(Buffer.concat([h, pk.data]));
    });
    s.on("audio", pk => {
      if (socket.writableLength > 2 * 1024 * 1024 && !pk.config) return;   // a stalled viewer: drop sound, not picture
      const h = Buffer.alloc(10); h[0] = 3; h[1] = pk.config ? 1 : 0; h.writeBigUInt64BE(pk.pts, 2);
      conn.send(Buffer.concat([h, pk.data]));
    });
    s.on("audioCodec", codec => status({ type: "audio", codec }));
    s.on("audioOff", text => status({ type: "audioOff", text }));
    s.on("clipboard", text => status({ type: "clipboard", text }));
    s.on("close", reason => { status({ type: "error", text: reason }); try { conn.close(1000, "ended"); } catch {} });
    conn.on("message", (data, binary) => {
      if (binary) return;
      let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
      try { handleInput(s, msg, state); } catch (e) { /* malformed input is dropped */ }
    });
    status({ type: "status", text: "connected" });
  }).catch(e => {
    console.error("[mobile] mirroring", serial, "-", e.message);
    status({ type: "error", text: e.message });
    try { conn.close(1011, "failed"); } catch {}
  });
  return true;
};
