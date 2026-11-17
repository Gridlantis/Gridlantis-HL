

const path = require("path");

// ─── HELPERS ──────────────────────────────────────────────────────────────────
// Errors that carry the HTTP status their route should answer with. Each module
// binds its own default: 400 for bad input, 502 for a peer that misbehaved.
const errorWithStatus = fallback => (msg, status) => { const e = new Error(msg); e.status = status || fallback; return e; };
// A client-supplied path resolved inside root, or null if it would land
// outside it. Leading slashes are dropped so "/a" means root/a, as path.join
// treated it. Checks for root + separator, so "uploads2" is not inside "uploads".
function insideDir(root, rel) {
  const base = path.resolve(root);
  const full = path.resolve(base, String(rel == null ? "" : rel).replace(/^[\\/]+/, ""));
  return full === base || full.startsWith(base + path.sep) ? full : null;
}
const esc     = s   => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const fmtSize = b   => b<1024?b+" B":b<1048576?(b/1024).toFixed(1)+" KB":b<1073741824?(b/1048576).toFixed(1)+" MB":(b/1073741824).toFixed(1)+" GB";

module.exports = { errorWithStatus, esc, fmtSize, insideDir };
