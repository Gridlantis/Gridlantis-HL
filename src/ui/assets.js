const { esc } = require("../helpers");
const { GROUP_NAME_MAX, hiddenPages, navGroupNames, navGroups } = require("../profile");

// ─── OPENHL DESIGN SYSTEM · "control room" ────────────────────────────────────
// Calm operations console for a home server. Rules the whole UI follows:
//   • colour carries meaning: --ok / --warn / --fault are status, --accent is
//     "you can act on this". Nothing is coloured for decoration.
//   • one family, IBM Plex: Sans for text and numbers (tabular), Sans Condensed
//     for titles and the status strip, Mono only for code, IDs and logs.
//   • flat surfaces separated by 1px lines; panels 10px radius, controls 6px.
//   • motion only when something changes (a status value, an opened panel).
// Themes are variations of the same system, never different visual languages.
// The live-update stream, shared. Pages call openhlEvents() where they used to
// call new EventSource('/api/events'); it returns an object with the same
// addEventListener(name, fn) and hands listeners { type, data } with data the
// same JSON string. Behind it every tab in the browser shares ONE connection:
// browsers allow six per server over HTTP/1.1 and a stream holds one for as long
// as its page is open, so a stream per page (or two) let a few tabs use every
// slot and page loads queued behind them. In order of preference:
//   1. a SharedWorker (ui/events-worker.js) holding the stream for all tabs;
//   2. one leader tab holding it, chosen with a Web Lock, relaying over a
//      BroadcastChannel (browsers without SharedWorker; needs HTTPS or localhost);
//   3. one stream for this page alone.
// Nothing connects until the first listener is added. Besides the server's
// events, listeners can take "connected" and "error" as an EventSource gives
// them; a "connected" listener added while the stream is up is told at once.
const EVENTS_JS = `<script>(function(){
  if (window.openhlEvents) return;
  var L = {}, started = false, live = false, URL_ = '/api/events?wrap=1';
  function emit(t, d){
    if (t === 'connected') live = true; else if (t === 'error') live = false;
    var fs = L[t]; if (!fs) return;
    var ev = { type: t, data: d == null ? '{}' : d };
    fs.slice().forEach(function(fn){ try { fn(ev); } catch(e){ setTimeout(function(){ throw e; }); } });
  }
  // This page's own stream; out(name, data) gets every event.
  function stream(out){
    var es, retry = 1000;
    (function open(){
      es = new EventSource(URL_);
      es.onmessage = function(e){
        var i = e.data.indexOf('\\n'); if (i < 0) return;
        var t = e.data.slice(0, i); if (t === 'connected') retry = 1000;
        out(t, e.data.slice(i + 1));
      };
      es.onerror = function(){
        out('error', '{}');
        if (es.readyState === 2) { setTimeout(open, retry); retry = Math.min(retry * 2, 30000); }
      };
    })();
  }
  function leader(){
    var bc = new BroadcastChannel('openhl-events'), lead = false, live = false;
    bc.onmessage = function(e){
      var m = e.data || {};
      if (m.q === 'state') { if (lead && live) bc.postMessage({ t: 'connected', d: '{}' }); return; }
      if (!lead) emit(m.t, m.d);
    };
    bc.postMessage({ q: 'state' });
    navigator.locks.request('openhl-events', function(){
      lead = true;
      stream(function(t, d){
        if (t === 'connected') live = true; else if (t === 'error') live = false;
        emit(t, d); bc.postMessage({ t: t, d: d });
      });
      return new Promise(function(){});   // hold the lock for the life of the page
    });
  }
  function local(){
    if (window.BroadcastChannel && navigator.locks) { try { return leader(); } catch(e){} }
    if (window.EventSource) stream(emit);
  }
  function worker(){
    var w = new SharedWorker('/ui/events-worker.js', { name: 'openhl-events' }), port = w.port, fell = false;
    function fallback(){ if (fell) return; fell = true; try { port.close(); } catch(e){} local(); }
    w.onerror = fallback;
    port.onmessage = function(e){ var m = e.data || {}; if (m.t === 'unsupported') fallback(); else if (!fell) emit(m.t, m.d); };
    port.start();
    addEventListener('pagehide', function(){ if (!fell) port.postMessage('bye'); });
    addEventListener('pageshow', function(e){ if (e.persisted && !fell) port.postMessage('hello'); });
  }
  function start(){
    if (window.SharedWorker) { try { return worker(); } catch(e){} }
    local();
  }
  var bus = {
    addEventListener: function(t, fn){
      (L[t] = L[t] || []).push(fn);
      if (!started) { started = true; start(); }
      // A page's own EventSource would announce "connected" to it; with the
      // stream shared it may have opened before this listener existed.
      else if (t === 'connected' && live) setTimeout(function(){ if (live) fn({ type: 'connected', data: '{}' }); });
    },
    removeEventListener: function(t, fn){ var fs = L[t]; if (fs) L[t] = fs.filter(function(f){ return f !== fn; }); },
  };
  window.openhlEvents = function(){ return bus; };
})();</script>`;

// The head every page shares: fonts, icons (both served by Open HL, see
// routes/assets.js; bump ?v= when the files change) and the shared event stream.
// Small helpers every page script can use. esc() is for text going into HTML,
// attributes included, so it escapes quotes too. timeAgo() takes ms or an ISO
// string and reads "just now", "5 min ago", "in 3 h", "2 d ago", then a date.
const HELPERS_JS = `<script>
function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function timeAgo(t){
  var ms = typeof t === 'number' ? t : Date.parse(t);
  if (t == null || t === '' || isNaN(ms)) return '';
  var s = Math.round((ms - Date.now()) / 1000), a = Math.abs(s), v;
  if (a < 60) return 'just now';
  if (a < 3600) v = Math.round(a / 60) + ' min';
  else if (a < 86400) v = Math.round(a / 3600) + ' h';
  else if (a < 86400 * 14) v = Math.round(a / 86400) + ' d';
  else return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return s >= 0 ? 'in ' + v : v + ' ago';
}
</script>`;
const FONT = `<link rel="stylesheet" href="/ui/vendor/fonts/fonts.css?v=2"><link rel="stylesheet" href="/ui/vendor/fontawesome/css/all.min.css?v=6.5.1">` + HELPERS_JS + EVENTS_JS;
// The Open HL monogram: an upright L with a sideways H over its upper right.
// LOGO_SVG is the bare mark (sidebar); the favicon puts it on the app tile.
const LOGO_PATHS = "<path d='M15 22V49H48' fill='none' stroke='%COLOR_L%' stroke-width='6' stroke-linecap='round' stroke-linejoin='round'/>" +
  "<path d='M24 14H49M24 32H49M36.5 14V32' fill='none' stroke='%COLOR_H%' stroke-width='6' stroke-linecap='round' stroke-linejoin='round'/>";
const LOGO_SVG = `<svg class="m-logo" viewBox="8 8 48 48" aria-hidden="true">${LOGO_PATHS.replace("%COLOR_L%", "currentColor").replace("%COLOR_H%", "var(--accent)")}</svg>`;
const FAVICON = `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='%23151B23'/>${LOGO_PATHS.replace("%COLOR_L%", "%23E4E9EF").replace("%COLOR_H%", "%2362A8E5")}</svg>">`;

// Every theme defines the same tokens. The legacy names at the end keep pages
// that predate the design system working while they are migrated.
// Categorical chart colours (validated for colour-vision deficiency on the
// slate and white surfaces). Assigned in this fixed order, never cycled.
const SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
const SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
function theme(label, dark, v) {
  const series = {};
  (dark ? SERIES_DARK : SERIES_LIGHT).forEach((c, i) => { series["series-" + (i + 1)] = c; });
  const vars = Object.assign({}, series, v, {
    surface2: v.raised, border: v.line, accent2: v.chart2,
    green: v.ok, yellow: v.warn, red: v.fault,
    "header-bg": v["bg-nav"], "grid-line": "transparent",
    "nav-active-bg": v["accent-soft"], "nav-active-border": v.accent, "nav-active-text": v.accent,
    "nav-hover-border": v.accent, "nav-hover-text": v.text,
  }, {
    // The sidebar is one solid colour per theme with light ink on it.
    nav: v.nav, "nav-accent": v["nav-accent"] || v.accent, "nav-accent-ink": v.nav,
    "nav-icon": v["nav-icon"] || v["nav-accent"] || v.accent,
    "nav-ink": "#FFFFFF", "nav-ink-2": "rgba(255,255,255,.86)", "nav-muted": v["nav-muted"] || "rgba(255,255,255,.64)",
    "nav-line": "rgba(255,255,255,.14)", "nav-hover": "rgba(255,255,255,.10)",
  });
  return { label, dark, dot: v.accent, vars };
}
const THEMES = {
  slate: theme("Slate", true, {
    nav: "#1E3A5F",
    bg: "#151B23", "bg-nav": "#121820", surface: "#1A222C", raised: "#212B37", field: "#121820",
    line: "#2C3846", "line-strong": "#3B4959", text: "#E4E9EF", "text-2": "#C3CCD6", muted: "#8D9AAA",
    accent: "#62A8E5", "accent-ink": "#0D1620", "accent-soft": "rgba(98,168,229,.14)",
    ok: "#48B882", warn: "#E2A640", fault: "#E4605A", chart2: "#A58BE8" }),
  graphite: theme("Graphite", true, {
    nav: "#2E3136",
    bg: "#17181A", "bg-nav": "#141517", surface: "#1D1E21", raised: "#25272B", field: "#141517",
    line: "#323438", "line-strong": "#43464B", text: "#E9E8E5", "text-2": "#CAC8C3", muted: "#9A9A96",
    accent: "#8DB4E2", "accent-ink": "#111418", "accent-soft": "rgba(141,180,226,.13)",
    ok: "#6DBE8A", warn: "#D9A94A", fault: "#E06B61", chart2: "#C49BD8" }),
  nightshift: theme("Night shift", true, {
    nav: "#5A3A1E", "nav-accent": "#F0C886",
    bg: "#1A1613", "bg-nav": "#16120F", surface: "#201B17", raised: "#29221D", field: "#16120F",
    line: "#3A3029", "line-strong": "#4C4037", text: "#EDE2D3", "text-2": "#D2C4B2", muted: "#A69580",
    accent: "#D6B06E", "accent-ink": "#1A140C", "accent-soft": "rgba(214,176,110,.14)",
    ok: "#8FBF7F", warn: "#EF9F4A", fault: "#E3685E", chart2: "#B99BD1" }),
  phosphor: theme("Phosphor", true, {
    nav: "#0F4A38", "nav-accent": "#7EE8C4",
    bg: "#0F1613", "bg-nav": "#0C1310", surface: "#141D19", raised: "#1A2620", field: "#0C1310",
    line: "#263630", "line-strong": "#34483F", text: "#D9EEE3", "text-2": "#B7D3C5", muted: "#86A395",
    accent: "#62D5B0", "accent-ink": "#07130E", "accent-soft": "rgba(98,213,176,.13)",
    ok: "#8ED36B", warn: "#E3C04F", fault: "#EA6A5F", chart2: "#7FB2F0" }),
  amethyst: theme("Amethyst", true, {
    nav: "#3E2766",
    bg: "#19151F", "bg-nav": "#15111B", surface: "#1F1A27", raised: "#282131", field: "#15111B",
    line: "#382E44", "line-strong": "#4A3E58", text: "#ECE6F3", "text-2": "#CFC5DC", muted: "#A094B0",
    accent: "#B69CF0", "accent-ink": "#150F20", "accent-soft": "rgba(182,156,240,.14)",
    ok: "#6FC48F", warn: "#E2AE4C", fault: "#EC6B72", chart2: "#F08DC0" }),
  blossom: theme("Blossom", true, {
    nav: "#5E2342",
    bg: "#1E1519", "bg-nav": "#1A1115", surface: "#241A1F", raised: "#2E2128", field: "#1A1115",
    line: "#42303A", "line-strong": "#563F4B", text: "#F3E6EC", "text-2": "#DCC6D0", muted: "#B095A2",
    accent: "#F08DB8", "accent-ink": "#22101A", "accent-soft": "rgba(240,141,184,.14)",
    ok: "#79C894", warn: "#E8B055", fault: "#F07A66", chart2: "#A99CF0" }),
  ocean: theme("Ocean", true, {
    nav: "#0B5A84", "nav-accent": "#5FD3E8",
    bg: "#0F1820", "bg-nav": "#0C141B", surface: "#132029", raised: "#1A2933", field: "#0C141B",
    line: "#253845", "line-strong": "#334A59", text: "#DDEBF2", "text-2": "#BCD2DD", muted: "#87A2B0",
    accent: "#4FC3D9", "accent-ink": "#061419", "accent-soft": "rgba(79,195,217,.14)",
    ok: "#6CCB8E", warn: "#E5B04E", fault: "#EC6E66", chart2: "#A99CF0" }),
  contrast: theme("High contrast", true, {
    nav: "#000000", "nav-muted": "rgba(255,255,255,.82)",
    bg: "#090C10", "bg-nav": "#06080B", surface: "#10151B", raised: "#19202A", field: "#06080B",
    line: "#4E5B6B", "line-strong": "#7B8898", text: "#FFFFFF", "text-2": "#E8EDF2", muted: "#C3CBD4",
    accent: "#8CCBFF", "accent-ink": "#04101C", "accent-soft": "rgba(140,203,255,.18)",
    ok: "#5BE39A", warn: "#FFC24D", fault: "#FF7A70", chart2: "#C6A8FF" }),
  daylight: theme("Daylight", false, {
    nav: "#1D6BB5", "nav-accent": "#BFE0FF",
    bg: "#EDF0F3", "bg-nav": "#E4E8ED", surface: "#FFFFFF", raised: "#F3F5F8", field: "#FFFFFF",
    line: "#D3DAE2", "line-strong": "#B9C3CE", text: "#16202B", "text-2": "#2F3B48", muted: "#5B6877",
    accent: "#1D6BB5", "accent-ink": "#FFFFFF", "accent-soft": "rgba(29,107,181,.10)",
    ok: "#1B8550", warn: "#A8650A", fault: "#C3372F", chart2: "#6E4FC9" }),
  lavender: theme("Lavender", false, {
    nav: "#5B3BA8", "nav-accent": "#D8C8FF",
    bg: "#F1EEF6", "bg-nav": "#E9E4F1", surface: "#FFFFFF", raised: "#F6F3FA", field: "#FFFFFF",
    line: "#DBD3E6", "line-strong": "#C3B8D3", text: "#1E1828", "text-2": "#382F45", muted: "#645877",
    accent: "#6A45C2", "accent-ink": "#FFFFFF", "accent-soft": "rgba(106,69,194,.10)",
    ok: "#1B8550", warn: "#A8650A", fault: "#C3372F", chart2: "#B4366F" }),
  petal: theme("Petal", false, {
    nav: "#A12E62", "nav-accent": "#FFC2DA",
    bg: "#F7EEF2", "bg-nav": "#F1E4EA", surface: "#FFFFFF", raised: "#FBF4F7", field: "#FFFFFF",
    line: "#E8D3DD", "line-strong": "#D6B8C6", text: "#2A1820", "text-2": "#46303A", muted: "#765966",
    accent: "#B8346E", "accent-ink": "#FFFFFF", "accent-soft": "rgba(184,52,110,.10)",
    ok: "#1B8550", warn: "#A8650A", fault: "#C0392B", chart2: "#6E4FC9" }),
  sand: theme("Sand", false, {
    nav: "#8A5A1F", "nav-accent": "#F6D49C",
    bg: "#F3EFE8", "bg-nav": "#ECE6DC", surface: "#FFFDF9", raised: "#F8F4EE", field: "#FFFDF9",
    line: "#DFD6C8", "line-strong": "#C9BCA9", text: "#241D14", "text-2": "#3E3428", muted: "#6B5E4D",
    accent: "#9A5B12", "accent-ink": "#FFFFFF", "accent-soft": "rgba(154,91,18,.10)",
    ok: "#1B7A48", warn: "#A8650A", fault: "#C3372F", chart2: "#6E4FC9" }),
};
// Names from the old theme picker, so a saved choice lands somewhere sensible.
const LEGACY_THEMES = { void: "slate", midnight: "slate", glass: "slate", tech: "slate", forest: "phosphor", hacker: "phosphor",
  crimson: "blossom", rose: "blossom", amber: "nightshift", paper: "daylight", latte: "daylight", neo: "daylight" };

const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  ${Object.entries(THEMES.slate.vars).map(([k, v]) => "--" + k + ":" + v + ";").join("")}
  --font-ui:'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif;
  --font-display:'IBM Plex Sans Condensed','IBM Plex Sans',system-ui,sans-serif;
  --font-brand:'Dendritic Voltage','IBM Plex Sans Condensed',system-ui,sans-serif;
  --font-nav:'Oxanium','IBM Plex Sans',system-ui,sans-serif;
  --font-mono:'IBM Plex Mono',ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace;
  --r-panel:10px;--r-ctl:6px;
  --nav-w:232px;--pulse-h:44px;--app-h:100vh;
  color-scheme:dark;
}
html{-webkit-text-size-adjust:100%;}
body{background:var(--bg);color:var(--text);font-family:var(--font-ui);font-size:14px;line-height:1.5;
  font-variant-numeric:tabular-nums;min-height:100vh;-webkit-font-smoothing:antialiased;}
.grid{display:none;}
.wrap{position:relative;z-index:1;max-width:960px;margin:0 auto;padding:28px 24px;}
button,a,[role=button],summary{cursor:pointer;}
button,input,select,textarea{font:inherit;color:inherit;}
button:active{opacity:.8;}
a,button{-webkit-tap-highlight-color:transparent;}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
code,kbd,pre,samp{font-family:var(--font-mono);}
::selection{background:var(--accent-soft);}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;}}
@media(max-width:700px){
  .notes-layout,.ai-layout{grid-template-columns:1fr!important;}
  .home-grid{grid-template-columns:1fr!important;}
}

/* ── Components ─────────────────────────────────────────────────────────── */
.m-page{max-width:1440px;margin:0 auto;padding:28px 32px 56px;}
.m-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px 24px;flex-wrap:wrap;margin-bottom:24px;}
.m-title{font:600 30px/1.15 var(--font-display);letter-spacing:-.005em;}
.m-sub{color:var(--muted);font-size:14px;margin-top:4px;}
.m-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.m-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:16px;}
.m-panel{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-panel);min-width:0;}
.m-panel-h{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px 12px;}
.m-panel-t{font:600 16px/1.2 var(--font-display);color:var(--text);}
.m-panel-t a{color:inherit;text-decoration:none;}
.m-panel-t a:hover{color:var(--accent);}
.m-panel-meta{color:var(--muted);font-size:13px;}
.m-panel-b{padding:0 16px 16px;}
.m-list{list-style:none;}
.m-item{display:flex;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid var(--line);color:var(--text);text-decoration:none;min-width:0;}
a.m-item:hover,button.m-item:hover{background:var(--raised);}
button.m-item{width:100%;background:none;border-left:0;border-right:0;border-bottom:0;text-align:left;}
.m-item-main{flex:1;min-width:0;}
.m-item-t{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.m-item-s{display:block;color:var(--muted);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.m-item-end{color:var(--muted);font-size:13px;white-space:nowrap;flex-shrink:0;}
.m-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:34px;padding:0 14px;border-radius:var(--r-ctl);
  border:1px solid var(--line);background:var(--raised);color:var(--text);font-size:13.5px;font-weight:500;text-decoration:none;white-space:nowrap;}
.m-btn:hover{border-color:var(--line-strong);}
.m-btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);}
.m-btn.primary:hover{filter:brightness(1.08);}
.m-btn.ghost{background:transparent;border-color:transparent;color:var(--text-2);}
.m-btn.ghost:hover{background:var(--raised);color:var(--text);}
.m-btn.danger{color:var(--fault);}
.m-btn.icon{width:34px;padding:0;}
.m-btn:disabled{opacity:.5;pointer-events:none;}
.m-input{height:36px;width:100%;background:var(--field);border:1px solid var(--line);border-radius:var(--r-ctl);padding:0 12px;color:var(--text);outline:none;}
textarea.m-input{height:auto;padding:9px 12px;line-height:1.5;}
.m-input::placeholder{color:var(--muted);}
.m-input:focus{border-color:var(--accent);}
.m-label{display:block;font-size:13px;font-weight:500;color:var(--text-2);margin-bottom:6px;}
.m-dot{width:8px;height:8px;border-radius:50%;background:var(--muted);flex-shrink:0;display:inline-block;}
.m-dot.ok{background:var(--ok);} .m-dot.warn{background:var(--warn);} .m-dot.fault{background:var(--fault);} .m-dot.info{background:var(--accent);}
.m-badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:500;line-height:1;padding:4px 8px;border-radius:99px;
  background:var(--raised);color:var(--text-2);border:1px solid var(--line);white-space:nowrap;}
.m-badge.ok{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 40%,var(--line));}
.m-badge.warn{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 40%,var(--line));}
.m-badge.fault{color:var(--fault);border-color:color-mix(in srgb,var(--fault) 40%,var(--line));}
.m-badge.info{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 40%,var(--line));}
.m-meter{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;align-items:baseline;}
.m-meter-l{color:var(--text-2);font-size:13px;}
.m-meter-v{text-align:right;font-weight:500;}
.m-meter-t{grid-column:1/-1;height:6px;border-radius:3px;background:var(--raised);overflow:hidden;}
.m-meter-t i{display:block;height:100%;background:var(--accent);border-radius:3px;transition:width .6s ease;}
.m-meter-t i.warn{background:var(--warn);} .m-meter-t i.fault{background:var(--fault);}
.m-empty{padding:20px 16px;color:var(--muted);border-top:1px solid var(--line);}
.m-kbd{font-family:var(--font-mono);font-size:12px;border:1px solid var(--line);border-bottom-width:2px;border-radius:4px;padding:0 5px;color:var(--text-2);}
.m-modal{position:fixed;inset:0;z-index:400;background:rgba(5,8,12,.6);display:none;align-items:flex-start;justify-content:center;padding:10vh 16px 16px;}
.m-modal.on{display:flex;}
.m-modal-box{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-panel);width:100%;max-width:440px;box-shadow:0 24px 60px rgba(0,0,0,.45);}
.m-modal-h{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--line);font:600 17px var(--font-display);}
.m-modal-b{padding:16px;display:flex;flex-direction:column;gap:14px;}
.m-modal-f{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--line);}
@media(max-width:760px){.m-page{padding:20px 16px 48px;}.m-title{font-size:25px;}.m-grid{gap:12px;}}
`;

const NAV_CSS = `
/* ── Shell: labelled sidebar + live status strip ─────────────────────────── */
body{padding-left:var(--nav-w);padding-top:var(--pulse-h);}
:root{--app-h:calc(100vh - var(--pulse-h));}
html.nav-rail{--nav-w:64px;}
/* Hidden: the sidebar is gone and pages take the full width; the menu button in
   the status strip brings it back. */
html.nav-hidden{--nav-w:0px;}
html.nav-hidden .m-nav{transform:translateX(-100%);visibility:hidden;}
html.nav-hidden .m-cell.menu{display:flex;}
.m-nav{position:fixed;top:0;left:0;bottom:0;width:var(--nav-w);z-index:60;background:var(--nav);color:var(--nav-ink);
  display:flex;flex-direction:column;}
.m-brand{height:var(--pulse-h);flex-shrink:0;display:flex;align-items:center;gap:10px;padding:0 18px;
  text-decoration:none;color:var(--nav-ink);}
.m-brand-name{font:400 21px/1 var(--font-brand);letter-spacing:.02em;}
.m-logo{width:26px;height:26px;flex-shrink:0;color:var(--nav-ink);}
.m-logo path{stroke:currentColor;} .m-logo path+path{stroke:var(--nav-accent);}
.m-nav-scroll{flex:1;overflow-y:auto;overflow-x:hidden;padding:8px 10px 12px;scrollbar-width:thin;}
.m-group-h{font:500 12.5px/1 var(--font-nav);color:var(--nav-muted);padding:16px 10px 8px;margin:0 0 4px;border-bottom:1px solid var(--nav-line);}
/* Pages hidden from the sidebar. Turning on "Edit navigation bar" on
   /personalize (html.nav-edit) shows them again, dimmed, with a minus on each
   shown page and a plus on each hidden one. The page you are on stays listed. */
.m-nav-item{position:relative;}
.m-nav-item.off:not(.here){display:none;}
.m-nav-item.off .m-link{opacity:.5;}
.m-group-h.empty{display:none;}
.m-item-tog{display:none;position:absolute;right:6px;top:50%;transform:translateY(-50%);width:22px;height:22px;border-radius:50%;
  border:1.5px solid rgba(255,255,255,.5);background:var(--nav);color:var(--nav-ink);font-size:10px;cursor:pointer;
  align-items:center;justify-content:center;padding:0;z-index:1;}
.m-item-tog:hover,.m-item-tog:focus-visible{background:var(--nav-ink);color:var(--nav);border-color:var(--nav-ink);}
html.nav-edit .m-nav-item.off{display:block;}
html.nav-edit .m-group-h.empty{display:block;}
html.nav-edit .m-item-tog{display:flex;}
html.nav-edit .m-nav-item .m-link{padding-right:36px;}
html.nav-edit .m-nav-item .m-count{display:none;}
/* Each heading's pen (edit mode only) opens a small form under it: rename the
   category and move its pages to another one. */
.m-group-h{display:flex;align-items:center;gap:8px;}
.m-group-l{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.m-group-ed{display:none;width:22px;height:22px;margin:-6px 6px -6px 0;border-radius:50%;border:1.5px solid rgba(255,255,255,.5);background:var(--nav);
  color:var(--nav-ink);font-size:9px;cursor:pointer;align-items:center;justify-content:center;padding:0;flex-shrink:0;}
.m-group-ed:hover,.m-group-ed:focus-visible,.m-group-ed[aria-expanded="true"]{background:var(--nav-ink);color:var(--nav);border-color:var(--nav-ink);}
html.nav-edit .m-group-ed{display:flex;}
.m-group-form{margin:4px 0 10px;padding:10px;border-radius:var(--r-ctl);background:var(--nav-hover);display:flex;flex-direction:column;gap:8px;
  font:400 12.5px/1.3 var(--font-nav);color:var(--nav-ink-2);}
.m-group-form label{display:flex;flex-direction:column;gap:4px;color:var(--nav-muted);text-align:left;}
.m-group-form input,.m-group-form select{font:inherit;color:var(--nav-ink);background:var(--nav);border:1px solid rgba(255,255,255,.28);
  border-radius:var(--r-ctl);height:28px;padding:0 8px;min-width:0;}
.m-group-form input:focus,.m-group-form select:focus{outline:2px solid var(--nav-accent);outline-offset:-1px;}
.m-group-moves{display:flex;flex-direction:column;gap:6px;}
.m-group-form .m-group-move{display:grid;flex-direction:row;text-align:left;grid-template-columns:1fr minmax(0,1.1fr);align-items:center;gap:8px;color:var(--nav-ink-2);}
.m-group-move span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.m-group-none{color:var(--nav-muted);font-style:italic;}
.m-group-acts{display:flex;justify-content:flex-end;gap:6px;}
.m-group-acts button{font:500 12.5px/1 var(--font-nav);height:28px;padding:0 12px;border-radius:var(--r-ctl);cursor:pointer;
  border:1px solid rgba(255,255,255,.28);background:none;color:var(--nav-ink);}
.m-group-acts .m-group-save{background:var(--nav-ink);color:var(--nav);border-color:var(--nav-ink);}
.m-group-acts button:disabled{opacity:.5;cursor:default;}
.m-link,.m-foot-btn,.m-apps-item{font-family:var(--font-nav);}
.m-link{display:flex;align-items:center;gap:12px;height:36px;padding:0 10px;border-radius:var(--r-ctl);color:var(--nav-ink-2);
  text-decoration:none;font-weight:500;position:relative;white-space:nowrap;}
/* Every page icon sits in an empty ring; the selected page's ring fills with the accent. */
.m-link svg,.m-link i{width:28px;height:28px;margin:0 -5px;padding:5px;border-radius:50%;font-size:14px;flex-shrink:0;
  color:var(--nav-icon);border:1.5px solid rgba(255,255,255,.32);background:transparent;display:flex;align-items:center;justify-content:center;
  transition:background .2s,border-color .2s,color .2s;}
.m-link:hover svg,.m-link:hover i{border-color:rgba(255,255,255,.6);}
.m-link:hover{background:var(--nav-hover);color:var(--nav-ink);}
.m-link:hover svg,.m-link:hover i{color:var(--nav-ink);}
.m-link.active{color:var(--nav-ink);font-weight:700;}
.m-link.active:hover{background:none;}
/* Selected item: a half trapezoid at its end, flush with the sidebar edge, slanted side facing in. */
.m-link.active{isolation:isolate;}
.m-link.active::after{content:"";position:absolute;z-index:-1;top:3px;bottom:3px;right:-10px;width:calc(50% + 10px);
  background:linear-gradient(to right,color-mix(in srgb,var(--nav-accent) 18%,transparent),var(--nav-accent));
  clip-path:polygon(18px 0,100% 0,100% 100%,0 100%);transform-origin:right center;animation:m-trap .38s cubic-bezier(.2,.8,.2,1) both;}
@keyframes m-trap{from{transform:scaleX(0);opacity:0;}to{transform:scaleX(1);opacity:1;}}
html.nav-rail .m-link.active::after{right:-8px;width:10px;background:var(--nav-accent);clip-path:polygon(55% 0,100% 0,100% 100%,0 100%);}
.m-link.active svg,.m-link.active i{border-color:var(--nav-accent);
  background:var(--nav-accent);color:var(--nav-accent-ink);box-shadow:0 4px 14px rgba(0,0,0,.25);}
.m-link-l{flex:1;overflow:hidden;text-overflow:ellipsis;}
.m-count{min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:var(--nav-hover);color:var(--nav-ink);
  font-size:12px;font-weight:600;display:none;align-items:center;justify-content:center;}
.m-count.on{display:inline-flex;}
.m-nav-foot{flex-shrink:0;padding:8px 10px;display:flex;flex-direction:column;gap:2px;}
.m-foot-btn{display:flex;align-items:center;gap:12px;height:34px;padding:0 10px;border-radius:var(--r-ctl);color:var(--nav-ink-2);
  background:none;border:0;text-decoration:none;font-size:13.5px;width:100%;text-align:left;white-space:nowrap;}
.m-foot-btn:hover{background:var(--nav-hover);color:var(--nav-ink);}
.m-foot-btn.active{color:var(--nav-ink);font-weight:700;}
.m-foot-btn i{width:18px;text-align:center;color:var(--nav-muted);font-size:14px;flex-shrink:0;}
html.nav-rail .m-brand{padding:0;justify-content:center;}
html.nav-rail .m-brand-name,html.nav-rail .m-link-l,html.nav-rail .m-foot-l,html.nav-rail .m-count{display:none!important;}
html.nav-rail .m-group-h{font-size:0;padding:8px 0;margin:6px 10px;border-top:1px solid var(--nav-line);border-bottom:0;}
/* The rail has no room for names; expand the sidebar to edit a category. */
html.nav-rail .m-group-l,html.nav-rail .m-group-ed,html.nav-rail .m-group-form{display:none!important;}
/* In the rail the toggle sits small on the icon's top-right corner. */
html.nav-rail .m-item-tog{right:2px;top:0;transform:none;width:18px;height:18px;font-size:8px;}
html.nav-edit.nav-rail .m-nav-item .m-link{padding-right:0;}
html.nav-rail .m-link,html.nav-rail .m-foot-btn{justify-content:center;padding:0;}
html.nav-rail .m-nav-scroll,html.nav-rail .m-nav-foot{padding-left:8px;padding-right:8px;}
.m-apps-chev{margin-left:auto;font-size:10px!important;width:auto!important;transition:transform .15s;}
.openhl-get-app.open .m-apps-chev{transform:rotate(180deg);}
.m-apps-menu{position:fixed;left:calc(var(--nav-w) + 8px);bottom:12px;z-index:9999;display:none;width:240px;
  background:var(--surface);border:1px solid var(--line);border-radius:var(--r-panel);padding:6px;
  box-shadow:0 18px 48px rgba(0,0,0,.4);flex-direction:column;gap:2px;}
.openhl-get-app.open .m-apps-menu{display:flex;}
.m-apps-item{display:flex;align-items:center;gap:12px;padding:8px 10px;border-radius:var(--r-ctl);color:var(--text);text-decoration:none;}
.m-apps-item:hover,.m-apps-item:focus-visible{background:var(--raised);}
.m-apps-item i{width:18px;text-align:center;color:var(--muted);font-size:15px;}
.m-apps-item span{display:flex;flex-direction:column;line-height:1.3;}
.m-apps-item b{font-weight:500;font-size:13.5px;}
.m-apps-item small{font-size:12px;color:var(--muted);}
html.nav-rail .m-apps-chev{display:none;}
.openhl-switch-server[hidden]{display:none;}

.m-pulse{position:fixed;top:0;left:var(--nav-w);right:0;height:var(--pulse-h);z-index:55;display:flex;align-items:stretch;
  background:var(--bg-nav);border-bottom:1px solid var(--line);overflow-x:auto;overflow-y:hidden;scrollbar-width:none;}
.m-pulse::-webkit-scrollbar{display:none;}
.m-cell{display:flex;align-items:center;gap:8px;padding:0 16px;border-right:1px solid var(--line);white-space:nowrap;
  color:var(--text);text-decoration:none;font-family:var(--font-display);font-size:14px;}
a.m-cell:hover{background:var(--raised);}
.m-cell .k{color:var(--muted);font-weight:500;}
.m-cell .v{font-weight:600;font-variant-numeric:tabular-nums;border-radius:3px;padding:0 2px;margin:0 -2px;}
.m-cell.warn .v{color:var(--warn);} .m-cell.fault .v{color:var(--fault);}
.m-cell.fault{background:color-mix(in srgb,var(--fault) 9%,transparent);}
.m-cell .v.changed{animation:m-changed 1.2s ease-out;}
@keyframes m-changed{from{background:var(--accent-soft);}to{background:transparent;}}
.m-cell.clock{margin-left:auto;border-right:0;border-left:1px solid var(--line);color:var(--text-2);}
.m-cell.menu{display:none;border:0;border-right:1px solid var(--line);background:none;padding:0 14px;color:var(--text);font-size:16px;}
.m-scrim{display:none;}
@media(max-width:760px){
  body{padding-left:0;}
  .m-nav{width:260px;transform:translateX(-100%);transition:transform .2s ease;box-shadow:none;}
  html.nav-open .m-nav{transform:none;box-shadow:0 0 40px rgba(0,0,0,.5);}
  html.nav-hidden .m-nav{visibility:visible;}
  html.nav-open .m-scrim{display:block;position:fixed;inset:0;z-index:58;background:rgba(0,0,0,.4);}
  html.nav-rail .m-brand-name,html.nav-rail .m-link-l,html.nav-rail .m-foot-l{display:inline!important;}
  html.nav-rail .m-link,html.nav-rail .m-foot-btn{justify-content:flex-start;padding:0 10px;}
  .m-pulse{left:0;}
  .m-cell.menu{display:flex;}
  .m-cell.hide-sm{display:none;}
  .m-apps-menu{left:12px;right:12px;width:auto;}
  html.nav-rail .m-item-tog{right:6px;top:50%;transform:translateY(-50%);width:22px;height:22px;font-size:10px;}
  html.nav-edit.nav-rail .m-nav-item .m-link{padding-right:36px;}
  html.nav-rail .m-group-h{font-size:12.5px;padding:16px 10px 8px;margin:0 0 4px;border-top:0;border-bottom:1px solid var(--nav-line);}
  html.nav-rail .m-group-l{display:block!important;}
  html.nav-edit.nav-rail .m-group-ed{display:flex!important;}
  html.nav-rail .m-group-form{display:flex!important;}
  .m-collapse,.m-hide{display:none!important;}
}
`;

const THEME_JS = `(function(){
  var THEMES=${JSON.stringify(THEMES)};
  var LEGACY=${JSON.stringify(LEGACY_THEMES)};
  var root=document.documentElement;
  function pick(n){ n=LEGACY[n]||n; return THEMES[n]?n:'slate'; }
  function apply(name){
    var th=THEMES[name];
    Object.entries(th.vars).forEach(function(kv){root.style.setProperty('--'+kv[0],kv[1]);});
    root.style.colorScheme=th.dark?'dark':'light';
    try{ if(window.openhlAndroid&&window.openhlAndroid.setTheme) window.openhlAndroid.setTheme(th.vars['bg-nav'],th.vars.bg,th.dark); }catch(e){}
  }
  var saved='slate';
  try{ saved=pick(localStorage.getItem('openhl-theme')); if(localStorage.getItem('openhl-nav')==='rail') root.classList.add('nav-rail'); if(localStorage.getItem('openhl-nav-hidden')==='1') root.classList.add('nav-hidden'); if(localStorage.getItem('openhl-nav-edit')==='1') root.classList.add('nav-edit'); }catch(e){}
  apply(saved);

  window._applyTheme=function(name){
    if(!THEMES[name])return;
    apply(name);
    try{localStorage.setItem('openhl-theme',name);}catch(e){}
    try{window.dispatchEvent(new Event('openhl:theme'));}catch(e){}
  };

})();`;

const NAV_PAGES = [
  {href:"/", group:"",          color:"#fbbf24", title:"Home",
   icon:`<i class="fa-solid fa-house"></i>`},
  {href:"/notes", group:"Daily",     color:"#00eeff", title:"Notes",
   icon:`<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256"><path d="M208,32H184V24a8,8,0,0,0-16,0v8H136V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48a8,8,0,0,0-8,8V200a32,32,0,0,0,32,32H184a32,32,0,0,0,32-32V40A8,8,0,0,0,208,32ZM120,56a8,8,0,0,1,16,0v8a8,8,0,0,1-16,0ZM80,72a8,8,0,0,1-8-8V56a8,8,0,0,1,16,0v8A8,8,0,0,1,80,72Zm80,96H96a8,8,0,0,1,0-16h64a8,8,0,0,1,0,16Zm0-32H96a8,8,0,0,1,0-16h64a8,8,0,0,1,0,16Zm24-72a8,8,0,0,1-16,0V56a8,8,0,0,1,16,0Z"></path></svg>`},
  {href:"/homeos", group:"Devices",    color:"#22c55e", title:"HomeOS",
   icon:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/></svg>`},
  {href:"/files", group:"Daily",     color:"#bb00ff", title:"Files",
   icon:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path fill-rule="evenodd" clip-rule="evenodd" d="M12.8682 4.63194C12.3302 4.32451 11.6698 4.32451 11.1318 4.63194L5.13176 8.06051C4.5865 8.37209 4.25 8.95194 4.25 9.57994V15.4193C4.25 16.0473 4.5865 16.6271 5.13176 16.9387L11.1318 20.3673C11.6698 20.6747 12.3302 20.6747 12.8682 20.3673L18.8682 16.9387C19.4135 16.6271 19.75 16.0473 19.75 15.4193V9.57994C19.75 8.95194 19.4135 8.37209 18.8682 8.06051L12.8682 4.63194ZM7.3556 9.64741C6.9909 9.45103 6.53605 9.58748 6.33967 9.95219C6.14329 10.3169 6.27975 10.7717 6.64445 10.9681L11.25 13.448V17.5001C11.25 17.9144 11.5858 18.2501 12 18.2501C12.4142 18.2501 12.75 17.9144 12.75 17.5001V13.448L17.3556 10.9681C17.7203 10.7717 17.8568 10.3169 17.6604 9.95219C17.464 9.58748 17.0092 9.45103 16.6444 9.64741L12 12.1483L7.3556 9.64741Z" fill="currentColor"></path></svg>`},
  {href:"/live", group:"Daily",     color:"#0ea5e9", title:"Live folders",
   icon:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M15.5 12.2a3.5 3.5 0 0 0-6.3-.9M8.5 15a3.5 3.5 0 0 0 6.3.9"/><path d="M9.2 9.6v1.8H11M14.8 17.6v-1.8H13"/></svg>`},
  {href:"/mail", group:"Messaging",      color:"#6366f1", title:"Mail",
   icon:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`},
  {href:"/voicemail", group:"Messaging",  color:"#10b981", title:"Voicemail",
   icon:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6.5" cy="12" r="3.5"/><circle cx="17.5" cy="12" r="3.5"/><path d="M6.5 15.5h11"/></svg>`},
  {href:"/texts", group:"Messaging",      color:"#14b8a6", title:"Texts",
   icon:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4.5 3.5V17H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/><path d="M7.5 9.5h9M7.5 12.5h6"/></svg>`},
  {href:"/monitoring", group:"Systems",color:"#ef4444", title:"Monitoring",
   icon:`<i class="fa-solid fa-heart-pulse"></i>`},
  {href:"/ai", group:"Intel and money",        color:"#ff6600", title:"AI",
   icon:`<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256"><path d="M120,72a8,8,0,1,1,8,8A8,8,0,0,1,120,72Zm24,64a8,8,0,1,0,8-8A8,8,0,0,0,144,136Zm48.5,35.47A88.32,88.32,0,0,0,224,101.89q0-1.1-.09-2.19a4,4,0,0,0-4-3.75H195.75L172.62,123.7a24,24,0,1,1-12.28-10.25l25.51-30.62A8,8,0,0,1,192,80h23.14a4,4,0,0,0,3.77-5.35C207.27,42,176.86,18,140.74,16.08l-.59,0a4,4,0,0,0-4.15,4V49.33a24,24,0,1,1-16,0v-27a4,4,0,0,0-4.89-3.91A88.16,88.16,0,0,0,48,102L25.55,145.14l-.22.45a16,16,0,0,0,7.51,20.7l.25.12L56,176.9v31a16,16,0,0,0,16,16h40v8a8,8,0,0,0,8,8h71.77a8.42,8.42,0,0,0,4.06-1,8,8,0,0,0,4.11-8Z"></path></svg>`},
  {href:"/finance", group:"Intel and money",   color:"#84cc16", title:"Finance",
   icon:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M14.6 9.3a2.7 2.7 0 0 0-2.6-1.6c-1.5 0-2.7 1-2.7 2.2s1.2 1.9 2.7 2.1 2.7 1 2.7 2.2-1.2 2.2-2.7 2.2a2.7 2.7 0 0 1-2.6-1.6M12 6.2 12 17.8"/></svg>`},
  {href:"/reminders", group:"Daily", color:"#fb923c", title:"Reminders",
   icon:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9.5V13l2.5 1.5"/><path d="M4.8 3 2.3 5.5M19.2 3l2.5 2.5"/></svg>`},
  {href:"/flows", group:"Daily", color:"#a78bfa", title:"Flow Space",
   icon:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="5" rx="1"/><rect x="14" y="16" width="7" height="5" rx="1"/><path d="m17.5 8.5 3 3-3 3-3-3z"/><path d="M10 5.5h4.5a3 3 0 0 1 3 3M17.5 14.5V16M6.5 8v8.5a2 2 0 0 0 2 2H14"/></svg>`},
  {href:"/calendar", group:"Daily", color:"#4f8ff7", title:"Calendar",
   icon:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2M8 17h2"/></svg>`},
  {href:"/vmlab", group:"Systems",     color:"#2dd4bf", title:"VM Lab",
   icon:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="m9 8.5-2 1.5 2 1.5M15 8.5l2 1.5-2 1.5"/></svg>`},
  {href:"/laptops", group:"Devices",   color:"#f472b6", title:"PC host",
   icon:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="13" height="10" rx="1.5"/><path d="M6 19.5h6M9 15v4.5"/><rect x="17.5" y="4" width="4" height="16" rx="1"/><path d="M19.5 7.5h.01"/></svg>`},
  {href:"/mobile", group:"Devices",    color:"#a3e635", title:"Mobile host",
   icon:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6.5" y="2.5" width="11" height="19" rx="2.2"/><path d="M10.5 18.5h3"/><path d="m10.5 8.5 3 2-3 2"/></svg>`},
  {href:"/docker", group:"Systems",    color:"#38bdf8", title:"Containers",
   icon:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="4" height="4"/><rect x="8" y="11" width="4" height="4"/><rect x="13" y="11" width="4" height="4"/><rect x="8" y="6" width="4" height="4"/><path d="M3 15c0 3 2.5 4.5 6 4.5s8-1.6 9.3-5.2c2.2.3 3.2-1.3 2.7-2.3"/></svg>`},
];

// ── GLOBAL ALARM LAYER ───────────────────────────────────────────────────────
// Rendered by navBar(), so it exists on every page without any page opting in.
// A reminder that fires while you are on /files or /notes rings there, with the
// same overlay and the same controls it would have on /reminders.
const ALARM_CSS = `
.alarm-ov{position:fixed;inset:0;z-index:9000;display:none;align-items:center;justify-content:center;
  padding:24px;background:rgba(4,4,8,.82);backdrop-filter:blur(10px);}
.alarm-ov.on{display:flex;}
.alarm-box{position:relative;width:min(460px,100%);background:var(--surface);border:1px solid var(--border);
  border-radius:18px;padding:30px 26px 24px;text-align:center;
  box-shadow:0 24px 70px rgba(0,0,0,.6);animation:alarm-in .22s ease;}
.alarm-box::before{content:'';position:absolute;inset:-2px;border-radius:20px;pointer-events:none;
  border:2px solid var(--red);animation:alarm-ring 1.1s ease-in-out infinite;}
@keyframes alarm-in{from{transform:scale(.92);opacity:0}to{transform:none;opacity:1}}
@keyframes alarm-ring{0%,100%{opacity:.25;transform:scale(1)}50%{opacity:.85;transform:scale(1.012)}}
.alarm-bell{font-size:40px;line-height:1;display:block;margin-bottom:10px;
  animation:alarm-shake .9s ease-in-out infinite;transform-origin:50% 12%;}
@keyframes alarm-shake{0%,100%{transform:rotate(-11deg)}50%{transform:rotate(11deg)}}
.alarm-when{font-family:var(--font-ui);font-size:13px;
  color:var(--red);margin-bottom:8px;}
.alarm-title{font-size:1.45rem;font-weight:800;line-height:1.25;margin-bottom:8px;
  word-break:break-word;font-family:var(--font-display);}
.alarm-note{font-size:.9rem;color:var(--muted);line-height:1.55;white-space:pre-wrap;
  word-break:break-word;margin-bottom:20px;}
.alarm-acts{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;}
.alarm-btn{font-family:var(--font-ui);font-size:12px;padding:11px 16px;border-radius:10px;
  border:1px solid var(--border);background:var(--surface2);color:var(--text);transition:.15s;}
.alarm-btn:hover{border-color:var(--accent);color:var(--accent);}
.alarm-btn.primary{background:var(--red);border-color:var(--red);color:#fff;font-weight:700;}
.alarm-btn.primary:hover{opacity:.88;color:#fff;}
.alarm-more{margin-top:14px;font-family:var(--font-ui);font-size:11px;color:var(--muted);}
@media(max-width:480px){.alarm-box{padding:24px 18px 20px}.alarm-title{font-size:1.2rem}}
`;

const ALARM_HTML = `<style>${ALARM_CSS}</style>
<div class="alarm-ov" id="alarm-ov" role="alertdialog" aria-modal="true" aria-labelledby="alarm-title">
  <div class="alarm-box">
    <span class="alarm-bell">⏰</span>
    <div class="alarm-when" id="alarm-when"></div>
    <div class="alarm-title" id="alarm-title"></div>
    <div class="alarm-note" id="alarm-note"></div>
    <div class="alarm-acts">
      <button class="alarm-btn" data-act="snooze" data-min="5">Snooze 5m</button>
      <button class="alarm-btn" data-act="snooze" data-min="15">Snooze 15m</button>
      <button class="alarm-btn primary" data-act="dismiss">Dismiss</button>
    </div>
    <div class="alarm-more" id="alarm-more"></div>
  </div>
</div>`;

const ALARM_JS = `(function(){
  if (window.__openhlAlarm) return; window.__openhlAlarm = true;

  var Q = [], cur = null;              // queue of ringing reminders + the one on screen
  var AC = null, beat = null, armed = false;
  var ov, elWhen, elTitle, elNote, elMore;

  // ── Audio ──────────────────────────────────────────────────────────────────
  // A ringing alarm has to survive the autoplay policy: in a tab that has never
  // been touched the AudioContext starts suspended. We resume it, and if that is
  // refused we arm a one-shot gesture listener so the very next click or keypress
  // starts the sound. The overlay itself never waits on audio.
  function ctx(){
    if (!AC) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; AC = new C(); }
    if (AC.state === 'suspended') { try { AC.resume(); } catch(e){} }
    return AC;
  }
  function arm(){
    if (armed) return; armed = true;
    var go = function(){ if (AC && AC.state === 'suspended') { try { AC.resume(); } catch(e){} } };
    ['pointerdown','keydown','touchstart'].forEach(function(t){
      document.addEventListener(t, go, { passive: true });
    });
  }
  function beep(f, dur, type, vol, at){
    var c = ctx(); if (!c) return;
    var t0 = c.currentTime + (at || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.28, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }
  var PATTERNS = {
    chime: function(){ beep(880,0.5,'sine',0.30,0); beep(1320,0.62,'sine',0.24,0.22); },
    bell:  function(){ beep(1568,0.9,'triangle',0.24,0); beep(2093,0.7,'triangle',0.11,0.02); },
    alarm: function(){ for (var i=0;i<4;i++) beep(i%2?1046:784,0.13,'square',0.24,i*0.17); },
    pulse: function(){ beep(233,0.16,'sawtooth',0.26,0); beep(233,0.16,'sawtooth',0.26,0.26); }
  };
  function play(sound){
    try { (PATTERNS[sound] || PATTERNS.chime)(); } catch(e){}
    try { if (navigator.vibrate) navigator.vibrate([220,120,220]); } catch(e){}
  }
  window.__openhlPreviewSound = function(s){ arm(); play(s); };

  function startRing(sound){ stopRing(); arm(); play(sound); beat = setInterval(function(){ play(sound); }, 2600); }
  function stopRing(){
    if (beat) { clearInterval(beat); beat = null; }
    try { if (navigator.vibrate) navigator.vibrate(0); } catch(e){}
  }

  function notify(r){
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      var n = new Notification(r.title || 'Reminder', {
        body: r.note || '', tag: 'openhl-reminder-' + r.id, requireInteraction: true
      });
      n.onclick = function(){ try { window.focus(); } catch(e){} n.close(); };
    } catch(e){}
  }

  // ── Overlay ────────────────────────────────────────────────────────────────
  function bind(){
    if (ov) return !!ov;
    ov = document.getElementById('alarm-ov');
    if (!ov) return false;
    elWhen  = document.getElementById('alarm-when');
    elTitle = document.getElementById('alarm-title');
    elNote  = document.getElementById('alarm-note');
    elMore  = document.getElementById('alarm-more');
    ov.addEventListener('click', function(e){
      var b = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!b) return;
      if (b.getAttribute('data-act') === 'dismiss') resolve('/api/reminders/dismiss', {});
      else resolve('/api/reminders/snooze', { minutes: parseInt(b.getAttribute('data-min'), 10) || 5 });
    });
    document.addEventListener('keydown', function(e){
      if (cur && e.key === 'Escape') resolve('/api/reminders/dismiss', {});
    });
    return true;
  }
  function resolve(url, extra){
    if (!cur) return;
    var body = { id: cur.id };
    for (var k in extra) body[k] = extra[k];
    fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      .catch(function(){});
    show();
  }
  function moreText(){ return Q.length ? ('+ ' + Q.length + ' more waiting') : ''; }
  function show(){
    cur = Q.shift() || null;
    stopRing();
    if (!bind()) return;
    if (!cur) { ov.classList.remove('on'); document.body.style.overflow = ''; return; }
    var t = '';
    try { t = new Date(cur.firedAt).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }); } catch(e){}
    elWhen.textContent  = t;
    elTitle.textContent = cur.title || 'Reminder';
    elNote.textContent  = cur.note || '';
    elNote.style.display = cur.note ? '' : 'none';
    elMore.textContent  = moreText();
    ov.classList.add('on');
    document.body.style.overflow = 'hidden';
    startRing(cur.sound);
    notify(cur);
  }
  function ring(r){
    if (!r || !r.id) return;
    if (cur && cur.id === r.id) return;
    for (var i = 0; i < Q.length; i++) if (Q[i].id === r.id) return;
    Q.push(r);
    if (!cur) show();
    else if (elMore) elMore.textContent = moreText();
  }
  function clear(id){
    Q = Q.filter(function(r){ return r.id !== id; });
    if (cur && cur.id === id) show();
    else if (elMore) elMore.textContent = moreText();
  }

  // Anything already ringing when this page loaded — so navigating mid-alarm,
  // or opening a second tab, picks the alarm straight back up.
  function pull(){
    fetch('/api/reminders/active', { headers: { Accept: 'application/json' } })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){ if (d && d.ringing) d.ringing.forEach(ring); })
      .catch(function(){});
  }

  function boot(){
    bind(); pull();
    try {
      var es = openhlEvents();
      es.addEventListener('reminder_fire',  function(e){ try { ring(JSON.parse(e.data)); } catch(x){} });
      es.addEventListener('reminder_clear', function(e){ try { clear(JSON.parse(e.data).id); } catch(x){} });
    } catch(e){}
    // A sleeping machine drops the SSE stream and misses whatever fired meanwhile.
    document.addEventListener('visibilitychange', function(){ if (!document.hidden) pull(); });
    setInterval(pull, 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();`;


// Order of the sidebar. Pages are listed in NAV_PAGES in any order; this puts
// them into groups people scan by task.
const NAV_ORDER = ["/", "/notes", "/flows", "/reminders", "/calendar", "/files", "/live", "/texts", "/voicemail", "/mail", "/monitoring", "/vmlab", "/docker", "/homeos", "/laptops", "/mobile", "/finance", "/ai"];

function navBar(active) {
  const cur = active ? (active.charAt(0) === '/' ? active : '/' + active) : '';
  const pages = NAV_ORDER.map(h => NAV_PAGES.find(p => p.href === h)).filter(Boolean)
    .concat(NAV_PAGES.filter(p => !NAV_ORDER.includes(p.href)));
  const hidden = new Set(hiddenPages());
  const count = href => href === '/mail' ? '<span class="m-count" id="nav-count-mail"></span>'
              : href === '/voicemail' ? '<span class="m-count" id="nav-count-voicemail"></span>'
              : href === '/texts' ? '<span class="m-count" id="nav-count-texts"></span>' : '';
  const link = p => `<a href="${p.href}" class="m-link${cur === p.href ? " active" : ""}" title="${p.title}"${cur === p.href ? ' aria-current="page"' : ''}>${p.icon}<span class="m-link-l">${p.title}</span>${count(p.href)}</a>`;
  // Pages in a category can be hidden. Hidden ones stay in the markup so edit
  // mode (/personalize) can show them with a plus and bring them back in place.
  const item = p => {
    const off = hidden.has(p.href);
    const verb = off ? "Show" : "Hide";
    return `<div class="m-nav-item${off ? " off" : ""}${cur === p.href ? " here" : ""}" data-href="${p.href}" data-i="${pages.indexOf(p)}">${link(p)}` +
      `<button type="button" class="m-item-tog" title="${verb} ${p.title}" aria-label="${verb} ${p.title} in the sidebar"><i class="fa-solid fa-${off ? "plus" : "minus"}"></i></button></div>`;
  };
  // Categories keep the order they ship in; a page moved from the pen on a
  // heading joins its new category in its usual place in NAV_ORDER.
  const moved = navGroups(), names = navGroupNames();
  const keys = [...new Set(pages.filter(p => p.group).map(p => p.group))];
  const groupOf = p => p.group && keys.includes(moved[p.href]) ? moved[p.href] : p.group;
  const groups = pages.filter(p => !p.group).map(p => ({ pages: [p] }))
    .concat(keys.map(k => ({ key: k, name: names[k] || k, pages: pages.filter(p => groupOf(p) === k) })));
  const links = groups.map(g => {
    if (!g.key) return g.pages.map(link).join("");
    // A heading whose pages are all hidden goes too, outside edit mode.
    const empty = g.pages.every(p => hidden.has(p.href) && p.href !== cur);
    return `<div class="m-group-h${empty ? " empty" : ""}" data-group="${esc(g.key)}"><span class="m-group-l">${esc(g.name)}</span>` +
      `<button type="button" class="m-group-ed" title="Edit ${esc(g.name)}" aria-label="Rename ${esc(g.name)} or move its pages" aria-expanded="false"><i class="fa-solid fa-pen"></i></button></div>` +
      g.pages.map(p => item(p)).join("");
  }).join("");
  return `<header class="m-nav" id="m-nav">
<a href="/" class="m-brand" title="Open HL home">${LOGO_SVG}<span class="m-brand-name">Open HL</span></a>
<nav class="m-nav-scroll" aria-label="Pages" data-name-max="${GROUP_NAME_MAX}">${links}</nav>
<div class="m-nav-foot">
  <a class="m-foot-btn${cur === '/personalize' ? ' active' : ''}" href="/personalize" title="Personalize: your name and themes"${cur === '/personalize' ? ' aria-current="page"' : ''}><i class="fa-solid fa-user"></i><span class="m-foot-l">Personalize</span></a>
  <div class="openhl-get-app">
    <button class="m-foot-btn" id="m-apps-btn" type="button" title="Get the app" aria-haspopup="menu" aria-expanded="false" aria-controls="m-apps-menu"><i class="fa-solid fa-download"></i><span class="m-foot-l">Get the app</span><i class="fa-solid fa-chevron-up m-apps-chev"></i></button>
    <div class="m-apps-menu" id="m-apps-menu" role="menu" aria-label="Get the app">
      <a href="/download#desktop" class="m-apps-item" role="menuitem"><i class="fa-solid fa-desktop"></i><span><b>Desktop app</b><small>Windows and Linux</small></span></a>
      <a href="/download#android" class="m-apps-item" role="menuitem"><i class="fa-brands fa-android"></i><span><b>Android app</b><small>Android 7 and newer</small></span></a>
    </div>
  </div>
  <button class="m-foot-btn openhl-switch-server" type="button" title="Connect to a different Open HL server" hidden><i class="fa-solid fa-server"></i><span class="m-foot-l">Switch server</span></button>
  <button class="m-foot-btn m-collapse" id="m-collapse" type="button" title="Collapse sidebar"><i class="fa-solid fa-angles-left"></i><span class="m-foot-l">Collapse</span></button>
  <button class="m-foot-btn m-hide" id="m-hide" type="button" title="Hide sidebar (bring it back with the menu button, top left)"><i class="fa-solid fa-eye-slash"></i><span class="m-foot-l">Hide sidebar</span></button>
  <form method="POST" action="/logout"><button class="m-foot-btn" type="submit" title="Sign out"><i class="fa-solid fa-arrow-right-from-bracket"></i><span class="m-foot-l">Sign out</span></button></form>
</div>
</header>
<div class="m-scrim" id="m-scrim"></div>
<div class="m-pulse" id="m-pulse" role="status" aria-label="System status">
  <button class="m-cell menu" id="m-menu" type="button" aria-label="Open menu"><i class="fa-solid fa-bars"></i></button>
  <a class="m-cell hide-sm" href="/monitoring" data-cell="cpu"><span class="k">CPU</span><span class="v" id="pulse-cpu">&ndash;</span></a>
  <a class="m-cell hide-sm" href="/monitoring" data-cell="mem"><span class="k">Memory</span><span class="v" id="pulse-mem">&ndash;</span></a>
  <a class="m-cell" href="/monitoring" data-cell="nodes"><span class="k">Nodes</span><span class="v" id="pulse-nodes">&ndash;</span></a>
  <a class="m-cell" href="/vmlab" data-cell="vms"><span class="k">VMs</span><span class="v" id="pulse-vms">&ndash;</span></a>
  <a class="m-cell hide-sm" href="/mail" data-cell="mail"><span class="k">Mail</span><span class="v" id="pulse-mail">&ndash;</span></a>
  <a class="m-cell hide-sm" href="/reminders" data-cell="next"><span class="k">Next</span><span class="v" id="pulse-next">&ndash;</span></a>
  <span class="m-cell clock hide-sm"><span class="v" id="pulse-clock">&ndash;</span></span>
</div>
${ALARM_HTML}
<script>${THEME_JS}</script>
<script src="/ui/shell.js" defer></script>
<script>${ALARM_JS}</script>`;
}

const TOAST_CSS = `
.toast{position:fixed;bottom:20px;right:20px;z-index:999;max-width:min(420px,calc(100vw - 40px));background:var(--surface);
  border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:var(--r-ctl);padding:10px 14px;font-size:14px;
  color:var(--text);box-shadow:0 12px 32px rgba(0,0,0,.35);transform:translateY(12px);opacity:0;transition:opacity .15s,transform .15s;pointer-events:none;}
.toast.on{transform:none;opacity:1;}
.toast.ok,.toast.success{border-left-color:var(--ok);}
.toast.bad,.toast.error{border-left-color:var(--fault);}
.toast.warning,.toast.warn{border-left-color:var(--warn);}
.toast.info{border-left-color:var(--accent);}
`;

const TOAST_JS = `
function showToast(msg,type){
  const t=document.getElementById('toast');
  t.textContent=msg;t.className='toast on '+(type||'ok');
  clearTimeout(t._t);t._t=setTimeout(()=>t.className='toast',3200);
}`;

const SSE_JS = `(function(){
  const sse=openhlEvents();
  sse.addEventListener('change',function(e){
    try{const d=JSON.parse(e.data);if(typeof window.__sseRefresh==='function')window.__sseRefresh(d);}catch(_){}
  });
  sse.addEventListener('error',function(){});
})();`;

const GAMEPAD_CSS = '';

const GAMEPAD_JS = '';

module.exports = { LEGACY_THEMES, ALARM_CSS, ALARM_HTML, ALARM_JS, BASE_CSS, FAVICON, FONT, GAMEPAD_CSS, GAMEPAD_JS, NAV_CSS, NAV_PAGES, SSE_JS, THEMES, THEME_JS, TOAST_CSS, TOAST_JS, navBar };
