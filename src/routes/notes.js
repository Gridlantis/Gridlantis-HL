const { FOLDERS_FILE, NOTES_FILE, WEBFORMS_FILE } = require("../config");
const { readJSON, writeJSON } = require("../store");

// Notes, note links, note folders, and webforms.
module.exports = async function noteRoutes(ctx) {
  const { req, pathname, json, readBody } = ctx;

  // ── Notes API ────────────────────────────────────────────────────────────────

  // ── Note links API ───────────────────────────────────────────────────────────
  if (pathname.match(/^\/api\/notes\/[^\/]+\/links$/) && req.method === 'POST') {
    const noteId = pathname.split('/')[3];
    const notes  = readJSON(NOTES_FILE, []);
    const idx    = notes.findIndex(n => n.id === noteId);
    if (idx < 0) return json({ error: 'Not found' }, 404);
    const body   = JSON.parse((await readBody()).toString());
    const link   = { id: Date.now().toString(), url: body.url || '', title: body.title || body.url || '', emoji: body.emoji || '🔗' };
    if (!notes[idx].links) notes[idx].links = [];
    notes[idx].links.push(link);
    notes[idx].updated = new Date().toISOString();
    writeJSON(NOTES_FILE, notes);
    return json(notes[idx]);
  }
  if (pathname.match(/^\/api\/notes\/[^\/]+\/links\/[^\/]+$/) && req.method === 'DELETE') {
    const parts  = pathname.split('/');
    const noteId = parts[3], linkId = parts[5];
    const notes  = readJSON(NOTES_FILE, []);
    const idx    = notes.findIndex(n => n.id === noteId);
    if (idx < 0) return json({ error: 'Not found' }, 404);
    notes[idx].links = (notes[idx].links || []).filter(l => l.id !== linkId);
    notes[idx].updated = new Date().toISOString();
    writeJSON(NOTES_FILE, notes);
    return json(notes[idx]);
  }

  // Lock / unlock a note's body from its card. Toggles, or sets { hidden } when given.
  if (pathname.match(/^\/api\/notes\/hidden\/[^\/]+$/) && req.method === 'PATCH') {
    const id    = decodeURIComponent(pathname.split('/')[4]);
    const notes = readJSON(NOTES_FILE, []);
    const idx   = notes.findIndex(n => n.id === id);
    if (idx < 0) return json({ error: 'Not found' }, 404);
    const raw   = (await readBody()).toString();
    const body  = raw ? JSON.parse(raw) : {};
    notes[idx].hidden  = typeof body.hidden === 'boolean' ? body.hidden : !notes[idx].hidden;
    notes[idx].updated = new Date().toISOString();
    writeJSON(NOTES_FILE, notes);
    return json(notes[idx]);
  }

  if (pathname === '/api/notes' && req.method === 'GET') {
    return json(readJSON(NOTES_FILE, []));
  }
  if (pathname === '/api/notes' && req.method === 'POST') {
    const notes = readJSON(NOTES_FILE, []);
    const body  = JSON.parse((await readBody()).toString());
    const note  = { id: Date.now().toString(), title: body.title || 'Untitled', body: body.body || '', folderId: body.folderId || null, links: body.links || [], hidden: !!body.hidden, created: new Date().toISOString(), updated: new Date().toISOString() };
    notes.push(note);
    writeJSON(NOTES_FILE, notes);
    return json(note);
  }
  if (pathname.startsWith('/api/notes/') && req.method === 'PUT') {
    const id    = pathname.split('/')[3];
    const notes = readJSON(NOTES_FILE, []);
    const idx   = notes.findIndex(n => n.id === id);
    if (idx < 0) return json({ error: 'Not found' }, 404);
    const body  = JSON.parse((await readBody()).toString());
    notes[idx]  = { ...notes[idx], ...body, id, updated: new Date().toISOString() };
    writeJSON(NOTES_FILE, notes);
    return json(notes[idx]);
  }
  if (pathname.startsWith('/api/notes/') && req.method === 'DELETE') {
    const id    = pathname.split('/')[3];
    const notes = readJSON(NOTES_FILE, []).filter(n => n.id !== id);
    writeJSON(NOTES_FILE, notes);
    return json({ ok: true });
  }

  // ── Note Folders API ─────────────────────────────────────────────────────────
  if (pathname === '/api/note-folders' && req.method === 'GET') {
    return json(readJSON(FOLDERS_FILE, []));
  }
  if (pathname === '/api/note-folders' && req.method === 'POST') {
    const folders = readJSON(FOLDERS_FILE, []);
    const body    = JSON.parse((await readBody()).toString());
    const folder  = { id: Date.now().toString(), name: body.name || 'Folder', emoji: body.emoji || '📁', createdAt: new Date().toISOString() };
    folders.push(folder);
    writeJSON(FOLDERS_FILE, folders);
    return json(folder);
  }
  if (pathname.startsWith('/api/note-folders/') && req.method === 'PUT') {
    const id      = pathname.split('/')[3];
    const folders = readJSON(FOLDERS_FILE, []);
    const idx     = folders.findIndex(f => f.id === id);
    if (idx < 0) return json({ error: 'Not found' }, 404);
    const body    = JSON.parse((await readBody()).toString());
    folders[idx]  = { ...folders[idx], ...body, id };
    writeJSON(FOLDERS_FILE, folders);
    return json(folders[idx]);
  }
  if (pathname.startsWith('/api/note-folders/') && req.method === 'DELETE') {
    const id      = pathname.split('/')[3];
    const folders = readJSON(FOLDERS_FILE, []).filter(f => f.id !== id);
    writeJSON(FOLDERS_FILE, folders);
    const notes = readJSON(NOTES_FILE, []).map(n => n.folderId === id ? { ...n, folderId: null } : n);
    writeJSON(NOTES_FILE, notes);
    return json({ ok: true });
  }

  if (pathname.startsWith('/api/webforms/') && req.method === 'PUT') {
    const id    = pathname.split('/')[3];
    const forms = readJSON(WEBFORMS_FILE, []);
    const idx   = forms.findIndex(f => f.id === id);
    if (idx < 0) return json({ error: 'Not found' }, 404);
    const body  = JSON.parse((await readBody()).toString());
    forms[idx]  = { ...forms[idx], ...body, id };
    writeJSON(WEBFORMS_FILE, forms);
    return json(forms[idx]);
  }
  if (pathname.startsWith('/api/webforms/') && req.method === 'DELETE') {
    const id    = pathname.split('/')[3];
    const forms = readJSON(WEBFORMS_FILE, []).filter(f => f.id !== id);
    writeJSON(WEBFORMS_FILE, forms);
    return json({ ok: true });
  }
};
