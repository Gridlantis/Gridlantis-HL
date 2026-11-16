const fs = require("fs");
const path = require("path");

const { dataFile, FILE_GROUPS_FILE, FOLDERS_FILE, NOTES_FILE } = require("../config");
const { readJSON, writeJSON } = require("../store");

// Folder aliases and file groups.
module.exports = async function folderRoutes(ctx) {
  const { req, pathname, json, readBody } = ctx;

  // ── Folder alias routes (client uses /api/folders, not /api/note-folders) ────
  if (pathname === '/api/folders' && req.method === 'GET') {
    return json(readJSON(FOLDERS_FILE, []));
  }
  if (pathname === '/api/folders' && req.method === 'POST') {
    const folders = readJSON(FOLDERS_FILE, []);
    const body    = JSON.parse((await readBody()).toString());
    const folder  = { id: Date.now().toString(), name: body.name || 'Folder', emoji: body.emoji || '📁', createdAt: new Date().toISOString() };
    folders.push(folder);
    writeJSON(FOLDERS_FILE, folders);
    return json(folder);
  }
  if (pathname.startsWith('/api/folders/') && pathname.endsWith('/emoji') && req.method === 'PATCH') {
    const id      = pathname.split('/')[3];
    const folders = readJSON(FOLDERS_FILE, []);
    const idx     = folders.findIndex(f => f.id === id);
    if (idx < 0) return json({ error: 'Not found' }, 404);
    const body    = JSON.parse((await readBody()).toString());
    folders[idx].emoji = body.emoji || folders[idx].emoji;
    writeJSON(FOLDERS_FILE, folders);
    return json(folders[idx]);
  }
  if (pathname.startsWith('/api/folders/') && req.method === 'DELETE') {
    const id      = pathname.split('/')[3];
    const folders = readJSON(FOLDERS_FILE, []).filter(f => f.id !== id);
    writeJSON(FOLDERS_FILE, folders);
    const notes   = readJSON(NOTES_FILE, []).map(n => n.folderId === id ? { ...n, folderId: null } : n);
    writeJSON(NOTES_FILE, notes);
    return json({ ok: true });
  }

  // ── File groups API ───────────────────────────────────────────────────────────
  if (pathname === '/api/file-groups' && req.method === 'GET') {
    return json(readJSON(FILE_GROUPS_FILE, []));
  }
  if (pathname === '/api/file-groups' && req.method === 'POST') {
    const groups = readJSON(FILE_GROUPS_FILE, []);
    const body   = JSON.parse((await readBody()).toString());
    const group  = { id: Date.now().toString(), name: body.name || 'Group', emoji: body.emoji || '📂', createdAt: new Date().toISOString() };
    groups.push(group);
    writeJSON(FILE_GROUPS_FILE, groups);
    return json(group);
  }
  if (pathname === '/api/file-groups/assign' && req.method === 'PATCH') {
    const body    = JSON.parse((await readBody()).toString());
    const mapFile = dataFile("file_group_map.json");
    let map = {};
    try { map = JSON.parse(fs.readFileSync(mapFile, 'utf8')); } catch {}
    if (body.groupId) map[body.fileName] = body.groupId;
    else delete map[body.fileName];
    fs.writeFileSync(mapFile, JSON.stringify(map, null, 2));
    return json({ fileName: body.fileName, groupId: body.groupId || null });
  }
  if (pathname.startsWith('/api/file-groups/') && req.method === 'DELETE') {
    const id     = pathname.split('/')[3];
    const groups = readJSON(FILE_GROUPS_FILE, []).filter(g => g.id !== id);
    writeJSON(FILE_GROUPS_FILE, groups);
    // Remove group from map
    const mapFile = dataFile("file_group_map.json");
    let map = {};
    try { map = JSON.parse(fs.readFileSync(mapFile, 'utf8')); } catch {}
    for (const k of Object.keys(map)) { if (map[k] === id) delete map[k]; }
    fs.writeFileSync(mapFile, JSON.stringify(map, null, 2));
    return json({ ok: true });
  }
};
