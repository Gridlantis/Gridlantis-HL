const fs = require("fs");

const { checkMedia, isVideo, mediaList } = require("./store");

// ═══ LINKEDIN — company pages (official Community Management API) ════════════
// Posting as an organization needs the w_organization_social permission, which
// LinkedIn only grants to apps approved for its Community Management API. Until
// that approval comes through, sign-in fails with an "unauthorized scope" error,
// and the page says so plainly.
//
// Access tokens last 60 days. Apps with Community Management access normally
// also get a refresh token (a year), which is used here when present; without
// one, the account asks to be reconnected as the token runs out.

const CLIENT_ID     = process.env.LINKEDIN_CLIENT_ID || "";
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || "";
const SCOPES        = ["w_organization_social", "r_organization_admin"];
const API           = "https://api.linkedin.com/rest";
const POSTING_ROLES = ["ADMINISTRATOR", "CONTENT_ADMINISTRATOR", "DIRECT_SPONSORED_CONTENT_POSTER"];

const linkedinConfigured = () => !!(CLIENT_ID && CLIENT_SECRET);

// LinkedIn's REST API is versioned by month (YYYYMM) and retires versions after
// about a year. Two months back is always live; LINKEDIN_VERSION pins one.
function apiVersion() {
  if (process.env.LINKEDIN_VERSION) return process.env.LINKEDIN_VERSION;
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 2);
  return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0");
}

async function li(method, url, token, body, extraHeaders = {}) {
  const headers = Object.assign({ Authorization: "Bearer " + token, "LinkedIn-Version": apiVersion(),
                                  "X-Restli-Protocol-Version": "2.0.0" }, extraHeaders);
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(url.startsWith("http") ? url : API + url,
    { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const text = await r.text();
  let j = {}; try { j = text ? JSON.parse(text) : {}; } catch {}
  if (!r.ok) {
    const err = new Error("LinkedIn: " + (j.message || j.error_description || ("HTTP " + r.status)));
    err.status = r.status; throw err;
  }
  return { json: j, headers: r.headers };
}

// ── Sign-in ──────────────────────────────────────────────────────────────────
function linkedinAuthUrl(redirectUri, state) {
  return "https://www.linkedin.com/oauth/v2/authorization?" + new URLSearchParams({
    response_type: "code", client_id: CLIENT_ID, redirect_uri: redirectUri, state, scope: SCOPES.join(" "),
  });
}
async function tokenRequest(form) {
  const r = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(Object.assign({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET }, form)),
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("LinkedIn sign-in failed: " + (j.error_description || j.error || r.status));
  return {
    token: j.access_token, expiresAt: Date.now() + (j.expires_in || 0) * 1000,
    refreshToken: j.refresh_token || null,
    refreshExpiresAt: j.refresh_token_expires_in ? Date.now() + j.refresh_token_expires_in * 1000 : null,
  };
}
// Code → token → the organizations this person can post for.
async function linkedinExchange(code, redirectUri) {
  const tok = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  const acl = await li("GET", "/organizationAcls?q=roleAssignee&state=APPROVED&count=100", tok.token);
  const orgs = [];
  for (const el of acl.json.elements || []) {
    if (!POSTING_ROLES.includes(el.role)) continue;
    const id = String(el.organization || "").split(":").pop();
    if (!id || orgs.some(o => o.id === id)) continue;
    let name = "Organization " + id;
    try { name = (await li("GET", "/organizations/" + id, tok.token)).json.localizedName || name; } catch {}
    orgs.push({ id, urn: "urn:li:organization:" + id, name, role: el.role });
  }
  return { tok, orgs };
}

// Keep the token fresh; returns a usable access token or explains what to do.
async function liToken(acct, save) {
  if (acct.expiresAt && Date.now() < acct.expiresAt - 24 * 3600e3) return acct.token;
  if (acct.refreshToken && (!acct.refreshExpiresAt || Date.now() < acct.refreshExpiresAt)) {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: acct.refreshToken });
    Object.assign(acct, { token: t.token, expiresAt: t.expiresAt,
      refreshToken: t.refreshToken || acct.refreshToken, refreshExpiresAt: t.refreshExpiresAt || acct.refreshExpiresAt });
    if (save) save(acct);
    return acct.token;
  }
  if (acct.expiresAt && Date.now() >= acct.expiresAt) throw new Error("LinkedIn sign-in expired; click Reconnect on the Social page");
  return acct.token;
}

// LinkedIn post text uses a markup where these characters are reserved; left
// unescaped they cut the post short. Hashtags become LinkedIn's hashtag syntax.
function liText(s) {
  return String(s).split(/(#[\p{L}\p{N}_]+)/u).map(part => {
    if (/^#[\p{L}\p{N}_]+$/u.test(part)) return "{hashtag|\\#|" + part.slice(1) + "}";
    return part.replace(/[\\|{}@\[\]()<>#*_~]/g, ch => "\\" + ch);
  }).join("");
}

// ── Media ────────────────────────────────────────────────────────────────────
async function uploadImage(token, owner, file) {
  const init = await li("POST", "/images?action=initializeUpload", token, { initializeUploadRequest: { owner } });
  const { uploadUrl, image } = init.json.value || {};
  const put = await fetch(uploadUrl, { method: "PUT", body: fs.readFileSync(file),
    headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(180000) });
  if (!put.ok) throw new Error("LinkedIn image upload failed (HTTP " + put.status + ")");
  return image;
}
async function uploadVideo(token, owner, file) {
  const data = fs.readFileSync(file);
  const init = await li("POST", "/videos?action=initializeUpload", token,
    { initializeUploadRequest: { owner, fileSizeBytes: data.length, uploadCaptions: false, uploadThumbnail: false } });
  const v = init.json.value || {};
  const etags = [];
  for (const part of v.uploadInstructions || []) {
    const put = await fetch(part.uploadUrl, { method: "PUT", body: data.subarray(part.firstByte, part.lastByte + 1),
      headers: { "Content-Type": "application/octet-stream" }, signal: AbortSignal.timeout(10 * 60000) });
    if (!put.ok) throw new Error("LinkedIn video upload failed (HTTP " + put.status + ")");
    etags.push(put.headers.get("etag"));
  }
  await li("POST", "/videos?action=finalizeUpload", token,
    { finalizeUploadRequest: { video: v.video, uploadToken: v.uploadToken || "", uploadedPartIds: etags } });
  return v.video;
}

// ── Posting ──────────────────────────────────────────────────────────────────
async function liPost(acct, item, save) {
  const files = mediaList(item);
  const bad = checkMedia("linkedin", files);
  if (bad) throw new Error(bad);
  const token = await liToken(acct, save);
  const owner = acct.orgUrn;
  const post = {
    author: owner, commentary: liText(item.text), visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false,
  };
  const alt = (item.alt || "").slice(0, 4086);
  if (files.length && isVideo(files[0])) {
    post.content = { media: { id: await uploadVideo(token, owner, files[0]), title: item.text.slice(0, 200) } };
  } else if (files.length === 1) {
    post.content = { media: { id: await uploadImage(token, owner, files[0]), altText: alt } };
  } else if (files.length > 1) {
    const images = [];
    for (const f of files) images.push({ id: await uploadImage(token, owner, f), altText: alt });
    post.content = { multiImage: { images } };
  }
  const r = await li("POST", "/posts", token, post);
  const urn = r.headers.get("x-restli-id") || r.headers.get("x-linkedin-id") || "";
  return { ok: true, id: urn, url: urn ? "https://www.linkedin.com/feed/update/" + urn + "/" : null };
}

async function liDiagnose(acct, step, save) {
  await step("App keys", async () => { if (!linkedinConfigured()) throw new Error("LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET are not set in .env"); return "set"; });
  let token = null;
  await step("Sign-in", async () => {
    token = await liToken(acct, save);
    const left = acct.expiresAt ? Math.round((acct.expiresAt - Date.now()) / 86400e3) : null;
    return (left != null ? "valid for " + left + " more days" : "valid") + (acct.refreshToken ? ", renews automatically" : ", reconnect before it runs out");
  });
  if (token) await step("Company page", async () => (await li("GET", "/organizations/" + acct.orgId, token)).json.localizedName || acct.orgName);
}

module.exports = { LINKEDIN_SCOPES: SCOPES, liDiagnose, liPost, liText, linkedinAuthUrl, linkedinConfigured, linkedinExchange };
