const { BASE_CSS, FAVICON, FONT, LEGACY_THEMES, THEMES } = require("../ui/assets");

// ─── SIGN IN ──────────────────────────────────────────────────────────────────
// The public door. Wrong-password and lockout messages are injected by
// routes/public.js just before </form>, as a <p class="login-msg">.
const loginHtml = `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open HL · Sign in</title>${FONT}${FAVICON}
<script>(function(){try{var T=${JSON.stringify(THEMES)},L=${JSON.stringify(LEGACY_THEMES)};var n=localStorage.getItem('openhl-theme')||'slate';var t=T[L[n]||n]||T.slate;for(var k in t.vars)document.documentElement.style.setProperty('--'+k,t.vars[k]);document.documentElement.style.colorScheme=t.dark?'dark':'light';}catch(e){}})();</script>
<style>
${BASE_CSS}
body{display:grid;place-items:center;padding:24px;}
.door{width:100%;max-width:380px;}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:28px;}
.brand .led{width:10px;height:10px;border-radius:50%;background:var(--ok);}
.brand b{font:600 22px var(--font-display);}
.brand .tag{color:var(--muted);font-size:13px;margin-left:auto;}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-panel);padding:24px;}
h1{font:600 24px/1.2 var(--font-display);margin-bottom:4px;}
.sub{color:var(--muted);margin-bottom:20px;}
form{display:flex;flex-direction:column;gap:12px;}
.m-input{height:42px;font-size:15px;}
.m-btn{height:42px;font-size:15px;}
.login-msg,.err{color:var(--fault);font-size:14px;}
.err{display:none;margin-bottom:12px;}
.err.on{display:block;}
</style></head><body>
<main class="door">
  <div class="brand"><span class="led" aria-hidden="true"></span><b>Open HL</b><span class="tag">Home server</span></div>
  <div class="card">
    <h1>Sign in</h1>
    <p class="sub">Enter your Open HL password.</p>
    <div class="err" id="err" role="alert">That password is not correct.</div>
    <form method="POST" action="/login">
      <label class="m-label" for="pw">Password</label>
      <input class="m-input" type="password" id="pw" name="password" autofocus autocomplete="current-password" required>
      <button class="m-btn primary" type="submit">Sign in</button>
    </form>
  </div>
</main>
<script>if(new URLSearchParams(location.search).get('err'))document.getElementById('err').classList.add('on');</script>
</body></html>`;

module.exports = { loginHtml };
