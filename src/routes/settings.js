const { OPENROUTER_API_KEY } = require("../config");
const { NAME_MAX, setUserName, userName } = require("../profile");
const { SETTINGS, getOpenRouterKey, maskKey, saveSettings } = require("../settings");

// UI-editable settings and secrets.
module.exports = async function settingsRoutes(ctx) {
  const { req, pathname, json, readBody } = ctx;

  // ── Profile (/personalize): the name the pages greet you by ─────────────────
  if (pathname === '/api/profile' && req.method === 'GET') return json({ name: userName(), max: NAME_MAX });
  if (pathname === '/api/profile' && req.method === 'PUT') {
    const body = JSON.parse((await readBody(4096)).toString() || '{}');
    if (typeof body.name !== 'string') return json({ error: 'name must be text' }, 400);
    return json({ ok: true, name: setUserName(body.name) });
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
