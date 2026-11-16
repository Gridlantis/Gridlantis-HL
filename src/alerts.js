const { AUDIO } = require("./audio");
const { speakServer } = require("./domains/tts/index");
const { httpPost } = require("./net");
const { SETTINGS } = require("./settings");

// ── Alert dispatcher: ntfy / webhook / Pushover / server speaker ───────────────
// speakServer() lives with the TTS engines, in src/domains/tts.
async function sendAlert(title, message, urgent){
  const a = SETTINGS.alerts || {};
  if (a.ntfy && a.ntfy.enabled && a.ntfy.topic) {
    const base = String(a.ntfy.url || "https://ntfy.sh").replace(/\/$/, "");
    try { await httpPost(base + "/" + encodeURIComponent(a.ntfy.topic), message, { "Title": String(title).replace(/[^\x20-\x7E]/g, "-"), "Priority": urgent ? "high" : "default", "Tags": urgent ? "warning" : "white_check_mark" }, 8000); }
    catch (e) { console.error("[alert:ntfy]", e.message); }
  }
  if (a.webhook && a.webhook.enabled && a.webhook.url) {
    try { await httpPost(a.webhook.url, JSON.stringify({ title, message, urgent: !!urgent, at: Date.now() }), { "Content-Type": "application/json" }, 8000); }
    catch (e) { console.error("[alert:webhook]", e.message); }
  }
  if (a.pushover && a.pushover.enabled && a.pushover.token && a.pushover.user) {
    const body = "token=" + encodeURIComponent(a.pushover.token) + "&user=" + encodeURIComponent(a.pushover.user) + "&title=" + encodeURIComponent(title) + "&message=" + encodeURIComponent(message) + (urgent ? "&priority=1" : "");
    try { await httpPost("https://api.pushover.net/1/messages.json", body, { "Content-Type": "application/x-www-form-urlencoded" }, 8000); }
    catch (e) { console.error("[alert:pushover]", e.message); }
  }
  if (a.speaker && a.speaker.enabled && (AUDIO.speaker || AUDIO.mp3)) speakServer(message);
}
const SID_SECRET = Math.random().toString(36).slice(2) + Date.now().toString(36);

module.exports = { SID_SECRET, sendAlert };
