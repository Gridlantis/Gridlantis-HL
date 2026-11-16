const os = require("os");

const { UPTIMEROBOT_KEY } = require("../config");
const { MONITOR, monitorMeta } = require("../domains/monitor");
const { HOST } = require("../host");
const { httpPost } = require("../net");

// Host info, uptime, and live system metrics.
module.exports = async function systemRoutes(ctx) {
  const { req, pathname, json } = ctx;

  // ── System Info ───────────────────────────────────────────────────────────────
  if (pathname === '/api/sysinfo' && req.method === 'GET') {
    const ifaces = os.networkInterfaces();
    const ips = Object.values(ifaces).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
    return json({ hostname: os.hostname(), platform: os.platform(), uptime: os.uptime(), ips, totalMem: os.totalmem(), freeMem: os.freemem() });
  }

  // ── UptimeRobot ───────────────────────────────────────────────────────────────
  if (pathname === '/api/uptime' && req.method === 'GET') {
    if (!UPTIMEROBOT_KEY) return json({ error: 'No API key configured' }, 400);
    try {
      const data = await httpPost('https://api.uptimerobot.com/v2/getMonitors', `api_key=${UPTIMEROBOT_KEY}&format=json&logs=0`, { 'Content-Type': 'application/x-www-form-urlencoded' }, 8000);
      return json(JSON.parse(data));
    } catch(e) { return json({ error: e.message }, 500); }
  }

  // Consolidated node/AI status (for the homepage offline panel + baseline)
  if (pathname === '/api/status/summary' && req.method === 'GET') {
    const nodes = Object.entries(MONITOR).map(([id, v]) => ({ id, name: v.name, kind: v.kind, online: v.online }));
    return json({ nodes, offline: nodes.filter(n => !n.online).length, total: nodes.length, primed: monitorMeta().primed });
  }

  // Host metrics for the Monitoring gauges (all from Node built-ins + df)
  if (pathname === '/api/system/metrics' && req.method === 'GET') {
    return json({
      cpu: HOST.cpu, mem: HOST.mem, disk: HOST.disk,
      load1: Number(HOST.load1.toFixed(2)), cores: HOST.cores,
      loadPct: Math.min(100, Math.round((HOST.load1 / Math.max(1, HOST.cores)) * 100)),
      diskLabel: HOST.diskLabel,
      totalMem: os.totalmem(), freeMem: os.freemem(),
      uptime: os.uptime(), platform: os.platform(), hostname: os.hostname(),
    });
  }
};
