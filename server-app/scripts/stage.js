// Copies the Open HL program into server-app/openhl/, which electron-builder
// ships as a resource next to the app. Only files git tracks are copied, so
// nothing from a local install (.env, data/, uploads/, live/) can end up in a
// download.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const OUT = path.resolve(__dirname, "..", "openhl");
// What the server needs to run. tools/ holds the setup scripts some pages
// serve; desktop/package.json is where src/version.js reads the version.
const PATHS = ["server.js", "src", "tools", ".env.example", "LICENSE", "README.md", "desktop/package.json"];

const appVersion = require("../package.json").version;
const openhlVersion = require(path.join(REPO, "desktop", "package.json")).version;
if (appVersion !== openhlVersion) {
  console.error(`server-app/package.json is ${appVersion} but Open HL is ${openhlVersion}. Make them match.`);
  process.exit(1);
}

const files = execFileSync("git", ["ls-files", "-z", "--", ...PATHS], { cwd: REPO, encoding: "utf8" })
  .split("\0").filter(Boolean);
fs.rmSync(OUT, { recursive: true, force: true });
for (const f of files) {
  const to = path.join(OUT, f);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(REPO, f), to);
}
console.log(`Staged ${files.length} Open HL files into server-app/openhl/`);
