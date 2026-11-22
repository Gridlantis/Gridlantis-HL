const gcal = require("../domains/gcal");
const { readReminders, writeReminders } = require("../domains/reminders");
const { calendarHtml } = require("../pages/calendar");
const { broadcast } = require("../sse");

// The calendar page and its Google connection. The OAuth callback itself is in
// routes/public.js (see finishFromUrl) because the browser Google sends back is
// not always signed in to Gridlantis-HL.
module.exports = async function calendarRoutes(ctx) {
  const { req, pathname, parsed, html, json, redirect, readBody } = ctx;

  if (pathname === '/calendar' && req.method === 'GET') return html(calendarHtml());

  if (pathname === '/api/calendar/status' && req.method === 'GET') return json(gcal.status());

  if (pathname === '/api/calendar/connect' && req.method === 'GET') {
    try { return redirect(gcal.authUrl()); }
    catch (e) { return redirect('/calendar?gerr=' + encodeURIComponent(e.message)); }
  }

  // From a machine other than the host, Google's redirect to localhost fails in
  // that browser, but the address bar still holds the code. Pasting it here
  // finishes the same way the callback would.
  if (pathname === '/api/calendar/finish' && req.method === 'POST') {
    const body = JSON.parse((await readBody(16 * 1024)).toString() || '{}');
    let u;
    try { u = new URL(String(body.url || '').trim()); } catch { return json({ error: 'Paste the whole address from the address bar' }, 400); }
    if (u.searchParams.get('error')) return json({ error: 'Google said: ' + u.searchParams.get('error') }, 400);
    const code = u.searchParams.get('code'), state = u.searchParams.get('state');
    if (!code || !state) return json({ error: 'That address has no sign-in code in it' }, 400);
    try { await gcal.finishAuth(code, state); return json({ ok: true }); }
    catch (e) { return json({ error: e.message }, 400); }
  }

  if (pathname === '/api/calendar/disconnect' && req.method === 'POST') {
    await gcal.disconnect();
    return json({ ok: true });
  }

  if (pathname === '/api/calendar/sync' && req.method === 'POST') {
    if (!gcal.connected()) return json({ error: 'Google Calendar is not connected' }, 400);
    try { await gcal.sync(); return json({ ok: true, status: gcal.status() }); }
    catch (e) { return json({ error: e.message }, 502); }
  }

  // Which calendars exist, and which are shown on the calendar page.
  if (pathname === '/api/calendar/calendars' && req.method === 'GET') {
    if (!gcal.connected()) return json({ error: 'Google Calendar is not connected' }, 400);
    try { return json({ calendars: await gcal.calendars(parsed.searchParams.get('refresh') === '1') }); }
    catch (e) { return json({ error: e.message, needsScope: e.code === 'needs_scope' }, e.code === 'needs_scope' ? 403 : 502); }
  }
  if (pathname === '/api/calendar/calendars' && req.method === 'POST') {
    if (!gcal.connected()) return json({ error: 'Google Calendar is not connected' }, 400);
    const body = JSON.parse((await readBody(16 * 1024)).toString() || '{}');
    try { return json({ ok: true, shown: await gcal.setShown(body.ids) }); }
    catch (e) { return json({ error: e.message, needsScope: e.code === 'needs_scope' }, e.code === 'needs_scope' ? 403 : 502); }
  }

  // Google events in a range. Reminders come from /api/reminders as usual.
  if (pathname === '/api/calendar/events' && req.method === 'GET') {
    const from = Number(parsed.searchParams.get('from')), to = Number(parsed.searchParams.get('to'));
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 100 * 86400000)
      return json({ error: 'from and to must be a range of at most 100 days' }, 400);
    if (!gcal.connected()) return json({ events: [], connected: false });
    try { return json({ events: await gcal.eventsBetween(from, to), connected: true }); }
    catch (e) { return json({ events: [], connected: gcal.connected(), error: e.message }, 502); }
  }

  // A reminder that rings before a Google event. It stays an Gridlantis-HL-only alarm:
  // the event is already in the calendar, so it is not copied back as a second one.
  if (pathname === '/api/calendar/remind' && req.method === 'POST') {
    const body = JSON.parse((await readBody(16 * 1024)).toString() || '{}');
    const mins = Math.min(Math.max(parseInt(body.minutes, 10) || 0, 0), 7 * 24 * 60);
    let ev;
    try { ev = await gcal.getEvent(String(body.eventId || ''), body.calendarId ? String(body.calendarId) : null); }
    catch (e) { return json({ error: 'Could not load that event: ' + e.message }, 502); }
    const start = gcal.eventStart(ev);
    const at = start - mins * 60000;
    if (!Number.isFinite(at) || at <= Date.now()) return json({ error: 'That time has already passed' }, 400);
    const list = readReminders();
    const rem = { id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
                  title: String(ev.summary || 'Calendar event').slice(0, 200),
                  note: mins ? 'Starts in ' + (mins >= 60 && mins % 60 === 0 ? (mins / 60) + ' h' : mins + ' min') : 'Starting now',
                  at, repeat: 'none', sound: 'chime', enabled: true, created: Date.now(), lastFired: null, snoozeUntil: null,
                  fromEvent: ev.id };
    list.push(rem);
    writeReminders(list);
    broadcast('reminders_changed', { id: rem.id });
    return json({ ok: true, reminder: rem });
  }
};
