const { httpGet } = require("../net");

// ── Current conditions, with a short-lived cache ──────────────────────────────
// The /api/weather route the pages poll reads through this cache.
const WEATHER_CACHE = new Map(); // lat,lon -> { at, data } (10-min TTL)
const WEATHER_TTL_MS = 10 * 60 * 1000;

// Where to show weather for when the page sends no location. Set WEATHER_LAT
// and WEATHER_LON in .env; the fallback is Washington, DC.
const DEFAULT_LAT = process.env.WEATHER_LAT || "38.8951", DEFAULT_LON = process.env.WEATHER_LON || "-77.0364";

// 1) api.weather.gov (NWS). It requires a descriptive User-Agent that
//    identifies the app + a contact, or Akamai returns HTTP 403.
async function tryWeatherGov(lat, lon) {
  const wxHeaders = {
    'Accept': 'application/geo+json',
    'User-Agent': 'OpenHL/1.0 (https://github.com/openhl-dashboard; openhl@openhl.local)'
  };
  const safeJson = (raw, ctx) => {
    const t = (raw || '').trim();
    if (t.startsWith('<') || t.startsWith('Host ')) {
      throw new Error(`weather.gov returned a non-JSON response (${ctx})`);
    }
    return JSON.parse(t);
  };
  const pointData = safeJson(await httpGet(`https://api.weather.gov/points/${lat},${lon}`, 8000, wxHeaders), 'points');
  const forecastUrl = pointData.properties && pointData.properties.forecast;
  if (!forecastUrl) throw new Error('No forecast URL in weather.gov response');
  const forecast = safeJson(await httpGet(forecastUrl, 8000, wxHeaders), 'forecast');
  return forecast.properties.periods[0];
}

// WMO weather codes, as Open-Meteo reports them.
const WMO = {
  0:'Clear',1:'Mostly Clear',2:'Partly Cloudy',3:'Overcast',45:'Fog',48:'Fog',
  51:'Drizzle',53:'Drizzle',55:'Drizzle',56:'Freezing Drizzle',57:'Freezing Drizzle',
  61:'Rain',63:'Rain',65:'Heavy Rain',66:'Freezing Rain',67:'Freezing Rain',
  71:'Snow',73:'Snow',75:'Heavy Snow',77:'Snow',80:'Rain Showers',81:'Rain Showers',
  82:'Rain Showers',85:'Snow Showers',86:'Snow Showers',95:'Thunderstorm',
  96:'Thunderstorm',99:'Thunderstorm'
};

// 2) Fallback: Open-Meteo (free, keyless, no UA restrictions). Normalised to
//    the same fields the front-end reads from a weather.gov period object.
async function tryOpenMeteo(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day`
    + `&temperature_unit=fahrenheit&wind_speed_unit=mph`;
  const data = JSON.parse(await httpGet(url, 8000, { 'Accept': 'application/json' }));
  const c = data.current || {};
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  const compass = c.wind_direction_10m != null
    ? dirs[Math.round(c.wind_direction_10m / 45) % 8] : '';
  return {
    temperature: c.temperature_2m != null ? Math.round(c.temperature_2m) : '—',
    temperatureUnit: 'F',
    shortForecast: WMO[c.weather_code] || 'Current Conditions',
    relativeHumidity: { value: c.relative_humidity_2m != null ? c.relative_humidity_2m : null },
    windSpeed: (c.wind_speed_10m != null ? Math.round(c.wind_speed_10m) : 0) + ' mph',
    windDirection: compass,
    isDaytime: c.is_day === 1,
    source: 'open-meteo'
  };
}

// Throws only when BOTH providers fail, and then with both messages — knowing
// which one broke is the whole of the diagnosis.
async function fetchWeather(lat, lon) {
  const key = lat + ',' + lon;
  const hit = WEATHER_CACHE.get(key);
  if (hit && Date.now() - hit.at < WEATHER_TTL_MS) return hit.data;
  try {
    const wx = await tryWeatherGov(lat, lon);
    WEATHER_CACHE.set(key, { at: Date.now(), data: wx });
    return wx;
  } catch (e1) {
    try {
      const wx2 = await tryOpenMeteo(lat, lon);
      WEATHER_CACHE.set(key, { at: Date.now(), data: wx2 });
      return wx2;
    } catch (e2) {
      throw new Error(`weather.gov: ${e1.message}; fallback: ${e2.message}`);
    }
  }
}

module.exports = { DEFAULT_LAT, DEFAULT_LON, WEATHER_CACHE, WEATHER_TTL_MS, fetchWeather };
