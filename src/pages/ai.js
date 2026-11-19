const { BASE_CSS, FAVICON, FONT, GAMEPAD_CSS, GAMEPAD_JS, NAV_CSS, SSE_JS, THEME_JS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");

function aiHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open HL · AI</title>${FONT}${FAVICON}
<style>
${BASE_CSS}${NAV_CSS}${TOAST_CSS}${GAMEPAD_CSS}
.ai-layout{display:grid;grid-template-columns:300px minmax(0,1fr);gap:16px;align-items:start;}
.ai-sidebar{display:flex;flex-direction:column;gap:16px;}
.peer-list{display:flex;flex-direction:column;}
.peer-card{padding:12px 16px;border-top:1px solid var(--line);cursor:pointer;}
.peer-card:hover{background:var(--raised);}
.peer-card.active{background:var(--raised);}
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
.or-env{font-size:12.5px;color:var(--muted);margin-top:-4px;}
.or-env:empty{display:none;}
.or-card.off{cursor:default;opacity:.6;}
.cw-toggle{display:flex;align-items:flex-start;gap:12px;cursor:pointer;}
.cw-toggle-t{flex:1;display:flex;flex-direction:column;gap:3px;font-size:13.5px;}
.cw-toggle-t span{font-size:12.5px;color:var(--muted);line-height:1.4;}
.cw-switch{position:relative;flex:0 0 auto;width:44px;height:26px;border-radius:13px;border:1px solid var(--line-strong);background:var(--raised);cursor:pointer;padding:0;margin-top:2px;}
.cw-switch::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:var(--muted);transition:transform .15s,background .15s;}
.cw-switch[aria-checked="true"]{background:color-mix(in srgb,var(--accent) 30%,var(--raised));border-color:var(--accent);}
.cw-switch[aria-checked="true"]::after{transform:translateX(18px);background:var(--accent);}
.cw-switch:disabled{opacity:.5;cursor:default;}
#cw-run:disabled{opacity:.5;cursor:default;}
#cw-info.bad{color:var(--fault);}
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
  <div class="m-head"><div><h1 class="m-title">AI</h1><p class="m-sub">Chat with models on your own machines or through a cloud AI provider.</p></div></div>
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
        <div class="m-panel-h"><h2 class="m-panel-t" id="or-t">Cloud AI</h2><span id="or-key-status" class="or-status">not set</span></div>
        <div class="m-panel-b ai-form">
          <label class="m-label" for="or-provider" style="margin:0">Provider</label>
          <select class="or-model-sel" id="or-provider" onchange="onProviderChange()" aria-describedby="or-key-status">
            <option value="openrouter">OpenRouter</option>
          </select>
          <div class="or-custom-row">
            <input class="peer-input" id="or-key" type="password" placeholder="API key" aria-label="API key" autocomplete="off" onkeydown="if(event.key==='Enter')saveOrKey()">
            <button class="add-peer-btn" onclick="saveOrKey()">Save</button>
          </div>
          <div class="or-env" id="or-env"></div>
          <div class="or-card" id="or-card" role="button" tabindex="0" onclick="selectOpenRouter()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectOpenRouter();}">
            <div class="or-dot off" id="or-dot"></div>
            <div class="or-label" id="or-label">Chat with OpenRouter</div>
            <span id="or-model-count" style="font-size:13px;color:var(--muted)"></span>
          </div>
          <select class="or-model-sel" id="or-model-sel" onchange="onOrModelChange()" style="display:none" aria-label="Model">
            <option value="">Loading models…</option>
          </select>
          <div class="or-custom-row" style="display:none" id="or-custom-row">
            <input class="peer-input" id="or-custom-model" placeholder="Or paste a model ID" aria-label="Model ID">
            <button class="add-peer-btn" onclick="useCustomOrModel()">Use</button>
          </div>
        </div>
      </section>
      <section class="m-panel" id="cw-section" aria-labelledby="cw-t">
        <div class="m-panel-h"><h2 class="m-panel-t" id="cw-t">ConnectWork</h2><span id="cw-state" class="or-status">off</span></div>
        <div class="m-panel-b ai-form">
          <div class="cw-toggle" id="cw-row">
            <span class="cw-toggle-t" id="cw-l"><b>Auto connections</b><span>Lets AI suggest links between your notes, flows, reminders, files, machines and containers. Suggestions show dotted on the graph until you keep or dismiss them.</span></span>
            <button class="cw-switch" type="button" role="switch" id="cw-on" aria-checked="false" aria-labelledby="cw-l"></button>
          </div>
          <label class="m-label" for="cw-source" style="margin:0">Source</label>
          <select class="or-model-sel" id="cw-source" onchange="onAutoSource()"></select>
          <label class="m-label" for="cw-model" style="margin:0">Model</label>
          <select class="or-model-sel" id="cw-model" onchange="saveAuto({ model: this.value })"></select>
          <button class="add-peer-btn" id="cw-run" onclick="runAuto()"><i class="fa-solid fa-wand-magic-sparkles"></i> Find connections now</button>
          <div class="or-env" id="cw-info"></div>
        </div>
      </section>
    </div>
    <section class="m-panel chat-box" aria-label="Chat">
      <div class="chat-header">
        <span id="chatTitle" class="chat-header-title" style="color:var(--muted)">Choose a machine or a cloud provider to start</span>
        <select class="chat-model-select" id="modelSelect" style="display:none" onchange="onModelChange()" aria-label="Model"></select>
      </div>
      <div class="chat-messages" id="chatMessages" aria-live="polite">
        <div class="empty-state">Choose one of your machines or a cloud provider<br>to start a conversation.</div>
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

// Cloud AI: one provider at a time, picked in the Provider list. Each keeps
// its own key on the server; the chat card uses the picked one.
let PROVIDERS = [{ id: 'openrouter', name: 'OpenRouter', hint: 'sk-or-…' }];
let AI_KEYS = {};
let cloudProvider = 'openrouter';
try { cloudProvider = localStorage.getItem('openhl-ai-provider') || 'openrouter'; } catch(e) {}
const OR_FAVS = [
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
function providerName(id) { const p = PROVIDERS.find(x => x.id === id); return p ? p.name : id; }
function opt(v, t) { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; }

function paintProviders() {
  const sel = document.getElementById('or-provider');
  sel.innerHTML = '';
  PROVIDERS.forEach(p => sel.appendChild(opt(p.id, p.name + (AI_KEYS[p.id] && AI_KEYS[p.id].set ? '  ·  key saved' : ''))));
  if (!PROVIDERS.some(p => p.id === cloudProvider)) cloudProvider = 'openrouter';
  sel.value = cloudProvider;
  const p = PROVIDERS.find(x => x.id === cloudProvider) || PROVIDERS[0];
  const k = AI_KEYS[cloudProvider] || {};
  const input = document.getElementById('or-key');
  input.placeholder = (k.set ? 'Replace the key, ' : 'API key, ') + (p.hint || '');
  input.setAttribute('aria-label', p.name + ' API key');
  document.getElementById('or-key-status').textContent = k.set ? 'key saved' : 'not set';
  document.getElementById('or-env').textContent = !k.set ? '' : k.fromEnv
    ? 'Using ' + k.masked + ' from ' + p.env + ' in .env. Save a key here to replace it.'
    : 'Key ' + k.masked + '. Save an empty key to remove it.';
  document.getElementById('or-label').textContent = 'Chat with ' + p.name;
  document.getElementById('or-card').classList.toggle('off', !k.set);
}

async function onProviderChange() {
  const was = cloudProvider;
  cloudProvider = document.getElementById('or-provider').value;
  try { localStorage.setItem('openhl-ai-provider', cloudProvider); } catch(e) {}
  document.getElementById('or-key').value = '';
  paintProviders();
  if (orActive && was !== cloudProvider) leaveCloud();
  await initOpenRouter();
}

// Loads the picked provider's models into the model list.
async function initOpenRouter() {
  const id = cloudProvider;
  const sel = document.getElementById('or-model-sel');
  const cnt = document.getElementById('or-model-count');
  const dot = document.getElementById('or-dot');
  orModels = [];
  dot.classList.add('off'); cnt.textContent = '';
  if (!(AI_KEYS[id] && AI_KEYS[id].set)) { sel.innerHTML = ''; sel.appendChild(opt('', 'Save a key first')); return; }
  sel.innerHTML = ''; sel.appendChild(opt('', 'Loading models…'));
  const res = await fetch('/api/ai/models?provider=' + encodeURIComponent(id)).catch(()=>null);
  if (id !== cloudProvider) return;   // switched again while this loaded
  const data = res ? await res.json().catch(()=>({})) : {};
  if (!res || !res.ok || data.error) {
    sel.innerHTML = ''; sel.appendChild(opt('', 'Could not load models'));
    cnt.textContent = 'models unavailable';
    if (data.error) showToast(providerName(id) + ': ' + data.error, 'error');
    return;
  }
  orModels = data.models || [];
  cnt.textContent = orModels.length + ' models';
  dot.classList.remove('off');
  sel.innerHTML = '';
  if (id === 'openrouter') {
    const favIds = new Set(OR_FAVS.map(f=>f.id));
    const g1 = document.createElement('optgroup'); g1.label = 'Popular';
    OR_FAVS.forEach(f => g1.appendChild(opt(f.id, f.name)));
    const g2 = document.createElement('optgroup'); g2.label = 'All Models';
    orModels.filter(m=>!favIds.has(m.id)).forEach(m => g2.appendChild(opt(m.id, m.name || m.id)));
    sel.appendChild(g1); sel.appendChild(g2);
  } else {
    orModels.forEach(m => sel.appendChild(opt(m.id, m.name || m.id)));
    if (!orModels.length) sel.appendChild(opt('', 'No models listed'));
  }
  let last = null; try { last = localStorage.getItem('openhl-ai-model-' + id); } catch(e) {}
  if (last && [...sel.options].some(o => o.value === last)) sel.value = last;
  if (orActive) activeModel = sel.value || null;
}

function selectOpenRouter() {
  if (!(AI_KEYS[cloudProvider] && AI_KEYS[cloudProvider].set)) { document.getElementById('or-key').focus(); showToast('Save your ' + providerName(cloudProvider) + ' key first', 'warning'); return; }
  orActive = true;
  activePeer = null;
  chatHistory = [];
  renderPeers();
  document.getElementById('or-card').classList.add('active');
  document.getElementById('or-model-sel').style.display = '';
  document.getElementById('or-custom-row').style.display = '';
  document.getElementById('chatTitle').textContent = providerName(cloudProvider);
  document.getElementById('chatTitle').style.color = '';
  document.getElementById('modelSelect').style.display = 'none';
  document.getElementById('sendBtn').disabled = false;
  document.getElementById('chatMessages').innerHTML = '';
  activeModel = document.getElementById('or-model-sel').value || (cloudProvider === 'openrouter' ? 'openrouter/auto' : null);
}

// Back to "nothing picked" when the provider being chatted with changes.
function leaveCloud() {
  orActive = false; activeModel = null; chatHistory = [];
  document.getElementById('or-card').classList.remove('active');
  document.getElementById('or-model-sel').style.display = 'none';
  document.getElementById('or-custom-row').style.display = 'none';
  document.getElementById('chatMessages').innerHTML = '<div class="empty-state">Choose one of your machines or a cloud provider<br>to start a conversation.</div>';
  document.getElementById('chatTitle').textContent = 'Choose a machine or a cloud provider to start';
  document.getElementById('chatTitle').style.color = 'var(--muted)';
  document.getElementById('sendBtn').disabled = true;
}

function onOrModelChange() {
  activeModel = document.getElementById('or-model-sel').value;
  try { localStorage.setItem('openhl-ai-model-' + cloudProvider, activeModel); } catch(e) {}
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
      ? { provider: cloudProvider, model: activeModel, messages: chatHistory }
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
    document.getElementById('chatMessages').innerHTML = '<div class="empty-state">Choose one of your machines or a cloud provider<br>to start a conversation.</div>';
    document.getElementById('chatTitle').textContent = 'Choose a machine or a cloud provider to start';
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
    if (Array.isArray(s.providers) && s.providers.length) PROVIDERS = s.providers;
    AI_KEYS = s.aiKeys || { openrouter: s.openRouter || {} };
    paintProviders();
    await initOpenRouter();
  } catch(e) {}
}
async function saveOrKey() {
  const id = cloudProvider, name = providerName(id);
  const v = document.getElementById('or-key').value.trim();
  try {
    const r = await fetch('/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ provider: id, key: v }) })
      .then(x => x.json().then(d => { if (!x.ok || d.error) throw new Error(d.error || 'HTTP ' + x.status); return d; }));
    document.getElementById('or-key').value = '';
    if (r.aiKeys) AI_KEYS = r.aiKeys;
    paintProviders();
    const k = AI_KEYS[id] || {};
    if (v) showToast(name + ' key saved', 'success');
    else showToast(k.set ? name + ' key removed, using the one in .env' : name + ' key removed', 'success');
    if (!k.set && orActive && cloudProvider === id) leaveCloud();
    await initOpenRouter();
  } catch(e) { showToast('Save failed: ' + e.message, 'error'); }
}

// ── ConnectWork auto connections ─────────────────────────────────────────
// The source is a cloud provider with a saved key or one of your machines.
let AUTO = null;
function autoSources() {
  const out = [];
  PROVIDERS.forEach(p => { if (AI_KEYS[p.id] && AI_KEYS[p.id].set) out.push({ v: 'cloud:' + p.id, t: p.name }); });
  PEERS.forEach(p => out.push({ v: 'peer:' + p.id, t: p.name + ' (your machine' + (p.online ? '' : ', offline') + ')' }));
  return out;
}
function whenText(iso) {
  if (!iso) return '';
  const d = new Date(iso), mins = Math.round((Date.now() - d) / 60000);
  return mins < 1 ? 'just now' : mins < 60 ? mins + ' min ago' : mins < 1440 ? Math.round(mins / 60) + ' h ago' : d.toLocaleDateString();
}
function paintAuto() {
  if (!AUTO) return;
  const on = document.getElementById('cw-on'), src = document.getElementById('cw-source');
  on.setAttribute('aria-checked', AUTO.on ? 'true' : 'false');
  const list = autoSources();
  src.innerHTML = '';
  src.appendChild(opt('', list.length ? 'Pick a source' : 'Save a key or add a machine first'));
  list.forEach(o => src.appendChild(opt(o.v, o.t)));
  if (AUTO.source && !list.some(o => o.v === AUTO.source)) src.appendChild(opt(AUTO.source, (AUTO.sourceName || AUTO.source) + ' (not available)'));
  src.value = AUTO.source || '';
  document.getElementById('cw-state').textContent = AUTO.running ? 'looking…' : AUTO.on ? 'on' : 'off';
  document.getElementById('cw-run').disabled = !!AUTO.running || !AUTO.ready;
  const info = document.getElementById('cw-info');
  info.classList.toggle('bad', !!AUTO.error);
  let t = '';
  if (AUTO.running) t = 'Asking ' + (AUTO.sourceName || 'the AI') + '…';
  else if (AUTO.error) t = 'Last try ' + whenText(AUTO.ranAt) + ': ' + AUTO.error;
  else if (AUTO.ranAt) t = 'Last looked ' + whenText(AUTO.ranAt) + ', ' + AUTO.found + ' suggestion' + (AUTO.found === 1 ? '' : 's') + '.';
  if (!AUTO.running) t += (t ? ' ' : '') + (AUTO.on ? 'Looks again every ' + AUTO.everyHours + ' hours.' : '');
  t += ' Sends item titles and the start of unlocked notes to the source.';
  info.textContent = t.trim();
}
let autoModelsFor = null;
async function loadAutoModels() {
  const sel = document.getElementById('cw-model'), src = AUTO && AUTO.source;
  if (src === autoModelsFor && sel.options.length > 1) { sel.value = AUTO.model || ''; return; }
  autoModelsFor = src;
  sel.innerHTML = '';
  if (!src) { sel.appendChild(opt('', 'Pick a source first')); return; }
  let models = [];
  if (src.indexOf('peer:') === 0) {
    const p = PEERS.find(x => 'peer:' + x.id === src);
    models = (p && p.models || []).map(m => ({ id: m, name: m }));
  } else {
    sel.appendChild(opt('', 'Loading models…'));
    const r = await fetch('/api/ai/models?provider=' + encodeURIComponent(src.slice(6))).then(x => x.json()).catch(() => ({}));
    if (autoModelsFor !== src) return;
    models = r.models || [];
    sel.innerHTML = '';
  }
  sel.appendChild(opt('', models.length ? 'Pick a model' : 'No models found'));
  models.forEach(m => sel.appendChild(opt(m.id, m.name || m.id)));
  if (AUTO.model && !models.some(m => m.id === AUTO.model)) sel.appendChild(opt(AUTO.model, AUTO.model));
  sel.value = AUTO.model || '';
}
async function loadAuto() {
  try { AUTO = await fetch('/api/connectwork/auto').then(r => r.json()); } catch(e) { return; }
  paintAuto(); loadAutoModels();
}
async function saveAuto(patch) {
  try {
    const r = await fetch('/api/connectwork/auto', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    const d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error || 'Could not save');
    AUTO = d; paintAuto();
    if (patch.on === true) showToast(AUTO.ready ? 'Auto connections on, looking now' : 'Auto connections on. Pick a source and model to start', 'success');
    if (patch.on === false) showToast('Auto connections off', 'success');
  } catch(e) { showToast(e.message, 'error'); loadAuto(); }
}
function onAutoSource() {
  const v = document.getElementById('cw-source').value;
  AUTO.source = v; AUTO.model = '';
  saveAuto({ source: v, model: '' }).then(loadAutoModels);
}
async function runAuto() {
  const b = document.getElementById('cw-run');
  b.disabled = true;
  if (AUTO) { AUTO.running = true; paintAuto(); }
  try {
    const r = await fetch('/api/connectwork/auto/run', { method: 'POST' });
    const d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error || 'It did not work');
    AUTO = d; paintAuto();
    showToast(d.found ? d.found + ' suggestion' + (d.found === 1 ? '' : 's') + ' added to ConnectWork' : 'No new connections found', 'success');
  } catch(e) { showToast(e.message, 'error'); loadAuto(); }
}
(function () {
  const sw = document.getElementById('cw-on');
  const flip = () => saveAuto({ on: sw.getAttribute('aria-checked') !== 'true' });
  sw.addEventListener('click', flip);
  document.getElementById('cw-row').addEventListener('click', e => { if (e.target !== sw) flip(); });
  try { openhlEvents().addEventListener('connectwork_changed', () => loadAuto()); } catch(e) {}
})();

loadPeers().then(() => { if (AUTO) { paintAuto(); autoModelsFor = null; loadAutoModels(); } });
loadOrKeyStatus().then(loadAuto);
window.__sseRefresh=function(d){if(d.type==='ai')loadPeers();};
${SSE_JS}
${GAMEPAD_JS}
</script></body></html>`;
}

// ── FINANCE PAGE ─────────────────────────────────────────────────────────────

module.exports = { aiHtml };
