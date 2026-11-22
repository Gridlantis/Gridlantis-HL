const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFile, spawn } = require("child_process");

const { broadcast } = require("../../sse");
const hoststats = require("./hoststats");
const images = require("./images");
const { DISKS_DIR, IMAGES_DIR, RUN_DIR, SCRATCH_DIR, SEEDS_DIR, VMLAB_DIR, kvmUsable, newId, onPath, ovmfFiles,
  qemuBinary, qemuImgBinary, safeId, systemdRunAvailable } = require("./paths");
const { hmp, qga, qmp } = require("./qmp");
const store = require("./store");
const { findUsb, listUsb } = require("./usb");
const { errorWithStatus } = require("../../helpers");

// ─── VM LAB · environment lifecycle ──────────────────────────────────────────
// An environment is one VM. Its disk is always a qcow2 overlay on a base image
// (or a blank disk for ISO installs), so the base is never modified:
//   persistent  — overlay kept in vmlab/disks; stop and start again later.
//   ephemeral   — overlay in vmlab/scratch; the environment and everything it
//                 wrote are deleted the moment the VM stops.
// QEMU runs as a transient systemd --user unit when available, so restarting
// Gridlantis-HL (or its own service) never takes running VMs down with it.
const LOG_DIR = path.join(VMLAB_DIR, "logs");
fs.mkdirSync(LOG_DIR, { recursive: true });

const runDir = id => path.join(RUN_DIR, id);
const sock = (id, n) => path.join(runDir(id), n + ".sock");
const unitName = id => "openhl-vm-" + id;
const qarg = s => String(s).replace(/,/g, ",,");            // QEMU option-value escaping

const err = errorWithStatus(400);
function execP(cmd, args, timeout = 120000) {
  return new Promise((resolve, reject) => execFile(cmd, args, { timeout, maxBuffer: 4 << 20 }, (e, out, se) => {
    if (e) { e.message = (String(se || "").trim() || e.message).slice(0, 800); return reject(e); }
    resolve(String(out));
  }));
}

// ── Process tracking ─────────────────────────────────────────────────────────
function readPid(id) {
  try { return parseInt(fs.readFileSync(path.join(runDir(id), "qemu.pid"), "utf8"), 10) || null; } catch { return null; }
}
function pidAlive(pid, id) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    // Guard against pid reuse after a reboot: it must still be our QEMU.
    const cmd = fs.readFileSync("/proc/" + pid + "/cmdline", "utf8");
    return cmd.includes(unitName(id));
  } catch { return false; }
}
hoststats.setVmPids(() => store.envs.read().filter(e => e.pid && e.status !== "stopped").map(e => ({ id: e.id, pid: e.pid })));

// ── Validation / normalization ───────────────────────────────────────────────
const clampInt = (v, lo, hi, def) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };

// Default guest login: the account Gridlantis-HL itself runs as, so a new VM has the
// same username you already type on this machine.
function defaultUser() {
  try { return require("os").userInfo().username || "user"; } catch { return "user"; }
}

function normalizeSpec(b, base) {
  const s = Object.assign({}, base || {}, b || {});
  const os = require("os");
  const img = s.imageId ? images.getImage(s.imageId) : null;
  const iso = s.isoId ? images.getImage(s.isoId) : null;
  if (s.imageId && !img) throw err("base image not found");
  if (s.isoId && !iso) throw err("ISO not found");
  if (!img && !iso) throw err("choose an operating system image or ISO");
  if (img && img.kind === "iso") {                       // an ISO chosen as "the image" means install/live from it
    s.isoId = img.id; s.imageId = null;
  }
  const primary = img && img.kind !== "iso" ? img : (iso || img);
  const spec = {
    name: String(s.name || primary.name).trim().slice(0, 80) || primary.name,
    imageId: s.imageId || null,
    isoId: s.isoId || null,
    driverIsoId: s.driverIsoId && images.getImage(s.driverIsoId) ? s.driverIsoId : null,
    family: ["linux", "windows", "android", "other"].includes(s.family) ? s.family : (primary.family || "linux"),
    desktop: s.desktop != null ? !!s.desktop : !!primary.desktop,
    firmware: (s.firmware || primary.firmware) === "uefi" ? "uefi" : "bios",
    cpus: clampInt(s.cpus, 1, os.cpus().length, 2),
    memoryMb: clampInt(s.memoryMb, 256, Math.floor(os.totalmem() / 1048576) - 512, 2048),
    diskGb: clampInt(s.diskGb, 1, 2048, 20),
    persistent: !!s.persistent,
    network: ["nat", "isolated", "none"].includes(s.network) ? s.network : "nat",
    usb: {
      enabled: !!(s.usb && s.usb.enabled),
      devices: (s.usb && Array.isArray(s.usb.devices) ? s.usb.devices : []).slice(0, 8).map(d => ({
        vendorId: String(d.vendorId || "").toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 4),
        productId: String(d.productId || "").toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 4),
        serial: String(d.serial || "").slice(0, 64), label: String(d.label || "").slice(0, 80),
      })).filter(d => d.vendorId.length === 4 && d.productId.length === 4),
    },
    cloudInit: null,
    clipboard: s.clipboard !== false,
    // Mobile VMs: a phone-shaped display, and the image's documented login.
    mobile: !!s.mobile,
    screen: s.screen && +s.screen.w && +s.screen.h ? { w: clampInt(s.screen.w, 320, 3840, 720), h: clampInt(s.screen.h, 320, 3840, 1440) } : null,
    login: s.login && s.login.user ? { user: String(s.login.user).slice(0, 32), password: String(s.login.password || "").slice(0, 64) } : null,
  };
  const wantsCi = s.cloudInit && s.cloudInit.enabled !== undefined ? !!s.cloudInit.enabled : !!(img && img.cloudInit);
  if (wantsCi && spec.imageId) {
    const ci = s.cloudInit || {};
    spec.cloudInit = {
      enabled: true,
      username: (String(ci.username || defaultUser()).toLowerCase().replace(/[^a-z0-9_-]/g, "") || "user").slice(0, 32),
      password: String(ci.password || "") || crypto.randomBytes(6).toString("base64").replace(/[^a-zA-Z0-9]/g, "x").slice(0, 10),
      admin: ci.admin !== false,
      packages: (Array.isArray(ci.packages) ? ci.packages : String(ci.packages || "").split(/[\s,]+/))
        .map(p => String(p).trim()).filter(p => /^[a-zA-Z0-9.+_:-]+$/.test(p)).slice(0, 60),
      runcmd: (Array.isArray(ci.runcmd) ? ci.runcmd : String(ci.runcmd || "").split("\n"))
        .map(c => String(c).trim()).filter(Boolean).slice(0, 60),
    };
  }
  return spec;
}

// ── Disk + seed preparation ──────────────────────────────────────────────────
async function prepareDisk(env) {
  const qimg = qemuImgBinary();
  if (!qimg) throw err("qemu-img not found — run tools/vmlab/install-qemu.sh", 500);
  if (env.diskPath && fs.existsSync(env.diskPath)) return;
  const dir = env.persistent ? DISKS_DIR : SCRATCH_DIR;
  const disk = path.join(dir, env.id + ".qcow2");
  // Never recreate over an existing disk — for a persistent VM that is your work.
  if (fs.existsSync(disk)) { env.diskPath = disk; return; }
  const size = env.diskGb + "G";
  if (env.imageId) {
    const img = images.getImage(env.imageId);
    if (!img) throw err("the base image for this environment was deleted");
    let fmt = img.format;
    if (!fmt) { const info = await images.qemuImgInfo(img.path); fmt = (info && info.format) || "qcow2"; }
    // An overlay may not be smaller than its base.
    const info = await images.qemuImgInfo(img.path);
    const baseBytes = info ? info["virtual-size"] : 0;
    const want = Math.max(env.diskGb * 1073741824, baseBytes);
    await execP(qimg, ["create", "-q", "-f", "qcow2", "-F", fmt, "-b", img.path, disk, String(want)]);
  } else {
    await execP(qimg, ["create", "-q", "-f", "qcow2", disk, size]);
  }
  env.diskPath = disk;
}

function writeSeed(env) {
  if (!env.cloudInit || !env.cloudInit.enabled) return null;
  const dir = path.join(SEEDS_DIR, env.id);
  fs.mkdirSync(dir, { recursive: true });
  const ci = env.cloudInit;
  const host = ("vm-" + env.name).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "vm-" + env.id;
  const img = env.imageId ? images.getImage(env.imageId) : null;
  const alpine = img && img.distro === "alpine";
  const user = { name: ci.username, gecos: "VM Lab user", lock_passwd: false, plain_text_passwd: ci.password };
  if (!alpine) user.shell = "/bin/bash";
  if (ci.admin) { user.sudo = "ALL=(ALL) NOPASSWD:ALL"; user.groups = alpine ? "wheel" : "sudo"; }
  const pkgs = ["qemu-guest-agent"].concat(env.desktop && !alpine ? ["spice-vdagent"] : []).concat(ci.packages);
  const cfg = {
    hostname: host,
    users: ["default", user],
    ssh_pwauth: true,
    chpasswd: { expire: false },
    package_update: true,
    packages: Array.from(new Set(pkgs)),
    runcmd: [
      ["sh", "-c", "systemctl enable --now qemu-guest-agent 2>/dev/null || { rc-update add qemu-guest-agent default; rc-service qemu-guest-agent start; } || true"],
    ].concat(ci.runcmd.map(c => ["sh", "-c", c])),
    final_message: "VM Lab: cloud-init finished after $UPTIME seconds",
  };
  // JSON is valid YAML, and it sidesteps every YAML quoting pitfall in passwords and commands.
  fs.writeFileSync(path.join(dir, "user-data"), "#cloud-config\n" + JSON.stringify(cfg, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "meta-data"), "instance-id: openhl-" + env.id + "\nlocal-hostname: " + host + "\n");
  return dir;
}

// ── QEMU command line ────────────────────────────────────────────────────────
function buildArgs(env, opts) {
  const kvm = !!opts.kvm;
  const win = env.family === "windows";
  const rd = runDir(env.id);
  const a = [];
  a.push("-name", "openhl-vm-" + env.id + ",process=openhl-vm-" + env.id);
  a.push("-machine", "q35,accel=" + (kvm ? "kvm" : "tcg"));
  a.push("-cpu", kvm ? (win ? "host,hv_relaxed,hv_spinlocks=0x1fff,hv_vapic,hv_time" : "host") : "max");
  a.push("-smp", String(env.cpus), "-m", String(env.memoryMb));
  a.push("-display", "none", "-vnc", "unix:" + qarg(sock(env.id, "vnc")));
  a.push("-qmp", "unix:" + qarg(sock(env.id, "qmp")) + ",server=on,wait=off");
  a.push("-pidfile", path.join(rd, "qemu.pid"));
  a.push("-serial", "file:" + qarg(path.join(LOG_DIR, env.id + ".serial.log")));
  a.push("-device", "virtio-serial-pci,id=vser0");
  a.push("-chardev", "socket,id=qga0,path=" + qarg(sock(env.id, "qga")) + ",server=on,wait=off");
  a.push("-device", "virtserialport,bus=vser0.0,chardev=qga0,name=org.qemu.guest_agent.0");
  if (env.clipboard !== false) {
    // Clipboard bridge: QEMU's VNC server <-> spice-vdagent inside the guest.
    a.push("-chardev", "qemu-vdagent,id=vdagent0,name=vdagent,clipboard=on,mouse=off");
    a.push("-device", "virtserialport,bus=vser0.0,chardev=vdagent0,name=com.redhat.spice.0");
  }
  a.push("-device", "qemu-xhci,id=xhci", "-device", "usb-tablet,bus=xhci.0");
  // Android-x86 / Bliss without 3D (VNC has no GL) start their UI on QEMU's
  // standard VGA (bochs-drm), but not on virtio-vga.
  if (env.screen && env.family !== "android") {
    // Phone-shaped: virtio-gpu's preferred mode is what the guest's compositor starts with.
    a.push("-vga", "none", "-device", "virtio-vga,xres=" + env.screen.w + ",yres=" + env.screen.h);
  } else a.push("-vga", env.desktop && !win && env.family !== "android" ? "virtio" : "std");
  a.push("-rtc", win ? "base=localtime" : "base=utc");

  if (env.firmware === "uefi") {
    const fw = ovmfFiles();
    if (!fw) throw err("UEFI firmware (OVMF) not found — install the ovmf package or run tools/vmlab/install-qemu.sh", 500);
    const vars = path.join(env.persistent ? DISKS_DIR : SCRATCH_DIR, env.id + ".vars.fd");
    if (!fs.existsSync(vars)) fs.copyFileSync(fw.vars, vars);
    a.push("-drive", "if=pflash,format=raw,readonly=on,file=" + qarg(fw.code));
    a.push("-drive", "if=pflash,format=raw,file=" + qarg(vars));
  }

  const isoFirst = !!(env.isoId && env.bootFromIso);
  a.push("-drive", "file=" + qarg(env.diskPath) + ",if=none,id=disk0,format=qcow2,discard=unmap");
  // env.diskBus = "sata" attaches the disk via AHCI instead of virtio — needed by live
  // distros (e.g. Puppy) whose initrd can't see virtio disks when looking for a save layer.
  const sataDisk = win || env.diskBus === "sata";
  a.push("-device", (sataDisk ? "ide-hd,bus=ide.0" : "virtio-blk-pci") + ",drive=disk0,id=disk0dev,bootindex=" + (isoFirst ? 2 : 1));
  if (env.isoId) {
    const iso = images.getImage(env.isoId);
    if (!iso) throw err("the ISO for this environment was deleted");
    a.push("-drive", "file=" + qarg(iso.path) + ",if=none,id=cd0,media=cdrom,readonly=on,format=raw");
    a.push("-device", "ide-cd,bus=ide.1,drive=cd0,id=cdrom0,bootindex=" + (isoFirst ? 1 : 3));
  }
  if (env.driverIsoId) {
    const d = images.getImage(env.driverIsoId);
    if (d) {
      a.push("-drive", "file=" + qarg(d.path) + ",if=none,id=cd1,media=cdrom,readonly=on,format=raw");
      a.push("-device", "ide-cd,bus=ide.2,drive=cd1,id=cdrom1");
    }
  }
  if (opts.seedDir) {
    a.push("-blockdev", "driver=vvfat,node-name=seed0,dir=" + qarg(opts.seedDir) + ",label=CIDATA,read-only=on");
    a.push("-device", "virtio-blk-pci,drive=seed0,id=seed0dev");
  }

  if (env.network === "none") a.push("-nic", "none");
  else {
    // One forward per VM, on a free host port (read back via "info usernet"):
    // RDP for Windows, adb for Android (Mobile host connects to it), else SSH.
    let fwd = "hostfwd=tcp:127.0.0.1:0-:" + (win ? 3389 : env.family === "android" ? 5555 : 22);
    // Optional extra fixed forwards, always bound to loopback only:
    // env.forwards = [{ host: 9000, guest: 9000 }]
    for (const f of Array.isArray(env.forwards) ? env.forwards : []) {
      const h = +f.host, g = +f.guest;
      if (Number.isInteger(h) && Number.isInteger(g) && h > 0 && h < 65536 && g > 0 && g < 65536)
        fwd += ",hostfwd=tcp:127.0.0.1:" + h + "-:" + g;
    }
    a.push("-netdev", "user,id=n0," + fwd + (env.network === "isolated" ? ",restrict=on" : ""));
    a.push("-device", (win ? "e1000e" : "virtio-net-pci") + ",netdev=n0");
  }
  if (opts.tpmSock) {
    a.push("-chardev", "socket,id=chrtpm,path=" + qarg(opts.tpmSock));
    a.push("-tpmdev", "emulator,id=tpm0,chardev=chrtpm", "-device", "tpm-tis,tpmdev=tpm0");
  }
  return a;
}

// ── Start ────────────────────────────────────────────────────────────────────
const STARTING = new Set();

async function startEnv(id, { forceTcg = false } = {}) {
  const env0 = store.envs.read().find(e => e.id === id);
  if (!env0) throw err("environment not found", 404);
  if (STARTING.has(id)) throw err("already starting", 409);
  if (env0.pid && pidAlive(env0.pid, id)) throw err("already running", 409);
  const qemu = qemuBinary();
  if (!qemu) throw err("QEMU is not installed on the host — run tools/vmlab/install-qemu.sh", 500);

  STARTING.add(id);
  store.updateEnv(id, { status: "starting", error: null });
  const logFile = path.join(LOG_DIR, id + ".qemu.log");
  try {
    const env = store.envs.read().find(e => e.id === id);
    await prepareDisk(env);
    store.updateEnv(id, { diskPath: env.diskPath });
    const seedDir = writeSeed(env);
    fs.rmSync(runDir(id), { recursive: true, force: true });
    fs.mkdirSync(runDir(id), { recursive: true, mode: 0o700 });

    let tpmSock = null;
    if (env.family === "windows" && env.firmware === "uefi" && onPath("swtpm")) {
      const tpmState = path.join(env.persistent ? DISKS_DIR : SCRATCH_DIR, id + ".tpm");
      fs.mkdirSync(tpmState, { recursive: true });
      tpmSock = path.join(runDir(id), "tpm.sock");
      await execP("swtpm", ["socket", "--tpmstate", "dir=" + tpmState, "--ctrl", "type=unixio,path=" + tpmSock,
        "--tpm2", "--daemon", "--terminate"], 10000);
    }

    const probe = forceTcg ? { ok: false, reason: "KVM failed for this VM a moment ago" } : await kvmUsable();
    const args = buildArgs(env, { seedDir, tpmSock, kvm: probe.ok });
    const accelWarning = probe.ok ? null : "Running without hardware acceleration (" + probe.reason + "), so this VM is much slower than normal.";
    fs.writeFileSync(logFile, "── " + new Date().toISOString() + " start\n" + qemu + " " + args.join(" ") + "\n");

    let viaSystemd = false;
    if (systemdRunAvailable()) {
      try { await execP("systemctl", ["--user", "reset-failed", unitName(id)], 5000); } catch {}
      try {
        await execP("systemd-run", ["--user", "--collect", "--quiet", "--unit=" + unitName(id),
          "--description=Gridlantis-HL VM Lab · " + env.name,
          "-p", "StandardOutput=append:" + logFile, "-p", "StandardError=append:" + logFile,
          "-p", "TimeoutStopSec=20", "--", qemu].concat(args), 15000);
        viaSystemd = true;
      } catch (e) {
        console.error("[vmlab] systemd-run failed, starting QEMU directly:", e.message);
      }
    }
    if (!viaSystemd) {
      const fd = fs.openSync(logFile, "a");
      const child = spawn(qemu, args, { detached: true, stdio: ["ignore", fd, fd] });
      child.unref(); fs.closeSync(fd);
    }

    // Wait for the monitor socket (QEMU is up) or for the process to die.
    const t0 = Date.now();
    let pid = null;
    for (;;) {
      await new Promise(r => setTimeout(r, 250));
      pid = pid || readPid(id);
      if (pid && fs.existsSync(sock(id, "qmp"))) {
        try { await qmp(sock(id, "qmp"), "query-status", 2000); break; } catch {}
      }
      const dead = pid ? !pidAlive(pid, id) : Date.now() - t0 > 4000 && !(await unitActive(id, viaSystemd));
      if (dead || Date.now() - t0 > 30000) {
        const log = tailFile(logFile, 2000).split("\n").filter(l => l && !l.startsWith("──") && !l.startsWith(qemu)).slice(-6).join("\n");
        throw err("QEMU did not start" + (log ? ": " + log : ""), 500);
      }
    }

    let sshPort = null;
    try {
      const usernet = await hmp(sock(id, "qmp"), "info usernet");
      const m = String(usernet).match(/HOST_FORWARD\]\s+\d+\s+127\.0\.0\.1\s+(\d+)\s+\S+\s+(?:22|3389|5555)\s/);
      if (m) sshPort = +m[1];
    } catch {}

    // A guest that dies on its first instruction means KVM broke after the probe
    // (e.g. VirtualBox started a VM) — retry once in software emulation.
    if (probe.ok) {
      await new Promise(r => setTimeout(r, 2500));
      let st = null; try { st = await qmp(sock(id, "qmp"), "query-status", 2000); } catch {}
      if (st && st.status === "internal-error") {
        try { await qmp(sock(id, "qmp"), "quit", 2000); } catch {}
        for (let i = 0; i < 40 && pidAlive(pid, id); i++) await new Promise(r => setTimeout(r, 100));
        kvmUsable(true);
        STARTING.delete(id);
        return startEnv(id, { forceTcg: true });
      }
    }

    store.updateEnv(id, { status: "running", pid, unit: viaSystemd ? unitName(id) : null, sshPort, bootFromIso: false,
      startedAt: new Date().toISOString(), usbAttached: [], error: null, agent: false, clipboardAgent: false, accel: probe.ok ? "kvm" : "tcg" });

    const warnings = accelWarning ? [accelWarning] : [];
    if (env.usb && env.usb.enabled) {
      for (const d of env.usb.devices) {
        try { await usbAttach(id, d); } catch (e) { warnings.push((d.label || d.vendorId + ":" + d.productId) + ": " + e.message); }
      }
    }
    store.updateEnv(id, { warnings });
    return store.envs.read().find(e => e.id === id);
  } catch (e) {
    const cur = store.envs.read().find(x => x.id === id);
    if (cur) await cleanupAfterExit(cur, { error: e.message });
    throw e;
  } finally {
    STARTING.delete(id);
  }
}

async function unitActive(id, viaSystemd) {
  if (!viaSystemd) return true;
  try { return (await execP("systemctl", ["--user", "is-active", unitName(id)], 3000)).trim() === "active"; } catch { return false; }
}

function tailFile(f, bytes) {
  try {
    const st = fs.statSync(f);
    const fd = fs.openSync(f, "r");
    const len = Math.min(bytes, st.size);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, st.size - len);
    fs.closeSync(fd);
    return buf.toString("utf8");
  } catch { return ""; }
}

async function rebootEnv(id) {
  const env = store.envs.read().find(e => e.id === id);
  if (!env || !env.pid || !pidAlive(env.pid, id)) throw err("the VM is not running", 409);
  await qmp(sock(id, "qmp"), "system_reset", 3000);
  return { ok: true };
}

// ── Stop / exit handling ─────────────────────────────────────────────────────
async function stopEnv(id, { force = false } = {}) {
  const env = store.envs.read().find(e => e.id === id);
  if (!env) throw err("environment not found", 404);
  if (!env.pid || !pidAlive(env.pid, id)) { await cleanupAfterExit(env); return { ok: true, stopped: true }; }
  if (force) {
    try { await qmp(sock(id, "qmp"), "quit", 3000); } catch { try { process.kill(env.pid, "SIGKILL"); } catch {} }
  } else {
    await qmp(sock(id, "qmp"), "system_powerdown", 3000);
    store.updateEnv(id, { status: "stopping", stopRequestedAt: new Date().toISOString() });
  }
  return { ok: true, stopped: false };
}

async function cleanupAfterExit(env, extra = {}) {
  const id = env.id;
  fs.rmSync(runDir(id), { recursive: true, force: true });
  if (!env.persistent) {
    for (const f of [env.diskPath, path.join(SCRATCH_DIR, id + ".vars.fd")]) { try { if (f) fs.unlinkSync(f); } catch {} }
    fs.rmSync(path.join(SCRATCH_DIR, id + ".tpm"), { recursive: true, force: true });
    fs.rmSync(path.join(SEEDS_DIR, id), { recursive: true, force: true });
    if (!extra.error) {
      // Ephemeral: nothing about the VM survives.
      store.envs.write(store.envs.read().filter(e => e.id !== id), "envs");
      broadcast("vmlab", { what: "envs", event: "discarded", id });
      return;
    }
    extra.diskPath = null;
  }
  store.updateEnv(id, Object.assign({ status: extra.error ? "error" : "stopped", pid: null, unit: null, sshPort: null,
    usbAttached: [], agent: false, clipboardAgent: false, stoppedAt: new Date().toISOString() }, extra));
}

// Watch running VMs: notice shutdowns from inside the guest, reattach after a
// Gridlantis-HL restart, and probe the guest agent so the UI can show it.
let watchBusy = false;
async function watch() {
  if (watchBusy) return;
  watchBusy = true;
  const pings = [];
  try {
    for (const env of store.envs.read()) {
      if (STARTING.has(env.id)) continue;
      if (!["running", "stopping", "starting"].includes(env.status)) continue;
      const pid = env.pid || readPid(env.id);
      if (!pidAlive(pid, env.id)) { await cleanupAfterExit(env); continue; }
      if (env.status === "starting") store.updateEnv(env.id, { status: "running", pid });
      if (env.accel === "kvm" && !STARTING.has(env.id)) {
        let st = null; try { st = await qmp(sock(env.id, "qmp"), "query-status", 1500); } catch {}
        if (st && st.status === "internal-error") {
          // KVM broke underneath a running VM (another hypervisor started). Its
          // state is gone either way; boot it again in software emulation.
          console.error("[vmlab] " + env.id + " hit a KVM internal error — restarting without acceleration");
          try { await qmp(sock(env.id, "qmp"), "quit", 2000); } catch {}
          for (let i = 0; i < 50 && pidAlive(pid, env.id); i++) await new Promise(r => setTimeout(r, 100));
          fs.rmSync(runDir(env.id), { recursive: true, force: true });
          store.updateEnv(env.id, { status: "stopped", pid: null });
          kvmUsable(true);
          startEnv(env.id, { forceTcg: true }).catch(e => console.error("[vmlab] restart failed:", e.message));
          continue;
        }
      }
      if (env.status === "stopping" && env.stopRequestedAt && Date.now() - Date.parse(env.stopRequestedAt) > 120000) {
        store.updateEnv(env.id, { warnings: ["The guest ignored the shutdown request for 2 minutes. Use Force off."] });
      }
      pings.push(qga(sock(env.id, "qga"), "guest-ping", null, 1500).then(() => true, () => false)
        .then(agent => { if (agent !== !!env.agent) store.updateEnv(env.id, { agent }); }));
      // The shared clipboard only works while spice-vdagent inside the guest
      // holds its end of the vdagent port open — the console says so when not.
      if (env.clipboard !== false) {
        pings.push(qmp(sock(env.id, "qmp"), "query-chardev", 1500)
          .then(list => (list || []).some(c => c.label === "vdagent0" && c["frontend-open"]), () => null)
          .then(on => { if (on !== null && on !== !!env.clipboardAgent) store.updateEnv(env.id, { clipboardAgent: on }); }));
      }
    }
    await Promise.all(pings);   // agents that do not answer cost 1.5s each — check them in parallel
  } catch (e) { console.error("[vmlab] watch:", e.message); }
  finally { watchBusy = false; }
}
let watchTimer = null;
function startWatcher() {
  if (watchTimer) return;
  watch();
  watchTimer = setInterval(watch, 4000);
  watchTimer.unref?.();
}

// ── Create / delete / reset / save ───────────────────────────────────────────
async function createEnv(body) {
  const spec = normalizeSpec(body);
  const env = Object.assign(spec, {
    id: newId("vm"), name: body.name || spec.name,
    status: "stopped", pid: null, diskPath: null, sshPort: null, usbAttached: [],
    bootFromIso: !!spec.isoId, createdAt: new Date().toISOString(), agent: false,
  });
  if (!safeId(env.id)) throw err("internal id error", 500);
  const all = store.envs.read();
  all.push(env);
  store.envs.write(all, "envs");
  if (body.start !== false) {
    try { await startEnv(env.id); }
    catch (e) { const cur = store.envs.read().find(x => x.id === env.id); e.env = cur; throw e; }
  }
  return store.envs.read().find(e => e.id === env.id) || env;
}

async function deleteEnv(id) {
  const env = store.envs.read().find(e => e.id === id);
  if (!env) throw err("environment not found", 404);
  if (env.pid && pidAlive(env.pid, id)) {
    try { await qmp(sock(id, "qmp"), "quit", 3000); } catch { try { process.kill(env.pid, "SIGKILL"); } catch {} }
    for (let i = 0; i < 40 && pidAlive(env.pid, id); i++) await new Promise(r => setTimeout(r, 150));
  }
  fs.rmSync(runDir(id), { recursive: true, force: true });
  for (const d of [DISKS_DIR, SCRATCH_DIR]) {
    for (const suffix of [".qcow2", ".vars.fd"]) { try { fs.unlinkSync(path.join(d, id + suffix)); } catch {} }
    fs.rmSync(path.join(d, id + ".tpm"), { recursive: true, force: true });
  }
  fs.rmSync(path.join(SEEDS_DIR, id), { recursive: true, force: true });
  for (const f of [".qemu.log", ".serial.log"]) { try { fs.unlinkSync(path.join(LOG_DIR, id + f)); } catch {} }
  store.envs.write(store.envs.read().filter(e => e.id !== id), "envs");
  return { ok: true };
}

function requireStopped(env) {
  if (env.pid && pidAlive(env.pid, env.id)) throw err("stop the environment first", 409);
}

async function resetEnv(id) {
  const env = store.envs.read().find(e => e.id === id);
  if (!env) throw err("environment not found", 404);
  requireStopped(env);
  for (const f of [env.diskPath, path.join(DISKS_DIR, id + ".vars.fd")]) { try { if (f) fs.unlinkSync(f); } catch {} }
  fs.rmSync(path.join(DISKS_DIR, id + ".tpm"), { recursive: true, force: true });
  return store.updateEnv(id, { diskPath: null, bootFromIso: !!env.isoId, status: "stopped", error: null });
}

function updateEnvSettings(id, b) {
  const env = store.envs.read().find(e => e.id === id);
  if (!env) throw err("environment not found", 404);
  const patch = {};
  if (b.name !== undefined) patch.name = String(b.name).trim().slice(0, 80) || env.name;
  if (b.bootFromIso !== undefined) patch.bootFromIso = !!b.bootFromIso && !!env.isoId;
  const running = env.pid && pidAlive(env.pid, id);
  if (!running) {
    const os = require("os");
    if (b.cpus !== undefined) patch.cpus = clampInt(b.cpus, 1, os.cpus().length, env.cpus);
    if (b.memoryMb !== undefined) patch.memoryMb = clampInt(b.memoryMb, 256, Math.floor(os.totalmem() / 1048576) - 512, env.memoryMb);
    if (b.network !== undefined && ["nat", "isolated", "none"].includes(b.network)) patch.network = b.network;
    if (b.usbEnabled !== undefined) patch.usb = Object.assign({}, env.usb, { enabled: !!b.usbEnabled });
    if (b.clipboard !== undefined) patch.clipboard = !!b.clipboard;
  }
  return store.updateEnv(id, patch);
}

const SAVE_JOBS = new Map();
async function saveAsImage(id, name) {
  const env = store.envs.read().find(e => e.id === id);
  if (!env) throw err("environment not found", 404);
  requireStopped(env);
  if (!env.diskPath || !fs.existsSync(env.diskPath)) throw err("this environment has no disk yet — start it once first");
  const qimg = qemuImgBinary();
  const file = images.uniqueFileName(String(name || env.name).replace(/\s+/g, "-") + ".qcow2");
  const job = { id: newId("sv"), envId: id, file, status: "converting", startedAt: new Date().toISOString() };
  SAVE_JOBS.set(job.id, job);
  store.updateEnv(id, { saving: true });
  (async () => {
    const part = path.join(IMAGES_DIR, file + ".part");
    try {
      // Flatten overlay + base into a standalone, compressed image.
      await execP(qimg, ["convert", "-O", "qcow2", "-c", env.diskPath, part], 6 * 3600 * 1000);
      fs.renameSync(part, path.join(IMAGES_DIR, file));
      const src = env.imageId ? images.getImage(env.imageId) : env.isoId ? images.getImage(env.isoId) : null;
      const rec = await images.registerFile(file, { name: String(name || env.name + " (saved)").slice(0, 80), family: env.family,
        desktop: env.desktop, firmware: env.firmware, distro: src ? src.distro : null,
        cloudInit: !!(src && src.kind !== "iso" && src.cloudInit), source: "saved:" + env.name });
      job.status = "done"; job.imageId = rec.id;
    } catch (e) {
      try { fs.unlinkSync(part); } catch {}
      job.status = "error"; job.error = e.message;
    }
    store.updateEnv(id, { saving: false, lastSave: { status: job.status, error: job.error || null, imageId: job.imageId || null, at: new Date().toISOString() } });
  })();
  return job;
}

// ── USB passthrough ──────────────────────────────────────────────────────────
async function usbAttach(id, sel) {
  const env = store.envs.read().find(e => e.id === id);
  if (!env) throw err("environment not found", 404);
  if (!env.usb || !env.usb.enabled) throw err("USB passthrough is turned off for this environment");
  if (!env.pid || !pidAlive(env.pid, id)) throw err("the VM is not running", 409);
  const dev = findUsb(sel);
  if (!dev) throw err("device is not plugged in");
  if (!dev.accessible) throw err("no permission for " + dev.node + " — run tools/vmlab/setup-host.sh on the host once", 403);
  for (const other of store.envs.read()) {
    if ((other.usbAttached || []).some(u => u.key === dev.key)) {
      throw err(other.id === id ? "already attached" : "already attached to " + other.name, 409);
    }
  }
  const qid = "usb" + dev.busnum + "x" + dev.devnum;
  await qmp(sock(id, "qmp"), { execute: "device_add", arguments: { driver: "usb-host", bus: "xhci.0", id: qid, hostbus: dev.busnum, hostaddr: dev.devnum } });
  const entry = { qid, key: dev.key, vendorId: dev.vendorId, productId: dev.productId, serial: dev.serial, product: dev.product, attachedAt: new Date().toISOString() };
  store.updateEnv(id, e => ({ usbAttached: (e.usbAttached || []).filter(u => u.key !== dev.key).concat([entry]) }));
  return entry;
}

async function usbDetach(id, qid) {
  const env = store.envs.read().find(e => e.id === id);
  if (!env) throw err("environment not found", 404);
  const entry = (env.usbAttached || []).find(u => u.qid === qid || u.key === qid);
  if (!entry) throw err("not attached", 404);
  try { await qmp(sock(id, "qmp"), { execute: "device_del", arguments: { id: entry.qid } }); }
  catch (e) { if (!/not found/i.test(e.message)) throw e; }
  store.updateEnv(id, e => ({ usbAttached: (e.usbAttached || []).filter(u => u.qid !== entry.qid) }));
  return { ok: true };
}

// ── Removable media ──────────────────────────────────────────────────────────
async function changeIso(id, isoId) {
  const env = store.envs.read().find(e => e.id === id);
  if (!env) throw err("environment not found", 404);
  if (!env.pid || !pidAlive(env.pid, id)) {
    return store.updateEnv(id, { isoId: isoId || null, bootFromIso: false });
  }
  if (!env.isoId && isoId) throw err("this VM was started without a CD drive — stop it, pick the ISO, and start again", 409);
  if (!isoId) {
    await qmp(sock(id, "qmp"), { execute: "eject", arguments: { id: "cdrom0", force: true } });
  } else {
    const iso = images.getImage(isoId);
    if (!iso || iso.kind !== "iso") throw err("ISO not found", 404);
    await qmp(sock(id, "qmp"), { execute: "blockdev-change-medium", arguments: { id: "cdrom0", filename: iso.path, format: "raw", "read-only-mode": "read-only" } });
  }
  return store.updateEnv(id, { isoId: isoId || env.isoId });
}

// ── Guest info (through the agent) ───────────────────────────────────────────
async function guestInfo(id) {
  const env = store.envs.read().find(e => e.id === id);
  if (!env) throw err("environment not found", 404);
  const s = sock(id, "qga");
  const out = { agent: false };
  try { await qga(s, "guest-ping", null, 2000); out.agent = true; } catch (e) { out.error = e.message; return out; }
  try { out.os = await qga(s, "guest-get-osinfo"); } catch {}
  try { out.hostname = (await qga(s, "guest-get-host-name"))["host-name"]; } catch {}
  try {
    out.ips = (await qga(s, "guest-network-get-interfaces")).filter(i => i.name !== "lo")
      .flatMap(i => (i["ip-addresses"] || []).filter(a => a["ip-address-type"] === "ipv4").map(a => i.name + " " + a["ip-address"]));
  } catch {}
  try { out.users = (await qga(s, "guest-get-users")).map(u => u.user); } catch {}
  return out;
}

function listEnvs() {
  const usage = hoststats.VM_USAGE;
  return store.envs.read().map(e => Object.assign({}, e, {
    running: !!(e.pid && pidAlive(e.pid, e.id)),
    usage: usage[e.id] || null,
    cloudInit: e.cloudInit ? Object.assign({}, e.cloudInit) : null,
  }));
}
const getEnv = id => listEnvs().find(e => e.id === id) || null;

function logs(id, kind) {
  const f = path.join(LOG_DIR, id + (kind === "serial" ? ".serial.log" : ".qemu.log"));
  return tailFile(f, 64000);
}

function imageInUse(imageId) {
  const env = store.envs.read().find(e => e.imageId === imageId || e.isoId === imageId || e.driverIsoId === imageId);
  return env ? "environment “" + env.name + "”" : null;
}

module.exports = { buildArgs, changeIso, createEnv, deleteEnv, getEnv, guestInfo, imageInUse, listEnvs, listUsb, logs,
  normalizeSpec, pidAlive, rebootEnv, resetEnv, saveAsImage, sock, startEnv, startWatcher, stopEnv, updateEnvSettings, usbAttach, usbDetach };
