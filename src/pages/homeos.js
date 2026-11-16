const { BASE_CSS, FAVICON, FONT, NAV_CSS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");

function homeosHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open HL \xb7 HomeOS</title>${FONT}${FAVICON}
<style>
${BASE_CSS}${NAV_CSS}${TOAST_CSS}
.ho{max-width:1440px;}
.ho-top{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px;}
.ho-title{font-family:var(--font-display);font-weight:600;font-size:26px;}
.ho-sub{font-family:var(--font-ui);font-size:13px;color:var(--muted);margin-top:3px;}
.ho-acts{display:flex;gap:8px;flex-wrap:wrap;}
.ho-btn{background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:var(--r-ctl);
  padding:9px 15px;font-size:13px;font-family:var(--font-ui);transition:all .15s;}
.ho-btn:hover{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 18%,var(--surface2));}
.ho-btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:600;}
.ho-btn:disabled{opacity:.45;}

.ho-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;}
.ho-stat{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-panel);padding:14px 16px;}
.ho-stat .k{font-family:var(--font-ui);font-size:12px;color:var(--muted);}
.ho-stat .v{font-family:var(--font-display);font-weight:600;font-size:26px;margin-top:4px;}
.ho-stat .v small{font-size:12px;color:var(--muted);font-weight:600;}

.ho-room{margin-bottom:24px;}
.ho-room-h{display:flex;align-items:center;gap:10px;margin-bottom:11px;}
.ho-room-h .n{font-family:var(--font-display);font-weight:600;font-size:18px;}
.ho-room-h .c{font-family:var(--font-ui);font-size:13px;color:var(--muted);}
.ho-room-h::after{content:'';flex:1;height:1px;background:var(--border);}
.ho-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:13px;}

.dev{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-panel);padding:15px;position:relative;
  transition:border-color .16s;display:flex;flex-direction:column;gap:10px;}
.dev:hover{border-color:color-mix(in srgb,var(--accent) 50%,var(--border));}
.dev.off{opacity:.62;}
.dev-top{display:flex;align-items:flex-start;gap:10px;}
.dev-ico{width:38px;height:38px;border-radius:var(--r-ctl);display:flex;align-items:center;justify-content:center;
  font-size:16px;color:var(--text-2);flex-shrink:0;background:var(--surface2);border:1px solid var(--border);}
.dev-nm{flex:1;min-width:0;}
.dev-n1{font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dev-n2{font-family:var(--font-ui);font-size:12px;color:var(--muted);margin-top:2px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dev-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:5px;}
.dev-dot.on{background:var(--green);}
.dev-dot.off{background:var(--red);}
.dev-dot.unk{background:var(--muted);}

.sw{position:relative;width:50px;height:28px;border-radius:99px;background:var(--surface2);
  border:1px solid var(--border);flex-shrink:0;transition:background .18s,border-color .18s;padding:0;}
.sw::after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;
  background:var(--muted);transition:transform .18s,background .18s;}
.sw.on{background:var(--accent);border-color:var(--accent);}
.sw.on::after{transform:translateX(22px);background:var(--accent-ink);}
.sw:disabled{opacity:.4;}

.dev-metrics{display:flex;gap:12px;flex-wrap:wrap;font-family:var(--font-ui);font-size:13px;}
.met{display:flex;flex-direction:column;gap:1px;}
.met .mk{font-size:12px;color:var(--muted);}
.met .mv{font-size:12px;font-weight:600;color:var(--text);}
.met .mv.hot{color:var(--red);}
.spark{width:100%;height:32px;display:block;}
.dev-foot{display:flex;align-items:center;gap:7px;flex-wrap:wrap;}
.tag{font-family:var(--font-ui);font-size:12px;padding:2px 7px;border-radius:var(--r-ctl);
  background:var(--surface2);border:1px solid var(--border);color:var(--muted);}
.tag.local{color:var(--green);border-color:color-mix(in srgb,var(--green) 45%,transparent);}
.tag.cloud{color:var(--accent2);border-color:color-mix(in srgb,var(--accent2) 45%,transparent);}
.tag.err{color:var(--red);border-color:color-mix(in srgb,var(--red) 45%,transparent);}
.mini{background:none;border:none;color:var(--muted);font-size:13px;width:28px;height:28px;border-radius:var(--r-ctl);margin-left:auto;}
.mini+.mini{margin-left:0;} .mini:hover{background:var(--raised);}
.mini:hover{color:var(--accent);}
.mini.del:hover{color:var(--red);}

/* Typhur cook monitor */
.dev.typhur{border-color:color-mix(in srgb,var(--warn) 35%,var(--line));}
.cook{display:flex;align-items:center;gap:12px;}
.cook-ring{position:relative;width:62px;height:62px;flex-shrink:0;}
.cook-ring svg{width:100%;height:100%;transform:rotate(-90deg);}
.cook-ring .cv{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:18px;}
.cook-txt .p{font-family:var(--font-display);font-weight:600;font-size:15px;text-transform:capitalize;}
.cook-txt .s{font-family:var(--font-ui);font-size:12px;color:var(--muted);margin-top:3px;line-height:1.5;}
.phase-idle{color:var(--muted);} .phase-preheating{color:var(--warn);}
.phase-cooking{color:var(--red);} .phase-finished{color:var(--green);}

/* camera tile */
.dev.cam .cam-body{position:relative;background:var(--field);border:1px solid var(--border);border-radius:var(--r-ctl);
  height:126px;display:flex;align-items:center;justify-content:center;overflow:hidden;}
.dev.cam .cam-body img{width:100%;height:100%;object-fit:cover;display:block;}
.cam-ph{font-family:var(--font-ui);font-size:12px;color:var(--muted);
  text-align:center;padding:0 12px;line-height:1.6;}
.cam-armed{position:absolute;top:7px;left:7px;font-family:var(--font-ui);font-size:12px;
  padding:2px 7px;border-radius:var(--r-ctl);background:rgba(0,0,0,.66);}
.cam-armed.on{color:var(--ok);border:1px solid var(--ok);}
.cam-armed.off{color:var(--fault);border:1px solid var(--fault);}
.cam-age{position:absolute;bottom:7px;right:7px;font-family:var(--font-ui);font-size:12px;
  color:#cbd5e1;background:rgba(0,0,0,.66);padding:2px 6px;border-radius:var(--r-ctl);}
.cam-ctl{display:flex;gap:5px;flex-wrap:wrap;}
.cbtn{flex:1;min-width:62px;background:var(--surface2);border:1px solid var(--border);color:var(--text);
  border-radius:var(--r-ctl);padding:6px 8px;font-size:12px;font-family:var(--font-ui);
  transition:all .14s;}
.cbtn:hover:not(:disabled){border-color:var(--accent);background:color-mix(in srgb,var(--accent) 20%,var(--surface2));}
.cbtn:disabled{opacity:.45;}
.cbtn.armed{border-color:var(--green);color:var(--green);}

.empty{text-align:center;padding:52px 20px;color:var(--muted);font-family:var(--font-ui);font-size:12px;}
.empty .e{font-size:26px;display:block;margin-bottom:12px;color:var(--muted);}

/* modal */
.mbg{position:fixed;inset:0;background:rgba(5,8,12,.6);z-index:300;display:none;align-items:center;
  justify-content:center;padding:20px;}
.mbg.on{display:flex;}
.mod{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-panel);width:100%;max-width:540px;
  max-height:88vh;display:flex;flex-direction:column;}
.mod-h{padding:18px 20px 0;display:flex;align-items:center;justify-content:space-between;}
.mod-t{font-family:var(--font-display);font-weight:600;font-size:16px;}
.mod-x{background:none;border:1px solid var(--border);border-radius:var(--r-ctl);color:var(--muted);width:28px;height:28px;font-size:12px;}
.mod-x:hover{border-color:var(--red);color:var(--red);}
.mod-b{padding:16px 20px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;}
.mod-f{padding:0 20px 18px;display:flex;justify-content:flex-end;gap:8px;}
.fl{font-family:var(--font-ui);font-size:13px;font-weight:500;color:var(--text-2);margin-bottom:6px;}
.fi,.fs{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--r-ctl);padding:9px 12px;
  color:var(--text);font-size:12.5px;font-family:var(--font-ui);outline:none;}
.fi:focus,.fs:focus{border-color:var(--accent);}
.fhint{font-family:var(--font-ui);font-size:12px;color:var(--muted);margin-top:5px;line-height:1.6;}
.fhint b{color:var(--text);}
.frow{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.vendor-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:7px;}
.vchip{padding:10px 6px;border-radius:var(--r-ctl);background:var(--surface2);border:1px solid var(--border);
  font-size:13px;font-family:var(--font-ui);text-align:center;transition:all .14s;}
.vchip:hover{border-color:var(--accent);}
.vchip.sel{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 22%,transparent);}
.vchip .ve{display:block;font-size:16px;margin-bottom:4px;color:var(--text-2);}
.vchip .vs{display:block;font-size:12px;margin-top:3px;}
.vs.ok{color:var(--green);} .vs.no{color:var(--red);}
.disc-row{display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--border);
  border-radius:var(--r-ctl);background:var(--surface2);}
.disc-row .dn{flex:1;min-width:0;font-size:12px;}
.disc-row .dh{font-family:var(--font-ui);font-size:12px;color:var(--muted);}
@media(max-width:640px){.ho{padding:14px 12px 26px;}.frow{grid-template-columns:1fr;}}
</style></head><body>

${navBar("/homeos")}
<div class="ho m-page">
  <div class="m-head">
    <div>
      <h1 class="m-title">HomeOS</h1>
      <p class="m-sub" id="ho-sub">Plugs, lights, cameras and appliances around the house.</p>
    </div>
    <div class="m-actions">
      <button class="m-btn" id="btn-refresh"><i class="fa-solid fa-rotate"></i>Refresh</button>
      <button class="m-btn" id="btn-discover"><i class="fa-solid fa-magnifying-glass"></i>Find devices on the network</button>
      <button class="m-btn primary" id="btn-add"><i class="fa-solid fa-plus"></i>Add device</button>
    </div>
  </div>

  <div class="ho-summary" id="ho-summary"></div>
  <div id="ho-rooms"></div>
</div>

<div class="mbg" id="add-modal">
  <div class="mod">
    <div class="mod-h"><div class="mod-t" id="add-title">Add device</div><button class="mod-x" id="add-x" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="mod-b">
      <div><div class="fl">Vendor</div><div class="vendor-grid" id="vendor-grid"></div></div>
      <div id="vendor-note" class="fhint"></div>
      <div class="frow">
        <div><div class="fl">Name</div><input class="fi" id="f-name" placeholder="Kitchen plug"></div>
        <div><div class="fl">Room</div><input class="fi" id="f-room" placeholder="Kitchen" list="room-list">
          <datalist id="room-list"></datalist></div>
      </div>
      <div class="frow">
        <div><div class="fl">Type</div>
          <select class="fs" id="f-kind">
            <option value="plug">Plug / switch</option>
            <option value="bulb">Bulb / light</option>
            <option value="camera">Camera</option>
            <option value="sensor">Sensor</option>
            <option value="appliance">Appliance</option>
          </select></div>
        <div id="wrap-host"><div class="fl">IP address</div><input class="fi" id="f-host" placeholder="192.168.1.50"></div>
      </div>
      <div id="wrap-tuya" style="display:none">
        <div class="frow">
          <div><div class="fl">Device ID</div><input class="fi" id="f-devid" placeholder="bfa1b2c3\u2026"></div>
          <div><div class="fl">Local key</div><input class="fi" id="f-localkey" placeholder="16-char key"></div>
        </div>
        <div class="fhint">Both come from the Tuya IoT console (<b>iot.tuya.com</b> \u2192 Cloud \u2192 Devices).
          The local key is what lets Open HL talk to the plug directly on your LAN with no internet round-trip.</div>
      </div>
      <div id="wrap-sonoff" style="display:none">
        <div><div class="fl">Firmware</div>
          <select class="fs" id="f-mode">
            <option value="tasmota">Tasmota / ESPHome (HTTP)</option>
            <option value="ewelink">Stock eWeLink, DIY mode (:8081)</option>
          </select></div>
        <div class="fhint">Stock Sonoff needs <b>DIY mode</b> enabled to be controllable locally; otherwise
          only the eWeLink cloud can reach it. Flashing Tasmota gives full local control and power metering.</div>
      </div>
      <div id="wrap-cloudid" style="display:none">
        <div><div class="fl">Account device</div>
          <select class="fs" id="f-clouddev"><option value="">Loading\u2026</option></select></div>
        <div class="fhint" id="cloud-hint"></div>
      </div>
      <div id="wrap-rtsp" style="display:none">
        <div><div class="fl">RTSP URL (optional)</div>
          <input class="fi" id="f-rtsp" placeholder="rtsp://user:pass@192.168.1.60:554/stream1"></div>
        <div class="fhint">Kasa KC-series and most ONVIF cameras expose <b>/stream1</b> (HD) and <b>/stream2</b> (SD).
          Open HL stores this server-side and never sends the credentials to your browser.</div>
      </div>
      <div id="wrap-typhur" style="display:none">
        <div><div class="fl">Read power from</div>
          <select class="fs" id="f-powerfrom"><option value="">\u2014 none (network presence only) \u2014</option></select></div>
        <div class="frow" style="margin-top:10px">
          <div><div class="fl">Idle watts \u2264</div><input class="fi" id="f-idlew" placeholder="10" value="10"></div>
          <div><div class="fl">Cooking watts \u2265</div><input class="fi" id="f-cookw" placeholder="400" value="400"></div>
        </div>
        <div class="fhint">Typhur publishes <b>no API</b>. Bind an energy-monitoring plug and Open HL infers
          idle / preheating / cooking / finished from the power curve, and alerts when a cook ends.
          <b>Use a 15A-rated plug</b> \u2014 the Dome draws ~1800W.</div>
      </div>
    </div>
    <div class="mod-f">
      <button class="ho-btn" id="add-cancel">Cancel</button>
      <button class="ho-btn primary" id="add-save">Save</button>
    </div>
  </div>
</div>

<div class="mbg" id="disc-modal">
  <div class="mod">
    <div class="mod-h"><div class="mod-t">Discovered on your LAN</div><button class="mod-x" id="disc-x">\u2715</button></div>
    <div class="mod-b" id="disc-body"></div>
    <div class="mod-f"><button class="ho-btn" id="disc-close">Close</button></div>
  </div>
</div>

<div class="toast" id="toast"></div>
<script>
${TOAST_JS}
var DEVICES = [], CREDS = {}, EDITING = null, SELVENDOR = 'kasa';
var LOCAL_VENDORS = { kasa:1, gosund:1, sonoff:1, camera:1, typhur:1 };
var VENDORS = [
  { id:'kasa',   label:'Kasa',   icon:'fa-solid fa-plug' },
  { id:'gosund', label:'Gosund', icon:'fa-solid fa-plug-circle-bolt' },
  { id:'sonoff', label:'Sonoff', icon:'fa-solid fa-microchip' },
  { id:'wyze',   label:'Wyze',   icon:'fa-solid fa-video' },
  { id:'ring',   label:'Ring',   icon:'fa-solid fa-bell' },
  { id:'blink',  label:'Blink',  icon:'fa-solid fa-camera' },
  { id:'camera', label:'RTSP cam',icon:'fa-solid fa-video' },
  { id:'typhur', label:'Typhur', icon:'fa-solid fa-fire-burner' }
];
var KIND_ICON = { plug:'fa-solid fa-plug', bulb:'fa-regular fa-lightbulb', camera:'fa-solid fa-video', sensor:'fa-solid fa-temperature-half', appliance:'fa-solid fa-kitchen-set' };
function faIcon(cls){ var i = document.createElement('i'); i.className = cls; i.setAttribute('aria-hidden','true'); return i; }

function el(id){ return document.getElementById(id); }
function fmtW(w){ if (w == null) return '\\u2014'; return w >= 1000 ? (w/1000).toFixed(2)+'kW' : Math.round(w)+'W'; }
function ago(ts){ if(!ts) return 'never'; var s=Math.round((Date.now()-ts)/1000);
  if(s<60) return s+'s ago'; if(s<3600) return Math.round(s/60)+'m ago'; return Math.round(s/3600)+'h ago'; }

// ═══ RENDER ══════════════════════════════════════════════════════════════════
function drawSpark(cv, series){
  if (!cv || !series || series.length < 2) return;
  var dpr = Math.min(window.devicePixelRatio||1, 2);
  var w = cv.clientWidth, h = cv.clientHeight;
  if (!w) return;
  cv.width = w*dpr; cv.height = h*dpr;
  var x = cv.getContext('2d'); x.setTransform(dpr,0,0,dpr,0,0);
  x.clearRect(0,0,w,h);
  var max = 1; series.forEach(function(p){ if(p.w>max) max=p.w; });
  x.beginPath();
  series.forEach(function(p,i){
    var px = (i/(series.length-1))*w, py = h-2-(p.w/max)*(h-4);
    if(i===0) x.moveTo(px,py); else x.lineTo(px,py);
  });
  x.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent2') || '#22d3ee';
  x.lineWidth = 1.5; x.stroke();
  x.lineTo(w,h); x.lineTo(0,h); x.closePath();
  x.fillStyle = 'rgba(34,211,238,.14)'; x.fill();
}

function buildDevice(d){
  var live = d.live || {}, st = live.state || {};
  var card = document.createElement('div');
  card.className = 'dev' + (live.online === false ? ' off' : '') +
    (d.vendor === 'typhur' ? ' typhur' : '') + (d.kind === 'camera' ? ' cam' : '');

  var top = document.createElement('div'); top.className = 'dev-top';
  var ico = document.createElement('div'); ico.className = 'dev-ico';
  ico.appendChild(faIcon(KIND_ICON[d.kind] || 'fa-solid fa-plug'));
  var nm = document.createElement('div'); nm.className = 'dev-nm';
  var n1 = document.createElement('div'); n1.className = 'dev-n1'; n1.textContent = d.name;
  var n2 = document.createElement('div'); n2.className = 'dev-n2';
  n2.textContent = d.vendor + (d.host ? ' \\u00b7 ' + d.host : '') + ' \\u00b7 ' + ago(live.at);
  nm.appendChild(n1); nm.appendChild(n2);
  var dot = document.createElement('div');
  dot.className = 'dev-dot ' + (live.online === true ? 'on' : (live.online === false ? 'off' : 'unk'));
  dot.title = live.online === true ? 'reachable' : (live.err || 'unknown');
  top.appendChild(ico); top.appendChild(nm); top.appendChild(dot);

  // switch, only where the vendor actually supports control
  if (st.on !== undefined && st.on !== null && d.kind !== 'camera' && d.vendor !== 'typhur') {
    var sw = document.createElement('button');
    sw.className = 'sw' + (st.on ? ' on' : '');
    sw.disabled = live.online !== true;
    sw.title = st.on ? 'Turn off' : 'Turn on';
    sw.addEventListener('click', function(){ toggle(d, !st.on, sw); });
    top.appendChild(sw);
  }
  card.appendChild(top);

  if (d.vendor === 'typhur') card.appendChild(buildCook(d, st));
  else if (d.kind === 'camera') card.appendChild(buildCam(d, st));

  // metrics
  var mets = [];
  if (st.w != null)       mets.push(['power', fmtW(st.w), st.w > 1500]);
  if (st.v != null)       mets.push(['volts', Math.round(st.v)+'V', false]);
  if (st.a != null)       mets.push(['amps', Number(st.a).toFixed(1)+'A', st.a > 13]);
  if (st.kwh != null)     mets.push(['total', Number(st.kwh).toFixed(2)+'kWh', false]);
  if (st.battery != null) mets.push(['battery', st.battery+'%', st.battery < 20]);
  if (st.brightness != null) mets.push(['bright', st.brightness+'%', false]);
  if (st.rssi != null)    mets.push(['rssi', st.rssi+'dBm', false]);
  if (st.temp != null)    mets.push(['temp', st.temp+'\\u00b0', false]);
  if (mets.length){
    var mw = document.createElement('div'); mw.className = 'dev-metrics';
    mets.forEach(function(m){
      var b = document.createElement('div'); b.className = 'met';
      var k = document.createElement('div'); k.className = 'mk'; k.textContent = m[0];
      var v = document.createElement('div'); v.className = 'mv' + (m[2] ? ' hot' : ''); v.textContent = m[1];
      b.appendChild(k); b.appendChild(v); mw.appendChild(b);
    });
    card.appendChild(mw);
  }
  if (st.w != null){
    var cv = document.createElement('canvas'); cv.className = 'spark';
    card.appendChild(cv);
    fetch('/api/homeos/energy?id=' + encodeURIComponent(d.id))
      .then(function(r){ return r.json(); })
      .then(function(j){ drawSpark(cv, j.series); }).catch(function(){});
  }

  var foot = document.createElement('div'); foot.className = 'dev-foot';
  var t = document.createElement('span');
  t.className = 'tag ' + (LOCAL_VENDORS[d.vendor] ? 'local' : 'cloud');
  t.textContent = LOCAL_VENDORS[d.vendor] ? 'local' : 'cloud';
  foot.appendChild(t);
  if (live.err){
    var e = document.createElement('span'); e.className = 'tag err';
    e.textContent = String(live.err).slice(0, 30); e.title = live.err;
    foot.appendChild(e);
  }
  var ed = document.createElement('button'); ed.className = 'mini'; ed.appendChild(faIcon('fa-solid fa-pen')); ed.title = 'Edit'; ed.setAttribute('aria-label','Edit');
  ed.addEventListener('click', function(){ openEdit(d); });
  var dl = document.createElement('button'); dl.className = 'mini del'; dl.appendChild(faIcon('fa-solid fa-trash')); dl.title = 'Remove'; dl.setAttribute('aria-label','Remove');
  dl.addEventListener('click', function(){ removeDev(d); });
  foot.appendChild(ed); foot.appendChild(dl);
  card.appendChild(foot);
  return card;
}

function buildCook(d, st){
  var wrap = document.createElement('div'); wrap.className = 'cook';
  var ring = document.createElement('div'); ring.className = 'cook-ring';
  var pct = st.w != null ? Math.min(100, (st.w / 1800) * 100) : 0;
  var circ = 2 * Math.PI * 26;
  ring.innerHTML = '<svg viewBox="0 0 62 62">' +
    '<circle cx="31" cy="31" r="26" fill="none" stroke="var(--raised)" stroke-width="6"/>' +
    '<circle cx="31" cy="31" r="26" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" ' +
    'stroke-dasharray="' + circ + '" stroke-dashoffset="' + (circ - (pct/100)*circ) + '"/></svg>' +
    '<div class="cv"><i class="fa-solid fa-fire-burner" aria-hidden="true"></i></div>';
  ring.className = 'cook-ring phase-' + (st.phase || 'idle');
  var txt = document.createElement('div'); txt.className = 'cook-txt';
  var p = document.createElement('div'); p.className = 'p phase-' + (st.phase || 'idle');
  p.textContent = st.phase || (st.boundPlug ? 'unknown' : 'no plug bound');
  var s = document.createElement('div'); s.className = 's';
  var bits = [];
  if (st.w != null) bits.push(fmtW(st.w) + ' draw');
  if (st.since) bits.push((st.phase === 'finished' ? 'done ' : 'for ') +
    Math.max(0, Math.round((Date.now() - st.since)/60000)) + 'm' + (st.phase === 'finished' ? ' ago' : ''));
  bits.push(st.note || '');
  s.textContent = bits.filter(Boolean).join(' \\u00b7 ');
  txt.appendChild(p); txt.appendChild(s);
  wrap.appendChild(ring); wrap.appendChild(txt);
  return wrap;
}

// Camera tile: live still, arm state, and per-camera motion / snapshot controls.
// The still is proxied server-side so the account token never reaches the page.
function buildCam(d, st){
  var wrap = document.createElement('div');
  wrap.style.display = 'flex'; wrap.style.flexDirection = 'column'; wrap.style.gap = '8px';

  var b = document.createElement('div'); b.className = 'cam-body';
  if (d.vendor === 'blink') {
    var img = document.createElement('img');
    img.alt = d.name + ' still';
    img.src = '/api/homeos/thumb?id=' + encodeURIComponent(d.id) + '&t=' + Date.now();
    img.addEventListener('error', function(){
      b.textContent = '';
      var ph = document.createElement('div'); ph.className = 'cam-ph';
      ph.textContent = st.thumb ? 'thumbnail unavailable' : 'no thumbnail yet \\u2014 hit Snap to capture one';
      b.appendChild(ph);
    });
    b.appendChild(img);
    if (st.armed !== null && st.armed !== undefined) {
      var a = document.createElement('span');
      a.className = 'cam-armed ' + (st.armed ? 'on' : 'off');
      a.textContent = st.armed ? 'ARMED' : 'DISARMED';
      b.appendChild(a);
    }
    if (st.enabled === false) {
      var m = document.createElement('span'); m.className = 'cam-age'; m.textContent = 'motion off';
      b.appendChild(m);
    }
  } else {
    var ph2 = document.createElement('div'); ph2.className = 'cam-ph';
    if (st.rtsp || d.rtsp) ph2.textContent = 'RTSP reachable \\u2014 browsers cannot play RTSP directly; point VLC or a recorder at it';
    else ph2.textContent = d.vendor + ' camera \\u00b7 ' + (st.reachable === false ? 'unreachable' : 'no preview configured');
    b.appendChild(ph2);
  }
  wrap.appendChild(b);

  if (d.vendor === 'blink') {
    var ctl = document.createElement('div'); ctl.className = 'cam-ctl';
    function cbtn(label, action, cls){
      var x = document.createElement('button');
      x.className = 'cbtn' + (cls ? ' ' + cls : '');
      x.textContent = label;
      x.addEventListener('click', function(){ camCmd(d, action, x, label); });
      return x;
    }
    ctl.appendChild(cbtn(st.armed ? 'Disarm' : 'Arm', st.armed ? 'disarm' : 'arm', st.armed ? 'armed' : ''));
    ctl.appendChild(cbtn('Take snapshot', 'snap'));
    ctl.appendChild(cbtn(st.enabled === false ? 'Motion on' : 'Motion off',
      st.enabled === false ? 'motionOn' : 'motionOff'));
    wrap.appendChild(ctl);
  }
  return wrap;
}
async function camCmd(d, action, btn, label){
  btn.disabled = true; btn.textContent = '\\u2026';
  try {
    var r = await fetch('/api/homeos/command', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: d.id, action: action }) }).then(function(x){ return x.json(); });
    if (!r.ok) throw new Error(r.error || 'failed');
    showToast(d.name + ' \\u2192 ' + action, 'ok');
    // a snapshot takes a few seconds to land on Blink's media host
    setTimeout(load, action === 'snap' ? 6000 : 1200);
  } catch(e){
    showToast(d.name + ': ' + e.message, 'bad');
    btn.disabled = false; btn.textContent = label;
  }
}

function render(){
  var rooms = {};
  DEVICES.forEach(function(d){ var r = d.room || 'Unassigned'; (rooms[r] = rooms[r] || []).push(d); });
  var wrap = el('ho-rooms'); wrap.textContent = '';
  if (!DEVICES.length){
    var e = document.createElement('div'); e.className = 'empty';
    var ic = document.createElement('span'); ic.className = 'e'; ic.appendChild(faIcon('fa-solid fa-house'));
    e.appendChild(ic);
    e.appendChild(document.createTextNode('No devices yet \\u2014 try "Discover LAN" to find Kasa and Gosund hardware automatically.'));
    wrap.appendChild(e);
  }
  Object.keys(rooms).sort().forEach(function(rn){
    var sec = document.createElement('div'); sec.className = 'ho-room';
    var h = document.createElement('div'); h.className = 'ho-room-h';
    var n = document.createElement('span'); n.className = 'n'; n.textContent = rn;
    var c = document.createElement('span'); c.className = 'c';
    var onCount = rooms[rn].filter(function(d){ return d.live && d.live.online; }).length;
    c.textContent = onCount + '/' + rooms[rn].length + ' up';
    h.appendChild(n); h.appendChild(c);
    var g = document.createElement('div'); g.className = 'ho-grid';
    rooms[rn].forEach(function(d){ g.appendChild(buildDevice(d)); });
    sec.appendChild(h); sec.appendChild(g); wrap.appendChild(sec);
  });
  renderSummary();
  var dl = el('room-list'); dl.textContent = '';
  Object.keys(rooms).forEach(function(r){ var o = document.createElement('option'); o.value = r; dl.appendChild(o); });
}

function renderSummary(){
  var on = DEVICES.filter(function(d){ return d.live && d.live.online; }).length;
  var watts = 0, metered = 0;
  DEVICES.forEach(function(d){
    var w = d.live && d.live.state && d.live.state.w;
    if (w != null) { watts += w; metered++; }
  });
  var cooking = DEVICES.filter(function(d){
    return d.vendor === 'typhur' && d.live && d.live.state &&
      (d.live.state.phase === 'cooking' || d.live.state.phase === 'preheating'); }).length;
  var stats = [
    ['Devices', on + '<small>/' + DEVICES.length + '</small>'],
    ['Live draw', metered ? fmtW(watts) : '\\u2014'],
    ['Metered', String(metered)],
    ['Cooking', cooking ? String(cooking) : '\\u2014']
  ];
  var wrap = el('ho-summary'); wrap.textContent = '';
  stats.forEach(function(s){
    var c = document.createElement('div'); c.className = 'ho-stat';
    var k = document.createElement('div'); k.className = 'k'; k.textContent = s[0];
    var v = document.createElement('div'); v.className = 'v'; v.innerHTML = s[1];
    c.appendChild(k); c.appendChild(v); wrap.appendChild(c);
  });
}

// ═══ ACTIONS ═════════════════════════════════════════════════════════════════
async function load(){
  try {
    var j = await fetch('/api/homeos/devices').then(function(r){ return r.json(); });
    DEVICES = j.devices || [];
    render();
    el('ho-sub').textContent = DEVICES.length + ' device' + (DEVICES.length === 1 ? '' : 's') +
      ', checked every 10 seconds';
  } catch(e){ showToast('Could not load devices', 'bad'); }
}
async function loadCreds(){
  try { CREDS = await fetch('/api/homeos/credentials').then(function(r){ return r.json(); }); } catch(e){ CREDS = {}; }
  buildVendorGrid();
}
async function toggle(d, on, sw){
  sw.disabled = true;
  try {
    var r = await fetch('/api/homeos/command', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: d.id, action:'set', on: on }) }).then(function(x){ return x.json(); });
    if (!r.ok) throw new Error(r.error || 'failed');
    sw.classList.toggle('on', on);
    showToast(d.name + ' \\u2192 ' + (on ? 'on' : 'off'), 'ok');
    setTimeout(load, 900);
  } catch(e){ showToast(d.name + ': ' + e.message, 'bad'); sw.disabled = false; }
}
async function removeDev(d){
  if (!confirm('Remove ' + d.name + ' from HomeOS? The device itself is not changed.')) return;
  await fetch('/api/homeos/devices/' + d.id, { method:'DELETE' });
  showToast('Removed', 'ok'); load();
}

// ═══ ADD / EDIT ══════════════════════════════════════════════════════════════
function buildVendorGrid(){
  var g = el('vendor-grid'); g.textContent = '';
  VENDORS.forEach(function(v){
    var b = document.createElement('button');
    b.className = 'vchip' + (v.id === SELVENDOR ? ' sel' : '');
    var e = document.createElement('span'); e.className = 've'; e.appendChild(faIcon(v.icon));
    var l = document.createElement('span'); l.textContent = v.label;
    b.appendChild(e); b.appendChild(l);
    var c = CREDS[v.id];
    if (c){
      var s = document.createElement('span');
      s.className = 'vs ' + (c.ready ? 'ok' : 'no');
      s.textContent = c.ready ? (c.needsCreds ? 'creds ok' : 'local') : 'no creds';
      b.appendChild(s);
    }
    b.addEventListener('click', function(){ SELVENDOR = v.id; buildVendorGrid(); syncForm(); });
    g.appendChild(b);
  });
}
function syncForm(){
  var v = SELVENDOR;
  var cloud = (v === 'wyze' || v === 'ring' || v === 'blink');
  el('wrap-tuya').style.display   = (v === 'gosund') ? '' : 'none';
  el('wrap-sonoff').style.display = (v === 'sonoff') ? '' : 'none';
  el('wrap-cloudid').style.display= cloud ? '' : 'none';
  el('wrap-rtsp').style.display   = (v === 'camera' || v === 'kasa') ? '' : 'none';
  el('wrap-typhur').style.display = (v === 'typhur') ? '' : 'none';
  el('wrap-host').style.display   = cloud ? 'none' : '';
  var c = CREDS[v] || {};
  var note = el('vendor-note');
  if (c.needsCreds && !c.ready){
    note.innerHTML = '<b>Credentials required.</b> Add ' + (c.envKeys || []).join(', ') +
      ' to your .env and restart Open HL. Nothing here will work until then.';
  } else if (c.note){
    note.innerHTML = c.note;
  } else note.textContent = '';
  if (v === 'typhur'){
    var sel = el('f-powerfrom');
    sel.innerHTML = '<option value="">\\u2014 none (network presence only) \\u2014</option>';
    DEVICES.filter(function(d){ return d.live && d.live.state && d.live.state.w !== undefined; })
      .forEach(function(d){
        var o = document.createElement('option'); o.value = d.id;
        o.textContent = d.name + ' (' + d.vendor + ')'; sel.appendChild(o);
      });
    el('f-kind').value = 'appliance';
  }
  if (cloud) loadCloudDevices(v);
}
async function loadCloudDevices(v){
  var sel = el('f-clouddev'); sel.innerHTML = '<option value="">Loading\\u2026</option>';
  var hint = el('cloud-hint'); hint.textContent = '';
  try {
    var j = await fetch('/api/homeos/cloud/' + v).then(function(r){ return r.json(); });
    if (j.needs2fa){
      hint.innerHTML = '<b>Blink wants a 2FA PIN.</b> Check your email/SMS, then enter it here: ' +
        '<input class="fi" id="blink-pin" style="margin-top:6px" placeholder="PIN"> ' +
        '<button class="ho-btn" id="blink-verify" style="margin-top:6px">Verify</button>';
      setTimeout(function(){
        var bv = el('blink-verify');
        if (bv) bv.addEventListener('click', async function(){
          var pin = el('blink-pin').value.trim();
          var r = await fetch('/api/homeos/cloud/blink/2fa', { method:'POST',
            headers:{'Content-Type':'application/json'}, body: JSON.stringify({ pin: pin }) })
            .then(function(x){ return x.json(); });
          showToast(r.valid ? 'Blink verified' : ('Verify failed: ' + (r.error || r.message || '?')), r.valid ? 'ok' : 'bad');
          if (r.valid) loadCloudDevices('blink');
        });
      }, 30);
    }
    if (j.error && !j.devices.length){ sel.innerHTML = '<option value="">' + j.error + '</option>'; return; }
    sel.innerHTML = '';
    (j.devices || []).forEach(function(d){
      var o = document.createElement('option');
      o.value = JSON.stringify({ devId: d.devId, networkId: d.networkId || '', name: d.name });
      o.textContent = d.name + ' (' + (d.model || d.type || '') + ')';
      sel.appendChild(o);
    });
    if (!sel.options.length) sel.innerHTML = '<option value="">No devices in account</option>';
  } catch(e){ sel.innerHTML = '<option value="">' + e.message + '</option>'; }
}
function openAdd(){
  EDITING = null; SELVENDOR = 'kasa';
  el('add-title').textContent = 'Add device';
  ['f-name','f-room','f-host','f-devid','f-localkey','f-rtsp'].forEach(function(i){ el(i).value = ''; });
  el('f-kind').value = 'plug'; el('f-idlew').value = '10'; el('f-cookw').value = '400';
  buildVendorGrid(); syncForm();
  el('add-modal').classList.add('on');
}
function openEdit(d){
  EDITING = d; SELVENDOR = d.vendor;
  el('add-title').textContent = 'Edit ' + d.name;
  el('f-name').value = d.name || ''; el('f-room').value = d.room || '';
  el('f-host').value = d.host || ''; el('f-kind').value = d.kind || 'plug';
  el('f-devid').value = d.devId || ''; el('f-localkey').value = d.localKey || '';
  el('f-rtsp').value = d.rtsp || '';
  el('f-idlew').value = d.idleWatts != null ? d.idleWatts : 10;
  el('f-cookw').value = d.cookWatts != null ? d.cookWatts : 400;
  buildVendorGrid(); syncForm();
  if (d.mode) el('f-mode').value = d.mode;
  if (d.powerFrom) setTimeout(function(){ el('f-powerfrom').value = d.powerFrom; }, 40);
  el('add-modal').classList.add('on');
}
async function saveDev(){
  var body = {
    vendor: SELVENDOR,
    name: el('f-name').value.trim() || 'Device',
    room: el('f-room').value.trim(),
    kind: el('f-kind').value,
    host: el('f-host').value.trim(),
  };
  if (SELVENDOR === 'gosund'){ body.devId = el('f-devid').value.trim(); body.localKey = el('f-localkey').value.trim(); }
  if (SELVENDOR === 'sonoff') body.mode = el('f-mode').value;
  if (SELVENDOR === 'camera' || SELVENDOR === 'kasa') body.rtsp = el('f-rtsp').value.trim();
  if (SELVENDOR === 'typhur'){
    body.powerFrom = el('f-powerfrom').value;
    body.idleWatts = parseFloat(el('f-idlew').value) || 10;
    body.cookWatts = parseFloat(el('f-cookw').value) || 400;
  }
  if (SELVENDOR === 'wyze' || SELVENDOR === 'ring' || SELVENDOR === 'blink'){
    var raw = el('f-clouddev').value;
    if (!raw){ showToast('Pick a device from the account list', 'bad'); return; }
    try { var o = JSON.parse(raw); body.devId = o.devId; body.networkId = o.networkId;
      if (!body.name || body.name === 'Device') body.name = o.name; } catch(e){}
  }
  try {
    if (EDITING) await fetch('/api/homeos/devices/' + EDITING.id, { method:'PUT',
      headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    else await fetch('/api/homeos/devices', { method:'POST',
      headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    el('add-modal').classList.remove('on');
    showToast('Saved', 'ok');
    setTimeout(load, 700);
  } catch(e){ showToast('Save failed: ' + e.message, 'bad'); }
}

async function discover(){
  var b = el('btn-discover'); b.disabled = true; b.textContent = '\\u27f3 Scanning\\u2026';
  try {
    var j = await fetch('/api/homeos/discover', { method:'POST' }).then(function(r){ return r.json(); });
    var body = el('disc-body'); body.textContent = '';
    if (!j.found || !j.found.length){
      var e = document.createElement('div'); e.className = 'fhint';
      e.innerHTML = 'Nothing new found. Kasa answers a UDP broadcast on :9999 and Tuya/Gosund beacon on ' +
        ':6666-6667 \\u2014 both need Open HL to be on the <b>same subnet</b> as the devices. ' +
        'Sonoff, Wyze, Ring and Blink are not broadcast-discoverable and must be added manually.';
      body.appendChild(e);
    } else {
      j.found.forEach(function(f){
        var row = document.createElement('div'); row.className = 'disc-row';
        var n = document.createElement('div'); n.className = 'dn';
        n.textContent = f.name + (f.model ? ' (' + f.model + ')' : '');
        var h = document.createElement('div'); h.className = 'dh'; h.textContent = f.vendor + ' \\u00b7 ' + f.host;
        n.appendChild(h);
        var add = document.createElement('button'); add.className = 'ho-btn'; add.textContent = '+ Add';
        add.addEventListener('click', async function(){
          add.disabled = true;
          await fetch('/api/homeos/devices', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ vendor: f.vendor === 'tuya' ? 'gosund' : f.vendor, name: f.name,
              host: f.host, kind: f.kind || 'plug', devId: f.devId || '' }) });
          add.textContent = '\\u2713 Added'; load();
        });
        row.appendChild(n); row.appendChild(add); body.appendChild(row);
      });
      var note = document.createElement('div'); note.className = 'fhint';
      note.innerHTML = 'Gosund/Tuya devices still need a <b>local key</b> before they respond \\u2014 add it via Edit.';
      body.appendChild(note);
    }
    el('disc-modal').classList.add('on');
  } catch(e){ showToast('Discovery failed: ' + e.message, 'bad'); }
  b.disabled = false; b.textContent = '\\u2295 Discover LAN';
}

el('btn-add').addEventListener('click', openAdd);
el('btn-refresh').addEventListener('click', async function(){
  var b = el('btn-refresh'); b.disabled = true;
  await fetch('/api/homeos/poll', { method:'POST' }).catch(function(){});
  await load(); b.disabled = false;
});
el('btn-discover').addEventListener('click', discover);
el('add-x').addEventListener('click', function(){ el('add-modal').classList.remove('on'); });
el('add-cancel').addEventListener('click', function(){ el('add-modal').classList.remove('on'); });
el('add-save').addEventListener('click', saveDev);
el('disc-x').addEventListener('click', function(){ el('disc-modal').classList.remove('on'); });
el('disc-close').addEventListener('click', function(){ el('disc-modal').classList.remove('on'); });
document.addEventListener('keydown', function(e){
  if (e.key === 'Escape'){ el('add-modal').classList.remove('on'); el('disc-modal').classList.remove('on'); }
});

(function(){
  if (!('EventSource' in window)) return;
  try {
    var es = new EventSource('/api/events');
    es.addEventListener('homeos_state', function(){ load(); });
    es.addEventListener('homeos_event', function(ev){
      try {
        var d = JSON.parse(ev.data);
        if (d.event === 'phase') showToast(d.name + ': ' + d.from + ' \\u2192 ' + d.to, d.to === 'finished' ? 'ok' : 'info');
        else showToast(d.name + ' ' + d.event, d.event === 'online' ? 'ok' : 'bad');
      } catch(e){}
    });
  } catch(e){}
})();

loadCreds();
load();
setInterval(load, 15000);
</script></body></html>`;
}


// ─── SOCIAL PAGE ───────────────────────────────────────────────────────────────
// Three independent dashboards (Personal / Business / Project by default, all
// renameable). Each carries its own Compose, Accounts, Emails and Queue. The
// browser agent is shared infrastructure and appears once, outside the tabs.

module.exports = { homeosHtml };
