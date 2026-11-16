const net = require("net");

// Clipboard bridge for PCs whose VNC server cannot reach the clipboard itself
// (krfb on Wayland: Qt's clipboard needs a focused window). The setup script
// installs a socket two ports below VNC — tailnet address, Metis only — that
// talks to Klipper (see tools/laptop/setup-remote.sh, clip.sh). A PC without
// it refuses the connection, and the viewer then sticks to VNC's clipboard.
//
// While a viewer polls, Metis holds one "watch" connection per PC and keeps
// the latest text with a sequence number; it hangs up after a quiet minute.
const MAX = 1024 * 1024;
const IDLE_MS = 60 * 1000;
const NO_BRIDGE_MS = 60 * 1000;
const watchers = new Map();   // id → { sock, text, seq, ready, lastPoll, error }
const missing = new Map();    // id → when the PC last refused (no bridge)

const portOf = pc => (pc.port || 5900) - 2;
const refusal = e => e.code === "ECONNREFUSED" || e.code === "ECONNRESET";

function startWatch(pc) {
  const w = { sock: null, text: "", seq: 0, ready: false, lastPoll: Date.now(), error: null };
  watchers.set(pc.id, w);
  const sock = w.sock = net.connect({ host: pc.host, port: portOf(pc) });
  sock.setKeepAlive(true, 15000);
  let buf = Buffer.alloc(0);
  const stop = () => { if (watchers.get(pc.id) === w) watchers.delete(pc.id); clearInterval(idle); sock.destroy(); };
  const idle = setInterval(() => { if (Date.now() - w.lastPoll > IDLE_MS) stop(); }, 10000);
  idle.unref();
  sock.on("connect", () => sock.write("watch\n"));
  sock.on("error", e => { w.error = e; if (refusal(e) && !w.ready) missing.set(pc.id, Date.now()); });
  sock.on("close", stop);
  sock.on("data", d => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      const nl = buf.indexOf(10);
      if (nl < 0) { if (buf.length > 64) stop(); return; }
      const head = buf.subarray(0, nl).toString("latin1");
      if (head === ".") { buf = buf.subarray(nl + 1); continue; }
      const m = /^T (\d+)$/.exec(head);
      if (!m || +m[1] > MAX) return stop();
      const n = +m[1];
      if (buf.length < nl + 1 + n) return;
      const text = buf.subarray(nl + 1, nl + 1 + n).toString("utf8");
      buf = buf.subarray(nl + 1 + n);
      if (!w.ready || text !== w.text) { w.text = text; w.seq++; }
      w.ready = true;
    }
  });
  return w;
}

// The PC's clipboard as last seen: { available, ready, text, seq }.
function get(pc) {
  const miss = missing.get(pc.id);
  if (miss && Date.now() - miss < NO_BRIDGE_MS) return { available: false };
  let w = watchers.get(pc.id);
  if (!w) w = startWatch(pc);
  w.lastPoll = Date.now();
  return { available: true, ready: w.ready, text: w.ready ? w.text : "", seq: w.seq };
}

// Replace the PC's clipboard.
function set(pc, text, timeoutMs = 5000) {
  text = String(text == null ? "" : text);
  if (Buffer.byteLength(text) > MAX) return Promise.reject(Object.assign(new Error("clipboard text too long"), { status: 413 }));
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: pc.host, port: portOf(pc) });
    let out = "";
    const done = (e, v) => { clearTimeout(t); sock.destroy(); e ? reject(e) : resolve(v); };
    const t = setTimeout(() => done(Object.assign(new Error("the PC's clipboard did not answer"), { status: 504 })), timeoutMs);
    sock.setEncoding("utf8");
    sock.on("connect", () => { sock.write("set\n"); sock.end(text); });
    sock.on("data", d => { out += d; });
    sock.on("error", e => {
      if (refusal(e)) missing.set(pc.id, Date.now());
      done(Object.assign(new Error(refusal(e) ? "this PC has no clipboard bridge — re-run the setup script" : e.message), { status: 502 }));
    });
    sock.on("close", () => {
      if (out.trim() !== "ok") return done(Object.assign(new Error("the PC could not set its clipboard (is the desktop signed in?)"), { status: 502 }));
      // The watcher will report this text next; count it as already seen.
      const w = watchers.get(pc.id);
      if (w && w.ready && w.text !== text) { w.text = text; w.seq++; }
      done(null, { ok: true });
    });
  });
}

module.exports = { get, set };
