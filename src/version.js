const { execFileSync } = require("child_process");
const path = require("path");

// The version shown at the bottom of /personalize. The number is the app's,
// from desktop/package.json; the commit says exactly which code this server
// runs, read once at start and left out when this is not a git checkout.
const ROOT = path.resolve(__dirname, "..");

let VERSION = "";
try { VERSION = require("../desktop/package.json").version || ""; } catch (e) {}

let COMMIT = "";
try {
  COMMIT = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"], timeout: 2000 }).toString().trim();
} catch (e) {}

module.exports = { COMMIT, VERSION };
