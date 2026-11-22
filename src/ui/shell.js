/* Gridlantis-HL shell — status strip, sidebar behaviour. Loaded on every page with the nav. */
(function () {
  "use strict";
  var root = document.documentElement;
  var $ = function (id) { return document.getElementById(id); };

  // ── Sidebar: collapse to a rail, open as a drawer on small screens ─────────
  var collapse = $("m-collapse");
  function paintCollapse() {
    if (!collapse) return;
    var rail = root.classList.contains("nav-rail");
    collapse.title = rail ? "Expand sidebar" : "Collapse sidebar";
    var i = collapse.querySelector("i"); if (i) i.className = rail ? "fa-solid fa-angles-right" : "fa-solid fa-angles-left";
    var l = collapse.querySelector(".m-foot-l"); if (l) l.textContent = rail ? "Expand" : "Collapse";
  }
  if (collapse) collapse.addEventListener("click", function () {
    root.classList.toggle("nav-rail");
    try { localStorage.setItem("openhl-nav", root.classList.contains("nav-rail") ? "rail" : "full"); } catch (e) {}
    paintCollapse();
    window.dispatchEvent(new Event("resize"));   // maps and charts re-measure
  });
  paintCollapse();
  // Hide removes the sidebar entirely; on a desktop the menu button then shows
  // it again. On phones the menu button stays the drawer toggle.
  var menu = $("m-menu"), scrim = $("m-scrim"), hide = $("m-hide");
  var phone = window.matchMedia("(max-width:760px)");
  function setHidden(on) {
    root.classList.toggle("nav-hidden", on);
    try { localStorage.setItem("openhl-nav-hidden", on ? "1" : "0"); } catch (e) {}
    if (menu) { menu.setAttribute("aria-label", on && !phone.matches ? "Show sidebar" : "Open menu"); menu.title = on && !phone.matches ? "Show sidebar" : ""; }
    window.dispatchEvent(new Event("resize"));
  }
  if (hide) hide.addEventListener("click", function () { setHidden(true); });
  if (menu) {
    menu.addEventListener("click", function () {
      if (!phone.matches && root.classList.contains("nav-hidden")) setHidden(false);
      else root.classList.toggle("nav-open");
    });
    if (root.classList.contains("nav-hidden") && !phone.matches) { menu.setAttribute("aria-label", "Show sidebar"); menu.title = "Show sidebar"; }
  }
  if (scrim) scrim.addEventListener("click", function () { root.classList.remove("nav-open"); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") root.classList.remove("nav-open"); });

  // Inside the desktop or Android app there is nothing to download. The
  // Android app has no address bar, so it gets a way back to its connect screen.
  if (window.openhlDesktop || window.openhlAndroid) document.querySelectorAll(".openhl-get-app").forEach(function (a) { a.style.display = "none"; });
  if (window.openhlAndroid) document.querySelectorAll(".openhl-switch-server").forEach(function (b) {
    b.hidden = false;
    b.addEventListener("click", function () { window.openhlAndroid.switchServer(); });
  });

  // "Get the app" dropdown: desktop or Android.
  var apps = document.querySelector(".openhl-get-app"), appsBtn = $("m-apps-btn");
  if (apps && appsBtn) {
    var setApps = function (on) { apps.classList.toggle("open", on); appsBtn.setAttribute("aria-expanded", on ? "true" : "false"); };
    appsBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      setApps(!apps.classList.contains("open"));
      if (apps.classList.contains("open")) { var f = apps.querySelector(".m-apps-item"); if (f) f.focus(); }
    });
    document.addEventListener("click", function (e) { if (!apps.contains(e.target)) setApps(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && apps.classList.contains("open")) { setApps(false); appsBtn.focus(); } });
  }

  // ── Edit navigation bar: hide and unhide pages ────────────────────────────
  // Turned on from /personalize (html.nav-edit). Each page in a category then
  // shows a minus to hide it, and hidden pages show, dimmed, with a plus. The
  // server only remembers the list; the sidebar updates in place.
  function navItems() { return Array.prototype.slice.call(document.querySelectorAll(".m-nav-item")); }
  // The pages under a heading: the items after it, skipping its open form.
  function itemsOf(h) {
    var out = [];
    for (var n = h.nextElementSibling; n && (n.classList.contains("m-nav-item") || n.classList.contains("m-group-form")); n = n.nextElementSibling)
      if (n.classList.contains("m-nav-item")) out.push(n);
    return out;
  }
  function paintHeads() {
    document.querySelectorAll(".m-group-h").forEach(function (h) {
      h.classList.toggle("empty", itemsOf(h).every(function (n) { return n.classList.contains("off") && !n.classList.contains("here"); }));
    });
  }
  function setOff(item, off) {
    item.classList.toggle("off", off);
    var t = item.querySelector(".m-link").title, b = item.querySelector(".m-item-tog");
    b.title = (off ? "Show " : "Hide ") + t;
    b.setAttribute("aria-label", (off ? "Show " : "Hide ") + t + " in the sidebar");
    b.querySelector("i").className = "fa-solid fa-" + (off ? "plus" : "minus");
  }
  navItems().forEach(function (item) {
    item.querySelector(".m-item-tog").addEventListener("click", function (e) {
      e.preventDefault();
      var was = item.classList.contains("off");
      setOff(item, !was); paintHeads();
      var list = navItems().filter(function (i) { return i.classList.contains("off"); }).map(function (i) { return i.dataset.href; });
      fetch("/api/nav", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hidden: list }) })
        .then(function (r) { if (!r.ok) throw new Error(); })
        .catch(function () {
          setOff(item, was); paintHeads();
          if (typeof showToast === "function") showToast("Couldn't save the sidebar", "bad");
        });
    });
  });

  // ── Edit navigation bar: rename a category, move pages between them ───────
  // The pen on each heading opens a form under it. Saving sends only what
  // changed; the sidebar then updates in place, each moved page taking its
  // usual place in the new category.
  var heads = Array.prototype.slice.call(document.querySelectorAll(".m-group-h[data-group]"));
  var nameMax = +((document.querySelector(".m-nav-scroll") || {}).dataset || {}).nameMax || 30;
  function label(h) { return h.querySelector(".m-group-l").textContent; }
  function paintHead(h, name) {
    h.querySelector(".m-group-l").textContent = name;
    var b = h.querySelector(".m-group-ed");
    b.title = "Edit " + name;
    b.setAttribute("aria-label", "Rename " + name + " or move its pages");
  }
  function closeForm(focus) {
    var f = document.querySelector(".m-group-form"); if (!f) return;
    var h = f.previousElementSibling, b = h && h.querySelector(".m-group-ed");
    f.remove();
    if (b) { b.setAttribute("aria-expanded", "false"); if (focus) b.focus(); }
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  // Puts an item into a category, before the first page that comes after it.
  function placeIn(h, item) {
    var i = +item.dataset.i, list = itemsOf(h).filter(function (n) { return n !== item; });
    var next = list.filter(function (n) { return +n.dataset.i > i; })[0];
    if (next) next.before(item);
    else (list.length ? list[list.length - 1] : (h.nextElementSibling && h.nextElementSibling.classList.contains("m-group-form") ? h.nextElementSibling : h)).after(item);
  }
  function openForm(h) {
    var key = h.dataset.group, b = h.querySelector(".m-group-ed");
    var f = el("form", "m-group-form");
    f.setAttribute("aria-label", "Edit " + label(h));
    var nameL = el("label", null, "Category name"), input = el("input");
    input.type = "text"; input.maxLength = nameMax; input.value = label(h); input.placeholder = key; input.required = true;
    nameL.appendChild(input); f.appendChild(nameL);
    var moves = el("div", "m-group-moves"), selects = [];
    moves.appendChild(el("span", null, "Pages, and the category each goes in"));
    var items = itemsOf(h);
    if (!items.length) moves.appendChild(el("span", "m-group-none", "No pages here yet. Move one in from another category's pen."));
    items.forEach(function (item) {
      var title = item.querySelector(".m-link").title, row = el("label", "m-group-move"), sel = el("select");
      row.appendChild(el("span", null, title));
      sel.setAttribute("aria-label", "Category for " + title);
      heads.forEach(function (o) { var opt = el("option", null, o === h ? input.value : label(o)); opt.value = o.dataset.group; sel.appendChild(opt); });
      sel.value = key; sel.dataset.href = item.dataset.href;
      row.appendChild(sel); moves.appendChild(row); selects.push(sel);
    });
    input.addEventListener("input", function () {   // keep this category's option in step with its new name
      selects.forEach(function (sel) { Array.prototype.forEach.call(sel.options, function (o) { if (o.value === key) o.textContent = input.value || key; }); });
    });
    f.appendChild(moves);
    var acts = el("div", "m-group-acts"), cancel = el("button", null, "Cancel"), save = el("button", "m-group-save", "Save");
    cancel.type = "button"; save.type = "submit";
    acts.appendChild(cancel); acts.appendChild(save); f.appendChild(acts);
    cancel.addEventListener("click", function () { closeForm(true); });
    f.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeForm(true); } });
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = input.value.trim().slice(0, nameMax);
      if (!name) { input.focus(); return; }
      var body = {}, groups = {}, moved = selects.filter(function (s) { return s.value !== key; });
      if (name !== label(h)) { body.names = {}; body.names[key] = name; }
      moved.forEach(function (s) { groups[s.dataset.href] = s.value; });
      if (moved.length) body.groups = groups;
      if (!body.names && !body.groups) { closeForm(true); return; }
      save.disabled = true;
      fetch("/api/nav", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
        .then(function (res) {
          closeForm(true);
          if (body.names) paintHead(h, (res.names && res.names[key]) || key);
          moved.forEach(function (s) {
            var item = document.querySelector('.m-nav-item[data-href="' + s.dataset.href + '"]');
            var to = heads.filter(function (o) { return o.dataset.group === s.value; })[0];
            if (item && to) placeIn(to, item);
          });
          paintHeads();
        })
        .catch(function () {
          save.disabled = false;
          if (typeof showToast === "function") showToast("Couldn't save the sidebar", "bad");
        });
    });
    h.after(f);
    b.setAttribute("aria-expanded", "true");
    input.focus(); input.select();
  }
  heads.forEach(function (h) {
    h.querySelector(".m-group-ed").addEventListener("click", function (e) {
      e.preventDefault();
      var open = h.nextElementSibling && h.nextElementSibling.classList.contains("m-group-form");
      closeForm(false);
      if (!open) openForm(h);
    });
  });

  window.openhlNavEdit = function (on) {
    if (!on) closeForm(false);
    root.classList.toggle("nav-edit", !!on);
    try { localStorage.setItem("openhl-nav-edit", on ? "1" : "0"); } catch (e) {}
    if (on && phone.matches) root.classList.add("nav-open");   // show the drawer you are editing
  };

  // ── Status strip ───────────────────────────────────────────────────────────
  function set(id, text, state) {
    var el = $(id); if (!el) return;
    if (el.textContent !== text) {
      if (el.dataset.seen) { el.classList.remove("changed"); void el.offsetWidth; el.classList.add("changed"); }
      el.textContent = text;
    }
    el.dataset.seen = "1";
    var cell = el.closest(".m-cell");
    if (cell) { cell.classList.toggle("warn", state === "warn"); cell.classList.toggle("fault", state === "fault"); }
  }
  function level(pct, warn, fault) { return pct >= fault ? "fault" : pct >= warn ? "warn" : ""; }
  function relTime(ms) {
    var s = Math.round((ms - Date.now()) / 1000), a = Math.abs(s);
    var t = a < 60 ? "now" : a < 3600 ? Math.round(a / 60) + " min" : a < 86400 ? Math.round(a / 3600) + " h" : Math.round(a / 86400) + " d";
    return t === "now" ? t : (s >= 0 ? "in " + t : t + " ago");
  }
  function clip(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  // A desktop notification when the newest voicemail or text changes while a
  // page is open. The first pulse only records where things stand, and the tag
  // lets the OS collapse the copies that several open tabs would each raise.
  var newest = {};
  function notifyNewest(kind, latest, seen, title, body, href) {
    var sid = latest ? latest.sid : null;
    if (kind in newest && sid && sid !== newest[kind] && !seen) {
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          var n = new Notification(title, { body: body, tag: "openhl-" + kind + "-" + sid });
          n.onclick = function () { try { window.focus(); } catch (e) {} location.href = href; n.close(); };
        }
      } catch (e) {}
    }
    newest[kind] = sid;
  }
  function badgeCount(id, n) {
    var b = $(id);
    if (b) { b.textContent = n; b.classList.toggle("on", n > 0); }
  }

  var last = null;
  function paint(p) {
    last = p;
    set("pulse-cpu", Math.round(p.host.cpu) + "%", level(p.host.cpu, 75, 92));
    set("pulse-mem", Math.round(p.host.mem) + "%", level(p.host.mem, 80, 93));
    var down = p.nodes.total - p.nodes.online;
    set("pulse-nodes", p.nodes.total ? p.nodes.online + "/" + p.nodes.total : "none", down > 0 ? "fault" : "");
    set("pulse-vms", p.vms.running + " running", "");
    set("pulse-mail", p.mail.unopened ? p.mail.unopened + " new" : "clear", "");
    set("pulse-next", p.next ? relTime(p.next.at) + "  " + clip(p.next.title, 28) : "nothing set", "");
    var badge = $("nav-count-mail");
    if (badge) { badge.textContent = p.mail.unopened; badge.classList.toggle("on", p.mail.unopened > 0); }
    var vm = p.voicemail || { unheard: 0, latest: null };
    badgeCount("nav-count-voicemail", vm.unheard);
    notifyNewest("voicemail", vm.latest, vm.latest && vm.latest.heard, "New voicemail",
      "From " + (vm.latest && vm.latest.from || "unknown caller"), "/voicemail");
    var tx = p.texts || { unread: 0, latest: null };
    badgeCount("nav-count-texts", tx.unread);
    notifyNewest("texts", tx.latest, tx.latest && tx.latest.read, "Text from " + (tx.latest && tx.latest.from || "unknown sender"),
      tx.latest && tx.latest.body || "", "/texts");
    var next = document.querySelector('[data-cell="next"]'); if (next && p.next) next.title = p.next.title;
    window.dispatchEvent(new CustomEvent("openhl:pulse", { detail: p }));
  }
  function poll() {
    if (document.hidden) return;
    fetch("/api/pulse").then(function (r) { if (r.status === 401) { location.href = "/login"; throw 0; } return r.json(); })
      .then(paint).catch(function () {});
  }
  function clock() {
    var d = new Date();
    set("pulse-clock", d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) + "  " +
      d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }), "");
    if (last && last.next) set("pulse-next", relTime(last.next.at) + "  " + clip(last.next.title, 28), "");
  }
  if ($("m-pulse")) {
    poll(); clock();
    setInterval(poll, 10000); setInterval(clock, 15000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) poll(); });
    window.openhlPulse = { refresh: poll, last: function () { return last; } };
  }
})();
