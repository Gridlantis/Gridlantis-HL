const { esc } = require("../helpers");
const { BASE_CSS, FAVICON, FONT, NAV_CSS, THEME_JS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");
const { DOCKER_CSS } = require("./docker");
const { CONSOLE_CSS, VMLAB_CSS } = require("./vmlab");

// ─── PC HOST PAGE ─────────────────────────────────────────────────────────────
// The PCs Open HL can take over, and the remote-desktop viewer for one of
// them. Markup here; behaviour in src/ui/laptops/. Borrows the Containers card
// language for the list and the VM Lab console chrome for the viewer.

const LAPTOPS_CSS = `
.setup-steps{margin:8px 0 0;padding-left:20px;font-size:13px;line-height:1.75;}
.setup-steps code{background:var(--bg);border:1px solid var(--border);border-radius:var(--r-ctl);padding:1px 6px;}
.cmd{display:flex;align-items:center;gap:8px;margin-top:8px;}
.cmd pre{flex:1;margin:0;padding:9px 11px;background:var(--bg);border:1px solid var(--border);border-radius:var(--r-ctl);
  overflow-x:auto;font-family:var(--font-ui);font-size:12.5px;white-space:pre;}
.dot.online{background:var(--green);} .dot.offline{background:var(--red);} .dot.checking{background:var(--yellow);}
.card.online{border-color:color-mix(in srgb,var(--green) 40%,var(--border));}
.card .card-ico{cursor:default;}
`;

function laptopsHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open HL · PC host</title>${FONT}${FAVICON}
<style>${BASE_CSS}${NAV_CSS}${TOAST_CSS}${DOCKER_CSS}${LAPTOPS_CSS}</style><script>${THEME_JS}</script></head><body>
${navBar("/laptops")}
<div class="grid"></div>
<main class="dk">
  <div class="dk-top">
    <div>
      <div class="dk-title">PC host</div>
      <div class="dk-sub">Your PCs' desktops, one click away — Open HL signs in for you.</div>
    </div>
    <div class="row">
      <button class="btn" id="b-setup"><i class="fa-solid fa-terminal"></i>Set up a PC</button>
      <button class="btn primary" id="b-add"><i class="fa-solid fa-link"></i>Pair a PC</button>
    </div>
  </div>
  <div id="banners"></div>
  <section id="list"></section>
</main>
<div class="modal" id="modal"><div class="modal-box" id="modal-box">
  <div class="modal-head"><div class="t" id="modal-title"></div><button class="xbtn" id="modal-x" aria-label="Close">✕</button></div>
  <div class="modal-body" id="modal-body"></div>
  <div class="modal-foot" id="modal-foot"></div>
</div></div>
<div class="toast" id="toast"></div>
<script>${TOAST_JS}</script>
<script src="/laptops/shared/common.js"></script>
<script src="/laptops/assets/laptops.js"></script>
</body></html>`;
}

// On-screen keyboard for phones and tablets: a special-keys bar that sits on
// top of the phone's own keyboard (src/ui/laptops/viewer.js, "Keyboard").
const OSK_CSS = `
.osk{position:fixed;left:0;right:0;bottom:0;z-index:20;background:var(--surface);border-top:1px solid var(--border);
  padding:6px 6px calc(6px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:5px;
  box-shadow:0 -10px 30px rgba(0,0,0,.35);touch-action:manipulation;user-select:none;-webkit-user-select:none;}
.osk[hidden]{display:none;}
.osk-row{display:flex;gap:5px;overflow-x:auto;scrollbar-width:none;}
.osk-row::-webkit-scrollbar{display:none;}
.osk button{flex:1 0 auto;min-width:44px;height:40px;padding:0 10px;border:1px solid var(--border);border-radius:var(--r-ctl);
  background:var(--bg);color:var(--text);font:600 13px var(--font-ui);display:inline-flex;align-items:center;justify-content:center;gap:5px;}
.osk button:active{background:var(--raised);}
.osk button.on{background:color-mix(in srgb,var(--accent) 30%,var(--bg));border-color:var(--accent);}
.osk button.lock{background:var(--accent);color:#000;border-color:var(--accent);}
.osk-in{position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;border:0;padding:0;font-size:16px;}
.stage.with-osk{margin-bottom:var(--osk-h,0px);}
/* Pinch and double-tap belong to the viewer (zoom, double-click), not to the browser. */
#screen{touch-action:none;}
`;

function viewerHtml(laptop) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,interactive-widget=resizes-content">
<title>${esc(laptop.name)} · Open HL remote desktop</title>${FONT}${FAVICON}
<style>${BASE_CSS}${TOAST_CSS}${VMLAB_CSS}${CONSOLE_CSS}${OSK_CSS}.mon{display:flex;gap:3px;}.mon[hidden]{display:none;}</style><script>${THEME_JS}</script></head>
<body data-laptop="${esc(laptop.id)}" data-name="${esc(laptop.name)}">
<div class="cbar">
  <a class="btn sm" href="/laptops" title="Back to PC host"><i class="fa-solid fa-arrow-left"></i></a>
  <div class="name"><span class="dot" id="c-dot"></span><span class="t" id="c-name">${esc(laptop.name)}</span></div>
  <span class="st" id="c-status">connecting…</span>
  <span class="spacer"></span>
  <div class="mon" id="mon" hidden></div>
  <button class="btn sm" id="b-osk" title="On-screen keyboard (phones and tablets)"><i class="fa-regular fa-keyboard"></i> Keyboard</button>
  <button class="btn sm" id="b-cad" title="Send Ctrl+Alt+Del"><i class="fa-solid fa-keyboard"></i> Ctrl+Alt+Del</button>
  <button class="btn sm" id="b-clip" title="Clipboard panel"><i class="fa-regular fa-clipboard"></i> Clipboard</button>
  <button class="btn sm" id="b-view" title="Toggle view-only"><i class="fa-regular fa-eye"></i> View only</button>
  <button class="btn sm" id="b-scale" title="Toggle fit to window / 1:1"><i class="fa-solid fa-expand"></i> Fit</button>
  <button class="btn sm" id="b-full" title="Full screen"><i class="fa-solid fa-maximize"></i></button>
</div>
<div class="stage">
  <div id="screen">
    <div class="overlay" id="overlay"><div class="big" id="ov-title">Connecting…</div><div class="small" id="ov-text"></div><div class="row" id="ov-acts"></div></div>
  </div>
  <aside class="drawer" id="drawer" hidden>
    <div class="box">
      <div class="box-h">Clipboard</div>
      <textarea class="in" id="clip-text" rows="5" placeholder="Text copied on the PC appears here. Type or paste here to send text to it."></textarea>
      <div class="row" style="margin-top:8px">
        <button class="btn sm" id="clip-send" title="Put this text on the PC's clipboard"><i class="fa-solid fa-arrow-right-to-bracket"></i> To PC</button>
        <button class="btn sm" id="clip-type" title="Type this text as keystrokes — works at a login screen"><i class="fa-solid fa-keyboard"></i> Type it</button>
        <button class="btn sm" id="clip-copy" title="Copy to this computer's clipboard"><i class="fa-regular fa-copy"></i> Copy</button>
      </div>
    </div>
  </aside>
</div>
<div class="osk" id="osk" hidden role="toolbar" aria-label="Special keys"></div>
<textarea class="osk-in" id="osk-in" aria-label="Type on the PC" autocapitalize="off" autocomplete="off" spellcheck="false" enterkeyhint="enter"></textarea>
<div class="toast" id="toast"></div>
<script>${TOAST_JS}</script>
<script src="/laptops/shared/common.js"></script>
<script type="module" src="/laptops/assets/viewer.js"></script>
</body></html>`;
}

module.exports = { laptopsHtml, viewerHtml };
