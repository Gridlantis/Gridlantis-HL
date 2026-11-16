const { SOCIAL_AGENT_PORT, checkMedia, mediaList } = require("./store");

// ── Playwright sidecar ──────────────────────────────────────────────────────
function agentCall(subPath, method = "GET", body = null, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = require("http").request({ hostname: "127.0.0.1", port: SOCIAL_AGENT_PORT,
      path: subPath, method,
      headers: Object.assign({ "Content-Type": "application/json" },
        data ? { "Content-Length": Buffer.byteLength(data) } : {}) },
      resp => { let d = ""; resp.on("data", c => d += c);
        resp.on("end", () => resolve({ status: resp.statusCode, body: d })); });
    r.setTimeout(timeoutMs, () => { r.destroy(); reject(new Error("social agent timeout")); });
    r.on("error", () => reject(new Error("social agent offline on :" + SOCIAL_AGENT_PORT)));
    if (data) r.write(data);
    r.end();
  });
}
async function agentPost(acct, item, platform) {
  const files = mediaList(item);
  const bad = checkMedia(platform, files);
  if (bad) throw new Error(bad);
  const r = await agentCall("/post", "POST",
    { platform, text: item.text, media: files, alt: item.alt || "" });
  const o = JSON.parse(r.body || "{}");
  if (r.status >= 400 || !o.ok) throw new Error(o.error || ("agent HTTP " + r.status));
  return { ok: true, url: o.url || null };
}

module.exports = { agentCall, agentPost };
