const fs = require("fs");
const path = require("path");

const { sendAlert } = require("../alerts");
const { DATA_DIR } = require("../config");
const { broadcast } = require("../sse");
const { readJSON, writeJSONFile } = require("../store");
const { NUMBER, POLL_MS, api, configured, twilioGet } = require("./twilio");

// ═══ TEXTS — incoming SMS to the Twilio number, pulled ═════════════════════════
// Twilio keeps every inbound message whatever the number's SMS URL does, so
// Open HL polls the Messages API the same way Voicemail polls Recordings. Receive
// only: the number is toll-free and unverified, so anything it sent would be
// blocked (error 30032). Picture messages keep a count of their attachments;
// the attachments themselves stay on Twilio.
const TEXTS_DIR   = path.join(DATA_DIR, "texts");
const TEXTS_FILE  = path.join(TEXTS_DIR, "texts.json");
const GONE_MAX    = 1000;
const ALERT_CHARS = 300;

fs.mkdirSync(TEXTS_DIR, { recursive: true, mode: 0o700 });

const STATUS = { ok: null, error: null, lastPoll: null };

// Same shape as voicemail.json: items held, SIDs deleted here, and whether the
// first poll (which imports silently) has run.
function readTexts() {
  const d = readJSON(TEXTS_FILE, {});
  return { seeded: !!d.seeded, items: Array.isArray(d.items) ? d.items : [], gone: Array.isArray(d.gone) ? d.gone : [] };
}
function writeTexts(d) {
  d.gone = d.gone.slice(-GONE_MAX);
  writeJSONFile(TEXTS_FILE, d);
}

async function doPoll() {
  const d = readTexts();
  const known = new Set(d.items.map(t => t.sid).concat(d.gone));
  const fresh = [];
  try {
    const q = "?PageSize=50" + (NUMBER ? "&To=" + encodeURIComponent(NUMBER) : "");
    const list = JSON.parse(await twilioGet(api("/Messages.json" + q))).messages || [];
    for (const m of list.reverse()) {
      if (known.has(m.sid) || m.direction !== "inbound") continue;
      const t = { sid: m.sid, from: m.from || "", to: m.to || "", body: m.body || "",
                  media: Number(m.num_media) || 0, at: Date.parse(m.date_sent || m.date_created) || Date.now(), readAt: null };
      d.items.push(t);
      fresh.push(t);
    }
    STATUS.ok = true; STATUS.error = null;
  } catch (e) {
    STATUS.ok = false; STATUS.error = e.message;
    console.error("[texts]", e.message);
  }
  STATUS.lastPoll = Date.now();

  const seeding = !d.seeded;
  if (seeding && STATUS.ok) d.seeded = true;
  if (fresh.length || (seeding && d.seeded)) {
    try { writeTexts(d); } catch { return; }
  }
  if (!fresh.length) return;
  broadcast("texts_changed", { added: fresh.length });
  if (seeding) return;
  for (const t of fresh) {
    const extra = t.media ? " [" + t.media + " attachment" + (t.media > 1 ? "s" : "") + "]" : "";
    sendAlert("Open HL · Text from " + (t.from || "unknown sender"), (t.body.slice(0, ALERT_CHARS) || "(no text)") + extra, false)
      .catch(e => console.error("[texts:alert]", e.message));
  }
}

let polling = null;
function pollTexts() {
  if (!configured()) return Promise.resolve();
  if (!polling) polling = doPoll().finally(() => { polling = null; });
  return polling;
}

if (configured()) { setTimeout(pollTexts, 8000); setInterval(pollTexts, POLL_MS); }

module.exports = { STATUS, configured, pollTexts, readTexts, writeTexts };
