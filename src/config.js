const http     = require("http");
const https    = require("https");
const fs       = require("fs");
const path     = require("path");
const os       = require("os");

const dgram    = require("dgram");
const crypto   = require("crypto");
const tls      = require("tls");
const { pipeline } = require("stream");

// Project root. Every data file and upload path is resolved from here rather
// than from the module's own directory, so code can move between directories
// without changing where Open HL reads and writes its state.
const ROOT = path.resolve(__dirname, "..");

// Which program this is. The VM Lab agent (vmlab-agent.js) reuses the same
// domain modules on a second device, but it serves no pages and has no login —
// it is authenticated by its own bearer token — so it needs neither a .env nor
// a PASSWORD. Everything else must still refuse to start without them.
const ROLE = process.env.OPENHL_ROLE || "server";
const NEEDS_PASSWORD = ROLE !== "vmlab-agent";

// ─── LOAD .env ────────────────────────────────────────────────────────────────
function loadEnv() {
  const p = path.join(ROOT, ".env");
  if (!fs.existsSync(p)) {
    if (!NEEDS_PASSWORD) return;
    console.error("\n✗ No .env file found. Copy .env.example to .env\n");
    process.exit(1);
  }
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const PORT            = parseInt(process.env.PORT || "3000", 10);
const PASSWORD        = process.env.PASSWORD;
const UPLOAD_DIR      = path.join(ROOT, process.env.UPLOAD_DIR || "uploads");
const UPTIMEROBOT_KEY       = process.env.UPTIMEROBOT_KEY || "";
const JOB_SEARCH_PORT       = parseInt(process.env.JOB_SEARCH_PORT || "1025", 10);
const DISCORD_BOTS_DIR      = process.env.DISCORD_BOTS_DIR || path.join(os.homedir(), "Servers", "bots");  // one folder per bot; set to "" to stop watching
// Bot agents on other machines (src/domains/discord-bots.js run there), as
// comma-separated "label=http://host:port" entries; the label is optional.
const DISCORD_BOT_AGENTS    = (process.env.DISCORD_BOT_AGENTS || "").split(",").map(s => s.trim()).filter(Boolean)
  .map(s => { const eq = s.indexOf("="); return eq > 0 ? { label: s.slice(0, eq).trim(), url: s.slice(eq + 1).trim() } : { label: new URL(s).hostname, url: s }; });
const OPENROUTER_API_KEY    = process.env.OPENROUTER_API_KEY || "";
// ── HomeOS vendor credentials (all optional; only needed per-vendor) ──────────
// Kasa, Sonoff (Tasmota/DIY) and Gosund/Tuya-local need NO credentials at all —
// they are spoken directly on the LAN. Only the cloud-only vendors need these.
const WYZE_EMAIL            = process.env.WYZE_EMAIL || "";
const WYZE_PASSWORD         = process.env.WYZE_PASSWORD || "";
const WYZE_API_KEY          = process.env.WYZE_API_KEY || "";       // developer-api-console.wyze.com
const WYZE_KEY_ID           = process.env.WYZE_KEY_ID || "";
const WYZE_PHONE_ID         = process.env.WYZE_PHONE_ID || "openhl-" + Math.random().toString(16).slice(2, 10);
const BLINK_EMAIL           = process.env.BLINK_EMAIL || "";
const BLINK_PASSWORD        = process.env.BLINK_PASSWORD || "";
const BLINK_UUID            = process.env.BLINK_UUID || "";         // keep stable to avoid re-2FA every restart
const RING_REFRESH_TOKEN    = process.env.RING_REFRESH_TOKEN || ""; // from ring-client-api CLI
const RING_HARDWARE_ID      = process.env.RING_HARDWARE_ID || "openhl-ring-client";
const TUYA_CLIENT_ID        = process.env.TUYA_CLIENT_ID || "";     // iot.tuya.com, only for cloud fallback
const TUYA_CLIENT_SECRET    = process.env.TUYA_CLIENT_SECRET || "";
const TUYA_REGION           = process.env.TUYA_REGION || "us";

if (!PASSWORD && NEEDS_PASSWORD) { console.error("\n✗ PASSWORD not set in .env\n"); process.exit(1); }
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ─── DATA FILES ───────────────────────────────────────────────────────────────
// Every JSON store lives under data/, grouped into one folder per feature.
// data/ holds secrets (settings, mail accounts, tokens), so it is owner-only.
const DATA_DIR = path.join(ROOT, "data");
const DATA_LAYOUT = {
  "notes.json": "notes",          "note_folders.json": "notes",
  "mail_accounts.json": "mail",   "mail_cache.json": "mail",        "mail_state.json": "mail",
  "finance.json": "finance",      "portfolio_history.json": "finance",
  "file_groups.json": "files",    "file_group_map.json": "files",
  "links.json": "links",          "quicklinks.json": "links",       "todo.json": "todo",
  "reminders.json": "reminders",  "gcal.json": "calendar",
  "homeos.json": "homeos",        "nodes.json": "monitor",          "laptops.json": "laptops",
  "flows.json": "flows",          "webforms.json": "webforms",      "ai_peers.json": "ai",
  "connectwork.json": "connectwork",
  "settings.json": "",
};
const dataFile = name => path.join(DATA_DIR, DATA_LAYOUT[name], name);

// Installs from before the data/ layout kept these files in the project root.
// Move them (and their .bak) across once; rename keeps their 0600 modes.
function migrateDataFiles() {
  for (const dir of new Set(Object.values(DATA_LAYOUT)))
    fs.mkdirSync(path.join(DATA_DIR, dir), { recursive: true, mode: 0o700 });
  for (const name of Object.keys(DATA_LAYOUT)) {
    for (const f of [name, name + ".bak"]) {
      const from = path.join(ROOT, f), to = path.join(path.dirname(dataFile(name)), f);
      if (!fs.existsSync(from) || fs.existsSync(to)) continue;
      fs.renameSync(from, to);
      console.log("  moved " + f + " -> " + path.relative(ROOT, to));
    }
  }
}
// The VM Lab agent keeps no app state; leave its data directory alone.
if (ROLE !== "vmlab-agent") migrateDataFiles();

const NOTES_FILE      = dataFile("notes.json");
const FOLDERS_FILE    = dataFile("note_folders.json");
const LINKS_FILE      = dataFile("links.json");
const FINANCE_FILE    = dataFile("finance.json");
const WEBFORMS_FILE   = dataFile("webforms.json");
const FILE_GROUPS_FILE= dataFile("file_groups.json");
const AI_PEERS_FILE   = dataFile("ai_peers.json");
const SETTINGS_FILE   = dataFile("settings.json");
const REMINDERS_FILE  = dataFile("reminders.json");
if (!fs.existsSync(REMINDERS_FILE)) fs.writeFileSync(REMINDERS_FILE, JSON.stringify([], null, 2));

module.exports = { AI_PEERS_FILE, DATA_DIR, BLINK_EMAIL, DISCORD_BOTS_DIR, DISCORD_BOT_AGENTS, BLINK_PASSWORD, BLINK_UUID, FILE_GROUPS_FILE, FINANCE_FILE, FOLDERS_FILE, JOB_SEARCH_PORT, LINKS_FILE, NOTES_FILE, OPENROUTER_API_KEY, PASSWORD, PORT, REMINDERS_FILE, RING_HARDWARE_ID, RING_REFRESH_TOKEN, ROLE, ROOT, SETTINGS_FILE, TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, TUYA_REGION, UPLOAD_DIR, UPTIMEROBOT_KEY, WEBFORMS_FILE, WYZE_API_KEY, WYZE_EMAIL, WYZE_KEY_ID, WYZE_PASSWORD, WYZE_PHONE_ID, dataFile, loadEnv, pipeline };
