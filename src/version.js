// The version shown at the bottom of /personalize: the app's number, from
// desktop/package.json, the only version the project keeps.
let VERSION = "";
try { VERSION = require("../desktop/package.json").version || ""; } catch (e) {}

module.exports = { VERSION };
