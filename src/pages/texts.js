const { BASE_CSS, FAVICON, FONT, NAV_CSS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");

// ─── TEXTS ───────────────────────────────────────────────────────────────────
// Text messages sent to the Twilio number. The server polls Twilio for them
// (src/domains/texts.js); this page shows them newest first. Whatever is unread
// when the page opens is highlighted for that visit and then marked read.
function textsHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open HL · Texts</title>${FONT}${FAVICON}
<style>
${BASE_CSS}${NAV_CSS}${TOAST_CSS}
.tx-page{max-width:860px;}
.tx-tools{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
.tx-status{color:var(--muted);font-size:13px;}
.tx-status.bad{color:var(--fault);}
.tx-note{margin-bottom:16px;display:flex;align-items:center;gap:12px;padding:12px 16px;flex-wrap:wrap;color:var(--text-2);line-height:1.55;}
.tx-note i{color:var(--accent);}
.tx-note button{margin-left:auto;}
.tx-note code{font-size:13px;background:var(--raised);border:1px solid var(--line);border-radius:4px;padding:1px 5px;}
.tx-item{display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border-top:1px solid var(--line);}
.tx-dot{flex:0 0 auto;width:8px;height:8px;border-radius:50%;margin-top:7px;background:transparent;}
.tx-item.new .tx-dot{background:var(--accent);}
.tx-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;}
.tx-t{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;}
.tx-from{font-weight:600;}
.tx-when{color:var(--muted);font-size:13px;}
.tx-new{font-size:11px;font-weight:600;padding:1px 7px;border-radius:9px;background:var(--accent-soft);color:var(--accent);}
.tx-body{white-space:pre-wrap;word-break:break-word;line-height:1.5;}
.tx-media{color:var(--muted);font-size:13px;}
.tx-del{flex:0 0 auto;width:34px;height:34px;border-radius:var(--r-ctl);border:1px solid transparent;background:none;color:var(--muted);}
.tx-del:hover{color:var(--fault);border-color:var(--line);}
.tx-empty{padding:36px 16px;text-align:center;color:var(--muted);border-top:1px solid var(--line);line-height:1.6;}
</style></head><body>
${navBar('/texts')}
<main class="m-page tx-page">
  <div class="m-head">
    <div><h1 class="m-title">Texts</h1><p class="m-sub">Text messages sent to your Twilio number. Open HL checks for new ones every minute.</p></div>
    <div class="tx-tools"><span class="tx-status" id="tx-status" aria-live="polite"></span>
      <button class="m-btn" id="tx-poll"><i class="fa-solid fa-rotate"></i>Check now</button></div>
  </div>

  <div class="m-panel tx-note" id="tx-setup" style="display:none">
    <i class="fa-solid fa-circle-info"></i>
    <span>Twilio is not connected. Add <code>TWILIO_ACCOUNT_SID</code>, <code>TWILIO_AUTH_TOKEN</code> and <code>TWILIO_NUMBER</code> to Open HL's <code>.env</code>, then restart Open HL.</span>
  </div>
  <div class="m-panel tx-note" id="tx-perm" style="display:none">
    <i class="fa-regular fa-bell"></i>
    <span>Allow notifications so a new text reaches you while Open HL is in a background tab.</span>
    <button class="m-btn" id="tx-perm-btn">Allow notifications</button>
  </div>

  <section class="m-panel" aria-labelledby="tx-h">
    <div class="m-panel-h"><h2 class="m-panel-t" id="tx-h">Inbox</h2><span class="m-panel-meta" id="tx-count"></span></div>
    <div id="tx-list"><div class="tx-empty">Loading texts&hellip;</div></div>
  </section>
</main>
<div class="toast" id="toast"></div>
<script>
${TOAST_JS}

var TX = { items: [], status: {}, configured: true };
var fresh = {};   // unread when seen on this visit; stays highlighted until reload
function $(id){ return document.getElementById(id); }

// +13135551234 -> (313) 555-1234; anything else is shown as Twilio gave it.
function fmtNum(n){
  n = String(n || '');
  if (n.length === 12 && n.slice(0, 2) === '+1') return '(' + n.slice(2, 5) + ') ' + n.slice(5, 8) + '-' + n.slice(8);
  return n || 'Unknown sender';
}
function fmtWhen(ms){
  var d = new Date(ms), n = new Date();
  var t = d.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
  if (d.toDateString() === n.toDateString()) return 'Today ' + t;
  if (d.toDateString() === new Date(n.getTime() - 86400000).toDateString()) return 'Yesterday ' + t;
  return d.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' }) + ' ' + t;
}

function paintStatus(){
  var st = TX.status || {}, el = $('tx-status');
  $('tx-setup').style.display = TX.configured ? 'none' : '';
  $('tx-poll').disabled = !TX.configured;
  el.classList.toggle('bad', st.ok === false);
  el.textContent = !TX.configured ? '' : st.ok === false ? 'Last check failed: ' + st.error
    : st.lastPoll ? 'Checked ' + timeAgo(st.lastPoll) : 'Waiting for the first check';
}

function render(){
  paintStatus();
  var list = $('tx-list'), items = TX.items;
  var n = Object.keys(fresh).length;
  $('tx-count').textContent = items.length ? (n ? n + ' new of ' + items.length : items.length + ' total') : '';
  if (!items.length) {
    list.innerHTML = '<div class="tx-empty">No texts yet. When someone texts your Twilio number it shows up here.</div>';
    return;
  }
  list.innerHTML = '';
  items.forEach(function(t){
    var row = document.createElement('div');
    row.className = 'tx-item' + (fresh[t.sid] ? ' new' : '');
    var media = t.media ? '<div class="tx-media"><i class="fa-regular fa-image"></i> ' + t.media + ' attachment' + (t.media > 1 ? 's' : '') + ', open it in the Twilio Console</div>' : '';
    row.innerHTML = '<span class="tx-dot"></span><div class="tx-main">' +
      '<div class="tx-t"><span class="tx-from">' + esc(fmtNum(t.from)) + '</span><span class="tx-when">' + esc(fmtWhen(t.at)) + '</span>' +
      (fresh[t.sid] ? '<span class="tx-new">New</span>' : '') + '</div>' +
      (t.body ? '<div class="tx-body">' + esc(t.body) + '</div>' : '') + media + '</div>' +
      '<button class="tx-del" title="Delete this text" aria-label="Delete text from ' + esc(fmtNum(t.from)) + '"><i class="fa-regular fa-trash-can"></i></button>';
    row.querySelector('.tx-del').addEventListener('click', function(){ del(t); });
    list.appendChild(row);
  });
}

// Anything unread is highlighted for this visit, then marked read on the
// server so the sidebar count clears, but only while the page is in view.
function markRead(){
  var any = false;
  TX.items.forEach(function(t){ if (!t.readAt) { fresh[t.sid] = true; t.readAt = Date.now(); any = true; } });
  if (!any || document.hidden) return any;
  fetch('/api/texts/read', { method:'POST' })
    .then(function(){ if (window.openhlPulse) window.openhlPulse.refresh(); }).catch(function(){});
  return any;
}
function load(){
  return fetch('/api/texts').then(function(r){ return r.json(); })
    .then(function(d){ TX = d; if (!document.hidden) markRead(); render(); })
    .catch(function(){ $('tx-status').textContent = 'Could not reach Open HL'; });
}
function del(t){
  if (!confirm('Delete the text from ' + fmtNum(t.from) + '? It stays in your Twilio account.')) return;
  fetch('/api/texts/' + encodeURIComponent(t.sid), { method:'DELETE' })
    .then(function(r){ if (!r.ok) throw 0; delete fresh[t.sid]; showToast('Text deleted'); return load(); })
    .catch(function(){ showToast('Could not delete it', 'bad'); });
}

$('tx-poll').addEventListener('click', function(){
  var b = this; b.disabled = true;
  fetch('/api/texts/poll', { method:'POST' }).then(function(r){ return r.json(); })
    .then(function(d){ TX = d; markRead(); render(); showToast(d.status.ok === false ? 'Twilio check failed' : 'Checked Twilio', d.status.ok === false ? 'bad' : 'ok'); })
    .catch(function(){ showToast('Could not reach Open HL', 'bad'); })
    .then(function(){ b.disabled = !TX.configured; });
});

if ('Notification' in window && Notification.permission === 'default') {
  $('tx-perm').style.display = '';
  $('tx-perm-btn').addEventListener('click', function(){
    Notification.requestPermission().then(function(){ $('tx-perm').style.display = 'none'; });
  });
}

try {
  var es = openhlEvents();
  es.addEventListener('texts_changed', function(e){
    var d = {}; try { d = JSON.parse(e.data); } catch(x){}
    if (d.added) showToast(d.added === 1 ? 'New text' : d.added + ' new texts', 'info');
    load();
  });
} catch(e){}
document.addEventListener('visibilitychange', function(){ if (!document.hidden) load(); });
setInterval(function(){ if (!document.hidden) load(); }, 60000);
load();
</script>
</body></html>`;
}

module.exports = { textsHtml };
