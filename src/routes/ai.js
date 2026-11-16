const { AI_PEERS_FILE } = require("../config");
const { callOllama, callOpenRouter } = require("../domains/ai");
const { httpGet } = require("../net");
const { getOpenRouterKey } = require("../settings");
const { readJSON, writeJSON } = require("../store");

// AI peers, chat, and the OpenRouter proxy.
module.exports = async function aiRoutes(ctx) {
  const { req, res, parsed, pathname, json, readBody } = ctx;

  // ── AI Peers API ──────────────────────────────────────────────────────────────

  if (pathname === '/api/ai/peers' && req.method === 'GET') {
    const peers = readJSON(AI_PEERS_FILE, []);
    const results = await Promise.all(peers.map(async p => {
      try {
        const data = await httpGet(p.host + '/api/tags', 3000);
        const parsed = JSON.parse(data);
        return { ...p, online: true, models: (parsed.models || []).map(m => m.name) };
      } catch {
        return { ...p, online: false, models: [] };
      }
    }));
    return json({ peers: results });
  }

  if (pathname === '/api/ai/peers' && req.method === 'POST') {
    const peers = readJSON(AI_PEERS_FILE, []);
    const body  = JSON.parse((await readBody()).toString());
    const peer  = { id: Date.now().toString(), name: body.name || 'Peer', host: (body.host || '').replace(/\/$/, '') };
    peers.push(peer);
    writeJSON(AI_PEERS_FILE, peers);
    return json(peer);
  }

  if (pathname.startsWith('/api/ai/peers/') && req.method === 'DELETE') {
    const id    = pathname.split('/')[4];
    const peers = readJSON(AI_PEERS_FILE, []).filter(p => p.id !== id);
    writeJSON(AI_PEERS_FILE, peers);
    return json({ ok: true });
  }

  if (pathname === '/api/ai/chat' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString());
    // ── OpenRouter ──
    if (body.provider === 'openrouter') {
      if (!getOpenRouterKey()) return json({ error: 'No OpenRouter API key set' }, 400);
      try {
        const text = await callOpenRouter(body.messages, body.model, null, 60000);
        return json({ message: text });
      } catch(e) { return json({ error: e.message }, 502); }
    }
    // ── Ollama peer ──
    // Was: its own inline httpPost with stream:false and a hardcoded 60s socket
    // timeout — so a model that took 61s to think got killed even though it was
    // about to answer. Now goes through the shared streaming callOllama, whose
    // idle timer resets on every token.
    const peers = readJSON(AI_PEERS_FILE, []);
    const peer  = peers.find(p => p.id === body.peerId);
    if (!peer) return json({ error: 'Peer not found' }, 404);
    try {
      const text = await callOllama(peer.host, body.model, body.messages, null, body.timeoutMs || 0);
      return json({ message: text });
    } catch(e) { return json({ error: e.message }, 502); }
  }

  if (pathname === '/api/openrouter/test' && req.method === 'GET') {
    const key = getOpenRouterKey();
    const masked = key ? key.slice(0, 8) + '...' + key.slice(-4) + ' (' + key.length + ' chars)' : '(not set)';
    if (!key) return json({ ok: false, error: 'OpenRouter API key not set', key: masked });
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': `Bearer ${key}`, 'User-Agent': 'OpenHL/1.0' }
      });
      const body = await res.text();
      return json({ ok: res.ok, key: masked, status: res.status, response: body.slice(0, 300) });
    } catch(e) {
      return json({ ok: false, key: masked, error: e.message });
    }
  }

  if (pathname === '/api/openrouter/models' && req.method === 'GET') {
    const ORK = getOpenRouterKey();
    if (!ORK) return json({ error: 'No OpenRouter API key set' }, 400);
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': `Bearer ${ORK}`, 'User-Agent': 'OpenHL/1.0' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
      const models = (data.data || [])
        .map(m => ({ id: m.id, name: m.name || m.id, ctx: m.context_length }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return json({ models });
    } catch(e) { return json({ error: e.message }, 500); }
  }
};
