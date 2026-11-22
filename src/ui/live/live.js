/* Live folders — folders kept in sync on PCs through Gridlantis-HL. Plain script, uses window.VL. */
(function () {
  "use strict";
  const { api, h, icon, fmtAgo, fmtBytes, toast, writeClipboard } = window.VL;
  const $ = s => document.querySelector(s);
  const enc = encodeURIComponent;
  const S = { data: null, loading: false };

  // ── Modal ───────────────────────────────────────────────────────────────────
  const modal = {
    open(title, body, foot) {
      $("#modal-title").textContent = title;
      const b = $("#modal-body"); b.innerHTML = ""; b.appendChild(body);
      const f = $("#modal-foot"); f.innerHTML = ""; (foot || []).forEach(x => f.appendChild(x));
      $("#modal").classList.add("on");
    },
    close() { $("#modal").classList.remove("on"); },
    isOpen() { return $("#modal").classList.contains("on"); },
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
  const note = (text, bad) => h("div", { class: "note" + (bad ? " bad" : "") }, text);

  // ── Data ────────────────────────────────────────────────────────────────────
  async function load() {
    if (S.loading) return;
    S.loading = true;
    try { S.data = await api("GET", "/api/live"); }
    catch (e) { S.data = { ready: false, error: e.message }; }
    finally { S.loading = false; }
    render();
  }
  const pcById = id => (S.data.pcs || []).find(p => p.id === id);

  // ── Rendering ───────────────────────────────────────────────────────────────
  function render() {
    const d = S.data;
    const banners = $("#banners"); banners.innerHTML = "";
    if (!d.ready) {
      banners.appendChild(h("div", { class: "banner" }, h("b", null, "Live folders are not running"), d.error || ""));
      $("#folders").innerHTML = ""; $("#pcs").innerHTML = "";
      return;
    }
    if (!d.openhlIp) banners.appendChild(h("div", { class: "banner" }, h("b", null, "Gridlantis-HL is not on a tailnet"),
      "PCs reach live folders over Tailscale. Start Tailscale on this machine."));
    renderFolders(d); renderPcs(d);
  }

  // ── Status ──────────────────────────────────────────────────────────────────
  // One PC's copy of one folder, worst news first. c.pc is the PC's own report
  // (its reporter posts every 10 s); without it (a PC set up before reporting
  // existed, or one not heard from lately) only Gridlantis-HL's view is known, and
  // Gridlantis-HL can't see a PC whose folder has stopped with an error.
  const pctOf = (have, total) => total > 0 ? Math.max(0, Math.min(100, Math.floor(100 * have / total))) : 100;
  const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
  const ERROR_HINTS = [
    [/folder path missing|folder marker missing/i, (f, p) => "The folder on " + p.name + " lost Syncthing's hidden .stfolder marker, which happens when the folder itself is replaced or moved. " +
      "Put things inside " + pcPath(f, p) + " rather than replacing it. Syncing resumes once the marker is back: create an empty folder named .stfolder inside it."],
    [/permission denied|access is denied/i, (f, p) => "Syncthing on " + p.name + " is not allowed to read or write some files in " + pcPath(f, p) + "."],
    [/no space left|insufficient disk/i, (f, p) => p.name + " is out of disk space."],
  ];
  const pcPath = (f, p) => (p.os === "windows" ? "%USERPROFILE%\\Gridlantis-HL Live\\" : "~/Gridlantis-HL Live/") + f.label;
  const hintFor = (f, p, msg) => { const m = ERROR_HINTS.find(([re]) => re.test(msg || "")); return m ? m[1](f, p) : ""; };

  function pcStatus(f, p) {
    const c = f.sync[p.id] || null, r = c && c.pc;
    if (c && c.pcRunning === false) return { cls: "error", short: "stopped", text: "Syncthing on this PC is not responding",
      hint: "The sync service on " + p.name + " is not running. Re-run the setup command there, or check: systemctl --user status openhl-live" };
    if (r && !r.missing && (r.error || r.state === "error")) return { cls: "error", short: "error", text: "stopped: " + (r.error || "error"), hint: hintFor(f, p, r.error) };
    if (!p.connected) return { cls: "offline", short: "offline", text: p.lastSeen ? "offline · seen " + fmtAgo(p.lastSeen) : "never connected" };
    if (r && r.missing) return { cls: "syncing", short: "…", text: "being set up on this PC…" };
    if (r && (r.state === "scanning" || r.state === "scan-waiting")) return { cls: "syncing", short: "…", text: "checking for changes…" };
    if (r && (r.needBytes > 0 || r.needFiles > 0)) {
      const pc = pctOf(r.globalBytes - r.needBytes, r.globalBytes);
      return { cls: "syncing", short: "↓" + pc + "%", text: "downloading · " + pc + "% · " + (r.needBytes ? fmtBytes(r.needBytes) : plural(r.needFiles, "item")) + " to go" };
    }
    if (r && r.toOpenHL && r.toOpenHL.completion < 100) {
      const t = r.toOpenHL, pc = Math.floor(t.completion);
      return { cls: "syncing", short: "↑" + pc + "%", text: "uploading to Gridlantis-HL · " + pc + "% · " + (t.needBytes ? fmtBytes(t.needBytes) : plural(t.needItems, "item")) + " to go" };
    }
    if (c && typeof c.completion === "number" && c.completion < 100) {
      const pc = Math.floor(c.completion);
      return { cls: "syncing", short: "↓" + pc + "%", text: "downloading · " + pc + "% · " + fmtBytes(c.needBytes || 0) + " to go" };
    }
    if (!c) return { cls: "syncing", short: "…", text: "connecting…" };
    if (r && r.pullErrors) return { cls: "error", short: plural(r.pullErrors, "error"), text: plural(r.pullErrors, "file") + " could not be synced",
      hint: (r.fileErrors || []).map(e => e.path + ": " + e.error).join("\n") };
    return { cls: "synced", short: "✓", text: "up to date" };
  }

  function folderState(f) {
    if (f.error || f.state === "error") return { cls: "error", text: "error on Gridlantis-HL" };
    const bad = f.devices.map(pcById).filter(p => p && pcStatus(f, p).cls === "error");
    if (bad.length) return { cls: "error", text: "problem on " + bad.map(p => p.name).join(", ") };
    if (f.state === "scanning" || f.state === "scan-waiting") return { cls: "syncing", text: "checking for changes…" };
    if (f.state === "syncing" || f.state === "sync-preparing" || f.state === "sync-waiting" || f.needFiles)
      return { cls: "syncing", text: "Gridlantis-HL receiving · " + pctOf(f.bytes - f.needBytes, f.bytes) + "%" + (f.needBytes ? " · " + fmtBytes(f.needBytes) + " to go" : "") };
    const behind = f.devices.map(pcById).filter(p => p && pcStatus(f, p).cls === "syncing");
    if (behind.length) return { cls: "syncing", text: "syncing with " + behind.map(p => p.name).join(", ") + "…" };
    return { cls: "synced", text: "up to date" };
  }

  function renderFolders(d) {
    const box = $("#folders"); box.innerHTML = "";
    if (!d.folders.length) {
      box.appendChild(h("div", { class: "empty" }, h("b", null, "No live folders yet"),
        d.pcs.length ? "Make one and pick the PCs that get it." : "Add a PC first, then make a live folder and pick the PCs that get it.",
        h("br"), h("br"),
        h("div", { class: "row", style: { justifyContent: "center" } },
          h("button", { class: "btn", onclick: openSetup }, icon("fa-solid fa-computer"), "Add a PC"),
          h("button", { class: "btn primary", onclick: () => openFolder() }, icon("fa-solid fa-folder-plus"), "New live folder"))));
      return;
    }
    const grid = h("div", { class: "grid-cards" });
    d.folders.forEach(f => {
      const s = folderState(f);
      const card = h("div", { class: "card" + (s.cls === "synced" ? " synced" : "") });
      card.appendChild(h("div", { class: "card-h" },
        h("div", { class: "card-ico" }, icon("fa-solid fa-folder")),
        h("div", { style: { minWidth: 0, flex: 1 } },
          h("div", { class: "card-name" }, f.label),
          h("div", { class: "card-meta" }, f.files + " file" + (f.files === 1 ? "" : "s") + " · " + fmtBytes(f.bytes))),
        h("div", { class: "row", style: { gap: "7px" } }, h("span", { class: "dot " + s.cls }), h("span", { class: "card-meta" }, s.text))));
      if (f.error) card.appendChild(note(f.error, true));
      if (f.pullErrors) card.appendChild(note(f.pullErrors + " file" + (f.pullErrors > 1 ? "s" : "") + " could not be synced on Gridlantis-HL", true));

      const chips = h("div", { class: "chips" });
      // Gridlantis-HL's own copy: still receiving, stopped, or complete.
      const mBad = !!(f.error || f.state === "error"), mBusy = !mBad && (f.needFiles > 0 || /^(sync|scan)/.test(f.state || ""));
      const mPct = pctOf(f.bytes - f.needBytes, f.bytes);
      chips.appendChild(h("span", { class: "chip" + (mBad ? " bad" : ""), title: "Gridlantis-HL keeps the always-on copy" + (mBad ? ": " + (f.error || "error") : mBusy ? ": receiving · " + mPct + "% · " + fmtBytes(f.needBytes) + " to go" : ": up to date") },
        h("span", { class: "dot " + (mBad ? "error" : mBusy ? "syncing" : "synced") }), "Gridlantis-HL",
        h("span", { class: "pct" }, mBad ? "error" : mBusy ? "↓" + mPct + "%" : "✓")));
      const problems = [];
      f.devices.forEach(id => {
        const p = pcById(id); if (!p) return;
        const st = pcStatus(f, p);
        if (st.cls === "error") problems.push([p, st]);
        chips.appendChild(h("span", { class: "chip" + (st.cls === "error" ? " bad" : ""), title: p.name + ": " + st.text }, h("span", { class: "dot " + st.cls }), p.name,
          h("span", { class: "pct" }, st.short)));
      });
      if (!f.devices.length) chips.appendChild(h("span", { class: "chip", style: { color: "var(--muted)" } }, "No PCs yet — choose some"));
      card.appendChild(chips);
      problems.forEach(([p, st]) => card.appendChild(h("div", { class: "note bad" }, h("b", null, p.name + ": " + st.text), st.hint ? h("div", { class: "fix" }, st.hint) : null)));

      if (f.lastFile) card.appendChild(h("div", { class: "lastchg", title: f.lastFile.name },
        "Last change: " + (f.lastFile.deleted ? "deleted " : "") + f.lastFile.name + " · " + fmtAgo(f.lastFile.at)));

      card.appendChild(h("div", { class: "card-acts" },
        h("button", { class: "btn primary", title: "Browse Gridlantis-HL's copy: download, upload, delete", onclick: () => openBrowse(f, "") }, icon("fa-solid fa-folder-open"), "Open"),
        h("button", { class: "btn sm", onclick: () => openFolder(f) }, icon("fa-solid fa-computer"), "PCs"),
        h("button", { class: "btn sm", onclick: () => openVersions(f) }, icon("fa-solid fa-clock-rotate-left"), "Restore"),
        h("span", { class: "spacer" }),
        h("button", { class: "btn sm danger", title: "Stop syncing this folder", onclick: () => removeFolder(f) }, icon("fa-solid fa-link-slash"))));
      grid.appendChild(card);
    });
    box.appendChild(grid);
  }

  function renderPcs(d) {
    const box = $("#pcs"); box.innerHTML = "";
    if (!d.pcs.length) {
      box.appendChild(h("div", { class: "empty" }, h("b", null, "No PCs yet"),
        "Run the setup command on a Linux or Windows PC, then paste the code it prints.", h("br"), h("br"),
        h("button", { class: "btn primary", onclick: openSetup }, icon("fa-solid fa-computer"), "Add a PC")));
      return;
    }
    const grid = h("div", { class: "grid-cards" });
    d.pcs.forEach(p => {
      const folders = d.folders.filter(f => f.devices.includes(p.id));
      const rows = folders.map(f => ({ f, st: pcStatus(f, p) }));
      const worst = rows.find(x => x.st.cls === "error") || rows.find(x => x.st.cls === "syncing");
      const head = !p.connected && !(worst && worst.st.cls === "error")
        ? { cls: "offline", text: p.lastSeen ? "offline · seen " + fmtAgo(p.lastSeen) : "never connected" }
        : worst ? { cls: worst.st.cls, text: worst.st.cls === "error" ? "problem in " + rows.filter(x => x.st.cls === "error").map(x => x.f.label).join(", ") : "syncing…" }
        : { cls: "synced", text: folders.length ? "up to date" : "connected" };
      const card = h("div", { class: "card" + (head.cls === "synced" ? " synced" : "") });
      card.appendChild(h("div", { class: "card-h" },
        h("div", { class: "card-ico" }, icon(p.os === "windows" ? "fa-brands fa-windows" : "fa-brands fa-linux")),
        h("div", { style: { minWidth: 0, flex: 1 } },
          h("div", { class: "card-name" }, p.name),
          h("div", { class: "card-meta" }, (p.host || "—") + " · " + p.id.slice(0, 7))),
        h("div", { class: "row", style: { gap: "7px" } }, h("span", { class: "dot " + head.cls }), h("span", { class: "card-meta" }, head.text))));
      if (!p.connected && !p.lastSeen) card.appendChild(note("Waiting for this PC. Check that its setup finished and Tailscale is on."));
      if (p.connected && !p.report) card.appendChild(note("This PC doesn't report its own status yet, so errors on it can't be seen here. Run the setup command on it again to add that (it keeps the PC's identity)."));
      else if (p.connected && p.report && !p.report.fresh) card.appendChild(note("No status report from this PC since " + fmtAgo(p.report.at) + ", so errors on it may not show here."));
      const list = h("div", { class: "pcf" });
      rows.forEach(({ f, st }) => list.appendChild(h("div", { class: "pcf-row", title: st.hint || st.text },
        h("span", { class: "dot " + st.cls }), h("span", { class: "pcf-name" }, f.label), h("span", { class: "pcf-st" + (st.cls === "error" ? " bad" : "") }, st.text))));
      if (!rows.length) list.appendChild(h("div", { class: "pcf-row" }, h("span", { class: "pcf-st" }, "No live folders on this PC yet")));
      card.appendChild(list);
      card.appendChild(h("div", { class: "card-acts" },
        h("button", { class: "btn sm", onclick: () => openPcFolders(p) }, icon("fa-solid fa-folder"), "Folders"),
        h("span", { class: "spacer" }),
        h("button", { class: "btn sm", title: "Rename", onclick: () => renamePc(p) }, icon("fa-solid fa-pen")),
        h("button", { class: "btn sm danger", title: "Remove this PC", onclick: () => removePc(p) }, icon("fa-solid fa-trash"))));
      grid.appendChild(card);
    });
    box.appendChild(grid);
  }

  // ── Add a PC ────────────────────────────────────────────────────────────────
  function openSetup() {
    const base = location.protocol + "//" + (S.data && S.data.openhlIp ? S.data.openhlIp + (location.port ? ":" + location.port : "") : location.host);
    const cmds = {
      linux: "curl -fsSL " + base + "/live/setup.sh | bash",
      windows: "irm " + base + "/live/setup.ps1 | iex",
    };
    const steps = {
      linux: ["Open a terminal on the PC (as yourself — no sudo) and run:",
        "It installs Syncthing for your user, starts it now and at boot, and points it at Gridlantis-HL only."],
      windows: ["Open PowerShell on the PC (as yourself — no admin needed) and run:",
        "It installs Syncthing for your user, starts it now and at every sign-in with no window, and points it at Gridlantis-HL only."],
    };
    let os = /Windows/.test(navigator.userAgent) ? "windows" : "linux";
    const body = h("div");
    const code = h("textarea", { class: "in", rows: 3, placeholder: "openhl-live:…", spellcheck: "false" });
    const result = h("div");
    const paint = () => {
      body.innerHTML = "";
      body.appendChild(h("div", { class: "tabs" },
        h("button", { class: "btn sm" + (os === "linux" ? " primary" : ""), onclick: () => { os = "linux"; paint(); } }, icon("fa-brands fa-linux"), "Linux"),
        h("button", { class: "btn sm" + (os === "windows" ? " primary" : ""), onclick: () => { os = "windows"; paint(); } }, icon("fa-brands fa-windows"), "Windows")));
      const copy = h("button", { class: "btn sm", onclick: async () => toast(await writeClipboard(cmds[os]) ? "Copied" : "Copy failed") }, icon("fa-regular fa-copy"), "Copy");
      body.appendChild(h("ol", { class: "setup-steps" },
        h("li", null, steps[os][0], h("div", { class: "cmd" }, h("pre", null, cmds[os]), copy)),
        h("li", null, steps[os][1], " It needs Tailscale running on the PC; traffic never leaves your tailnet."),
        h("li", null, "It prints a code starting with ", h("code", null, "openhl-live:"), ". Paste it here:")));
      body.appendChild(h("div", { class: "fld full", style: { marginTop: "10px" } }, code));
      body.appendChild(result);
      body.appendChild(h("div", { class: "hint", style: { marginTop: "10px" } },
        "Folders you share with the PC appear in ", h("code", null, os === "windows" ? "%USERPROFILE%\\Gridlantis-HL Live" : "~/Gridlantis-HL Live"),
        ". Running the command again is safe. To remove it: ",
        os === "windows" ? h("code", null, "$env:OPENHL_LIVE_UNINSTALL=1; " + cmds.windows) : h("code", null, cmds.linux.replace("| bash", "| bash -s -- --uninstall"))));
    };
    paint();
    const add = h("button", { class: "btn primary", onclick: async () => {
      add.disabled = true; result.innerHTML = "";
      try {
        const r = await api("POST", "/api/live/devices", { code: code.value });
        toast((r.repaired ? "Re-paired " : "Added ") + r.name);
        await load();
        const p = pcById(r.id);
        if (p && S.data.folders.length) openPcFolders(p); else modal.close();
      } catch (e) { result.appendChild(note(e.message, true)); }
      add.disabled = false;
    } }, icon("fa-solid fa-plus"), "Add PC");
    modal.open("Add a PC", body, [add]);
  }

  // ── Folders ─────────────────────────────────────────────────────────────────
  function devicePicks(selected) {
    const sel = new Set(selected || []);
    const list = h("div", { class: "picks" });
    (S.data.pcs || []).forEach(p => {
      const cb = h("input", { type: "checkbox", value: p.id }); cb.checked = sel.has(p.id);
      list.appendChild(h("label", { class: "pick" }, cb, icon(p.os === "windows" ? "fa-brands fa-windows" : "fa-brands fa-linux"), p.name,
        h("small", null, p.connected ? "connected" : "offline")));
    });
    if (!S.data.pcs.length) list.appendChild(note("No PCs yet. Add one, then come back and tick it."));
    list.value = () => Array.from(list.querySelectorAll("input:checked")).map(x => x.value);
    return list;
  }

  function openFolder(f) {
    const name = h("input", { class: "in", value: f ? f.label : "", placeholder: "Work, Photos, Projects…" });
    const picks = devicePicks(f ? f.devices : (S.data.pcs || []).map(p => p.id));
    const result = h("div");
    const save = h("button", { class: "btn primary", onclick: async () => {
      save.disabled = true; result.innerHTML = "";
      try {
        if (f) {
          const patch = { devices: picks.value() };
          if (name.value.trim() !== f.label) patch.label = name.value;
          await api("PATCH", "/api/live/folders/" + enc(f.id), patch);
          toast("Saved");
        } else {
          await api("POST", "/api/live/folders", { label: name.value, devices: picks.value() });
          toast("Live folder " + name.value.trim() + " made");
        }
        modal.close(); load();
      } catch (e) { result.appendChild(note(e.message, true)); save.disabled = false; }
    } }, f ? "Save" : "Make folder");
    modal.open(f ? f.label : "New live folder", h("div", { class: "rowset" },
      h("div", { class: "fld full" }, h("label", null, "Name"), name),
      h("div", { class: "fld full" }, h("label", null, "PCs that get it"), picks),
      h("div", { class: "hint" }, f
        ? "A PC you untick stops syncing; its copy stays on that PC. Renaming changes the name here, not the folder already on each PC."
        : "Each ticked PC gets it at ~/Gridlantis-HL Live/<name> within a few seconds. Gridlantis-HL keeps the always-on copy, plus deleted and replaced files for 30 days."),
      result), [save]);
    setTimeout(() => (f ? null : name.focus()), 30);
  }

  function openPcFolders(p) {
    const sel = new Set(S.data.folders.filter(f => f.devices.includes(p.id)).map(f => f.id));
    const list = h("div", { class: "picks" });
    S.data.folders.forEach(f => {
      const cb = h("input", { type: "checkbox", value: f.id }); cb.checked = sel.has(f.id);
      list.appendChild(h("label", { class: "pick" }, cb, icon("fa-solid fa-folder"), f.label, h("small", null, fmtBytes(f.bytes))));
    });
    if (!S.data.folders.length) list.appendChild(note("No live folders yet — make one first."));
    const result = h("div");
    const save = h("button", { class: "btn primary", onclick: async () => {
      save.disabled = true;
      try {
        const want = new Set(Array.from(list.querySelectorAll("input:checked")).map(x => x.value));
        for (const f of S.data.folders) {
          const has = f.devices.includes(p.id);
          if (has === want.has(f.id)) continue;
          const devices = want.has(f.id) ? f.devices.concat(p.id) : f.devices.filter(x => x !== p.id);
          await api("PATCH", "/api/live/folders/" + enc(f.id), { devices });
        }
        modal.close(); toast("Saved"); load();
      } catch (e) { result.appendChild(note(e.message, true)); save.disabled = false; }
    } }, "Save");
    modal.open("Folders on " + p.name, h("div", { class: "rowset" }, list,
      h("div", { class: "hint" }, "Ticked folders appear on " + p.name + " in " + (p.os === "windows" ? "%USERPROFILE%\\Gridlantis-HL Live" : "~/Gridlantis-HL Live") + "."), result), [save]);
  }

  async function removeFolder(f) {
    if (!await confirmBox("Stop syncing " + f.label + "?",
      "Nothing is deleted: every PC keeps its copy, and Gridlantis-HL keeps its copy in Files → Live folders. They just stop being kept in sync. The 30 days of old versions for this folder are dropped.", "Stop syncing")) return;
    try { await api("DELETE", "/api/live/folders/" + enc(f.id)); toast("Stopped syncing " + f.label); load(); }
    catch (e) { toast(e.message, "bad"); }
  }

  // ── Browse Gridlantis-HL's copy ────────────────────────────────────────────────────
  // Uses the Files API on uploads/Live folders/<name>; whatever changes here
  // syncs out to the PCs like any other change.
  async function openBrowse(f, sub) {
    const dir = f.browse + (sub ? "/" + sub : "");
    const list = h("div", { class: "vlist" }, note("Loading…"));
    const crumbs = h("div", { class: "row", style: { flexWrap: "wrap", gap: "4px", marginBottom: "8px" } });
    const parts = sub ? sub.split("/") : [];
    crumbs.appendChild(h("button", { class: "btn sm" + (parts.length ? "" : " primary"), onclick: () => openBrowse(f, "") }, icon("fa-solid fa-folder"), f.label));
    parts.forEach((p, i) => {
      crumbs.appendChild(h("span", { class: "card-meta" }, "/"));
      const to = parts.slice(0, i + 1).join("/");
      crumbs.appendChild(h("button", { class: "btn sm" + (i === parts.length - 1 ? " primary" : ""), onclick: () => openBrowse(f, to) }, p));
    });
    const picker = h("input", { type: "file", multiple: true, style: { display: "none" } });
    picker.addEventListener("change", async () => {
      if (!picker.files.length) return;
      const fd = new FormData();
      Array.from(picker.files).forEach(x => fd.append("file", x, x.name));
      toast("Uploading " + picker.files.length + " file" + (picker.files.length > 1 ? "s" : "") + "…");
      try {
        const r = await fetch("/api/files/upload?dir=" + enc(dir), { method: "POST", body: fd });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
        toast("Uploaded — syncing to the PCs"); openBrowse(f, sub);
      } catch (e) { toast("Upload failed: " + e.message, "bad"); }
    });
    const upload = h("button", { class: "btn", onclick: () => picker.click() }, icon("fa-solid fa-upload"), "Upload");
    const mkdir = h("button", { class: "btn", onclick: async () => {
      const name = prompt("New folder name"); if (!name) return;
      try { await api("POST", "/api/files/mkdir", { dir, name }); openBrowse(f, sub); } catch (e) { toast(e.message, "bad"); }
    } }, icon("fa-solid fa-folder-plus"), "New folder");
    modal.open(f.label, h("div", { class: "rowset" }, crumbs, list, picker,
      h("div", { class: "hint" }, "This is Gridlantis-HL's copy. Anything you upload, rename or delete here reaches every PC with this folder.")), [mkdir, upload]);
    let items;
    try { items = await api("GET", "/api/files?dir=" + enc(dir)); }
    catch (e) { list.innerHTML = ""; list.appendChild(note(e.message, true)); return; }
    list.innerHTML = "";
    if (!items.length) { list.appendChild(note("Empty. Drop files into this folder on any PC, or upload here.")); return; }
    items.forEach(it => {
      const rel = dir + "/" + it.name;
      const del = h("button", { class: "btn sm danger", title: "Delete everywhere (kept 30 days in Restore)", onclick: async () => {
        if (!await confirmBox("Delete " + it.name + "?", "It is deleted on every PC with this folder. Files can be brought back from Restore for 30 days.", "Delete")) return openBrowse(f, sub);
        try { await api("POST", "/api/files/delete", { path: rel }); toast("Deleted " + it.name); }
        catch (e) { toast(e.message, "bad"); }
        openBrowse(f, sub);
      } }, icon("fa-solid fa-trash"));
      const name = it.isDir
        ? h("button", { class: "btn sm", style: { flex: "1", justifyContent: "flex-start", minWidth: 0 }, onclick: () => openBrowse(f, (sub ? sub + "/" : "") + it.name) },
            icon("fa-solid fa-folder"), h("span", { class: "vname" }, it.name))
        : h("a", { class: "vname", href: "/api/files/download?path=" + enc(rel), title: "Download " + it.name }, icon("fa-regular fa-file"), " ", it.name);
      list.appendChild(h("div", { class: "vrow" }, name,
        h("span", { class: "vmeta" }, it.size + (it.mtime ? " · " + fmtAgo(new Date(it.mtime).toISOString()) : "")),
        it.isDir ? h("a", { class: "btn sm", href: "/api/files/download?path=" + enc(rel), title: "Download as .zip" }, icon("fa-solid fa-download")) : null,
        del));
    });
  }

  // ── Restore ─────────────────────────────────────────────────────────────────
  async function openVersions(f) {
    const box = h("div", { class: "vlist" }, note("Loading…"));
    modal.open("Restore in " + f.label, h("div", { class: "rowset" },
      h("div", { class: "hint" }, "Files deleted or replaced on any PC in the last 30 days. Restoring puts the old version back everywhere (the current one is kept as a version too)."),
      box), []);
    let list;
    try { list = await api("GET", "/api/live/folders/" + enc(f.id) + "/versions"); }
    catch (e) { box.innerHTML = ""; box.appendChild(note(e.message, true)); return; }
    box.innerHTML = "";
    if (!list.length) { box.appendChild(note("Nothing to restore — no file in this folder has been deleted or replaced yet.")); return; }
    list.forEach(item => {
      const pick = h("select", { class: "in" });
      item.versions.forEach(v => pick.appendChild(h("option", { value: v.versionTime }, new Date(v.versionTime).toLocaleString() + " · " + fmtBytes(v.size))));
      const btn = h("button", { class: "btn sm", onclick: async () => {
        btn.disabled = true;
        try { await api("POST", "/api/live/folders/" + enc(f.id) + "/versions", { path: item.path, versionTime: pick.value }); toast("Restored " + item.path); openVersions(f); }
        catch (e) { toast(e.message, "bad"); btn.disabled = false; }
      } }, icon("fa-solid fa-rotate-left"), "Restore");
      box.appendChild(h("div", { class: "vrow" },
        h("span", { class: "vname", title: item.path }, item.path),
        item.deleted ? h("span", { class: "tag del" }, "deleted") : h("span", { class: "tag" }, "replaced"),
        pick, btn));
    });
  }

  // ── PCs ─────────────────────────────────────────────────────────────────────
  function renamePc(p) {
    const name = h("input", { class: "in", value: p.name });
    const save = h("button", { class: "btn primary", onclick: async () => {
      try { await api("PATCH", "/api/live/devices/" + enc(p.id), { name: name.value }); modal.close(); load(); }
      catch (e) { toast(e.message, "bad"); }
    } }, "Save");
    modal.open("Rename PC", h("div", { class: "fld" }, h("label", null, "Name"), name), [save]);
    setTimeout(() => name.select(), 30);
  }
  async function removePc(p) {
    if (!await confirmBox("Remove " + p.name + "?", "It stops syncing every live folder. Its files stay on that PC. To remove the sync service from the PC too, run the setup command there with --uninstall.", "Remove")) return;
    try { await api("DELETE", "/api/live/devices/" + enc(p.id)); toast("Removed " + p.name); load(); }
    catch (e) { toast(e.message, "bad"); }
  }

  $("#b-pc").addEventListener("click", openSetup);
  $("#b-new").addEventListener("click", () => openFolder());
  load();
  // Live status while the page is visible; paused while a dialog is open so it
  // does not redraw under the pointer.
  setInterval(() => { if (!document.hidden && !modal.isOpen()) load(); }, 2500);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
})();
