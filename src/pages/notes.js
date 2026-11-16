const { BASE_CSS, FAVICON, FONT, GAMEPAD_CSS, NAV_CSS, SSE_JS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");

function notesHtml() {
  const seedNotes   = '[]';
  const seedFolders = '[]';
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open HL \xb7 Notes</title>${FONT}${FAVICON}<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;700;800&display=swap" rel="stylesheet">
<style>
${BASE_CSS}${NAV_CSS}${TOAST_CSS}${GAMEPAD_CSS}
/* Notes keeps its own HUD typography inside the shared shell. */
body{font-family:'Syne',sans-serif;font-size:16px;line-height:normal;font-variant-numeric:normal;}
.m-nav,.m-pulse,.theme-popover,.toast{font-family:var(--font-ui);font-size:14px;line-height:1.5;}
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
.folder-item.active{background:color-mix(in srgb,var(--glow) 24%,transparent);color:var(--text);
  box-shadow:inset 2px 0 0 var(--glow);}
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
let STATE={notes:${seedNotes},folders:${seedFolders},activeFolder:'',editingId:null,page:0,previewId:null,query:'',terms:[]};
const PAGE_SIZE=10;
let undoStack=[],redoStack=[];const MAX_HISTORY=50;
function pushUndo(){undoStack.push(JSON.parse(JSON.stringify(STATE.notes)));if(undoStack.length>MAX_HISTORY)undoStack.shift();redoStack=[];updateUndoButtons();}
function updateUndoButtons(){document.getElementById('btn-undo').disabled=undoStack.length===0;document.getElementById('btn-redo').disabled=redoStack.length===0;}
function doUndo(){if(!undoStack.length)return;redoStack.push(JSON.parse(JSON.stringify(STATE.notes)));STATE.notes=undoStack.pop();render();updateUndoButtons();showToast('\u21b6 Undone','ok');}
function doRedo(){if(!redoStack.length)return;undoStack.push(JSON.parse(JSON.stringify(STATE.notes)));STATE.notes=redoStack.pop();render();updateUndoButtons();showToast('\u21b7 Redone','ok');}
// ── Markdown ────────────────────────────────────────────────────────────────
// Written without regex literals containing backslashes: inside the server's
// template literal a lone backslash is eaten, so /\s+/ would arrive as /s+/ and
// silently corrupt the page. Character classes and indexOf only.
function h(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
var NL = String.fromCharCode(10);

// Inline spans. Order matters: code first so its contents are never re-parsed,
// then links, then the paired delimiters longest-first (** before *, == before =).
function mdInline(raw){
  var esc = h(raw);
  var out = '', i = 0;
  // Placeholder-protect code spans so ** inside a code span stays literal.
  var codes = [];
  var work = '';
  var j = 0;
  while (j < esc.length){
    if (esc.charAt(j) === '\u0060'){
      var close = esc.indexOf('\u0060', j + 1);
      if (close > -1){
        codes.push(esc.slice(j + 1, close));
        work += '\u0000C' + (codes.length - 1) + '\u0000';
        j = close + 1;
        continue;
      }
    }
    work += esc.charAt(j);
    j++;
  }
  // [text](url)
  var linked = '', k = 0;
  while (k < work.length){
    if (work.charAt(k) === '['){
      var mid = work.indexOf('](', k);
      if (mid > -1){
        var end = work.indexOf(')', mid + 2);
        if (end > -1){
          var label = work.slice(k + 1, mid);
          var url = work.slice(mid + 2, end).trim();
          var safe = (url.indexOf('javascript:') === 0 || url.indexOf('data:') === 0) ? '' : url;
          if (safe && safe.indexOf('http') !== 0 && safe.charAt(0) !== '/' && safe.charAt(0) !== '#') safe = 'https://' + safe;
          if (safe){
            linked += '<a href="' + safe + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
            k = end + 1;
            continue;
          }
        }
      }
    }
    linked += work.charAt(k);
    k++;
  }
  // Paired delimiters. Each entry: [token, openTag, closeTag]
  var pairs = [
    ['***', '<strong><em>', '</em></strong>'],
    ['**',  '<strong>', '</strong>'],
    ['==',  '<mark>', '</mark>'],
    ['~~',  '<del>', '</del>'],
    ['*',   '<em>', '</em>'],
    ['_',   '<em>', '</em>']
  ];
  out = linked;
  for (var p = 0; p < pairs.length; p++){
    out = applyPair(out, pairs[p][0], pairs[p][1], pairs[p][2]);
  }
  // restore code spans
  for (var c = 0; c < codes.length; c++){
    out = out.split('\u0000C' + c + '\u0000').join('<code>' + codes[c] + '</code>');
  }
  return out;
}
// Replace matched pairs only. An unmatched opener is left as literal text,
// which is what fixes "**unclosed" rendering as bold forever.
function applyPair(str, token, openTag, closeTag){
  var res = '', pos = 0;
  var tl = token.length;
  while (true){
    var a = str.indexOf(token, pos);
    if (a === -1) break;
    // "_" must not fire inside words (snake_case), unlike "*"
    if (token === '_'){
      var before = a > 0 ? str.charAt(a - 1) : ' ';
      if (isWordChar(before)) { res += str.slice(pos, a + tl); pos = a + tl; continue; }
    }
    var b = str.indexOf(token, a + tl);
    if (b === -1) break;                       // unmatched -> leave the rest alone
    var inner = str.slice(a + tl, b);
    if (!inner.length || inner.charAt(0) === ' ' && inner.charAt(inner.length - 1) === ' '){
      res += str.slice(pos, b + tl); pos = b + tl; continue;
    }
    if (token === '_'){
      var after = (b + tl) < str.length ? str.charAt(b + tl) : ' ';
      if (isWordChar(after)) { res += str.slice(pos, b + tl); pos = b + tl; continue; }
    }
    res += str.slice(pos, a) + openTag + inner + closeTag;
    pos = b + tl;
  }
  return res + str.slice(pos);
}
function isWordChar(ch){
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9');
}

// Block level: headings, lists, quotes, rules, fenced code, paragraphs.
function renderMarkdown(text){
  if (!text) return '';
  var lines = String(text).split(NL);
  var out = [], i = 0;
  var listType = null;   // 'ul' | 'ol' | null
  function closeList(){ if (listType){ out.push('</' + listType + '>'); listType = null; } }
  while (i < lines.length){
    var line = lines[i];
    var trimmed = line.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');

    // fenced code block
    if (trimmed.indexOf('\u0060\u0060\u0060') === 0){
      closeList();
      var buf = [];
      i++;
      while (i < lines.length && lines[i].replace(/^[ \t]+/, '').indexOf('\u0060\u0060\u0060') !== 0){
        buf.push(h(lines[i])); i++;
      }
      i++; // consume closing fence
      out.push('<pre><code>' + buf.join(NL) + '</code></pre>');
      continue;
    }
    // blank line
    if (!trimmed){ closeList(); i++; continue; }
    // horizontal rule
    if (trimmed === '---' || trimmed === '***' || trimmed === '___'){
      closeList(); out.push('<hr>'); i++; continue;
    }
    // heading
    var hashes = 0;
    while (hashes < trimmed.length && trimmed.charAt(hashes) === '#') hashes++;
    if (hashes > 0 && hashes <= 6 && trimmed.charAt(hashes) === ' '){
      closeList();
      var lvl = hashes;
      out.push('<h' + lvl + '>' + mdInline(trimmed.slice(hashes + 1)) + '</h' + lvl + '>');
      i++; continue;
    }
    // blockquote
    if (trimmed.charAt(0) === '>'){
      closeList();
      var q = [];
      while (i < lines.length){
        var t2 = lines[i].replace(/^[ \t]+/, '');
        if (t2.charAt(0) !== '>') break;
        q.push(mdInline(t2.slice(1).replace(/^ /, '')));
        i++;
      }
      out.push('<blockquote>' + q.join('<br>') + '</blockquote>');
      continue;
    }
    // task list  - [ ] / - [x]
    var isBullet = (trimmed.charAt(0) === '-' || trimmed.charAt(0) === '*' || trimmed.charAt(0) === '+') && trimmed.charAt(1) === ' ';
    if (isBullet){
      var body = trimmed.slice(2);
      var task = null;
      if (body.indexOf('[ ] ') === 0){ task = false; body = body.slice(4); }
      else if (body.indexOf('[x] ') === 0 || body.indexOf('[X] ') === 0){ task = true; body = body.slice(4); }
      if (listType !== 'ul'){ closeList(); out.push('<ul>'); listType = 'ul'; }
      if (task === null) out.push('<li>' + mdInline(body) + '</li>');
      else out.push('<li class="task"><input type="checkbox" disabled' + (task ? ' checked' : '') + '> ' + mdInline(body) + '</li>');
      i++; continue;
    }
    // ordered list
    var d = 0;
    while (d < trimmed.length && trimmed.charAt(d) >= '0' && trimmed.charAt(d) <= '9') d++;
    if (d > 0 && trimmed.charAt(d) === '.' && trimmed.charAt(d + 1) === ' '){
      if (listType !== 'ol'){ closeList(); out.push('<ol>'); listType = 'ol'; }
      out.push('<li>' + mdInline(trimmed.slice(d + 2)) + '</li>');
      i++; continue;
    }
    // paragraph: gather until a blank line or a block starter
    closeList();
    var para = [];
    while (i < lines.length){
      var t3 = lines[i].replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
      if (!t3) break;
      if (t3.charAt(0) === '>' || t3.indexOf('\u0060\u0060\u0060') === 0) break;
      if (t3 === '---' || t3 === '***' || t3 === '___') break;
      var hh = 0; while (hh < t3.length && t3.charAt(hh) === '#') hh++;
      if (hh > 0 && hh <= 6 && t3.charAt(hh) === ' ') break;
      if ((t3.charAt(0) === '-' || t3.charAt(0) === '*' || t3.charAt(0) === '+') && t3.charAt(1) === ' ') break;
      var dd = 0; while (dd < t3.length && t3.charAt(dd) >= '0' && t3.charAt(dd) <= '9') dd++;
      if (dd > 0 && t3.charAt(dd) === '.' && t3.charAt(dd + 1) === ' ') break;
      para.push(mdInline(t3));
      i++;
    }
    if (para.length) out.push('<p>' + para.join('<br>') + '</p>');
  }
  closeList();
  return out.join('');
}
// Plain-text flattening for card previews: strip syntax, keep the words.
function mdPlain(text){
  var s = String(text || '');
  var o = '', i = 0;
  var skip = { '*':1, '_':1, '=':1, '~':1, '\u0060':1, '#':1, '>':1 };
  while (i < s.length){
    var c = s.charAt(i);
    if (skip[c]) { i++; continue; }
    o += (c === NL) ? ' ' : c;
    i++;
  }
  return o.replace(/[ ][ ]+/g, ' ').trim();
}
function plain(text){return mdPlain(text);}
function pad2(n){return (n<10?'0':'')+n;}
const FOLDER_EMOJIS=['\u{1F4C2}','\u{1F4C1}','\u{1F4DD}','\u{1F4CB}','\u2B50','\u{1F525}','\u{1F4A1}','\u{1F3AF}','\u{1F680}','\u{1F916}','\u{1F9E0}','\u{1F4BB}','\u2699\uFE0F','\u{1F527}','\u{1F512}','\u{1F6E1}\uFE0F','\u{1F48E}','\u{1F3A8}','\u{1F3B5}','\u{1F3AC}','\u{1F4DA}','\u{1F4D6}','\u{1F4CA}','\u{1F5C3}\uFE0F','\u{1F4E7}','\u{1F4AC}','\u{1F4E1}','\u26A1','\u{1F300}','\u2764\uFE0F','\u{1F49A}','\u{1F4AB}','\u{1F334}','\u{1F332}','\u{1F30A}','\u2600\uFE0F','\u{1F315}','\u{1F3D4}\uFE0F','\u{1F9EA}','\u{1F52C}'];
const FOLDER_ICONS=['folder','folder-open','pen-to-square','clipboard-list','list-check','lightbulb','star','bullseye','rocket','brain','robot','laptop-code','code','terminal','server','network-wired','gear','screwdriver-wrench','lock','shield-halved','user-secret','bug','key','satellite-dish','chart-column','chart-line','sack-dollar','briefcase','handshake','building','graduation-cap','book','book-open','flask','microscope','box-archive','envelope','comments','globe','map-location-dot','gamepad','hurricane','music','film','palette','camera','heart','house','calendar','bolt'];
const EMOJI_ICON={'\u{1F4C2}':'folder-open','\u{1F4C1}':'folder','\u{1F4DD}':'pen-to-square','\u{1F4CB}':'clipboard-list','\u2B50':'star','\u{1F525}':'fire','\u{1F4A1}':'lightbulb','\u{1F3AF}':'bullseye','\u{1F680}':'rocket','\u{1F916}':'robot','\u{1F9E0}':'brain','\u{1F4BB}':'laptop-code','\u2699\uFE0F':'gear','\u2699':'gear','\u{1F527}':'screwdriver-wrench','\u{1F512}':'lock','\u{1F6E1}\uFE0F':'shield-halved','\u{1F48E}':'gem','\u{1F3A8}':'palette','\u{1F3B5}':'music','\u{1F3AC}':'film','\u{1F4DA}':'book','\u{1F4D6}':'book-open','\u{1F4CA}':'chart-column','\u{1F5C3}\uFE0F':'box-archive','\u{1F4E7}':'envelope','\u{1F4AC}':'comments','\u{1F4E1}':'satellite-dish','\u26A1':'bolt','\u{1F300}':'hurricane','\u2764\uFE0F':'heart','\u{1F52C}':'microscope'};
// A folder's icon is "fa:<name>" for the icon set, or an older emoji that maps onto it.
function folderIconName(v){if(v&&v.indexOf('fa:')===0)return v.slice(3);if(v&&EMOJI_ICON[v])return EMOJI_ICON[v];return v?null:'folder';}
function folderIconEl(v){const name=folderIconName(v);if(!name){const t=document.createElement('span');t.textContent=v;return t;}const i=document.createElement('i');i.className='fa-solid fa-'+name;i.setAttribute('aria-hidden','true');return i;}
let emojiPopoverTarget=null;
function openEmojiPopover(folderId,anchorEl){emojiPopoverTarget=folderId;const pop=document.getElementById('emoji-popover');pop.innerHTML='';const curFolder=STATE.folders.find(x=>x.id===folderId);const curIcon=curFolder?folderIconName(curFolder.emoji):null;FOLDER_ICONS.forEach(name=>{const e='fa:'+name;const btn=document.createElement('button');btn.className='ep-item'+(name===curIcon?' on':'');btn.title=name.replace(/-/g,' ');btn.appendChild(folderIconEl(e));btn.addEventListener('click',ev=>{ev.stopPropagation();setFolderEmoji(folderId,e);pop.classList.remove('open');emojiPopoverTarget=null;});pop.appendChild(btn);});const rect=anchorEl.getBoundingClientRect();pop.style.top=(rect.bottom+4)+'px';pop.style.left=rect.left+'px';pop.classList.add('open');}
document.addEventListener('click',()=>{const pop=document.getElementById('emoji-popover');if(pop.classList.contains('open')){pop.classList.remove('open');emojiPopoverTarget=null;}});
function setFolderEmoji(folderId,emoji){fetch('/api/folders/'+folderId+'/emoji',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({emoji})}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(updated=>{const idx=STATE.folders.findIndex(f=>f.id===folderId);if(idx!==-1)STATE.folders[idx]=updated;render();}).catch(()=>showToast('\u2717 Failed','bad'));}
function renderSidebar(){const{notes,folders,activeFolder}=STATE;const listEl=document.getElementById('folder-list');listEl.innerHTML='';const allItem=document.createElement('div');allItem.className='folder-item'+(activeFolder===''?' active':'');allItem.innerHTML='<span class="folder-emoji"><i class="fa-solid fa-layer-group" aria-hidden="true"></i></span><span>All Notes</span><span class="folder-count">'+notes.length+'</span>';allItem.addEventListener('click',()=>selectFolder(''));listEl.appendChild(allItem);folders.forEach(f=>{const count=notes.filter(n=>n.folderId===f.id).length;const item=document.createElement('div');item.className='folder-item'+(activeFolder===f.id?' active':'');const emojiSpan=document.createElement('span');emojiSpan.className='folder-emoji';emojiSpan.appendChild(folderIconEl(f.emoji));emojiSpan.title='Change icon';emojiSpan.addEventListener('click',ev=>{ev.stopPropagation();openEmojiPopover(f.id,emojiSpan);});const nameSpan=document.createElement('span');nameSpan.textContent=f.name;nameSpan.style.flex='1';nameSpan.style.minWidth='0';nameSpan.style.overflow='hidden';nameSpan.style.textOverflow='ellipsis';nameSpan.style.whiteSpace='nowrap';const countSpan=document.createElement('span');countSpan.className='folder-count';countSpan.textContent=count;const delBtn=document.createElement('button');delBtn.className='del-folder';delBtn.title='Delete folder';delBtn.textContent='\u2715';delBtn.addEventListener('click',ev=>{ev.stopPropagation();delFolder(f.id);});item.appendChild(emojiSpan);item.appendChild(nameSpan);item.appendChild(countSpan);item.appendChild(delBtn);item.addEventListener('click',()=>selectFolder(f.id));listEl.appendChild(item);});const sel=document.getElementById('note-folder');const cur=sel.value;sel.innerHTML='<option value="">\u2014 No folder \u2014</option>'+folders.map(f=>'<option value="'+h(f.id)+'">'+h(f.name)+'</option>').join('');if(cur)sel.value=cur;}

// ── Deck: chamfered mission cards, 10 per page ──
// ── Keyword search ──
// Every keyword must appear somewhere in the note (any order); "quoted words"
// match as one phrase. Case and accents are ignored. A hidden note is matched
// on its title only, so a search can never hint at what its body says.
function foldText(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');}
function searchTerms(q){
  const out=[];const re=/"([^"]+)"|([^\\s"]+)/g;let m;
  while((m=re.exec(String(q||''))))out.push(foldText((m[1]||m[2]).trim()));
  return out.filter(Boolean);
}
function noteHaystack(n){
  const folder=STATE.folders.find(f=>f.id===n.folderId);
  const parts=[n.title||'',folder?folder.name:''];
  if(!n.hidden){parts.push(mdPlain(n.body||''));(n.links||[]).forEach(l=>parts.push(l.title||'',l.url||''));}
  return foldText(parts.join(' '));
}
function setSearch(q){
  STATE.query=q;STATE.terms=searchTerms(q);STATE.page=0;
  document.getElementById('note-search-box').classList.toggle('has-q',!!q);
  const grid=document.getElementById('ngrid');grid.classList.add('instant');
  renderGrid();
}
// Wrap each keyword hit inside el's text in <mark class="hit">, leaving the markup alone.
function markHits(el,terms){
  if(!el||!terms||!terms.length)return;
  const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);const nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  nodes.forEach(node=>{
    const text=node.nodeValue,low=foldText(text);
    if(low.length!==text.length)return;   // folding changed the length; offsets would be off
    const ranges=[];
    terms.forEach(t=>{let i=0;while((i=low.indexOf(t,i))!==-1){ranges.push([i,i+t.length]);i+=t.length;}});
    if(!ranges.length)return;
    ranges.sort((a,b)=>a[0]-b[0]);
    const frag=document.createDocumentFragment();let pos=0;
    ranges.forEach(r=>{const s=Math.max(r[0],pos),e=r[1];if(e<=s)return;
      frag.appendChild(document.createTextNode(text.slice(pos,s)));
      const mk=document.createElement('mark');mk.className='hit';mk.textContent=text.slice(s,e);frag.appendChild(mk);pos=e;});
    frag.appendChild(document.createTextNode(text.slice(pos)));
    node.parentNode.replaceChild(frag,node);
  });
}
// When the first hit sits past the card's two visible lines, show the words around it instead.
function hitSnippet(n,terms){
  const p=mdPlain(n.body||''),low=foldText(p);
  if(low.length!==p.length)return null;
  let at=-1;terms.forEach(t=>{const i=low.indexOf(t);if(i!==-1&&(at===-1||i<at))at=i;});
  if(at<90)return null;
  let s=Math.max(0,at-40);const sp=p.lastIndexOf(' ',s);if(sp>at-70)s=sp+1;
  return '…'+p.slice(s,s+260);
}
function filteredNotes(){
  const{notes,activeFolder}=STATE;const terms=STATE.terms||[];
  let list=activeFolder?notes.filter(n=>n.folderId===activeFolder):notes;
  if(!terms.length)return list;
  list=list.filter(n=>{const hay=noteHaystack(n);return terms.every(t=>hay.includes(t));});
  // Title hits first; otherwise keep the usual order.
  const inTitle=n=>{const t=foldText(n.title);return terms.some(x=>t.includes(x));};
  return list.filter(inTitle).concat(list.filter(n=>!inTitle(n)));
}
function buildCard(n){
  const folder=STATE.folders.find(f=>f.id===n.folderId);
  const isHidden=!!n.hidden;
  const links=Array.isArray(n.links)?n.links:[];
  const card=document.createElement('div');
  card.className='ncard'+(isHidden?' is-hidden':'');
  card.dataset.id=n.id;
  card.setAttribute('data-note-id',n.id);
  card.tabIndex=0;
  card.title='Open briefing';
  card.addEventListener('click',ev=>{if(ev.target.closest('.nact'))return;openNotePreview(n.id);});
  card.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();openNotePreview(n.id);}});

  const acts=document.createElement('div');acts.className='nacts';
  const mk=(cls,txt,tip,fn)=>{const b=document.createElement('button');b.className='nact'+(cls?' '+cls:'');b.textContent=txt;b.title=tip;b.addEventListener('click',ev=>{ev.stopPropagation();fn();});return b;};
  acts.appendChild(mk('',isHidden?'\u{1F441}':'\u{1F512}',isHidden?'Show body':'Hide body',()=>toggleHidden(n.id)));
  acts.appendChild(mk('','\u270E','Edit',()=>openEdit(n.id)));
  acts.appendChild(mk('danger','\u2715','Delete',()=>delNote(n.id)));
  card.appendChild(acts);

  const stripes=document.createElement('div');stripes.className='nstripes';
  for(let i=0;i<4;i++){const s=document.createElement('span');s.className='nstripe'+(i<links.length?' on':'');stripes.appendChild(s);}
  stripes.title=links.length+' link'+(links.length===1?'':'s');
  card.appendChild(stripes);

  const terms=STATE.terms||[];
  const title=document.createElement('div');title.className='ntitle';title.textContent=n.title||'Untitled';
  markHits(title,terms);
  card.appendChild(title);

  if(isHidden){
    const lock=document.createElement('div');lock.className='nlock';
    const ring=document.createElement('div');ring.className='nlock-ring';ring.textContent='\u{1F512}';
    lock.appendChild(ring);card.appendChild(lock);
  } else {
    const body=document.createElement('div');body.className='nbody md';
    const snip=terms.length?hitSnippet(n,terms):null;
    if(snip){body.classList.add('snippet');const p=document.createElement('p');p.textContent=snip;body.appendChild(p);}
    else body.innerHTML=renderMarkdown(n.body||'');
    markHits(body,terms);
    card.appendChild(body);
  }

  const foot=document.createElement('div');foot.className='nfoot';
  if(folder){const tag=document.createElement('div');tag.className='nfolder';tag.appendChild(folderIconEl(folder.emoji));tag.appendChild(document.createTextNode(folder.name));foot.appendChild(tag);}
  const lbl=document.createElement('div');lbl.className='nfoot-label';lbl.textContent='UPDATED :';
  const val=document.createElement('div');val.className='nfoot-val';val.textContent=new Date(n.updated).toLocaleDateString()+'  '+new Date(n.updated).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  foot.appendChild(lbl);foot.appendChild(val);
  card.appendChild(foot);
  return card;
}
function renderGrid(){
  const list=filteredNotes();
  const pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));
  if(STATE.page>pages-1)STATE.page=pages-1;
  if(STATE.page<0)STATE.page=0;
  const grid=document.getElementById('ngrid');
  grid.innerHTML='';
  const searching=!!(STATE.terms&&STATE.terms.length);
  const countEl=document.getElementById('search-count');
  countEl.textContent=searching?list.length+(list.length===1?' match':' matches'):'';
  if(!list.length){
    const e=document.createElement('div');e.className='empty-notes';
    const ic=document.createElement('span');ic.textContent=searching?'\u{1F50D}':'\u{1F4DD}';
    e.appendChild(ic);
    if(searching){
      e.appendChild(document.createTextNode('No notes match “'+STATE.query.trim()+'”'));
      if(STATE.activeFolder){
        const all=document.createElement('button');all.className='hud-btn';all.style.marginTop='12px';
        all.textContent='Search all notes';all.addEventListener('click',()=>selectFolder(''));
        e.appendChild(document.createElement('br'));e.appendChild(all);
      }
    } else e.appendChild(document.createTextNode('No entries in this sector'));
    grid.appendChild(e);
  } else {
    list.slice(STATE.page*PAGE_SIZE,STATE.page*PAGE_SIZE+PAGE_SIZE).forEach(n=>grid.appendChild(buildCard(n)));
  }
  document.getElementById('hud-count-text').textContent=pad2(list.length?STATE.page+1:0)+' / '+pad2(pages);
  document.getElementById('hud-prev').disabled=STATE.page<=0;
  document.getElementById('hud-next').disabled=STATE.page>=pages-1;
}
function goPage(delta){STATE.page+=delta;document.getElementById('ngrid').classList.remove('instant');renderGrid();}
function render(){
  renderSidebar();renderGrid();
  const f=STATE.folders.find(x=>x.id===STATE.activeFolder);
  document.getElementById('folder-sub').textContent=f?f.name:'All Notes';
}
function selectFolder(id){STATE.activeFolder=id;STATE.page=0;document.getElementById('ngrid').classList.remove('instant');render();}
function addFolder(){const input=document.getElementById('new-folder-name');const name=input.value.trim();if(!name)return;fetch('/api/folders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,emoji:'fa:folder'})}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(f=>{STATE.folders.push(f);input.value='';render();showToast('\u2713 Folder created','ok');}).catch(()=>showToast('\u2717 Failed to create folder','bad'));}
function delFolder(id){if(!confirm('Delete this folder? Notes will become unorganised.'))return;fetch('/api/folders/'+id,{method:'DELETE'}).then(r=>{if(!r.ok)throw new Error();STATE.folders=STATE.folders.filter(f=>f.id!==id);STATE.notes=STATE.notes.map(n=>n.folderId===id?{...n,folderId:null}:n);if(STATE.activeFolder===id)STATE.activeFolder='';render();showToast('\u2713 Folder deleted','ok');}).catch(()=>showToast('\u2717 Failed to delete folder','bad'));}
function openNew(){STATE.editingId=null;document.getElementById('modal-title').textContent='New Note';document.getElementById('note-title').value='';document.getElementById('note-body').value='';document.getElementById('note-hidden').checked=false;document.getElementById('note-folder').value=STATE.activeFolder||'';openEditor();setTimeout(()=>document.getElementById('note-title').focus(),50);}
function openEdit(id){const n=STATE.notes.find(x=>x.id===id);if(!n)return;STATE.editingId=id;document.getElementById('modal-title').textContent='Edit Note';document.getElementById('note-title').value=n.title||'';document.getElementById('note-body').value=n.body||'';document.getElementById('note-hidden').checked=!!n.hidden;document.getElementById('note-folder').value=n.folderId||'';openEditor();setTimeout(()=>document.getElementById('note-title').focus(),50);}
// The editor now fills the window, so the deck behind it must stop scrolling while it is open.
function openEditor(){document.getElementById('modal').classList.add('on');document.body.classList.add('editor-open');document.documentElement.classList.add('editor-open');const b=document.querySelector('#modal .modal-body');if(b)b.scrollTop=0;}
function closeModal(){document.getElementById('modal').classList.remove('on');document.body.classList.remove('editor-open');document.documentElement.classList.remove('editor-open');STATE.editingId=null;}
function saveNote(){const title=document.getElementById('note-title').value.trim();const body=document.getElementById('note-body').value;const hidden=document.getElementById('note-hidden').checked;const folderId=document.getElementById('note-folder').value||null;if(!title&&!body){showToast('\u2717 Note is empty','bad');return;}const isEdit=!!STATE.editingId;const payload={title,body,hidden,folderId};if(isEdit)payload.id=STATE.editingId;const btn=document.getElementById('btn-save');btn.disabled=true;pushUndo();fetch(isEdit?'/api/notes/'+STATE.editingId:'/api/notes',{method:isEdit?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(saved=>{if(isEdit){const idx=STATE.notes.findIndex(n=>n.id===saved.id);if(idx!==-1)STATE.notes[idx]=saved;}else{STATE.notes.unshift(saved);STATE.page=0;}closeModal();render();showToast('\u2713 Saved','ok');}).catch(()=>{showToast('\u2717 Failed to save','bad');undoStack.pop();updateUndoButtons();}).finally(()=>{btn.disabled=false;});}
function toggleHidden(id){fetch('/api/notes/hidden/'+id,{method:'PATCH'}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(updated=>{const idx=STATE.notes.findIndex(n=>n.id===id);if(idx!==-1)STATE.notes[idx]=updated;render();if(STATE.previewId===id)openNotePreview(id);}).catch(()=>showToast('\u2717 Failed','bad'));}
function delNote(id){if(!confirm('Delete this note?'))return;pushUndo();fetch('/api/notes/'+id,{method:'DELETE'}).then(r=>{if(!r.ok)throw new Error();STATE.notes=STATE.notes.filter(n=>n.id!==id);if(STATE.previewId===id)closeNotePreview();render();showToast('\u2713 Deleted','ok');}).catch(()=>{showToast('\u2717 Failed to delete','bad');undoStack.pop();updateUndoButtons();});}

// ── Links: now edited from the briefing panel, so cards keep a fixed footprint ──
function addNoteLink(noteId,url,title,emoji){const normUrl=(/^https?:/i.test(url)||url.charAt(0)==='/')?url:'https://'+url;fetch('/api/notes/'+noteId+'/links',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:normUrl,title:title||url,emoji:emoji||'\u{1F517}'})}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(updated=>{const idx=STATE.notes.findIndex(n=>n.id===noteId);if(idx!==-1)STATE.notes[idx]=updated;render();if(STATE.previewId===noteId)renderPreviewLinks(updated);showToast('\u2713 Link saved','ok');}).catch(()=>showToast('\u2717 Failed to add link','bad'));}
function delNoteLink(noteId,linkId){fetch('/api/notes/'+noteId+'/links/'+linkId,{method:'DELETE'}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(updated=>{const idx=STATE.notes.findIndex(n=>n.id===noteId);if(idx!==-1)STATE.notes[idx]=updated;render();if(STATE.previewId===noteId)renderPreviewLinks(updated);showToast('\u2713 Link removed','ok');}).catch(()=>showToast('\u2717 Failed to remove link','bad'));}
function renderPreviewLinks(n){
  const wrap=document.getElementById('pv-links');
  wrap.innerHTML='';
  const links=Array.isArray(n.links)?n.links:[];
  const hd=document.createElement('div');hd.className='pv-links-hd';
  hd.appendChild(document.createTextNode('\u{1F517} Links ('+links.length+')'));
  wrap.appendChild(hd);
  links.forEach(lk=>{
    const row=document.createElement('div');row.className='nlink-row';
    const emoji=document.createElement('span');emoji.className='nlink-emoji';emoji.textContent=lk.emoji||'\u{1F517}';
    const a=document.createElement('a');a.className='nlink-anchor';
    const raw=lk.url||'';
    a.href=(/^https?:/i.test(raw)||raw.charAt(0)==='/')?raw:'https://'+raw;
    a.target='_blank';a.rel='noopener noreferrer';a.title=raw;a.textContent=lk.title||raw;
    const linked=noteIdFromUrl(raw);
    if(linked){
      // Another note: open it right here rather than in a new tab, under its current title.
      const t=STATE.notes.find(x=>x.id===linked);
      a.textContent=t?(t.title||'Untitled'):(lk.title||'Missing note');
      a.removeAttribute('target');
      a.addEventListener('click',ev=>{ev.preventDefault();openNotePreview(linked);});
    }
    const del=document.createElement('button');del.className='nlink-del';del.title='Remove link';del.textContent='\u2715';
    del.addEventListener('click',()=>delNoteLink(n.id,lk.id));
    row.appendChild(emoji);row.appendChild(a);row.appendChild(del);wrap.appendChild(row);
  });
  const addRow=document.createElement('div');addRow.className='nlink-add-row';
  const urlIn=document.createElement('input');urlIn.className='nlink-url-input';urlIn.type='text';urlIn.placeholder='https://\u2026 or paste URL';
  const titleIn=document.createElement('input');titleIn.className='nlink-title-input';titleIn.type='text';titleIn.placeholder='Title (opt.)';
  const saveBtn=document.createElement('button');saveBtn.className='nlink-save';saveBtn.textContent='\u21b5 Save';
  const doSave=()=>{const v=urlIn.value.trim();if(!v){urlIn.focus();return;}addNoteLink(n.id,v,titleIn.value.trim());};
  saveBtn.addEventListener('click',doSave);
  urlIn.addEventListener('keydown',ev=>{if(ev.key==='Enter')doSave();});
  addRow.appendChild(urlIn);addRow.appendChild(titleIn);addRow.appendChild(saveBtn);
  wrap.appendChild(addRow);
  // Link to another note or to a Flow Space flow.
  const pickRow=document.createElement('div');pickRow.className='nlink-add-row';
  const noteSel=document.createElement('select');noteSel.className='nlink-url-input';noteSel.setAttribute('aria-label','Link a note');
  noteSel.innerHTML='<option value="">\u{1F4DD} Link a note…</option>';
  STATE.notes.filter(x=>x.id!==n.id).sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''))).forEach(x=>{
    const o=document.createElement('option');o.value=x.id;o.textContent=x.title||'Untitled';noteSel.appendChild(o);});
  noteSel.addEventListener('change',()=>{const x=STATE.notes.find(y=>y.id===noteSel.value);if(x)addNoteLink(n.id,'/notes?open='+encodeURIComponent(x.id),x.title||'Untitled','\u{1F4DD}');});
  const flowSel=document.createElement('select');flowSel.className='nlink-url-input';flowSel.setAttribute('aria-label','Link a flow');
  flowSel.innerHTML='<option value="">\u{1F500} Link a flow…</option>';
  (STATE.flows||[]).forEach(f=>{const o=document.createElement('option');o.value=f.id;o.textContent=f.name;flowSel.appendChild(o);});
  flowSel.addEventListener('change',()=>{const f=(STATE.flows||[]).find(y=>y.id===flowSel.value);if(f)addNoteLink(n.id,'/flows?open='+encodeURIComponent(f.id),f.name,'\u{1F500}');});
  pickRow.appendChild(noteSel);pickRow.appendChild(flowSel);
  wrap.appendChild(pickRow);
  // Backlinks: notes that link here, and flows that use this note.
  const from=STATE.notes.filter(x=>x.id!==n.id&&(x.links||[]).some(l=>noteIdFromUrl(l.url||'')===n.id));
  const flows=(STATE.flows||[]).filter(f=>(f.noteIds||[]).includes(n.id));
  if(from.length||flows.length){
    const bh=document.createElement('div');bh.className='pv-links-hd';bh.textContent='↩ Linked from ('+(from.length+flows.length)+')';wrap.appendChild(bh);
    from.forEach(x=>{
      const row=document.createElement('div');row.className='nlink-row';
      const em=document.createElement('span');em.className='nlink-emoji';em.textContent='\u{1F4DD}';
      const a=document.createElement('a');a.className='nlink-anchor';a.href='/notes?open='+encodeURIComponent(x.id);a.textContent=x.title||'Untitled';
      a.addEventListener('click',ev=>{ev.preventDefault();openNotePreview(x.id);});
      row.appendChild(em);row.appendChild(a);wrap.appendChild(row);
    });
    flows.forEach(f=>{
      const row=document.createElement('div');row.className='nlink-row';
      const em=document.createElement('span');em.className='nlink-emoji';em.textContent='\u{1F500}';
      const a=document.createElement('a');a.className='nlink-anchor';a.href='/flows?open='+encodeURIComponent(f.id);a.textContent=f.name+' (flow)';
      row.appendChild(em);row.appendChild(a);wrap.appendChild(row);
    });
  }
}
function noteIdFromUrl(u){
  const pre='/notes?open=';
  const i=String(u).indexOf(pre);
  if(i<0)return null;
  try{return decodeURIComponent(String(u).slice(i+pre.length).split('&')[0]);}catch(e){return null;}
}
function loadFlows(){
  return fetch('/api/flows').then(r=>r.ok?r.json():[]).then(l=>{STATE.flows=Array.isArray(l)?l:[];}).catch(()=>{});
}
function openNotePreview(id){
  const n=STATE.notes.find(x=>x.id===id);if(!n)return;
  STATE.previewId=id;
  const folder=STATE.folders.find(f=>f.id===n.folderId);
  document.getElementById('note-preview-title').textContent=n.title||'Untitled';
  const meta=document.getElementById('note-preview-meta');
  meta.innerHTML='';
  if(folder){const t=document.createElement('span');t.className='nfolder';t.appendChild(folderIconEl(folder.emoji));t.appendChild(document.createTextNode(folder.name));meta.appendChild(t);}
  const d=document.createElement('span');d.textContent='UPDATED : '+new Date(n.updated).toLocaleString();meta.appendChild(d);
  document.getElementById('note-preview-body').className='note-preview-body md';
  document.getElementById('note-preview-body').innerHTML=n.hidden?'<span style="color:var(--muted);font-family:Space Mono,monospace;font-size:12px">\u{1F512} Content hidden \u2014 unlock from the card to read it.</span>':renderMarkdown(n.body||'');
  document.getElementById('note-preview-body').setAttribute('data-note-id',n.id);
  markHits(document.getElementById('note-preview-title'),STATE.terms);
  if(!n.hidden)markHits(document.getElementById('note-preview-body'),STATE.terms);
  renderPreviewLinks(n);
  document.getElementById('note-preview-bg').classList.add('on');
  // Flows change elsewhere; refresh them so the flow picker and backlinks are current.
  loadFlows().then(()=>{if(STATE.previewId===id)renderPreviewLinks(STATE.notes.find(x=>x.id===id)||n);});
}
function closeNotePreview(){document.getElementById('note-preview-bg').classList.remove('on');STATE.previewId=null;}

// ── Editor toolbar ──
// ═══ SELECT-TO-HIGHLIGHT ═════════════════════════════════════════════════════
// Selecting text in a rendered note pops a small toolbar. Because the note is
// stored as markdown but displayed as HTML, the selected string is located in
// the SOURCE text and the markers are inserted there — then the note is saved
// and re-rendered. Exact-match only: if the selection spans markup the offsets
// would not line up, so we bail rather than corrupt the note.
var SELCTX=null;
function selBar(){return document.getElementById('sel-bar');}
function hideSelBar(){selBar().classList.remove('on');SELCTX=null;}
function onSelect(){
  var sel=window.getSelection();
  if(!sel||sel.isCollapsed||!sel.rangeCount){hideSelBar();return;}
  var text=sel.toString();
  if(!text.trim()||text.length<2){hideSelBar();return;}
  var node=sel.anchorNode;
  var host=node&&node.nodeType===3?node.parentElement:node;
  var card=host&&host.closest?host.closest('[data-note-id]'):null;
  if(!card){hideSelBar();return;}
  var id=card.getAttribute('data-note-id');
  var note=STATE.notes.filter(function(n){return n.id===id;})[0];
  if(!note){hideSelBar();return;}
  var body=String(note.body||'');
  var first=body.indexOf(text);
  if(first===-1||body.indexOf(text,first+1)!==-1){
    // not found, or ambiguous — refuse rather than mark the wrong occurrence
    hideSelBar();return;
  }
  SELCTX={id:id,text:text,at:first};
  var bar=selBar();
  bar.classList.add('on');
  var rng=sel.getRangeAt(0);
  var r=rng.getBoundingClientRect?rng.getBoundingClientRect():null;
  if(!r){return;}   // no layout info (headless/older engines) — bar still works
  var bw=bar.offsetWidth||150;
  var left=Math.max(8,Math.min(window.innerWidth-bw-8,r.left+r.width/2-bw/2));
  var top=r.top-bar.offsetHeight-8;
  if(top<8)top=r.bottom+8;
  bar.style.left=left+'px';bar.style.top=top+'px';
}
document.addEventListener('selectionchange',function(){setTimeout(onSelect,10);});
document.addEventListener('mousedown',function(e){
  if(!selBar().contains(e.target))hideSelBar();
});
(function(){
  var bar=selBar();
  bar.querySelectorAll('[data-mk]').forEach(function(b){
    b.addEventListener('mousedown',function(e){e.preventDefault();});
    b.addEventListener('click',function(){
      if(!SELCTX)return;
      var mk=b.getAttribute('data-mk');
      var note=STATE.notes.filter(function(n){return n.id===SELCTX.id;})[0];
      if(!note)return;
      var body=String(note.body||'');
      var at=SELCTX.at, txt=SELCTX.text, next;
      var before=body.slice(0,at), after=body.slice(at+txt.length);
      // Toggle: if this run is already wrapped in the same marker, unwrap it
      // instead of nesting a second pair and producing ====like this====.
      if(before.slice(-mk.length)===mk && after.slice(0,mk.length)===mk){
        next=before.slice(0,before.length-mk.length)+txt+after.slice(mk.length);
      } else if(txt.slice(0,mk.length)===mk && txt.slice(-mk.length)===mk && txt.length>mk.length*2){
        next=before+txt.slice(mk.length,txt.length-mk.length)+after;
      } else {
        next=before+mk+txt+mk+after;
      }
      hideSelBar();
      window.getSelection().removeAllRanges();
      saveNoteBody(note,next);
    });
  });
  document.getElementById('sel-copy').addEventListener('mousedown',function(e){e.preventDefault();});
  document.getElementById('sel-copy').addEventListener('click',function(){
    if(!SELCTX)return;
    try{navigator.clipboard.writeText(SELCTX.text);showToast('Copied','ok');}catch(e){}
    hideSelBar();window.getSelection().removeAllRanges();
  });
})();
function saveNoteBody(note,body){
  pushUndo();
  fetch('/api/notes/'+note.id,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id:note.id,title:note.title,body:body,hidden:!!note.hidden,folderId:note.folderId||null})})
    .then(function(r){if(!r.ok)throw new Error();return r.json();})
    .then(function(saved){
      var i=STATE.notes.findIndex(function(n){return n.id===saved.id;});
      if(i!==-1)STATE.notes[i]=saved;
      render();
      if(STATE.previewId===saved.id)openNotePreview(saved.id);
      showToast('\u2713 Updated','ok');
    })
    .catch(function(){showToast('\u2717 Could not save','bad');undoStack.pop();updateUndoButtons();});
}

function wrapSelection(before,after){const ta=document.getElementById('note-body');const start=ta.selectionStart,end=ta.selectionEnd;const selected=ta.value.slice(start,end);const wrapped=before+selected+after;ta.setRangeText(wrapped,start,end,'select');ta.focus();if(!selected){ta.selectionStart=start+before.length;ta.selectionEnd=start+before.length;}}
function insertAtCursor(text){const ta=document.getElementById('note-body');const start=ta.selectionStart;ta.setRangeText(text,start,ta.selectionEnd,'end');ta.focus();}
// Toggle a line prefix across every line the selection touches, so hitting
// "bullet" with three lines selected makes three bullets, not one broken one.
function prefixLines(prefix){
  const ta=document.getElementById('note-body');
  const v=ta.value;
  let start=v.lastIndexOf(NL,ta.selectionStart-1)+1;
  let end=ta.selectionEnd;
  const nextNl=v.indexOf(NL,end);
  end=nextNl===-1?v.length:nextNl;
  const block=v.slice(start,end);
  const lines=block.split(NL);
  const numbered=prefix==='1. ';
  const allHave=lines.every(l=>!l.trim()||l.indexOf(numbered?'':prefix)===0||(numbered&&/^[0-9]+[.] /.test(l)));
  const next=lines.map((l,i)=>{
    if(!l.trim())return l;
    if(allHave){
      if(numbered)return l.replace(/^[0-9]+[.] /,'');
      return l.indexOf(prefix)===0?l.slice(prefix.length):l;
    }
    if(numbered)return (i+1)+'. '+l.replace(/^[0-9]+[.] /,'');
    return l.indexOf(prefix)===0?l:prefix+l;
  });
  ta.setRangeText(next.join(NL),start,end,'select');
  ta.focus();
}
document.getElementById('eb-bold').addEventListener('click',()=>wrapSelection('**','**'));
document.getElementById('eb-italic').addEventListener('click',()=>wrapSelection('_','_'));
document.getElementById('eb-strike').addEventListener('click',()=>wrapSelection('~~','~~'));
document.getElementById('eb-mark').addEventListener('click',()=>wrapSelection('==','=='));
document.getElementById('eb-h1').addEventListener('click',()=>prefixLines('# '));
document.getElementById('eb-h2').addEventListener('click',()=>prefixLines('## '));
document.getElementById('eb-bullet').addEventListener('click',()=>prefixLines('- '));
document.getElementById('eb-num').addEventListener('click',()=>prefixLines('1. '));
document.getElementById('eb-task').addEventListener('click',()=>prefixLines('- [ ] '));
document.getElementById('eb-quote').addEventListener('click',()=>prefixLines('> '));
document.getElementById('eb-code').addEventListener('click',()=>wrapSelection(String.fromCharCode(96),String.fromCharCode(96)));
document.getElementById('eb-link').addEventListener('click',()=>{const url=prompt('URL:');if(!url)return;const ta=document.getElementById('note-body');const sel=ta.value.slice(ta.selectionStart,ta.selectionEnd)||'link text';const start=ta.selectionStart;ta.setRangeText('['+sel+']('+url+')',start,ta.selectionEnd,'end');ta.focus();});
document.getElementById('note-body').addEventListener('keydown',ev=>{
  if(!(ev.ctrlKey||ev.metaKey))return;
  const k=ev.key.toLowerCase();
  if(ev.shiftKey){
    if(k==='h'){ev.preventDefault();wrapSelection('==','==');}
    if(k==='x'){ev.preventDefault();wrapSelection('~~','~~');}
    return;
  }
  if(k==='b'){ev.preventDefault();wrapSelection('**','**');}
  if(k==='i'){ev.preventDefault();wrapSelection('_','_');}
  if(k==='k'){ev.preventDefault();document.getElementById('eb-link').click();}
});

// ── Wiring ──
document.getElementById('btn-undo').addEventListener('click',doUndo);
document.getElementById('btn-redo').addEventListener('click',doRedo);
document.getElementById('btn-new-note').addEventListener('click',openNew);
document.getElementById('btn-add-folder').addEventListener('click',addFolder);
document.getElementById('new-folder-name').addEventListener('keydown',ev=>{if(ev.key==='Enter')addFolder();});
document.getElementById('btn-save').addEventListener('click',saveNote);
document.getElementById('btn-cancel').addEventListener('click',closeModal);
document.getElementById('modal-close').addEventListener('click',closeModal);
document.getElementById('modal').addEventListener('click',ev=>{if(ev.target===document.getElementById('modal'))closeModal();});
document.getElementById('note-title').addEventListener('keydown',ev=>{if((ev.ctrlKey||ev.metaKey)&&ev.key==='Enter'){ev.preventDefault();saveNote();}});
document.getElementById('note-preview-close').addEventListener('click',closeNotePreview);
document.getElementById('note-preview-bg').addEventListener('click',e=>{if(e.target===document.getElementById('note-preview-bg'))closeNotePreview();});
document.getElementById('hud-prev').addEventListener('click',()=>goPage(-1));
document.getElementById('hud-next').addEventListener('click',()=>goPage(1));
// Touch screens: a horizontal swipe across the deck flips pages. Only a clearly
// sideways stroke counts, so vertical scrolling through the cards still works.
(function(){
  const deck=document.querySelector('.deck-frame');
  let sx=0,sy=0,st=0,tracking=false;
  deck.addEventListener('touchstart',ev=>{
    if(ev.touches.length!==1){tracking=false;return;}
    sx=ev.touches[0].clientX;sy=ev.touches[0].clientY;st=Date.now();tracking=true;
  },{passive:true});
  deck.addEventListener('touchend',ev=>{
    if(!tracking)return;tracking=false;
    const t=ev.changedTouches[0];const dx=t.clientX-sx,dy=t.clientY-sy;
    if(Date.now()-st>800||Math.abs(dx)<50||Math.abs(dx)<Math.abs(dy)*1.5)return;
    const btn=document.getElementById(dx<0?'hud-next':'hud-prev');
    if(!btn.disabled)goPage(dx<0?1:-1);
  },{passive:true});
  deck.addEventListener('touchcancel',()=>{tracking=false;},{passive:true});
})();
// this toggle button existed but was never wired up
function setFoldersHidden(hide){
  document.getElementById('notes-sidebar').classList.toggle('collapsed',hide);
  document.querySelector('.notes-layout').classList.toggle('folders-hidden',hide);
  document.getElementById('sidebar-toggle').textContent=hide?'\u25ba':'\u25c4';
  document.getElementById('sidebar-toggle').title=hide?'Show folders':'Hide folders';
  try{localStorage.setItem('openhl-notes-sidebar',hide?'1':'0');}catch(e){}
}
document.getElementById('sidebar-toggle').addEventListener('click',function(){
  setFoldersHidden(!document.getElementById('notes-sidebar').classList.contains('collapsed'));
});
// Restore the saved state, but only where the toggle is actually reachable.
// Below 700px the toggle is hidden and the sidebar stacks, so a stale collapsed
// flag from a desktop session would hide folders with no way to get them back.
(function(){
  try{
    if(localStorage.getItem('openhl-notes-sidebar')==='1' && window.innerWidth>700) setFoldersHidden(true);
  }catch(e){}
})();
(function(){
  const box=document.getElementById('note-search');
  box.addEventListener('input',()=>setSearch(box.value));
  box.addEventListener('keydown',ev=>{
    if(ev.key!=='Escape')return;
    ev.preventDefault();ev.stopPropagation();
    if(box.value){box.value='';setSearch('');}else box.blur();
  });
  document.getElementById('note-search-clear').addEventListener('click',()=>{box.value='';setSearch('');box.focus();});
})();
document.addEventListener('keydown',ev=>{
  if(ev.key==='Escape'){closeModal();closeNotePreview();return;}
  const t=ev.target.tagName;
  if(t==='INPUT'||t==='TEXTAREA'||t==='SELECT')return;
  if(document.getElementById('modal').classList.contains('on'))return;
  if(ev.key==='/'&&!ev.ctrlKey&&!ev.metaKey&&!ev.altKey&&!document.getElementById('note-preview-bg').classList.contains('on')){
    ev.preventDefault();const box=document.getElementById('note-search');box.focus();box.select();return;
  }
  if(ev.key==='ArrowLeft'&&!document.getElementById('hud-prev').disabled)goPage(-1);
  if(ev.key==='ArrowRight'&&!document.getElementById('hud-next').disabled)goPage(1);
});
async function initNotes(){try{const[nr,fr]=await Promise.all([fetch('/api/notes').then(r=>r.json()),fetch('/api/note-folders').then(r=>r.json())]);STATE.notes=nr;STATE.folders=fr;}catch(e){console.error('Failed to load notes',e);}render();updateUndoButtons();}
// /notes?open=<id>: links from Flow Space and from other notes land here.
initNotes().then(()=>{
  const id=new URLSearchParams(location.search).get('open');
  if(!id)return;
  history.replaceState(null,'','/notes');
  if(STATE.notes.some(n=>n.id===id))openNotePreview(id);else showToast('✗ That note no longer exists','bad');
});
window.__sseRefresh=function(d){if((d.type==='notes'||d.type==='folders')&&!STATE.editingId)initNotes();};
${SSE_JS}
</script></body></html>`;
}


// ─── WEBFORMS PAGE ────────────────────────────────────────────────────────────

// ── AI PAGE ──────────────────────────────────────────────────────────────────

module.exports = { notesHtml };
