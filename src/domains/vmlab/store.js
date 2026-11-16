const { readJSON, writeJSONFile } = require("../../store");
const { broadcast } = require("../../sse");
const { ENVS_FILE, IMAGES_FILE } = require("./paths");

// Small JSON stores, written atomically through the shared store helpers. Every
// write pushes a 'vmlab' SSE event so open VM Lab pages refresh themselves.
function store(file) {
  return {
    read: () => { const v = readJSON(file, []); return Array.isArray(v) ? v : []; },
    write: (d, what) => { writeJSONFile(file, d); broadcast("vmlab", { what: what || "state" }); },
  };
}

const envs = store(ENVS_FILE);
const images = store(IMAGES_FILE);

function updateEnv(id, patch) {
  const all = envs.read();
  const e = all.find(x => x.id === id);
  if (!e) return null;
  Object.assign(e, typeof patch === "function" ? patch(e) || {} : patch);
  envs.write(all, "envs");
  return e;
}

module.exports = { envs, images, updateEnv };
