const fs = require("fs");
const path = require("path");

const { authenticated } = require("../session");
const api = require("./vmlab-api");
const connection = require("../domains/vmlab/connection");
const hosts = require("../domains/vmlab/hosts");
const remote = require("../domains/vmlab/remote");
const { safeId } = require("../domains/vmlab/paths");
const { consoleHtml, vmlabHtml } = require("../pages/vmlab");

// VM Lab: virtual machine environments, OS images and ISOs, host USB
// passthrough, host specs/stats, and the VNC console tunnel.
//
// Every request names the machine it is for with ?host=<id>. "local" (the
// default) is answered here by src/routes/vmlab-api.js; any other id is a
// second device running the VM Lab agent, and the request — body, streaming
// upload and all — is forwarded to it untouched. The host registry itself is
// only ever local: agent addresses and tokens are never proxied anywhere.

const STATIC_ROOTS = {
  "/vmlab/assets/": path.join(__dirname, "../ui/vmlab"),
  "/vmlab/shared/": path.join(__dirname, "../ui/shared"),
  "/vmlab/novnc/": path.join(__dirname, "../ui/vendor/novnc"),
};
const MIME = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };

// The host id travels as a query parameter, so strip it before forwarding —
// the agent is its own "local" host and must not try to resolve it again.
function forwardTarget(parsed) {
  const q = new URLSearchParams(parsed.searchParams);
  q.delete("host");
  const s = q.toString();
  return parsed.pathname + (s ? "?" + s : "");
}

module.exports = async function vmlabRoutes(ctx) {
  const { req, res, parsed, pathname, json, html, readBody } = ctx;
  if (!pathname.startsWith("/vmlab") && !pathname.startsWith("/api/vmlab")) return;

  const body = async () => { const raw = (await readBody(2 * 1024 * 1024)).toString(); return raw ? JSON.parse(raw) : {}; };
  const fail = e => json(Object.assign({ error: e.message }, e.env ? { env: e.env } : {}), e.status || 500);
  const m = (re) => pathname.match(re);

  try {
    // ── Pages + static ───────────────────────────────────────────────────────
    // Always served by this Metis, whichever host the page then drives.
    let mm;
    if (pathname === "/vmlab" && req.method === "GET") return html(vmlabHtml());
    if ((mm = m(/^\/vmlab\/console\/([^/]+)$/)) && req.method === "GET") {
      if (!safeId(mm[1])) return json({ error: "bad id" }, 400);
      const host = hosts.get(parsed.searchParams.get("host") || hosts.LOCAL_ID);
      if (!host) return json({ error: "host not found" }, 404);
      return html(consoleHtml(mm[1], host));
    }
    for (const [prefix, root] of Object.entries(STATIC_ROOTS)) {
      if (pathname.startsWith(prefix) && req.method === "GET") {
        const rel = decodeURIComponent(pathname.slice(prefix.length));
        const file = path.resolve(root, rel);
        if (!file.startsWith(root + path.sep)) return json({ error: "bad path" }, 400);
        let st; try { st = fs.statSync(file); } catch { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
        if (!st.isFile()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Content-Length": st.size,
          "Cache-Control": prefix === "/vmlab/novnc/" ? "public, max-age=86400" : "no-cache" });
        return fs.createReadStream(file).pipe(res);
      }
    }

    // ── Hosts registry (never proxied) ───────────────────────────────────────
    if (pathname === "/api/vmlab/hosts" && req.method === "GET") {
      if (parsed.searchParams.get("status")) return json(await hosts.statusAll({ force: !!parsed.searchParams.get("refresh") }));
      return json(hosts.list());
    }
    if (pathname === "/api/vmlab/hosts" && req.method === "POST") return json(hosts.add(await body()));
    // How this browser reaches Metis (Funnel, tailnet direct or relayed, LAN),
    // shown on the console. Always about this Metis, so never proxied.
    if (pathname === "/api/vmlab/connection" && req.method === "GET") return json(await connection.describe(req));
    // Try an address and token before committing them to the registry.
    if (pathname === "/api/vmlab/hosts/test" && req.method === "POST") {
      const b = await body();
      const probe = { name: b.name || "that host", url: hosts.normalizeUrl(b.url), token: String(b.token || "").trim() };
      if (!probe.token) return json({ error: "the agent token is required" }, 400);
      try { return json({ online: true, info: await remote.json(probe, "GET", "/api/vmlab/agent/info", null, 8000) }); }
      catch (e) { return json({ online: false, error: e.message }); }
    }
    if ((mm = m(/^\/api\/vmlab\/hosts\/([^/]+)(?:\/(test))?$/))) {
      const [, id, action] = mm;
      if (action === "test" && req.method === "POST") return json(await hosts.status(id, { force: true }));
      if (req.method === "PATCH") return json(hosts.update(id, await body()));
      if (req.method === "DELETE") return json(hosts.remove(id));
    }

    // ── Everything else acts on one host ─────────────────────────────────────
    if (!pathname.startsWith("/api/vmlab/")) return;
    const hostId = parsed.searchParams.get("host") || hosts.LOCAL_ID;
    const host = hosts.get(hostId);
    if (!host) return json({ error: "VM host “" + hostId + "” is not set up" }, 404);
    if (hosts.isLocal(host)) return await api.handleApi(ctx);
    if (host.enabled === false) return json({ error: host.name + " is turned off in the host list" }, 409);
    return await remote.proxy(host, req, res, forwardTarget(parsed));

  } catch (e) {
    if (e instanceof SyntaxError) return json({ error: "Invalid JSON body" }, 400);
    if (!e.status || e.status >= 500) console.error("[vmlab]", req.method, pathname, "-", e.message);
    return fail(e);
  }
};

// ── VNC over WebSocket ───────────────────────────────────────────────────────
// The console tunnel is reachable only through Metis, so it inherits the Metis
// login. For a remote host the two sockets are spliced onto the agent's own
// tunnel, which is itself talking to that machine's QEMU.
module.exports.handleUpgrade = function handleUpgrade(req, socket, head) {
  const ws = require("../ws");
  const url = new URL(req.url, "http://localhost");
  const m = url.pathname.match(/^\/api\/vmlab\/envs\/([^/]+)\/vnc$/);
  if (!m) return false;
  if (!authenticated(req)) { ws.reject(socket, 401, "Unauthorized"); return true; }
  // Cookies ride along on cross-site WebSocket requests, so check where it came from.
  const origin = req.headers.origin;
  if (origin) {
    let ok = false;
    try { ok = new URL(origin).host === req.headers.host; } catch {}
    if (!ok) { ws.reject(socket, 403, "Forbidden"); return true; }
  }
  const id = m[1];
  if (!safeId(id)) { ws.reject(socket, 400, "Bad Request"); return true; }

  const host = hosts.get(url.searchParams.get("host") || hosts.LOCAL_ID);
  if (!host) { ws.reject(socket, 404, "Not Found"); return true; }

  if (hosts.isLocal(host)) {
    if (!api.vncTarget(id)) { ws.reject(socket, 409, "Conflict"); return true; }
    return api.handleVncUpgrade(req, socket, head, id);
  }
  if (host.enabled === false) { ws.reject(socket, 409, "Conflict"); return true; }
  remote.tunnel(host, "/api/vmlab/envs/" + id + "/vnc", req, socket, head)
    .catch(e => { ws.reject(socket, e.status === 409 ? 409 : 502, e.message.slice(0, 120)); });
  return true;
};
