const crypto = require("crypto");

const { sendAlert } = require("../alerts");
const { AUDIO } = require("../audio");
const { MONITOR, MONITOR_LOG, MONITOR_SERIES, monitorMeta, nodeChecks, readNodes, writeNodes } = require("../domains/monitor");
const { httpGet, probePort } = require("../net");
const { SETTINGS, maskKey, saveSettings } = require("../settings");

// Monitored nodes, check history, local services, and alert config.
module.exports = async function monitorRoutes(ctx) {
  const { req, pathname, json, readBody } = ctx;

  // ── Custom monitored nodes ───────────────────────────────────────────────────
  if (pathname === '/api/nodes' && req.method === 'GET') {
    const d = readNodes();
    return json({ nodes: d.nodes.map(n => Object.assign({}, n,
      { live: MONITOR['custom:' + n.id] || null })) });
  }
  if (pathname === '/api/nodes' && req.method === 'POST') {
    const b = JSON.parse((await readBody()).toString() || '{}');
    const host = String(b.host || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const port = parseInt(b.port, 10);
    if (!host) return json({ error: 'host or IP is required' }, 400);
    if (!(port >= 1 && port <= 65535)) return json({ error: 'port must be 1-65535' }, 400);
    const d = readNodes();
    if (d.nodes.some(n => n.host === host && n.port === port)) {
      return json({ error: host + ':' + port + ' is already monitored' }, 409);
    }
    const node = {
      id: 'nd_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'),
      name: String(b.name || '').trim() || (host + ':' + port),
      host, port,
      kind: String(b.kind || 'node').slice(0, 24),
      check: (b.check === 'http' || b.check === 'https') ? b.check : 'tcp',
      path: String(b.path || '/').slice(0, 200),
      timeoutMs: Math.min(20000, Math.max(500, parseInt(b.timeoutMs, 10) || 3000)),
      enabled: true, createdAt: new Date().toISOString(),
    };
    d.nodes.push(node); writeNodes(d);
    nodeChecks();
    return json(node);
  }
  if (pathname.startsWith('/api/nodes/') && req.method === 'PUT') {
    const id = pathname.split('/')[3];
    const b = JSON.parse((await readBody()).toString() || '{}');
    const d = readNodes();
    const i = d.nodes.findIndex(n => n.id === id);
    if (i === -1) return json({ error: 'not found' }, 404);
    const cur2 = d.nodes[i];
    if (b.host !== undefined) cur2.host = String(b.host).trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (b.port !== undefined) {
      const pp = parseInt(b.port, 10);
      if (!(pp >= 1 && pp <= 65535)) return json({ error: 'port must be 1-65535' }, 400);
      cur2.port = pp;
    }
    if (b.name !== undefined) cur2.name = String(b.name).trim() || (cur2.host + ':' + cur2.port);
    if (b.kind !== undefined) cur2.kind = String(b.kind).slice(0, 24);
    if (b.check !== undefined) cur2.check = (b.check === 'http' || b.check === 'https') ? b.check : 'tcp';
    if (b.path !== undefined) cur2.path = String(b.path).slice(0, 200);
    if (b.enabled !== undefined) cur2.enabled = !!b.enabled;
    writeNodes(d); nodeChecks();
    return json(cur2);
  }
  if (pathname.startsWith('/api/nodes/') && req.method === 'DELETE') {
    const id = pathname.split('/')[3];
    const d = readNodes();
    d.nodes = d.nodes.filter(n => n.id !== id);
    delete MONITOR['custom:' + id];
    writeNodes(d);
    return json({ ok: true });
  }
  // One-shot reachability test, so "Add" can be verified before saving.
  if (pathname === '/api/nodes/test' && req.method === 'POST') {
    const b = JSON.parse((await readBody()).toString() || '{}');
    const host = String(b.host || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const port = parseInt(b.port, 10);
    if (!host || !(port >= 1 && port <= 65535)) return json({ error: 'host and port required' }, 400);
    const t = Date.now();
    try {
      if (b.check === 'http' || b.check === 'https') {
        const url = (b.check === 'https' ? 'https://' : 'http://') + host + ':' + port + (b.path || '/');
        await httpGet(url, 5000);
        return json({ online: true, ms: Date.now() - t, via: b.check });
      }
      const up = await probePort(host, port, 5000);
      return json({ online: up, ms: Date.now() - t, via: 'tcp',
        error: up ? null : 'no TCP connection (refused, filtered or unreachable)' });
    } catch (e) { return json({ online: false, ms: Date.now() - t, error: e.message }); }
  }

  // Retained monitor history — transitions + per-pass samples
  if (pathname === '/api/monitor/history' && req.method === 'GET') {
    const intervalMs = parseInt(process.env.MONITOR_MS || "30000", 10);
    return json({
      log: MONITOR_LOG.slice(-40).reverse(),
      series: MONITOR_SERIES.slice(-60),
      nodes: (() => {
        const rows = Object.entries(MONITOR).map(([id, v]) => ({ id, name: v.name, kind: v.kind, online: v.online,
          host: v.host || null, port: v.port || null, latency: v.latency == null ? null : v.latency,
          custom: !!v.custom, detail: v.detail || null }));
        // MONITOR is in-memory, so for the first few seconds after a restart it
        // is empty and every configured node looked deleted. List them as
        // "unknown" until the first sweep instead of showing nothing.
        const seen = new Set(rows.map(r => r.id));
        for (const n of readNodes().nodes) {
          const id = 'custom:' + n.id;
          if (seen.has(id) || n.enabled === false) continue;
          rows.push({ id, name: n.name || (n.host + ':' + n.port), kind: n.kind || 'node',
            online: null, host: n.host, port: n.port, latency: null,
            custom: true, detail: 'not checked yet' });
        }
        return rows;
      })(),
      intervalMs, lastCheckAt: monitorMeta().lastCheckAt, primed: monitorMeta().primed,
      nextCheckIn: monitorMeta().lastCheckAt ? Math.max(0, intervalMs - (Date.now() - monitorMeta().lastCheckAt)) : null,
    });
  }

  // Local companion services — port reachability for the Monitoring page
  if (pathname === '/api/services/local' && req.method === 'GET') {
    return json({ services: [] });
  }

  // Alert channels config + test
  if (pathname === '/api/alerts/config' && req.method === 'GET') {
    const a = SETTINGS.alerts || {};
    return json({
      ntfy:     { enabled: !!(a.ntfy && a.ntfy.enabled), url: (a.ntfy && a.ntfy.url) || 'https://ntfy.sh', topic: (a.ntfy && a.ntfy.topic) || '' },
      webhook:  { enabled: !!(a.webhook && a.webhook.enabled), url: (a.webhook && a.webhook.url) || '' },
      pushover: { enabled: !!(a.pushover && a.pushover.enabled), user: (a.pushover && a.pushover.user) || '', token: (a.pushover && a.pushover.token) ? maskKey(a.pushover.token) : '', hasToken: !!(a.pushover && a.pushover.token) },
      speaker:  { enabled: !!(a.speaker && a.speaker.enabled), available: !!(AUDIO.speaker || AUDIO.mp3), cmd: AUDIO.mp3 || AUDIO.speaker || '' },
      recovery: !(a.recovery === false)
    });
  }
  if (pathname === '/api/alerts/config' && req.method === 'POST') {
    const b = JSON.parse((await readBody()).toString());
    const s = SETTINGS.alerts || {};
    if (b.ntfy)    s.ntfy    = { enabled: !!b.ntfy.enabled, url: String(b.ntfy.url || 'https://ntfy.sh').trim(), topic: String(b.ntfy.topic || '').trim() };
    if (b.webhook) s.webhook = { enabled: !!b.webhook.enabled, url: String(b.webhook.url || '').trim() };
    if (b.pushover) {
      s.pushover = s.pushover || {};
      s.pushover.enabled = !!b.pushover.enabled;
      s.pushover.user = String(b.pushover.user || '').trim();
      if (typeof b.pushover.token === 'string' && b.pushover.token && b.pushover.token.indexOf('…') === -1) s.pushover.token = b.pushover.token.trim(); // keep existing if masked value sent back
    }
    if (b.speaker) s.speaker = { enabled: !!b.speaker.enabled };
    if (typeof b.recovery === 'boolean') s.recovery = b.recovery;
    SETTINGS.alerts = s;
    saveSettings();
    return json({ ok: true });
  }
  if (pathname === '/api/alerts/test' && req.method === 'POST') {
    await sendAlert('Gridlantis-HL · test alert', 'This is a test alert from Gridlantis-HL. Your channel is working.', true);
    return json({ ok: true, speakerAvailable: !!(AUDIO.speaker || AUDIO.mp3) });
  }
};
