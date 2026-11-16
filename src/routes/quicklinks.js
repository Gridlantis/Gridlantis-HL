const crypto = require("crypto");

const { quickLinkColor, readQuickLinks, writeQuickLinks } = require("../domains/quicklinks");

// Quick links on the home page's right rail.
module.exports = async function quicklinkRoutes(ctx) {
  const { req, pathname, json, readBody } = ctx;

  // ── Quick links (home page right rail) ───────────────────────────────────────
  if (pathname === '/api/quicklinks' && req.method === 'GET') {
    return json(readQuickLinks());
  }
  if (pathname === '/api/quicklinks' && req.method === 'POST') {
    const b = JSON.parse((await readBody()).toString() || '{}');
    let url = String(b.url || '').trim();
    if (!url) return json({ error: 'a URL is required' }, 400);
    // Reject dangerous schemes BEFORE any normalisation. Prefixing first turns
    // "javascript:alert(1)" into "https://javascript:alert(1)", which sails past
    // a later check while still storing rubbish.
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^https?:\/\//i.test(url)) {
      return json({ error: 'only http, https and internal /paths are allowed' }, 400);
    }
    // Relative paths stay as-is so internal pages can be pinned too.
    if (url.charAt(0) !== '/' && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    let label = String(b.label || '').trim();
    if (!label) {
      try { label = url.charAt(0) === '/' ? url.slice(1) : new URL(url).hostname.replace(/^www\./, ''); }
      catch { label = url; }
    }
    const d = readQuickLinks();
    if (d.links.length >= 24) return json({ error: 'quick link limit reached (24)' }, 400);
    const link = {
      id: 'ql_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'),
      url, label: label.slice(0, 40),
      // Two initials read better than one at 44px.
      icon: String(b.icon || '').trim().slice(0, 4) || label.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?',
      color: /^#[0-9a-fA-F]{6}$/.test(String(b.color || '')) ? b.color : quickLinkColor(label),
      createdAt: new Date().toISOString(),
    };
    d.links.push(link); writeQuickLinks(d);
    return json(link);
  }
  if (pathname.startsWith('/api/quicklinks/') && req.method === 'PUT') {
    const id = pathname.split('/')[3];
    const b = JSON.parse((await readBody()).toString() || '{}');
    const d = readQuickLinks();
    const i = d.links.findIndex(l => l.id === id);
    if (i === -1) return json({ error: 'not found' }, 404);
    if (b.label !== undefined) d.links[i].label = String(b.label).slice(0, 40);
    if (b.icon !== undefined) d.links[i].icon = String(b.icon).slice(0, 4);
    if (b.color !== undefined && /^#[0-9a-fA-F]{6}$/.test(b.color)) d.links[i].color = b.color;
    if (b.url !== undefined) {
      let u = String(b.url).trim();
      if (/^[a-z][a-z0-9+.-]*:/i.test(u) && !/^https?:\/\//i.test(u)) {
        return json({ error: 'only http, https and internal /paths are allowed' }, 400);
      }
      if (u.charAt(0) !== '/' && !/^https?:\/\//i.test(u)) u = 'https://' + u;
      d.links[i].url = u;
    }
    if (b.index !== undefined) {                 // drag-free reordering
      const [moved] = d.links.splice(i, 1);
      d.links.splice(Math.max(0, Math.min(d.links.length, parseInt(b.index, 10) || 0)), 0, moved);
    }
    writeQuickLinks(d);
    return json({ ok: true, links: d.links });
  }
  if (pathname.startsWith('/api/quicklinks/') && req.method === 'DELETE') {
    const id = pathname.split('/')[3];
    const d = readQuickLinks();
    d.links = d.links.filter(l => l.id !== id);
    writeQuickLinks(d);
    return json({ ok: true });
  }
};
