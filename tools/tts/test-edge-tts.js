#!/usr/bin/env node
/**
 * test-edge-tts.js — verify Microsoft's Edge TTS endpoint works from YOUR box.
 *
 *   node tools/tts/test-edge-tts.js
 *   node tools/tts/test-edge-tts.js "custom text" en-GB-RyanNeural
 *
 * I could not test this from my sandbox (egress firewall blocks
 * speech.platform.bing.com), so run this BEFORE trusting the Gridlantis-HL integration.
 * Writes out.mp3 and tries to play it.
 *
 * Zero dependencies. Node 18+.
 */
const tls = require("tls");
const crypto = require("crypto");
const fs = require("fs");
const { spawn, execSync } = require("child_process");

const TEXT  = process.argv[2] || "Gridlantis-HL online. Edge text to speech is working.";
const VOICE = process.argv[3] || "en-GB-SoniaNeural";

const TOKEN  = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const HOST   = "speech.platform.bing.com";
const PATHQ  = "/consumer/speech/synthesize/readaloud/edge/v1";
const ORIGIN = "chrome-extension://jdiccldimpahaajaamnpidpdpmfoconhb";
const UA     = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";
const SECVER = "1-130.0.2849.68";

function secToken() {
  let s = Math.floor(Date.now() / 1000) + 11644473600;
  s = s - (s % 300);
  return crypto.createHash("sha256").update((BigInt(s) * 10000000n).toString() + TOKEN).digest("hex").toUpperCase();
}
function frame(payload, opcode) {
  const d = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, "utf8");
  const n = d.length;
  let h = n < 126 ? Buffer.alloc(6) : n < 65536 ? Buffer.alloc(8) : Buffer.alloc(14);
  h[0] = 0x80 | opcode;
  const m = crypto.randomBytes(4);
  if (n < 126) { h[1] = 0x80 | n; m.copy(h, 2); }
  else if (n < 65536) { h[1] = 0x80 | 126; h.writeUInt16BE(n, 2); m.copy(h, 4); }
  else { h[1] = 0x80 | 127; h.writeBigUInt64BE(BigInt(n), 2); m.copy(h, 10); }
  const x = Buffer.allocUnsafe(n);
  for (let i = 0; i < n; i++) x[i] = d[i] ^ m[i % 4];
  return Buffer.concat([h, x]);
}
function parse(buf) {
  const out = []; let o = 0;
  while (o + 2 <= buf.length) {
    const b0 = buf[o], b1 = buf[o + 1];
    const op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f, p = o + 2;
    if (len === 126) { if (p + 2 > buf.length) break; len = buf.readUInt16BE(p); p += 2; }
    else if (len === 127) { if (p + 8 > buf.length) break; len = Number(buf.readBigUInt64BE(p)); p += 8; }
    let mk = null;
    if (masked) { if (p + 4 > buf.length) break; mk = buf.slice(p, p + 4); p += 4; }
    if (p + len > buf.length) break;
    let pl = buf.slice(p, p + len);
    if (mk) { const c = Buffer.from(pl); for (let i = 0; i < c.length; i++) c[i] ^= mk[i % 4]; pl = c; }
    out.push({ op, pl });
    o = p + len;
  }
  return { frames: out, rest: buf.slice(o) };
}
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");

console.log("Voice : " + VOICE);
console.log("Text  : " + TEXT);
console.log("Token : Sec-MS-GEC " + secToken().slice(0, 16) + "...");
console.log("Connecting to " + HOST + " ...\n");

const q = "?TrustedClientToken=" + TOKEN + "&Sec-MS-GEC=" + secToken()
  + "&Sec-MS-GEC-Version=" + SECVER + "&ConnectionId=" + crypto.randomUUID().replace(/-/g, "");

const sock = tls.connect({ host: HOST, port: 443, servername: HOST, ALPNProtocols: ["http/1.1"] }, () => {
  sock.write([
    "GET " + PATHQ + q + " HTTP/1.1", "Host: " + HOST,
    "Upgrade: websocket", "Connection: Upgrade",
    "Sec-WebSocket-Key: " + crypto.randomBytes(16).toString("base64"),
    "Sec-WebSocket-Version: 13",
    "Origin: " + ORIGIN, "User-Agent: " + UA,
    "Pragma: no-cache", "Cache-Control: no-cache",
    "Accept-Encoding: gzip, deflate, br",
    "Accept-Language: en-US,en;q=0.9",
  ].join("\r\n") + "\r\n\r\n");
});

let buf = Buffer.alloc(0), up = false;
const chunks = [];
sock.setTimeout(25000, () => { console.error("✗ Timeout"); process.exit(1); });
sock.on("error", e => { console.error("✗ Socket error: " + e.message); process.exit(1); });

sock.on("data", c => {
  buf = Buffer.concat([buf, c]);
  if (!up) {
    const i = buf.indexOf("\r\n\r\n");
    if (i < 0) return;
    const head = buf.slice(0, i).toString("latin1");
    const status = head.split("\r\n")[0];
    if (!/^HTTP\/1\.1 101/i.test(head)) {
      console.error("✗ Handshake FAILED: " + status);
      console.error("\nIf this is 403, Microsoft has likely rotated the DRM scheme again.");
      console.error("Gridlantis-HL will fall back to espeak/spd-say automatically.");
      process.exit(1);
    }
    console.log("✓ Handshake OK: " + status);
    buf = buf.slice(i + 4);
    up = true;

    const ts = new Date().toUTCString();
    sock.write(frame("X-Timestamp:" + ts + "\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n"
      + JSON.stringify({ context: { synthesis: { audio: {
          metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
          outputFormat: "audio-24khz-48kbitrate-mono-mp3" } } } }), 0x1));
    sock.write(frame("X-RequestId:" + crypto.randomUUID().replace(/-/g, "")
      + "\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:" + ts + "Z\r\nPath:ssml\r\n\r\n"
      + "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='"
      + VOICE + "'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>" + esc(TEXT)
      + "</prosody></voice></speak>", 0x1));
  }

  const r = parse(buf); buf = r.rest;
  for (const f of r.frames) {
    if (f.op === 0x1) {
      const s = f.pl.toString("utf8");
      if (/Path:turn\.end/i.test(s)) {
        const mp3 = Buffer.concat(chunks);
        if (!mp3.length) { console.error("✗ No audio returned"); process.exit(1); }
        fs.writeFileSync("out.mp3", mp3);
        console.log("✓ Received " + chunks.length + " audio frames, " + (mp3.length / 1024).toFixed(1) + " KB");
        console.log("✓ Wrote out.mp3\n");

        let player = null;
        for (const c of ["mpg123", "ffplay", "mpv", "cvlc"]) {
          try { execSync("command -v " + c, { stdio: "ignore" }); player = c; break; } catch {}
        }
        if (!player) {
          console.log("⚠ No mp3 player found. Gridlantis-HL needs one for SERVER-side speech:");
          console.log("    sudo apt install mpg123");
          console.log("  (Browser-side speech works without it.)");
          process.exit(0);
        }
        console.log("Playing with " + player + " ...");
        const args = player === "mpg123" ? ["-q", "out.mp3"]
          : player === "ffplay" ? ["-nodisp", "-autoexit", "-loglevel", "quiet", "out.mp3"]
          : player === "mpv" ? ["--really-quiet", "--no-video", "out.mp3"]
          : ["--play-and-exit", "--intf", "dummy", "out.mp3"];
        const p = spawn(player, args, { stdio: "inherit" });
        p.on("exit", () => { console.log("\n✓ Edge TTS works. Safe to use in Gridlantis-HL."); process.exit(0); });
        return;
      }
    } else if (f.op === 0x2 && f.pl.length > 2) {
      const hl = f.pl.readUInt16BE(0);
      if (/Path:audio/i.test(f.pl.slice(2, 2 + hl).toString("utf8"))) chunks.push(f.pl.slice(2 + hl));
    } else if (f.op === 0x8) {
      console.error("✗ Server closed the connection");
      process.exit(1);
    }
  }
});
