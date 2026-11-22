/* PC host — remote desktop viewer (noVNC). Loaded as an ES module. */
import RFB from "/vmlab/novnc/core/rfb.js";

const { api, h, icon, toast, writeClipboard, readClipboard, clipboardMode } = window.VL;
const ID = document.body.dataset.laptop;
const NAME = document.body.dataset.name;
const $ = s => document.querySelector(s);

// Gridlantis-HL signs in to the laptop itself and hands this page a session that is
// already authenticated, so there is never a password prompt here.
let rfb = null, connected = false, retry = 0, reconnectT = null, gaveUp = false;
let scaleFit = true, viewOnly = false, remoteClip = "", lastSent = null, lastGesture = 0;
const mode = clipboardMode();

// Which monitor to show: -1 is all of them side by side. The PC's service puts
// its monitor layout in the desktop name (see tools/laptop/setup-remote.sh).
const MON_KEY = "openhl-pc-monitor:" + ID;
let monitors = [], monIdx = -1;
try { monIdx = Number(localStorage.getItem(MON_KEY) ?? -1); } catch (e) {}

function setStatus(text, dot) {
  $("#c-status").textContent = text;
  $("#c-dot").className = "dot " + (dot || "");
}
function showOverlay(title, text, actions) {
  $("#overlay").hidden = false;
  $("#ov-title").textContent = title;
  $("#ov-text").textContent = text || "";
  const a = $("#ov-acts"); a.innerHTML = ""; (actions || []).forEach(x => a.appendChild(x));
}
const hideOverlay = () => { $("#overlay").hidden = true; };
const backBtn = () => h("a", { class: "btn", href: "/laptops" }, icon("fa-solid fa-arrow-left"), "PC host");
const retryBtn = () => h("button", { class: "btn primary", onclick: () => { retry = 0; gaveUp = false; connect(); } }, icon("fa-solid fa-rotate"), "Try again");

// ── VNC ───────────────────────────────────────────────────────────────────────
function connect() {
  clearTimeout(reconnectT);
  const url = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/laptops/" + encodeURIComponent(ID) + "/vnc";
  if (!connected) showOverlay(retry ? "Reconnecting…" : "Connecting to " + NAME + "…", "", [backBtn()]);
  setStatus("connecting…", "starting");
  rfb = new RFB($("#screen"), url, { wsProtocols: ["binary"] });
  rfb.scaleViewport = scaleFit;
  rfb.resizeSession = false;
  rfb.focusOnClick = true;
  rfb.viewOnly = viewOnly;
  rfb.background = "#000";
  cropToMonitor(rfb);
  rfb.addEventListener("connect", () => {
    connected = true; retry = 0; hideOverlay();
    setStatus("connected", "running");
    rfb.focus();
    syncLocalClipboard();
    startBridge();
  });
  rfb.addEventListener("disconnect", async () => {
    const wasConnected = connected;
    connected = false; rfb = null; lastSent = null;
    stopBridge();
    setStatus("disconnected", "error");
    if (gaveUp) return;
    // Ask Gridlantis-HL why: asleep, off the tailnet, service down, or a stale password.
    let st = null;
    try { st = await api("GET", "/api/laptops/" + encodeURIComponent(ID) + "/status?force=1"); } catch (e) {}
    if (st && st.auth) {
      gaveUp = true;
      return showOverlay("The PC rejected Gridlantis-HL's password", st.error, [backBtn()]);
    }
    retry++;
    if (retry > 6) {
      gaveUp = true;
      return showOverlay("Can't reach " + NAME, (st && st.error) || "The connection keeps dropping.", [retryBtn(), backBtn()]);
    }
    showOverlay(wasConnected ? "Connection lost — reconnecting…" : "Can't reach " + NAME + " yet — retrying…", (st && st.error) || "", [backBtn()]);
    reconnectT = setTimeout(connect, Math.min(10000, 1000 * retry));
  });
  rfb.addEventListener("clipboard", e => onRemoteClipboard(e.detail.text));
  rfb.addEventListener("desktopname", e => {
    const { desktop, list } = parseDesktopName((e.detail && e.detail.name) || "");
    $("#c-status").title = desktop;
    // x11vnc names the desktop "host:display"; krfb "user@host (shared desktop)".
    utf8Paste = /^\S+:\d+(\.\d+)?$/.test(desktop);
    monitors = list;
    paintMonitorBar();
  });
}

// ── Monitors ─────────────────────────────────────────────────────────────────
// " openhl-monitors=WxH+X+Y/OUTPUT,…" in the desktop name. Numbered
// left to right, the way they sit on the desk.
function parseDesktopName(name) {
  let mons = null;
  const desktop = name.replace(/\s+openhl-([a-z]+)=(\S*)/g, (_, k, v) => { if (k === "monitors") mons = v; return ""; }).trim();
  if (mons == null) return { desktop, list: [] };
  const list = mons.split(",").map(s => /^(\d+)x(\d+)\+(\d+)\+(\d+)(?:\/(.*))?$/.exec(s)).filter(Boolean)
    .map(g => ({ w: +g[1], h: +g[2], x: +g[3], y: +g[4], name: g[5] || "" }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  return { desktop, list };
}
const currentMonitor = () => (monitors.length > 1 && monitors[monIdx]) || null;

// noVNC can only clip its viewport to the window, so take over that one step.
// The part of the PC's screen on show is "the view": the picked monitor (or
// the whole desktop), and when zoomed, the piece of it that fits the window at
// that zoom. noVNC then scales the view to the window as usual, and pointer
// events already add the view's offset, so clicks land in the right place.
//
// Zoom is in screen pixels per PC pixel: null is Fit (the whole view), 1 is
// real size. It works the same on a phone, where noVNC's own 1:1 mode can't be
// scrolled (every touch is the mouse): pinch to zoom, two fingers to move.
const zoom = { s: null, cx: null, cy: null };
const MAX_ZOOM = 3;
function viewBase(r) {
  const m = currentMonitor();
  return m || { x: 0, y: 0, w: r._display.width, h: r._display.height };
}
function fitScale(r) {
  const b = viewBase(r), size = r._screenSize();
  return b.w && b.h ? Math.min(size.w / b.w, size.h / b.h) : 1;
}
function cropToMonitor(r) {
  const base = r._updateClip;
  r._updateClip = function () {
    const m = currentMonitor();
    if (!m && zoom.s === null) return base.call(this);
    const d = this._display, b = viewBase(this), size = this._screenSize();
    if (!b.w || !b.h || !size.w || !size.h) return base.call(this);
    const fit = Math.min(size.w / b.w, size.h / b.h);
    const sc = zoom.s === null ? fit : Math.min(MAX_ZOOM, Math.max(fit, zoom.s));
    const w = Math.min(b.w, Math.round(size.w / sc)), hgt = Math.min(b.h, Math.round(size.h / sc));
    if (zoom.cx === null) { zoom.cx = b.x + b.w / 2; zoom.cy = b.y + b.h / 2; }
    zoom.cx = Math.min(b.x + b.w - w / 2, Math.max(b.x + w / 2, zoom.cx));
    zoom.cy = Math.min(b.y + b.h - hgt / 2, Math.max(b.y + hgt / 2, zoom.cy));
    if (!d.clipViewport) d.clipViewport = true;
    d.viewportChangeSize(w, hgt);
    const vp = d._viewportLoc;
    d.viewportChangePos(Math.round(zoom.cx - w / 2) - vp.x, Math.round(zoom.cy - hgt / 2) - vp.y);
    this._setClippingViewport(false);
  };
}
function applyView() {
  if (!rfb) return;
  rfb._updateClip(); rfb._updateScale();
  const b = $("#b-scale");
  const pct = zoom.s === null ? null : Math.round(Math.min(MAX_ZOOM, Math.max(fitScale(rfb), zoom.s)) * 100);
  b.lastChild.textContent = pct === null ? " Fit" : pct === 100 ? " 1:1" : " " + pct + "%";
  b.title = zoom.s === null ? "Showing the whole screen — tap for real size (pinch to zoom)" : "Zoomed — tap to fit the whole screen";
}
// Set the zoom, keeping the PC point under (clientX, clientY) where it is.
function setZoom(s, clientX, clientY) {
  if (!rfb) return;
  const fit = fitScale(rfb);
  const d = rfb._display;
  let px = null, py = null;
  if (clientX !== undefined) {
    const rect = rfb._canvas.getBoundingClientRect();
    px = d.absX(clientX - rect.left); py = d.absY(clientY - rect.top);
  }
  zoom.s = s === null || s <= fit * 1.02 ? null : Math.min(MAX_ZOOM, s);
  if (zoom.s === null) { zoom.cx = zoom.cy = null; applyView(); return; }
  if (px !== null) {
    const rect = rfb._screen.getBoundingClientRect();
    // After zooming, (px,py) should sit at the same spot in the window.
    zoom.cx = px + (rect.left + rect.width / 2 - clientX) / zoom.s;
    zoom.cy = py + (rect.top + rect.height / 2 - clientY) / zoom.s;
  }
  applyView();
}
function panBy(dx, dy) {   // in window pixels
  if (!rfb || zoom.s === null) return;
  zoom.cx -= dx / zoom.s; zoom.cy -= dy / zoom.s;
  applyView();
}
// Pinch zooms here instead of sending Ctrl+scroll to the PC; a two-finger drag
// moves around while zoomed (at Fit it still scrolls on the PC). noVNC's
// gesture events are caught on the way down to its canvas.
function zoomGestures(screenEl) {
  let g = null;
  const handle = ev => {
    const det = ev.detail || {};
    if (!rfb || (det.type !== "pinch" && det.type !== "twodrag")) return;
    if (det.type === "twodrag" && zoom.s === null && !(g && g.type === "pinch")) return;   // scroll on the PC
    ev.stopPropagation();
    if (ev.type === "gesturestart") {
      g = { type: det.type, dist: Math.hypot(det.magnitudeX, det.magnitudeY) || 1,
            s: zoom.s === null ? fitScale(rfb) : zoom.s, mx: 0, my: 0, x: det.clientX, y: det.clientY };
      return;
    }
    if (!g) return;
    if (det.type === "pinch") {
      setZoom(g.s * Math.hypot(det.magnitudeX, det.magnitudeY) / g.dist, g.x, g.y);
    } else {
      panBy(det.magnitudeX - g.mx, det.magnitudeY - g.my);
      g.mx = det.magnitudeX; g.my = det.magnitudeY;
    }
    if (ev.type === "gestureend") g = null;
  };
  ["gesturestart", "gesturemove", "gestureend"].forEach(t => screenEl.addEventListener(t, handle, true));
  // Ctrl + mouse wheel zooms on a computer.
  screenEl.addEventListener("wheel", e => {
    if (!e.ctrlKey || !rfb) return;
    e.preventDefault(); e.stopPropagation();
    const cur = zoom.s === null ? fitScale(rfb) : zoom.s;
    setZoom(cur * Math.exp(-e.deltaY / 300), e.clientX, e.clientY);
  }, { capture: true, passive: false });
}
zoomGestures($("#screen"));
window.addEventListener("resize", () => { if (rfb && zoom.s !== null) applyView(); });
function showMonitor(i) {
  monIdx = i;
  try { localStorage.setItem(MON_KEY, String(i)); } catch (e) {}
  paintMonitorBar();
  zoom.s = null; zoom.cx = zoom.cy = null;
  applyView();
}
function paintMonitorBar() {
  const bar = $("#mon");
  bar.innerHTML = "";
  bar.hidden = monitors.length < 2;
  if (bar.hidden) return;
  if (monIdx >= monitors.length) monIdx = -1;
  const btn = (i, label, title) => h("button", { class: "btn sm" + (i === monIdx ? " primary" : ""), title, onclick: () => showMonitor(i) }, label);
  bar.appendChild(btn(-1, [icon("fa-solid fa-display"), monitors.length === 2 ? " Both" : " All"], "Show every monitor"));
  monitors.forEach((m, i) => bar.appendChild(btn(i, String(i + 1), "Monitor " + (i + 1) + (m.name ? " — " + m.name : "") + " (" + m.w + "×" + m.h + ")")));
}

// ── Clipboard ────────────────────────────────────────────────────────────────
// Laptop → here: mirrored into the local clipboard when the browser allows it.
// Here → laptop: pushed whenever the viewer gains focus, and before each Ctrl+V.
async function onRemoteClipboard(text) {
  if (text === remoteClip) return;
  remoteClip = text; lastSent = text;
  $("#clip-text").value = text;
  let ok = false;
  if (mode !== "basic" || Date.now() - lastGesture < 4000) ok = await writeClipboard(text);
  if (!ok) toast("Copied on the PC — open Clipboard and press Copy");
}
// x11vnc keeps pasted bytes as they come and offers them to apps as UTF-8
// (UTF8_STRING), which is what browsers, terminals and GTK/Qt apps ask for. The
// standard VNC paste is Latin-1, so "café" landed as "caf�" and emoji as "?".
// Send it UTF-8 instead. Other servers (krfb) get the standard message.
let utf8Paste = false;
// Resolves once the PC's clipboard holds the text (as far as we can tell).
function pushToRemote(text) {
  if (!rfb || text == null || text === lastSent) return Promise.resolve();
  lastSent = remoteClip = text;
  $("#clip-text").value = text;
  if (bridge) {
    return api("POST", "/api/laptops/" + encodeURIComponent(ID) + "/clipboard", { text })
      .catch(e => toast("Could not set the PC's clipboard: " + e.message, "bad"));
  }
  if (utf8Paste && !/^[\x00-\x7f]*$/.test(text) && rfb._rfbConnectionState === "connected" && !rfb._viewOnly) {
    RFB.messages.clientCutText(rfb._sock, new TextEncoder().encode(text));
  } else {
    rfb.clipboardPasteFrom(text);
  }
  return Promise.resolve();
}

// KDE on Wayland: krfb cannot reach the clipboard, so the setup script adds a
// small bridge to Klipper and Gridlantis-HL relays it (domains/laptops/clip.js). Used
// whenever the PC has one; the first reading is only a baseline, so opening
// the viewer never overwrites this computer's clipboard.
let bridge = false, clipSeq = null, clipPollT = null, clipBusy = false;
async function pollBridge() {
  if (clipBusy || !connected || document.hidden) return;
  clipBusy = true;
  try {
    const r = await api("GET", "/api/laptops/" + encodeURIComponent(ID) + "/clipboard");
    if (!r.available) { bridge = false; return stopBridge(); }
    bridge = true;
    if (!r.ready || r.seq === clipSeq) return;
    const first = clipSeq === null;
    clipSeq = r.seq;
    if (first) { if (!lastSent) { remoteClip = r.text; $("#clip-text").value = r.text; } return; }
    if (r.text !== lastSent) onRemoteClipboard(r.text);
  } catch (e) {} finally { clipBusy = false; }
}
function startBridge() {
  stopBridge(); clipSeq = null;
  pollBridge();
  clipPollT = setInterval(pollBridge, 700);
}
function stopBridge() { clearInterval(clipPollT); clipPollT = null; }
async function syncLocalClipboard() {
  if (mode === "basic") return;
  const text = await readClipboard();
  if (text) pushToRemote(text);
}

const pressV = () => { if (rfb) { rfb.sendKey(0x0076, "KeyV", true); rfb.sendKey(0x0076, "KeyV", false); rfb.focus(); } };
// Ctrl+V on the PC: just V if Ctrl is still held there, else the whole chord
// (the user let go while focus was in the paste box below).
const ctrlHeld = () => { const k = rfb && rfb._keyboard && rfb._keyboard._keyDownList; return !!k && ("ControlLeft" in k || "ControlRight" in k); };
const pressCtrlV = () => {
  if (!rfb) return;
  if (ctrlHeld()) return pressV();
  rfb.sendKey(0xffe3, "ControlLeft", true);
  rfb.sendKey(0x0076, "KeyV", true); rfb.sendKey(0x0076, "KeyV", false);
  rfb.sendKey(0xffe3, "ControlLeft", false);
  rfb.focus();
};

// In a browser the clipboard usually cannot be read on demand (Gridlantis-HL is plain
// http on the tailnet, and even on https it asks permission), but the browser
// still hands a real paste its text. So on Ctrl+V: let noVNC skip the V, move
// focus to this hidden box so the browser's own paste lands here, forward the
// text to the PC's clipboard, then press Ctrl+V there.
const pasteSink = h("textarea", { "aria-hidden": "true", tabindex: "-1", autocomplete: "off",
  style: { position: "fixed", left: "-9999px", top: "0", width: "1px", height: "1px", opacity: "0" } });
document.body.appendChild(pasteSink);
// Key releases while the box has focus still belong to the PC, or Ctrl would
// stay stuck down there.
pasteSink.addEventListener("keyup", e => { if (rfb && rfb._keyboard) rfb._keyboard._handleKeyUp(e); });
// One paste per keypress: a second paste event (some shortcuts fire two) or a
// late one after the fallback must not paste into the PC again.
let pasteT = null, pastePending = false;
// Press the paste keys once the text is on the PC's clipboard: a short beat for
// VNC's own clipboard, the bridge's answer (at most 2s) otherwise.
function afterPush(p, press) {
  const t0 = Date.now();
  Promise.race([p || Promise.resolve(), new Promise(r => setTimeout(r, 2000))])
    .then(() => setTimeout(press, Math.max(0, 120 - (Date.now() - t0))));
}
pasteSink.addEventListener("paste", e => {
  e.preventDefault();
  if (!pastePending) return;
  pastePending = false;
  clearTimeout(pasteT);
  const text = e.clipboardData && e.clipboardData.getData("text/plain");
  afterPush(text ? pushToRemote(text) : null, pressCtrlV);
});

window.addEventListener("keydown", async e => {
  lastGesture = Date.now();
  if (!rfb || !connected || viewOnly) return;
  if (!($("#screen").contains(document.activeElement) || document.activeElement === document.body)) return;
  if (!((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V"))) return;
  e.stopImmediatePropagation();
  if (mode === "desktop") {
    // The desktop app can read the clipboard directly.
    e.preventDefault();
    const text = await readClipboard();
    afterPush(text ? pushToRemote(text) : null, pressCtrlV);
    return;
  }
  pasteSink.value = "";
  pasteSink.focus();
  pastePending = true;
  // A browser that does not fire paste here still gets the keystroke, using
  // whatever the PC's clipboard already holds.
  clearTimeout(pasteT);
  pasteT = setTimeout(() => { if (pastePending) { pastePending = false; pressCtrlV(); } }, 400);
}, true);
window.addEventListener("mousedown", () => { lastGesture = Date.now(); }, true);
window.addEventListener("focus", () => { if (connected) syncLocalClipboard(); });

// Type text as keystrokes — works at a login screen, where no clipboard exists.
function typeText(text) {
  if (!rfb) return;
  for (const ch of text) {
    const code = ch === "\n" ? 0xff0d : ch.codePointAt(0) < 256 ? ch.codePointAt(0) : 0x01000000 + ch.codePointAt(0);
    rfb.sendKey(code, null, true); rfb.sendKey(code, null, false);
  }
}

// ── On-screen keyboard (phones and tablets) ─────────────────────────────────
// The phone's own keyboard types into a hidden textarea. Phone keyboards
// rarely send real key events (Android reports keyCode 229 for everything and
// composes whole words for prediction and autocorrect), so the textarea's
// text is compared before and after each change and the difference goes to
// the PC as BackSpaces plus the new characters. A bar of special keys sits on
// top of the phone keyboard; Ctrl/Alt/Shift/Super are sticky: tap for the next
// key only, double-tap to keep it down.
const KS = {
  Esc: 0xff1b, Tab: 0xff09, Enter: 0xff0d, BackSpace: 0xff08, Del: 0xffff,
  Left: 0xff51, Up: 0xff52, Right: 0xff53, Down: 0xff54, Home: 0xff50, End: 0xff57, PgUp: 0xff55, PgDn: 0xff56,
  Ctrl: 0xffe3, Alt: 0xffe9, Shift: 0xffe1, Super: 0xffeb,
};
const charKeysym = ch => ch === "\n" ? KS.Enter : ch === "\t" ? KS.Tab
  : ch.codePointAt(0) < 256 ? ch.codePointAt(0) : 0x01000000 + ch.codePointAt(0);
// The textarea never runs empty, so Backspace on an "empty" line still fires.
const OSK_PAD = "        ";
const osk = { open: false, last: OSK_PAD, composing: false, mods: {}, fn: false };
const oskIn = $("#osk-in"), oskBar = $("#osk");

// Press a key on the PC with whatever sticky modifiers are on, then let go of
// the one-shot ones.
function oskKey(keysym) {
  lastModTap = { m: null, t: 0 };
  if (!rfb || viewOnly) return;
  const held = Object.keys(osk.mods).filter(m => osk.mods[m]);
  held.forEach(m => rfb.sendKey(KS[m], null, true));
  rfb.sendKey(keysym, null, true); rfb.sendKey(keysym, null, false);
  held.slice().reverse().forEach(m => rfb.sendKey(KS[m], null, false));
  let changed = false;
  for (const m of held) if (osk.mods[m] === "once") { osk.mods[m] = false; changed = true; }
  if (changed) paintOsk();
}
function oskText(text) {
  for (const ch of text) {
    // A sticky Ctrl/Alt/Super turns a letter into a shortcut (Ctrl+C), and that
    // wants the plain lower-case key.
    const mod = osk.mods.Ctrl || osk.mods.Alt || osk.mods.Super;
    oskKey(mod && /^[A-Z]$/.test(ch) ? ch.toLowerCase().codePointAt(0) : charKeysym(ch));
  }
}
function oskSync() {
  const now = oskIn.value;
  let i = 0;
  while (i < now.length && i < osk.last.length && now[i] === osk.last[i]) i++;
  for (let n = osk.last.length - i; n > 0; n--) oskKey(KS.BackSpace);
  oskText(now.slice(i));
  osk.last = now;
  // Start over once a word is done, so the text never grows and autocorrect
  // never reaches back into what the PC already has.
  if (!osk.composing && (/[\s.,!?;:]$/.test(now) || now.length > 40 || now.length < OSK_PAD.length)) oskReset();
}
function oskReset() {
  oskIn.value = OSK_PAD; osk.last = OSK_PAD;
  try { oskIn.setSelectionRange(OSK_PAD.length, OSK_PAD.length); } catch (e) {}
}
oskIn.addEventListener("compositionstart", () => { osk.composing = true; });
oskIn.addEventListener("compositionend", () => { osk.composing = false; oskSync(); });
oskIn.addEventListener("input", oskSync);
// Keys a phone keyboard does report (Enter on most, arrows and Esc on tablets
// with a hardware keyboard) go straight through.
oskIn.addEventListener("keydown", e => {
  const map = { Enter: KS.Enter, Tab: KS.Tab, Escape: KS.Esc, ArrowLeft: KS.Left, ArrowRight: KS.Right, ArrowUp: KS.Up, ArrowDown: KS.Down,
    Home: KS.Home, End: KS.End, PageUp: KS.PgUp, PageDown: KS.PgDn, Delete: KS.Del };
  if (e.isComposing || e.keyCode === 229) return;
  if (map[e.key]) { e.preventDefault(); oskKey(map[e.key]); return; }
  // An empty box gives no input event for Backspace; the pad prevents that,
  // but a real key event is the more direct signal when there is one.
  if (e.key === "Backspace" && oskIn.value.length <= OSK_PAD.length) { e.preventDefault(); oskKey(KS.BackSpace); }
});
// Keep the caret at the end so new text always lands after the pad.
oskIn.addEventListener("focus", () => setTimeout(() => { try { oskIn.setSelectionRange(oskIn.value.length, oskIn.value.length); } catch (e) {} }, 0));

function oskButton(label, title, onTap, cls) {
  const b = h("button", { type: "button", title, class: cls || "" }, label);
  // pointerdown + preventDefault keeps focus (and the phone keyboard) in the textarea.
  b.addEventListener("pointerdown", e => { e.preventDefault(); onTap(e); });
  return b;
}
let lastModTap = { m: null, t: 0 };
function tapMod(m) {
  const now = Date.now();
  // A held (locked) key always lets go on the next tap; otherwise a second
  // tap in quick succession turns one-shot into held.
  if (osk.mods[m] === "lock") osk.mods[m] = false;
  else if (osk.mods[m] === "once" && lastModTap.m === m && now - lastModTap.t < 350) osk.mods[m] = "lock";
  else osk.mods[m] = osk.mods[m] ? false : "once";
  lastModTap = { m, t: now };
  paintOsk();
}
function paintOsk() {
  oskBar.innerHTML = "";
  const mod = m => oskButton(m, m + " — tap for the next key, double-tap to hold", () => tapMod(m), osk.mods[m] === "lock" ? "lock" : osk.mods[m] ? "on" : "");
  const key = (label, ks, title) => oskButton(label, title || label, () => oskKey(ks));
  const row1 = h("div", { class: "osk-row" },
    key("Esc", KS.Esc), key("Tab", KS.Tab), mod("Ctrl"), mod("Alt"), mod("Shift"), mod("Super"),
    oskButton(osk.fn ? "abc" : "F1–12", osk.fn ? "Back to the arrow keys" : "Function keys", () => { osk.fn = !osk.fn; paintOsk(); }),
    oskButton(icon("fa-solid fa-chevron-down"), "Hide the keyboard", () => setOsk(false)));
  const row2 = h("div", { class: "osk-row" });
  if (osk.fn) for (let n = 1; n <= 12; n++) row2.appendChild(key("F" + n, 0xffbd + n));
  else [key("←", KS.Left, "Left"), key("↓", KS.Down, "Down"), key("↑", KS.Up, "Up"), key("→", KS.Right, "Right"),
    key("Home", KS.Home), key("End", KS.End), key("PgUp", KS.PgUp), key("PgDn", KS.PgDn), key("Del", KS.Del),
    key("⌫", KS.BackSpace, "Backspace"), key("⏎", KS.Enter, "Enter")].forEach(b => row2.appendChild(b));
  oskBar.appendChild(row1); oskBar.appendChild(row2);
  placeOsk();
}
// Sit on top of the phone keyboard. Chrome on Android resizes the page for it
// (interactive-widget=resizes-content); Safari on iOS does not, so follow the
// visual viewport there.
function placeOsk() {
  if (!osk.open) return;
  const vv = window.visualViewport;
  const gap = vv ? Math.max(0, window.innerHeight - (vv.height + vv.offsetTop)) : 0;
  oskBar.style.bottom = gap + "px";
  document.querySelector(".stage").style.setProperty("--osk-h", (oskBar.offsetHeight + gap) + "px");
  applyView();
}
if (window.visualViewport) { visualViewport.addEventListener("resize", placeOsk); visualViewport.addEventListener("scroll", placeOsk); }
window.addEventListener("resize", placeOsk);

function setOsk(open) {
  osk.open = open;
  oskBar.hidden = !open;
  document.querySelector(".stage").classList.toggle("with-osk", open);
  $("#b-osk").classList.toggle("primary", open);
  if (open) {
    paintOsk(); oskReset();
    oskIn.focus({ preventScroll: true });
  } else {
    osk.mods = {}; oskIn.blur();
    document.querySelector(".stage").style.removeProperty("--osk-h");
    if (rfb) rfb.focus();
  }
  setTimeout(() => { if (rfb) window.dispatchEvent(new Event("resize")); }, 50);
}
$("#b-osk").addEventListener("click", () => setOsk(!osk.open));
// Tapping the PC's screen while the bar is open should bring the phone
// keyboard back (it hides when focus leaves the textarea).
$("#screen").addEventListener("touchend", () => { if (osk.open) setTimeout(() => oskIn.focus({ preventScroll: true }), 0); });

// ── Toolbar ──────────────────────────────────────────────────────────────────
$("#b-cad").addEventListener("click", () => { if (rfb) rfb.sendCtrlAltDel(); });
$("#b-clip").addEventListener("click", () => { $("#drawer").hidden = !$("#drawer").hidden; });
$("#b-scale").addEventListener("click", () => {
  if (!rfb) return;
  if (zoom.s !== null) setZoom(null);
  else {
    const r = rfb._screen.getBoundingClientRect();
    setZoom(Math.max(1, fitScale(rfb) * 1.5), r.left + r.width / 2, r.top + r.height / 2);
  }
});
$("#b-view").addEventListener("click", () => {
  viewOnly = !viewOnly;
  if (rfb) rfb.viewOnly = viewOnly;
  $("#b-view").classList.toggle("primary", viewOnly);
  toast(viewOnly ? "View only — your mouse and keys are not sent" : "Control restored");
});
$("#b-full").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
});
$("#clip-send").addEventListener("click", () => { pushToRemote($("#clip-text").value); toast("Sent to the PC's clipboard"); });
$("#clip-type").addEventListener("click", () => { typeText($("#clip-text").value); if (rfb) rfb.focus(); });
$("#clip-copy").addEventListener("click", async () => { toast(await writeClipboard($("#clip-text").value) ? "Copied" : "Copy failed", "ok"); });

connect();
