const { esc } = require("../helpers");
const { BASE_CSS, FAVICON, FONT, NAV_CSS, THEME_JS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");
const { DOCKER_CSS } = require("./docker");
const { CONSOLE_CSS, VMLAB_CSS } = require("./vmlab");

// ─── MOBILE HOST PAGE ────────────────────────────────────────────────────────
// Android phones over adb, and the scrcpy mirror/control view for one of them.
// Markup here; behaviour in src/ui/mobile/. Same card language as PC host.

const MOBILE_CSS = `
.dot.online{background:var(--green);} .dot.offline{background:var(--red);} .dot.checking{background:var(--yellow);}
.card.online{border-color:color-mix(in srgb,var(--green) 40%,var(--border));}
.card .card-ico{cursor:default;}
.setup-steps{margin:8px 0 0;padding-left:20px;font-size:13px;line-height:1.75;}
.setup-steps code,.hint code{background:var(--bg);border:1px solid var(--border);border-radius:var(--r-ctl);padding:1px 6px;}
.cmd{display:flex;align-items:center;gap:8px;margin-top:8px;}
.cmd pre{flex:1;margin:0;padding:9px 11px;background:var(--bg);border:1px solid var(--border);border-radius:var(--r-ctl);
  overflow-x:auto;font-family:var(--font-ui);font-size:12.5px;white-space:pre;}
.batt{font-family:var(--font-ui);font-size:12px;color:var(--muted);}
.ap-pin{font-family:var(--font-display);font-size:22px;font-weight:600;letter-spacing:.18em;color:var(--text);}
.ap-card{max-width:560px;}
.empty .setup-steps b{display:inline;font:inherit;font-weight:600;margin:0;}
`;

const VIEWER_CSS = `
#screen{display:flex;align-items:center;justify-content:center;}
#screen canvas{max-width:100%;max-height:100%;touch-action:none;cursor:pointer;outline:none;background:#000;}
#screen canvas:focus{box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 60%,transparent);}
.cbar .grp{display:flex;gap:3px;}
.cbar .btn.rec{color:var(--red);border-color:var(--red);}
.drop-hint{position:absolute;inset:12px;border:2px dashed var(--accent);border-radius:var(--r-panel);display:flex;align-items:center;
  justify-content:center;font-family:var(--font-display);font-size:18px;color:var(--text);background:color-mix(in srgb,var(--accent) 12%,transparent);z-index:6;pointer-events:none;}
.drop-hint[hidden]{display:none;}
.drawer .fld{margin-bottom:10px;} .drawer label{font-size:12px;color:var(--muted);display:block;margin-bottom:4px;}
.drawer select.in{width:100%;}
body.viewonly .ctl{display:none !important;}
body.viewonly #screen canvas,body.viewonly #screen video{cursor:default;}
`;

function mobileHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gridlantis-HL · Mobile host</title>${FONT}${FAVICON}
<style>${BASE_CSS}${NAV_CSS}${TOAST_CSS}${DOCKER_CSS}${MOBILE_CSS}</style><script>${THEME_JS}</script></head><body>
${navBar("/mobile")}
<div class="grid"></div>
<main class="dk">
  <div class="dk-top">
    <div>
      <div class="dk-title">Mobile host</div>
      <div class="dk-sub">Mirror and control Android phones over USB or Wi-Fi — and watch iPhones and iPads over AirPlay.</div>
    </div>
    <div class="row">
      <button class="btn" id="b-pair"><i class="fa-solid fa-qrcode"></i>Pair (Wireless debugging)</button>
      <button class="btn" id="b-connect"><i class="fa-solid fa-wifi"></i>Connect by address</button>
      <a class="btn" href="/vmlab?mobile=1" title="Make a virtual phone in VM Lab"><i class="fa-solid fa-plus"></i>Virtual phone</a>
      <button class="btn" id="b-refresh" title="Look for phones again"><i class="fa-solid fa-rotate"></i></button>
    </div>
  </div>
  <div id="banners"></div>
  <section id="list"></section>
  <section id="airplay" style="margin-top:18px"></section>
</main>
<div class="modal" id="modal"><div class="modal-box" id="modal-box">
  <div class="modal-head"><div class="t" id="modal-title"></div><button class="xbtn" id="modal-x" aria-label="Close">✕</button></div>
  <div class="modal-body" id="modal-body"></div>
  <div class="modal-foot" id="modal-foot"></div>
</div></div>
<div class="toast" id="toast"></div>
<script>${TOAST_JS}</script>
<script src="/mobile/shared/common.js"></script>
<script src="/mobile/assets/mobile.js"></script>
</body></html>`;
}

function viewerHtml(serial) {
  const airplay = serial === "airplay";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${airplay ? "AirPlay" : esc(serial)} · Gridlantis-HL phone</title>${FONT}${FAVICON}
<style>${BASE_CSS}${TOAST_CSS}${VMLAB_CSS}${CONSOLE_CSS}${VIEWER_CSS}</style><script>${THEME_JS}</script></head>
<body data-serial="${esc(serial)}"${airplay ? ' data-viewonly="1" class="viewonly"' : ""}>
<div class="cbar">
  <a class="btn sm" href="/mobile" title="Back to Mobile host"><i class="fa-solid fa-arrow-left"></i></a>
  <div class="name"><span class="dot" id="c-dot"></span><span class="t" id="c-name">${airplay ? "AirPlay · view only" : esc(serial)}</span></div>
  <span class="st" id="c-status">connecting…</span>
  <span class="spacer"></span>
  <div class="grp ctl">
    <button class="btn sm" data-key="back" title="Back (right-click on the screen)"><i class="fa-solid fa-chevron-left"></i></button>
    <button class="btn sm" data-key="home" title="Home (middle-click)"><i class="fa-regular fa-circle"></i></button>
    <button class="btn sm" data-key="recents" title="Recent apps"><i class="fa-regular fa-square"></i></button>
  </div>
  <div class="grp ctl">
    <button class="btn sm" data-key="voldown" title="Volume down"><i class="fa-solid fa-volume-low"></i></button>
    <button class="btn sm" data-key="volup" title="Volume up"><i class="fa-solid fa-volume-high"></i></button>
    <button class="btn sm" data-key="power" title="Power (lock / wake)"><i class="fa-solid fa-power-off"></i></button>
  </div>
  <div class="grp ctl">
    <button class="btn sm" id="b-notif" title="Notifications (double-click: quick settings)"><i class="fa-solid fa-bell"></i></button>
    <button class="btn sm" id="b-rotate" title="Rotate"><i class="fa-solid fa-rotate-right"></i></button>
    <button class="btn sm" id="b-screenoff" title="Turn the phone's screen off while mirroring"><i class="fa-solid fa-mobile-screen"></i></button>
  </div>
  <div class="grp">
    <button class="btn sm" id="b-shot" title="Screenshot"><i class="fa-solid fa-camera"></i></button>
    <button class="btn sm" id="b-rec" title="Record the screen"><i class="fa-solid fa-circle-dot"></i></button>
    <button class="btn sm ctl" id="b-file" title="Send a file or install an APK (or drop it on the screen)"><i class="fa-solid fa-upload"></i></button>
    <input type="file" id="f-file" hidden>
  </div>
  <button class="btn sm" id="b-audio" title="Phone audio on/off"><i class="fa-solid fa-volume-xmark"></i></button>
  <button class="btn sm" id="b-side" title="Clipboard, quality and audio"><i class="fa-solid fa-sliders"></i></button>
  <button class="btn sm" id="b-full" title="Full screen"><i class="fa-solid fa-maximize"></i></button>
</div>
<div class="stage">
  <div id="screen">
    <canvas id="cv" tabindex="0"></canvas>
    <div class="drop-hint" id="drop-hint" hidden>Drop to send to the phone · .apk installs</div>
    <div class="overlay" id="overlay"><div class="big" id="ov-title">Connecting…</div><div class="small" id="ov-text"></div><div class="row" id="ov-acts"></div></div>
  </div>
  <aside class="drawer" id="drawer" hidden>
    <div class="box ctl">
      <div class="box-h">Clipboard</div>
      <textarea class="in" id="clip-text" rows="5" placeholder="Text copied on the phone appears here. Type or paste here to send it to the phone."></textarea>
      <div class="row" style="margin-top:8px">
        <button class="btn sm" id="clip-send" title="Put this text on the phone's clipboard"><i class="fa-solid fa-arrow-right-to-bracket"></i> To phone</button>
        <button class="btn sm" id="clip-paste" title="Put it on the phone's clipboard and paste it"><i class="fa-solid fa-paste"></i> Paste there</button>
        <button class="btn sm" id="clip-copy" title="Copy to this computer's clipboard"><i class="fa-regular fa-copy"></i> Copy</button>
      </div>
    </div>
    <div class="box ctl">
      <div class="box-h">Quality</div>
      <div class="fld"><label>Resolution (longest side)</label><select class="in" id="q-max">
        <option value="0">Native</option><option value="1920">1920</option><option value="1600">1600</option><option value="1280">1280</option><option value="1024">1024</option><option value="800">800</option></select></div>
      <div class="fld"><label>Bit rate</label><select class="in" id="q-br">
        <option value="16000000">16 Mbps</option><option value="8000000">8 Mbps</option><option value="4000000">4 Mbps</option><option value="2000000">2 Mbps</option><option value="1000000">1 Mbps</option></select></div>
      <div class="fld"><label>Frame rate</label><select class="in" id="q-fps">
        <option value="60">60 fps</option><option value="30">30 fps</option><option value="15">15 fps</option></select></div>
      <div class="hint">Changing these reconnects. Lower them over a slow link.</div>
    </div>
    <div class="box">
      <div class="box-h">Audio</div>
      <label class="ap-chk" style="display:flex;gap:8px;align-items:center;font-size:13px;color:var(--text)"><input type="checkbox" id="a-on"> Play the phone's sound here</label>
      <label class="ap-chk ctl" style="display:flex;gap:8px;align-items:center;font-size:13px;color:var(--text);margin-top:6px"><input type="checkbox" id="a-dup"> Keep playing on the phone too (Android 13+)</label>
      <div class="hint" id="a-info" style="margin-top:8px">Needs Android 11 or newer.</div>
    </div>
    <div class="box ctl">
      <div class="box-h">Keyboard &amp; mouse</div>
      <div class="hint" style="line-height:1.7">Click = tap · drag = swipe · wheel = scroll · right-click = Back · middle-click = Home.
        Typing goes to the phone while the screen has focus; Ctrl+V pastes this computer's clipboard there.</div>
    </div>
  </aside>
</div>
<div class="toast" id="toast"></div>
<script>${TOAST_JS}</script>
<script src="/mobile/shared/common.js"></script>
<script src="/mobile/vendor/jmuxer.min.js"></script>
<script src="/mobile/assets/viewer.js"></script>
</body></html>`;
}

module.exports = { mobileHtml, viewerHtml };
