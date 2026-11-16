const { esc, fmtSize } = require("../helpers");
const { BASE_CSS, FAVICON, FONT, NAV_CSS, TOAST_CSS, navBar } = require("../ui/assets");

// ─── DESKTOP AND ANDROID APP DOWNLOADS ───────────────────────────────────────
function downloadHtml(files, host) {
  const byOs = { windows: [], linux: [], mac: [], android: [] };
  for (const f of files) byOs[f.os].push(f);
  const card = (os, title, icon, blurb, buildCmd = "cd desktop &amp;&amp; npm install &amp;&amp; npm run dist") => {
    const list = byOs[os];
    const items = list.length ? list.map(f => `<a class="m-item" href="/download/files/${encodeURIComponent(f.name)}">
        <i class="fa-solid fa-download dl-ic" aria-hidden="true"></i>
        <span class="m-item-main"><span class="m-item-t">${esc(f.label)}</span><span class="m-item-s">${esc(f.name)}</span></span>
        <span class="m-item-end">${fmtSize(f.size)}</span></a>`).join("")
      : `<div class="m-empty">Not built yet. On the host, run <code>${buildCmd}</code>.</div>`;
    return `<section class="m-panel os" data-os="${os}" aria-labelledby="os-${os}">
      <div class="m-panel-h"><h2 class="m-panel-t" id="os-${os}"><i class="${icon} os-ic" aria-hidden="true"></i>${title}</h2><span class="m-panel-meta">${blurb}</span><span class="m-badge info mine">${os === "android" ? "This phone" : "This computer"}</span></div>${items}</section>`;
  };
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Metis · Apps</title>${FONT}${FAVICON}
<style>${BASE_CSS}${NAV_CSS}${TOAST_CSS}
.dl{max-width:980px;}
.os-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;}
.os-ic{margin-right:10px;color:var(--text-2);}
.dl-ic{color:var(--accent);width:18px;text-align:center;}
.os .m-panel-h{flex-wrap:wrap;}
.os .m-panel-meta{margin-right:auto;}
.os .mine{display:none;}
.os.is-mine{border-color:color-mix(in srgb,var(--accent) 45%,var(--line));}
.os.is-mine .mine{display:inline-flex;}
code{font-size:13px;background:var(--raised);border:1px solid var(--line);border-radius:4px;padding:1px 5px;}
.steps{margin-top:16px;}
.steps ol{padding:0 16px 16px 36px;display:grid;gap:8px;color:var(--text-2);line-height:1.6;}
.steps .note{padding:12px 16px;border-top:1px solid var(--line);color:var(--muted);line-height:1.6;}
.url{font-family:var(--font-mono);color:var(--text);}
.dl h2.sec{font:600 13px var(--font-display);color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin:28px 0 10px;scroll-margin-top:72px;}
.dl h2.sec:first-of-type{margin-top:4px;}
</style></head><body>${navBar("/download")}
<main class="m-page dl">
  <div class="m-head"><div><h1 class="m-title">Apps</h1>
    <p class="m-sub">Metis in its own window on your computer or phone. The browser version keeps working.</p></div></div>

  <h2 class="sec" id="desktop">Desktop app</h2>
  <div class="os-list">
    ${card("windows", "Windows", "fa-brands fa-windows", "Windows 10 and 11, 64-bit")}
    ${card("linux", "Linux", "fa-brands fa-linux", "Ubuntu, Pop!_OS, Mint, Fedora, 64-bit")}
  </div>
  <section class="m-panel steps" aria-labelledby="first-run">
    <div class="m-panel-h"><h2 class="m-panel-t" id="first-run">First run on a computer</h2><span class="m-panel-meta">VM consoles get full keyboard capture and two-way copy and paste.</span></div>
    <ol>
      <li>Install and open the app. On Windows, run the portable .exe or unzip the zip. On Linux, install the .deb, or make the AppImage executable and run it.</li>
      <li>Enter this server's address: <span class="url" id="srv">${esc(host)}</span></li>
      <li>Sign in with your Metis password. The app remembers the server and keeps you signed in.</li>
    </ol>
    <div class="note">From outside your home network, connect the client to Tailscale and use this host's Tailscale address, or publish Metis over HTTPS with <code>tailscale serve</code>.</div>
  </section>

  <h2 class="sec" id="android">Android app</h2>
  <div class="os-list">
    ${card("android", "Android", "fa-brands fa-android", "Android 7 and newer", "android/build.sh")}
  </div>
  <section class="m-panel steps" aria-labelledby="first-run-android">
    <div class="m-panel-h"><h2 class="m-panel-t" id="first-run-android">Install on a phone</h2></div>
    <ol>
      <li>Open this page on the phone and tap the .apk above.</li>
      <li>When Android asks, allow your browser to install unknown apps, then tap Install. Play Protect may warn that it doesn't know the app; choose Install anyway.</li>
      <li>Open Metis and enter <span class="url srv-url">${esc(host)}</span>, then sign in. To switch servers later, open the sidebar and tap Switch server.</li>
    </ol>
    <div class="note">The phone has to reach this host too: the same Wi-Fi, or the Tailscale app on the phone.</div>
  </section>
</main>
<script>
(function(){var ua=navigator.userAgent;
var p=ua.indexOf('Android')>=0?'android':ua.indexOf('Windows')>=0?'windows':(ua.indexOf('Linux')>=0?'linux':'');
if(p){var el=document.querySelector('.os[data-os="'+p+'"]');if(el)el.classList.add('is-mine');}
if(p==='android'&&!location.hash){var a=document.getElementById('android');if(a)a.scrollIntoView();}
document.querySelectorAll('#srv,.srv-url').forEach(function(e){e.textContent=location.origin;});})();
</script>
</body></html>`;
}

module.exports = { downloadHtml };
