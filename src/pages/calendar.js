const { BASE_CSS, FAVICON, FONT, NAV_CSS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");

// Month view of Metis reminders and Google Calendar events. Reminders are drawn
// from /api/reminders, Google events from /api/calendar/events; an event that is
// itself a synced reminder is shown once, as the reminder.
function calendarHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Metis · Calendar</title>${FONT}${FAVICON}
<style>
${BASE_CSS}${NAV_CSS}${TOAST_CSS}
.cl-page{max-width:1280px;--rem:#fb923c;--gev:#4f8ff7;}
.cl-nav{display:flex;align-items:center;gap:8px;}
.cl-month{font:600 18px/1 var(--font-display);min-width:170px;text-align:center;}
.cl-conn{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;margin-bottom:16px;color:var(--text-2);}
.cl-conn .fa-google{color:var(--gev);}
.cl-conn .grow{flex:1;min-width:200px;}
.cl-conn b{color:var(--text);font-weight:600;}
.cl-conn .err{color:var(--fault);}
.cl-setup{line-height:1.6;}
.cl-setup ol{margin:6px 0 0 18px;}
.cl-setup code{font-family:var(--font-mono);font-size:12.5px;background:var(--raised);padding:1px 5px;border-radius:4px;word-break:break-all;}
.cl-paste{display:flex;gap:8px;width:100%;margin-top:4px;}
.cl-paste input{flex:1;min-width:0;height:34px;background:var(--field);border:1px solid var(--line);border-radius:var(--r-ctl);padding:0 12px;color:var(--text);}
.cl-layout{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:16px;align-items:start;}
.cl-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));}
.cl-dow{padding:10px 8px;font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--line);}
.cl-day{min-height:112px;padding:6px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);cursor:pointer;display:flex;flex-direction:column;gap:3px;min-width:0;background:none;text-align:left;color:inherit;font:inherit;border-top:0;border-left:0;}
.cl-day:nth-child(7n+14){border-right:0;}
.cl-day:hover{background:var(--raised);}
.cl-day.out{color:var(--muted);}
.cl-day.out .cl-num{opacity:.55;}
.cl-day.sel{box-shadow:inset 0 0 0 2px var(--accent);}
.cl-num{font-size:13px;font-weight:600;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:12px;flex:0 0 auto;}
.cl-day.today .cl-num{background:var(--accent);color:var(--accent-ink);}
.cl-chip{font-size:12px;line-height:1.3;padding:2px 6px;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-left:3px solid var(--gev);background:color-mix(in srgb,var(--gev) 14%,transparent);}
.cl-chip.rem{border-left-color:var(--rem);background:color-mix(in srgb,var(--rem) 14%,transparent);}
.cl-chip.off{opacity:.55;}
.cl-chip.focus{outline:2px solid var(--rem);outline-offset:1px;}
.cl-chip time{color:var(--muted);margin-right:4px;font-variant-numeric:tabular-nums;}
.cl-more{font-size:12px;color:var(--muted);padding-left:6px;}
.cl-side{position:sticky;top:calc(var(--pulse-h) + 16px);}
.cl-agenda{display:flex;flex-direction:column;}
.cl-item{padding:12px 16px;border-top:1px solid var(--line);display:flex;gap:10px;}
.cl-item.focus{background:color-mix(in srgb,var(--rem) 10%,transparent);}
.cl-ico{flex:0 0 auto;width:26px;height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:13px;color:var(--gev);background:color-mix(in srgb,var(--gev) 15%,transparent);}
.cl-item.rem .cl-ico{color:var(--rem);background:color-mix(in srgb,var(--rem) 15%,transparent);}
.cl-body{flex:1;min-width:0;}
.cl-t{font-weight:600;word-break:break-word;}
.cl-meta{font-size:13px;color:var(--muted);margin-top:2px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;}
.cl-n{font-size:13px;color:var(--text-2);margin-top:4px;white-space:pre-wrap;word-break:break-word;line-height:1.5;}
.cl-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;}
.cl-acts .m-btn,.cl-acts select{height:28px;font-size:13px;padding:0 10px;}
.cl-acts select{background:var(--field);border:1px solid var(--line);border-radius:var(--r-ctl);color:var(--text);}
.cl-empty{padding:28px 16px;text-align:center;color:var(--muted);border-top:1px solid var(--line);line-height:1.6;}
.cl-legend{display:flex;gap:14px;font-size:13px;color:var(--muted);padding:10px 16px;border-top:1px solid var(--line);}
.cl-legend span::before{content:'';display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px;background:var(--gev);}
.cl-legend .r::before{background:var(--rem);}
.cl-legend{flex-wrap:wrap;}
.cl-cals{margin:-6px 0 16px;padding:14px 16px;}
.cl-cals h3{font:600 15px/1.2 var(--font-display);margin:0 0 4px;}
.cl-cals p{color:var(--text-2);margin:0 0 10px;line-height:1.55;}
.cl-cals ol{margin:0 0 12px 18px;color:var(--text-2);line-height:1.6;}
.cl-cals code{font-family:var(--font-mono);font-size:12.5px;background:var(--raised);padding:1px 5px;border-radius:4px;word-break:break-all;}
.cl-cal{display:flex;align-items:center;gap:10px;padding:7px 4px;border-top:1px solid var(--line);cursor:pointer;}
.cl-cal:first-of-type{border-top:0;}
.cl-cal input{width:16px;height:16px;accent-color:var(--accent);flex:0 0 auto;}
.cl-dot{width:12px;height:12px;border-radius:4px;flex:0 0 auto;background:var(--gev);}
.cl-cal span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cl-cal small{color:var(--muted);flex:0 0 auto;}
.cl-cals .cl-acts{margin-top:12px;}
@media(max-width:980px){.cl-layout{grid-template-columns:1fr;}.cl-side{position:static;}}
@media(max-width:640px){.cl-day{min-height:64px;padding:4px;}.cl-chip{font-size:0;padding:0;height:6px;border-left-width:0;border-radius:3px;background:var(--gev);}.cl-chip.rem{background:var(--rem);}.cl-chip time{display:none;}.cl-month{min-width:0;font-size:16px;}}
</style></head><body>
${navBar('/calendar')}
<main class="m-page cl-page">
  <div class="m-head">
    <div><h1 class="m-title">Calendar</h1><p class="m-sub">Your reminders and Google Calendar, kept in sync.</p></div>
    <div class="cl-nav">
      <button class="m-btn icon" id="cl-prev" aria-label="Previous month"><i class="fa-solid fa-chevron-left"></i></button>
      <div class="cl-month" id="cl-month" aria-live="polite"></div>
      <button class="m-btn icon" id="cl-next" aria-label="Next month"><i class="fa-solid fa-chevron-right"></i></button>
      <button class="m-btn" id="cl-today">Today</button>
    </div>
  </div>

  <div class="m-panel cl-conn" id="cl-conn"><i class="fa-brands fa-google"></i><span class="grow">Checking Google Calendar&hellip;</span></div>
  <div class="m-panel cl-cals" id="cl-cals" style="display:none"></div>

  <div class="cl-layout">
    <section class="m-panel" aria-label="Month">
      <div class="cl-grid" id="cl-grid"></div>
      <div class="cl-legend" id="cl-legend"><span class="r">Metis reminder</span><span>Google Calendar</span></div>
    </section>
    <aside class="m-panel cl-side" aria-labelledby="cl-day-t">
      <div class="m-panel-h"><h2 class="m-panel-t" id="cl-day-t">Today</h2>
        <a class="m-btn" id="cl-new" href="/reminders"><i class="fa-solid fa-plus"></i>Reminder</a></div>
      <div class="cl-agenda" id="cl-agenda"></div>
    </aside>
  </div>
</main>
<div class="toast" id="toast"></div>
<script>
${TOAST_JS}

function $(id){ return document.getElementById(id); }
function esc(s){ var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
function pad(n){ return (n < 10 ? '0' : '') + n; }
function dayKey(d){ return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
function parseKey(k){ var p = k.split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
function fmtTime(ms){ return new Date(ms).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }); }

var Q = new URLSearchParams(location.search);
var FOCUS = Q.get('focus');
var sel = Q.get('date') && /^\\d{4}-\\d{2}-\\d{2}$/.test(Q.get('date')) ? parseKey(Q.get('date')) : new Date();
sel.setHours(0,0,0,0);
var view = new Date(sel.getFullYear(), sel.getMonth(), 1);
var REM = [], EVENTS = [], LINKS = {}, ST = null, CALS = null, gridStart = null, gridEnd = null;
function colorStyle(c){ return c && /^#[0-9a-fA-F]{6}$/.test(c) ? ' style="--gev:' + c + '"' : ''; }

// ── reminders → occurrences ─────────────────────────────────────────────────
// Mirrors nextOccurrence() on the server: steps by calendar day so the time of
// day survives DST. Repeating reminders are drawn back to when they were made.
function step(d, repeat, dir){
  d.setDate(d.getDate() + dir * (repeat === 'weekly' ? 7 : 1));
  if (repeat === 'weekdays') while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + dir);
}
function occurrences(r, from, to){
  var due = r.snoozeUntil || r.at, out = [];
  if (!r.repeat || r.repeat === 'none') { if (due >= from && due < to) out.push(due); return out; }
  if (r.snoozeUntil && r.snoozeUntil >= from && r.snoozeUntil < to) out.push(r.snoozeUntil);
  if (!r.enabled) return out;
  var d = new Date(r.at);
  for (var i = 0; i < 400 && d.getTime() < to; i++) { if (d.getTime() >= from) out.push(d.getTime()); step(d, r.repeat, 1); }
  var floor = Math.max(from, r.created || 0);
  d = new Date(r.at); step(d, r.repeat, -1);
  for (var j = 0; j < 400 && d.getTime() >= floor; j++) { if (d.getTime() < to) out.push(d.getTime()); step(d, r.repeat, -1); }
  return out;
}

// Everything on one day, sorted: all-day events first, then by time.
function itemsByDay(){
  var map = {};
  function add(k, it){ (map[k] = map[k] || []).push(it); }
  REM.forEach(function(r){
    occurrences(r, gridStart.getTime(), gridEnd.getTime()).forEach(function(ms){
      add(dayKey(new Date(ms)), { kind:'rem', at: ms, r: r });
    });
  });
  EVENTS.forEach(function(e){
    if (e.metisId && REM.some(function(r){ return r.id === e.metisId; })) return;
    if (e.allDay) {
      var d = parseKey(e.start), end = e.end ? parseKey(e.end) : new Date(d.getTime() + 86400000);
      for (var i = 0; i < 60 && d < end; i++) { add(dayKey(d), { kind:'gev', at: d.getTime(), allDay: true, e: e }); d.setDate(d.getDate() + 1); }
    } else {
      var ms = Date.parse(e.start);
      add(dayKey(new Date(ms)), { kind:'gev', at: ms, e: e });
    }
  });
  Object.keys(map).forEach(function(k){
    map[k].sort(function(a, b){ return (b.allDay ? 1 : 0) - (a.allDay ? 1 : 0) || a.at - b.at; });
  });
  return map;
}

// ── render ──────────────────────────────────────────────────────────────────
var BYDAY = {};
function render(){
  BYDAY = itemsByDay();
  $('cl-month').textContent = view.toLocaleDateString([], { month:'long', year:'numeric' });
  var todayK = dayKey(new Date()), selK = dayKey(sel), html = '';
  var names = []; for (var w = 0; w < 7; w++) names.push(new Date(2024, 0, 7 + w).toLocaleDateString([], { weekday:'short' }));
  names.forEach(function(n){ html += '<div class="cl-dow">' + esc(n) + '</div>'; });
  var d = new Date(gridStart);
  while (d < gridEnd) {
    var k = dayKey(d), items = BYDAY[k] || [];
    var cls = 'cl-day' + (d.getMonth() !== view.getMonth() ? ' out' : '') + (k === todayK ? ' today' : '') + (k === selK ? ' sel' : '');
    html += '<button class="' + cls + '" data-day="' + k + '" aria-label="' + esc(d.toDateString()) + (items.length ? ', ' + items.length + ' items' : '') + '">' +
      '<span class="cl-num">' + d.getDate() + '</span>';
    items.slice(0, 3).forEach(function(it){
      var title = it.kind === 'rem' ? it.r.title : it.e.title;
      var c = 'cl-chip' + (it.kind === 'rem' ? ' rem' : '') + (it.kind === 'rem' && !it.r.enabled ? ' off' : '') + (it.kind === 'rem' && it.r.id === FOCUS ? ' focus' : '');
      html += '<span class="' + c + '"' + (it.kind === 'gev' ? colorStyle(it.e.color) : '') + '>' + (it.allDay ? '' : '<time>' + esc(fmtTime(it.at)) + '</time>') + esc(title) + '</span>';
    });
    if (items.length > 3) html += '<span class="cl-more">+' + (items.length - 3) + ' more</span>';
    html += '</button>';
    d.setDate(d.getDate() + 1);
  }
  $('cl-grid').innerHTML = html;
  renderAgenda();
}

function renderAgenda(){
  var k = dayKey(sel), items = BYDAY[k] || [];
  var isToday = k === dayKey(new Date());
  $('cl-day-t').textContent = isToday ? 'Today' : sel.toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' });
  var at = new Date(sel); at.setHours(9, 0, 0, 0);
  if (isToday) at = new Date(Date.now() + 15 * 60000);
  $('cl-new').href = '/reminders?at=' + at.getTime();
  if (!items.length) { $('cl-agenda').innerHTML = '<div class="cl-empty">Nothing on this day.</div>'; return; }
  var now = Date.now();
  $('cl-agenda').innerHTML = items.map(function(it, i){
    if (it.kind === 'rem') {
      var r = it.r, link = LINKS[r.id];
      var rep = { daily:'Every day', weekdays:'Weekdays', weekly:'Every week' }[r.repeat];
      return '<div class="cl-item rem' + (r.id === FOCUS ? ' focus' : '') + '" data-i="' + i + '">' +
        '<div class="cl-ico"><i class="fa-regular fa-bell"></i></div><div class="cl-body">' +
        '<div class="cl-t">' + esc(r.title) + '</div>' +
        '<div class="cl-meta"><span>' + esc(fmtTime(it.at)) + '</span>' + (rep ? '<span>' + rep + '</span>' : '') +
          (!r.enabled ? '<span>off</span>' : '') +
          (r.gcalId ? '<span title="Synced to Google Calendar"><i class="fa-brands fa-google"></i> synced</span>' : '') + '</div>' +
        (r.note ? '<div class="cl-n">' + esc(r.note) + '</div>' : '') +
        '<div class="cl-acts"><a class="m-btn" href="/reminders?edit=' + encodeURIComponent(r.id) + '"><i class="fa-solid fa-pen"></i>Edit</a>' +
          (link ? '<a class="m-btn" href="' + esc(link) + '" target="_blank" rel="noopener"><i class="fa-brands fa-google"></i>Open in Google</a>' : '') +
        '</div></div></div>';
    }
    var e = it.e, end = e.end && !e.allDay ? Date.parse(e.end) : null;
    var when = it.allDay ? 'All day' : fmtTime(it.at) + (end ? ' – ' + fmtTime(end) : '');
    var remind = !it.allDay && it.at > now
      ? '<select data-remind="' + esc(e.id) + '" data-cal="' + esc(e.calendarId || '') + '" aria-label="Remind me"><option value="">Remind me&hellip;</option>' +
        '<option value="0">At start</option><option value="10">10 min before</option><option value="30">30 min before</option>' +
        '<option value="60">1 hour before</option><option value="1440">1 day before</option></select>' : '';
    return '<div class="cl-item" data-i="' + i + '">' +
      '<div class="cl-ico"' + colorStyle(e.color) + '><i class="fa-regular fa-calendar"></i></div><div class="cl-body">' +
      '<div class="cl-t">' + esc(e.title) + '</div>' +
      '<div class="cl-meta"><span>' + esc(when) + '</span>' + (e.calendar ? '<span>' + esc(e.calendar) + '</span>' : '') + (e.location ? '<span><i class="fa-solid fa-location-dot"></i> ' + esc(e.location) + '</span>' : '') + '</div>' +
      (e.note ? '<div class="cl-n">' + esc(e.note) + '</div>' : '') +
      '<div class="cl-acts">' + (e.link ? '<a class="m-btn" href="' + esc(e.link) + '" target="_blank" rel="noopener"><i class="fa-brands fa-google"></i>Open in Google</a>' : '') + remind + '</div>' +
      '</div></div>';
  }).join('');
  var f = document.querySelector('.cl-item.focus');
  if (f && FOCUS) { f.scrollIntoView({ block:'nearest' }); }
}

function ago(ms){
  var s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return new Date(ms).toLocaleString();
}
// From a machine other than the host, Google's redirect to localhost fails in
// that browser; the page then offers a box for pasting that address.
function isRemote(s){
  var local = ['localhost', '127.0.0.1', '[::1]', '::1'].indexOf(location.hostname) > -1;
  return !local && /[/][/]localhost[:/]/.test(s.redirectUri);
}
function pasteBox(){
  return '<div style="margin-top:6px">Google will send you back to <code>localhost</code>, which only works on the Metis host. ' +
    'If that page fails to load here, copy its whole address from the address bar and paste it below.</div>' +
    '<div class="cl-paste"><input id="cl-paste" placeholder="http://localhost:…/api/calendar/callback?code=…" aria-label="Address from the address bar">' +
    '<button class="m-btn" id="cl-finish">Finish</button></div>';
}
function wireFinish(){
  var fin = $('cl-finish');
  if (fin) fin.addEventListener('click', function(){
    post('/api/calendar/finish', { url: $('cl-paste').value }).then(function(res){
      if (!res.ok) { showToast(res.d.error || 'Could not connect', 'bad'); return; }
      showToast('Google Calendar connected', 'ok'); $('cl-cals').style.display = 'none'; refreshAll();
    });
  });
}

// ── calendar picker ─────────────────────────────────────────────────────────
function openPicker(){
  var p = $('cl-cals'), s = ST;
  p.style.display = '';
  if (!s.canListCalendars) {
    var remote = isRemote(s);
    p.innerHTML = '<h3>Choose which calendars to show</h3>' +
      '<p>Metis needs one more permission to see your list of calendars (for example a work schedule that shows up in Google Calendar).</p>' +
      '<ol><li>In Google Cloud, open <b>Google Auth Platform → Data access → Add or remove scopes</b>, tick <code>.../auth/calendar.calendarlist.readonly</code>, click <b>Update</b>, then <b>Save</b>.</li>' +
      '<li>Click <b>Reconnect</b> below and allow the new permission. Your reminders stay as they are.</li></ol>' +
      (remote ? pasteBox() : '') +
      '<div class="cl-acts"><a class="m-btn primary" href="/api/calendar/connect"' + (remote ? ' target="_blank" rel="noopener"' : '') + '>Reconnect</a>' +
      '<button class="m-btn ghost" id="cl-pick-x">Close</button></div>';
    wireFinish();
    $('cl-pick-x').addEventListener('click', function(){ p.style.display = 'none'; });
    return;
  }
  p.innerHTML = '<h3>Calendars</h3><p>Loading your calendars&hellip;</p>';
  fetch('/api/calendar/calendars?refresh=1').then(function(r){ return r.json().then(function(d){ return { ok: r.ok, d: d }; }); }).then(function(res){
    if (!res.ok) { p.innerHTML = '<h3>Calendars</h3><p>' + esc(res.d.error || 'Could not load your calendars') + '</p>'; return; }
    CALS = res.d.calendars; renderLegend();
    p.innerHTML = '<h3>Calendars</h3><p>Events from the ticked calendars appear here. Reminders are always saved to your main calendar.</p>' +
      '<div id="cl-cal-list">' + CALS.map(function(c){
        return '<label class="cl-cal"><input type="checkbox" value="' + esc(c.id) + '"' + (c.shown ? ' checked' : '') + '>' +
          '<i class="cl-dot"' + colorStyle(c.color) + '></i><span>' + esc(c.name) + '</span>' +
          (c.primary ? '<small>main</small>' : c.access === 'reader' || c.access === 'freeBusyReader' ? '<small>read-only</small>' : '') + '</label>';
      }).join('') + '</div>' +
      '<div class="cl-acts"><button class="m-btn primary" id="cl-cal-save">Save</button><button class="m-btn ghost" id="cl-pick-x">Cancel</button></div>';
    $('cl-pick-x').addEventListener('click', function(){ p.style.display = 'none'; });
    $('cl-cal-save').addEventListener('click', function(){
      var ids = [].slice.call(p.querySelectorAll('#cl-cal-list input:checked')).map(function(i){ return i.value; });
      if (!ids.length) { showToast('Tick at least one calendar', 'bad'); return; }
      post('/api/calendar/calendars', { ids: ids }).then(function(r){
        if (!r.ok) { showToast(r.d.error || 'Could not save', 'bad'); return; }
        p.style.display = 'none'; showToast('Showing ' + ids.length + ' calendar' + (ids.length === 1 ? '' : 's'), 'ok'); refreshAll();
      });
    });
  });
}
function renderLegend(){
  var shown = CALS ? CALS.filter(function(c){ return c.shown; }) : [];
  $('cl-legend').innerHTML = '<span class="r">Metis reminder</span>' + (shown.length
    ? shown.map(function(c){ return '<span' + colorStyle(c.color) + '>' + esc(c.name) + '</span>'; }).join('')
    : '<span>Google Calendar</span>');
}

function renderConn(){
  var s = ST, el = $('cl-conn');
  if (!s) return;
  var err = s.lastError ? '<div class="err">' + esc(s.lastError) + '</div>' : '';
  if (!s.configured) {
    el.innerHTML = '<i class="fa-brands fa-google"></i><div class="grow cl-setup"><b>Connect Google Calendar</b>' +
      '<ol><li>In Google Cloud Console, enable the <b>Google Calendar API</b>, set up the OAuth consent screen (add yourself as a test user, or publish it so the sign-in does not lapse every 7 days).</li>' +
      '<li>Create an OAuth client of type <b>Web application</b> with this redirect URI: <code>' + esc(s.redirectUri) + '</code></li>' +
      '<li>Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to Metis\\'s .env and restart Metis.</li></ol></div>';
    return;
  }
  if (!s.connected) {
    var remote = isRemote(s);
    $('cl-cals').style.display = 'none';
    el.innerHTML = '<i class="fa-brands fa-google"></i><div class="grow"><b>Google Calendar is not connected.</b> ' +
      'Your reminders will be added to it, and changes made in Google come back to Metis.' + err +
      (remote ? pasteBox() : '') +
      '</div><a class="m-btn primary" href="/api/calendar/connect"' + (remote ? ' target="_blank" rel="noopener"' : '') + '>Connect</a>';
    wireFinish();
    return;
  }
  el.innerHTML = '<i class="fa-brands fa-google"></i><div class="grow">Synced with <b>' + esc(s.account || 'Google Calendar') + '</b>' +
    (s.lastSync ? ' &middot; ' + ago(s.lastSync) : '') + err + '</div>' +
    '<button class="m-btn" id="cl-pick"><i class="fa-regular fa-calendar-check"></i>Calendars' +
      (s.shown && s.shown.length > 1 ? ' (' + s.shown.length + ')' : '') + '</button>' +
    '<button class="m-btn" id="cl-sync"><i class="fa-solid fa-rotate"></i>Sync now</button>' +
    '<button class="m-btn ghost" id="cl-disc">Disconnect</button>';
  $('cl-pick').addEventListener('click', function(){
    var p = $('cl-cals');
    if (p.style.display !== 'none') { p.style.display = 'none'; return; }
    openPicker();
  });
  $('cl-sync').addEventListener('click', function(){
    var b = this; b.disabled = true;
    post('/api/calendar/sync', {}).then(function(res){
      b.disabled = false;
      if (!res.ok) showToast(res.d.error || 'Sync failed', 'bad'); else showToast('Synced', 'ok');
      refreshAll();
    });
  });
  $('cl-disc').addEventListener('click', function(){
    if (!confirm('Disconnect Google Calendar? Events already in Google stay there.')) return;
    post('/api/calendar/disconnect', {}).then(function(){ showToast('Disconnected', 'ok'); refreshAll(); });
  });
}

// ── data ────────────────────────────────────────────────────────────────────
function post(url, body){
  return fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body || {}) })
    .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, d: d }; }); })
    .catch(function(){ return { ok: false, d: { error: 'Metis did not answer' } }; });
}
function setGrid(){
  gridStart = new Date(view); gridStart.setDate(1 - view.getDay());
  gridEnd = new Date(gridStart); gridEnd.setDate(gridEnd.getDate() + 42);
}
var loadSeq = 0;
function loadMonth(){
  setGrid();
  var seq = ++loadSeq;
  var rem = fetch('/api/reminders').then(function(r){ return r.json(); }).then(function(d){ REM = d.reminders || []; });
  var ev = fetch('/api/calendar/events?from=' + gridStart.getTime() + '&to=' + gridEnd.getTime())
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (seq !== loadSeq) return;
      EVENTS = d.events || [];
      LINKS = {};
      EVENTS.forEach(function(e){ if (e.metisId && e.link && !LINKS[e.metisId]) LINKS[e.metisId] = e.link; });
      if (d.error) showToast('Google Calendar: ' + d.error, 'bad');
    }).catch(function(){ EVENTS = []; });
  return Promise.all([rem, ev]).then(function(){ if (seq === loadSeq) render(); })
    .catch(function(){ showToast('Could not load the calendar', 'bad'); });
}
function loadStatus(){
  return fetch('/api/calendar/status').then(function(r){ return r.json(); }).then(function(s){
    ST = s; renderConn();
    if (s.connected && s.canListCalendars)
      fetch('/api/calendar/calendars').then(function(r){ return r.ok ? r.json() : null; }).then(function(d){ if (d) { CALS = d.calendars; renderLegend(); } }).catch(function(){});
  });
}
function refreshAll(){ loadStatus(); loadMonth(); }

// ── wiring ──────────────────────────────────────────────────────────────────
function go(months){ view = new Date(view.getFullYear(), view.getMonth() + months, 1); loadMonth(); }
$('cl-prev').addEventListener('click', function(){ go(-1); });
$('cl-next').addEventListener('click', function(){ go(1); });
$('cl-today').addEventListener('click', function(){
  sel = new Date(); sel.setHours(0,0,0,0);
  view = new Date(sel.getFullYear(), sel.getMonth(), 1); loadMonth();
});
$('cl-grid').addEventListener('click', function(e){
  var b = e.target.closest('[data-day]'); if (!b) return;
  sel = parseKey(b.getAttribute('data-day'));
  if (sel.getMonth() !== view.getMonth()) { view = new Date(sel.getFullYear(), sel.getMonth(), 1); loadMonth(); return; }
  var prev = document.querySelector('.cl-day.sel'); if (prev) prev.classList.remove('sel');
  b.classList.add('sel');
  renderAgenda();
});
document.addEventListener('keydown', function(e){
  var t = document.activeElement && document.activeElement.tagName;
  if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
  if (!e.ctrlKey) return;
  if (e.key === 'ArrowLeft') go(-1);
  else if (e.key === 'ArrowRight') go(1);
});
$('cl-agenda').addEventListener('change', function(e){
  var s = e.target.closest('[data-remind]'); if (!s || s.value === '') return;
  post('/api/calendar/remind', { eventId: s.getAttribute('data-remind'), calendarId: s.getAttribute('data-cal') || null, minutes: +s.value }).then(function(res){
    s.value = '';
    if (!res.ok) { showToast(res.d.error || 'Could not set that reminder', 'bad'); return; }
    showToast('Reminder set for ' + new Date(res.d.reminder.at).toLocaleString([], { weekday:'short', hour:'numeric', minute:'2-digit' }), 'ok');
    loadMonth();
  });
});

if (Q.get('connected')) showToast('Google Calendar connected', 'ok');
if (Q.get('gerr')) showToast(Q.get('gerr'), 'bad');
if (Q.get('connected') || Q.get('gerr')) history.replaceState(null, '', '/calendar');

try {
  var es = new EventSource('/api/events');
  es.addEventListener('reminders_changed', function(){ loadMonth(); });
  es.addEventListener('calendar_changed', function(){ refreshAll(); });
} catch(e){}

refreshAll();
setInterval(function(){ if (ST && ST.connected) renderConn(); }, 60000);
</script></body></html>`;
}

module.exports = { calendarHtml };
