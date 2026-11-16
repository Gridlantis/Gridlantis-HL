const path = require("path");

const { dataFile } = require("../config");
const { flowsHtml } = require("../pages/flows");
const { broadcast } = require("../sse");
const { readJSON, writeJSONFile } = require("../store");

// Flow Space: flowcharts of boxes, icons, text and notes joined by arrows.
// One file holds every flow; each save sends the whole flow, which at a few
// hundred nodes is a few tens of KB.
const FLOWS_FILE = dataFile("flows.json");
const MAX_NODES = 2000, MAX_EDGES = 4000;

const SHAPES = ["rect", "round", "diamond", "ellipse", "text", "icon", "note"];
const COLORS = ["slate", "blue", "teal", "green", "amber", "orange", "red", "violet", "pink"];
const SIZES  = ["s", "m", "l"];
const ARROWS = ["end", "both", "none"];

const readFlows = () => { const d = readJSON(FLOWS_FILE, []); return Array.isArray(d) ? d : []; };
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = (v, def, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
const str = (v, max) => String(v == null ? "" : v).slice(0, max);
const pick = (v, list) => (list.includes(v) ? v : list[0]);
const idOk = v => typeof v === "string" && /^[\w-]{1,40}$/.test(v);

// Only known fields survive, so the file never grows whatever a client sends.
function cleanNode(n) {
  if (!n || !idOk(n.id)) return null;
  return {
    id: n.id, shape: pick(n.shape, SHAPES),
    x: Math.round(num(n.x, 0, -1e6, 1e6)), y: Math.round(num(n.y, 0, -1e6, 1e6)),
    w: Math.round(num(n.w, 160, 30, 2000)), h: Math.round(num(n.h, 70, 24, 2000)),
    text: str(n.text, 2000), color: pick(n.color, COLORS), size: SIZES.includes(n.size) ? n.size : "m",
    icon: /^[a-z0-9-]{1,40}$/.test(n.icon || "") ? n.icon : "",
    noteId: typeof n.noteId === "string" ? n.noteId.slice(0, 60) : null,
  };
}
function cleanEdge(e, ids) {
  if (!e || !idOk(e.id) || !ids.has(e.from) || !ids.has(e.to) || e.from === e.to) return null;
  return { id: e.id, from: e.from, to: e.to, label: str(e.label, 300), color: pick(e.color, COLORS),
           dashed: !!e.dashed, arrow: pick(e.arrow, ARROWS) };
}
function summary(f) {
  return { id: f.id, name: f.name, updated: f.updated, created: f.created, nodes: f.nodes.length,
           noteIds: [...new Set(f.nodes.map(n => n.noteId).filter(Boolean))] };
}

module.exports = async function flowRoutes(ctx) {
  const { req, pathname, json, html, readBody } = ctx;
  if (pathname === "/flows" && req.method === "GET") return html(flowsHtml());
  if (!pathname.startsWith("/api/flows")) return;

  const body = async () => JSON.parse((await readBody(4 * 1024 * 1024)).toString() || "{}");
  const changed = (id, client) => broadcast("flows_changed", { id, client: str(client, 40) });

  if (pathname === "/api/flows" && req.method === "GET") {
    return json(readFlows().map(summary).sort((a, b) => b.updated.localeCompare(a.updated)));
  }
  if (pathname === "/api/flows" && req.method === "POST") {
    const b = await body();
    const now = new Date().toISOString();
    const flow = { id: newId("f_"), name: str(b.name, 120).trim() || "Untitled flow", created: now, updated: now,
                   nodes: [], edges: [], view: { x: 0, y: 0, zoom: 1 } };
    const list = readFlows();
    list.push(flow);
    writeJSONFile(FLOWS_FILE, list);
    changed(flow.id, b.client);
    return json(flow);
  }

  const m = pathname.match(/^\/api\/flows\/([\w-]+)$/);
  if (!m) return;
  const list = readFlows();
  const idx = list.findIndex(f => f.id === m[1]);
  if (idx < 0) return json({ error: "No such flow" }, 404);

  if (req.method === "GET") return json(list[idx]);
  if (req.method === "DELETE") {
    list.splice(idx, 1);
    writeJSONFile(FLOWS_FILE, list);
    changed(m[1], null);
    return json({ ok: true });
  }
  if (req.method === "PUT") {
    const b = await body();
    const f = list[idx];
    if (b.name != null) f.name = str(b.name, 120).trim() || "Untitled flow";
    if (Array.isArray(b.nodes)) {
      const seen = new Set();
      f.nodes = b.nodes.slice(0, MAX_NODES).map(cleanNode).filter(n => n && !seen.has(n.id) && seen.add(n.id));
    }
    // Re-check edges even when only nodes were sent, so none points at a box
    // that no longer exists.
    const ids = new Set(f.nodes.map(n => n.id));
    f.edges = (Array.isArray(b.edges) ? b.edges : f.edges).slice(0, MAX_EDGES).map(e => cleanEdge(e, ids)).filter(Boolean);
    if (b.view && typeof b.view === "object")
      f.view = { x: num(b.view.x, 0, -1e7, 1e7), y: num(b.view.y, 0, -1e7, 1e7), zoom: num(b.view.zoom, 1, 0.1, 4) };
    f.updated = new Date().toISOString();
    writeJSONFile(FLOWS_FILE, list);
    changed(f.id, b.client);
    return json({ ok: true, updated: f.updated });
  }
};
