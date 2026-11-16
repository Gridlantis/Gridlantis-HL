const fs = require("fs");
const path = require("path");

const { UPLOAD_DIR } = require("../config");
const { parseMultipart } = require("../multipart");

// Upload alias the client posts to.
module.exports = async function uploadRoutes(ctx) {
  const { req, pathname, json, readBody } = ctx;

  // ── Upload alias (client posts to /upload) ────────────────────────────────────
  if (pathname === '/upload' && req.method === 'POST') {
    try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch {}
    const ct = req.headers['content-type'] || '';
    const boundary = ct.split('boundary=')[1];
    if (!boundary) return json({ error: 'No boundary' }, 400);
    const body = await readBody(0); // uploads: no cap
    const files = parseMultipart(body, boundary);
    for (const f of files) {
      const relPath = f.relativePath || f.filename;
      const dest    = path.join(UPLOAD_DIR, relPath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, f.data);
    }
    return json({ ok: true, count: files.length });
  }
};
