#!/usr/bin/env node
/**
 * social_agent.js — Metis social autopost sidecar
 * ---------------------------------------------------------------------------
 * Drives a real browser for the platforms that have no free, sanctioned posting
 * API. Metis talks to this over HTTP on 127.0.0.1 and never touches Playwright
 * itself, which keeps server.js at zero npm dependencies.
 *
 * DESIGN RULES (deliberate, please keep them):
 *   1. NO PASSWORDS. `/login` opens a visible browser window and YOU sign in by
 *      hand — 2FA, CAPTCHA, device prompts and all. Playwright only saves the
 *      resulting cookies. Nothing here ever asks Metis for a credential.
 *   2. POSTS ONLY. There is no follow, like, comment, message or scrape
 *      capability, and none should be added.
 *   3. ONE ACCOUNT PER PLATFORM. No profile rotation, no proxy pool. Those are
 *      the building blocks of spam operations, not of a personal tool.
 *   4. HUMAN PACE. Metis enforces a gap between posts; do not remove it.
 *
 * Install:
 *   cd agents/social && npm install && npx playwright install chromium
 * Run:
 *   node social_agent.js            # headless posting, headed login
 */
const http = require("http");
const path = require("path");
const fs   = require("fs");

const PORT        = parseInt(process.env.SOCIAL_AGENT_PORT || "4700", 10);
const SESSION_DIR = process.env.SOCIAL_SESSION_DIR || path.join(__dirname, "sessions");
const HEADLESS    = process.env.SOCIAL_HEADLESS !== "false";
const SLOW_MO     = parseInt(process.env.SOCIAL_SLOW_MO || "120", 10);

let chromium;
try { ({ chromium } = require("playwright")); }
catch {
  console.error("\n✗ Playwright is not installed.\n  cd " + __dirname +
    " && npm install && npx playwright install chromium\n");
  process.exit(1);
}
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
const statePath = p => path.join(SESSION_DIR, p + ".json");

// ─── Platform adapters ───────────────────────────────────────────────────────
// Selectors are the fragile part: every one of these sites A/B-tests its
// composer, so each adapter tries several and reports clearly when all fail
// rather than silently "succeeding" with nothing posted.
const PLATFORMS = {
  x: {
    label: "X",
    loginUrl: "https://x.com/login",
    homeUrl: "https://x.com/home",
    loggedIn: page => page.locator('[data-testid="SideNav_NewTweet_Button"], [data-testid="tweetTextarea_0"]').first()
      .waitFor({ timeout: 8000 }).then(() => true).catch(() => false),
    async post(page, { text, media }) {
      await page.goto("https://x.com/compose/post", { waitUntil: "domcontentloaded" });
      const box = page.locator('[data-testid="tweetTextarea_0"]').first();
      await box.waitFor({ timeout: 20000 });
      await box.click();
      await page.keyboard.insertText(text);
      if (media) {
        await page.locator('input[type="file"]').first().setInputFiles(media);
        await page.waitForTimeout(4000);
      }
      const send = page.locator('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]').first();
      await send.waitFor({ timeout: 15000 });
      await send.click();
      await page.waitForTimeout(4000);
      return { url: null };
    },
  },
  linkedin: {
    label: "LinkedIn",
    loginUrl: "https://www.linkedin.com/login",
    homeUrl: "https://www.linkedin.com/feed/",
    loggedIn: page => page.locator('button.share-box-feed-entry__trigger, [data-control-name="share.sharebox_focus"]').first()
      .waitFor({ timeout: 8000 }).then(() => true).catch(() => false),
    async post(page, { text, media }) {
      await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded" });
      await page.locator('button.share-box-feed-entry__trigger').first().click({ timeout: 20000 });
      const box = page.locator('div.ql-editor[contenteditable="true"]').first();
      await box.waitFor({ timeout: 15000 });
      await box.click();
      await page.keyboard.insertText(text);
      if (media) {
        await page.locator('input[type="file"]').first().setInputFiles(media);
        await page.waitForTimeout(4000);
        await page.getByRole("button", { name: /^Next$/i }).first().click({ timeout: 8000 }).catch(() => {});
      }
      await page.getByRole("button", { name: /^Post$/i }).last().click({ timeout: 15000 });
      await page.waitForTimeout(4000);
      return { url: null };
    },
  },
  threads: {
    label: "Threads",
    loginUrl: "https://www.threads.net/login",
    homeUrl: "https://www.threads.net/",
    loggedIn: page => page.locator('[href="/search"], svg[aria-label="Create"]').first()
      .waitFor({ timeout: 8000 }).then(() => true).catch(() => false),
    async post(page, { text, media }) {
      await page.goto("https://www.threads.net/", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: /create|new thread|start a thread/i }).first()
        .click({ timeout: 20000 }).catch(async () => {
          await page.locator('div[role="button"]:has-text("What\'s new?")').first().click({ timeout: 10000 });
        });
      const box = page.locator('div[contenteditable="true"]').first();
      await box.waitFor({ timeout: 15000 });
      await box.click();
      await page.keyboard.insertText(text);
      if (media) { await page.locator('input[type="file"]').first().setInputFiles(media); await page.waitForTimeout(4000); }
      await page.getByRole("button", { name: /^post$/i }).last().click({ timeout: 15000 });
      await page.waitForTimeout(4000);
      return { url: null };
    },
  },
  instagram: {
    label: "Instagram",
    loginUrl: "https://www.instagram.com/accounts/login/",
    homeUrl: "https://www.instagram.com/",
    needsMedia: true,
    loggedIn: page => page.locator('svg[aria-label="New post"], a[href="/explore/"]').first()
      .waitFor({ timeout: 8000 }).then(() => true).catch(() => false),
    async post(page, { text, media }) {
      if (!media) throw new Error("Instagram requires an image");
      await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded" });
      await page.locator('svg[aria-label="New post"]').first().click({ timeout: 20000 });
      await page.locator('input[type="file"]').first().setInputFiles(media);
      await page.getByRole("button", { name: /^Next$/i }).first().click({ timeout: 20000 });
      await page.getByRole("button", { name: /^Next$/i }).first().click({ timeout: 20000 });
      const cap = page.locator('div[contenteditable="true"][aria-label*="aption"]').first();
      await cap.waitFor({ timeout: 15000 });
      await cap.click();
      await page.keyboard.insertText(text);
      await page.getByRole("button", { name: /^Share$/i }).first().click({ timeout: 20000 });
      await page.waitForTimeout(6000);
      return { url: null };
    },
  },
  facebook: {
    label: "Facebook",
    loginUrl: "https://www.facebook.com/login",
    homeUrl: "https://www.facebook.com/",
    loggedIn: page => page.locator('[aria-label="Create a post"], div[role="button"]:has-text("What\'s on your mind")').first()
      .waitFor({ timeout: 8000 }).then(() => true).catch(() => false),
    async post(page, { text, media }) {
      await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded" });
      await page.locator('div[role="button"]:has-text("What\'s on your mind")').first().click({ timeout: 20000 });
      const box = page.locator('div[contenteditable="true"][role="textbox"]').first();
      await box.waitFor({ timeout: 15000 });
      await box.click();
      await page.keyboard.insertText(text);
      if (media) { await page.locator('input[type="file"]').first().setInputFiles(media); await page.waitForTimeout(5000); }
      await page.getByRole("button", { name: /^Post$/i }).last().click({ timeout: 15000 });
      await page.waitForTimeout(5000);
      return { url: null };
    },
  },
};

// ─── Browser plumbing ────────────────────────────────────────────────────────
async function withContext(platform, headless, fn) {
  const meta = PLATFORMS[platform];
  if (!meta) throw new Error("unknown platform " + platform);
  const sp = statePath(platform);
  const browser = await chromium.launch({ headless, slowMo: headless ? 0 : SLOW_MO });
  try {
    const ctx = await browser.newContext({
      storageState: fs.existsSync(sp) ? sp : undefined,
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
    });
    const page = await ctx.newPage();
    const out = await fn(page, ctx, meta, sp);
    return out;
  } finally { await browser.close().catch(() => {}); }
}

async function doLogin(platform) {
  return withContext(platform, false, async (page, ctx, meta, sp) => {
    await page.goto(meta.loginUrl, { waitUntil: "domcontentloaded" });
    console.log(`\n→ Sign in to ${meta.label} in the browser window that just opened.`);
    console.log("  Metis is not watching your keystrokes; it only saves the session cookie when you're in.\n");
    // Poll for up to 5 minutes — long enough for 2FA, app approval, CAPTCHA.
    const deadline = Date.now() + 5 * 60 * 1000;
    let ok = false;
    while (Date.now() < deadline) {
      if (await meta.loggedIn(page)) { ok = true; break; }
      await page.waitForTimeout(3000);
    }
    if (!ok) throw new Error("login not detected within 5 minutes");
    await ctx.storageState({ path: sp });
    fs.chmodSync(sp, 0o600);
    return { ok: true, platform, savedTo: sp };
  });
}

async function doPost(platform, payload) {
  const sp = statePath(platform);
  if (!fs.existsSync(sp)) throw new Error(`no saved ${platform} session — run login first`);
  return withContext(platform, HEADLESS, async (page, ctx, meta) => {
    await page.goto(meta.homeUrl, { waitUntil: "domcontentloaded" });
    if (!(await meta.loggedIn(page))) {
      throw new Error(`${meta.label} session expired — log in again`);
    }
    const r = await meta.post(page, payload);
    // Re-save: these sites rotate tokens on every visit, so writing the state
    // back keeps the session alive far longer than a one-time capture.
    await ctx.storageState({ path: sp }).catch(() => {});
    return { ok: true, platform, url: r.url || null };
  });
}

// ─── HTTP surface (localhost only) ───────────────────────────────────────────
function sessions() {
  const out = {};
  for (const p of Object.keys(PLATFORMS)) {
    const sp = statePath(p);
    out[p] = fs.existsSync(sp) ? fs.statSync(sp).mtime.toISOString() : null;
  }
  return out;
}
function readBody(req) {
  return new Promise(resolve => { let b = ""; req.on("data", c => b += c); req.on("end", () => resolve(b)); });
}
const srv = http.createServer(async (req, res) => {
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/status" && req.method === "GET") {
      return send(200, { ok: true, headless: HEADLESS, sessions: sessions(),
        platforms: Object.keys(PLATFORMS) });
    }
    if (url.pathname === "/login" && req.method === "POST") {
      const b = JSON.parse((await readBody(req)) || "{}");
      try { return send(200, await doLogin(b.platform)); }
      catch (e) { return send(502, { ok: false, error: e.message }); }
    }
    if (url.pathname === "/logout" && req.method === "POST") {
      const b = JSON.parse((await readBody(req)) || "{}");
      const sp = statePath(b.platform);
      if (fs.existsSync(sp)) fs.unlinkSync(sp);
      return send(200, { ok: true });
    }
    if (url.pathname === "/post" && req.method === "POST") {
      const b = JSON.parse((await readBody(req)) || "{}");
      if (!PLATFORMS[b.platform]) return send(400, { ok: false, error: "unknown platform" });
      if (b.media && !fs.existsSync(b.media)) return send(400, { ok: false, error: "media file not found" });
      try {
        const r = await doPost(b.platform, { text: b.text || "", media: b.media || null, alt: b.alt || "" });
        console.log(`[${new Date().toISOString()}] posted to ${b.platform}`);
        return send(200, r);
      } catch (e) {
        console.error(`[${new Date().toISOString()}] ${b.platform} FAILED: ${e.message}`);
        return send(502, { ok: false, error: e.message });
      }
    }
    send(404, { error: "not found" });
  } catch (e) { send(500, { error: e.message }); }
});
// Bind loopback only. This process can post as you; it must never be reachable
// from the LAN, let alone the internet.
srv.listen(PORT, "127.0.0.1", () => {
  console.log(`social agent on http://127.0.0.1:${PORT}  (headless=${HEADLESS})`);
  console.log(`sessions: ${SESSION_DIR}`);
});
