const fs = require("fs");
const path = require("path");

const { AI_PEERS_FILE, FILE_GROUPS_FILE, FINANCE_FILE, FOLDERS_FILE, LINKS_FILE, NOTES_FILE, WEBFORMS_FILE } = require("./config");
const { broadcast } = require("./sse");

[NOTES_FILE, FOLDERS_FILE, LINKS_FILE].forEach(f => { if (!fs.existsSync(f)) fs.writeFileSync(f, "[]"); });
if (!fs.existsSync(WEBFORMS_FILE))    fs.writeFileSync(WEBFORMS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(FILE_GROUPS_FILE)) fs.writeFileSync(FILE_GROUPS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(AI_PEERS_FILE))    fs.writeFileSync(AI_PEERS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(FINANCE_FILE))    fs.writeFileSync(FINANCE_FILE, JSON.stringify({ stocks: [], income: [], bank: { amount: 0, lastUpdated: null } }, null, 2));

// ── Durable JSON storage ─────────────────────────────────────────────────────
// Two failure modes this guards against, both of which silently destroy data:
//   1. writeFileSync is NOT atomic. A crash or power loss mid-write leaves a
//      truncated file. Write to a temp file and rename() instead — rename is
//      atomic on POSIX, so the real file is either the old one or the new one.
//   2. The old readJSON caught every error and returned an empty default. A
//      corrupt file therefore read as "no data", and the very next write
//      overwrote it with that emptiness. Now a file that exists but will not
//      parse is preserved as .corrupt, the .bak is tried, and it is logged
//      loudly rather than quietly erasing whatever was in there.
function readJSON(f, fallback) {
  const def = fallback === undefined ? [] : fallback;
  if (!fs.existsSync(f)) return def;
  let raw = "";
  try { raw = fs.readFileSync(f, "utf8"); } catch (e) {
    console.error("! could not read " + path.basename(f) + ": " + e.message);
    return def;
  }
  if (!raw.trim()) return def;
  try { return JSON.parse(raw); } catch (e) {
    console.error("! " + path.basename(f) + " is corrupt (" + e.message + ")");
    try {
      const keep = f + ".corrupt";
      fs.writeFileSync(keep, raw);
      console.error("  the unparseable contents were kept at " + path.basename(keep));
    } catch {}
    try {
      const bak = f + ".bak";
      if (fs.existsSync(bak)) {
        const v = JSON.parse(fs.readFileSync(bak, "utf8"));
        console.error("  recovered the previous good copy from " + path.basename(bak));
        return v;
      }
    } catch {}
    return def;
  }
}
function writeJSONFile(f, d) {
  const body = JSON.stringify(d, null, 2);
  const tmp = f + ".tmp";
  try {
    // keep the last good copy before replacing it
    if (fs.existsSync(f)) { try { fs.copyFileSync(f, f + ".bak"); } catch {} }
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, f);
  } catch (e) {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
    console.error("! failed writing " + path.basename(f) + ": " + e.message);
    throw e;
  }
}
const writeJSON   = (f,d) => {
  writeJSONFile(f, d);
  const typeMap = {notes:'notes',note_folders:'folders',webforms:'webforms',file_groups:'files',ai_peers:'ai'};
  const t = typeMap[path.basename(f,'.json')];
  if (t) broadcast('change', {type:t});
};
const readNotes   = () => readJSON(NOTES_FILE);
const writeNotes  = d  => writeJSON(NOTES_FILE, d);
const readFolders = () => readJSON(FOLDERS_FILE);
const writeFolders= d  => writeJSON(FOLDERS_FILE, d);
const readLinks   = () => readJSON(LINKS_FILE);
const writeLinks  = d  => writeJSON(LINKS_FILE, d);
const readWebforms   = () => readJSON(WEBFORMS_FILE);
const writeWebforms  = d  => writeJSON(WEBFORMS_FILE, d);
const readFileGroups = () => readJSON(FILE_GROUPS_FILE);
const writeFileGroups= d  => writeJSON(FILE_GROUPS_FILE, d);
const readAiPeers    = () => readJSON(AI_PEERS_FILE);
const writeAiPeers   = d  => writeJSON(AI_PEERS_FILE, d);

// ═══ MAIL — multi-account Gmail over IMAP (read-only, pull) ═════════════════════
// Zero-dependency IMAP client on Node's built-in tls. Metis only ever FETCHes;
// it never deletes or modifies mail on the server. "Delete" = drop Metis's cached
// copy. New-only incremental sync via UIDs; unopened cached mail purged at 21 days.

module.exports = { readAiPeers, readFileGroups, readFolders, readJSON, readLinks, readNotes, readWebforms, writeAiPeers, writeFileGroups, writeFolders, writeJSON, writeJSONFile, writeLinks, writeNotes, writeWebforms };
