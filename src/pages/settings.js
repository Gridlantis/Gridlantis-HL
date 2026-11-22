const { esc } = require("../helpers");
const { NAME_MAX, haloOn, userName } = require("../profile");
const { CURRENT_VERSION } = require("../updates");
const { BASE_CSS, FAVICON, FONT, NAV_CSS, THEMES, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");

// ─── SETTINGS ────────────────────────────────────────────────────────────────
// Reached from the Settings button in the sidebar (it was called Personalize;
// /personalize redirects here). The name is saved on the server (every device
// greets the same person); the theme stays per browser, as the sidebar picker
// always kept it. Keys edits .env values per feature (src/keys.js); Updates asks
// GitHub for the latest release when pressed (src/updates.js).
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

function settingsHtml() {
  const name = userName();
  const halo = haloOn();
  const cards = Object.entries(THEMES).map(([id, th]) => themeCard(id, th)).join("");
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gridlantis-HL · Settings</title>${FONT}${FAVICON}
<style>
${BASE_CSS}${NAV_CSS}${TOAST_CSS}
.pz{max-width:980px;}
.pz-sec{margin-bottom:18px;}
.st-jump{display:flex;gap:6px;flex-wrap:wrap;margin:-4px 0 16px;}
.st-jump a{padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:var(--raised);color:var(--text-2);font-size:13px;text-decoration:none;}
.st-jump a:hover{border-color:var(--line-strong);color:var(--text);}
.pz-sec{scroll-margin-top:72px;}
.st-lede{margin:0 0 14px;max-width:720px;}
.st-lede a{color:var(--accent);}
.st-keys{display:flex;flex-direction:column;gap:10px;}
.st-feat{border:1px solid var(--line);border-radius:var(--r-panel);background:var(--raised);}
.st-feat>summary{display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;list-style:none;}
.st-feat>summary::-webkit-details-marker{display:none;}
.st-feat>summary>i.st-ic{width:20px;text-align:center;color:var(--accent);}
.st-feat-n{flex:1;min-width:0;font-weight:600;}
.st-feat-n small{display:block;font-weight:400;color:var(--muted);font-size:12.5px;margin-top:2px;}
.st-badge{font-size:12px;padding:3px 9px;border-radius:999px;border:1px solid var(--line);color:var(--muted);white-space:nowrap;}
.st-badge.on{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 45%,var(--line));}
.st-badge.part{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 45%,var(--line));}
.st-feat>summary .st-chev{color:var(--muted);transition:transform .15s;}
.st-feat[open]>summary .st-chev{transform:rotate(180deg);}
.st-feat-b{padding:2px 14px 14px;border-top:1px solid var(--line);}
.st-feat-b .pz-hint{margin:10px 0 0;}
.st-fields{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-top:12px;}
.st-f label{display:flex;gap:8px;align-items:baseline;font-size:13px;font-weight:600;color:var(--text-2);margin-bottom:5px;}
.st-f label code{font-weight:400;font-size:11.5px;color:var(--muted);}
.st-f .m-input{width:100%;height:38px;}
.st-f .st-fh{font-size:12px;color:var(--muted);margin-top:4px;line-height:1.4;}
.st-f .st-fh button{background:none;border:0;padding:0;color:var(--fault);font:inherit;cursor:pointer;text-decoration:underline;}
.st-f .st-fh.warn{color:var(--warn);}
.st-acts{display:flex;gap:8px;align-items:center;margin-top:14px;flex-wrap:wrap;}
.st-acts a{font-size:13px;color:var(--accent);margin-left:auto;}
.st-restart{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 14px;margin-bottom:12px;border-radius:var(--r-ctl);
  border:1px solid color-mix(in srgb,var(--warn) 45%,var(--line));background:color-mix(in srgb,var(--warn) 10%,var(--raised));}
.st-restart span{flex:1;min-width:220px;}
.st-up-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
.st-up-row>div{flex:1;min-width:220px;}
.st-up-row b{display:block;}
.st-up{margin-top:14px;padding:14px 16px;border-radius:var(--r-ctl);border:1px solid var(--line);background:var(--raised);}
.st-up.new{border-color:var(--accent);}
.st-up h3{font-size:16px;margin:0 0 4px;}
.st-up p{margin:6px 0 0;color:var(--text-2);font-size:14px;}
.st-up .st-acts a{margin-left:0;}
.st-notes{margin-top:10px;max-height:220px;overflow:auto;white-space:pre-wrap;font-size:13px;color:var(--text-2);background:var(--bg);border:1px solid var(--line);border-radius:var(--r-ctl);padding:10px 12px;}
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
${navBar("/settings")}
<main class="m-page pz">
  <div class="m-head"><div><h1 class="m-title">Settings</h1><p class="m-sub">What Gridlantis-HL calls you, how it looks, the keys its features use, and updates.</p></div></div>
  <nav class="st-jump" aria-label="Sections"><a href="#profile">Profile</a><a href="#appearance">Appearance</a><a href="#keys">Keys</a><a href="#updates">Updates</a></nav>

  <section class="m-panel pz-sec" id="profile" aria-labelledby="pz-name-t">
    <div class="m-panel-h"><h2 class="m-panel-t" id="pz-name-t">Your name</h2><span class="m-panel-meta">Saved on this server, so every device uses it</span></div>
    <form class="pz-body" id="pz-form" autocomplete="off">
      <div class="pz-name">
        <input class="m-input" id="pz-name" maxlength="${NAME_MAX}" placeholder="What should Gridlantis-HL call you?" value="${esc(name)}" aria-label="Your name">
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

  <section class="m-panel pz-sec" id="appearance" aria-labelledby="pz-nav-t">
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

  <section class="m-panel pz-sec" id="keys" aria-labelledby="st-keys-t">
    <div class="m-panel-h"><h2 class="m-panel-t" id="st-keys-t">Keys</h2><span class="m-panel-meta">Saved in this server's .env, so every device uses them</span></div>
    <div class="pz-body">
      <p class="pz-hint st-lede">Every key is optional: a feature without its keys just stays off. Cloud AI keys are pasted on the <a href="/ai">AI page</a>. Saved keys are never shown again in full.</p>
      <div class="st-restart" id="st-restart" hidden role="status"></div>
      <div id="st-keys"><p class="pz-hint">Loading…</p></div>
    </div>
  </section>

  <section class="m-panel pz-sec" id="updates" aria-labelledby="st-up-t">
    <div class="m-panel-h"><h2 class="m-panel-t" id="st-up-t">Updates</h2><span class="m-panel-meta">Asks GitHub only when you press the button</span></div>
    <div class="pz-body">
      <div class="st-up-row">
        <div><b>Gridlantis-HL ${CURRENT_VERSION ? "version " + esc(CURRENT_VERSION) : "(version unknown)"}</b><span class="pz-hint" id="st-up-sub">Check whether a newer version is out.</span></div>
        <button class="m-btn primary" type="button" id="st-up-btn"><i class="fa-solid fa-arrows-rotate"></i>Check for updates</button>
      </div>
      <div id="st-up-out"></div>
    </div>
  </section>
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

  // ── Keys ──────────────────────────────────────────────────────────────────
  function el(tag, attrs, kids){
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function(k){
      if (k === 'text') n.textContent = attrs[k]; else if (k === 'cls') n.className = attrs[k]; else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function(c){ if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function api(method, url, body){
    return fetch(url, { method: method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function(r){
        if (r.status === 401) { location.href = '/login'; throw new Error('Signed out'); }
        return r.json().then(function(d){ if (!r.ok || d.error) throw new Error(d.error || 'Something went wrong'); return d; });
      });
  }
  var keysBox = document.getElementById('st-keys'), banner = document.getElementById('st-restart');
  var openIds = {};
  function badge(f){
    var need = f.fields.filter(function(x){ return !/Optional/.test(x.hint); });
    var setN = f.fields.filter(function(x){ return x.set; }).length;
    var needSet = need.filter(function(x){ return x.set; }).length;
    if (!setN) return el('span', { cls: 'st-badge', text: 'Not set' });
    if (needSet < need.length) return el('span', { cls: 'st-badge part', text: 'Partly set' });
    return el('span', { cls: 'st-badge on', text: 'Set' });
  }
  function paintBanner(d){
    banner.textContent = '';
    if (!d.restartNeeded) { banner.hidden = true; return; }
    banner.hidden = false;
    banner.appendChild(el('i', { cls: 'fa-solid fa-rotate', 'aria-hidden': 'true' }));
    if (d.canRestart) {
      banner.appendChild(el('span', { text: 'Saved. Restart Gridlantis-HL to start using the new keys. It takes a few seconds.' }));
      var b = el('button', { cls: 'm-btn primary', type: 'button' }, ['Restart now']);
      b.addEventListener('click', function(){ doRestart(b); });
      banner.appendChild(b);
    } else {
      banner.appendChild(el('span', { text: 'Saved. Restart Gridlantis-HL where you started it (the terminal or service running it) to start using the new keys.' }));
    }
  }
  function field(fd, inputs){
    var id = 'k-' + fd.env;
    var inp = el('input', { cls: 'm-input', id: id, autocomplete: 'off', spellcheck: 'false', type: fd.kind === 'secret' ? 'password' : 'text' });
    if (fd.kind === 'secret') inp.placeholder = fd.set ? 'Saved (' + fd.masked + '). Type to replace' : 'Not set';
    else { inp.value = fd.value; inp.placeholder = fd.set ? '' : 'Not set'; }
    inputs.push({ fd: fd, inp: inp, clear: false });
    var rec = inputs[inputs.length - 1];
    var help = el('div', { cls: 'st-fh' }, [fd.hint || '']);
    if (fd.kind === 'secret' && fd.set) {
      var rm = el('button', { type: 'button' }, ['Remove']);
      rm.addEventListener('click', function(){ rec.clear = true; inp.value = ''; inp.placeholder = 'Will be removed when you save'; rm.remove(); });
      help.appendChild(document.createTextNode(fd.hint ? ' ' : ''));
      help.appendChild(rm);
    }
    var kids = [el('label', { 'for': id }, [fd.label, el('code', { text: fd.env })]), inp, help];
    if (fd.shell) kids.push(el('div', { cls: 'st-fh warn', text: 'Also set where Gridlantis-HL was started, which wins over the value saved here.' }));
    return el('div', { cls: 'st-f' }, kids);
  }
  function feature(f){
    var inputs = [];
    var det = el('details', { cls: 'st-feat', id: 'kf-' + f.id });
    if (openIds[f.id]) det.open = true;
    det.addEventListener('toggle', function(){ openIds[f.id] = det.open; });
    det.appendChild(el('summary', null, [
      el('i', { cls: 'fa-solid ' + f.icon + ' st-ic', 'aria-hidden': 'true' }),
      el('span', { cls: 'st-feat-n' }, [f.name, el('small', { text: f.about })]),
      badge(f),
      el('i', { cls: 'fa-solid fa-chevron-down st-chev', 'aria-hidden': 'true' })
    ]));
    var save = el('button', { cls: 'm-btn primary', type: 'submit' }, ['Save']);
    var form = el('form', { cls: 'st-feat-b', autocomplete: 'off' }, [
      el('p', { cls: 'pz-hint' }, [el('b', { text: 'Where to get it: ' }), f.get]),
      el('div', { cls: 'st-fields' }, f.fields.map(function(fd){ return field(fd, inputs); })),
      el('div', { cls: 'st-acts' }, [save, el('a', { href: f.href, text: 'Open ' + f.name.split(':')[0] })])
    ]);
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var values = {}, n = 0;
      inputs.forEach(function(r){
        var v = r.inp.value.trim();
        if (r.fd.kind === 'secret') { if (r.clear) { values[r.fd.env] = ''; n++; } else if (v) { values[r.fd.env] = v; n++; } }
        else if (v !== r.fd.value) { values[r.fd.env] = v; n++; }
      });
      if (!n) { showToast('Nothing changed', 'ok'); return; }
      save.disabled = true;
      api('PUT', '/api/keys', { values: values })
        .then(function(d){ render(d); showToast('Saved ' + f.name, 'ok'); })
        .catch(function(err){ showToast(err.message, 'bad'); save.disabled = false; });
    });
    det.appendChild(form);
    return det;
  }
  function render(d){
    keysBox.textContent = '';
    keysBox.appendChild(el('div', { cls: 'st-keys' }, d.features.map(feature)));
    paintBanner(d);
  }
  function loadKeys(){
    return api('GET', '/api/keys').then(render).catch(function(err){ keysBox.textContent = err.message; });
  }
  function doRestart(b){
    b.disabled = true; b.textContent = 'Restarting…';
    api('POST', '/api/restart').then(function(){
      var tries = 0;
      function poll(){
        tries++;
        fetch('/api/keys', { cache: 'no-store' }).then(function(r){
          if (r.status === 401) { location.href = '/login'; return; }
          if (!r.ok) throw new Error('not yet');
          return r.json().then(function(d){
            if (d.restartNeeded && tries < 40) throw new Error('not yet');
            render(d); showToast('Restarted with the new keys', 'ok');
          });
        }).catch(function(){ if (tries < 60) setTimeout(poll, 1000); else { b.disabled = false; b.textContent = 'Restart now'; showToast('Gridlantis-HL did not come back yet. Reload this page in a moment.', 'bad'); } });
      }
      setTimeout(poll, 1500);
    }).catch(function(err){ b.disabled = false; b.textContent = 'Restart now'; showToast(err.message, 'bad'); });
  }
  loadKeys();

  // ── Updates ───────────────────────────────────────────────────────────────
  var upBtn = document.getElementById('st-up-btn'), upOut = document.getElementById('st-up-out'), upSub = document.getElementById('st-up-sub');
  function fmtSize(b){ return b ? ' (' + Math.round(b / 1048576) + ' MB)' : ''; }
  upBtn.addEventListener('click', function(){
    upBtn.disabled = true; upSub.textContent = 'Checking…'; upOut.textContent = '';
    api('GET', '/api/update?force=1').then(function(u){
      var when = u.published ? new Date(u.published).toLocaleDateString() : '';
      upSub.textContent = 'Checked just now.';
      if (!u.available) {
        upOut.appendChild(el('div', { cls: 'st-up' }, [
          el('h3', null, [el('i', { cls: 'fa-solid fa-circle-check', style: 'color:var(--ok);margin-right:8px' }), 'You have the latest version']),
          el('p', { text: 'Latest release: ' + u.latest + (when ? ', published ' + when : '') + '.' })
        ]));
        return;
      }
      var acts = [];
      if (u.download) acts.push(el('a', { cls: 'm-btn primary', href: u.download.url, rel: 'noopener' }, [el('i', { cls: 'fa-solid fa-download' }), 'Download ' + u.latest + fmtSize(u.download.size)]));
      acts.push(el('a', { cls: 'm-btn', href: u.page, target: '_blank', rel: 'noopener noreferrer' }, ['What is new']));
      var box = el('div', { cls: 'st-up new' }, [
        el('h3', { text: 'Version ' + u.latest + ' is available' }),
        el('p', { text: 'You have ' + u.current + '.' + (when ? ' Released ' + when + '.' : '') }),
        el('p', { text: u.steps }),
        el('div', { cls: 'st-acts' }, acts)
      ]);
      if (u.notes) box.appendChild(el('div', { cls: 'st-notes', text: u.notes }));
      upOut.appendChild(box);
    }).catch(function(err){
      upSub.textContent = 'Check whether a newer version is out.';
      upOut.appendChild(el('div', { cls: 'st-up' }, [el('p', { text: err.message })]));
    }).then(function(){ upBtn.disabled = false; });
  });
})();
</script>
</body></html>`;
}

module.exports = { settingsHtml };
