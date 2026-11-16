const fs = require("fs");
const path = require("path");

const { sendAlert } = require("../alerts");
const { AI_PEERS_FILE, dataFile, UPTIMEROBOT_KEY } = require("../config");
const { httpGet, httpPost, probePort } = require("../net");
const { SETTINGS } = require("../settings");
const { discordBotChecks, remoteBotChecks } = require("./discord-bots");
const { broadcast } = require("../sse");
const { activity } = require("../activity");
const { readJSON, writeJSONFile } = require("../store");

const NODES_FILE = dataFile("nodes.json");
if (!fs.existsSync(NODES_FILE)) fs.writeFileSync(NODES_FILE, JSON.stringify({ nodes: [] }, null, 2));
function readNodes()  { const d = readJSON(NODES_FILE, { nodes: [] }); if (!Array.isArray(d.nodes)) d.nodes = []; return d; }
function writeNodes(d){ writeJSONFile(NODES_FILE, d); broadcast("nodes_changed", {}); }

const MONITOR = {};          // id -> { name, kind, online }
// Retained history: the SSE stream is live-only, so a page opened after an
// outage would otherwise show nothing. These two rings survive between loads.
const MONITOR_LOG = [];      // last 120 online/offline transitions
const MONITOR_SERIES = [];   // last 180 check passes: { at, online, total, ms }
let lastCheckAt = 0;
let monitorPrimed = false;   // first pass = silent baseline (no false alarms on load)
// Adding a node kicks a sweep, so rapid adds could otherwise run several
// overlapping passes and churn MONITOR. Callers share the in-flight run.
let nodeCheckPromise = null;
function nodeChecks() {
  if (nodeCheckPromise) return nodeCheckPromise;
  nodeCheckPromise = nodeChecksRun().finally(() => { nodeCheckPromise = null; });
  return nodeCheckPromise;
}
async function nodeChecksRun() {
  const t0 = Date.now();
  const cur = {};
  try {
    for (const p of readJSON(AI_PEERS_FILE, [])) {
      let online = false;
      try { await httpGet(String(p.host).replace(/\/$/, "") + "/api/tags", 3000); online = true; } catch {}
      cur["ai:" + (p.id || p.host)] = { name: (p.name || p.host) + " (AI)", kind: "AI peer", online };
    }
  } catch {}
  try {
    for (const b of discordBotChecks().concat(await remoteBotChecks())) {
      cur["bot:" + b.name] = { name: b.name, kind: "Discord bot", online: b.online, detail: b.detail };
    }
  } catch {}
  if (UPTIMEROBOT_KEY) {
    try {
      const data = JSON.parse(await httpPost("https://api.uptimerobot.com/v2/getMonitors", "api_key=" + UPTIMEROBOT_KEY + "&format=json&logs=0", { "Content-Type": "application/x-www-form-urlencoded" }, 8000));
      for (const mon of (data.monitors || [])) {
        if (mon.status === 0) continue; // paused
        cur["mon:" + mon.id] = { name: mon.friendly_name || ("Monitor " + mon.id), kind: "service", online: mon.status === 2 };
      }
    } catch {}
  }
  // Custom nodes, probed in parallel so one dead host can't stall the sweep.
  try {
    const custom = readNodes().nodes.filter(n => n.enabled !== false);
    const results = await Promise.all(custom.map(async n => {
      const t = Date.now();
      let online = false, detail = "";
      try {
        if (n.check === "http" || n.check === "https") {
          const scheme = n.check === "https" ? "https://" : "http://";
          const url = scheme + n.host + ":" + n.port + (n.path || "/");
          await httpGet(url, n.timeoutMs || 4000);
          online = true;
        } else {
          online = await probePort(n.host, n.port, n.timeoutMs || 3000);
        }
      } catch (e) { detail = e.message; }
      return { n, online, ms: Date.now() - t, detail };
    }));
    for (const r of results) {
      cur["custom:" + r.n.id] = {
        name: r.n.name || (r.n.host + ":" + r.n.port),
        kind: r.n.kind || "node",
        online: r.online, host: r.n.host, port: r.n.port,
        latency: r.ms, custom: true, detail: r.detail,
      };
    }
  } catch {}
  const events = [];
  // Rebuild MONITOR in `cur` order rather than mutating in place: a plain
  // object keeps the insertion order of keys it already has, so nodes added
  // while the server was running stayed wherever they first landed and the
  // built-ins-first ordering only applied after a restart.
  const prevState = Object.assign({}, MONITOR);
  for (const k of Object.keys(MONITOR)) delete MONITOR[k];
  for (const id of Object.keys(cur)) {
    const prev = prevState[id];
    if (prev && prev.online !== cur[id].online) events.push({ id, name: cur[id].name, kind: cur[id].kind, online: cur[id].online });
    MONITOR[id] = cur[id];
  }
  const onlineNow = Object.values(cur).filter(v => v.online).length;
  lastCheckAt = t0;
  MONITOR_SERIES.push({ at: t0, online: onlineNow, total: Object.keys(cur).length, ms: Date.now() - t0 });
  if (MONITOR_SERIES.length > 180) MONITOR_SERIES.shift();
  if (monitorPrimed) for (const ev of events) {
    MONITOR_LOG.push({ at: Date.now(), name: ev.name, kind: ev.kind, online: ev.online });
    if (MONITOR_LOG.length > 120) MONITOR_LOG.shift();
    broadcast("node_status", { id: ev.id, name: ev.name, kind: ev.kind, online: ev.online, at: Date.now() });
    const recovery = !(SETTINGS.alerts && SETTINGS.alerts.recovery === false);
    if (!ev.online || recovery) sendAlert(ev.online ? "Open HL · node recovered" : "Open HL · NODE OFFLINE", ev.name + (ev.online ? " is back online" : " is offline"), !ev.online);
  }
  activity("monitor", "sweep", { count: Object.keys(cur).length, online: onlineNow, ms: Date.now() - t0, label: "Checked " + Object.keys(cur).length + " nodes, " + onlineNow + " online" });
  monitorPrimed = true;
}

// Sweep metadata for the monitoring routes. Returned as a snapshot so the
// values cannot be read through a stale binding from another module.
function monitorMeta() { return { lastCheckAt, primed: monitorPrimed }; }
setTimeout(nodeChecks, 5000);
setInterval(nodeChecks, parseInt(process.env.MONITOR_MS || "30000", 10));

module.exports = { MONITOR, MONITOR_LOG, MONITOR_SERIES, NODES_FILE, lastCheckAt, monitorMeta, monitorPrimed, nodeCheckPromise, nodeChecks, nodeChecksRun, readNodes,  writeNodes };
