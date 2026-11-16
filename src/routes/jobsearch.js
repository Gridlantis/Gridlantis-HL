const { JOB_SEARCH_PORT } = require("../config");
const { httpGet } = require("../net");

// Proxy to the standalone job-search service.
module.exports = async function jobSearchRoutes(ctx) {
  const { req, parsed, pathname, json } = ctx;

  // ── Job search proxy (browser can't reach localhost:PORT on server) ──────────
  if (pathname === '/api/job-search/status' && req.method === 'GET') {
    try {
      const data = await httpGet(`http://localhost:${JOB_SEARCH_PORT}/api/status`, 3000);
      return json(JSON.parse(data));
    } catch(e) {
      return json({ error: 'offline' }, 503);
    }
  }
  if (pathname === '/api/job-search/jobs' && req.method === 'GET') {
    try {
      const qs = parsed.search || '';
      const data = await httpGet(`http://localhost:${JOB_SEARCH_PORT}/api/jobs${qs}`, 5000);
      return json(JSON.parse(data));
    } catch(e) {
      return json({ error: 'offline' }, 503);
    }
  }
};
