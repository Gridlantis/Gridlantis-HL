/* Mobile host — the list of Android phones adb can see. Plain script, uses window.VL. */
(function () {
  "use strict";
  const { api, h, icon, toast, writeClipboard } = window.VL;
  const $ = s => document.querySelector(s);
  const enc = encodeURIComponent;
  const S = { devices: [], tools: null, loading: false };

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

  // ── Data ────────────────────────────────────────────────────────────────────
  async function load(force) {
    if (S.loading) return;
    S.loading = true;
    try {
      const r = await api("GET", "/api/mobile/devices" + (force ? "?force=1" : ""));
      S.devices = r.devices || []; S.tools = r.tools;
    } catch (e) { toast("Could not list phones: " + e.message, "bad"); }
    S.loading = false;
    render();
  }

  // ── Rendering ───────────────────────────────────────────────────────────────
  function render() {
    const banners = $("#banners"); banners.innerHTML = "";
    const list = $("#list"); list.innerHTML = "";
    const t = S.tools || {};
    if (!t.adb || !t.scrcpyServer) {
      const btn = h("button", { class: "btn primary", onclick: async () => {
        btn.disabled = true; btn.lastChild.textContent = " Downloading…";
        try { await api("POST", "/api/mobile/tools"); toast("Tools installed", "ok"); load(true); }
        catch (e) { toast(e.message, "bad"); btn.disabled = false; btn.lastChild.textContent = " Install tools"; }
      } }, icon("fa-solid fa-download"), " Install tools");
      banners.appendChild(h("div", { class: "empty" }, h("b", null, "One-time setup"),
        "Metis needs Android's adb (Google platform-tools, ~7 MB) and the scrcpy server (v" + (t.scrcpyVersion || "") + ") that runs on the phone. ",
        "They go in Metis's own folder — nothing is installed system-wide.", h("br"), h("br"), btn));
      return;
    }
    if (S.devices.some(d => d.state === "no permissions")) {
      const cmd = "sudo bash " + (t.usbScript || "tools/mobile/setup-usb.sh");
      banners.appendChild(h("div", { class: "note bad", style: { marginBottom: "14px" } },
        "A phone is plugged in by USB but Linux will not let Metis open it. Run this once in a terminal on the computer running Metis, then unplug and replug the phone:",
        h("div", { class: "cmd" }, h("pre", null, cmd),
          h("button", { class: "btn sm", onclick: async () => toast(await writeClipboard(cmd) ? "Copied" : "Copy failed") }, icon("fa-regular fa-copy"), "Copy"))));
    }
    if (!S.devices.length) {
      list.appendChild(h("div", { class: "empty" }, h("b", null, "No phones found"),
        h("ol", { class: "setup-steps", style: { textAlign: "left", display: "inline-block" } },
          h("li", null, "On the phone: Settings → About phone → tap ", h("b", null, "Build number"), " seven times to unlock Developer options."),
          h("li", null, "Developer options → turn on ", h("b", null, "USB debugging"), " (and ", h("b", null, "Wireless debugging"), " for Wi-Fi)."),
          h("li", null, h("b", null, "USB:"), " plug it into this computer (the one running Metis) and allow the prompt on the phone."),
          h("li", null, h("b", null, "Wi-Fi (Android 11+):"), " Wireless debugging → ", h("i", null, "Pair device with pairing code"),
            ", then use ", h("b", null, "Pair"), " above. Works over Tailscale too.")),
        h("div", { class: "hint" }, "adb " + (t.adbSource === "system" ? "(system)" : "(Metis's own)") + " · scrcpy " + t.scrcpyVersion)));
      return;
    }
    const grid = h("div", { class: "grid-cards" });
    S.devices.forEach(d => grid.appendChild(card(d)));
    list.appendChild(grid);
  }

  function card(d) {
    const ok = d.state === "device";
    const label = { device: "ready", unauthorized: "allow on the phone", offline: "offline", "no permissions": "no USB permission" }[d.state] || d.state;
    const name = [d.maker && !String(d.model).toLowerCase().startsWith(String(d.maker).toLowerCase()) ? d.maker : "", d.model].filter(Boolean).join(" ") || d.serial;
    const c = h("div", { class: "card" + (ok ? " online" : "") });
    c.appendChild(h("div", { class: "card-h" },
      h("div", { class: "card-ico" }, icon(d.transport === "wifi" ? "fa-solid fa-wifi" : "fa-solid fa-mobile-screen-button")),
      h("div", { style: { minWidth: 0, flex: 1 } },
        h("div", { class: "card-name" }, name),
        h("div", { class: "card-meta" }, d.serial + " · " + (d.transport === "wifi" ? "Wi-Fi" : "USB"))),
      h("div", { class: "row", style: { gap: "7px" } }, h("span", { class: "dot " + (ok ? "online" : "offline") }), h("span", { class: "card-meta" }, label))));
    const kv = h("div", { class: "kv" });
    const row = (k, v) => { kv.appendChild(h("span", { class: "k" }, k)); kv.appendChild(h("span", { class: "v" }, v)); };
    if (ok) {
      if (d.android) row("android", d.android);
      if (d.screen) row("screen", d.screen.replace("x", " × "));
      if (d.battery != null) row("battery", d.battery + "%");
    } else if (d.state === "unauthorized") {
      c.appendChild(h("div", { class: "note" }, "Unlock the phone and tap Allow on the \"Allow USB debugging?\" prompt, then refresh."));
    }
    if (d.error) c.appendChild(h("div", { class: "note bad" }, d.error));
    c.appendChild(kv);

    const acts = h("div", { class: "card-acts" });
    const view = h("a", { class: "btn primary", href: "/mobile/view/" + enc(d.serial) }, icon("fa-solid fa-display"), "Mirror");
    if (!ok) { view.classList.add("disabled"); view.removeAttribute("href"); }
    acts.appendChild(view);
    if (ok) acts.appendChild(fileButton(d));
    acts.appendChild(h("span", { class: "spacer" }));
    if (ok && d.transport === "usb") acts.appendChild(h("button", { class: "btn sm", title: "Switch this phone to Wi-Fi adb (until it reboots), so it can be unplugged",
      onclick: e => act(e.currentTarget, "wifi", d, "Now on Wi-Fi — you can unplug it") }, icon("fa-solid fa-wifi"), "Use Wi-Fi"));
    if (d.transport === "wifi") acts.appendChild(h("button", { class: "btn sm", title: "Disconnect",
      onclick: e => act(e.currentTarget, "disconnect", d, "Disconnected") }, icon("fa-solid fa-link-slash")));
    c.appendChild(acts);
    return c;
  }

  async function act(btn, what, d, done) {
    btn.disabled = true;
    try { await api("POST", "/api/mobile/" + enc(d.serial) + "/" + what); toast(done, "ok"); }
    catch (e) { toast(e.message, "bad"); }
    btn.disabled = false; load(true);
  }

  // Send a file: APKs are installed, everything else lands in Download/.
  function fileButton(d) {
    const input = h("input", { type: "file", hidden: true, multiple: true });
    const btn = h("button", { class: "btn sm", title: "Send files (APKs are installed)", onclick: () => input.click() }, icon("fa-solid fa-upload"), "Send file");
    input.addEventListener("change", async () => {
      for (const f of input.files) await sendFile(d.serial, f);
      input.value = "";
    });
    return h("span", null, btn, input);
  }
  async function sendFile(serial, f) {
    const apk = /\.apk$/i.test(f.name);
    toast((apk ? "Installing " : "Sending ") + f.name + "…");
    try {
      const r = await fetch("/api/mobile/" + enc(serial) + "/" + (apk ? "install" : "push") + "?name=" + enc(f.name), { method: "POST", body: f });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.statusText);
      toast(apk ? f.name + " installed" : f.name + " → " + j.path, "ok");
    } catch (e) { toast(f.name + ": " + e.message, "bad"); }
  }

  // ── Wireless ────────────────────────────────────────────────────────────────
  function openPair() {
    const addr = h("input", { class: "in", placeholder: "192.168.1.20:37099", spellcheck: "false" });
    const code = h("input", { class: "in", placeholder: "123456", inputmode: "numeric", maxlength: 6 });
    const conn = h("input", { class: "in", placeholder: "192.168.1.20:41237 (optional)", spellcheck: "false" });
    const out = h("div");
    const go = h("button", { class: "btn primary", onclick: async () => {
      go.disabled = true; out.innerHTML = ""; out.appendChild(h("div", { class: "note" }, "Pairing…"));
      try {
        await api("POST", "/api/mobile/pair", { address: addr.value.trim(), code: code.value.trim() });
        if (conn.value.trim()) await api("POST", "/api/mobile/connect", { address: conn.value.trim() });
        modal.close(); toast(conn.value.trim() ? "Paired and connected" : "Paired — now connect with the address shown under Wireless debugging", "ok"); load(true);
      } catch (e) { out.innerHTML = ""; out.appendChild(h("div", { class: "note bad" }, e.message)); }
      go.disabled = false;
    } }, "Pair");
    modal.open("Pair a phone (Android 11+)", h("div", { class: "rowset" },
      h("ol", { class: "setup-steps" },
        h("li", null, "Phone: Developer options → ", h("b", null, "Wireless debugging"), " → ", h("b", null, "Pair device with pairing code"), "."),
        h("li", null, "Enter the IP address & port and the 6-digit code it shows. (The phone must be on the same network as Metis, or on your tailnet.)"),
        h("li", null, "Then the address under ", h("i", null, "IP address & port"), " on the Wireless debugging screen connects it — it is a different port.")),
      h("div", { class: "fld" }, h("label", null, "Pairing IP address & port"), addr),
      h("div", { class: "fld" }, h("label", null, "Wi-Fi pairing code"), code),
      h("div", { class: "fld" }, h("label", null, "Connect address (IP address & port)"), conn), out), [go]);
    setTimeout(() => addr.focus(), 30);
  }
  function openConnect() {
    const addr = h("input", { class: "in", placeholder: "192.168.1.20:5555", spellcheck: "false" });
    const out = h("div");
    const go = h("button", { class: "btn primary", onclick: async () => {
      go.disabled = true; out.innerHTML = "";
      try { await api("POST", "/api/mobile/connect", { address: addr.value.trim() }); modal.close(); toast("Connected", "ok"); load(true); }
      catch (e) { out.appendChild(h("div", { class: "note bad" }, e.message)); }
      go.disabled = false;
    } }, "Connect");
    modal.open("Connect by address", h("div", { class: "rowset" },
      h("div", { class: "hint" }, "A phone already paired (Wireless debugging's IP address & port), or one switched to adb over TCP (port 5555)."),
      h("div", { class: "fld" }, h("label", null, "IP address & port"), addr), out), [go]);
    setTimeout(() => addr.focus(), 30);
  }

  // ── AirPlay (iPhone / iPad): view and listen only ───────────────────────────
  let AP = null, apBusy = false;
  async function loadAirplay() {
    try { AP = await api("GET", "/api/mobile/airplay"); } catch (e) { return; }
    renderAirplay();
  }
  async function apPost(url, body, label) {
    apBusy = true; renderAirplay(label);
    try { AP = await api("POST", url, body || {}); } catch (e) { toast(e.message, "bad"); }
    apBusy = false; renderAirplay();
  }
  function renderAirplay(busyLabel) {
    const box = $("#airplay"); box.innerHTML = "";
    if (!AP) return;
    const on = AP.enabled && AP.running;
    const c = h("div", { class: "card ap-card" + (AP.streaming ? " online" : "") });
    const state = AP.streaming ? "mirroring now" : on ? "waiting for an iPhone" : AP.enabled ? "starting…" : "off";
    c.appendChild(h("div", { class: "card-h" },
      h("div", { class: "card-ico" }, icon("fa-brands fa-apple")),
      h("div", { style: { minWidth: 0, flex: 1 } },
        h("div", { class: "card-name" }, "iPhone & iPad · AirPlay"),
        h("div", { class: "card-meta" }, "View and listen only — iOS cannot be controlled from another computer")),
      h("div", { class: "row", style: { gap: "7px" } }, h("span", { class: "dot " + (AP.streaming ? "online" : on ? "checking" : "offline") }), h("span", { class: "card-meta" }, state))));
    if (busyLabel) c.appendChild(h("div", { class: "note" }, busyLabel));
    if (on) {
      c.appendChild(h("ol", { class: "setup-steps" },
        h("li", null, "Put the iPhone on the same Wi-Fi as this computer (AirPlay is found on the local network, not over Tailscale)."),
        h("li", null, "Control Center → ", h("b", null, "Screen Mirroring"), " → ", h("b", null, AP.name), "."),
        h("li", null, "The first time, the iPhone asks for this PIN; after that it is remembered:")));
      c.appendChild(h("div", { class: "row", style: { gap: "10px", alignItems: "center" } },
        h("span", { class: "ap-pin" }, AP.pin),
        h("button", { class: "btn sm", title: "Make a new PIN (iPhones already paired keep working)", disabled: apBusy,
          onclick: () => apPost("/api/mobile/airplay/pin", null, "New PIN…") }, icon("fa-solid fa-rotate"), "New PIN")));
    } else if (!AP.enabled) {
      c.appendChild(h("div", { class: "hint", style: { marginTop: "6px" } },
        "Turns this computer into an AirPlay receiver called \"" + AP.name + "\". " +
        (AP.installed ? "" : "Metis downloads UxPlay (an open-source AirPlay server, ~0.3 MB) into its own folder — no sudo.")));
    }
    if (AP.enabled && !AP.running && AP.log && AP.log.length) c.appendChild(h("div", { class: "note bad" }, AP.log[AP.log.length - 1]));
    const acts = h("div", { class: "card-acts" });
    if (on) acts.appendChild(h("a", { class: "btn primary", href: "/mobile/view/airplay" }, icon("fa-solid fa-display"), AP.streaming ? "Watch" : "Open viewer"));
    acts.appendChild(h("span", { class: "spacer" }));
    acts.appendChild(h("button", { class: "btn sm", disabled: apBusy, title: "Rename the receiver",
      onclick: () => { const n = prompt("AirPlay name shown on the iPhone", AP.name); if (n && n.trim()) apPost("/api/mobile/airplay", { enabled: AP.enabled, name: n.trim() }, "Renaming…"); } }, icon("fa-solid fa-pen")));
    acts.appendChild(h("button", { class: "btn sm" + (AP.enabled ? "" : " primary"), disabled: apBusy,
      onclick: () => apPost("/api/mobile/airplay", { enabled: !AP.enabled }, AP.enabled ? "Turning off…" : (AP.installed ? "Starting…" : "Downloading UxPlay and starting…")) },
      icon("fa-solid fa-power-off"), AP.enabled ? "Turn off" : "Turn on AirPlay"));
    c.appendChild(acts);
    box.appendChild(h("div", { class: "sec-s", style: { margin: "0 0 8px" } }, "iPhone & iPad"));
    box.appendChild(c);
  }
  loadAirplay();
  setInterval(() => { if (!document.hidden && !apBusy) loadAirplay(); }, 4000);

  $("#b-pair").addEventListener("click", openPair);
  $("#b-connect").addEventListener("click", openConnect);
  $("#b-refresh").addEventListener("click", () => load(true));
  load(true);
  // Plugging a phone in should show up without a reload.
  setInterval(() => { if (!document.hidden && !$("#modal").classList.contains("on")) load(); }, 5000);
})();
