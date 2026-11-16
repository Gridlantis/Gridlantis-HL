const fs = require("fs");
const path = require("path");

const { OPENROUTER_API_KEY, SETTINGS_FILE } = require("./config");

// Files holding secrets must be 0600. writeFileSync's `mode` only applies when
// the file is CREATED — on overwrite it is silently ignored — so a file first
// written without a mode stays 0644 forever. chmod explicitly every time.
function writeSecretFile(file, contents) {
  // Atomic, same as writeJSONFile, but 0600 throughout — the temp file must
  // never exist world-readable even briefly, since these hold tokens.
  const tmp = file + ".tmp";
  try {
    if (fs.existsSync(file)) { try { fs.copyFileSync(file, file + ".bak"); fs.chmodSync(file + ".bak", 0o600); } catch {} }
    fs.writeFileSync(tmp, contents, { mode: 0o600 });
    try { fs.chmodSync(tmp, 0o600); } catch {}
    fs.renameSync(tmp, file);
    try { fs.chmodSync(file, 0o600); } catch {}
  } catch (e) {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
    console.error("! failed writing " + path.basename(file) + ": " + e.message);
    throw e;
  }
}

// Mutable runtime settings (UI-editable). Keys here override the .env defaults.
let SETTINGS = (function(){ try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")); } catch { return {}; } })();
function saveSettings(){ try { writeSecretFile(SETTINGS_FILE, JSON.stringify(SETTINGS, null, 2)); } catch(e){ console.error("settings save:", e.message); } }
function getOpenRouterKey(){ return ((SETTINGS.openRouterKey || OPENROUTER_API_KEY) || "").trim(); }
function maskKey(k){ return k ? (k.slice(0,6) + "…" + k.slice(-4) + " (" + k.length + " chars)") : "(not set)"; }

module.exports = { SETTINGS, getOpenRouterKey, maskKey, saveSettings, writeSecretFile };
