// ── Post length as each platform counts it ──────────────────────────────────
// Links are the difference. Mastodon counts every link as 23 characters.
// Bluesky counts the text that is displayed, and Open HL displays a long link
// shortened ("knack.be/nieuws/wereld/…", the way the Bluesky app does) with the
// full address in its link facet — see bskyRichText() in bluesky.js. Elsewhere
// a link costs its full length.

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;
const BSKY_LINK_MAX = 30;

const trimUrl = uri => uri.replace(/[.,;:!?]+$/, "");
function bskyLinkText(uri) {
  const d = uri.replace(/^https?:\/\/(www\.)?/i, "");
  return d.length <= BSKY_LINK_MAX ? d : d.slice(0, BSKY_LINK_MAX - 1) + "…";
}
function linkLength(platform, uri) {
  if (platform === "mastodon") return 23;
  if (platform === "bluesky") return bskyLinkText(uri).length;
  return uri.length;
}
function postLength(platform, text) {
  let n = String(text || "").length;
  for (const m of String(text || "").matchAll(URL_RE)) {
    const uri = trimUrl(m[0]);
    n += linkLength(platform, uri) - uri.length;
  }
  return n;
}

module.exports = { BSKY_LINK_MAX, URL_RE, bskyLinkText, linkLength, postLength, trimUrl };
