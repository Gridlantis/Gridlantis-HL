/* VM Lab — VM console (noVNC). Loaded as an ES module. */
import RFB from "/vmlab/novnc/core/rfb.js";

const { api, h, icon, fmtBytes, toast, writeClipboard, readClipboard, clipboardMode } = window.VL;
const ID = document.body.dataset.env;
// Which machine this VM lives on. The page is always served by Metis, but the
// VM itself may be on a second device running the VM Lab agent — every API
// call and the console tunnel have to name it.
const HOST = document.body.dataset.host || "local";
window.VL.setVmHost(HOST);
const $ = s => document.querySelector(s);
if (HOST !== "local") {
  const badge = $("#c-host");
  badge.hidden = false;
  badge.title = "This VM runs on another machine";
  badge.append(document.createTextNode(document.body.dataset.hostName || HOST));
}

const XK = { Control_L: 0xffe3, Alt_L: 0xffe9, Shift_L: 0xffe1, Super_L: 0xffeb, Delete: 0xffff, Tab: 0xff09, Escape: 0xff1b,
  Return: 0xff0d, BackSpace: 0xff08, F: n => 0xffbd + n, Print: 0xff61 };

let env = null, rfb = null, connected = false, reconnectT = null, retry = 0;
let guestClip = "", lastSentClip = null, lastUserGesture = 0, scaleFit = true;

// Picture quality, sent to QEMU's VNC server as the Tight JPEG quality and zlib
// level. Lower quality means smaller frames, which is what makes the console
// feel faster over Tailscale or Wi-Fi. Remembered per browser.
const QUALITY = {
  speed:    { label: "Speed",    sub: "Blurrier picture, fastest over slow links", jpeg: 2, zlib: 6 },
  balanced: { label: "Balanced", sub: "Good picture, good speed", jpeg: 6, zlib: 2 },
  quality:  { label: "Quality",  sub: "Sharpest picture, for fast networks", jpeg: 9, zlib: 0 },
};
let quality = "balanced";
try { const q = localStorage.getItem("vmlab-console-quality"); if (QUALITY[q]) quality = q; } catch (e) {}
function applyQuality() {
  const q = QUALITY[quality];
  if (rfb) { rfb.qualityLevel = q.jpeg; rfb.compressionLevel = q.zlib; }
  $("#q-label").textContent = q.label;
  $("#m-quality").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.q === quality));
}

// How this browser reaches Metis. Funnel and relayed tailnet traffic take a
// detour through Tailscale's servers, which is the usual reason the console
// lags; the menu explains it and links to the faster tailnet address.
async function loadConnection() {
  let c;
  try { c = await api("GET", "/api/vmlab/connection"); } catch (e) { return; }
  const who = c.peer ? " (" + c.peer + ")" : "";
  let tone = "good", label, title, text;
  if (c.via === "funnel") {
    tone = "warn"; label = "Funnel"; title = "Public link (Tailscale Funnel)";
    text = "This page came in over the public internet through Tailscale's Funnel servers, so every screen update takes a detour. That is the slowest way in.";
  } else if ((c.via === "tailnet" || c.via === "tailnet-https") && c.path === "relay") {
    tone = "warn"; label = "Relayed"; title = "Tailscale, through a relay";
    text = "This computer" + who + " is on your tailnet but can't reach Metis directly, so traffic goes through Tailscale's relay in " + c.relay + ". A firewall or strict router usually causes this; running \"tailscale netcheck\" on that computer shows whether UDP gets out.";
  } else if ((c.via === "tailnet" || c.via === "tailnet-https") && c.path === "peer-relay") {
    tone = "warn"; label = "Relayed"; title = "Tailscale, through a peer relay";
    text = "This computer" + who + " reaches Metis through another tailnet device (" + c.endpoint + "), not directly.";
  } else if (c.via === "tailnet" || c.via === "tailnet-https") {
    label = "Direct"; title = "Tailscale, direct";
    text = "This computer" + who + " talks to Metis directly over Tailscale" + (c.endpoint ? " (" + c.endpoint + ")" : "") + ". That is as fast as it gets away from home."
      + (c.via === "tailnet-https" ? " The https ts.net address adds a small local proxy step; the plain address below skips it." : "");
  } else if (c.via === "lan") {
    label = "Local network"; title = "Same local network";
    text = "This computer is on the same network as Metis, the fastest way in.";
  } else if (c.via === "local") {
    label = "This PC"; title = "On the Metis machine";
    text = "This browser is running on the Metis machine itself.";
  } else {
    tone = "warn"; label = "Internet"; title = "Over the internet";
    text = "This page came in over the internet, not through Tailscale or the local network.";
  }
  $("#conn-dot").className = "dot " + tone;
  $("#conn-label").textContent = label;
  const m = $("#m-conn"); m.innerHTML = "";
  m.append(h("div", { class: "ct" }, title), h("p", null, text));
  if (HOST !== "local") m.append(h("p", null, "This VM runs on " + (document.body.dataset.hostName || HOST) + ", so the picture also passes through this Metis on its way to you."));
  // Only worth offering when the browser isn't already on the plain tailnet address.
  if ((c.via === "funnel" || c.via === "internet" || c.via === "tailnet-https") && c.fastUrl) {
    const here = location.pathname + location.search;
    m.append(h("p", null, "If this computer is on your tailnet, the plain address is faster:"),
      h("p", null, h("code", null, c.fastUrl)),
      h("a", { class: "btn sm", href: c.fastUrl + here }, icon("fa-solid fa-bolt"), " Open the faster link"));
    if (c.fastIpUrl) m.append(h("p", { style: { marginTop: "8px" } }, "If the name doesn't resolve, try ", h("code", null, c.fastIpUrl), "."));
  }
  if (c.via === "tailnet" || c.via === "tailnet-https") m.append(h("p", { style: { marginTop: "8px" } }, "Your browser's IP: " + c.client));
}

// ── Environment state ─────────────────────────────────────────────────────────
async function refresh() {
  try {
    env = await api("GET", "/api/vmlab/envs/" + ID);
  } catch (e) {
    if (e.status === 404) return showOverlay("VM not found", "It may have been deleted — a VM set to discard changes disappears when it shuts down.", [backBtn()]);
    return;
  }
  paint();
  if (env.running && !rfb) connect();
  if (!env.running && rfb) { try { rfb.disconnect(); } catch (e) {} }
}

function paint() {
  document.title = env.name + " · Metis VM console";
  $("#c-name").textContent = env.name;
  const status = env.running ? (env.status === "stopping" ? "stopping" : "running") : env.status;
  $("#c-dot").className = "dot " + status;
  $("#c-status").textContent = [status, env.running ? (env.agent ? "agent ✓" : "agent —") : null,
    env.running && env.clipboard !== false ? (env.clipboardAgent ? "clipboard ✓" : "clipboard —") : null,
    connected ? "connected" : null].filter(Boolean).join(" · ");
  $("#usb-box").hidden = !(env.usb && env.usb.enabled);
  $("#clip-status").textContent = clipHelp(env);

  const info = $("#m-info"); info.innerHTML = "";
  const kv = (k, v) => { info.appendChild(h("span", { class: "k" }, k)); info.appendChild(h("span", { class: "v" }, v)); };
  kv("machine", env.cpus + " vCPU · " + fmtBytes(env.memoryMb * 1048576, 0) + " · " + env.diskGb + " GB");
  kv("disk", env.persistent ? "keeps changes" : "discarded on shutdown");
  kv("network", { nat: "internet", isolated: "isolated", none: "none" }[env.network]);
  if (env.cloudInit && env.cloudInit.enabled) {
    const pw = h("span", { class: "secret", title: "click to copy" }, "••••••••");
    pw.addEventListener("click", async () => { pw.textContent = env.cloudInit.password; await writeClipboard(env.cloudInit.password); toast("Password copied"); });
    kv("login", h("span", null, env.cloudInit.username + " / ", pw));
    const typePw = h("button", { class: "btn sm", title: "Type the password into the VM" }, icon("fa-solid fa-keyboard"), "Type password");
    typePw.addEventListener("click", () => { typeText(env.cloudInit.password + "\n"); });
    info.appendChild(h("span", { class: "k" }, "")); info.appendChild(h("span", { class: "v" }, typePw));
  }
  if (env.usage) kv("usage", env.usage.cpu.toFixed(1) + "% CPU · " + fmtBytes(env.usage.rssBytes));
  if (!env.persistent && env.running) {
    info.appendChild(h("span", { class: "k" }, ""));
    info.appendChild(h("span", { class: "v", style: { color: "var(--yellow)", whiteSpace: "normal" } }, "Shutting down deletes this VM."));
  }

  if (!env.running) {
    const acts = [backBtn()];
    if (env.status !== "starting") acts.unshift(h("button", { class: "btn primary", onclick: startVm }, icon("fa-solid fa-play"), "Start VM"));
    showOverlay(env.status === "starting" ? "Starting…" : env.status === "error" ? "The VM failed" : "The VM is off", env.error || "", acts);
  }
  paintUsb();
}

function backBtn() { return h("a", { class: "btn", href: "/vmlab" }, icon("fa-solid fa-arrow-left"), "VM Lab"); }
async function startVm() {
  showOverlay("Starting…", "", []);
  try { await api("POST", "/api/vmlab/envs/" + ID + "/start"); refresh(); }
  catch (e) { showOverlay("Could not start", e.message, [backBtn()]); }
}

function showOverlay(title, text, actions) {
  $("#overlay").hidden = false;
  $("#ov-title").textContent = title;
  $("#ov-text").textContent = text || "";
  const a = $("#ov-acts"); a.innerHTML = ""; (actions || []).forEach(x => a.appendChild(x));
}
const hideOverlay = () => { $("#overlay").hidden = true; };

// ── VNC ───────────────────────────────────────────────────────────────────────
function connect() {
  clearTimeout(reconnectT);
  const url = (location.protocol === "https:" ? "wss://" : "ws://") + location.host +
    window.VL.withHost("/api/vmlab/envs/" + ID + "/vnc");
  if (!connected) showOverlay("Connecting…", "", []);
  rfb = new RFB($("#screen"), url, { wsProtocols: ["binary"] });
  rfb.scaleViewport = scaleFit;
  rfb.resizeSession = false;
  rfb.clipViewport = false;
  rfb.focusOnClick = true;
  rfb.background = "#000";
  applyQuality();
  rfb.addEventListener("connect", () => {
    connected = true; retry = 0; hideOverlay(); paint();
    rfb.focus();
    syncHostClipboard();
  });
  rfb.addEventListener("disconnect", () => {
    connected = false; rfb = null; paint();
    if (env && env.running) {
      retry++;
      showOverlay("Reconnecting…", retry > 2 ? "The console connection dropped. Retrying." : "", [backBtn()]);
      reconnectT = setTimeout(async () => { await refresh(); if (env && env.running && !rfb) connect(); }, Math.min(8000, 800 * retry));
    }
  });
  rfb.addEventListener("clipboard", e => onGuestClipboard(e.detail.text));
  rfb.addEventListener("desktopname", e => { if (e.detail && e.detail.name) $("#c-status").title = e.detail.name; });
}

// ── Clipboard: both directions ────────────────────────────────────────────────
// VM → this computer: QEMU forwards the guest clipboard (via spice-vdagent)
// over VNC; we mirror it into the local clipboard.
// This computer → VM: whenever the console gains focus, and on every Ctrl+V,
// the local clipboard is pushed to the guest before the keystroke lands.
const mode = clipboardMode();
$("#clip-mode").textContent = { desktop: "desktop app", secure: "auto sync", basic: "paste sync" }[mode];
const MODE_HELP = {
  desktop: "Copy and paste flow both ways automatically.",
  secure: "Copy and paste flow both ways. Your browser may ask once for clipboard permission.",
  basic: "Ctrl+V inside the VM pastes from this computer. Copies inside the VM land here and are copied locally when your browser allows it — press Copy if not. Use HTTPS or the desktop app for fully automatic sync.",
};
// Nothing crosses until spice-vdagent runs in the guest, and most live ISOs
// (Mint, Puppy, Android) do not ship it — say what is missing instead of
// letting copy and paste fail silently.
const AGENT_HELP = {
  linux: "No clipboard agent is running in this VM yet. Install spice-vdagent in it (Debian, Ubuntu, Mint: sudo apt install spice-vdagent), then log out and back in. On a live ISO that keeps no changes, repeat after each boot.",
  windows: "No clipboard agent is running in this VM yet. Attach the virtio-win ISO as the driver disc and run virtio-win-guest-tools.exe inside Windows.",
  android: "Android has no clipboard agent for VMs. For a two-way clipboard, open the VM in Mobile host (see the note on its card).",
  other: "No clipboard agent is running in this VM. Copy and paste need spice-vdagent inside the guest.",
};
function clipHelp(env) {
  if (env.clipboard === false) return "Shared clipboard is turned off for this environment. “Type it” still works.";
  if (env.running && !env.clipboardAgent) return (AGENT_HELP[env.family] || AGENT_HELP.other) + " Until then, Ctrl+V and “Type it” type text in as keystrokes; copying out of the VM needs the agent.";
  return MODE_HELP[mode];
}

async function onGuestClipboard(text) {
  if (text === guestClip) return;
  guestClip = text;
  lastSentClip = text;               // do not bounce it straight back
  $("#clip-text").value = text;
  let ok = false;
  if (mode !== "basic" || Date.now() - lastUserGesture < 4000) ok = await writeClipboard(text);
  if (rfb && document.activeElement && document.activeElement.tagName === "TEXTAREA") {} else if (rfb) rfb.focus();
  if (!ok) toast("Copied inside the VM — open Clipboard and press Copy");
}

async function pushToGuest(text) {
  if (!rfb || text == null) return false;
  if (text === lastSentClip) return true;
  rfb.clipboardPasteFrom(text);
  lastSentClip = text; guestClip = text;
  $("#clip-text").value = text;
  return true;
}

async function syncHostClipboard() {
  if (mode === "basic") return;
  const text = await readClipboard();
  if (text != null && text !== "") await pushToGuest(text);
}

function sendCombo(keysyms) {
  if (!rfb) return;
  keysyms.forEach(k => rfb.sendKey(k, null, true));
  keysyms.slice().reverse().forEach(k => rfb.sendKey(k, null, false));
}

// Ctrl+V / Ctrl+Shift+V / Shift+Insert: update the guest clipboard first, then let the paste through.
//
// In a browser the clipboard usually cannot be read on demand (Metis is plain
// http on the tailnet, and even on https it asks permission), but the browser
// still hands a real paste its text — only not on the console canvas, which is
// not editable. So: let noVNC skip the key, move focus to a hidden box so the
// browser's own paste lands there, forward the text, then replay the paste.
// The desktop app reads the clipboard directly.
const pasteSink = h("textarea", { "aria-hidden": "true", tabindex: "-1", autocomplete: "off",
  style: { position: "fixed", left: "-9999px", top: "0", width: "1px", height: "1px", opacity: "0" } });
document.body.appendChild(pasteSink);
// Key releases while the box has focus still belong to the guest, or the
// modifier would stay stuck down there.
pasteSink.addEventListener("keyup", e => { if (rfb && rfb._keyboard) rfb._keyboard._handleKeyUp(e); });
let pendingPaste = null, pasteT = null;

window.addEventListener("keydown", async e => {
  lastUserGesture = Date.now();
  if (!rfb || !connected) return;
  const inScreen = $("#screen").contains(document.activeElement) || document.activeElement === document.body;
  if (!inScreen) return;
  const isPaste = ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V")) || (e.shiftKey && e.key === "Insert");
  if (!isPaste) return;
  e.stopImmediatePropagation();                 // keep noVNC from sending the key before the clipboard is updated
  const combo = { insert: e.key === "Insert" };
  if (mode === "desktop") {
    e.preventDefault();
    pasteInto(await readClipboard(), combo);
    return;
  }
  pendingPaste = combo;
  pasteSink.value = "";
  pasteSink.focus();
  // A browser that does not fire paste here still gets the keystroke, using
  // whatever the guest clipboard already holds.
  clearTimeout(pasteT);
  pasteT = setTimeout(() => { if (pendingPaste) { const c = pendingPaste; pendingPaste = null; replayPaste(c); } }, 400);
}, true);

pasteSink.addEventListener("paste", e => {
  e.preventDefault();
  if (!pendingPaste) return;                    // one paste per keypress
  clearTimeout(pasteT);
  const combo = pendingPaste; pendingPaste = null;
  pasteInto(e.clipboardData && e.clipboardData.getData("text/plain"), combo);
});

// Without spice-vdagent in the guest (servers, text consoles, most live ISOs)
// its clipboard never sees the text and a forwarded Ctrl+V pastes nothing, so
// the text is typed in as keystrokes instead.
const TYPE_CONFIRM_CHARS = 2000;
function pasteInto(text, combo) {
  if (env && env.clipboard !== false && env.clipboardAgent) {
    if (text) pushToGuest(text);
    setTimeout(() => replayPaste(combo), 120);
    return;
  }
  if (!text) { rfb && rfb.focus(); return toast("Nothing to paste", "bad"); }
  if (text.length > TYPE_CONFIRM_CHARS && !confirm("This VM has no clipboard agent, so the " + text.length +
      " characters are typed in one by one (about " + Math.ceil(text.length * 0.03) + " s). Type them?")) { rfb && rfb.focus(); return; }
  // The real modifiers were let go in the guest when focus left the console;
  // make sure, or Ctrl would turn every typed letter into a shortcut.
  if (rfb && rfb._keyboard) rfb._keyboard._allKeysUp();
  typeText(text);
}

// Send the paste to the guest: just the letter/Insert while the modifier is
// still held there, else the whole chord (it was let go while the box had focus).
function replayPaste(combo) {
  if (!rfb) return;
  const held = rfb._keyboard ? rfb._keyboard._keyDownList : {};
  const [mod, modCode, mods] = combo.insert ? [0xffe1, "ShiftLeft", ["ShiftLeft", "ShiftRight"]] : [0xffe3, "ControlLeft", ["ControlLeft", "ControlRight"]];
  const down = mods.some(c => c in held);
  if (!down) rfb.sendKey(mod, modCode, true);
  if (combo.insert) { rfb.sendKey(0xff63, "Insert", true); rfb.sendKey(0xff63, "Insert", false); }
  else { rfb.sendKey(0x0076, "KeyV", true); rfb.sendKey(0x0076, "KeyV", false); }
  if (!down) rfb.sendKey(mod, modCode, false);
  rfb.focus();
}

window.addEventListener("mousedown", () => { lastUserGesture = Date.now(); }, true);
window.addEventListener("focus", () => { if (connected) syncHostClipboard(); });
$("#screen").addEventListener("mousedown", () => { if (connected) syncHostClipboard(); });

$("#clip-send").addEventListener("click", async () => { lastSentClip = null; await pushToGuest($("#clip-text").value); toast("Sent to the VM clipboard"); rfb && rfb.focus(); });
$("#clip-copy").addEventListener("click", async () => { const ok = await writeClipboard($("#clip-text").value); toast(ok ? "Copied to this computer" : "Copy blocked by the browser", ok ? "ok" : "bad"); });
$("#clip-type").addEventListener("click", () => { typeText($("#clip-text").value); });

// Type text as keystrokes — works at login prompts and in guests without vdagent.
// QEMU turns each keysym into a scancode of the guest's (US) layout but does not
// add Shift by itself, so capitals and symbols are wrapped in a Shift press, and
// each character is sent as its unshifted key with the physical key code.
const SHIFTED = { "~": "`", "!": "1", "@": "2", "#": "3", "$": "4", "%": "5", "^": "6", "&": "7", "*": "8", "(": "9", ")": "0",
  "_": "-", "+": "=", "{": "[", "}": "]", "|": "\\", ":": ";", "\"": "'", "<": ",", ">": ".", "?": "/" };
const CODE_OF = { "`": "Backquote", "-": "Minus", "=": "Equal", "[": "BracketLeft", "]": "BracketRight", "\\": "Backslash",
  ";": "Semicolon", "'": "Quote", ",": "Comma", ".": "Period", "/": "Slash", " ": "Space" };
function keyFor(ch) {
  if (ch === "\n") return { keysym: XK.Return, code: "Enter" };
  if (ch === "\t") return { keysym: XK.Tab, code: "Tab" };
  let shift = false, base = ch;
  if (/^[A-Z]$/.test(ch)) { shift = true; base = ch.toLowerCase(); }
  else if (SHIFTED[ch]) { shift = true; base = SHIFTED[ch]; }
  let code = null;
  if (/^[a-z]$/.test(base)) code = "Key" + base.toUpperCase();
  else if (/^[0-9]$/.test(base)) code = "Digit" + base;
  else if (CODE_OF[base]) code = CODE_OF[base];
  const cp = ch.codePointAt(0);
  // Keysym of the character itself (Latin-1 maps 1:1; beyond that, Unicode keysyms).
  const keysym = cp < 0x100 ? cp : 0x01000000 + cp;
  return { keysym, code, shift };
}
let typing = false;
async function typeText(text) {
  if (!rfb) return toast("Console not connected", "bad");
  if (typing) return toast("Still typing the last text", "bad");
  rfb.focus();
  typing = true;
  try { await typeKeys(text); } finally { typing = false; }
}
async function typeKeys(text) {
  const pause = () => new Promise(r => setTimeout(r, 14));
  for (const ch of String(text).replace(/\r\n/g, "\n")) {
    if (!rfb) return;                           // console went away mid-text
    const k = keyFor(ch);
    if (k.shift) { rfb.sendKey(XK.Shift_L, "ShiftLeft", true); await pause(); }
    rfb.sendKey(k.keysym, k.code, true);
    rfb.sendKey(k.keysym, k.code, false);
    if (k.shift) { await pause(); rfb.sendKey(XK.Shift_L, "ShiftLeft", false); }
    await pause();
  }
}

// ── Toolbar ───────────────────────────────────────────────────────────────────
$("#b-cad").addEventListener("click", () => { rfb && rfb.sendCtrlAltDel(); rfb && rfb.focus(); });
$("#b-clip").addEventListener("click", () => { const d = $("#drawer"); d.hidden = !d.hidden; setTimeout(() => rfb && (rfb.scaleViewport = scaleFit), 50); });
$("#b-scale").addEventListener("click", () => {
  scaleFit = !scaleFit;
  if (rfb) { rfb.scaleViewport = scaleFit; rfb.clipViewport = !scaleFit; }
  $("#b-scale").innerHTML = ""; $("#b-scale").append(icon(scaleFit ? "fa-solid fa-expand" : "fa-solid fa-compress"), scaleFit ? " Fit" : " 1:1");
});
$("#b-full").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().then(() => { try { navigator.keyboard && navigator.keyboard.lock && navigator.keyboard.lock(); } catch (e) {} }).catch(() => {});
});

const keysMenu = $("#m-keys");
[
  ["Ctrl+Alt+Del", [XK.Control_L, XK.Alt_L, XK.Delete]],
  ["Windows / Super key", [XK.Super_L]],
  ["Alt+Tab", [XK.Alt_L, XK.Tab]],
  ["Ctrl+Alt+T (terminal)", [XK.Control_L, XK.Alt_L, 0x74]],
  ["Ctrl+Shift+Esc", [XK.Control_L, XK.Shift_L, XK.Escape]],
  ["Print Screen", [XK.Print]],
  ["-"],
  ...[1, 2, 3, 4, 5, 6, 7].map(n => ["Ctrl+Alt+F" + n, [XK.Control_L, XK.Alt_L, XK.F(n)]]),
].forEach(([label, keys]) => {
  if (label === "-") return keysMenu.appendChild(h("hr"));
  keysMenu.appendChild(h("button", { onclick: () => { closeMenus(); sendCombo(keys); rfb && rfb.focus(); } }, label));
});

function closeMenus() { document.querySelectorAll(".menu.on").forEach(m => m.classList.remove("on")); }
document.addEventListener("click", e => { if (!e.target.closest(".menu-wrap")) closeMenus(); });
$("#b-keys").addEventListener("click", e => { e.stopPropagation(); const on = keysMenu.classList.contains("on"); closeMenus(); keysMenu.classList.toggle("on", !on); });
const qualityMenu = $("#m-quality");
Object.entries(QUALITY).forEach(([id, q]) => {
  qualityMenu.appendChild(h("button", { "data-q": id, onclick: () => {
    closeMenus();
    quality = id;
    try { localStorage.setItem("vmlab-console-quality", id); } catch (e) {}
    applyQuality();
    rfb && rfb.focus();
  } }, h("span", null, q.label), h("span", { class: "sub" }, q.sub)));
});
applyQuality();
$("#b-conn").addEventListener("click", e => { e.stopPropagation(); const m = $("#m-conn"), on = m.classList.contains("on"); closeMenus(); m.classList.toggle("on", !on); if (!on) loadConnection(); });
$("#m-conn").addEventListener("click", e => e.stopPropagation());
$("#b-quality").addEventListener("click", e => { e.stopPropagation(); const on = qualityMenu.classList.contains("on"); closeMenus(); qualityMenu.classList.toggle("on", !on); });
$("#b-power").addEventListener("click", e => { e.stopPropagation(); const m = $("#m-power"), on = m.classList.contains("on"); closeMenus(); m.classList.toggle("on", !on); });
$("#m-power").querySelectorAll("button").forEach(b => b.addEventListener("click", async () => {
  closeMenus();
  const p = b.dataset.p;
  if ((p === "stop" || p === "force-stop") && env && !env.persistent && !confirm("This environment is ephemeral: shutting it down deletes it and everything inside. Continue?")) return;
  if (p === "force-stop" && env && env.persistent && !confirm("Force off is like pulling the power cord. Unsaved work in the VM is lost. Continue?")) return;
  try { await api("POST", "/api/vmlab/envs/" + ID + "/" + p); toast(p === "stop" ? "Shutdown requested" : p === "reboot" ? "Rebooted" : "Powered off"); refresh(); }
  catch (e) { toast(e.message, "bad"); }
}));

// ── USB ───────────────────────────────────────────────────────────────────────
let usbDevices = [];
async function loadUsb() {
  if (!env || !env.usb || !env.usb.enabled) return;
  try { usbDevices = await api("GET", "/api/vmlab/usb"); paintUsb(); } catch (e) {}
}
function paintUsb() {
  const list = $("#usb-list"); if (!env || !env.usb || !env.usb.enabled) return;
  list.innerHTML = "";
  if (!usbDevices.length) { list.appendChild(h("div", { class: "hint" }, "No USB devices on the host.")); return; }
  usbDevices.forEach(d => {
    const mine = d.attachedTo && d.attachedTo.envId === ID;
    const other = d.attachedTo && !mine;
    const cb = h("input", { type: "checkbox", checked: mine, disabled: !env.running || other || (!d.accessible && !mine) });
    cb.addEventListener("change", async () => {
      cb.disabled = true;
      try {
        if (cb.checked) { await api("POST", "/api/vmlab/envs/" + ID + "/usb", { busnum: d.busnum, devnum: d.devnum }); toast(d.product + " attached"); }
        else { await api("DELETE", "/api/vmlab/envs/" + ID + "/usb/" + d.attachedTo.qid); toast(d.product + " detached"); }
      } catch (e) { toast(e.message, "bad"); }
      loadUsb();
    });
    list.appendChild(h("label", { title: d.node + (d.accessible ? "" : " — run tools/vmlab/setup-host.sh on the host") }, cb,
      h("span", { style: { flex: 1 } }, d.product, h("div", { class: "hint", style: { margin: 0 } }, d.vendorId + ":" + d.productId + (d.hid ? " · input device" : ""))),
      other ? h("span", { class: "badge" }, d.attachedTo.envName) : !d.accessible ? h("span", { class: "badge r" }, "no permission") : null));
  });
}
$("#usb-refresh").addEventListener("click", loadUsb);

// ── Boot ──────────────────────────────────────────────────────────────────────
VL.onServerEvents(d => { if (!d.id || d.id === ID) refreshSoon(); if (d.what === "envs" && d.event === "discarded" && d.id === ID) refresh(); });
let rT = null; function refreshSoon() { clearTimeout(rT); rT = setTimeout(refresh, 300); }
setInterval(() => { if (!document.hidden) refresh(); }, 5000);
setInterval(() => { if (!document.hidden && env && env.usb && env.usb.enabled && !$("#drawer").hidden) loadUsb(); }, 6000);
refresh().then(loadUsb);
loadConnection();
// A tailnet path can switch between relayed and direct while the page is open.
setInterval(() => { if (!document.hidden) loadConnection(); }, 30000);
