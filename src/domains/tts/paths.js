const fs = require("fs");
const os = require("os");
const path = require("path");

// ── Cache: alerts repeat, and every synth is a round trip to Microsoft ────────
const TTS_DIR = path.join(os.tmpdir(), "openhl-tts");
try { fs.mkdirSync(TTS_DIR, { recursive: true }); } catch {}

module.exports = { TTS_DIR };
