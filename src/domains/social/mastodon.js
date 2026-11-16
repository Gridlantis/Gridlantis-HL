const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { checkMedia, mediaList, mediaMime } = require("./store");
const { httpGet, httpPost } = require("../../net");

// ── Mastodon (official API) ─────────────────────────────────────────────────
async function mastoUploadMedia(acct, filePath) {
  const data = fs.readFileSync(filePath);
  const bnd = "----openhl" + crypto.randomBytes(12).toString("hex");
  const mime = mediaMime(filePath);
  const body = Buffer.concat([
    Buffer.from(`--${bnd}\r\nContent-Disposition: form-data; name="file"; filename="${path.basename(filePath)}"\r\nContent-Type: ${mime}\r\n\r\n`),
    data, Buffer.from(`\r\n--${bnd}--\r\n`),
  ]);
  const base = acct.instance.replace(/\/$/, "");
  const r = await httpPost(base + "/api/v2/media", body,
    { "Content-Type": "multipart/form-data; boundary=" + bnd, Authorization: "Bearer " + acct.token }, 180000);
  const o = JSON.parse(r);
  if (!o.id) throw new Error("Mastodon media upload failed");
  // v2/media returns 202 for anything it transcodes (video, large images) with
  // url:null. Attaching an id before processing finishes is a 422, so wait.
  if (o.url === null || o.url === undefined) {
    for (let i = 0; i < 40; i++) {
      await new Promise(res => setTimeout(res, 1500));
      try {
        const st = JSON.parse(await httpGet(base + "/api/v1/media/" + o.id, 15000,
          { Authorization: "Bearer " + acct.token }));
        if (st && st.url) return o.id;
      } catch {}
    }
    throw new Error("Mastodon is still processing " + path.basename(filePath) + " after 60s");
  }
  return o.id;
}
async function mastoPost(acct, item) {
  const base = acct.instance.replace(/\/$/, "");
  const payload = { status: item.text, visibility: acct.visibility || "public" };
  const mfiles = mediaList(item);
  if (mfiles.length) {
    const bad = checkMedia("mastodon", mfiles);
    if (bad) throw new Error(bad);
    payload.media_ids = [];
    for (const f of mfiles.slice(0, 4)) payload.media_ids.push(await mastoUploadMedia(acct, f));
  }
  const r = await httpPost(base + "/api/v1/statuses", payload,
    { "Content-Type": "application/json", Authorization: "Bearer " + acct.token,
      // Mastodon dedupes on this header, so a retry can't double-post.
      "Idempotency-Key": item.id }, 30000);
  const o = JSON.parse(r);
  return { ok: true, url: o.url || o.uri, id: o.id };
}

module.exports = { mastoPost, mastoUploadMedia };
