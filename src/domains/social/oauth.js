const crypto = require("crypto");

const { PORT } = require("../../config");
const { linkedinAuthUrl, linkedinConfigured, linkedinExchange } = require("./linkedin");
const { metaAuthUrl, metaConfigured, metaExchange } = require("./meta");
const { getDashboard, readSocial, writeSocial } = require("./store");

// ═══ SOCIAL SIGN-IN — Meta and LinkedIn OAuth ═════════════════════════════════
// Same shape as the Google Calendar sign-in: a one-time state minted by a
// signed-in page, a callback outside the login wall that checks it, and a
// paste-the-address fallback for browsers that are not on the Open HL host (both
// providers only redirect back to localhost or a public domain).
//
// After the callback the person still has to choose WHICH Page / company to use
// for the dashboard, so the token and the list wait here, in memory only, for
// fifteen minutes.

const REDIRECT_URI = process.env.SOCIAL_REDIRECT_URI || `http://localhost:${PORT}/api/social/oauth/callback`;
const PROVIDERS = { meta: { configured: metaConfigured }, linkedin: { configured: linkedinConfigured } };
const STATES = new Map();    // state -> { provider, dashboardId, exp }
const PENDING = new Map();   // dashboardId:provider -> { choices..., exp }
const TTL = 15 * 60 * 1000;

function prune() {
  const now = Date.now();
  for (const [k, v] of STATES) if (v.exp < now) STATES.delete(k);
  for (const [k, v] of PENDING) if (v.exp < now) PENDING.delete(k);
}

function startUrl(provider, dashboardId) {
  if (!PROVIDERS[provider]) throw new Error("unknown provider");
  if (!PROVIDERS[provider].configured()) throw new Error(provider === "meta"
    ? "Set META_APP_ID and META_APP_SECRET in .env first" : "Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in .env first");
  prune();
  const state = crypto.randomBytes(18).toString("base64url");
  STATES.set(state, { provider, dashboardId: getDashboard(readSocial(), dashboardId).id, exp: Date.now() + TTL });
  return provider === "meta" ? metaAuthUrl(REDIRECT_URI, state) : linkedinAuthUrl(REDIRECT_URI, state);
}

// LinkedIn says "unauthorized_scope_error" when the app is not yet approved for
// the Community Management API; say that in words.
function explain(provider, error, description) {
  if (provider === "linkedin" && /scope/i.test(error + " " + description))
    return "LinkedIn has not approved this app for company page posting yet (Community Management API). " +
           "Once it is approved, connect again.";
  return (provider === "meta" ? "Facebook" : "LinkedIn") + " said: " + (description || error);
}

// Handles both the real callback and a pasted address. Returns the dashboard
// and provider so the page can show the choice that follows.
async function finish(params) {
  prune();
  const state = params.get("state") || "";
  const st = STATES.get(state);
  if (!st) throw new Error("That sign-in link has expired. Click Connect again.");
  STATES.delete(state);
  const err = params.get("error") || params.get("error_code");
  if (err) throw new Error(explain(st.provider, err, params.get("error_description") || params.get("error_message") || ""));
  const code = params.get("code");
  if (!code) throw new Error("The address has no sign-in code in it");
  const key = st.dashboardId + ":" + st.provider;
  if (st.provider === "meta") {
    const { pages } = await metaExchange(code, REDIRECT_URI);
    if (!pages.length) throw new Error("This Facebook account does not manage any Pages, or none were allowed on the consent screen.");
    PENDING.set(key, { provider: "meta", pages, exp: Date.now() + TTL });
  } else {
    const { tok, orgs } = await linkedinExchange(code, REDIRECT_URI);
    if (!orgs.length) throw new Error("This LinkedIn account is not an admin of any company page.");
    PENDING.set(key, { provider: "linkedin", tok, orgs, exp: Date.now() + TTL });
  }
  return { dashboardId: st.dashboardId, provider: st.provider };
}

// What the page shows after sign-in: names only, never tokens.
function pendingChoices(dashboardId) {
  prune();
  const out = {};
  const meta = PENDING.get(dashboardId + ":meta");
  if (meta) out.meta = meta.pages.map(p => ({ id: p.id, name: p.name, canPost: p.canPost, instagram: p.ig ? p.ig.username || p.ig.id : null }));
  const lin = PENDING.get(dashboardId + ":linkedin");
  if (lin) out.linkedin = lin.orgs.map(o => ({ id: o.id, name: o.name, role: o.role }));
  return out;
}

// Store the chosen Page (and, if asked, its Instagram account) or company on
// the dashboard. Replaces whatever that dashboard had for those platforms.
function choose(dashboardId, provider, body) {
  prune();
  const d = readSocial();
  const dash = getDashboard(d, dashboardId);
  const key = dash.id + ":" + provider;
  const p = PENDING.get(key);
  if (!p) throw new Error("That sign-in has expired. Click Connect again.");
  const put = acct => {
    const i = dash.accounts.findIndex(a => a.platform === acct.platform);
    if (i === -1) dash.accounts.push(acct); else dash.accounts[i] = acct;
  };
  const saved = [];
  if (provider === "meta") {
    const page = p.pages.find(x => x.id === String(body.pageId));
    if (!page) throw new Error("Pick one of the listed Pages");
    if (body.facebook !== false) {
      put({ platform: "facebook", enabled: true, via: "api", pageId: page.id, pageName: page.name, token: page.token, connectedAt: new Date().toISOString() });
      saved.push("facebook");
    }
    if (body.instagram !== false && page.ig) {
      put({ platform: "instagram", enabled: true, via: "api", igId: page.ig.id, username: page.ig.username, pageId: page.id,
            pageName: page.name, token: page.token, connectedAt: new Date().toISOString() });
      saved.push("instagram");
    }
    if (!saved.length) throw new Error(page.ig ? "Tick Facebook, Instagram or both" : "Tick Facebook (this Page has no Instagram account linked)");
  } else {
    const org = p.orgs.find(x => x.id === String(body.orgId));
    if (!org) throw new Error("Pick one of the listed company pages");
    put(Object.assign({ platform: "linkedin", enabled: true, via: "api", orgId: org.id, orgUrn: org.urn, orgName: org.name,
                        connectedAt: new Date().toISOString() }, p.tok));
    saved.push("linkedin");
  }
  writeSocial(d);
  PENDING.delete(key);
  return saved;
}

function oauthStatus() {
  return { redirectUri: REDIRECT_URI, meta: metaConfigured(), linkedin: linkedinConfigured() };
}

module.exports = { SOCIAL_REDIRECT_URI: REDIRECT_URI, choose, finish, oauthStatus, pendingChoices, startUrl };
