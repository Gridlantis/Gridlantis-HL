const fs = require("fs");
const path = require("path");

// ── ZIP HELPERS ───────────────────────────────────────────────────────────────

function collectFiles(dir, base) {
  let results = [];
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return results; }
  for (const e of entries) {
    const full = path.join(dir, e);
    const rel  = path.join(base, e);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isDirectory()) {
      results = results.concat(collectFiles(full, rel));
    } else {
      results.push({ full, rel });
    }
  }
  return results;
}

function buildZip(files) {
  // Minimal ZIP builder (no compression — stored method)
  const localHeaders = [];
  const centralDir   = [];
  let offset = 0;

  for (const { full, rel } of files) {
    let data;
    try { data = fs.readFileSync(full); } catch { data = Buffer.alloc(0); }
    const nameBytes = Buffer.from(rel.replace(/\\/g, '/'), 'utf8');
    const crc  = crc32(data);
    const size = data.length;
    const local = Buffer.concat([
      Buffer.from([0x50,0x4b,0x03,0x04]),   // sig
      Buffer.from([0x14,0x00]),              // version
      Buffer.from([0x00,0x00]),              // flags
      Buffer.from([0x00,0x00]),              // compression (stored)
      Buffer.from([0x00,0x00,0x00,0x00]),   // mod time/date
      uint32LE(crc), uint32LE(size), uint32LE(size),
      uint16LE(nameBytes.length),
      Buffer.from([0x00,0x00]),              // extra len
      nameBytes, data
    ]);
    localHeaders.push({ local, nameBytes, crc, size, offset });
    offset += local.length;
  }

  const cdStart = offset;
  for (const { nameBytes, crc, size, offset: lhOffset } of localHeaders) {
    centralDir.push(Buffer.concat([
      Buffer.from([0x50,0x4b,0x01,0x02]),   // sig
      Buffer.from([0x14,0x00,0x14,0x00]),   // version made/needed
      Buffer.from([0x00,0x00,0x00,0x00]),   // flags, compression
      Buffer.from([0x00,0x00,0x00,0x00]),   // time/date
      uint32LE(crc), uint32LE(size), uint32LE(size),
      uint16LE(nameBytes.length),
      Buffer.from([0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]),
      uint32LE(lhOffset),
      nameBytes
    ]));
  }

  const cdBuf   = Buffer.concat(centralDir);
  const eocd    = Buffer.concat([
    Buffer.from([0x50,0x4b,0x05,0x06,0x00,0x00,0x00,0x00]),
    uint16LE(localHeaders.length), uint16LE(localHeaders.length),
    uint32LE(cdBuf.length), uint32LE(cdStart),
    Buffer.from([0x00,0x00])
  ]);
  return Buffer.concat([...localHeaders.map(h => h.local), cdBuf, eocd]);
}

function uint16LE(n) { const b=Buffer.alloc(2); b.writeUInt16LE(n,0); return b; }
function uint32LE(n) { const b=Buffer.alloc(4); b.writeUInt32LE(n>>>0,0); return b; }

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  if (!crc32.table) {
    crc32.table = new Uint32Array(256);
    for (let i=0;i<256;i++) {
      let c=i;
      for (let j=0;j<8;j++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);
      crc32.table[i]=c;
    }
  }
  for (let i=0;i<buf.length;i++) crc=crc32.table[(crc^buf[i])&0xFF]^(crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}

// ═══ HOMEOS — smart-home control plane ════════════════════════════════════════
// One registry file, one poll loop, one adapter per vendor. Local protocols are
// spoken directly (no cloud round-trip, no npm); cloud-only vendors get a thin
// signed client. Every adapter exposes the same shape:
//
//   probe(dev)          -> { online, state:{}, err? }
//   command(dev, cmd)   -> { ok, ... }
//
// so the page and the poller never need to know what brand a device is.

module.exports = { buildZip, collectFiles, crc32, uint16LE, uint32LE };
