const { addLink, graph, removeLink } = require("../domains/connectwork");
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

  const m = pathname.match(/^\/api\/connectwork\/links\/([\w-]{1,40})$/);
  if (m && req.method === "DELETE") {
    if (!removeLink(m[1])) return json({ error: "No such link" }, 404);
    broadcast("connectwork_changed", {});
    return json({ ok: true });
  }
};
