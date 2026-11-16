const fs = require("fs");
const http = require("http");
const os = require("os");

const { NOTES_FILE, PASSWORD, PORT, ROOT, UPLOAD_DIR, UPTIMEROBOT_KEY } = require("./config");
const { NODES_FILE, readNodes } = require("./domains/monitor");
const { advertiseMdns } = require("./mdns");
const { handleRequest } = require("./router");
const { getOpenRouterKey } = require("./settings");

// Loaded in original source order so startup side effects keep their sequence.
require("./store");
require("./domains/mail");
require("./domains/weather");
require("./session");
require("./sse");
require("./host");
require("./domains/finance");
require("./domains/quicklinks");
require("./domains/todo");
require("./ui/icons");
require("./audio");
require("./alerts");
require("./helpers");
require("./net");
require("./multipart");
require("./ui/assets");
require("./pages/login");
require("./pages/welcome");
require("./pages/home");
require("./pages/homeos");
require("./pages/social");
require("./pages/reminders");
require("./pages/monitoring");
require("./pages/files");
require("./pages/notes");
require("./pages/ai");
require("./pages/finance");
require("./pages/mail");
require("./domains/tts/paths");
require("./domains/tts/edge");
require("./domains/tts/piper");
require("./domains/tts/index");
require("./domains/ai");
require("./zip");
require("./domains/homeos/store");
require("./domains/homeos/kasa");
require("./domains/homeos/tuya");
require("./domains/homeos/sonoff");
require("./domains/homeos/wyze");
require("./domains/homeos/blink");
require("./domains/homeos/ring");
require("./domains/homeos/camera");
require("./domains/homeos/typhur");
require("./domains/homeos/index");
require("./domains/social/store");
require("./domains/social/bluesky");
require("./domains/social/mastodon");
require("./domains/social/agent");
require("./domains/social/publish");
require("./domains/social/dedupe");
require("./domains/social/schedule");
require("./domains/social/ai");
require("./domains/reminders");
require("./domains/twilio");
require("./domains/voicemail");
require("./domains/texts");
require("./routes/public");
require("./routes/pages");
require("./routes/tts");
require("./routes/files");
require("./routes/notes");
require("./routes/ai");
require("./routes/settings");
require("./routes/mail");
require("./routes/reminders");
require("./routes/weather");
require("./routes/system");
require("./routes/finance");
require("./routes/quicklinks");
require("./routes/todo");
require("./routes/monitor");
require("./routes/homeos");
require("./routes/social");
require("./routes/events");
require("./routes/jobsearch");
require("./routes/folders");
require("./routes/upload");
require("./routes/status");
require("./routes/cuttlefish");
require("./routes/vmlab");
require("./routes/docker");
require("./routes/download");
require("./routes/shell");
require("./routes/world");
require("./routes/voicemail");
require("./routes/texts");

// ── HTTP SERVER ───────────────────────────────────────────────────────────────
// Router wrapped so no handler error (bad JSON, fs error, etc.) can kill the
// process or leave a request hanging.
// Optional HTTPS: set TLS_CERT and TLS_KEY (PEM paths) in .env. Browsers only
// allow automatic clipboard sync in the VM console on HTTPS or localhost.
const TLS_CERT = process.env.TLS_CERT, TLS_KEY = process.env.TLS_KEY;
const tlsOptions = (() => {
  if (!TLS_CERT || !TLS_KEY) return null;
  try { return { cert: fs.readFileSync(TLS_CERT), key: fs.readFileSync(TLS_KEY) }; }
  catch (e) { console.error('! TLS_CERT/TLS_KEY could not be read (' + e.message + ') — serving plain HTTP'); return null; }
})();
const onRequest = (req, res) => {
  handleRequest(req, res).catch(err => {
    console.error('[Router]', req.method, req.url, '-', err.message);
    try {
      if (!res.headersSent) {
        res.writeHead(err.status || (err instanceof SyntaxError ? 400 : 500), { 'Content-Type': 'application/json', 'Connection': 'close' });
      }
      res.end(JSON.stringify({ error: err.status === 413 ? 'Request body too large' : (err instanceof SyntaxError ? 'Invalid JSON body' : 'Internal server error') }));
    } catch {}
  });
};
const server = tlsOptions ? require("https").createServer(tlsOptions, onRequest) : http.createServer(onRequest);
// Node 18 aborts any request body that takes over 5 minutes, which kills
// multi-GB ISO uploads to VM Lab over a WAN link. Headers must still arrive
// promptly; only the whole-request limit is lifted.
server.requestTimeout = 0;
server.headersTimeout = 60 * 1000;

// WebSocket upgrades: the VM Lab console tunnel, the container terminal and
// the laptop remote desktop and the phone mirror. Each returns true once it claims the request;
// anything unclaimed is refused.
const { handleUpgrade: vmlabUpgrade } = require("./routes/vmlab");
const { handleUpgrade: dockerUpgrade } = require("./routes/docker");
const { handleUpgrade: laptopUpgrade } = require("./routes/laptops");
const { handleUpgrade: mobileUpgrade } = require("./routes/mobile");
server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => {});
  try { if (!vmlabUpgrade(req, socket, head) && !dockerUpgrade(req, socket, head) && !laptopUpgrade(req, socket, head) && !mobileUpgrade(req, socket, head)) socket.destroy(); }
  catch (e) { console.error('[Upgrade]', e.message); socket.destroy(); }
});


// ── Start ─────────────────────────────────────────────────────────────────────
process.on('unhandledRejection', err => console.error('[UnhandledRejection]', err && err.message || err));
process.on('uncaughtException',  err => console.error('[UncaughtException]', err && err.message || err));

// The catch-all above would swallow a failed listen and leave a headless copy
// running every background job (mail polling, the post queue, the VM Lab
// watcher) against the same data as the real one. Without the port, quit.
server.on('error', err => {
  console.error('[Listen] ' + (err.code === 'EADDRINUSE' ? `port ${PORT} is already in use — is Metis already running?` : err.message));
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  // Live folders: once set up, make sure the Syncthing hub is running and
  // still listening on this machine's current tailnet address.
  if (fs.existsSync(ROOT + '/live/home/config.xml')) {
    require('./domains/live/syncthing').ensure().catch(e => console.error('[live] hub did not start:', e.message));
  }
  const scheme = tlsOptions ? 'https' : 'http';
  console.log(`💻 Metis is running! → ${scheme}://localhost:${PORT}`);
  const ifaces = os.networkInterfaces();
  for (const iface of Object.values(ifaces)) {
    for (const i of iface) {
      if (i.family === 'IPv4' && !i.internal) {
        console.log(`   Network: ${scheme}://${i.address}:${PORT}`);
      }
    }
  }
  console.log(`   Upload dir:  ${UPLOAD_DIR} (${fs.existsSync(UPLOAD_DIR) ? 'exists' : 'MISSING'})`);
  console.log(`   Notes file:  ${NOTES_FILE} (${fs.existsSync(NOTES_FILE) ? 'exists' : 'MISSING'})`);
  console.log(`   UptimeRobot: ${UPTIMEROBOT_KEY ? 'key set' : 'no key'}`);
  console.log(`   OpenRouter:  ${getOpenRouterKey() ? 'key set' : 'no key'}`);
  console.log(`   Password:    ${PASSWORD ? 'set' : 'none (open)'}`);
  // Print where data actually lives. If Metis is ever launched from a different
  // directory, every store reads empty and it looks exactly like data loss —
  // this line makes that visible in one glance instead of a bug hunt.
  try {
    console.log(`   Data dir:    ${ROOT}`);
    console.log(`   Nodes:       ${readNodes().nodes.length} configured`);
    if (fs.existsSync(NODES_FILE + '.corrupt'))
      console.log(`   ! nodes.json was corrupt; previous contents kept in nodes.json.corrupt`);
  } catch {}
  advertiseMdns(PORT);
});

module.exports = { server };
