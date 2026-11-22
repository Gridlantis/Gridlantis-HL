(function () {
  "use strict";
  const D = window.openhlDesktop;
  const $ = id => document.getElementById(id);
  let lastTest = null;

  function status(el, text, cls) { el.textContent = text || ""; el.className = "status " + (cls || ""); }

  function renderSaved(servers) {
    const box = $("saved"); box.innerHTML = "";
    $("saved-wrap").hidden = !servers.length;
    servers.forEach(s => {
      const row = document.createElement("div"); row.className = "srv"; row.title = "Open " + s.url;
      const u = document.createElement("div"); u.className = "u"; u.textContent = s.url;
      const x = document.createElement("button"); x.className = "x"; x.type = "button"; x.title = "Forget this server"; x.textContent = "✕";
      x.addEventListener("click", async e => { e.stopPropagation(); renderSaved(await D.connect.remove(s.url)); });
      row.addEventListener("click", () => { $("url").value = s.url; connect(); });
      row.append(u, x); box.appendChild(row);
    });
  }

  async function connect() {
    const url = $("url").value;
    const btn = $("go"); btn.disabled = true;
    status($("status"), "Checking " + url + "…", "busy");
    try {
      let r = await D.connect.test(url);
      if (!r.ok && r.certError) {
        lastTest = r;
        $("trust").hidden = false; $("fp").textContent = "SHA-256 " + r.fingerprint;
        if ($("trust-cb").checked) { await D.connect.trust(r.url, r.fingerprint); r = await D.connect.test(url); }
      }
      if (!r.ok) { status($("status"), r.error, "bad"); btn.disabled = false; return; }
      status($("status"), "Found Gridlantis-HL" + (r.hostname ? " on " + r.hostname : "") + " — opening…", "ok");
      const o = await D.connect.open(r.url);
      if (!o.ok) { status($("status"), o.error, "bad"); btn.disabled = false; }
    } catch (e) { status($("status"), e.message, "bad"); btn.disabled = false; }
  }

  $("form").addEventListener("submit", e => { e.preventDefault(); connect(); });
  $("browse").addEventListener("click", async () => { const f = await D.connect.pickFolder(); if (f) $("folder").value = f; });
  $("start-local").addEventListener("click", async () => {
    const b = $("start-local"); b.disabled = true;
    status($("local-status"), "Starting Gridlantis-HL…", "busy");
    const r = await D.connect.startLocal($("folder").value);
    if (!r.ok) { status($("local-status"), r.error, "bad"); b.disabled = false; }
  });

  (async () => {
    const st = await D.connect.state();
    if (!st) return;
    renderSaved(st.servers || []);
    $("url").value = (st.notice && st.notice.url) || st.lastUrl || "";
    if (st.notice && st.notice.error) { $("notice").hidden = false; $("notice").textContent = st.notice.error; }
    if (st.platform === "linux") { $("local").hidden = false; if (st.localFolder) $("folder").value = st.localFolder; }
    $("foot").textContent = "Gridlantis-HL desktop " + st.version + " · Ctrl+Shift+Alt+S switches server";
  })();
})();
