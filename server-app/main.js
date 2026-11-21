// Open HL Server: runs Open HL on this computer and shows the address to
// open it at.
//
// Open HL itself is unchanged. It runs as a child process on Electron's own
// Node (ELECTRON_RUN_AS_NODE), so people need nothing installed. Its state
// (.env, data/, uploads/) lives in this app's user-data folder, passed to it
// as OPENHL_HOME, because the app's own copy of the program is read-only.
const { app, BrowserWindow, clipboard, ipcMain, shell } = require("electron");
const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

app.setName("Open HL Server");
if (process.platform === "win32") app.setAppUserModelId("app.gridlantis.openhl.server");
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const DEFAULT_PORT = 3000;
const START_TIMEOUT_MS = 45000;
// Packaged: the program ships as a resource. From source: the repo itself.
const PROGRAM_DIR = app.isPackaged ? path.join(process.resourcesPath, "openhl") : path.resolve(__dirname, "..");
const HOME = () => path.join(app.getPath("userData"), "Open HL");
const ENV_FILE = () => path.join(HOME(), ".env");
const LOG_FILE = () => path.join(HOME(), "server.log");
const iconPath = () => path.join(__dirname, "build", "icon.png");

let win = null, child = null, state = { phase: "setup" }, quitting = false;

// ── .env ─────────────────────────────────────────────────────────────────────
// Open HL's own .env, in its own format (src/config.js loadEnv): KEY=value per
// line, one quote stripped from each end. Values are written in double quotes
// so a password that starts or ends with a space or a quote survives.
function readEnv() {
  const out = {};
  let text;
  try { text = fs.readFileSync(ENV_FILE(), "utf8"); } catch { return null; }
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq > 0) out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}
// Changes some keys and keeps every other line, so keys people add by hand
// (API keys and so on) stay put.
function writeEnv(changes) {
  let lines = [];
  try { lines = fs.readFileSync(ENV_FILE(), "utf8").split("\n"); } catch {
    lines = ["# Open HL settings, written by Open HL Server.",
             "# Other keys from Open HL's .env.example can be added here; restart Open HL to apply them.", ""];
  }
  const left = new Map(Object.entries(changes));
  lines = lines.map(line => {
    const t = line.trim(), eq = t.indexOf("=");
    if (t.startsWith("#") || eq <= 0) return line;
    const key = t.slice(0, eq).trim();
    if (!left.has(key)) return line;
    const v = left.get(key); left.delete(key);
    return `${key}="${v}"`;
  });
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  for (const [k, v] of left) lines.push(`${k}="${v}"`);
  fs.mkdirSync(HOME(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(ENV_FILE(), lines.join("\n") + "\n", { mode: 0o600 });
  try { fs.chmodSync(ENV_FILE(), 0o600); } catch {}
}

const portOf = env => { const p = parseInt(env && env.PORT, 10); return p > 0 && p < 65536 ? p : DEFAULT_PORT; };

function validPort(v) {
  const p = Number(v);
  if (!Number.isInteger(p) || p < 1024 || p > 65535) throw new Error("Pick a port from 1024 to 65535.");
  return p;
}
// Open HL listens on every interface, so test the same.
function portFree(port) {
  return new Promise(resolve => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.listen(port, "0.0.0.0", () => s.close(() => resolve(true)));
  });
}

// ── The server process ───────────────────────────────────────────────────────
function lanAddresses(port) {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if (i.family === "IPv4" && !i.internal) out.push(`http://${i.address}:${port}`);
  return out;
}

function setState(s) {
  state = s;
  if (win && !win.isDestroyed()) win.webContents.send("state", publicState());
}
function publicState() {
  const env = readEnv() || {};
  return Object.assign({ version: app.getVersion(), home: HOME() }, state,
    { port: state.port || portOf(env) });
}

function logTail(n = 15) {
  try { return fs.readFileSync(LOG_FILE(), "utf8").trim().split("\n").slice(-n).join("\n"); } catch { return ""; }
}

// Resolves once Open HL answers on its port.
function waitForServer(port, proc) {
  const until = Date.now() + START_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      if (proc.exitCode !== null || proc.signalCode) return reject(new Error("Open HL stopped while starting."));
      const req = http.get({ host: "127.0.0.1", port, path: "/", timeout: 2000 }, res => { res.resume(); resolve(); });
      req.on("error", retry);
      req.on("timeout", () => { req.destroy(); });
    };
    const retry = () => Date.now() > until ? reject(new Error("Open HL didn't answer in time.")) : setTimeout(tryOnce, 400);
    tryOnce();
  });
}

async function startServer() {
  const env = readEnv();
  if (!env || !env.PASSWORD) return setState({ phase: "setup" });
  const port = portOf(env);
  setState({ phase: "starting", port });
  if (!(await portFree(port)))
    return setState({ phase: "error", port, portBusy: true,
      message: `Port ${port} is already in use. Open HL may already be running, or another program is using it.` });

  fs.mkdirSync(HOME(), { recursive: true, mode: 0o700 });
  const log = fs.openSync(LOG_FILE(), "w");
  const proc = spawn(process.execPath, [path.join(PROGRAM_DIR, "server.js")], {
    cwd: PROGRAM_DIR,
    env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: "1", OPENHL_HOME: HOME() }),
    stdio: ["ignore", log, log],
    windowsHide: true,
  });
  fs.closeSync(log);
  child = proc;
  proc.on("exit", () => {
    if (child === proc) child = null;
    if (!quitting && state.phase === "running" && state.pid === proc.pid)
      setState({ phase: "error", port, message: "Open HL stopped unexpectedly.", log: logTail() });
  });
  try {
    await waitForServer(port, proc);
    if (child !== proc) return;
    setState({ phase: "running", port, pid: proc.pid, local: `http://localhost:${port}`, network: lanAddresses(port) });
  } catch (e) {
    if (child !== proc) return;
    try { proc.kill(); } catch {}
    setState({ phase: "error", port, message: e.message, log: logTail() });
  }
}

function stopServer() {
  return new Promise(resolve => {
    const proc = child;
    child = null;
    if (!proc || proc.exitCode !== null) return resolve();
    const done = setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} resolve(); }, 5000);
    proc.once("exit", () => { clearTimeout(done); resolve(); });
    try { proc.kill(); } catch { clearTimeout(done); resolve(); }
  });
}

// ── Setup ─────────────────────────────────────────────────────────────────────
// The name goes where Open HL keeps it (data/settings.json, userName), only
// when Open HL hasn't stored settings yet.
function saveName(name) {
  const clean = String(name || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 40);
  if (!clean) return;
  const dir = path.join(HOME(), "data"), file = path.join(dir, "settings.json");
  if (fs.existsSync(file)) return;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify({ userName: clean }, null, 2), { mode: 0o600 });
}

function validPassword(pw) {
  pw = String(pw || "");
  if (pw.length < 8) throw new Error("Use at least 8 characters for the password.");
  if (/[\r\n]/.test(pw)) throw new Error("The password can't contain line breaks.");
  return pw;
}

ipcMain.handle("state", () => publicState());

ipcMain.handle("setup", async (_e, { name, password, port }) => {
  const pw = validPassword(password);
  const p = validPort(port);
  if (!(await portFree(p))) throw new Error(`Port ${p} is already in use. Pick another.`);
  saveName(name);
  writeEnv({ PASSWORD: pw, PORT: String(p) });
  startServer();
  return true;
});

ipcMain.handle("change-port", async (_e, port) => {
  const p = validPort(port);
  const current = state.phase === "running" ? state.port : null;
  if (p !== current && !(await portFree(p))) throw new Error(`Port ${p} is already in use. Pick another.`);
  await stopServer();
  writeEnv({ PORT: String(p) });
  startServer();
  return true;
});

ipcMain.handle("change-password", async (_e, password) => {
  writeEnv({ PASSWORD: validPassword(password) });
  await stopServer();
  startServer();
  return true;
});

ipcMain.handle("retry", async () => { await stopServer(); startServer(); return true; });
ipcMain.handle("open", (_e, url) => { if (/^http:\/\/[^/]+:\d+\/?$/.test(url)) shell.openExternal(url); });
ipcMain.handle("copy", (_e, text) => clipboard.writeText(String(text)));
ipcMain.handle("open-folder", () => shell.openPath(HOME()));
ipcMain.handle("open-log", () => shell.openPath(LOG_FILE()));
ipcMain.handle("quit", () => app.quit());

// ── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width: 560, height: 680, minWidth: 420, minHeight: 520,
    title: "Open HL Server", backgroundColor: "#0b0b10", icon: iconPath(), autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", e => e.preventDefault());
  win.once("ready-to-show", () => win.show());
  win.loadFile(path.join(__dirname, "ui", "index.html"));
}

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on("window-all-closed", () => app.quit());
app.on("before-quit", e => {
  if (quitting || !child) return;
  e.preventDefault();
  quitting = true;
  stopServer().then(() => app.quit());
});

app.whenReady().then(() => {
  createWindow();
  startServer();
});
