const fs = require("fs");
const path = require("path");

const { dataFile, ROOT } = require("../../config");
const { writeSecretFile } = require("../../settings");
const { readJSON } = require("../../store");

const SOCIAL_FILE = dataFile("social.json");
// Three independent dashboards, each with its own accounts, contact emails and
// queue. The browser agent is deliberately NOT per-dashboard: it is one process
// holding one browser session per platform, shared by all three.
const SOCIAL_DASHBOARD_DEFAULTS = [
  { id: "d1", name: "Personal" },
  { id: "d2", name: "Business" },
  { id: "d3", name: "Project" },
];
function blankDashboard(d) { return { id: d.id, name: d.name, accounts: [], emails: {}, hidden: {} }; }
// Cards a dashboard can hide, for account groups that don't use them. A hidden
// card stays hidden until it is shown again; hiding never turns anything off.
const SOCIAL_HIDEABLE = ["autopilot", "copilot", "news"];
if (!fs.existsSync(SOCIAL_FILE)) {
  writeSecretFile(SOCIAL_FILE, JSON.stringify(
    { dashboards: SOCIAL_DASHBOARD_DEFAULTS.map(blankDashboard), queue: [] }, null, 2));
}
const SOCIAL_MEDIA_DIR = path.join(ROOT, "social_media");
if (!fs.existsSync(SOCIAL_MEDIA_DIR)) fs.mkdirSync(SOCIAL_MEDIA_DIR, { recursive: true });
const SOCIAL_MAX_UPLOAD = parseInt(process.env.SOCIAL_MAX_UPLOAD || "104857600", 10); // 100MB/request
const SOCIAL_AGENT_PORT = parseInt(process.env.SOCIAL_AGENT_PORT || "4700", 10);

const MEDIA_MIME = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
  ".webp": "image/webp", ".avif": "image/avif",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".m4v": "video/x-m4v",
};
function mediaMime(f) { return MEDIA_MIME[path.extname(f).toLowerCase()] || "application/octet-stream"; }
function isVideo(f) { return mediaMime(f).startsWith("video/"); }
function isImage(f) { return mediaMime(f).startsWith("image/"); }
// Media is stored as an array of absolute paths. Older queue entries used a
// single string, so normalise on read rather than migrating the file.
function mediaList(item) {
  if (!item || !item.media) return [];
  const arr = Array.isArray(item.media) ? item.media : [item.media];
  return arr.filter(m => typeof m === "string" && m && fs.existsSync(m));
}
// Per-platform ceilings, so a post fails in the composer rather than halfway
// through publishing. Bluesky's blob cap in particular is small and surprising.
const MEDIA_LIMITS = {
  bluesky:   { images: 4, video: 1, imageBytes: 976560,   videoBytes: 50 * 1024 * 1024 },
  mastodon:  { images: 4, video: 1, imageBytes: 8 * 1024 * 1024,  videoBytes: 40 * 1024 * 1024 },
  x:         { images: 4, video: 1, imageBytes: 5 * 1024 * 1024,  videoBytes: 512 * 1024 * 1024 },
  linkedin:  { images: 9, video: 1, imageBytes: 10 * 1024 * 1024, videoBytes: 200 * 1024 * 1024 },
  threads:   { images: 10, video: 1, imageBytes: 8 * 1024 * 1024, videoBytes: 1024 * 1024 * 1024 },
  instagram: { images: 10, video: 1, imageBytes: 8 * 1024 * 1024, videoBytes: 1024 * 1024 * 1024 },
  facebook:  { images: 10, video: 1, imageBytes: 10 * 1024 * 1024, videoBytes: 1024 * 1024 * 1024 },
};
function checkMedia(platform, files) {
  const lim = MEDIA_LIMITS[platform];
  if (!lim || !files.length) return null;
  const imgs = files.filter(isImage), vids = files.filter(isVideo);
  if (vids.length > lim.video) return `${platform}: at most ${lim.video} video`;
  if (vids.length && imgs.length) return `${platform}: cannot mix video and images in one post`;
  if (imgs.length > lim.images) return `${platform}: at most ${lim.images} image${lim.images > 1 ? "s" : ""}`;
  for (const f of imgs) {
    const sz = fs.statSync(f).size;
    if (sz > lim.imageBytes) {
      return `${platform}: ${path.basename(f)} is ${(sz/1048576).toFixed(1)}MB, limit is ` +
        `${(lim.imageBytes/1048576).toFixed(2)}MB`;
    }
  }
  for (const f of vids) {
    const sz = fs.statSync(f).size;
    if (sz > lim.videoBytes) {
      return `${platform}: ${path.basename(f)} is ${(sz/1048576).toFixed(0)}MB, limit is ` +
        `${(lim.videoBytes/1048576).toFixed(0)}MB`;
    }
  }
  return null;
}
const SOCIAL_MIN_GAP_MS = parseInt(process.env.SOCIAL_MIN_GAP_MS || "60000", 10);
const SOCIAL_TICK_MS    = parseInt(process.env.SOCIAL_TICK_MS || "20000", 10);

const SOCIAL_PLATFORMS = {
  bluesky:   { label: "Bluesky",   via: "native", limit: 300,   auth: "handle + app password" },
  mastodon:  { label: "Mastodon",  via: "native", limit: 500,   auth: "instance URL + access token" },
  x:         { label: "X",         via: "agent",  limit: 280,   auth: "browser session" },
  linkedin:  { label: "LinkedIn",  via: "native", limit: 3000,  auth: "company page (LinkedIn sign-in)", oauth: "linkedin" },
  threads:   { label: "Threads",   via: "agent",  limit: 500,   auth: "browser session" },
  instagram: { label: "Instagram", via: "native", limit: 2200,  auth: "professional account (Facebook sign-in)", needsMedia: true, oauth: "meta" },
  facebook:  { label: "Facebook",  via: "native", limit: 63206, auth: "Page (Facebook sign-in)", oauth: "meta" },
};

// Migrates the old flat { accounts, queue } shape on read: existing accounts and
// posts land in the first dashboard so nothing is lost or orphaned.
function readSocial() {
  const d = readJSON(SOCIAL_FILE, {});
  if (!Array.isArray(d.queue)) d.queue = [];
  if (!Array.isArray(d.dashboards) || !d.dashboards.length) {
    d.dashboards = SOCIAL_DASHBOARD_DEFAULTS.map(blankDashboard);
    if (Array.isArray(d.accounts) && d.accounts.length) d.dashboards[0].accounts = d.accounts;
    d.queue.forEach(q => { if (!q.dashboardId) q.dashboardId = d.dashboards[0].id; });
    delete d.accounts;
  }
  // Guarantee all three exist even if the file was hand-edited.
  SOCIAL_DASHBOARD_DEFAULTS.forEach(def => {
    if (!d.dashboards.find(x => x.id === def.id)) d.dashboards.push(blankDashboard(def));
  });
  d.dashboards.forEach(x => {
    if (!Array.isArray(x.accounts)) x.accounts = [];
    if (!x.emails || typeof x.emails !== "object") x.emails = {};
    if (!x.hidden || typeof x.hidden !== "object" || Array.isArray(x.hidden)) x.hidden = {};
  });
  d.queue.forEach(q => { if (!q.dashboardId) q.dashboardId = d.dashboards[0].id; });
  return d;
}
function getDashboard(d, id) { return d.dashboards.find(x => x.id === id) || d.dashboards[0]; }
function writeSocial(d){ writeSecretFile(SOCIAL_FILE, JSON.stringify(d, null, 2)); }

module.exports = { MEDIA_LIMITS, MEDIA_MIME, SOCIAL_AGENT_PORT, SOCIAL_DASHBOARD_DEFAULTS, SOCIAL_FILE, SOCIAL_HIDEABLE, SOCIAL_MAX_UPLOAD, SOCIAL_MEDIA_DIR, SOCIAL_MIN_GAP_MS, SOCIAL_PLATFORMS, SOCIAL_TICK_MS, blankDashboard, checkMedia, getDashboard, isImage, isVideo, mediaList, mediaMime, readSocial, writeSocial };
