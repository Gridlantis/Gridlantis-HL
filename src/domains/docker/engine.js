const fs = require("fs");
const http = require("http");
const { errorWithStatus } = require("../../helpers");

// ─── DOCKER · Engine API client ──────────────────────────────────────────────
// The Docker daemon speaks plain HTTP over a unix socket, so Node's own http
// module is the whole client — no dependency, same spirit as vmlab/qmp.js.
//
// Three shapes of call, because Docker uses three:
//   json()   — ordinary request/response (list, create, inspect)
//   stream() — chunked response read as it arrives (pull progress, log follow)
//   hijack() — the connection is upgraded to a raw duplex socket (exec, attach)
const SOCKET = process.env.DOCKER_SOCKET || "/var/run/docker.sock";

const err = errorWithStatus(500);

// Docker is reachable only if the socket exists *and* we may open it. Both
// failures are common (not installed / user not in the docker group) and the
// page explains them differently, so keep them apart.
function socketState() {
  try { fs.statSync(SOCKET); } catch { return { ok: false, reason: "no-socket" }; }
  try { fs.accessSync(SOCKET, fs.constants.R_OK | fs.constants.W_OK); } catch { return { ok: false, reason: "no-permission" }; }
  return { ok: true, reason: null };
}

// The daemon accepts unversioned paths, but pinning to the version it reports
// keeps behaviour stable if Docker is upgraded under us. Negotiated once.
let _version = null;
async function apiPrefix() {
  if (_version !== null) return _version;
  try {
    const v = await json("GET", "/version", null, { raw: true });
    _version = v && v.ApiVersion ? "/v" + v.ApiVersion : "";
  } catch { _version = ""; }
  return _version;
}

function request(method, path, body, opts = {}) {
  const st = socketState();
  if (!st.ok) {
    return Promise.reject(st.reason === "no-socket"
      ? err("Docker is not running on this host", 503)
      : err("Gridlantis-HL cannot use the Docker socket — add this user to the 'docker' group", 403));
  }
  return new Promise((resolve, reject) => {
    const payload = body === undefined || body === null ? null : Buffer.from(JSON.stringify(body));
    const headers = Object.assign({ Host: "docker" }, opts.headers || {});
    if (payload) { headers["Content-Type"] = "application/json"; headers["Content-Length"] = payload.length; }
    const req = http.request({ socketPath: SOCKET, method, path, headers, timeout: opts.timeout || 0 }, res => resolve(res));
    req.on("error", e => reject(err("Docker: " + e.message, 502)));
    if (opts.timeout) req.on("timeout", () => req.destroy(err("Docker did not respond", 504)));
    if (opts.onUpgrade) req.on("upgrade", (res, socket, head) => opts.onUpgrade(res, socket, head));
    if (payload) req.write(payload);
    req.end();
  });
}

function readAll(res) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    res.on("data", c => chunks.push(c));
    res.on("end", () => resolve(Buffer.concat(chunks)));
    res.on("error", reject);
  });
}

// Docker reports failures as {"message": "..."} — surface that, not "HTTP 409".
async function json(method, path, body, opts = {}) {
  const full = opts.raw ? path : (await apiPrefix()) + path;
  const res = await request(method, full, body, opts);
  const buf = await readAll(res);
  const text = buf.toString("utf8");
  let parsed = null;
  if (text.trim()) { try { parsed = JSON.parse(text); } catch { parsed = null; } }
  if (res.statusCode >= 400) {
    throw err("Docker: " + ((parsed && parsed.message) || text.trim() || "HTTP " + res.statusCode),
      res.statusCode === 404 ? 404 : res.statusCode === 409 ? 409 : 502);
  }
  return parsed;
}

// Newline-delimited JSON, one object per progress event (pull, events).
async function streamJson(method, path, body, onEvent, opts = {}) {
  const res = await request(method, (await apiPrefix()) + path, body, opts);
  if (res.statusCode >= 400) {
    const text = (await readAll(res)).toString("utf8");
    let m; try { m = JSON.parse(text).message; } catch {}
    throw err("Docker: " + (m || text.trim() || "HTTP " + res.statusCode), res.statusCode);
  }
  return new Promise((resolve, reject) => {
    let buf = "";
    res.setEncoding("utf8");
    res.on("data", d => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        let o; try { o = JSON.parse(line); } catch { continue; }
        onEvent(o);
      }
    });
    res.on("end", () => { if (buf.trim()) { try { onEvent(JSON.parse(buf)); } catch {} } resolve(); });
    res.on("error", reject);
    if (opts.signal) opts.signal.onAbort = () => res.destroy();
  });
}

// ── Log/attach framing ───────────────────────────────────────────────────────
// Without a TTY, Docker multiplexes stdout and stderr into one stream: each
// frame is an 8-byte header — [stream, 0,0,0, big-endian length] — then the
// payload. With a TTY the bytes are raw. Feed chunks in, get text out.
function demuxer(onText) {
  let buf = Buffer.alloc(0);
  return function push(chunk) {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 8) return;
      const type = buf[0];
      // A valid header has a stream id of 0-2 and three zero bytes. Anything
      // else means this is really a raw TTY stream, so stop trying to demux.
      if (type > 2 || buf[1] !== 0 || buf[2] !== 0 || buf[3] !== 0) { onText(buf.toString("utf8"), 1); buf = Buffer.alloc(0); return; }
      const len = buf.readUInt32BE(4);
      if (buf.length < 8 + len) return;
      onText(buf.slice(8, 8 + len).toString("utf8"), type);
      buf = buf.slice(8 + len);
    }
  };
}

// ── Exec: hijacked duplex socket ─────────────────────────────────────────────
// POST /exec/{id}/start with an Upgrade header hands back the raw connection,
// which is then a bidirectional pipe to the process inside the container.
async function execStart(execId, { tty = true } = {}) {
  const path = (await apiPrefix()) + "/exec/" + execId + "/start";
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify({ Detach: false, Tty: tty }));
    const req = http.request({
      socketPath: SOCKET, method: "POST", path,
      headers: { Host: "docker", "Content-Type": "application/json", "Content-Length": payload.length,
        Connection: "Upgrade", Upgrade: "tcp" },
    });
    req.on("upgrade", (res, socket) => { socket.setNoDelay(true); resolve(socket); });
    // Some daemons answer 200 with a hijacked body instead of 101.
    req.on("response", res => {
      if (res.statusCode >= 400) return readAll(res).then(b => {
        let m; try { m = JSON.parse(b.toString()).message; } catch {}
        reject(err("Docker: " + (m || "exec failed"), res.statusCode));
      });
      res.setNoDelay && res.setNoDelay(true);
      resolve(res.socket ? Object.assign(res.socket, { _res: res }) : res);
    });
    req.on("error", e => reject(err("Docker: " + e.message, 502)));
    req.write(payload);
    req.end();
  });
}

async function ping() {
  const st = socketState();
  if (!st.ok) return { ok: false, reason: st.reason };
  try {
    const v = await json("GET", "/version", null, { raw: true, timeout: 4000 });
    return { ok: true, reason: null, version: v.Version, apiVersion: v.ApiVersion, os: v.Os, arch: v.Arch };
  } catch (e) {
    return { ok: false, reason: e.status === 403 ? "no-permission" : "unreachable", error: e.message };
  }
}

// Same as request(), with the negotiated /vX.Y prefix applied.
async function vrequest(method, path, body, opts) {
  return request(method, (await apiPrefix()) + path, body, opts);
}

module.exports = { SOCKET, apiPrefix, demuxer, execStart, json, ping, request, readAll, socketState, streamJson, vrequest };
