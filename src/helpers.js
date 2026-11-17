

// ─── HELPERS ──────────────────────────────────────────────────────────────────
// Errors that carry the HTTP status their route should answer with. Each module
// binds its own default: 400 for bad input, 502 for a peer that misbehaved.
const errorWithStatus = fallback => (msg, status) => { const e = new Error(msg); e.status = status || fallback; return e; };
const esc     = s   => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const fmtSize = b   => b<1024?b+" B":b<1048576?(b/1024).toFixed(1)+" KB":b<1073741824?(b/1048576).toFixed(1)+" MB":(b/1073741824).toFixed(1)+" GB";

module.exports = { errorWithStatus, esc, fmtSize };
