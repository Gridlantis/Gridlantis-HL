const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const st = require("./syncthing");

// ─── Live folders: what the page and API work with ───────────────────────────
// Syncthing's own config is the source of truth for folders and which PCs get
// them; meta.json only adds what Syncthing has no field for (a PC's OS and
// address as the setup script reported them).
//
// Every folder is shared between Gridlantis-HL and the PCs picked for it, never PC to
// PC directly, so a change on one PC reaches Gridlantis-HL first and Gridlantis-HL passes it
// on. Gridlantis-HL keeps the last 10 versions of each deleted or replaced file for 30
// days ("simple" versioning: "staggered" thins quick edits to one per 30 s, so
// a delete right after an edit would restore the file from before the edit).
// Versions live outside the folder, so they never sync back out.

const err = (msg, status = 400) => Object.assign(new Error(msg), { status });
const RETAIN_DAYS = 30, KEEP_VERSIONS = 10;
const ID_RE = /^[A-Z2-7]{7}(-[A-Z2-7]{7}){7}$/;

// ── Pairing codes ────────────────────────────────────────────────────────────
// openhl-live:<base64url JSON {v, name, id, host, os}> printed by setup.sh/.ps1.
function parseCode(code) {
  const m = /openhl-live:([A-Za-z0-9_-]+)/.exec(String(code || ""));
  if (!m) throw err("that is not a live-folder pairing code (it starts with openhl-live:)");
  let o;
  try { o = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8")); } catch { throw err("the pairing code is damaged — copy it again"); }
  const id = String(o.id || "").toUpperCase();
  if (!ID_RE.test(id)) throw err("the pairing code has no valid device ID");
  const host = String(o.host || "");
  if (host && !/^[0-9a-fA-F.:]+$/.test(host)) throw err("the pairing code has a bad address");
  return { id, name: String(o.name || "PC").slice(0, 60), host, os: o.os === "windows" ? "windows" : "linux" };
}

// ── Devices (PCs) ────────────────────────────────────────────────────────────
async function addDevice(code, name) {
  await st.ensure();
  const p = parseCode(code);
  if (p.id === await st.myId()) throw err("that code is Gridlantis-HL's own device");
  const existing = (await st.api("GET", "/rest/config/devices")).find(d => d.deviceID === p.id);
  const dev = {
    deviceID: p.id, name: (name && String(name).trim()) || p.name,
    addresses: p.host ? [`tcp://${p.host.includes(":") ? "[" + p.host + "]" : p.host}:${st.SYNC_PORT}`] : ["dynamic"],
    compression: "metadata", autoAcceptFolders: false, introducer: false, paused: false,
  };
  await st.api("PUT", "/rest/config/devices/" + p.id, existing ? { ...existing, ...dev } : dev);
  const meta = st.readMeta();
  meta.devices[p.id] = { ...(meta.devices[p.id] || {}), os: p.os, host: p.host, added: (meta.devices[p.id] || {}).added || new Date().toISOString() };
  st.writeMeta(meta);
  return { id: p.id, name: dev.name, repaired: !!existing };
}

async function renameDevice(id, name) {
  await st.ensure();
  name = String(name || "").trim().slice(0, 60);
  if (!name) throw err("give the PC a name");
  await st.api("PATCH", "/rest/config/devices/" + encodeURIComponent(id), { name });
  return { ok: true };
}

async function removeDevice(id) {
  await st.ensure();
  if (id === await st.myId()) throw err("Gridlantis-HL cannot be removed");
  // Unshare every folder first so nothing keeps waiting on this PC.
  for (const f of await st.api("GET", "/rest/config/folders")) {
    if (f.devices.some(d => d.deviceID === id)) {
      await st.api("PATCH", "/rest/config/folders/" + encodeURIComponent(f.id), { devices: f.devices.filter(d => d.deviceID !== id) });
    }
  }
  await st.api("DELETE", "/rest/config/devices/" + encodeURIComponent(id));
  const meta = st.readMeta(); delete meta.devices[id]; st.writeMeta(meta);
  return { ok: true };
}

// ── Folders ──────────────────────────────────────────────────────────────────
function cleanLabel(label) {
  const s = String(label || "").replace(/[\/\\:*?"<>|\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  if (!s) throw err("give the folder a name");
  if (s.length > 60) throw err("keep the name under 60 characters");
  return s;
}

async function validDevices(ids, me) {
  const known = new Set((await st.api("GET", "/rest/config/devices")).map(d => d.deviceID));
  const out = [...new Set((ids || []).map(String))].filter(id => id !== me);
  for (const id of out) if (!known.has(id)) throw err("unknown PC " + id.slice(0, 7));
  return [me, ...out].map(deviceID => ({ deviceID, introducedBy: "", encryptionPassword: "" }));
}

async function createFolder(label, deviceIds) {
  await st.ensure();
  label = cleanLabel(label);
  const folders = await st.api("GET", "/rest/config/folders");
  if (folders.some(f => f.label.toLowerCase() === label.toLowerCase())) throw err("there is already a live folder called " + label);
  // Check the PCs before touching the disk, so a bad request leaves no folder behind.
  const devices = await validDevices(deviceIds, await st.myId());
  // A plain folder already there under that name becomes the live folder's starting content.
  const dir = path.join(st.HUB_DIR, label);
  fs.mkdirSync(dir, { recursive: true });
  // The ID follows the name. A PC keeps a folder's config after Gridlantis-HL stops
  // sharing it, so a random ID for a re-made "Work" would make each PC put the
  // new one beside the old at ~/Gridlantis-HL Live/live-xxxx. The same ID picks the
  // PC's existing folder back up. (A renamed folder keeps its old ID, so add a
  // suffix if that ID is still in use.)
  const base = "live-" + crypto.createHash("sha1").update(label.toLowerCase()).digest("hex").slice(0, 8);
  const taken = new Set(folders.map(x => x.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = base + "-" + n;
  await st.api("PUT", "/rest/config/folders/" + id, {
    id, label, path: dir, type: "sendreceive",
    devices,
    fsWatcherEnabled: true, fsWatcherDelayS: 1, rescanIntervalS: 3600,
    versioning: { type: "simple", params: { keep: String(KEEP_VERSIONS), cleanoutDays: String(RETAIN_DAYS) }, cleanupIntervalS: 3600,
      fsPath: path.join(st.VERSIONS_DIR, id), fsType: "basic" },
  });
  return { id, label, path: dir };
}

async function updateFolder(id, { label, devices } = {}) {
  await st.ensure();
  const f = await getFolderConfig(id);
  const patch = {};
  if (label !== undefined) {
    const l = cleanLabel(label);
    const others = (await st.api("GET", "/rest/config/folders")).filter(x => x.id !== id);
    if (others.some(x => x.label.toLowerCase() === l.toLowerCase())) throw err("there is already a live folder called " + l);
    patch.label = l;
  }
  if (devices !== undefined) patch.devices = await validDevices(devices, await st.myId());
  if (Object.keys(patch).length) await st.api("PATCH", "/rest/config/folders/" + encodeURIComponent(f.id), patch);
  return { ok: true };
}

// Stop syncing. Every copy, Gridlantis-HL's included, stays on disk; the old versions
// go with the folder.
async function removeFolder(id) {
  await st.ensure();
  const f = await getFolderConfig(id);
  await st.api("DELETE", "/rest/config/folders/" + encodeURIComponent(f.id));
  try { fs.rmSync(path.join(st.VERSIONS_DIR, f.id), { recursive: true, force: true }); } catch {}
  return { ok: true, keptAt: f.path };
}

async function getFolderConfig(id) {
  const f = (await st.api("GET", "/rest/config/folders")).find(x => x.id === id);
  if (!f) throw err("live folder not found", 404);
  return f;
}

// ── Versions (deleted and replaced files Gridlantis-HL kept) ─────────────────────────
async function versions(id) {
  await st.ensure();
  const f = await getFolderConfig(id);
  const v = await st.api("GET", "/rest/folder/versions?folder=" + encodeURIComponent(f.id)) || {};
  const live = new Set();
  const walk = (dir, rel) => {
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (rel === "" && (e.name === ".stfolder" || e.name === ".stignore")) continue;
      const r = rel ? rel + "/" + e.name : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r); else live.add(r);
    }
  };
  walk(f.path, "");
  return Object.entries(v).map(([file, list]) => ({
    path: file, deleted: !live.has(file),
    versions: list.map(x => ({ versionTime: x.versionTime, modTime: x.modTime, size: x.size }))
      .sort((a, b) => Date.parse(b.versionTime) - Date.parse(a.versionTime)),
  })).sort((a, b) => Date.parse(b.versions[0].versionTime) - Date.parse(a.versions[0].versionTime));
}

async function restore(id, file, versionTime) {
  await st.ensure();
  const f = await getFolderConfig(id);
  const out = await st.api("POST", "/rest/folder/versions?folder=" + encodeURIComponent(f.id), { [file]: versionTime });
  const failed = out && out[file];
  if (failed) throw err("could not restore " + file + ": " + failed, 502);
  return { ok: true };
}

// ── Keeping versions of changes made on Gridlantis-HL itself ─────────────────────────
// Syncthing only versions a file when another device's change deletes or
// replaces it. A delete or overwrite done on Gridlantis-HL's copy (Files page, the Live
// folders browser) would otherwise reach every PC with nothing kept anywhere,
// since PCs keep no versions. So before such a change, move whatever it would
// destroy into the folder's versions dir under Syncthing's own naming
// (name~YYYYMMDD-HHMMSS.ext, local time, original mtime), which is exactly what
// Syncthing does itself: Restore lists it and Syncthing's cleanup ages it out.
//
// Returns false when target is not inside a live folder (nothing done). Throws
// rather than going ahead without a version if the folder can't be resolved.
const VERSION_TAG_FORMAT = d => [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n, i) => String(n).padStart(i ? 2 : 4, "0")).join("")
  + "-" + [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, "0")).join("");
const SYNC_OWN = /^(\.stfolder|\.stignore|\.stversions)$|^\.syncthing\..*\.tmp$|^~syncthing~/;

async function archiveBeforeChange(target) {
  const abs = path.resolve(target);
  const rel = path.relative(st.HUB_DIR, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return false;
  const [folderName, ...rest] = rel.split(path.sep);
  if (!rest.length) return false; // the live folder itself: callers refuse that
  let stat;
  try { stat = fs.lstatSync(abs); } catch { return true; } // nothing there to lose

  const folderPath = path.join(st.HUB_DIR, folderName);
  let folders;
  try { folders = await st.api("GET", "/rest/config/folders"); }
  catch (e) { throw err("live folders are not running, so no version could be kept — try again shortly", 503); }
  const f = folders.find(x => path.resolve(x.path) === folderPath);
  if (!f) return false; // a leftover folder that no longer syncs: an ordinary folder now
  const vdir = f.versioning && f.versioning.type && f.versioning.fsPath;
  if (!vdir) return true; // versioning switched off for this folder: nothing to keep

  const now = new Date();
  const tag = VERSION_TAG_FORMAT(now);
  const moveOne = (src, inFolder) => {
    const dir = path.dirname(inFolder), base = path.basename(inFolder), ext = path.extname(base);
    const dst = path.join(vdir, dir, base.slice(0, base.length - ext.length) + "~" + tag + ext);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    const { mtime } = fs.statSync(src);
    try { fs.renameSync(src, dst); }
    catch (e) { if (e.code !== "EXDEV") throw e; fs.copyFileSync(src, dst); fs.unlinkSync(src); }
    fs.utimesSync(dst, mtime, mtime);
  };
  const inFolder = path.join(...rest);
  const walk = (src, inF) => {
    const s = fs.lstatSync(src);
    if (s.isDirectory()) { for (const e of fs.readdirSync(src)) if (!SYNC_OWN.test(e)) walk(path.join(src, e), path.join(inF, e)); }
    else if (s.isFile()) moveOne(src, inF);
  };
  if (stat.isDirectory()) walk(abs, inFolder); else if (stat.isFile()) moveOne(abs, inFolder);
  return true;
}

// ── What each PC says about its own copy ─────────────────────────────────────
// Syncthing never tells Gridlantis-HL that a PC's folder is in an error state: a PC
// whose folder stopped ("folder path missing" after the folder was replaced)
// still looked 100% in sync from here. So each PC runs a small reporter
// (installed by the setup scripts) that posts its own folder states every 10 s
// to POST /live/report. It is public (PCs have no session), so a report is
// only taken from the PC's own tailnet address: the one in its pairing code or
// the one its Syncthing connection comes from. Reports live in memory only.
const REPORTS = new Map();          // device ID -> { at, running, folders }
const REPORT_FRESH_MS = 45 * 1000;  // reporter posts every 10 s
const bareIp = ip => String(ip || "").replace(/^::ffff:/, "");

async function report(remoteIp, b) {
  const id = String((b && b.id) || "").toUpperCase();
  if (!ID_RE.test(id)) throw err("bad report");
  const ip = bareIp(remoteIp);
  const known = new Set();
  const m = st.readMeta().devices[id];
  if (m && m.host) known.add(m.host);
  try {
    const c = ((await st.api("GET", "/rest/system/connections")).connections || {})[id];
    if (c && c.address) known.add(c.address.replace(/^\[?([^\]]*?)\]?:\d+$/, "$1"));
  } catch {}
  if (!known.size || !known.has(ip)) throw err("not accepted", 403);

  const num = x => (typeof x === "number" && isFinite(x) ? x : 0);
  const str = (x, n = 300) => (typeof x === "string" ? x.slice(0, n) : "");
  const folders = {};
  for (const [fid, f] of Object.entries((b.folders && typeof b.folders === "object") ? b.folders : {}).slice(0, 200)) {
    const s = (f && f.status) || {}, e = (f && f.errors) || {}, c = (f && f.openhl) || {};
    folders[str(fid, 64)] = {
      ok: !!(f && f.status),
      state: str(s.state, 40), error: str(s.error), watchError: str(s.watchError),
      globalBytes: num(s.globalBytes), localBytes: num(s.localBytes), needBytes: num(s.needBytes),
      needFiles: num(s.needFiles) + num(s.needDeletes), pullErrors: num(s.pullErrors),
      fileErrors: (Array.isArray(e.errors) ? e.errors : []).slice(0, 5).map(x => ({ path: str(x && x.path), error: str(x && x.error) })),
      // From the PC's side: how much of what it has Gridlantis-HL still lacks (= uploading).
      toOpenHL: c && typeof c.completion === "number" ? { completion: c.completion, needBytes: num(c.needBytes), needItems: num(c.needItems) } : null,
    };
  }
  REPORTS.set(id, { at: Date.now(), running: b.running !== false, folders });
  return { ok: true };
}

function freshReport(id) {
  const r = REPORTS.get(id);
  return r && Date.now() - r.at < REPORT_FRESH_MS ? r : null;
}

// ── Status for the page ──────────────────────────────────────────────────────
async function overview() {
  try { await st.ensure(); }
  catch (e) { return { ready: false, error: e.message }; }
  const [me, devices, folders, conns, devStats, folderStats] = await Promise.all([
    st.myId(), st.api("GET", "/rest/config/devices"), st.api("GET", "/rest/config/folders"),
    st.api("GET", "/rest/system/connections"), st.api("GET", "/rest/stats/device"), st.api("GET", "/rest/stats/folder"),
  ]);
  const meta = st.readMeta();
  const conn = conns.connections || {};
  const pcs = devices.filter(d => d.deviceID !== me).map(d => ({
    id: d.deviceID, name: d.name, os: (meta.devices[d.deviceID] || {}).os || "linux",
    host: (meta.devices[d.deviceID] || {}).host || "",
    connected: !!(conn[d.deviceID] && conn[d.deviceID].connected),
    lastSeen: devStats[d.deviceID] && devStats[d.deviceID].lastSeen && !devStats[d.deviceID].lastSeen.startsWith("1970") ? devStats[d.deviceID].lastSeen : null,
    paused: !!d.paused,
    // null: no reporter on this PC yet (set up before it existed) or none lately.
    report: REPORTS.has(d.deviceID) ? { at: new Date(REPORTS.get(d.deviceID).at).toISOString(), fresh: !!freshReport(d.deviceID),
      running: REPORTS.get(d.deviceID).running } : null,
  }));
  const out = [];
  for (const f of folders) {
    const status = await st.api("GET", "/rest/db/status?folder=" + encodeURIComponent(f.id)).catch(e => ({ state: "error", error: e.message }));
    const shared = f.devices.map(d => d.deviceID).filter(id => id !== me);
    const per = {};
    await Promise.all(shared.map(async id => {
      try {
        const c = await st.api("GET", "/rest/db/completion?folder=" + encodeURIComponent(f.id) + "&device=" + id);
        per[id] = { completion: c.completion, needBytes: c.needBytes, needItems: c.needItems + (c.needDeletes || 0), remoteState: c.remoteState };
      } catch { per[id] = null; }
      const r = freshReport(id);
      if (r) {
        if (!per[id]) per[id] = {};
        // missing: the PC has no such folder configured (not accepted yet, or removed there).
        per[id].pc = r.folders[f.id] || { missing: true };
        per[id].pcRunning = r.running;
      }
    }));
    const fs_ = folderStats[f.id] || {};
    out.push({
      id: f.id, label: f.label, path: f.path, paused: f.paused,
      browse: path.relative(st.UPLOAD_DIR, f.path).split(path.sep).join("/"),
      state: status.state, error: status.error || null, pullErrors: status.pullErrors || 0,
      files: status.globalFiles || 0, dirs: status.globalDirectories || 0, bytes: status.globalBytes || 0,
      localFiles: status.localFiles || 0, localBytes: status.localBytes || 0,
      needFiles: status.needFiles || 0, needBytes: status.needBytes || 0,
      lastFile: fs_.lastFile && fs_.lastFile.filename ? { name: fs_.lastFile.filename, at: fs_.lastFile.at, deleted: !!fs_.lastFile.deleted } : null,
      lastScan: fs_.lastScan || null,
      devices: shared, sync: per,
    });
  }
  return { ready: true, me, version: st.VERSION, port: st.SYNC_PORT, pcs, folders: out };
}

module.exports = { addDevice, archiveBeforeChange, createFolder, overview, parseCode, removeDevice, removeFolder, renameDevice, report, restore, updateFolder, versions };
