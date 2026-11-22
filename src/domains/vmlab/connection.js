const { execFile } = require("child_process");

const { PORT } = require("../../config");
const { tailnetIp } = require("../../net");

// How the browser viewing the VM console reached this Gridlantis-HL, so the console can
// say why it feels slow. Tailscale Funnel and `tailscale serve` both arrive from
// 127.0.0.1 through tailscaled; Funnel marks its requests with a header, and
// serve adds the tailnet user's identity. For a tailnet client, `tailscale
// status` tells whether its traffic goes direct or through a relay.

const STATUS_TTL_MS = 5000;
let statusCache = null, statusAt = 0;

function tailscaleStatus() {
  if (statusCache && Date.now() - statusAt < STATUS_TTL_MS) return Promise.resolve(statusCache);
  return new Promise(resolve => {
    execFile("tailscale", ["status", "--json"], { timeout: 4000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
      let s = null;
      try { if (!err) s = JSON.parse(out); } catch {}
      if (s) { statusCache = s; statusAt = Date.now(); }
      resolve(s);
    });
  });
}

// DERP relay region codes as Tailscale reports them.
const REGIONS = { ord: "Chicago", nyc: "New York", iad: "Virginia", mia: "Miami", dfw: "Dallas", den: "Denver", sea: "Seattle",
  sfo: "San Francisco", lax: "Los Angeles", tor: "Toronto", lhr: "London", fra: "Frankfurt", par: "Paris", ams: "Amsterdam",
  tok: "Tokyo", sin: "Singapore", syd: "Sydney", hkg: "Hong Kong", sao: "São Paulo", jnb: "Johannesburg" };

const bare = ip => String(ip || "").replace(/^::ffff:/, "");
const isLoopback = ip => ip === "127.0.0.1" || ip === "::1";
const isTailnet = ip => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip) || /^fd7a:115c:a1e0:/i.test(ip);
const isPrivate = ip => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(ip) || /^f[cd]/i.test(ip);

async function describe(req) {
  const socketIp = bare(req.socket.remoteAddress);
  const forwarded = bare(String(req.headers["x-forwarded-for"] || "").split(",")[0].trim());
  const out = { via: "internet", client: socketIp };

  if (isLoopback(socketIp) && req.headers["tailscale-funnel-request"]) Object.assign(out, { via: "funnel", client: forwarded });
  else if (isLoopback(socketIp) && req.headers["tailscale-user-login"]) Object.assign(out, { via: "tailnet-https", client: forwarded });
  else if (isLoopback(socketIp)) out.via = "local";
  else if (isTailnet(socketIp)) out.via = "tailnet";
  else if (isPrivate(socketIp)) out.via = "lan";

  const s = await tailscaleStatus();
  // A browser on this machine using its own tailnet address never leaves it.
  if (s && s.Self && (s.Self.TailscaleIPs || []).includes(out.client)) out.via = "local";
  if (s && s.Self) {
    const name = String(s.Self.HostName || "").toLowerCase();
    const ip = tailnetIp();
    if (name) out.fastUrl = "http://" + name + ":" + PORT;
    if (ip) out.fastIpUrl = "http://" + ip + ":" + PORT;
  }

  if ((out.via === "tailnet" || out.via === "tailnet-https") && s && s.Peer) {
    const peer = Object.values(s.Peer).find(p => (p.TailscaleIPs || []).includes(out.client));
    if (peer) {
      out.peer = peer.HostName || peer.DNSName || out.client;
      if (peer.CurAddr) { out.path = "direct"; out.endpoint = peer.CurAddr; }
      else if (peer.PeerRelay) { out.path = "peer-relay"; out.endpoint = peer.PeerRelay; }
      else if (peer.Relay) { out.path = "relay"; out.relay = REGIONS[peer.Relay] || peer.Relay; }
    }
  }
  return out;
}

module.exports = { describe };
