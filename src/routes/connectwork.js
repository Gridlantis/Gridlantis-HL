const { addLink, graph, removeLink } = require("../domains/connectwork");
const auto = require("../domains/connectwork-ai");
const { connectworkHtml } = require("../pages/connectwork");
const { broadcast } = require("../sse");

// ConnectWork: the graph page and its links.
module.exports = async function connectworkRoutes(ctx) {
  const { req, pathname, json, html, readBody } = ctx;
  if (pathname === "/connectwork" && req.method === "GET") return html(connectworkHtml());
  if (!pathname.startsWith("/api/connectwork")) return;

  if (pathname === "/api/connectwork" && req.method === "GET") return json(await graph());

  if (pathname === "/api/connectwork/links" && req.method === "POST") {
    const b = JSON.parse((await readBody(8192)).toString() || "{}");
    const out = await addLink(b.a, b.b);
    if (out.error) return json({ error: out.error }, out.status);
    broadcast("connectwork_changed", { client: String(b.client || "").slice(0, 40) });
    return json({ ok: true, link: out.link });
  }

  // ── Auto-connections: set on the AI page, shown on the graph ──
  if (pathname === "/api/connectwork/auto" && req.method === "GET") return json(auto.status());
  if (pathname === "/api/connectwork/auto" && req.method === "PUT") {
    const b = JSON.parse((await readBody(4096)).toString() || "{}");
    if (b.on !== undefined && typeof b.on !== "boolean") return json({ error: "on must be true or false" }, 400);
    try { return json(auto.setConfig(b)); } catch (e) { return json({ error: e.message }, e.status || 400); }
  }
  if (pathname === "/api/connectwork/auto/run" && req.method === "POST") {
    try { return json(await auto.run()); } catch (e) { return json({ error: e.message }, e.status || 502); }
  }
  // Dismiss a suggestion so it never comes back.
  if (pathname === "/api/connectwork/auto/dismiss" && req.method === "POST") {
    const b = JSON.parse((await readBody(4096)).toString() || "{}");
    if (typeof b.a !== "string" || typeof b.b !== "string") return json({ error: "a and b are needed" }, 400);
    auto.dismiss(b.a, b.b);
    return json({ ok: true });
  }

  const m = pathname.match(/^\/api\/connectwork\/links\/([\w-]{1,40})$/);
  if (m && req.method === "DELETE") {
    if (!removeLink(m[1])) return json({ error: "No such link" }, 404);
    broadcast("connectwork_changed", {});
    return json({ ok: true });
  }
};
