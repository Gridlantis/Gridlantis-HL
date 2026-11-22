const { BASE_CSS, FAVICON, FONT, NAV_CSS, THEME_JS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");

// ─── DOCKER PAGE ─────────────────────────────────────────────────────────────
// Markup and styles here; behaviour in src/ui/docker/docker.js. Deliberately
// reuses the VM Lab visual language — same cards, badges, tabs and meters — so
// containers and VMs read as two halves of one thing.

const DOCKER_CSS = `
.dk{position:relative;z-index:1;max-width:1480px;margin:0 auto;padding:24px 26px 60px;}
.dk-top{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:16px;}
.dk-title{font-family:var(--font-display);font-weight:600;font-size:28px;}
.dk-sub{font-family:var(--font-ui);font-size:13px;color:var(--muted);margin-top:3px;}
.dk-kpis{display:flex;gap:10px;flex-wrap:wrap;}
.kpi{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-panel);padding:9px 14px;min-width:112px;}
.kpi .k{font-family:var(--font-ui);font-size:12px;color:var(--muted);}
.kpi .v{font-family:var(--font-display);font-weight:600;font-size:19px;margin-top:2px;white-space:nowrap;}
.banner{border:1px solid color-mix(in srgb,var(--yellow) 45%,transparent);background:color-mix(in srgb,var(--yellow) 10%,var(--surface));
  color:var(--text);border-radius:var(--r-panel);padding:12px 16px;font-size:12.5px;line-height:1.55;margin-bottom:12px;}
.banner.bad{border-color:color-mix(in srgb,var(--red) 50%,transparent);background:color-mix(in srgb,var(--red) 10%,var(--surface));}
.banner b{display:block;margin-bottom:3px;}
.banner pre{margin:8px 0 0;padding:9px 11px;background:var(--bg);border:1px solid var(--border);border-radius:var(--r-ctl);
  overflow-x:auto;font-family:var(--font-ui);font-size:12px;line-height:1.7;white-space:pre;}
.mono,code{font-family:var(--font-ui);font-size:13px;}

.dk-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 18px;border-bottom:1px solid var(--border);padding-bottom:12px;}
.dk-tab{display:flex;align-items:center;gap:8px;padding:8px 15px;border-radius:var(--r-panel);font-size:12.5px;font-weight:600;
  background:var(--surface);border:1px solid var(--border);color:var(--muted);cursor:pointer;}
.dk-tab:hover{color:var(--text);border-color:color-mix(in srgb,var(--accent) 50%,var(--border));}
.dk-tab.active{background:var(--nav-active-bg);border-color:var(--nav-active-border);color:var(--nav-active-text);}
.dk-tab .n{font-size:13px;background:var(--surface2);border-radius:99px;padding:1px 7px;color:var(--muted);}
.panel{display:none;} .panel.on{display:block;}

.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.spacer{flex:1;}
.sec-t{font-family:var(--font-display);font-weight:600;font-size:17px;}
.sec-s{font-family:var(--font-ui);font-size:12.5px;color:var(--muted);}
.hint{font-family:var(--font-ui);font-size:12px;color:var(--muted);margin-top:4px;line-height:1.5;}
.empty{border:1px dashed var(--border);border-radius:var(--r-panel);padding:34px 20px;text-align:center;color:var(--muted);
  font-size:13px;margin-top:16px;line-height:1.6;}
.empty b{display:block;font-family:var(--font-display);font-size:16px;color:var(--text);margin-bottom:6px;}

.grid-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px;margin-top:14px;}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-panel);padding:14px 15px;display:flex;flex-direction:column;gap:11px;}
.card.running{border-color:color-mix(in srgb,var(--green) 40%,var(--border));}
.card-h{display:flex;align-items:flex-start;gap:11px;}
.card-ico{width:34px;height:34px;flex:none;border-radius:var(--r-ctl);background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:15px;}
.card-name{font-family:var(--font-display);font-weight:600;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.card-meta{font-family:var(--font-ui);font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.card-acts{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:auto;padding-top:3px;}
.badges{display:flex;gap:6px;flex-wrap:wrap;}
.badge{font-family:var(--font-ui);font-size:12px;padding:2px 8px;border-radius:99px;background:var(--surface2);color:var(--muted);border:1px solid var(--border);}
.badge.g{color:var(--green);border-color:color-mix(in srgb,var(--green) 40%,transparent);}
.badge.y{color:var(--yellow);border-color:color-mix(in srgb,var(--yellow) 40%,transparent);}
.badge.r{color:var(--red);border-color:color-mix(in srgb,var(--red) 40%,transparent);}
.badge.a{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 40%,transparent);}
.dot{width:8px;height:8px;border-radius:50%;background:var(--muted);flex:none;}
.dot.running{background:var(--green);} .dot.exited{background:var(--muted);} .dot.created{background:var(--yellow);}
.dot.paused{background:var(--yellow);} .dot.restarting{background:var(--yellow);} .dot.dead{background:var(--red);}
.kv{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:13px;margin-top:2px;font-family:var(--font-ui);}
.kv .k{color:var(--muted);} .kv .v{overflow:hidden;text-overflow:ellipsis;}
.usage{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.meter .l{display:flex;justify-content:space-between;font-family:var(--font-ui);font-size:12px;color:var(--muted);margin-bottom:4px;}
.meter .t{height:5px;border-radius:var(--r-ctl);background:var(--border);overflow:hidden;}
.meter .t i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));}
.progress{height:6px;border-radius:var(--r-ctl);background:var(--border);overflow:hidden;margin-top:7px;}
.progress i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));transition:width .3s;}
.note{border:1px solid var(--border);background:var(--bg);border-radius:var(--r-ctl);padding:8px 10px;font-size:12px;color:var(--muted);line-height:1.5;}
.note.bad{border-color:color-mix(in srgb,var(--red) 45%,transparent);color:var(--red);}

table.tbl{width:100%;border-collapse:collapse;font-size:12px;}
.tbl-wrap{overflow-x:auto;margin-top:14px;border:1px solid var(--border);border-radius:var(--r-panel);}
.tbl th{text-align:left;font-family:var(--font-ui);font-size:12px;color:var(--muted);font-weight:600;padding:9px 12px;background:var(--surface2);white-space:nowrap;}
.tbl td{padding:9px 12px;border-bottom:1px solid var(--border);vertical-align:middle;}
.tbl tr:last-child td{border-bottom:none;}

.btn{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:var(--r-ctl);border:1px solid var(--border);
  background:var(--surface);color:var(--text);font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;}
.btn:hover{border-color:color-mix(in srgb,var(--accent) 50%,var(--border));}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--on-accent,#06121a);}
.btn.ok{color:var(--green);border-color:color-mix(in srgb,var(--green) 45%,transparent);}
.btn.danger{color:var(--red);border-color:color-mix(in srgb,var(--red) 40%,transparent);}
.btn.sm{padding:5px 10px;font-size:12px;}
.btn:disabled{opacity:.55;cursor:default;}
.in{width:100%;padding:8px 11px;border-radius:var(--r-ctl);border:1px solid var(--border);background:var(--bg);color:var(--text);
  font-size:13px;font-family:inherit;}
textarea.in{min-height:70px;resize:vertical;font-family:var(--font-ui);font-size:13px;}
.form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 14px;}
.fld{display:flex;flex-direction:column;gap:5px;} .fld.full,.full{grid-column:1/-1;}
.fld label,.lbl{font-family:var(--font-ui);font-size:12px;color:var(--muted);}
.grp{border:1px solid var(--border);border-radius:var(--r-panel);padding:12px 14px;margin:0;}
.grp legend{font-family:var(--font-ui);font-size:12px;color:var(--muted);padding:0 6px;}
.switch{display:flex;align-items:center;gap:9px;font-size:12.5px;cursor:pointer;}
.rowset{display:flex;flex-direction:column;gap:8px;}
.rowset .r{display:grid;grid-template-columns:1fr 1fr auto auto;gap:8px;align-items:center;}
.rowset .r.vol{grid-template-columns:1.4fr 1fr auto auto;}
.rowset .r.env{grid-template-columns:1fr 1.4fr auto;}
.xbtn{background:none;border:none;color:var(--muted);font-size:16px;cursor:pointer;padding:2px 6px;}
.xbtn:hover{color:var(--red);}

.menu-wrap{position:relative;}
.menu{position:absolute;right:0;top:calc(100% + 5px);min-width:210px;background:var(--surface);border:1px solid var(--border);
  border-radius:var(--r-panel);box-shadow:0 14px 42px rgba(0,0,0,.34);padding:5px;display:none;z-index:40;}
.menu.on{display:block;}
.menu button{display:flex;align-items:center;gap:9px;width:100%;padding:7px 10px;border:none;background:none;color:var(--text);
  font-size:12.5px;text-align:left;border-radius:var(--r-ctl);cursor:pointer;font-family:inherit;}
.menu button:hover{background:var(--surface2);} .menu button.danger{color:var(--red);}
.menu hr{border:none;border-top:1px solid var(--border);margin:4px 2px;}

.modal{position:fixed;inset:0;background:rgba(4,6,10,.62);backdrop-filter:blur(3px);display:none;align-items:center;justify-content:center;z-index:70;padding:20px;}
.modal.on{display:flex;}
.modal-box{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-panel);width:min(660px,100%);max-height:88vh;display:flex;flex-direction:column;}
.modal-box.wide{width:min(940px,100%);}
.modal-head{display:flex;align-items:center;gap:12px;padding:14px 17px;border-bottom:1px solid var(--border);}
.modal-head .t{font-family:var(--font-display);font-weight:600;font-size:17px;flex:1;}
.modal-body{padding:16px 17px;overflow-y:auto;}
.modal-foot{display:flex;justify-content:flex-end;gap:9px;padding:12px 17px;border-top:1px solid var(--border);}
pre.log{background:#05070b;color:#cfe3f5;border-radius:var(--r-panel);padding:12px 14px;max-height:56vh;overflow:auto;
  font-family:var(--font-ui);font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-all;margin:12px 0 0;}
#term{height:min(62vh,520px);width:100%;background:#05070b;border-radius:var(--r-panel);padding:8px;}
.term-bar{display:flex;align-items:center;gap:9px;margin-bottom:8px;}
@media(max-width:900px){.form{grid-template-columns:1fr;} .dk{padding:16px;} .usage{grid-template-columns:1fr;}
  .rowset .r,.rowset .r.vol,.rowset .r.env{grid-template-columns:1fr 1fr auto;}}
`;

function dockerHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gridlantis-HL · Containers</title>${FONT}${FAVICON}
<link rel="stylesheet" href="/docker/vendor/xterm.css">
<style>${BASE_CSS}${NAV_CSS}${TOAST_CSS}${DOCKER_CSS}</style><script>${THEME_JS}</script></head><body>
${navBar("/docker")}
<div class="grid"></div>
<main class="dk">
  <div class="dk-top">
    <div>
      <div class="dk-title">Containers</div>
      <div class="dk-sub">Docker containers and images on <span id="host-name">this machine</span>.</div>
    </div>
    <div class="dk-kpis" id="kpis"></div>
  </div>
  <div id="banners"></div>

  <nav class="dk-tabs" id="tabs">
    <button class="dk-tab active" data-tab="containers"><i class="fa-solid fa-cubes"></i>Containers <span class="n" id="n-containers">0</span></button>
    <button class="dk-tab" data-tab="images"><i class="fa-solid fa-layer-group"></i>Images <span class="n" id="n-images">0</span></button>
  </nav>

  <section class="panel on" data-panel="containers"></section>
  <section class="panel" data-panel="images"></section>
</main>
<div class="modal" id="modal"><div class="modal-box" id="modal-box">
  <div class="modal-head"><div class="t" id="modal-title"></div><button class="xbtn" id="modal-x" aria-label="Close">✕</button></div>
  <div class="modal-body" id="modal-body"></div>
  <div class="modal-foot" id="modal-foot"></div>
</div></div>
<div class="toast" id="toast"></div>
<script>${TOAST_JS}</script>
<script src="/docker/vendor/xterm.js"></script>
<script src="/docker/vendor/addon-fit.js"></script>
<script src="/docker/shared/common.js"></script>
<script src="/docker/assets/docker.js"></script>
</body></html>`;
}

module.exports = { DOCKER_CSS, dockerHtml };
