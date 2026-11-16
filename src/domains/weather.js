const { activity } = require("../activity");
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
  activity("weather", "fetch", { target: "weather", label: "Fetching the weather" });
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

// The named forecast periods ("Tonight", "Saturday", "Saturday Night", …) with
// a spoken-style detailedForecast each, for questions like "what about
// tomorrow". weather.gov writes those sentences itself; when it refuses us (it
// answers this server with 403s for days at a time) Open-Meteo's numbers are
// turned into the same shape.
const FORECAST_CACHE = new Map(); // lat,lon -> { at, periods }
async function fetchForecast(lat, lon) {
  const key = lat + ',' + lon;
  const hit = FORECAST_CACHE.get(key);
  if (hit && Date.now() - hit.at < WEATHER_TTL_MS) return hit.periods;
  let periods;
  try { periods = await weatherGovPeriods(lat, lon); }
  catch (e1) {
    try { periods = await openMeteoPeriods(lat, lon); }
    catch (e2) { throw new Error(`weather.gov: ${e1.message}; fallback: ${e2.message}`); }
  }
  FORECAST_CACHE.set(key, { at: Date.now(), periods });
  return periods;
}

async function weatherGovPeriods(lat, lon) {
  const headers = { 'Accept': 'application/geo+json',
    'User-Agent': 'OpenHL/1.0 (https://github.com/openhl-dashboard; openhl@openhl.local)' };
  const point = JSON.parse(await httpGet(`https://api.weather.gov/points/${lat},${lon}`, 8000, headers));
  const url = point.properties && point.properties.forecast;
  if (!url) throw new Error('No forecast URL in weather.gov response');
  const periods = (JSON.parse(await httpGet(url, 8000, headers)).properties || {}).periods || [];
  if (!periods.length) throw new Error('weather.gov sent no forecast periods');
  return periods;
}

// Day periods from the daily figures; "Tonight" from the hours between now and
// six tomorrow morning, since the daily low belongs to the small hours of the
// calendar day rather than to tonight.
async function openMeteoPeriods(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max`
    + `&hourly=temperature_2m,precipitation_probability,weather_code`
    + `&temperature_unit=fahrenheit&timezone=auto&forecast_days=7`;
  const d = JSON.parse(await httpGet(url, 8000, { 'Accept': 'application/json' }));
  const days = d.daily || {}, hours = d.hourly || {};
  if (!Array.isArray(days.time) || !days.time.length) throw new Error('Open-Meteo sent no daily forecast');
  const chance = p => p >= 20 ? ` ${Math.round(p / 10) * 10} percent chance of precipitation.` : '';
  const sky = c => (WMO[c] || 'Mixed conditions');
  const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const out = [];
  const now = new Date(), hour = now.getHours();

  const nightPeriod = () => {
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 6).getTime();
    const idx = (hours.time || []).map((t, i) => [Date.parse(t), i]).filter(([t]) => t >= now.getTime() - 3600000 && t <= end).map(([, i]) => i);
    if (!idx.length) return null;
    const temps = idx.map(i => hours.temperature_2m[i]).filter(Number.isFinite);
    const pop = Math.max(0, ...idx.map(i => hours.precipitation_probability[i] || 0));
    const code = hours.weather_code[idx[Math.floor(idx.length / 2)]];
    return { name: 'Tonight', isDaytime: false, temperature: Math.round(Math.min(...temps)), temperatureUnit: 'F',
      shortForecast: sky(code), detailedForecast: `${sky(code)}, with a low around ${Math.round(Math.min(...temps))}.${chance(pop)}` };
  };
  days.time.forEach((date, i) => {
    const hi = Math.round(days.temperature_2m_max[i]), lo = Math.round(days.temperature_2m_min[i]);
    const name = i === 0 ? 'Today' : NAMES[new Date(date + 'T12:00:00').getDay()];
    const day = { name, isDaytime: true, temperature: hi, temperatureUnit: 'F', shortForecast: sky(days.weather_code[i]),
      detailedForecast: `${sky(days.weather_code[i])}, with a high near ${hi} and a low around ${lo}.${chance(days.precipitation_probability_max[i] || 0)}` };
    if (i === 0) {
      const night = nightPeriod();
      if (hour < 17) out.push(day);
      if (night) out.push(night);
    } else out.push(day);
  });
  return out;
}

module.exports = { DEFAULT_LAT, DEFAULT_LON, WEATHER_CACHE, WEATHER_TTL_MS, fetchForecast, fetchWeather };
