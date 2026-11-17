const https = require("https");

const { httpGet } = require("../net");
const { getOpenRouterKey } = require("../settings");

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

// Unified AI caller — Local network (Ollama) or OpenRouter
async function callAI(provider, model, messages, system, ms = 0, opts = {}) {
  if (provider === 'openrouter') return callOpenRouter(messages, model, system, ms || 120000);
  if (provider === 'local')      return callOllama(opts.host, model, messages, system, ms);
  throw new Error('Unknown AI provider: ' + provider);
}

function callOpenRouter(messages, model, system, ms = 120000) {
  return callOpenRouterRaw(messages, model, system, ms);
}
async function callOpenRouterRaw(messages, model, system, ms = 120000) {
  const KEY = getOpenRouterKey();
  if (!KEY) throw new Error('No OpenRouter API key (set it on the AI page or in .env)');
  const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  const usedModel = model || 'openrouter/auto';
  console.log(`[OpenRouter] model=${usedModel} key=${KEY.slice(0,12)}... msgs=${msgs.length}`);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${KEY}`,
        'HTTP-Referer': 'http://openhl.local',
        'X-Title': 'Open HL'
      },
      body: JSON.stringify({ model: usedModel, messages: msgs, stream: false })
    });
    const raw = await res.text();
    console.log(`[OpenRouter] status=${res.status} body=${raw.slice(0, 200)}`);
    const data = JSON.parse(raw);
    if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
    return data.choices?.[0]?.message?.content || '';
  } finally { clearTimeout(t); }
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

module.exports = { AI_IDLE_MS, AI_KEEP_ALIVE, AI_TOTAL_MS, OLLAMA_HOST_DEFAULT, callAI, callOllama, callOpenRouter, ollamaFirstModel, ollamaTags };
