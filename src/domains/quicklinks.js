const fs = require("fs");
const path = require("path");

const { dataFile } = require("../config");
const { readJSON, writeJSONFile } = require("../store");

const QUICKLINKS_FILE = dataFile("quicklinks.json");
if (!fs.existsSync(QUICKLINKS_FILE)) fs.writeFileSync(QUICKLINKS_FILE, JSON.stringify({ links: [] }, null, 2));
// Stable pseudo-random hue per label: same site always gets the same colour.
function quickLinkColor(seed) {
  let hsh = 0;
  const str = String(seed || "?");
  for (let i = 0; i < str.length; i++) hsh = (hsh * 31 + str.charCodeAt(i)) >>> 0;
  const hue = hsh % 360;
  const [r, g, b] = hslToRgb(hue / 360, 0.62, 0.48);
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}
function hslToRgb(hh, ss, ll) {
  const f = n => {
    const k = (n + hh * 12) % 12;
    const a = ss * Math.min(ll, 1 - ll);
    return Math.round(255 * (ll - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))));
  };
  return [f(0), f(8), f(4)];
}
function readQuickLinks()  { const d = readJSON(QUICKLINKS_FILE, { links: [] }); if (!Array.isArray(d.links)) d.links = []; return d; }
function writeQuickLinks(d){ writeJSONFile(QUICKLINKS_FILE, d); }

module.exports = { QUICKLINKS_FILE, hslToRgb, quickLinkColor, readQuickLinks, writeQuickLinks };
