const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const adb = require("../mobile/adb");

// ─── VM LAB · Cuttlefish ─────────────────────────────────────────────────────
// Google's Cuttlefish virtual Android phones, run by the `cvd` tool from a
// folder of host tools and images (CUTTLEFISH_DIR). Gridlantis-HL does not create the
// group — it reads `cvd fleet`, starts and stops the existing group (data is
// kept), and reaches each phone over adb like any other phone, so the Mobile
// host mirror works on them unchanged.

const CF_DIR = process.env.CUTTLEFISH_DIR || path.join(os.homedir(), "Servers", "cuttlefish");
const err = (msg, status = 500) => Object.assign(new Error(msg), { status });

function cvdPath() {
  for (const d of String(process.env.PATH || "").split(":").concat(["/usr/bin", path.join(CF_DIR, "bin")])) {
    const p = path.join(d, "cvd");
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch {}
  }
  return null;
}

// cvd logs to stderr; stdout carries the answer (JSON for `fleet`).
// `ownScope` runs it in a transient systemd scope of its own: `cvd start`
// leaves the phones running as its children, and inside openhl.service they
// would be killed with it on every Gridlantis-HL restart (the reason VM Lab gives each
// VM its own unit too). Without systemd it falls back to running directly.
function cvd(args, timeout = 60000, ownScope = false) {
  const bin = cvdPath();
  if (!bin) return Promise.reject(err("cvd is not installed (looked in PATH and " + path.join(CF_DIR, "bin") + ")", 409));
  let cmd = bin, argv = args;
  if (ownScope && hasSystemdRun()) {
    cmd = "systemd-run";
    argv = ["--user", "--scope", "--collect", "--quiet", "--unit=openhl-cuttlefish-" + Date.now(),
      "--description=Gridlantis-HL VM Lab · Cuttlefish phones", "--", bin].concat(args);
  }
  return new Promise((resolve, reject) =>
    execFile(cmd, argv, { cwd: CF_DIR, timeout, maxBuffer: 16 * 1024 * 1024 }, (e, stdout, stderr) => {
      if (!e) return resolve(String(stdout));
      // cvd ends errors with a stack and a "file a bug" footer; the message is
      // the last line before that footer.
      const lines = String(stderr || e.message).split("\n").map(l => l.trim())
        .filter(l => l && !/\] version: |If the error above is unclear|cuttlefish-bug|^\d+\. |^\||^v CF_/.test(l));
      reject(err(lines.pop() || e.message, 502));
    }));
}

let SYSTEMD_RUN;
function hasSystemdRun() {
  if (SYSTEMD_RUN === undefined) {
    SYSTEMD_RUN = ["/usr/bin/systemd-run", "/bin/systemd-run"].some(p => fs.existsSync(p)) && !!process.env.XDG_RUNTIME_DIR;
  }
  return SYSTEMD_RUN;
}

// Start and stop take a minute or more, so they run in the background and
// the page polls status; one at a time.
let BUSY = null;          // { action, since }
let LAST_ERROR = null;    // { action, message, at }
function runBusy(action, work) {
  if (BUSY) throw err((BUSY.action === "stop" ? "already stopping" : "already starting") + " — wait for it to finish", 409);
  BUSY = { action, since: new Date().toISOString() };
  LAST_ERROR = null;
  work()
    .catch(e => { LAST_ERROR = { action, message: e.message, at: new Date().toISOString() }; })
    .finally(() => { BUSY = null; adb.forgetDevices(); });
  return { ok: true, action };
}

async function bootState(serial) {
  try {
    const out = await adb.adbOn(serial, ["shell", "getprop sys.boot_completed; getprop ro.build.version.release"], { timeout: 6000 });
    const [boot, android] = out.split("\n").map(s => s.trim());
    return { booted: boot === "1", android: android || null };
  } catch (e) { return { booted: false, adbError: e.message }; }
}

async function status() {
  const base = { dir: CF_DIR, cvd: cvdPath(), busy: BUSY, lastError: LAST_ERROR, groups: [] };
  if (!base.cvd) return Object.assign(base, { error: "cvd is not installed" });
  let fleet;
  try {
    const out = await cvd(["fleet"], 30000);
    fleet = JSON.parse(out.slice(out.indexOf("{")));
  } catch (e) { return Object.assign(base, { error: "cvd fleet failed: " + e.message }); }

  const adbOk = !!adb.adbPath();
  let devices = [];
  if (adbOk) devices = await adb.listDevices().catch(() => []);
  const groups = (fleet.groups || []).map(g => ({
    name: g.group_name, startTime: g.start_time || null,
    instances: (g.instances || []).map(i => ({
      name: i.instance_name, status: i.status, serial: i.adb_serial, adbPort: i.adb_port,
      display: (i.displays || [])[0] || null, webrtcId: i.webrtc_device_id || null,
      // e.g. https://localhost:1443/devices/…; the page swaps in its own hostname.
      webAccess: i.web_access || null,
    })),
  }));

  // Running phones the adb server has lost (e.g. after an adb restart) are
  // reconnected, so the mirror and installs work without a trip to Mobile host.
  if (adbOk) {
    const all = groups.flatMap(g => g.instances);
    let reconnected = false;
    await Promise.all(all.map(async i => {
      const d = devices.find(x => x.serial === i.serial);
      i.adb = d ? d.state : "not connected";
      if (i.status === "Running" && !d && i.serial) {
        try { await adb.connect(i.serial); i.adb = "device"; reconnected = true; } catch {}
      }
      if (i.adb === "device") Object.assign(i, await bootState(i.serial));
    }));
    if (reconnected) adb.forgetDevices();
  }
  return Object.assign(base, { adb: adbOk, groups });
}

function groupFlag(group) {
  if (!group) return [];
  if (!/^[\w-]{1,64}$/.test(group)) throw err("bad group name", 400);
  return ["--group_name=" + group];
}

// Only serials that belong to a Cuttlefish instance are acted on here.
async function knownSerial(serial) {
  const st = await status();
  const inst = st.groups.flatMap(g => g.instances).find(i => i.serial === serial);
  if (!inst) throw err("not a Cuttlefish phone: " + serial, 404);
  return inst;
}

module.exports = {
  CF_DIR, status, knownSerial,
  start(group) {
    const flag = groupFlag(group);
    return runBusy("start", async () => {
      // Phones that died without a clean stop (host crash, killed processes)
      // leave the group "Unreachable", and cvd refuses to start a group it
      // still counts as started. Stop it first to clear that.
      const st = await status();
      const stale = st.groups.filter(g => !group || g.name === group)
        .some(g => g.instances.some(i => i.status !== "Stopped" && i.status !== "Running"));
      if (stale) await cvd(["stop"].concat(flag), 5 * 60 * 1000).catch(() => {});
      return cvd(["start"].concat(flag), 10 * 60 * 1000, true);
    });
  },
  stop(group) {
    const flag = groupFlag(group);
    return runBusy("stop", () => cvd(["stop"].concat(flag), 10 * 60 * 1000));
  },
  async reboot(serial) { await knownSerial(serial); await adb.adbOn(serial, ["reboot"], { timeout: 20000 }); adb.forgetDevices(); return { ok: true }; },
  // Install one APK on every running phone at once; per-phone results.
  async installAll(file) {
    const st = await status();
    const targets = st.groups.flatMap(g => g.instances).filter(i => i.adb === "device");
    if (!targets.length) throw err("no Cuttlefish phone is running", 409);
    return Promise.all(targets.map(i => adb.installApk(i.serial, file)
      .then(() => ({ serial: i.serial, ok: true }), e => ({ serial: i.serial, ok: false, error: e.message }))));
  },
};
