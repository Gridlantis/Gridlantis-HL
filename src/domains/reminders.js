const { sendAlert } = require("../alerts");
const { REMINDERS_FILE } = require("../config");
const { broadcast } = require("../sse");
const { readJSON, writeJSONFile } = require("../store");

const REMINDER_TICK_MS = 10000;
const MISS_GRACE_MS    = 12 * 60 * 60 * 1000;
const REMINDER_SOUNDS  = ['chime', 'bell', 'alarm', 'pulse'];
const REMINDER_REPEATS = ['none', 'daily', 'weekdays', 'weekly'];

const readReminders  = () => { const d = readJSON(REMINDERS_FILE, []); return Array.isArray(d) ? d : []; };
const writeReminders = d  => writeJSONFile(REMINDERS_FILE, d);

// Reminders currently sounding, keyed by id. Emptied by dismiss/snooze/delete.
const RINGING = new Map();

// Advance a repeating reminder past `from` in LOCAL wall-clock terms. Adding
// 86,400,000 ms would drift by an hour across a DST boundary and a 07:00 alarm
// would quietly become 06:00, so step the date component and let Date keep the
// time of day fixed. The loop also absorbs a long outage in one pass: a daily
// reminder untouched for a week lands on the next future occurrence, not seven.
function nextOccurrence(rem, from) {
  const d = new Date(rem.at);
  for (let i = 0; i < 4000; i++) {
    d.setDate(d.getDate() + (rem.repeat === 'weekly' ? 7 : 1));
    if (rem.repeat === 'weekdays') while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    if (d.getTime() > from) break;
  }
  return d.getTime();
}

// A snooze overrides the scheduled time without disturbing it, so snoozing a
// daily 07:00 alarm still leaves it set for 07:00 tomorrow.
const reminderDueAt = rem => (rem.snoozeUntil ? rem.snoozeUntil : rem.at);

function sanitizeReminder(body, base) {
  const b = base || {};
  const title = String(body.title == null ? (b.title || '') : (body.title || '')).trim().slice(0, 200);
  const note  = String(body.note  == null ? (b.note  || '') : (body.note  || '')).slice(0, 2000);
  let at = b.at;
  if (body.at != null) { const n = Number(body.at); if (Number.isFinite(n) && n > 0) at = n; }
  return {
    title, note, at,
    repeat: REMINDER_REPEATS.includes(body.repeat) ? body.repeat : (b.repeat || 'none'),
    sound:  REMINDER_SOUNDS.includes(body.sound)   ? body.sound  : (b.sound  || 'chime'),
  };
}

function ringReminder(rem) {
  const payload = { id: rem.id, title: rem.title, note: rem.note || '',
                    sound: rem.sound || 'chime', firedAt: Date.now() };
  RINGING.set(rem.id, payload);
  broadcast('reminder_fire', payload);
  // Also out to whatever alert channels are configured, so a reminder still
  // reaches you when no browser is open at all.
  Promise.resolve()
    .then(() => sendAlert('Open HL · ' + (rem.title || 'Reminder'), rem.note || 'Reminder is due', true))
    .catch(e => console.error('[reminder:alert]', e.message));
}

function reminderTick() {
  const now = Date.now();
  let list;
  try { list = readReminders(); } catch { return; }
  let dirty = false;

  for (const rem of list) {
    if (!rem || !rem.enabled) continue;
    const due = reminderDueAt(rem);
    if (!Number.isFinite(due) || now < due) continue;
    if (RINGING.has(rem.id)) continue;          // still sounding — don't stack another

    const late    = now - due;
    const snoozed = !!rem.snoozeUntil;
    rem.snoozeUntil = null;
    rem.lastFired   = now;
    if (rem.repeat === 'none') rem.enabled = false;
    else if (now >= rem.at)    rem.at = nextOccurrence(rem, now);
    dirty = true;

    // Too stale to be useful: record it so the page can say so, but stay silent.
    if (late > MISS_GRACE_MS && !snoozed) { rem.missedAt = now; continue; }
    delete rem.missedAt;
    ringReminder(rem);
  }

  if (dirty) {
    try { writeReminders(list); broadcast('reminders_changed', {}); }
    catch (e) { console.error('! reminders write:', e.message); }
  }
}
setTimeout(reminderTick, 3000);
setInterval(reminderTick, REMINDER_TICK_MS);

module.exports = { MISS_GRACE_MS, REMINDER_REPEATS, REMINDER_SOUNDS, REMINDER_TICK_MS, RINGING, nextOccurrence, readReminders, reminderDueAt, reminderTick, ringReminder, sanitizeReminder, writeReminders };
