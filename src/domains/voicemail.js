const fs = require("fs");
const path = require("path");

const { sendAlert } = require("../alerts");
const { DATA_DIR } = require("../config");
const { broadcast } = require("../sse");
const { readJSON, writeJSONFile } = require("../store");
const { NUMBER, POLL_MS, api, configured, twilioGet } = require("./twilio");

// ═══ VOICEMAIL — Twilio recordings, pulled ════════════════════════════════════
// The Twilio number's TwiML Bin ends in <Record>, so every voicemail is a
// Recording on the account. Open HL polls the REST API for new ones instead of
// taking a webhook, so it works without being reachable from the internet —
// the same trade mail makes. Each recording is downloaded once into
// data/voicemail/audio and served from there. Open HL never deletes anything on
// Twilio: "Delete" only drops Open HL's copy.
const VM_DIR      = path.join(DATA_DIR, "voicemail");
const AUDIO_DIR   = path.join(VM_DIR, "audio");
const VM_FILE     = path.join(VM_DIR, "voicemail.json");
const GONE_MAX    = 1000;

fs.mkdirSync(AUDIO_DIR, { recursive: true, mode: 0o700 });

const STATUS = { ok: null, error: null, lastPoll: null };

// items: the voicemails Open HL holds. gone: recording SIDs deleted here or left
// on another number, so the next poll does not fetch them again. seeded: the
// first poll imports what is already on the account without alerting.
function readVoicemail() {
  const d = readJSON(VM_FILE, {});
  return { seeded: !!d.seeded, items: Array.isArray(d.items) ? d.items : [], gone: Array.isArray(d.gone) ? d.gone : [] };
}
function writeVoicemail(d) {
  d.gone = d.gone.slice(-GONE_MAX);
  writeJSONFile(VM_FILE, d);
}
const unheardCount = () => readVoicemail().items.filter(v => !v.heardAt).length;

async function doPoll() {
  const d = readVoicemail();
  const known = new Set(d.items.map(v => v.sid).concat(d.gone));
  const fresh = [];
  let skipped = false;
  try {
    const list = JSON.parse(await twilioGet(api("/Recordings.json?PageSize=50"))).recordings || [];
    // Oldest first, so alerts arrive in the order the messages were left.
    for (const r of list.reverse()) {
      if (known.has(r.sid) || r.status !== "completed") continue;
      if (r.source && r.source !== "RecordVerb") continue;   // call recordings, not voicemail
      const call = JSON.parse(await twilioGet(api("/Calls/" + r.call_sid + ".json")));
      if (NUMBER && call.to !== NUMBER) { d.gone.push(r.sid); skipped = true; continue; }
      fs.writeFileSync(path.join(AUDIO_DIR, r.sid + ".mp3"), await twilioGet(api("/Recordings/" + r.sid + ".mp3")), { mode: 0o600 });
      const v = { sid: r.sid, callSid: r.call_sid, from: call.from || "", to: call.to || "",
                  at: Date.parse(r.date_created) || Date.now(), duration: Number(r.duration) || 0, heardAt: null };
      d.items.push(v);
      fresh.push(v);
    }
    STATUS.ok = true; STATUS.error = null;
  } catch (e) {
    STATUS.ok = false; STATUS.error = e.message;
    console.error("[voicemail]", e.message);
  }
  STATUS.lastPoll = Date.now();

  // Whatever was downloaded before an error is kept; the rest comes next poll.
  const seeding = !d.seeded;
  if (seeding && STATUS.ok) d.seeded = true;
  if (fresh.length || skipped || (seeding && d.seeded)) {
    try { writeVoicemail(d); } catch { return; }
  }
  if (!fresh.length) return;
  broadcast("voicemail_changed", { added: fresh.length });
  if (seeding) return;
  for (const v of fresh)
    sendAlert("Open HL · New voicemail", "From " + (v.from || "unknown caller") + " · " + v.duration + " s", false)
      .catch(e => console.error("[voicemail:alert]", e.message));
}

// One poll at a time: the timer and a "Check now" click share the same run.
let polling = null;
function pollVoicemail() {
  if (!configured()) return Promise.resolve();
  if (!polling) polling = doPoll().finally(() => { polling = null; });
  return polling;
}

if (configured()) { setTimeout(pollVoicemail, 5000); setInterval(pollVoicemail, POLL_MS); }

module.exports = { AUDIO_DIR, STATUS, configured, pollVoicemail, readVoicemail, unheardCount, writeVoicemail };
