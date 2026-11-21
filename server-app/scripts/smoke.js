// Starts Open HL the way Open HL Server does (state in an outside folder) and
// checks that the sign-in page answers. Run on each OS before building, so a
// download that can't start Open HL is never published.
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3999;
const home = fs.mkdtempSync(path.join(os.tmpdir(), "openhl-smoke-"));
fs.writeFileSync(path.join(home, ".env"), `PASSWORD="smoke-test-only"\nPORT="${PORT}"\n`);

const proc = spawn(process.execPath, [path.join(REPO, "server.js")], {
  cwd: REPO, env: Object.assign({}, process.env, { OPENHL_HOME: home }), stdio: ["ignore", "pipe", "pipe"],
});
let out = "";
proc.stdout.on("data", d => { out += d; });
proc.stderr.on("data", d => { out += d; });

function finish(ok, why) {
  proc.kill();
  console.log(out.trim());
  console.log(ok ? "\nSmoke test passed: " + why : "\nSmoke test FAILED: " + why);
  process.exit(ok ? 0 : 1);
}

proc.on("exit", code => finish(false, "Open HL exited with code " + code));
const until = Date.now() + 30000;
(function poll() {
  http.get({ host: "127.0.0.1", port: PORT, path: "/login", timeout: 2000 }, res => {
    res.resume();
    if (res.statusCode === 200) return finish(true, "/login answered 200");
    finish(false, "/login answered " + res.statusCode);
  }).on("error", () => {
    if (Date.now() > until) return finish(false, "no answer within 30 seconds");
    setTimeout(poll, 500);
  });
})();
