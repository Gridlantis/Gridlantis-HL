const fs = require("fs");
const path = require("path");

const { FILE_GROUPS_FILE, UPLOAD_DIR, dataFile } = require("../config");
const { insideDir } = require("../helpers");
const { boundaryOf, parseMultipart } = require("../multipart");
const { readJSON } = require("../store");

// "image.jpg" taken -> "image (1).jpg". iPhone and iPad Safari name every photo
// from the picker image.jpg, so overwriting kept only the last of a batch.
function freeName(dest) {
  if (!fs.existsSync(dest)) return dest;
  const dir = path.dirname(dest), ext = path.extname(dest), base = path.basename(dest, ext);
  for (let n = 1; ; n++) {
    const next = path.join(dir, `${base} (${n})${ext}`);
    if (!fs.existsSync(next)) return next;
  }
}

// Files shows a group's items by their top-level name in uploads/
// (file_group_map.json, also written by PATCH /api/file-groups/assign).
function assignGroup(topName, groupId) {
  if (!groupId || !readJSON(FILE_GROUPS_FILE, []).some(g => g.id === groupId)) return;
  const mapFile = dataFile("file_group_map.json");
  let map = {};
  try { map = JSON.parse(fs.readFileSync(mapFile, 'utf8')); } catch {}
  map[topName] = groupId;
  fs.writeFileSync(mapFile, JSON.stringify(map, null, 2));
}

// Upload alias the client posts to.
module.exports = async function uploadRoutes(ctx) {
  const { req, pathname, json, readBody } = ctx;

  // ── Upload alias (client posts to /upload) ────────────────────────────────────
  if (pathname === '/upload' && req.method === 'POST') {
    try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch {}
    const boundary = boundaryOf(req.headers['content-type']);
    if (!boundary) return json({ error: 'No boundary' }, 400);
    const body = await readBody(0); // uploads: no cap
    const files = parseMultipart(body, boundary);
    if (!files.length) return json({ error: 'No file in the upload' }, 400);
    // A folder upload names each file by its path in the folder; none may
    // climb out of uploads/. Checked for all files before writing any.
    const dests = files.map(f => insideDir(UPLOAD_DIR, f.relativePath || f.filename));
    if (dests.some(d => !d || d === path.resolve(UPLOAD_DIR))) return json({ error: 'Invalid file path' }, 400);
    const root = path.resolve(UPLOAD_DIR);
    const saved = [];
    for (const [i, f] of files.entries()) {
      // A single file never replaces another; a folder upload updates its own files.
      const inFolder = path.dirname(dests[i]) !== root;
      const dest = inFolder ? dests[i] : freeName(dests[i]);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, f.data);
      const rel = path.relative(root, dest).split(path.sep).join('/');
      saved.push(rel);
      assignGroup(rel.split('/')[0], files.fields.groupId);
    }
    return json({ ok: true, count: files.length, saved });
  }
};
