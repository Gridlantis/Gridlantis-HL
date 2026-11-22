const $ = id => document.getElementById(id);
const VIEWS = ["setup", "starting", "running", "error"];
// ipcRenderer.invoke wraps errors as "Error invoking remote method 'x': Error: msg".
const msg = e => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");

function show(view) {
  for (const v of VIEWS) $("v-" + v).hidden = v !== view;
  $("settings").hidden = view === "setup" || view === "starting";
}

function render(s) {
  $("version").textContent = "Server " + s.version;
  $("p-port").value = s.port;
  if (s.phase === "running") {
    $("r-local").textContent = s.local;
    const list = $("r-net");
    list.replaceChildren(...(s.network || []).map(url => {
      const li = document.createElement("li"), span = document.createElement("span"), b = document.createElement("button");
      span.textContent = url;
      b.type = "button"; b.textContent = "Copy";
      b.onclick = () => copy(url, b);
      li.append(span, b);
      return li;
    }));
    $("r-net-wrap").hidden = !(s.network || []).length;
  }
  if (s.phase === "error") {
    $("e-msg").textContent = s.message || "Something went wrong.";
    $("e-log").textContent = s.log || "";
    $("e-log").hidden = !s.log;
    if (s.portBusy) $("settings").open = true;
  }
  show(s.phase);
}

function copy(text, button) {
  window.server.copy(text);
  const was = button.textContent;
  button.textContent = "Copied";
  setTimeout(() => { button.textContent = was; }, 1400);
}

$("setup-form").addEventListener("submit", async e => {
  e.preventDefault();
  const status = $("setup-status");
  status.textContent = "";
  if ($("s-pw").value !== $("s-pw2").value) { status.textContent = "The two passwords don't match."; return; }
  $("setup-go").disabled = true;
  try {
    await window.server.setup({ name: $("s-name").value, password: $("s-pw").value, port: Number($("s-port").value) });
  } catch (err) { status.textContent = msg(err); }
  $("setup-go").disabled = false;
});

function settingsStatus(text, ok) {
  const s = $("settings-status");
  s.textContent = text;
  s.className = "status " + (ok ? "ok" : "bad");
}

$("port-form").addEventListener("submit", async e => {
  e.preventDefault();
  try { await window.server.changePort(Number($("p-port").value)); settingsStatus("Port saved. Gridlantis-HL is restarting.", true); }
  catch (err) { settingsStatus(msg(err)); }
});

$("pw-form").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    await window.server.changePassword($("p-pw").value);
    $("p-pw").value = "";
    settingsStatus("Password changed. Gridlantis-HL is restarting; sign in again with the new one.", true);
  } catch (err) { settingsStatus(msg(err)); }
});

$("r-copy").onclick = () => copy($("r-local").textContent, $("r-copy"));
$("r-open").onclick = () => window.server.open($("r-local").textContent);
$("e-retry").onclick = () => window.server.retry();
$("e-log-open").onclick = () => window.server.openLog();
$("x-folder").onclick = () => window.server.openFolder();
$("x-quit").onclick = () => window.server.quit();

window.server.onState(render);
window.server.state().then(render);
