/* VM Lab — main page. Depends on common.js (window.VL). */
(function () {
  "use strict";
  const { api, h, icon, fmtBytes, fmtRate, fmtAgo, fmtDuration, toast, writeClipboard, OS_ICON, DISTRO_ICON } = window.VL;

  const TABS = ["envs", "images", "host", "usb", "hosts"];
  // S.host is the machine every VM, image and USB call on this page acts on:
  // "local" is the Gridlantis-HL serving the page, anything else is a second device
  // running the VM Lab agent. window.VL stamps it onto each request.
  const S = { ov: null, ovError: null, tab: "envs", specs: null, stats: null, statsTimer: null, hosts: null, host: "local" };
  const $ = sel => document.querySelector(sel);
  const panel = name => document.querySelector('[data-panel="' + name + '"]');

  // ── Data ────────────────────────────────────────────────────────────────────
  let loading = null;
  async function load() {
    if (loading) return loading;
    loading = (async () => {
      const forHost = S.host;
      try { S.ov = await api("GET", "/api/vmlab/overview"); S.ovError = null; }
      catch (e) {
        if (e.message === "signed out") return;
        // A host that is asleep or unreachable must not leave the previous
        // host's machines on screen looking like its own.
        S.ov = null;
        if (S.ovError !== e.message) toast("VM Lab: " + e.message, "bad");
        S.ovError = e.message;
      }
      finally { if (forHost === S.host) render(); loading = null; }
    })();
    return loading;
  }
  let reloadT = null;
  const reloadSoon = (ms) => { clearTimeout(reloadT); reloadT = setTimeout(load, ms || 250); };

  const imageById = id => (S.ov.images || []).find(i => i.id === id);
  const osIcon = (family, distro) => DISTRO_ICON[distro] || OS_ICON[family] || OS_ICON.other;

  // ── Modal ───────────────────────────────────────────────────────────────────
  const modal = {
    open(title, body, foot, wide) {
      $("#modal-title").textContent = title;
      const b = $("#modal-body"); b.innerHTML = ""; VL.h && b.appendChild(body);
      const f = $("#modal-foot"); f.innerHTML = ""; (foot || []).forEach(x => f.appendChild(x));
      $("#modal-box").classList.toggle("wide", !!wide);
      $("#modal").classList.add("on");
    },
    close() { $("#modal").classList.remove("on"); },
  };
  $("#modal-x").addEventListener("click", modal.close);
  $("#modal").addEventListener("mousedown", e => { if (e.target.id === "modal") modal.close(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { modal.close(); closeMenus(); } });

  function confirmBox(title, text, okLabel, danger) {
    return new Promise(resolve => {
      const ok = h("button", { class: "btn " + (danger ? "danger" : "primary"), onclick: () => { modal.close(); resolve(true); } }, okLabel || "OK");
      const cancel = h("button", { class: "btn", onclick: () => { modal.close(); resolve(false); } }, "Cancel");
      modal.open(title, h("div", { class: "help", style: { fontSize: "13px", color: "var(--text)" } }, text), [cancel, ok]);
    });
  }

  async function act(label, fn, okMsg) {
    try { const r = await fn(); if (okMsg) toast(okMsg); reloadSoon(); return r; }
    catch (e) { toast(label + ": " + e.message, "bad"); reloadSoon(); throw e; }
  }

  // ── Menus ───────────────────────────────────────────────────────────────────
  function closeMenus() { document.querySelectorAll(".menu.on").forEach(m => m.classList.remove("on")); }
  document.addEventListener("click", e => { if (!e.target.closest(".menu-wrap")) closeMenus(); });
  function menuButton(label, items) {
    const menu = h("div", { class: "menu" });
    items.filter(Boolean).forEach(it => {
      if (it === "-") return menu.appendChild(h("hr"));
      menu.appendChild(h("button", { class: it.danger ? "danger" : "", onclick: () => { closeMenus(); it.run(); } }, icon(it.icon), it.label));
    });
    const btn = h("button", { class: "btn sm", onclick: e => { e.stopPropagation(); const on = menu.classList.contains("on"); closeMenus(); menu.classList.toggle("on", !on); } }, label);
    return h("div", { class: "menu-wrap" }, btn, menu);
  }

  // ── Tabs ────────────────────────────────────────────────────────────────────
  function setTab(t) {
    S.tab = t;
    document.querySelectorAll(".vl-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
    document.querySelectorAll(".panel").forEach(p => p.classList.toggle("on", p.dataset.panel === t));
    try { localStorage.setItem("vmlab-tab", t); } catch (e) {}
    if (location.hash !== "#" + t) history.replaceState(null, "", "#" + t);
    clearInterval(S.statsTimer); S.statsTimer = null;
    if (t === "host") { loadSpecs(); pollStats(); S.statsTimer = setInterval(pollStats, 2000); }
    if (t === "usb") loadUsb();
    if (t === "hosts") loadHosts(true);
    render();
  }
  document.querySelectorAll(".vl-tab").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

  // ── Render root ─────────────────────────────────────────────────────────────
  function render() {
    renderHostPick();
    if (S.tab === "hosts") renderHosts();
    if (!S.ov) return renderUnreachable();
    renderBanners(); renderKpis();
    $("#n-envs").textContent = S.ov.envs.length;
    $("#n-images").textContent = S.ov.images.length;
    $("#n-usb").textContent = S.ov.usb.length;
    if (S.tab === "envs") renderEnvs();
    if (S.tab === "images") renderImages();
    if (S.tab === "host") renderHost();
    if (S.tab === "usb") renderUsb();
  }

  // The selected host did not answer. Say which one, and offer the way back to
  // this machine rather than leaving four empty tabs.
  function renderUnreachable() {
    const host = hostById(S.host);
    $("#kpis").innerHTML = "";
    $("#banners").innerHTML = "";
    for (const t of ["envs", "images", "host", "usb"]) panel(t).innerHTML = "";
    if (!S.ovError) return;
    $("#banners").appendChild(h("div", { class: "banner bad" },
      h("b", null, (host ? host.name : S.host) + " is not answering. "), S.ovError,
      h("div", { class: "row", style: { marginTop: "10px" } },
        h("button", { class: "btn sm", onclick: () => load() }, icon("fa-solid fa-rotate"), "Try again"),
        S.host === "local" ? null : h("button", { class: "btn sm", onclick: () => switchHost("local") }, icon("fa-solid fa-house"), "Back to this machine"),
        S.host === "local" ? null : h("button", { class: "btn sm", onclick: () => setTab("hosts") }, icon("fa-solid fa-network-wired"), "Hosts"))));
  }

  function renderBanners() {
    const c = S.ov.capabilities, box = $("#banners");
    box.innerHTML = "";
    if (!c.qemu || !c.qemuImg) box.appendChild(h("div", { class: "banner bad" }, h("b", null, "QEMU is not installed on this host. "),
      "VMs cannot start until it is. Without root run ", h("code", null, "tools/vmlab/install-qemu.sh"), ", or with root ",
      h("code", null, "sudo apt install qemu-system-x86 qemu-utils ovmf"), "."));
    else if (!c.kvm) box.appendChild(h("div", { class: "banner" }, h("b", null, "KVM acceleration is unavailable. "),
      "VMs will run in software emulation and be very slow. Enable virtualization in firmware and make sure Gridlantis-HL can open ", h("code", null, "/dev/kvm"), "."));
    else if (!c.kvmUsable) box.appendChild(h("div", { class: "banner" }, h("b", null, "Hardware acceleration is blocked right now: "), (c.kvmProblem || "KVM guests fail to start") + ". ",
      "New VMs fall back to software emulation, which is several times slower. Shut down the other hypervisor's VMs (or move them into VM Lab) to get full speed back — Gridlantis-HL re-checks automatically."));
    if (c.qemu && !c.systemdRun) box.appendChild(h("div", { class: "banner" },
      "systemd user services are unavailable, so running VMs will stop if the Gridlantis-HL process is killed."));
  }

  function kpi(k, v, pct) {
    return h("div", { class: "kpi" }, h("div", { class: "k" }, k), h("div", { class: "v" }, v),
      pct === undefined ? null : h("div", { class: "bar" }, h("i", { style: { width: Math.min(100, pct || 0) + "%" } })));
  }
  function renderKpis() {
    if (!S.ov) return;
    const envs = S.ov.envs, running = envs.filter(e => e.running);
    const vcpu = running.reduce((a, e) => a + e.cpus, 0), mem = running.reduce((a, e) => a + e.memoryMb, 0);
    const box = $("#kpis"); box.innerHTML = "";
    box.appendChild(kpi("Running", running.length + " / " + envs.length));
    box.appendChild(kpi("vCPU alloc", vcpu + " / " + S.ov.host.threads, vcpu / S.ov.host.threads * 100));
    box.appendChild(kpi("RAM alloc", fmtBytes(mem * 1048576) + " / " + fmtBytes(S.ov.host.memoryBytes, 0), mem * 1048576 / S.ov.host.memoryBytes * 100));
    if (S.stats && S.stats.latest) box.appendChild(kpi("Host CPU", Math.round(S.stats.latest.cpu) + "%", S.stats.latest.cpu));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Environments
  // ════════════════════════════════════════════════════════════════════════════
  function renderEnvs() {
    const p = panel("envs"); p.innerHTML = "";
    const head = h("div", { class: "row" },
      h("div", null, h("div", { class: "sec-t" }, "Virtual machines"), h("div", { class: "sec-s" }, "Each one is a full virtual machine. Open its console from any browser or the Gridlantis-HL desktop app.")),
      h("span", { class: "spacer" }),
      h("a", { class: "btn", href: "/vmlab/cuttlefish", title: "Google's Cuttlefish virtual Android phones on this machine" }, icon("fa-brands fa-android"), "Cuttlefish"),
      h("button", { class: "btn", onclick: () => openMobileVm(), title: "A virtual phone: Android or a Linux phone OS" }, icon("fa-solid fa-mobile-screen-button"), "New mobile VM"),
      h("button", { class: "btn primary", onclick: () => openCreateEnv(), disabled: !S.ov.images.length }, icon("fa-solid fa-plus"), "New VM"));
    p.appendChild(head);
    if (!S.ov.images.length) {
      p.appendChild(h("div", { class: "empty" }, h("b", null, "No operating systems yet"),
        "Download one from the catalog, or add an ISO you already have. ", h("button", { class: "btn sm", onclick: () => setTab("images") }, "Open operating systems")));
      return;
    }
    if (!S.ov.envs.length) {
      p.appendChild(h("div", { class: "empty" }, h("b", null, "No virtual machines"), "Create one from a disk image or boot straight from an ISO."));
      return;
    }
    const grid = h("div", { class: "grid-cards" });
    const order = { running: 0, starting: 1, stopping: 1, error: 2, stopped: 3 };
    S.ov.envs.slice().sort((a, b) => (order[a.status] - order[b.status]) || String(b.createdAt).localeCompare(String(a.createdAt)))
      .forEach(e => grid.appendChild(envCard(e)));
    p.appendChild(grid);
  }

  function envCard(e) {
    const img = imageById(e.imageId) || imageById(e.isoId) || {};
    const status = e.running ? (e.status === "stopping" ? "stopping" : "running") : e.status;
    const card = h("div", { class: "card " + (e.running ? "running" : "") });
    card.appendChild(h("div", { class: "card-h" },
      h("div", { class: "os-ico" }, icon(osIcon(e.family, img.distro))),
      h("div", { style: { minWidth: 0, flex: 1 } },
        h("div", { class: "card-name" }, e.name),
        h("div", { class: "card-meta" }, img.name || "image removed")),
      h("div", { class: "row", style: { gap: "6px" }, title: status }, h("span", { class: "dot " + status }), h("span", { class: "sec-s" }, status))));
    card.appendChild(h("div", { class: "badges" },
      e.mobile ? h("span", { class: "badge a" }, icon("fa-solid fa-mobile-screen-button"), " phone" + (e.screen ? " · " + e.screen.w + "×" + e.screen.h : "")) : null,
      h("span", { class: "badge " + (e.persistent ? "a" : "y") }, e.persistent ? "keeps changes" : "discarded on stop"),
      h("span", { class: "badge" }, e.cpus + " vCPU · " + fmtBytes(e.memoryMb * 1048576, 0) + " · " + e.diskGb + " GB"),
      h("span", { class: "badge" }, { nat: "internet", isolated: "isolated network", none: "no network" }[e.network]),
      e.usb && e.usb.enabled ? h("span", { class: "badge a" }, icon("fa-brands fa-usb"), " USB" + (e.usbAttached && e.usbAttached.length ? " ×" + e.usbAttached.length : "")) : null,
      e.running ? h("span", { class: "badge " + (e.agent ? "g" : "") , title: "QEMU guest agent — reports the guest IP and allows a clean shutdown" }, e.agent ? "agent ✓" : "agent —") : null,
      e.running && e.accel === "tcg" ? h("span", { class: "badge y", title: "Software emulation — no hardware acceleration" }, "slow mode") : null));

    if (e.running && e.usage) {
      const memPct = e.usage.rssBytes / (e.memoryMb * 1048576) * 100;
      card.appendChild(h("div", { class: "usage" },
        meter("CPU (host share)", e.usage.cpu.toFixed(1) + "%", e.usage.cpu * (S.ov.host.threads / e.cpus)),
        meter("Memory", fmtBytes(e.usage.rssBytes), memPct)));
    }

    const kv = h("div", { class: "kv" });
    if (e.login && !(e.cloudInit && e.cloudInit.enabled)) {
      kv.appendChild(h("span", { class: "k" }, "login"));
      kv.appendChild(h("span", { class: "v", title: "The image's default login — change it inside the VM" }, e.login.user + " / " + e.login.password));
    }
    if (e.cloudInit && e.cloudInit.enabled) {
      kv.appendChild(h("span", { class: "k" }, "login"));
      const pw = h("span", { class: "secret", title: "Click to copy password" }, "••••••••");
      pw.addEventListener("click", async () => { pw.textContent = e.cloudInit.password; await writeClipboard(e.cloudInit.password); toast("Password copied"); });
      kv.appendChild(h("span", { class: "v" }, e.cloudInit.username + " / ", pw));
    }
    if (e.running && e.sshPort) {
      kv.appendChild(h("span", { class: "k" }, e.family === "windows" ? "RDP" : e.family === "android" ? "adb" : "SSH"));
      kv.appendChild(h("span", { class: "v", title: "Reachable on the host only" }, e.family === "windows" || e.family === "android" ? "127.0.0.1:" + e.sshPort : "ssh -p " + e.sshPort + " " + ((e.cloudInit && e.cloudInit.username) || "user") + "@127.0.0.1"));
    }
    if (e.running && e.startedAt) { kv.appendChild(h("span", { class: "k" }, "up")); kv.appendChild(h("span", { class: "v" }, fmtDuration((Date.now() - Date.parse(e.startedAt)) / 1000))); }
    else if (e.stoppedAt) { kv.appendChild(h("span", { class: "k" }, "stopped")); kv.appendChild(h("span", { class: "v" }, fmtAgo(e.stoppedAt))); }
    if (kv.children.length) card.appendChild(kv);

    if (e.error) card.appendChild(h("div", { class: "note bad" }, e.error));
    (e.warnings || []).forEach(w => card.appendChild(h("div", { class: "note warn" }, w)));
    if (e.saving) card.appendChild(h("div", { class: "note" }, icon("fa-solid fa-spinner fa-spin"), " Saving disk as an image…"));
    else if (e.lastSave && e.lastSave.status === "error") card.appendChild(h("div", { class: "note bad" }, "Save as image failed: " + e.lastSave.error));
    if (e.running && e.cloudInit && e.cloudInit.enabled && !e.agent && e.startedAt && Date.now() - Date.parse(e.startedAt) < 15 * 60000)
      card.appendChild(h("div", { class: "note" }, "First boot installs the guest agent and creates the login — give it a few minutes."));
    if (!e.persistent && e.running) card.appendChild(h("div", { class: "note warn" }, "Shutting this VM down deletes it and everything in it."));
    if (e.family === "android" && e.running && e.startedAt && Date.now() - Date.parse(e.startedAt) < 20 * 60000)
      card.appendChild(h("div", { class: "note" }, "Android boots in the Console. For phone-style control — touch, keyboard, clipboard, sound — in the VM join the network (Android-x86: the \"VirtWifi\" Wi-Fi; Bliss: Ethernet is automatic), turn on USB debugging (Settings → About → tap Build number 7×, then Developer options), then press Mobile host."));

    const acts = h("div", { class: "card-acts" });
    if (e.running) {
      acts.appendChild(h("a", { class: "btn primary sm", href: VL.withHost("/vmlab/console/" + e.id), target: "_blank", rel: "noopener" }, icon("fa-solid fa-display"), "Console"));
      // Android on this machine: connect adb to the VM's forward and mirror it
      // in Mobile host (scrcpy) — the same control as a real phone.
      if (e.family === "android" && e.sshPort && !VL.vmHost()) acts.appendChild(h("button", { class: "btn sm", title: "Mirror and control this VM in Mobile host",
        onclick: async ev => {
          const b = ev.currentTarget; b.disabled = true;
          try { await api("POST", "/api/mobile/connect", { address: "127.0.0.1:" + e.sshPort }); window.open("/mobile/view/" + encodeURIComponent("127.0.0.1:" + e.sshPort), "_blank", "noopener"); }
          catch (er) { toast(/connect|refused|failed/i.test(er.message) ? "adb is not answering in the VM yet — turn on USB debugging there (Developer options), then try again" : er.message, "bad"); }
          b.disabled = false;
        } }, icon("fa-solid fa-mobile-screen-button"), "Mobile host"));
      acts.appendChild(h("button", { class: "btn sm", onclick: () => act("Shut down", () => api("POST", "/api/vmlab/envs/" + e.id + "/stop"), "Shutdown requested") }, icon("fa-solid fa-power-off"), "Shut down"));
    } else if (status === "starting") {
      acts.appendChild(h("button", { class: "btn sm", disabled: true }, icon("fa-solid fa-spinner fa-spin"), "Starting"));
    } else {
      acts.appendChild(h("button", { class: "btn ok sm", onclick: () => act("Start", () => api("POST", "/api/vmlab/envs/" + e.id + "/start"), "Started") }, icon("fa-solid fa-play"), "Start"));
    }
    acts.appendChild(h("span", { class: "spacer" }));
    acts.appendChild(menuButton(icon("fa-solid fa-ellipsis"), [
      e.running ? { icon: "fa-solid fa-rotate", label: "Hard reboot", run: () => act("Reboot", () => api("POST", "/api/vmlab/envs/" + e.id + "/reboot"), "Rebooted") } : null,
      e.running ? { icon: "fa-solid fa-plug-circle-xmark", label: "Force off", danger: true, run: () => act("Force off", () => api("POST", "/api/vmlab/envs/" + e.id + "/force-stop"), "Powered off") } : null,
      !e.running && e.isoId ? { icon: "fa-solid fa-compact-disc", label: e.bootFromIso ? "Boot from disk next time" : "Boot from ISO next time",
        run: () => act("Boot order", () => api("PATCH", "/api/vmlab/envs/" + e.id, { bootFromIso: !e.bootFromIso }), "Boot order updated") } : null,
      { icon: "fa-solid fa-sliders", label: "Settings", run: () => openEnvSettings(e) },
      !e.running && e.persistent && e.diskPath ? { icon: "fa-solid fa-floppy-disk", label: "Save disk as new image", run: () => saveImage(e) } : null,
      !e.running && e.persistent && e.diskPath ? { icon: "fa-solid fa-clock-rotate-left", label: "Reset disk to the base image", danger: true, run: async () => {
        if (await confirmBox("Reset disk?", "Everything written inside “" + e.name + "” is erased and it starts again from the base image.", "Reset", true))
          act("Reset", () => api("POST", "/api/vmlab/envs/" + e.id + "/reset"), "Disk reset");
      } } : null,
      { icon: "fa-solid fa-file-lines", label: "Logs", run: () => showLogs(e) },
      "-",
      { icon: "fa-solid fa-trash", label: "Delete VM", danger: true, run: async () => {
        if (await confirmBox("Delete VM?", "“" + e.name + "” " + (e.running ? "is running and will be powered off. " : "") + "Its disk is deleted.", "Delete", true))
          act("Delete", () => api("DELETE", "/api/vmlab/envs/" + e.id), "Deleted");
      } },
    ]));
    card.appendChild(acts);
    return card;
  }

  function meter(label, val, pct) {
    return h("div", { class: "meter" }, h("div", { class: "l" }, h("span", null, label), h("span", null, val)),
      h("div", { class: "t" }, h("i", { style: { width: Math.max(0, Math.min(100, pct || 0)) + "%" } })));
  }

  async function showLogs(e) {
    const pre = h("pre", { class: "log" }, "Loading…");
    const tabs = h("div", { class: "seg" });
    const loadKind = async kind => {
      tabs.querySelectorAll(".opt").forEach(o => o.classList.toggle("on", o.dataset.k === kind));
      try { const r = await fetch("/api/vmlab/envs/" + e.id + "/logs?kind=" + kind); pre.textContent = (await r.text()) || "(empty)"; pre.scrollTop = pre.scrollHeight; }
      catch (err) { pre.textContent = err.message; }
    };
    [["serial", "Serial console", "Boot and cloud-init output from the guest"], ["qemu", "QEMU", "Command line and hypervisor errors"]].forEach(([k, t, s]) =>
      tabs.appendChild(h("button", { class: "opt", "data-k": k, onclick: () => loadKind(k) }, h("b", null, t), h("span", null, s))));
    modal.open("Logs · " + e.name, h("div", null, tabs, pre), [h("button", { class: "btn", onclick: modal.close }, "Close")], true);
    loadKind("serial");
  }

  function saveImage(e) {
    const name = h("input", { class: "in", value: e.name + " (saved)" });
    modal.open("Save disk as an image", h("div", { class: "form" },
      h("div", { class: "fld full" }, h("label", null, "Image name"), name,
        h("div", { class: "hint" }, "Flattens this VM's disk into a new standalone image — set a machine up once (software, guest agent, drivers) and build new VMs from it."))),
      [h("button", { class: "btn", onclick: modal.close }, "Cancel"),
       h("button", { class: "btn primary", onclick: () => { modal.close(); act("Save image", () => api("POST", "/api/vmlab/envs/" + e.id + "/save-image", { name: name.value }), "Saving in the background…"); } }, "Save image")]);
  }

  function openEnvSettings(e) {
    const f = {
      name: h("input", { class: "in", value: e.name }),
      cpus: h("input", { class: "in", type: "number", min: 1, max: S.ov.host.threads, value: e.cpus, disabled: e.running }),
      memoryMb: h("input", { class: "in", type: "number", min: 256, step: 256, value: e.memoryMb, disabled: e.running }),
      network: select([["nat", "Internet (NAT)"], ["isolated", "Isolated — no network access"], ["none", "No network card"]], e.network, e.running),
      usb: h("input", { type: "checkbox", checked: e.usb && e.usb.enabled, disabled: e.running }),
      clipboard: h("input", { type: "checkbox", checked: e.clipboard !== false, disabled: e.running }),
    };
    const body = h("div", { class: "form" },
      fld("Name", f.name),
      fld("vCPUs", f.cpus), fld("Memory (MB)", f.memoryMb),
      fld("Network", f.network, null, true),
      h("label", { class: "switch full" }, f.usb, "Allow USB passthrough from the host"),
      h("label", { class: "switch full" }, f.clipboard, "Shared clipboard (needs spice-vdagent in the guest)"),
      e.running ? h("div", { class: "hint full" }, "Hardware settings can be changed while the VM is stopped.") : null);
    modal.open("Environment settings", body, [
      h("button", { class: "btn", onclick: modal.close }, "Cancel"),
      h("button", { class: "btn primary", onclick: async () => {
        const patch = { name: f.name.value };
        if (!e.running) Object.assign(patch, { cpus: +f.cpus.value, memoryMb: +f.memoryMb.value, network: f.network.value, usbEnabled: f.usb.checked, clipboard: f.clipboard.checked });
        await act("Save", () => api("PATCH", "/api/vmlab/envs/" + e.id, patch), "Saved"); modal.close();
      } }, "Save")]);
  }

  // ── Shared form bits ────────────────────────────────────────────────────────
  function fld(label, input, hint, full) {
    return h("div", { class: "fld" + (full ? " full" : "") }, h("label", null, label), input, hint ? h("div", { class: "hint" }, hint) : null);
  }
  function select(options, value, disabled) {
    const s = h("select", { class: "in", disabled });
    options.forEach(o => {
      if (o.group) { const g = h("optgroup", { label: o.group }); o.items.forEach(i => g.appendChild(h("option", { value: i[0], selected: i[0] === value }, i[1]))); s.appendChild(g); }
      else s.appendChild(h("option", { value: o[0], selected: o[0] === value }, o[1]));
    });
    return s;
  }

  // The machine form — the body of the "new VM" dialog.
  function machineForm(initial, opts) {
    opts = opts || {};
    const v = Object.assign({ cpus: 2, memoryMb: 2048, diskGb: 20, persistent: false, network: "nat", clipboard: true, usb: { enabled: false, devices: [] }, firmware: "bios" }, initial || {});
    const threads = S.ov.host.threads, maxMem = Math.floor(S.ov.host.memoryBytes / 1048576 / 256) * 256 - 512;
    const disks = S.ov.images.filter(i => i.kind !== "iso"), isos = S.ov.images.filter(i => i.kind === "iso");
    const imgSel = select([
      { group: "Ready-to-boot disk images", items: disks.map(i => [i.id, i.name + (i.cloudInit ? "  ·  cloud-init" : "")]) },
      { group: "Installer / live ISOs", items: isos.filter(i => !i.driverDisc).map(i => [i.id, i.name]) },
    ], v.imageId || v.isoId || (disks[0] || isos[0] || {}).id);
    const driverSel = select([["", "None"]].concat(isos.map(i => [i.id, i.name])), v.driverIsoId || "");

    const cpu = h("input", { type: "range", min: 1, max: threads, value: v.cpus });
    const cpuV = h("span", { class: "val" });
    const memOpts = [512, 1024, 2048, 3072, 4096, 6144, 8192, 12288, 16384, 24576, 32768].filter(m => m <= maxMem);
    const mem = h("input", { type: "range", min: 0, max: memOpts.length - 1, value: Math.max(0, memOpts.findIndex(m => m >= v.memoryMb)) });
    const memV = h("span", { class: "val" });
    const disk = h("input", { class: "in", type: "number", min: 4, max: 2048, value: v.diskGb });
    const upd = () => { cpuV.textContent = cpu.value + " vCPU"; memV.textContent = fmtBytes(memOpts[mem.value] * 1048576, 0); };
    cpu.addEventListener("input", upd); mem.addEventListener("input", upd); upd();

    let persistent = !!v.persistent;
    const optP = h("button", { type: "button", class: "opt" }, h("b", null, icon("fa-solid fa-floppy-disk"), " Keep changes"), h("span", null, "Persistent disk. Stop and resume later; work survives shutdowns."));
    const optE = h("button", { type: "button", class: "opt" }, h("b", null, icon("fa-solid fa-wand-magic-sparkles"), " Discard on shutdown"), h("span", null, "Ephemeral. The VM and everything written in it are deleted when it stops."));
    const paint = () => { optP.classList.toggle("on", persistent); optE.classList.toggle("on", !persistent); };
    optP.addEventListener("click", () => { persistent = true; paint(); });
    optE.addEventListener("click", () => { persistent = false; paint(); }); paint();

    const net = select([["nat", "Internet (NAT)"], ["isolated", "Isolated — no network"], ["none", "No network card"]], v.network);
    const family = select([["linux", "Linux"], ["windows", "Windows"], ["android", "Android"], ["other", "Other"]], v.family || "linux");
    const firmware = select([["bios", "BIOS (SeaBIOS)"], ["uefi", "UEFI (OVMF)"]], v.firmware);
    const desktopCb = h("input", { type: "checkbox", checked: !!v.desktop });
    const clip = h("input", { type: "checkbox", checked: v.clipboard !== false });

    const usbOn = h("input", { type: "checkbox", checked: !!(v.usb && v.usb.enabled) });
    const usbList = h("div", { class: "usb-pick" });
    const chosen = new Set(((v.usb && v.usb.devices) || []).map(d => d.vendorId + ":" + d.productId));
    S.ov.usb.forEach(d => {
      const cb = h("input", { type: "checkbox", checked: chosen.has(d.vendorId + ":" + d.productId), "data-vid": d.vendorId, "data-pid": d.productId, "data-label": d.product });
      usbList.appendChild(h("label", { title: d.node }, cb, h("span", { style: { flex: 1 } }, d.product, h("span", { class: "sec-s" }, "  " + d.vendorId + ":" + d.productId)),
        d.hid ? h("span", { class: "badge y", title: "Passing a keyboard or mouse through removes it from the host" }, "input device") : null,
        d.accessible ? null : h("span", { class: "badge r", title: "Run tools/vmlab/setup-host.sh on the host" }, "no permission")));
    });
    if (!S.ov.usb.length) usbList.appendChild(h("div", { class: "hint" }, "No USB devices are plugged into the host."));
    const usbWrap = h("div", null, h("div", { class: "hint", style: { margin: "0 0 6px" } }, "Ticked devices attach automatically at boot. Any host device can also be attached or detached live from the console."), usbList);
    const paintUsb = () => { usbWrap.style.display = usbOn.checked ? "" : "none"; };
    usbOn.addEventListener("change", paintUsb); paintUsb();

    const ci = Object.assign({ enabled: true, username: "", password: "", admin: true, packages: [], runcmd: [] }, v.cloudInit || {});
    const ciOn = h("input", { type: "checkbox", checked: v.cloudInit ? v.cloudInit.enabled !== false : true });
    const ciUser = h("input", { class: "in", value: ci.username, placeholder: "blank = your host username" });
    const ciPass = h("input", { class: "in", value: ci.password || "", placeholder: ci.passwordSet ? "(unchanged — stored)" : "blank = random per environment" });
    const ciAdmin = h("input", { type: "checkbox", checked: ci.admin !== false });
    const ciPkgs = h("input", { class: "in", value: (ci.packages || []).join(" "), placeholder: "e.g. git build-essential nginx" });
    const ciRun = h("textarea", { class: "in", placeholder: "one shell command per line, run once as root on first boot" }, (ci.runcmd || []).join("\n"));
    const ciBox = h("div", { class: "form" }, fld("Username", ciUser), fld("Password", ciPass),
      h("label", { class: "switch full" }, ciAdmin, "Give the user sudo"),
      fld("Extra packages", ciPkgs, null, true), fld("First-boot commands", ciRun, null, true));
    const paintCi = () => {
      const img = imageById(imgSel.value) || {};
      const can = img.kind !== "iso" && img.cloudInit;
      ciFs.style.display = can ? "" : "none";
      ciBox.style.display = ciOn.checked ? "" : "none";
    };
    const ciFs = h("fieldset", { class: "grp full" }, h("legend", null, "First boot (cloud-init)"),
      h("label", { class: "switch" }, ciOn, "Create a login and install the QEMU guest agent"), ciBox);
    ciOn.addEventListener("change", paintCi);

    const syncFromImage = () => {
      const img = imageById(imgSel.value) || {};
      family.value = img.family || "linux"; firmware.value = img.firmware || "bios"; desktopCb.checked = !!img.desktop;
      driverRow.style.display = family.value === "windows" ? "" : "none";
      const cat = (S.ov.catalog || []).find(c => c.id === img.osId);
      if (cat && cat.defaults && !opts.keepShape) {
        cpu.value = Math.min(threads, cat.defaults.cpus); disk.value = cat.defaults.diskGb;
        mem.value = Math.max(0, memOpts.findIndex(m => m >= cat.defaults.memoryMb)); if (mem.value < 0) mem.value = memOpts.length - 1;
        upd();
      }
      paintCi();
    };
    const driverRow = fld("Driver / tools disc (second CD)", driverSel, "For Windows, attach the virtio-win ISO to install the guest agent and clipboard tools.", true);
    family.addEventListener("change", () => { driverRow.style.display = family.value === "windows" ? "" : "none"; });
    imgSel.addEventListener("change", () => { opts.keepShape = false; syncFromImage(); });

    const el = h("div", { class: "form" },
      fld("Operating system", imgSel, null, true),
      h("div", { class: "full" }, h("div", { class: "lbl" }, "When the VM shuts down"), h("div", { class: "seg" }, optP, optE)),
      h("div", { class: "fld" }, h("label", null, "Processors"), h("div", { class: "range-row" }, cpu, cpuV)),
      h("div", { class: "fld" }, h("label", null, "Memory"), h("div", { class: "range-row" }, mem, memV)),
      fld("Disk size (GB)", disk, "Grows on demand; only used space is stored."), fld("Network", net),
      h("fieldset", { class: "grp full" }, h("legend", null, "Host USB ports"), h("label", { class: "switch" }, usbOn, "Allow this VM to use USB devices plugged into the host"), usbWrap),
      ciFs,
      h("details", { class: "full" }, h("summary", { class: "sec-s", style: { cursor: "pointer" } }, "Advanced"),
        h("div", { class: "form", style: { marginTop: "10px" } }, fld("Guest family", family), fld("Firmware", firmware),
          h("label", { class: "switch" }, desktopCb, "Graphical desktop guest"), h("label", { class: "switch" }, clip, "Shared clipboard"), driverRow)));
    opts.keepShape = !!initial && !opts.fromImage; syncFromImage();
    if (initial && !opts.fromImage) { family.value = v.family || family.value; firmware.value = v.firmware; desktopCb.checked = !!v.desktop; cpu.value = v.cpus; disk.value = v.diskGb; upd(); driverRow.style.display = family.value === "windows" ? "" : "none"; }
    paintCi();

    el.value = () => ({
      imageId: imgSel.value, cpus: +cpu.value, memoryMb: memOpts[mem.value], diskGb: +disk.value, persistent,
      network: net.value, family: family.value, firmware: firmware.value, desktop: desktopCb.checked, clipboard: clip.checked,
      driverIsoId: family.value === "windows" ? (driverSel.value || null) : null,
      usb: { enabled: usbOn.checked, devices: Array.from(usbList.querySelectorAll("input:checked")).map(c => ({ vendorId: c.dataset.vid, productId: c.dataset.pid, label: c.dataset.label })) },
      cloudInit: { enabled: ciOn.checked, username: ciUser.value, password: ciPass.value, admin: ciAdmin.checked,
        packages: ciPkgs.value.split(/[\s,]+/).filter(Boolean), runcmd: ciRun.value.split("\n").filter(x => x.trim()) },
    });
    return el;
  }

  // ── New mobile VM ──────────────────────────────────────────────────────────
  // Phone OSes from the catalog, ready in one step: downloads first if needed,
  // then the VM is created (and started) with phone settings.
  async function openMobileVm() {
    let list;
    try { list = await api("GET", "/api/vmlab/mobile"); } catch (e) { return toast(e.message, "bad"); }
    let pick = (list.find(c => c.imageId) || list[0]).id;
    const name = h("input", { class: "in", placeholder: "My phone" });
    const grid = h("div", { class: "mos-grid" });
    const paint = () => {
      grid.innerHTML = "";
      list.forEach(c => grid.appendChild(h("button", { class: "mos" + (c.id === pick ? " on" : ""), onclick: () => { pick = c.id; paint(); } },
        h("div", { class: "row", style: { gap: "9px", alignItems: "flex-start" } },
          h("div", { class: "os-ico" }, icon(c.family === "android" ? "fa-brands fa-android" : "fa-brands fa-linux")),
          h("div", { style: { minWidth: 0, textAlign: "left" } },
            h("div", { class: "card-name", style: { fontSize: "13.5px" } }, c.name),
            h("div", { class: "card-meta" }, c.imageId ? "downloaded · ready" : c.download ? "downloading…" : "downloads first · " + (c.size || "")),
            c.note ? h("div", { class: "sec-s", style: { marginTop: "4px", lineHeight: "1.5" } }, c.note) : null)))));
    };
    paint();
    const go = h("button", { class: "btn primary", onclick: async () => {
      go.disabled = true;
      try {
        const r = await api("POST", "/api/vmlab/mobile", { osId: pick, name: name.value.trim() || undefined });
        modal.close();
        if (r.downloading) { toast("Downloading — the VM is created and started when it finishes (see Operating systems)", "ok"); setTab("images"); }
        else toast("Created and starting", "ok");
        reloadSoon();
      } catch (e) { toast(e.message, "bad"); go.disabled = false; }
    } }, icon("fa-solid fa-mobile-screen-button"), "Create");
    modal.open("New mobile VM", h("div", null,
      h("div", { class: "sec-s", style: { marginBottom: "10px" } },
        "Android runs as x86 builds of Android; Linux phone systems are postmarketOS with a phone shell, on a phone-shaped screen. ",
        "Android VMs can be mirrored and controlled in Mobile host. iPhones cannot be virtualised — Apple does not license iOS for that."),
      grid,
      h("div", { class: "fld", style: { marginTop: "12px" } }, h("label", null, "Name"), name)), [go], true);
  }

  function openCreateEnv(_unused, imageId) {
    const body = h("div");
    const name = h("input", { class: "in", placeholder: "optional" });
    const startNow = h("input", { type: "checkbox", checked: true });
    const form = machineForm(imageId ? { imageId, isoId: imageId } : null, imageId ? { fromImage: true } : null);

    body.appendChild(h("div", { class: "form" }, fld("Name", name, null, true)));
    body.appendChild(h("div", { style: { marginTop: "14px" } }, form));
    body.appendChild(h("label", { class: "switch", style: { marginTop: "12px" } }, startNow, "Start it now"));

    const create = h("button", { class: "btn primary", onclick: async () => {
      const payload = Object.assign(form.value(), { start: startNow.checked });
      if (name.value) payload.name = name.value;
      create.disabled = true; create.textContent = startNow.checked ? "Starting…" : "Creating…";
      try {
        const env = await api("POST", "/api/vmlab/envs", payload);
        modal.close(); toast("“" + env.name + "” " + (env.running || env.status === "running" ? "is running" : "created"));
        reloadSoon(10);
      } catch (e) {
        toast(e.message, "bad"); create.disabled = false; create.textContent = "Create";
        if (e.data && e.data.env) { modal.close(); reloadSoon(10); }
      }
    } }, "Create");
    modal.open("New virtual machine", body, [h("button", { class: "btn", onclick: modal.close }, "Cancel"), create], true);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Operating systems (images)
  // ════════════════════════════════════════════════════════════════════════════
  function renderImages() {
    const p = panel("images"); p.innerHTML = "";
    p.appendChild(h("div", { class: "row" },
      h("div", null, h("div", { class: "sec-t" }, "Operating systems"), h("div", { class: "sec-s" }, "Base disks and ISOs on the host. Environments are copy-on-write overlays, so a base image is never modified.")),
      h("span", { class: "spacer" }),
      h("button", { class: "btn primary", onclick: openFromFiles }, icon("fa-solid fa-folder-open"), "Add from my files"),
      h("button", { class: "btn", onclick: openUpload }, icon("fa-solid fa-upload"), "Upload"),
      h("button", { class: "btn", onclick: openImport }, icon("fa-solid fa-terminal"), "Import by path"),
      h("button", { class: "btn", onclick: openUrlDownload }, icon("fa-solid fa-link"), "From URL")));

    const jobs = (S.ov.downloads || []).filter(j => j.status !== "done");
    if (jobs.length) {
      const box = h("div", { class: "box", style: { marginTop: "14px" } }, h("div", { class: "box-h" }, "Downloads"));
      jobs.forEach(j => {
        const pct = j.total ? j.received / j.total * 100 : 0;
        box.appendChild(h("div", { style: { marginBottom: "10px" } },
          h("div", { class: "row" }, h("b", null, j.name || j.url), h("span", { class: "spacer" }),
            h("span", { class: "sec-s" }, j.status === "downloading" ? fmtBytes(j.received) + (j.total ? " / " + fmtBytes(j.total) : "") + " · " + fmtRate(j.rate) : j.status),
            j.status === "downloading" || j.status === "resolving" ? h("button", { class: "btn sm danger", onclick: () => act("Cancel", () => api("DELETE", "/api/vmlab/downloads/" + j.id)) }, "Cancel")
              : h("button", { class: "btn sm", onclick: () => act("Dismiss", () => api("DELETE", "/api/vmlab/downloads/" + j.id)) }, "Dismiss")),
          j.error ? h("div", { class: "note bad" }, j.error) : h("div", { class: "progress" }, h("i", { style: { width: pct + "%" } }))));
      });
      p.appendChild(box);
    }

    if (S.ov.images.length) {
      const tb = h("tbody");
      S.ov.images.forEach(i => {
        tb.appendChild(h("tr", null,
          h("td", null, h("div", { class: "row", style: { gap: "9px", flexWrap: "nowrap" } }, icon(osIcon(i.family, i.distro)), h("b", null, i.name))),
          h("td", null, h("span", { class: "badge " + (i.kind === "iso" ? "" : "a") }, i.kind === "iso" ? "ISO" : "disk")),
          h("td", null, i.family),
          h("td", { class: "mono" }, fmtBytes(i.sizeBytes) + (i.virtualSize ? " / " + fmtBytes(i.virtualSize, 0) : "")),
          h("td", null, i.kind === "iso" ? "—" : i.cloudInit ? h("span", { class: "badge g" }, "cloud-init") : h("span", { class: "sec-s" }, "no")),
          h("td", null, i.firmware === "uefi" ? "UEFI" : "BIOS"),
          h("td", { class: "mono", title: i.source }, fmtAgo(i.createdAt)),
          h("td", null, h("div", { class: "row", style: { gap: "5px", flexWrap: "nowrap" } },
            !i.driverDisc ? h("button", { class: "btn sm", title: "New environment from this image", onclick: () => openCreateEnv(null, i.id) }, icon("fa-solid fa-play")) : null,
            h("button", { class: "btn sm", title: "Edit", onclick: () => editImage(i) }, icon("fa-solid fa-pen")),
            h("button", { class: "btn sm danger", title: "Delete", onclick: async () => {
              if (await confirmBox("Delete image?", "“" + i.name + "” (" + fmtBytes(i.sizeBytes) + ") is deleted from the host.", "Delete", true))
                act("Delete", () => api("DELETE", "/api/vmlab/images/" + i.id), "Deleted");
            } }, icon("fa-solid fa-trash"))))));
      });
      p.appendChild(h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" },
        h("thead", null, h("tr", null, ["Name", "Type", "Family", "Size / virtual", "First boot", "Firmware", "Added", ""].map(x => h("th", null, x)))), tb)));
    }

    p.appendChild(h("div", { class: "sec-t", style: { marginTop: "26px" } }, "Catalog"));
    p.appendChild(h("div", { class: "sec-s" }, "Official images. Cloud images boot in seconds and are set up automatically; ISOs install onto a blank disk."));
    const cat = h("div", { class: "cat" });
    S.ov.catalog.forEach(c => {
      const have = S.ov.images.filter(i => i.osId === c.id).length;
      const job = (S.ov.downloads || []).find(j => j.osId === c.id && (j.status === "downloading" || j.status === "resolving" || j.status === "registering"));
      cat.appendChild(h("div", { class: "card" },
        h("div", { class: "card-h" }, h("div", { class: "os-ico" }, icon(osIcon(c.family, c.distro))),
          h("div", { style: { flex: 1, minWidth: 0 } }, h("div", { class: "card-name", style: { fontSize: "13.5px" } }, c.name),
            h("div", { class: "card-meta" }, (c.kind === "cloud" ? "cloud image" : c.driverDisc ? "driver disc" : "ISO") + (c.size ? " · " + c.size : "")))),
        c.note ? h("div", { class: "note" }, c.note) : null,
        h("div", { class: "card-acts" },
          c.manual ? h("a", { class: "btn sm", href: c.infoUrl, target: "_blank", rel: "noopener" }, icon("fa-solid fa-arrow-up-right-from-square"), "Get ISO")
            : job ? h("button", { class: "btn sm", disabled: true }, icon("fa-solid fa-spinner fa-spin"), job.status)
            : h("button", { class: "btn sm " + (have ? "" : "primary"), onclick: () => act("Download", () => api("POST", "/api/vmlab/images/download", { osId: c.id }), "Download started") },
                icon("fa-solid fa-download"), have ? "Download again" : "Download"),
          c.manual ? h("button", { class: "btn sm", onclick: () => openUpload(c) }, icon("fa-solid fa-upload"), "Upload ISO") : null,
          have ? h("span", { class: "badge g" }, "installed") : null)));
    });
    p.appendChild(cat);
  }

  function imageMetaFields(defaults) {
    const d = Object.assign({ family: "linux", cloudInit: false, firmware: "bios", desktop: false }, defaults || {});
    const f = {
      family: select([["linux", "Linux"], ["windows", "Windows"], ["android", "Android"], ["other", "Other"]], d.family),
      firmware: select([["bios", "BIOS"], ["uefi", "UEFI"]], d.firmware),
      cloudInit: h("input", { type: "checkbox", checked: d.cloudInit }),
      desktop: h("input", { type: "checkbox", checked: d.desktop }),
    };
    f.el = h("div", { class: "form" }, fld("Guest family", f.family), fld("Firmware", f.firmware),
      h("label", { class: "switch" }, f.cloudInit, "Disk image supports cloud-init"), h("label", { class: "switch" }, f.desktop, "Graphical desktop"));
    f.value = () => ({ family: f.family.value, firmware: f.firmware.value, cloudInit: f.cloudInit.checked, desktop: f.desktop.checked });
    return f;
  }

  function openUpload(catalogEntry) {
    const file = h("input", { class: "in", type: "file", accept: ".iso,.qcow2,.img,.raw,.vmdk,.vdi,.vhd,.vhdx" });
    const meta = imageMetaFields(catalogEntry && catalogEntry.id ? { family: catalogEntry.family, firmware: catalogEntry.firmware, desktop: catalogEntry.desktop } : null);
    const bar = h("i", { style: { width: "0%" } });
    const status = h("div", { class: "sec-s" });
    const go = h("button", { class: "btn primary", onclick: () => {
      const fl = file.files[0]; if (!fl) return toast("Choose a file", "bad");
      const m = meta.value();
      const q = new URLSearchParams({ name: fl.name, family: m.family, firmware: m.firmware, cloudInit: m.cloudInit ? "1" : "0", desktop: m.desktop ? "1" : "0" });
      if (catalogEntry && catalogEntry.id) { q.set("osId", catalogEntry.id); q.set("label", catalogEntry.name); }
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", "/api/vmlab/images/upload?" + q.toString());
      xhr.upload.onprogress = e => { if (e.lengthComputable) { bar.style.width = (e.loaded / e.total * 100) + "%"; status.textContent = fmtBytes(e.loaded) + " / " + fmtBytes(e.total); } };
      xhr.onload = () => { if (xhr.status === 200) { modal.close(); toast("Uploaded " + fl.name); reloadSoon(10); } else { go.disabled = false; toast("Upload failed: " + xhr.responseText, "bad"); } };
      xhr.onerror = () => { go.disabled = false; toast("Upload failed (network)", "bad"); };
      go.disabled = true; xhr.send(fl);
    } }, "Upload");
    modal.open(catalogEntry && catalogEntry.id ? "Upload · " + catalogEntry.name : "Upload an image or ISO", h("div", null,
      h("div", { class: "form" }, fld("File", file, "Large ISOs upload straight to disk on the host.", true)), meta.el,
      h("div", { class: "progress" }, bar), status), [h("button", { class: "btn", onclick: modal.close }, "Cancel"), go]);
  }

  // Pick an ISO (or disk image) you already have in Gridlantis-HL Files. The common
  // case: download something in the browser, then boot it here.
  function openFromFiles() {
    const listBox = h("div", { class: "usb-pick", style: { maxHeight: "300px" } }, h("div", { class: "hint" }, icon("fa-solid fa-spinner fa-spin"), " Looking through your files…"));
    const meta = imageMetaFields();
    const mode = select([["link", "Link — leave the file where it is (no extra disk space)"], ["copy", "Copy into vmlab/images"]], "link");
    const modeRow = fld("How to add it", mode, null, true);
    let chosen = null;

    const go = h("button", { class: "btn primary", disabled: true, onclick: async () => {
      if (!chosen) return;
      go.disabled = true; go.textContent = "Adding…";
      try {
        await api("POST", "/api/vmlab/images/import", Object.assign({ path: chosen.path, mode: mode.value, name: chosen.name }, meta.value()));
        modal.close(); toast("“" + chosen.name + "” added"); reloadSoon(10);
      } catch (e) { toast(e.message, "bad"); go.disabled = false; go.textContent = "Add"; }
    } }, "Add");

    modal.open("Add an image from my files", h("div", null,
      h("div", { class: "sec-s", style: { marginBottom: "10px" } }, "ISOs and disk images you already have. Anything you upload to Gridlantis-HL Files — or drop in a media folder — shows up here."),
      listBox, h("div", { class: "form", style: { marginTop: "12px" } }, modeRow), meta.el),
      [h("button", { class: "btn", onclick: modal.close }, "Cancel"), go], true);

    api("GET", "/api/vmlab/files").then(files => {
      files.sort((a, b) => String(a.source).localeCompare(String(b.source)) || b.mtime - a.mtime);
      listBox.innerHTML = "";
      if (!files.length) {
        listBox.appendChild(h("div", { class: "hint" }, "No ISOs or disk images found in your files. Upload one in the Files app first, or use “From URL” to download one straight into VM Lab."));
        return;
      }
      let group = null;
      files.forEach(f => {
        if (f.source !== group) {                       // one heading per media folder
          group = f.source;
          listBox.appendChild(h("div", { class: "sec-s", style: { margin: "6px 0 2px", fontWeight: "600" } }, group));
        }
        const radio = h("input", { type: "radio", name: "vmfile", disabled: f.added });
        const row = h("label", { title: f.path },
          radio,
          h("span", { style: { flex: 1, minWidth: 0 } }, h("b", null, f.name),
            h("span", { class: "sec-s" }, "  " + f.relPath.replace(/[^/]*$/, "") + " · " + fmtBytes(f.sizeBytes))),
          h("span", { class: "badge " + (f.kind === "iso" ? "" : "a") }, f.kind === "iso" ? "ISO" : "disk"),
          f.added ? h("span", { class: "badge g" }, "already added") : null);
        radio.addEventListener("change", () => {
          chosen = f;
          go.disabled = false;
          // An ISO is booted as a CD, so the disk-image options do not apply.
          meta.el.querySelectorAll(".switch").forEach(l => { l.style.display = f.kind === "iso" ? "none" : ""; });
        });
        listBox.appendChild(row);
      });
    }).catch(e => { listBox.innerHTML = ""; listBox.appendChild(h("div", { class: "note bad" }, e.message)); });
  }

  function openImport() {
    const p = h("input", { class: "in", placeholder: "/home/you/Downloads/Win11_English_x64.iso" });
    const mode = select([["copy", "Copy into vmlab/images"], ["link", "Link (no copy — keep the original file in place)"]], "copy");
    const meta = imageMetaFields();
    const go = h("button", { class: "btn primary", onclick: async () => {
      go.disabled = true; go.textContent = "Importing…";
      try { await api("POST", "/api/vmlab/images/import", Object.assign({ path: p.value, mode: mode.value }, meta.value())); modal.close(); toast("Imported"); reloadSoon(10); }
      catch (e) { toast(e.message, "bad"); go.disabled = false; go.textContent = "Import"; }
    } }, "Import");
    modal.open("Import a file by its path on the host", h("div", null, h("div", { class: "form" }, fld("Path on the host", p, null, true), fld("Mode", mode, null, true)), meta.el),
      [h("button", { class: "btn", onclick: modal.close }, "Cancel"), go]);
  }

  function openUrlDownload() {
    const url = h("input", { class: "in", placeholder: "https://…/image.qcow2 or .iso" });
    const name = h("input", { class: "in", placeholder: "optional display name" });
    modal.open("Download from a URL", h("div", { class: "form" }, fld("URL", url, null, true), fld("Name", name, null, true),
      h("div", { class: "hint full" }, "After it finishes, edit the image to set its family and whether it supports cloud-init.")),
      [h("button", { class: "btn", onclick: modal.close }, "Cancel"),
       h("button", { class: "btn primary", onclick: () => { modal.close(); act("Download", () => api("POST", "/api/vmlab/images/download", { url: url.value, name: name.value || undefined }), "Download started"); } }, "Download")]);
  }

  function editImage(i) {
    const name = h("input", { class: "in", value: i.name });
    const meta = imageMetaFields(i);
    modal.open("Edit image", h("div", null, h("div", { class: "form" }, fld("Name", name, h("span", { class: "mono" }, i.path), true)), meta.el), [
      h("button", { class: "btn", onclick: modal.close }, "Cancel"),
      h("button", { class: "btn primary", onclick: async () => { await act("Save", () => api("PATCH", "/api/vmlab/images/" + i.id, Object.assign({ name: name.value }, meta.value())), "Saved"); modal.close(); } }, "Save")]);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Host
  // ════════════════════════════════════════════════════════════════════════════
  async function loadSpecs(refresh) {
    try { S.specs = await api("GET", "/api/vmlab/host/specs" + (refresh ? "?refresh=1" : "")); $("#host-name").textContent = S.specs.hostname; if (S.tab === "host") renderHost(); }
    catch (e) { if (!S.ovError) toast("Host specs: " + e.message, "bad"); }
  }
  async function pollStats() {
    try { S.stats = await api("GET", "/api/vmlab/host/stats"); if (S.tab === "host") paintStats(); renderKpis(); } catch (e) {}
  }

  function renderHost() {
    const p = panel("host");
    if (p.dataset.built === "1" && S.specs) { paintStats(); return; }
    p.innerHTML = "";
    if (!S.specs) { p.dataset.built = ""; p.appendChild(h("div", { class: "help" }, "Loading host details…")); return; }
    p.dataset.built = "1";
    const s = S.specs;
    p.appendChild(h("div", { class: "row" },
      h("div", null, h("div", { class: "sec-t" }, s.hostname), h("div", { class: "sec-s" }, s.os + " · kernel " + s.kernel + " · " + s.arch)),
      h("span", { class: "spacer" }), h("button", { class: "btn", onclick: () => { p.dataset.built = ""; loadSpecs(true); } }, icon("fa-solid fa-rotate"), "Rescan")));

    const hw = h("div", { class: "kv" });
    const row = (k, v) => { hw.appendChild(h("span", { class: "k" }, k)); hw.appendChild(h("span", { class: "v", title: typeof v === "string" ? v : "" }, v)); };
    row("CPU", s.cpu.model);
    row("Topology", (s.cpu.sockets > 1 ? s.cpu.sockets + " sockets · " : "") + (s.cpu.cores ? s.cpu.cores + " cores · " : "") + s.cpu.threads + " threads" + (s.cpu.maxMhz ? " · up to " + (s.cpu.maxMhz / 1000).toFixed(1) + " GHz" : ""));
    row("Memory", fmtBytes(s.memoryBytes) + (s.swapBytes ? " + " + fmtBytes(s.swapBytes) + " swap" : ""));
    s.disks.forEach(d => row("Disk " + d.name, fmtBytes(d.sizeBytes, 0) + " · " + (d.model || "disk") + " · " + (d.rotational ? "HDD" : "SSD") + (d.transport ? " · " + d.transport : "")));
    s.gpus.forEach((g, i) => row("GPU" + (s.gpus.length > 1 ? " " + (i + 1) : ""), g));
    s.nics.forEach(n => row(n.tailscale ? "Tailscale" : "NIC " + n.name, n.addresses.join(", ") + (n.speedMbps ? " · " + n.speedMbps + " Mb/s" : "")));

    const v = s.virt;
    const ck = (ok, label, fix) => h("div", null, h("span", { class: ok ? "pass" : "failc" }, icon(ok ? "fa-solid fa-circle-check" : "fa-solid fa-circle-xmark")),
      h("span", null, label, !ok && fix ? h("div", { class: "hint" }, fix) : null));
    const checklist = h("div", { class: "checklist" },
      ck(!!s.cpu.virtualization, "Hardware virtualization" + (s.cpu.virtualization ? " (" + s.cpu.virtualization + ")" : ""), "Enable VT-x / AMD-V in the firmware setup."),
      ck(v.kvm, "KVM available to Gridlantis-HL", "Add the Gridlantis-HL user to the kvm group, then log in again."),
      ck(v.kvmUsable, "KVM guests actually run", v.kvmProblem || "Another hypervisor may be holding VT-x."),
      ck(!!v.qemu, "QEMU " + (v.qemuVersion || ""), "Run tools/vmlab/install-qemu.sh (no root) or install qemu-system-x86."),
      ck(!!v.qemuImg, "qemu-img", "Installed with QEMU."),
      ck(v.uefi, "UEFI firmware (OVMF)", "Needed only for UEFI guests such as Windows 11."),
      ck(v.swtpm, "TPM emulator (swtpm)", "Optional: Windows 11 wants TPM 2.0. sudo apt install swtpm"),
      ck(v.systemdRun, "VMs outlive Gridlantis-HL restarts (systemd user units)", "Without it, VMs stop if the Gridlantis-HL process is killed."));

    p.appendChild(h("div", { class: "two", style: { marginTop: "14px" } },
      h("div", { class: "box" }, h("div", { class: "box-h" }, "Hardware"), hw),
      h("div", { class: "box" }, h("div", { class: "box-h" }, "Virtualization"), checklist)));

    p.appendChild(h("div", { class: "three", style: { marginTop: "14px" } },
      h("div", { class: "box" }, h("div", { class: "box-h" }, "CPU", h("span", { id: "hs-cpu" })), h("canvas", { class: "chart", id: "ch-cpu" }),
        h("div", { class: "legend" }, h("span", null, h("i", { style: { background: "var(--accent2)" } }), "host"), h("span", null, h("i", { style: { background: "var(--accent)" } }), "VMs"))),
      h("div", { class: "box" }, h("div", { class: "box-h" }, "Memory", h("span", { id: "hs-mem" })), h("canvas", { class: "chart", id: "ch-mem" }),
        h("div", { class: "legend" }, h("span", null, h("i", { style: { background: "var(--accent2)" } }), "used"), h("span", null, h("i", { style: { background: "var(--accent)" } }), "VMs"))),
      h("div", { class: "box" }, h("div", { class: "box-h" }, "Network · disk", h("span", { id: "hs-io" })), h("canvas", { class: "chart", id: "ch-io" }),
        h("div", { class: "legend" }, h("span", null, h("i", { style: { background: "var(--green)" } }), "net in"), h("span", null, h("i", { style: { background: "var(--yellow)" } }), "net out"),
          h("span", null, h("i", { style: { background: "var(--accent)" } }), "disk read"), h("span", null, h("i", { style: { background: "var(--red)" } }), "disk write")))));

    p.appendChild(h("div", { class: "two", style: { marginTop: "14px" } },
      h("div", { class: "box" }, h("div", { class: "box-h" }, "Per-thread load"), h("div", { class: "cores", id: "hs-cores" })),
      h("div", { class: "box" }, h("div", { class: "box-h" }, "Capacity"), h("div", { id: "hs-cap" }))));
    p.appendChild(h("div", { class: "box", style: { marginTop: "14px" } }, h("div", { class: "box-h" }, "Running VMs"), h("div", { id: "hs-vms" })));
    paintStats();
  }

  function paintStats() {
    const st = S.stats; if (!st || !st.latest || !document.getElementById("ch-cpu")) return;
    const L = st.latest, hist = st.history || [];
    $("#hs-cpu").textContent = Math.round(L.cpu) + "% · load " + L.load.map(x => x.toFixed(2)).join(" ") + (L.temp ? " · " + L.temp + "°C" : "");
    $("#hs-mem").textContent = fmtBytes(L.memUsedBytes) + " / " + fmtBytes(L.memTotalBytes, 0);
    $("#hs-io").textContent = "↓" + fmtRate(L.rxRate) + " ↑" + fmtRate(L.txRate);
    drawChart($("#ch-cpu"), hist, [{ key: "cpu", color: "--accent2", fill: true }, { key: "vmCpu", color: "--accent" }], 100, v => v + "%");
    drawChart($("#ch-mem"), hist, [{ key: "mem", color: "--accent2", fill: true }, { key: h2 => h2.vmMemBytes / L.memTotalBytes * 100, color: "--accent" }], 100, v => v + "%");
    const ioMax = Math.max(1024 * 64, ...hist.map(x => Math.max(x.rxRate, x.txRate, x.readRate, x.writeRate)));
    drawChart($("#ch-io"), hist, [{ key: "rxRate", color: "--green" }, { key: "txRate", color: "--yellow" }, { key: "readRate", color: "--accent" }, { key: "writeRate", color: "--red" }], ioMax, v => fmtRate(v));

    const cores = $("#hs-cores"); cores.innerHTML = "";
    (L.perCore || []).forEach((c, i) => cores.appendChild(h("div", { class: "core", title: "thread " + i }, h("i", { style: { height: c + "%" } }), h("span", null, Math.round(c) + "%"))));

    const cap = $("#hs-cap"); cap.innerHTML = "";
    const threads = S.specs ? S.specs.cpu.threads : S.ov.host.threads;
    cap.appendChild(meter("vCPUs allocated to running VMs", st.allocated.vcpus + " / " + threads + " threads", st.allocated.vcpus / threads * 100));
    cap.appendChild(h("div", { style: { height: "10px" } }));
    cap.appendChild(meter("Memory allocated to running VMs", fmtBytes(st.allocated.memoryMb * 1048576) + " / " + fmtBytes(L.memTotalBytes, 0), st.allocated.memoryMb * 1048576 / L.memTotalBytes * 100));
    if (st.vmlabDisk) {
      cap.appendChild(h("div", { style: { height: "10px" } }));
      const used = st.vmlabDisk.totalBytes - st.vmlabDisk.freeBytes;
      cap.appendChild(meter("VM storage volume", fmtBytes(st.vmlabDisk.freeBytes) + " free of " + fmtBytes(st.vmlabDisk.totalBytes, 0), used / st.vmlabDisk.totalBytes * 100));
    }
    if (L.swapTotalBytes) { cap.appendChild(h("div", { style: { height: "10px" } })); cap.appendChild(meter("Swap in use", fmtBytes(L.swapUsedBytes), L.swapUsedBytes / L.swapTotalBytes * 100)); }
    cap.appendChild(h("div", { class: "hint", style: { marginTop: "10px" } }, "Host up " + fmtDuration(L.uptime) + ". Allocations above 100% overcommit the host and slow every VM."));

    const vms = $("#hs-vms"); vms.innerHTML = "";
    const running = S.ov.envs.filter(e => e.running);
    if (!running.length) vms.appendChild(h("div", { class: "help" }, "No VMs are running."));
    running.forEach(e => {
      const u = st.vms[e.id] || { cpu: 0, rssBytes: 0 };
      vms.appendChild(h("div", { class: "row", style: { padding: "6px 0", borderBottom: "1px solid var(--border)" } },
        h("span", { class: "dot running" }), h("b", { style: { minWidth: "180px" } }, e.name),
        h("div", { style: { flex: 1, minWidth: "160px" } }, meter("CPU", u.cpu.toFixed(1) + "% of host", u.cpu)),
        h("div", { style: { flex: 1, minWidth: "160px" } }, meter("Memory", fmtBytes(u.rssBytes) + " / " + fmtBytes(e.memoryMb * 1048576, 0), u.rssBytes / (e.memoryMb * 1048576) * 100))));
    });
  }

  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888"; }
  function drawChart(canvas, hist, series, max, fmt) {
    const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, hgt = canvas.clientHeight;
    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = hgt * dpr; }
    const c = canvas.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, hgt);
    c.strokeStyle = cssVar("--border"); c.lineWidth = 1; c.fillStyle = cssVar("--muted"); c.font = "11px IBM Plex Sans, sans-serif";
    for (let i = 0; i <= 2; i++) { const y = 4 + (hgt - 8) * i / 2; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.fillText(fmt(Math.round(max)), 3, 12);
    const N = 180, step = w / (N - 1), off = N - hist.length;
    series.forEach(sr => {
      const col = cssVar(sr.color);
      const val = x => typeof sr.key === "function" ? sr.key(x) : x[sr.key];
      c.beginPath();
      hist.forEach((pt, i) => { const x = (off + i) * step, y = hgt - 4 - Math.min(1, (val(pt) || 0) / max) * (hgt - 8); i ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.strokeStyle = col; c.lineWidth = 1.6; c.stroke();
      if (sr.fill && hist.length) {
        c.lineTo((off + hist.length - 1) * step, hgt); c.lineTo(off * step, hgt); c.closePath();
        c.globalAlpha = .12; c.fillStyle = col; c.fill(); c.globalAlpha = 1;
      }
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // USB
  // ════════════════════════════════════════════════════════════════════════════
  async function loadUsb() {
    try { S.usbDetail = await api("GET", "/api/vmlab/usb"); if (S.tab === "usb") renderUsb(); } catch (e) { toast("USB: " + e.message, "bad"); }
  }
  function renderUsb() {
    const p = panel("usb"); p.innerHTML = "";
    const list = S.usbDetail || S.ov.usb;
    p.appendChild(h("div", { class: "row" },
      h("div", null, h("div", { class: "sec-t" }, "Host USB devices"), h("div", { class: "sec-s" }, "Pass a device plugged into the host through to a running VM. It disappears from the host while attached.")),
      h("span", { class: "spacer" }), h("button", { class: "btn", onclick: loadUsb }, icon("fa-solid fa-rotate"), "Refresh")));
    if (list.some(d => !d.accessible)) p.appendChild(h("div", { class: "banner", style: { marginTop: "12px" } },
      h("b", null, "Some devices are not accessible to Gridlantis-HL. "), "USB device nodes belong to root by default. Run this once on the host to grant access, then replug the devices:",
      h("div", { style: { marginTop: "6px" } }, h("code", null, "sudo tools/vmlab/setup-host.sh"))));
    if (!list.length) { p.appendChild(h("div", { class: "empty" }, h("b", null, "No USB devices"), "Nothing is plugged into the host's USB ports (hubs are hidden).")); return; }
    const targets = S.ov.envs.filter(e => e.running && e.usb && e.usb.enabled);
    const tb = h("tbody");
    list.forEach(d => {
      const sel = select([["", targets.length ? "Attach to…" : "No running VM allows USB"]].concat(targets.map(e => [e.id, e.name])), "", !targets.length || !d.accessible || !!d.attachedTo);
      sel.style.minWidth = "180px";
      sel.addEventListener("change", () => { if (sel.value) act("Attach", () => api("POST", "/api/vmlab/envs/" + sel.value + "/usb", { busnum: d.busnum, devnum: d.devnum }), "Attached").then(loadUsb, loadUsb); });
      tb.appendChild(h("tr", null,
        h("td", null, h("b", null, d.product), h("div", { class: "sec-s" }, d.manufacturer || "")),
        h("td", { class: "mono" }, d.vendorId + ":" + d.productId),
        h("td", { class: "mono" }, "bus " + d.busnum + " · dev " + d.devnum + " · port " + d.port),
        h("td", null, d.speedMbps ? d.speedMbps + " Mb/s" : "—"),
        h("td", null, (d.classes || []).join(", ") || "—", d.hid ? h("span", { class: "badge y", style: { marginLeft: "6px" } }, "input") : null),
        h("td", null, d.accessible ? h("span", { class: "badge g" }, "ok") : h("span", { class: "badge r", title: d.node }, "no permission")),
        h("td", null, d.attachedTo ? h("div", { class: "row", style: { gap: "6px", flexWrap: "nowrap" } }, h("span", { class: "badge a" }, d.attachedTo.envName),
          h("button", { class: "btn sm", onclick: () => act("Detach", () => api("DELETE", "/api/vmlab/envs/" + d.attachedTo.envId + "/usb/" + d.attachedTo.qid), "Detached").then(loadUsb, loadUsb) }, "Detach")) : sel)));
    });
    p.appendChild(h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" },
      h("thead", null, h("tr", null, ["Device", "ID", "Location", "Speed", "Class", "Access", "VM"].map(x => h("th", null, x)))), tb)));
    p.appendChild(h("div", { class: "help", style: { marginTop: "12px" } },
      "To use USB in a VM, turn on “Allow this VM to use USB devices” in its settings. Devices can be attached at boot or live from the console's side panel."));
  }

  // ── Hosts ───────────────────────────────────────────────────────────────────
  // VM Lab drives one machine at a time. "local" is this Gridlantis-HL; every other
  // host is a second device running vmlab-agent.js, which Gridlantis-HL reaches over
  // the tailnet with a bearer token and proxies for. Switching host swaps the
  // whole page — machines, images, USB and stats all come from that device.
  const hostById = id => (S.hosts || []).find(x => x.id === id) || null;
  const hostLabel = hy => hy ? hy.name : S.host;

  function restoreHost() {
    let saved = null;
    try { saved = localStorage.getItem("vmlab-host"); } catch (e) {}
    const fromUrl = new URLSearchParams(location.search).get("host");
    S.host = fromUrl || saved || "local";
    VL.setVmHost(S.host);
  }

  function switchHost(id) {
    if (id === S.host) return;
    S.host = id;
    VL.setVmHost(id);
    try { localStorage.setItem("vmlab-host", id); } catch (e) {}
    // Nothing on screen belongs to the new host yet.
    S.ov = null; S.ovError = null; S.specs = null; S.stats = null; S.usbDetail = null;
    panel("host").dataset.built = "";
    $("#host-name").textContent = "…";
    render();
    load().then(() => { loadSpecs(); pollStats(); if (S.tab === "usb") loadUsb(); });
  }

  async function loadHosts(refresh) {
    try {
      S.hosts = await api("GET", "/api/vmlab/hosts?status=1" + (refresh ? "&refresh=1" : ""));
      $("#n-hosts").textContent = S.hosts.length;
      // A host removed from another tab (or a stale saved id) must not strand
      // the page pointing at something that no longer exists.
      if (!hostById(S.host)) switchHost("local");
      renderHostPick();
      if (S.tab === "hosts") renderHosts();
    } catch (e) { if (e.message !== "signed out") toast("Hosts: " + e.message, "bad"); }
  }

  const hostOnline = hy => !hy ? false : (hy.id === "local" ? true : !!(hy.status && hy.status.online));
  const hostDotClass = hy => hy && hy.enabled === false ? "" : hostOnline(hy) ? "running" : "error";

  function renderHostPick() {
    const box = $("#hostpick");
    if (!box) return;
    const hosts = S.hosts || [];
    // With no second device added there is nothing to pick between, so the
    // page looks exactly as it did before hosts existed.
    if (hosts.length < 2) { box.innerHTML = ""; return; }
    const cur = hostById(S.host);
    const menu = h("div", { class: "menu" });
    hosts.forEach(hy => {
      menu.appendChild(h("button", { class: hy.id === S.host ? "on" : "", onclick: () => { closeMenus(); switchHost(hy.id); } },
        h("span", { class: "dot " + hostDotClass(hy) }),
        h("span", null, h("b", null, hy.name),
          h("span", { class: "sub" }, hy.id === "local" ? "this machine"
            : (hy.enabled === false ? "turned off" : hostOnline(hy) ? hy.url.replace(/^https?:\/\//, "") : "not answering")))));
    });
    menu.appendChild(h("hr"));
    menu.appendChild(h("button", { onclick: () => { closeMenus(); setTab("hosts"); } }, icon("fa-solid fa-network-wired"), "Manage hosts…"));
    const btn = h("button", { class: "pick", onclick: e => { e.stopPropagation(); const on = menu.classList.contains("on"); closeMenus(); menu.classList.toggle("on", !on); } },
      h("span", { class: "dot " + hostDotClass(cur) }), hostLabel(cur), icon("fa-solid fa-angle-down"));
    box.innerHTML = "";
    box.appendChild(h("span", { class: "lbl" }, "VM host"));
    box.appendChild(h("div", { class: "menu-wrap" }, btn, menu));
  }

  function renderHosts() {
    const p = panel("hosts");
    p.innerHTML = "";
    p.appendChild(h("div", { class: "row" },
      h("div", null, h("div", { class: "sec-t" }, "VM hosts"),
        h("div", { class: "sec-s" }, "Machines VM Lab can run virtual machines on. This one is always here; add a second device by running the VM Lab agent on it.")),
      h("div", { class: "spacer" }),
      h("button", { class: "btn sm", onclick: () => loadHosts(true) }, icon("fa-solid fa-rotate"), "Re-check"),
      h("button", { class: "btn primary", onclick: openAddHost }, icon("fa-solid fa-plus"), "Add a VM host")));

    const tb = h("tbody");
    (S.hosts || []).forEach(hy => {
      const st = hy.status || {};
      const cap = st.capabilities || {};
      const accel = !st.online ? "—" : cap.kvmUsable ? "KVM" : cap.qemu ? "software only" : "no QEMU";
      tb.appendChild(h("tr", null,
        h("td", null, h("div", { class: "host-row" },
          h("span", { class: "dot " + hostDotClass(hy) }),
          h("div", { class: "who" }, h("b", null, hy.name),
            h("div", { class: "card-meta" }, hy.id === "local" ? "this machine" : (hy.url || "").replace(/^https?:\/\//, "")),
            hy.id === S.host ? h("span", { class: "badge a" }, "in use") : null))),
        h("td", null, hy.enabled === false ? h("span", { class: "badge" }, "off")
          : st.online ? h("span", { class: "badge g" }, "online") : h("span", { class: "badge r" }, "offline")),
        h("td", null, st.online ? (st.hostname || "—") : h("span", { class: "note bad" }, st.error || "not answering")),
        h("td", null, st.online && st.envs ? st.envs.running + " / " + st.envs.total : "—"),
        h("td", null, st.online ? (st.threads || "?") + " threads · " + fmtBytes(st.memoryBytes || 0, 0) : "—"),
        h("td", null, accel),
        h("td", null, h("div", { class: "row" },
          hy.id === S.host ? null : h("button", { class: "btn sm", onclick: () => switchHost(hy.id) }, "Use"),
          hy.builtin ? null : menuButton(icon("fa-solid fa-ellipsis"), [
            { icon: "fa-solid fa-bolt", label: "Test connection", run: () => testHost(hy) },
            { icon: "fa-solid fa-pen", label: "Edit…", run: () => openEditHost(hy) },
            { icon: hy.enabled === false ? "fa-solid fa-play" : "fa-solid fa-pause",
              label: hy.enabled === false ? "Turn on" : "Turn off",
              run: () => act("Host", () => api("PATCH", "/api/vmlab/hosts/" + hy.id, { enabled: hy.enabled === false }), "Saved").then(() => loadHosts(true), () => {}) },
            { icon: "fa-solid fa-trash", label: "Remove host", danger: true, run: async () => {
              if (!await confirmBox("Remove " + hy.name + "?", "Gridlantis-HL forgets its address and token. The VMs on that machine keep running and come back if you add it again.", "Remove", true)) return;
              if (hy.id === S.host) switchHost("local");
              await act("Remove", () => api("DELETE", "/api/vmlab/hosts/" + hy.id), "Removed");
              loadHosts(true);
            } },
          ]))) ));
    });
    p.appendChild(h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" },
      h("thead", null, h("tr", null, ["Host", "", "Machine", "VMs", "Capacity", "Acceleration", ""].map(x => h("th", null, x)))), tb)));

    p.appendChild(h("div", { class: "help", style: { marginTop: "14px" } },
      h("b", null, "Adding a second device"), h("br"),
      "On the other machine, install QEMU and start the agent:", h("br"),
      h("code", null, "tools/vmlab/deploy-agent.sh user@the-other-machine"), " from here, or on that machine directly: ",
      h("code", null, "node vmlab-agent.js"), h("br"),
      "It prints a token; paste it, with the machine's address and port (3010 by default), into ",
      h("b", null, "Add a VM host"), ". Only this Gridlantis-HL ever talks to the agent, and the console, images and USB of that device then appear here exactly like this machine's."));
  }

  async function testHost(hy) {
    toast("Testing " + hy.name + "…");
    try {
      const st = await api("POST", "/api/vmlab/hosts/" + hy.id + "/test");
      toast(st.online ? hy.name + " answered — " + (st.hostname || "ok") : hy.name + ": " + (st.error || "no answer"), st.online ? "ok" : "bad");
    } catch (e) { toast(hy.name + ": " + e.message, "bad"); }
    loadHosts();
  }

  function hostForm(initial) {
    const name = h("input", { class: "in", placeholder: "Silver laptop", value: (initial && initial.name) || "" });
    const url = h("input", { class: "in", placeholder: "100.64.0.2:3010", value: (initial && initial.url) || "" });
    const token = h("input", { class: "in", type: "password", autocomplete: "off",
      placeholder: initial ? "leave blank to keep the current token" : "the token the agent printed" });
    const result = h("div", { class: "note" });
    const test = h("button", { class: "btn sm", onclick: async () => {
      result.className = "note"; result.textContent = "Testing…";
      try {
        const r = await api("POST", "/api/vmlab/hosts/test", { name: name.value, url: url.value, token: token.value });
        if (r.online) {
          const c = (r.info && r.info.capabilities) || {};
          result.className = "note"; result.innerHTML = "";
          result.appendChild(h("span", { class: "badge g" }, "answered"));
          result.appendChild(h("span", null, "  " + (r.info.hostname || "") + " · " + (r.info.threads || "?") + " threads · " +
            fmtBytes(r.info.memoryBytes || 0, 0) + " · " + (c.kvmUsable ? "KVM" : c.qemu ? "software emulation only" : "QEMU not installed")));
          if (!name.value && r.info.hostname) name.value = r.info.hostname;
        } else { result.className = "note bad"; result.textContent = r.error || "no answer"; }
      } catch (e) { result.className = "note bad"; result.textContent = e.message; }
    } }, icon("fa-solid fa-bolt"), "Test connection");
    const el = h("div", null,
      h("div", { class: "form" },
        fld("Name", name, "What to call it in the host list.", true),
        fld("Address", url, "The other machine's IP or hostname, and the agent's port — 3010 unless you changed it. A Tailscale IP keeps it off the open internet.", true),
        fld("Agent token", token, "Printed by the agent on first start, and kept in vmlab/agent-token on that machine.", true)),
      h("div", { class: "row", style: { marginTop: "10px" } }, test), result);
    return { el, value: () => ({ name: name.value, url: url.value, token: token.value || undefined }) };
  }

  function openAddHost() {
    const form = hostForm(null);
    const go = h("button", { class: "btn primary", onclick: async () => {
      go.disabled = true;
      try {
        const hy = await api("POST", "/api/vmlab/hosts", form.value());
        modal.close(); toast(hy.name + " added");
        await loadHosts(true);
        switchHost(hy.id);
      } catch (e) { toast(e.message, "bad"); go.disabled = false; }
    } }, "Add host");
    modal.open("Add a VM host", form.el, [h("button", { class: "btn", onclick: modal.close }, "Cancel"), go], true);
  }

  function openEditHost(hy) {
    const form = hostForm(hy);
    const go = h("button", { class: "btn primary", onclick: async () => {
      go.disabled = true;
      try { await api("PATCH", "/api/vmlab/hosts/" + hy.id, form.value()); modal.close(); toast("Saved"); loadHosts(true); }
      catch (e) { toast(e.message, "bad"); go.disabled = false; }
    } }, "Save");
    modal.open("Edit " + hy.name, form.el, [h("button", { class: "btn", onclick: modal.close }, "Cancel"), go], true);
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  VL.onServerEvents(d => {
    reloadSoon(d.what === "downloads" ? 800 : 200);
  });
  setInterval(() => { if (!document.hidden) load(); }, 5000);
  setInterval(() => { if (!document.hidden && S.tab === "hosts") loadHosts(); }, 8000);
  window.addEventListener("hashchange", () => {
    const t = location.hash.slice(1);
    if (t !== S.tab && TABS.includes(t)) setTab(t);
  });
  const initial = (location.hash || "").slice(1) || (function () { try { return localStorage.getItem("vmlab-tab"); } catch (e) { return null; } })() || "envs";
  restoreHost();
  loadHosts();
  load().then(() => {
    setTab(TABS.includes(initial) ? initial : "envs"); loadSpecs(); pollStats();
    // Mobile host's "Virtual phone" button lands here.
    if (new URLSearchParams(location.search).get("mobile") === "1") { history.replaceState(null, "", location.pathname); openMobileVm(); }
  });
})();
