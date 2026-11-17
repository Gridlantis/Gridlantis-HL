const fs = require("fs");
const path = require("path");

const { UPLOAD_DIR } = require("../config");
const { insideDir } = require("../helpers");
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
    // A folder upload names each file by its path in the folder; none may
    // climb out of uploads/. Checked for all files before writing any.
    const dests = files.map(f => insideDir(UPLOAD_DIR, f.relativePath || f.filename));
    if (dests.some(d => !d || d === path.resolve(UPLOAD_DIR))) return json({ error: 'Invalid file path' }, 400);
    for (const [i, f] of files.entries()) {
      const dest = dests[i];
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, f.data);
    }
    return json({ ok: true, count: files.length });
  }
};
