const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { execFile } = require("child_process");

const { CATALOG, byId } = require("./catalog");
const { IMAGES_DIR, newId, qemuImgBinary } = require("./paths");
const { UPLOAD_DIR } = require("../../config");
const store = require("./store");
const { broadcast } = require("../../sse");

// ─── VM LAB · base images and ISOs ───────────────────────────────────────────
const IMAGE_EXT = /\.(qcow2|img|raw|vmdk|vdi|vhdx?|iso)$/i;

function execFileP(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: opts.timeout || 60000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) { err.message = (String(stderr || "").trim() || err.message).slice(0, 600); return reject(err); }
      resolve(stdout);
    });
  });
}

async function qemuImgInfo(file) {
  const bin = qemuImgBinary();
  if (!bin) return null;
  try { return JSON.parse(await execFileP(bin, ["info", "--output=json", "-U", file], { timeout: 20000 })); }
  catch { return null; }
}

// Files dropped into vmlab/images by hand show up without an import step.
function reconcile() {
  const list = store.images.read();
  let changed = false;
  let files = [];
  try { files = fs.readdirSync(IMAGES_DIR).filter(f => IMAGE_EXT.test(f) && !f.endsWith(".part")); } catch {}
  for (const f of files) {
    if (list.some(i => i.file === f)) continue;
    const st = fs.statSync(path.join(IMAGES_DIR, f));
    list.push({ id: newId("img"), name: f, file: f, kind: /\.iso$/i.test(f) ? "iso" : "disk", family: "linux",
      osId: null, cloudInit: false, sizeBytes: st.size, createdAt: new Date(st.mtimeMs).toISOString(), source: "folder" });
    changed = true;
  }
  const kept = list.filter(i => {
    const full = path.join(IMAGES_DIR, i.file);
    if (fs.existsSync(full)) return true;
    changed = true; return false;
  });
  if (changed) store.images.write(kept, "images");
  return kept;
}

function listImages() {
  return reconcile().map(i => {
    let size = i.sizeBytes;
    try { size = fs.statSync(path.join(IMAGES_DIR, i.file)).size; } catch {}
    return Object.assign({}, i, { sizeBytes: size, path: path.join(IMAGES_DIR, i.file) });
  });
}
const getImage = id => listImages().find(i => i.id === id) || null;

async function registerFile(file, meta) {
  const full = path.join(IMAGES_DIR, file);
  const info = await qemuImgInfo(full);
  const iso = /\.iso$/i.test(file);
  const os = meta.osId ? byId(meta.osId) : null;
  const rec = {
    id: newId("img"), name: meta.name || (os ? os.name : file), file,
    kind: iso ? "iso" : "disk",
    family: meta.family || (os ? os.family : "linux"),
    distro: os ? os.distro : (meta.distro || null),
    desktop: !!(meta.desktop != null ? meta.desktop : os && os.desktop),
    driverDisc: !!(os && os.driverDisc),
    osId: meta.osId || null,
    cloudInit: meta.cloudInit != null ? !!meta.cloudInit : !!(os && os.kind === "cloud"),
    firmware: meta.firmware || (os && os.firmware) || "bios",
    format: iso ? "raw" : ((info && info.format) || "qcow2"),
    virtualSize: info ? info["virtual-size"] : null,
    sizeBytes: fs.statSync(full).size,
    createdAt: new Date().toISOString(),
    source: meta.source || "upload",
  };
  const list = store.images.read().filter(i => i.file !== file);
  list.push(rec);
  store.images.write(list, "images");
  return rec;
}

function uniqueFileName(name) {
  let base = path.basename(String(name || "image")).replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "");
  if (!base) base = "image";
  if (!IMAGE_EXT.test(base)) base += ".img";
  let f = base, n = 1;
  while (fs.existsSync(path.join(IMAGES_DIR, f)) || fs.existsSync(path.join(IMAGES_DIR, f + ".part"))) {
    const ext = path.extname(base);
    f = path.basename(base, ext) + "-" + (++n) + ext;
  }
  return f;
}

// ── Downloads ────────────────────────────────────────────────────────────────
const JOBS = new Map();   // id -> job (in memory; a restart abandons partial files)

function fetchText(url, hops = 0) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https:") ? https : http;
    const req = mod.get(url, { headers: { "User-Agent": "Metis-VMLab/1.0" }, timeout: 15000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 6) {
        res.resume(); return resolve(fetchText(new URL(res.headers.location, url).href, hops + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode + " from " + new URL(url).hostname)); }
      let d = ""; res.setEncoding("utf8"); res.on("data", c => { d += c; if (d.length > 4e6) req.destroy(); }); res.on("end", () => resolve(d));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

async function resolveUrl(os) {
  if (os.url) return os.url;
  if (!os.resolve) throw new Error("no download source");
  let lastErr;
  for (let index of os.resolve.index) {
    try {
      if (os.resolve.dir) {                              // newest dated build folder first
        const dirs = Array.from(new Set((await fetchText(index)).match(new RegExp(os.resolve.dir, "g")) || []));
        if (!dirs.length) { lastErr = new Error("no build folder in " + index); continue; }
        dirs.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        index = index + dirs[dirs.length - 1];
      }
      const body = await fetchText(index);
      const found = Array.from(new Set(body.match(new RegExp(os.resolve.pattern, "g")) || []));
      if (!found.length) { lastErr = new Error("no matching file in " + index); continue; }
      found.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      return index + found[found.length - 1];
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("could not resolve download");
}

function publicJob(j) {
  return { id: j.id, osId: j.osId, name: j.name, url: j.url, status: j.status, received: j.received, total: j.total,
    rate: j.rate, error: j.error || null, imageId: j.imageId || null, startedAt: j.startedAt };
}
function listJobs() { return Array.from(JOBS.values()).map(publicJob); }

function startDownload(args) {
  try { return startDownloadInner(args); } catch (e) { e.status = e.status || 400; throw e; }
}
// after(imageRecord): run once the image is registered (New mobile VM creates
// its VM there, so a download-first OS ends up as a VM without a second click).
function startDownloadInner({ osId, url, name, after }) {
  const os = osId ? byId(osId) : null;
  if (osId && !os) throw new Error("unknown operating system");
  if (os && os.manual) throw new Error(os.name + " cannot be downloaded automatically — " + (os.note || "upload the ISO"));
  if (!os && !/^https?:\/\//i.test(String(url || ""))) throw new Error("a http(s) URL is required");
  const running = listJobs().find(j => j.status === "downloading" && ((osId && j.osId === osId) || (url && j.url === url)));
  if (running) throw new Error("that download is already running");
  const job = { id: newId("dl"), osId: osId || null, name: name || (os ? os.name : null), url: url || null, status: "resolving",
    received: 0, total: 0, rate: 0, startedAt: new Date().toISOString(), req: null };
  JOBS.set(job.id, job);
  (async () => {
    try {
      job.url = os ? await resolveUrl(os) : url;
      // A ".xz" download is unpacked after, so the name to keep is the one without it
      // (uniqueFileName would otherwise tack ".img" onto "….img.xz").
      const remote = (os && os.fileName) || path.basename(new URL(job.url).pathname) || "download.img";
      const xz = /\.xz$/i.test(remote);
      const fileName = uniqueFileName(xz ? remote.replace(/\.xz$/i, "") : remote);
      job.file = fileName;
      if (!job.name) job.name = fileName;
      const part = path.join(IMAGES_DIR, fileName + (xz ? ".xz.part" : ".part"));
      job.part = part;
      await downloadTo(job, job.url, part);
      if (job.status === "cancelled") return;
      if (os && os.checksum === "sha256") {
        job.status = "verifying"; broadcast("vmlab", { what: "downloads" });
        const want = ((await fetchText(job.url + ".sha256")).match(/\b[0-9a-f]{64}\b/i) || [])[0];
        if (!want) throw new Error("no published checksum next to the download");
        if (want.toLowerCase() !== job.sha256) throw new Error("checksum mismatch — the download is corrupt; try again");
      }
      if (xz) {
        // Compressed disk image: unpack next to it, keep only the result.
        job.status = "unpacking"; broadcast("vmlab", { what: "downloads" });
        const out = fileName;
        await new Promise((resolve, reject) => {
          const xz = require("child_process").spawn("xz", ["-dc", part], { stdio: ["ignore", "pipe", "pipe"] });
          const w = fs.createWriteStream(path.join(IMAGES_DIR, out + ".part"));
          let errText = ""; xz.stderr.on("data", d => { errText += d; });
          xz.stdout.pipe(w);
          xz.on("error", e => reject(new Error("xz is not installed: " + e.message)));
          w.on("finish", () => xz.exitCode === 0 || xz.exitCode === null ? resolve() : reject(new Error("unpacking failed: " + errText.trim())));
          xz.on("exit", code => { if (code) reject(new Error("unpacking failed: " + errText.trim())); });
        });
        fs.unlinkSync(part);
        fs.renameSync(path.join(IMAGES_DIR, out + ".part"), path.join(IMAGES_DIR, out));
      } else fs.renameSync(part, path.join(IMAGES_DIR, fileName));
      job.status = "registering"; broadcast("vmlab", { what: "downloads" });
      const rec = await registerFile(job.file, { osId, name: job.name, source: job.url,
        cloudInit: os ? os.kind === "cloud" : undefined });
      job.imageId = rec.id; job.status = "done";
      if (after) { try { await after(rec); } catch (e) { job.error = "downloaded, but creating the VM failed: " + e.message; } }
    } catch (e) {
      if (job.status !== "cancelled") { job.status = "error"; job.error = e.message; }
      for (const f of [job.part, job.file && path.join(IMAGES_DIR, job.file + ".part")]) { try { if (f) fs.unlinkSync(f); } catch {} }
    }
    broadcast("vmlab", { what: "downloads" });
    setTimeout(() => JOBS.delete(job.id), 10 * 60 * 1000).unref?.();
  })();
  return publicJob(job);
}

function downloadTo(job, url, dest, hops = 0) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https:") ? https : http;
    job.status = "downloading";
    const req = mod.get(url, { headers: { "User-Agent": "Metis-VMLab/1.0" }, timeout: 30000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 8) {
        res.resume();
        return resolve(downloadTo(job, new URL(res.headers.location, url).href, dest, hops + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode + " from " + new URL(url).hostname)); }
      job.total = parseInt(res.headers["content-length"] || "0", 10) || 0;
      const out = fs.createWriteStream(dest);
      const hash = require("crypto").createHash("sha256");
      let lastT = Date.now(), lastB = 0;
      res.on("data", c => {
        hash.update(c);
        job.received += c.length;
        const now = Date.now();
        if (now - lastT >= 1000) {
          job.rate = Math.round((job.received - lastB) * 1000 / (now - lastT)); lastT = now; lastB = job.received;
          broadcast("vmlab", { what: "downloads" });
        }
      });
      res.pipe(out);
      out.on("finish", () => { job.sha256 = hash.digest("hex"); (job.total && job.received < job.total) ? reject(new Error("download ended early")) : resolve(); });
      out.on("error", reject);
      res.on("error", reject);
    });
    job.req = req;
    req.on("timeout", () => req.destroy(new Error("connection timed out")));
    req.on("error", e => reject(job.status === "cancelled" ? new Error("cancelled") : e));
  });
}

function cancelDownload(id) {
  const j = JOBS.get(id);
  if (!j) return false;
  if (j.status === "downloading" || j.status === "resolving") {
    j.status = "cancelled";
    try { j.req && j.req.destroy(); } catch {}
  }
  JOBS.delete(id);
  broadcast("vmlab", { what: "downloads" });
  return true;
}

// ── Upload (streamed — ISOs are several GB, never buffer them) ──────────────
function receiveUpload(req, name, meta) {
  return new Promise((resolve, reject) => {
    const file = uniqueFileName(name);
    const part = path.join(IMAGES_DIR, file + ".part");
    const out = fs.createWriteStream(part);
    let failed = false;
    const fail = e => { if (failed) return; failed = true; try { out.destroy(); fs.unlinkSync(part); } catch {} reject(e); };
    req.on("aborted", () => fail(new Error("upload aborted")));
    req.on("error", fail);
    out.on("error", fail);
    out.on("finish", async () => {
      if (failed) return;
      try { fs.renameSync(part, path.join(IMAGES_DIR, file)); resolve(await registerFile(file, Object.assign({ source: "upload" }, meta))); }
      catch (e) { reject(e); }
    });
    req.pipe(out);
  });
}

// ── Browse Metis Files for bootable media ───────────────────────────────────
// Anything you drop in the Files app (or download straight into uploads/) is a
// boot candidate. Walk a few levels deep and hand back paths the import
// endpoint accepts, marking the ones already registered as images.
// Where to look for bootable media you already have. Metis Files first, then
// any extra folders from VMLAB_MEDIA_DIRS (colon-separated) — e.g. the "OS
// isos" folder on the big drive. Paths that do not exist are skipped, so an
// unmounted drive just means one fewer group rather than an error.
function mediaSources() {
  const list = [{ label: "My files", dir: UPLOAD_DIR }];
  for (const raw of String(process.env.VMLAB_MEDIA_DIRS || "").split(":")) {
    const dir = raw.trim();
    if (!dir) continue;
    try { if (!fs.statSync(dir).isDirectory()) continue; } catch { continue; }
    if (list.some(s => path.resolve(s.dir) === path.resolve(dir))) continue;
    list.push({ label: path.basename(dir) || dir, dir });
  }
  return list;
}

function listFromFiles() {
  const out = [];
  const seen = new Set(listImages().map(i => String(i.source || "").replace(/^import:/, "")));
  const walk = (src, dir, rel, depth) => {
    if (depth > 4 || out.length >= 500) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const full = path.join(dir, e.name);
      const key = rel ? rel + "/" + e.name : e.name;
      if (e.isDirectory()) { walk(src, full, key, depth + 1); continue; }
      if (!IMAGE_EXT.test(e.name)) continue;
      let st; try { st = fs.statSync(full); } catch { continue; }
      out.push({ name: e.name, source: src.label, relPath: key, path: full, sizeBytes: st.size, mtime: st.mtimeMs,
        kind: /\.iso$/i.test(e.name) ? "iso" : "disk", added: seen.has(full) });
    }
  };
  for (const src of mediaSources()) walk(src, src.dir, "", 0);
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

// ── Import from a path on the host (e.g. an ISO already in ~/Downloads) ─────
async function importPath(src, meta, mode) {
  try { return await importPathInner(src, meta, mode); } catch (e) { e.status = e.status || 400; throw e; }
}
async function importPathInner(src, meta, mode) {
  const full = path.resolve(String(src || ""));
  let st;
  try { st = fs.statSync(full); } catch { throw new Error("file not found on the host: " + full); }
  if (!st.isFile()) throw new Error("not a regular file: " + full);
  if (!IMAGE_EXT.test(full)) throw new Error("expected .iso, .qcow2, .img, .raw, .vmdk, .vdi or .vhdx");
  const file = uniqueFileName(path.basename(full));
  const dest = path.join(IMAGES_DIR, file);
  if (mode === "link") fs.symlinkSync(full, dest);
  else await fs.promises.copyFile(full, dest);
  return registerFile(file, Object.assign({ source: "import:" + full }, meta));
}

function updateImage(id, patch) {
  const list = store.images.read();
  const img = list.find(i => i.id === id);
  if (!img) return null;
  for (const k of ["name", "family", "cloudInit", "firmware", "desktop"]) if (patch[k] !== undefined) img[k] = patch[k];
  if (!["windows", "linux", "android", "other"].includes(img.family)) img.family = "linux";
  if (img.firmware !== "uefi") img.firmware = "bios";
  img.cloudInit = !!img.cloudInit; img.desktop = !!img.desktop;
  store.images.write(list, "images");
  return img;
}

function deleteImage(id, inUse) {
  const list = store.images.read();
  const img = list.find(i => i.id === id);
  if (!img) return { error: "not found", status: 404 };
  if (inUse) return { error: "in use by " + inUse, status: 409 };
  try { fs.unlinkSync(path.join(IMAGES_DIR, img.file)); } catch {}
  store.images.write(list.filter(i => i.id !== id), "images");
  return { ok: true };
}

module.exports = { CATALOG, cancelDownload, deleteImage, execFileP, getImage, importPath, listFromFiles, listImages,
  listJobs, qemuImgInfo, receiveUpload, registerFile, startDownload, uniqueFileName, updateImage };
