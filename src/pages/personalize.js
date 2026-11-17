const { esc } = require("../helpers");
const { NAME_MAX, userName } = require("../profile");
const { BASE_CSS, FAVICON, FONT, NAV_CSS, THEMES, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");

// ─── PERSONALIZE ─────────────────────────────────────────────────────────────
// Reached from the theme menu in the sidebar. The name is saved on the server
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
  const cards = Object.entries(THEMES).map(([id, th]) => themeCard(id, th)).join("");
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open HL · Personalize</title>${FONT}${FAVICON}
<style>
${BASE_CSS}${NAV_CSS}${TOAST_CSS}
.pz{max-width:980px;}
.pz-sec{margin-bottom:18px;}
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

  <section class="m-panel pz-sec" aria-labelledby="pz-theme-t">
    <div class="m-panel-h"><h2 class="m-panel-t" id="pz-theme-t">Theme</h2><span class="m-panel-meta">Saved in this browser</span></div>
    <div class="pz-body"><div class="pz-themes" id="pz-themes">${cards}</div></div>
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
