const fs = require("fs");
const path = require("path");

const { tailnetIp } = require("../net");
const { authenticated } = require("../session");
const rfb = require("../domains/laptops/rfb");
const { fetchInfo } = require("../domains/laptops/info");
const clip = require("../domains/laptops/clip");
const laptops = require("../domains/laptops/store");
const { laptopsHtml, viewerHtml } = require("../pages/laptops");

// PC host: the saved laptops, their reachability, and the remote-desktop
// tunnel. The setup script itself is served by routes/public.js, since the
// laptop that fetches it has no Gridlantis-HL session.
const STATIC_ROOTS = {
  "/laptops/assets/": path.join(__dirname, "../ui/laptops"),
  "/laptops/shared/": path.join(__dirname, "../ui/shared"),
};
const SETUP_SCRIPT = path.join(__dirname, "../../tools/laptop/setup-remote.sh");

// The script with this Gridlantis-HL's address filled in as the default.
function setupScript() {
  const src = fs.readFileSync(SETUP_SCRIPT, "utf8");
  const ip = tailnetIp();
  return ip ? src.replace(/^OPENHL_IP="\$\{OPENHL_IP:-\}"$/m, `OPENHL_IP="\${OPENHL_IP:-${ip}}"`) : src;
}

// Probes are cached briefly: the page asks for every laptop on each load, and
// one that is asleep costs a full timeout.
const STATUS = new Map();
const STATUS_TTL = 10000;
async function status(l, force) {
  const hit = STATUS.get(l.id);
  if (!force && hit && Date.now() - hit.at < STATUS_TTL) return hit.value;
  let value;
  const [p, info] = await Promise.allSettled([rfb.probe(l), fetchInfo(l)]);
  if (p.status === "fulfilled") value = p.value;
  else value = { online: false, error: p.reason.message, auth: p.reason.status === 401 };
  if (info.status === "fulfilled") value.hw = info.value;
  else value.hwError = info.reason.message;
  STATUS.set(l.id, { at: Date.now(), value });
  return value;
}

module.exports = async function laptopRoutes(ctx) {
  const { req, res, parsed, pathname, json, html, readBody } = ctx;
  if (!pathname.startsWith("/laptops") && !pathname.startsWith("/api/laptops")) return;

  const body = async () => { const raw = (await readBody(64 * 1024)).toString(); return raw ? JSON.parse(raw) : {}; };
  const m = re => pathname.match(re);
  let mm;

  try {
    // ── Pages + static ───────────────────────────────────────────────────────
    if (pathname === "/laptops" && req.method === "GET") return html(laptopsHtml());
    if ((mm = m(/^\/laptops\/view\/([^/]+)$/)) && req.method === "GET") {
      const l = laptops.get(decodeURIComponent(mm[1]));
      if (!l) { res.writeHead(302, { Location: "/laptops" }); return res.end(); }
      return html(viewerHtml(l));
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
    if (pathname === "/api/laptops" && req.method === "GET")
      return json({ laptops: laptops.list(), openhlIp: tailnetIp() });
    if (pathname === "/api/laptops" && req.method === "POST") {
      const b = await body();
      const out = laptops.add(b);
      STATUS.delete(out.id);
      return json(out, out.repaired ? 200 : 201);
    }
    // Try an address and password before saving them.
    if (pathname === "/api/laptops/test" && req.method === "POST") {
      const b = await body();
      const f = b.pairing ? laptops.parsePairing(b.pairing) : b;
      try { return json(await rfb.probe({ host: String(f.host || ""), port: Number(f.port) || 5900, password: f.password })); }
      catch (e) { return json({ online: false, error: e.message, auth: e.status === 401 }); }
    }
    if ((mm = m(/^\/api\/laptops\/([^/]+)\/status$/)) && req.method === "GET") {
      const l = laptops.get(decodeURIComponent(mm[1]));
      if (!l) return json({ error: "PC not found" }, 404);
      return json(await status(l, parsed.searchParams.get("force") === "1"));
    }
    // The PC's clipboard through its bridge (KDE on Wayland; see domains/laptops/clip.js).
    if ((mm = m(/^\/api\/laptops\/([^/]+)\/clipboard$/))) {
      const l = laptops.get(decodeURIComponent(mm[1]));
      if (!l) return json({ error: "PC not found" }, 404);
      if (req.method === "GET") return json(clip.get(l));
      if (req.method === "POST") {
        const raw = (await readBody(4 * 1024 * 1024)).toString();
        const f = raw ? JSON.parse(raw) : {};
        if (typeof f.text !== "string") return json({ error: "text is required" }, 400);
        return json(await clip.set(l, f.text));
      }
    }
    if ((mm = m(/^\/api\/laptops\/([^/]+)$/))) {
      const id = decodeURIComponent(mm[1]);
      if (req.method === "PATCH") { const out = laptops.update(id, await body()); STATUS.delete(id); return json(out); }
      if (req.method === "DELETE") { STATUS.delete(id); return json(laptops.remove(id)); }
    }
  } catch (e) {
    if (e instanceof SyntaxError) return json({ error: "Invalid JSON body" }, 400);
    if (!e.status || e.status >= 500) console.error("[laptops]", req.method, pathname, "-", e.message);
    return json({ error: e.message }, e.status || 500);
  }
};

module.exports.setupScript = setupScript;

// ── Remote desktop over WebSocket ────────────────────────────────────────────
// Only reachable through an Gridlantis-HL session; Gridlantis-HL then signs in to the laptop
// with the saved password (see domains/laptops/rfb.js).
module.exports.handleUpgrade = function handleUpgrade(req, socket, head) {
  const ws = require("../ws");
  const url = new URL(req.url, "http://localhost");
  const m = url.pathname.match(/^\/api\/laptops\/([^/]+)\/vnc$/);
  if (!m) return false;
  if (!authenticated(req)) { ws.reject(socket, 401, "Unauthorized"); return true; }
  // Cookies ride along on cross-site WebSocket requests, so check where it came from.
  const origin = req.headers.origin;
  if (origin) {
    let ok = false;
    try { ok = new URL(origin).host === req.headers.host; } catch {}
    if (!ok) { ws.reject(socket, 403, "Forbidden"); return true; }
  }
  const l = laptops.get(decodeURIComponent(m[1]));
  if (!l) { ws.reject(socket, 404, "Not Found"); return true; }
  rfb.bridge(l, req, socket, head)
    .then(() => { STATUS.delete(l.id); laptops.touch(l.id); })
    .catch(e => { STATUS.set(l.id, { at: Date.now(), value: { online: false, error: e.message, auth: e.status === 401 } }); });
  return true;
};
