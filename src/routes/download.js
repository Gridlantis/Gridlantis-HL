const fs = require("fs");
const path = require("path");

const { ROOT } = require("../config");
const { downloadHtml } = require("../pages/download");

// Desktop app installers, built into desktop/dist by `npm run dist`, and the
// Android app, built into android/dist by android/build.sh.
const DISTS = [path.join(ROOT, "desktop", "dist"), path.join(ROOT, "android", "dist")];

function listBuilds() {
  const out = [];
  for (const dir of DISTS) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const name of names) {
      const full = path.join(dir, name);
      let st; try { st = fs.statSync(full); } catch { continue; }
      if (!st.isFile()) continue;
      let os = null, label = null;
      if (/setup.*\.exe$/i.test(name) || /\.msi$/i.test(name)) { os = "windows"; label = "Installer (.exe)"; }
      else if (/\.exe$/i.test(name)) { os = "windows"; label = "Portable (.exe)"; }
      else if (/win.*\.zip$/i.test(name)) { os = "windows"; label = "Portable (.zip)"; }
      else if (/\.AppImage$/i.test(name)) { os = "linux"; label = "AppImage — any distro"; }
      else if (/\.deb$/i.test(name)) { os = "linux"; label = "Debian / Ubuntu (.deb)"; }
      else if (/\.rpm$/i.test(name)) { os = "linux"; label = "Fedora / RHEL (.rpm)"; }
      else if (/linux.*\.tar\.gz$/i.test(name)) { os = "linux"; label = "Archive (.tar.gz)"; }
      else if (/\.dmg$/i.test(name)) { os = "mac"; label = "macOS (.dmg)"; }
      else if (/\.apk$/i.test(name)) { os = "android"; label = "Android app (.apk)"; }
      if (os) out.push({ name, os, label, size: st.size, mtime: st.mtimeMs, full });
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

module.exports = async function downloadRoutes(ctx) {
  const { req, res, pathname, html, json } = ctx;
  if (pathname === "/download" && req.method === "GET") {
    return html(downloadHtml(listBuilds(), (req.headers["x-forwarded-proto"] || "http") + "://" + (req.headers.host || "")));
  }
  if (pathname === "/api/desktop/builds" && req.method === "GET") return json(listBuilds().map(({ full, ...b }) => b));
  if (pathname.startsWith("/download/files/") && req.method === "GET") {
    const name = decodeURIComponent(pathname.slice("/download/files/".length));
    const build = listBuilds().find(b => b.name === name);
    if (!build) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    const type = build.os === "android" ? "application/vnd.android.package-archive" : "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Content-Length": build.size,
      "Content-Disposition": "attachment; filename=\"" + build.name.replace(/"/g, "") + "\"" });
    return fs.createReadStream(build.full).pipe(res);
  }
};
