const { AUDIO } = require("../audio");
const { TTS_VOICES, speakServer, ttsSettings, ttsSynth } = require("../domains/tts/index");
const { PIPER_VOICE_DIR, piperVoices } = require("../domains/tts/piper");
const { SETTINGS, saveSettings } = require("../settings");

// Text to speech: synthesis, engine config, server-side playback.
module.exports = async function ttsRoutes(ctx) {
  const { req, res, parsed, pathname, json, readBody } = ctx;

// ═══ TTS:BEGIN ═══
  // ── TTS ──────────────────────────────────────────────────────────────────────
  if (pathname === '/api/tts' && req.method === 'GET') {
    const text = (parsed.searchParams.get('text') || '').slice(0, 500);
    if (!text.trim()) { res.writeHead(400); return res.end(); }
    const cfg = ttsSettings();
    const voice = parsed.searchParams.get('voice') || cfg.voice;
    if (!/^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/.test(voice)) { res.writeHead(400); return res.end(); }
    try {
      const { buf, type } = await ttsSynth(text, { ...cfg, voice });
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': buf.length,
        'Cache-Control': 'public, max-age=3600'
      });
      return res.end(buf);
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  if (pathname === '/api/tts/config' && req.method === 'GET') {
    const pv = piperVoices();
    return json({
      ...ttsSettings(),
      engines: {
        piper: { available: !!AUDIO.piper, cmd: AUDIO.piper, voiceDir: PIPER_VOICE_DIR, voices: pv,
                 ready: !!AUDIO.piper && pv.length > 0 },
        edge:  { available: true, note: 'Microsoft began 403ing third-party clients in 2026 — may not work' },
        local: { available: !!AUDIO.speaker, cmd: AUDIO.speaker }
      },
      edgeVoices: TTS_VOICES,
      players: { mp3: AUDIO.mp3, wav: AUDIO.wav },
      serverPlaybackReady: !!(AUDIO.wav || AUDIO.mp3 || AUDIO.speaker)
    });
  }

  if (pathname === '/api/tts/config' && req.method === 'POST') {
    const b = JSON.parse((await readBody()).toString());
    const t = SETTINGS.tts || {};
    if (typeof b.engine === 'string' && ['piper','edge','local','off'].includes(b.engine)) t.engine = b.engine;
    if (typeof b.voice === 'string' && /^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/.test(b.voice)) t.voice = b.voice;
    // Piper voice ids are filenames — never let one escape the voice dir.
    if (typeof b.piperVoice === 'string' && /^[A-Za-z0-9_.-]+$/.test(b.piperVoice)
        && !b.piperVoice.includes('..')) t.piperVoice = b.piperVoice;
    if (typeof b.rate === 'string')  t.rate = b.rate;
    if (typeof b.pitch === 'string') t.pitch = b.pitch;
    SETTINGS.tts = t;
    saveSettings();
    return json({ ok: true, ...ttsSettings() });
  }

  if (pathname === '/api/tts/test' && req.method === 'POST') {
    const b = JSON.parse((await readBody()).toString() || '{}');
    try {
      await speakServer(b.text || 'Open HL speech test. All systems nominal.');
      return json({ ok: true, played: AUDIO.mp3 || AUDIO.speaker || 'none' });
    } catch (e) { return json({ ok: false, error: e.message }, 502); }
  }
// ═══ TTS:END ═══
};
