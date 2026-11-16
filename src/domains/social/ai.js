const { AI_PEERS_FILE } = require("../../config");
const { OLLAMA_HOST_DEFAULT } = require("../ai");
const { SOCIAL_PLATFORMS } = require("./store");
const { esc } = require("../../helpers");
const { httpGet } = require("../../net");
const { readJSON } = require("../../store");

// This resolves against BOTH, preferring whatever actually answers.
async function probeOllama(host) {
  try {
    const raw = await httpGet(String(host).replace(/\/+$/, "") + "/api/tags", 3500,
      { Accept: "application/json" });
    return { online: true, models: (JSON.parse(raw).models || []).map(m => m.name) };
  } catch { return { online: false, models: [] }; }
}
async function resolveAiPeers() {
  const peers = readJSON(AI_PEERS_FILE, []);
  const cfg = { model: process.env.OLLAMA_MODEL || "" };
  // Only trust an env host if it was set deliberately. Otherwise probing a host
  // nobody configured just adds a dead entry to the picker and 3.5s of latency
  // to every load.
  const explicitHost = process.env.OLLAMA_HOST || "";
  const seen = new Set();
  const candidates = [];
  if (explicitHost) {
    const h = String(explicitHost).replace(/\/+$/, "");
    candidates.push({ id: "env", name: "Ollama host", host: h, source: "env" });
    seen.add(h);
  }
  for (const p of peers) {
    const h = String(p.host || "").replace(/\/+$/, "");
    if (!h || seen.has(h)) continue;
    seen.add(h);
    candidates.push({ id: p.id || h, name: p.name || h, host: h, source: "ai-peers" });
  }
  // If nothing at all is configured, fall back to the built-in default so a
  // fresh install still has something to try.
  if (!candidates.length) {
    candidates.push({ id: "default", name: "Default host", host: OLLAMA_HOST_DEFAULT, source: "default" });
  }
  const probed = await Promise.all(candidates.map(async c => Object.assign({}, c, await probeOllama(c.host))));
  const online = probed.filter(c => c.online);
  // Prefer an online peer; fall back to the configured host so the UI can still
  // show *which* host failed rather than a bare "unreachable".
  const chosen = online[0] || probed[0] || null;
  let model = "";
  if (chosen) {
    // Honour the configured model only if the chosen peer actually has it.
    model = (cfg.model && chosen.models.includes(cfg.model)) ? cfg.model : (chosen.models[0] || "");
  }
  return { peers: probed, chosen, model, configuredModel: cfg.model || "" };
}

// ── Prompt construction ─────────────────────────────────────────────────────
const SOCIAL_AI_SYSTEM = [
  "You are a social media drafting assistant running locally on the user's own server.",
  "You write posts in the user's voice. You never publish anything — a human reviews every draft.",
  "",
  "Reply with ONLY a JSON array. No prose, no markdown fences, no commentary.",
  "Each element must be an object with exactly these keys:",
  '  "text"     - the post body, plain text, no surrounding quotes',
  '  "when"     - when to post it, as a SHORT ENGLISH HINT, never a date you calculated.',
  '               Allowed forms: "now", "in 2 hours", "in 3 days", "today 18:00",',
  '               "tomorrow 09:00", "friday 12:30". If unsure use "now".',
  '  "why"      - one short sentence on the angle you took',
  "",
  "Rules:",
  "- Respect the character limit given for each target platform.",
  "- Do not repeat or lightly reword anything in RECENT POSTS.",
  "- No hashtag spam; two at most, and only if they genuinely fit.",
  "- Do not invent facts, statistics, links or quotes.",
  "- Write like a person, not a brand announcement.",
].join("\n");

function buildSocialAiPrompt(opts) {
  const { prompt, count, tone, platforms, dash, history, upcoming, now, article, reserve = 0 } = opts;
  const lim = platforms.map(p => `${SOCIAL_PLATFORMS[p].label} (max ${SOCIAL_PLATFORMS[p].limit} chars)`).join(", ");
  const lines = [];
  lines.push(`CURRENT DATE AND TIME: ${now.toString()}`);
  lines.push(`DASHBOARD: ${dash.name}`);
  lines.push(`TARGET PLATFORMS: ${lim || "none selected — write for 280 characters"}`);
  lines.push(`HARD CHARACTER LIMIT: ${(platforms.length ? Math.min(...platforms.map(p => SOCIAL_PLATFORMS[p].limit)) : 280) - reserve}`);
  if (tone) lines.push(`TONE / STYLE: ${tone}`);
  lines.push("");
  if (history.length) {
    lines.push("RECENT POSTS (do not repeat these):");
    history.slice(0, 25).forEach(h => {
      const when = (h.finishedAt || h.createdAt || "").slice(0, 16).replace("T", " ");
      lines.push(`- [${when}] ${String(h.text).replace(/\s+/g, " ").slice(0, 160)}`);
    });
  } else {
    lines.push("RECENT POSTS: none yet.");
  }
  lines.push("");
  if (upcoming.length) {
    lines.push("ALREADY SCHEDULED (avoid clashing with these times and topics):");
    upcoming.forEach(u => {
      lines.push(`- [${(u.scheduledAt || "").slice(0, 16).replace("T", " ")}] ${String(u.text).replace(/\s+/g, " ").slice(0, 120)}`);
    });
    lines.push("");
  }
  if (article) {
    // A news summary: the article is the only source of facts.
    lines.push("NEWS ARTICLE TO SUMMARISE:");
    lines.push(article);
    lines.push("");
    lines.push("Summarise what happened and what is new. Use only facts stated in the article. Do not add a link; it is appended for you.");
  }
  lines.push(`TASK: write ${count} distinct post${count === 1 ? "" : "s"} about: ${prompt}`);
  lines.push(`Return a JSON array of exactly ${count} object${count === 1 ? "" : "s"}.`);
  return lines.join("\n");
}

// Models wrap JSON in prose or fences no matter how firmly you ask them not to.
function extractJsonArray(raw) {
  let s = String(raw || "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = s.indexOf("[");
  if (start === -1) {
    // Some models return a bare object instead of an array of one.
    const o = s.indexOf("{");
    if (o === -1) return null;
    let depth = 0;
    for (let i = o; i < s.length; i++) {
      if (s[i] === "{") depth++;
      else if (s[i] === "}") { depth--; if (!depth) { try { return [JSON.parse(s.slice(o, i + 1))]; } catch { return null; } } }
    }
    return null;
  }
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "[") depth++;
    else if (c === "]") { depth--; if (!depth) { try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

// ═══ REMINDERS ════════════════════════════════════════════════════════════════
// Scheduled reminders whose alarms reach you on whatever page you are on. Two
// decisions carry that guarantee:
//
//  · THE SERVER OWNS THE CLOCK. A reminder fires from the tick below, never from
//    a setTimeout in the page that created it. Navigating away, reloading, or
//    closing the tab cannot lose an alarm.
//  · FIRING IS BROADCAST *AND* PARKED. The tick pushes an SSE event to every open
//    page and leaves the reminder in RINGING, so a page opened seconds after it
//    fired still finds it and starts ringing. The alarm UI lives in navBar(),
//    which every page renders, so no individual page has to opt in.
//
// A reminder that came due while Metis was down still rings if it is less than
// MISS_GRACE_MS late; anything older is marked missed and retired quietly rather
// than ambushing you with a week of stale alarms on restart.

module.exports = { SOCIAL_AI_SYSTEM, buildSocialAiPrompt, extractJsonArray, probeOllama, resolveAiPeers };
