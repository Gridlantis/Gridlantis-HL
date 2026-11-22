const fs = require("fs");
const path = require("path");

const { PORT } = require("../config");
const { tailnetIp } = require("../net");
const live = require("../domains/live");
const st = require("../domains/live/syncthing");
const { liveHtml } = require("../pages/live");

// Live folders: OneDrive-style folders kept in sync across PCs through Gridlantis-HL
// (see domains/live). The setup scripts and the Syncthing builds they fetch
// are public (routes/public.js calls publicLive), since a PC asks for them
// before it has an Gridlantis-HL session; they carry no secrets, only Gridlantis-HL's device
// ID and address. So is POST /live/report, which only takes a report from the
// PC's own tailnet address.
const SCRIPTS = {
  "/live/setup.sh":  { file: path.join(__dirname, "../../tools/live/setup-live.sh"),  type: "text/x-shellscript; charset=utf-8" },
  "/live/setup.ps1": { file: path.join(__dirname, "../../tools/live/setup-live.ps1"), type: "text/plain; charset=utf-8" },
};

const STATIC_ROOTS = {
  "/live/assets/": path.join(__dirname, "../ui/live"),
  "/live/shared/": path.join(__dirname, "../ui/shared"),
};

async function script(name, host) {
  await st.ensure();
  const ip = tailnetIp() || "";
  const url = "http://" + (ip ? ip + ":" + PORT : host);
  return fs.readFileSync(SCRIPTS[name].file, "utf8")
    .replace(/__OPENHL_URL__/g, url).replace(/__OPENHL_ID__/g, await st.myId())
    .replace(/__OPENHL_IP__/g, ip).replace(/__SYNC_PORT__/g, String(st.SYNC_PORT));
}

async function publicLive(ctx) {
  const { req, res, pathname, json, readBody } = ctx;
  // A PC's reporter: its own view of its folders (see live.report).
  if (pathname === "/live/report" && req.method === "POST") {
    try { return json(await live.report(req.socket.remoteAddress, JSON.parse((await readBody(512 * 1024)).toString() || "{}"))); }
    catch (e) { return json({ error: e instanceof SyntaxError ? "bad report" : e.message }, e.status || 400); }
  }
  if (req.method !== "GET") return;
  if (SCRIPTS[pathname]) {
    let body;
    try { body = await script(pathname, req.headers.host || ""); }
    catch (e) { res.writeHead(503, { "Content-Type": "text/plain" }); return res.end("echo 'Gridlantis-HL live folders are not running: " + e.message.replace(/'/g, "") + "' >&2; exit 1\n"); }
    res.writeHead(200, { "Content-Type": SCRIPTS[pathname].type, "Cache-Control": "no-cache" });
    return res.end(body);
  }
  const m = pathname.match(/^\/live\/dl\/(linux-amd64|linux-arm64|windows-amd64)$/);
  if (m) {
    let file;
    try { file = await st.asset(m[1]); }
    catch (e) { res.writeHead(502, { "Content-Type": "text/plain" }); return res.end(e.message); }
    const size = fs.statSync(file).size;
    res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": size,
      "Content-Disposition": "attachment; filename=\"" + path.basename(file) + "\"" });
    return fs.createReadStream(file).pipe(res);
  }
}

module.exports = async function liveRoutes(ctx) {
  const { req, res, pathname, json, html, readBody } = ctx;
  if (pathname !== "/live" && !pathname.startsWith("/api/live") && !pathname.startsWith("/live/")) return;
  const body = async () => { const raw = (await readBody(64 * 1024)).toString(); return raw ? JSON.parse(raw) : {}; };
  let mm;
  const m = re => pathname.match(re);
  try {
    if (pathname === "/live" && req.method === "GET") return html(liveHtml());
    for (const [prefix, root] of Object.entries(STATIC_ROOTS)) {
      if (pathname.startsWith(prefix) && req.method === "GET") {
        const file = path.resolve(root, decodeURIComponent(pathname.slice(prefix.length)));
        if (!file.startsWith(root + path.sep)) return json({ error: "bad path" }, 400);
        let s; try { s = fs.statSync(file); } catch { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
        if (!s.isFile()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Content-Length": s.size, "Cache-Control": "no-cache" });
        return fs.createReadStream(file).pipe(res);
      }
    }
    if (pathname === "/api/live" && req.method === "GET") {
      const o = await live.overview();
      return json({ ...o, openhlIp: tailnetIp() || null });
    }
    if (pathname === "/api/live/folders" && req.method === "POST") {
      const b = await body();
      return json(await live.createFolder(b.label, b.devices));
    }
    if ((mm = m(/^\/api\/live\/folders\/([^/]+)$/))) {
      const id = decodeURIComponent(mm[1]);
      if (req.method === "PATCH") return json(await live.updateFolder(id, await body()));
      if (req.method === "DELETE") return json(await live.removeFolder(id));
    }
    if ((mm = m(/^\/api\/live\/folders\/([^/]+)\/versions$/))) {
      const id = decodeURIComponent(mm[1]);
      if (req.method === "GET") return json(await live.versions(id));
      if (req.method === "POST") { const b = await body(); return json(await live.restore(id, String(b.path || ""), String(b.versionTime || ""))); }
    }
    if (pathname === "/api/live/devices" && req.method === "POST") {
      const b = await body();
      return json(await live.addDevice(b.code, b.name));
    }
    if ((mm = m(/^\/api\/live\/devices\/([^/]+)$/))) {
      const id = decodeURIComponent(mm[1]);
      if (req.method === "PATCH") return json(await live.renameDevice(id, (await body()).name));
      if (req.method === "DELETE") return json(await live.removeDevice(id));
    }
  } catch (e) {
    if (e instanceof SyntaxError) return json({ error: "Invalid JSON body" }, 400);
    if (!e.status || e.status >= 500) console.error("[live]", req.method, pathname, "-", e.message);
    return json({ error: e.message }, e.status || 500);
  }
};

module.exports.publicLive = publicLive;
