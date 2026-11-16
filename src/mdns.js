const dgram = require("dgram");

// ── mDNS ─────────────────────────────────────────────────────────────────────
function advertiseMdns(port) {
  const MDNS_ADDR = '224.0.0.251';
  const MDNS_PORT = 5353;
  const hostname = 'openhl';
  const svcName = `${hostname}._http._tcp.local`;
  function encodeName(name) {
    const parts = name.split('.');
    const bufs = [];
    for (const p of parts) {
      const b = Buffer.from(p, 'utf8');
      bufs.push(Buffer.from([b.length]), b);
    }
    bufs.push(Buffer.from([0]));
    return Buffer.concat(bufs);
  }
  function buildPtrRecord() {
    const txnId     = Buffer.from([0x00, 0x00]);
    const flags     = Buffer.from([0x84, 0x00]);
    const qdCount   = Buffer.from([0x00, 0x00]);
    const anCount   = Buffer.from([0x00, 0x01]);
    const nsCount   = Buffer.from([0x00, 0x00]);
    const arCount   = Buffer.from([0x00, 0x00]);
    const nameBuf   = encodeName('_http._tcp.local');
    const type      = Buffer.from([0x00, 0x0c]);
    const cls       = Buffer.from([0x00, 0x01]);
    const ttl       = Buffer.from([0x00, 0x00, 0x11, 0x94]);
    const rdata     = encodeName(svcName);
    const rdLength  = Buffer.from([0x00, rdata.length]);
    return Buffer.concat([txnId, flags, qdCount, anCount, nsCount, arCount,
      nameBuf, type, cls, ttl, rdLength, rdata]);
  }
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.bind(MDNS_PORT, () => {
    try { sock.addMembership(MDNS_ADDR); } catch(e) {}
    sock.setMulticastTTL(255);
    sock.setMulticastLoopback(true);
    const pkt = buildPtrRecord();
    const announce = () => sock.send(pkt, 0, pkt.length, MDNS_PORT, MDNS_ADDR);
    announce();
    setInterval(announce, 60000);
    console.log(`mDNS: http://${hostname}.local:${port}`);
  });
  sock.on('error', () => {});
}

module.exports = { advertiseMdns };
