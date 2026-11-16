const http = require("http");
const https = require("https");
const net = require("net");
const { URL } = require("url");
const { errorWithStatus } = require("../../helpers");

// ─── VM LAB · talking to a remote host's agent ───────────────────────────────
// A remote VM host runs vmlab-agent.js, which serves exactly the same
// /api/vmlab/* surface as Metis does locally, behind a bearer token. So Metis
// does not reimplement anything for remote hosts: it forwards the request and
// streams the answer straight back.
const err = errorWithStatus(502);

function agentOf(host) {
  if (!host || !host.url) throw err("that host has no address", 400);
  if (!host.token) throw err("that host has no agent token", 400);
  const u = new URL(host.url);
  return { u, mod: u.protocol === "https:" ? https : http };
}

// Connect quickly or give up: a sleeping laptop must not hang the page. Only
// the connect phase is bounded — once the agent answers, the transfer itself is
// left unlimited, because multi-GB ISO uploads stream through here.
const CONNECT_TIMEOUT = 8000;

function translate(host, e) {
  const where = host && host.name ? host.name : "the VM host";
  if (e && e.status) return e;
  const code = e && e.code;
  if (code === "ECONNREFUSED") return err(where + " refused the connection — is the VM Lab agent running?", 502);
  if (code === "EHOSTUNREACH" || code === "ENETUNREACH") return err(where + " is unreachable", 502);
  if (code === "ETIMEDOUT" || code === "ECONNRESET") return err(where + " did not answer", 504);
  if (code === "ENOTFOUND") return err(where + "'s address does not resolve", 502);
  return err((e && e.message) || "the VM host could not be reached", 502);
}

// ── Small JSON call (probes, agent info) ─────────────────────────────────────
function json(host, method, p, body, timeoutMs = 10000) {
  const { u, mod } = agentOf(host);
  const payload = body === null || body === undefined ? null : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = mod.request({
      protocol: u.protocol, hostname: u.hostname, port: u.port, method, path: p,
      headers: Object.assign({ Authorization: "Bearer " + host.token, Accept: "application/json" },
        payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}),
      rejectUnauthorized: false,
    }, res => {
      const chunks = [];
      let size = 0;
      res.on("data", c => { size += c.length; if (size <= 4 << 20) chunks.push(c); });
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = text; }
        if (res.statusCode >= 400) {
          const e = err((data && data.error) || (host.name + " answered HTTP " + res.statusCode), res.statusCode === 401 ? 502 : res.statusCode);
          if (res.statusCode === 401) e.message = host.name + " rejected the agent token";
          return reject(e);
        }
        resolve(data);
      });
      res.on("error", e => reject(translate(host, e)));
    });
    req.setTimeout(timeoutMs, () => req.destroy(err(host.name + " did not answer in time", 504)));
    req.on("error", e => reject(translate(host, e)));
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Full request proxy ───────────────────────────────────────────────────────
// Streams the client's request to the agent and the agent's response back,
// untouched. Hop-by-hop headers are dropped; everything else (content type,
// length, disposition for log downloads) is passed through.
const HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer",
  "transfer-encoding", "upgrade", "host", "cookie", "authorization"]);

function proxy(host, req, res, pathAndQuery) {
  const { u, mod } = agentOf(host);
  const headers = { Authorization: "Bearer " + host.token, Host: u.host };
  for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k.toLowerCase())) headers[k] = v;

  return new Promise(resolve => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    const failed = e => {
      const t = translate(host, e);
      if (!res.headersSent) {
        const body = JSON.stringify({ error: t.message });
        res.writeHead(t.status || 502, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
        res.end(body);
      } else { try { res.destroy(); } catch {} }
      done();
    };

    const out = mod.request({ protocol: u.protocol, hostname: u.hostname, port: u.port, method: req.method,
      path: pathAndQuery, headers, rejectUnauthorized: false }, up => {
      const outHeaders = {};
      for (const [k, v] of Object.entries(up.headers)) if (!HOP.has(k.toLowerCase())) outHeaders[k] = v;
      res.writeHead(up.statusCode || 502, outHeaders);
      up.pipe(res);
      up.on("error", () => { try { res.destroy(); } catch {} done(); });
      res.on("close", () => { if (!up.complete) up.destroy(); });
      up.on("end", done);
    });
    // Bound the wait for a connection, not the transfer: image uploads and
    // `qemu-img convert` can legitimately take hours.
    out.setTimeout(CONNECT_TIMEOUT, () => { if (!out.socket || !out.socket.remoteAddress) out.destroy(err(host.name + " did not answer in time", 504)); });
    out.on("socket", s => s.once("connect", () => out.setTimeout(0)));
    out.on("error", failed);
    req.on("aborted", () => out.destroy());
    req.pipe(out);
  });
}

// ── WebSocket tunnel (the VNC console) ───────────────────────────────────────
// The browser's WebSocket is already a raw byte pipe once the handshake is
// done, and the agent speaks the identical protocol — so after relaying the
// 101 we splice the two sockets and never touch a frame.
function tunnel(host, pathAndQuery, clientReq, clientSocket, head) {
  const { u } = agentOf(host);
  if (u.protocol === "https:") return Promise.reject(err("TLS agents are not supported for the console yet", 501));
  return new Promise((resolve, reject) => {
    const upstream = http.request({
      hostname: u.hostname, port: u.port, path: pathAndQuery, method: "GET",
      headers: {
        Authorization: "Bearer " + host.token,
        Host: u.host,
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": clientReq.headers["sec-websocket-version"] || "13",
        "Sec-WebSocket-Key": clientReq.headers["sec-websocket-key"],
        "Sec-WebSocket-Protocol": clientReq.headers["sec-websocket-protocol"] || "binary",
      },
    });
    upstream.setTimeout(CONNECT_TIMEOUT, () => upstream.destroy(err(host.name + " did not answer in time", 504)));
    upstream.on("upgrade", (upRes, upSocket, upHead) => {
      upstream.setTimeout(0);
      // Replay the agent's own 101 verbatim: it carries the Sec-WebSocket-Accept
      // computed from the browser's key, so the browser's handshake completes.
      const lines = ["HTTP/1.1 101 Switching Protocols"];
      for (const [k, v] of Object.entries(upRes.headers)) lines.push(k + ": " + v);
      clientSocket.write(lines.join("\r\n") + "\r\n\r\n");
      clientSocket.setNoDelay(true); upSocket.setNoDelay(true);
      clientSocket.setTimeout(0); upSocket.setTimeout(0);
      if (head && head.length) upSocket.write(head);
      if (upHead && upHead.length) clientSocket.write(upHead);
      clientSocket.pipe(upSocket);
      upSocket.pipe(clientSocket);
      const bin = () => { try { upSocket.destroy(); } catch {} try { clientSocket.destroy(); } catch {} };
      clientSocket.on("error", bin); upSocket.on("error", bin);
      clientSocket.on("close", bin); upSocket.on("close", bin);
      resolve();
    });
    // The agent answered normally (401, 409, …) instead of upgrading.
    upstream.on("response", res => {
      res.resume();
      reject(err(res.statusCode === 401 ? host.name + " rejected the agent token" : host.name + " refused the console (HTTP " + res.statusCode + ")",
        res.statusCode === 401 ? 502 : res.statusCode));
    });
    upstream.on("error", e => reject(translate(host, e)));
    upstream.end();
  });
}

module.exports = { json, proxy, tunnel };
