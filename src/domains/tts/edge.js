const crypto = require("crypto");
const tls = require("tls");

// ═══ TTS:BEGIN ═══
// ═══ EDGE TTS ═════════════════════════════════════════════════════════════════
// Microsoft's Edge "read aloud" neural voices. Free, no key, very good quality.
//
// CAVEATS, up front:
//  · This is an UNDOCUMENTED endpoint. Microsoft has broken it before (they added
//    the Sec-MS-GEC DRM token in 2024, which killed every client overnight). If
//    TTS suddenly 403s, that is almost certainly what happened — Metis falls back
//    to espeak/spd-say automatically rather than going silent.
//  · It is a WebSocket protocol, not REST. We hand-roll a minimal WS client over
//    tls rather than using Node's global WebSocket, because the WHATWG API cannot
//    set an Origin header and the endpoint checks it.
//
// Protocol: connect -> send speech.config -> send SSML -> receive binary frames
// with a "Path:audio" header -> concatenate the mp3 payloads -> "Path:turn.end".

const EDGE_TOKEN   = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_HOST    = "speech.platform.bing.com";
const EDGE_PATH    = "/consumer/speech/synthesize/readaloud/edge/v1";
const EDGE_ORIGIN  = "chrome-extension://jdiccldimpahaajaamnpidpdpmfoconhb";
const EDGE_UA      = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   + "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";
const EDGE_SECVER  = "1-130.0.2849.68";
const EDGE_FORMAT  = "audio-24khz-48kbitrate-mono-mp3";

// Sec-MS-GEC: SHA256(windowsFileTime_rounded_to_5min + trustedClientToken), uppercase hex.
function edgeSecToken() {
  const WIN_EPOCH = 11644473600;                       // 1601-01-01 -> 1970-01-01, seconds
  let secs = Math.floor(Date.now() / 1000) + WIN_EPOCH;
  secs = secs - (secs % 300);                          // round down to 5 minutes
  const ticks = BigInt(secs) * 10000000n;              // 100-nanosecond units
  return crypto.createHash("sha256")
    .update(ticks.toString() + EDGE_TOKEN)
    .digest("hex").toUpperCase();
}

// ── Minimal RFC6455 client. Text + binary frames, client-masked, no extensions. ─
function wsConnect(host, pathAndQuery, headers = {}) {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString("base64");
    // ALPN matters: tls.connect() offers none by default, and Azure's front-end
    // will RESET the connection rather than defaulting to HTTP/1.1. That is the
    // ECONNRESET, not a rejected token.
    const sock = tls.connect({
      host, port: 443, servername: host,
      ALPNProtocols: ["http/1.1"],
    }, () => {
      const lines = [
        "GET " + pathAndQuery + " HTTP/1.1",
        "Host: " + host,
        "Upgrade: websocket",
        "Connection: Upgrade",
        "Sec-WebSocket-Key: " + key,
        "Sec-WebSocket-Version: 13",
      ];
      for (const [k, v] of Object.entries(headers)) lines.push(k + ": " + v);
      sock.write(lines.join("\r\n") + "\r\n\r\n");
    });

    let buf = Buffer.alloc(0);
    let upgraded = false;

    const onData = chunk => {
      buf = Buffer.concat([buf, chunk]);
      if (!upgraded) {
        const end = buf.indexOf("\r\n\r\n");
        if (end < 0) return;
        const head = buf.slice(0, end).toString("latin1");
        if (!/^HTTP\/1\.1 101/i.test(head)) {
          sock.destroy();
          return reject(new Error("Edge TTS handshake failed: " + head.split("\r\n")[0]));
        }
        buf = buf.slice(end + 4);
        upgraded = true;
        sock.removeListener("data", onData);
        resolve({ sock, rest: buf });
      }
    };
    sock.on("data", onData);
    sock.on("error", reject);
    sock.setTimeout(20000, () => { sock.destroy(); reject(new Error("Edge TTS timeout")); });
  });
}

function wsFrame(payload, opcode) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, "utf8");
  const len = data.length;
  let header;
  if (len < 126)          header = Buffer.alloc(6);
  else if (len < 65536)   header = Buffer.alloc(8);
  else                    header = Buffer.alloc(14);
  header[0] = 0x80 | opcode;                          // FIN + opcode
  const mask = crypto.randomBytes(4);
  if (len < 126) { header[1] = 0x80 | len; mask.copy(header, 2); }
  else if (len < 65536) { header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); mask.copy(header, 4); }
  else { header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(len), 2); mask.copy(header, 10); }
  const masked = Buffer.allocUnsafe(len);
  for (let i = 0; i < len; i++) masked[i] = data[i] ^ mask[i % 4];
  return Buffer.concat([header, masked]);
}

// Pulls whole frames out of a rolling buffer. Server->client frames are unmasked.
function wsParse(buf) {
  const out = [];
  let off = 0;
  while (off + 2 <= buf.length) {
    const b0 = buf[off], b1 = buf[off + 1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let p = off + 2;
    if (len === 126) { if (p + 2 > buf.length) break; len = buf.readUInt16BE(p); p += 2; }
    else if (len === 127) { if (p + 8 > buf.length) break; len = Number(buf.readBigUInt64BE(p)); p += 8; }
    let mask = null;
    if (masked) { if (p + 4 > buf.length) break; mask = buf.slice(p, p + 4); p += 4; }
    if (p + len > buf.length) break;
    let payload = buf.slice(p, p + len);
    if (mask) { const c = Buffer.from(payload); for (let i = 0; i < c.length; i++) c[i] ^= mask[i % 4]; payload = c; }
    out.push({ opcode, payload });
    off = p + len;
  }
  return { frames: out, rest: buf.slice(off) };
}

function ssmlEscape(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// text -> mp3 Buffer
async function edgeTTS(text, opts = {}) {
  const voice = opts.voice || "en-GB-SoniaNeural";
  const rate  = opts.rate  || "+0%";
  const pitch = opts.pitch || "+0Hz";
  const vol   = opts.volume || "+0%";

  const q = "?TrustedClientToken=" + EDGE_TOKEN
    + "&Sec-MS-GEC=" + edgeSecToken()
    + "&Sec-MS-GEC-Version=" + EDGE_SECVER
    + "&ConnectionId=" + crypto.randomUUID().replace(/-/g, "");

  const { sock, rest } = await wsConnect(EDGE_HOST, EDGE_PATH + q, {
    "Origin": EDGE_ORIGIN,
    "User-Agent": EDGE_UA,
    "Pragma": "no-cache",
    "Cache-Control": "no-cache",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en-US,en;q=0.9",
  });

  return new Promise((resolve, reject) => {
    const chunks = [];
    let buf = rest;
    let done = false;

    const finish = (err, val) => {
      if (done) return;
      done = true;
      try { sock.write(wsFrame(Buffer.alloc(0), 0x8)); } catch {}
      sock.destroy();
      err ? reject(err) : resolve(val);
    };

    const timer = setTimeout(() => finish(new Error("Edge TTS synthesis timeout")), 30000);

    sock.on("data", chunk => {
      buf = Buffer.concat([buf, chunk]);
      const { frames, rest: r } = wsParse(buf);
      buf = r;
      for (const f of frames) {
        if (f.opcode === 0x8) { clearTimeout(timer); return finish(new Error("Edge TTS closed the socket")); }
        if (f.opcode === 0x1) {                       // text frame: status messages
          const s = f.payload.toString("utf8");
          if (/Path:turn\.end/i.test(s)) {
            clearTimeout(timer);
            if (!chunks.length) return finish(new Error("Edge TTS returned no audio"));
            return finish(null, Buffer.concat(chunks));
          }
        } else if (f.opcode === 0x2) {                // binary frame: 2-byte BE header len, header, audio
          if (f.payload.length < 2) continue;
          const hlen = f.payload.readUInt16BE(0);
          const head = f.payload.slice(2, 2 + hlen).toString("utf8");
          if (/Path:audio/i.test(head)) chunks.push(f.payload.slice(2 + hlen));
        }
      }
    });
    sock.on("error", e => { clearTimeout(timer); finish(e); });

    const ts = new Date().toUTCString();
    const config = "X-Timestamp:" + ts + "\r\n"
      + "Content-Type:application/json; charset=utf-8\r\n"
      + "Path:speech.config\r\n\r\n"
      + JSON.stringify({ context: { synthesis: { audio: {
          metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
          outputFormat: EDGE_FORMAT } } } });
    sock.write(wsFrame(config, 0x1));

    const ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>"
      + "<voice name='" + voice + "'>"
      + "<prosody pitch='" + pitch + "' rate='" + rate + "' volume='" + vol + "'>"
      + ssmlEscape(text)
      + "</prosody></voice></speak>";
    const msg = "X-RequestId:" + crypto.randomUUID().replace(/-/g, "") + "\r\n"
      + "Content-Type:application/ssml+xml\r\n"
      + "X-Timestamp:" + ts + "Z\r\n"
      + "Path:ssml\r\n\r\n" + ssml;
    sock.write(wsFrame(msg, 0x1));
  });
}

// ── PIPER: local neural TTS ───────────────────────────────────────────────────
// Runs entirely on this machine. No endpoint to be locked out of, no DRM token,
// no network. Slightly behind Edge on naturalness, but it cannot be taken away.

module.exports = { EDGE_FORMAT, EDGE_HOST, EDGE_ORIGIN, EDGE_PATH, EDGE_SECVER, EDGE_TOKEN, EDGE_UA, edgeSecToken, edgeTTS, ssmlEscape, wsConnect, wsFrame, wsParse };
