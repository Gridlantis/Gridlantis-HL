const fs = require("fs");
const path = require("path");

const { dataFile } = require("../../config");
const { broadcast } = require("../../sse");
const { readJSON, writeJSONFile } = require("../../store");

const HOMEOS_FILE = dataFile("homeos.json");
if (!fs.existsSync(HOMEOS_FILE)) fs.writeFileSync(HOMEOS_FILE, JSON.stringify({ devices: [] }, null, 2));

const HOMEOS_STATE = {};     // id -> { online, state, at, err }
const HOMEOS_ENERGY = {};    // id -> [{ at, w }]  rolling 240-sample power history

function readHomeOS()  { const d = readJSON(HOMEOS_FILE, { devices: [] }); if (!Array.isArray(d.devices)) d.devices = []; return d; }
function writeHomeOS(d){ writeJSONFile(HOMEOS_FILE, d); broadcast("homeos_devices", {}); }

module.exports = { HOMEOS_ENERGY, HOMEOS_FILE, HOMEOS_STATE, readHomeOS, writeHomeOS };
