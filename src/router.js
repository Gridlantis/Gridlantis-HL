const { authenticated } = require("./session");

// ── Route table ───────────────────────────────────────────────────────────────
// Each module is the same chain of `if (pathname === …) return …` blocks it was
// inside the old 2,400-line handleRequest, in the same order. A module either
// answers the request or falls through to the next one, so adding a route means
// editing one domain file instead of scrolling to the right depth of a wall.
const publicRoutes = require("./routes/public");

const ROUTES = [
  require("./routes/shell"),
  require("./routes/pages"),
  require("./routes/tts"),
  require("./routes/files"),
  require("./routes/notes"),
  require("./routes/ai"),
  require("./routes/settings"),
  require("./routes/mail"),
  require("./routes/reminders"),
  require("./routes/calendar"),
  require("./routes/flows"),
  require("./routes/connectwork"),
  require("./routes/weather"),
  require("./routes/system"),
  require("./routes/finance"),
  require("./routes/quicklinks"),
  require("./routes/todo"),
  require("./routes/monitor"),
  require("./routes/homeos"),
  require("./routes/jobsearch"),
  require("./routes/events"),
  require("./routes/folders"),
  require("./routes/upload"),
  require("./routes/status"),
  require("./routes/cuttlefish"),
  require("./routes/vmlab"),
  require("./routes/docker"),
  require("./routes/laptops"),
  require("./routes/live"),
  require("./routes/mobile"),
  require("./routes/download"),
  require("./routes/voicemail"),
  require("./routes/texts"),
];

async function handleRequest(req, res) {
  const parsed   = new URL(req.url, `http://localhost`);
  const pathname = parsed.pathname;

  // A handler "claims" the request by touching the response. Every reply in
  // Gridlantis-HL starts with writeHead — including the SSE stream, which writes its
  // headers and then deliberately stays open — so wrapping writeHead and end
  // catches all of them without each handler having to report back.
  let handled = false;
  const _writeHead = res.writeHead.bind(res);
  const _end       = res.end.bind(res);
  res.writeHead = (...a) => { handled = true; return _writeHead(...a); };
  res.end       = (...a) => { handled = true; return _end(...a); };

  function redirect(loc) {
    res.writeHead(302, { Location: loc });
    res.end();
  }

  function json(data, status=200) {
    const body = JSON.stringify(data);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  }

  function html(body, status=200) {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(body);
  }

  function readBody(maxBytes = 10 * 1024 * 1024) {   // 10 MB default; pass 0 for unlimited (uploads)
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', c => {
        size += c.length;
        if (maxBytes && size > maxBytes) {
          const err = new Error('Request body too large');
          err.status = 413;
          req.removeAllListeners('data');
          req.pause();
          return reject(err);
        }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  const ctx = { req, res, parsed, pathname, json, html, redirect, readBody };

  await publicRoutes(ctx);
  if (handled) return;

  if (!authenticated(req)) {
    if (pathname.startsWith('/api/')) return json({ error: 'Unauthorized' }, 401);
    return redirect('/login');
  }

  for (const route of ROUTES) {
    await route(ctx);
    if (handled) return;
  }

  // ── 404 ───────────────────────────────────────────────────────────────────────
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

module.exports = { handleRequest };
