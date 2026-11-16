const { BASE_CSS, FAVICON, FONT, NAV_CSS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");

function remindersHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open HL · Reminders</title>${FONT}${FAVICON}
<style>
${BASE_CSS}${NAV_CSS}${TOAST_CSS}
.rm-page{max-width:1180px;}
.rm-clock{color:var(--muted);font-variant-numeric:tabular-nums;}
.rm-layout{display:grid;grid-template-columns:340px minmax(0,1fr);gap:16px;align-items:start;}
.rm-form{position:sticky;top:calc(var(--pulse-h) + 16px);}
.rm-form .m-panel-b{display:flex;flex-direction:column;gap:14px;}
.rm-field{display:flex;flex-direction:column;}
.rm-lbl{display:block;font-size:13px;font-weight:500;color:var(--text-2);margin-bottom:6px;}
.rm-lbl em{font-style:normal;color:var(--muted);font-weight:400;}
.rm-in,.rm-sel,.rm-ta{width:100%;height:36px;background:var(--field);border:1px solid var(--line);border-radius:var(--r-ctl);padding:0 12px;color:var(--text);outline:none;}
.rm-ta{height:auto;padding:9px 12px;resize:vertical;min-height:64px;line-height:1.5;}
.rm-in:focus,.rm-sel:focus,.rm-ta:focus{border-color:var(--accent);}
.rm-row{display:flex;gap:8px;}
.rm-row>*{flex:1;min-width:0;}
.rm-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
.rm-chip{height:28px;padding:0 10px;border-radius:14px;border:1px solid var(--line);background:var(--raised);color:var(--text-2);font-size:13px;}
.rm-chip:hover{border-color:var(--accent);color:var(--text);}
.rm-btn{height:36px;border:1px solid var(--accent);border-radius:var(--r-ctl);background:var(--accent);color:var(--accent-ink);font-weight:500;}
.rm-btn:hover{filter:brightness(1.08);}
.rm-btn.ghost{background:transparent;color:var(--text-2);border-color:var(--line);}
.rm-play{flex:0 0 auto!important;width:36px;background:var(--raised);border:1px solid var(--line);border-radius:var(--r-ctl);color:var(--text-2);}
.rm-play:hover{color:var(--accent);border-color:var(--accent);}
.rm-list{min-width:0;}
.rm-item{display:flex;gap:12px;align-items:flex-start;padding:12px 16px;border-top:1px solid var(--line);}
.rm-dot{flex:0 0 auto;width:8px;height:8px;border-radius:50%;margin-top:7px;background:var(--muted);}
.rm-item.on .rm-dot{background:var(--ok);}
.rm-item.soon .rm-dot{background:var(--warn);}
.rm-item.snoozed .rm-dot{background:var(--accent);}
.rm-item.ringing{background:color-mix(in srgb,var(--fault) 8%,transparent);}
.rm-item.ringing .rm-dot{background:var(--fault);animation:rm-pulse 1s ease-in-out infinite;}
@keyframes rm-pulse{50%{opacity:.3;}}
.rm-body{flex:1;min-width:0;}
.rm-t{font-weight:600;display:flex;align-items:center;gap:8px;flex-wrap:wrap;word-break:break-word;}
.rm-item.off .rm-t{color:var(--muted);font-weight:500;}
.rm-tag{font-size:12px;font-weight:500;padding:2px 8px;border-radius:99px;background:var(--raised);color:var(--text-2);border:1px solid var(--line);}
.rm-tag.hot{color:var(--fault);border-color:color-mix(in srgb,var(--fault) 45%,var(--line));}
.rm-n{color:var(--muted);line-height:1.5;margin-top:3px;white-space:pre-wrap;word-break:break-word;}
.rm-meta{font-size:13px;color:var(--muted);margin-top:4px;display:flex;gap:12px;flex-wrap:wrap;}
.rm-meta b{color:var(--text-2);font-weight:500;}
.rm-acts{flex:0 0 auto;display:flex;gap:2px;}
.rm-a{width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:var(--r-ctl);border:1px solid transparent;background:none;color:var(--muted);}
.rm-a:hover{background:var(--raised);border-color:var(--line);color:var(--text);}
.rm-a.del:hover{color:var(--fault);}
.rm-empty{padding:36px 16px;text-align:center;color:var(--muted);border-top:1px solid var(--line);line-height:1.6;}
.rm-perm{margin-bottom:16px;display:flex;align-items:center;gap:12px;padding:12px 16px;flex-wrap:wrap;color:var(--text-2);}
.rm-perm i{color:var(--accent);}
.rm-perm button{margin-left:auto;}
@media(max-width:860px){.rm-layout{grid-template-columns:1fr;}.rm-form{position:static;}}
</style></head><body>
${navBar('/reminders')}
<main class="m-page rm-page">
  <div class="m-head">
    <div><h1 class="m-title">Reminders</h1><p class="m-sub">Alarms ring on whichever Open HL page you have open.</p></div>
    <div style="display:flex;align-items:center;gap:14px"><div class="rm-clock" id="rm-clock" aria-live="off"></div>
      <a class="m-btn" href="/calendar"><i class="fa-regular fa-calendar"></i>Calendar</a></div>
  </div>

  <div class="m-panel rm-perm" id="rm-perm" style="display:none">
    <i class="fa-regular fa-bell"></i>
    <span>Allow notifications so alarms reach you even when Open HL is in a background tab.</span>
    <button class="m-btn" id="rm-perm-btn">Allow notifications</button>
  </div>

  <div class="rm-layout">
    <section class="m-panel rm-form" aria-labelledby="rm-mode">
      <div class="m-panel-h"><h2 class="m-panel-t" id="rm-mode">New reminder</h2></div>
      <div class="m-panel-b">
        <div class="rm-field"><label class="rm-lbl" for="rm-title">Title</label>
          <input class="rm-in" id="rm-title" maxlength="200" placeholder="Take the bread out"></div>
        <div class="rm-field"><label class="rm-lbl" for="rm-note">Note <em>optional</em></label>
          <textarea class="rm-ta" id="rm-note" maxlength="2000" placeholder="Shown when the alarm rings"></textarea></div>
        <div class="rm-field"><label class="rm-lbl" for="rm-when">When</label>
          <input class="rm-in" id="rm-when" type="datetime-local">
          <div class="rm-chips">
            <button class="rm-chip" data-in="15">In 15 min</button>
            <button class="rm-chip" data-in="30">In 30 min</button>
            <button class="rm-chip" data-in="60">In 1 hour</button>
            <button class="rm-chip" data-in="180">In 3 hours</button>
            <button class="rm-chip" data-at="tonight">Tonight 8 PM</button>
            <button class="rm-chip" data-at="tomorrow">Tomorrow 9 AM</button>
          </div></div>
        <div class="rm-field"><label class="rm-lbl" for="rm-repeat">Repeat</label>
          <select class="rm-sel" id="rm-repeat">
            <option value="none">Once</option>
            <option value="daily">Every day</option>
            <option value="weekdays">Weekdays, Monday to Friday</option>
            <option value="weekly">Every week</option>
          </select></div>
        <div class="rm-field"><label class="rm-lbl" for="rm-sound">Alarm sound</label>
          <div class="rm-row">
            <select class="rm-sel" id="rm-sound">
              <option value="chime">Chime</option>
              <option value="bell">Bell</option>
              <option value="alarm">Alarm</option>
              <option value="pulse">Pulse</option>
            </select>
            <button class="rm-play" id="rm-preview" title="Play this sound" aria-label="Play this sound"><i class="fa-solid fa-play"></i></button>
          </div></div>
        <button class="rm-btn" id="rm-save">Set reminder</button>
        <button class="rm-btn ghost" id="rm-cancel" style="display:none">Cancel editing</button>
      </div>
    </section>

    <section class="m-panel rm-list" aria-labelledby="rm-sched">
      <div class="m-panel-h"><h2 class="m-panel-t" id="rm-sched">Scheduled</h2><span class="m-panel-meta" id="rm-count"></span></div>
      <div id="rm-list"><div class="rm-empty">Loading reminders&hellip;</div></div>
    </section>
  </div>
</main>
<div class="toast" id="toast"></div>
<script>
${TOAST_JS}

var REM = [], RING = {}, editing = null;
function $(id){ return document.getElementById(id); }
function esc(s){ var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
function pad(n){ return (n < 10 ? '0' : '') + n; }

// ── time formatting ─────────────────────────────────────────────────────────
function toInput(ms){
  var d = new Date(ms);
  return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) +
         'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function fmtAbs(ms){
  var d = new Date(ms), n = new Date();
  var t = d.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
  if (d.toDateString() === n.toDateString()) return 'Today ' + t;
  var tm = new Date(n.getTime() + 86400000);
  if (d.toDateString() === tm.toDateString()) return 'Tomorrow ' + t;
  return d.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' }) + ' ' + t;
}
function rel(ms, now){
  var diff = ms - now, past = diff < 0; diff = Math.abs(diff);
  var s = Math.round(diff/1000);
  if (s < 60)  return past ? s + 's ago'  : 'in ' + s + 's';
  var m = Math.round(s/60);
  if (m < 60)  return past ? m + 'm ago'  : 'in ' + m + 'm';
  var h = Math.floor(m/60), r = m % 60;
  if (h < 24)  return past ? h + 'h ago'  : 'in ' + h + 'h' + (r ? ' ' + r + 'm' : '');
  var dd = Math.round(h/24);
  return past ? dd + 'd ago' : 'in ' + dd + 'd';
}
var REPEAT_LABEL = { none:'', daily:'daily', weekdays:'weekdays', weekly:'weekly' };
function dueOf(r){ return r.snoozeUntil || r.at; }

// ── render ──────────────────────────────────────────────────────────────────
function render(){
  var now = Date.now();
  var list = $('rm-list');
  var rows = REM.slice().sort(function(a,b){
    if (!!a.enabled !== !!b.enabled) return a.enabled ? -1 : 1;
    return dueOf(a) - dueOf(b);
  });
  var live = rows.filter(function(r){ return r.enabled; }).length;
  $('rm-count').textContent = rows.length ? live + ' on, ' + rows.length + ' total' : '';

  if (!rows.length) {
    list.innerHTML = '<div class="rm-empty">Nothing scheduled.<br>Set a reminder and it will ring on any Open HL page.</div>';
    return;
  }

  list.innerHTML = rows.map(function(r){
    var due = dueOf(r), state, note;
    if (RING[r.id])                    { state = 'ringing'; note = 'ringing now'; }
    else if (!r.enabled)               { state = 'off';     note = r.missedAt ? 'missed' : 'off'; }
    else if (r.snoozeUntil)            { state = 'snoozed'; note = 'snoozed'; }
    else if (due - now < 3600000)      { state = 'soon';    note = ''; }
    else                               { state = 'on';      note = ''; }

    var tags = '';
    if (REPEAT_LABEL[r.repeat]) tags += '<span class="rm-tag">' + REPEAT_LABEL[r.repeat] + '</span>';
    if (note) tags += '<span class="rm-tag' + (state === 'ringing' ? ' hot' : '') + '">' + note + '</span>';

    return '<div class="rm-item ' + state + '" data-id="' + esc(r.id) + '">' +
      '<div class="rm-dot"></div>' +
      '<div class="rm-body">' +
        '<div class="rm-t">' + esc(r.title) + tags + '</div>' +
        (r.note ? '<div class="rm-n">' + esc(r.note) + '</div>' : '') +
        '<div class="rm-meta"><b>' + esc(fmtAbs(due)) + '</b>' +
          (r.enabled ? '<span data-cd="' + due + '">' + rel(due, now) + '</span>' : '') +
          '<span>' + esc(r.sound) + '</span>' +
          (r.gcalId ? '<span title="Synced to Google Calendar"><i class="fa-brands fa-google"></i></span>' : '') + '</div>' +
      '</div>' +
      '<div class="rm-acts">' +
        '<button class="rm-a" data-a="cal" title="Show in calendar" aria-label="Show in calendar"><i class="fa-regular fa-calendar"></i></button>' +
        '<button class="rm-a" data-a="test" title="Play sound" aria-label="Play sound"><i class="fa-solid fa-volume-high"></i></button>' +
        '<button class="rm-a" data-a="edit" title="Edit" aria-label="Edit"><i class="fa-solid fa-pen"></i></button>' +
        '<button class="rm-a" data-a="toggle" title="' + (r.enabled ? 'Turn off' : 'Turn on') + '">' +
          (r.enabled ? '<i class="fa-solid fa-toggle-on" style="color:var(--ok)"></i>' : '<i class="fa-solid fa-toggle-off"></i>') + '</button>' +
        '<button class="rm-a del" data-a="del" title="Delete" aria-label="Delete"><i class="fa-solid fa-trash"></i></button>' +
      '</div></div>';
  }).join('');
}

// Only the countdowns move between reloads, so tick those in place rather than
// re-rendering the whole list every second and stomping on any open menu.
function tickCountdowns(){
  var now = Date.now();
  var els = document.querySelectorAll('[data-cd]');
  for (var i = 0; i < els.length; i++) els[i].textContent = rel(Number(els[i].getAttribute('data-cd')), now);
  $('rm-clock').textContent = new Date().toLocaleTimeString([], { hour:'numeric', minute:'2-digit', second:'2-digit' });
}

// ── data ────────────────────────────────────────────────────────────────────
function load(){
  return fetch('/api/reminders').then(function(r){ return r.json(); }).then(function(d){
    REM = d.reminders || [];
    RING = {};
    (d.ringing || []).forEach(function(r){ RING[r.id] = 1; });
    render();
  }).catch(function(){ showToast('Could not load reminders', 'bad'); });
}
function post(url, body){
  return fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body || {}) })
    .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, d: d }; }); });
}

// ── form ────────────────────────────────────────────────────────────────────
function resetForm(){
  editing = null;
  $('rm-title').value = ''; $('rm-note').value = '';
  $('rm-repeat').value = 'none'; $('rm-sound').value = 'chime';
  setWhenIn(15);
  $('rm-mode').textContent = 'New reminder';
  $('rm-save').textContent = 'Set reminder';
  $('rm-cancel').style.display = 'none';
}
function setWhenIn(mins){ $('rm-when').value = toInput(Date.now() + mins * 60000); }
function setWhenAt(which){
  var d = new Date();
  if (which === 'tonight') { d.setHours(20, 0, 0, 0); if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1); }
  else { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
  $('rm-when').value = toInput(d.getTime());
}
function startEdit(r){
  editing = r.id;
  $('rm-title').value = r.title || '';
  $('rm-note').value = r.note || '';
  $('rm-when').value = toInput(r.at);
  $('rm-repeat').value = r.repeat || 'none';
  $('rm-sound').value = r.sound || 'chime';
  $('rm-mode').textContent = 'Editing reminder';
  $('rm-save').textContent = 'Save changes';
  $('rm-cancel').style.display = '';
  $('rm-title').focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function save(){
  var when = $('rm-when').value;
  var at = when ? new Date(when).getTime() : NaN;
  var body = {
    title:  $('rm-title').value,
    note:   $('rm-note').value,
    at:     at,
    repeat: $('rm-repeat').value,
    sound:  $('rm-sound').value
  };
  if (!body.title.trim()) { showToast('Give it a title', 'bad'); $('rm-title').focus(); return; }
  if (!isFinite(at))      { showToast('Pick a date and time', 'bad'); $('rm-when').focus(); return; }
  if (editing) body.id = editing;
  post(editing ? '/api/reminders/update' : '/api/reminders', body).then(function(res){
    if (!res.ok) { showToast(res.d.error || 'Could not save', 'bad'); return; }
    showToast(editing ? 'Reminder updated' : 'Reminder set for ' + fmtAbs(res.d.reminder.at), 'ok');
    resetForm();
    load();
  }).catch(function(){ showToast('Could not save', 'bad'); });
}

// ── wiring ──────────────────────────────────────────────────────────────────
$('rm-save').addEventListener('click', save);
$('rm-cancel').addEventListener('click', resetForm);
$('rm-title').addEventListener('keydown', function(e){ if (e.key === 'Enter') save(); });
$('rm-preview').addEventListener('click', function(){
  if (window.__openhlPreviewSound) window.__openhlPreviewSound($('rm-sound').value);
});
document.querySelector('.rm-chips').addEventListener('click', function(e){
  var b = e.target.closest('.rm-chip'); if (!b) return;
  if (b.hasAttribute('data-in')) setWhenIn(parseInt(b.getAttribute('data-in'), 10));
  else setWhenAt(b.getAttribute('data-at'));
});
$('rm-list').addEventListener('click', function(e){
  var btn = e.target.closest('[data-a]'); if (!btn) return;
  var id = e.target.closest('.rm-item').getAttribute('data-id');
  var r  = REM.filter(function(x){ return x.id === id; })[0];
  if (!r) return;
  var a = btn.getAttribute('data-a');
  if (a === 'cal')    {
    var d = new Date(dueOf(r));
    location.href = '/calendar?date=' + d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + '&focus=' + encodeURIComponent(r.id);
    return;
  }
  if (a === 'test')   { if (window.__openhlPreviewSound) window.__openhlPreviewSound(r.sound); return; }
  if (a === 'edit')   { startEdit(r); return; }
  if (a === 'toggle') {
    post('/api/reminders/toggle', { id: id }).then(function(res){
      if (!res.ok) showToast(res.d.error || 'Could not change that', 'bad');
      load();
    });
    return;
  }
  if (a === 'del') {
    if (!confirm('Delete "' + r.title + '"?')) return;
    post('/api/reminders/delete', { id: id }).then(function(){ showToast('Deleted', 'ok'); load(); });
  }
});

// Notification permission — only ask once the page is actually in use.
(function(){
  if (!('Notification' in window) || Notification.permission !== 'default') return;
  $('rm-perm').style.display = 'flex';
  $('rm-perm-btn').addEventListener('click', function(){
    Notification.requestPermission().then(function(p){
      $('rm-perm').style.display = 'none';
      showToast(p === 'granted' ? 'Notifications on' : 'Notifications blocked', p === 'granted' ? 'ok' : 'bad');
    });
  });
})();

// The list has to follow what the alarm layer and the server tick are doing —
// a reminder that fires or gets snoozed in another tab should show up here.
try {
  var es = new EventSource('/api/events');
  es.addEventListener('reminders_changed', function(){ load(); });
  es.addEventListener('reminder_fire',     function(){ load(); });
  es.addEventListener('reminder_clear',    function(){ load(); });
} catch(e){}

// Links in from the calendar: ?edit=<id> opens that reminder in the form,
// ?at=<ms> starts a new one at that time.
resetForm();
(function(){
  var q = new URLSearchParams(location.search), at = Number(q.get('at'));
  if (q.get('at') && isFinite(at) && at > 0) $('rm-when').value = toInput(at);
  if (q.get('edit') || q.get('at')) history.replaceState(null, '', '/reminders');
  load().then(function(){
    var r = REM.filter(function(x){ return x.id === q.get('edit'); })[0];
    if (r) startEdit(r);
  });
})();
tickCountdowns();
setInterval(tickCountdowns, 1000);
setInterval(load, 60000);
</script></body></html>`;
}


// ─── MONITORING PAGE ───────────────────────────────────────────────────────────
// Command-deck dashboard: KPI strip, node roster, live topology map, activity
// chart, host gauges, retained event log, check queue, subsystem health, and the
// alert-channel config. Every figure is real — nothing on this page is mocked.

module.exports = { remindersHtml };
