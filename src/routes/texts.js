const { STATUS, configured, pollTexts, readTexts, writeTexts } = require("../domains/texts");
const { broadcast } = require("../sse");

const SID = /^(SM|MM)[0-9a-f]{32}$/;

// Texts sent to the Twilio number: the list, mark read, and delete.
module.exports = async function textsRoutes(ctx) {
  const { req, pathname, json } = ctx;
  if (pathname !== '/api/texts' && !pathname.startsWith('/api/texts/')) return;

  const list = () => json({ configured: configured(), status: STATUS,
    items: readTexts().items.slice().sort((a, b) => b.at - a.at) });

  if (pathname === '/api/texts' && req.method === 'GET') return list();
  if (pathname === '/api/texts/poll' && req.method === 'POST') { await pollTexts(); return list(); }

  // Opening the page reads everything on it, as in a phone's messages app.
  if (pathname === '/api/texts/read' && req.method === 'POST') {
    const d = readTexts();
    const now = Date.now();
    let n = 0;
    for (const t of d.items) if (!t.readAt) { t.readAt = now; n++; }
    if (n) { writeTexts(d); broadcast('texts_changed', {}); }
    return json({ ok: true, marked: n });
  }

  const sid = pathname.split('/')[3];
  if (!SID.test(sid || '')) return json({ error: 'No such text' }, 404);
  if (req.method === 'DELETE') {
    const d = readTexts();
    if (!d.items.some(t => t.sid === sid)) return json({ error: 'That text is gone' }, 404);
    d.items = d.items.filter(t => t.sid !== sid);
    d.gone.push(sid);
    writeTexts(d);
    broadcast('texts_changed', {});
    return json({ ok: true });
  }
};
