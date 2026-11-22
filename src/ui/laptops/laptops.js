/* PC host — the list of paired PCs. Plain script, uses window.VL. */
(function () {
  "use strict";
  const { api, h, icon, fmtAgo, toast, writeClipboard, onServerEvents } = window.VL;
  const $ = s => document.querySelector(s);
  const S = { laptops: [], openhlIp: null, status: {} };
  const enc = encodeURIComponent;

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

  function confirmBox(title, text, okLabel) {
    return new Promise(resolve => {
      const ok = h("button", { class: "btn danger", onclick: () => { modal.close(); resolve(true); } }, okLabel);
      const cancel = h("button", { class: "btn", onclick: () => { modal.close(); resolve(false); } }, "Cancel");
      modal.open(title, h("div", { class: "hint", style: { fontSize: "13px", color: "var(--text)" } }, text), [cancel, ok]);
    });
  }

  // ── Data ────────────────────────────────────────────────────────────────────
  async function load() {
    try {
      const r = await api("GET", "/api/laptops");
      S.laptops = r.laptops; S.openhlIp = r.openhlIp;
    } catch (e) { toast("Could not load PCs: " + e.message, "bad"); }
    render();
    S.laptops.forEach(l => probe(l.id));
  }
  // quiet: a background refresh of the usage numbers, without the "checking…" flicker.
  async function probe(id, force, quiet) {
    if (!quiet) { S.status[id] = Object.assign({}, S.status[id], { checking: true }); paintCard(id); }
    try { S.status[id] = await api("GET", "/api/laptops/" + enc(id) + "/status" + (force ? "?force=1" : "")); }
    catch (e) { S.status[id] = { online: false, error: e.message }; }
    paintCard(id);
  }

  // ── Rendering ───────────────────────────────────────────────────────────────
  function render() {
    const list = $("#list"); list.innerHTML = "";
    $("#banners").innerHTML = "";
    if (!S.openhlIp) {
      $("#banners").appendChild(h("div", { class: "banner" }, h("b", null, "Gridlantis-HL is not on a tailnet"),
        "PCs are reached over Tailscale and only let Gridlantis-HL's tailnet address in. Start Tailscale on this machine, then set up your PCs."));
    }
    if (!S.laptops.length) {
      list.appendChild(h("div", { class: "empty" }, h("b", null, "No PCs paired yet"),
        "Run the setup script once on a PC, then paste the pairing code it prints.", h("br"), h("br"),
        h("div", { class: "row", style: { justifyContent: "center" } },
          h("button", { class: "btn", onclick: openSetup }, icon("fa-solid fa-terminal"), "Set up a PC"),
          h("button", { class: "btn primary", onclick: () => openPair() }, icon("fa-solid fa-link"), "Pair a PC"))));
      return;
    }
    const grid = h("div", { class: "grid-cards" });
    S.laptops.forEach(l => grid.appendChild(h("div", { class: "card", id: "card-" + l.id })));
    list.appendChild(grid);
    S.laptops.forEach(l => paintCard(l.id));
  }

  function paintCard(id) {
    const l = S.laptops.find(x => x.id === id);
    const card = document.getElementById("card-" + id);
    if (!l || !card) return;
    const st = S.status[id] || { checking: true };
    const state = st.checking && st.online === undefined ? "checking" : st.online ? "online" : "offline";
    card.className = "card" + (state === "online" ? " online" : "");
    card.innerHTML = "";

    const label = { checking: "checking…", online: "online", offline: st.auth ? "password rejected" : "offline" }[state];
    card.appendChild(h("div", { class: "card-h" },
      h("div", { class: "card-ico" }, icon("fa-solid fa-computer")),
      h("div", { style: { minWidth: 0, flex: 1 } },
        h("div", { class: "card-name" }, l.name),
        h("div", { class: "card-meta" }, l.host + (l.port !== 5900 ? ":" + l.port : ""))),
      h("div", { class: "row", style: { gap: "7px" } }, h("span", { class: "dot " + state }), h("span", { class: "card-meta" }, label))));

    const kv = h("div", { class: "kv" });
    const row = (k, v) => { kv.appendChild(h("span", { class: "k" }, k)); kv.appendChild(h("span", { class: "v" }, v)); };
    if (st.online) {
      row("desktop", st.desktop || "—");
      row("screen", st.width + " × " + st.height + (st.monitors && st.monitors.length > 1 ? " · " + st.monitors.length + " monitors" : ""));
      const hw = st.hw;
      if (hw) {
        const gb = n => (n / 1073741824).toFixed(1);
        const pct = n => n == null ? "" : " · " + Math.round(n) + "% busy";
        if (hw.cpu) row("cpu", hw.cpu + (hw.cores ? " · " + hw.cores + " threads" : "") + pct(hw.cpuPct));
        if (hw.ramBytes) row("ram", (hw.ramUsedBytes != null ? gb(hw.ramUsedBytes) + " / " : "") + gb(hw.ramBytes) + " GB" +
          (hw.ramUsedBytes != null ? " used" : ""));
        if (!hw.gpus.length) row("gpu", "—");
        hw.gpus.forEach((g, i) => row(hw.gpus.length > 1 ? "gpu " + (i + 1) : "gpu", g.name +
          (g.vramMb ? " · " + (g.vramUsedMb != null ? (g.vramUsedMb / 1024).toFixed(1) + " / " : "") + (g.vramMb / 1024).toFixed(1) + " GB VRAM" : "") +
          (g.util != null ? pct(g.util) : "")));
        if (hw.os) row("os", hw.os);
      } else {
        row("hardware", h("span", { style: { color: "var(--muted)" }, title: st.hwError || "" },
          st.hwError === "not set up" ? "re-run the setup script on this PC to show it" : "unavailable" + (st.hwError ? " (" + st.hwError + ")" : "")));
      }
      row("latency", st.ms + " ms to sign in");
    } else if (st.error) {
      card.appendChild(h("div", { class: "note bad" }, st.error));
    }
    row("last used", l.lastConnectedAt ? fmtAgo(l.lastConnectedAt) : "never");
    card.appendChild(kv);

    const connect = h("a", { class: "btn primary", href: "/laptops/view/" + enc(id) }, icon("fa-solid fa-display"), "Connect");
    if (!st.online && !st.checking) connect.title = "It looks offline, but you can try anyway";
    card.appendChild(h("div", { class: "card-acts" },
      connect,
      h("button", { class: "btn sm", title: "Check again", onclick: () => probe(id, true) }, icon("fa-solid fa-rotate")),
      h("span", { class: "spacer" }),
      h("button", { class: "btn sm", title: "Paste a new pairing code (after re-running the setup script)", onclick: () => openPair(l) }, icon("fa-solid fa-link"), "Re-pair"),
      h("button", { class: "btn sm", title: "Rename", onclick: () => rename(l) }, icon("fa-solid fa-pen")),
      h("button", { class: "btn sm danger", title: "Forget this PC", onclick: () => remove(l) }, icon("fa-solid fa-trash"))));
  }

  // ── Setup instructions ──────────────────────────────────────────────────────
  function openSetup() {
    const base = location.protocol + "//" + (S.openhlIp ? S.openhlIp + (location.port ? ":" + location.port : "") : location.host);
    const cmd = "curl -fsSL " + base + "/laptops/setup.sh | sudo bash";
    const copy = h("button", { class: "btn sm", onclick: async () => toast(await writeClipboard(cmd) ? "Copied" : "Copy failed") }, icon("fa-regular fa-copy"), "Copy");
    const body = h("div", null,
      h("div", { class: "sec-s" }, "Do this once on each PC. It needs Tailscale running on the PC, and you signed in to its desktop. Wayland PCs work too (newer KDE and GNOME are reachable while someone is signed in)."),
      h("ol", { class: "setup-steps" },
        h("li", null, "On the PC, open a terminal and run:",
          h("div", { class: "cmd" }, h("pre", null, cmd), copy)),
        h("li", null, "It installs a VNC server that follows the login screen and your desktop, starts it at boot, and lets in only Gridlantis-HL",
          S.openhlIp ? " (" + S.openhlIp + ")" : "", " — never the internet or the rest of your tailnet."),
        h("li", null, "It prints a pairing code starting with ", h("code", null, "openhl-laptop:"), ". Paste that into ",
          h("b", null, "Pair a PC"), " here. Gridlantis-HL keeps the password; you will not type it again.")),
      h("div", { class: "hint" }, "Running the script again keeps the same password; with ", h("code", null, "--new-password"), " it makes a new one — then use Re-pair on that PC's card. ",
        "Options: ", h("code", null, "--port N"), ", ", h("code", null, "--name NAME"), ", ", h("code", null, "--uninstall"),
        " (pass them as ", h("code", null, "sudo bash -s -- --name work"), ")."));
    modal.open("Set up a PC", body, [h("button", { class: "btn primary", onclick: () => { modal.close(); openPair(); } }, "I have the code")]);
  }

  // ── Pairing ─────────────────────────────────────────────────────────────────
  function openPair(existing) {
    let manual = false;
    const code = h("textarea", { class: "in", rows: 3, placeholder: "openhl-laptop:…", spellcheck: "false" });
    const fName = h("input", { class: "in", placeholder: "work PC", value: existing ? existing.name : "" });
    const fHost = h("input", { class: "in", placeholder: "100.x.y.z", value: existing ? existing.host : "" });
    const fPort = h("input", { class: "in", type: "number", value: existing ? existing.port : 5900 });
    const fPass = h("input", { class: "in", type: "password", placeholder: "printed by the setup script", autocomplete: "new-password" });
    const result = h("div");
    const codeBox = h("div", { class: "fld full" }, h("label", null, "Pairing code"), code);
    const manualBox = h("div", { class: "form", style: { display: "none" } },
      h("div", { class: "fld" }, h("label", null, "Address (tailnet IP or name)"), fHost),
      h("div", { class: "fld" }, h("label", null, "Port"), fPort),
      h("div", { class: "fld full" }, h("label", null, "Password"), fPass));
    const toggle = h("button", { class: "btn sm", onclick: () => {
      manual = !manual; manualBox.style.display = manual ? "" : "none"; codeBox.style.display = manual ? "none" : "";
      toggle.textContent = manual ? "Use a pairing code" : "Enter it by hand";
    } }, "Enter it by hand");

    const payload = () => manual
      ? { name: fName.value, host: fHost.value, port: fPort.value, password: fPass.value }
      : { name: fName.value || undefined, pairing: code.value };

    const test = h("button", { class: "btn", onclick: async () => {
      result.innerHTML = ""; result.appendChild(h("div", { class: "note" }, "Signing in to the PC…"));
      test.disabled = true;
      try {
        const r = await api("POST", "/api/laptops/test", payload());
        result.innerHTML = "";
        result.appendChild(r.online
          ? h("div", { class: "note", style: { color: "var(--green)" } }, "Signed in — " + (r.desktop || "desktop") + ", " + r.width + " × " + r.height + ".")
          : h("div", { class: "note bad" }, r.error));
      } catch (e) { result.innerHTML = ""; result.appendChild(h("div", { class: "note bad" }, e.message)); }
      test.disabled = false;
    } }, icon("fa-solid fa-plug"), "Test");

    const save = h("button", { class: "btn primary", onclick: async () => {
      save.disabled = true;
      try {
        const p = payload();
        const r = existing ? await api("PATCH", "/api/laptops/" + enc(existing.id), Object.assign(p, { name: p.name || existing.name }))
          : await api("POST", "/api/laptops", p);
        modal.close();
        toast(existing || r.repaired ? "Re-paired " + r.name : "Paired " + r.name);
        load();
      } catch (e) { result.innerHTML = ""; result.appendChild(h("div", { class: "note bad" }, e.message)); save.disabled = false; }
    } }, icon("fa-solid fa-link"), existing ? "Save" : "Pair");

    modal.open(existing ? "Re-pair " + existing.name : "Pair a PC", h("div", { class: "rowset" },
      codeBox, manualBox,
      h("div", { class: "fld" }, h("label", null, "Name (optional — the code carries the PC's hostname)"), fName),
      h("div", { class: "row" }, toggle), result), [test, save]);
    setTimeout(() => code.focus(), 30);
  }

  async function rename(l) {
    const name = h("input", { class: "in", value: l.name });
    const save = h("button", { class: "btn primary", onclick: async () => {
      try { await api("PATCH", "/api/laptops/" + enc(l.id), { name: name.value }); modal.close(); load(); }
      catch (e) { toast(e.message, "bad"); }
    } }, "Save");
    modal.open("Rename PC", h("div", { class: "fld" }, h("label", null, "Name"), name), [save]);
    setTimeout(() => name.select(), 30);
  }

  async function remove(l) {
    if (!await confirmBox("Forget " + l.name + "?", "Gridlantis-HL deletes its saved password. The PC keeps running its VNC server until you run the setup script there with --uninstall.", "Forget")) return;
    try { await api("DELETE", "/api/laptops/" + enc(l.id)); toast("Forgot " + l.name); load(); }
    catch (e) { toast(e.message, "bad"); }
  }

  $("#b-setup").addEventListener("click", openSetup);
  $("#b-add").addEventListener("click", () => openPair());
  onServerEvents(() => load(), "laptops");
  load();
  // Keep the usage numbers current while the page is open.
  setInterval(() => {
    if (document.hidden) return;
    S.laptops.forEach(l => { if (S.status[l.id] && S.status[l.id].online) probe(l.id, false, true); });
  }, 15000);
})();
