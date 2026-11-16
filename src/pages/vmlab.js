const { esc } = require("../helpers");
const { BASE_CSS, FAVICON, FONT, NAV_CSS, THEME_JS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");

// ─── VM LAB PAGES ────────────────────────────────────────────────────────────
// The markup and styles live here; behaviour is in src/ui/vmlab/*.js, served as
// real files so the client code is free of template-literal escaping rules.

const VMLAB_CSS = `
.vl{position:relative;z-index:1;max-width:1480px;margin:0 auto;padding:24px 26px 60px;}
.vl-top{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:16px;}
.vl-title{font-family:var(--font-display);font-weight:600;font-size:28px;}
.vl-sub{font-family:var(--font-ui);font-size:13px;color:var(--muted);margin-top:3px;}
.vl-kpis{display:flex;gap:10px;flex-wrap:wrap;}
.hostpick{display:flex;align-items:center;gap:8px;}
.hostpick .lbl{font-family:var(--font-ui);font-size:12px;color:var(--muted);}
.hostpick .pick{display:inline-flex;align-items:center;gap:9px;background:var(--surface);border:1px solid var(--border);color:var(--text);
  border-radius:var(--r-panel);padding:7px 13px;font-size:12.5px;font-family:var(--font-ui);font-weight:600;}
.hostpick .pick:hover{border-color:var(--accent);}
.hostpick .pick .dot{margin-right:1px;}
.hostpick .menu{min-width:270px;}
.hostpick .menu button{justify-content:flex-start;}
.hostpick .menu button.on{background:var(--nav-active-bg);color:var(--nav-active-text);}
.hostpick .menu .sub{display:block;font-size:12px;color:var(--muted);font-weight:400;margin-top:2px;}
.host-row{display:flex;align-items:center;gap:12px;}
.host-row .who{min-width:0;flex:1;}
.host-row .who b{font-size:14px;}
.tok{font-family:var(--font-ui);font-size:12px;word-break:break-all;}
.kpi{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-panel);padding:9px 14px;min-width:112px;}
.kpi .k{font-family:var(--font-ui);font-size:12px;color:var(--muted);}
.kpi .v{font-family:var(--font-display);font-weight:600;font-size:19px;margin-top:2px;white-space:nowrap;}
.kpi .bar{height:3px;border-radius:var(--r-ctl);background:var(--border);margin-top:6px;overflow:hidden;}
.kpi .bar i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));width:0;transition:width .4s;}
.banner{border:1px solid color-mix(in srgb,var(--yellow) 45%,transparent);background:color-mix(in srgb,var(--yellow) 10%,var(--surface));
  color:var(--text);border-radius:var(--r-panel);padding:12px 16px;font-size:12.5px;line-height:1.55;margin-bottom:12px;}
.banner.bad{border-color:color-mix(in srgb,var(--red) 50%,transparent);background:color-mix(in srgb,var(--red) 10%,var(--surface));}
.banner code,.help code,.mono{font-family:var(--font-ui);font-size:13px;}
.banner code,.help code{background:var(--bg);border:1px solid var(--border);border-radius:var(--r-ctl);padding:1px 6px;}
.vl-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 18px;border-bottom:1px solid var(--border);padding-bottom:12px;}
.vl-tab{display:flex;align-items:center;gap:8px;padding:8px 15px;border-radius:var(--r-panel);font-size:12.5px;font-weight:600;
  border:1px solid var(--border);background:var(--surface);color:var(--muted);font-family:var(--font-ui);}
.vl-tab:hover{color:var(--text);border-color:color-mix(in srgb,var(--accent) 50%,var(--border));}
.vl-tab.active{background:var(--nav-active-bg);border-color:var(--nav-active-border);color:var(--nav-active-text);}
.vl-tab .n{font-size:13px;background:var(--surface2);border-radius:99px;padding:1px 7px;color:var(--muted);}
.panel{display:none;} .panel.on{display:block;}
.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.spacer{flex:1;}
.sec-t{font-family:var(--font-display);font-weight:600;font-size:17px;}
.sec-s{font-family:var(--font-ui);font-size:13px;color:var(--muted);}
.btn{display:inline-flex;align-items:center;gap:7px;background:var(--surface2);border:1px solid var(--border);color:var(--text);
  border-radius:var(--r-ctl);padding:8px 13px;font-size:12px;font-family:var(--font-ui);white-space:nowrap;text-decoration:none;}
.btn:hover{border-color:var(--accent);}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:600;}
.btn.primary:hover{filter:brightness(1.1);}
.btn.danger{color:var(--red);} .btn.danger:hover{border-color:var(--red);}
.btn.ok{color:var(--green);} .btn.sm{padding:5px 9px;font-size:13px;border-radius:var(--r-ctl);}
.btn:disabled{opacity:.45;pointer-events:none;}
.grid-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px;margin-top:14px;}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-panel);padding:15px 16px;position:relative;min-width:0;}
.card.running{border-color:color-mix(in srgb,var(--green) 45%,var(--border));}
.card-h{display:flex;align-items:flex-start;gap:10px;}
.os-ico{width:38px;height:38px;border-radius:var(--r-panel);background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;
  justify-content:center;font-size:17px;flex:none;color:var(--accent2);}
.card-name{font-weight:600;font-size:15px;line-height:1.25;word-break:break-word;}
.card-meta{font-family:var(--font-ui);font-size:13px;color:var(--muted);margin-top:3px;}
.badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:9px;}
.badge{font-family:var(--font-ui);font-size:12px;padding:3px 8px;border-radius:99px;border:1px solid var(--border);
  color:var(--muted);background:var(--surface2);white-space:nowrap;}
.badge.g{color:var(--green);border-color:color-mix(in srgb,var(--green) 45%,transparent);}
.badge.r{color:var(--red);border-color:color-mix(in srgb,var(--red) 45%,transparent);}
.badge.y{color:var(--yellow);border-color:color-mix(in srgb,var(--yellow) 45%,transparent);}
.badge.a{color:var(--nav-active-text);border-color:var(--nav-active-border);}
.dot{width:9px;height:9px;border-radius:50%;display:inline-block;background:var(--muted);flex:none;}
.dot.running{background:var(--green);}
.dot.starting,.dot.stopping{background:var(--yellow);animation:blink 1s infinite;}
.dot.error{background:var(--red);}
@keyframes blink{50%{opacity:.35;}}
.usage{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:11px;}
.meter .l{display:flex;justify-content:space-between;font-family:var(--font-ui);font-size:12px;color:var(--muted);}
.meter .t{height:5px;border-radius:var(--r-ctl);background:var(--border);margin-top:4px;overflow:hidden;}
.meter .t i{display:block;height:100%;background:var(--accent2);transition:width .5s;}
.kv{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:13px;margin-top:11px;font-family:var(--font-ui);}
.kv .k{color:var(--muted);} .kv .v{min-width:0;overflow:hidden;text-overflow:ellipsis;}
.secret{cursor:pointer;border-bottom:1px dashed var(--muted);}
.card-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:13px;align-items:center;}
.note{font-size:13px;color:var(--muted);margin-top:8px;line-height:1.5;}
.note.bad{color:var(--red);} .note.warn{color:var(--yellow);}
.empty{border:1px dashed var(--border);border-radius:var(--r-panel);padding:34px 20px;text-align:center;color:var(--muted);font-size:13px;margin-top:14px;}
.empty b{display:block;color:var(--text);font-size:15px;margin-bottom:6px;}
.menu-wrap{position:relative;}
.menu{position:absolute;right:0;top:calc(100% + 6px);z-index:40;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-panel);
  box-shadow:0 14px 40px rgba(0,0,0,.45);min-width:210px;padding:5px;display:none;}
.menu.on{display:block;}
.menu button{display:flex;width:100%;gap:9px;align-items:center;background:none;border:none;color:var(--text);text-align:left;
  padding:8px 10px;border-radius:var(--r-ctl);font-size:12px;font-family:var(--font-ui);}
.menu button:hover{background:var(--surface2);} .menu button.danger{color:var(--red);}
.menu hr{border:none;border-top:1px solid var(--border);margin:4px 0;}
table.tbl{width:100%;border-collapse:collapse;font-size:12px;}
.tbl-wrap{overflow-x:auto;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-panel);margin-top:12px;}
.tbl th{text-align:left;font-family:var(--font-ui);font-size:12px;color:var(--muted);
  padding:10px 12px;border-bottom:1px solid var(--border);white-space:nowrap;font-weight:400;}
.tbl td{padding:9px 12px;border-bottom:1px solid color-mix(in srgb,var(--border) 60%,transparent);vertical-align:middle;}
.tbl tr:last-child td{border-bottom:none;}
.tbl tr.click{cursor:pointer;} .tbl tr.click:hover td{background:var(--surface2);}
.detail{background:var(--bg);border-radius:var(--r-panel);padding:10px 12px;margin:4px 0 8px;}
.progress{height:6px;border-radius:var(--r-ctl);background:var(--border);overflow:hidden;margin-top:7px;}
.progress i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));transition:width .5s;}
.two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;}
.three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;}
.box{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-panel);padding:15px 16px;min-width:0;}
.box-h{font-family:var(--font-ui);font-size:13px;color:var(--muted);margin-bottom:10px;
  display:flex;justify-content:space-between;gap:8px;align-items:center;}
.chart{width:100%;height:150px;display:block;}
.legend{display:flex;gap:12px;font-family:var(--font-ui);font-size:13px;color:var(--muted);margin-top:6px;flex-wrap:wrap;}
.legend i{display:inline-block;width:10px;height:3px;border-radius:3px;margin-right:5px;vertical-align:middle;}
.cores{display:grid;grid-template-columns:repeat(auto-fill,minmax(46px,1fr));gap:6px;}
.core{background:var(--surface2);border-radius:var(--r-ctl);height:54px;position:relative;overflow:hidden;border:1px solid var(--border);}
.core i{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(0deg,var(--accent),var(--accent2));transition:height .5s;opacity:.8;}
.core span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--font-ui);font-size:13px;}
.checklist{display:flex;flex-direction:column;gap:7px;font-size:12px;}
.checklist div{display:flex;gap:9px;align-items:baseline;}
.help{font-size:12px;color:var(--muted);line-height:1.6;}
/* forms */
.form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 14px;}
.form .full{grid-column:1/-1;}
.fld label,.lbl{display:block;font-family:var(--font-ui);font-size:12px;color:var(--muted);margin-bottom:5px;}
.in,select.in,textarea.in{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--r-ctl);padding:9px 11px;color:var(--text);
  font-size:12.5px;font-family:var(--font-ui);outline:none;}
.in:focus{border-color:var(--accent);}
textarea.in{min-height:70px;resize:vertical;line-height:1.5;}
.hint{font-size:13px;color:var(--muted);margin-top:4px;line-height:1.45;}
.seg{display:flex;gap:8px;flex-wrap:wrap;}
.opt{flex:1;min-width:160px;border:1px solid var(--border);border-radius:var(--r-panel);padding:10px 12px;background:var(--bg);text-align:left;color:var(--text);}
.opt b{display:block;font-size:12.5px;margin-bottom:3px;} .opt span{font-size:13px;color:var(--muted);line-height:1.4;display:block;}
.opt.on{border-color:var(--accent);background:var(--nav-active-bg);}
.switch{display:flex;align-items:center;gap:9px;font-size:12.5px;cursor:pointer;user-select:none;}
.switch input{width:16px;height:16px;accent-color:var(--accent);}
.range-row{display:flex;align-items:center;gap:10px;} .range-row input[type=range]{flex:1;accent-color:var(--accent);}
.range-row .val{font-family:var(--font-ui);font-size:12px;min-width:70px;text-align:right;}
fieldset.grp{border:1px solid var(--border);border-radius:var(--r-panel);padding:12px 14px 14px;margin:0;min-width:0;}
fieldset.grp legend{font-family:var(--font-ui);font-size:13px;color:var(--nav-active-text);padding:0 6px;}
.usb-pick{display:flex;flex-direction:column;gap:6px;max-height:190px;overflow:auto;}
.usb-pick label{display:flex;gap:9px;align-items:center;font-size:12px;padding:6px 8px;border-radius:var(--r-ctl);background:var(--bg);border:1px solid var(--border);}
/* modal */
.modal{position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.66);display:none;align-items:flex-start;justify-content:center;
  padding:40px 18px;overflow-y:auto;}
.modal.on{display:flex;}
.modal-box{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-panel);width:100%;max-width:760px;box-shadow:0 30px 80px rgba(0,0,0,.6);}
.modal-box.wide{max-width:1060px;}
.modal-head{display:flex;align-items:center;justify-content:space-between;padding:15px 18px;border-bottom:1px solid var(--border);}
.modal-head .t{font-family:var(--font-display);font-weight:600;font-size:17px;}
.modal-body{padding:16px 18px;display:flex;flex-direction:column;gap:14px;}
.modal-foot{display:flex;justify-content:flex-end;gap:8px;padding:13px 18px;border-top:1px solid var(--border);}
.xbtn{width:30px;height:30px;border-radius:var(--r-ctl);background:var(--surface2);border:1px solid var(--border);color:var(--muted);}
.cat{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;margin-top:12px;}
.cat .card{padding:12px 14px;}
pre.log{background:var(--bg);border:1px solid var(--border);border-radius:var(--r-panel);padding:10px;font-size:13px;max-height:60vh;overflow:auto;
  white-space:pre-wrap;word-break:break-all;font-family:var(--font-ui);}
@media(max-width:900px){.two,.three,.form{grid-template-columns:1fr;} .vl{padding:16px;}}
.mos-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;}
.mos{display:block;width:100%;padding:11px 12px;border-radius:var(--r-panel);background:var(--surface2);border:1px solid var(--border);color:var(--text);cursor:pointer;}
.mos:hover{border-color:var(--accent);}
.mos.on{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 16%,var(--surface2));}
`;

function vmlabHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Metis · VM Lab</title>${FONT}${FAVICON}
<style>${BASE_CSS}${NAV_CSS}${TOAST_CSS}${VMLAB_CSS}</style></head><body>
${navBar("/vmlab")}
<div class="grid"></div>
<main class="vl">
  <div class="vl-top">
    <div>
      <div class="vl-title">VM Lab</div>
      <div class="vl-sub">Full virtual machines running on <span id="host-name">this machine</span>.</div>
    </div>
    <div class="hostpick" id="hostpick"></div>
    <div class="vl-kpis" id="kpis"></div>
  </div>
  <div id="banners"></div>
  <nav class="vl-tabs" id="tabs">
    <button class="vl-tab active" data-tab="envs"><i class="fa-solid fa-display"></i>Virtual machines <span class="n" id="n-envs">0</span></button>
    <button class="vl-tab" data-tab="images"><i class="fa-solid fa-compact-disc"></i>Operating systems <span class="n" id="n-images">0</span></button>
    <button class="vl-tab" data-tab="host"><i class="fa-solid fa-server"></i>Host</button>
    <button class="vl-tab" data-tab="usb"><i class="fa-brands fa-usb"></i>USB <span class="n" id="n-usb">0</span></button>
    <button class="vl-tab" data-tab="hosts"><i class="fa-solid fa-network-wired"></i>Hosts <span class="n" id="n-hosts">1</span></button>
  </nav>
  <section class="panel on" data-panel="envs"></section>
  <section class="panel" data-panel="images"></section>
  <section class="panel" data-panel="host"></section>
  <section class="panel" data-panel="usb"></section>
  <section class="panel" data-panel="hosts"></section>
</main>
<div class="modal" id="modal"><div class="modal-box" id="modal-box">
  <div class="modal-head"><div class="t" id="modal-title"></div><button class="xbtn" id="modal-x" aria-label="Close">✕</button></div>
  <div class="modal-body" id="modal-body"></div>
  <div class="modal-foot" id="modal-foot"></div>
</div></div>
<div class="toast" id="toast"></div>
<script>${TOAST_JS}</script>
<script src="/vmlab/shared/common.js"></script>
<script src="/vmlab/assets/vmlab.js"></script>
</body></html>`;
}

const CONSOLE_CSS = `
html,body{height:100%;overflow:hidden;}
body{padding:0;background:#050508;display:flex;flex-direction:column;}
.cbar{display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--surface);border-bottom:1px solid var(--border);flex-wrap:wrap;z-index:5;}
.cbar .name{font-weight:600;font-size:14px;display:flex;align-items:center;gap:8px;min-width:0;}
.cbar .name span.t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:32vw;}
.cbar .st{font-family:var(--font-ui);font-size:13px;color:var(--muted);}
.stage{flex:1;display:flex;min-height:0;position:relative;}
#screen{flex:1;min-width:0;background:#000;position:relative;overflow:hidden;}
#screen:focus-within{outline:none;}
.overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;z-index:4;
  background:radial-gradient(ellipse at 50% 40%,color-mix(in srgb,var(--accent) 16%,#050508),#050508 70%);color:var(--text);text-align:center;padding:20px;}
.overlay[hidden]{display:none;}
.overlay .big{font-family:var(--font-display);font-weight:600;font-size:22px;}
.overlay .small{font-family:var(--font-ui);font-size:12px;color:var(--muted);max-width:520px;line-height:1.6;}
.drawer{width:340px;flex:none;background:var(--surface);border-left:1px solid var(--border);overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:12px;}
.drawer[hidden]{display:none;}
.drawer .box{padding:12px;}
.clip-status{font-family:var(--font-ui);font-size:13px;color:var(--muted);margin-top:6px;line-height:1.5;}
#m-quality{min-width:250px;}
#m-quality button{flex-direction:column;align-items:flex-start;gap:2px;}
#m-quality button.on{background:var(--nav-active-bg);color:var(--nav-active-text);}
#m-quality .sub{font-size:12px;color:var(--muted);font-weight:400;}
.dot.good{background:var(--green);}
.dot.warn{background:var(--yellow);}
#m-conn{min-width:280px;max-width:340px;padding:12px;}
#m-conn .ct{font-weight:600;font-size:14px;margin-bottom:6px;}
#m-conn p{font-family:var(--font-ui);font-size:13px;color:var(--muted);line-height:1.5;margin:0 0 8px;}
#m-conn code{font-size:12px;word-break:break-all;}
#m-conn a.btn{margin-top:4px;}
.kbd{font-family:var(--font-ui);font-size:13px;border:1px solid var(--border);border-bottom-width:2px;border-radius:var(--r-ctl);padding:0 5px;background:var(--bg);}
@media(max-width:900px){.drawer{position:absolute;right:0;top:0;bottom:0;z-index:7;width:min(340px,90vw);}}
`;

function consoleHtml(id, host) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Metis · VM console</title>${FONT}${FAVICON}
<style>${BASE_CSS}${TOAST_CSS}${VMLAB_CSS}${CONSOLE_CSS}</style><script>${THEME_JS}</script></head><body data-env="${esc(id)}" data-host="${esc((host && host.id) || "local")}" data-host-name="${esc((host && host.name) || "")}">
<div class="cbar">
  <a class="btn sm" href="/vmlab" title="Back to VM Lab"><i class="fa-solid fa-arrow-left"></i></a>
  <span class="badge" id="c-host" hidden></span>
  <div class="name"><span class="dot" id="c-dot"></span><span class="t" id="c-name">Console</span></div>
  <span class="st" id="c-status">connecting…</span>
  <span class="spacer"></span>
  <button class="btn sm" id="b-cad" title="Send Ctrl+Alt+Del"><i class="fa-solid fa-keyboard"></i> Ctrl+Alt+Del</button>
  <div class="menu-wrap">
    <button class="btn sm" id="b-keys" title="Send special keys"><i class="fa-solid fa-angle-down"></i> Keys</button>
    <div class="menu" id="m-keys"></div>
  </div>
  <button class="btn sm" id="b-clip" title="Clipboard panel"><i class="fa-regular fa-clipboard"></i> Clipboard</button>
  <div class="menu-wrap">
    <button class="btn sm" id="b-conn" title="How this browser reaches Metis"><span class="dot" id="conn-dot"></span> <span id="conn-label">Checking…</span></button>
    <div class="menu" id="m-conn"></div>
  </div>
  <div class="menu-wrap">
    <button class="btn sm" id="b-quality" title="Picture quality: lower it for a faster console over a slow connection"><i class="fa-solid fa-gauge-high"></i> <span id="q-label">Balanced</span></button>
    <div class="menu" id="m-quality"></div>
  </div>
  <button class="btn sm" id="b-scale" title="Toggle fit to window / 1:1"><i class="fa-solid fa-expand"></i> Fit</button>
  <button class="btn sm" id="b-full" title="Full screen"><i class="fa-solid fa-maximize"></i></button>
  <div class="menu-wrap">
    <button class="btn sm" id="b-power" title="Power"><i class="fa-solid fa-power-off"></i></button>
    <div class="menu" id="m-power">
      <button data-p="stop"><i class="fa-solid fa-power-off"></i>Shut down</button>
      <button data-p="reboot"><i class="fa-solid fa-rotate"></i>Reset (hard reboot)</button>
      <hr><button data-p="force-stop" class="danger"><i class="fa-solid fa-plug-circle-xmark"></i>Force off</button>
    </div>
  </div>
</div>
<div class="stage">
  <div id="screen">
    <div class="overlay" id="overlay"><div class="big" id="ov-title">Connecting…</div><div class="small" id="ov-text"></div><div class="row" id="ov-acts"></div></div>
  </div>
  <aside class="drawer" id="drawer" hidden>
    <div class="box">
      <div class="box-h">Clipboard <span id="clip-mode" class="badge"></span></div>
      <textarea class="in" id="clip-text" rows="5" placeholder="Text copied inside the VM appears here. Type or paste here to send text to the VM."></textarea>
      <div class="row" style="margin-top:8px">
        <button class="btn sm" id="clip-send" title="Put this text on the VM's clipboard"><i class="fa-solid fa-arrow-right-to-bracket"></i> To VM</button>
        <button class="btn sm" id="clip-type" title="Type this text as keystrokes — works without guest tools, e.g. at a login prompt"><i class="fa-solid fa-keyboard"></i> Type it</button>
        <button class="btn sm" id="clip-copy" title="Copy to this computer's clipboard"><i class="fa-regular fa-copy"></i> Copy</button>
      </div>
      <div class="clip-status" id="clip-status"></div>
    </div>
    <div class="box" id="usb-box" hidden>
      <div class="box-h">USB from host <button class="btn sm" id="usb-refresh"><i class="fa-solid fa-rotate"></i></button></div>
      <div id="usb-list" class="usb-pick"></div>
    </div>
    <div class="box">
      <div class="box-h">Machine</div>
      <div class="kv" id="m-info"></div>
    </div>
  </aside>
</div>
<div class="toast" id="toast"></div>
<script>${TOAST_JS}</script>
<script src="/vmlab/shared/common.js"></script>
<script type="module" src="/vmlab/assets/console.js"></script>
</body></html>`;
}

module.exports = { CONSOLE_CSS, VMLAB_CSS, consoleHtml, vmlabHtml };
