const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("server", {
  state: () => ipcRenderer.invoke("state"),
  onState: fn => ipcRenderer.on("state", (_e, s) => fn(s)),
  setup: details => ipcRenderer.invoke("setup", details),
  changePort: port => ipcRenderer.invoke("change-port", port),
  changePassword: pw => ipcRenderer.invoke("change-password", pw),
  retry: () => ipcRenderer.invoke("retry"),
  open: url => ipcRenderer.invoke("open", url),
  copy: text => ipcRenderer.invoke("copy", text),
  openFolder: () => ipcRenderer.invoke("open-folder"),
  openLog: () => ipcRenderer.invoke("open-log"),
  quit: () => ipcRenderer.invoke("quit"),
});
