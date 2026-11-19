const { BASE_CSS, FAVICON, FONT, NAV_CSS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");

// ─── CONNECTWORK ──────────────────────────────────────────────────────────────
// A graph of notes, flows, reminders and files, drawn on a canvas by
// src/ui/pages/connectwork.js. The left panel filters and searches, the right
// one shows the picked item, its links, and a box to link it to something else.
function connectworkHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open HL · ConnectWork</title>${FONT}${FAVICON}
<style>
${BASE_CSS}${NAV_CSS}${TOAST_CSS}
:root{--cw-note:#22b8cf;--cw-folder:#e3c24a;--cw-flow:#9b7bf0;--cw-rem:#f08c3a;--cw-file:#c45fe0;--cw-vm:#4cc76a;--cw-ctr:#3d7ff5;--cw-host:#ef5a6f;}
.cw-app{display:grid;grid-template-columns:250px minmax(0,1fr) 0;height:var(--app-h);overflow:hidden;}
.cw-app.picked{grid-template-columns:250px minmax(0,1fr) 300px;}
.cw-side,.cw-insp{background:var(--surface);overflow-y:auto;min-width:0;}
.cw-side{border-right:1px solid var(--line);padding:14px 14px 18px;display:flex;flex-direction:column;gap:16px;}
.cw-insp{border-left:1px solid var(--line);}
.cw-h{font:600 15px/1.2 var(--font-display);margin:0;}
.cw-hint{font-size:12.5px;color:var(--muted);line-height:1.45;margin:0;}
.cw-search{position:relative;}
.cw-search i{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:13px;pointer-events:none;}
.cw-input{width:100%;height:34px;padding:0 10px 0 30px;border:1px solid var(--line);border-radius:var(--r-ctl);background:var(--field);color:var(--text);font:inherit;font-size:13.5px;}
.cw-input:focus{outline:none;border-color:var(--accent);}
.cw-group{display:flex;flex-direction:column;gap:2px;}
.cw-group-t{font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin:0 0 6px;}
.cw-check{display:flex;align-items:center;gap:10px;height:32px;padding:0 8px;border-radius:var(--r-ctl);cursor:pointer;font-size:13.5px;color:var(--text-2);user-select:none;}
.cw-check:hover{background:var(--raised);color:var(--text);}
.cw-check input{position:absolute;opacity:0;pointer-events:none;}
.cw-box{width:16px;height:16px;border-radius:4px;border:1.5px solid var(--line);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.cw-check input:checked + .cw-box{background:var(--c,var(--accent));border-color:var(--c,var(--accent));}
.cw-check input:checked + .cw-box::after{content:"";width:8px;height:4px;border:2px solid #fff;border-top:0;border-right:0;transform:translateY(-1px) rotate(-45deg);}
.cw-check input:focus-visible + .cw-box{outline:2px solid var(--accent);outline-offset:2px;}
.cw-dot{width:10px;height:10px;border-radius:50%;background:var(--c);flex-shrink:0;}
.cw-check .cw-n{margin-left:auto;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;}
.cw-stats{font-size:12.5px;color:var(--muted);margin-top:auto;}
.cw-main{position:relative;min-width:0;min-height:0;background:var(--bg);}
.cw-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab;}
.cw-canvas:focus{outline:none;} .cw-main.kb .cw-canvas:focus{outline:2px solid var(--accent);outline-offset:-2px;}
.cw-canvas.panning{cursor:grabbing;} .cw-canvas.over{cursor:pointer;} .cw-canvas.linking{cursor:crosshair;}
.cw-tools{position:absolute;top:10px;right:10px;display:flex;gap:4px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-ctl);padding:3px;}
.cw-tool{height:30px;min-width:30px;padding:0 8px;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;background:none;border-radius:var(--r-ctl);color:var(--text-2);cursor:pointer;font-size:13px;}
.cw-tool:hover{background:var(--raised);color:var(--text);}
.cw-tool.on{color:var(--accent);}
.cw-tool.side{display:none;}
.cw-help{position:absolute;left:12px;bottom:10px;font-size:12px;color:var(--muted);pointer-events:none;}
.cw-menu{position:fixed;z-index:80;min-width:190px;max-width:280px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-ctl);
  box-shadow:0 10px 30px rgba(0,0,0,.35);padding:4px;display:flex;flex-direction:column;}
.cw-menu-h{display:flex;align-items:center;gap:8px;padding:6px 8px 8px;margin-bottom:4px;border-bottom:1px solid var(--line);font-size:12.5px;color:var(--muted);}
.cw-menu-h span:last-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cw-menu-i{display:flex;align-items:center;gap:10px;height:32px;padding:0 10px;border:0;background:none;border-radius:var(--r-ctl);color:var(--text);cursor:pointer;font:inherit;font-size:13.5px;text-align:left;}
.cw-menu-i i{width:14px;color:var(--muted);font-size:13px;}
.cw-menu-i:hover,.cw-menu-i:focus-visible{background:var(--raised);outline:none;}
.cw-linkbar{position:absolute;top:10px;left:50%;transform:translateX(-50%);display:none;align-items:center;gap:10px;max-width:calc(100% - 140px);
  padding:6px 6px 6px 14px;background:var(--surface);border:1px solid var(--accent);border-radius:var(--r-ctl);font-size:13px;color:var(--text-2);box-shadow:0 0 18px color-mix(in srgb,var(--accent) 35%,transparent);}
.cw-linkbar.on{display:flex;}
.cw-linkbar span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cw-linkbar b{color:var(--text);}
.cw-empty{position:absolute;inset:0;display:none;align-items:center;justify-content:center;text-align:center;padding:24px;color:var(--muted);}
.cw-empty.on{display:flex;}
.cw-empty b{display:block;color:var(--text);font-size:15px;margin-bottom:6px;}
/* Inspector */
.cw-i-head{padding:16px 16px 12px;border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:flex-start;}
.cw-i-head .cw-dot{width:12px;height:12px;margin-top:5px;}
.cw-i-t{flex:1;min-width:0;}
.cw-i-title{font:600 16px/1.3 var(--font-display);word-break:break-word;margin:0;}
.cw-i-sub{font-size:12.5px;color:var(--muted);margin-top:3px;word-break:break-word;}
.cw-x{width:28px;height:28px;border:0;background:none;color:var(--muted);border-radius:var(--r-ctl);cursor:pointer;flex-shrink:0;}
.cw-x:hover{background:var(--raised);color:var(--text);}
.cw-i-sec{padding:14px 16px;border-bottom:1px solid var(--line);}
.cw-open{display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 12px;border-radius:var(--r-ctl);background:var(--accent);color:#fff;text-decoration:none;font-size:13.5px;font-weight:500;}
.cw-open:hover{filter:brightness(1.08);}
.cw-links{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px;}
.cw-link{display:flex;align-items:center;gap:8px;min-height:34px;padding:4px 4px 4px 8px;border-radius:var(--r-ctl);}
.cw-link:hover{background:var(--raised);}
.cw-link-b{flex:1;min-width:0;border:0;background:none;color:var(--text);text-align:left;cursor:pointer;padding:0;font:inherit;font-size:13.5px;}
.cw-link-b span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cw-link-b small{display:block;font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cw-unlink{width:26px;height:26px;border:0;background:none;color:var(--muted);border-radius:var(--r-ctl);cursor:pointer;flex-shrink:0;}
.cw-unlink:hover{color:var(--fault);background:var(--surface);}
.cw-none{font-size:13px;color:var(--muted);margin:0;}
.cw-pick{position:relative;margin-top:8px;}
.cw-sugg{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:2px;max-height:280px;overflow-y:auto;}
.cw-sugg button{width:100%;display:flex;align-items:center;gap:8px;min-height:32px;padding:4px 8px;border:0;background:none;border-radius:var(--r-ctl);color:var(--text);cursor:pointer;text-align:left;font:inherit;font-size:13px;}
.cw-sugg button:hover,.cw-sugg button.on{background:var(--raised);}
.cw-sugg button span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cw-sugg small{color:var(--muted);font-size:11.5px;flex-shrink:0;}
.cw-sugg button .cw-dot{flex:0 0 10px;}
@media(max-width:900px){
  .cw-app,.cw-app.picked{grid-template-columns:minmax(0,1fr);position:relative;}
  .cw-side{position:absolute;z-index:5;top:0;left:0;bottom:0;width:min(280px,85vw);transform:translateX(-102%);transition:transform .2s;box-shadow:0 0 30px rgba(0,0,0,.35);}
  .cw-app.side-open .cw-side{transform:none;}
  .cw-tool.side{display:inline-flex;}
  .cw-insp{position:absolute;z-index:6;left:0;right:0;bottom:0;max-height:60%;border-left:0;border-top:1px solid var(--line);display:none;box-shadow:0 -10px 30px rgba(0,0,0,.3);}
  .cw-app.picked .cw-insp{display:block;}
  .cw-help{display:none;}
}
</style></head><body>
${navBar('/connectwork')}
<div class="cw-app" id="app">
  <aside class="cw-side" id="side" aria-label="Filters">
    <div>
      <h1 class="cw-h">ConnectWork</h1>
      <p class="cw-hint" style="margin-top:6px">Everything you keep, and how it connects. Pick an item to link it to another.</p>
    </div>
    <label class="cw-search"><i class="fa-solid fa-magnifying-glass"></i>
      <input class="cw-input" id="q" type="search" placeholder="Find an item" aria-label="Find an item" autocomplete="off"></label>
    <div class="cw-group" role="group" aria-labelledby="cw-show-t">
      <p class="cw-group-t" id="cw-show-t">Show</p>
      <label class="cw-check" style="--c:var(--cw-note)"><input type="checkbox" data-type="note" checked><span class="cw-box"></span><span class="cw-dot"></span>Notes<span class="cw-n" id="n-note"></span></label>
      <label class="cw-check" style="--c:var(--cw-folder)"><input type="checkbox" data-type="folder" checked><span class="cw-box"></span><span class="cw-dot"></span>Note folders<span class="cw-n" id="n-folder"></span></label>
      <label class="cw-check" style="--c:var(--cw-flow)"><input type="checkbox" data-type="flow" checked><span class="cw-box"></span><span class="cw-dot"></span>Flow spaces<span class="cw-n" id="n-flow"></span></label>
      <label class="cw-check" style="--c:var(--cw-rem)"><input type="checkbox" data-type="rem" checked><span class="cw-box"></span><span class="cw-dot"></span>Reminders<span class="cw-n" id="n-rem"></span></label>
      <label class="cw-check" style="--c:var(--cw-file)"><input type="checkbox" data-type="file" checked><span class="cw-box"></span><span class="cw-dot"></span>Files<span class="cw-n" id="n-file"></span></label>
      <label class="cw-check" style="--c:var(--cw-vm)"><input type="checkbox" data-type="vm" checked><span class="cw-box"></span><span class="cw-dot"></span>Virtual machines<span class="cw-n" id="n-vm"></span></label>
      <label class="cw-check" style="--c:var(--cw-ctr)"><input type="checkbox" data-type="ctr" checked><span class="cw-box"></span><span class="cw-dot"></span>Containers<span class="cw-n" id="n-ctr"></span></label>
      <label class="cw-check" style="--c:var(--cw-host)"><input type="checkbox" data-type="host" checked><span class="cw-box"></span><span class="cw-dot"></span>Hosts<span class="cw-n" id="n-host"></span></label>
    </div>
    <div class="cw-group">
      <p class="cw-group-t">Options</p>
      <label class="cw-check"><input type="checkbox" id="orphans" checked><span class="cw-box"></span>Unconnected items</label>
      <label class="cw-check"><input type="checkbox" id="labels"><span class="cw-box"></span>Always show names</label>
    </div>
    <p class="cw-hint">Flows link to the notes placed in them, notes link to their folder and to what they point at, including <b>[[Note title]]</b>, and virtual machines and containers link to the host they run on. Right-click an item and choose Connect to, or shift-drag from one item to another, to link them. Dotted links are suggestions from AI, turned on from the <a href="/ai">AI page</a>; keep or dismiss them in the side panel.</p>
    <div class="cw-stats" id="stats"></div>
  </aside>
  <section class="cw-main" aria-label="Graph">
    <canvas class="cw-canvas" id="cv" tabindex="0" aria-label="Graph of notes, flows, reminders, files, virtual machines, containers and hosts"></canvas>
    <div class="cw-tools">
      <button class="cw-tool side" id="t-side" type="button" title="Filters" aria-label="Filters"><i class="fa-solid fa-sliders"></i></button>
      <button class="cw-tool" id="t-fit" type="button" title="Fit everything in view" aria-label="Fit everything in view"><i class="fa-solid fa-expand"></i></button>
      <button class="cw-tool" id="t-shake" type="button" title="Lay it out again" aria-label="Lay it out again"><i class="fa-solid fa-wand-magic-sparkles"></i></button>
    </div>
    <div class="cw-linkbar" id="linkbar" role="status"><span>Click the item to connect <b></b> to</span>
      <button class="cw-x" id="linkbar-x" type="button" title="Cancel" aria-label="Cancel connecting"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="cw-help">Drag to move · scroll to zoom · double-click opens · right-click to connect</div>
    <div class="cw-empty" id="empty"></div>
  </section>
  <aside class="cw-insp" id="insp" aria-label="Selected item"></aside>
</div>
<div class="toast" id="toast"></div>
<script>
${TOAST_JS}
</script>
<script src="/ui/pages/connectwork.js"></script>
</body></html>`;
}

module.exports = { connectworkHtml };
