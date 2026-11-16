const { DEFAULT_LAT, DEFAULT_LON, fetchWeather } = require("../domains/weather");

// Weather. The fetching and its cache live in domains/weather.
module.exports = async function weatherRoutes(ctx) {
  const { req, parsed, pathname, json } = ctx;

  // ── Weather API ───────────────────────────────────────────────────────────────
  if (pathname === '/api/weather' && req.method === 'GET') {
    const lat = parsed.searchParams.get('lat') || DEFAULT_LAT;
    const lon = parsed.searchParams.get('lon') || DEFAULT_LON;
    try { return json(await fetchWeather(lat, lon)); }
    catch (e) { return json({ error: e.message }, 502); }
  }
};
