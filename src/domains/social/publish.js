const { sendAlert } = require("../../alerts");
const { agentPost } = require("./agent");
const { postLength } = require("./length");
const { bskyPost } = require("./bluesky");
const { liPost } = require("./linkedin");
const { mastoPost } = require("./mastodon");
const { fbPost, igPost } = require("./meta");
const { SOCIAL_MIN_GAP_MS, SOCIAL_PLATFORMS, SOCIAL_TICK_MS, getDashboard, mediaList, readSocial, writeSocial } = require("./store");
const { broadcast } = require("../../sse");
const { activity } = require("../../activity");

// A renewed LinkedIn token has to outlive this post.
function saveAccount(dashboardId, acct) {
  const d = readSocial();
  const dash = getDashboard(d, dashboardId);
  const i = dash.accounts.findIndex(a => a.platform === acct.platform);
  if (i !== -1) { dash.accounts[i] = Object.assign({}, dash.accounts[i], acct); writeSocial(d); }
}

// ── Publish one platform ────────────────────────────────────────────────────
const SOCIAL_LAST_POST = {};   // platform -> ms, enforces the anti-burst gap
async function publishTo(platform, item) {
  const meta = SOCIAL_PLATFORMS[platform];
  if (!meta) throw new Error("unknown platform " + platform);
  if (meta.limit && postLength(platform, item.text) > meta.limit) {
    throw new Error(`${meta.label} limit is ${meta.limit} chars, post is ${postLength(platform, item.text)}`);
  }
  if (meta.needsMedia && !mediaList(item).length) throw new Error(meta.label + " requires an image or video");
  // Gap is tracked per dashboard+platform: two dashboards posting to different
  // accounts shouldn't throttle each other, but repeat posts to the SAME
  // account still pace themselves.
  const gapKey = (item.dashboardId || "d1") + ":" + platform;
  const last = SOCIAL_LAST_POST[gapKey] || 0;
  const wait = SOCIAL_MIN_GAP_MS - (Date.now() - last);
  if (wait > 0) await new Promise(r => setTimeout(r, Math.min(wait, 30000)));

  const d = readSocial();
  const dash = getDashboard(d, item.dashboardId);
  const acct = dash.accounts.find(a => a.platform === platform && a.enabled !== false);
  if (meta.via === "native" && !acct) {
    throw new Error("no " + meta.label + " account on the " + dash.name + " dashboard");
  }

  let out;
  if (platform === "bluesky")        out = await bskyPost(acct, item);
  else if (platform === "mastodon")  out = await mastoPost(acct, item);
  else if (platform === "facebook")  out = await fbPost(acct, item);
  else if (platform === "instagram") out = await igPost(acct, item);
  else if (platform === "linkedin")  out = await liPost(acct, item, a => saveAccount(item.dashboardId, a));
  else                               out = await agentPost(acct, item, platform);
  SOCIAL_LAST_POST[gapKey] = Date.now();
  return out;
}

// ── Scheduler ───────────────────────────────────────────────────────────────
let socialTicking = false;
async function socialTick() {
  if (socialTicking) return;
  socialTicking = true;
  try {
    const d = readSocial();
    const now = Date.now();
    // A post is due only once BOTH gates have passed: the time the user asked
    // for, and any retry backoff from a previous failure.
    const due = d.queue.filter(q => q.status === "queued"
      && (!q.scheduledAt   || new Date(q.scheduledAt).getTime()   <= now)
      && (!q.nextAttemptAt || new Date(q.nextAttemptAt).getTime() <= now));
    for (const item of due) {
      // Re-read each pass: a publish can take a while and the file may have
      // changed underneath us (a user cancelling, another platform finishing).
      const cur = readSocial();
      const live = cur.queue.find(q => q.id === item.id);
      if (!live || live.status !== "queued") continue;
      live.status = "posting"; live.startedAt = new Date().toISOString();
      writeSocial(cur);
      broadcast("social_update", { id: live.id, status: "posting" });

      const results = live.results || {};
      for (const p of live.platforms) {
        if (results[p] && results[p].ok) continue;   // don't re-post a success on retry
        const key = live.id + ":" + p;
        activity("social", "send", { target: p, phase: "start", key, label: "Posting to " + SOCIAL_PLATFORMS[p]?.label });
        try {
          const r = await publishTo(p, live);
          results[p] = { ok: true, url: r.url || null, at: new Date().toISOString() };
        } catch (e) {
          results[p] = { ok: false, error: e.message, at: new Date().toISOString() };
        }
        activity("social", "send", { target: p, phase: "done", key, ok: results[p].ok, label: (results[p].ok ? "Posted to " : "Post failed on ") + SOCIAL_PLATFORMS[p]?.label });
      }
      const after = readSocial();
      const slot = after.queue.find(q => q.id === live.id);
      if (!slot) continue;
      slot.results = results;
      const oks = live.platforms.filter(p => results[p] && results[p].ok).length;
      slot.status = oks === live.platforms.length ? "posted" : (oks ? "partial" : "failed");
      slot.finishedAt = new Date().toISOString();
      if (slot.status !== "posted") {
        slot.attempts = (slot.attempts || 0) + 1;
        if (slot.attempts < 3) {
          // Back off 5min, 15min. This goes in its own field: overwriting
          // scheduledAt would destroy the time the USER picked and make the
          // queue read "scheduled for" a moment five minutes from now.
          slot.status = "queued";
          slot.nextAttemptAt = new Date(Date.now() + slot.attempts * 300000).toISOString();
        } else {
          delete slot.nextAttemptAt;
        }
      } else {
        delete slot.nextAttemptAt;
      }
      writeSocial(after);
      broadcast("social_update", { id: slot.id, status: slot.status, results });
      if (slot.status === "failed") {
        sendAlert("Metis \u00b7 social post failed",
          live.platforms.map(p => p + ": " + ((results[p] && results[p].error) || "?")).join(" \u00b7 "), false);
      }
    }
  } catch (e) { /* never let the scheduler die */ }
  socialTicking = false;
}
setTimeout(socialTick, 12000);
setInterval(socialTick, SOCIAL_TICK_MS);

// ═══ SOCIAL AI COPILOT ════════════════════════════════════════════════════════
// Drafts posts on the local Ollama peer, with the dashboard's queue and history
// as context so it does not repeat itself. It NEVER publishes: every draft has
// to be queued or scheduled by hand from the page.

module.exports = { SOCIAL_LAST_POST, publishTo, saveAccount, socialTick, socialTicking };
