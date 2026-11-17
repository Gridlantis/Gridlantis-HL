const fs = require("fs");
const path = require("path");

const { aiHtml } = require("../pages/ai");
const { filesHtml } = require("../pages/files");
const { financeHtml } = require("../pages/finance");
const { homeHtml } = require("../pages/home");
const { homeosHtml } = require("../pages/homeos");
const { mailHtml } = require("../pages/mail");
const { monitoringHtml } = require("../pages/monitoring");
const { notesHtml } = require("../pages/notes");
const { personalizeHtml } = require("../pages/personalize");
const { remindersHtml } = require("../pages/reminders");
const { textsHtml } = require("../pages/texts");
const { voicemailHtml } = require("../pages/voicemail");
const { welcomeHtml } = require("../pages/welcome");

// Halo, the home page's 3D helper: the model and its textures.
const HALO_DIR = path.join(__dirname, "../ui/home/halo");
const HALO_MIME = { ".fbx": "application/octet-stream", ".jpg": "image/jpeg" };
// Page scripts too big to live inside their page's template string
// (src/ui/pages/<page>.js). Behind the login like the pages that load them,
// and revalidated on every load so an update shows up without a hard refresh.
const PAGE_JS = path.join(__dirname, "../ui/pages");

// The HTML pages.
module.exports = async function pageRoutes(ctx) {
  const { res, pathname, html } = ctx;

  // ── Home page art ───────────────────────────────────────────────────────────
  if (pathname.startsWith('/home/halo/')) {
    let rel; try { rel = decodeURIComponent(pathname.slice('/home/halo/'.length)); } catch { rel = ""; }
    const file = path.resolve(HALO_DIR, rel);
    let st = null;
    if (file.startsWith(HALO_DIR + path.sep) && HALO_MIME[path.extname(file)]) { try { st = fs.statSync(file); } catch {} }
    if (!st || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": HALO_MIME[path.extname(file)], "Content-Length": st.size,
      "Cache-Control": "public, max-age=86400" });
    return fs.createReadStream(file).pipe(res);
  }

  const js = pathname.match(/^\/ui\/pages\/([\w-]+\.js)$/);
  if (js) {
    let st; try { st = fs.statSync(path.join(PAGE_JS, js[1])); } catch { st = null; }
    if (!st || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Content-Length": st.size, "Cache-Control": "no-cache" });
    return fs.createReadStream(path.join(PAGE_JS, js[1])).pipe(res);
  }

  // ── Pages ───────────────────────────────────────────────────────────────────
  if (pathname === '/')          return html(homeHtml());
  if (pathname === '/homeos')    return html(homeosHtml());
  if (pathname === '/monitoring') return html(monitoringHtml());
  if (pathname === '/welcome')   return html(welcomeHtml());
  if (pathname === '/files')     return html(filesHtml());
  if (pathname === '/notes')     return html(notesHtml());
  if (pathname === '/ai')        return html(aiHtml());
  if (pathname === '/mail')      return html(mailHtml());
  if (pathname === '/finance')   return html(financeHtml());
  if (pathname === '/reminders') return html(remindersHtml());
  if (pathname === '/voicemail') return html(voicemailHtml());
  if (pathname === '/texts')     return html(textsHtml());
  if (pathname === '/personalize') return html(personalizeHtml());
};
