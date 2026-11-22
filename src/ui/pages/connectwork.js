/* ConnectWork — a force-directed graph of notes, flows, reminders and files.
   Positions live only in this page: a refresh from the server keeps every dot
   where it was and places new ones beside their neighbours. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var app = $("app"), cv = $("cv"), ctx = cv.getContext("2d"), insp = $("insp");
  var CLIENT = Math.random().toString(36).slice(2, 10);
  var TYPES = ["note", "folder", "flow", "rem", "file", "vm", "ctr", "host"];
  var TYPE_NAME = { note: "Note", folder: "Note folder", flow: "Flow space", rem: "Reminder", file: "File", vm: "Virtual machine", ctr: "Container", host: "Host" };
  var css = getComputedStyle(document.documentElement);
  var COLOR = {};
  function readColors() {
    css = getComputedStyle(document.documentElement);
    TYPES.forEach(function (t) { COLOR[t] = css.getPropertyValue("--cw-" + t).trim(); });
    COLOR.text = css.getPropertyValue("--text").trim() || "#ddd";
    COLOR.muted = css.getPropertyValue("--muted").trim() || "#888";
    COLOR.line = css.getPropertyValue("--text-2").trim() || "#999";
    COLOR.accent = css.getPropertyValue("--accent").trim() || "#4a9";
    COLOR.bg = css.getPropertyValue("--bg").trim() || "#111";
  }
  readColors();

  // ── state ──────────────────────────────────────────────────────────────────
  var NODES = [], EDGES = [], BY_ID = {}, ADJ = {};
  var shown = [], shownEdges = [];
  var show = { note: true, folder: true, flow: true, rem: true, file: true, vm: true, ctr: true, host: true }, orphans = true, allLabels = false;
  var query = "", picked = null, hover = null;
  var linkFrom = null, pointerWorld = null;   // right-click "Connect to…" in progress
  var view = { x: 0, y: 0, k: 1 }, W = 0, H = 0, DPR = 1;
  var alpha = 1, fitted = false;
  try {
    var saved = JSON.parse(localStorage.getItem("openhl-cw") || "{}");
    if (saved.show) Object.keys(show).forEach(function (t) { if (typeof saved.show[t] === "boolean") show[t] = saved.show[t]; });
    if (typeof saved.orphans === "boolean") orphans = saved.orphans;
    if (typeof saved.labels === "boolean") allLabels = saved.labels;
  } catch (e) {}
  function remember() {
    try { localStorage.setItem("openhl-cw", JSON.stringify({ show: show, orphans: orphans, labels: allLabels })); } catch (e) {}
  }

  // ── data ───────────────────────────────────────────────────────────────────
  function load() {
    return fetch("/api/connectwork").then(function (r) { if (!r.ok) throw new Error(); return r.json(); }).then(function (d) {
      var old = BY_ID;
      NODES = d.nodes || []; EDGES = d.edges || []; BY_ID = {}; ADJ = {};
      NODES.forEach(function (n) { BY_ID[n.id] = n; ADJ[n.id] = []; });
      EDGES.forEach(function (e) { ADJ[e.a].push(e); ADJ[e.b].push(e); });
      // Keep where things were; new ones start beside a placed neighbour.
      NODES.forEach(function (n) {
        var o = old[n.id];
        if (o) { n.x = o.x; n.y = o.y; n.vx = o.vx; n.vy = o.vy; return; }
        var near = null;
        (ADJ[n.id] || []).some(function (e) { var m = old[e.a === n.id ? e.b : e.a]; if (m) { near = m; return true; } return false; });
        var a = Math.random() * Math.PI * 2, r = near ? 30 : 60 + Math.random() * 200;
        n.x = (near ? near.x : 0) + Math.cos(a) * r; n.y = (near ? near.y : 0) + Math.sin(a) * r; n.vx = 0; n.vy = 0;
      });
      NODES.forEach(function (n) { n.deg = ADJ[n.id].length; n.r = 4 + Math.min(10, Math.sqrt(n.deg) * 2.2); });
      if (picked) picked = BY_ID[picked.id] || null;
      if (hover) hover = BY_ID[hover.id] || null;
      TYPES.forEach(function (t) {
        $("n-" + t).textContent = NODES.filter(function (n) { return n.type === t; }).length;
      });
      var ai = EDGES.filter(function (e) { return e.ai && !e.id; }).length;
      $("stats").textContent = EDGES.length + " link" + (EDGES.length === 1 ? "" : "s") + (ai ? " · " + ai + " suggested by AI" : "") +
        (d.auto && d.auto.running ? " · AI is looking…" : "") + (d.filesCapped ? " · showing the first 1,500 files" : "");
      filter(); heat(Object.keys(old).length ? 0.4 : 1);
      renderInsp();
    }).catch(function () { showToast("Couldn't load the graph", "bad"); });
  }

  function filter() {
    shown = NODES.filter(function (n) {
      if (!show[n.type]) return false;
      if (!orphans && !ADJ[n.id].some(function (e) { var o = BY_ID[e.a === n.id ? e.b : e.a]; return show[o.type]; }) && n !== picked) return false;
      return true;
    });
    var on = {}; shown.forEach(function (n) { on[n.id] = true; });
    shownEdges = EDGES.filter(function (e) { return on[e.a] && on[e.b]; });
    var e = $("empty");
    if (!NODES.length) { e.innerHTML = "<div><b>Nothing to connect yet</b>Add a note, a flow, a reminder, a file, a virtual machine or a container and it shows up here.</div>"; e.classList.add("on"); }
    else if (!shown.length) { e.innerHTML = "<div><b>Everything is filtered out</b>Turn a type back on in Show.</div>"; e.classList.add("on"); }
    else e.classList.remove("on");
  }

  // ── simulation ─────────────────────────────────────────────────────────────
  // Springs along links, repulsion between nearby dots (a grid keeps it to
  // neighbours, so a few thousand dots stay smooth), and a gentle pull to the
  // middle so separate clusters do not drift away.
  var CELL = 140;
  function heat(a) { alpha = Math.max(alpha, a); kick(); }
  function step() {
    var n = shown.length, i, j, a, b, dx, dy, d2, d, f;
    var grid = {};
    for (i = 0; i < n; i++) {
      a = shown[i]; var key = Math.floor(a.x / CELL) + "," + Math.floor(a.y / CELL);
      (grid[key] || (grid[key] = [])).push(a);
    }
    for (i = 0; i < n; i++) {
      a = shown[i];
      var cx = Math.floor(a.x / CELL), cy = Math.floor(a.y / CELL);
      for (var gx = cx - 1; gx <= cx + 1; gx++) for (var gy = cy - 1; gy <= cy + 1; gy++) {
        var cell = grid[gx + "," + gy]; if (!cell) continue;
        for (j = 0; j < cell.length; j++) {
          b = cell[j]; if (b === a) continue;
          dx = a.x - b.x; dy = a.y - b.y; d2 = dx * dx + dy * dy;
          if (d2 > CELL * CELL) continue;
          if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.5; }
          f = 900 / d2 * alpha;
          a.vx += dx * f * 0.05; a.vy += dy * f * 0.05;
        }
      }
      a.vx -= a.x * 0.0025 * alpha; a.vy -= a.y * 0.0025 * alpha;
    }
    for (i = 0; i < shownEdges.length; i++) {
      var e = shownEdges[i]; a = BY_ID[e.a]; b = BY_ID[e.b];
      dx = b.x - a.x; dy = b.y - a.y; d = Math.sqrt(dx * dx + dy * dy) || 1;
      f = (d - 70) / d * 0.06 * alpha;
      a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
    }
    for (i = 0; i < n; i++) {
      a = shown[i];
      if (a === drag.node) { a.vx = a.vy = 0; continue; }
      a.vx *= 0.6; a.vy *= 0.6;
      var sp = a.vx * a.vx + a.vy * a.vy; if (sp > 400) { var s = 20 / Math.sqrt(sp); a.vx *= s; a.vy *= s; }
      a.x += a.vx; a.y += a.vy;
    }
    alpha *= 0.985;
  }

  // ── drawing ────────────────────────────────────────────────────────────────
  var raf = 0;
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame() {
    raf = 0;
    if (alpha > 0.005) step();
    if (!fitted && shown.length && alpha < 0.6) { fit(); fitted = true; }
    draw();
    if (alpha > 0.005) kick();
  }
  function resize() {
    var r = cv.getBoundingClientRect(); DPR = window.devicePixelRatio || 1;
    W = r.width; H = r.height; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    kick();
  }
  function matches(n) { return query && n.title.toLowerCase().indexOf(query) >= 0; }
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.translate(W / 2 + view.x, H / 2 + view.y); ctx.scale(view.k, view.k);
    var focus = picked || hover, near = {};
    if (focus) { near[focus.id] = true; ADJ[focus.id].forEach(function (e) { near[e.a] = near[e.b] = true; }); }
    // links
    ctx.lineWidth = 1 / view.k;
    shownEdges.forEach(function (e) {
      var a = BY_ID[e.a], b = BY_ID[e.b], lit = focus && (e.a === focus.id || e.b === focus.id);
      ctx.globalAlpha = focus ? (lit ? 0.9 : 0.08) : 0.35;
      ctx.strokeStyle = lit ? COLOR.accent : COLOR.line;
      ctx.lineWidth = (lit ? 1.6 : 1) / view.k;
      ctx.shadowColor = COLOR.accent; ctx.shadowBlur = lit ? 8 * DPR : 0;
      // Solid: yours. Dashed: made by the items. Dotted: suggested by AI.
      if (e.id) ctx.setLineDash([]);
      else if (e.ai) { ctx.setLineDash([1.5 / view.k, 3.5 / view.k]); ctx.lineWidth = (lit ? 2.2 : 1.6) / view.k; }
      else ctx.setLineDash([4 / view.k, 3 / view.k]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    });
    ctx.setLineDash([]); ctx.shadowBlur = 0;
    // "Connect to…" from the right-click menu: a line from the item to the pointer
    if (linkFrom && pointerWorld) {
      ctx.globalAlpha = 0.9; ctx.strokeStyle = COLOR.accent; ctx.lineWidth = 2 / view.k; ctx.setLineDash([6 / view.k, 4 / view.k]);
      ctx.beginPath(); ctx.moveTo(linkFrom.x, linkFrom.y); ctx.lineTo(pointerWorld.x, pointerWorld.y); ctx.stroke(); ctx.setLineDash([]);
    }
    // the link being drawn
    if (drag.linking && drag.node) {
      ctx.globalAlpha = 0.9; ctx.strokeStyle = COLOR.accent; ctx.lineWidth = 2 / view.k; ctx.setLineDash([6 / view.k, 4 / view.k]);
      ctx.beginPath(); ctx.moveTo(drag.node.x, drag.node.y); ctx.lineTo(drag.wx, drag.wy); ctx.stroke(); ctx.setLineDash([]);
    }
    // dots
    shown.forEach(function (n) {
      var dim = (focus && !near[n.id]) || (query && !matches(n));
      ctx.globalAlpha = dim ? 0.18 : 1;
      ctx.fillStyle = COLOR[n.type];
      // A glow in the dot's own colour; stronger on the one in focus. The
      // blur is in screen pixels, so it looks the same at every zoom.
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      if (!dim) {
        var hot = n === picked || n === hover || n === linkFrom;
        ctx.shadowColor = COLOR[n.type]; ctx.shadowBlur = (hot ? 38 : 20 + n.r * 1.5) * DPR;
        ctx.fill(); if (hot) ctx.fill();   // a second pass deepens the glow
        ctx.shadowBlur = 0;
      }
      ctx.fill();
      if (n === picked || n === drag.target || n === linkFrom || matches(n)) {
        ctx.globalAlpha = 1; ctx.strokeStyle = n === picked || n === drag.target || n === linkFrom ? COLOR.accent : COLOR.text;
        ctx.lineWidth = 2.2 / view.k; ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 3 / view.k, 0, Math.PI * 2); ctx.stroke();
      }
    });
    // names: always when zoomed in or asked for, else for the focus and its links
    var fs = 12 / view.k;
    ctx.font = "500 " + fs + "px " + (css.getPropertyValue("--font-ui").trim() || "system-ui, sans-serif");
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    shown.forEach(function (n) {
      var want = allLabels || view.k > 1.4 || near[n.id] || matches(n) || n === drag.target || n === linkFrom || (linkFrom && n === hover);
      if (!want) return;
      var dim = (focus && !near[n.id]) || (query && !matches(n));
      ctx.globalAlpha = dim ? 0.25 : 0.95;
      var t = n.title.length > 40 ? n.title.slice(0, 39) + "…" : n.title;
      ctx.lineWidth = 3 / view.k; ctx.strokeStyle = COLOR.bg; ctx.strokeText(t, n.x, n.y + n.r + 4 / view.k);
      ctx.fillStyle = COLOR.text; ctx.fillText(t, n.x, n.y + n.r + 4 / view.k);
    });
    ctx.globalAlpha = 1;
  }

  // ── view ───────────────────────────────────────────────────────────────────
  function toWorld(px, py) { return { x: (px - W / 2 - view.x) / view.k, y: (py - H / 2 - view.y) / view.k }; }
  function at(px, py) {
    var w = toWorld(px, py), best = null, bd = Infinity;
    shown.forEach(function (n) {
      var dx = n.x - w.x, dy = n.y - w.y, d = dx * dx + dy * dy, r = n.r + 6 / view.k;
      if (d < r * r && d < bd) { bd = d; best = n; }
    });
    return best;
  }
  function fit() {
    if (!shown.length) return;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    shown.forEach(function (n) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); });
    var k = Math.min((W - 80) / Math.max(1, x1 - x0), (H - 80) / Math.max(1, y1 - y0));
    view.k = Math.max(0.15, Math.min(2.5, k));
    view.x = -(x0 + x1) / 2 * view.k; view.y = -(y0 + y1) / 2 * view.k;
    kick();
  }
  function centerOn(n) { view.x = -n.x * view.k; view.y = -n.y * view.k; kick(); }

  // ── pointer: pan, drag a dot, shift-drag to link, click to pick ─────────────
  var drag = { node: null, pan: false, linking: false, target: null, sx: 0, sy: 0, moved: false, wx: 0, wy: 0 };
  var pointers = {}, pinch = null;
  function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  cv.addEventListener("pointerdown", function (e) {
    cv.focus();
    var p = pos(e); pointers[e.pointerId] = p;
    if (Object.keys(pointers).length === 2) {   // two fingers: pinch to zoom
      var ps = Object.keys(pointers).map(function (k) { return pointers[k]; });
      pinch = { d: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), k: view.k };
      drag.node = null; drag.pan = false; drag.linking = false; return;
    }
    if (e.button === 2) { delete pointers[e.pointerId]; return; }
    closeMenu();
    if (linkFrom) {
      delete pointers[e.pointerId];
      var t = at(p.x, p.y);
      if (t && t !== linkFrom) { var from = linkFrom; endLinking(); connect(from, t); }
      else if (!t) endLinking();
      return;
    }
    cv.setPointerCapture(e.pointerId);
    var n = at(p.x, p.y);
    drag.sx = p.x; drag.sy = p.y; drag.moved = false; drag.target = null;
    if (n) { drag.node = n; drag.linking = e.shiftKey; var w = toWorld(p.x, p.y); drag.wx = w.x; drag.wy = w.y; cv.classList.toggle("linking", e.shiftKey); }
    else { drag.pan = true; drag.vx = view.x; drag.vy = view.y; cv.classList.add("panning"); }
  });
  cv.addEventListener("pointermove", function (e) {
    var p = pos(e);
    if (pointers[e.pointerId]) pointers[e.pointerId] = p;
    if (pinch) {
      var ps = Object.keys(pointers).map(function (k) { return pointers[k]; });
      if (ps.length === 2) { zoomAt((ps[0].x + ps[1].x) / 2, (ps[0].y + ps[1].y) / 2, pinch.k * Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) / pinch.d / view.k); }
      return;
    }
    if (Math.abs(p.x - drag.sx) + Math.abs(p.y - drag.sy) > 4) drag.moved = true;
    if (drag.pan) { view.x = drag.vx + p.x - drag.sx; view.y = drag.vy + p.y - drag.sy; kick(); return; }
    if (drag.node) {
      var w = toWorld(p.x, p.y);
      if (drag.linking) { drag.wx = w.x; drag.wy = w.y; var t = at(p.x, p.y); drag.target = t && t !== drag.node ? t : null; kick(); }
      else if (drag.moved) { drag.node.x = w.x; drag.node.y = w.y; heat(0.25); }
      return;
    }
    if (linkFrom) { pointerWorld = toWorld(p.x, p.y); kick(); }
    var h = at(p.x, p.y);
    if (h !== hover) { hover = h; cv.classList.toggle("over", !!h); cv.title = h ? h.title + " · " + TYPE_NAME[h.type] : ""; kick(); }
  });
  function up(e) {
    delete pointers[e.pointerId];
    if (pinch) { if (Object.keys(pointers).length < 2) pinch = null; return; }
    var n = drag.node;
    if (drag.linking && n) {
      if (drag.target) connect(n, drag.target);
      else if (!drag.moved) pick(n);
    } else if (n && !drag.moved) pick(n);
    else if (drag.pan && !drag.moved) pick(null);
    drag.node = null; drag.pan = false; drag.linking = false; drag.target = null;
    cv.classList.remove("panning", "linking"); kick();
  }
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  cv.addEventListener("pointerleave", function () { if (hover && !drag.node) { hover = null; cv.classList.remove("over"); kick(); } });
  cv.addEventListener("dblclick", function (e) { var p = pos(e), n = at(p.x, p.y); if (n) openItem(n); });
  function zoomAt(px, py, f) {
    var k = Math.max(0.1, Math.min(5, view.k * f)); f = k / view.k;
    var cx = px - W / 2, cy = py - H / 2;
    view.x = cx - (cx - view.x) * f; view.y = cy - (cy - view.y) * f; view.k = k; kick();
  }
  cv.addEventListener("wheel", function (e) { e.preventDefault(); var p = pos(e); zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  cv.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && (linkFrom || menu.parentNode)) { endLinking(); closeMenu(); }
    else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { if (picked) { e.preventDefault(); var sp = toScreen(picked); openMenu(picked, sp.x, sp.y); } }
    else if (e.key === "Escape" && picked) pick(null);
    else if (e.key === "Enter" && picked) openItem(picked);
    else if (e.key === "+" || e.key === "=") zoomAt(W / 2, H / 2, 1.2);
    else if (e.key === "-") zoomAt(W / 2, H / 2, 1 / 1.2);
  });

  function openItem(n) {
    if (n.type === "file") window.open(n.href, "_blank", "noopener"); else location.href = n.href;
  }

  // ── right-click menu ──────────────────────────────────────────────────────
  // On a dot: connect it to another (click the second dot), open it, or show
  // its links. "Connect to…" also finishes on a right-click of the second dot.
  var menu = document.createElement("div");
  menu.className = "cw-menu"; menu.setAttribute("role", "menu");
  var banner = $("linkbar");
  function toScreen(n) { var r = cv.getBoundingClientRect(); return { x: r.left + W / 2 + view.x + n.x * view.k, y: r.top + H / 2 + view.y + n.y * view.k }; }
  function closeMenu() { if (menu.parentNode) menu.remove(); }
  function item(icon, label, fn) {
    var b = el("button", "cw-menu-i"); b.type = "button"; b.setAttribute("role", "menuitem");
    b.innerHTML = '<i class="fa-solid fa-' + icon + '"></i>'; b.appendChild(document.createTextNode(label));
    // Focus goes back to the graph only for the keyboard; a mouse click would
    // otherwise light up the canvas's focus ring.
    b.addEventListener("click", function (ev) { closeMenu(); fn(); if (!ev.detail) cv.focus(); });
    return b;
  }
  function openMenu(n, x, y) {
    closeMenu(); menu.innerHTML = "";
    var h = el("div", "cw-menu-h"); h.appendChild(dot(n.type)); h.appendChild(el("span", null, n.title)); menu.appendChild(h);
    menu.appendChild(item("link", "Connect to…", function () { startLinking(n); }));
    menu.appendChild(item("arrow-up-right-from-square", ["vm", "ctr", "host"].indexOf(n.type) >= 0 ? "Open its page" : "Open " + TYPE_NAME[n.type].toLowerCase(), function () { openItem(n); }));
    menu.appendChild(item("circle-info", "Show links", function () { pick(n); }));
    document.body.appendChild(menu);
    var mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(x, innerWidth - mw - 8)) + "px";
    menu.style.top = Math.max(8, Math.min(y, innerHeight - mh - 8)) + "px";
    menu.querySelector(".cw-menu-i").focus();
  }
  menu.addEventListener("keydown", function (e) {
    var items = Array.prototype.slice.call(menu.querySelectorAll(".cw-menu-i")), i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(i + items.length - 1) % items.length].focus(); }
    else if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); closeMenu(); cv.focus(); }
  });
  document.addEventListener("pointerdown", function (e) { if (menu.parentNode && !menu.contains(e.target)) closeMenu(); }, true);
  window.addEventListener("blur", closeMenu);
  function startLinking(n) {
    linkFrom = n; pointerWorld = null;
    banner.querySelector("b").textContent = n.title;
    banner.classList.add("on"); cv.classList.add("linking"); kick();
  }
  function endLinking() { linkFrom = null; pointerWorld = null; banner.classList.remove("on"); cv.classList.remove("linking"); kick(); }
  $("linkbar-x").addEventListener("click", function () { endLinking(); cv.focus(); });
  cv.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    var p = pos(e), n = at(p.x, p.y);
    if (linkFrom) {   // right-click the second dot to finish
      if (n && n !== linkFrom) { var from = linkFrom; endLinking(); connect(from, n); } else endLinking();
      return;
    }
    if (n) openMenu(n, e.clientX, e.clientY); else closeMenu();
  });

  // ── links ──────────────────────────────────────────────────────────────────
  function connect(a, b) {
    if (ADJ[a.id].some(function (e) { return e.id && (e.a === b.id || e.b === b.id); })) { showToast("Those are already linked", "ok"); return; }
    fetch("/api/connectwork/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: a.id, b: b.id, client: CLIENT }) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "Couldn't link them"); return d; }); })
      .then(function () { showToast("Linked " + a.title + " and " + b.title, "ok"); picked = a; return load(); })
      .catch(function (err) { showToast(err.message, "bad"); });
  }
  function dismiss(e) {
    fetch("/api/connectwork/auto/dismiss", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: e.a, b: e.b }) })
      .then(function (r) { if (!r.ok) throw new Error(); showToast("Suggestion dismissed", "ok"); return load(); })
      .catch(function () { showToast("Couldn't dismiss that", "bad"); });
  }
  function unlink(e) {
    fetch("/api/connectwork/links/" + encodeURIComponent(e.id), { method: "DELETE" })
      .then(function (r) { if (!r.ok) throw new Error(); return load(); })
      .catch(function () { showToast("Couldn't remove that link", "bad"); });
  }

  // ── inspector ──────────────────────────────────────────────────────────────
  function pick(n) {
    picked = n; app.classList.toggle("picked", !!n);
    if (!orphans) filter();
    renderInsp();
    requestAnimationFrame(resize);
  }
  function el(tag, cls, text) { var x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; }
  function dot(t) { var d = el("span", "cw-dot"); d.style.setProperty("--c", COLOR[t]); return d; }
  function sub(n) {
    if (n.type === "rem" && n.at) return n.sub + " · " + new Date(n.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    return n.type === "file" ? n.sub : n.sub;
  }
  function renderInsp() {
    app.classList.toggle("picked", !!picked);
    insp.innerHTML = "";
    if (!picked) return;
    var n = picked;
    var head = el("div", "cw-i-head"); head.appendChild(dot(n.type));
    var t = el("div", "cw-i-t"); t.appendChild(el("h2", "cw-i-title", n.title)); t.appendChild(el("div", "cw-i-sub", n.type === "file" ? (n.project ? "Code project in " : "File in ") + n.sub : ["vm", "ctr", "host", "folder"].indexOf(n.type) >= 0 ? n.sub : TYPE_NAME[n.type]));
    if (n.type === "rem" && n.at) t.lastChild.textContent = sub(n);
    head.appendChild(t);
    var x = el("button", "cw-x"); x.type = "button"; x.title = "Close"; x.setAttribute("aria-label", "Close"); x.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    x.addEventListener("click", function () { pick(null); cv.focus(); });
    head.appendChild(x); insp.appendChild(head);

    var s1 = el("div", "cw-i-sec"), open = el("a", "cw-open");
    open.href = n.href; if (n.type === "file") { open.target = "_blank"; open.rel = "noopener"; }
    open.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i>';
    open.appendChild(document.createTextNode(n.type === "file" ? (n.project ? "Open in Files" : "Open file") : n.type === "folder" ? "Open in Notes" : n.type === "vm" ? "Open in VM Lab" : n.type === "ctr" ? "Open in Containers" : n.type === "host" ? (n.id.indexOf("host:pc:") === 0 ? "Open in PC host" : "Open in VM Lab") : "Open " + TYPE_NAME[n.type].toLowerCase()));
    s1.appendChild(open); insp.appendChild(s1);

    var s2 = el("div", "cw-i-sec"), links = ADJ[n.id];
    s2.appendChild(el("p", "cw-group-t", "Linked to (" + links.length + ")"));
    if (!links.length) s2.appendChild(el("p", "cw-none", "Nothing yet."));
    else {
      var ul = el("ul", "cw-links");
      links.slice().sort(function (a, b) { return other(a, n).title.localeCompare(other(b, n).title); }).forEach(function (e) {
        var o = other(e, n), li = el("li", "cw-link"); li.appendChild(dot(o.type));
        var b = el("button", "cw-link-b"); b.type = "button";
        b.appendChild(el("span", null, o.title));
        b.appendChild(el("small", null, TYPE_NAME[o.type] + (e.why.length ? " · " + e.why.join(", ") : "")));
        b.addEventListener("click", function () { if (!show[o.type]) { show[o.type] = true; syncChecks(); filter(); } pick(o); centerOn(o); });
        li.appendChild(b);
        if (e.ai && !e.id) {
          var keep = el("button", "cw-unlink"); keep.type = "button"; keep.title = "Keep this link"; keep.setAttribute("aria-label", "Keep the suggested link to " + o.title);
          keep.innerHTML = '<i class="fa-solid fa-check"></i>';
          keep.addEventListener("click", function () { connect(n, o); });
          var drop = el("button", "cw-unlink"); drop.type = "button"; drop.title = "Dismiss this suggestion"; drop.setAttribute("aria-label", "Dismiss the suggested link to " + o.title);
          drop.innerHTML = '<i class="fa-solid fa-xmark"></i>';
          drop.addEventListener("click", function () { dismiss(e); });
          li.appendChild(keep); li.appendChild(drop);
        }
        if (e.id) {
          var u = el("button", "cw-unlink"); u.type = "button"; u.title = "Remove this link"; u.setAttribute("aria-label", "Remove the link to " + o.title);
          u.innerHTML = '<i class="fa-solid fa-link-slash"></i>';
          u.addEventListener("click", function () { unlink(e); });
          li.appendChild(u);
        }
        ul.appendChild(li);
      });
      s2.appendChild(ul);
    }
    insp.appendChild(s2);

    // Link to something else: search every item, whatever is filtered out.
    var s3 = el("div", "cw-i-sec");
    s3.appendChild(el("p", "cw-group-t", "Link to"));
    var box = el("label", "cw-search cw-pick"); box.innerHTML = '<i class="fa-solid fa-link"></i>';
    var input = el("input", "cw-input"); input.type = "search"; input.placeholder = "Search everything"; input.autocomplete = "off";
    input.setAttribute("aria-label", "Link " + n.title + " to");
    box.appendChild(input); s3.appendChild(box);
    var list = el("ul", "cw-sugg"); s3.appendChild(list);
    var hits = [], sel = 0;
    function paint() {
      list.innerHTML = "";
      hits.forEach(function (h, i) {
        var li = el("li"), b = el("button"); b.type = "button"; if (i === sel) b.className = "on";
        b.appendChild(dot(h.type)); b.appendChild(el("span", null, h.title)); b.appendChild(el("small", null, TYPE_NAME[h.type]));
        b.addEventListener("click", function () { connect(n, h); });
        li.appendChild(b); list.appendChild(li);
      });
    }
    input.addEventListener("input", function () {
      var q = input.value.trim().toLowerCase(); sel = 0;
      var linked = {}; ADJ[n.id].forEach(function (e) { if (e.id) linked[other(e, n).id] = true; });
      hits = !q ? [] : NODES.filter(function (o) { return o !== n && !linked[o.id] && o.title.toLowerCase().indexOf(q) >= 0; })
        .sort(function (a, b) { return a.title.toLowerCase().indexOf(q) - b.title.toLowerCase().indexOf(q) || a.title.length - b.title.length; }).slice(0, 12);
      paint();
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" && hits.length) { e.preventDefault(); sel = (sel + 1) % hits.length; paint(); }
      else if (e.key === "ArrowUp" && hits.length) { e.preventDefault(); sel = (sel + hits.length - 1) % hits.length; paint(); }
      else if (e.key === "Enter" && hits[sel]) { e.preventDefault(); connect(n, hits[sel]); }
    });
    insp.appendChild(s3);
  }
  function other(e, n) { return BY_ID[e.a === n.id ? e.b : e.a]; }

  // ── filters ────────────────────────────────────────────────────────────────
  var checks = document.querySelectorAll("input[data-type]");
  function syncChecks() {
    checks.forEach(function (c) { c.checked = show[c.dataset.type]; });
    $("orphans").checked = orphans; $("labels").checked = allLabels;
  }
  checks.forEach(function (c) {
    c.addEventListener("change", function () {
      show[c.dataset.type] = c.checked; remember();
      if (picked && !show[picked.type]) pick(null);
      filter(); heat(0.5);
    });
  });
  $("orphans").addEventListener("change", function (e) { orphans = e.target.checked; remember(); filter(); heat(0.3); });
  $("labels").addEventListener("change", function (e) { allLabels = e.target.checked; remember(); kick(); });
  syncChecks();
  $("q").addEventListener("input", function (e) { query = e.target.value.trim().toLowerCase(); kick(); });
  $("q").addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || !query) return;
    var n = shown.filter(matches)[0];
    if (n) { pick(n); centerOn(n); app.classList.remove("side-open"); } else showToast("Nothing shown matches that", "bad");
  });
  $("t-fit").addEventListener("click", fit);
  $("t-shake").addEventListener("click", function () {
    shown.forEach(function (n) { n.x += (Math.random() - 0.5) * 300; n.y += (Math.random() - 0.5) * 300; });
    alpha = 1; fitted = false; kick();
  });
  // The graph's focus ring shows only after Tab, never from a click.
  var main = cv.parentNode;
  document.addEventListener("keydown", function (e) { if (e.key === "Tab") main.classList.add("kb"); });
  document.addEventListener("pointerdown", function () { main.classList.remove("kb"); }, true);
  $("t-side").addEventListener("click", function () { app.classList.toggle("side-open"); });
  cv.addEventListener("pointerdown", function () { app.classList.remove("side-open"); });

  // ── start, and follow changes made elsewhere ───────────────────────────────
  new ResizeObserver(resize).observe(cv);
  resize();
  load();
  var again = 0;
  function soon() { clearTimeout(again); again = setTimeout(load, 400); }
  try {
    var es = openhlEvents();
    es.addEventListener("connectwork_changed", function (ev) { var d = {}; try { d = JSON.parse(ev.data); } catch (e) {} if (d.client !== CLIENT) soon(); });
    ["change", "flows_changed", "reminders_changed", "vmlab", "docker", "laptops"].forEach(function (t) { es.addEventListener(t, soon); });
  } catch (e) {}
  document.addEventListener("visibilitychange", function () { if (!document.hidden) soon(); });
  // Containers can start and stop outside Gridlantis-HL, so look again now and then.
  setInterval(function () { if (!document.hidden && !drag.node && !linkFrom) load(); }, 60000);
  // Theme switches change the colours the canvas paints with.
  new MutationObserver(function () { readColors(); kick(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
})();
