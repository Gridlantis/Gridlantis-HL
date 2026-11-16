const crypto = require("crypto");

const { WYZE_API_KEY, WYZE_EMAIL, WYZE_KEY_ID, WYZE_PASSWORD, WYZE_PHONE_ID } = require("../../config");
const { httpPost } = require("../../net");

// ── Wyze: cloud only (no local API). Needs an API key from the Wyze dev portal
// plus the account password. Tokens are cached in memory and refreshed on 401.
const WYZE = { token: null, refresh: null, at: 0 };
function wyzeTriMd5(pw) {
  let h = pw;
  for (let i = 0; i < 3; i++) h = crypto.createHash("md5").update(h).digest("hex");
  return h;
}
async function wyzeLogin() {
  if (!WYZE_EMAIL || !WYZE_PASSWORD || !WYZE_API_KEY || !WYZE_KEY_ID) throw new Error("Wyze credentials not set in .env");
  if (WYZE.token && Date.now() - WYZE.at < 50 * 60 * 1000) return WYZE.token;
  const body = JSON.stringify({ email: WYZE_EMAIL, password: wyzeTriMd5(WYZE_PASSWORD) });
  const r = await httpPost("https://auth-prod.api.wyze.com/user/login", body, {
    "Content-Type": "application/json", "User-Agent": "wyze_ios_2.21.35",
    "x-api-key": WYZE_API_KEY, keyid: WYZE_KEY_ID, apikey: WYZE_API_KEY,
  }, 12000);
  const o = JSON.parse(r);
  if (!o.access_token) throw new Error(o.description || o.errorCode || "Wyze login failed (2FA accounts need an app password / API key pair)");
  WYZE.token = o.access_token; WYZE.refresh = o.refresh_token; WYZE.at = Date.now();
  return WYZE.token;
}
async function wyzeApi(pathName, extra = {}) {
  const token = await wyzeLogin();
  const body = Object.assign({
    access_token: token, app_name: "com.hualai.WyzeCam", app_ver: "wyze_ios_2.21.35",
    app_version: "2.21.35", phone_id: WYZE_PHONE_ID, phone_system_type: 1,
    sc: "9f275790cab94a72bd206c8876429f3c", sv: "9d74946e652647e9b6c9d59326aef104",
    ts: Date.now(),
  }, extra);
  const r = await httpPost("https://api.wyzecam.com" + pathName, JSON.stringify(body),
    { "Content-Type": "application/json", "User-Agent": "wyze_ios_2.21.35" }, 12000);
  const o = JSON.parse(r);
  if (o.code !== undefined && String(o.code) !== "1") {
    if (String(o.code) === "2001" || o.msg === "AccessTokenError") { WYZE.token = null; }
    throw new Error(o.msg || ("Wyze code " + o.code));
  }
  return o;
}
async function wyzeList() {
  const o = await wyzeApi("/app/v2/home_page/get_object_list");
  return (o.data && o.data.device_list) || [];
}
async function wyzeProbe(dev) {
  try {
    const list = await wyzeList();
    const d = list.find(x => x.mac === dev.devId) || null;
    if (!d) return { online: false, err: "device not in Wyze account" };
    const p = d.device_params || {};
    return { online: p.p2p_status === 1 || d.conn_state === 1, state: {
      on: p.power_switch !== undefined ? p.power_switch === 1 : (p.switch_state === 1),
      model: d.product_model, name: d.nickname, rssi: p.rssi,
      battery: p.electricity, temp: p.temperature, humidity: p.humidity,
      lastSeen: d.conn_state_ts || null, kind: d.product_type,
    } };
  } catch (e) { return { online: false, err: e.message }; }
}
async function wyzeCommand(dev, cmd) {
  if (cmd.action !== "set") return { ok: false, error: "unsupported command" };
  try {
    await wyzeApi("/app/v2/auto/run_action", {
      action_key: cmd.on ? "power_on" : "power_off",
      action_params: {}, custom_string: "",
      instance_id: dev.devId, provider_key: dev.model || "",
    });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { WYZE, wyzeApi, wyzeCommand, wyzeList, wyzeLogin, wyzeProbe, wyzeTriMd5 };
