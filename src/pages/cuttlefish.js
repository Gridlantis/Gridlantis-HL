const { BASE_CSS, FAVICON, FONT, NAV_CSS, THEME_JS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");
const { VMLAB_CSS } = require("./vmlab");

// ─── VM LAB · CUTTLEFISH PAGES ───────────────────────────────────────────────
// The group page (status, start/stop, a card per phone) and the "all phones"
// wall, which tiles the Mobile host mirror for each running phone. Behaviour
// is in src/ui/cuttlefish/.

const CF_CSS = `
.dot.Running{background:var(--green);} .dot.Stopped{background:var(--muted);} .dot.busy{background:var(--yellow);animation:blink 1s infinite;}
.card.Running{border-color:color-mix(in srgb,var(--green) 45%,var(--border));}
.drop{border:1px dashed var(--border);border-radius:var(--r-panel);padding:12px 14px;font-size:13px;color:var(--muted);margin-top:14px;}
.drop.over{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,transparent);color:var(--text);}
.res{font-family:var(--font-ui);font-size:13px;margin-top:6px;line-height:1.6;}
`;

function cuttlefishHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gridlantis-HL · Cuttlefish</title>${FONT}${FAVICON}
<style>${BASE_CSS}${NAV_CSS}${TOAST_CSS}${VMLAB_CSS}${CF_CSS}</style><script>${THEME_JS}</script></head><body>
${navBar("/vmlab")}
<div class="grid"></div>
<main class="vl">
  <div class="vl-top">
    <div>
      <div class="row"><a class="btn sm" href="/vmlab" title="Back to VM Lab"><i class="fa-solid fa-arrow-left"></i></a>
        <div class="vl-title">Cuttlefish</div></div>
      <div class="vl-sub">Google's virtual Android phones on this machine, run by <code class="mono">cvd</code> from <span class="mono" id="cf-dir"></span>.</div>
    </div>
    <div class="row" id="cf-actions"></div>
  </div>
  <div id="banners"></div>
  <section id="groups"></section>
  <div class="drop" id="drop"><i class="fa-solid fa-box-open"></i>
    Drop an <b>.apk</b> here, or <button class="btn sm" id="b-apk"><i class="fa-solid fa-upload"></i> choose one</button>, to install it on every running phone.
    <input type="file" id="f-apk" accept=".apk" hidden>
    <div class="res" id="apk-res"></div>
  </div>
</main>
<div class="modal" id="modal"><div class="modal-box" id="modal-box">
  <div class="modal-head"><div class="t" id="modal-title"></div><button class="xbtn" id="modal-x" aria-label="Close">✕</button></div>
  <div class="modal-body" id="modal-body"></div>
  <div class="modal-foot" id="modal-foot"></div>
</div></div>
<div class="toast" id="toast"></div>
<script>${TOAST_JS}</script>
<script src="/vmlab/shared/common.js"></script>
<script src="/vmlab/cuttlefish/assets/cuttlefish.js"></script>
</body></html>`;
}

const WALL_CSS = `
html,body{height:100%;overflow:hidden;}
body{padding:0;display:flex;flex-direction:column;background:#050508;}
.cbar{display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--surface);border-bottom:1px solid var(--border);}
.cbar .t{font-weight:600;font-size:14px;}
.wall{flex:1;display:grid;gap:6px;padding:6px;min-height:0;}
.wall iframe{width:100%;height:100%;border:1px solid var(--border);border-radius:var(--r-panel);background:#000;}
.wall .none{color:var(--muted);font-family:var(--font-ui);font-size:13px;margin:auto;text-align:center;}
`;

function wallHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gridlantis-HL · All Cuttlefish phones</title>${FONT}${FAVICON}
<style>${BASE_CSS}${TOAST_CSS}${VMLAB_CSS}${WALL_CSS}</style><script>${THEME_JS}</script></head><body>
<div class="cbar">
  <a class="btn sm" href="/vmlab/cuttlefish" title="Back to Cuttlefish"><i class="fa-solid fa-arrow-left"></i></a>
  <span class="t">All phones</span><span class="st" id="w-count"></span>
  <span class="spacer"></span>
  <button class="btn sm" id="w-reload" title="Reconnect every mirror"><i class="fa-solid fa-rotate"></i> Reconnect</button>
</div>
<div class="wall" id="wall"></div>
<div class="toast" id="toast"></div>
<script>${TOAST_JS}</script>
<script src="/vmlab/shared/common.js"></script>
<script src="/vmlab/cuttlefish/assets/wall.js"></script>
</body></html>`;
}

module.exports = { cuttlefishHtml, wallHtml };
