const { SETTINGS, saveSettings } = require("./settings");

// The user's display name, set on /personalize. Kept with the other settings
// on the server so every device greets the same person.
const NAME_MAX = 40;

function userName() {
  return typeof SETTINGS.userName === "string" ? SETTINGS.userName : "";
}

// Trims, drops control characters, caps the length. Empty clears the name.
function setUserName(raw) {
  const name = String(raw == null ? "" : raw).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, NAME_MAX);
  if (name) SETTINGS.userName = name; else delete SETTINGS.userName;
  saveSettings();
  return name;
}

// Halo, the home page helper. On unless turned off on /personalize; kept on
// the server like the name, so turning it off holds on every device.
function haloOn() { return SETTINGS.haloOff !== true; }
function setHaloOn(on) {
  if (on) delete SETTINGS.haloOff; else SETTINGS.haloOff = true;
  saveSettings();
  return haloOn();
}

// Pages hidden from the sidebar, set from each category's settings. Kept on
// the server like the name, so a hidden page stays hidden on every device.
function hiddenPages() {
  return Array.isArray(SETTINGS.hiddenPages) ? SETTINGS.hiddenPages.filter(h => typeof h === "string") : [];
}
// `allowed` is the set of pages that can be hidden; anything else is dropped.
function setHiddenPages(list, allowed) {
  const keep = [...new Set(list.filter(h => typeof h === "string" && allowed.includes(h)))];
  if (keep.length) SETTINGS.hiddenPages = keep; else delete SETTINGS.hiddenPages;
  saveSettings();
  return keep;
}

// Sidebar categories, edited from the pen on each heading in edit mode.
// Categories keep the name they ship with as their key, so a renamed category
// still finds its pages. `navGroupNames` maps key -> shown name and
// `navGroups` maps page -> category key, only where they differ from the
// default. Both live on the server so every device shows the same sidebar.
const GROUP_NAME_MAX = 30;
function plainMap(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function navGroupNames() {
  const out = {};
  for (const [k, v] of Object.entries(plainMap(SETTINGS.navGroupNames))) if (typeof v === "string" && v) out[k] = v;
  return out;
}
function navGroups() {
  const out = {};
  for (const [k, v] of Object.entries(plainMap(SETTINGS.navGroups))) if (typeof v === "string" && v) out[k] = v;
  return out;
}
// `keys` are the category keys; `defaults` maps each movable page to its own.
// Unknown keys and pages are dropped; a value equal to the default is cleared.
function setNavGroups(names, groups, keys, defaults) {
  if (names) {
    const keep = {};
    for (const k of keys) {
      const raw = names[k] !== undefined ? names[k] : navGroupNames()[k];
      const n = String(raw == null ? "" : raw).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, GROUP_NAME_MAX);
      if (n && n !== k) keep[k] = n;
    }
    if (Object.keys(keep).length) SETTINGS.navGroupNames = keep; else delete SETTINGS.navGroupNames;
  }
  if (groups) {
    const keep = {};
    for (const [href, def] of Object.entries(defaults)) {
      const g = groups[href] !== undefined ? groups[href] : navGroups()[href];
      if (typeof g === "string" && keys.includes(g) && g !== def) keep[href] = g;
    }
    if (Object.keys(keep).length) SETTINGS.navGroups = keep; else delete SETTINGS.navGroups;
  }
  saveSettings();
  return { names: navGroupNames(), groups: navGroups() };
}

// A string as a JS literal that is safe inside an inline <script>.
function scriptString(s) {
  return JSON.stringify(String(s)).replace(/</g, "\\u003c");
}

module.exports = { GROUP_NAME_MAX, NAME_MAX, haloOn, hiddenPages, navGroupNames, navGroups, scriptString, setHaloOn, setHiddenPages, setNavGroups, setUserName, userName };
