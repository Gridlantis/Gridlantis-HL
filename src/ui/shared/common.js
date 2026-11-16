/* Shared browser helpers for VM Lab and Containers (plain script, exposes window.VL). */
(function () {
  "use strict";

  // ── Which machine VM Lab is driving ───────────────────────────────────────
  // VM Lab can point at this machine ("local") or at a second device running
  // the VM Lab agent. Rather than thread a host id through a hundred call
  // sites, the page sets it once and every VM Lab URL picks it up here.
  let VM_HOST = null;
  function setVmHost(id) { VM_HOST = id && id !== "local" ? id : null; }
  function withHost(url) {
    if (!VM_HOST || !/^\/(api\/)?vmlab(\/|$)/.test(url)) return url;
    return url + (url.indexOf("?") === -1 ? "?" : "&") + "host=" + encodeURIComponent(VM_HOST);
  }

  async function api(method, url, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    const r = await fetch(withHost(url), opts);
    if (r.status === 401) { location.href = "/login"; throw new Error("signed out"); }
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!r.ok) {
      const err = new Error((data && data.error) || ("HTTP " + r.status));
      err.status = r.status; err.data = data;
      throw err;
    }
    return data;
  }

  // h('div', {class:'x', onclick: fn}, child, 'text', [children])
  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
        else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
        else if (k === "html") el.innerHTML = v;
        else if (k === "value") el.value = v;
        else if (k === "checked" || k === "selected" || k === "disabled" || k === "hidden") el[k] = !!v;
        else el.setAttribute(k, v === true ? "" : v);
      }
    }
    for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(x => append(el, x)); return; }
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  const icon = cls => h("i", { class: cls });

  function fmtBytes(b, digits) {
    if (b === null || b === undefined || isNaN(b)) return "—";
    const u = ["B", "KB", "MB", "GB", "TB"];
    let i = 0; b = Number(b);
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return (i === 0 ? b : b.toFixed(digits === undefined ? (b < 10 ? 1 : 0) : digits)) + " " + u[i];
  }
  const fmtRate = b => fmtBytes(b) + "/s";
  function fmtAgo(iso) {
    if (!iso) return "—";
    const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.round(s / 60) + "m ago";
    if (s < 86400) return Math.round(s / 3600) + "h ago";
    return new Date(iso).toLocaleDateString();
  }
  function fmtDuration(sec) {
    sec = Math.max(0, Math.round(sec));
    const d = Math.floor(sec / 86400), hh = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
    return (d ? d + "d " : "") + (d || hh ? hh + "h " : "") + m + "m";
  }
  function fmtDate(iso) { return iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—"; }

  function toast(msg, type) {
    if (typeof window.showToast === "function") window.showToast(msg, type === "bad" ? "bad" : "ok");
  }

  // Clipboard that works in the desktop app, on HTTPS, and (with a user
  // gesture) on plain HTTP.
  const desktop = window.openhlDesktop || null;
  async function writeClipboard(text) {
    try { if (desktop && desktop.clipboard) { await desktop.clipboard.writeText(text); return true; } } catch (e) {}
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch (e) {}
    try {
      const active = document.activeElement;
      const ta = h("textarea", { style: { position: "fixed", left: "-9999px", top: "0" } });
      ta.value = text; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (active && active.focus) active.focus();
      return ok;
    } catch (e) { return false; }
  }
  async function readClipboard() {
    try { if (desktop && desktop.clipboard) return await desktop.clipboard.readText(); } catch (e) {}
    try { if (navigator.clipboard && window.isSecureContext && navigator.clipboard.readText) return await navigator.clipboard.readText(); } catch (e) {}
    return null;
  }
  const clipboardMode = () => desktop && desktop.clipboard ? "desktop" : (window.isSecureContext && navigator.clipboard ? "secure" : "basic");

  // Live updates pushed by the server.
  // `event` is the SSE event name the server broadcasts under: "vmlab" for VM
  // Lab, "docker" for Containers. The page's shared stream (openhlEvents, in the
  // page head) reconnects by itself.
  function onServerEvents(fn, event) {
    openhlEvents().addEventListener(event || "vmlab", e => { let d = {}; try { d = JSON.parse(e.data); } catch (x) {} fn(d); });
  }

  const OS_ICON = { windows: "fa-brands fa-windows", linux: "fa-brands fa-linux", android: "fa-brands fa-android", other: "fa-solid fa-microchip" };
  const DISTRO_ICON = { ubuntu: "fa-brands fa-ubuntu", fedora: "fa-brands fa-fedora", debian: "fa-brands fa-debian", rhel: "fa-brands fa-redhat",
    alpine: "fa-solid fa-mountain", kali: "fa-solid fa-dragon", windows: "fa-brands fa-windows", android: "fa-brands fa-android" };

  window.VL = { api, h, icon, fmtBytes, fmtRate, fmtAgo, fmtDuration, fmtDate, toast, writeClipboard, readClipboard, clipboardMode,
    onServerEvents, setVmHost, withHost, vmHost: () => VM_HOST, OS_ICON, DISTRO_ICON, desktop };
})();
