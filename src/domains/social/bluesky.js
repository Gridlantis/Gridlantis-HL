const fs = require("fs");
const path = require("path");

const { checkMedia, isVideo, mediaList, mediaMime } = require("./store");
const { URL_RE, bskyLinkText, trimUrl } = require("./length");
const { httpPost } = require("../../net");

// ── Bluesky (AT Protocol, official) ─────────────────────────────────────────
// Sessions are short-lived, so one is minted per publish rather than cached.
const BSKY_HOST_DEFAULT = "https://bsky.social";
async function bskySession(acct) {
  const host = acct.host || BSKY_HOST_DEFAULT;
  const r = await httpPost(host + "/xrpc/com.atproto.server.createSession",
    { identifier: acct.handle, password: acct.appPassword },
    { "Content-Type": "application/json" }, 15000);
  const o = JSON.parse(r);
  if (!o.accessJwt) throw new Error("Bluesky login failed");
  return { jwt: o.accessJwt, did: o.did, host };
}
// Bare URLs are not auto-linked; they need explicit facets with UTF-8 BYTE
// offsets (not JS string indices, which are UTF-16 — they diverge on any emoji).
// A long link is displayed shortened, as the Bluesky app does, with the full
// address in the facet; that is also how length.js counts it. Hashtags get tag
// facets so they are clickable.
function bskyRichText(text) {
  const facets = [];
  let out = "", last = 0, m;
  const re = new RegExp(URL_RE.source, "g");
  while ((m = re.exec(text)) !== null) {
    const uri = trimUrl(m[0]);
    out += text.slice(last, m.index);
    const shown = bskyLinkText(uri);
    const byteStart = Buffer.byteLength(out, "utf8");
    out += shown;
    facets.push({ index: { byteStart, byteEnd: Buffer.byteLength(out, "utf8") },
      features: [{ $type: "app.bsky.richtext.facet#link", uri }] });
    last = m.index + uri.length;
  }
  out += text.slice(last);
  // Hashtags are plain text too until they get a tag facet.
  const tagRe = /(^|\s)#([\p{L}\p{N}_]*\p{L}[\p{L}\p{N}_]*)/gu;
  while ((m = tagRe.exec(out)) !== null) {
    const start = m.index + m[1].length;
    const byteStart = Buffer.byteLength(out.slice(0, start), "utf8");
    facets.push({ index: { byteStart, byteEnd: byteStart + Buffer.byteLength("#" + m[2], "utf8") },
      features: [{ $type: "app.bsky.richtext.facet#tag", tag: m[2] }] });
  }
  facets.sort((x, y) => x.index.byteStart - y.index.byteStart);
  return { text: out, facets };
}
async function bskyUploadBlob(sess, filePath) {
  const data = fs.readFileSync(filePath);
  const r = await httpPost(sess.host + "/xrpc/com.atproto.repo.uploadBlob", data,
    { "Content-Type": mediaMime(filePath), Authorization: "Bearer " + sess.jwt }, 180000);
  const o = JSON.parse(r);
  if (!o.blob) throw new Error("Bluesky blob upload failed for " + path.basename(filePath));
  return o.blob;
}
async function bskyPost(acct, item) {
  const sess = await bskySession(acct);
  const rich = bskyRichText(item.text);
  const record = { $type: "app.bsky.feed.post", text: rich.text,
    createdAt: new Date().toISOString() };
  if (rich.facets.length) record.facets = rich.facets;
  const files = mediaList(item);
  if (files.length) {
    const bad = checkMedia("bluesky", files);
    if (bad) throw new Error(bad);
    const vids = files.filter(isVideo);
    if (vids.length) {
      const blob = await bskyUploadBlob(sess, vids[0]);
      record.embed = { $type: "app.bsky.embed.video", video: blob, alt: item.alt || "" };
    } else {
      const images = [];
      for (const f of files.slice(0, 4)) {
        images.push({ alt: item.alt || "", image: await bskyUploadBlob(sess, f) });
      }
      record.embed = { $type: "app.bsky.embed.images", images };
    }
  }
  const r = await httpPost(sess.host + "/xrpc/com.atproto.repo.createRecord",
    { repo: sess.did, collection: "app.bsky.feed.post", record },
    { "Content-Type": "application/json", Authorization: "Bearer " + sess.jwt }, 30000);
  const o = JSON.parse(r);
  const rkey = (o.uri || "").split("/").pop();
  return { ok: true, uri: o.uri,
    url: rkey ? `https://bsky.app/profile/${acct.handle}/post/${rkey}` : null };
}

module.exports = { BSKY_HOST_DEFAULT, bskyPost, bskyRichText, bskySession, bskyUploadBlob };
