const { OPENROUTER_API_KEY } = require("../config");
const { SETTINGS, getOpenRouterKey, maskKey, saveSettings } = require("../settings");

// UI-editable settings and secrets.
module.exports = async function settingsRoutes(ctx) {
  const { req, pathname, json, readBody } = ctx;

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
