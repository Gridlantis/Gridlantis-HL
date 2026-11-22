const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const { HOME_DIR, ROOT, UPLOAD_DIR } = require("../../config");
const { tailnetIp } = require("../../net");

// ─── Live folders: Gridlantis-HL's own Syncthing ─────────────────────────────────────
// Gridlantis-HL is the hub. It runs a private Syncthing (systemd user unit
// openhl-live.service) that keeps an always-on copy of every live folder under
// uploads/Live folders/, so PCs sync through it even when they are never on at
// the same time, and the Files page can browse the copy. It listens on the
// tailnet address only, port 22100 (not Syncthing's 22000, so a Syncthing the
// user already runs is left alone), with discovery, relays, NAT and usage
// reporting off: devices find each other by fixed tailnet addresses only.
//
// The binaries are Gridlantis-HL's own build of Syncthing: upstream v2.1.7 plus
// tools/live/syncthing-conflicts.patch, which stops a 3-device same-second
// edit from losing one version and removes duplicate conflict copies (see
// tools/live/build-syncthing.sh). Built once
// into live/dist; Gridlantis-HL serves the PC builds to the setup scripts, so every
// device runs the same patched version.

const VERSION = "v2.1.7-openhl.2";
const PLATFORMS = { "linux-amd64": "tar.gz", "linux-arm64": "tar.gz", "windows-amd64": "zip" };
const ASSETS = Object.fromEntries(Object.entries(PLATFORMS).map(([p, ext]) => [p, { file: `syncthing-${p}-${VERSION}.${ext}` }]));
const BUILD_SCRIPT = path.join(ROOT, "tools", "live", "build-syncthing.sh");
const SYNC_PORT = 22100;
const GUI = { host: "127.0.0.1", port: 8385 };

const LIVE_DIR = path.join(HOME_DIR, "live");
const DIST_DIR = path.join(LIVE_DIR, "dist");
const BIN = path.join(LIVE_DIR, "bin", "syncthing");
const HOME = path.join(LIVE_DIR, "home");
const VERSIONS_DIR = path.join(LIVE_DIR, "versions");
const HUB_DIR = path.join(UPLOAD_DIR, "Live folders");
const META_FILE = path.join(LIVE_DIR, "meta.json");
const ENV_FILE = path.join(HOME, "openhl.env");
const UNIT_NAME = "openhl-live.service";
const UNIT_FILE = path.join(os.homedir(), ".config", "systemd", "user", UNIT_NAME);

const err = (msg, status = 500) => Object.assign(new Error(msg), { status });
const sh = (cmd, args, opts = {}) => new Promise((resolve, reject) =>
  execFile(cmd, args, { timeout: 60000, ...opts }, (e, stdout, stderr) => e ? reject(Object.assign(e, { stderr: String(stderr) })) : resolve(String(stdout))));

// ── Patched build ────────────────────────────────────────────────────────────
// The archive for a platform. Missing ones are built (a few minutes, once):
// never fall back to the unpatched upstream build, which can lose edits.
let building = null;
async function asset(platform) {
  const a = ASSETS[platform];
  if (!a) throw err("no Syncthing build for " + platform, 404);
  const file = path.join(DIST_DIR, a.file);
  if (fs.existsSync(file)) return file;
  if (!building) {
    console.log("[live] building patched Syncthing (" + VERSION + ") — a few minutes, once");
    building = sh("bash", [BUILD_SCRIPT], { timeout: 30 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 })
      .catch(e => { throw err("could not build Syncthing: " + String(e.stderr || e.message).trim().split("\n").slice(-3).join(" ")); })
      .finally(() => { building = null; });
  }
  await building;
  if (!fs.existsSync(file)) throw err("the Syncthing build did not produce " + a.file);
  return file;
}

async function ensureBinary() {
  if (fs.existsSync(BIN)) {
    try { if ((await sh(BIN, ["--version"])).includes(VERSION + " ")) return false; } catch {}
  }
  const plat = process.arch === "arm64" ? "linux-arm64" : "linux-amd64";
  const tgz = await asset(plat);
  fs.mkdirSync(path.dirname(BIN), { recursive: true });
  const entry = (await sh("tar", ["-tzf", tgz])).split("\n").find(x => /^[^/]+\/syncthing$/.test(x));
  if (!entry) throw err("the Syncthing archive has no binary");
  // Unpack beside it and rename over: the running binary can't be written to.
  const tmp = fs.mkdtempSync(path.join(path.dirname(BIN), ".new-"));
  try {
    await sh("tar", ["-xzf", tgz, "-C", tmp, "--strip-components=1", entry]);
    fs.renameSync(path.join(tmp, "syncthing"), BIN);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  return true;   // replaced: the service needs a restart
}

// ── The service ──────────────────────────────────────────────────────────────
function apiKey() {
  const f = path.join(HOME, "openhl-apikey");
  try { const k = fs.readFileSync(f, "utf8").trim(); if (k.length >= 32) return k; } catch {}
  const k = crypto.randomBytes(24).toString("hex");
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(f, k + "\n", { mode: 0o600 });
  return k;
}

function writeIfChanged(file, text, mode) {
  let old = null;
  try { old = fs.readFileSync(file, "utf8"); } catch {}
  if (old === text) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, mode ? { mode } : undefined);
  return true;
}

// systemd splits ExecStart on spaces and expands %-specifiers, so a path like
// ".../Metis Live/..." has to be quoted or it tries to run ".../Metis".
const unitArg  = s => '"' + String(s).replace(/%/g, "%%").replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
const unitPath = s => String(s).replace(/%/g, "%%");

async function ensureService(binaryChanged) {
  if (!fs.existsSync(path.join(HOME, "config.xml"))) {
    fs.mkdirSync(HOME, { recursive: true });
    await sh(BIN, ["generate", "--home", HOME, "--no-port-probing"]);
  }
  const envChanged = writeIfChanged(ENV_FILE, `STGUIAPIKEY=${apiKey()}\nSTNOUPGRADE=1\n`, 0o600);
  const unitChanged = writeIfChanged(UNIT_FILE, `[Unit]
Description=Gridlantis-HL live folders (Syncthing hub)
After=network-online.target

[Service]
EnvironmentFile=${unitPath(ENV_FILE)}
ExecStart=${unitArg(BIN)} serve --home ${unitArg(HOME)} --no-browser --no-restart --gui-address=${GUI.host}:${GUI.port}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`);
  if (unitChanged) await sh("systemctl", ["--user", "daemon-reload"]);
  await sh("systemctl", ["--user", "enable", UNIT_NAME]).catch(() => {});
  let active = false;
  try { active = (await sh("systemctl", ["--user", "is-active", UNIT_NAME])).trim() === "active"; } catch {}
  if (!active || unitChanged || envChanged || binaryChanged) await sh("systemctl", ["--user", "restart", UNIT_NAME]);
}

// ── REST client ──────────────────────────────────────────────────────────────
function api(method, p, body, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({ host: GUI.host, port: GUI.port, path: p, method, timeout: timeoutMs,
      headers: { "X-API-Key": apiKey(), ...(data ? { "Content-Type": "application/json", "Content-Length": data.length } : {}) } }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString();
        if (res.statusCode >= 400) return reject(err("Syncthing: " + (text.trim() || res.statusCode), res.statusCode === 404 ? 404 : 502));
        if (!text) return resolve(null);
        try { resolve(JSON.parse(text)); } catch { resolve(text); }
      });
    });
    req.on("timeout", () => req.destroy(err("Syncthing did not answer", 504)));
    req.on("error", e => reject(e.status ? e : err("Syncthing is not running (" + e.code + ")", 503)));
    if (data) req.write(data);
    req.end();
  });
}

async function waitUp(ms = 20000) {
  const until = Date.now() + ms;
  for (;;) {
    try { await api("GET", "/rest/system/ping", undefined, 2000); return; }
    catch (e) { if (Date.now() > until) throw err("Syncthing did not start: " + e.message, 503); }
    await new Promise(r => setTimeout(r, 400));
  }
}

// Network and folder defaults: tailnet only, nothing phoning home, changes
// picked up a second after they land.
async function configure() {
  const ip = tailnetIp();
  await api("PATCH", "/rest/config/options", {
    listenAddresses: ip ? [`tcp://${ip}:${SYNC_PORT}`] : [`tcp://127.0.0.1:${SYNC_PORT}`],
    globalAnnounceEnabled: false, localAnnounceEnabled: false, relaysEnabled: false, natEnabled: false,
    urAccepted: -1, crashReportingEnabled: false, autoUpgradeIntervalH: 0, startBrowser: false,
    reconnectionIntervalS: 10,
  });
  await api("PATCH", "/rest/config/defaults/folder", { fsWatcherDelayS: 1 });
  const me = await myId();
  await api("PATCH", "/rest/config/devices/" + me, { name: "Gridlantis-HL" }).catch(() => {});
  fs.mkdirSync(HUB_DIR, { recursive: true });
  fs.mkdirSync(VERSIONS_DIR, { recursive: true });
}

let idCache = null;
async function myId() {
  if (idCache) return idCache;
  idCache = (await api("GET", "/rest/system/status")).myID;
  return idCache;
}

// Brought up once per Gridlantis-HL start; every API call waits on it, and a failure
// is retried on the next call instead of sticking.
let ready = null, lastError = null;
function ensure() {
  if (!ready) {
    ready = (async () => {
      const binaryChanged = await ensureBinary();
      await ensureService(binaryChanged);
      await waitUp();
      await configure();
      lastError = null;
    })().catch(e => { lastError = e.message; ready = null; throw e; });
  }
  return ready;
}

// ── Metadata Gridlantis-HL keeps beside Syncthing's config ───────────────────────────
function readMeta() {
  try { return JSON.parse(fs.readFileSync(META_FILE, "utf8")); } catch { return { devices: {} }; }
}
function writeMeta(m) { fs.mkdirSync(LIVE_DIR, { recursive: true }); fs.writeFileSync(META_FILE, JSON.stringify(m, null, 2)); }

module.exports = {
  ASSETS, GUI, HUB_DIR, SYNC_PORT, UPLOAD_DIR, VERSION, VERSIONS_DIR,
  api, asset, ensure, lastError: () => lastError, myId, readMeta, writeMeta,
};
