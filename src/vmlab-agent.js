const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

// ─── VM LAB AGENT ────────────────────────────────────────────────────────────
// Turns a second device into a VM host for Gridlantis-HL. It serves exactly one thing:
// the /api/vmlab/* API from src/routes/vmlab-api.js, which is the same module
// Gridlantis-HL mounts for its own machine. There is no UI, no login page and no other
// Gridlantis-HL subsystem here — an Gridlantis-HL elsewhere on the tailnet proxies to this
// process with a bearer token and renders the pages itself.
//
//   OPENHL_ROLE=vmlab-agent node vmlab-agent.js
//
// Environment:
//   VMLAB_AGENT_TOKEN  shared secret (generated into vmlab/agent-token if unset)
//   VMLAB_AGENT_PORT   default 3010
//   VMLAB_AGENT_BIND   default 0.0.0.0
const { ROOT } = require("./config");
const api = require("./routes/vmlab-api");
const { VMLAB_DIR } = require("./domains/vmlab/paths");

const PORT = parseInt(process.env.VMLAB_AGENT_PORT || "3010", 10);
const BIND = process.env.VMLAB_AGENT_BIND || "0.0.0.0";
const TOKEN_FILE = path.join(VMLAB_DIR, "agent-token");

// The token is the only thing standing between the tailnet and this machine's
// QEMU, so it is generated long, kept owner-only, and never logged in full.
function loadToken() {
  const fromEnv = String(process.env.VMLAB_AGENT_TOKEN || "").trim();
  if (fromEnv) return fromEnv;
  try {
    const t = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (t) return t;
  } catch {}
  const t = crypto.randomBytes(32).toString("base64url");
  fs.writeFileSync(TOKEN_FILE, t + "\n", { mode: 0o600 });
  try { fs.chmodSync(TOKEN_FILE, 0o600); } catch {}
  console.log("• generated a new agent token in " + TOKEN_FILE);
  return t;
}
const TOKEN = loadToken();

// Compare in constant time, and on a digest so two different lengths do not
// throw instead of simply failing.
const DIGEST = crypto.createHash("sha256").update(TOKEN).digest();
function tokenOk(presented) {
  if (!presented) return false;
  const d = crypto.createHash("sha256").update(presented).digest();
  return crypto.timingSafeEqual(DIGEST, d);
}
function bearer(req) {
  const h = String(req.headers.authorization || "");
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

// Repeated wrong tokens from one address are almost certainly a scan, not a
// typo. Back off rather than answering at full speed forever.
const FAILURES = new Map();   // ip -> { n, until }
function throttled(ip) {
  const f = FAILURES.get(ip);
  return !!(f && f.until > Date.now());
}
function noteFailure(ip) {
  const f = FAILURES.get(ip) || { n: 0, until: 0 };
  f.n++;
  if (f.n >= 5) { f.until = Date.now() + 60000; f.n = 0; }
  FAILURES.set(ip, f);
}

function authorize(req, res, ip) {
  if (throttled(ip)) {
    res.writeHead(429, { "Content-Type": "application/json", "Retry-After": "60" });
    res.end(JSON.stringify({ error: "too many bad tokens — try again in a minute" }));
    return false;
  }
  if (!tokenOk(bearer(req))) {
    noteFailure(ip);
    console.error("[agent] rejected " + req.method + " " + req.url + " from " + ip + " (bad token)");
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "bad agent token" }));
    return false;
  }
  return true;
}

// ── Request handling ─────────────────────────────────────────────────────────
// The same ctx the Gridlantis-HL router builds, so vmlab-api.js cannot tell the
// difference — including the writeHead/end wrapper that marks a request as
// answered.
async function handle(req, res) {
  const ip = req.socket.remoteAddress || "?";
  let handled = false;
  const _writeHead = res.writeHead.bind(res);
  const _end = res.end.bind(res);
  res.writeHead = (...a) => { handled = true; return _writeHead(...a); };
  res.end = (...a) => { handled = true; return _end(...a); };

  const parsed = new URL(req.url, "http://localhost");
  const pathname = parsed.pathname;

  if (pathname === "/health" && req.method === "GET") {       // unauthenticated liveness only
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, agent: "openhl-vmlab" }));
  }
  if (!authorize(req, res, ip)) return;
  if (!pathname.startsWith("/api/vmlab/")) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("Not found");
  }

  function json(data, status = 200) {
    const body = JSON.stringify(data);
    res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
    res.end(body);
  }
  function readBody(maxBytes = 10 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on("data", c => {
        size += c.length;
        if (maxBytes && size > maxBytes) {
          const err = new Error("Request body too large"); err.status = 413;
          req.removeAllListeners("data"); req.pause();
          return reject(err);
        }
        chunks.push(c);
      });
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }

  try {
    await api.handleApi({ req, res, parsed, pathname, json, readBody });
  } catch (e) {
    if (!e.status || e.status >= 500) console.error("[agent]", req.method, pathname, "-", e.message);
    if (!handled) json({ error: e instanceof SyntaxError ? "Invalid JSON body" : e.message }, e instanceof SyntaxError ? 400 : (e.status || 500));
    return;
  }
  if (!handled) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("Not found"); }
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(err => {
    console.error("[agent]", req.method, req.url, "-", err.message);
    try {
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json", Connection: "close" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    } catch {}
  });
});
// Multi-GB ISO uploads must not be cut off at Node's 5-minute default.
server.requestTimeout = 0;
server.headersTimeout = 60 * 1000;

// ── The console tunnel ───────────────────────────────────────────────────────
// Gridlantis-HL relays the browser's WebSocket onto this one, so the bytes arriving
// here are already noVNC's, and the far end is this machine's QEMU.
const ws = require("./ws");
server.on("upgrade", (req, socket, head) => {
  socket.on("error", () => {});
  try {
    const ip = socket.remoteAddress || "?";
    const url = new URL(req.url, "http://localhost");
    const m = url.pathname.match(/^\/api\/vmlab\/envs\/([^/]+)\/vnc$/);
    if (!m) return socket.destroy();
    if (throttled(ip)) return ws.reject(socket, 429, "Too Many Requests");
    if (!tokenOk(bearer(req))) { noteFailure(ip); return ws.reject(socket, 401, "Unauthorized"); }
    if (!api.vncTarget(m[1])) return ws.reject(socket, 409, "Conflict");
    api.handleVncUpgrade(req, socket, head, m[1]);
  } catch (e) {
    console.error("[agent] upgrade:", e.message);
    socket.destroy();
  }
});

process.on("unhandledRejection", err => console.error("[UnhandledRejection]", (err && err.message) || err));
process.on("uncaughtException", err => console.error("[UncaughtException]", (err && err.message) || err));

// A copy that failed to bind would still run the VM watcher against the same
// VMs as the real agent, and delete their run folders mid-start. Quit instead.
server.on("error", err => {
  console.error("[Listen] " + (err.code === "EADDRINUSE" ? "port " + PORT + " is already in use — is the agent already running?" : err.message));
  process.exit(1);
});

server.listen(PORT, BIND, async () => {
  console.log("🖥  Gridlantis-HL VM Lab agent on " + os.hostname() + " → http://" + (BIND === "0.0.0.0" ? "0.0.0.0" : BIND) + ":" + PORT);
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs) if (a.family === "IPv4" && !a.internal) console.log("   " + name + ": http://" + a.address + ":" + PORT);
  }
  console.log("   Data dir:  " + ROOT);
  console.log("   VM Lab:    " + VMLAB_DIR);
  console.log("   Token:     " + TOKEN.slice(0, 4) + "…" + TOKEN.slice(-4) + "  (full value: " + TOKEN_FILE + ")");
  try {
    const cap = await api.capabilities();
    console.log("   QEMU:      " + (cap.qemu ? "yes" : "NOT INSTALLED — run tools/vmlab/install-qemu.sh"));
    console.log("   KVM:       " + (cap.kvmUsable ? "usable" : "no" + (cap.kvmProblem ? " (" + cap.kvmProblem + ")" : "")));
  } catch {}
});

module.exports = { server };
