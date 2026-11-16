const { BASE_CSS, FAVICON, FONT, GAMEPAD_CSS, GAMEPAD_JS, NAV_CSS, SSE_JS, THEME_JS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");

function aiHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Metis · AI</title>${FONT}${FAVICON}
<style>
${BASE_CSS}${NAV_CSS}${TOAST_CSS}${GAMEPAD_CSS}
.ai-layout{display:grid;grid-template-columns:300px minmax(0,1fr);gap:16px;align-items:start;}
.ai-sidebar{display:flex;flex-direction:column;gap:16px;}
.peer-list{display:flex;flex-direction:column;}
.peer-card{padding:12px 16px;border-top:1px solid var(--line);cursor:pointer;}
.peer-card:hover{background:var(--raised);}
.peer-card.active{background:var(--raised);box-shadow:inset 2px 0 0 var(--accent);}
.peer-header{display:flex;align-items:center;gap:10px;}
.peer-dot{width:8px;height:8px;border-radius:50%;background:var(--muted);flex-shrink:0;}
.peer-dot.online{background:var(--ok);} .peer-dot.offline{background:var(--fault);}
.peer-name{font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.peer-header button{width:26px;height:26px;border-radius:4px;}
.peer-header button:hover{background:var(--surface);color:var(--fault)!important;}
.peer-host{font-size:13px;color:var(--muted);margin:2px 0 8px 18px;font-family:var(--font-mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.peer-models{display:flex;flex-wrap:wrap;gap:4px;margin-left:18px;}
.model-tag{font-size:12px;padding:2px 7px;border-radius:99px;background:var(--surface);color:var(--text-2);border:1px solid var(--line);}
.ai-form{display:flex;flex-direction:column;gap:8px;}
.peer-input{width:100%;height:36px;background:var(--field);border:1px solid var(--line);border-radius:var(--r-ctl);padding:0 12px;color:var(--text);outline:none;}
.peer-input:focus{border-color:var(--accent);}
.add-peer-btn{height:36px;padding:0 14px;background:var(--raised);color:var(--text);border:1px solid var(--line);border-radius:var(--r-ctl);font-weight:500;}
.add-peer-btn:hover{border-color:var(--line-strong);}
.or-card{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--r-ctl);cursor:pointer;border:1px solid var(--line);background:var(--field);}
.or-card:hover{border-color:var(--line-strong);}
.or-card.active{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent);}
.or-dot{width:8px;height:8px;border-radius:50%;background:var(--ok);flex-shrink:0;}
.or-dot.off{background:var(--muted);}
.or-label{font-weight:600;flex:1;}
.or-model-sel{width:100%;height:36px;background:var(--field);border:1px solid var(--line);border-radius:var(--r-ctl);padding:0 8px;color:var(--text);}
.or-custom-row{display:flex;gap:6px;}
.or-status{font-weight:400;font-size:13px;color:var(--muted);}
.chat-box{display:flex;flex-direction:column;height:calc(var(--app-h) - 140px);min-height:480px;}
.chat-header{padding:12px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px;}
.chat-header-title{font:600 17px var(--font-display);}
.chat-model-select{margin-left:auto;height:32px;background:var(--field);border:1px solid var(--line);border-radius:var(--r-ctl);padding:0 8px;color:var(--text);max-width:50%;}
.chat-messages{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:12px;}
.msg{max-width:min(72ch,85%);padding:10px 14px;border-radius:var(--r-panel);line-height:1.6;white-space:pre-wrap;word-break:break-word;font-size:15px;}
.msg.user{align-self:flex-end;background:var(--accent-soft);border:1px solid color-mix(in srgb,var(--accent) 35%,var(--line));color:var(--text);}
.msg.assistant{align-self:flex-start;background:var(--raised);border:1px solid var(--line);color:var(--text);}
.msg.system{align-self:center;color:var(--muted);font-size:13px;}
.chat-input-row{padding:12px;border-top:1px solid var(--line);display:flex;gap:8px;align-items:flex-end;}
.chat-input{flex:1;background:var(--field);border:1px solid var(--line);border-radius:var(--r-ctl);padding:9px 12px;color:var(--text);resize:none;min-height:40px;max-height:160px;line-height:1.5;}
.chat-input:focus{outline:none;border-color:var(--accent);}
.send-btn{height:40px;padding:0 18px;background:var(--accent);color:var(--accent-ink);border:none;border-radius:var(--r-ctl);font-weight:500;}
.send-btn:hover{filter:brightness(1.08);}
.send-btn:disabled{opacity:.45;cursor:not-allowed;}
.empty-state{flex:1;display:flex;align-items:center;justify-content:center;color:var(--muted);text-align:center;padding:32px;line-height:1.6;}
@media(max-width:900px){.ai-layout{grid-template-columns:1fr;}.chat-box{height:70vh;}}
</style></head><body>
${navBar('ai')}
<main class="m-page">
  <div class="m-head"><div><h1 class="m-title">AI</h1><p class="m-sub">Chat with models on your own machines or through OpenRouter.</p></div></div>
  <div class="ai-layout">
    <div class="ai-sidebar">
      <section class="m-panel" aria-labelledby="peers-t">
        <div class="m-panel-h"><h2 class="m-panel-t" id="peers-t">Your machines</h2></div>
        <div class="peer-list" id="peerList"></div>
        <div class="m-panel-b ai-form" style="padding-top:12px;border-top:1px solid var(--line)">
          <label class="m-label" for="peerName" style="margin:0">Add an Ollama machine</label>
          <input class="peer-input" id="peerName" placeholder="Name, like Desktop">
          <input class="peer-input" id="peerHost" placeholder="http://192.168.1.5:11434">
          <button class="add-peer-btn" onclick="addPeer()"><i class="fa-solid fa-plus"></i> Add machine</button>
        </div>
      </section>
      <section class="m-panel" id="or-section" aria-labelledby="or-t">
        <div class="m-panel-h"><h2 class="m-panel-t" id="or-t">OpenRouter</h2><span id="or-key-status" class="or-status">not set</span></div>
        <div class="m-panel-b ai-form">
          <div class="or-custom-row">
            <input class="peer-input" id="or-key" type="password" placeholder="API key, sk-or-…" aria-label="OpenRouter API key" onkeydown="if(event.key==='Enter')saveOrKey()">
            <button class="add-peer-btn" onclick="saveOrKey()">Save</button>
          </div>
          <div class="or-card" id="or-card" role="button" tabindex="0" onclick="selectOpenRouter()">
            <div class="or-dot off" id="or-dot"></div>
            <div class="or-label">Chat with OpenRouter</div>
            <span id="or-model-count" style="font-size:13px;color:var(--muted)"></span>
          </div>
          <select class="or-model-sel" id="or-model-sel" onchange="onOrModelChange()" style="display:none" aria-label="OpenRouter model">
            <option value="">Loading models…</option>
          </select>
          <div class="or-custom-row" style="display:none" id="or-custom-row">
            <input class="peer-input" id="or-custom-model" placeholder="Or paste a model ID" aria-label="Model ID">
            <button class="add-peer-btn" onclick="useCustomOrModel()">Use</button>
          </div>
        </div>
      </section>
    </div>
    <section class="m-panel chat-box" aria-label="Chat">
      <div class="chat-header">
        <span id="chatTitle" class="chat-header-title" style="color:var(--muted)">Choose a machine or OpenRouter to start</span>
        <select class="chat-model-select" id="modelSelect" style="display:none" onchange="onModelChange()" aria-label="Model"></select>
      </div>
      <div class="chat-messages" id="chatMessages" aria-live="polite">
        <div class="empty-state">Choose one of your machines or OpenRouter<br>to start a conversation.</div>
      </div>
      <div class="chat-input-row">
        <textarea class="chat-input" id="chatInput" placeholder="Message" rows="1" aria-label="Message"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMsg()}"></textarea>
        <button class="send-btn" id="sendBtn" onclick="sendMsg()" disabled>Send</button>
      </div>
    </section>
  </div>
</main>
<div class="toast" id="toast"></div>
<script>
${TOAST_JS}
${THEME_JS}
let PEERS = [];
let activePeer = null;
let activeModel = null;
let chatHistory = [];
let orActive = false;
let orModels = [];

async function initOpenRouter() {
  const res = await fetch('/api/openrouter/models').catch(()=>null);
  if (!res || !res.ok) return;
  const data = await res.json();
  if (data.error) return; // no key set
  orModels = data.models || [];
  const sec = document.getElementById('or-section');
  sec.style.display = '';
  const cnt = document.getElementById('or-model-count');
  cnt.textContent = orModels.length + ' models';
  document.getElementById('or-dot').classList.remove('off');
  // Populate model select
  const sel = document.getElementById('or-model-sel');
  // Curated favourites first
  const favs = [
    {id:'openrouter/auto', name:'⚡ Auto (best for task)'},
    {id:'anthropic/claude-sonnet-4-5', name:'Claude Sonnet 4.5'},
    {id:'anthropic/claude-3-5-haiku', name:'Claude 3.5 Haiku'},
    {id:'openai/gpt-4o', name:'GPT-4o'},
    {id:'openai/gpt-4o-mini', name:'GPT-4o Mini'},
    {id:'openai/o3-mini', name:'o3-mini'},
    {id:'google/gemini-2.0-flash-001', name:'Gemini 2.0 Flash'},
    {id:'google/gemini-pro-1.5', name:'Gemini Pro 1.5'},
    {id:'meta-llama/llama-3.3-70b-instruct', name:'Llama 3.3 70B'},
    {id:'mistralai/mistral-large', name:'Mistral Large'},
    {id:'deepseek/deepseek-chat', name:'DeepSeek V3'},
    {id:'x-ai/grok-3-mini', name:'Grok 3 Mini'},
    {id:'openrouter/fusion', name:'Fusion'},
  ];
  const favIds = new Set(favs.map(f=>f.id));
  const rest = orModels.filter(m=>!favIds.has(m.id));
  sel.innerHTML = '<optgroup label="Popular">' +
    favs.map(f=>\`<option value="\${f.id}">\${f.name}</option>\`).join('') +
    '</optgroup><optgroup label="All Models">' +
    rest.map(m=>\`<option value="\${m.id}">\${m.name||m.id}</option>\`).join('') +
    '</optgroup>';
}

function selectOpenRouter() {
  orActive = true;
  activePeer = null;
  chatHistory = [];
  renderPeers();
  document.getElementById('or-card').classList.add('active');
  document.getElementById('or-model-sel').style.display = '';
  document.getElementById('or-custom-row').style.display = '';
  document.getElementById('chatTitle').textContent = 'OpenRouter';
  document.getElementById('chatTitle').style.color = '';
  document.getElementById('modelSelect').style.display = 'none';
  document.getElementById('sendBtn').disabled = false;
  document.getElementById('chatMessages').innerHTML = '';
  activeModel = document.getElementById('or-model-sel').value || 'openrouter/auto';
}

function onOrModelChange() {
  activeModel = document.getElementById('or-model-sel').value;
  chatHistory = [];
  document.getElementById('chatMessages').innerHTML = '';
}

function useCustomOrModel() {
  const v = document.getElementById('or-custom-model').value.trim();
  if (!v) return;
  const sel = document.getElementById('or-model-sel');
  // Add custom option if not present
  if (![...sel.options].find(o=>o.value===v)) {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v;
    sel.insertBefore(opt, sel.firstChild);
  }
  sel.value = v;
  activeModel = v;
  chatHistory = [];
  document.getElementById('chatMessages').innerHTML = '';
}

async function loadPeers() {
  const res = await fetch('/api/ai/peers');
  const data = await res.json();
  PEERS = data.peers || [];
  renderPeers();
}

function renderPeers() {
  const list = document.getElementById('peerList');
  if (!PEERS.length) {
    list.innerHTML = '<div class="m-empty">No machines added yet.</div>';
    return;
  }
  list.innerHTML = PEERS.map((p, i) => \`
    <div class="peer-card\${activePeer && activePeer.id === p.id ? ' active' : ''}" onclick="selectPeer(\${i})">
      <div class="peer-header">
        <div class="peer-dot \${p.online ? 'online' : 'offline'}"></div>
        <div class="peer-name">\${p.name}</div>
        <button onclick="event.stopPropagation();deletePeer('\${p.id}')" style="background:none;border:none;color:var(--muted);cursor:pointer" title="Remove" aria-label="Remove"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="peer-host">\${p.host}</div>
      <div class="peer-models">
        \${(p.models||[]).slice(0,4).map(m=>\`<span class="model-tag">\${m.split(':')[0]}</span>\`).join('')}
        \${(p.models||[]).length > 4 ? \`<span class="model-tag">+\${p.models.length-4}</span>\` : ''}
      </div>
    </div>
  \`).join('');
}

async function selectPeer(idx) {
  orActive = false;
  activePeer = PEERS[idx];
  chatHistory = [];
  document.getElementById('or-card')?.classList.remove('active');
  document.getElementById('or-model-sel').style.display = 'none';
  document.getElementById('or-custom-row').style.display = 'none';
  renderPeers();
  document.getElementById('chatTitle').textContent = activePeer.name;
  document.getElementById('chatTitle').style.color = '';
  document.getElementById('sendBtn').disabled = false;
  document.getElementById('chatMessages').innerHTML = '';
  const sel = document.getElementById('modelSelect');
  sel.style.display = '';
  sel.innerHTML = (activePeer.models||[]).map(m=>\`<option value="\${m}">\${m.split(':')[0]}</option>\`).join('') || '<option value="">No models</option>';
  activeModel = sel.value || null;
}

function onModelChange() {
  activeModel = document.getElementById('modelSelect').value;
  chatHistory = [];
  document.getElementById('chatMessages').innerHTML = '';
}

async function sendMsg() {
  if ((!activePeer && !orActive) || !activeModel) return;
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = '';
  appendMsg('user', text);
  chatHistory.push({ role: 'user', content: text });
  document.getElementById('sendBtn').disabled = true;
  const thinkingEl = appendMsg('assistant', '…');
  try {
    const payload = orActive
      ? { provider: 'openrouter', model: activeModel, messages: chatHistory }
      : { peerId: activePeer.id, model: activeModel, messages: chatHistory };
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    const reply = data.message || data.error || 'No response';
    thinkingEl.textContent = reply;
    chatHistory.push({ role: 'assistant', content: reply });
  } catch(e) {
    thinkingEl.textContent = 'Error: ' + e.message;
    thinkingEl.style.color = 'var(--danger,#f44)';
  }
  document.getElementById('sendBtn').disabled = false;
}

function appendMsg(role, text) {
  const msgs = document.getElementById('chatMessages');
  const el = document.createElement('div');
  el.className = 'msg ' + role;
  el.textContent = text;
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
  return el;
}

async function addPeer() {
  const name = document.getElementById('peerName').value.trim();
  const host = document.getElementById('peerHost').value.trim();
  if (!name || !host) { showToast('Name and host required','warning'); return; }
  const res = await fetch('/api/ai/peers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, host })
  });
  if (res.ok) {
    document.getElementById('peerName').value = '';
    document.getElementById('peerHost').value = '';
    await loadPeers();
    showToast('Peer added','success');
  } else {
    showToast('Failed to add peer','error');
  }
}

async function deletePeer(id) {
  if (!confirm('Remove this peer?')) return;
  await fetch('/api/ai/peers/' + id, { method: 'DELETE' });
  if (activePeer && activePeer.id === id) {
    activePeer = null;
    activeModel = null;
    chatHistory = [];
    document.getElementById('chatMessages').innerHTML = '<div class="empty-state">Choose one of your machines or OpenRouter<br>to start a conversation.</div>';
    document.getElementById('chatTitle').textContent = 'Choose a machine or OpenRouter to start';
    document.getElementById('chatTitle').style.color = 'var(--muted)';
    document.getElementById('modelSelect').style.display = 'none';
    document.getElementById('sendBtn').disabled = true;
  }
  await loadPeers();
  showToast('Peer removed','success');
}

// Auto-resize textarea
document.getElementById('chatInput').addEventListener('input', function() {
  this.style.height = '';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

async function loadOrKeyStatus() {
  try {
    const s = await fetch('/api/settings').then(r=>r.json());
    const el = document.getElementById('or-key-status');
    if (s.openRouter && s.openRouter.set) {
      if (el) el.textContent = 'key saved, ' + s.openRouter.masked;
      await initOpenRouter();
    } else {
      if (el) el.textContent = 'not set';
    }
  } catch(e) {}
}
async function saveOrKey() {
  const v = document.getElementById('or-key').value.trim();
  try {
    const r = await fetch('/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ openRouterKey: v }) }).then(x=>x.json());
    document.getElementById('or-key').value = '';
    const el = document.getElementById('or-key-status');
    if (r.openRouter && r.openRouter.set) {
      el.textContent = 'key saved, ' + r.openRouter.masked;
      showToast('OpenRouter key saved', 'success');
      await initOpenRouter();
    } else {
      el.textContent = 'not set';
      showToast('OpenRouter key cleared', 'success');
    }
  } catch(e) { showToast('Save failed: ' + e.message, 'error'); }
}

loadPeers();
loadOrKeyStatus();
window.__sseRefresh=function(d){if(d.type==='ai')loadPeers();};
${SSE_JS}
${GAMEPAD_JS}
</script></body></html>`;
}

// ── FINANCE PAGE ─────────────────────────────────────────────────────────────

module.exports = { aiHtml };
