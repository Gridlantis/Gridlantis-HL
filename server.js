// Metis — entry point.
//
// The server itself lives in src/. This file only starts it, so that the path
// systemd and `node server.js` have always used keeps working.
require("./src/app");
