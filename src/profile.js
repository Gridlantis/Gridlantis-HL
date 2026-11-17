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

// A string as a JS literal that is safe inside an inline <script>.
function scriptString(s) {
  return JSON.stringify(String(s)).replace(/</g, "\\u003c");
}

module.exports = { NAME_MAX, haloOn, scriptString, setHaloOn, setUserName, userName };
