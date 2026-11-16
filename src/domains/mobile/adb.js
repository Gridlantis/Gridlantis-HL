const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const path = require("path");
const { execFile, spawn } = require("child_process");

const { ROOT } = require("../../config");

// ═══ MOBILE HOST: ADB ═════════════════════════════════════════════════════════
// Android phones are reached the way scrcpy/QtScrcpy reach them: over adb, by
// USB on this machine or wirelessly (Android 11+ "Wireless debugging", or the
// older adb tcpip). Metis brings its own tools, so nothing needs installing
// system-wide: Google's platform-tools for adb, and the scrcpy server that is
// pushed to the phone (pinned, checksum-verified — client and server must be
// the exact same version).

const TOOLS_DIR = path.join(ROOT, "mobile");
const SCRCPY_VERSION = "5.0.1";
const SCRCPY_SERVER = { url: `https://github.com/Genymobile/scrcpy/releases/download/v${SCRCPY_VERSION}/scrcpy-server-v${SCRCPY_VERSION}`,
  sha256: "764eb6f79811d5211fe9df341120882ba9994c7a61b897d7bf3fb662e53bc536", file: path.join(TOOLS_DIR, `scrcpy-server-v${SCRCPY_VERSION}`) };
const PLATFORM_TOOLS_URL = "https://dl.google.com/android/repository/platform-tools-latest-linux.zip";
const LOCAL_ADB = path.join(TOOLS_DIR, "platform-tools", "adb");

const err = (msg, status = 500) => Object.assign(new Error(msg), { status });

// A system adb is used if there is one (it may already have a server and udev
// rules); otherwise the one Metis downloaded.
function systemAdb() {
  for (const d of String(process.env.PATH || "").split(":")) {
    const p = path.join(d, "adb");
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch {}
  }
  return null;
}
function adbPath() { return fs.existsSync(LOCAL_ADB) ? LOCAL_ADB : systemAdb(); }
function toolsStatus() {
  const adb = adbPath();
  return { adb: adb || null, adbSource: !adb ? null : adb === LOCAL_ADB ? "metis" : "system",
    scrcpyServer: fs.existsSync(SCRCPY_SERVER.file), scrcpyVersion: SCRCPY_VERSION, installing: !!INSTALLING };
}

function download(url, dest, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Metis" } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects) {
        res.resume(); return download(new URL(res.headers.location, url).href, dest, redirects - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(err("download failed: HTTP " + res.statusCode + " for " + url, 502)); }
      const tmp = dest + ".part", out = fs.createWriteStream(tmp), hash = crypto.createHash("sha256");
      res.on("data", c => hash.update(c));
      res.pipe(out);
      out.on("finish", () => { fs.renameSync(tmp, dest); resolve(hash.digest("hex")); });
      out.on("error", reject); res.on("error", reject);
    }).on("error", reject).setTimeout(300000, function () { this.destroy(err("download timed out", 504)); });
  });
}
const run = (cmd, args, opts = {}) => new Promise((resolve, reject) =>
  execFile(cmd, args, Object.assign({ timeout: 120000, maxBuffer: 64 * 1024 * 1024 }, opts), (e, stdout, stderr) =>
    e ? reject(err(String(stderr || e.message).trim().split("\n").pop() || e.message, 502)) : resolve(String(stdout))));

// Fetch whatever is missing. One install at a time; callers share it.
let INSTALLING = null;
function installTools() {
  if (INSTALLING) return INSTALLING;
  INSTALLING = (async () => {
    fs.mkdirSync(TOOLS_DIR, { recursive: true });
    if (!adbPath()) {
      const zip = path.join(TOOLS_DIR, "platform-tools.zip");
      await download(PLATFORM_TOOLS_URL, zip);
      await run("unzip", ["-oq", zip, "platform-tools/*", "-d", TOOLS_DIR]).catch(() =>
        run("python3", ["-m", "zipfile", "-e", zip, TOOLS_DIR]));
      fs.unlinkSync(zip);
      fs.chmodSync(LOCAL_ADB, 0o755);
    }
    if (!fs.existsSync(SCRCPY_SERVER.file)) {
      const tmp = SCRCPY_SERVER.file + ".dl";
      const sum = await download(SCRCPY_SERVER.url, tmp);
      if (sum !== SCRCPY_SERVER.sha256) { fs.unlinkSync(tmp); throw err("scrcpy-server checksum mismatch — download refused", 502); }
      fs.renameSync(tmp, SCRCPY_SERVER.file);
    }
  })().finally(() => { INSTALLING = null; }).then(() => toolsStatus());
  return INSTALLING;
}

// ── Running adb ──────────────────────────────────────────────────────────────
function adb(args, opts = {}) {
  const bin = adbPath();
  if (!bin) return Promise.reject(err("adb is not installed yet — press Install tools on the Mobile host page", 409));
  return run(bin, args, opts);
}
// adb -s SERIAL ...
const adbOn = (serial, args, opts) => adb(["-s", serial].concat(args), opts);
function adbSpawn(serial, args) {
  const bin = adbPath();
  if (!bin) throw err("adb is not installed", 409);
  return spawn(bin, ["-s", serial].concat(args), { stdio: ["ignore", "pipe", "pipe"] });
}

// `adb devices -l`, plus model / Android version / battery for usable ones.
// Cached briefly: the page polls it.
let DEVICES = { at: 0, list: null };
async function listDevices(force) {
  if (!force && DEVICES.list && Date.now() - DEVICES.at < 4000) return DEVICES.list;
  const out = await adb(["devices", "-l"], { timeout: 15000 });
  const rows = out.split("\n").slice(1).map(l => l.trim()).filter(Boolean).map(l => {
    const [serial, state, ...rest] = l.split(/\s+/);
    const kv = Object.fromEntries(rest.filter(x => x.includes(":")).map(x => x.split(/:(.*)/s).slice(0, 2)));
    const noPerm = /no permissions/.test(l);
    return { serial, state: noPerm ? "no permissions" : state, model: (kv.model || "").replace(/_/g, " "), product: kv.product || "",
      transport: /^[\d.]+:\d+$/.test(serial) || /_adb-tls-connect\._tcp/.test(serial) ? "wifi" : "usb" };
  });
  await Promise.all(rows.filter(d => d.state === "device").map(async d => {
    try {
      const props = await adbOn(d.serial, ["shell", "getprop ro.product.manufacturer; getprop ro.product.model; getprop ro.build.version.release; dumpsys battery | grep -m1 level; wm size | tail -n1"], { timeout: 10000 });
      const [maker, model, android, battery, size] = props.split("\n").map(s => s.trim());
      Object.assign(d, { maker, model: model || d.model, android, battery: +(String(battery).match(/\d+/) || [])[0] || null,
        screen: (String(size).match(/(\d+x\d+)/) || [])[1] || null });
    } catch (e) { d.error = e.message; }
  }));
  DEVICES = { at: Date.now(), list: rows };
  return rows;
}
const forgetDevices = () => { DEVICES = { at: 0, list: null }; };

// ── Wireless ─────────────────────────────────────────────────────────────────
const HOSTPORT = /^[a-z0-9.\-:\[\]]+:\d{2,5}$/i;
async function pair(hostport, code) {
  if (!HOSTPORT.test(hostport)) throw err("give the pairing address as IP:port", 400);
  if (!/^\d{6}$/.test(String(code))) throw err("the pairing code is 6 digits", 400);
  const out = await adb(["pair", hostport, String(code)], { timeout: 30000 });
  if (!/success/i.test(out)) throw err(out.trim() || "pairing failed", 502);
  forgetDevices();
  return out.trim();
}
async function connect(hostport) {
  if (!HOSTPORT.test(hostport)) throw err("give the address as IP:port", 400);
  const out = await adb(["connect", hostport], { timeout: 20000 });
  if (!/connected to/i.test(out)) throw err(out.trim() || "could not connect", 502);
  forgetDevices();
  return out.trim();
}
async function disconnect(serial) { const o = await adb(["disconnect", serial], { timeout: 10000 }); forgetDevices(); return o.trim(); }

// USB → wireless: switch the phone's adb to TCP 5555 and connect to its Wi-Fi
// address. Works on any Android version, until the phone reboots.
async function enableWifi(serial) {
  const route = await adbOn(serial, ["shell", "ip -f inet addr show wlan0 | grep -m1 inet"], { timeout: 10000 }).catch(() => "");
  const ip = (route.match(/inet ([\d.]+)/) || [])[1];
  if (!ip) throw err("the phone is not on Wi-Fi", 409);
  await adbOn(serial, ["tcpip", "5555"], { timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  return connect(ip + ":5555");
}

// ── Files ────────────────────────────────────────────────────────────────────
async function pushFile(serial, file, name) {
  const dest = "/sdcard/Download/" + path.basename(name).replace(/[^\w.\- ()]/g, "_");
  await adbOn(serial, ["push", file, dest], { timeout: 600000 });
  // Let the phone's gallery and file apps see it straight away.
  await adbOn(serial, ["shell", "am", "broadcast", "-a", "android.intent.action.MEDIA_SCANNER_SCAN_FILE", "-d", "file://" + dest], { timeout: 15000 }).catch(() => {});
  return dest;
}
async function installApk(serial, file) {
  const out = await adbOn(serial, ["install", "-r", "-d", file], { timeout: 600000 });
  if (!/Success/.test(out)) throw err(out.trim().split("\n").pop() || "install failed", 502);
  return "installed";
}

module.exports = { SCRCPY_SERVER, SCRCPY_VERSION, TOOLS_DIR, adb, adbOn, adbPath, adbSpawn, connect, disconnect, enableWifi,
  forgetDevices, installApk, installTools, listDevices, pair, pushFile, toolsStatus };
