const { OPENROUTER_API_KEY } = require("../config");
const { NAME_MAX, haloOn, hiddenPages, setHaloOn, setHiddenPages, setUserName, userName } = require("../profile");
const { NAV_PAGES } = require("../ui/assets");
const { SETTINGS, getOpenRouterKey, maskKey, saveSettings } = require("../settings");

// UI-editable settings and secrets.
module.exports = async function settingsRoutes(ctx) {
  const { req, pathname, json, readBody } = ctx;

  // ── Profile (/personalize): the name the pages greet you by ─────────────────
  if (pathname === '/api/profile' && req.method === 'GET') return json({ name: userName(), max: NAME_MAX, halo: haloOn() });
  if (pathname === '/api/profile' && req.method === 'PUT') {
    const body = JSON.parse((await readBody(4096)).toString() || '{}');
    if (body.name === undefined && body.halo === undefined) return json({ error: 'nothing to change' }, 400);
    if (body.name !== undefined && typeof body.name !== 'string') return json({ error: 'name must be text' }, 400);
    if (body.halo !== undefined && typeof body.halo !== 'boolean') return json({ error: 'halo must be true or false' }, 400);
    const out = { ok: true };
    if (body.name !== undefined) out.name = setUserName(body.name);
    if (body.halo !== undefined) out.halo = setHaloOn(body.halo);
    return json(out);
  }

  // ── Sidebar: pages hidden from each category's settings ────────────────────
  // Only pages inside a category can be hidden; Home always stays.
  if (pathname === '/api/nav' && req.method === 'GET') return json({ hidden: hiddenPages() });
  if (pathname === '/api/nav' && req.method === 'PUT') {
    const body = JSON.parse((await readBody(8192)).toString() || '{}');
    if (!Array.isArray(body.hidden)) return json({ error: 'hidden must be a list of pages' }, 400);
    return json({ ok: true, hidden: setHiddenPages(body.hidden, NAV_PAGES.filter(p => p.group).map(p => p.href)) });
  }

  // ── Settings (UI-editable secrets: OpenRouter key) ───────────────────────────
  if (pathname === '/api/settings' && req.method === 'GET') {
    return json({
      openRouter: { set: !!getOpenRouterKey(), masked: maskKey(getOpenRouterKey()), fromEnv: !!OPENROUTER_API_KEY && !SETTINGS.openRouterKey }
    });
  }
  if (pathname === '/api/settings' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString());
    if (typeof body.openRouterKey === 'string') {
      if (body.openRouterKey.trim()) SETTINGS.openRouterKey = body.openRouterKey.trim();
      else delete SETTINGS.openRouterKey; // empty clears -> falls back to .env
    }
    saveSettings();
    return json({
      ok: true,
      openRouter: { set: !!getOpenRouterKey(), masked: maskKey(getOpenRouterKey()) }
    });
  }
};
