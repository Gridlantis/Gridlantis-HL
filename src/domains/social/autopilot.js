const crypto = require("crypto");

const { sendAlert } = require("../../alerts");
const { broadcast } = require("../../sse");
const { callAI } = require("../ai");
const { ollamaFirstModel } = require("../ai");
const { extractJsonArray, probeOllama, resolveAiPeers } = require("./ai");
const { findDuplicate, socialSimilarity } = require("./dedupe");
const { articleContext, articleDetails, decodeEntities, listNews, matchesFilters, usableArticle } = require("./news");
const { linkLength } = require("./length");
const { socialTick } = require("./publish");
const { parseWhen } = require("./schedule");
const { SOCIAL_PLATFORMS, getDashboard, readSocial, writeSocial } = require("./store");

// ═══ SOCIAL AUTOPILOT ═════════════════════════════════════════════════════════
// The one mode that publishes without a human in the loop. Per dashboard, the
// user writes a system prompt and switches it on; everything else is decided
// here or by the model:
//
//  · WHAT: each run writes one post in the voice the prompt describes, with the
//    dashboard's history as context so it does not repeat itself.
//  · WHEN: the model also says how many hours until the NEXT post — so "post
//    twice a day" in the prompt is the whole schedule. (A number, not a phrase:
//    small models copy example phrases verbatim.) The result is clamped, so a
//    confused model can neither spam nor go silent.
//  · WHERE: the platforms picked on the page, or by default every official-API
//    account on the dashboard that can take a text post. Browser-driven
//    X/Threads are only used if picked (an unattended bot is exactly what gets
//    those accounts locked), and Instagram is never offered: it needs media.
//  · WITH: the AI host and model picked on the page, or whichever peer answers.
//  · NEWS (optional): each run takes the newest article from freenewsapi.io that
//    matches the dashboard's news filters and has not been used yet, and the
//    post summarises it — facts from the article only — with its link appended.
//  · RATE: a fixed gap set on the page wins over the prompt and the model.
//
// A written post goes into the ordinary queue, so publishing, retries, failure
// alerts and history are the same as for a hand-queued post.

const TICK_MS = 60000;
const MIN_GAP_MS = 2 * 3600000;          // never more often than every 2 hours
const MAX_GAP_MS = 7 * 86400000;         // never quieter than a week
const DEFAULT_GAP_MS = 24 * 3600000;     // when the model gives no usable hint
const RETRY_MS = 30 * 60000;             // after a failed run (AI down, bad output)

const AUTOPILOT_RULES = [
  "You run a social media account on autopilot. What you write is published immediately, with no human review.",
  "",
  "Reply with ONLY a JSON object. No prose, no markdown fences.",
  "Keys:",
  '  "text" - the post, plain text, ready to publish as-is',
  '  "hours_until_next" - a number: how many hours from now the NEXT post should go out.',
  '           Work it out from the posting frequency in the instructions below',
  '           (twice a day = 12, daily = 24, three times a week = 56, weekly = 168).',
  '  "why"  - one short sentence on the angle you took',
  "",
  "The account owner's instructions decide the voice: tone, framing, how dramatic it is, emojis and",
  "hashtags. Follow them closely — they matter more than sounding neutral.",
  "",
  "Rules that always apply:",
  "- Stay under the hard character limit you are given.",
  "- Do not repeat or lightly reword anything in RECENT POSTS; pick a fresh angle.",
  "- Facts must be true: never invent names, numbers, quotes, events, links or announcements.",
  "  When the owner wants drama or hype, turn up the TONE (capitals, emojis, punchy wording,",
  "  dramatic questions) — never the FACTS: no inflated numbers, extra victims or new accusations.",
  "- No placeholders like [link] or <name>: the text is posted exactly as written.",
  "- Hashtags: if the owner asks for them, end the post with two or three relevant ones.",
  "  If the owner says nothing about hashtags, use at most two.",
  "",
  "The account owner's instructions:",
].join("\n");

const hasAccount = (dash, p) => dash.accounts.some(a => a.platform === p && a.enabled !== false);
// Platforms autopilot may be pointed at: text-only ones, and for official-API
// ones only with an account. Browser-agent sessions are checked at publish time.
function selectable(dash, p) {
  const m = SOCIAL_PLATFORMS[p];
  return !!m && !m.needsMedia && (m.via === "agent" || hasAccount(dash, p));
}
function autopilotPlatforms(dash) {
  const chosen = cfgOf(dash).platforms;
  if (Array.isArray(chosen)) return chosen.filter(p => selectable(dash, p));
  return Object.keys(SOCIAL_PLATFORMS).filter(p => SOCIAL_PLATFORMS[p].via === "native" && selectable(dash, p));
}
// platforms: null = every official-API account. host/model: "" = automatic.
// gapHours: null = from the prompt, else the model. news.enabled: post from news.
const NEWS_DEFAULTS = { enabled: false, topic: "", country: "", language: "en", keywords: "", maxAgeHours: 24, link: true };
function cfgOf(dash) {
  const c = Object.assign({ enabled: false, systemPrompt: "", platforms: null, host: "", model: "", gapHours: null, usedNews: [] }, dash.autopilot || {});
  c.news = Object.assign({}, NEWS_DEFAULTS, c.news || {});
  return c;
}

// The browser never sees anything but this.
function publicCfg(dash) {
  const c = cfgOf(dash);
  return { enabled: !!c.enabled, systemPrompt: c.systemPrompt || "", nextRunAt: c.nextRunAt || null,
    lastRunAt: c.lastRunAt || null, lastError: c.lastError || null, lastPostId: c.lastPostId || null,
    lastWhy: c.lastWhy || null, running: RUNNING.has(dash.id),
    platforms: autopilotPlatforms(dash), autoPlatforms: !Array.isArray(c.platforms),
    selectable: Object.keys(SOCIAL_PLATFORMS).filter(p => selectable(dash, p)),
    host: c.host || "", model: c.model || "", gapHours: c.gapHours || null, statedGapHours: promptGapHours(c.systemPrompt),
    news: c.news, lastNews: c.lastNews || null, nextNews: c.nextNews || null };
}

function saveCfg(dashboardId, patch) {
  const d = readSocial();
  const dash = getDashboard(d, dashboardId);
  dash.autopilot = Object.assign(cfgOf(dash), patch);
  writeSocial(d);
  broadcast("social_autopilot", { dashboardId: dash.id });
  return publicCfg(dash);
}

function buildPrompt(dash, platforms, history, upcoming, now, retryNote, article) {
  // The link is appended after the model writes, so it comes out of the
  // budget — at what each platform counts it as (length.js).
  const withLink = article && article.url && cfgOf(dash).news.link;
  const limit = Math.min(...platforms.map(p => SOCIAL_PLATFORMS[p].limit - (withLink ? linkLength(p, article.url) + 2 : 0)));
  const L = [];
  L.push(`CURRENT DATE AND TIME: ${now.toString()}`);
  L.push(`PUBLISHING TO: ${platforms.map(p => SOCIAL_PLATFORMS[p].label).join(", ")}`);
  L.push(`HARD CHARACTER LIMIT: ${limit}`);
  L.push("");
  if (history.length) {
    L.push("RECENT POSTS (newest first — do not repeat these):");
    history.slice(0, 30).forEach(h => L.push(`- [${(h.finishedAt || h.createdAt || "").slice(0, 16).replace("T", " ")}] ${String(h.text).replace(/\s+/g, " ").slice(0, 200)}`));
  } else L.push("RECENT POSTS: none yet — this is the first one.");
  if (upcoming.length) {
    L.push("");
    L.push("ALREADY QUEUED (also do not repeat):");
    upcoming.forEach(u => L.push(`- ${String(u.text).replace(/\s+/g, " ").slice(0, 160)}`));
  }
  L.push("");
  if (article) {
    L.push("TODAY'S NEWS TO POST ABOUT:");
    L.push(articleContext(article));
    L.push("");
  }
  // The owner's instructions go last, just before the task: small local models
  // follow whatever they read most recently, and the article must not drown
  // out the voice. (Also why they are repeated from the system prompt.)
  L.push("THE OWNER'S INSTRUCTIONS — write in exactly this style (and use them for \"hours_until_next\"):");
  L.push(cfgOf(dash).systemPrompt.trim());
  L.push("");
  if (retryNote) L.push("YOUR LAST ATTEMPT WAS REJECTED: " + retryNote, "");
  if (article) {
    L.push("Write the next post about this news story in the owner's style above. Every fact must come from the article;");
    L.push("if it is not in English, translate it but keep names exactly as written. Do not add a link; it is appended for you.");
    L.push("Return one JSON object.");
  } else L.push("Write the next post now, in the owner's style above. Return one JSON object.");
  return { text: L.join("\n"), limit };
}

// The model's reply as { text, hours_until_next, next, why }. Small models
// often return almost-JSON — a missing closing brace, or unescaped quotes
// inside the post — so when strict parsing fails the fields are read directly.
function readReply(raw) {
  const arr = extractJsonArray(raw);
  if (arr && arr[0] && typeof arr[0] === "object" && arr[0].text) return arr[0];
  const s = String(raw || "");
  const t = s.match(/"text"\s*:\s*"([\s\S]*?)"\s*,\s*\n?\s*"(?:hours_until_next|next|why)"/);
  if (!t) return null;
  const h = s.match(/"hours_until_next"\s*:\s*"?(\d+(?:\.\d+)?)/);
  const w = s.match(/"why"\s*:\s*"([^"\n]*)/);
  return { text: t[1].replace(/\\n/g, "\n").replace(/\\"/g, '"'), hours_until_next: h ? +h[1] : undefined, why: w ? w[1] : "" };
}

// Numbers in a news post that do not appear in the article (ignoring thousand
// separators). A small model asked for hype inflates figures; this is a cheap,
// reliable catch for that.
function numbersNotInArticle(text, article) {
  const src = (String(article.title || "") + " " + String(article.body || "")).replace(/(\d)[.,\s](?=\d{3}\b)/g, "$1");
  const body = text.replace(/#[\p{L}\p{N}_]+/gu, " ").replace(/\b24\/7\b/g, " ");
  const nums = (body.match(/\d[\d.,]*\d|\d/g) || []).map(n => n.replace(/[.,](?=\d{3}\b)/g, "")).filter(n => n.replace(/\D/g, "").length >= 2);
  return [...new Set(nums)].filter(n => !new RegExp("(^|\\D)" + n.replace(/[.,]/g, "[.,]") + "(\\D|$)").test(src));
}

// Whole sentences from the start of text that fit in limit, or "" if even the
// first does not. The fallback when a small model keeps writing too long.
function fitSentences(text, limit) {
  // Trailing hashtags are kept and the sentences before them trimmed.
  const tagM = text.match(/(\s+#[\p{L}\p{N}_]+)+\s*$/u);
  const tags = tagM ? tagM[0].trim() : "";
  const body = tagM ? text.slice(0, tagM.index) : text;
  const room = tags ? limit - tags.length - 1 : limit;
  const parts = body.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [body];
  let out = "";
  for (const p of parts) { if ((out + p).trim().length > room) break; out += p; }
  out = out.trim();
  return out && tags ? out + " " + tags : out;
}

// Ask the model for one post and check it. Three tries: each retry is told what
// was wrong with the last (too long, too close to an earlier post); a post that
// is only too long is shown back to the model to cut down.
async function writePost(dash, platforms, article) {
  const d = readSocial();
  const mine = d.queue.filter(q => q.dashboardId === dash.id);
  const history = mine.filter(q => q.status === "posted" || q.status === "partial")
    .sort((a, b) => new Date(b.finishedAt || b.createdAt) - new Date(a.finishedAt || a.createdAt));
  const upcoming = mine.filter(q => q.status === "queued" || q.status === "posting");

  const cfg = cfgOf(dash);
  const resolved = await resolveAiPeers();
  let peer;
  if (cfg.host) {
    peer = resolved.peers.find(p => p.host === cfg.host) || Object.assign({ host: cfg.host }, await probeOllama(cfg.host));
    if (!peer.online) throw new Error("the chosen AI host " + cfg.host + " is not responding");
  } else {
    peer = resolved.peers.find(p => p.online);
    if (!peer) throw new Error("no AI peer is responding (tried " + (resolved.peers.map(p => p.host).join(", ") || "none") + ")");
  }
  let model;
  if (cfg.model) {
    if (peer.models.length && !peer.models.includes(cfg.model)) throw new Error("model " + cfg.model + " is not on " + peer.host);
    model = cfg.model;
  } else {
    model = (resolved.chosen && resolved.chosen.host === peer.host && resolved.model) || peer.models[0] || await ollamaFirstModel(peer.host);
  }
  if (!model) throw new Error("no model available on " + peer.host);

  const system = AUTOPILOT_RULES + "\n" + cfg.systemPrompt;
  const now = new Date();
  let note = null, last = "", longest = null, limit = 0, styleMiss = null;
  // Style requests that can be checked: hashtags.
  const wantsTags = /hash ?tags?|#\w/i.test(cfg.systemPrompt) && !/no hash ?tags?|without hash ?tags?/i.test(cfg.systemPrompt);
  const link = article && article.url && cfg.news.link ? "\n\n" + article.url : "";
  const result = (o, text) => ({ text: text + link, next: o.hours_until_next != null ? o.hours_until_next : o.next,
    why: String(o.why || "").slice(0, 200), model, host: peer.host });
  for (let attempt = 0; attempt < 3; attempt++) {
    const built = buildPrompt(dash, platforms, history, upcoming, now, note, article);
    const prompt = built.text;
    limit = built.limit;
    const raw = await callAI("local", model, [{ role: "user", content: prompt }], system, 0, { host: peer.host });
    const o = readReply(raw);
    const text = decodeEntities(String((o && o.text) || "").trim().replace(/^"|"$/g, ""));
    if (!text) { note = "it was not a JSON object with a \"text\" key"; last = "the model did not return a usable post"; continue; }
    if (text.length > limit) {
      note = `it was ${text.length} characters and the limit is ${limit}. Cut this down to under ${limit} characters, keeping the main point:\n"${text}"`;
      last = `the post was too long (${text.length}/${limit})`;
      longest = { o, text };
      continue;
    }
    const dupe = findDuplicate(text, history.concat(upcoming));
    if (dupe) { note = "it was too similar to an earlier post: \"" + dupe.text.slice(0, 120) + "\""; last = "the post repeated an earlier one"; continue; }
    if (/\[[^\]]*\]|<[a-z ]+>/i.test(text)) { note = "it contained a placeholder in brackets"; last = "the post contained a placeholder"; continue; }
    const madeUp = article ? numbersNotInArticle(text, article) : [];
    if (madeUp.length) {
      note = "it stated numbers that are not in the article (" + madeUp.join(", ") + "). Use only figures from the article, or none.";
      last = "the post stated numbers that are not in the article (" + madeUp.join(", ") + ")";
      continue;
    }
    if (wantsTags && !/(^|\s)#[\p{L}\p{N}_]*\p{L}/u.test(text)) {
      // Publishable, just not in the owner's style: try again, keep it in case.
      styleMiss = styleMiss || { o, text };
      note = "it had no hashtags, but the owner asks for them. Keep the same post and end it with two or three relevant hashtags, staying under the limit.";
      last = "the post had no hashtags";
      continue;
    }
    return result(o, text);
  }
  if (styleMiss) return result(styleMiss.o, styleMiss.text);
  // Still too long after three tries: keep whole sentences that fit, if that
  // leaves a real post.
  if (longest) {
    const cut = fitSentences(longest.text, limit);
    if (cut.length >= Math.min(80, limit / 2) && !findDuplicate(cut, history.concat(upcoming))) return result(longest.o, cut);
  }
  throw new Error(last);
}

// Hours as a number (what the model is asked for), or an English hint.
function nextRun(hint, now) {
  const hrs = typeof hint === "number" ? hint : /^\s*\d+(\.\d+)?\s*$/.test(String(hint || "")) ? parseFloat(hint) : NaN;
  const w = isNaN(hrs) ? parseWhen(hint, now) : { at: new Date(now.getTime() + hrs * 3600000).toISOString() };
  let at = w.at ? new Date(w.at).getTime() : now.getTime() + DEFAULT_GAP_MS;
  at = Math.max(now.getTime() + MIN_GAP_MS, Math.min(now.getTime() + MAX_GAP_MS, at));
  return new Date(at).toISOString();
}

// A frequency stated plainly in the prompt ("twice a day", "3 times a week",
// "every 8 hours", "daily") is read here rather than trusted to the model,
// which gets this arithmetic wrong surprisingly often. Null when none is found.
const WORDNUM = { once: 1, one: 1, a: 1, twice: 2, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
function promptGapHours(prompt) {
  const t = String(prompt || "").toLowerCase();
  if (/every other day/.test(t)) return 48;
  let m = t.match(/every\s+(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)?\s*(hour|hr|day|week)s?\b/);
  if (m) {
    const n = m[1] ? (WORDNUM[m[1]] || parseFloat(m[1])) : 1;
    return n * (m[2] === "week" ? 168 : m[2] === "day" ? 24 : 1);
  }
  m = t.match(/\b(once|twice|\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s*(?:x|times?|posts?|tweets?|updates?))?\s+(?:a|per|each)\s+(day|week|month)\b/);
  if (m) {
    const n = WORDNUM[m[1]] || parseFloat(m[1]);
    if (n > 0) return (m[2] === "month" ? 720 : m[2] === "week" ? 168 : 24) / n;
  }
  if (/\b(daily|every day|each day)\b/.test(t)) return 24;
  if (/\b(weekly|every week|each week)\b/.test(t)) return 168;
  return null;
}

// The newest matching article this dashboard has not posted about, skipping
// ones whose headline is close to a recent post (the same story from another
// outlet) and ones with no real text (paywall or login pages — see
// usableArticle), or in another language or country than asked for (the
// listing's filters leak; matchesFilters). Null when nothing usable matched.
// skip: uuids to pass over as well (the next story being refreshed away).
async function pickArticle(dash, { skip = [], fresh: refetch = true } = {}) {
  const cfg = cfgOf(dash);
  const used = new Set([].concat(cfg.usedNews || [], cfg.skipNews || [], skip));
  const recent = readSocial().queue.filter(q => q.dashboardId === dash.id && q.news).slice(0, 40).map(q => q.news.title);
  const list = await listNews(cfg.news, { fresh: refetch });
  const fresh = list.filter(a => a.title && !used.has(a.uuid) && !recent.some(t => socialSimilarity(t, a.title) >= 0.6));
  for (const c of fresh.slice(0, 10)) {
    const a = await articleDetails(c.uuid);
    if (usableArticle(a) && matchesFilters(a, cfg.news)) return a;
  }
  return null;
}
function softError(msg) { return Object.assign(new Error(msg), { soft: true }); }

// The story the next post will use, chosen ahead so the page can show it and
// the owner can swap it (↻). Stories swapped away are not offered again until
// a post goes out.
const storyOf = a => ({ uuid: a.uuid, title: a.title, publisher: a.publisher, url: a.url, publishedAt: a.publishedAt });
async function refreshNextStory(dashboardId) {
  const dash = getDashboard(readSocial(), dashboardId);
  const cfg = cfgOf(dash);
  if (!cfg.news.enabled) throw Object.assign(new Error("turn on news for this dashboard first"), { status: 400 });
  const skip = cfg.nextNews ? [cfg.nextNews.uuid] : [];
  let a = await pickArticle(dash, { skip, fresh: false });
  if (!a) a = await pickArticle(dash, { skip, fresh: true });   // the cached listing ran dry: look at newer news
  if (!a) throw Object.assign(new Error("no other article with readable text matches the news filters right now"), { status: 404 });
  return saveCfg(dash.id, { nextNews: storyOf(a), skipNews: [].concat(skip, cfg.skipNews || []).slice(0, 100) });
}

const RUNNING = new Set();
// One run for one dashboard. preview=true writes the post but queues nothing
// and leaves the schedule alone — the page's "Try it" button.
async function runOnce(dashboardId, { preview = false } = {}) {
  const dash = getDashboard(readSocial(), dashboardId);
  const cfg = cfgOf(dash);
  if (!String(cfg.systemPrompt || "").trim()) throw new Error("write a system prompt first");
  const platforms = autopilotPlatforms(dash);
  if (!platforms.length) throw new Error(NO_PLATFORMS);
  if (RUNNING.has(dash.id)) throw new Error("already writing a post");
  RUNNING.add(dash.id);
  broadcast("social_autopilot", { dashboardId: dash.id });
  try {
    const now = new Date();
    let article = null;
    if (cfg.news.enabled) {
      // The story picked ahead (shown on the page), if it is still good.
      if (cfg.nextNews && !(cfg.usedNews || []).includes(cfg.nextNews.uuid)) {
        try { const a = await articleDetails(cfg.nextNews.uuid); if (usableArticle(a)) article = a; } catch (e) {}
      }
      if (!article) article = await pickArticle(dash);
      if (!article) throw softError("no new article with readable text matched the news filters");
    }
    const post = await writePost(dash, platforms, article);
    const stated = cfg.gapHours || promptGapHours(cfg.systemPrompt);
    if (stated) post.next = stated;
    const news = article ? { uuid: article.uuid, title: article.title, publisher: article.publisher, url: article.url } : null;
    if (preview) return Object.assign(post, { platforms, nextRunAt: nextRun(post.next, now), news });

    const d = readSocial();
    const item = {
      id: "sp_" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex"),
      dashboardId: dash.id, text: post.text, platforms, media: [], alt: "",
      scheduledAt: null, status: "queued", results: {}, attempts: 0,
      source: "autopilot", why: post.why, createdAt: now.toISOString(),
    };
    if (news) item.news = news;
    d.queue.unshift(item);
    if (d.queue.length > 500) d.queue.length = 500;
    writeSocial(d);
    setTimeout(socialTick, 300);
    saveCfg(dash.id, { lastRunAt: now.toISOString(), nextRunAt: nextRun(post.next, now),
      lastError: null, lastPostId: item.id, lastWhy: post.why, failures: 0, lastNews: news,
      usedNews: news ? [news.uuid].concat(cfg.usedNews || []).slice(0, 300) : cfg.usedNews,
      nextNews: null, skipNews: [] });
    return item;
  } finally {
    RUNNING.delete(dash.id);
    broadcast("social_autopilot", { dashboardId: dash.id });
  }
}

let ticking = false;
async function autopilotTick() {
  if (ticking) return;
  ticking = true;
  try {
    for (const dash of readSocial().dashboards) {
      const cfg = cfgOf(dash);
      if (!cfg.enabled || RUNNING.has(dash.id)) continue;
      if (cfg.nextRunAt && new Date(cfg.nextRunAt).getTime() > Date.now()) continue;
      try { await runOnce(dash.id); }
      catch (e) {
        if (e.soft) {   // nothing to post about yet: look again in an hour, quietly
          saveCfg(dash.id, { lastError: e.message + " — checking again in an hour", nextRunAt: new Date(Date.now() + 3600000).toISOString() });
          continue;
        }
        const failures = (cfg.failures || 0) + 1;
        saveCfg(dash.id, { lastError: e.message, failures, nextRunAt: new Date(Date.now() + RETRY_MS).toISOString() });
        console.error("[social autopilot]", dash.name, "-", e.message);
        // Say so once, not every half hour while the AI peer is off.
        if (failures === 1) sendAlert("Metis · social autopilot (" + dash.name + ")", "Could not write a post: " + e.message, false);
      }
    }
  } catch (e) { /* never let the ticker die */ }
  ticking = false;
}
setTimeout(autopilotTick, 30000);
setInterval(autopilotTick, TICK_MS);

const NO_PLATFORMS = "pick at least one platform (Bluesky, Mastodon, Facebook and LinkedIn need an account on this dashboard)";

// Turning it on with no schedule yet writes the first post on the next tick.
function configure(dashboardId, body) {
  const dash = getDashboard(readSocial(), dashboardId);
  const cur = cfgOf(dash);
  const patch = {};
  if (typeof body.systemPrompt === "string") patch.systemPrompt = body.systemPrompt.slice(0, 8000);
  if (body.platforms === null) patch.platforms = null;
  else if (Array.isArray(body.platforms)) patch.platforms = [...new Set(body.platforms)].filter(p => selectable(dash, p));
  if (typeof body.host === "string") patch.host = body.host.trim().replace(/\/+$/, "").slice(0, 200);
  if (typeof body.model === "string") patch.model = body.model.trim().slice(0, 200);
  if (body.gapHours === null || body.gapHours === "") patch.gapHours = null;
  else if (body.gapHours !== undefined) {
    const g = Number(body.gapHours);
    if (!(g >= MIN_GAP_MS / 3600000 && g <= MAX_GAP_MS / 3600000)) { const e = new Error("post rate must be between every 2 hours and once a week"); e.status = 400; throw e; }
    patch.gapHours = g;
    // A new rate applies from now: pull a far-off next post in.
    if (cur.enabled && cur.nextRunAt && new Date(cur.nextRunAt).getTime() > Date.now() + g * 3600000)
      patch.nextRunAt = new Date(Date.now() + g * 3600000).toISOString();
  }
  if (body.news && typeof body.news === "object") {
    const n = Object.assign({}, cur.news);
    if (typeof body.news.enabled === "boolean") n.enabled = body.news.enabled;
    if (typeof body.news.link === "boolean") n.link = body.news.link;
    for (const k of ["topic", "country", "language", "keywords"]) if (typeof body.news[k] === "string") n[k] = body.news[k].trim().slice(0, k === "keywords" ? 120 : 40);
    if (body.news.maxAgeHours !== undefined) n.maxAgeHours = Math.max(1, Math.min(168, Number(body.news.maxAgeHours) || 24));
    patch.news = n;
    // Different filters, different candidates: drop the story picked ahead.
    patch.nextNews = null; patch.skipNews = [];
  }
  if (typeof body.enabled === "boolean") {
    const prompt = patch.systemPrompt !== undefined ? patch.systemPrompt : cur.systemPrompt;
    if (body.enabled && !String(prompt || "").trim()) { const e = new Error("write a system prompt first"); e.status = 400; throw e; }
    if (body.enabled && !autopilotPlatforms(Object.assign({}, dash, { autopilot: Object.assign({}, cur, patch) })).length) {
      const e = new Error(NO_PLATFORMS); e.status = 400; throw e;
    }
    patch.enabled = body.enabled;
    if (body.enabled && !cur.enabled) { patch.nextRunAt = new Date().toISOString(); patch.lastError = null; patch.failures = 0; }
  }
  return saveCfg(dash.id, patch);
}

module.exports = { autopilotPlatforms, autopilotTick, configure, nextRun, pickArticle, publicCfg, promptGapHours, refreshNextStory, runOnce };
