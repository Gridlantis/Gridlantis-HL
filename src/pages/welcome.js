const { BASE_CSS, FAVICON, FONT, LEGACY_THEMES, THEMES } = require("../ui/assets");

// ─── WELCOME PAGE ─────────────────────────────────────────────────────────────
function welcomeHtml() {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open HL</title>${FONT}${FAVICON}
<script>(function(){try{var T=${JSON.stringify(THEMES)},L=${JSON.stringify(LEGACY_THEMES)};var n=localStorage.getItem('openhl-theme')||'slate';var t=T[L[n]||n]||T.slate;for(var k in t.vars)document.documentElement.style.setProperty('--'+k,t.vars[k]);document.documentElement.style.colorScheme=t.dark?'dark':'light';}catch(e){}})();</script>
<style>
${BASE_CSS}
body{display:grid;place-items:center;padding:24px;}
.boot{width:100%;max-width:360px;}
.boot h1{font:600 30px/1.1 var(--font-display);margin-bottom:6px;}
.boot p{color:var(--muted);margin-bottom:22px;}
.checks{list-style:none;border-top:1px solid var(--line);}
.checks li{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line);color:var(--muted);}
.checks li b{font-weight:500;color:var(--text-2);}
.checks li span{margin-left:auto;font-variant-numeric:tabular-nums;}
.checks .m-dot{transition:background .2s;}
.checks li.done{color:var(--text-2);}
</style></head><body>
<main class="boot" aria-live="polite">
  <h1>Welcome back</h1>
  <p>Checking this machine before opening your dashboard.</p>
  <ul class="checks">
    <li id="c-host"><span class="m-dot"></span><b>Server</b><span>&hellip;</span></li>
    <li id="c-nodes"><span class="m-dot"></span><b>Nodes</b><span>&hellip;</span></li>
    <li id="c-vms"><span class="m-dot"></span><b>Virtual machines</b><span>&hellip;</span></li>
    <li id="c-mail"><span class="m-dot"></span><b>Important mail</b><span>&hellip;</span></li>
  </ul>
</main>
<script>
(function(){
  var started = Date.now(), leave = function(){ location.replace('/'); };
  function mark(id, state, text, delay){
    setTimeout(function(){
      var li = document.getElementById(id); if (!li) return;
      li.className = 'done';
      li.querySelector('.m-dot').className = 'm-dot ' + state;
      li.lastElementChild.textContent = text;
    }, delay);
  }
  fetch('/api/pulse').then(function(r){ return r.json(); }).then(function(p){
    mark('c-host', p.host.cpu > 92 || p.host.mem > 93 ? 'warn' : 'ok', 'CPU ' + Math.round(p.host.cpu) + '%, memory ' + Math.round(p.host.mem) + '%', 150);
    var down = p.nodes.total - p.nodes.online;
    mark('c-nodes', down ? 'fault' : 'ok', p.nodes.total ? p.nodes.online + ' of ' + p.nodes.total + ' online' : 'none added', 400);
    mark('c-vms', 'ok', p.vms.running + ' running', 650);
    mark('c-mail', p.mail.unopened ? 'info' : 'ok', p.mail.unopened ? p.mail.unopened + ' unread' : 'nothing new', 900);
    setTimeout(leave, Math.max(1500, 1400 - (Date.now() - started)));
  }).catch(function(){ setTimeout(leave, 600); });
  setTimeout(leave, 4000);
})();
</script>
</body></html>`;
}


module.exports = { welcomeHtml };
