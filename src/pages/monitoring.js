const { BASE_CSS, FAVICON, FONT, NAV_CSS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");

// ─── MONITORING ──────────────────────────────────────────────────────────────
// Reachability of every node Metis watches, drawn as a topology map, plus host
// metrics, the recent state changes, the check schedule and alert delivery.
//
// Client JS sits inside a template literal: no backticks, no dollar-brace, no
// backslashes.
function monitoringHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Metis · Monitoring</title>${FONT}${FAVICON}
<style>
${BASE_CSS}${NAV_CSS}${TOAST_CSS}
.mon-when{color:var(--muted);text-align:right;font-size:13px;line-height:1.5;}
.mon-when b{color:var(--text);font-weight:600;}

.kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));margin-bottom:16px;}
.kpi{padding:14px 16px;min-width:0;}
.kpi+.kpi{border-left:1px solid var(--line);}
.kpi .k{color:var(--muted);font-size:13px;}
.kpi .v{font:600 28px/1.15 var(--font-display);margin-top:4px;white-space:nowrap;}
.kpi .d{font-size:13px;color:var(--muted);margin-top:2px;}
.kpi .d b{font-weight:500;}
.up{color:var(--ok);} .dn{color:var(--fault);} .nu{color:var(--warn);}
#spark{width:100%;height:30px;display:block;margin-top:6px;}

.span-8{grid-column:span 8;} .span-7{grid-column:span 7;} .span-5{grid-column:span 5;} .span-4{grid-column:span 4;} .span-12{grid-column:span 12;}
.map-wrap{position:relative;padding:0 16px 16px;}
#map{width:100%;height:440px;display:block;}
.map-legend{display:flex;gap:16px;flex-wrap:wrap;padding:0 16px 14px;color:var(--muted);font-size:13px;}
.map-legend span{display:inline-flex;align-items:center;gap:6px;}
.map-legend i.ln{display:inline-block;width:18px;height:0;border-top:2px solid var(--line-strong);}
.map-legend i.ln.down{border-top:2px dashed var(--fault);}
.tip{position:absolute;pointer-events:none;background:var(--raised);border:1px solid var(--line-strong);border-radius:var(--r-ctl);
  padding:8px 10px;font-size:13px;line-height:1.45;box-shadow:0 10px 28px rgba(0,0,0,.35);display:none;z-index:5;max-width:260px;}
.tip b{display:block;font-weight:600;}
.tip span{display:block;color:var(--muted);}

.add-node{display:grid;grid-template-columns:1fr 84px;gap:8px;padding:0 16px 12px;}
.add-node .full{grid-column:1/-1;}
.add-node .btns{grid-column:1/-1;display:flex;gap:8px;}
.add-node .btns .m-btn{flex:1;}
.an-msg{font-size:13px;line-height:1.5;padding:0 16px 10px;min-height:0;}
.an-msg:empty{display:none;}
.roster{max-height:330px;overflow-y:auto;}
.rn{display:flex;align-items:center;gap:10px;padding:9px 16px;border-top:1px solid var(--line);}
.rn:hover,.rn.hl{background:var(--raised);}
.rn .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;background:var(--muted);}
.rn.on .dot{background:var(--ok);} .rn.off .dot{background:var(--fault);}
.rn .nm{flex:1;min-width:0;}
.rn .n1{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.rn .n2{font-size:13px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.rn .lat{font-size:13px;color:var(--muted);flex-shrink:0;}
.pill{font-size:12px;font-weight:500;padding:2px 8px;border-radius:99px;flex-shrink:0;border:1px solid var(--line);}
.pill.on{color:var(--ok);} .pill.off{color:var(--fault);border-color:color-mix(in srgb,var(--fault) 45%,var(--line));}
.rn .rx{visibility:hidden;background:none;border:none;color:var(--muted);width:26px;height:26px;border-radius:4px;flex-shrink:0;}
.rn:hover .rx,.rx:focus{visibility:visible;} .rn .rx:hover{color:var(--fault);background:var(--surface);}
.hint{color:var(--muted);font-size:13px;padding:12px 16px;border-top:1px solid var(--line);}

#activity{width:100%;height:220px;display:block;}
.meters{display:grid;gap:16px;padding:0 16px 16px;}
.m-meter-s{grid-column:1/-1;color:var(--muted);font-size:13px;margin-top:-2px;}

.lg{display:flex;gap:12px;padding:9px 16px;border-top:1px solid var(--line);font-size:14px;align-items:baseline;}
.lg .t{color:var(--muted);flex-shrink:0;font-size:13px;}
.lg .m{flex:1;min-width:0;}
.logs,#queue,#health{max-height:260px;overflow-y:auto;}
.q{padding:9px 16px;border-top:1px solid var(--line);}
.qtop{display:flex;align-items:baseline;justify-content:space-between;gap:8px;}
.qn{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.qs{font-size:13px;flex-shrink:0;font-weight:500;}
.qk{font-size:13px;color:var(--muted);margin-top:1px;}
.qbar{height:4px;background:var(--raised);border-radius:2px;margin-top:6px;overflow:hidden;}
.qbar i{display:block;height:100%;border-radius:2px;transition:width .5s linear;}
.hl-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 16px;border-top:1px solid var(--line);}
.hl-row .s{font-size:13px;display:flex;align-items:center;gap:8px;font-weight:500;}
.hl-row .s .d{width:8px;height:8px;border-radius:50%;}

.al-note{color:var(--muted);line-height:1.55;padding:0 16px 14px;max-width:80ch;}
.al-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;padding:0 16px;}
.al-ch{border:1px solid var(--line);border-radius:var(--r-ctl);padding:12px;background:var(--raised);display:flex;flex-direction:column;gap:8px;}
.al-row{display:flex;align-items:center;gap:8px;cursor:pointer;flex-wrap:wrap;}
.al-row input[type=checkbox]{accent-color:var(--accent);width:16px;height:16px;}
.al-row b{font-weight:600;}
.al-hint{font-size:13px;color:var(--muted);line-height:1.5;}
.al-fields{display:flex;flex-wrap:wrap;gap:8px;}
.al-fields .m-input{flex:1;min-width:140px;}
.al-acts{display:flex;gap:8px;padding:16px;}

@media(max-width:1200px){.kpis{grid-template-columns:repeat(3,minmax(0,1fr));}.kpi:nth-child(4){border-left:0;}.kpi:nth-child(n+4){border-top:1px solid var(--line);}
  .span-8,.span-4.roster-panel{grid-column:span 12;} .span-7,.span-5{grid-column:span 12;} .span-4{grid-column:span 6;}}
@media(max-width:760px){.mon-when{text-align:left;} .kpis{grid-template-columns:repeat(2,minmax(0,1fr));}.kpi{border-left:0!important;border-top:1px solid var(--line);}.kpi:nth-child(-n+2){border-top:0;}
  .span-4{grid-column:span 12;} #map{height:360px;}}
</style></head><body>
${navBar("/monitoring")}
<main class="m-page">
  <div class="m-head">
    <div><h1 class="m-title">Monitoring</h1><p class="m-sub">Whether your machines and services answer, checked on a schedule.</p></div>
    <div class="mon-when" aria-live="off"><div>Next check in <b id="q-countdown">&ndash;</b></div><div id="mon-clock"></div></div>
  </div>

  <section class="m-panel kpis" aria-label="Summary">
    <div class="kpi"><div class="k">Nodes online</div><div class="v" id="k-online">&ndash;</div><div class="d" id="k-online-d">&nbsp;</div></div>
    <div class="kpi"><div class="k">Availability</div><div class="v" id="k-avail">&ndash;</div><div class="d" id="k-avail-d">&nbsp;</div></div>
    <div class="kpi"><div class="k">Average check time</div><div class="v" id="k-sweep">&ndash;</div><div class="d" id="k-sweep-d">&nbsp;</div></div>
    <div class="kpi"><div class="k">Checks recorded</div><div class="v" id="k-checks">&ndash;</div><div class="d" id="k-checks-d">&nbsp;</div></div>
    <div class="kpi"><div class="k">Status</div><div class="v" id="k-status">&ndash;</div><canvas id="spark" aria-hidden="true"></canvas></div>
  </section>

  <div class="m-grid">
    <section class="m-panel span-8" aria-labelledby="map-t">
      <div class="m-panel-h"><h2 class="m-panel-t" id="map-t">Topology</h2><span class="m-panel-meta" id="map-note"></span></div>
      <div class="map-wrap"><canvas id="map" role="img" aria-label="Topology map of monitored nodes"></canvas><div class="tip" id="map-tip"></div></div>
      <div class="map-legend">
        <span><i class="m-dot ok"></i>Online</span><span><i class="m-dot fault"></i>Offline</span><span><i class="m-dot"></i>Not checked yet</span>
        <span><i class="ln"></i>Reachable</span><span><i class="ln down"></i>No response</span>
      </div>
    </section>

    <section class="m-panel span-4 roster-panel" aria-labelledby="nodes-t">
      <div class="m-panel-h"><h2 class="m-panel-t" id="nodes-t">Nodes</h2><span class="m-panel-meta" id="roster-count"></span></div>
      <div class="add-node">
        <input class="m-input" id="an-host" placeholder="IP address or host name" autocomplete="off" aria-label="IP address or host name">
        <input class="m-input" id="an-port" placeholder="Port" inputmode="numeric" aria-label="Port">
        <input class="m-input" id="an-name" placeholder="Name, optional" aria-label="Name">
        <select class="m-input" id="an-check" aria-label="Check type">
          <option value="tcp">TCP</option>
          <option value="http">HTTP</option>
          <option value="https">HTTPS</option>
        </select>
        <div class="btns">
          <button class="m-btn" id="an-test">Test</button>
          <button class="m-btn primary" id="an-add">Add node</button>
        </div>
      </div>
      <div class="an-msg" id="an-msg" role="status"></div>
      <div class="roster" id="roster"><div class="hint">Waiting for the first check&hellip;</div></div>
    </section>

    <section class="m-panel span-7" aria-labelledby="act-t">
      <div class="m-panel-h"><h2 class="m-panel-t" id="act-t">Nodes online over time</h2><span class="m-panel-meta" id="act-note"></span></div>
      <div class="m-panel-b"><canvas id="activity" role="img" aria-label="Number of nodes online at each check"></canvas></div>
    </section>

    <section class="m-panel span-5" aria-labelledby="host-t">
      <div class="m-panel-h"><h2 class="m-panel-t" id="host-t">This machine</h2><span class="m-panel-meta" id="host-note"></span></div>
      <div class="meters">
        <div class="m-meter"><span class="m-meter-l">CPU</span><span class="m-meter-v" id="v-cpu">&ndash;</span><span class="m-meter-t"><i id="g-cpu" style="width:0"></i></span><span class="m-meter-s" id="s-cpu"></span></div>
        <div class="m-meter"><span class="m-meter-l">Memory</span><span class="m-meter-v" id="v-mem">&ndash;</span><span class="m-meter-t"><i id="g-mem" style="width:0"></i></span><span class="m-meter-s" id="s-mem"></span></div>
        <div class="m-meter"><span class="m-meter-l">Load</span><span class="m-meter-v" id="v-load">&ndash;</span><span class="m-meter-t"><i id="g-load" style="width:0"></i></span><span class="m-meter-s" id="s-load"></span></div>
        <div class="m-meter"><span class="m-meter-l">Disk</span><span class="m-meter-v" id="v-disk">&ndash;</span><span class="m-meter-t"><i id="g-disk" style="width:0"></i></span><span class="m-meter-s" id="s-disk"></span></div>
      </div>
    </section>

    <section class="m-panel span-4" aria-labelledby="log-t">
      <div class="m-panel-h"><h2 class="m-panel-t" id="log-t">Recent changes</h2><span class="m-panel-meta" id="log-note"></span></div>
      <div class="logs" id="logs"><div class="hint">No changes recorded yet.</div></div>
    </section>
    <section class="m-panel span-4" aria-labelledby="q-t">
      <div class="m-panel-h"><h2 class="m-panel-t" id="q-t">Check schedule</h2><span class="m-panel-meta" id="q-note"></span></div>
      <div id="queue"><div class="hint">Waiting for the first check&hellip;</div></div>
    </section>
    <section class="m-panel span-4" aria-labelledby="health-t">
      <div class="m-panel-h"><h2 class="m-panel-t" id="health-t">Services</h2><span class="m-panel-meta" id="health-note"></span></div>
      <div id="health"><div class="hint">Checking&hellip;</div></div>
    </section>

    <section class="m-panel span-12" aria-labelledby="al-t">
      <div class="m-panel-h"><h2 class="m-panel-t" id="al-t">Alert channels</h2></div>
      <p class="al-note">Sends the same offline and recovery alerts Home speaks aloud, so they reach you away from the dashboard. Turn on any combination.</p>
      <div class="al-cols">
        <div class="al-ch">
          <label class="al-row"><input type="checkbox" id="al-ntfy-en"> <b>ntfy</b> <span class="al-hint">Phone push, no account needed</span></label>
          <div class="al-fields">
            <input class="m-input" id="al-ntfy-url" placeholder="https://ntfy.sh" aria-label="ntfy server">
            <input class="m-input" id="al-ntfy-topic" placeholder="Private topic" aria-label="ntfy topic">
          </div>
          <div class="al-hint">Subscribe in the ntfy app. Use a long, unguessable topic, because anyone who knows it can read your alerts.</div>
        </div>
        <div class="al-ch">
          <label class="al-row"><input type="checkbox" id="al-wh-en"> <b>Webhook</b> <span class="al-hint">Discord, Slack, Home Assistant</span></label>
          <div class="al-fields"><input class="m-input" id="al-wh-url" placeholder="https://" aria-label="Webhook URL"></div>
          <div class="al-hint">Sends a POST with title, message and urgent.</div>
        </div>
        <div class="al-ch">
          <label class="al-row"><input type="checkbox" id="al-po-en"> <b>Pushover</b> <span class="al-hint">Reliable phone push</span></label>
          <div class="al-fields">
            <input class="m-input" id="al-po-user" placeholder="User key" aria-label="Pushover user key">
            <input class="m-input" id="al-po-token" type="password" placeholder="App token" aria-label="Pushover app token">
          </div>
        </div>
        <div class="al-ch">
          <label class="al-row"><input type="checkbox" id="al-sp-en"> <b>Server speaker</b> <span class="al-hint" id="al-sp-avail">Checking&hellip;</span></label>
          <label class="al-row"><input type="checkbox" id="al-recovery"> Also alert when a node recovers</label>
        </div>
      </div>
      <div class="al-acts">
        <button class="m-btn primary" onclick="saveAlerts()">Save alert settings</button>
        <button class="m-btn" onclick="testAlert()">Send a test alert</button>
      </div>
    </section>
  </div>
</main>
<div class="toast" id="toast"></div>
<script>
${TOAST_JS}
function el(id){ return document.getElementById(id); }
function setText(id,v){ var e=document.getElementById(id); if(e) e.textContent=v; }
var DPR = Math.min(window.devicePixelRatio || 1, 2);
var NODES = [], SERIES = [], LOG = [], META = {};
var PEERS = [], LOCAL = [], JOBS = null, UPTIME = null, HOST = null, ALERTS_ON = null;

// Colours come from the active theme so the canvases follow the theme picker.
var C = {};
function readTokens(){
  var cs = getComputedStyle(document.documentElement);
  ['text','text-2','muted','line','line-strong','surface','raised','accent','ok','warn','fault'].forEach(function(k){
    C[k] = (cs.getPropertyValue('--' + k) || '').trim();
  });
}
readTokens();

function fit(cv){
  var w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return null;
  cv.width = Math.floor(w * DPR); cv.height = Math.floor(h * DPR);
  var x = cv.getContext('2d'); x.setTransform(DPR,0,0,DPR,0,0);
  return { ctx:x, w:w, h:h };
}
function hhmm(d){ return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); }
function hhmmss(d){ return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' }); }

// ═══ TOPOLOGY MAP ════════════════════════════════════════════════════════════
// Metis in the middle, the ways in on the left, every monitored node on the
// right. A down node's link turns into a red dashed line so an outage reads at
// a glance. Redrawn when data, size or theme changes; no idle animation.
var MAP = { hub:null, ins:[], outs:[], hover:null, overflow:0 };
function layoutMap(w,h){
  var narrow = w < 600;
  var cx = narrow ? Math.max(90, w*0.30) : Math.max(150, w*0.36), cy = h/2;
  MAP.hub = { x:cx, y:cy, r:30, label:'Metis', sub:(HOST && HOST.hostname) || 'this machine', kind:'hub' };
  var ins = [ {l:'Home network',s:'LAN'}, {l:'Tailscale',s:'remote access'}, {l:'Browsers and apps',s:'clients'} ];
  MAP.ins = ins.map(function(o,i){
    return { x: narrow ? 22 : Math.min(90, w*0.12), y: cy + (i - 1) * Math.min(110, h*0.26), r:10, label:o.l, sub:o.s, kind:'in' };
  });
  var n = NODES.length;
  var cols = n > 8 && w >= 600 ? 2 : 1;
  var pitch = Math.max(42, Math.min(84, (h - 40) / Math.max(1, Math.ceil(n / cols))));
  var perCol = Math.max(1, Math.floor((h - 40) / pitch));
  var cap = perCol * cols;
  MAP.overflow = Math.max(0, n - cap);
  var list = NODES.slice(0, cap);
  // Leave room for each label to the right of its node.
  var colX = narrow ? [cx + 70, cx + 70] : cols === 2 ? [Math.min(w*0.60, w - 430), Math.min(w*0.80, w - 215)] : [Math.min(w*0.78, w - 230)];
  if (narrow) { cols = 1; }
  MAP.outs = list.map(function(nd,i){
    var c = cols === 2 ? i % 2 : 0;
    var row = cols === 2 ? Math.floor(i/2) : i;
    var rows = Math.ceil(list.length / cols);
    var y = cy + (row - (rows-1)/2) * pitch;
    return { x: colX[c], y: y, r: pitch < 56 ? 9 : 12, label:nd.name,
      sub: nd.host ? (nd.host + ':' + nd.port) : nd.kind, node:nd, kind:'node' };
  });
}
function drawMap(){
  var f = fit(el('map')); if (!f) return;
  var ctx = f.ctx, w = f.w, h = f.h;
  ctx.clearRect(0,0,w,h);
  layoutMap(w,h);
  var hub = MAP.hub;

  function edge(a,b,state){
    var mx = (a.x+b.x)/2;
    ctx.beginPath(); ctx.moveTo(a.x,a.y);
    ctx.bezierCurveTo(mx,a.y,mx,b.y,b.x,b.y);
    ctx.setLineDash(state === 'down' ? [5,5] : []);
    ctx.strokeStyle = state === 'down' ? C.fault : (state === 'unknown' ? C.line : C['line-strong']);
    ctx.lineWidth = state === 'down' ? 1.6 : 1.4;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  MAP.ins.forEach(function(nd){ edge(nd, hub, 'ok'); });
  MAP.outs.forEach(function(nd){ edge(hub, nd, nd.node.online === true ? 'ok' : nd.node.online === false ? 'down' : 'unknown'); });

  function label(nd, align, dx, dy){
    ctx.textAlign = align;
    ctx.font = '500 13px "IBM Plex Sans", sans-serif'; ctx.fillStyle = C.text;
    var t = nd.label.length > 24 ? nd.label.slice(0,23) + '…' : nd.label;
    ctx.fillText(t, nd.x + dx, nd.y + dy);
    ctx.font = '12px "IBM Plex Sans", sans-serif'; ctx.fillStyle = C.muted;
    var sub = nd.sub || '';
    if (nd.node && nd.node.online && nd.node.latency != null) sub += '  ' + nd.node.latency + ' ms';
    ctx.fillText(sub, nd.x + dx, nd.y + dy + 16);
  }
  function node(nd, fill, ring, hot){
    ctx.beginPath(); ctx.arc(nd.x, nd.y, nd.r + (hot ? 3 : 0), 0, 6.283);
    ctx.fillStyle = C.surface; ctx.fill();
    ctx.lineWidth = hot ? 3 : 2; ctx.strokeStyle = ring; ctx.stroke();
    ctx.beginPath(); ctx.arc(nd.x, nd.y, Math.max(3, nd.r * 0.42), 0, 6.283);
    ctx.fillStyle = fill; ctx.fill();
  }
  MAP.ins.forEach(function(nd){ node(nd, C.muted, C['line-strong'], MAP.hover === nd); label(nd, 'left', -nd.r, -nd.r - 22); });
  MAP.outs.forEach(function(nd){
    var st = nd.node.online === true ? C.ok : nd.node.online === false ? C.fault : C.muted;
    node(nd, st, st, MAP.hover === nd);
    label(nd, 'left', nd.r + 10, -2);
  });
  // Hub: a larger ring in the interactive colour, labelled underneath.
  var downCount = NODES.filter(function(n){ return n.online === false; }).length;
  ctx.beginPath(); ctx.arc(hub.x, hub.y, hub.r, 0, 6.283); ctx.fillStyle = C.raised; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = downCount ? C.fault : C.accent; ctx.stroke();
  ctx.textAlign = 'center'; ctx.fillStyle = C.text; ctx.font = '600 15px "IBM Plex Sans Condensed", sans-serif';
  ctx.fillText('M', hub.x, hub.y + 5);
  label({ x:hub.x, y:hub.y, label:hub.label, sub:hub.sub }, 'center', 0, hub.r + 20);
  if (!NODES.length){
    ctx.textAlign = 'center'; ctx.fillStyle = C.muted; ctx.font = '13px "IBM Plex Sans", sans-serif';
    if (w < 600) ctx.fillText('Add a node to see it here', w/2, h - 18);
    else ctx.fillText('Add a node to see it here', w*0.78, cy0());
  }
  if (MAP.overflow > 0){
    ctx.textAlign = 'right'; ctx.font = '12px "IBM Plex Sans", sans-serif'; ctx.fillStyle = C.muted;
    ctx.fillText(MAP.overflow + ' more in the Nodes list', w - 4, h - 6);
  }
  function cy0(){ return h/2; }
}
(function(){
  var cv = el('map'), tip = el('map-tip');
  function pick(e){
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    var all = MAP.outs.concat(MAP.ins, MAP.hub ? [MAP.hub] : []);
    for (var i = 0; i < all.length; i++){
      var nd = all[i];
      if (Math.hypot(nd.x - x, nd.y - y) <= nd.r + 10) return { nd: nd, x: x, y: y };
    }
    return null;
  }
  cv.addEventListener('mousemove', function(e){
    var p = pick(e);
    var hot = p ? p.nd : null;
    if (hot !== MAP.hover){ MAP.hover = hot; drawMap(); highlightRow(hot && hot.node ? hot.node.id : null); }
    if (!p){ tip.style.display = 'none'; cv.style.cursor = 'default'; return; }
    cv.style.cursor = 'pointer';
    tip.textContent = '';
    var b = document.createElement('b'); b.textContent = p.nd.label; tip.appendChild(b);
    function line(t){ var s = document.createElement('span'); s.textContent = t; tip.appendChild(s); }
    if (p.nd.kind === 'node'){
      var n = p.nd.node;
      line(n.online === true ? 'Online' + (n.latency != null ? ', answered in ' + n.latency + ' ms' : '') : n.online === false ? 'Offline, not answering' : 'Not checked yet');
      if (n.host) line(n.host + ':' + n.port + (n.kind ? ', ' + n.kind : ''));
      if (n.detail) line(n.detail);
    } else if (p.nd.kind === 'hub'){
      line(HOST ? 'CPU ' + HOST.cpu + '%, memory ' + HOST.mem + '%' : 'This machine');
    } else line(p.nd.sub);
    tip.style.display = 'block';
    var left = p.x + 16, top = p.y + 12;
    if (left > cv.clientWidth - 240) left = p.x - 250;
    tip.style.left = (left + 16) + 'px'; tip.style.top = top + 'px';
  });
  cv.addEventListener('mouseleave', function(){ MAP.hover = null; tip.style.display = 'none'; drawMap(); highlightRow(null); });
})();
function highlightRow(id){
  document.querySelectorAll('.rn').forEach(function(r){ r.classList.toggle('hl', !!id && r.dataset.id === String(id)); });
}

// ═══ NODES ONLINE OVER TIME ══════════════════════════════════════════════════
function drawActivity(){
  var f = fit(el('activity')); if (!f) return;
  var ctx = f.ctx, w = f.w, h = f.h;
  ctx.clearRect(0,0,w,h);
  var padL = 30, padB = 22, padT = 8, padR = 8;
  var plotW = w - padL - padR, plotH = h - padT - padB;
  var total = 0;
  SERIES.forEach(function(s){ if (s.total > total) total = s.total; });
  if (total < 1) total = 1;
  ctx.strokeStyle = C.line; ctx.lineWidth = 1;
  ctx.font = '12px "IBM Plex Sans", sans-serif'; ctx.fillStyle = C.muted; ctx.textAlign = 'right';
  var ticks = Math.min(4, total);
  for (var i=0;i<=ticks;i++){
    var v = Math.round((i/ticks)*total);
    var y = padT + plotH - (v/total)*plotH;
    ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(w-padR,y); ctx.stroke();
    ctx.fillText(String(v), padL-8, y+4);
  }
  if (SERIES.length < 2){
    ctx.textAlign='center'; ctx.fillText('Collecting checks…', w/2, h/2); return;
  }
  function px(i){ return padL + (i/(SERIES.length-1))*plotW; }
  function py(v){ return padT + plotH - (v/total)*plotH; }
  // Degraded stretches are shaded so an outage is visible without reading the line.
  for (var k=1;k<SERIES.length;k++){
    if (SERIES[k].online < SERIES[k].total){
      ctx.fillStyle = C.fault; ctx.globalAlpha = 0.07;
      ctx.fillRect(px(k-1), padT, px(k)-px(k-1), plotH); ctx.globalAlpha = 1;
    }
  }
  ctx.beginPath();
  SERIES.forEach(function(s,i){ i ? ctx.lineTo(px(i), py(s.online)) : ctx.moveTo(px(i), py(s.online)); });
  ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
  var last = SERIES[SERIES.length-1];
  ctx.beginPath(); ctx.arc(px(SERIES.length-1), py(last.online), 4, 0, 6.283);
  ctx.fillStyle = last.online < last.total ? C.fault : C.accent; ctx.fill();
  ctx.textAlign='center'; ctx.fillStyle=C.muted; ctx.font='12px "IBM Plex Sans", sans-serif';
  var steps = Math.min(5, SERIES.length);
  for (var t=0;t<steps;t++){
    var idx = Math.round(t*(SERIES.length-1)/(steps-1 || 1));
    ctx.fillText(hhmm(new Date(SERIES[idx].at)), px(idx), h-6);
  }
}

// ═══ HOST METERS ═════════════════════════════════════════════════════════════
function gauge(id, valId, subId, pct, sub){
  var bar = el(id); if (!bar) return;
  var v = Math.max(0, Math.min(100, pct || 0));
  bar.style.width = v + '%';
  bar.className = v >= 90 ? 'fault' : (v >= 75 ? 'warn' : '');
  setText(valId, Math.round(v) + '%');
  setText(subId, sub || '');
}

// ═══ LISTS ═══════════════════════════════════════════════════════════════════
function fmtUp(sec){
  sec = Math.floor(sec||0);
  var d=Math.floor(sec/86400), h=Math.floor((sec%86400)/3600), m=Math.floor((sec%3600)/60);
  return d>0 ? d+'d '+h+'h' : h>0 ? h+'h '+m+'m' : m+'m';
}
function hint(parent, text){ var e=document.createElement('div'); e.className='hint'; e.textContent=text; parent.appendChild(e); }
function renderRoster(){
  var box = el('roster'); box.textContent='';
  if (!NODES.length){ hint(box, 'No nodes yet. Add a machine or service above.'); setText('roster-count',''); return; }
  NODES.forEach(function(n){
    var r=document.createElement('div'); r.className='rn '+(n.online===true?'on':n.online===false?'off':''); r.dataset.id = n.id;
    var d=document.createElement('span'); d.className='dot';
    var nm=document.createElement('span'); nm.className='nm';
    var n1=document.createElement('div'); n1.className='n1'; n1.textContent=n.name;
    var n2=document.createElement('div'); n2.className='n2'; n2.textContent= n.host ? (n.host + ':' + n.port + ', ' + n.kind) : n.kind + (n.detail ? ', ' + n.detail.charAt(0).toLowerCase() + n.detail.slice(1) : '');
    nm.appendChild(n1); nm.appendChild(n2);
    r.appendChild(d); r.appendChild(nm);
    if (n.latency != null && n.online){ var lt=document.createElement('span'); lt.className='lat'; lt.textContent=n.latency+' ms'; r.appendChild(lt); }
    var p=document.createElement('span'); p.className='pill '+(n.online===true?'on':n.online===false?'off':'');
    p.textContent = n.online===true ? 'Online' : n.online===false ? 'Offline' : 'Pending';
    r.appendChild(p);
    if (n.custom){
      var rx=document.createElement('button'); rx.className='rx'; rx.title='Stop monitoring'; rx.setAttribute('aria-label','Stop monitoring ' + n.name);
      var ic=document.createElement('i'); ic.className='fa-solid fa-xmark'; rx.appendChild(ic);
      rx.addEventListener('click', function(){ removeNode(String(n.id).replace('custom:',''), n.name); });
      r.appendChild(rx);
    }
    r.addEventListener('mouseenter', function(){ MAP.hover = MAP.outs.filter(function(o){ return o.node.id === n.id; })[0] || null; drawMap(); });
    r.addEventListener('mouseleave', function(){ MAP.hover = null; drawMap(); });
    box.appendChild(r);
  });
  var on = NODES.filter(function(n){return n.online;}).length;
  setText('roster-count', on + ' of ' + NODES.length + ' online');
}
function renderLogs(){
  var box=el('logs'); box.textContent='';
  if (!LOG.length){ hint(box, 'No changes yet. Every node has kept its state since Metis started.'); setText('log-note',''); return; }
  LOG.forEach(function(l){
    var row=document.createElement('div'); row.className='lg';
    var t=document.createElement('span'); t.className='t'; t.textContent=hhmm(new Date(l.at));
    var dot=document.createElement('span'); dot.className='m-dot ' + (l.online ? 'ok' : 'fault'); dot.style.alignSelf='center';
    var m=document.createElement('span'); m.className='m';
    var b=document.createElement('b'); b.textContent=l.name; b.style.fontWeight='600';
    m.appendChild(b); m.appendChild(document.createTextNode(l.online ? ' came back online' : ' went offline'));
    row.appendChild(t); row.appendChild(dot); row.appendChild(m); box.appendChild(row);
  });
  setText('log-note', LOG.length + ' events');
}
function renderQueue(){
  var box=el('queue'); box.textContent='';
  var interval = META.intervalMs || 30000;
  var elapsed = META.lastCheckAt ? (Date.now() - META.lastCheckAt) : 0;
  var secs = Math.max(0, Math.round((interval - elapsed)/1000));
  setText('q-countdown', secs + ' s');
  setText('q-note', 'every ' + Math.round(interval/1000) + ' s');
  var items=[];
  NODES.forEach(function(n){ items.push({ n:n.name, k:(n.check || n.kind) + ' check', ok:n.online }); });
  if (JOBS) items.push({ n:'Job search agent', k:(JOBS.totalJobs!=null?JOBS.totalJobs+' jobs':'agent'), ok:!!JOBS.running });
  if (!items.length){ hint(box, 'Nothing scheduled.'); return; }
  var pct = Math.max(0, Math.min(100, (elapsed/interval)*100));
  items.slice(0,8).forEach(function(it){
    var q=document.createElement('div'); q.className='q';
    var top=document.createElement('div'); top.className='qtop';
    var nm=document.createElement('span'); nm.className='qn'; nm.textContent=it.n;
    var st=document.createElement('span'); st.className='qs';
    st.textContent = it.ok ? 'Passing' : 'Failing'; st.style.color = it.ok ? C.ok : C.fault;
    top.appendChild(nm); top.appendChild(st);
    var k=document.createElement('div'); k.className='qk'; k.textContent=it.k;
    var bar=document.createElement('div'); bar.className='qbar';
    var fill=document.createElement('i'); fill.style.width=pct+'%'; fill.style.background = it.ok ? C.accent : C.fault;
    bar.appendChild(fill);
    q.appendChild(top); q.appendChild(k); q.appendChild(bar); box.appendChild(q);
  });
}
function healthRow(name, ok, text){
  var r=document.createElement('div'); r.className='hl-row';
  var n=document.createElement('span'); n.textContent=name;
  var s=document.createElement('span'); s.className='s';
  var d=document.createElement('span'); d.className='d';
  var col = ok===null ? C.muted : (ok ? C.ok : C.fault);
  d.style.background=col;
  var tx=document.createElement('span'); tx.textContent=text; tx.style.color = ok===null ? C.muted : C.text;
  s.appendChild(d); s.appendChild(tx); r.appendChild(n); r.appendChild(s);
  return r;
}
function renderHealth(){
  var box=el('health'); box.textContent='';
  var peersOn = PEERS.filter(function(p){return p.online;}).length;
  box.appendChild(healthRow('AI machines', PEERS.length ? peersOn===PEERS.length : null,
    PEERS.length ? (peersOn===PEERS.length ? 'All up' : peersOn+' of '+PEERS.length+' up') : 'None added'));
  var locOn = LOCAL.filter(function(s){return s.online;}).length;
  if (LOCAL.length) box.appendChild(healthRow('Local services', locOn===LOCAL.length,
    locOn===LOCAL.length ? 'All up' : locOn+' of '+LOCAL.length+' up'));
  box.appendChild(healthRow('UptimeRobot', UPTIME===null ? null : UPTIME.ok,
    UPTIME===null ? 'No API key' : (UPTIME.ok ? 'All up' : UPTIME.down+' down')));
  box.appendChild(healthRow('Job search agent', JOBS===null ? null : !!JOBS.running,
    JOBS===null ? 'Not running' : (JOBS.running ? 'Running' : 'Idle')));
  box.appendChild(healthRow('Storage', HOST ? HOST.disk < 90 : null,
    HOST ? (HOST.disk < 90 ? 'Enough space' : 'Low on space') : 'Unknown'));
  box.appendChild(healthRow('Alert delivery', ALERTS_ON===null ? null : ALERTS_ON,
    ALERTS_ON===null ? 'Unknown' : (ALERTS_ON ? 'On' : 'No channels on')));
}
function renderKPIs(){
  var on = NODES.filter(function(n){return n.online;}).length;
  var off = NODES.filter(function(n){return n.online === false;}).length;
  setText('k-online', NODES.length ? on + ' of ' + NODES.length : 'None');
  var d1=el('k-online-d'); d1.textContent='';
  var b1=document.createElement('b'); b1.className = !NODES.length ? '' : off ? 'dn' : 'up'; b1.textContent = NODES.length ? (off ? off + ' offline' : 'All reachable') : 'Add a node to start'; d1.appendChild(b1);
  setText('k-checks', String(SERIES.length));
  setText('k-checks-d', META.intervalMs ? 'one every ' + Math.round(META.intervalMs/1000) + ' s' : '');
  var pts=0, ups=0;
  SERIES.forEach(function(s){ pts += s.total; ups += s.online; });
  var avail = pts ? (ups/pts)*100 : null;
  setText('k-avail', avail===null ? '–' : avail.toFixed(1)+'%');
  setText('k-avail-d', avail===null ? '' : (avail >= 99.5 ? 'Steady' : avail >= 95 ? 'Some drops' : 'Unstable') + ' over this window');
  var ms=0; SERIES.forEach(function(s){ ms += s.ms; });
  var avg = SERIES.length ? ms/SERIES.length : null;
  setText('k-sweep', avg===null ? '–' : (avg>=1000 ? (avg/1000).toFixed(1)+' s' : Math.round(avg)+' ms'));
  setText('k-sweep-d', 'for a full round of checks');
  var st=el('k-status'); st.textContent = !NODES.length ? 'Standby' : off ? 'Degraded' : 'Healthy';
  st.className = 'v ' + (!NODES.length ? '' : off ? 'dn' : 'up');
  drawSpark();
}
function drawSpark(){
  var f = fit(el('spark')); if (!f) return;
  var ctx=f.ctx, w=f.w, h=f.h;
  ctx.clearRect(0,0,w,h);
  if (SERIES.length < 2) return;
  var maxT=1; SERIES.forEach(function(s){ if (s.total>maxT) maxT=s.total; });
  var pts = SERIES.slice(-40);
  ctx.beginPath();
  pts.forEach(function(s,i){ var x = (i/(pts.length-1))*w, y = h - 3 - (s.online/maxT)*(h-6); i ? ctx.lineTo(x,y) : ctx.moveTo(x,y); });
  var degraded = pts[pts.length-1].online < pts[pts.length-1].total;
  ctx.strokeStyle = degraded ? C.fault : C.accent; ctx.lineWidth=1.6; ctx.stroke();
}

// ═══ ADD / TEST / REMOVE NODES ═══════════════════════════════════════════════
function anFields(){ return { host: el('an-host').value.trim(), port: el('an-port').value.trim(), name: el('an-name').value.trim(), check: el('an-check').value }; }
function anSay(msg, kind){ var m = el('an-msg'); m.textContent = msg || ''; m.style.color = kind === 'bad' ? C.fault : (kind === 'ok' ? C.ok : C.muted); }
async function testNode(){
  var f = anFields();
  if (!f.host || !f.port){ anSay('Enter a host and a port first.', 'bad'); return; }
  var b = el('an-test'); b.disabled = true; anSay('Checking ' + f.host + ':' + f.port + '…');
  try {
    var r = await fetch('/api/nodes/test', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(f) }).then(function(x){ return x.json(); });
    if (r.error && !r.online) anSay(f.host + ':' + f.port + ' did not answer: ' + r.error, 'bad');
    else if (r.online) anSay('Reachable over ' + r.via.toUpperCase() + ' in ' + r.ms + ' ms.', 'ok');
    else anSay('No response.', 'bad');
  } catch(e){ anSay(e.message, 'bad'); }
  b.disabled = false;
}
async function addNode(){
  var f = anFields();
  if (!f.host || !f.port){ anSay('Enter a host and a port first.', 'bad'); return; }
  var b = el('an-add'); b.disabled = true;
  try {
    var r = await fetch('/api/nodes', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(f) }).then(function(x){ return x.json(); });
    if (r.error) throw new Error(r.error);
    anSay('Now monitoring ' + r.name + '.', 'ok');
    el('an-host').value = ''; el('an-port').value = ''; el('an-name').value = '';
    setTimeout(loadCore, 600);
  } catch(e){ anSay(e.message, 'bad'); }
  b.disabled = false;
}
async function removeNode(id, name){
  if (!confirm('Stop monitoring ' + name + '?')) return;
  await fetch('/api/nodes/' + id, { method:'DELETE' });
  showToast('Stopped monitoring ' + name, 'ok');
  loadCore();
}
el('an-add').addEventListener('click', addNode);
el('an-test').addEventListener('click', testNode);
['an-host','an-port','an-name'].forEach(function(id){ el(id).addEventListener('keydown', function(e){ if (e.key === 'Enter') addNode(); }); });

// ═══ DATA ════════════════════════════════════════════════════════════════════
async function loadCore(){
  try {
    var d = await fetch('/api/monitor/history').then(function(r){return r.json();});
    NODES = d.nodes || []; SERIES = d.series || []; LOG = d.log || [];
    META = { intervalMs: d.intervalMs, lastCheckAt: d.lastCheckAt, primed: d.primed };
    renderRoster(); renderLogs(); renderKPIs(); renderQueue(); drawActivity(); drawMap();
    var down = NODES.filter(function(n){ return n.online === false; }).length;
    setText('map-note', NODES.length ? NODES.length + (NODES.length === 1 ? ' node' : ' nodes') + (down ? ', ' + down + ' offline' : '') : '');
    setText('act-note', SERIES.length > 1 ? 'last ' + SERIES.length + ' checks' : '');
  } catch(e){}
}
async function loadHost(){
  try {
    HOST = await fetch('/api/system/metrics').then(function(r){return r.json();});
    gauge('g-cpu','v-cpu','s-cpu', HOST.cpu, HOST.cores + ' cores');
    gauge('g-mem','v-mem','s-mem', HOST.mem, (Math.round(HOST.freeMem/1073741824*10)/10) + ' GB free');
    gauge('g-load','v-load','s-load', HOST.loadPct, 'Load average ' + HOST.load1);
    gauge('g-disk','v-disk','s-disk', HOST.disk, HOST.diskLabel || 'Root file system');
    setText('host-note', HOST.hostname + ', up ' + fmtUp(HOST.uptime));
    renderHealth();
    if (!MAP.hub || MAP.hub.sub !== HOST.hostname) drawMap();
  } catch(e){}
}
async function loadSide(){
  try { var d = await fetch('/api/ai/peers').then(function(r){return r.json();}); PEERS = Array.isArray(d) ? d : (d.peers || []); } catch(e){ PEERS = []; }
  try { var l = await fetch('/api/services/local').then(function(r){return r.json();}); LOCAL = l.services || []; } catch(e){ LOCAL = []; }
  try { var j = await fetch('/api/job-search/status').then(function(r){return r.json();}); JOBS = (j && !j.error) ? j : null; } catch(e){ JOBS = null; }
  try {
    var u = await fetch('/api/uptime').then(function(r){return r.json();});
    if (u.error) UPTIME = null;
    else { var mons = u.monitors || (u.response && u.response.monitors) || []; var down = mons.filter(function(m){ return m.status === 9; }).length; UPTIME = { ok: down === 0, down: down, total: mons.length }; }
  } catch(e){ UPTIME = null; }
  renderHealth();
}
if ('EventSource' in window) {
  try { var es = new EventSource('/api/events'); es.addEventListener('node_status', function(){ loadCore(); }); } catch(e){}
}
function tickClock(){ setText('mon-clock', 'Last checked ' + (META.lastCheckAt ? hhmmss(new Date(META.lastCheckAt)) : 'not yet')); }
setInterval(function(){ renderQueue(); tickClock(); }, 1000);
loadCore();  setInterval(loadCore, 10000);
loadHost();  setInterval(loadHost, 4000);
loadSide();  setInterval(loadSide, 30000);
var rT = null;
window.addEventListener('resize', function(){ clearTimeout(rT); rT = setTimeout(function(){ drawActivity(); drawSpark(); drawMap(); }, 80); });
window.addEventListener('metis:theme', function(){ readTokens(); drawActivity(); drawSpark(); drawMap(); renderQueue(); renderHealth(); });

// ═══ ALERT CHANNELS ══════════════════════════════════════════════════════════
async function loadAlerts(){
  try{
    var c = await fetch('/api/alerts/config').then(function(r){return r.json();});
    el('al-ntfy-en').checked = c.ntfy.enabled;
    el('al-ntfy-url').value = c.ntfy.url || 'https://ntfy.sh';
    el('al-ntfy-topic').value = c.ntfy.topic || '';
    el('al-wh-en').checked = c.webhook.enabled;
    el('al-wh-url').value = c.webhook.url || '';
    el('al-po-en').checked = c.pushover.enabled;
    el('al-po-user').value = c.pushover.user || '';
    el('al-po-token').value = '';
    el('al-po-token').placeholder = c.pushover.hasToken ? 'Saved. Leave blank to keep it.' : 'App token';
    var sp = el('al-sp-en');
    sp.checked = c.speaker.enabled; sp.disabled = !c.speaker.available;
    el('al-sp-avail').textContent = c.speaker.available ? ('Uses ' + c.speaker.cmd) : 'No speaker on this machine';
    el('al-recovery').checked = c.recovery;
    ALERTS_ON = !!(c.ntfy.enabled || c.webhook.enabled || c.pushover.enabled || c.speaker.enabled);
    renderHealth();
  }catch(e){}
}
async function saveAlerts(){
  var body = {
    ntfy: { enabled: el('al-ntfy-en').checked, url: el('al-ntfy-url').value, topic: el('al-ntfy-topic').value },
    webhook: { enabled: el('al-wh-en').checked, url: el('al-wh-url').value },
    pushover: { enabled: el('al-po-en').checked, user: el('al-po-user').value, token: el('al-po-token').value },
    speaker: { enabled: el('al-sp-en').checked },
    recovery: el('al-recovery').checked
  };
  try{ await fetch('/api/alerts/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); showToast('Alert settings saved','success'); loadAlerts(); }
  catch(e){ showToast('Could not save alert settings','error'); }
}
async function testAlert(){
  showToast('Sending a test alert…','info');
  try{ await fetch('/api/alerts/test',{method:'POST'}).then(function(x){return x.json();}); showToast('Test alert sent to every channel that is on','success'); }
  catch(e){ showToast('Test alert failed: '+e.message,'error'); }
}
loadAlerts();
</script></body></html>`;
}

module.exports = { monitoringHtml };
