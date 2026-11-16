/* Containers — main page. Depends on shared/common.js (window.VL). */
(function () {
  "use strict";
  const { api, h, icon, fmtBytes, fmtAgo, fmtDate, toast, onServerEvents } = window.VL;

  const S = { ov: null, tab: "containers", statsTimer: null, stats: {} };
  const $ = sel => document.querySelector(sel);
  const panel = name => document.querySelector('[data-panel="' + name + '"]');

  // ── Data ────────────────────────────────────────────────────────────────────
  let loading = null;
  async function load() {
    if (loading) return loading;
    loading = (async () => {
      try { S.ov = await api("GET", "/api/docker/overview"); render(); }
      catch (e) { if (e.message !== "signed out") toast("Containers: " + e.message, "bad"); }
      finally { loading = null; }
    })();
    return loading;
  }
  let reloadT = null;
  const reloadSoon = ms => { clearTimeout(reloadT); reloadT = setTimeout(load, ms || 250); };
  const engineUp = () => !!(S.ov && S.ov.engine && S.ov.engine.ok);

  // ── Modal ───────────────────────────────────────────────────────────────────
  const modal = {
    open(title, body, foot, wide) {
      $("#modal-title").textContent = title;
      const b = $("#modal-body"); b.innerHTML = ""; b.appendChild(body);
      const f = $("#modal-foot"); f.innerHTML = ""; (foot || []).forEach(x => f.appendChild(x));
      $("#modal-box").classList.toggle("wide", !!wide);
      $("#modal").classList.add("on");
    },
    close() {
      $("#modal").classList.remove("on");
      if (modal.onClose) { const fn = modal.onClose; modal.onClose = null; fn(); }
    },
  };
  $("#modal-x").addEventListener("click", modal.close);
  $("#modal").addEventListener("mousedown", e => { if (e.target.id === "modal") modal.close(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { modal.close(); closeMenus(); } });

  function confirmBox(title, text, okLabel, danger) {
    return new Promise(resolve => {
      const ok = h("button", { class: "btn " + (danger ? "danger" : "primary"), onclick: () => { modal.close(); resolve(true); } }, okLabel || "OK");
      const cancel = h("button", { class: "btn", onclick: () => { modal.close(); resolve(false); } }, "Cancel");
      modal.open(title, h("div", { class: "hint", style: { fontSize: "13px", color: "var(--text)" } }, text), [cancel, ok]);
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
    document.querySelectorAll(".dk-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
    document.querySelectorAll(".panel").forEach(p => p.classList.toggle("on", p.dataset.panel === t));
    try { localStorage.setItem("docker-tab", t); } catch (e) {}
    if (location.hash !== "#" + t) history.replaceState(null, "", "#" + t);
    render();
  }
  document.querySelectorAll(".dk-tab").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

  // ── Render ──────────────────────────────────────────────────────────────────
  function render() {
    if (!S.ov) return;
    renderBanners();
    renderKpis();
    $("#n-containers").textContent = S.ov.containers.length;
    $("#n-images").textContent = S.ov.images.length;
    if (S.tab === "containers") renderContainers();
    if (S.tab === "images") renderImages();
  }

  const INSTALL = [
    "sudo apt-get update && sudo apt-get install -y ca-certificates curl",
    "sudo install -m 0755 -d /etc/apt/keyrings",
    "sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc",
    "sudo chmod a+r /etc/apt/keyrings/docker.asc",
    'echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" | sudo tee /etc/apt/sources.list.d/docker.list',
    "sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin",
    "sudo usermod -aG docker $USER      # then log out and back in",
  ].join("\n");

  function renderBanners() {
    const box = $("#banners"); box.innerHTML = "";
    const e = S.ov.engine;
    if (e.ok) return;
    const b = h("div", { class: "banner bad" },
      h("b", null, icon("fa-brands fa-docker"), " Docker is not available"),
      h("div", null, e.help || "The Docker daemon could not be reached."));
    if (e.reason === "no-socket") {
      b.appendChild(h("div", { class: "hint", style: { marginTop: "8px" } }, "Install it once on this host — Open HL picks it up automatically, no restart needed:"));
      b.appendChild(h("pre", null, INSTALL));
    } else if (e.reason === "no-permission") {
      b.appendChild(h("pre", null, "sudo usermod -aG docker $USER      # then log out and back in"));
    }
    box.appendChild(b);
  }

  function kpi(k, v) { return h("div", { class: "kpi" }, h("div", { class: "k" }, k), h("div", { class: "v" }, v)); }
  function renderKpis() {
    const box = $("#kpis"); box.innerHTML = "";
    if (!engineUp()) return;
    const cs = S.ov.containers, running = cs.filter(c => c.running);
    box.appendChild(kpi("Running", running.length + " / " + cs.length));
    box.appendChild(kpi("Images", String(S.ov.images.length)));
    box.appendChild(kpi("Image disk", fmtBytes(S.ov.images.reduce((a, i) => a + i.sizeBytes, 0), 1)));
    if (S.ov.engine.version) box.appendChild(kpi("Engine", "v" + S.ov.engine.version));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Containers
  // ════════════════════════════════════════════════════════════════════════════
  function renderContainers() {
    const p = panel("containers"); p.innerHTML = "";
    p.appendChild(h("div", { class: "row" },
      h("div", null, h("div", { class: "sec-t" }, "Containers"),
        h("div", { class: "sec-s" }, "Every container on this host, running or stopped.")),
      h("span", { class: "spacer" }),
      h("button", { class: "btn primary", onclick: () => openCreate(), disabled: !engineUp() }, icon("fa-solid fa-plus"), "New container")));

    if (!engineUp()) return;
    if (S.ov.containersError) p.appendChild(h("div", { class: "note bad", style: { marginTop: "12px" } }, S.ov.containersError));
    if (!S.ov.containers.length) {
      p.appendChild(h("div", { class: "empty" }, h("b", null, "No containers yet"),
        S.ov.images.length ? "Create one from an image you have." : "Pull an image first, then create a container from it."));
      return;
    }
    const grid = h("div", { class: "grid-cards" });
    const order = { running: 0, restarting: 1, paused: 2, created: 3, exited: 4, dead: 5 };
    S.ov.containers.slice()
      .sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9) || (b.created || 0) - (a.created || 0))
      .forEach(c => grid.appendChild(containerCard(c)));
    p.appendChild(grid);
  }

  function containerCard(c) {
    const card = h("div", { class: "card " + (c.running ? "running" : "") });
    card.appendChild(h("div", { class: "card-h" },
      h("div", { class: "card-ico" }, icon("fa-brands fa-docker")),
      h("div", { style: { minWidth: 0, flex: 1 } },
        h("div", { class: "card-name", title: c.name }, c.name),
        h("div", { class: "card-meta", title: c.image }, c.image)),
      h("div", { class: "row", style: { gap: "6px" }, title: c.status },
        h("span", { class: "dot " + c.state }), h("span", { class: "sec-s" }, c.state))));

    const badges = h("div", { class: "badges" },
      h("span", { class: "badge" }, c.shortId),
      c.restartPolicy && c.restartPolicy.Name && c.restartPolicy.Name !== "no"
        ? h("span", { class: "badge a" }, icon("fa-solid fa-rotate"), " ", c.restartPolicy.Name) : null,
      c.created ? h("span", { class: "badge" }, "created " + fmtAgo(new Date(c.created).toISOString())) : null);
    card.appendChild(badges);

    if (c.ports.length) {
      const kv = h("div", { class: "kv" });
      kv.appendChild(h("span", { class: "k" }, "ports"));
      const wrap = h("span", { class: "v", style: { display: "flex", gap: "6px", flexWrap: "wrap" } });
      c.ports.forEach(p => {
        // Only a port bound on all interfaces or loopback is worth linking.
        const href = "http://" + location.hostname + ":" + p.host;
        wrap.appendChild(h("a", { class: "badge a", href, target: "_blank", rel: "noopener",
          title: "open http://" + location.hostname + ":" + p.host }, p.host + " → " + p.container + "/" + p.proto));
      });
      kv.appendChild(wrap);
      card.appendChild(kv);
    }
    if (c.mounts.length) {
      const kv = h("div", { class: "kv" });
      kv.appendChild(h("span", { class: "k" }, "volumes"));
      kv.appendChild(h("span", { class: "v", title: c.mounts.map(m => m.source + " → " + m.target).join("\n") },
        c.mounts.length + " mount" + (c.mounts.length === 1 ? "" : "s")));
      card.appendChild(kv);
    }

    const st = S.stats[c.id];
    if (c.running && st) {
      card.appendChild(h("div", { class: "usage" },
        meter("CPU", st.cpu.toFixed(1) + "%", st.cpu),
        meter("Memory", fmtBytes(st.memoryBytes), st.memoryPct)));
    }

    const acts = h("div", { class: "card-acts" });
    if (c.running) {
      acts.appendChild(h("button", { class: "btn sm", onclick: () => openTerminal(c) }, icon("fa-solid fa-terminal"), "Terminal"));
      acts.appendChild(h("button", { class: "btn sm", onclick: () => act("Stop", () => api("POST", "/api/docker/containers/" + c.id + "/stop", {}), "Stopped") }, icon("fa-solid fa-stop"), "Stop"));
    } else {
      acts.appendChild(h("button", { class: "btn ok sm", onclick: () => act("Start", () => api("POST", "/api/docker/containers/" + c.id + "/start", {}), "Started") }, icon("fa-solid fa-play"), "Start"));
    }
    acts.appendChild(h("button", { class: "btn sm", onclick: () => showLogs(c) }, icon("fa-solid fa-file-lines"), "Logs"));
    acts.appendChild(h("span", { class: "spacer" }));
    acts.appendChild(menuButton(icon("fa-solid fa-ellipsis"), [
      c.running ? { icon: "fa-solid fa-rotate", label: "Restart", run: () => act("Restart", () => api("POST", "/api/docker/containers/" + c.id + "/restart", {}), "Restarted") } : null,
      c.running && c.state !== "paused" ? { icon: "fa-solid fa-pause", label: "Pause", run: () => act("Pause", () => api("POST", "/api/docker/containers/" + c.id + "/pause", {}), "Paused") } : null,
      c.state === "paused" ? { icon: "fa-solid fa-play", label: "Unpause", run: () => act("Unpause", () => api("POST", "/api/docker/containers/" + c.id + "/unpause", {}), "Unpaused") } : null,
      c.running ? { icon: "fa-solid fa-plug-circle-xmark", label: "Kill", danger: true, run: () => act("Kill", () => api("POST", "/api/docker/containers/" + c.id + "/kill", {}), "Killed") } : null,
      { icon: "fa-solid fa-circle-info", label: "Details", run: () => showDetails(c) },
      "-",
      { icon: "fa-solid fa-trash", label: "Remove container", danger: true, run: async () => {
        const vols = { checked: false };
        const cb = h("input", { type: "checkbox" });
        cb.addEventListener("change", () => { vols.checked = cb.checked; });
        const ok = await confirmBox("Remove container?",
          h("div", null, h("div", null, "“" + c.name + "”" + (c.running ? " is running and will be stopped first." : " will be removed.")),
            h("label", { class: "switch", style: { marginTop: "10px" } }, cb, "Also delete its anonymous volumes")),
          "Remove", true);
        if (ok) act("Remove", () => api("DELETE", "/api/docker/containers/" + c.id + "?force=1&volumes=" + (vols.checked ? 1 : 0)), "Removed");
      } },
    ]));
    card.appendChild(acts);
    return card;
  }

  function meter(label, val, pct) {
    return h("div", { class: "meter" }, h("div", { class: "l" }, h("span", null, label), h("span", null, val)),
      h("div", { class: "t" }, h("i", { style: { width: Math.max(0, Math.min(100, pct || 0)) + "%" } })));
  }

  // Stats are one HTTP call per container, so only poll what is on screen.
  async function pollStats() {
    if (!engineUp() || S.tab !== "containers" || document.hidden) return;
    const running = S.ov.containers.filter(c => c.running).slice(0, 12);
    if (!running.length) return;
    const results = await Promise.allSettled(running.map(c => api("GET", "/api/docker/containers/" + c.id + "/stats")));
    let changed = false;
    results.forEach((r, i) => { if (r.status === "fulfilled" && r.value) { S.stats[running[i].id] = r.value; changed = true; } });
    if (changed && S.tab === "containers") renderContainers();
  }

  async function showLogs(c) {
    const pre = h("pre", { class: "log" }, "Loading…");
    const tail = h("select", { class: "in", style: { maxWidth: "150px" } },
      ...[100, 500, 2000, 10000].map(n => h("option", { value: n, selected: n === 500 }, "last " + n + " lines")));
    const reload = async () => {
      pre.textContent = "Loading…";
      try {
        const r = await fetch("/api/docker/containers/" + c.id + "/logs?tail=" + tail.value);
        const t = await r.text();
        pre.textContent = t.trim() ? t : "(no output yet)";
        pre.scrollTop = pre.scrollHeight;
      } catch (e) { pre.textContent = e.message; }
    };
    tail.addEventListener("change", reload);
    modal.open("Logs · " + c.name,
      h("div", null, h("div", { class: "row" }, tail, h("button", { class: "btn sm", onclick: reload }, icon("fa-solid fa-rotate"), "Refresh")), pre),
      [h("button", { class: "btn", onclick: modal.close }, "Close")], true);
    reload();
  }

  async function showDetails(c) {
    const box = h("div", null, h("div", { class: "hint" }, "Loading…"));
    modal.open("Details · " + c.name, box, [h("button", { class: "btn", onclick: modal.close }, "Close")], true);
    try {
      const d = await api("GET", "/api/docker/containers/" + c.id);
      box.innerHTML = "";
      const kv = h("div", { class: "kv" });
      const row = (k, v) => { kv.appendChild(h("span", { class: "k" }, k)); kv.appendChild(h("span", { class: "v", style: { whiteSpace: "pre-wrap", wordBreak: "break-all" } }, v)); };
      row("id", d.id);
      row("image", d.image || "—");
      row("state", d.state + (d.exitCode != null && !d.running ? " (exit " + d.exitCode + ")" : ""));
      if (d.startedAt) row("started", fmtDate(d.startedAt));
      if (d.restartCount) row("restarts", String(d.restartCount));
      if (d.cmd && d.cmd.length) row("command", d.cmd.join(" "));
      if (d.workingDir) row("workdir", d.workingDir);
      if (d.binds && d.binds.length) row("volumes", d.binds.join("\n"));
      const ports = Object.entries(d.portBindings || {}).map(([k, v]) => (v || []).map(b => b.HostPort + " → " + k).join(", ")).filter(Boolean);
      if (ports.length) row("ports", ports.join("\n"));
      if (d.error) row("error", d.error);
      box.appendChild(kv);
      if (d.env && d.env.length) {
        box.appendChild(h("div", { class: "sec-t", style: { marginTop: "16px", fontSize: "14px" } }, "Environment"));
        box.appendChild(h("pre", { class: "log", style: { maxHeight: "200px" } }, d.env.join("\n")));
      }
    } catch (e) { box.innerHTML = ""; box.appendChild(h("div", { class: "note bad" }, e.message)); }
  }

  // ── Create ──────────────────────────────────────────────────────────────────
  function rowSet(kind, initial) {
    const wrap = h("div", { class: "rowset" });
    const add = v => {
      v = v || {};
      let row;
      const rm = h("button", { class: "xbtn", type: "button", title: "Remove", onclick: () => row.remove() }, "✕");
      if (kind === "port") {
        const host = h("input", { class: "in", type: "number", min: 1, max: 65535, placeholder: "host e.g. 8080", value: v.host || "" });
        const cont = h("input", { class: "in", type: "number", min: 1, max: 65535, placeholder: "container e.g. 80", value: v.container || "" });
        const proto = h("select", { class: "in" }, h("option", { value: "tcp" }, "tcp"), h("option", { value: "udp" }, "udp"));
        row = h("div", { class: "r" }, host, cont, proto, rm);
        row.value = () => (host.value && cont.value ? { host: +host.value, container: +cont.value, proto: proto.value } : null);
      } else if (kind === "volume") {
        const src = h("input", { class: "in", placeholder: "/path/on/host  or  volume-name", value: v.source || "" });
        const dst = h("input", { class: "in", placeholder: "/path/in/container", value: v.target || "" });
        const ro = h("input", { type: "checkbox", title: "read-only" });
        row = h("div", { class: "r vol" }, src, dst, h("label", { class: "switch", title: "read-only" }, ro, "ro"), rm);
        row.value = () => (src.value && dst.value ? { source: src.value.trim(), target: dst.value.trim(), readOnly: ro.checked } : null);
      } else {
        const k = h("input", { class: "in", placeholder: "KEY", value: v.key || "" });
        const val = h("input", { class: "in", placeholder: "value", value: v.value || "" });
        row = h("div", { class: "r env" }, k, val, rm);
        row.value = () => (k.value.trim() ? { key: k.value.trim(), value: val.value } : null);
      }
      wrap.appendChild(row);
    };
    (initial || []).forEach(add);
    const addBtn = h("button", { class: "btn sm", type: "button", onclick: () => add() }, icon("fa-solid fa-plus"),
      kind === "port" ? "Add port" : kind === "volume" ? "Add volume" : "Add variable");
    const el = h("div", null, wrap, h("div", { style: { marginTop: "8px" } }, addBtn));
    el.value = () => Array.from(wrap.children).map(r => r.value()).filter(Boolean);
    return el;
  }

  function openCreate(presetImage) {
    const imgs = S.ov.images.filter(i => !i.dangling);
    const image = h("input", { class: "in", placeholder: "e.g. nginx:alpine", value: presetImage || (imgs[0] ? imgs[0].name : "") });
    const imageList = h("datalist", { id: "dk-images" }, ...imgs.map(i => h("option", { value: i.name })));
    image.setAttribute("list", "dk-images");
    const name = h("input", { class: "in", placeholder: "optional — Docker names it if blank" });
    const restart = h("select", { class: "in" },
      h("option", { value: "no" }, "No — leave it stopped"),
      h("option", { value: "unless-stopped", selected: true }, "Unless stopped (survives reboot)"),
      h("option", { value: "always" }, "Always"),
      h("option", { value: "on-failure" }, "On failure"));
    const ports = rowSet("port");
    const volumes = rowSet("volume");
    const env = rowSet("env");
    const cmd = h("input", { class: "in", placeholder: "leave blank to use the image's default" });
    const startNow = h("input", { type: "checkbox", checked: true });

    const body = h("div", null, imageList,
      h("div", { class: "form" },
        h("div", { class: "fld full" }, h("label", null, "Image"), image,
          h("div", { class: "hint" }, imgs.length ? "Pick one you have, or type any reference — it is pulled if missing." : "No images yet — pull one on the Images tab first.")),
        h("div", { class: "fld" }, h("label", null, "Name"), name),
        h("div", { class: "fld" }, h("label", null, "Restart policy"), restart)),
      h("fieldset", { class: "grp", style: { marginTop: "14px" } }, h("legend", null, "Ports"),
        h("div", { class: "hint", style: { marginTop: 0, marginBottom: "8px" } }, "Host port → container port. Without one, the container is only reachable from other containers."),
        ports),
      h("fieldset", { class: "grp", style: { marginTop: "12px" } }, h("legend", null, "Volumes"),
        h("div", { class: "hint", style: { marginTop: 0, marginBottom: "8px" } }, "A host path keeps data when the container is replaced."),
        volumes),
      h("fieldset", { class: "grp", style: { marginTop: "12px" } }, h("legend", null, "Environment"), env),
      h("details", { style: { marginTop: "12px" } }, h("summary", { class: "sec-s", style: { cursor: "pointer" } }, "Advanced"),
        h("div", { class: "form", style: { marginTop: "10px" } }, h("div", { class: "fld full" }, h("label", null, "Command override"), cmd))),
      h("label", { class: "switch", style: { marginTop: "12px" } }, startNow, "Start it now"));

    const create = h("button", { class: "btn primary", onclick: async () => {
      const payload = {
        image: image.value.trim(), name: name.value.trim(), restart: restart.value,
        ports: ports.value(), volumes: volumes.value(), env: env.value(),
        cmd: cmd.value.trim(), start: startNow.checked,
      };
      if (!payload.image) return toast("Choose an image", "bad");
      create.disabled = true; create.textContent = "Creating…";
      try {
        const r = await api("POST", "/api/docker/containers", payload);
        modal.close();
        toast("Container created" + (r.warnings && r.warnings.length ? " with warnings" : ""));
        (r.warnings || []).forEach(w => toast(w, "bad"));
        reloadSoon(10);
      } catch (e) {
        create.disabled = false; create.textContent = "Create";
        // A missing image is recoverable right here rather than sending them away.
        if (/is not on this host/.test(e.message)) {
          toast(e.message, "bad");
          if (await confirmBox("Pull it now?", "“" + payload.image + "” is not on this host yet. Pull it and then create the container?", "Pull", false)) {
            try {
              await api("POST", "/api/docker/images/pull", { ref: payload.image });
              toast("Pulling " + payload.image + " — create it again when the pull finishes");
              setTab("images");
              modal.close();
            } catch (pe) { toast(pe.message, "bad"); }
          }
        } else toast(e.message, "bad");
      }
    } }, "Create");
    modal.open("New container", body, [h("button", { class: "btn", onclick: modal.close }, "Cancel"), create], true);
    setTimeout(() => image.focus(), 60);
  }

  // ── Terminal ────────────────────────────────────────────────────────────────
  function openTerminal(c) {
    const host = h("div", { id: "term" });
    const status = h("span", { class: "sec-s" }, "connecting…");
    const bar = h("div", { class: "term-bar" }, h("span", { class: "badge" }, c.name), status);
    modal.open("Terminal · " + c.name, h("div", null, bar, host), [h("button", { class: "btn", onclick: modal.close }, "Close")], true);

    const term = new window.Terminal({ cursorBlink: true, fontSize: 13, fontFamily: "var(--font-ui), Menlo, Consolas, monospace",
      theme: { background: "#05070b", foreground: "#cfe3f5" } });
    let fit = null;
    try { fit = new window.FitAddon.FitAddon(); term.loadAddon(fit); } catch (e) {}
    term.open(host);
    try { fit && fit.fit(); } catch (e) {}

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const sock = new WebSocket(proto + "//" + location.host + "/api/docker/containers/" + c.id + "/exec");
    sock.binaryType = "arraybuffer";
    const dec = new TextDecoder();
    const enc = new TextEncoder();

    const sendResize = () => {
      if (sock.readyState !== 1) return;
      try { sock.send(JSON.stringify({ resize: { rows: term.rows, cols: term.cols } })); } catch (e) {}
    };
    sock.onopen = () => { status.textContent = "connected"; sendResize(); term.focus(); };
    sock.onmessage = ev => term.write(typeof ev.data === "string" ? ev.data : dec.decode(new Uint8Array(ev.data)));
    sock.onclose = () => { status.textContent = "session ended"; try { term.write("\r\n\x1b[90m[session ended]\x1b[0m\r\n"); } catch (e) {} };
    sock.onerror = () => { status.textContent = "connection failed"; };
    term.onData(d => { if (sock.readyState === 1) sock.send(enc.encode(d)); });

    const onResize = () => { try { fit && fit.fit(); sendResize(); } catch (e) {} };
    window.addEventListener("resize", onResize);
    modal.onClose = () => {
      window.removeEventListener("resize", onResize);
      try { sock.close(); } catch (e) {}
      try { term.dispose(); } catch (e) {}
    };
    setTimeout(onResize, 60);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Images
  // ════════════════════════════════════════════════════════════════════════════
  function renderImages() {
    const p = panel("images"); p.innerHTML = "";
    p.appendChild(h("div", { class: "row" },
      h("div", null, h("div", { class: "sec-t" }, "Images"),
        h("div", { class: "sec-s" }, "Pulled images on this host. Containers are created from these.")),
      h("span", { class: "spacer" }),
      h("button", { class: "btn", onclick: prune, disabled: !engineUp() }, icon("fa-solid fa-broom"), "Prune unused"),
      h("button", { class: "btn primary", onclick: openPull, disabled: !engineUp() }, icon("fa-solid fa-download"), "Pull image")));
    if (!engineUp()) return;

    const jobs = (S.ov.pulls || []).filter(j => j.status !== "done");
    if (jobs.length) {
      const box = h("div", { style: { marginTop: "14px" } });
      jobs.forEach(j => {
        const pct = j.total ? j.current / j.total * 100 : 0;
        box.appendChild(h("div", { class: "note", style: { marginBottom: "8px" } },
          h("div", { class: "row" }, h("b", null, j.ref), h("span", { class: "spacer" }),
            h("span", { class: "sec-s" }, j.status === "pulling"
              ? (j.total ? fmtBytes(j.current) + " / " + fmtBytes(j.total) : "starting…") : j.status),
            j.status === "pulling"
              ? h("button", { class: "btn sm danger", onclick: () => act("Cancel", () => api("DELETE", "/api/docker/pulls/" + j.id)) }, "Cancel")
              : h("button", { class: "btn sm", onclick: () => act("Dismiss", () => api("DELETE", "/api/docker/pulls/" + j.id)) }, "Dismiss")),
          j.error ? h("div", { class: "note bad", style: { marginTop: "6px" } }, j.error)
                  : h("div", { class: "progress" }, h("i", { style: { width: pct + "%" } }))));
      });
      p.appendChild(box);
    }

    if (!S.ov.images.length) {
      p.appendChild(h("div", { class: "empty" }, h("b", null, "No images yet"),
        "Pull one to get started — for example ", h("code", null, "nginx:alpine"), " or ", h("code", null, "postgres:16"), "."));
      return;
    }
    const tb = h("tbody");
    S.ov.images.forEach(i => {
      const used = S.ov.containers.filter(c => c.image === i.name || c.imageId === i.id);
      tb.appendChild(h("tr", null,
        h("td", null, h("div", { class: "row", style: { gap: "9px", flexWrap: "nowrap" } },
          icon("fa-solid fa-layer-group"), h("b", null, i.name),
          i.dangling ? h("span", { class: "badge y" }, "dangling") : null)),
        h("td", { class: "mono" }, i.shortId),
        h("td", { class: "mono" }, fmtBytes(i.sizeBytes, 1)),
        h("td", null, i.created ? fmtAgo(new Date(i.created).toISOString()) : "—"),
        h("td", null, used.length ? h("span", { class: "badge a" }, used.length + " container" + (used.length === 1 ? "" : "s")) : h("span", { class: "sec-s" }, "unused")),
        h("td", null, h("div", { class: "row", style: { gap: "5px", flexWrap: "nowrap" } },
          h("button", { class: "btn sm", title: "New container from this image", onclick: () => { setTab("containers"); openCreate(i.name); } }, icon("fa-solid fa-plus")),
          h("button", { class: "btn sm danger", title: "Remove", onclick: async () => {
            if (await confirmBox("Remove image?", "“" + i.name + "” (" + fmtBytes(i.sizeBytes, 1) + ") is deleted from this host.", "Remove", true))
              act("Remove", () => api("DELETE", "/api/docker/images/" + encodeURIComponent(i.id) + "?force=" + (used.length ? 1 : 0)), "Removed");
          } }, icon("fa-solid fa-trash"))))));
    });
    p.appendChild(h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" },
      h("thead", null, h("tr", null, ["Image", "ID", "Size", "Created", "Used by", ""].map(x => h("th", null, x)))), tb)));
  }

  const SUGGESTED = ["nginx:alpine", "postgres:16", "redis:7-alpine", "node:22-alpine", "python:3.12-slim", "caddy:alpine"];
  function openPull() {
    const ref = h("input", { class: "in", placeholder: "e.g. nginx:alpine" });
    const chips = h("div", { class: "row", style: { marginTop: "8px" } },
      ...SUGGESTED.map(s => h("button", { class: "btn sm", type: "button", onclick: () => { ref.value = s; } }, s)));
    const go = h("button", { class: "btn primary", onclick: async () => {
      if (!ref.value.trim()) return toast("Enter an image name", "bad");
      go.disabled = true; go.textContent = "Starting…";
      try { await api("POST", "/api/docker/images/pull", { ref: ref.value.trim() }); modal.close(); toast("Pulling " + ref.value.trim() + "…"); reloadSoon(10); }
      catch (e) { toast(e.message, "bad"); go.disabled = false; go.textContent = "Pull"; }
    } }, "Pull");
    modal.open("Pull an image", h("div", null,
      h("div", { class: "form" }, h("div", { class: "fld full" }, h("label", null, "Image reference"), ref,
        h("div", { class: "hint" }, "Without a tag, :latest is used. Registry prefixes like ghcr.io/owner/name work too."))),
      h("div", { class: "sec-s", style: { marginTop: "12px" } }, "Common choices"), chips),
      [h("button", { class: "btn", onclick: modal.close }, "Cancel"), go]);
    setTimeout(() => ref.focus(), 60);
  }

  async function prune() {
    if (!await confirmBox("Prune unused images?", "Dangling images — layers no longer referenced by any tag — are deleted. Images in use are kept.", "Prune", true)) return;
    const r = await act("Prune", () => api("POST", "/api/docker/images/prune"));
    if (r) toast(r.deleted ? "Removed " + r.deleted + " image(s), freed " + fmtBytes(r.reclaimedBytes, 1) : "Nothing to prune");
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  onServerEvents(d => { if (d.what === "pull") reloadSoon(400); else reloadSoon(200); }, "docker");
  setInterval(() => { if (!document.hidden) load(); }, 6000);
  setInterval(pollStats, 3000);
  window.addEventListener("hashchange", () => {
    const t = location.hash.slice(1);
    if (S.ov && t !== S.tab && ["containers", "images"].includes(t)) setTab(t);
  });
  const initial = (location.hash || "").slice(1) || (function () { try { return localStorage.getItem("docker-tab"); } catch (e) { return null; } })() || "containers";
  load().then(() => { setTab(["containers", "images"].includes(initial) ? initial : "containers"); pollStats(); });
})();
