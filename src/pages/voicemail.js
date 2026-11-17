const { BASE_CSS, FAVICON, FONT, NAV_CSS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");

// ─── VOICEMAIL ───────────────────────────────────────────────────────────────
// Messages left on the Twilio number. The server polls Twilio for them
// (src/domains/voicemail.js); this page lists and plays the local copies and
// redraws whenever a 'voicemail_changed' event arrives.
function voicemailHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open HL · Voicemail</title>${FONT}${FAVICON}
<style>
${BASE_CSS}${NAV_CSS}${TOAST_CSS}
.vm-page{max-width:860px;}
.vm-tools{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
.vm-status{color:var(--muted);font-size:13px;}
.vm-status.bad{color:var(--fault);}
.vm-note{margin-bottom:16px;display:flex;align-items:center;gap:12px;padding:12px 16px;flex-wrap:wrap;color:var(--text-2);line-height:1.55;}
.vm-note i{color:var(--accent);}
.vm-note button{margin-left:auto;}
.vm-note code{font-size:13px;background:var(--raised);border:1px solid var(--line);border-radius:4px;padding:1px 5px;}
.vm-item{display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border-top:1px solid var(--line);}
.vm-dot{flex:0 0 auto;width:8px;height:8px;border-radius:50%;margin-top:7px;background:transparent;}
.vm-item.new .vm-dot{background:var(--accent);}
.vm-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;}
.vm-t{font-weight:600;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.vm-item:not(.new) .vm-t{font-weight:500;color:var(--text-2);}
.vm-new{font-size:11px;font-weight:600;padding:1px 7px;border-radius:9px;background:var(--accent-soft);color:var(--accent);}
.vm-s{color:var(--muted);font-size:13px;}
.vm-main audio{width:100%;max-width:420px;height:36px;}
.vm-del{flex:0 0 auto;width:34px;height:34px;border-radius:var(--r-ctl);border:1px solid transparent;background:none;color:var(--muted);}
.vm-del:hover{color:var(--fault);border-color:var(--line);}
.vm-empty{padding:36px 16px;text-align:center;color:var(--muted);border-top:1px solid var(--line);line-height:1.6;}
</style></head><body>
${navBar('/voicemail')}
<main class="m-page vm-page">
  <div class="m-head">
    <div><h1 class="m-title">Voicemail</h1><p class="m-sub">Messages left on your Twilio number. Open HL checks for new ones every minute.</p></div>
    <div class="vm-tools"><span class="vm-status" id="vm-status" aria-live="polite"></span>
      <button class="m-btn" id="vm-poll"><i class="fa-solid fa-rotate"></i>Check now</button></div>
  </div>

  <div class="m-panel vm-note" id="vm-setup" style="display:none">
    <i class="fa-solid fa-circle-info"></i>
    <span>Twilio is not connected. Add <code>TWILIO_ACCOUNT_SID</code>, <code>TWILIO_AUTH_TOKEN</code> and <code>TWILIO_NUMBER</code> to Open HL's <code>.env</code>, then restart Open HL.</span>
  </div>
  <div class="m-panel vm-note" id="vm-perm" style="display:none">
    <i class="fa-regular fa-bell"></i>
    <span>Allow notifications so a new voicemail reaches you while Open HL is in a background tab.</span>
    <button class="m-btn" id="vm-perm-btn">Allow notifications</button>
  </div>

  <section class="m-panel" aria-labelledby="vm-h">
    <div class="m-panel-h"><h2 class="m-panel-t" id="vm-h">Inbox</h2><span class="m-panel-meta" id="vm-count"></span></div>
    <div id="vm-list"><div class="vm-empty">Loading voicemail&hellip;</div></div>
  </section>
</main>
<div class="toast" id="toast"></div>
<script>
${TOAST_JS}

var VM = { items: [], status: {}, configured: true };
function $(id){ return document.getElementById(id); }

// +13135551234 -> (313) 555-1234; anything else is shown as Twilio gave it.
function fmtNum(n){
  n = String(n || '');
  if (n.length === 12 && n.slice(0, 2) === '+1') return '(' + n.slice(2, 5) + ') ' + n.slice(5, 8) + '-' + n.slice(8);
  return n || 'Unknown caller';
}
function fmtWhen(ms){
  var d = new Date(ms), n = new Date();
  var t = d.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
  if (d.toDateString() === n.toDateString()) return 'Today ' + t;
  if (d.toDateString() === new Date(n.getTime() - 86400000).toDateString()) return 'Yesterday ' + t;
  return d.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' }) + ' ' + t;
}
function fmtDur(s){ s = Math.round(s || 0); return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + (s % 60) + ' s'; }

function paintStatus(){
  var st = VM.status || {}, el = $('vm-status');
  $('vm-setup').style.display = VM.configured ? 'none' : '';
  $('vm-poll').disabled = !VM.configured;
  el.classList.toggle('bad', st.ok === false);
  el.textContent = !VM.configured ? '' : st.ok === false ? 'Last check failed: ' + st.error
    : st.lastPoll ? 'Checked ' + timeAgo(st.lastPoll) : 'Waiting for the first check';
}

function render(){
  paintStatus();
  var list = $('vm-list'), items = VM.items, unheard = items.filter(function(v){ return !v.heardAt; }).length;
  $('vm-count').textContent = items.length ? (unheard ? unheard + ' new of ' + items.length : items.length + ' total') : '';
  if (!items.length) {
    list.innerHTML = '<div class="vm-empty">No voicemail yet. When a caller leaves a message it shows up here.</div>';
    return;
  }
  // Leave a row that is playing alone, so a redraw never cuts off the audio.
  var playing = {};
  list.querySelectorAll('audio').forEach(function(a){ if (!a.paused) playing[a.closest('.vm-item').dataset.sid] = a.closest('.vm-item'); });
  list.innerHTML = '';
  items.forEach(function(v){
    if (playing[v.sid]) { playing[v.sid].classList.toggle('new', !v.heardAt); list.appendChild(playing[v.sid]); return; }
    var row = document.createElement('div');
    row.className = 'vm-item' + (v.heardAt ? '' : ' new');
    row.dataset.sid = v.sid;
    row.innerHTML = '<span class="vm-dot"></span><div class="vm-main">' +
      '<div class="vm-t">' + esc(fmtNum(v.from)) + (v.heardAt ? '' : '<span class="vm-new">New</span>') + '</div>' +
      '<div class="vm-s">' + esc(fmtWhen(v.at)) + ' &middot; ' + esc(fmtDur(v.duration)) + '</div>' +
      '<audio controls preload="none" src="/api/voicemail/' + encodeURIComponent(v.sid) + '/audio"></audio></div>' +
      '<button class="vm-del" title="Delete this voicemail" aria-label="Delete voicemail from ' + esc(fmtNum(v.from)) + '"><i class="fa-regular fa-trash-can"></i></button>';
    row.querySelector('audio').addEventListener('play', function(){ markHeard(v); });
    row.querySelector('.vm-del').addEventListener('click', function(){ del(v); });
    list.appendChild(row);
  });
}

function load(){
  return fetch('/api/voicemail').then(function(r){ return r.json(); })
    .then(function(d){ VM = d; render(); })
    .catch(function(){ $('vm-status').textContent = 'Could not reach Open HL'; });
}
function markHeard(v){
  if (v.heardAt) return;
  v.heardAt = Date.now();
  fetch('/api/voicemail/' + encodeURIComponent(v.sid) + '/heard', { method:'POST' })
    .then(function(){ if (window.openhlPulse) window.openhlPulse.refresh(); }).catch(function(){});
}
function del(v){
  if (!confirm('Delete the voicemail from ' + fmtNum(v.from) + '? It stays in your Twilio account.')) return;
  fetch('/api/voicemail/' + encodeURIComponent(v.sid), { method:'DELETE' })
    .then(function(r){ if (!r.ok) throw 0; showToast('Voicemail deleted'); return load(); })
    .then(function(){ if (window.openhlPulse) window.openhlPulse.refresh(); })
    .catch(function(){ showToast('Could not delete it', 'bad'); });
}

$('vm-poll').addEventListener('click', function(){
  var b = this; b.disabled = true;
  fetch('/api/voicemail/poll', { method:'POST' }).then(function(r){ return r.json(); })
    .then(function(d){ VM = d; render(); showToast(d.status.ok === false ? 'Twilio check failed' : 'Checked Twilio', d.status.ok === false ? 'bad' : 'ok'); })
    .catch(function(){ showToast('Could not reach Open HL', 'bad'); })
    .then(function(){ b.disabled = !VM.configured; });
});

if ('Notification' in window && Notification.permission === 'default') {
  $('vm-perm').style.display = '';
  $('vm-perm-btn').addEventListener('click', function(){
    Notification.requestPermission().then(function(){ $('vm-perm').style.display = 'none'; });
  });
}

try {
  var es = openhlEvents();
  es.addEventListener('voicemail_changed', function(e){
    var d = {}; try { d = JSON.parse(e.data); } catch(x){}
    if (d.added) showToast(d.added === 1 ? 'New voicemail' : d.added + ' new voicemails', 'info');
    load();
  });
} catch(e){}
document.addEventListener('visibilitychange', function(){ if (!document.hidden) load(); });
setInterval(function(){ if (!document.hidden) load(); }, 60000);
load();
</script>
</body></html>`;
}

module.exports = { voicemailHtml };
