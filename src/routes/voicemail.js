const fs = require("fs");
const path = require("path");

const { AUDIO_DIR, STATUS, configured, pollVoicemail, readVoicemail, writeVoicemail } = require("../domains/voicemail");
const { broadcast } = require("../sse");

const SID = /^RE[0-9a-f]{32}$/;

// Voicemail left on the Twilio number: the list, playback, heard and delete.
module.exports = async function voicemailRoutes(ctx) {
  const { req, res, pathname, json } = ctx;
  if (pathname !== '/api/voicemail' && !pathname.startsWith('/api/voicemail/')) return;

  const list = () => json({ configured: configured(), status: STATUS,
    items: readVoicemail().items.slice().sort((a, b) => b.at - a.at) });

  if (pathname === '/api/voicemail' && req.method === 'GET') return list();
  if (pathname === '/api/voicemail/poll' && req.method === 'POST') { await pollVoicemail(); return list(); }

  // /api/voicemail/<sid>[/heard|/audio]
  const [, , , sid, action] = pathname.split('/');
  if (!SID.test(sid || '')) return json({ error: 'No such voicemail' }, 404);

  // The <audio> element seeks with Range requests; answer them so the
  // scrubber works instead of restarting from the beginning.
  if (action === 'audio' && req.method === 'GET') {
    const f = path.join(AUDIO_DIR, sid + '.mp3');
    let size;
    try { size = fs.statSync(f).size; } catch { return json({ error: 'The recording file is missing' }, 404); }
    const head = { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=86400' };
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      const start = m[1] ? +m[1] : Math.max(0, size - +m[2]);
      const end   = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
      if (start > end) { res.writeHead(416, { 'Content-Range': 'bytes */' + size }); return res.end(); }
      res.writeHead(206, { ...head, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}` });
      return fs.createReadStream(f, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...head, 'Content-Length': size });
    return fs.createReadStream(f).pipe(res);
  }

  const d = readVoicemail();
  const v = d.items.find(x => x.sid === sid);
  if (!v) return json({ error: 'That voicemail is gone' }, 404);

  if (action === 'heard' && req.method === 'POST') {
    if (!v.heardAt) { v.heardAt = Date.now(); writeVoicemail(d); broadcast('voicemail_changed', {}); }
    return json({ ok: true });
  }
  if (!action && req.method === 'DELETE') {
    d.items = d.items.filter(x => x.sid !== sid);
    d.gone.push(sid);
    writeVoicemail(d);
    try { fs.unlinkSync(path.join(AUDIO_DIR, sid + '.mp3')); } catch {}
    broadcast('voicemail_changed', {});
    return json({ ok: true });
  }
};
