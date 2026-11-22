const { BASE_CSS, FAVICON, FONT, NAV_CSS, THEME_JS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");
const { DOCKER_CSS } = require("./docker");

// ─── LIVE FOLDERS PAGE ────────────────────────────────────────────────────────
// Folders kept in sync on several PCs through Gridlantis-HL. Markup here; behaviour in
// src/ui/live/live.js. Borrows the Containers card language, like PC host.

const LIVE_CSS = `
.setup-steps{margin:8px 0 0;padding-left:20px;font-size:13px;line-height:1.75;}
.setup-steps code,.hint code{background:var(--bg);border:1px solid var(--border);border-radius:var(--r-ctl);padding:1px 6px;}
.cmd{display:flex;align-items:center;gap:8px;margin-top:8px;}
.cmd pre{flex:1;margin:0;padding:9px 11px;background:var(--bg);border:1px solid var(--border);border-radius:var(--r-ctl);
  overflow-x:auto;font-family:var(--font-ui);font-size:12.5px;white-space:pre;}
.sec-h{display:flex;align-items:center;gap:10px;margin:26px 0 10px;}
.sec-h h2{margin:0;font:600 13px var(--font-display);color:var(--muted);text-transform:uppercase;letter-spacing:.08em;}
.sec-h .spacer{flex:1;}
.dot.online,.dot.synced{background:var(--green);} .dot.offline{background:var(--muted);} .dot.syncing{background:var(--yellow);}
.dot.error{background:var(--red);}
.card.synced{border-color:color-mix(in srgb,var(--green) 35%,var(--border));}
.card .card-ico{cursor:default;}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;}
.chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--border);border-radius:999px;
  font-size:12px;background:var(--bg);color:var(--text);}
.chip .dot{width:7px;height:7px;}
.chip .pct{color:var(--muted);font-variant-numeric:tabular-nums;}
.tabs{display:flex;gap:6px;margin-bottom:12px;}
.picks{display:grid;gap:6px;margin-top:6px;}
.pick{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r-ctl);cursor:pointer;}
.pick input{accent-color:var(--accent);width:16px;height:16px;}
.pick small{color:var(--muted);margin-left:auto;}
.vlist{display:grid;gap:6px;max-height:55vh;overflow:auto;}
.vrow{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r-ctl);}
.vrow .vname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;}
.vrow a.vname{color:var(--text);text-decoration:none;} .vrow a.vname:hover{text-decoration:underline;}
.vrow .vmeta{color:var(--muted);font-size:12px;white-space:nowrap;}
.vrow select{max-width:190px;}
.tag{font-size:11px;padding:1px 7px;border-radius:999px;border:1px solid var(--border);color:var(--muted);}
.tag.del{color:var(--red);border-color:color-mix(in srgb,var(--red) 45%,var(--border));}
.chip.bad{border-color:color-mix(in srgb,var(--red) 50%,var(--border));}
.note .fix{margin-top:4px;font-weight:400;white-space:pre-line;}
.pcf{display:grid;gap:5px;margin-top:10px;}
.pcf-row{display:flex;align-items:center;gap:8px;font-size:12.5px;min-width:0;}
.pcf-row .dot{width:7px;height:7px;flex:none;}
.pcf-name{font-weight:600;white-space:nowrap;}
.pcf-st{color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;margin-left:auto;text-align:right;}
.pcf-st.bad{color:var(--red);}
.lastchg{margin-top:8px;font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
`;

function liveHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gridlantis-HL · Live folders</title>${FONT}${FAVICON}
<style>${BASE_CSS}${NAV_CSS}${TOAST_CSS}${DOCKER_CSS}${LIVE_CSS}</style><script>${THEME_JS}</script></head><body>
${navBar("/live")}
<div class="grid"></div>
<main class="dk">
  <div class="dk-top">
    <div>
      <div class="dk-title">Live folders</div>
      <div class="dk-sub">Folders that stay the same on every PC you pick, in real time. Gridlantis-HL keeps a copy, so PCs sync even when they are never on together.</div>
    </div>
    <div class="row">
      <button class="btn" id="b-pc"><i class="fa-solid fa-computer"></i>Add a PC</button>
      <button class="btn primary" id="b-new"><i class="fa-solid fa-folder-plus"></i>New live folder</button>
    </div>
  </div>
  <div id="banners"></div>
  <div class="sec-h"><h2>Folders</h2><span class="spacer"></span></div>
  <section id="folders"></section>
  <div class="sec-h"><h2>PCs</h2><span class="spacer"></span></div>
  <section id="pcs"></section>
</main>
<div class="modal" id="modal"><div class="modal-box" id="modal-box">
  <div class="modal-head"><div class="t" id="modal-title"></div><button class="xbtn" id="modal-x" aria-label="Close">✕</button></div>
  <div class="modal-body" id="modal-body"></div>
  <div class="modal-foot" id="modal-foot"></div>
</div></div>
<div class="toast" id="toast"></div>
<script>${TOAST_JS}</script>
<script src="/live/shared/common.js"></script>
<script src="/live/assets/live.js"></script>
</body></html>`;
}

module.exports = { liveHtml };
