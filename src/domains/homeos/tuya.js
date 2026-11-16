const crypto = require("crypto");
const dgram = require("dgram");

const { crc32 } = require("../../zip");

// ── Tuya / Gosund: local TCP 6668, AES-128-ECB with the per-device local key ──
// Gosund is a Tuya OEM, so this covers Gosund, Teckin, Treatlife and most other
// white-label plugs. The local key comes from the Tuya IoT console — see .env.
const TUYA_PREFIX = 0x000055aa, TUYA_SUFFIX = 0x0000aa55;
const TUYA_CMD = { CONTROL: 7, STATUS: 8, DP_QUERY: 10 };
function tuyaFrame(cmd, payload, seq) {
  const len = Buffer.alloc(4); len.writeUInt32BE(payload.length + 8, 0);
  const head = Buffer.alloc(12);
  head.writeUInt32BE(TUYA_PREFIX, 0); head.writeUInt32BE(seq >>> 0, 4); head.writeUInt32BE(cmd, 8);
  const body = Buffer.concat([head, len, payload]);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(body), 0);
  const suf = Buffer.alloc(4); suf.writeUInt32BE(TUYA_SUFFIX, 0);
  return Buffer.concat([body, crcBuf, suf]);
}
function tuyaEncode(cmd, data, key, seq) {
  const json = Buffer.from(JSON.stringify(data), "utf8");
  const c = crypto.createCipheriv("aes-128-ecb", Buffer.from(key, "utf8"), null);
  c.setAutoPadding(true);
  const enc = Buffer.concat([c.update(json), c.final()]);
  // 3.3 prepends a 15-byte version header to everything except DP_QUERY
  const payload = cmd === TUYA_CMD.DP_QUERY ? enc
    : Buffer.concat([Buffer.from("3.3", "utf8"), Buffer.alloc(12), enc]);
  return tuyaFrame(cmd, payload, seq);
}
function tuyaDecode(buf, key) {
  const out = [];
  let off = 0;
  while (off + 20 <= buf.length) {
    if (buf.readUInt32BE(off) !== TUYA_PREFIX) { off++; continue; }
    const len = buf.readUInt32BE(off + 12);
    const end = off + 16 + len;
    if (end > buf.length) break;
    const rc = buf.readUInt32BE(off + 16);                 // return code
    let payload = buf.slice(off + 20, end - 8);
    off = end;
    if (!payload.length) { out.push({ rc, data: null }); continue; }
    if (payload.slice(0, 3).toString() === "3.3") payload = payload.slice(15);
    try {
      const d = crypto.createDecipheriv("aes-128-ecb", Buffer.from(key, "utf8"), null);
      d.setAutoPadding(true);
      const txt = Buffer.concat([d.update(payload), d.final()]).toString("utf8");
      out.push({ rc, data: JSON.parse(txt) });
    } catch {
      try { out.push({ rc, data: JSON.parse(payload.toString("utf8")) }); } catch { out.push({ rc, data: null }); }
    }
  }
  return out;
}
function tuyaSend(host, frame, key, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const net = require("net");
    const sock = new net.Socket();
    let chunks = [], done = false;
    const finish = (err, v) => { if (done) return; done = true; try { sock.destroy(); } catch {} err ? reject(err) : resolve(v); };
    sock.setTimeout(timeoutMs);
    sock.on("timeout", () => finish(new Error("tuya timeout")));
    sock.on("error", e => finish(e));
    sock.on("data", d => {
      chunks.push(d);
      const msgs = tuyaDecode(Buffer.concat(chunks), key);
      const withData = msgs.filter(m => m.data);
      if (withData.length) finish(null, withData[withData.length - 1].data);
    });
    sock.connect(6668, host, () => sock.write(frame));
  });
}
// Gosund plugs report power on dp 19 (0.1 W), current dp 18 (mA), voltage dp 20 (0.1 V)
function tuyaMapDps(dps) {
  const s = { dps };
  if (dps["1"] !== undefined) s.on = !!dps["1"];
  if (dps["19"] !== undefined) s.w = Number(dps["19"]) / 10;
  if (dps["18"] !== undefined) s.a = Number(dps["18"]) / 1000;
  if (dps["20"] !== undefined) s.v = Number(dps["20"]) / 10;
  if (dps["17"] !== undefined) s.kwh = Number(dps["17"]) / 100;
  return s;
}
async function tuyaProbe(dev) {
  if (!dev.devId || !dev.localKey) return { online: false, err: "missing devId / localKey" };
  try {
    const frame = tuyaEncode(TUYA_CMD.DP_QUERY, { gwId: dev.devId, devId: dev.devId }, dev.localKey, 1);
    const r = await tuyaSend(dev.host, frame, dev.localKey);
    const dps = (r && (r.dps || (r.data && r.data.dps))) || null;
    if (!dps) return { online: false, err: "no dps" };
    return { online: true, state: tuyaMapDps(dps) };
  } catch (e) { return { online: false, err: e.message }; }
}
async function tuyaCommand(dev, cmd) {
  if (cmd.action !== "set" && cmd.action !== "dps") return { ok: false, error: "unsupported command" };
  const dps = cmd.action === "dps" ? cmd.dps : { [String(dev.dp || 1)]: !!cmd.on };
  const body = { devId: dev.devId, uid: dev.devId, t: String(Math.floor(Date.now() / 1000)), dps };
  const frame = tuyaEncode(TUYA_CMD.CONTROL, body, dev.localKey, 2);
  try { await tuyaSend(dev.host, frame, dev.localKey); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
}
// Tuya devices beacon their id on UDP 6666 (plain) / 6667 (AES with a fixed key)
const TUYA_UDP_KEY = crypto.createHash("md5").update("yGAdlopoPVldABfn").digest();
function tuyaDiscover(ms = 4000) {
  return new Promise(resolve => {
    const found = new Map();
    const socks = [];
    const handle = (msg) => {
      try {
        let payload = msg.slice(20, msg.length - 8);
        let txt;
        try {
          const d = crypto.createDecipheriv("aes-128-ecb", TUYA_UDP_KEY, null);
          txt = Buffer.concat([d.update(payload), d.final()]).toString("utf8");
        } catch { txt = payload.toString("utf8"); }
        const o = JSON.parse(txt.replace(/\0+$/, ""));
        if (o.gwId || o.devId) {
          found.set(o.gwId || o.devId, { vendor: "tuya", host: o.ip, devId: o.gwId || o.devId,
            name: o.productKey || "Tuya device", version: o.version, kind: "plug" });
        }
      } catch {}
    };
    [6666, 6667].forEach(port => {
      try {
        const s = dgram.createSocket({ type: "udp4", reuseAddr: true });
        s.on("message", handle); s.on("error", () => {});
        s.bind(port); socks.push(s);
      } catch {}
    });
    setTimeout(() => { socks.forEach(s => { try { s.close(); } catch {} }); resolve([...found.values()]); }, ms);
  });
}

module.exports = { TUYA_CMD, TUYA_PREFIX, TUYA_SUFFIX, TUYA_UDP_KEY, tuyaCommand, tuyaDecode, tuyaDiscover, tuyaEncode, tuyaFrame, tuyaMapDps, tuyaProbe, tuyaSend };
