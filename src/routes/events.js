const { sseClients, sseFrame } = require("../sse");

// Server-sent events: the live update stream every page subscribes to.
// ?wrap=1 selects the wrapped framing (see sseFrame in sse.js).
module.exports = async function eventRoutes(ctx) {
  const { req, res, parsed, pathname } = ctx;

  // ── SSE live updates ─────────────────────────────────────────────────────────
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.openhlWrapped = parsed.searchParams.has('wrap');
    res.write(sseFrame('connected', '{}', res.openhlWrapped));
    const hb = setInterval(() => { try { res.write(':ping\n\n'); } catch(_) { clearInterval(hb); sseClients.delete(res); } }, 20000);
    sseClients.add(res);
    req.on('close', () => { clearInterval(hb); sseClients.delete(res); });
    return;
  }
};
