const { BASE_CSS, FAVICON, FONT, NAV_CSS, THEME_JS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");

// ─── OPENHL WORLD ─────────────────────────────────────────────────────────────
// A 3D town of Open HL: its services are districts inside the network wall, the
// outside world (social platforms, Google, weather, model APIs) are buildings
// beyond it, and every 'activity' event sends a robot on an errand between
// them. Behaviour is in src/ui/world/world.js.

const WORLD_CSS = `
html,body{height:100%;overflow:hidden;}
.w-stage{position:fixed;top:var(--pulse-h);left:var(--nav-w);right:0;bottom:0;background:#22304f;}
.w-stage canvas{display:block;width:100%;height:100%;outline:none;}
.w-hud{position:absolute;pointer-events:none;}
.w-hud > *{pointer-events:auto;}
.w-card{background:color-mix(in srgb,var(--surface) 82%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  border:1px solid var(--line);border-radius:var(--r-panel);box-shadow:0 10px 30px rgba(0,0,0,.35);}
.w-title{top:14px;left:14px;padding:12px 14px;max-width:320px;}
.w-title h1{font:600 20px/1.2 var(--font-display);}
.w-title p{color:var(--muted);font-size:13px;margin-top:3px;}
.w-title .row{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;}
.w-btn{display:inline-flex;align-items:center;gap:6px;background:var(--surface-2,var(--surface));border:1px solid var(--line);
  border-radius:var(--r-ctl);padding:5px 10px;font-size:13px;color:var(--text);}
.w-btn:hover{border-color:var(--accent);}
.w-btn.on{border-color:var(--accent);color:var(--accent);}
.w-feed{top:14px;right:14px;bottom:14px;width:300px;display:flex;flex-direction:column;}
.w-feed-h{display:flex;align-items:center;justify-content:space-between;padding:12px 14px 8px;font:600 15px var(--font-display);}
.w-live{display:inline-flex;align-items:center;gap:6px;font:500 12px var(--font-mono);color:var(--muted);}
.w-live i{width:7px;height:7px;border-radius:50%;background:var(--muted);}
.w-live.on i{background:var(--ok,#22c55e);box-shadow:0 0 8px var(--ok,#22c55e);}
.w-list{list-style:none;overflow:auto;flex:1;padding:0 8px 10px;}
.w-list li{display:grid;grid-template-columns:10px 1fr auto;gap:8px;align-items:baseline;padding:6px;border-radius:6px;font-size:13px;}
.w-list li.new{animation:wnew 1.2s ease-out;}
@keyframes wnew{from{background:color-mix(in srgb,var(--accent) 22%,transparent);}to{background:transparent;}}
.w-list .sw{width:9px;height:9px;border-radius:2px;transform:translateY(1px);}
.w-list .t{color:var(--muted);font:12px var(--font-mono);}
.w-list .bad{color:var(--fault,#ef4444);}
.w-list .empty{display:block;color:var(--muted);padding:10px 6px;}
.w-tip{position:absolute;padding:8px 10px;font-size:13px;pointer-events:none;display:none;max-width:260px;z-index:5;}
.w-tip b{display:block;font:600 14px var(--font-display);}
.w-tip span{color:var(--muted);}
.w-legend{left:14px;bottom:14px;padding:10px 12px;display:grid;grid-template-columns:repeat(2,auto);gap:4px 14px;font-size:12px;color:var(--muted);}
.w-legend span{display:flex;align-items:center;gap:6px;}
.w-legend i{width:9px;height:9px;border-radius:2px;}
.w-err{position:absolute;inset:0;display:none;align-items:center;justify-content:center;color:var(--muted);text-align:center;padding:24px;}
@media(max-width:900px){
  .w-stage{left:0;}
  .w-feed{top:auto;left:14px;right:14px;bottom:14px;width:auto;height:34%;}
  .w-legend{display:none;}
  .w-title{right:14px;max-width:none;}
}
`;

function worldHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open HL · World</title>${FONT}${FAVICON}
<style>${BASE_CSS}${NAV_CSS}${TOAST_CSS}${WORLD_CSS}</style><script>${THEME_JS}</script>
<script type="importmap">{"imports":{"three":"/world/assets/three.module.min.js"}}</script></head><body>
${navBar("/world")}
<div class="w-stage" id="stage">
  <div class="w-hud w-card w-title">
    <h1>Open HL World</h1>
    <p>Every job Open HL runs is a robot errand. Inside the wall is Open HL, outside are the services it talks to.</p>
    <div class="row">
      <button class="w-btn" id="w-demo" type="button" title="Send a few practice errands. Nothing is really posted or sent."><i class="fa-solid fa-play"></i> Demo</button>
      <button class="w-btn on" id="w-spin" type="button" title="Slowly circle the town"><i class="fa-solid fa-rotate"></i> Orbit</button>
      <button class="w-btn" id="w-reset" type="button" title="Reset the camera"><i class="fa-solid fa-crosshairs"></i> Reset view</button>
    </div>
  </div>
  <div class="w-hud w-card w-feed">
    <div class="w-feed-h">Activity <span class="w-live" id="w-live"><i></i><span>connecting</span></span></div>
    <ul class="w-list" id="w-list"><li class="empty">Waiting for Open HL to do something…</li></ul>
  </div>
  <div class="w-hud w-card w-legend" id="w-legend"></div>
  <div class="w-card w-tip" id="w-tip"></div>
  <div class="w-err" id="w-err"></div>
</div>
<div class="toast" id="toast"></div>
<script>${TOAST_JS}</script>
<script type="module" src="/world/assets/world.js"></script>
</body></html>`;
}

module.exports = { worldHtml };
