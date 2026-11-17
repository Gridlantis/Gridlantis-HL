const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { AUDIO } = require("../../audio");
const { edgeTTS } = require("./edge");
const { TTS_DIR } = require("./paths");
const { piperTTS } = require("./piper");
const { SETTINGS } = require("../../settings");

function ttsSettings() {
  const t = SETTINGS.tts || {};
  // Default to whatever actually works on this box, in order of quality.
  // Edge is demoted: Microsoft began 403ing third-party clients in 2026.
  const auto = AUDIO.piper ? "piper" : (AUDIO.speaker ? "local" : "edge");
  return {
    engine:      t.engine || auto,                    // piper | edge | local | off
    voice:       t.voice  || process.env.TTS_VOICE || "en-GB-SoniaNeural",
    piperVoice:  t.piperVoice || process.env.PIPER_VOICE || "en_GB-jenny_dioco-medium",
    rate:        t.rate   || "+0%",
    pitch:       t.pitch  || "+0Hz",
  };
}

// Returns { buf, type }. Piper emits WAV, Edge emits MP3 — the caller must not
// assume. Cached on disk: alerts repeat constantly and synthesis is not free.
async function ttsSynth(text, cfg) {
  const engine = cfg.engine === "edge" ? "edge" : "piper";
  const voice  = engine === "edge" ? cfg.voice : cfg.piperVoice;
  const ext    = engine === "edge" ? "mp3" : "wav";
  const type   = engine === "edge" ? "audio/mpeg" : "audio/wav";

  const key = crypto.createHash("sha1")
    .update([engine, text, voice, cfg.rate, cfg.pitch].join("|")).digest("hex");
  const file = path.join(TTS_DIR, key + "." + ext);
  try {
    const st = fs.statSync(file);
    if (st.size > 0) return { buf: fs.readFileSync(file), type };
  } catch {}

  const buf = engine === "edge"
    ? await edgeTTS(text, cfg)
    : await piperTTS(text, voice);
  try { fs.writeFileSync(file, buf); } catch {}
  return { buf, type };
}

// ── Server-side playback: mp3 needs a real player; espeak stays as the fallback ─
(function () {
  try {
    const { execSync } = require("child_process");
    const has = c => { try { execSync("command -v " + c, { stdio: "ignore" }); return true; } catch { return false; } };
    for (const c of ["mpg123", "ffplay", "mpv", "cvlc"]) if (has(c)) { AUDIO.mp3 = c; break; }
    // Piper emits WAV — aplay/paplay are near-universal and need no decoder.
    for (const c of ["aplay", "paplay", "ffplay", "mpv"]) if (has(c)) { AUDIO.wav = c; break; }
  } catch {}
})();

// Fallback chain: whatever the settings say, then down the ladder, then espeak.
// Never go silent just because one engine is unavailable.
function playAudio(buf, isWav) {
  const { spawn } = require("child_process");
  // WAV can go straight to aplay/paplay; mp3 needs a decoder.
  const cmd = isWav ? (AUDIO.wav || AUDIO.mp3) : AUDIO.mp3;
  if (!cmd) throw new Error("no audio player installed");
  let args;
  if (cmd === "aplay")       args = ["-q", "-"];
  else if (cmd === "paplay") args = ["-"];
  else if (cmd === "mpg123") args = ["-q", "-"];
  else if (cmd === "ffplay") args = ["-nodisp", "-autoexit", "-loglevel", "quiet", "-"];
  else if (cmd === "mpv")    args = ["--really-quiet", "--no-video", "-"];
  else if (cmd === "cvlc")   args = ["--play-and-exit", "--intf", "dummy", "-"];
  else args = ["-"];
  const p = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
  p.on("error", () => {});
  p.stdin.on("error", () => {});
  p.stdin.end(buf);
}

async function speakServer(text) {
  const cfg = ttsSettings();
  if (cfg.engine === "off") return;
  const say = String(text).slice(0, 500);

  const chain = cfg.engine === "local" ? [] : [cfg.engine, cfg.engine === "piper" ? "edge" : "piper"];
  for (const engine of chain) {
    if (engine === "piper" && !AUDIO.piper) continue;
    try {
      const { buf, type } = await ttsSynth(say, { ...cfg, engine });
      playAudio(buf, type === "audio/wav");
      return;
    } catch (e) {
      console.warn("[tts] " + engine + " failed: " + e.message);
    }
  }

  // Last resort: the original shell TTS.
  try {
    const { spawn } = require("child_process");
    const safe = say.replace(/[^\w .,!?'-]/g, " ").slice(0, 200);
    if (AUDIO.speaker) {
      const p = spawn(AUDIO.speaker, [safe], { stdio: "ignore", detached: true });
      p.on("error", () => {});
      p.unref();
    }
  } catch {}
}

// A small curated set; the full Edge catalogue is ~500 voices.
const TTS_VOICES = [
  { id: "en-GB-SoniaNeural",   label: "Sonia — British, female" },
  { id: "en-GB-RyanNeural",    label: "Ryan — British, male" },
  { id: "en-GB-LibbyNeural",   label: "Libby — British, female" },
  { id: "en-GB-ThomasNeural",  label: "Thomas — British, male" },
  { id: "en-US-AriaNeural",    label: "Aria — American, female" },
  { id: "en-US-GuyNeural",     label: "Guy — American, male" },
  { id: "en-US-JennyNeural",   label: "Jenny — American, female" },
  { id: "en-AU-NatashaNeural", label: "Natasha — Australian, female" },
  { id: "en-IE-EmilyNeural",   label: "Emily — Irish, female" },
];
// ═══ TTS:END ═══

module.exports = { TTS_VOICES, playAudio, speakServer, ttsSettings, ttsSynth };
