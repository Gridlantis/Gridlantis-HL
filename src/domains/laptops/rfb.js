const fs = require("fs");
const net = require("net");
const path = require("path");
const vm = require("vm");
const { errorWithStatus } = require("../../helpers");

// ─── LAPTOPS · VNC (RFB) handshake done by Metis ─────────────────────────────
// A laptop runs a VNC server locked to Metis's tailnet address and protected by
// a password that Metis keeps. Metis logs in to that server itself and hands
// the browser a session that is already authenticated, so noVNC never asks for
// a password and the password never reaches the browser.
//
//   browser (noVNC) ─ws─ Metis ─tcp─ laptop x11vnc
//   Metis plays the server for the browser (offering "no auth") and the client
//   for the laptop (answering its VNC-auth challenge). After both handshakes the
//   bytes, starting at ClientInit, are spliced straight through.

// VNC auth is DES with the password as the key. OpenSSL 3 dropped DES from
// Node's default provider, so reuse the DES that ships with the vendored noVNC.
// It is an ES module written for the browser; evaluate it in a bare context
// with the `export` keywords removed rather than keep a second copy.
let DESECBCipher = null;
function des() {
  if (DESECBCipher) return DESECBCipher;
  const file = path.join(__dirname, "../../ui/vendor/novnc/core/crypto/des.js");
  const src = fs.readFileSync(file, "utf8").replace(/^export\s+/gm, "");
  DESECBCipher = vm.runInNewContext(src + "\n;DESECBCipher", { Uint8Array });
  return DESECBCipher;
}

// The VNC password is at most 8 bytes, zero-padded; the challenge is 16 bytes.
function vncResponse(password, challenge) {
  const key = Buffer.alloc(8);
  Buffer.from(String(password), "latin1").copy(key, 0, 0, 8);
  const cipher = des().importKey(new Uint8Array(key));
  return Buffer.from(cipher.encrypt(null, new Uint8Array(challenge)));
}

const err = errorWithStatus(502);

// Pull exact byte counts off a socket during the handshake.
function reader(sock) {
  let buf = Buffer.alloc(0), want = null, ended = null;
  const onData = d => { buf = Buffer.concat([buf, d]); pump(); };
  const onEnd = () => { ended = err("the PC closed the connection during login"); pump(); };
  sock.on("data", onData);
  sock.on("end", onEnd);
  sock.on("close", onEnd);
  function pump() {
    if (!want) return;
    if (buf.length >= want.n) {
      const out = buf.subarray(0, want.n); buf = buf.subarray(want.n);
      const w = want; want = null; w.resolve(out);
    } else if (ended) { const w = want; want = null; w.reject(ended); }
  }
  return {
    read(n) { return new Promise((resolve, reject) => { want = { n, resolve, reject }; pump(); }); },
    // Stop reading and give back anything that arrived past the handshake.
    release() { sock.off("data", onData); sock.off("end", onEnd); sock.off("close", onEnd); const rest = buf; buf = Buffer.alloc(0); return rest; },
  };
}

const SEC_NONE = 1, SEC_VNC = 2;

// Connect to the laptop and complete the RFB 3.8 security handshake. Resolves
// with the socket positioned right before ClientInit, plus any bytes already
// read past that point (normally none).
function login(laptop, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: laptop.host, port: laptop.port || 5900 });
    const timer = setTimeout(() => { sock.destroy(); reject(err("the PC did not answer — is it awake and on the tailnet?", 504)); }, timeoutMs);
    const fail = e => { clearTimeout(timer); sock.destroy(); reject(e); };
    sock.once("error", e => fail(err(e.code === "ECONNREFUSED" ? "the laptop refused the connection — is the remote desktop service running?"
      : e.code === "EHOSTUNREACH" || e.code === "ENETUNREACH" ? "the laptop is unreachable — is it awake and on the tailnet?" : e.message, 502)));
    const r = reader(sock);
    (async () => {
      const version = (await r.read(12)).toString("latin1");
      if (!/^RFB 003\.00[3-8]\n$/.test(version)) throw err("that port is not a VNC server");
      if (version < "RFB 003.008") throw err("the PC's VNC server is too old (" + version.trim() + ")");
      sock.write("RFB 003.008\n");
      const n = (await r.read(1))[0];
      if (n === 0) {
        const len = (await r.read(4)).readUInt32BE(0);
        throw err("the PC refused: " + (await r.read(len)).toString("utf8"));
      }
      const types = Array.from(await r.read(n));
      if (types.includes(SEC_VNC)) {
        if (!laptop.password) throw err("the PC wants a password and none is saved", 409);
        sock.write(Buffer.from([SEC_VNC]));
        sock.write(vncResponse(laptop.password, await r.read(16)));
      } else if (types.includes(SEC_NONE)) {
        sock.write(Buffer.from([SEC_NONE]));
      } else {
        throw err("the PC only offers VNC security types Metis cannot speak (" + types.join(", ") + ")");
      }
      const result = (await r.read(4)).readUInt32BE(0);
      if (result !== 0) {
        let reason = "";
        try { const len = (await r.read(4)).readUInt32BE(0); reason = (await r.read(len)).toString("utf8"); } catch {}
        throw err("the PC rejected the saved password" + (reason ? " (" + reason + ")" : "") + " — re-run the setup script and re-pair", 401);
      }
      clearTimeout(timer);
      // Hold the stream until the caller has its own listeners on it.
      sock.pause();
      sock.removeAllListeners("error");
      resolve({ sock, rest: r.release() });
    })().catch(fail);
  });
}

// The setup script appends " metis-<key>=<value>" tokens to the desktop name;
// today just metis-monitors=WxH+X+Y/OUTPUT,… (the viewer parses it too).
function splitDesktopName(name) {
  const tok = {};
  const desktop = String(name).replace(/\s+metis-([a-z]+)=(\S*)/g, (_, k, v) => { tok[k] = v; return ""; }).trim();
  const monitors = tok.monitors == null ? null : tok.monitors.split(",")
    .map(s => /^(\d+)x(\d+)\+(\d+)\+(\d+)(?:\/(.*))?$/.exec(s)).filter(Boolean)
    .map(g => ({ w: +g[1], h: +g[2], x: +g[3], y: +g[4], name: g[5] || "" }));
  return { desktop, monitors };
}

// Reachability and login check for the page: logs in, reads the desktop's size
// and name from ServerInit, then hangs up.
async function probe(laptop) {
  const started = Date.now();
  const { sock } = await login(laptop, 6000);
  sock.on("error", () => {});
  try {
    const r = reader(sock);
    sock.resume();
    sock.write(Buffer.from([1]));                       // ClientInit: shared
    const head = await r.read(24);
    const { desktop, monitors } = splitDesktopName((await r.read(head.readUInt32BE(20))).toString("utf8"));
    return { online: true, width: head.readUInt16BE(0), height: head.readUInt16BE(2), desktop, monitors, ms: Date.now() - started };
  } finally { sock.destroy(); }
}

// Answer the browser's side of the handshake: RFB 3.8 with "None" as the only
// security type, then SecurityResult OK. Resolves with any bytes the browser
// sent after that (its ClientInit, usually).
function serveNoAuth(conn, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0), stage = 0;
    // A viewer that vanishes mid-handshake (tab killed, phone asleep) must not
    // leave the PC session half-open: x11vnc stops sending its clipboard to
    // every viewer while any client is still uninitialized.
    const timer = setTimeout(() => { conn.off("message", onMsg); conn.off("close", onClose); reject(err("the viewer did not finish connecting")); }, timeoutMs);
    const onMsg = msg => {
      buf = Buffer.concat([buf, msg]);
      if (stage === 0 && buf.length >= 12) {
        buf = buf.subarray(12);
        conn.send(Buffer.from([1, SEC_NONE]));
        stage = 1;
      }
      if (stage === 1 && buf.length >= 1) {
        const choice = buf[0]; buf = buf.subarray(1);
        clearTimeout(timer);
        conn.off("message", onMsg); conn.off("close", onClose);
        if (choice !== SEC_NONE) return reject(err("the viewer chose an unexpected security type"));
        conn.send(Buffer.from([0, 0, 0, 0]));
        resolve(buf);
      }
    };
    const onClose = () => { clearTimeout(timer); reject(err("the viewer went away")); };
    conn.on("message", onMsg);
    conn.on("close", onClose);
    conn.send(Buffer.from("RFB 003.008\n", "latin1"));
  });
}

// Log in to the laptop, then accept the WebSocket and join the two. The laptop
// login happens first so a failure can still be refused with an HTTP status.
async function bridge(laptop, req, socket, head) {
  const ws = require("../../ws");
  let up;
  try { up = await login(laptop); }
  catch (e) { ws.reject(socket, e.status === 401 ? 403 : e.status === 504 ? 504 : 502, "Bad Gateway"); throw e; }
  const { sock, rest } = up;
  const conn = ws.accept(req, socket, head);
  if (!conn) { sock.destroy(); return; }
  conn.heartbeat(15000);
  sock.setKeepAlive(true, 15000);
  sock.pause();
  let early;
  try { early = await serveNoAuth(conn); }
  catch { sock.destroy(); conn.close(1002, "handshake failed"); return; }
  if (early.length) sock.write(early);
  if (rest.length) conn.send(rest);
  sock.on("data", d => { if (!conn.send(d)) sock.pause(); });
  conn.on("drain", () => sock.resume());
  conn.on("message", msg => { if (!sock.write(msg)) socket.pause(); });
  sock.on("drain", () => socket.resume());
  sock.on("error", () => conn.close(1011, "PC connection lost"));
  sock.on("close", () => conn.close(1000, "PC closed the session"));
  conn.on("close", () => sock.destroy());
  sock.resume();
}

module.exports = { bridge, login, probe, splitDesktopName, vncResponse };
