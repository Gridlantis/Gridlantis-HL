const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { PASSWORD, ROOT } = require("./config");
const { writeSecretFile } = require("./settings");

// ─── SESSIONS ─────────────────────────────────────────────────────────────────
// ── Sessions: stateless signed tokens (survive restarts; no store needed) ────
// Token = "<expiry>.<hmac(expiry)>" signed with a random secret persisted to
// disk on first run. Restarting the server no longer logs anyone out.
const SESSION_SECRET_FILE = path.join(ROOT, ".session_secret");
const SESSION_SECRET = (() => {
  try { const s = fs.readFileSync(SESSION_SECRET_FILE, "utf8").trim(); if (s.length >= 32) return s; } catch {}
  const s = crypto.randomBytes(32).toString("hex");
  try { writeSecretFile(SESSION_SECRET_FILE, s); } catch(e) { console.error("session secret save:", e.message); }
  return s;
})();
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
function signSession(exp) { return crypto.createHmac("sha256", SESSION_SECRET).update(String(exp)).digest("hex"); }
function makeSession() { const exp = Date.now() + SESSION_TTL_MS; return exp + "." + signSession(exp); }
function validSession(token) {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const exp = token.slice(0, dot), sig = token.slice(dot + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expect = signSession(exp);
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect)); } catch { return false; }
}
// The login wall for any request: plain pages and API calls go through the
// router, WebSocket upgrades check it themselves. Open when no PASSWORD is set.
function authenticated(req) {
  if (!PASSWORD) return true;
  const m = String(req.headers.cookie || "").match(/metis_session=([^;]+)/);
  return !!(m && validSession(m[1]));
}

module.exports = { SESSION_SECRET, SESSION_SECRET_FILE, SESSION_TTL_MS, authenticated, makeSession, signSession, validSession };
