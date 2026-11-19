const fs = require("fs");
const path = require("path");

const { NOTES_FILE, UPLOAD_DIR, dataFile } = require("../config");
const { readReminders } = require("./reminders");
const containers = require("./docker/containers");
const laptops = require("./laptops/store");
const vmHosts = require("./vmlab/hosts");
const vmStore = require("./vmlab/store");
const { readJSON, writeJSONFile } = require("../store");

// ─── CONNECTWORK ──────────────────────────────────────────────────────────────
// One graph of notes, flows, reminders, files, virtual machines, containers
// and hosts. Some links come from the
// items themselves (a flow holding a note, a note pointing at another note or
// flow); the rest are drawn by hand on /connectwork and kept here as pairs of
// node ids. A link to something that has since gone stays in the file but is
// left out of the graph, so a file that comes back finds its links again.
const LINKS_FILE = dataFile("connectwork.json");
const FLOWS_FILE = dataFile("flows.json");
const MAX_FILES = 1500, MAX_DEPTH = 6, MAX_LINKS = 10000;
const SKIP = /^(\.stfolder|\.stignore|\.stversions)$|^\.syncthing\..*\.tmp$|^~syncthing~/;
// Folders that hold tools' output, not your files: dependencies, builds, caches.
// Hidden folders (.git, .venv, .cache...) are skipped too.
const SKIP_DIRS = new Set(["node_modules", "bower_components", "vendor", "dist", "build", "out", "target", "coverage",
  "__pycache__", "venv", "env", "site-packages", "Pods", "DerivedData", "obj"]);
// A folder holding one of these is a code project: it shows as one item, not
// every source file inside it.
const PROJECT_MARKERS = [".git", "package.json", "Cargo.toml", "go.mod", "pyproject.toml", "setup.py", "requirements.txt",
  "pom.xml", "build.gradle", "CMakeLists.txt", "Makefile", "composer.json", "Gemfile", "pubspec.yaml"];

const TYPES = ["note", "flow", "rem", "file", "vm", "ctr", "host"];
const idOk = id => typeof id === "string" && id.length <= 1100 && TYPES.includes(id.split(":")[0]) && id.indexOf(":") > 0;
const pairKey = (a, b) => (a < b ? a + "\n" + b : b + "\n" + a);
const asList = v => (Array.isArray(v) ? v : []);

function readLinks() {
  return asList(readJSON(LINKS_FILE, [])).filter(l => l && typeof l.id === "string" && idOk(l.a) && idOk(l.b));
}

// Files under uploads/, breadth first so a deep tree cannot crowd out the top.
// Returns { path, project } items; a code project folder is one item.
function listFiles() {
  const out = [], queue = [["", 0]];
  const root = path.resolve(UPLOAD_DIR);
  while (queue.length && out.length < MAX_FILES) {
    const [rel, depth] = queue.shift();
    let entries;
    try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { continue; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (SKIP.test(e.name)) continue;
      const r = rel ? rel + "/" + e.name : e.name;
      if (e.isDirectory()) {
        if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
        let inner = [];
        try { inner = fs.readdirSync(path.join(root, r)); } catch {}
        if (PROJECT_MARKERS.some(m => inner.includes(m))) { if (out.length < MAX_FILES) out.push({ path: r, project: true }); }
        else if (depth < MAX_DEPTH) queue.push([r, depth + 1]);
      }
      else if (e.isFile() && !e.name.startsWith(".") && out.length < MAX_FILES) out.push({ path: r, project: false });
    }
  }
  return out;
}

// Containers come from the Docker engine on this machine. When Docker is not
// running (or answers slowly) the graph goes on without them.
function dockerContainers() {
  return Promise.race([
    containers.list(true).catch(() => []),
    new Promise(r => setTimeout(() => r([]), 2500)),
  ]);
}

// `withAi: false` leaves out the AI's suggestions (used when asking it for more).
async function graph(opts = {}) {
  const nodes = [], have = new Set();
  const add = n => { if (!have.has(n.id)) { have.add(n.id); nodes.push(n); } };

  const notes = asList(readJSON(NOTES_FILE, []));
  for (const n of notes) {
    if (!n || typeof n.id !== "string") continue;
    add({ id: "note:" + n.id, type: "note", title: String(n.title || "Untitled"), sub: n.hidden ? "Locked note" : "Note",
          href: "/notes?open=" + encodeURIComponent(n.id) });
  }
  const flows = asList(readJSON(FLOWS_FILE, []));
  for (const f of flows) {
    if (!f || typeof f.id !== "string") continue;
    add({ id: "flow:" + f.id, type: "flow", title: String(f.name || "Untitled flow"),
          sub: asList(f.nodes).length + " boxes", href: "/flows?open=" + encodeURIComponent(f.id) });
  }
  let reminders = [];
  try { reminders = asList(readReminders()); } catch {}
  for (const r of reminders) {
    if (!r || typeof r.id !== "string") continue;
    add({ id: "rem:" + r.id, type: "rem", title: String(r.title || "Reminder"), at: Number(r.at) || null,
          sub: r.enabled === false ? "Reminder, off" : "Reminder", href: "/reminders?edit=" + encodeURIComponent(r.id) });
  }
  const files = listFiles();
  for (const { path: f, project } of files) {
    const slash = f.lastIndexOf("/");
    add({ id: "file:" + f, type: "file", title: f.slice(slash + 1), sub: slash > 0 ? f.slice(0, slash) : "Files",
          project: project || undefined, href: project ? "/files" : "/api/files/preview?path=" + encodeURIComponent(f) });
  }

  // Hosts: the VM Lab machines (this one and remote agents) and the PCs on the
  // PC host page. VMs listed are the ones VM Lab runs on this machine.
  const LOCAL = "host:vm:" + vmHosts.LOCAL_ID;
  let hostList = [];
  try { hostList = vmHosts.list(); } catch {}
  for (const h of hostList) {
    const local = h.id === vmHosts.LOCAL_ID;
    add({ id: "host:vm:" + h.id, type: "host", title: String(h.name || h.id), sub: local ? "This server" : "VM host" + (h.enabled ? "" : ", off"),
          href: "/vmlab?host=" + encodeURIComponent(h.id) + "#host" });
  }
  let pcs = [];
  try { pcs = laptops.list(); } catch {}
  for (const l of pcs) {
    if (!l || typeof l.id !== "string") continue;
    add({ id: "host:pc:" + l.id, type: "host", title: String(l.name || l.host || "PC"), sub: "PC" + (l.host ? ", " + l.host : ""), href: "/laptops" });
  }
  let vms = [];
  try { vms = vmStore.envs.read(); } catch {}
  for (const v of vms) {
    if (!v || typeof v.id !== "string") continue;
    add({ id: "vm:" + v.id, type: "vm", title: String(v.name || "Virtual machine"), sub: "Virtual machine" + (v.status ? ", " + v.status : ""),
          href: "/vmlab#envs" });
  }
  // Keyed by name, not id: a container recreated under the same name keeps its links.
  const ctrs = await dockerContainers();
  for (const c of ctrs) {
    if (!c || !c.name) continue;
    add({ id: "ctr:" + c.name, type: "ctr", title: String(c.name), sub: "Container" + (c.state ? ", " + c.state : "") + (c.image ? " · " + c.image : ""),
          href: "/docker#containers" });
  }

  // Links, one per pair. A hand-drawn link keeps its id so it can be removed;
  // one the items make themselves says why it is there.
  const edges = new Map();
  const link = (a, b, extra) => {
    if (a === b || !have.has(a) || !have.has(b)) return;
    const k = pairKey(a, b), e = edges.get(k) || { a, b, why: [] };
    if (extra.id) e.id = extra.id;
    if (extra.ai) e.ai = true;
    if (extra.why && !e.why.includes(extra.why)) e.why.push(extra.why);
    edges.set(k, e);
  };
  for (const f of flows) {
    if (!f || typeof f.id !== "string") continue;
    for (const n of asList(f.nodes)) if (n && typeof n.noteId === "string") link("flow:" + f.id, "note:" + n.noteId, { why: "Note in this flow" });
  }
  const byTitle = new Map();
  for (const n of notes) if (n && n.title) byTitle.set(String(n.title).trim().toLowerCase(), n.id);
  for (const n of notes) {
    if (!n || typeof n.id !== "string" || typeof n.body !== "string") continue;
    const me = "note:" + n.id;
    for (const m of n.body.matchAll(/\/notes\?open=([\w%.-]+)/g)) link(me, "note:" + decodeURIComponent(m[1]), { why: "Linked from the note" });
    for (const m of n.body.matchAll(/\/flows\?open=([\w%.-]+)/g)) link(me, "flow:" + decodeURIComponent(m[1]), { why: "Linked from the note" });
    for (const m of n.body.matchAll(/\[\[([^\]|\n]{1,200})(?:\|[^\]\n]*)?\]\]/g)) {
      const id = byTitle.get(m[1].trim().toLowerCase());
      if (id) link(me, "note:" + id, { why: "[[" + m[1].trim() + "]] in the note" });
    }
  }
  for (const v of vms) if (v && typeof v.id === "string") link("vm:" + v.id, LOCAL, { why: "Runs on this host" });
  for (const c of ctrs) if (c && c.name) link("ctr:" + c.name, LOCAL, { why: "Runs on this host" });
  for (const l of readLinks()) link(l.a, l.b, { id: l.id });
  // The AI's suggestions only where nothing else links the pair already.
  if (opts.withAi !== false) {
    for (const l of require("./connectwork-ai").suggestions()) {
      if (!edges.has(pairKey(l.a, l.b))) link(l.a, l.b, { ai: true, why: "Suggested by AI" + (l.why ? ": " + l.why : "") });
    }
  }

  return { nodes, edges: [...edges.values()], filesCapped: files.length >= MAX_FILES, auto: opts.withAi === false ? null : require("./connectwork-ai").status() };
}

const newId = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Adds a hand-drawn link. Both ends must be in the graph now.
async function addLink(a, b) {
  if (!idOk(a) || !idOk(b)) return { error: "Unknown item", status: 400 };
  if (a === b) return { error: "An item cannot link to itself", status: 400 };
  const ids = new Set((await graph()).nodes.map(n => n.id));
  if (!ids.has(a) || !ids.has(b)) return { error: "One of those items no longer exists", status: 404 };
  const list = readLinks();
  const dup = list.find(l => pairKey(l.a, l.b) === pairKey(a, b));
  if (dup) return { link: dup };
  if (list.length >= MAX_LINKS) return { error: "Too many links", status: 400 };
  const l = { id: newId(), a, b, created: new Date().toISOString() };
  list.push(l);
  writeJSONFile(LINKS_FILE, list);
  return { link: l };
}

function removeLink(id) {
  const list = readLinks(), keep = list.filter(l => l.id !== id);
  if (keep.length === list.length) return false;
  writeJSONFile(LINKS_FILE, keep);
  return true;
}

module.exports = { addLink, graph, removeLink };
