const fs = require("fs");
const os = require("os");
const path = require("path");

const { RECENT } = require("../activity");
const { MAIL_ACCOUNTS } = require("../domains/mail");
const { MONITOR } = require("../domains/monitor");
const { HOST } = require("../host");
const { worldHtml } = require("../pages/world");

// Open HL World: a 3D town where every Open HL job is a robot errand. The page,
// its script and the vendored three.js, plus one snapshot of what to build.
const FILES = {
  "world.js": path.join(__dirname, "../ui/world/world.js"),
  "three.module.min.js": path.join(__dirname, "../ui/vendor/three/three.module.min.js"),
  "OrbitControls.js": path.join(__dirname, "../ui/vendor/three/OrbitControls.js"),
};

// A slow Docker socket must not hold up the whole world.
function within(ms, p, fallback) {
  return Promise.race([p.catch(() => fallback), new Promise(r => setTimeout(() => r(fallback), ms))]);
}

function socialSnapshot() {
  try {
    const { SOCIAL_PLATFORMS, readSocial } = require("../domains/social/store");
    const d = readSocial();
    const accounts = d.dashboards.flatMap(x => x.accounts || []).filter(a => a.enabled !== false);
    return {
      platforms: Object.entries(SOCIAL_PLATFORMS).map(([id, m]) => ({ id, label: m.label,
        connected: m.via === "agent" || accounts.some(a => a.platform === id) })),
      queued: d.queue.filter(q => q.status === "queued").length,
    };
  } catch { return { platforms: [], queued: 0 }; }
}

function vmSnapshot() {
  try {
    const { envs } = require("../domains/vmlab/store");
    const { pidAlive } = require("../domains/vmlab/vm");
    return envs.read().slice(0, 24).map(e => ({ id: e.id, name: e.name || e.id, running: !!(e.pid && pidAlive(e.pid, e.id)) }));
  } catch { return []; }
}

function homeSnapshot() {
  try {
    const { HOMEOS_STATE, readHomeOS } = require("../domains/homeos/store");
    return readHomeOS().devices.filter(d => d.enabled !== false).slice(0, 24)
      .map(d => ({ id: d.id, name: d.name, online: !!(HOMEOS_STATE[d.id] && HOMEOS_STATE[d.id].online) }));
  } catch { return []; }
}

async function snapshot() {
  const containers = await within(1500, require("../domains/docker/containers").list(true), []);
  return {
    host: { name: os.hostname(), cpu: HOST.cpu, mem: HOST.mem },
    social: socialSnapshot(),
    nodes: Object.entries(MONITOR).map(([id, n]) => ({ id, name: n.name, kind: n.kind, online: !!n.online })),
    vms: vmSnapshot(),
    containers: containers.slice(0, 24).map(c => ({ id: c.shortId, name: c.name, running: c.state === "running" })),
    home: homeSnapshot(),
    mail: MAIL_ACCOUNTS.map(a => a.name || a.email),
    recent: RECENT.slice(-30),
    now: Date.now(),
  };
}

module.exports = async function worldRoutes(ctx) {
  const { req, res, pathname, json, html } = ctx;
  if (pathname === "/world" && req.method === "GET") return html(worldHtml());
  if (pathname === "/api/world" && req.method === "GET") return json(await snapshot());
  const m = pathname.match(/^\/world\/assets\/([\w.-]+\.js)$/);
  if (m && FILES[m[1]] && req.method === "GET") {
    const file = FILES[m[1]];
    const st = fs.statSync(file);
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Content-Length": st.size,
      "Cache-Control": m[1] === "world.js" ? "no-cache" : "public, max-age=604800" });
    return fs.createReadStream(file).pipe(res);
  }
};
