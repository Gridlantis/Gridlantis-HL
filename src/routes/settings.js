const { OPENROUTER_API_KEY } = require("../config");
const { NAME_MAX, haloOn, hiddenPages, navGroupNames, navGroups, setHaloOn, setHiddenPages, setNavGroups, setUserName, userName } = require("../profile");
const { NAV_PAGES } = require("../ui/assets");
const { AI_PROVIDERS, SETTINGS, aiProvider, getAiKey, getOpenRouterKey, maskKey, savedAiKey, saveSettings, setAiKey } = require("../settings");
const { keysState, restart, saveKeys } = require("../keys");
const { CURRENT_VERSION, checkForUpdates } = require("../updates");

// UI-editable settings and secrets.
module.exports = async function settingsRoutes(ctx) {
  const { req, pathname, json, readBody } = ctx;

  // ── Profile (/settings): the name the pages greet you by ─────────────────
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

  // ── Sidebar: hidden pages, category names, which category a page sits in ──
  // Only pages inside a category can be hidden or moved; Home always stays.
  if (pathname === '/api/nav' && req.method === 'GET') return json({ hidden: hiddenPages(), names: navGroupNames(), groups: navGroups() });
  if (pathname === '/api/nav' && req.method === 'PUT') {
    const body = JSON.parse((await readBody(8192)).toString() || '{}');
    const isMap = v => v && typeof v === 'object' && !Array.isArray(v);
    if (body.hidden === undefined && body.names === undefined && body.groups === undefined) return json({ error: 'nothing to change' }, 400);
    if (body.hidden !== undefined && !Array.isArray(body.hidden)) return json({ error: 'hidden must be a list of pages' }, 400);
    if (body.names !== undefined && !isMap(body.names)) return json({ error: 'names must map categories to names' }, 400);
    if (body.groups !== undefined && !isMap(body.groups)) return json({ error: 'groups must map pages to categories' }, 400);
    const inGroup = NAV_PAGES.filter(p => p.group);
    const out = { ok: true };
    if (body.hidden !== undefined) out.hidden = setHiddenPages(body.hidden, inGroup.map(p => p.href));
    if (body.names !== undefined || body.groups !== undefined) {
      const keys = [...new Set(inGroup.map(p => p.group))];
      Object.assign(out, setNavGroups(body.names, body.groups, keys, Object.fromEntries(inGroup.map(p => [p.href, p.group]))));
    }
    return json(out);
  }

  // ── Settings → Keys: .env values per feature ────────────────────────────────
  if (pathname === '/api/keys' && req.method === 'GET') return json(keysState());
  if (pathname === '/api/keys' && req.method === 'PUT') {
    const body = JSON.parse((await readBody(64 * 1024)).toString() || '{}');
    try { return json(Object.assign({ ok: true }, saveKeys(body.values))); }
    catch (e) { return json({ error: e.message }, 400); }
  }
  if (pathname === '/api/restart' && req.method === 'POST') {
    if (!restart()) return json({ error: 'Gridlantis-HL was started from a terminal or a service here, so restart it there.' }, 409);
    return json({ ok: true });
  }

  // ── Settings → Updates ──────────────────────────────────────────────────────
  if (pathname === '/api/update' && req.method === 'GET') {
    try { return json(await checkForUpdates(ctx.parsed.searchParams.get('force') === '1')); }
    catch (e) { return json({ error: e.message, current: CURRENT_VERSION || 'unknown' }, 502); }
  }

  // ── Settings (UI-editable secrets: cloud AI keys) ───────────────────────────
  // Keys never come back whole, only masked.
  const aiKeys = () => Object.fromEntries(AI_PROVIDERS.map(p => {
    const k = getAiKey(p.id);
    return [p.id, { set: !!k, masked: maskKey(k), fromEnv: !!k && !savedAiKey(p.id) }];
  }));
  const providers = () => AI_PROVIDERS.map(p => ({ id: p.id, name: p.name, hint: p.hint, env: p.env }));
  if (pathname === '/api/settings' && req.method === 'GET') {
    return json({
      openRouter: { set: !!getOpenRouterKey(), masked: maskKey(getOpenRouterKey()), fromEnv: !!OPENROUTER_API_KEY && !SETTINGS.openRouterKey },
      providers: providers(), aiKeys: aiKeys()
    });
  }
  if (pathname === '/api/settings' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString());
    if (typeof body.openRouterKey === 'string') setAiKey('openrouter', body.openRouterKey);
    if (body.provider !== undefined) {
      if (!aiProvider(body.provider)) return json({ error: 'Unknown provider' }, 400);
      if (typeof body.key !== 'string') return json({ error: 'key must be text' }, 400);
      setAiKey(body.provider, body.key);
    }
    saveSettings();
    return json({
      ok: true,
      openRouter: { set: !!getOpenRouterKey(), masked: maskKey(getOpenRouterKey()) },
      aiKeys: aiKeys()
    });
  }
};
