const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const path = require("path");

const { dataFile } = require("../../config");
const { broadcast } = require("../../sse");
const { readJSON, writeJSONFile } = require("../../store");
const { errorWithStatus } = require("../../helpers");

// ─── LAPTOPS · saved machines ────────────────────────────────────────────────
// Each laptop runs tools/laptop/setup-remote.sh once. That script starts a VNC
// server bound to the laptop's tailnet address, lets only Open HL in, and prints
// a pairing code — the laptop's address plus a random password, the way
// RustDesk shows an ID and a permanent password. Pasting the code here is the
// last time anyone handles that password: Open HL logs in with it on every
// connect (see rfb.js) and never sends it to a browser.
//
// The file holds those passwords, so it sits in the project root on the SSD
// (never on the NTFS volume, where chmod is a no-op) and is written owner-only.
const LAPTOPS_FILE = dataFile("laptops.json");
const PAIR_PREFIX = "openhl-laptop:";

const err = errorWithStatus(400);

function read() {
  const v = readJSON(LAPTOPS_FILE, []);
  return Array.isArray(v) ? v.filter(l => l && l.id) : [];
}
function write(list) {
  writeJSONFile(LAPTOPS_FILE, list);
  for (const f of [LAPTOPS_FILE, LAPTOPS_FILE + ".bak"]) { try { fs.chmodSync(f, 0o600); } catch {} }
  broadcast("laptops", { what: "list" });
}

// ── Pairing code ─────────────────────────────────────────────────────────────
// openhl-laptop:<base64url of {"v":1,"name","host","port","password"}>
function parsePairing(code) {
  const s = String(code || "").trim().replace(/\s+/g, "");
  if (!s.startsWith(PAIR_PREFIX)) throw err("that is not a pairing code — it starts with " + PAIR_PREFIX);
  let o;
  try { o = JSON.parse(Buffer.from(s.slice(PAIR_PREFIX.length), "base64url").toString("utf8")); }
  catch { throw err("the pairing code is damaged — copy the whole line again"); }
  if (!o || o.v !== 1) throw err("this pairing code comes from a newer setup script");
  return { name: o.name, host: o.host, port: o.port, password: o.password };
}

function normalizeHost(input) {
  const s = String(input || "").trim().replace(/^\[|\]$/g, "");
  if (!s) throw err("the PC's address is required");
  if (!net.isIP(s) && !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(s))
    throw err("give an IP address or a host name, with no port or scheme");
  return s.toLowerCase();
}
function normalizePort(p) {
  if (p === undefined || p === null || p === "") return 5900;
  const n = Number(p);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw err("the port must be between 1 and 65535");
  return n;
}
const normalizeName = (name, host) => String(name || "").trim().slice(0, 60) || host;

function newId(name) {
  const base = String(name || "laptop").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "laptop";
  const taken = new Set(read().map(l => l.id));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!taken.has(base + "-" + i)) return base + "-" + i;
  return base + "-" + crypto.randomBytes(3).toString("hex");
}

// ── Reads ────────────────────────────────────────────────────────────────────
const get = id => read().find(l => l.id === id) || null;

// What the browser may see: never the password, only whether one is saved.
function publicView(l) {
  return { id: l.id, name: l.name, host: l.host, port: l.port, hasPassword: !!l.password,
    addedAt: l.addedAt || null, lastConnectedAt: l.lastConnectedAt || null };
}
const list = () => read().map(publicView);

// ── Writes ───────────────────────────────────────────────────────────────────
// Accepts either { pairing } or the fields by hand. Pairing the same address
// again (after re-running the script) replaces that laptop's password in place.
function fields(b) {
  const f = b.pairing ? Object.assign(parsePairing(b.pairing), b.name ? { name: b.name } : {}) : b;
  const host = normalizeHost(f.host);
  return { host, port: normalizePort(f.port), name: normalizeName(f.name, host), password: f.password === undefined ? undefined : String(f.password) };
}

function add(b) {
  const f = fields(b);
  if (!f.password) throw err("the password is required — the setup script prints it");
  const list0 = read();
  const same = list0.find(l => l.host === f.host && l.port === f.port);
  if (same) {
    same.password = f.password;
    if (b.name || b.pairing) same.name = f.name;
    write(list0);
    return Object.assign(publicView(same), { repaired: true });
  }
  const laptop = { id: newId(f.name), name: f.name, host: f.host, port: f.port, password: f.password, addedAt: new Date().toISOString() };
  list0.push(laptop);
  write(list0);
  return publicView(laptop);
}

function update(id, b) {
  const list0 = read();
  const l = list0.find(x => x.id === id);
  if (!l) throw err("PC not found", 404);
  if (b.pairing) {
    const f = fields(b);
    Object.assign(l, { host: f.host, port: f.port, password: f.password });
    if (b.name) l.name = f.name;
  } else {
    if (b.name !== undefined) l.name = normalizeName(b.name, l.host);
    if (b.host !== undefined) l.host = normalizeHost(b.host);
    if (b.port !== undefined) l.port = normalizePort(b.port);
    if (b.password) l.password = String(b.password);
  }
  if (list0.some(x => x !== l && x.host === l.host && x.port === l.port)) throw err("another PC already uses that address", 409);
  write(list0);
  return publicView(l);
}

function touch(id) {
  const list0 = read();
  const l = list0.find(x => x.id === id);
  if (!l) return;
  l.lastConnectedAt = new Date().toISOString();
  write(list0);
}

function remove(id) {
  const list0 = read();
  const next = list0.filter(l => l.id !== id);
  if (next.length === list0.length) throw err("PC not found", 404);
  write(next);
  return { ok: true };
}

module.exports = { LAPTOPS_FILE, add, get, list, parsePairing, publicView, remove, touch, update };
