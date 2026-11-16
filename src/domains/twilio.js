const https = require("https");

// ═══ TWILIO — the account behind Voicemail and Texts ═══════════════════════════
// Read-only use of the REST API: both features poll it rather than taking
// webhooks, so Open HL works without being reachable from the internet.
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN || "";
const NUMBER      = process.env.TWILIO_NUMBER || "";   // only keep what reached this number; blank = any
const POLL_MS     = 60 * 1000;

const configured = () => !!(ACCOUNT_SID && AUTH_TOKEN);

function twilioGet(url, hops = 3) {
  return new Promise((resolve, reject) => {
    const u = new URL(url, "https://api.twilio.com");
    // No User-Agent: Twilio's edge answers 403 to "OpenHL/1.0". The media URL
    // may redirect to storage on another host; the account credentials only
    // ever go to Twilio's API itself.
    const headers = {};
    if (u.hostname === "api.twilio.com") headers.Authorization = "Basic " + Buffer.from(ACCOUNT_SID + ":" + AUTH_TOKEN).toString("base64");
    const req = https.get(u, { headers }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops > 0) {
        res.resume();
        return twilioGet(new URL(res.headers.location, u).href, hops - 1).then(resolve, reject);
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        if (res.statusCode >= 400) {
          let detail = "";
          try { detail = JSON.parse(body).message || ""; } catch {}
          return reject(new Error("Twilio HTTP " + res.statusCode + (detail ? ": " + detail : "")));
        }
        resolve(body);
      });
      res.on("error", reject);
    });
    req.setTimeout(20000, () => req.destroy(new Error("Twilio timeout")));
    req.on("error", reject);
  });
}
const api = p => "/2010-04-01/Accounts/" + ACCOUNT_SID + p;

module.exports = { NUMBER, POLL_MS, api, configured, twilioGet };
