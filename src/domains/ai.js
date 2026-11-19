const https = require("https");

const { httpGet } = require("../net");
const { aiProvider, getAiKey } = require("../settings");

// ── Ollama, streamed ──────────────────────────────────────────────────────────
// The old version sent stream:false and leaned on httpPost's req.setTimeout().
// That is an INACTIVITY timeout on the socket, and with stream:false Ollama sends
// nothing at all until generation completes — so the socket looks idle for the
// model's entire thinking time and got killed at 120s even when it was about to
// answer. Raising the number just moves the cliff.
//
// Streaming fixes it properly: tokens arrive continuously, so the idle timer
// keeps getting reset and only a genuinely WEDGED node trips it. Two separate
// budgets now:
//   AI_IDLE_TIMEOUT_MS  — no bytes at all for this long => the node is dead.
//                          Must comfortably exceed cold model load + prompt eval.
//   AI_TIMEOUT_MS       — absolute ceiling, so nothing can hang forever.
const AI_IDLE_MS   = parseInt(process.env.AI_IDLE_TIMEOUT_MS || '180000', 10);   // 3 min
const AI_TOTAL_MS  = parseInt(process.env.AI_TIMEOUT_MS      || '900000', 10);   // 15 min
// Keep the model resident so the SECOND request does not pay the load cost again.
const AI_KEEP_ALIVE = process.env.AI_KEEP_ALIVE || '30m';

function callOllama(host, model, messages, system, ms = 0) {
  return callOllamaRaw(host, model, messages, system, ms);
}
function callOllamaRaw(host, model, messages, system, ms = 0) {
  return new Promise((resolve, reject) => {
    if (!host) return reject(new Error('No local AI peer selected'));
    let u;
    try { u = new URL(host.replace(/\/+$/, '') + '/api/chat'); }
    catch { return reject(new Error('Bad Ollama host: ' + host)); }

    const mod  = u.protocol === 'https:' ? https : require('http');
    const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages;
    const payload = JSON.stringify({
      model: model || 'llama3',
      messages: msgs,
      stream: true,
      keep_alive: AI_KEEP_ALIVE
    });

    const total = ms && ms > 0 ? ms : AI_TOTAL_MS;
    let out = '', settled = false, idleTimer = null;

    const finish = (err, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer); clearTimeout(idleTimer);
      try { req.destroy(); } catch {}
      err ? reject(err) : resolve(val);
    };
    const hardTimer = setTimeout(
      () => finish(new Error('AI hard timeout after ' + Math.round(total / 1000) + 's (AI_TIMEOUT_MS)')),
      total);
    const bumpIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(
        () => finish(new Error('Ollama sent nothing for ' + Math.round(AI_IDLE_MS / 1000)
          + 's — node wedged or model still loading (AI_IDLE_TIMEOUT_MS)')),
        AI_IDLE_MS);
    };

    const req = mod.request({
      hostname: u.hostname, port: u.port || undefined, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, res => {
      if (res.statusCode >= 400) {
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => finish(new Error('Ollama HTTP ' + res.statusCode + ': ' + b.slice(0, 200))));
        return;
      }
      bumpIdle();
      let buf = '';
      res.on('data', chunk => {
        bumpIdle();                                  // <- every token resets the clock
        buf += chunk.toString('utf8');
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let j;
          try { j = JSON.parse(line); } catch { continue; }
          if (j.error) return finish(new Error('Ollama: ' + j.error));
          if (j.message && j.message.content) out += j.message.content;
          if (j.done) return finish(null, out);
        }
      });
      res.on('end', () => finish(null, out));
      res.on('error', e => finish(e));
    });

    req.on('error', e => finish(new Error('Cannot reach Ollama at ' + u.host + ': ' + e.message)));
    bumpIdle();                                      // covers a stalled connect, too
    req.end(payload);
  });
}

// Unified AI caller — Local network (Ollama) or a cloud provider
async function callAI(provider, model, messages, system, ms = 0, opts = {}) {
  if (provider === 'local') return callOllama(opts.host, model, messages, system, ms);
  if (aiProvider(provider))  return callCloud(provider, messages, model, system, ms || 120000);
  throw new Error('Unknown AI provider: ' + provider);
}

function callOpenRouter(messages, model, system, ms = 120000) {
  return callCloud('openrouter', messages, model, system, ms);
}

// Headers for a provider's API. OpenRouter likes to know who is calling.
function cloudHeaders(p, key) {
  if (p.kind === 'anthropic') return { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' };
  const h = { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'OpenHL/1.0' };
  if (p.id === 'openrouter') { h['HTTP-Referer'] = 'http://openhl.local'; h['X-Title'] = 'Open HL'; }
  return h;
}
function cloudError(data, status) {
  const e = data && data.error;
  return new Error((e && (e.message || (typeof e === 'string' ? e : ''))) || (data && data.message) || `HTTP ${status}`);
}

async function callCloud(id, messages, model, system, ms = 120000) {
  const p = aiProvider(id);
  if (!p) throw new Error('Unknown AI provider: ' + id);
  const KEY = getAiKey(id);
  if (!KEY) throw new Error(`No ${p.name} API key (set it on the AI page or ${p.env} in .env)`);
  if (!model && id !== 'openrouter') throw new Error('Pick a model first');
  const usedModel = model || 'openrouter/auto';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  console.log(`[${p.name}] model=${usedModel} msgs=${messages.length}`);
  try {
    let url, body;
    if (p.kind === 'anthropic') {
      // Anthropic takes the system prompt on its own and only user/assistant turns.
      const sys = [system, ...messages.filter(m => m.role === 'system').map(m => m.content)].filter(Boolean).join('\n\n');
      url = p.base + '/messages';
      body = { model: usedModel, max_tokens: 4096, messages: messages.filter(m => m.role !== 'system') };
      if (sys) body.system = sys;
    } else {
      url = p.base + '/chat/completions';
      body = { model: usedModel, messages: system ? [{ role: 'system', content: system }, ...messages] : messages, stream: false };
    }
    const res = await fetch(url, { method: 'POST', signal: ctrl.signal, headers: cloudHeaders(p, KEY), body: JSON.stringify(body) });
    const raw = await res.text();
    console.log(`[${p.name}] status=${res.status}`);
    let data = null; try { data = JSON.parse(raw); } catch {}
    if (!res.ok) throw cloudError(data, res.status);
    if (!data) throw new Error(`${p.name} sent back something that is not JSON`);
    if (p.kind === 'anthropic') return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    return data.choices?.[0]?.message?.content || '';
  } finally { clearTimeout(t); }
}

// A provider's models, as { id, name }. OpenAI also lists embedding, speech
// and image models; those cannot chat, so they are left out.
const NOT_CHAT = /embed|tts|whisper|dall-e|moderation|transcribe|davinci|babbage|image|audio|realtime|search|computer-use|sora/i;
async function cloudModels(id) {
  const p = aiProvider(id);
  if (!p) throw new Error('Unknown AI provider');
  const KEY = getAiKey(id);
  if (!KEY) throw new Error(`No ${p.name} API key set`);
  const res = await fetch(p.base + '/models' + (p.kind === 'anthropic' ? '?limit=100' : ''), { headers: cloudHeaders(p, KEY) });
  const raw = await res.text();
  let data = null; try { data = JSON.parse(raw); } catch {}
  if (!res.ok) throw cloudError(data, res.status);
  const list = (data && (data.data || data.models)) || [];
  return list
    .map(m => {
      const mid = String(m.id || m.name || '').replace(/^models\//, '');
      return { id: mid, name: m.display_name || m.name && !/^models\//.test(m.name) && m.name || mid, ctx: m.context_length || m.context_window || null };
    })
    .filter(m => m.id && !(p.id === 'openai' && NOT_CHAT.test(m.id)) && !(p.id === 'google' && /embed|aqa|imagen|veo/i.test(m.id)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── Ollama model list ─────────────────────────────────────────────────────────
// Default Ollama host when nothing else is configured: OLLAMA_HOST in .env, else
// this machine.
const OLLAMA_HOST_DEFAULT = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

async function ollamaTags(host, timeoutMs = 8000) {
  const raw = await httpGet(host.replace(/\/+$/, '') + '/api/tags', timeoutMs, { Accept: 'application/json' });
  return (JSON.parse(raw).models || []).map(m => m.name);
}
async function ollamaFirstModel(host) {
  try { const t = await ollamaTags(host); return t[0] || ''; } catch { return ''; }
}

module.exports = { AI_IDLE_MS, AI_KEEP_ALIVE, AI_TOTAL_MS, OLLAMA_HOST_DEFAULT, callAI, callCloud, callOllama, callOpenRouter, cloudModels, ollamaFirstModel, ollamaTags };
