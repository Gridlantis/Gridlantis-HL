const fs = require("fs");
const os = require("os");

const { NOTES_FILE, PORT, UPLOAD_DIR } = require("../config");
const { readJSON } = require("../store");

// Overall server status.
module.exports = async function statusRoutes(ctx) {
  const { req, pathname, json } = ctx;

  // ── Status API ────────────────────────────────────────────────────────────────
  if (pathname === '/api/status' && req.method === 'GET') {
    const ifaces = os.networkInterfaces();
    const ips    = Object.values(ifaces).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
    const noteCount = readJSON(NOTES_FILE, []).length;
    const fileCount = fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR).length : 0;
    return json({ ok: true, hostname: os.hostname(), ips, port: PORT, noteCount, fileCount, uptime: os.uptime() });
  }
};
