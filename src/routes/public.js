
const { PASSWORD } = require("../config");
const { finishAuth: gcalFinishAuth } = require("../domains/gcal");
const { finish: socialOauthFinish } = require("../domains/social/oauth");
const { loginHtml } = require("../pages/login");
const { SESSION_TTL_MS, makeSession } = require("../session");

// ── Login throttling ──────────────────────────────────────────────────────────
// Metis is reachable from the WAN, so slow down password guessing: after 5 bad
// passwords from one address within 15 minutes, refuse logins from it for 15.
const LOGIN_FAILS = new Map();   // ip -> { count, first, lockedUntil }
const FAIL_WINDOW_MS = 15 * 60 * 1000, MAX_FAILS = 5, LOCK_MS = 15 * 60 * 1000;
function clientIp(req) {
  const remote = req.socket.remoteAddress || '';
  // Behind a local reverse proxy (tailscale serve, nginx) the real client is in X-Forwarded-For.
  if ((remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1') && req.headers['x-forwarded-for'])
    return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return remote;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, r] of LOGIN_FAILS) if (now - r.first > FAIL_WINDOW_MS && (!r.lockedUntil || r.lockedUntil < now)) LOGIN_FAILS.delete(ip);
}, 5 * 60 * 1000).unref?.();

// Reachable without a session: the login form, logout, the live-folder
// setup scripts, the
// laptop setup script (a laptop fetches it with curl before it has anything to
// sign in with; it holds no secrets — each laptop makes its own password), and
// Google's OAuth callback (it carries a one-time state that only a signed-in
// Metis page could have minted).
module.exports = async function publicRoutes(ctx) {
  const { req, res, pathname, json, html, readBody } = ctx;

  // ── Login ───────────────────────────────────────────────────────────────────
  if (pathname === '/login') {
    if (req.method === 'GET') return html(loginHtml);
    if (req.method === 'POST') {
      const ip = clientIp(req);
      const rec = LOGIN_FAILS.get(ip);
      if (rec && rec.lockedUntil && rec.lockedUntil > Date.now()) {
        const mins = Math.ceil((rec.lockedUntil - Date.now()) / 60000);
        return html(loginHtml.replace('</form>', '<p class="login-msg" role="alert">Too many attempts. Try again in ' + mins + ' min.</p></form>'), 429);
      }
      const body = await readBody();
      const params = new URLSearchParams(body.toString());
      if (!PASSWORD || params.get('password') === PASSWORD) {
        LOGIN_FAILS.delete(ip);
        const sid = makeSession();
        res.writeHead(302, { 'Set-Cookie': `metis_session=${sid}; HttpOnly; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS/1000)}`, Location: '/welcome' });
        return res.end();
      }
      const now = Date.now();
      const r = (rec && now - rec.first <= FAIL_WINDOW_MS) ? rec : { count: 0, first: now, lockedUntil: 0 };
      r.count++;
      if (r.count >= MAX_FAILS) { r.lockedUntil = now + LOCK_MS; console.error('[login] ' + ip + ' locked out after ' + r.count + ' failed attempts'); }
      LOGIN_FAILS.set(ip, r);
      return html(loginHtml.replace('</form>', '<p class="login-msg" role="alert">That password is not correct.</p></form>'), 401);
    }
  }

  if (pathname === '/logout') {
    res.writeHead(302, { 'Set-Cookie': 'metis_session=; Max-Age=0; Path=/', Location: '/login' });
    return res.end();
  }

  // Live folders: the PC setup scripts, the Syncthing builds they download,
  // and the PCs' status reports.
  if (pathname.startsWith('/live/setup.') || pathname.startsWith('/live/dl/') || pathname === '/live/report') {
    await require('./live').publicLive(ctx);
    if (res.headersSent || res.writableEnded) return;
  }

  if (pathname === '/laptops/setup.sh' && req.method === 'GET') {
    const { setupScript } = require('./laptops');
    res.writeHead(200, { 'Content-Type': 'text/x-shellscript; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(setupScript());
  }

  // ── Facebook/Instagram and LinkedIn OAuth callback ──────────────────────────
  // Same one-time state check as the calendar callback below.
  if (pathname === '/api/social/oauth/callback' && req.method === 'GET') {
    let loc;
    try { const r = await socialOauthFinish(ctx.parsed.searchParams); loc = '/social?pick=' + r.provider + '&dashboard=' + encodeURIComponent(r.dashboardId); }
    catch (e) { loc = '/social?serr=' + encodeURIComponent(e.message); }
    res.writeHead(302, { Location: loc }); return res.end();
  }

  // ── Google Calendar OAuth callback ──────────────────────────────────────────
  if (pathname === '/api/calendar/callback' && req.method === 'GET') {
    const q = ctx.parsed.searchParams;
    const back = msg => { res.writeHead(302, { Location: '/calendar' + (msg ? '?gerr=' + encodeURIComponent(msg) : '?connected=1') }); res.end(); };
    if (q.get('error')) return back('Google said: ' + q.get('error'));
    try { await gcalFinishAuth(q.get('code') || '', q.get('state') || ''); return back(null); }
    catch (e) { return back(e.message); }
  }
};
