const { BASE_CSS, FAVICON, FONT, GAMEPAD_CSS, NAV_CSS, SSE_JS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");

function notesHtml() {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open HL \xb7 Notes</title>${FONT}${FAVICON}
<style>
${BASE_CSS}${NAV_CSS}${TOAST_CSS}${GAMEPAD_CSS}
/* Notes keeps its own HUD typography inside the shared shell. */
body{font-family:'Syne',sans-serif;font-size:16px;line-height:normal;font-variant-numeric:normal;}
.m-nav,.m-pulse,.toast{font-family:var(--font-ui);font-size:14px;line-height:1.5;}
/* ── HUD tokens ──────────────────────────────────────────────────────────────
   Defined on BODY, not on .notes-layout. The editor modal, preview panel and
   selection toolbar are all rendered as siblings of .notes-layout, so tokens
   scoped to it were undefined there — and an undefined var() inside color-mix()
   is invalid at computed-value time, which resets the property to its INITIAL
   value rather than falling back. That silently erased borders, focus rings and
   the highlight background across 30 rules. */
body{
  --line:color-mix(in srgb,var(--text) 62%,transparent);
  --line-dim:color-mix(in srgb,var(--text) 20%,transparent);
  --fill:color-mix(in srgb,var(--surface2) 82%,transparent);
  --glow:var(--accent2);
  /* Highlighter: literal colours, no color-mix. A highlight that silently
     disappears is worse than one that clashes with a theme. */
  --hl:#fde047;
  --hl-text:#171717;
}
.notes-layout{display:flex;gap:0;min-height:100vh;position:relative;}
/* industrial backdrop, generated rather than a photo */
.notes-layout::before{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;
  background:
    radial-gradient(ellipse at 22% 12%,color-mix(in srgb,var(--accent) 16%,transparent) 0%,transparent 55%),
    radial-gradient(ellipse at 84% 78%,color-mix(in srgb,var(--accent2) 14%,transparent) 0%,transparent 55%),
    repeating-linear-gradient(0deg,transparent 0 3px,rgba(0,0,0,.16) 3px 4px);}

/* ── FOLDER SIDEBAR (kept, restyled) ── */
.notes-sidebar{width:236px;flex-shrink:0;border-right:1px solid var(--line-dim);padding:20px 14px;
  background:color-mix(in srgb,var(--surface) 88%,transparent);display:flex;flex-direction:column;
  position:relative;z-index:2;transition:width .2s ease,padding .2s ease,opacity .2s ease;}
.notes-sidebar.collapsed{width:0!important;padding:0!important;overflow:hidden;}
/* Only the CONTENT collapses. The toggle is a sibling of the sidebar, not a
   child, because a restore button that lives inside the thing it restores gets
   clipped to nothing by width:0/overflow:hidden and can never be clicked again. */
.notes-sidebar.collapsed > *{opacity:0;visibility:hidden;}
.sidebar-toggle{position:absolute;top:50%;transform:translateY(-50%);left:236px;width:26px;height:56px;
  background:var(--surface);border:1px solid var(--line-dim);border-left:none;display:flex;align-items:center;
  justify-content:center;font-size:11px;color:var(--muted);z-index:20;
  clip-path:polygon(0 0,100% 8px,100% calc(100% - 8px),0 100%);
  transition:left .2s ease,color .15s,background .15s;}
.sidebar-toggle:hover{background:var(--surface2);color:var(--glow);}
.notes-layout.folders-hidden .sidebar-toggle{left:0;}
/* A visible cue that folders are hidden, so the collapsed state is never a mystery */
.folders-peek{position:absolute;top:50%;transform:translateY(-50%) rotate(180deg);left:2px;
  writing-mode:vertical-rl;font-family:'Space Mono',monospace;font-size:9px;letter-spacing:.2em;
  text-transform:uppercase;color:var(--muted);pointer-events:none;z-index:19;display:none;}
.notes-layout.folders-hidden .folders-peek{display:block;left:30px;}
.sidebar-title{font-size:9px;text-transform:uppercase;letter-spacing:.22em;color:var(--muted);
  font-family:'Space Mono',monospace;margin-bottom:12px;padding:0 2px;display:flex;align-items:center;gap:8px;}
.sidebar-title::after{content:'';flex:1;height:1px;background:var(--line-dim);}
.folder-list{display:flex;flex-direction:column;gap:4px;margin-bottom:14px;flex:1;overflow-y:auto;}
.folder-item{display:flex;align-items:center;gap:8px;padding:8px 11px;cursor:pointer;font-size:12.5px;
  font-weight:600;border:1px solid transparent;position:relative;transition:background .12s,border-color .12s,color .12s;
  clip-path:polygon(9px 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%,0 9px);
  background:color-mix(in srgb,var(--surface2) 60%,transparent);}
.folder-item:hover{background:color-mix(in srgb,var(--glow) 14%,transparent);color:var(--text);}
.folder-item.active{background:color-mix(in srgb,var(--glow) 24%,transparent);color:var(--text);}
.folder-emoji{font-size:14px;flex-shrink:0;cursor:pointer;user-select:none;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;
  border-radius:5px;color:var(--glow);transition:background .12s;}
.folder-emoji i{font-size:13px;}
.folder-emoji:hover{background:color-mix(in srgb,var(--glow) 22%,transparent);}
.folder-item.active .folder-emoji{color:var(--text);}
.nfolder i{margin-right:5px;font-size:.95em;}
.folder-count{font-size:9.5px;color:var(--muted);font-family:'Space Mono',monospace;margin-left:auto;flex-shrink:0;}
.del-folder{opacity:0;font-size:10px;color:var(--muted);background:transparent;border:none;padding:0 2px;
  line-height:1;flex-shrink:0;}
.folder-item:hover .del-folder{opacity:1;}
.del-folder:hover{color:var(--red)!important;}
.emoji-popover{position:fixed;z-index:500;background:var(--surface);border:1px solid var(--line-dim);
  padding:8px;box-shadow:0 8px 32px rgba(0,0,0,.6);display:none;flex-wrap:wrap;gap:4px;width:252px;
  clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px);}
.emoji-popover.open{display:flex;}
.ep-item{font-size:14px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;color:var(--text);
  background:transparent;border:none;transition:background .1s;}
.ep-item.on{background:color-mix(in srgb,var(--glow) 30%,transparent);}
.ep-item:hover{background:color-mix(in srgb,var(--glow) 25%,transparent);}
.add-folder-form{display:flex;gap:5px;}
.add-folder-input{flex:1;background:var(--bg);border:1px solid var(--line-dim);padding:7px 10px;color:var(--text);
  font-size:11px;font-family:'Space Mono',monospace;outline:none;min-width:0;
  clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px);}
.add-folder-input:focus{border-color:var(--glow);}
.btn-add-folder{background:color-mix(in srgb,var(--glow) 20%,transparent);border:1px solid var(--line-dim);
  color:var(--text);padding:7px 12px;font-size:12px;flex-shrink:0;
  clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px);}
.btn-add-folder:hover{background:color-mix(in srgb,var(--glow) 34%,transparent);}

/* ── MAIN HUD ── */
.notes-main{flex:1;padding:22px 26px 28px;min-width:0;display:flex;flex-direction:column;position:relative;z-index:2;}

/* title with the angled rule from the reference */
.hud-title-row{display:flex;flex-direction:column;align-items:center;gap:9px;margin-bottom:4px;}
.hud-title{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(20px,2.6vw,30px);
  letter-spacing:.16em;text-transform:uppercase;color:var(--text);text-align:center;
  text-shadow:0 0 22px color-mix(in srgb,var(--glow) 55%,transparent);}
.hud-rule{width:min(560px,88%);height:12px;position:relative;}
.hud-rule::before{content:'';position:absolute;left:0;right:64px;top:5px;height:1px;background:var(--line);}
.hud-rule::after{content:'';position:absolute;right:0;top:0;width:56px;height:11px;
  border-top:1px solid var(--line);border-right:1px solid var(--line);
  clip-path:polygon(0 0,100% 0,100% 100%,86% 100%,86% 45%,0 45%);}
/* the "03 / 18" counter chip */
.hud-count{display:inline-flex;align-items:center;gap:9px;padding:4px 16px;font-family:'Space Mono',monospace;
  font-size:11px;letter-spacing:.14em;color:var(--text);border:1px solid var(--line);
  background:color-mix(in srgb,var(--surface) 70%,transparent);
  clip-path:polygon(11px 0,calc(100% - 11px) 0,100% 50%,calc(100% - 11px) 100%,11px 100%,0 50%);}
.hud-slash{display:inline-block;width:15px;height:9px;background:var(--line);
  clip-path:polygon(30% 0,100% 0,70% 100%,0 100%);}

/* toolbar */
.hud-toolbar{display:flex;align-items:center;justify-content:center;gap:8px;margin:14px 0 12px;flex-wrap:wrap;}
.hud-btn{background:color-mix(in srgb,var(--surface2) 80%,transparent);border:1px solid var(--line-dim);
  color:var(--text);font-family:'Space Mono',monospace;font-size:10.5px;letter-spacing:.12em;
  text-transform:uppercase;padding:8px 16px;transition:all .15s;white-space:nowrap;
  clip-path:polygon(9px 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%,0 9px);}
.hud-btn:hover:not(:disabled){border-color:var(--glow);background:color-mix(in srgb,var(--glow) 22%,transparent);}
.hud-btn:disabled{opacity:.35;}
.hud-btn.primary{background:color-mix(in srgb,var(--glow) 30%,transparent);border-color:var(--line);font-weight:700;}
.hud-btn.primary:hover{background:color-mix(in srgb,var(--glow) 48%,transparent);}

/* keyword search, styled as one more HUD control */
.note-search{display:flex;align-items:center;gap:8px;flex:0 1 300px;min-width:0;height:33px;padding:0 6px 0 12px;
  background:color-mix(in srgb,var(--surface2) 80%,transparent);border:1px solid var(--line-dim);transition:border-color .15s;
  clip-path:polygon(9px 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%,0 9px);}
.note-search:focus-within{border-color:var(--glow);background:color-mix(in srgb,var(--glow) 12%,transparent);}
.note-search i{font-size:11px;color:var(--muted);}
.note-search input{flex:1;min-width:0;background:none;border:none;outline:none;color:var(--text);
  font-family:'Space Mono',monospace;font-size:11px;letter-spacing:.06em;}
.note-search input::placeholder{color:var(--muted);text-transform:uppercase;letter-spacing:.12em;}
.note-search input::-webkit-search-cancel-button{display:none;}
.note-search button{background:none;border:none;color:var(--muted);font-size:11px;padding:4px 6px;visibility:hidden;cursor:pointer;}
.note-search.has-q button{visibility:visible;}
.note-search button:hover{color:var(--text);}
.search-count{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);min-width:0;}
.search-count:empty{display:none;}
.md mark.hit,mark.hit{background:color-mix(in srgb,var(--glow) 42%,transparent);color:inherit;font-weight:inherit;
  padding:0 1px;border-radius:2px;box-shadow:0 0 0 1px color-mix(in srgb,var(--glow) 75%,transparent);}
@media(max-width:700px){.note-search{flex:1 1 100%;order:-1;}}

/* bracketed frame around the deck */
.deck-frame{position:relative;flex:1;padding:26px 46px;margin-top:4px;touch-action:pan-y;}
.deck-frame::before,.deck-frame::after{content:'';position:absolute;left:26px;right:26px;height:5px;
  background:color-mix(in srgb,var(--text) 30%,transparent);border-left:1px solid var(--line);
  border-right:1px solid var(--line);}
.deck-frame::before{top:0;} .deck-frame::after{bottom:0;}
.xh{position:absolute;width:11px;height:11px;pointer-events:none;}
.xh::before,.xh::after{content:'';position:absolute;background:var(--line);}
.xh::before{left:0;right:0;top:5px;height:1px;}
.xh::after{top:0;bottom:0;left:5px;width:1px;}
.xh.tl{top:10px;left:12px;} .xh.tr{top:10px;right:12px;}
.xh.bl{bottom:10px;left:12px;} .xh.br{bottom:10px;right:12px;}

/* chevrons */
.chev{position:absolute;top:50%;transform:translateY(-50%);width:34px;height:60px;background:transparent;
  border:none;color:var(--line);font-size:30px;line-height:1;display:flex;align-items:center;
  justify-content:center;transition:color .15s,transform .15s;font-family:'Space Mono',monospace;z-index:3;}
.chev:hover:not(:disabled){color:var(--text);text-shadow:0 0 14px var(--glow);}
.chev:disabled{opacity:.2;}
.chev.prev{left:2px;} .chev.next{right:2px;}

/* ── MISSION CARDS ── */
.ngrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:16px;align-content:start;}
.ncard{position:relative;height:236px;padding:16px 30px 14px 16px;display:flex;flex-direction:column;
  background:var(--line-dim);animation:fin .22s ease both;text-align:left;border:none;
  clip-path:polygon(22px 0,100% 0,100% calc(100% - 22px),calc(100% - 22px) 100%,0 100%,0 22px);
  transition:background .16s,transform .16s;}
.ncard::before{content:'';position:absolute;inset:1.5px;z-index:0;background:var(--fill);backdrop-filter:blur(2px);
  clip-path:polygon(21px 0,100% 0,100% calc(100% - 21px),calc(100% - 21px) 100%,0 100%,0 21px);}
.ncard > *{position:relative;z-index:1;}
.ncard:hover{background:var(--glow);transform:translateY(-3px);}
.ncard:hover::before{background:color-mix(in srgb,var(--glow) 16%,var(--fill));}
.ncard.is-hidden{background:color-mix(in srgb,var(--accent) 55%,var(--line-dim));}
@keyframes fin{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
/* typing in the search box redraws the deck per key; no entrance animation then */
.ngrid.instant .ncard{animation:none;}
.ntitle{font-family:'Space Mono',monospace;font-size:11px;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;color:var(--text);line-height:1.4;word-break:break-word;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.nbody{flex:1;margin-top:10px;font-size:10.5px;line-height:1.65;color:color-mix(in srgb,var(--text) 62%,transparent);
  overflow:hidden;word-break:break-word;
  display:-webkit-box;-webkit-line-clamp:7;-webkit-box-orient:vertical;}
.nbody b,.nbody strong{color:var(--text);font-weight:700;}
/* Rendered markdown, shared by the card preview and the briefing panel. */
.md h1,.md h2,.md h3,.md h4,.md h5,.md h6{font-family:'Syne',sans-serif;font-weight:800;line-height:1.3;
  margin:1.1em 0 .45em;color:var(--text);}
.md h1:first-child,.md h2:first-child,.md h3:first-child{margin-top:0;}
.md h1{font-size:1.55em;} .md h2{font-size:1.3em;} .md h3{font-size:1.12em;}
.md h4,.md h5,.md h6{font-size:1em;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);}
.md p{margin:0 0 .8em;}
.md p:last-child{margin-bottom:0;}
.md strong{font-weight:800;color:var(--text);}
.md em{font-style:italic;}
.md del{opacity:.55;}
.md mark{background:var(--hl,#fde047);color:var(--hl-text,#171717);
  padding:.08em .3em;border-radius:3px;font-weight:600;
  box-decoration-break:clone;-webkit-box-decoration-break:clone;}
.md code{font-family:'Space Mono',monospace;font-size:.88em;background:color-mix(in srgb,var(--text) 12%,transparent);
  padding:.1em .35em;border-radius:4px;}
.md pre{background:var(--bg);border:1px solid var(--line-dim);border-radius:8px;padding:11px 13px;
  overflow-x:auto;margin:0 0 .85em;}
.md pre code{background:none;padding:0;font-size:.85em;line-height:1.6;}
.md ul,.md ol{margin:0 0 .85em;padding-left:1.35em;}
.md li{margin:.22em 0;}
.md li.task{list-style:none;margin-left:-1.15em;display:flex;align-items:flex-start;gap:.45em;}
.md li.task input{margin-top:.28em;accent-color:var(--glow);flex-shrink:0;}
.md blockquote{margin:0 0 .85em;padding:.35em 0 .35em .9em;border-left:2px solid var(--glow);
  color:var(--muted);font-style:italic;}
.md hr{border:none;border-top:1px solid var(--line-dim);margin:1.2em 0;}
.md a{color:var(--glow);text-decoration:none;border-bottom:1px solid color-mix(in srgb,var(--glow) 45%,transparent);}
.md a:hover{color:var(--text);}
/* Card previews are tight, so shrink block spacing there. */
.nbody.md h1,.nbody.md h2,.nbody.md h3{font-size:1.05em;margin:.3em 0 .2em;}
.nbody.md p,.nbody.md ul,.nbody.md ol,.nbody.md pre,.nbody.md blockquote{margin-bottom:.35em;}
.nbody.md pre{padding:5px 7px;}
/* Highlight button in the toolbar shows its colour */
/* Selection toolbar: select text in a rendered note to mark it up in place. */
.sel-bar{position:fixed;z-index:600;display:none;gap:3px;padding:4px;border-radius:9px;
  background:var(--surface);border:1px solid var(--line);box-shadow:0 8px 26px rgba(0,0,0,.55);}
.sel-bar.on{display:flex;}
.sel-btn{width:28px;height:28px;border:none;background:transparent;color:var(--text);font-size:12px;
  border-radius:6px;display:flex;align-items:center;justify-content:center;}
.sel-btn:hover{background:color-mix(in srgb,var(--glow) 35%,transparent);}
.sel-btn.mark{background:var(--hl,#fde047);color:var(--hl-text,#171717);}
.sel-btn.mark:hover{filter:brightness(1.08);}
.editor-btn.hl{background:var(--hl,#fde047);color:var(--hl-text,#171717);border-color:transparent;}
.editor-btn.hl:hover{filter:brightness(1.08);background:var(--hl,#fde047);}
.nlock{flex:1;display:flex;align-items:center;justify-content:center;}
.nlock-ring{width:60px;height:60px;border-radius:50%;border:2px solid var(--line);display:flex;
  align-items:center;justify-content:center;font-size:24px;color:var(--line);}
.nfoot{margin-top:8px;}
.nfoot-label{font-family:'Space Mono',monospace;font-size:9px;letter-spacing:.14em;text-transform:uppercase;
  color:color-mix(in srgb,var(--text) 60%,transparent);}
.nfoot-val{font-family:'Space Mono',monospace;font-size:10px;color:var(--text);margin-top:2px;}
.nfolder{display:inline-block;margin-bottom:6px;font-family:'Space Mono',monospace;font-size:8.5px;
  letter-spacing:.1em;padding:2px 7px;color:var(--text);border:1px solid var(--line-dim);
  background:color-mix(in srgb,var(--accent2) 22%,transparent);}
/* right-edge stripes: lit count = number of links on the note */
.nstripes{position:absolute;right:9px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;
  gap:5px;z-index:1;}
.nstripe{width:15px;height:10px;background:color-mix(in srgb,var(--text) 16%,transparent);
  clip-path:polygon(34% 0,100% 0,66% 100%,0 100%);transition:background .15s;}
.nstripe.on{background:var(--line);}
/* hover action bar */
.nacts{position:absolute;top:9px;right:26px;display:flex;gap:4px;opacity:0;transition:opacity .15s;z-index:2;}
.ncard:hover .nacts,.ncard:focus-within .nacts{opacity:1;}
.nact{width:23px;height:23px;display:flex;align-items:center;justify-content:center;font-size:10px;
  background:color-mix(in srgb,var(--bg) 80%,transparent);border:1px solid var(--line-dim);color:var(--text);
  clip-path:polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px);}
.nact:hover{border-color:var(--glow);background:color-mix(in srgb,var(--glow) 40%,transparent);}
.nact.danger:hover{border-color:var(--red);color:var(--red);}
.empty-notes{grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--muted);
  font-family:'Space Mono',monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;}
.empty-notes span{font-size:34px;display:block;margin-bottom:14px;letter-spacing:0;}

/* ── PREVIEW / BRIEFING PANEL (now also hosts the links) ── */
.note-preview-bg{position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:300;display:none;
  align-items:center;justify-content:center;padding:24px;}
.note-preview-bg.on{display:flex;}
.note-preview{background:var(--line-dim);width:100%;max-width:720px;max-height:88vh;display:flex;
  flex-direction:column;position:relative;
  clip-path:polygon(26px 0,100% 0,100% calc(100% - 26px),calc(100% - 26px) 100%,0 100%,0 26px);}
.note-preview::before{content:'';position:absolute;inset:1.5px;z-index:0;background:var(--surface);
  clip-path:polygon(25px 0,100% 0,100% calc(100% - 25px),calc(100% - 25px) 100%,0 100%,0 25px);}
.note-preview > *{position:relative;z-index:1;}
.note-preview-hdr{padding:20px 22px 0;display:flex;align-items:flex-start;justify-content:space-between;
  gap:12px;flex-shrink:0;}
.note-preview-title{font-family:'Syne',sans-serif;font-size:19px;font-weight:800;letter-spacing:.06em;
  text-transform:uppercase;flex:1;word-break:break-word;}
.note-preview-close{background:transparent;border:1px solid var(--line-dim);color:var(--muted);width:28px;
  height:28px;font-size:12px;flex-shrink:0;
  clip-path:polygon(7px 0,100% 0,100% calc(100% - 7px),calc(100% - 7px) 100%,0 100%,0 7px);}
.note-preview-close:hover{border-color:var(--red);color:var(--red);}
.note-preview-meta{padding:10px 22px 0;font-size:9.5px;font-family:'Space Mono',monospace;color:var(--muted);
  display:flex;gap:10px;flex-wrap:wrap;flex-shrink:0;letter-spacing:.1em;}
.note-preview-body{padding:16px 22px;font-size:13.5px;line-height:1.85;overflow-y:auto;flex:1;
  white-space:pre-wrap;word-break:break-word;}
.note-preview-body b,.note-preview-body strong{color:var(--text);font-weight:700;}
.pv-links{padding:0 22px 20px;flex-shrink:0;border-top:1px solid var(--line-dim);margin-top:4px;max-height:42vh;overflow-y:auto;}
.pv-links-hd{display:flex;align-items:center;justify-content:space-between;padding:12px 0 8px;
  font-family:'Space Mono',monospace;font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);}
.nlink-row{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--line-dim);}
.nlink-row:last-of-type{border-bottom:none;}
.nlink-emoji{font-size:12px;flex-shrink:0;}
.nlink-anchor{flex:1;min-width:0;text-decoration:none;color:var(--glow);font-size:11px;
  font-family:'Space Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.nlink-anchor:hover{color:var(--text);}
.nlink-del{background:transparent;border:none;color:var(--muted);font-size:10px;padding:0 2px;flex-shrink:0;line-height:1;}
.nlink-del:hover{color:var(--red);}
.nlink-add-row{display:flex;gap:6px;margin-top:9px;}
.nlink-url-input,.nlink-title-input{background:var(--bg);border:1px solid var(--line-dim);padding:6px 9px;
  color:var(--text);font-size:11px;font-family:'Space Mono',monospace;outline:none;min-width:0;}
.nlink-url-input{flex:1;} .nlink-title-input{width:110px;flex-shrink:0;}
.nlink-url-input:focus,.nlink-title-input:focus{border-color:var(--glow);}
.nlink-save{background:color-mix(in srgb,var(--glow) 26%,transparent);border:1px solid var(--line-dim);
  color:var(--text);padding:6px 11px;font-size:10px;font-family:'Space Mono',monospace;flex-shrink:0;}
.nlink-save:hover{background:color-mix(in srgb,var(--glow) 42%,transparent);}

/* ── EDITOR MODAL (full-screen, document style) ── */
html.editor-open,body.editor-open{overflow:hidden;}
.modal-bg{position:fixed;inset:0;background:var(--bg);z-index:200;display:none;flex-direction:column;}
.modal-bg.on{display:flex;}
.modal{background:var(--bg);width:100%;height:100%;min-height:0;display:flex;flex-direction:column;position:relative;}
.modal-hdr{padding:11px 20px;display:flex;align-items:center;gap:12px;flex-shrink:0;flex-wrap:wrap;
  background:var(--surface);border-bottom:1px solid var(--line-dim);}
.modal-title{font-family:'Space Mono',monospace;font-size:12px;letter-spacing:.18em;text-transform:uppercase;
  flex-shrink:0;}
.modal-hdr-spacer{flex:1;min-width:8px;}
.modal-close{background:transparent;border:1px solid var(--line-dim);color:var(--muted);width:28px;height:28px;
  flex-shrink:0;font-size:12px;
  clip-path:polygon(7px 0,100% 0,100% calc(100% - 7px),calc(100% - 7px) 100%,0 100%,0 7px);}
.modal-close:hover{border-color:var(--red);color:var(--red);}
/* Scrolling document surface — the page floats on the deck background. */
.modal-body{flex:1;min-height:0;overflow-y:auto;padding:26px 20px 40px;display:flex;flex-direction:column;}
.doc-page{width:100%;max-width:840px;margin:0 auto;flex:1 0 auto;min-height:460px;
  display:flex;flex-direction:column;gap:10px;background:var(--surface);border:1px solid var(--line-dim);
  padding:44px 54px 40px;
  clip-path:polygon(26px 0,100% 0,100% calc(100% - 26px),calc(100% - 26px) 100%,0 100%,0 26px);}
.note-title-input{width:100%;background:transparent;border:none;border-bottom:1px solid transparent;
  padding:2px 0 12px;color:var(--text);font-size:30px;line-height:1.25;font-family:'Syne',sans-serif;
  font-weight:700;outline:none;}
.note-title-input::placeholder{color:var(--muted);opacity:.5;}
.note-title-input:focus{border-bottom-color:var(--line-dim);}
/* Toolbar spans the window like a docs ribbon and stays put while the page scrolls. */
.editor-toolbar{display:flex;gap:4px;align-items:center;justify-content:center;flex-wrap:wrap;
  padding:8px 20px;background:var(--surface2);border:none;border-bottom:1px solid var(--line-dim);
  flex-shrink:0;}
.editor-btn{background:transparent;border:1px solid transparent;color:var(--muted);width:28px;height:28px;
  font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;
  font-family:'Space Mono',monospace;transition:all .12s;}
.editor-btn:hover{background:color-mix(in srgb,var(--glow) 25%,transparent);border-color:var(--line-dim);color:var(--text);}
.editor-sep{width:1px;height:18px;background:var(--line-dim);margin:0 4px;}
.note-body-input{flex:1;width:100%;background:transparent;border:none;padding:0;color:var(--text);
  font-size:13px;font-family:'Space Mono',monospace;line-height:1.9;
  outline:none;resize:none;flex:1 1 auto;min-height:200px;}
.note-folder-select{background:var(--surface2);border:1px solid var(--line-dim);padding:7px 10px;max-width:190px;
  color:var(--text);font-size:10.5px;font-family:'Space Mono',monospace;outline:none;flex-shrink:0;}
.note-folder-select:focus{border-color:var(--glow);}
.hide-toggle{display:flex;align-items:center;gap:8px;padding:6px 11px;flex-shrink:0;
  background:color-mix(in srgb,var(--accent) 12%,transparent);border:1px solid var(--line-dim);user-select:none;
  clip-path:polygon(9px 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%,0 9px);}
.hide-toggle input[type=checkbox]{width:14px;height:14px;accent-color:var(--accent);}
.hide-toggle-label{font-size:10px;font-family:'Space Mono',monospace;color:var(--muted);letter-spacing:.08em;
  white-space:nowrap;}
.btn-cancel{background:transparent;border:1px solid var(--line-dim);color:var(--muted);padding:8px 16px;
  flex-shrink:0;font-size:10.5px;font-family:'Space Mono',monospace;letter-spacing:.12em;text-transform:uppercase;
  clip-path:polygon(9px 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%,0 9px);}
.btn-cancel:hover{border-color:var(--red);color:var(--red);}
.btn-save{background:color-mix(in srgb,var(--glow) 34%,transparent);border:1px solid var(--line);color:var(--text);
  padding:8px 20px;flex-shrink:0;font-size:10.5px;font-weight:700;font-family:'Space Mono',monospace;
  letter-spacing:.12em;text-transform:uppercase;
  clip-path:polygon(9px 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%,0 9px);}
.btn-save:hover{background:color-mix(in srgb,var(--glow) 52%,transparent);}
@media(max-width:700px){
  .modal-hdr{padding:9px 12px;gap:8px;}
  .modal-body{padding:14px 10px 70px;}
  .doc-page{padding:26px 20px 30px;min-height:360px;clip-path:none;}
  .note-title-input{font-size:22px;}
  .editor-toolbar{justify-content:flex-start;padding:7px 10px;}
  .note-folder-select{max-width:130px;}
}

@media(max-width:900px){
  .deck-frame{padding:22px 34px;}
  .ngrid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;}
  .ncard{height:212px;}
}
@media(max-width:700px){
  .notes-layout{flex-direction:column;}
  .notes-sidebar{width:100%;border-right:none;border-bottom:1px solid var(--line-dim);}
  /* On mobile the toggle is hidden, so the sidebar must never stay collapsed. */
  .notes-sidebar.collapsed{width:100%!important;height:auto;padding:20px 14px!important;}
  .notes-sidebar.collapsed > *{opacity:1;visibility:visible;}
  .sidebar-toggle,.folders-peek{display:none;}
  .notes-main{padding:16px 12px 22px;}
  .deck-frame{padding:20px 30px;}
  .chev{width:26px;font-size:22px;}
  .nlink-add-row{flex-wrap:wrap;} .nlink-title-input{width:100%;}
}
</style></head><body>

${navBar("/notes")}
<div class="emoji-popover" id="emoji-popover"></div>
<div class="notes-layout">
  <button class="sidebar-toggle" id="sidebar-toggle" title="Show/hide folders" aria-label="Show or hide folders">\u25c4</button>
  <span class="folders-peek">Folders</span>
  <div class="notes-sidebar" id="notes-sidebar">
    <div class="sidebar-title">Folders</div>
    <div class="folder-list" id="folder-list"></div>
    <div class="add-folder-form">
      <input class="add-folder-input" id="new-folder-name" placeholder="New folder\u2026" maxlength="40">
      <button class="btn-add-folder" id="btn-add-folder">+</button>
    </div>
  </div>
  <div class="notes-main">
    <div class="hud-title-row">
      <div class="hud-title" id="folder-sub">All Notes</div>
      <div class="hud-rule"></div>
      <div class="hud-count"><span class="hud-slash"></span><span id="hud-count-text">00 / 00</span></div>
    </div>
    <div class="hud-toolbar">
      <button class="hud-btn primary" id="btn-new-note">+ New Note</button>
      <button class="hud-btn" id="btn-undo" title="Undo (Ctrl+Z)" disabled>\u21b6 Undo</button>
      <button class="hud-btn" id="btn-redo" title="Redo (Ctrl+Y)" disabled>\u21b7 Redo</button>
      <div class="note-search" id="note-search-box" role="search">
        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
        <input id="note-search" type="search" placeholder="Search notes\u2026" autocomplete="off" spellcheck="false"
          aria-label="Search notes" title="Keywords must all match; &quot;quotes&quot; for an exact phrase. Press / to search, Esc to clear.">
        <button id="note-search-clear" type="button" title="Clear search (Esc)" aria-label="Clear search">\u2715</button>
      </div>
      <span class="search-count" id="search-count" aria-live="polite"></span>
    </div>
    <div class="deck-frame">
      <span class="xh tl"></span><span class="xh tr"></span><span class="xh bl"></span><span class="xh br"></span>
      <button class="chev prev" id="hud-prev" title="Previous page">\u276e</button>
      <button class="chev next" id="hud-next" title="Next page">\u276f</button>
      <div class="ngrid" id="ngrid"></div>
    </div>
  </div>
</div>
<div class="sel-bar" id="sel-bar">
  <button class="sel-btn mark" data-mk="==" title="Highlight">\u270E</button>
  <button class="sel-btn" data-mk="**" title="Bold"><b>B</b></button>
  <button class="sel-btn" data-mk="_" title="Italic"><i>I</i></button>
  <button class="sel-btn" data-mk="~~" title="Strikethrough"><s>S</s></button>
  <button class="sel-btn" id="sel-copy" title="Copy">\u29c9</button>
</div>
<div class="note-preview-bg" id="note-preview-bg">
  <div class="note-preview">
    <div class="note-preview-hdr">
      <div class="note-preview-title" id="note-preview-title"></div>
      <button class="note-preview-close" id="note-preview-close">\u2715</button>
    </div>
    <div class="note-preview-meta" id="note-preview-meta"></div>
    <div class="note-preview-body" id="note-preview-body"></div>
    <div class="pv-links" id="pv-links"></div>
  </div>
</div>
<div class="modal-bg" id="modal">
  <div class="modal">
    <div class="modal-hdr">
      <div class="modal-title" id="modal-title">New Note</div>
      <div class="modal-hdr-spacer"></div>
      <select class="note-folder-select" id="note-folder" title="Folder">
        <option value="">— No folder —</option>
      </select>
      <label class="hide-toggle">
        <input type="checkbox" id="note-hidden">
        <div class="hide-toggle-label">Hide body in preview</div>
      </label>
      <button class="btn-cancel" id="btn-cancel">Cancel</button>
      <button class="btn-save" id="btn-save">Save</button>
      <button class="modal-close" id="modal-close" title="Close">✕</button>
    </div>
    <div class="editor-toolbar">
      <button class="editor-btn" id="eb-bold" title="Bold (Ctrl+B)"><b>B</b></button>
      <button class="editor-btn" id="eb-italic" title="Italic (Ctrl+I)"><i>I</i></button>
      <button class="editor-btn" id="eb-strike" title="Strikethrough (Ctrl+Shift+X)"><s>S</s></button>
      <button class="editor-btn hl" id="eb-mark" title="Highlight (Ctrl+Shift+H)">✎</button>
      <div class="editor-sep"></div>
      <button class="editor-btn" id="eb-h1" title="Heading">H1</button>
      <button class="editor-btn" id="eb-h2" title="Sub-heading">H2</button>
      <button class="editor-btn" id="eb-bullet" title="Bullet list">•</button>
      <button class="editor-btn" id="eb-num" title="Numbered list">1.</button>
      <button class="editor-btn" id="eb-task" title="Checklist">☑</button>
      <div class="editor-sep"></div>
      <button class="editor-btn" id="eb-quote" title="Quote">“</button>
      <button class="editor-btn" id="eb-code" title="Inline code">&lt;/&gt;</button>
      <button class="editor-btn" id="eb-link" title="Insert link (Ctrl+K)">\u{1F517}</button>
    </div>
    <div class="modal-body">
      <div class="doc-page">
        <input class="note-title-input" id="note-title" placeholder="Untitled note">
        <textarea class="note-body-input" id="note-body" placeholder="Write your note here…  **bold**  _italic_  ==highlight==  # heading  - list"></textarea>
      </div>
    </div>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
${TOAST_JS}
</script>
<script src="/ui/pages/notes.js"></script>
<script>
${SSE_JS}
</script>
</body></html>`;
}


module.exports = { notesHtml };
