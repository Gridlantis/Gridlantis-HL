// Settings → Updates: asks GitHub for the latest Gridlantis-HL release, only
// when someone presses Check for updates, and says how to get it on this
// machine. Nothing is downloaded or installed here; the download link goes
// straight to the release file for this system.
const fs = require("fs");
const https = require("https");
const path = require("path");
const { ROOT } = require("./config");
const { VERSION } = require("./version");

const REPO = "Gridlantis/Gridlantis-HL";
const LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
const CACHE_MS = 10 * 60 * 1000;          // GitHub allows 60 unauthenticated calls an hour
const SUPERVISOR = process.env.OPENHL_SUPERVISOR || "";
// Gridlantis-HL Server passes its own version: release tags follow it.
const CURRENT = process.env.OPENHL_APP_VERSION || VERSION || "";

let cache = null;

function getJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "Gridlantis-HL/" + (CURRENT || "dev"), Accept: "application/vnd.github+json" }, timeout: 10000 }, res => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", c => { if (body.length < 2e6) body += c; });
      res.on("end", () => {
        if (res.statusCode === 404) return reject(new Error("No release has been published yet."));
        if (res.statusCode === 403) return reject(new Error("GitHub is limiting checks right now. Try again in a few minutes."));
        if (res.statusCode !== 200) return reject(new Error("GitHub answered " + res.statusCode + "."));
        try { resolve(JSON.parse(body)); } catch { reject(new Error("GitHub sent something unreadable.")); }
      });
    });
    req.on("timeout", () => req.destroy(new Error("GitHub did not answer in time.")));
    req.on("error", e => reject(new Error(/timeout|did not answer/i.test(e.message) ? e.message : "Could not reach GitHub. Check this machine's internet connection.")));
  });
}

// "v1.10.0" > "1.9.2"; anything after a dash (1.2.0-beta) counts as older than the plain number.
function parts(v) { return String(v || "").replace(/^v/i, "").split("-")[0].split(".").map(n => parseInt(n, 10) || 0); }
function newer(a, b) {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}

// How this copy of Gridlantis-HL was installed decides how to update it.
function howToUpdate(release) {
  const assets = release.assets || [];
  if (SUPERVISOR === "server-app") {
    const want = { linux: /Server-linux.*\.AppImage$/i, win32: /Server-windows.*\.exe$/i, darwin: /Server-macos.*\.dmg$/i }[process.platform];
    const a = want && assets.find(x => want.test(x.name));
    const steps = {
      linux: "Download it, replace the old AppImage with it, mark it executable and start it.",
      win32: "Download it and run the installer. It replaces the old version.",
      darwin: "Download it, open the disk image and drag Gridlantis-HL Server to Applications, replacing the old one.",
    }[process.platform] || "Download the file for your system from the release page.";
    return { kind: "server-app", download: a ? { name: a.name, url: a.browser_download_url, size: a.size } : null,
             steps: steps + " Your password, port and data stay where they are." };
  }
  if (fs.existsSync(path.join(ROOT, ".git"))) {
    return { kind: "git", download: null, steps: "This copy runs from a git checkout. In its folder run: git pull, then restart Gridlantis-HL." };
  }
  return { kind: "other", download: null, steps: "Download the new version from the release page, or switch to Gridlantis-HL Server for one-click updates." };
}

async function check(force) {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.result;
  const r = await getJSON(LATEST);
  const latest = String(r.tag_name || "").replace(/^v/i, "");
  const result = {
    current: CURRENT || "unknown",
    latest,
    available: !!latest && !!CURRENT && newer(latest, CURRENT),
    name: r.name || ("Gridlantis-HL " + latest),
    published: r.published_at || null,
    notes: String(r.body || "").slice(0, 4000),
    page: r.html_url || `https://github.com/${REPO}/releases/latest`,
    checked: new Date().toISOString(),
    ...howToUpdate(r),
  };
  cache = { at: Date.now(), result };
  return result;
}

module.exports = { checkForUpdates: check, CURRENT_VERSION: CURRENT, newerVersion: newer };
