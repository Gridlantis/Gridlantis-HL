const engine = require("./engine");
const { broadcast } = require("../../sse");
const { errorWithStatus } = require("../../helpers");

// ─── DOCKER · container lifecycle ────────────────────────────────────────────
// Thin, deliberate wrappers: Docker's own JSON is huge, so everything that
// reaches the browser is reshaped here into the few fields the page draws.

const err = errorWithStatus(400);
const shortId = id => String(id || "").slice(0, 12);

// "/name" -> "name"; a container can have several names, the first is primary.
const primaryName = c => String((c.Names && c.Names[0]) || "").replace(/^\//, "") || shortId(c.Id);

function publicContainer(c) {
  const ports = [];
  for (const p of c.Ports || []) {
    if (!p.PublicPort) continue;                       // unpublished: not reachable, not worth showing
    const key = p.PublicPort + "->" + p.PrivatePort + "/" + p.Type;
    if (!ports.some(x => x.key === key)) ports.push({ key, host: p.PublicPort, container: p.PrivatePort, proto: p.Type, ip: p.IP });
  }
  return {
    id: c.Id, shortId: shortId(c.Id), name: primaryName(c), image: c.Image,
    imageId: c.ImageID, command: c.Command, created: c.Created ? c.Created * 1000 : null,
    state: c.State, status: c.Status, running: c.State === "running",
    ports, mounts: (c.Mounts || []).map(m => ({ source: m.Source, target: m.Destination, rw: m.RW, type: m.Type })),
    networks: Object.keys((c.NetworkSettings && c.NetworkSettings.Networks) || {}),
    restartPolicy: (c.HostConfig && c.HostConfig.RestartPolicy) || null,
    labels: c.Labels || {},
  };
}

async function list(all = true) {
  const raw = await engine.json("GET", "/containers/json?all=" + (all ? 1 : 0));
  return (raw || []).map(publicContainer);
}

async function inspect(id) {
  const c = await engine.json("GET", "/containers/" + encodeURIComponent(id) + "/json");
  return {
    id: c.Id, shortId: shortId(c.Id), name: String(c.Name || "").replace(/^\//, ""),
    image: c.Config && c.Config.Image, state: c.State && c.State.Status, running: !!(c.State && c.State.Running),
    startedAt: c.State && c.State.StartedAt, finishedAt: c.State && c.State.FinishedAt,
    exitCode: c.State && c.State.ExitCode, error: (c.State && c.State.Error) || null,
    restartCount: c.RestartCount, created: c.Created,
    env: (c.Config && c.Config.Env) || [], cmd: (c.Config && c.Config.Cmd) || [],
    workingDir: c.Config && c.Config.WorkingDir,
    restartPolicy: c.HostConfig && c.HostConfig.RestartPolicy,
    binds: (c.HostConfig && c.HostConfig.Binds) || [],
    portBindings: (c.HostConfig && c.HostConfig.PortBindings) || {},
  };
}

// ── Create ───────────────────────────────────────────────────────────────────
// Accepts the page's flat shape and builds Docker's nested one.
//   ports:   [{ host: 8080, container: 80, proto: "tcp" }]
//   volumes: [{ source: "/srv/data", target: "/data", readOnly: false }]
//   env:     ["KEY=value"] or [{ key, value }]
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/;
const RESTART = ["no", "on-failure", "always", "unless-stopped"];

function buildCreateBody(b) {
  const image = String(b.image || "").trim();
  if (!image) throw err("choose an image");
  const exposed = {}, bindings = {};
  for (const p of Array.isArray(b.ports) ? b.ports : []) {
    const cport = parseInt(p.container, 10), hport = parseInt(p.host, 10);
    if (!cport || cport < 1 || cport > 65535) throw err("container port must be 1-65535");
    if (!hport || hport < 1 || hport > 65535) throw err("host port must be 1-65535");
    const proto = p.proto === "udp" ? "udp" : "tcp";
    const key = cport + "/" + proto;
    exposed[key] = {};
    (bindings[key] = bindings[key] || []).push({ HostIp: p.hostIp || "", HostPort: String(hport) });
  }
  const binds = [];
  for (const v of Array.isArray(b.volumes) ? b.volumes : []) {
    const src = String(v.source || "").trim(), dst = String(v.target || "").trim();
    if (!src || !dst) continue;
    if (!dst.startsWith("/")) throw err("container path must be absolute: " + dst);
    binds.push(src + ":" + dst + (v.readOnly ? ":ro" : ""));
  }
  const env = [];
  for (const e of Array.isArray(b.env) ? b.env : []) {
    if (typeof e === "string") { if (e.includes("=")) env.push(e); continue; }
    const k = String((e && e.key) || "").trim();
    if (k) env.push(k + "=" + String((e && e.value) != null ? e.value : ""));
  }
  const policy = RESTART.includes(b.restart) ? b.restart : "no";
  const body = {
    Image: image,
    Env: env,
    ExposedPorts: exposed,
    Labels: Object.assign({}, b.labels || {}, { "com.metis.managed": "true" }),
    HostConfig: {
      PortBindings: bindings,
      Binds: binds,
      RestartPolicy: { Name: policy, MaximumRetryCount: policy === "on-failure" ? (parseInt(b.maxRetries, 10) || 3) : 0 },
      Privileged: false,                               // never from the page; a deliberate floor
      AutoRemove: !!b.autoRemove && policy === "no",   // Docker rejects the two together
    },
  };
  if (b.cmd && String(b.cmd).trim()) body.Cmd = splitCommand(String(b.cmd));
  if (b.workingDir && String(b.workingDir).trim()) body.WorkingDir = String(b.workingDir).trim();
  if (b.memoryMb) body.HostConfig.Memory = Math.max(6, parseInt(b.memoryMb, 10)) * 1048576;
  if (b.cpus) body.HostConfig.NanoCpus = Math.round(parseFloat(b.cpus) * 1e9);
  return body;
}

// Good enough for a command line typed into a form: honours quotes.
function splitCommand(s) {
  const out = []; let cur = "", q = null;
  for (const ch of s.trim()) {
    if (q) { if (ch === q) q = null; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (/\s/.test(ch)) { if (cur) { out.push(cur); cur = ""; } continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

async function create(b) {
  const name = String(b.name || "").trim();
  if (name && !NAME_RE.test(name)) throw err("name may use letters, digits, dot, dash and underscore");
  const body = buildCreateBody(b);
  const q = name ? "?name=" + encodeURIComponent(name) : "";
  let res;
  try {
    res = await engine.json("POST", "/containers/create" + q, body);
  } catch (e) {
    // The most common first-run failure by far, and Docker's wording is poor.
    if (e.status === 404) throw err("image “" + body.Image + "” is not on this host — pull it first", 404);
    throw e;
  }
  broadcast("docker", { what: "containers" });
  if (b.start !== false) {
    try { await start(res.Id); }
    catch (e) { e.containerId = res.Id; throw e; }
  }
  return Object.assign({ id: res.Id, shortId: shortId(res.Id), warnings: res.Warnings || [] });
}

const act = (verb, path) => async (id, opts) => {
  await engine.json("POST", "/containers/" + encodeURIComponent(id) + path(opts || {}));
  broadcast("docker", { what: "containers", id });
  return { ok: true };
};
const start   = act("start",   () => "/start");
const stop    = act("stop",    o => "/stop?t=" + (o.timeout || 10));
const restart = act("restart", o => "/restart?t=" + (o.timeout || 10));
const kill    = act("kill",    () => "/kill");
const pause   = act("pause",   () => "/pause");
const unpause = act("unpause", () => "/unpause");

async function remove(id, { force = false, volumes = false } = {}) {
  await engine.json("DELETE", "/containers/" + encodeURIComponent(id) + "?force=" + (force ? 1 : 0) + "&v=" + (volumes ? 1 : 0));
  broadcast("docker", { what: "containers" });
  return { ok: true };
}

// ── Logs ─────────────────────────────────────────────────────────────────────
async function logs(id, { tail = 500 } = {}) {
  const res = await engine.vrequest("GET",
    "/containers/" + encodeURIComponent(id) + "/logs?stdout=1&stderr=1&timestamps=0&tail=" + parseInt(tail, 10));
  if (res.statusCode >= 400) { await engine.readAll(res); throw err("could not read logs", res.statusCode); }
  const buf = await engine.readAll(res);
  let text = "";
  engine.demuxer(t => { text += t; })(buf);
  return text;
}

// ── Stats (one sample, not a stream) ─────────────────────────────────────────
// Docker returns cumulative counters; a percentage needs the delta against the
// previous read, which is exactly what precpu_stats carries.
async function stats(id) {
  const s = await engine.json("GET", "/containers/" + encodeURIComponent(id) + "/stats?stream=false&one-shot=false");
  if (!s || !s.cpu_stats) return null;
  const cpuDelta = s.cpu_stats.cpu_usage.total_usage - ((s.precpu_stats.cpu_usage && s.precpu_stats.cpu_usage.total_usage) || 0);
  const sysDelta = s.cpu_stats.system_cpu_usage - (s.precpu_stats.system_cpu_usage || 0);
  const cores = s.cpu_stats.online_cpus || (s.cpu_stats.cpu_usage.percpu_usage || []).length || 1;
  const cpu = sysDelta > 0 && cpuDelta > 0 ? (cpuDelta / sysDelta) * cores * 100 : 0;
  const mem = s.memory_stats || {};
  // 'cache' is page cache the container can give back; Docker's own CLI subtracts it.
  const cache = (mem.stats && (mem.stats.inactive_file != null ? mem.stats.inactive_file : mem.stats.cache)) || 0;
  const used = Math.max(0, (mem.usage || 0) - cache);
  let rx = 0, tx = 0;
  for (const n of Object.values(s.networks || {})) { rx += n.rx_bytes || 0; tx += n.tx_bytes || 0; }
  return { cpu: Math.round(cpu * 10) / 10, memoryBytes: used, memoryLimit: mem.limit || 0,
    memoryPct: mem.limit ? Math.round(used / mem.limit * 1000) / 10 : 0, rxBytes: rx, txBytes: tx };
}

module.exports = { NAME_RE, RESTART, buildCreateBody, create, inspect, kill, list, logs, pause, publicContainer,
  remove, restart, splitCommand, start, stats, stop, unpause };
