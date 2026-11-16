// Bridge exposed to Open HL pages as window.openhlDesktop. Every call is checked
// again in the main process against the page's origin.
const { contextBridge, ipcRenderer, webFrame } = require("electron");

contextBridge.exposeInMainWorld("openhlDesktop", {
  platform: process.platform,
  info: () => ipcRenderer.invoke("app:info"),
  clipboard: {
    readText: () => ipcRenderer.invoke("clipboard:read"),
    writeText: text => ipcRenderer.invoke("clipboard:write", String(text)),
  },
  switchServer: () => ipcRenderer.invoke("app:switch-server"),
  connect: {
    state: () => ipcRenderer.invoke("connect:state"),
    test: url => ipcRenderer.invoke("connect:test", url),
    trust: (url, fingerprint) => ipcRenderer.invoke("connect:trust", url, fingerprint),
    open: url => ipcRenderer.invoke("connect:open", url),
    remove: url => ipcRenderer.invoke("connect:remove", url),
    pickFolder: () => ipcRenderer.invoke("connect:pick-folder"),
    startLocal: folder => ipcRenderer.invoke("connect:start-local", folder),
  },
});

// Electron does not implement window.prompt(); pages calling it got nothing
// back (Flow Space's "New flow", the note link button, renaming a dashboard).
// Route it to a small native dialog. sendSync keeps prompt() synchronous, as
// pages expect.
contextBridge.exposeInMainWorld("__openhlPrompt", (message, value) =>
  ipcRenderer.sendSync("dialog:prompt", String(message == null ? "" : message), value == null ? "" : String(value)));
webFrame.executeJavaScript("window.prompt = function (m, v) { return window.__openhlPrompt(m, v); };");
