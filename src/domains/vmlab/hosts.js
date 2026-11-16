const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { broadcast } = require("../../sse");
const { readJSON, writeJSONFile } = require("../../store");
const { VMLAB_DIR } = require("./paths");
const { errorWithStatus } = require("../../helpers");

// ─── VM LAB · hosts ──────────────────────────────────────────────────────────
// VM Lab can drive more than one machine. "local" is this Metis itself and is
// always present; every other host is a second device running the VM Lab agent
// (vmlab-agent.js) that Metis talks to over HTTP with a bearer token.
//
// The file holds agent tokens, so it lives in vmlab/ on the SSD (never on the
// symlinked NTFS volume, where a mode of 0600 would be a no-op) and is written
// owner-only.
const HOSTS_FILE = path.join(VMLAB_DIR, "hosts.json");
const LOCAL_ID = "local";

const err = errorWithStatus(400);

function read() {
  const v = readJSON(HOSTS_FILE, []);
  return Array.isArray(v) ? v.filter(h => h && h.id && h.id !== LOCAL_ID) : [];
}
function write(list) {
  writeJSONFile(HOSTS_FILE, list);
  try { fs.chmodSync(HOSTS_FILE, 0o600); } catch {}
  broadcast("vmlab", { what: "hosts" });
}

// The local host is synthesised rather than stored: it cannot be edited away,
// and its name follows the machine's hostname.
function localHost() {
  return { id: LOCAL_ID, kind: "local", name: os.hostname(), url: null, enabled: true, builtin: true };
}

// ── Normalisation ────────────────────────────────────────────────────────────
// Accept "100.64.0.2", "100.64.0.2:3010" or a full URL; always store a
// scheme + explicit port and no trailing slash, so proxy paths just concatenate.
function normalizeUrl(input) {
  let s = String(input || "").trim();
  if (!s) throw err("the host's address is required");
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  let u;
  try { u = new URL(s); } catch { throw err("that address is not a valid URL"); }
  if (!u.hostname) throw err("that address has no host");
  if (!u.port) u.port = "3010";
  if (u.pathname !== "/" || u.search || u.hash) throw err("give just the host and port, with no path");
  return u.origin;
}
function normalizeName(name, url) {
  const n = String(name || "").trim().slice(0, 60);
  if (n) return n;
  try { return new URL(url).hostname; } catch { return "VM host"; }
}

function newHostId(name) {
  const base = String(name || "host").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "host";
  // "test" is the path Metis uses to probe an address that is not saved yet.
  const taken = new Set(read().map(h => h.id).concat([LOCAL_ID, "test"]));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!taken.has(base + "-" + i)) return base + "-" + i;
  return base + "-" + crypto.randomBytes(3).toString("hex");
}

// ── Reads ────────────────────────────────────────────────────────────────────
function all() { return [localHost()].concat(read()); }
function get(id) {
  if (!id || id === LOCAL_ID) return localHost();
  return read().find(h => h.id === id) || null;
}
const isLocal = h => !h || h.kind === "local" || h.id === LOCAL_ID;

// What the browser is allowed to see: never the token, only whether one is set.
function publicView(h) {
  return { id: h.id, kind: h.kind || "remote", name: h.name, url: h.url || null,
    enabled: h.enabled !== false, builtin: !!h.builtin, hasToken: !!h.token, addedAt: h.addedAt || null };
}
const list = () => all().map(publicView);

// ── Writes ───────────────────────────────────────────────────────────────────
function add(b) {
  const url = normalizeUrl(b.url);
  const token = String(b.token || "").trim();
  if (!token) throw err("the agent token is required — the deploy script prints it");
  const list0 = read();
  if (list0.some(h => h.url === url)) throw err("a host with that address is already added", 409);
  const name = normalizeName(b.name, url);
  const host = { id: newHostId(name), kind: "remote", name, url, token, enabled: b.enabled !== false,
    addedAt: new Date().toISOString() };
  list0.push(host);
  write(list0);
  return publicView(host);
}

function update(id, b) {
  if (id === LOCAL_ID) throw err("this machine's entry cannot be changed", 400);
  const list0 = read();
  const h = list0.find(x => x.id === id);
  if (!h) throw err("host not found", 404);
  if (b.name !== undefined) h.name = normalizeName(b.name, h.url);
  if (b.url !== undefined) {
    const url = normalizeUrl(b.url);
    if (list0.some(x => x !== h && x.url === url)) throw err("a host with that address is already added", 409);
    h.url = url;
  }
  if (b.token) h.token = String(b.token).trim();
  if (b.enabled !== undefined) h.enabled = !!b.enabled;
  write(list0);
  STATUS.delete(id);
  return publicView(h);
}

function remove(id) {
  if (id === LOCAL_ID) throw err("this machine cannot be removed", 400);
  const list0 = read();
  const next = list0.filter(h => h.id !== id);
  if (next.length === list0.length) throw err("host not found", 404);
  write(next);
  STATUS.delete(id);
  return { ok: true };
}

// ── Reachability ─────────────────────────────────────────────────────────────
// Probed on demand and cached briefly: the VM Lab page asks for every host's
// status on each load, and a laptop that is asleep costs a full timeout.
const STATUS = new Map();   // id -> { at, value }
const STATUS_TTL = 10000;

async function status(id, { force = false } = {}) {
  const host = get(id);
  if (!host) throw err("host not found", 404);
  if (isLocal(host)) {
    const { agentInfo } = require("../../routes/vmlab-api");
    return Object.assign({ id: LOCAL_ID, online: true }, await agentInfo());
  }
  const hit = STATUS.get(id);
  if (!force && hit && Date.now() - hit.at < STATUS_TTL) return hit.value;
  const remote = require("./remote");
  let value;
  try {
    const info = await remote.json(host, "GET", "/api/vmlab/agent/info", null, 6000);
    value = Object.assign({ id, online: true, error: null }, info);
  } catch (e) {
    value = { id, online: false, error: e.message };
  }
  STATUS.set(id, { at: Date.now(), value });
  return value;
}

// One sweep for the Hosts tab. Probed in parallel so a sleeping laptop does not
// hold up the ones that are awake.
async function statusAll(opts) {
  return Promise.all(all().map(async h =>
    Object.assign(publicView(h), { status: await status(h.id, opts).catch(e => ({ id: h.id, online: false, error: e.message })) })));
}

module.exports = { HOSTS_FILE, LOCAL_ID, add, all, get, isLocal, list, localHost, normalizeUrl, publicView, remove, status, statusAll, update };
