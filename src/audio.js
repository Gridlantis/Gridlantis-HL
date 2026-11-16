// ── Audio capability detection ────────────────────────────────────────────────
// Which local audio tools exist. One shared object rather than four separate
// bindings: the alert dispatcher, the TTS engines and the router all read these,
// and two are written after startup — a rebound export would hand every reader
// a stale null.
const AUDIO = { speaker: null, piper: null, mp3: null, wav: null };
(function(){ try { const { execSync } = require("child_process"); for (const c of ["spd-say", "espeak", "say"]) { try { execSync("command -v " + c, { stdio: "ignore" }); AUDIO.speaker = c; break; } catch {} } } catch {} })();

module.exports = { AUDIO };
