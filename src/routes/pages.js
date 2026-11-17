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
const { socialHtml } = require("../pages/social");
const { textsHtml } = require("../pages/texts");
const { voicemailHtml } = require("../pages/voicemail");
const { welcomeHtml } = require("../pages/welcome");

const GHOST_GIF = path.join(__dirname, "../ui/home/ghost.gif");
// Page scripts too big to live inside their page's template string
// (src/ui/pages/<page>.js). Behind the login like the pages that load them,
// and revalidated on every load so an update shows up without a hard refresh.
const PAGE_JS = path.join(__dirname, "../ui/pages");

// The HTML pages.
module.exports = async function pageRoutes(ctx) {
  const { res, pathname, html } = ctx;

  // ── Home page art ───────────────────────────────────────────────────────────
  if (pathname === '/home/ghost.gif') {
    res.writeHead(200, { "Content-Type": "image/gif", "Content-Length": fs.statSync(GHOST_GIF).size,
      "Cache-Control": "public, max-age=86400" });
    return fs.createReadStream(GHOST_GIF).pipe(res);
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
  if (pathname === '/social')    return html(socialHtml());
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
