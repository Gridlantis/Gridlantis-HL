/* VM Lab · Cuttlefish — the group and its phones. Plain script, uses window.VL. */
(function () {
  "use strict";
  const { api, h, icon, toast, fmtAgo } = window.VL;
  const $ = s => document.querySelector(s);
  const enc = encodeURIComponent;
  const S = { st: null, loading: false, timer: null, rebooting: {} };   // rebooting: serial → time asked

  // ── Modal ───────────────────────────────────────────────────────────────────
  const modal = {
    open(title, body, foot) {
      $("#modal-title").textContent = title;
      const b = $("#modal-body"); b.innerHTML = ""; b.appendChild(body);
      const f = $("#modal-foot"); f.innerHTML = ""; (foot || []).forEach(x => f.appendChild(x));
      $("#modal").classList.add("on");
    },
    close() { $("#modal").classList.remove("on"); },
  };
  $("#modal-x").addEventListener("click", modal.close);
  $("#modal").addEventListener("mousedown", e => { if (e.target.id === "modal") modal.close(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") modal.close(); });
  function confirmBox(title, text, label, danger) {
    return new Promise(resolve => {
      const done = v => { modal.close(); resolve(v); };
      modal.open(title, h("div", { class: "help" }, text), [
        h("button", { class: "btn", onclick: () => done(false) }, "Cancel"),
        h("button", { class: "btn " + (danger ? "danger" : "primary"), onclick: () => done(true) }, label)]);
    });
  }

  // ── Data ────────────────────────────────────────────────────────────────────
  async function load() {
    if (S.loading) return;
    S.loading = true;
    try { S.st = await api("GET", "/api/cuttlefish/status"); }
    catch (e) { toast("Could not read Cuttlefish status: " + e.message, "bad"); }
    S.loading = false;
    phones().forEach(i => {
      const t = S.rebooting[i.serial];
      if (!t) return;
      if (!i.booted) S.rebooting[i.serial] = -1;                       // went down
      else if (S.rebooting[i.serial] === -1 || Date.now() - t > 180000) delete S.rebooting[i.serial];   // back up
    });
    render();
    // Poll faster while a start/stop is running or a phone is still booting.
    const settling = S.st && (S.st.busy || Object.keys(S.rebooting).length || phones().some(i => i.status === "Running" && !i.booted));
    clearTimeout(S.timer);
    S.timer = setTimeout(load, settling ? 3000 : 15000);
  }
  const phones = () => (S.st && S.st.groups || []).flatMap(g => g.instances);
  // The operator's address names localhost; use the host this page came from
  // so it works from another computer on the LAN or tailnet too.
  function webUrl(i) {
    if (!i.webAccess) return null;
    try { const u = new URL(i.webAccess); u.hostname = location.hostname; return u.href; } catch (e) { return null; }
  }

  async function power(action, group) {
    const stop = action === "stop";
    if (!await confirmBox(stop ? "Stop the phones?" : "Start the phones?",
      stop ? "Every phone in group “" + group + "” shuts down. Apps and data are kept and come back on the next start."
           : "Boots every phone in group “" + group + "”. It takes a minute or two.",
      stop ? "Stop" : "Start", stop)) return;
    try { await api("POST", "/api/cuttlefish/" + action, { group }); toast(stop ? "Stopping…" : "Starting…"); }
    catch (e) { toast(e.message, "bad"); }
    load();
  }

  async function reboot(i) {
    if (!await confirmBox("Reboot phone " + i.name + "?", "Restarts Android on " + i.serial + ". Apps and data are kept.", "Reboot")) return;
    try { await api("POST", "/api/cuttlefish/phone/" + enc(i.serial) + "/reboot"); toast("Rebooting " + i.serial); S.rebooting[i.serial] = Date.now(); }
    catch (e) { toast(e.message, "bad"); }
    render();
    setTimeout(load, 3000);
  }

  // ── Rendering ───────────────────────────────────────────────────────────────
  function render() {
    const st = S.st || {};
    $("#cf-dir").textContent = st.dir || "";
    const banners = $("#banners"); banners.innerHTML = "";
    const box = $("#groups"); box.innerHTML = "";
    const acts = $("#cf-actions"); acts.innerHTML = "";
    const running = phones().filter(i => i.adb === "device");
    acts.appendChild(h("a", { class: "btn primary" + (running.length ? "" : " disabled"), href: "/vmlab/cuttlefish/all",
      title: "Every running phone side by side, each one controllable" }, icon("fa-solid fa-table-cells-large"), "Show all"));
    acts.appendChild(h("button", { class: "btn", onclick: load, title: "Refresh" }, icon("fa-solid fa-rotate")));

    if (st.error) banners.appendChild(h("div", { class: "banner bad" }, st.error));
    if (st.busy) banners.appendChild(h("div", { class: "banner" }, icon("fa-solid fa-spinner fa-spin"), " ",
      st.busy.action === "stop" ? "Stopping" : "Starting", " the phones (", fmtAgo(st.busy.since), ")…"));
    if (st.lastError) banners.appendChild(h("div", { class: "banner bad" }, "Last ", st.lastError.action, " failed: ", st.lastError.message));
    if (st.cvd && st.adb === false) banners.appendChild(h("div", { class: "banner" },
      "adb is not set up in Open HL yet, so phones cannot be mirrored. ", h("a", { href: "/mobile" }, "Install tools on Mobile host"), "."));
    if (!S.st) { box.appendChild(h("div", { class: "empty" }, "Loading…")); return; }
    if (!st.groups || !st.groups.length) {
      box.appendChild(h("div", { class: "empty" }, h("b", null, "No Cuttlefish group"),
        "Create one from a terminal in ", h("code", null, st.dir || "the Cuttlefish folder"), ", e.g. ",
        h("code", null, "cvd start --daemon --num_instances=3"), ", then refresh."));
      return;
    }
    st.groups.forEach(g => box.appendChild(group(g, st.busy)));
  }

  function group(g, busy) {
    const anyRunning = g.instances.some(i => i.status === "Running");
    const wrap = h("div", { style: { marginBottom: "18px" } });
    wrap.appendChild(h("div", { class: "row" },
      h("div", null, h("div", { class: "sec-t" }, "Group ", g.name),
        h("div", { class: "sec-s" }, g.instances.length + " phone" + (g.instances.length === 1 ? "" : "s"),
          g.startTime ? " · started " + g.startTime : "")),
      h("span", { class: "spacer" }),
      anyRunning
        ? h("button", { class: "btn danger", disabled: !!busy, onclick: () => power("stop", g.name) }, icon("fa-solid fa-power-off"), "Stop all")
        : h("button", { class: "btn primary", disabled: !!busy, onclick: () => power("start", g.name) }, icon("fa-solid fa-play"), "Start all")));
    const grid = h("div", { class: "grid-cards" });
    g.instances.forEach(i => grid.appendChild(card(i, busy)));
    wrap.appendChild(grid);
    return wrap;
  }

  function card(i, busy) {
    const up = i.status === "Running";
    const ready = up && i.adb === "device";
    const rebooting = !!S.rebooting[i.serial];
    const state = rebooting ? "rebooting…" : !up ? (i.status || "Stopped") : !ready ? "adb: " + (i.adb || "not connected") : i.booted ? "ready" : "booting…";
    const web = webUrl(i);
    const c = h("div", { class: "card " + (up ? "Running" : "") });
    c.appendChild(h("div", { class: "card-h" },
      h("div", { class: "os-ico" }, icon("fa-brands fa-android")),
      h("div", { style: { minWidth: 0, flex: 1 } },
        h("div", { class: "card-name" }, "Phone ", i.name),
        h("div", { class: "card-meta" }, i.serial || "")),
      h("span", { class: "dot " + (busy || rebooting || (up && !i.booted) ? "busy" : (i.status || "")) })));
    c.appendChild(h("div", { class: "badges" },
      h("span", { class: "badge " + (ready && i.booted && !rebooting ? "g" : up ? "y" : "") }, state),
      i.android ? h("span", { class: "badge" }, "Android ", i.android) : null,
      i.display ? h("span", { class: "badge" }, i.display) : null));
    c.appendChild(h("div", { class: "card-acts" },
      h("a", { class: "btn primary sm", href: ready ? "/mobile/view/" + enc(i.serial) : null, target: "_blank", rel: "noopener",
        disabled: !ready, style: ready ? null : { opacity: ".45", pointerEvents: "none" },
        title: "Mirror and control it here (Mobile host viewer)" }, icon("fa-solid fa-mobile-screen-button"), "Mirror"),
      web ? h("a", { class: "btn sm", href: web, target: "_blank", rel: "noopener",
        style: up ? null : { opacity: ".45", pointerEvents: "none" },
        title: "Cuttlefish's own WebRTC view (self-signed certificate — accept the warning once)" }, icon("fa-solid fa-globe"), "Browser view") : null,
      h("button", { class: "btn sm", disabled: !ready || rebooting, onclick: () => reboot(i) }, icon("fa-solid fa-rotate"), "Reboot")));
    return c;
  }

  // ── Install an APK on every running phone ──────────────────────────────────
  async function installApk(file) {
    if (!file) return;
    if (!/\.apk$/i.test(file.name)) return toast("That is not an .apk file", "bad");
    const res = $("#apk-res");
    res.textContent = "Installing " + file.name + " on every running phone…";
    try {
      const r = await fetch("/api/cuttlefish/install", { method: "POST", body: file, headers: { "Content-Type": "application/vnd.android.package-archive" } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "HTTP " + r.status);
      res.innerHTML = "";
      res.appendChild(h("div", null, h("b", null, file.name)));
      d.results.forEach(x => res.appendChild(h("div", { style: { color: x.ok ? "var(--green)" : "var(--red)" } },
        x.serial, ": ", x.ok ? "installed" : x.error)));
      toast(d.results.every(x => x.ok) ? "Installed on " + d.results.length + " phones" : "Some installs failed", d.results.every(x => x.ok) ? "ok" : "bad");
    } catch (e) { res.textContent = "Install failed: " + e.message; toast(e.message, "bad"); }
  }
  const drop = $("#drop");
  $("#b-apk").addEventListener("click", () => $("#f-apk").click());
  $("#f-apk").addEventListener("change", e => { installApk(e.target.files[0]); e.target.value = ""; });
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); installApk(e.dataTransfer.files[0]); });

  load();
})();
