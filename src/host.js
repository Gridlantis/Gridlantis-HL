const os = require("os");

// Sampling every 2s and differencing gives true utilisation with no dependencies.
let HOST = { cpu: 0, mem: 0, disk: 0, load1: 0, cores: os.cpus().length, diskLabel: '' };
let _cpuPrev = null;
function _cpuSnapshot() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) {
    for (const k of Object.keys(c.times)) total += c.times[k];
    idle += c.times.idle;
  }
  return { idle, total };
}
function sampleHost() {
  try {
    const now = _cpuSnapshot();
    if (_cpuPrev) {
      const dt = now.total - _cpuPrev.total;
      const di = now.idle - _cpuPrev.idle;
      if (dt > 0) HOST.cpu = Math.max(0, Math.min(100, Math.round((1 - di / dt) * 100)));
    }
    _cpuPrev = now;
    HOST.mem = Math.round((1 - os.freemem() / os.totalmem()) * 100);
    HOST.load1 = os.loadavg()[0];
    HOST.cores = os.cpus().length;
  } catch {}
}
sampleHost();
setInterval(sampleHost, 2000).unref?.();
// Disk is a shell-out, so poll it far less often than CPU/memory.
function sampleDisk() {
  try {
    const { execSync } = require("child_process");
    const out = execSync("df -kP /", { encoding: "utf8", timeout: 4000 });
    const line = out.trim().split("\n").pop().trim().split(/\s+/);
    const used = Number(line[2]), avail = Number(line[3]);
    if (used >= 0 && avail >= 0 && used + avail > 0) {
      HOST.disk = Math.round((used / (used + avail)) * 100);
      HOST.diskLabel = Math.round((used + avail) / 1048576) + "G total";
    }
  } catch {}
}
sampleDisk();
setInterval(sampleDisk, 60000).unref?.();

// ═══ NODE/AI MONITOR — edge-triggered offline/online, pushed over SSE ═══════════
// User-added nodes: anything reachable at host:port. Kept in its own file so a
// hand-edit can't corrupt the rest of the config.

module.exports = { HOST, _cpuPrev, _cpuSnapshot, sampleDisk, sampleHost };
