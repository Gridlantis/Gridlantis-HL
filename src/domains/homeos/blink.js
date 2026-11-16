const crypto = require("crypto");
const https = require("https");

const { BLINK_EMAIL, BLINK_PASSWORD, BLINK_UUID } = require("../../config");
const { httpGet, httpPost } = require("../../net");

// ── Blink: cloud, email/password + 2FA PIN once per client id ────────────────
const BLINK = { token: null, account: null, client: null, tier: "prod", at: 0 };
async function blinkLogin() {
  if (!BLINK_EMAIL || !BLINK_PASSWORD) throw new Error("Blink credentials not set in .env");
  if (BLINK.token && Date.now() - BLINK.at < 6 * 60 * 60 * 1000) return BLINK;
  const uid = BLINK_UUID || crypto.randomUUID();
  const r = await httpPost("https://rest-prod.immedia-semi.com/api/v5/account/login",
    JSON.stringify({ email: BLINK_EMAIL, password: BLINK_PASSWORD, unique_id: uid,
      device_identifier: "Open HL", client_name: "Open HL", reauth: true }),
    { "Content-Type": "application/json", "User-Agent": "Blink/8280 CFNetwork" }, 12000);
  const o = JSON.parse(r);
  if (!o.auth || !o.auth.token) throw new Error(o.message || "Blink login failed");
  BLINK.token = o.auth.token;
  BLINK.account = o.account && o.account.account_id;
  BLINK.client = o.account && o.account.client_id;
  BLINK.tier = (o.account && o.account.tier) || "prod";
  BLINK.at = Date.now();
  if (o.account && o.account.client_verification_required) BLINK.needs2fa = true; else BLINK.needs2fa = false;
  return BLINK;
}
async function blinkVerify(pin) {
  await blinkLogin();
  const url = `https://rest-${BLINK.tier}.immedia-semi.com/api/v4/account/${BLINK.account}/client/${BLINK.client}/pin/verify`;
  const r = await httpPost(url, JSON.stringify({ pin: String(pin) }),
    { "Content-Type": "application/json", "TOKEN-AUTH": BLINK.token }, 12000);
  const o = JSON.parse(r);
  if (o.valid) BLINK.needs2fa = false;
  return o;
}
async function blinkHomescreen() {
  await blinkLogin();
  const url = `https://rest-${BLINK.tier}.immedia-semi.com/api/v3/accounts/${BLINK.account}/homescreen`;
  return JSON.parse(await httpGet(url, 12000, { "TOKEN-AUTH": BLINK.token }));
}
async function blinkProbe(dev) {
  try {
    const hs = await blinkHomescreen();
    const cams = [].concat(hs.cameras || [], hs.owls || [], hs.doorbells || []);
    const c = cams.find(x => String(x.id) === String(dev.devId));
    if (!c) return { online: false, err: "camera not found in Blink account" };
    const net = (hs.networks || []).find(n => n.id === c.network_id);
    return { online: c.status === "done" || c.status === "online", state: {
      name: c.name, armed: net ? !!net.armed : null, enabled: !!c.enabled,
      battery: c.battery, signal: c.signals && c.signals.wifi,
      temp: c.signals && c.signals.temp, thumb: c.thumbnail, networkId: c.network_id,
    } };
  } catch (e) { return { online: false, err: e.message }; }
}
// Blink serves thumbnails from a media host that requires the auth token, so
// the image is fetched server-side and streamed to the browser. That keeps the
// account token out of the page entirely.
async function blinkThumbUrl(dev) {
  const hs = await blinkHomescreen();
  const cams = [].concat(hs.cameras || [], hs.owls || [], hs.doorbells || []);
  const c = cams.find(x => String(x.id) === String(dev.devId));
  if (!c || !c.thumbnail) return null;
  let t = c.thumbnail;
  if (!/^https?:/i.test(t)) t = `https://rest-${BLINK.tier}.immedia-semi.com${t}`;
  if (!/\.(jpg|jpeg|png)$/i.test(t)) t += ".jpg";
  return t;
}
function blinkFetchImage(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: "GET",
      headers: { "TOKEN-AUTH": BLINK.token, "User-Agent": "Blink/8280 CFNetwork" }, timeout: 15000 },
      resp => {
        if (resp.statusCode >= 400) { resp.resume(); return reject(new Error("blink image " + resp.statusCode)); }
        const chunks = [];
        resp.on("data", c => chunks.push(c));
        resp.on("end", () => resolve({ buf: Buffer.concat(chunks), type: resp.headers["content-type"] || "image/jpeg" }));
      });
    r.on("timeout", () => { r.destroy(); reject(new Error("blink image timeout")); });
    r.on("error", reject);
    r.end();
  });
}
async function blinkCommand(dev, cmd) {
  try {
    await blinkLogin();
    const base = `https://rest-${BLINK.tier}.immedia-semi.com/api/v1/accounts/${BLINK.account}/networks/${dev.networkId}`;
    if (cmd.action === "arm" || cmd.action === "disarm") {
      await httpPost(`${base}/state/${cmd.action}`, "{}", { "Content-Type": "application/json", "TOKEN-AUTH": BLINK.token }, 12000);
      return { ok: true };
    }
    if (cmd.action === "snap") {
      await httpPost(`${base}/cameras/${dev.devId}/thumbnail`, "{}", { "Content-Type": "application/json", "TOKEN-AUTH": BLINK.token }, 20000);
      return { ok: true };
    }
    if (cmd.action === "motionOn" || cmd.action === "motionOff") {
      const verb = cmd.action === "motionOn" ? "enable" : "disable";
      await httpPost(`${base}/camera/${dev.devId}/${verb}`, "{}", { "Content-Type": "application/json", "TOKEN-AUTH": BLINK.token }, 12000);
      return { ok: true };
    }
    return { ok: false, error: "unsupported command" };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { BLINK, blinkCommand, blinkFetchImage, blinkHomescreen, blinkLogin, blinkProbe, blinkThumbUrl, blinkVerify };
