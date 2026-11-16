const { httpGet } = require("../../net");
const { SETTINGS, maskKey, saveSettings } = require("../../settings");

// ═══ NEWS CONTEXT (freenewsapi.io) ════════════════════════════════════════════
// Fresh articles for the copilot and autopilot to summarise, so a news post
// carries facts from today's coverage instead of whatever the model remembers.
//
//  · /news lists headlines (uuid, title, publisher, published_at) filtered by
//    topic, country, language, title keywords and date. /details returns one
//    article's body and original link. Search is title-only: the API removed q.
//  · Free plan: 5,000 requests a day, 2 a second. Calls are serialised with a
//    gap and listings are cached briefly, so a page reload or an autopilot run
//    costs one or two requests, not dozens.

const BASE = "https://api.freenewsapi.io/v1";
const GAP_MS = 600;
const LIST_TTL = 10 * 60000;
const DETAIL_TTL = 6 * 3600000;

function newsKey() { return String(SETTINGS.freeNewsApiKey || process.env.FREENEWSAPI_KEY || "").trim(); }
function setNewsKey(k) {
  SETTINGS.freeNewsApiKey = String(k || "").trim();
  if (!SETTINGS.freeNewsApiKey) delete SETTINGS.freeNewsApiKey;
  saveSettings();
}
function newsStatus() { return { configured: !!newsKey(), key: maskKey(newsKey()), fromEnv: !SETTINGS.freeNewsApiKey && !!process.env.FREENEWSAPI_KEY }; }

let last = 0, chain = Promise.resolve();
// One request at a time, at most one per GAP_MS.
function call(path, params) {
  const key = newsKey();
  if (!key) return Promise.reject(Object.assign(new Error("no freenewsapi.io key — add one under News on the Social page"), { status: 400 }));
  const qs = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== "")).toString();
  const run = async () => {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    last = Date.now();
    try { return JSON.parse(await httpGet(BASE + path + (qs ? "?" + qs : ""), 15000, { "x-api-key": key, Accept: "application/json" })); }
    catch (e) { throw new Error("freenewsapi.io: " + e.message.replace(/^HTTP /, "")); }
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

const CACHE = new Map();
async function cached(key, ttl, fn) {
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await fn();
  CACHE.set(key, { at: Date.now(), value });
  if (CACHE.size > 300) CACHE.delete(CACHE.keys().next().value);
  return value;
}

const item = a => ({ uuid: a.uuid, title: a.title || "", publisher: a.publisher || "", publishedAt: a.published_at || null });
const KEYWORD_PAGES = 5;   // pages of 10 headlines scanned for keyword matches

// One page of /news, cached.
async function page(params, fresh) {
  const key = "list:" + JSON.stringify(params);
  if (fresh) CACHE.delete(key);
  return cached(key, LIST_TTL, () => call("/news", params));
}

// filters: { topic, country, language, keywords, maxAgeHours }
// keywords: comma- or space-separated; a headline matches if it has ANY of them
// as a whole word (a plural counts: "president" matches "presidents", not
// "presidente").
//
// The API answers 500 whenever in_title is combined with any other filter
// (language, country, date — even its own documented example), so keywords
// are matched here instead: scan a few pages of the filtered listing, and only
// if nothing matches, fall back to in_title alone with the age applied here.
async function listNews(f = {}, { fresh = false } = {}) {
  const after = f.maxAgeHours ? new Date(Date.now() - f.maxAgeHours * 3600000).toISOString() : undefined;
  const params = {
    language: f.language || "en",
    country: f.country || undefined,
    topic: f.topic || undefined,
    published_after: after,
    order_by: "recent",
  };
  const words = String(f.keywords || "").toLowerCase().split(/[\s,;]+/).filter(w => w.length > 1).slice(0, 5);
  if (!words.length) return ((await page(params, fresh)).data || []).map(item);

  const res = words.map(w => new RegExp("(^|[^\\p{L}\\p{N}])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(s|es)?($|[^\\p{L}\\p{N}])", "iu"));
  const hit = a => res.some(re => re.test(String(a.title || "")));
  const found = [], seen = new Set();
  const add = a => { if (a.uuid && !seen.has(a.uuid) && hit(a)) { seen.add(a.uuid); found.push(item(a)); } };
  // A keyword under 3 letters ("AI") cannot use the API's title search at all
  // (it wants "strong filters", which trip the 500 above), so scan deeper.
  const pages = words.some(w => w.length < 3) ? KEYWORD_PAGES * 2 : KEYWORD_PAGES;
  let cursor;
  for (let i = 0; i < pages && found.length < 10; i++) {
    const r = await page(Object.assign({}, params, cursor ? { cursor } : {}), fresh);
    (r.data || []).forEach(add);
    cursor = r.meta && r.meta.has_more ? r.meta.next_cursor : null;
    if (!cursor) break;
  }
  if (!found.length) {
    // Nothing among the newest filtered headlines: ask by title, one keyword
    // at a time (only the age filter can be applied, here). The API refuses
    // short keywords on their own, and a refusal here just means no extra hits.
    for (const w of words.filter(x => x.length >= 3).slice(0, 3)) {
      try {
        const r = await page({ in_title: w }, fresh);
        (r.data || []).filter(a => !after || !a.published_at || a.published_at >= after).forEach(add);
      } catch (e) { console.error("[news] title search for", JSON.stringify(w), "failed:", e.message); }
    }
  }
  return found.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt))).slice(0, 10);
}

async function articleDetails(uuid) {
  if (!/^[0-9a-f-]{36}$/i.test(String(uuid || ""))) throw Object.assign(new Error("bad article id"), { status: 400 });
  const r = await cached("detail:" + uuid, DETAIL_TTL, () => call("/details", { uuid }));
  const a = r.data || {};
  return { uuid: a.uuid, title: decodeEntities(a.title || ""), publisher: a.publisher || "", publishedAt: a.published_at || null,
    url: a.original_url || null, summary: decodeEntities(a.incipit || ""), body: decodeEntities(a.body || ""), topics: a.topics || [],
    languages: (a.languages || []).map(x => String(x).toLowerCase()), countries: (a.countries || []).map(x => String(x).toUpperCase()),
    thumbnail: a.thumbnail || null };
}

async function listTopics() {
  const r = await cached("topics", 24 * 3600000, () => call("/topics"));
  return r.data || [];
}

// &amp; and friends, left over from the publisher's HTML.
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
function decodeEntities(t) {
  return String(t).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENTITIES[e.toLowerCase()] ?? m));
}

// Whether the article really is in the language and country asked for. The
// listing's own filters leak (Dutch articles under language=en), but the
// details carry the real values.
function matchesFilters(a, f = {}) {
  if (f.language && a.languages && a.languages.length && !a.languages.includes(String(f.language).toLowerCase())) return false;
  if (f.country && a.countries && a.countries.length && !a.countries.includes(String(f.country).toUpperCase())) return false;
  return true;
}

// Whether an article has real text to summarise. Paywalled and consent-walled
// sites come back as a login or cookie page; given only a headline, a small
// model invents the rest, and autopilot would publish it.
const WALL = /(log ?in|sign ?in|subscribe|subscription|wachtwoord|e-?mailadres|password|cookie|abonn|inloggen|create an account|already a subscriber|enable javascript|privacy policy)/gi;
function usableArticle(a) {
  const body = String((a && a.body) || "").trim();
  if (body.length < 400) return false;
  const walls = (body.match(WALL) || []).length;
  return walls < 3 || body.length > 1500;
}

// The article as the model sees it: trimmed, so a long body cannot crowd out
// the instructions on a small local model.
function articleContext(a, maxChars = 3500) {
  const body = String(a.body || a.summary || "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return [
    `HEADLINE: ${a.title}`,
    `SOURCE: ${a.publisher || "unknown"}${a.publishedAt ? " · published " + a.publishedAt.slice(0, 16).replace("T", " ") + " UTC" : ""}`,
    "ARTICLE:",
    body.length > maxChars ? body.slice(0, maxChars) + " …" : (body || "(no body text available — use only the headline)"),
  ].join("\n");
}

module.exports = { articleContext, articleDetails, decodeEntities, listNews, listTopics, matchesFilters, newsKey, newsStatus, setNewsKey, usableArticle };
