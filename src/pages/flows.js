const { BASE_CSS, FAVICON, FONT, NAV_CSS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");

// ─── FLOW SPACE ───────────────────────────────────────────────────────────────
// A flowchart canvas. Nodes are HTML boxes in a "world" layer that is panned and
// zoomed with one CSS transform; arrows are SVG paths in the same layer, so both
// share one coordinate system. Any node can point at a note, and a "note" node
// shows the note itself. Saves are debounced whole-flow PUTs.
//
// Client code below lives inside a template literal: no backslashes, no
// backticks and no dollar-brace anywhere in it.
function flowsHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open HL · Flow Space</title>${FONT}${FAVICON}
<style>
${BASE_CSS}${NAV_CSS}${TOAST_CSS}
.fs-app{display:grid;grid-template-columns:230px minmax(0,1fr) 280px;height:var(--app-h);overflow:hidden;}
.fs-app.no-insp{grid-template-columns:230px minmax(0,1fr) 0;}
.fs-app.no-list{grid-template-columns:0 minmax(0,1fr) 280px;}
.fs-app.no-list.no-insp{grid-template-columns:0 minmax(0,1fr) 0;}
.fs-list,.fs-insp{background:var(--surface);overflow-y:auto;min-width:0;}
.fs-list{border-right:1px solid var(--line);}
.fs-insp{border-left:1px solid var(--line);}
.fs-side-h{display:flex;align-items:center;justify-content:space-between;padding:14px 14px 10px;font:600 15px/1.2 var(--font-display);}
.fs-fl{display:flex;align-items:center;gap:8px;padding:8px 14px;cursor:pointer;border-left:2px solid transparent;}
.fs-fl:hover{background:var(--raised);}
.fs-fl.on{background:var(--raised);border-left-color:var(--accent);}
.fs-fl-b{flex:1;min-width:0;}
.fs-fl-n{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.fs-fl-m{font-size:12px;color:var(--muted);}
.fs-fl-x{opacity:0;width:26px;height:26px;border:0;background:none;color:var(--muted);border-radius:var(--r-ctl);}
.fs-fl:hover .fs-fl-x{opacity:1;}
.fs-fl-x:hover{color:var(--fault);background:var(--surface);}
.fs-main{display:flex;flex-direction:column;min-width:0;min-height:0;}
.fs-bar{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--line);background:var(--surface);flex-wrap:wrap;}
.fs-name{height:32px;width:200px;max-width:40vw;background:transparent;border:1px solid transparent;border-radius:var(--r-ctl);padding:0 8px;color:var(--text);font:600 15px var(--font-display);}
.fs-name:hover{border-color:var(--line);} .fs-name:focus{border-color:var(--accent);outline:none;background:var(--field);}
.fs-sep{width:1px;height:22px;background:var(--line);margin:0 4px;}
.fs-tool{height:32px;min-width:32px;padding:0 8px;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid transparent;background:none;border-radius:var(--r-ctl);color:var(--text-2);cursor:pointer;font-size:13px;}
.fs-tool:hover{background:var(--raised);border-color:var(--line);color:var(--text);}
.fs-tool:disabled{opacity:.4;pointer-events:none;}
.fs-tool.on{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 40%,var(--line));}
.fs-tool[draggable=true]{cursor:grab;}
.fs-shp{width:18px;height:13px;border:1.6px solid currentColor;}
.fs-shp.round{border-radius:7px;} .fs-shp.ellipse{border-radius:50%;}
.fs-shp.diamond{width:12px;height:12px;transform:rotate(45deg);}
.fs-zoom{min-width:46px;text-align:center;font-variant-numeric:tabular-nums;color:var(--muted);font-size:13px;}
.fs-status{margin-left:auto;font-size:12px;color:var(--muted);padding:0 6px;white-space:nowrap;}
.fs-status.bad{color:var(--fault);}
.fs-stage{position:relative;flex:1;overflow:hidden;touch-action:none;cursor:default;
  background-color:var(--bg);background-image:radial-gradient(circle,color-mix(in srgb,var(--text) 18%,transparent) 1px,transparent 1.2px);}
.fs-stage.panning{cursor:grabbing;}
.fs-world{position:absolute;left:0;top:0;transform-origin:0 0;}
.fs-edges{position:absolute;left:-50000px;top:-50000px;width:100000px;height:100000px;overflow:visible;pointer-events:none;}
.fs-e{fill:none;stroke-width:2;}
.fs-e.dash{stroke-dasharray:7 5;}
.fs-e.sel{stroke:var(--accent)!important;stroke-width:2.6;}
.fs-ehit{fill:none;stroke:transparent;stroke-width:16;pointer-events:stroke;cursor:pointer;}
.fs-ghost{fill:none;stroke:var(--accent);stroke-width:2;stroke-dasharray:6 4;}
.fs-node{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;
  --c:#94a3b8;background:color-mix(in srgb,var(--c) 15%,var(--surface));border:1.6px solid var(--c);border-radius:6px;
  color:var(--text);padding:8px 10px;cursor:move;user-select:none;box-sizing:border-box;}
.fs-node.sel{box-shadow:0 0 0 2px var(--bg),0 0 0 4px var(--accent);}
.fs-node.target{box-shadow:0 0 0 3px var(--accent);}
.fs-node.shape-round{border-radius:999px;}
.fs-node.shape-ellipse{border-radius:50%;}
.fs-node.shape-diamond,.fs-node.shape-text,.fs-node.shape-icon{background:transparent;border-color:transparent;}
.fs-node.shape-diamond{padding:18% 22%;}
.fs-dia{position:absolute;inset:0;width:100%;height:100%;z-index:0;overflow:visible;}
.fs-dia polygon{fill:color-mix(in srgb,var(--c) 15%,var(--surface));stroke:var(--c);stroke-width:1.6;vector-effect:non-scaling-stroke;}
.fs-node.shape-text{padding:2px 4px;}
.fs-node.shape-icon .fs-ic{font-size:34px;color:var(--c);line-height:1;margin-bottom:6px;}
.fs-node.shape-note{align-items:stretch;justify-content:flex-start;text-align:left;border-left-width:5px;padding:8px 10px;overflow:hidden;}
.fs-note-h{font-weight:600;display:flex;gap:6px;align-items:baseline;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.fs-note-h i{color:var(--c);}
.fs-note-b{font-size:12px;color:var(--text-2);line-height:1.45;margin-top:4px;overflow:hidden;flex:1;white-space:pre-wrap;word-break:break-word;}
.fs-txt{position:relative;z-index:1;white-space:pre-wrap;word-break:break-word;line-height:1.3;outline:none;max-width:100%;}
.fs-txt[contenteditable]{cursor:text;user-select:text;min-width:20px;background:color-mix(in srgb,var(--bg) 40%,transparent);border-radius:3px;}
.fs-node.shape-note .fs-txt{font-size:12px;color:var(--muted);margin-top:4px;}
.fs-node.s-s{font-size:12px;} .fs-node.s-m{font-size:14px;} .fs-node.s-l{font-size:18px;font-weight:600;}
.fs-link{position:absolute;top:-10px;right:-10px;z-index:3;width:22px;height:22px;border-radius:11px;background:var(--surface);border:1px solid var(--line-strong);
  color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer;text-decoration:none;}
.fs-link:hover{background:var(--accent);color:var(--accent-ink);}
.fs-port{position:absolute;z-index:4;width:12px;height:12px;border-radius:6px;background:var(--surface);border:2px solid var(--accent);opacity:0;cursor:crosshair;}
.fs-node:hover .fs-port,.fs-node.sel .fs-port{opacity:1;}
.fs-port:hover{background:var(--accent);transform:scale(1.25);}
.fs-port[data-side=t]{top:-7px;left:calc(50% - 6px);} .fs-port[data-side=b]{bottom:-7px;left:calc(50% - 6px);}
.fs-port[data-side=l]{left:-7px;top:calc(50% - 6px);} .fs-port[data-side=r]{right:-7px;top:calc(50% - 6px);}
.fs-rz{position:absolute;z-index:4;right:-6px;bottom:-6px;width:12px;height:12px;background:var(--accent);border-radius:2px;cursor:nwse-resize;display:none;}
.fs-node.sel.only .fs-rz{display:block;}
.fs-elabel{position:absolute;transform:translate(-50%,-50%);background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:1px 6px;font-size:12px;
  color:var(--text-2);white-space:pre;cursor:pointer;z-index:2;outline:none;}
.fs-elabel.sel{border-color:var(--accent);color:var(--text);}
.fs-elabel[contenteditable]{cursor:text;min-width:24px;}
.fs-marquee{position:absolute;border:1px dashed var(--accent);background:color-mix(in srgb,var(--accent) 8%,transparent);display:none;pointer-events:none;}
.fs-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;color:var(--muted);text-align:center;line-height:1.7;padding:20px;}
.fs-empty b{color:var(--text-2);}
.fs-insp-b{padding:0 14px 16px;display:flex;flex-direction:column;gap:14px;}
.fs-lbl{font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;}
.fs-in,.fs-sel,.fs-ta{width:100%;background:var(--field);border:1px solid var(--line);border-radius:var(--r-ctl);color:var(--text);padding:0 10px;height:32px;outline:none;font:inherit;}
.fs-ta{height:auto;min-height:70px;padding:8px 10px;resize:vertical;line-height:1.45;}
.fs-in:focus,.fs-sel:focus,.fs-ta:focus{border-color:var(--accent);}
.fs-sw{display:flex;flex-wrap:wrap;gap:6px;}
.fs-sw button{width:24px;height:24px;border-radius:12px;border:2px solid transparent;background:var(--c);cursor:pointer;}
.fs-sw button.on{border-color:var(--text);}
.fs-seg{display:flex;border:1px solid var(--line);border-radius:var(--r-ctl);overflow:hidden;}
.fs-seg button{flex:1;height:30px;border:0;background:none;color:var(--text-2);cursor:pointer;font-size:13px;}
.fs-seg button+button{border-left:1px solid var(--line);}
.fs-seg button.on{background:var(--raised);color:var(--accent);}
.fs-row{display:flex;gap:6px;flex-wrap:wrap;}
.fs-row .m-btn{height:30px;font-size:13px;padding:0 10px;}
.fs-notecard{border:1px solid var(--line);border-radius:var(--r-ctl);padding:8px 10px;background:var(--raised);}
.fs-notecard b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.fs-help{font-size:13px;color:var(--text-2);line-height:1.6;}
.fs-help kbd{font-family:var(--font-mono);font-size:11.5px;background:var(--raised);border:1px solid var(--line);border-radius:4px;padding:0 4px;}
.fs-modal{position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.45);display:none;align-items:flex-start;justify-content:center;padding:10vh 16px 16px;}
.fs-modal.on{display:flex;}
.fs-mbox{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-panel);width:min(520px,100%);max-height:75vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.4);}
.fs-mh{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line);}
.fs-mh input{flex:1;}
.fs-ml{overflow-y:auto;padding:6px;}
.fs-mi{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border:0;background:none;color:var(--text);text-align:left;border-radius:var(--r-ctl);cursor:pointer;font:inherit;}
.fs-mi:hover,.fs-mi.hl{background:var(--raised);}
.fs-mi small{color:var(--muted);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.fs-mi span{min-width:0;flex:1;}
.fs-icons{display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:4px;padding:8px;overflow-y:auto;}
.fs-icons button{height:44px;border:1px solid transparent;border-radius:var(--r-ctl);background:none;color:var(--text-2);font-size:18px;cursor:pointer;}
.fs-icons button:hover{background:var(--raised);border-color:var(--line);color:var(--accent);}
.c-slate{--c:#94a3b8;} .c-blue{--c:#4f8ff7;} .c-teal{--c:#2dd4bf;} .c-green{--c:#22c55e;} .c-amber{--c:#f59e0b;}
.c-orange{--c:#fb923c;} .c-red{--c:#ef4444;} .c-violet{--c:#a78bfa;} .c-pink{--c:#f472b6;}
@media(max-width:900px){
  .fs-app,.fs-app.no-insp,.fs-app.no-list,.fs-app.no-list.no-insp{grid-template-columns:minmax(0,1fr);position:relative;}
  .fs-list{position:absolute;z-index:20;left:0;top:0;bottom:0;width:240px;box-shadow:8px 0 24px rgba(0,0,0,.3);}
  .fs-app.no-list .fs-list{display:none;}
  .fs-insp{position:absolute;z-index:20;left:0;right:0;bottom:0;max-height:45%;border-left:0;border-top:1px solid var(--line);}
  .fs-app.no-insp .fs-insp{display:none;}
  .fs-name{width:130px;flex-shrink:0;}
  .fs-bar{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;}
  .fs-bar>*{flex-shrink:0;}
}
</style></head><body>
${navBar('/flows')}
<div class="fs-app no-insp" id="app">
  <aside class="fs-list" aria-label="Flows">
    <div class="fs-side-h">Flows<button class="fs-tool" id="fs-new" title="New flow"><i class="fa-solid fa-plus"></i></button></div>
    <div id="fs-flows"></div>
  </aside>
  <section class="fs-main">
    <div class="fs-bar" role="toolbar" aria-label="Flow tools">
      <button class="fs-tool" id="fs-list-t" title="Show or hide the flow list" aria-label="Flow list"><i class="fa-solid fa-bars-staggered"></i></button>
      <input class="fs-name" id="fs-name" aria-label="Flow name" placeholder="Untitled flow">
      <span class="fs-sep"></span>
      <button class="fs-tool" draggable="true" data-add="rect" title="Process box (drag onto the canvas)"><span class="fs-shp"></span></button>
      <button class="fs-tool" draggable="true" data-add="round" title="Start or end"><span class="fs-shp round"></span></button>
      <button class="fs-tool" draggable="true" data-add="diamond" title="Decision"><span class="fs-shp diamond"></span></button>
      <button class="fs-tool" draggable="true" data-add="ellipse" title="Circle"><span class="fs-shp ellipse"></span></button>
      <button class="fs-tool" draggable="true" data-add="text" title="Text"><i class="fa-solid fa-font"></i></button>
      <button class="fs-tool" draggable="true" data-add="icon" title="Icon"><i class="fa-regular fa-face-smile"></i></button>
      <button class="fs-tool" draggable="true" data-add="note" title="Note from Notes"><i class="fa-regular fa-note-sticky"></i>Note</button>
      <span class="fs-sep"></span>
      <button class="fs-tool" id="fs-undo" title="Undo (Ctrl+Z)" aria-label="Undo"><i class="fa-solid fa-rotate-left"></i></button>
      <button class="fs-tool" id="fs-redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><i class="fa-solid fa-rotate-right"></i></button>
      <span class="fs-sep"></span>
      <button class="fs-tool" id="fs-zout" title="Zoom out" aria-label="Zoom out"><i class="fa-solid fa-minus"></i></button>
      <span class="fs-zoom" id="fs-zoom">100%</span>
      <button class="fs-tool" id="fs-zin" title="Zoom in" aria-label="Zoom in"><i class="fa-solid fa-plus"></i></button>
      <button class="fs-tool" id="fs-fit" title="Fit everything in view" aria-label="Fit"><i class="fa-solid fa-expand"></i></button>
      <button class="fs-tool on" id="fs-snap" title="Snap to grid" aria-label="Snap to grid"><i class="fa-solid fa-border-all"></i></button>
      <span class="fs-status" id="fs-status"></span>
    </div>
    <div class="fs-stage" id="stage">
      <div class="fs-world" id="world">
        <svg class="fs-edges" aria-hidden="true">
          <defs><marker id="fs-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker></defs>
          <g transform="translate(50000,50000)"><g id="eg"></g><path class="fs-ghost" id="ghost" style="display:none"/></g>
        </svg>
        <div id="nodes"></div>
        <div id="labels"></div>
      </div>
      <div class="fs-marquee" id="marquee"></div>
      <div class="fs-empty" id="empty"></div>
    </div>
  </section>
  <aside class="fs-insp" id="insp" aria-label="Properties"></aside>
</div>
<div class="fs-modal" id="modal"><div class="fs-mbox" role="dialog" aria-modal="true" id="mbox"></div></div>
<div class="toast" id="toast"></div>
<script>
${TOAST_JS}
</script>
<script src="/ui/pages/flows.js"></script>
</body></html>`;
}

module.exports = { flowsHtml };
