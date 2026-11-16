const fs = require("fs");
const path = require("path");

const { dataFile, pipeline, UPLOAD_DIR } = require("../config");
const { parseMultipart } = require("../multipart");
const { buildZip, collectFiles } = require("../zip");
const live = require("../domains/live");

// Live folders' hub copies live in uploads/Live folders/ (see domains/live):
// Syncthing's own bookkeeping stays out of the listing, and a live folder
// itself can only be removed or renamed from the Live folders page, since
// deleting it here would look like "delete everything" to every PC. Deleting
// or overwriting something inside one first moves the old copy into the
// folder's versions (live.archiveBeforeChange), so it shows up in Restore.
const LIVE_ROOT = path.join(UPLOAD_DIR, "Live folders");
const SYNC_INTERNAL = /^(\.stfolder|\.stignore|\.stversions)$|^\.syncthing\..*\.tmp$|^~syncthing~/;
const isLiveRootOrFolder = p => { const r = path.resolve(p); return r === LIVE_ROOT || path.dirname(r) === LIVE_ROOT; };

// File browser: listing, upload, mkdir, delete, rename, preview, download.
module.exports = async function fileRoutes(ctx) {
  const { req, res, parsed, pathname, json, html, readBody } = ctx;

  // ── Files API ────────────────────────────────────────────────────────────────
  if (pathname === '/api/files' && req.method === 'GET') {
    const sub = parsed.searchParams.get('dir') || '';
    const dir = sub ? path.join(UPLOAD_DIR, sub) : UPLOAD_DIR;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return json({ error: 'Cannot read directory' }, 400); }
    function fmtBytes(b) { if(b<1024)return b+' B'; if(b<1048576)return(b/1024).toFixed(1)+' KB'; return(b/1048576).toFixed(1)+' MB'; }
    // Group assignments live in file_group_map.json (written by PATCH
    // /api/file-groups/assign). This listing used to drop groupId entirely, so
    // every assignment vanished on the next refresh even though it had saved.
    let groupMap = {};
    try { groupMap = JSON.parse(fs.readFileSync(dataFile("file_group_map.json"), 'utf8')); } catch {}
    const items = entries.filter(e => !SYNC_INTERNAL.test(e.name)).map(e => {
      const full = path.join(dir, e.name);
      const isDir = e.isDirectory();
      let size = '—', mtime = 0, count = 0;
      try {
        const s = fs.statSync(full);
        mtime = s.mtimeMs;
        if (isDir) {
          try { count = fs.readdirSync(full).length; } catch { count = 0; }
          size = count + ' item' + (count !== 1 ? 's' : '');
        } else {
          size = fmtBytes(s.size);
        }
      } catch {}
      const key = sub ? sub + '/' + e.name : e.name;
      return { name: e.name, isDir, size, mtime, count, groupId: groupMap[key] || null };
    }).sort((a,b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return json(items);
  }

  if (pathname === '/api/files/upload' && req.method === 'POST') {
    const dir = parsed.searchParams.get('dir') ? path.join(UPLOAD_DIR, parsed.searchParams.get('dir')) : UPLOAD_DIR;
    if (!path.resolve(dir).startsWith(UPLOAD_DIR)) return json({ error: 'Invalid path' }, 400);
    const ct = req.headers['content-type'] || '';
    const boundary = ct.split('boundary=')[1];
    if (!boundary) return json({ error: 'No boundary' }, 400);
    const body = await readBody(0); // uploads: no cap
    const files = parseMultipart(body, boundary);
    try {
      for (const f of files) {
        const dest = path.join(dir, path.basename(f.filename));
        if (fs.existsSync(dest)) await live.archiveBeforeChange(dest);
        fs.writeFileSync(dest, f.data);
      }
    } catch(e) { return json({ error: e.message }, e.status || 400); }
    return json({ ok: true, count: files.length });
  }

  if (pathname === '/api/files/mkdir' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString());
    const dir  = body.dir ? path.join(UPLOAD_DIR, body.dir) : UPLOAD_DIR;
    if (!path.resolve(dir).startsWith(UPLOAD_DIR)) return json({ error: 'Invalid path' }, 400);
    const name = (body.name || '').replace(/[^a-zA-Z0-9_\-. ]/g, '');
    if (!name) return json({ error: 'Invalid name' }, 400);
    try { fs.mkdirSync(path.join(dir, name)); return json({ ok: true }); }
    catch(e) { return json({ error: e.message }, 400); }
  }

  if (pathname === '/api/files/delete' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString());
    const target = path.join(UPLOAD_DIR, body.path || '');
    if (!target.startsWith(UPLOAD_DIR)) return json({ error: 'Invalid path' }, 400);
    if (isLiveRootOrFolder(target)) return json({ error: 'That is a live folder — remove it on the Live folders page' }, 400);
    try {
      const stat = fs.statSync(target);
      await live.archiveBeforeChange(target);
      if (stat.isDirectory()) fs.rmSync(target, { recursive: true, force: true });
      else if (fs.existsSync(target)) fs.unlinkSync(target);
      return json({ ok: true });
    } catch(e) { return json({ error: e.message }, e.status || 400); }
  }

  if (pathname === '/api/files/rename' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString());
    const from = path.join(UPLOAD_DIR, body.from || '');
    const to   = path.join(UPLOAD_DIR, body.to   || '');
    if (!from.startsWith(UPLOAD_DIR) || !to.startsWith(UPLOAD_DIR)) return json({ error: 'Invalid path' }, 400);
    if (isLiveRootOrFolder(from)) return json({ error: 'That is a live folder — rename it on the Live folders page' }, 400);
    try {
      if (fs.existsSync(to) && path.resolve(to) !== path.resolve(from)) await live.archiveBeforeChange(to);
      fs.renameSync(from, to); return json({ ok: true });
    } catch(e) { return json({ error: e.message }, e.status || 400); }
  }

  if (pathname === '/api/files/preview') {
    // Serves files inline with correct MIME type for browser rendering (PDF, images, etc.)
    const filePath = path.join(UPLOAD_DIR, parsed.searchParams.get('path') || '');
    if (!filePath.startsWith(UPLOAD_DIR)) return json({ error: 'Invalid path' }, 403);
    const MIME = {
      pdf: 'application/pdf',
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
      mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
      mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
      txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8',
      html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8',
      js: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8',
      xml: 'text/xml; charset=utf-8', csv: 'text/plain; charset=utf-8',
      py: 'text/plain; charset=utf-8', ts: 'text/plain; charset=utf-8',
    };
    try {
      const stat = fs.statSync(filePath);
      const ext  = path.extname(filePath).slice(1).toLowerCase();
      const ct   = MIME[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': ct,
        'Content-Disposition': 'inline; filename="' + path.basename(filePath) + '"',
        'Content-Length': stat.size,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      return pipeline(fs.createReadStream(filePath), res, () => {});
    } catch(e) { return json({ error: 'File not found' }, 404); }
  }

  if (pathname === '/api/files/download') {
    const filePath = path.join(UPLOAD_DIR, parsed.searchParams.get('path') || '');
    if (!filePath.startsWith(UPLOAD_DIR)) return json({ error: 'Invalid path' }, 403);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        const files = collectFiles(filePath, path.basename(filePath));
        const zip   = buildZip(files);
        const name  = path.basename(filePath) + '.zip';
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${name}"`,
          'Content-Length': zip.length
        });
        return res.end(zip);
      }
      const name = path.basename(filePath);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Content-Length': stat.size
      });
      return pipeline(fs.createReadStream(filePath), res, () => {});
    } catch(e) { return json({ error: 'File not found' }, 404); }
  }
};
