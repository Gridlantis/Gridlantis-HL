const fs = require("fs");
const path = require("path");

const { checkMedia, isVideo, mediaList, mediaMime } = require("./store");

// ═══ META — Facebook Pages + Instagram (official Graph API) ═══════════════════
// One Facebook Login gives a Page access token (which does not expire when it
// comes from a long-lived user token) and, through the Page, the Instagram
// professional account linked to it. Posting to personal Facebook profiles is
// not possible through the API, so it is always a Page.
//
// Instagram fetches media from a public URL rather than accepting an upload.
// Metis has none, so images go to the Page first as UNPUBLISHED photos (they
// never appear on the Page); Facebook's CDN address for that photo is handed to
// Instagram, and the staging photo is deleted after publishing. Facebook stores
// uploads as JPEG, which is also the only image format Instagram accepts.
// Reels are uploaded straight from disk with Instagram's resumable upload.

const APP_ID     = process.env.META_APP_ID || "";
const APP_SECRET = process.env.META_APP_SECRET || "";
const VER        = process.env.META_GRAPH_VERSION || "v23.0";
const GRAPH      = "https://graph.facebook.com/" + VER;
const SCOPES     = ["pages_show_list", "pages_read_engagement", "pages_manage_posts",
                    "instagram_basic", "instagram_content_publish", "business_management"];

const metaConfigured = () => !!(APP_ID && APP_SECRET);

async function graph(method, pathOrUrl, params, token, opts = {}) {
  const url = new URL(pathOrUrl.startsWith("http") ? pathOrUrl : GRAPH + pathOrUrl);
  let body;
  if (method === "GET" || method === "DELETE") {
    for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
    if (token) url.searchParams.set("access_token", token);
  } else if (opts.form) {
    body = opts.form;
    if (token) body.append("access_token", token);
  } else {
    body = new URLSearchParams(Object.assign({}, params, token ? { access_token: token } : {}));
  }
  const r = await fetch(url, { method, body, signal: AbortSignal.timeout(opts.timeout || 60000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = j.error || {};
    const err = new Error((e.message || ("HTTP " + r.status)) + (e.error_user_msg ? " (" + e.error_user_msg + ")" : ""));
    err.status = r.status; err.code = e.code; err.subcode = e.error_subcode;
    throw err;
  }
  return j;
}

// ── Sign-in ──────────────────────────────────────────────────────────────────
function metaAuthUrl(redirectUri, state) {
  return "https://www.facebook.com/" + VER + "/dialog/oauth?" + new URLSearchParams({
    client_id: APP_ID, redirect_uri: redirectUri, state, response_type: "code", scope: SCOPES.join(","),
  });
}
// Code → short-lived user token → long-lived user token → the Pages it manages.
// Page tokens derived from a long-lived user token do not expire.
async function metaExchange(code, redirectUri) {
  const short = await graph("GET", "/oauth/access_token",
    { client_id: APP_ID, client_secret: APP_SECRET, redirect_uri: redirectUri, code });
  const long = await graph("GET", "/oauth/access_token",
    { grant_type: "fb_exchange_token", client_id: APP_ID, client_secret: APP_SECRET, fb_exchange_token: short.access_token });
  const pages = [];
  let next = "/me/accounts";
  let params = { fields: "id,name,access_token,tasks,instagram_business_account{id,username}", limit: "100" };
  while (next) {
    const r = await graph("GET", next, params, next.startsWith("http") ? null : long.access_token);
    for (const p of r.data || []) pages.push({
      id: p.id, name: p.name, token: p.access_token,
      canPost: !p.tasks || p.tasks.includes("CREATE_CONTENT") || p.tasks.includes("MANAGE"),
      ig: p.instagram_business_account ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username || "" } : null,
    });
    next = r.paging && r.paging.next; params = {};
  }
  return { pages };
}

// ── Facebook Page ────────────────────────────────────────────────────────────
function fileForm(fields, file) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
  if (file) form.append("source", new Blob([fs.readFileSync(file)], { type: mediaMime(file) }), path.basename(file));
  return form;
}
async function uploadPagePhoto(acct, file, published, message) {
  const fields = { published: published ? "true" : "false" };
  if (message) fields.message = message;
  return graph("POST", "/" + acct.pageId + "/photos", null, acct.token, { form: fileForm(fields, file), timeout: 180000 });
}

async function fbPost(acct, item) {
  const files = mediaList(item);
  const bad = checkMedia("facebook", files);
  if (bad) throw new Error(bad);
  const page = acct.pageId;
  if (!files.length) {
    const r = await graph("POST", "/" + page + "/feed", { message: item.text }, acct.token);
    return { ok: true, id: r.id, url: "https://www.facebook.com/" + r.id };
  }
  if (isVideo(files[0])) {
    const r = await graph("POST", "https://graph-video.facebook.com/" + VER + "/" + page + "/videos", null, acct.token,
      { form: fileForm({ description: item.text }, files[0]), timeout: 20 * 60000 });
    return { ok: true, id: r.id, url: "https://www.facebook.com/" + page + "/videos/" + r.id };
  }
  if (files.length === 1) {
    const r = await uploadPagePhoto(acct, files[0], true, item.text);
    return { ok: true, id: r.post_id || r.id, url: "https://www.facebook.com/" + (r.post_id || r.id) };
  }
  // Several photos: upload each unpublished, then one feed post that attaches them.
  const ids = [];
  for (const f of files) ids.push((await uploadPagePhoto(acct, f, false)).id);
  const params = { message: item.text };
  ids.forEach((id, i) => { params["attached_media[" + i + "]"] = JSON.stringify({ media_fbid: id }); });
  const r = await graph("POST", "/" + page + "/feed", params, acct.token);
  return { ok: true, id: r.id, url: "https://www.facebook.com/" + r.id };
}

// ── Instagram ────────────────────────────────────────────────────────────────
// Stage an image on the Page (unpublished) and return a public CDN address for it.
async function stageImage(acct, file) {
  const up = await uploadPagePhoto(acct, file, false);
  const info = await graph("GET", "/" + up.id, { fields: "images" }, acct.token);
  const best = (info.images || []).slice().sort((a, b) => b.width - a.width)[0];
  if (!best || !best.source) throw new Error("Facebook did not return an address for the staged image");
  return { photoId: up.id, url: best.source };
}
async function waitContainer(acct, id, maxMs) {
  const until = Date.now() + maxMs;
  for (;;) {
    const s = await graph("GET", "/" + id, { fields: "status_code,status" }, acct.token);
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED")
      throw new Error("Instagram could not process the media: " + (s.status || s.status_code));
    if (Date.now() > until) throw new Error("Instagram is still processing the media; try again shortly");
    await new Promise(r => setTimeout(r, 3000));
  }
}

async function igPost(acct, item) {
  const files = mediaList(item);
  const bad = checkMedia("instagram", files);
  if (bad) throw new Error(bad);
  if (!files.length) throw new Error("Instagram requires an image or video");
  if (!acct.pageId) throw new Error("this Instagram account has no linked Facebook Page; reconnect it");
  const ig = acct.igId, staged = [];
  try {
    let creation;
    if (isVideo(files[0])) {
      // Reels: create a resumable container, upload the file to it, wait for processing.
      const c = await graph("POST", "/" + ig + "/media", { media_type: "REELS", upload_type: "resumable", caption: item.text }, acct.token);
      const data = fs.readFileSync(files[0]);
      const up = await fetch("https://rupload.facebook.com/ig-api-upload/" + VER + "/" + c.id, {
        method: "POST", body: data, signal: AbortSignal.timeout(20 * 60000),
        headers: { Authorization: "OAuth " + acct.token, offset: "0", file_size: String(data.length) },
      });
      const uj = await up.json().catch(() => ({}));
      if (!up.ok || uj.success === false) throw new Error("Instagram video upload failed: " + ((uj.debug_info && uj.debug_info.message) || up.status));
      await waitContainer(acct, c.id, 10 * 60000);
      creation = c.id;
    } else if (files.length === 1) {
      const s = await stageImage(acct, files[0]); staged.push(s.photoId);
      const params = { image_url: s.url, caption: item.text };
      if (item.alt) params.alt_text = item.alt.slice(0, 1000);
      creation = (await graph("POST", "/" + ig + "/media", params, acct.token)).id;
      await waitContainer(acct, creation, 2 * 60000);
    } else {
      const children = [];
      for (const f of files) {
        const s = await stageImage(acct, f); staged.push(s.photoId);
        children.push((await graph("POST", "/" + ig + "/media", { image_url: s.url, is_carousel_item: "true" }, acct.token)).id);
      }
      for (const ch of children) await waitContainer(acct, ch, 2 * 60000);
      creation = (await graph("POST", "/" + ig + "/media", { media_type: "CAROUSEL", children: children.join(","), caption: item.text }, acct.token)).id;
      await waitContainer(acct, creation, 2 * 60000);
    }
    const pub = await graph("POST", "/" + ig + "/media_publish", { creation_id: creation }, acct.token);
    let url = null;
    try { url = (await graph("GET", "/" + pub.id, { fields: "permalink" }, acct.token)).permalink || null; } catch {}
    return { ok: true, id: pub.id, url };
  } finally {
    // The staging photos were never visible on the Page; remove them either way.
    for (const id of staged) graph("DELETE", "/" + id, {}, acct.token).catch(() => {});
  }
}

// ── Checks ───────────────────────────────────────────────────────────────────
async function metaDiagnose(acct, step) {
  await step("App keys", async () => { if (!metaConfigured()) throw new Error("META_APP_ID / META_APP_SECRET are not set in .env"); return "set"; });
  await step("Page token", async () => {
    const d = await graph("GET", "/debug_token", { input_token: acct.token }, APP_ID + "|" + APP_SECRET);
    const t = d.data || {};
    if (!t.is_valid) throw new Error("token is no longer valid; reconnect");
    const missing = (acct.platform === "instagram" ? ["instagram_basic", "instagram_content_publish", "pages_show_list"] : ["pages_manage_posts", "pages_read_engagement"])
      .filter(s => !(t.scopes || []).includes(s));
    if (missing.length) throw new Error("missing permission " + missing.join(", ") + "; reconnect and allow it");
    return t.expires_at ? "valid, expires " + new Date(t.expires_at * 1000).toLocaleDateString() : "valid, does not expire";
  });
  if (acct.platform === "facebook") {
    await step("Page", async () => (await graph("GET", "/" + acct.pageId, { fields: "name" }, acct.token)).name);
  } else {
    await step("Instagram account", async () => "@" + (await graph("GET", "/" + acct.igId, { fields: "username" }, acct.token)).username);
    await step("Posting quota", async () => {
      const q = await graph("GET", "/" + acct.igId + "/content_publishing_limit", { fields: "quota_usage,config" }, acct.token);
      const d = (q.data || [])[0] || {};
      return (d.quota_usage || 0) + " of " + ((d.config && d.config.quota_total) || 100) + " posts used in the last 24 hours";
    });
  }
}

module.exports = { META_SCOPES: SCOPES, fbPost, igPost, metaAuthUrl, metaConfigured, metaDiagnose, metaExchange };
