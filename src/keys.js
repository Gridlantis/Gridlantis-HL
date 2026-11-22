// Settings → Keys: the API keys and other .env settings each feature needs,
// edited from the dashboard instead of by hand.
//
// Values are written to Gridlantis-HL's own .env (ENV_FILE), keeping every other
// line as it is. Most features read their keys once at start, so a change
// applies after a restart; restart() does that when something supervises
// this process (Gridlantis-HL Server, the desktop app), which starts it again
// when it exits with RESTART_CODE.
const fs = require("fs");
const { ENV_FILE, SHELL_ENV_KEYS } = require("./config");

const RESTART_CODE = 75;
const SUPERVISOR = process.env.OPENHL_SUPERVISOR || "";

// fields: [env name, label, hint, kind]. kind "secret" is never sent back
// whole; "text" is shown as saved.
const FEATURES = [
  { id: "calendar", name: "Google Calendar sync", icon: "fa-calendar-days", href: "/calendar",
    about: "Two-way sync with Google Calendar. After saving and restarting, press Connect on the Calendar page.",
    get: "Google Cloud console: an OAuth client of type \"Web application\" with the Calendar API turned on.",
    fields: [["GOOGLE_CLIENT_ID", "Client ID", "Ends in .apps.googleusercontent.com", "text"],
             ["GOOGLE_CLIENT_SECRET", "Client secret", "", "secret"],
             ["GOOGLE_REDIRECT_URI", "Redirect URI", "Optional. Leave empty to use http://localhost:<port>/api/calendar/callback", "text"]] },
  { id: "twilio", name: "Voicemail and Texts", icon: "fa-voicemail", href: "/voicemail",
    about: "Voicemail recordings and incoming texts from a Twilio number.",
    get: "console.twilio.com: Account Info.",
    fields: [["TWILIO_ACCOUNT_SID", "Account SID", "Starts with AC", "text"],
             ["TWILIO_AUTH_TOKEN", "Auth token", "", "secret"],
             ["TWILIO_NUMBER", "Phone number", "Optional. Only keep messages for this number, like +18335550100", "text"]] },
  { id: "uptimerobot", name: "Monitoring: UptimeRobot", icon: "fa-heart-pulse", href: "/monitoring",
    about: "Optional. Shows your UptimeRobot monitors next to your own machines.",
    get: "uptimerobot.com: Integrations and API, a read-only API key.",
    fields: [["UPTIMEROBOT_KEY", "Read-only API key", "", "secret"]] },
  { id: "wyze", name: "HomeOS: Wyze", icon: "fa-house-signal", href: "/homeos",
    about: "Wyze plugs, bulbs and cameras. Kasa, Sonoff and local Tuya devices need nothing.",
    get: "Your Wyze login, plus an API key and its ID from developer-api-console.wyze.com.",
    fields: [["WYZE_EMAIL", "Email", "", "text"], ["WYZE_PASSWORD", "Password", "", "secret"],
             ["WYZE_API_KEY", "API key", "", "secret"], ["WYZE_KEY_ID", "Key ID", "", "text"]] },
  { id: "blink", name: "HomeOS: Blink", icon: "fa-video", href: "/homeos",
    about: "Blink cameras.",
    get: "Your Blink login. Set a device ID too, so Blink does not ask for 2FA after every restart.",
    fields: [["BLINK_EMAIL", "Email", "", "text"], ["BLINK_PASSWORD", "Password", "", "secret"],
             ["BLINK_UUID", "Device ID", "Any fixed text, for example gridlantis-hl-1", "text"]] },
  { id: "ring", name: "HomeOS: Ring", icon: "fa-bell", href: "/homeos",
    about: "Ring doorbells and cameras.",
    get: "A refresh token from the ring-client-api command-line tool.",
    fields: [["RING_REFRESH_TOKEN", "Refresh token", "", "secret"]] },
  { id: "tuya", name: "HomeOS: Tuya cloud", icon: "fa-plug", href: "/homeos",
    about: "Only for Tuya devices that cannot be reached on your network.",
    get: "iot.tuya.com: a cloud project's Access ID and Access Secret.",
    fields: [["TUYA_CLIENT_ID", "Access ID", "", "text"], ["TUYA_CLIENT_SECRET", "Access secret", "", "secret"],
             ["TUYA_REGION", "Region", "us, eu, cn or in", "text"]] },
  { id: "ollama", name: "Local AI (Ollama)", icon: "fa-microchip", href: "/ai",
    about: "Cloud AI keys are pasted on the AI page. Set this only if Ollama runs on another machine.",
    get: "The address of the machine running Ollama.",
    fields: [["OLLAMA_HOST", "Ollama address", "For example http://192.168.1.20:11434", "text"]] },
  { id: "weather", name: "Weather", icon: "fa-cloud-sun", href: "/",
    about: "The location for the weather line on Home. No key needed.",
    get: "Your latitude and longitude, from any map.",
    fields: [["WEATHER_LAT", "Latitude", "For example 47.61", "text"], ["WEATHER_LON", "Longitude", "For example -122.33", "text"]] },
];
const ALLOWED = new Map(FEATURES.flatMap(f => f.fields.map(x => [x[0], x[3]])));
const MAX_LEN = 4096;

// The values Gridlantis-HL started with, to tell when a saved change still
// needs a restart.
const AT_START = Object.fromEntries([...ALLOWED.keys()].map(k => [k, process.env[k] || ""]));

function readFile() {
  try { return fs.readFileSync(ENV_FILE, "utf8"); } catch { return ""; }
}
// The same rules as config.js loadEnv: KEY=value, one quote stripped from each end.
function parse(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const t = line.trim(), eq = t.indexOf("=");
    if (!t || t.startsWith("#") || eq <= 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function mask(v) {
  if (!v) return "";
  return v.length <= 8 ? "•".repeat(v.length) : v.slice(0, 3) + "…" + v.slice(-3);
}

function state() {
  const saved = parse(readFile());
  let restartNeeded = false;
  const features = FEATURES.map(f => ({
    id: f.id, name: f.name, icon: f.icon, href: f.href, about: f.about, get: f.get,
    fields: f.fields.map(([env, label, hint, kind]) => {
      const v = saved[env] || "";
      const shell = SHELL_ENV_KEYS.has(env);
      if (!shell && v !== AT_START[env]) restartNeeded = true;
      return { env, label, hint, kind, set: !!v, value: kind === "secret" ? "" : v, masked: kind === "secret" ? mask(v) : "",
               shell, pending: !shell && v !== AT_START[env] };
    }),
  }));
  return { features, restartNeeded, canRestart: !!SUPERVISOR, file: ENV_FILE };
}

// values: { ENV_NAME: "new value" | "" }. "" removes the line. Names outside
// the catalog are refused, so this can never touch PASSWORD or PORT.
function save(values) {
  if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("values must map names to text");
  const changes = new Map();
  for (const [k, raw] of Object.entries(values)) {
    if (!ALLOWED.has(k)) throw new Error(k + " cannot be set here");
    if (typeof raw !== "string") throw new Error(k + " must be text");
    const v = raw.trim();
    if (v.length > MAX_LEN) throw new Error(k + " is too long");
    // Written as KEY="value"; loadEnv strips exactly one quote from each end,
    // so quotes inside the value survive. Line breaks would split the line.
    if (/[\r\n\0]/.test(v)) throw new Error(k + " cannot contain line breaks");
    changes.set(k, v);
  }
  if (!changes.size) return state();
  const text = readFile();
  const lines = text ? text.split("\n") : [];
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const out = [];
  for (const line of lines) {
    const t = line.trim(), eq = t.indexOf("=");
    const key = (!t.startsWith("#") && eq > 0) ? t.slice(0, eq).trim() : null;
    if (key && changes.has(key)) {
      const v = changes.get(key);
      changes.delete(key);
      if (v) out.push(key + '="' + v + '"');
      continue;
    }
    out.push(line);
  }
  for (const [k, v] of changes) if (v) out.push(k + '="' + v + '"');
  const tmp = ENV_FILE + ".tmp";
  fs.writeFileSync(tmp, out.join("\n") + "\n", { mode: 0o600 });
  fs.renameSync(tmp, ENV_FILE);
  try { fs.chmodSync(ENV_FILE, 0o600); } catch {}
  return state();
}

// Exits so the supervisor starts Gridlantis-HL again with the new .env.
function restart() {
  if (!SUPERVISOR) return false;
  setTimeout(() => process.exit(RESTART_CODE), 300);
  return true;
}

module.exports = { FEATURES, RESTART_CODE, keysState: state, restart, saveKeys: save };
