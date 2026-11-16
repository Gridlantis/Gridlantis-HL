const { BASE_CSS, FAVICON, FONT, GAMEPAD_JS, NAV_CSS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");

function mailHtml() {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Metis · Mail</title>${FONT}${FAVICON}
<style>
${BASE_CSS}${NAV_CSS}${TOAST_CSS}
.ml-page{max-width:1500px;}
.ml-tabs{display:flex;gap:4px;padding:3px;background:var(--raised);border:1px solid var(--line);border-radius:var(--r-ctl);}
.ml-tab{height:30px;padding:0 12px;border:0;border-radius:4px;background:none;color:var(--text-2);font-weight:500;display:inline-flex;align-items:center;gap:8px;}
.ml-tab:hover{color:var(--text);}
.ml-tab.active{background:var(--surface);color:var(--text);box-shadow:0 0 0 1px var(--line);}
.ml-badge{min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:var(--accent-soft);color:var(--accent);font-size:12px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;}
.ml-status{color:var(--muted);font-size:13px;}
.ml-body{display:grid;grid-template-columns:minmax(320px,420px) minmax(0,1fr);gap:16px;align-items:start;}
.ml-listpanel{position:sticky;top:calc(var(--pulse-h) + 16px);max-height:calc(var(--app-h) - 150px);display:flex;flex-direction:column;}
.ml-list{overflow-y:auto;flex:1;}
.ml-note{color:var(--muted);font-size:13px;line-height:1.5;}
.ml-purge{padding:10px 16px;border-top:1px solid var(--line);}
.ml-msg{display:flex;align-items:flex-start;gap:12px;padding:12px 16px;border-top:1px solid var(--line);cursor:pointer;background:none;}
.ml-msg:hover{background:var(--raised);}
.ml-msg.sel{background:var(--raised);box-shadow:inset 2px 0 0 var(--accent);}
.ml-msg .udot{width:8px;height:8px;border-radius:50%;background:var(--accent);margin-top:7px;flex:0 0 auto;}
.ml-msg.opened .udot{background:transparent;}
.ml-msg .body{flex:1;min-width:0;}
.ml-msg .top{display:flex;gap:8px;align-items:baseline;}
.ml-msg .from{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;}
.ml-msg.opened .from{font-weight:500;color:var(--text-2);}
.ml-msg .when{color:var(--muted);font-size:13px;white-space:nowrap;}
.ml-msg .subj{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-2);}
.ml-msg.opened .subj{color:var(--muted);}
.ml-msg .meta{margin-top:4px;display:flex;gap:6px;}
.ml-star{color:var(--warn);margin-right:6px;}
.ml-empty{color:var(--muted);padding:32px 16px;text-align:center;border-top:1px solid var(--line);}
.ml-reader{min-height:420px;display:flex;flex-direction:column;}
.ml-reader-empty{flex:1;display:grid;place-items:center;color:var(--muted);padding:40px;text-align:center;}
.ml-detail-h{padding:18px 20px 14px;border-bottom:1px solid var(--line);}
.ml-detail-h .s{font:600 22px/1.25 var(--font-display);margin-bottom:6px;overflow-wrap:anywhere;}
.ml-detail-h .f{color:var(--muted);overflow-wrap:anywhere;}
.ml-detail-b{padding:18px 20px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;max-width:78ch;font-size:15px;}
.ml-detail-foot{display:flex;gap:8px;justify-content:flex-end;padding:12px 20px;border-top:1px solid var(--line);margin-top:auto;}
.ml-back{display:none;}
.ml-drawer{position:fixed;top:var(--pulse-h);right:0;bottom:0;width:min(420px,100vw);z-index:70;background:var(--surface);border-left:1px solid var(--line);
  transform:translateX(100%);transition:transform .2s ease;overflow-y:auto;box-shadow:none;}
.ml-drawer.on{transform:none;box-shadow:-20px 0 50px rgba(0,0,0,.35);}
.ml-drawer-h{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--surface);z-index:1;}
.ml-drawer-h b{font:600 18px var(--font-display);}
.ml-sec{padding:16px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:10px;}
.ml-sec h2{font:600 16px var(--font-display);}
.ml-acct{display:flex;align-items:center;gap:10px;padding:8px 0;}
.ml-acct + .ml-acct{border-top:1px solid var(--line);}
.ml-acct .dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto;background:var(--muted);}
.ml-acct .dot.ok{background:var(--ok);} .ml-acct .dot.bad{background:var(--fault);}
.ml-acct .x{margin-left:auto;}
.ml-acct-err{color:var(--fault);font-size:13px;}
@media(max-width:900px){
  .ml-body{grid-template-columns:minmax(0,1fr);}
  .ml-listpanel{position:static;max-height:none;}
  .ml-reader{display:none;}
  .ml-body.reading .ml-listpanel{display:none;}
  .ml-body.reading .ml-reader{display:flex;}
  .ml-back{display:inline-flex;}
}
</style></head><body>
${navBar("/mail")}
<main class="m-page ml-page">
  <div class="m-head">
    <div><h1 class="m-title">Mail</h1><p class="m-sub">Read-only copies of your Gmail inboxes. Gmail itself is never changed.</p></div>
    <div class="m-actions">
      <div class="ml-tabs" role="tablist">
        <button class="ml-tab active" id="tab-all" role="tab" onclick="setBox('all')">Inbox</button>
        <button class="ml-tab" id="tab-important" role="tab" onclick="setBox('important')"><i class="fa-solid fa-star" style="color:var(--warn)"></i>Important <span id="imp-badge" class="ml-badge" style="display:none">0</span></button>
      </div>
      <span class="ml-status" id="ml-status" aria-live="polite"></span>
      <button class="m-btn" onclick="pollNow()"><i class="fa-solid fa-rotate"></i>Check for mail</button>
      <button class="m-btn" onclick="toggleDrawer(true)"><i class="fa-solid fa-sliders"></i>Accounts and rules</button>
    </div>
  </div>
  <div class="ml-body" id="ml-body">
    <section class="m-panel ml-listpanel" aria-label="Messages">
      <div class="ml-list" id="msg-list"><div class="ml-empty">Loading mail&hellip;</div></div>
      <div class="ml-note ml-purge" id="ml-purgenote"></div>
    </section>
    <section class="m-panel ml-reader" id="ml-reader" aria-label="Message">
      <div class="ml-reader-empty" id="ml-reader-empty">Select a message to read it.</div>
      <div id="ml-overlay" style="display:none;flex-direction:column;flex:1">
        <div class="ml-detail-h">
          <button class="m-btn ghost ml-back" onclick="closeDetail()"><i class="fa-solid fa-arrow-left"></i>Back to messages</button>
          <div class="s" id="d-subj"></div><div class="f" id="d-from"></div></div>
        <div class="ml-detail-b" id="d-body">Loading&hellip;</div>
        <div class="ml-detail-foot">
          <button class="m-btn danger" onclick="deleteMsg()"><i class="fa-solid fa-trash"></i>Remove from Metis</button>
        </div>
      </div>
    </section>
  </div>
</main>
<aside class="ml-drawer" id="ml-drawer" aria-label="Accounts and rules">
  <div class="ml-drawer-h"><b>Accounts and rules</b><button class="m-btn ghost icon" onclick="toggleDrawer(false)" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>
  <div class="ml-sec">
    <h2>Accounts</h2>
    <div id="acct-list"><div class="ml-note">No accounts yet.</div></div>
  </div>
  <div class="ml-sec">
    <h2>Add a Gmail account</h2>
    <div><label class="m-label" for="ac-name">Name</label><input class="m-input" id="ac-name" placeholder="Personal"></div>
    <div><label class="m-label" for="ac-email">Email</label><input class="m-input" id="ac-email" placeholder="you@gmail.com" autocapitalize="off" autocorrect="off"></div>
    <div><label class="m-label" for="ac-pass">App password</label><input class="m-input" id="ac-pass" type="password" placeholder="16 characters"></div>
    <button class="m-btn primary" onclick="addAccount()">Connect account</button>
    <div class="ml-note">Needs 2-Step Verification and a Google app password. Metis only reads mail.</div>
  </div>
  <div class="ml-sec">
    <h2>Important mail</h2>
    <div class="ml-note">Mail matching these rules also appears under Important. One rule per line.</div>
    <div><label class="m-label" for="imp-senders">Senders: name, email or domain</label><textarea class="m-input" id="imp-senders" rows="3" placeholder="boss@work.com&#10;bank.com"></textarea></div>
    <div><label class="m-label" for="imp-keywords">Keywords in subject or sender</label><textarea class="m-input" id="imp-keywords" rows="3" placeholder="invoice&#10;urgent"></textarea></div>
    <button class="m-btn" onclick="saveImportant()">Save important rules</button>
  </div>
  <div class="ml-sec">
    <h2>Blocklist</h2>
    <div class="ml-note">Mail from these senders, domains or keywords is skipped. One per line.</div>
    <textarea class="m-input" id="blocklist" rows="4" placeholder="newsletter@example.com&#10;spammydomain.com"></textarea>
    <button class="m-btn" onclick="saveBlocklist()">Save blocklist</button>
  </div>
</aside>
<div class="toast" id="toast"></div>
<script>
${TOAST_JS}
var PURGE_DAYS = 21;
var curDetailId = null;
var curBox = 'all';
function setBox(b){
  curBox = b;
  document.getElementById('tab-all').classList.toggle('active', b==='all');
  document.getElementById('tab-important').classList.toggle('active', b==='important');
  loadMessages();
}

function fmtDate(ms){
  var d = new Date(ms), now = new Date();
  var sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
  return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
function esc(t){ var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d; }

async function loadAccounts(){
  try {
    var data = await fetch('/api/mail/accounts').then(function(r){return r.json();});
    PURGE_DAYS = data.purgeDays || 21;
    document.getElementById('ml-purgenote').textContent = 'Unopened messages leave Metis after ' + PURGE_DAYS + ' days. Opened ones stay until you remove them.';
    var box = document.getElementById('acct-list');
    box.textContent = '';
    if (!data.accounts.length) { var n = document.createElement('div'); n.className='ml-note'; n.textContent='No accounts yet. Add one below.'; box.appendChild(n); }
    data.accounts.forEach(function(a){
      var row = document.createElement('div'); row.className = 'ml-acct';
      var dot = document.createElement('span'); dot.className = 'dot' + (a.status.ok === true ? ' ok' : a.status.ok === false ? ' bad' : '');
      dot.title = a.status.ok === false ? (a.status.error || 'error') : (a.status.ok === true ? 'OK' : 'not polled yet');
      var info = document.createElement('div'); info.style.minWidth='0';
      var nm = document.createElement('div'); nm.style.cssText='font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'; nm.textContent = a.name;
      var em = document.createElement('div'); em.style.cssText='font-size:13px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis'; em.textContent = a.email + ', ' + a.count + ' messages';
      info.appendChild(nm); info.appendChild(em);
      var x = document.createElement('button'); x.className='x m-btn ghost icon'; x.innerHTML='<i class="fa-solid fa-xmark"></i>'; x.title='Remove account'; x.setAttribute('aria-label','Remove ' + a.name); x.onclick=function(){ removeAccount(a.id, a.name); };
      row.appendChild(dot); row.appendChild(info); row.appendChild(x);
      box.appendChild(row);
      if (a.status.ok === false && a.status.error) { var e = document.createElement('div'); e.className='ml-acct-err'; e.textContent = a.status.error; box.appendChild(e); }
    });
    if (Array.isArray(data.blocklist)) document.getElementById('blocklist').value = data.blocklist.join(String.fromCharCode(10));
  } catch(e){}
}

async function loadMessages(){
  try {
    var data = await fetch('/api/mail/messages?box=' + curBox).then(function(r){return r.json();});
    var badge = document.getElementById('imp-badge');
    if (badge) { if (data.importantCount > 0) { badge.style.display=''; badge.textContent = data.importantCount; } else badge.style.display='none'; }
    var box = document.getElementById('msg-list');
    box.textContent = '';
    if (!data.messages.length) { var e = document.createElement('div'); e.className='ml-empty'; e.textContent = curBox==='important' ? 'No important mail. Add sender or keyword rules under Accounts and rules.' : 'No messages yet. Add an account under Accounts and rules, then check for mail.'; box.appendChild(e); return; }
    data.messages.forEach(function(m){
      var row = document.createElement('div'); row.className = 'ml-msg' + (m.openedAt ? ' opened' : '') + (m.id === curDetailId ? ' sel' : ''); row.tabIndex = 0; row.setAttribute('role','button'); row.onkeydown = function(ev){ if (ev.key === 'Enter') openDetail(m.id); };
      row.onclick = function(){ openDetail(m.id); };
      var ud = document.createElement('div'); ud.className='udot';
      var body = document.createElement('div'); body.className='body';
      var top = document.createElement('div'); top.className='top';
      var from = document.createElement('div'); from.className='from';
      if (m.important) { var st = document.createElement('i'); st.className='fa-solid fa-star ml-star'; st.title='Important'; from.appendChild(st); }
      from.appendChild(esc(m.fromName || m.fromEmail));
      var dt = document.createElement('span'); dt.className='when'; dt.textContent = fmtDate(m.date);
      top.appendChild(from); top.appendChild(dt);
      var subj = document.createElement('div'); subj.className='subj'; subj.appendChild(esc(m.subject || '(no subject)'));
      var meta = document.createElement('div'); meta.className='meta';
      var tag = document.createElement('span'); tag.className='m-badge'; tag.textContent = m.accountName || 'mail';
      meta.appendChild(tag);
      body.appendChild(top); body.appendChild(subj); body.appendChild(meta);
      row.appendChild(ud); row.appendChild(body);
      box.appendChild(row);
    });
  } catch(e){}
}

async function addAccount(){
  var name = document.getElementById('ac-name').value.trim();
  var email = document.getElementById('ac-email').value.trim();
  var pass = document.getElementById('ac-pass').value.trim();
  if (!email || !pass) { showToast('Enter the email address and app password','warning'); return; }
  showToast('Connecting…','info');
  try {
    var r = await fetch('/api/mail/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,email:email,appPassword:pass})}).then(function(x){return x.json();});
    if (r.error) { showToast(r.error,'error'); return; }
    document.getElementById('ac-name').value=''; document.getElementById('ac-email').value=''; document.getElementById('ac-pass').value='';
    showToast('Account connected. Fetching mail.','success');
    setTimeout(function(){ loadAccounts(); loadMessages(); }, 2500);
    loadAccounts();
  } catch(e){ showToast('Failed: '+e.message,'error'); }
}
async function removeAccount(id, name){
  if (!confirm('Remove ' + name + ' and its copied mail from Metis? Gmail is not changed.')) return;
  await fetch('/api/mail/accounts/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id})});
  loadAccounts(); loadMessages();
}
async function saveBlocklist(){
  var lines = document.getElementById('blocklist').value.split(String.fromCharCode(10)).map(function(s){return s.trim();}).filter(Boolean);
  await fetch('/api/mail/blocklist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({blocklist:lines})});
  showToast('Blocklist saved','success');
}
async function loadImportant(){
  try {
    var r = await fetch('/api/mail/important').then(function(x){return x.json();});
    document.getElementById('imp-senders').value = (r.senders||[]).join(String.fromCharCode(10));
    document.getElementById('imp-keywords').value = (r.keywords||[]).join(String.fromCharCode(10));
  } catch(e){}
}
async function saveImportant(){
  var toList = function(id){ return document.getElementById(id).value.split(String.fromCharCode(10)).map(function(s){return s.trim();}).filter(Boolean); };
  try {
    var r = await fetch('/api/mail/important',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({senders:toList('imp-senders'),keywords:toList('imp-keywords')})}).then(function(x){return x.json();});
    showToast('Important rules saved. ' + (r.retagged||0) + ' messages re-sorted.','success');
    loadMessages();
  } catch(e){ showToast('Save failed: '+e.message,'error'); }
}
async function pollNow(){
  document.getElementById('ml-status').textContent = 'Checking for mail…';
  try { await fetch('/api/mail/poll',{method:'POST'}); } catch(e){}
  document.getElementById('ml-status').textContent = '';
  loadAccounts(); loadMessages();
}
async function openDetail(id){
  curDetailId = id;
  document.getElementById('ml-reader-empty').style.display = 'none';
  document.getElementById('ml-overlay').style.display = 'flex';
  document.getElementById('ml-body').classList.add('reading');
  document.querySelectorAll('.ml-msg.sel').forEach(function(r){ r.classList.remove('sel'); });
  document.getElementById('d-subj').textContent = '';
  document.getElementById('d-from').textContent = '';
  document.getElementById('d-body').textContent = 'Loading…';
  try {
    var r = await fetch('/api/mail/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id})}).then(function(x){return x.json();});
    if (r.error) { document.getElementById('d-body').textContent = r.error; return; }
    document.getElementById('d-subj').textContent = r.subject || '(no subject)';
    document.getElementById('d-from').textContent = (r.fromName ? r.fromName + ' <' + (r.fromEmail || '') + '>' : (r.fromEmail || '')) + ', ' + new Date(r.date).toLocaleString();
    document.getElementById('d-body').textContent = r.body || '(no text content)';
    loadMessages();
  } catch(e){ document.getElementById('d-body').textContent = 'Error: ' + e.message; }
}
function closeDetail(){
  document.getElementById('ml-overlay').style.display = 'none';
  document.getElementById('ml-reader-empty').style.display = '';
  document.getElementById('ml-body').classList.remove('reading');
  curDetailId = null;
  document.querySelectorAll('.ml-msg.sel').forEach(function(r){ r.classList.remove('sel'); });
}
function toggleDrawer(on){ document.getElementById('ml-drawer').classList.toggle('on', on); }
document.addEventListener('keydown', function(e){ if (e.key === 'Escape') toggleDrawer(false); });
async function deleteMsg(){
  if (!curDetailId) return;
  await fetch('/api/mail/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:curDetailId})});
  closeDetail(); loadMessages(); loadAccounts();
}

loadAccounts();
loadImportant();
loadMessages();
setInterval(function(){ loadAccounts(); loadMessages(); }, 45000);
${GAMEPAD_JS}
</script></body></html>`;
}

module.exports = { mailHtml };
