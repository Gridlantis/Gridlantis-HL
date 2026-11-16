const { queuePush, queueRemove } = require("../domains/gcal");
const { RINGING, nextOccurrence, readReminders, sanitizeReminder, writeReminders } = require("../domains/reminders");
const { broadcast } = require("../sse");

// Reminders: CRUD, dismiss, snooze.
module.exports = async function reminderRoutes(ctx) {
  const { req, pathname, json, readBody } = ctx;

  // ── Reminders API ───────────────────────────────────────────────────────────
  if (pathname === '/api/reminders' && req.method === 'GET') {
    return json({ reminders: readReminders(), ringing: [...RINGING.values()], now: Date.now() });
  }
  // Polled by the global alarm layer on every page load, so an alarm that fired
  // before this page existed still gets picked up.
  if (pathname === '/api/reminders/active' && req.method === 'GET') {
    return json({ ringing: [...RINGING.values()], now: Date.now() });
  }
  if (pathname === '/api/reminders' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString() || '{}');
    const f = sanitizeReminder(body, null);
    if (!f.title)                return json({ error: 'Give the reminder a title' }, 400);
    if (!Number.isFinite(f.at))  return json({ error: 'Pick a date and time' }, 400);
    // "Daily at 07:00" entered at 09:00 means tomorrow, not a alarm that fires
    // the instant it is saved. A one-off in the past is simply a mistake.
    if (f.at <= Date.now()) {
      if (f.repeat === 'none') return json({ error: 'Pick a time in the future' }, 400);
      f.at = nextOccurrence(f, Date.now());
    }
    const list = readReminders();
    const rem = { id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
                  ...f, enabled: true, created: Date.now(), lastFired: null, snoozeUntil: null };
    list.push(rem);
    writeReminders(list);
    broadcast('reminders_changed', { id: rem.id });
    queuePush(rem);
    return json({ ok: true, reminder: rem });
  }
  if (pathname === '/api/reminders/update' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString() || '{}');
    const list = readReminders();
    const rem  = list.find(r => r.id === body.id);
    if (!rem) return json({ error: 'No such reminder' }, 404);
    const f = sanitizeReminder(body, rem);
    if (!f.title)               return json({ error: 'Give the reminder a title' }, 400);
    if (!Number.isFinite(f.at)) return json({ error: 'Pick a date and time' }, 400);
    if (f.at <= Date.now()) {
      if (f.repeat === 'none') return json({ error: 'Pick a time in the future' }, 400);
      f.at = nextOccurrence(f, Date.now());
    }
    Object.assign(rem, f);
    if (body.enabled != null) rem.enabled = !!body.enabled;
    rem.snoozeUntil = null;
    delete rem.missedAt;
    writeReminders(list);
    broadcast('reminders_changed', { id: rem.id });
    queuePush(rem);
    return json({ ok: true, reminder: rem });
  }
  if (pathname === '/api/reminders/toggle' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString() || '{}');
    const list = readReminders();
    const rem  = list.find(r => r.id === body.id);
    if (!rem) return json({ error: 'No such reminder' }, 404);
    rem.enabled = body.enabled == null ? !rem.enabled : !!body.enabled;
    rem.snoozeUntil = null;
    // Switching a lapsed reminder back on should schedule it forward, not fire
    // it on the very next tick.
    if (rem.enabled && rem.at <= Date.now()) {
      if (rem.repeat === 'none') return json({ error: 'That time has passed — edit it to a new one' }, 400);
      rem.at = nextOccurrence(rem, Date.now());
    }
    delete rem.missedAt;
    writeReminders(list);
    broadcast('reminders_changed', { id: rem.id });
    return json({ ok: true, reminder: rem });
  }
  if (pathname === '/api/reminders/delete' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString() || '{}');
    const list = readReminders();
    const i = list.findIndex(r => r.id === body.id);
    if (i < 0) return json({ error: 'No such reminder' }, 404);
    const [gone] = list.splice(i, 1);
    writeReminders(list);
    queueRemove(gone);
    if (RINGING.delete(body.id)) broadcast('reminder_clear', { id: body.id });
    broadcast('reminders_changed', { id: body.id });
    return json({ ok: true });
  }
  if (pathname === '/api/reminders/dismiss' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString() || '{}');
    RINGING.delete(body.id);
    broadcast('reminder_clear', { id: body.id });   // stops it ringing in every other tab too
    return json({ ok: true });
  }
  if (pathname === '/api/reminders/snooze' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString() || '{}');
    const mins = Math.min(Math.max(parseInt(body.minutes, 10) || 5, 1), 24 * 60);
    const list = readReminders();
    const rem  = list.find(r => r.id === body.id);
    if (rem) {
      rem.snoozeUntil = Date.now() + mins * 60000;
      rem.enabled = true;               // a one-shot that just retired comes back for the snooze
      writeReminders(list);
    }
    RINGING.delete(body.id);
    broadcast('reminder_clear', { id: body.id });
    broadcast('reminders_changed', { id: body.id });
    return json({ ok: true, snoozeUntil: rem ? rem.snoozeUntil : null });
  }
};
