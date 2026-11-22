// Gridlantis-HL desktop — a native window around an Gridlantis-HL server.
//
// The app holds no Gridlantis-HL logic of its own: it remembers which server to open,
// keeps the login session, and adds what a browser tab cannot do well — a
// real clipboard bridge for VM consoles, window state, and optionally starting
// Gridlantis-HL itself when run on the host.
const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, shell } = require("electron");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { spawn } = require("child_process");

app.setName("Gridlantis-HL");
// Formerly Open HL: keep the old settings folder so saved servers carry over.
app.setPath("userData", path.join(app.getPath("appData"), "Open HL"));
if (process.platform === "win32") app.setAppUserModelId("local.openhl.desktop");
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const CONNECT_PAGE = path.join(__dirname, "connect", "index.html");
const PARTITION = "persist:openhl";
const SETTINGS_FILE = () => path.join(app.getPath("userData"), "settings.json");

// ── Settings ──────────────────────────────────────────────────────────────────
let settings = { servers: [], lastUrl: null, bounds: null, maximized: false, trusted: {}, localFolder: null };
function loadSettings() {
  try { settings = Object.assign(settings, JSON.parse(fs.readFileSync(SETTINGS_FILE(), "utf8"))); } catch {}
}
function saveSettings() {
  try { fs.mkdirSync(path.dirname(SETTINGS_FILE()), { recursive: true }); fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(settings, null, 2)); } catch {}
}

function normalizeUrl(input) {
  let u = String(input || "").trim();
  if (!u) throw new Error("Enter the server address");
  if (!/^https?:\/\//i.test(u)) u = "http://" + u;
  const x = new URL(u);
  if (!x.hostname) throw new Error("That address has no host name");
  return x.origin;
}
const originOf = u => { try { return new URL(u).origin; } catch { return null; } };

// ── Windows ──────────────────────────────────────────────────────────────────
let win = null, currentOrigin = null, localChild = null;

function webPreferences() {
  return { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false, partition: PARTITION, spellcheck: true };
}

function attachHandlers(w) {
  w.webContents.setWindowOpenHandler(({ url }) => {
    // Gridlantis-HL pages (e.g. a VM console opened in a new tab) get their own app window.
    if (currentOrigin && originOf(url) === currentOrigin) {
      return { action: "allow", overrideBrowserWindowOptions: {
        width: 1320, height: 880, backgroundColor: "#050508", autoHideMenuBar: true, icon: iconPath(), webPreferences: webPreferences() } };
    }
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  w.webContents.on("did-create-window", child => { child.setMenuBarVisibility(false); attachHandlers(child); });
  // Electron shows no context menu at all on its own, so right-click did
  // nothing. Build the parts of a browser's menu that make sense here.
  w.webContents.on("context-menu", (e, p) => {
    if (REMOTE_SCREEN.test(w.webContents.getURL())) return;   // right-click belongs to the remote desktop
    const wc = w.webContents, items = [];
    const sep = () => { if (items.length && items[items.length - 1].type !== "separator") items.push({ type: "separator" }); };
    if (p.misspelledWord) {
      for (const s of p.dictionarySuggestions.slice(0, 5)) items.push({ label: s, click: () => wc.replaceMisspelling(s) });
      if (!p.dictionarySuggestions.length) items.push({ label: "No suggestions", enabled: false });
      items.push({ label: "Add to dictionary", click: () => wc.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
      sep();
    }
    if (p.linkURL) {
      const sameApp = currentOrigin && originOf(p.linkURL) === currentOrigin;
      items.push({ label: sameApp ? "Open link in new window" : "Open link in browser",
        click: () => (sameApp ? openAppWindow : shell.openExternal)(p.linkURL) });
      items.push({ label: "Copy link address", click: () => clipboard.writeText(p.linkURL) });
      sep();
    }
    if (p.mediaType === "image" && p.srcURL) {
      items.push({ label: "Copy image", click: () => wc.copyImageAt(p.x, p.y) });
      items.push({ label: "Copy image address", click: () => clipboard.writeText(p.srcURL) });
      items.push({ label: "Save image as…", click: () => wc.downloadURL(p.srcURL) });
      sep();
    }
    const f = p.editFlags;
    if (p.isEditable) {
      items.push({ role: "undo", enabled: f.canUndo }, { role: "redo", enabled: f.canRedo }, { type: "separator" },
        { role: "cut", enabled: f.canCut }, { role: "copy", enabled: f.canCopy }, { role: "paste", enabled: f.canPaste },
        { role: "pasteAndMatchStyle", label: "Paste as plain text", enabled: f.canPaste }, { role: "selectAll" });
      sep();
    } else if (p.selectionText.trim()) {
      items.push({ role: "copy" });
      sep();
    }
    if (!p.isEditable && !p.linkURL && p.mediaType === "none") {
      const h = wc.navigationHistory;
      items.push({ label: "Back", enabled: h.canGoBack(), click: () => h.goBack() },
        { label: "Forward", enabled: h.canGoForward(), click: () => h.goForward() },
        { label: "Reload", click: () => wc.reload() });
      sep();
    }
    items.push({ label: "Inspect element", click: () => wc.inspectElement(p.x, p.y) });
    Menu.buildFromTemplate(items).popup({ window: w });
  });
  w.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith("file:")) return;
    if (currentOrigin && originOf(url) === currentOrigin) return;
    e.preventDefault();
    shell.openExternal(url);
  });
  // Keys a remote screen needs (Ctrl+R, F5, Ctrl+Shift+I…) go to the page there;
  // elsewhere the usual browser shortcuts work.
  w.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    const onConsole = REMOTE_SCREEN.test(w.webContents.getURL());
    const ctrl = input.control || input.meta;
    if (ctrl && input.shift && input.alt && input.key.toLowerCase() === "s") { e.preventDefault(); showConnect(); return; }
    if (onConsole) return;
    if (input.key === "F5" || (ctrl && !input.shift && input.key.toLowerCase() === "r")) { e.preventDefault(); w.webContents.reload(); }
    else if (input.key === "F11") { e.preventDefault(); w.setFullScreen(!w.isFullScreen()); }
    else if (ctrl && input.shift && input.key.toLowerCase() === "i") { e.preventDefault(); w.webContents.toggleDevTools(); }
    else if (ctrl && (input.key === "=" || input.key === "+")) { e.preventDefault(); w.webContents.setZoomLevel(w.webContents.getZoomLevel() + 0.5); }
    else if (ctrl && input.key === "-") { e.preventDefault(); w.webContents.setZoomLevel(w.webContents.getZoomLevel() - 0.5); }
    else if (ctrl && input.key === "0") { e.preventDefault(); w.webContents.setZoomLevel(0); }
    else if (input.alt && input.key === "ArrowLeft" && w.webContents.navigationHistory.canGoBack()) { e.preventDefault(); w.webContents.navigationHistory.goBack(); }
    else if (input.alt && input.key === "ArrowRight" && w.webContents.navigationHistory.canGoForward()) { e.preventDefault(); w.webContents.navigationHistory.goForward(); }
  });
}

// Pages that show a remote desktop: VM Lab consoles, the PC host viewer and
// the Mobile host phone mirror.
const REMOTE_SCREEN = /\/(vmlab\/console|laptops\/view|mobile\/view)\//;

function iconPath() { return path.join(__dirname, "build", "icon.png"); }

function openAppWindow(url) {
  const child = new BrowserWindow({ width: 1320, height: 880, backgroundColor: "#050508", autoHideMenuBar: true, icon: iconPath(), webPreferences: webPreferences() });
  child.setMenuBarVisibility(false);
  attachHandlers(child);
  child.loadURL(url);
}

function createWindow() {
  const b = settings.bounds || {};
  win = new BrowserWindow({
    width: b.width || 1400, height: b.height || 900, x: b.x, y: b.y, minWidth: 820, minHeight: 560,
    backgroundColor: "#0b0b10", title: "Gridlantis-HL", icon: iconPath(), show: false,
    autoHideMenuBar: true, webPreferences: webPreferences(),
  });
  // Hidden rather than auto-hide: a lone Alt press must reach VM consoles
  // instead of opening a menu bar.
  win.setMenuBarVisibility(false);
  if (settings.maximized) win.maximize();
  win.once("ready-to-show", () => win.show());
  const remember = () => {
    if (!win || win.isDestroyed()) return;
    settings.maximized = win.isMaximized();
    if (!settings.maximized && !win.isFullScreen()) settings.bounds = win.getBounds();
    saveSettings();
  };
  win.on("resize", debounce(remember, 500)); win.on("move", debounce(remember, 500)); win.on("close", remember);
  win.on("closed", () => { win = null; });

  attachHandlers(win);
  win.webContents.on("did-fail-load", (e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || url.startsWith("file:")) return;   // -3 = aborted (normal on redirects)
    showConnect({ error: "Could not reach " + originOf(url) + " (" + desc + ")", url: originOf(url) });
  });
  win.webContents.on("page-title-updated", (e, t) => { e.preventDefault(); win.setTitle(t && t !== "Gridlantis-HL" ? t : "Gridlantis-HL"); });

  if (settings.lastUrl) openServer(settings.lastUrl).catch(err => showConnect({ error: err.message, url: settings.lastUrl }));
  else showConnect();
}

function showConnect(state) {
  currentOrigin = null;
  if (!win) return;
  pendingConnectState = state || null;
  win.loadFile(CONNECT_PAGE);
}
let pendingConnectState = null;

async function openServer(url) {
  const origin = normalizeUrl(url);
  currentOrigin = origin;
  settings.lastUrl = origin;
  const existing = settings.servers.find(s => s.url === origin);
  if (existing) existing.lastUsed = Date.now();
  else settings.servers.push({ url: origin, name: new URL(origin).host, lastUsed: Date.now() });
  settings.servers.sort((a, b) => b.lastUsed - a.lastUsed);
  saveSettings();
  await win.loadURL(origin + "/");
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ── Probing a server ─────────────────────────────────────────────────────────
function probe(origin, timeoutMs = 6000) {
  return new Promise(resolve => {
    const u = new URL(origin + "/api/status");
    const mod = u.protocol === "https:" ? https : http;
    const trusted = settings.trusted[origin];
    const req = mod.get(u, { timeout: timeoutMs, rejectUnauthorized: false }, res => {
      const cert = res.socket.getPeerCertificate ? res.socket.getPeerCertificate() : null;
      const authorized = u.protocol !== "https:" || res.socket.authorized;
      const fingerprint = cert && cert.fingerprint256;
      let body = "";
      res.setEncoding("utf8");
      res.on("data", c => { body += c; if (body.length > 20000) req.destroy(); });
      res.on("end", () => {
        let j = null; try { j = JSON.parse(body); } catch {}
        const isOpenHL = (res.statusCode === 401 && j && j.error === "Unauthorized") || (res.statusCode === 200 && j && j.ok && j.hostname);
        if (!authorized && trusted !== fingerprint) {
          return resolve({ ok: false, certError: true, fingerprint, error: "The server's HTTPS certificate is not trusted (" + (res.socket.authorizationError || "self-signed") + ")." });
        }
        if (!isOpenHL) return resolve({ ok: false, error: "Something answered, but it is not Gridlantis-HL (HTTP " + res.statusCode + ")." });
        resolve({ ok: true, needsLogin: res.statusCode === 401, hostname: j && j.hostname });
      });
    });
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", e => resolve({ ok: false, error: friendlyNetError(e) }));
  });
}
function friendlyNetError(e) {
  if (e.code === "ECONNREFUSED") return "Connection refused — Gridlantis-HL is not running at that address/port.";
  if (e.code === "ENOTFOUND" || e.code === "EAI_AGAIN") return "That host name could not be resolved.";
  if (e.code === "EHOSTUNREACH" || e.code === "ENETUNREACH") return "The host is unreachable from this network. Is Tailscale/VPN connected?";
  if (e.message === "timed out") return "Timed out. Check the address, port and firewall.";
  return e.message;
}

// Self-signed HTTPS: accepted only for a server the user explicitly trusted,
// and only while its certificate fingerprint stays the same.
app.on("certificate-error", (event, webContents, url, error, certificate, callback) => {
  const origin = originOf(url);
  if (origin && settings.trusted[origin] && settings.trusted[origin] === certificate.fingerprint.replace(/^sha256\//, "")) {
    event.preventDefault(); return callback(true);
  }
  callback(false);
});

// ── IPC ──────────────────────────────────────────────────────────────────────
const fromConnectPage = e => e.senderFrame && e.senderFrame.url.startsWith("file:");
const fromOpenHL = e => e.senderFrame && currentOrigin && originOf(e.senderFrame.url) === currentOrigin;

// The other half of the prompt() shim in preload.js. The renderer is blocked
// in sendSync until returnValue is set, so the dialog can take its time.
ipcMain.on("dialog:prompt", (e, message, value) => {
  const parent = BrowserWindow.fromWebContents(e.sender);
  const dlg = new BrowserWindow({ parent, modal: true, width: 440, height: 170, resizable: false, minimizable: false, maximizable: false,
    title: "Gridlantis-HL", backgroundColor: "#15151c", autoHideMenuBar: true, show: false, webPreferences: { sandbox: true, contextIsolation: true } });
  dlg.setMenuBarVisibility(false);
  let answered = false;
  const answer = v => { if (answered) return; answered = true; e.returnValue = v; if (!dlg.isDestroyed()) dlg.close(); };
  // The page reports back through its title: "ok:<text>" or "cancel".
  dlg.webContents.on("page-title-updated", (ev, t) => {
    if (t === "cancel") answer(null);
    else if (t.startsWith("ok:")) answer(t.slice(3));
  });
  dlg.on("closed", () => answer(null));
  const esc = x => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const page = `<!doctype html><meta charset="utf-8"><title>Gridlantis-HL</title><style>
    body{margin:0;padding:16px 18px;background:#15151c;color:#e5e7eb;font:14px system-ui,sans-serif}
    p{margin:0 0 10px;white-space:pre-wrap}input{width:100%;box-sizing:border-box;height:32px;padding:0 10px;background:#0b0b10;color:#e5e7eb;border:1px solid #333;border-radius:6px;outline:none}
    input:focus{border-color:#4f8ff7}div{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
    button{height:30px;padding:0 14px;border-radius:6px;border:1px solid #333;background:#22222b;color:#e5e7eb;cursor:pointer}
    button.ok{background:#4f8ff7;border-color:#4f8ff7;color:#fff}</style>
    <p>${esc(message)}</p><input id="v" value="${esc(value)}"><div><button id="c">Cancel</button><button class="ok" id="o">OK</button></div>
    <script>var v=document.getElementById("v");v.focus();v.select();
    function ok(){document.title="ok:"+v.value;}function no(){document.title="cancel";}
    document.getElementById("o").onclick=ok;document.getElementById("c").onclick=no;
    addEventListener("keydown",function(e){if(e.key==="Enter")ok();if(e.key==="Escape")no();});</script>`;
  dlg.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(page));
  dlg.once("ready-to-show", () => dlg.show());
});
ipcMain.handle("clipboard:read", e => (fromOpenHL(e) ? clipboard.readText() : null));
ipcMain.handle("clipboard:write", (e, text) => { if (fromOpenHL(e)) { clipboard.writeText(String(text)); return true; } return false; });
ipcMain.handle("app:switch-server", e => { if (fromOpenHL(e) || fromConnectPage(e)) showConnect(); });
ipcMain.handle("app:info", () => ({ version: app.getVersion(), platform: process.platform, electron: process.versions.electron }));

ipcMain.handle("connect:state", e => {
  if (!fromConnectPage(e)) return null;
  const st = pendingConnectState; pendingConnectState = null;
  return { servers: settings.servers, lastUrl: settings.lastUrl, localFolder: settings.localFolder, platform: process.platform,
    version: app.getVersion(), notice: st, localRunning: !!localChild };
});
ipcMain.handle("connect:test", async (e, url) => {
  if (!fromConnectPage(e)) return null;
  let origin; try { origin = normalizeUrl(url); } catch (err) { return { ok: false, error: err.message }; }
  return Object.assign({ url: origin }, await probe(origin));
});
ipcMain.handle("connect:trust", (e, url, fingerprint) => {
  if (!fromConnectPage(e)) return false;
  const origin = normalizeUrl(url);
  // Node reports "AB:CD:…"; Chromium reports base64 — store Chromium's form.
  const b64 = Buffer.from(String(fingerprint).replace(/:/g, ""), "hex").toString("base64");
  settings.trusted[origin] = b64; saveSettings();
  return true;
});
ipcMain.handle("connect:open", async (e, url) => {
  if (!fromConnectPage(e)) return null;
  try { await openServer(url); return { ok: true }; } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle("connect:remove", (e, url) => {
  if (!fromConnectPage(e)) return null;
  settings.servers = settings.servers.filter(s => s.url !== url);
  if (settings.lastUrl === url) settings.lastUrl = null;
  delete settings.trusted[url];
  saveSettings();
  return settings.servers;
});
ipcMain.handle("connect:pick-folder", async e => {
  if (!fromConnectPage(e)) return null;
  const r = await dialog.showOpenDialog(win, { title: "Gridlantis-HL folder (contains server.js)", properties: ["openDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});

// ── Run Gridlantis-HL on this computer ───────────────────────────────────────────────
// For the host itself: start the Gridlantis-HL server from its folder with Electron's
// bundled Node, then connect to it. Nothing happens if one is already running.
function readPort(folder) {
  try {
    const m = fs.readFileSync(path.join(folder, ".env"), "utf8").match(/^\s*PORT\s*=\s*["']?(\d+)/m);
    if (m) return +m[1];
  } catch {}
  return 3000;
}
// Gridlantis-HL exits with 75 after Settings → Keys asks for a restart
// (src/keys.js); start it again with the same folder and log.
function watchLocal(proc, folder, log) {
  proc.on("exit", code => {
    if (localChild !== proc) return;
    localChild = null;
    if (code !== 75) return;
    localChild = spawn(process.execPath, [path.join(folder, "server.js")], {
      cwd: folder, env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: "1", OPENHL_SUPERVISOR: "desktop" }), stdio: ["ignore", log, log], windowsHide: true,
    });
    watchLocal(localChild, folder, log);
  });
}
ipcMain.handle("connect:start-local", async (e, folder) => {
  if (!fromConnectPage(e)) return null;
  folder = String(folder || "");
  if (!fs.existsSync(path.join(folder, "server.js"))) return { ok: false, error: "No server.js in that folder." };
  if (!fs.existsSync(path.join(folder, ".env"))) return { ok: false, error: "That Gridlantis-HL folder has no .env (copy .env.example to .env and set PASSWORD)." };
  settings.localFolder = folder; saveSettings();
  const origin = "http://127.0.0.1:" + readPort(folder);
  let st = await probe(origin, 1500);
  if (!st.ok) {
    if (localChild) { try { localChild.kill(); } catch {} }
    const log = fs.openSync(path.join(app.getPath("userData"), "openhl-server.log"), "a");
    localChild = spawn(process.execPath, [path.join(folder, "server.js")], {
      cwd: folder, env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: "1", OPENHL_SUPERVISOR: "desktop" }), stdio: ["ignore", log, log], windowsHide: true,
    });
    watchLocal(localChild, folder, log);
    for (let i = 0; i < 40 && !(st = await probe(origin, 1000)).ok; i++) await new Promise(r => setTimeout(r, 500));
    if (!st.ok) return { ok: false, error: "Gridlantis-HL did not start. See " + path.join(app.getPath("userData"), "openhl-server.log") };
  }
  await openServer(origin);
  return { ok: true };
});

// ── Menu (hidden bar; the accelerators-free items stay reachable via Alt on the connect page) ─
function buildMenu() {
  const tpl = [
    { label: "Gridlantis-HL", submenu: [
      { label: "Switch server…", click: () => showConnect() },
      { label: "Open in browser", click: () => { if (win && currentOrigin) shell.openExternal(win.webContents.getURL()); } },
      { type: "separator" },
      { role: "quit" },
    ] },
    { label: "View", submenu: [
      { label: "Reload", click: () => win && win.webContents.reload() },
      { label: "Toggle full screen", click: () => win && win.setFullScreen(!win.isFullScreen()) },
      { label: "Developer tools", click: () => win && win.webContents.toggleDevTools() },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => { loadSettings(); buildMenu(); createWindow(); });
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => { if (localChild) { try { localChild.kill(); } catch {} } });
