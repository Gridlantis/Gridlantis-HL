const { AI_PEERS_FILE, NOTES_FILE, dataFile } = require("../config");
const { aiProvider, getAiKey, SETTINGS, saveSettings } = require("../settings");
const { broadcast } = require("../sse");
const { readJSON, writeJSONFile } = require("../store");

// ─── CONNECTWORK · AUTO-CONNECTIONS ───────────────────────────────────────────
// Asks an AI which items in ConnectWork belong together. Turned on, with its
// source, on the AI page; what it found is kept here and shown on the graph
// as dotted links until kept (they become ordinary links) or dismissed (they
// never come back). Off hides them without forgetting them.
//
// What is sent: each item's type and title, plus the first lines of notes
// that are not locked. Never file contents, keys or anything else.
const STATE_FILE = dataFile("connectwork_ai.json");
const EVERY_MS = 6 * 60 * 60 * 1000;     // a run every 6 hours while on
const MAX_ITEMS = 300, MAX_LINKS = 60, SNIPPET = 160;
const ORDER = ["note", "folder", "flow", "rem", "vm", "ctr", "host", "file"];
const pairKey = (a, b) => (a < b ? a + "\n" + b : b + "\n" + a);

function config() {
  const c = SETTINGS.cwAuto && typeof SETTINGS.cwAuto === "object" ? SETTINGS.cwAuto : {};
  return { on: c.on === true, source: typeof c.source === "string" ? c.source : "", model: typeof c.model === "string" ? c.model : "" };
}
function readState() {
  const s = readJSON(STATE_FILE, {});
  return {
    links: Array.isArray(s.links) ? s.links.filter(l => l && typeof l.a === "string" && typeof l.b === "string") : [],
    dismissed: Array.isArray(s.dismissed) ? s.dismissed.filter(d => typeof d === "string") : [],
    ranAt: s.ranAt || null, error: s.error || null, source: s.source || null, model: s.model || null,
  };
}
const writeState = s => writeJSONFile(STATE_FILE, s);

// "cloud:<provider>" or "peer:<ollama machine id>", checked against what exists.
function resolveSource(source) {
  const [kind, id] = String(source || "").split(/:(.*)/s);
  if (kind === "cloud" && aiProvider(id)) return { provider: id, name: aiProvider(id).name, ready: !!getAiKey(id) };
  if (kind === "peer") {
    const peer = readJSON(AI_PEERS_FILE, []).find(p => p.id === id);
    if (peer) return { provider: "local", host: peer.host, name: peer.name, ready: true };
  }
  return null;
}

function setConfig(b) {
  const cur = config(), next = { ...cur };
  if (b.on !== undefined) next.on = b.on === true;
  if (b.source !== undefined) next.source = String(b.source).slice(0, 120);
  if (b.model !== undefined) next.model = String(b.model).slice(0, 200);
  if (next.source && !resolveSource(next.source)) throw Object.assign(new Error("That source is not set up"), { status: 400 });
  SETTINGS.cwAuto = next;
  saveSettings();
  broadcast("connectwork_changed", {});
  // Turning it on, or changing what it uses, looks straight away.
  if (next.on && (!cur.on || next.source !== cur.source || next.model !== cur.model)) run().catch(() => {});
  return status();
}

let running = false;
function status() {
  const c = config(), s = readState(), src = resolveSource(c.source);
  return { ...c, sourceName: src ? src.name : null, ready: !!(src && src.ready && c.model), running,
           ranAt: s.ranAt, error: s.error, found: s.links.length, dismissed: s.dismissed.length, everyHours: EVERY_MS / 3600000 };
}

// Suggestions to draw, minus dismissed ones. Empty while off.
function suggestions() {
  if (!config().on) return [];
  const s = readState(), gone = new Set(s.dismissed);
  return s.links.filter(l => !gone.has(pairKey(l.a, l.b)));
}

function dismiss(a, b) {
  const s = readState(), k = pairKey(a, b);
  if (!s.dismissed.includes(k)) s.dismissed.push(k);
  s.dismissed = s.dismissed.slice(-2000);
  s.links = s.links.filter(l => pairKey(l.a, l.b) !== k);
  writeState(s);
  broadcast("connectwork_changed", {});
}

function prompt(nodes, notes) {
  const lines = nodes.map((n, i) => {
    let extra = n.sub && n.type !== "note" ? " — " + n.sub : "";
    const body = n.type === "note" ? notes.get(n.id.slice(5)) : "";
    if (body) extra += " — " + body;
    return (i + 1) + " | " + n.type + " | " + n.title.replace(/\s+/g, " ").slice(0, 120) + extra;
  });
  const system = "You find meaningful connections between items someone keeps on their home server: notes, note folders, flow spaces (diagrams), " +
    "reminders, files, virtual machines, containers and hosts. Link two items only when one clearly relates to the other " +
    "(same project, topic, service, device or task). Do not link items just because they share a type. " +
    "Answer with JSON only, no prose: {\"links\":[{\"a\":<number>,\"b\":<number>,\"why\":\"<under 12 words>\"}]}. " +
    "Use the item numbers given. At most " + MAX_LINKS + " links; fewer is better than weak ones; none is fine.";
  return { system, user: "Items (number | type | title — details):\n" + lines.join("\n") };
}

function parseLinks(text, nodes) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) throw new Error("The AI did not answer with JSON");
  let data; try { data = JSON.parse(m[0]); } catch { throw new Error("The AI's JSON could not be read"); }
  const out = [], seen = new Set();
  for (const l of Array.isArray(data.links) ? data.links : []) {
    const A = nodes[Number(l && l.a) - 1], B = nodes[Number(l && l.b) - 1];
    if (!A || !B || A === B) continue;
    const k = pairKey(A.id, B.id);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ a: A.id, b: B.id, why: String(l.why || "").replace(/\s+/g, " ").trim().slice(0, 120) });
    if (out.length >= MAX_LINKS) break;
  }
  return out;
}

async function run() {
  if (running) throw Object.assign(new Error("Already looking"), { status: 409 });
  const c = config(), src = resolveSource(c.source);
  if (!src) throw Object.assign(new Error("Pick a source first"), { status: 400 });
  if (!src.ready) throw Object.assign(new Error("No " + src.name + " API key saved"), { status: 400 });
  if (!c.model) throw Object.assign(new Error("Pick a model first"), { status: 400 });
  running = true;
  broadcast("connectwork_changed", {});
  const { callAI } = require("./ai");
  const { graph } = require("./connectwork");
  const s = readState();
  try {
    const g = await graph({ withAi: false });
    const linked = new Set(g.edges.map(e => pairKey(e.a, e.b))), gone = new Set(s.dismissed);
    const nodes = g.nodes.slice().sort((x, y) => ORDER.indexOf(x.type) - ORDER.indexOf(y.type)).slice(0, MAX_ITEMS);
    if (nodes.length < 2) throw new Error("Not enough items to connect yet");
    const notes = new Map();
    for (const n of readJSON(NOTES_FILE, [])) {
      if (n && typeof n.id === "string" && !n.hidden && typeof n.body === "string")
        notes.set(n.id, n.body.replace(/\s+/g, " ").trim().slice(0, SNIPPET));
    }
    const p = prompt(nodes, notes);
    const text = await callAI(src.provider, c.model, [{ role: "user", content: p.user }], p.system, 180000, { host: src.host });
    const found = parseLinks(text, nodes).filter(l => !linked.has(pairKey(l.a, l.b)) && !gone.has(pairKey(l.a, l.b)));
    writeState({ ...s, links: found, ranAt: new Date().toISOString(), error: null, source: src.name, model: c.model });
  } catch (e) {
    writeState({ ...s, ranAt: new Date().toISOString(), error: e.message.slice(0, 300), source: src.name, model: c.model });
    throw e;
  } finally {
    running = false;
    broadcast("connectwork_changed", {});
  }
  return status();
}

// While on, look again every 6 hours. Checked every 15 minutes so a restart
// does not reset the clock.
setInterval(() => {
  const c = config();
  if (!c.on || running) return;
  const last = Date.parse(readState().ranAt || 0) || 0;
  if (Date.now() - last >= EVERY_MS) run().catch(e => console.error("[connectwork] auto-connect:", e.message));
}, 15 * 60 * 1000).unref();

module.exports = { dismiss, run, setConfig, status, suggestions };
