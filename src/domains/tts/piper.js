const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { AUDIO } = require("../../audio");
const { TTS_DIR } = require("./paths");

// Voices: https://huggingface.co/rhasspy/piper-voices  (.onnx + .onnx.json pairs)
const PIPER_VOICE_DIR = process.env.PIPER_VOICE_DIR
  || path.join(os.homedir(), '.local', 'share', 'piper-voices');

(function () {
  try {
    const { execSync } = require('child_process');
    for (const c of ['piper', 'piper-tts']) {
      try { execSync('command -v ' + c, { stdio: 'ignore' }); AUDIO.piper = c; break; } catch {}
    }
  } catch {}
})();

function piperVoices() {
  try {
    return fs.readdirSync(PIPER_VOICE_DIR)
      .filter(f => f.endsWith('.onnx'))
      .map(f => ({ id: f.replace(/\.onnx$/, ''), label: f.replace(/\.onnx$/, '').replace(/_/g, ' ') }));
  } catch { return []; }
}

function piperModelPath(voiceId) {
  const f = path.join(PIPER_VOICE_DIR, voiceId + '.onnx');
  return fs.existsSync(f) ? f : null;
}

// text -> WAV Buffer
function piperTTS(text, voiceId) {
  return new Promise((resolve, reject) => {
    if (!AUDIO.piper) return reject(new Error('piper not installed'));
    const model = piperModelPath(voiceId);
    if (!model) return reject(new Error('Piper voice not found: ' + voiceId + ' (looked in ' + PIPER_VOICE_DIR + ')'));

    const out = path.join(TTS_DIR, 'p' + crypto.randomBytes(6).toString('hex') + '.wav');
    const { spawn } = require('child_process');
    const p = spawn(AUDIO.piper, ['--model', model, '--output_file', out], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => err += d);
    p.on('error', e => reject(new Error('piper spawn failed: ' + e.message)));
    p.on('close', code => {
      if (code !== 0) { try { fs.unlinkSync(out); } catch {} return reject(new Error('piper exited ' + code + ': ' + err.slice(-200))); }
      try {
        const wav = fs.readFileSync(out);
        fs.unlinkSync(out);
        if (!wav.length) return reject(new Error('piper produced no audio'));
        resolve(wav);
      } catch (e) { reject(e); }
    });
    p.stdin.on('error', () => {});
    p.stdin.end(String(text).slice(0, 800));
  });
}

module.exports = { PIPER_VOICE_DIR, piperModelPath, piperTTS, piperVoices };
