const https = require("https");
const os = require("os");


// ─── HTTP UTILS ───────────────────────────────────────────────────────────────
function httpGet(url, timeoutMs=10000, extraHeaders={}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : require('http');
    const req = mod.get({
      hostname: u.hostname, port: u.port || undefined,
      path: u.pathname + u.search,
      headers: { 'User-Agent': 'OpenHL/1.0', ...extraHeaders }
    }, res => {
      // Follow redirects
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && res.headers.location) {
        res.resume();
        const next = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
        return httpGet(next, timeoutMs, extraHeaders).then(resolve).catch(reject);
      }
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        // Include the response body: for Mastodon/Bluesky the JSON error text
        // ("The access token is invalid", "outside the authorized scopes") is
        // the only part that tells you what to actually fix.
        if (res.statusCode >= 400) {
          let detail = '';
          try { const j = JSON.parse(d);
            // Google's newer APIs nest it: { error: { code, message, status } }.
            const e = j.error && typeof j.error === 'object' ? j.error.message : j.error;
            detail = j.error_description || e || j.message || ''; }
          catch { detail = String(d || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160); }
          return reject(new Error(`HTTP ${res.statusCode} from ${u.hostname}` + (detail ? ': ' + detail : '')));
        }
        resolve(d);
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

function httpPost(url, body, headers={}, timeoutMs=10000) {
  return new Promise((resolve, reject) => {
    const u    = new URL(url);
    const mod  = u.protocol === 'https:' ? https : require('http');
    // A Buffer must go out as raw bytes. Without this branch JSON.stringify()
    // turns it into {"type":"Buffer","data":[137,80,...]} and every binary
    // upload (Mastodon media, Bluesky blobs) is silently corrupted.
    const data = typeof body === 'string' ? body
               : Buffer.isBuffer(body)    ? body
               : JSON.stringify(body);
    const req  = mod.request({
      hostname: u.hostname, port: u.port || undefined,
      path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Length': Buffer.byteLength(data), ...headers }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode} from ${u.hostname}: ${d.slice(0,200)}`));
        resolve(d);
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

// This Gridlantis-HL's own tailnet address — the one another machine on the tailnet
// should call back on, and the only one a laptop's VNC server should let in.
// 100.64.0.0/10 is the CGNAT range Tailscale hands out.
function tailnetIp() {
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || [])
      if (i.family === "IPv4" && !i.internal && /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(i.address)) return i.address;
  return null;
}

// ─── SERVICE PROBE + PROXY HELPERS ────────────────────────────────────────────
// Reachability checks.
// Lightweight TCP reachability probe — "is a service listening on this port".
// A successful connect = up; ECONNREFUSED / timeout = down. Path-agnostic.
function probePort(host, port, timeoutMs = 2000) {
  return new Promise(resolve => {
    const sock = require('net').connect({ host, port });
    let done = false;
    const finish = ok => { if (done) return; done = true; try { sock.destroy(); } catch {} resolve(ok); };
    sock.setTimeout(timeoutMs, () => finish(false));
    sock.on('connect', () => finish(true));
    sock.on('error', () => finish(false));
  });
}

module.exports = { httpGet, httpPost, probePort, tailnetIp };
