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

// Cloud AI providers whose keys can be saved on the AI page. OpenRouter keeps
// its own setting (and OPENROUTER_API_KEY in .env) from before the others;
// the rest live in SETTINGS.aiKeys. Each may also come from its .env variable.
// `kind` says how to talk to it: most speak the OpenAI chat API at `base`.
const AI_PROVIDERS = [
  { id: "openrouter", name: "OpenRouter",    kind: "openai",    base: "https://openrouter.ai/api/v1",                              env: "OPENROUTER_API_KEY", hint: "sk-or-…" },
  { id: "openai",     name: "OpenAI",        kind: "openai",    base: "https://api.openai.com/v1",                                 env: "OPENAI_API_KEY",     hint: "sk-…" },
  { id: "anthropic",  name: "Anthropic",     kind: "anthropic", base: "https://api.anthropic.com/v1",                              env: "ANTHROPIC_API_KEY",  hint: "sk-ant-…" },
  { id: "google",     name: "Google Gemini", kind: "openai",    base: "https://generativelanguage.googleapis.com/v1beta/openai",   env: "GEMINI_API_KEY",     hint: "AIza…" },
  { id: "groq",       name: "Groq",          kind: "openai",    base: "https://api.groq.com/openai/v1",                            env: "GROQ_API_KEY",       hint: "gsk_…" },
  { id: "mistral",    name: "Mistral",       kind: "openai",    base: "https://api.mistral.ai/v1",                                 env: "MISTRAL_API_KEY",    hint: "API key" },
  { id: "deepseek",   name: "DeepSeek",      kind: "openai",    base: "https://api.deepseek.com/v1",                               env: "DEEPSEEK_API_KEY",   hint: "sk-…" },
  { id: "xai",        name: "xAI",           kind: "openai",    base: "https://api.x.ai/v1",                                       env: "XAI_API_KEY",        hint: "xai-…" },
];
const aiProvider = id => AI_PROVIDERS.find(p => p.id === id) || null;
function savedAiKey(id) {
  if (id === "openrouter") return (SETTINGS.openRouterKey || "").trim();
  const keys = SETTINGS.aiKeys && typeof SETTINGS.aiKeys === "object" ? SETTINGS.aiKeys : {};
  return typeof keys[id] === "string" ? keys[id].trim() : "";
}
function getAiKey(id) {
  if (id === "openrouter") return getOpenRouterKey();
  const p = aiProvider(id);
  return p ? (savedAiKey(id) || (process.env[p.env] || "").trim()) : "";
}
// Empty clears the saved key, falling back to .env if it has one.
function setAiKey(id, key) {
  const k = String(key == null ? "" : key).trim();
  if (id === "openrouter") { if (k) SETTINGS.openRouterKey = k; else delete SETTINGS.openRouterKey; }
  else {
    const keys = Object.assign({}, SETTINGS.aiKeys && typeof SETTINGS.aiKeys === "object" ? SETTINGS.aiKeys : {});
    if (k) keys[id] = k; else delete keys[id];
    if (Object.keys(keys).length) SETTINGS.aiKeys = keys; else delete SETTINGS.aiKeys;
  }
  saveSettings();
}
function maskKey(k){ return k ? (k.slice(0,6) + "…" + k.slice(-4) + " (" + k.length + " chars)") : "(not set)"; }

module.exports = { AI_PROVIDERS, SETTINGS, aiProvider, getAiKey, getOpenRouterKey, maskKey, savedAiKey, saveSettings, setAiKey, writeSecretFile };
