const https = require("https");

const { RING_HARDWARE_ID, RING_REFRESH_TOKEN } = require("../../config");
const { httpGet, httpPost } = require("../../net");

// ── Ring: cloud, refresh-token auth (no password stored) ─────────────────────
const RING = { token: null, at: 0 };
async function ringAuth() {
  if (!RING_REFRESH_TOKEN) throw new Error("RING_REFRESH_TOKEN not set in .env");
  if (RING.token && Date.now() - RING.at < 50 * 60 * 1000) return RING.token;
  const r = await httpPost("https://oauth.ring.com/oauth/token",
    JSON.stringify({ grant_type: "refresh_token", refresh_token: RING_REFRESH_TOKEN,
      client_id: "ring_official_android", scope: "client" }),
    { "Content-Type": "application/json", "User-Agent": "android:com.ringapp", "hardware_id": RING_HARDWARE_ID }, 12000);
  const o = JSON.parse(r);
  if (!o.access_token) throw new Error(o.error_description || "Ring auth failed — refresh token may be expired");
  RING.token = o.access_token; RING.at = Date.now();
  return RING.token;
}
async function ringDevices() {
  const t = await ringAuth();
  return JSON.parse(await httpGet("https://api.ring.com/clients_api/ring_devices", 12000,
    { Authorization: "Bearer " + t, "User-Agent": "android:com.ringapp", "hardware_id": RING_HARDWARE_ID }));
}
async function ringProbe(dev) {
  try {
    const d = await ringDevices();
    const all = [].concat(d.doorbots || [], d.authorized_doorbots || [], d.stickup_cams || [], d.chimes || []);
    const c = all.find(x => String(x.id) === String(dev.devId));
    if (!c) return { online: false, err: "device not in Ring account" };
    const h = c.health || {};
    return { online: (h.device_type_alias || true) && c.alerts ? c.alerts.connection !== "offline" : true, state: {
      name: c.description, battery: c.battery_life, model: c.kind,
      rssi: h.latest_signal_strength, firmware: c.firmware_version,
      motionEnabled: c.settings ? c.settings.motion_detection_enabled : null,
    } };
  } catch (e) { return { online: false, err: e.message }; }
}
async function ringCommand(dev, cmd) {
  try {
    const t = await ringAuth();
    const hdr = { Authorization: "Bearer " + t, "User-Agent": "android:com.ringapp", "Content-Type": "application/json", "hardware_id": RING_HARDWARE_ID };
    if (cmd.action === "lightOn" || cmd.action === "lightOff") {
      await httpPut(`https://api.ring.com/clients_api/doorbots/${dev.devId}/floodlight_light_${cmd.action === "lightOn" ? "on" : "off"}`, "{}", hdr);
      return { ok: true };
    }
    if (cmd.action === "siren") {
      await httpPut(`https://api.ring.com/clients_api/doorbots/${dev.devId}/siren_${cmd.on ? "on" : "off"}`, "{}", hdr);
      return { ok: true };
    }
    return { ok: false, error: "unsupported command" };
  } catch (e) { return { ok: false, error: e.message }; }
}
function httpPut(url, body, headers = {}, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === "https:" ? https : require("http");
    const req = mod.request({ hostname: u.hostname, port: u.port || undefined, path: u.pathname + u.search,
      method: "PUT", headers: Object.assign({ "Content-Length": Buffer.byteLength(body) }, headers), timeout: timeoutMs },
      r => { let d = ""; r.on("data", c => d += c); r.on("end", () => resolve(d)); });
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
    req.write(body); req.end();
  });
}

module.exports = { RING, httpPut, ringAuth, ringCommand, ringDevices, ringProbe };
