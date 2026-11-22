#!/usr/bin/env node
/**
 * diag-edge-tts.js — isolate WHY the Edge TTS connection resets.
 *
 *   node tools/tts/diag-edge-tts.js
 *
 * Runs an escalating matrix and reports exactly which layer fails:
 *   1. DNS          — does the host resolve?
 *   2. Plain HTTPS  — is the host reachable at all (voices list is a normal GET)?
 *   3. Raw TLS+WS, no ALPN            <- what Gridlantis-HL does today (the ECONNRESET)
 *   4. Raw TLS+WS, ALPN http/1.1      <- prime suspect
 *   5. Raw TLS+WS, ALPN + full Edge headers
 *   6. Node's built-in WebSocket      <- sets its own ALPN/headers
 *
 * Zero deps.
 */
const tls = require("tls");
const https = require("https");
const dns = require("dns");
const crypto = require("crypto");

const TOKEN  = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const HOST   = "speech.platform.bing.com";
const WSPATH = "/consumer/speech/synthesize/readaloud/edge/v1";
const ORIGIN = "chrome-extension://jdiccldimpahaajaamnpidpdpmfoconhb";
const UA     = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";
const SECVER = "1-130.0.2849.68";

function secToken() {
  let s = Math.floor(Date.now() / 1000) + 11644473600;
  s = s - (s % 300);
  return crypto.createHash("sha256").update((BigInt(s) * 10000000n).toString() + TOKEN).digest("hex").toUpperCase();
}
const q = () => "?TrustedClientToken=" + TOKEN + "&Sec-MS-GEC=" + secToken()
  + "&Sec-MS-GEC-Version=" + SECVER + "&ConnectionId=" + crypto.randomUUID().replace(/-/g, "");

const ok = m => console.log("  \x1b[32m✓\x1b[0m " + m);
const no = m => console.log("  \x1b[31m✗\x1b[0m " + m);
const hd = m => console.log("\n\x1b[1m" + m + "\x1b[0m");

function step1() {
  hd("1. DNS");
  return new Promise(r => {
    dns.lookup(HOST, { all: true }, (e, addrs) => {
      if (e) { no("resolve failed: " + e.message); return r(false); }
      ok(HOST + " -> " + addrs.map(a => a.address).join(", "));
      r(true);
    });
  });
}

function step2() {
  hd("2. Plain HTTPS reachability (voices list — a normal REST GET)");
  return new Promise(r => {
    const req = https.get({
      host: HOST,
      path: "/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=" + TOKEN,
      headers: { "User-Agent": UA, "Origin": ORIGIN, "Accept": "application/json" },
      timeout: 12000,
    }, res => {
      let b = "";
      res.on("data", c => b += c);
      res.on("end", () => {
        if (res.statusCode === 200) {
          let n = 0;
          try { n = JSON.parse(b).length; } catch {}
          ok("HTTP 200 — " + n + " voices listed. Host is reachable, TLS is fine.");
          try {
            const sonia = JSON.parse(b).find(v => v.ShortName === "en-GB-SoniaNeural");
            if (sonia) ok("en-GB-SoniaNeural exists (" + sonia.Locale + ", " + sonia.Gender + ")");
            else no("en-GB-SoniaNeural NOT in the catalogue — the voice name may have changed");
          } catch {}
          return r(true);
        }
        no("HTTP " + res.statusCode + " — " + b.slice(0, 120));
        r(false);
      });
    });
    req.on("timeout", () => { req.destroy(); no("timeout"); r(false); });
    req.on("error", e => { no(e.message); r(false); });
  });
}

function wsTry(label, { alpn, fullHeaders }) {
  return new Promise(r => {
    const opts = { host: HOST, port: 443, servername: HOST };
    if (alpn) opts.ALPNProtocols = ["http/1.1"];
    const sock = tls.connect(opts, () => {
      const h = [
        "GET " + WSPATH + q() + " HTTP/1.1",
        "Host: " + HOST,
        "Upgrade: websocket",
        "Connection: Upgrade",
        "Sec-WebSocket-Key: " + crypto.randomBytes(16).toString("base64"),
        "Sec-WebSocket-Version: 13",
        "Origin: " + ORIGIN,
        "User-Agent: " + UA,
      ];
      if (fullHeaders) h.push(
        "Pragma: no-cache",
        "Cache-Control: no-cache",
        "Accept-Encoding: gzip, deflate, br",
        "Accept-Language: en-US,en;q=0.9",
        "Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits"
      );
      sock.write(h.join("\r\n") + "\r\n\r\n");
    });
    let buf = "";
    const done = (good, msg) => { try { sock.destroy(); } catch {} r({ good, msg }); };
    sock.setTimeout(12000, () => done(false, "timeout"));
    sock.on("secureConnect", () => {
      if (alpn) console.log("    (ALPN negotiated: " + (sock.alpnProtocol || "none") + ")");
    });
    sock.on("data", c => {
      buf += c.toString("latin1");
      if (buf.includes("\r\n\r\n")) {
        const status = buf.split("\r\n")[0];
        done(/101/.test(status), status);
      }
    });
    sock.on("error", e => done(false, e.code || e.message));
  }).then(res => {
    res.good ? ok(label + " -> " + res.msg) : no(label + " -> " + res.msg);
    return res.good;
  });
}

async function step6() {
  hd("6. Node built-in WebSocket (undici — sets its own ALPN + headers)");
  if (typeof WebSocket === "undefined") { no("no global WebSocket (need Node 22+)"); return false; }
  return new Promise(r => {
    let settled = false;
    const fin = (good, m) => { if (settled) return; settled = true; good ? ok(m) : no(m); r(good); };
    try {
      const ws = new WebSocket("wss://" + HOST + WSPATH + q());
      const t = setTimeout(() => { try { ws.close(); } catch {} fin(false, "timeout"); }, 12000);
      ws.onopen  = () => { clearTimeout(t); try { ws.close(); } catch {} fin(true, "connected (so ALPN/headers were the problem)"); };
      ws.onerror = e => { clearTimeout(t); fin(false, "failed: " + (e.message || "connection error")); };
    } catch (e) { fin(false, e.message); }
  });
}

(async () => {
  console.log("\x1b[1mEdge TTS connection diagnostic\x1b[0m");
  console.log("Node " + process.version);

  if (!await step1()) { console.log("\n=> DNS is broken. Nothing else can work."); return; }
  const reachable = await step2();

  hd("3-5. WebSocket upgrade variants");
  const a = await wsTry("no ALPN, basic headers   ", { alpn: false, fullHeaders: false });
  const b = await wsTry("ALPN http/1.1            ", { alpn: true,  fullHeaders: false });
  const c = await wsTry("ALPN + full Edge headers ", { alpn: true,  fullHeaders: true });
  const d = await step6();

  hd("VERDICT");
  if (c || b) {
    console.log("  ALPN was the problem. " + (c ? "Use ALPN + full headers." : "ALPN alone is enough."));
    console.log("  -> Tell Claude: \"ALPN fixed it\" and it will patch server.js.");
  } else if (d) {
    console.log("  Only Node's built-in WebSocket connects. The raw TLS client needs work.");
  } else if (a) {
    console.log("  Variant A worked this time — the earlier ECONNRESET may have been transient.");
    console.log("  Re-run tools/tts/test-edge-tts.js.");
  } else if (reachable) {
    console.log("  Host is reachable over plain HTTPS but EVERY WebSocket upgrade is refused.");
    console.log("  Likely: Microsoft is blocking non-browser WS clients from your IP/region,");
    console.log("  or something on your network (Tailscale exit node? ISP? DNS filtering?)");
    console.log("  is interfering with the upgrade. Try from a different network to confirm.");
    console.log("  -> Piper (fully local, offline) is the durable answer here.");
  } else {
    console.log("  The host is not reachable at all. Network/firewall/DNS problem,");
    console.log("  not an Edge TTS problem.");
  }
  console.log("");
})();
