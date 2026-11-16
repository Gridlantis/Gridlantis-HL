const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const { ROOT } = require("../../config");

// ─── VM LAB · where everything lives ─────────────────────────────────────────
// vmlab/ is data, not code (gitignored): base images, persistent disks, the
// state stores, and optionally the user-space QEMU from tools/vmlab/install-qemu.sh.
const VMLAB_DIR   = path.resolve(ROOT, process.env.VMLAB_DIR || "vmlab");
const IMAGES_DIR  = path.join(VMLAB_DIR, "images");    // base disks + ISOs
const DISKS_DIR   = path.join(VMLAB_DIR, "disks");     // persistent environment disks
const SCRATCH_DIR = path.join(VMLAB_DIR, "scratch");   // throw-away overlays (deleted on stop)
const SEEDS_DIR   = path.join(VMLAB_DIR, "seeds");     // cloud-init NoCloud seed folders

// Unix sockets are limited to 108 bytes of path, so keep them short: prefer the
// per-user tmpfs, fall back to vmlab/run.
const RUN_DIR = (() => {
  const xdg = process.env.XDG_RUNTIME_DIR;
  if (xdg && fs.existsSync(xdg)) return path.join(xdg, "metis-vmlab");
  return path.join(VMLAB_DIR, "run");
})();

const ENVS_FILE   = path.join(VMLAB_DIR, "envs.json");
const IMAGES_FILE = path.join(VMLAB_DIR, "images.json");

for (const d of [VMLAB_DIR, IMAGES_DIR, DISKS_DIR, SCRATCH_DIR, SEEDS_DIR, RUN_DIR]) {
  try { fs.mkdirSync(d, { recursive: true }); } catch (e) { console.error("vmlab mkdir " + d + ": " + e.message); }
}

// ── Binaries ─────────────────────────────────────────────────────────────────
function onPath(name) {
  for (const dir of (process.env.PATH || "/usr/bin:/bin").split(":")) {
    const p = path.join(dir, name);
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch {}
  }
  return null;
}
function firstExecutable(list) {
  for (const p of list) { if (!p) continue; try { fs.accessSync(p, fs.constants.X_OK); return p; } catch {} }
  return null;
}
// Resolved on every call so installing QEMU while Metis runs needs no restart.
function qemuBinary() {
  return firstExecutable([process.env.VMLAB_QEMU, path.join(VMLAB_DIR, "qemu/bin/qemu-system-x86_64"),
    onPath("qemu-system-x86_64"), "/usr/libexec/qemu-kvm"]);
}
function qemuImgBinary() {
  return firstExecutable([process.env.VMLAB_QEMU_IMG, path.join(VMLAB_DIR, "qemu/bin/qemu-img"), onPath("qemu-img")]);
}

// UEFI firmware: a CODE image (read-only) and a VARS template copied per VM.
function ovmfFiles() {
  const dirs = [process.env.VMLAB_OVMF_DIR, path.join(VMLAB_DIR, "qemu/ovmf"), "/usr/share/OVMF", "/usr/share/edk2/ovmf", "/usr/share/edk2/x64", "/usr/share/qemu"];
  const pairs = [["OVMF_CODE_4M.fd", "OVMF_VARS_4M.fd"], ["OVMF_CODE.fd", "OVMF_VARS.fd"]];
  for (const d of dirs) {
    if (!d) continue;
    for (const [c, v] of pairs) {
      const code = path.join(d, c), vars = path.join(d, v);
      if (fs.existsSync(code) && fs.existsSync(vars)) return { code, vars };
    }
  }
  return null;
}

let _systemdRun;
function systemdRunAvailable() {
  if (_systemdRun !== undefined) return _systemdRun;
  _systemdRun = false;
  try {
    if (onPath("systemd-run") && process.env.XDG_RUNTIME_DIR) {
      execFileSync("systemctl", ["--user", "show-environment"], { stdio: "ignore", timeout: 4000 });
      _systemdRun = true;
    }
  } catch {}
  return _systemdRun;
}

function kvmAvailable() {
  try { fs.accessSync("/dev/kvm", fs.constants.R_OK | fs.constants.W_OK); return true; } catch { return false; }
}

// Other hypervisors that take VT-x/AMD-V for themselves while their VMs run.
function hypervisorConflict() {
  const names = { VirtualBoxVM: "VirtualBox", VBoxHeadless: "VirtualBox", "vmware-vmx": "VMware" };
  try {
    for (const pid of fs.readdirSync("/proc")) {
      if (!/^\d+$/.test(pid)) continue;
      let comm = ""; try { comm = fs.readFileSync("/proc/" + pid + "/comm", "utf8").trim(); } catch { continue; }
      if (names[comm]) return names[comm];
    }
  } catch {}
  return null;
}

// /dev/kvm being openable is not enough: when another hypervisor holds VT-x,
// every KVM guest dies on its first instruction ("KVM: entry failed"). Boot a
// tiny VM for a moment and ask QEMU whether it is actually running.
let _kvmProbe = { at: 0, ok: null, reason: null };
let _kvmInflight = null;
// For status displays: answer from the last probe and refresh it in the
// background, so a page load never waits for the 3-second check.
function kvmStatus() {
  if (_kvmProbe.ok === null) return kvmUsable();
  if (Date.now() - _kvmProbe.at > 30000) kvmUsable();
  return Promise.resolve(_kvmProbe);
}
function kvmUsable(force) {
  if (_kvmInflight) return _kvmInflight;
  _kvmInflight = kvmProbe(force).finally(() => { _kvmInflight = null; });
  return _kvmInflight;
}
function kvmProbe(force) {
  if (!force && _kvmProbe.ok !== null && Date.now() - _kvmProbe.at < 30000) return Promise.resolve(_kvmProbe);
  const qemu = qemuBinary();
  if (!qemu || !kvmAvailable()) {
    _kvmProbe = { at: Date.now(), ok: false, reason: !qemu ? "QEMU not installed" : "/dev/kvm not accessible" };
    return Promise.resolve(_kvmProbe);
  }
  return new Promise(resolve => {
    const { spawn } = require("child_process");
    const child = spawn(qemu, ["-machine", "q35,accel=kvm", "-cpu", "host", "-m", "64", "-display", "none", "-nodefaults",
      "-serial", "none", "-monitor", "none", "-qmp", "stdio"], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "", done = false;
    const finish = (ok, reason) => {
      if (done) return; done = true;
      try { child.kill("SIGKILL"); } catch {}
      if (!ok && !reason) { const c = hypervisorConflict(); reason = c ? c + " is running a VM and holding the CPU's virtualization extensions" : "KVM guests fail to run on this host"; }
      _kvmProbe = { at: Date.now(), ok, reason: ok ? null : reason };
      resolve(_kvmProbe);
    };
    // The failure can take a second or two to surface, so keep asking for ~3s.
    let started = false, polls = 0;
    child.stdout.on("data", d => {
      out += d;
      if (!started && out.includes('"QMP"')) {
        started = true;
        child.stdin.write('{"execute":"qmp_capabilities"}\n');
        const tick = setInterval(() => {
          if (done) return clearInterval(tick);
          if (++polls > 8) { clearInterval(tick); return finish(true, null); }
          try { child.stdin.write('{"execute":"query-status"}\n'); } catch {}
        }, 400);
      }
      if (/"status":\s*"(internal-error|guest-panicked|shutdown)"/.test(out)) finish(false);
    });
    child.stderr.on("data", d => { err += d; });
    child.on("exit", () => finish(false, (err.trim().split("\n")[0] || "").slice(0, 200) || undefined));
    child.on("error", e => finish(false, e.message));
    setTimeout(() => finish(false, "KVM probe timed out"), 8000);
  });
}

// Ids end up in file names, unit names and socket paths — keep them boring.
const safeId = s => /^[a-z0-9][a-z0-9_-]{0,40}$/i.test(String(s || ""));
const newId = prefix => prefix + Date.now().toString(36).slice(-5) + require("crypto").randomBytes(3).toString("hex");

module.exports = { DISKS_DIR, ENVS_FILE, IMAGES_DIR, IMAGES_FILE, RUN_DIR, SCRATCH_DIR, SEEDS_DIR,
  VMLAB_DIR, hypervisorConflict, kvmAvailable, kvmStatus, kvmUsable, newId, onPath, ovmfFiles, qemuBinary, qemuImgBinary, safeId, systemdRunAvailable, homedir: os.homedir };
