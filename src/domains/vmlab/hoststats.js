const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");

const { VMLAB_DIR, kvmAvailable, kvmStatus, onPath, ovmfFiles, qemuBinary, qemuImgBinary, systemdRunAvailable } = require("./paths");

// ─── VM LAB · host specs and live resource use ───────────────────────────────
const rd = f => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } };
const run = (cmd, args, t = 5000) => new Promise(r => execFile(cmd, args, { timeout: t }, (e, out) => r(e ? "" : String(out))));

let SPECS = null, specsAt = 0;
async function specs() {
  if (SPECS && Date.now() - specsAt < 5 * 60 * 1000) return SPECS;
  const cpuinfo = rd("/proc/cpuinfo");
  const model = (cpuinfo.match(/^model name\s*:\s*(.+)$/m) || [])[1] || (os.cpus()[0] || {}).model || "unknown";
  const flags = (cpuinfo.match(/^flags\s*:\s*(.+)$/m) || [])[1] || "";
  const sockets = new Set((cpuinfo.match(/^physical id\s*:\s*\d+$/gm) || [])).size || 1;
  const coresPer = parseInt((cpuinfo.match(/^cpu cores\s*:\s*(\d+)$/m) || [])[1], 10) || null;
  const threads = os.cpus().length;
  const maxMhz = parseInt(rd("/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_max_freq"), 10) / 1000 || null;

  const osRelease = rd("/etc/os-release");
  const pretty = (osRelease.match(/^PRETTY_NAME="?([^"\n]+)"?$/m) || [])[1] || os.type();

  let disks = [];
  try {
    const j = JSON.parse(await run("lsblk", ["-J", "-b", "-d", "-o", "NAME,SIZE,TYPE,MODEL,ROTA,TRAN"]));
    disks = (j.blockdevices || []).filter(d => d.type === "disk" && !/^(loop|zram|ram)/.test(d.name))
      .map(d => ({ name: d.name, sizeBytes: +d.size, model: (d.model || "").trim(), rotational: d.rota === true || d.rota === "1", transport: d.tran || null }));
  } catch {}

  let gpus = [];
  if (onPath("lspci")) {
    gpus = (await run("lspci", ["-mm"])).split("\n").filter(l => /"(VGA|3D|Display)/.test(l))
      .map(l => { const p = l.match(/"([^"]*)"/g) || []; return ((p[1] || "") + " " + (p[2] || "")).replace(/"/g, "").trim(); });
  }

  const nics = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (name === "lo") continue;
    const v4 = addrs.filter(a => a.family === "IPv4").map(a => a.address);
    if (!v4.length) continue;
    const speed = parseInt(rd("/sys/class/net/" + name + "/speed"), 10);
    nics.push({ name, addresses: v4, speedMbps: speed > 0 ? speed : null, tailscale: name.startsWith("tailscale") });
  }

  const qemu = qemuBinary();
  const qemuVersion = qemu ? ((await run(qemu, ["--version"])).match(/version ([0-9.]+)/) || [])[1] || "unknown" : null;

  SPECS = {
    hostname: os.hostname(), os: pretty, kernel: os.release(), arch: os.arch(),
    cpu: { model: model.replace(/\s+/g, " ").trim(), sockets, cores: coresPer ? coresPer * sockets : null, threads, maxMhz,
      virtualization: /\bvmx\b/.test(flags) ? "Intel VT-x" : /\bsvm\b/.test(flags) ? "AMD-V" : null },
    memoryBytes: os.totalmem(), swapBytes: memInfo().SwapTotal || 0,
    disks, gpus, nics,
    virt: { kvm: kvmAvailable(), kvmUsable: (await kvmStatus()).ok, kvmProblem: (await kvmStatus()).reason, qemu: qemu, qemuVersion, qemuImg: qemuImgBinary(), uefi: !!ovmfFiles(),
      swtpm: !!onPath("swtpm"), systemdRun: systemdRunAvailable() },
    vmlabDir: VMLAB_DIR,
  };
  specsAt = Date.now();
  return SPECS;
}
function refreshSpecs() { SPECS = null; }

function memInfo() {
  const out = {};
  for (const l of rd("/proc/meminfo").split("\n")) {
    const m = l.match(/^(\w+):\s+(\d+)/); if (m) out[m[1]] = +m[2] * 1024;
  }
  return out;
}

function cpuTimes() {
  const rows = [];
  for (const l of rd("/proc/stat").split("\n")) {
    if (!/^cpu\d*\s/.test(l)) continue;
    const v = l.trim().split(/\s+/).slice(1).map(Number);
    const idle = v[3] + (v[4] || 0), total = v.reduce((a, b) => a + b, 0);
    rows.push({ idle, total });
  }
  return rows;   // [aggregate, cpu0, cpu1, …]
}

function netTotals() {
  let rx = 0, tx = 0;
  for (const l of rd("/proc/net/dev").split("\n").slice(2)) {
    const m = l.trim().match(/^([^:]+):\s*(.+)$/);
    if (!m || m[1] === "lo" || m[1].startsWith("tailscale")) continue;   // tailscale traffic already counted on the physical NIC
    const v = m[2].split(/\s+/).map(Number);
    rx += v[0]; tx += v[8];
  }
  return { rx, tx };
}

function diskTotals() {
  let rd_ = 0, wr = 0;
  for (const l of rd("/proc/diskstats").split("\n")) {
    const v = l.trim().split(/\s+/);
    if (v.length < 14) continue;
    if (!/^(sd[a-z]+|nvme\d+n\d+|vd[a-z]+|mmcblk\d+)$/.test(v[2])) continue;   // whole disks only
    rd_ += +v[5] * 512; wr += +v[9] * 512;
  }
  return { read: rd_, write: wr };
}

function temperatureC() {
  // Prefer the CPU package sensor; ACPI thermal zones are often stuck near ambient.
  try {
    const found = {};
    for (const h of fs.readdirSync("/sys/class/hwmon")) {
      const dir = "/sys/class/hwmon/" + h;
      const name = rd(dir + "/name").trim();
      const t = parseInt(rd(dir + "/temp1_input"), 10);
      if (t > 0) found[name] = Math.round(t / 100) / 10;
    }
    for (const n of ["coretemp", "k10temp", "zenpower", "cpu_thermal", "acpitz"]) if (found[n] != null) return found[n];
  } catch {}
  return null;
}

let CLK_TCK = 100;
run("getconf", ["CLK_TCK"]).then(v => { const n = parseInt(v, 10); if (n > 0) CLK_TCK = n; });

function procUsage(pid) {
  const stat = rd("/proc/" + pid + "/stat");
  if (!stat) return null;
  const f = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
  const ticks = +f[11] + +f[12];                          // utime + stime
  const rss = (parseInt((rd("/proc/" + pid + "/status").match(/VmRSS:\s+(\d+)/) || [])[1], 10) || 0) * 1024;
  return { ticks, rss };
}

// ── Sampler: runs only while someone is looking (see touch()) ────────────────
const HISTORY = [];            // [{t, cpu, mem, swap, rxRate, txRate, readRate, writeRate, temp, vmCpu, vmMem}]
const MAX_HISTORY = 180;       // 6 minutes at 2s
let LATEST = null, prev = null, timer = null, lastTouch = 0;
let vmPidsFn = () => [];       // injected by vm.js: [{id, pid}]
const VM_USAGE = {};           // id -> {cpu, rss}
let prevVm = {};

function sample() {
  const now = Date.now();
  const cpu = cpuTimes(), mem = memInfo(), n = netTotals(), d = diskTotals();
  const cur = { t: now, cpu, n, d };
  let snap = { t: now, cpu: 0, perCore: [], mem: 0, memUsedBytes: 0, memTotalBytes: mem.MemTotal || os.totalmem(),
    swapUsedBytes: (mem.SwapTotal || 0) - (mem.SwapFree || 0), swapTotalBytes: mem.SwapTotal || 0,
    rxRate: 0, txRate: 0, readRate: 0, writeRate: 0, load: os.loadavg(), temp: temperatureC(), uptime: os.uptime(),
    vmCpu: 0, vmMemBytes: 0 };
  snap.memUsedBytes = snap.memTotalBytes - (mem.MemAvailable || os.freemem());
  snap.mem = Math.round(snap.memUsedBytes / snap.memTotalBytes * 1000) / 10;
  if (prev) {
    const dt = (now - prev.t) / 1000;
    const pct = (a, b) => { const tot = a.total - b.total; return tot > 0 ? Math.round((1 - (a.idle - b.idle) / tot) * 1000) / 10 : 0; };
    snap.cpu = pct(cpu[0], prev.cpu[0]);
    snap.perCore = cpu.slice(1).map((c, i) => prev.cpu[i + 1] ? pct(c, prev.cpu[i + 1]) : 0);
    snap.rxRate = Math.max(0, Math.round((n.rx - prev.n.rx) / dt));
    snap.txRate = Math.max(0, Math.round((n.tx - prev.n.tx) / dt));
    snap.readRate = Math.max(0, Math.round((d.read - prev.d.read) / dt));
    snap.writeRate = Math.max(0, Math.round((d.write - prev.d.write) / dt));
    // Per-VM: QEMU process CPU as % of the whole host (all threads), and RSS.
    const nextVm = {};
    for (const { id, pid } of vmPidsFn()) {
      const u = procUsage(pid);
      if (!u) continue;
      nextVm[id] = u;
      const p = prevVm[id];
      const cpuPct = p ? Math.max(0, Math.round(((u.ticks - p.ticks) / CLK_TCK) / dt / os.cpus().length * 1000) / 10) : 0;
      VM_USAGE[id] = { cpu: cpuPct, rssBytes: u.rss };
      snap.vmCpu += cpuPct; snap.vmMemBytes += u.rss;
    }
    for (const k of Object.keys(VM_USAGE)) if (!nextVm[k]) delete VM_USAGE[k];
    prevVm = nextVm;
    snap.vmCpu = Math.round(snap.vmCpu * 10) / 10;
    HISTORY.push({ t: now, cpu: snap.cpu, mem: snap.mem, rxRate: snap.rxRate, txRate: snap.txRate,
      readRate: snap.readRate, writeRate: snap.writeRate, temp: snap.temp, vmCpu: snap.vmCpu, vmMemBytes: snap.vmMemBytes });
    if (HISTORY.length > MAX_HISTORY) HISTORY.shift();
  }
  prev = cur;
  LATEST = snap;
  if (now - lastTouch > 5 * 60 * 1000) { clearInterval(timer); timer = null; }
}

// Start sampling on demand; it stops itself 5 minutes after the last viewer.
function touch() {
  lastTouch = Date.now();
  if (!timer) { sample(); timer = setInterval(sample, 2000); timer.unref?.(); }
}

function stats() {
  touch();
  let vmlabDisk = null;
  try {
    const s = fs.statfsSync ? fs.statfsSync(VMLAB_DIR) : null;
    if (s) vmlabDisk = { totalBytes: s.blocks * s.bsize, freeBytes: s.bavail * s.bsize };
  } catch {}
  return { latest: LATEST, history: HISTORY, vms: VM_USAGE, vmlabDisk };
}

module.exports = { VM_USAGE, memInfo, procUsage, refreshSpecs, setVmPids: fn => { vmPidsFn = fn; }, specs, stats, touch };
