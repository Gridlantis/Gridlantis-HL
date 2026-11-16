// Renders build/icon.svg to build/icon.png (1024×1024) for electron-builder,
// which needs a raster icon for Linux and converts it to .ico for Windows.
// Uses headless Chrome, so the build needs no image libraries.
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const BUILD = path.join(__dirname, "..", "build");
const SVG = path.join(BUILD, "icon.svg");
const PNG = path.join(BUILD, "icon.png");
const SIZE = 1024;

const CHROME = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"]
  .map(c => { try { return execFileSync("which", [c], { encoding: "utf8" }).trim(); } catch { return null; } })
  .find(Boolean);
if (!CHROME) {
  console.error("No Chrome or Chromium found. Install one, or export the SVG to build/icon.png yourself (1024x1024, transparent).");
  process.exit(1);
}

const svg = fs.readFileSync(SVG, "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "metis-icon-"));
const page = path.join(tmp, "icon.html");
fs.writeFileSync(page, `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:transparent}svg{display:block;width:${SIZE}px;height:${SIZE}px}</style>${svg}`);

execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--default-background-color=00000000",
  "--force-device-scale-factor=1", "--hide-scrollbars", "--window-size=" + SIZE + "," + SIZE,
  "--screenshot=" + PNG, "--virtual-time-budget=2000", page], { stdio: "ignore" });

fs.rmSync(tmp, { recursive: true, force: true });
const { size } = fs.statSync(PNG);
console.log("wrote " + PNG + " (" + SIZE + "x" + SIZE + ", " + Math.round(size / 1024) + " KB)");
