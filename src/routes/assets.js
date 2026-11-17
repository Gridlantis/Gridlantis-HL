const fs = require("fs");
const path = require("path");

// Static files every page needs before it can draw: the fonts, the Font Awesome
// icons and the shared event-stream worker. Served by Open HL itself so no page
// waits on fonts.googleapis.com or cdnjs, and public because the login page
// uses the fonts too (none of these hold anything private).
const UI = path.join(__dirname, "../ui");
const ROOTS = {
  "/ui/vendor/fonts/": path.join(UI, "vendor/fonts"),
  "/ui/vendor/fontawesome/": path.join(UI, "vendor/fontawesome"),
  // three.js and the addons Halo needs (the home page's 3D helper). The version
  // is in the folder name, so a new copy gets a new URL and the year-long cache holds.
  "/ui/vendor/three-0.170.0/": path.join(UI, "vendor/three-0.170.0"),
};
const MIME = { ".css": "text/css; charset=utf-8", ".woff2": "font/woff2", ".js": "text/javascript; charset=utf-8" };

// Font files never change under the same name, and the stylesheets are linked
// with a ?v= that changes when they do (see FONT in ui/assets.js), so the
// browser may keep all of them for a year without asking again.
const IMMUTABLE = "public, max-age=31536000, immutable";

function sendFile(res, file, cache) {
  let st;
  try { st = fs.statSync(file); } catch { st = null; }
  if (!st || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
    "Content-Length": st.size, "Cache-Control": cache });
  fs.createReadStream(file).pipe(res);
}

module.exports = async function assetRoutes(ctx) {
  const { req, res, pathname } = ctx;
  if (req.method !== "GET" && req.method !== "HEAD") return;

  if (pathname === "/ui/events-worker.js") return sendFile(res, path.join(UI, "events-worker.js"), "no-cache");

  for (const [prefix, root] of Object.entries(ROOTS)) {
    if (!pathname.startsWith(prefix)) continue;
    let rel;
    try { rel = decodeURIComponent(pathname.slice(prefix.length)); } catch { rel = ""; }
    const file = path.resolve(root, rel);
    if (!file.startsWith(root + path.sep)) { res.writeHead(400, { "Content-Type": "text/plain" }); return res.end("Bad path"); }
    return sendFile(res, file, IMMUTABLE);
  }
};
