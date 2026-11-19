const { esc } = require("../helpers");
const { NAME_MAX, haloOn, userName } = require("../profile");
const { COMMIT, VERSION } = require("../version");
const { BASE_CSS, FAVICON, FONT, NAV_CSS, THEMES, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");

// ─── PERSONALIZE ─────────────────────────────────────────────────────────────
// Reached from the Personalize button in the sidebar. The name is saved on the server
// (every device greets the same person); the theme stays per browser, as the
// sidebar picker always kept it.
//
// Client JS below sits inside a template literal: no backticks, no dollar-brace,
// no backslashes.

// A small picture of each theme drawn from its own colours: page, sidebar,
// a panel with an accent bar, and the three status colours.
function themeCard(id, th) {
  const v = th.vars;
  return `<button class="pz-theme" type="button" data-theme="${esc(id)}" aria-pressed="false">
  <span class="pz-prev" style="background:${v.bg};border-color:${v.line}" aria-hidden="true">
    <span class="pz-prev-nav" style="background:${v["bg-nav"]};border-color:${v.line}">
      <i style="background:${v.accent}"></i><i style="background:${v.line}"></i><i style="background:${v.line}"></i>
    </span>
    <span class="pz-prev-main">
      <span class="pz-prev-h" style="background:${v.text}"></span>
      <span class="pz-prev-card" style="background:${v.surface};border-color:${v.line}">
        <span style="background:${v.accent};width:58%"></span><span style="background:${v.muted};width:82%"></span>
        <span class="pz-prev-dots"><i style="background:${v.ok}"></i><i style="background:${v.warn}"></i><i style="background:${v.fault}"></i></span>
      </span>
    </span>
  </span>
  <span class="pz-theme-l"><span>${esc(th.label)}</span><small>${th.dark ? "Dark" : "Light"}</small><i class="fa-solid fa-circle-check"></i></span>
</button>`;
}

function personalizeHtml() {
  const name = userName();
  const halo = haloOn();
  const cards = Object.entries(THEMES).map(([id, th]) => themeCard(id, th)).join("");
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open HL · Personalize</title>${FONT}${FAVICON}
<style>
${BASE_CSS}${NAV_CSS}${TOAST_CSS}
.pz{max-width:980px;}
.pz-sec{margin-bottom:18px;}
.pz-version{margin:28px 0 0;text-align:center;font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums;}
.pz-sec .m-panel-h{padding:18px 20px 6px;}
.pz-sec .m-panel-meta{color:var(--muted);font-size:13px;}
.pz-body{padding:8px 20px 20px;}
.pz-hint{color:var(--muted);font-size:13px;margin-top:8px;}
.pz-name{display:flex;gap:8px;max-width:460px;}
.pz-name .m-input{height:40px;font-size:15px;}
.pz-name .m-btn{height:40px;}
.pz-hello{margin-top:14px;padding:12px 14px;border-radius:var(--r-ctl);background:var(--raised);border:1px solid var(--line);color:var(--text-2);max-width:460px;}
.pz-hello b{color:var(--text);font-weight:600;}
.pz-themes{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;}
.pz-theme{display:flex;flex-direction:column;gap:10px;padding:10px;border-radius:var(--r-panel);background:var(--raised);
  border:1px solid var(--line);color:var(--text);text-align:left;transition:border-color .15s;}
.pz-theme:hover{border-color:var(--line-strong);}
.pz-theme.on{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent);}
.pz-prev{display:grid;grid-template-columns:26% 1fr;height:96px;border:1px solid;border-radius:6px;overflow:hidden;}
.pz-prev-nav{border-right:1px solid;padding:9px 7px;display:flex;flex-direction:column;gap:6px;}
.pz-prev-nav i{display:block;height:5px;border-radius:3px;}
.pz-prev-main{padding:9px 10px;display:flex;flex-direction:column;gap:8px;}
.pz-prev-h{display:block;height:7px;width:46%;border-radius:3px;opacity:.85;}
.pz-prev-card{flex:1;border:1px solid;border-radius:5px;padding:7px;display:flex;flex-direction:column;gap:5px;}
.pz-prev-card>span{display:block;height:5px;border-radius:3px;}
.pz-prev-card>span:nth-child(2){opacity:.5;}
.pz-prev-dots{display:flex;gap:4px;margin-top:auto;height:auto!important;}
.pz-prev-dots i{display:block;width:7px;height:7px;border-radius:50%;}
.pz-theme-l{display:flex;align-items:baseline;gap:8px;padding:0 2px;}
.pz-theme-l span{font-weight:600;}
.pz-theme-l small{color:var(--muted);font-size:12px;}
.pz-theme-l i{margin-left:auto;color:var(--accent);visibility:hidden;align-self:center;}
.pz-theme.on .pz-theme-l i{visibility:visible;}
.pz-toggle{display:flex;align-items:center;gap:14px;max-width:560px;cursor:pointer;}
.pz-toggle-t{flex:1;min-width:0;}
.pz-toggle-t b{display:block;font-weight:600;color:var(--text);}
.pz-toggle-t span{display:block;color:var(--muted);font-size:13px;margin-top:2px;}
.pz-switch{position:relative;flex:0 0 auto;width:44px;height:26px;border-radius:13px;border:1px solid var(--line-strong);
  background:var(--raised);transition:background .15s,border-color .15s;}
.pz-switch::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:var(--muted);transition:transform .15s,background .15s;}
.pz-switch[aria-checked="true"]{background:color-mix(in srgb,var(--accent) 30%,var(--raised));border-color:var(--accent);}
.pz-switch[aria-checked="true"]::after{transform:translateX(18px);background:var(--accent);}
.pz-switch:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
.pz-switch:disabled{opacity:.6;}
@media(max-width:560px){.pz-name{flex-direction:column;}.pz-themes{grid-template-columns:1fr 1fr;}}
</style></head><body>
${navBar("/personalize")}
<main class="m-page pz">
  <div class="m-head"><div><h1 class="m-title">Personalize</h1><p class="m-sub">Make Open HL yours: what it calls you and how it looks.</p></div></div>

  <section class="m-panel pz-sec" aria-labelledby="pz-name-t">
    <div class="m-panel-h"><h2 class="m-panel-t" id="pz-name-t">Your name</h2><span class="m-panel-meta">Saved on this server, so every device uses it</span></div>
    <form class="pz-body" id="pz-form" autocomplete="off">
      <div class="pz-name">
        <input class="m-input" id="pz-name" maxlength="${NAME_MAX}" placeholder="What should Open HL call you?" value="${esc(name)}" aria-label="Your name">
        <button class="m-btn primary" type="submit" id="pz-save">Save</button>
      </div>
      <div class="pz-hello" id="pz-hello"></div>
      <p class="pz-hint">Leave it empty and the greetings go back to plain "Good morning".</p>
    </form>
  </section>

  <section class="m-panel pz-sec" aria-labelledby="pz-halo-t">
    <div class="m-panel-h"><h2 class="m-panel-t" id="pz-halo-t">Halo</h2><span class="m-panel-meta">Saved on this server, so every device uses it</span></div>
    <div class="pz-body">
      <div class="pz-toggle" id="pz-halo-row">
        <span class="pz-toggle-t" id="pz-halo-l"><b>Show Halo on Home</b><span>The 3D helper that explains which API keys each feature needs.</span></span>
        <button class="pz-switch" type="button" role="switch" id="pz-halo" aria-checked="${halo ? "true" : "false"}" aria-labelledby="pz-halo-l"></button>
      </div>
    </div>
  </section>

  <section class="m-panel pz-sec" aria-labelledby="pz-nav-t">
    <div class="m-panel-h"><h2 class="m-panel-t" id="pz-nav-t">Navigation bar</h2><span class="m-panel-meta">Edit mode is per browser; changes apply on every device</span></div>
    <div class="pz-body">
      <div class="pz-toggle" id="pz-nav-row">
        <span class="pz-toggle-t" id="pz-nav-l"><b>Edit navigation bar</b><span>Shows a minus next to each page in the sidebar to hide it. Hidden pages show dimmed with a plus to bring them back, and still open from their address. The pen on each category heading renames it and moves its pages to another category.</span></span>
        <button class="pz-switch" type="button" role="switch" id="pz-nav" aria-checked="false" aria-labelledby="pz-nav-l"></button>
      </div>
    </div>
  </section>

  <section class="m-panel pz-sec" aria-labelledby="pz-theme-t">
    <div class="m-panel-h"><h2 class="m-panel-t" id="pz-theme-t">Theme</h2><span class="m-panel-meta">Saved in this browser</span></div>
    <div class="pz-body"><div class="pz-themes" id="pz-themes">${cards}</div></div>
  </section>

  <p class="pz-version">Open HL ${VERSION ? "version " + esc(VERSION) : "(version unknown)"}${COMMIT ? ` <span title="Git commit this server is running">· ${esc(COMMIT)}</span>` : ""}</p>
</main>
<div class="toast" id="toast"></div>
<script>
${TOAST_JS}
(function(){
  var input = document.getElementById('pz-name'), hello = document.getElementById('pz-hello');
  var saved = input.value;
  function greet(){
    var n = input.value.trim(), h = new Date().getHours();
    var g = (h < 5) ? 'Good night' : (h < 12) ? 'Good morning' : (h < 18) ? 'Good afternoon' : (h < 22) ? 'Good evening' : 'Good night';
    hello.textContent = '';
    hello.appendChild(document.createTextNode('Home will say: '));
    var b = document.createElement('b'); b.textContent = n ? g + ', ' + n : g; hello.appendChild(b);
  }
  input.addEventListener('input', greet); greet();
  document.getElementById('pz-form').addEventListener('submit', function(e){
    e.preventDefault();
    var btn = document.getElementById('pz-save'); btn.disabled = true;
    fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: input.value }) })
      .then(function(r){ return r.json().then(function(d){ if (!r.ok || d.error) throw new Error(d.error || 'Could not save'); return d; }); })
      .then(function(d){ input.value = saved = d.name; greet(); showToast(d.name ? 'Saved. Hello, ' + d.name + '!' : 'Name cleared', 'ok'); })
      .catch(function(err){ showToast(err.message, 'bad'); })
      .then(function(){ btn.disabled = false; });
  });

  // Halo on or off.
  var sw = document.getElementById('pz-halo');
  function toggleHalo(){
    var want = sw.getAttribute('aria-checked') !== 'true';
    sw.disabled = true;
    fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ halo: want }) })
      .then(function(r){ return r.json().then(function(d){ if (!r.ok || d.error) throw new Error(d.error || 'Could not save'); return d; }); })
      .then(function(d){ sw.setAttribute('aria-checked', d.halo ? 'true' : 'false'); showToast(d.halo ? 'Halo is back on Home' : 'Halo is off', 'ok'); })
      .catch(function(err){ showToast(err.message, 'bad'); })
      .then(function(){ sw.disabled = false; });
  }
  sw.addEventListener('click', toggleHalo);
  document.getElementById('pz-halo-row').addEventListener('click', function(e){ if (e.target !== sw && !sw.disabled) toggleHalo(); });

  // Edit navigation bar: a mode for this browser, read by every page's sidebar.
  var nav = document.getElementById('pz-nav');
  function paintNav(){ nav.setAttribute('aria-checked', document.documentElement.classList.contains('nav-edit') ? 'true' : 'false'); }
  function toggleNav(){
    var on = nav.getAttribute('aria-checked') !== 'true';
    if (window.openhlNavEdit) window.openhlNavEdit(on); else document.documentElement.classList.toggle('nav-edit', on);
    paintNav();
  }
  nav.addEventListener('click', toggleNav);
  document.getElementById('pz-nav-row').addEventListener('click', function(e){ if (e.target !== nav) toggleNav(); });
  paintNav();

  // Themes: the same store the sidebar picker uses, so both stay in step.
  var cards = document.querySelectorAll('.pz-theme');
  function mark(){
    var cur = 'slate'; try { cur = localStorage.getItem('openhl-theme') || 'slate'; } catch(e){}
    var any = false;
    cards.forEach(function(c){ var on = c.dataset.theme === cur; any = any || on; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    if (!any && cards[0]) { cards[0].classList.add('on'); cards[0].setAttribute('aria-pressed', 'true'); }
  }
  cards.forEach(function(c){ c.addEventListener('click', function(){ window._applyTheme(c.dataset.theme); mark(); }); });
  window.addEventListener('openhl:theme', mark);
  mark();
})();
</script>
</body></html>`;
}

module.exports = { personalizeHtml };
