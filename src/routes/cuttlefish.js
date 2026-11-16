const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const cf = require("../domains/vmlab/cuttlefish");
const { cuttlefishHtml, wallHtml } = require("../pages/cuttlefish");

// VM Lab · Cuttlefish: the page, its script, and its API. Always this
// machine — Cuttlefish is not proxied to VM Lab agent hosts.
const UI_ROOT = path.join(__dirname, "../ui/cuttlefish");

function receiveFile(req, limit = 4 * 1024 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const file = path.join(os.tmpdir(), "metis-cf-" + crypto.randomBytes(6).toString("hex") + ".apk");
    const out = fs.createWriteStream(file, { mode: 0o600 });
    let n = 0;
    req.on("data", c => { n += c.length; if (n > limit) { req.destroy(); out.destroy(); fs.unlink(file, () => {}); reject(Object.assign(new Error("file too large"), { status: 413 })); } });
    req.pipe(out);
    out.on("finish", () => resolve(file));
    out.on("error", reject); req.on("error", reject);
  });
}

module.exports = async function cuttlefishRoutes(ctx) {
  const { req, res, pathname, json, html, readBody } = ctx;
  if (!pathname.startsWith("/vmlab/cuttlefish") && !pathname.startsWith("/api/cuttlefish")) return;
  const body = async () => { const raw = (await readBody(64 * 1024)).toString(); return raw ? JSON.parse(raw) : {}; };
  let mm;
  try {
    if (pathname === "/vmlab/cuttlefish" && req.method === "GET") return html(cuttlefishHtml());
    if (pathname === "/vmlab/cuttlefish/all" && req.method === "GET") return html(wallHtml());
    if ((mm = pathname.match(/^\/vmlab\/cuttlefish\/assets\/([\w.-]+\.js)$/)) && req.method === "GET") {
      const file = path.join(UI_ROOT, mm[1]);
      let st; try { st = fs.statSync(file); } catch { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Content-Length": st.size, "Cache-Control": "no-cache" });
      return fs.createReadStream(file).pipe(res);
    }

    if (pathname === "/api/cuttlefish/status" && req.method === "GET") return json(await cf.status());
    if ((mm = pathname.match(/^\/api\/cuttlefish\/(start|stop)$/)) && req.method === "POST") {
      const b = await body();
      return json(cf[mm[1]](b.group ? String(b.group) : null));
    }
    if ((mm = pathname.match(/^\/api\/cuttlefish\/phone\/([^/]+)\/reboot$/)) && req.method === "POST") {
      return json(await cf.reboot(decodeURIComponent(mm[1])));
    }
    if (pathname === "/api/cuttlefish/install" && req.method === "POST") {
      const file = await receiveFile(req);
      try { return json({ results: await cf.installAll(file) }); }
      finally { fs.unlink(file, () => {}); }
    }
    if (pathname.startsWith("/api/cuttlefish")) return json({ error: "not found" }, 404);
  } catch (e) {
    if (e instanceof SyntaxError) return json({ error: "Invalid JSON body" }, 400);
    if (!e.status || e.status >= 500) console.error("[cuttlefish]", req.method, pathname, "-", e.message);
    return json({ error: e.message }, e.status || 500);
  }
};
