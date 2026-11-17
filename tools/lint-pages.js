#!/usr/bin/env node
/**
 * lint-pages.js — catches the bugs `node --check server.js` cannot.
 *
 * Boots Open HL, fetches every page, and for each one:
 *   1. node --check on every inline <script>  (catches template-literal damage:
 *      an eaten backslash turns /^https?:\/\// into /^https?:/// and kills the
 *      entire page's JS, while server.js itself parses perfectly), and on every
 *      script the page loads from Open HL itself (/vmlab/assets/vmlab.js etc.)
 *   2. flags leftover ${...} in markup (unresolved interpolation)
 *   3. checks the nav rail is identical on every page (the full-screen viewers
 *      have none)
 *
 * The server it boots runs from a throwaway copy of the code and data/, with
 * VM Lab and uploads pointed at empty folders and background timers stubbed,
 * so it cannot touch the live install's state, VMs, mail or social queue.
 *
 * Usage:  node tools/lint-pages.js [password] [port]
 */
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const { execSync, spawn } = require('child_process');

const PASSWORD = process.argv[2] || process.env.PASSWORD || 'test';
const PORT     = parseInt(process.argv[3] || process.env.LINT_PORT || '3999', 10);
const PAGES = ['/', '/welcome', '/social', '/homeos', '/files', '/notes', '/ai',
               '/mail', '/calendar', '/flows', '/monitoring', '/finance',
               '/reminders', '/voicemail', '/texts', '/vmlab', '/laptops', '/mobile', '/docker'];
// Full-screen viewers for one VM, PC or phone. Their pages are static shells: the
// browser connects afterwards, and this script never runs that code. Only the
// PC viewer checks its id exists, so makeCopy() adds a dummy PC for it.
const VIEWERS = ['/vmlab/console/lint-probe', '/laptops/view/lint-probe', '/mobile/view/lint-probe'];

function req(p, o = {}) {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method: o.method || 'GET',
      headers: o.headers || {} }, x => {
      let b = ''; x.on('data', c => b += c); x.on('end', () => res({ s: x.statusCode, h: x.headers, b }));
    });
    r.on('error', rej); if (o.body) r.write(o.body); r.end();
  });
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openhllint-'));

// A second Open HL on the live tree would share data/ and vmlab/ with the real
// one (and can delete running VMs' run dirs), so lint a copy instead.
const ROOT = path.join(__dirname, '..');
const APP  = path.join(tmp, 'app');
function makeCopy() {
  fs.mkdirSync(path.join(APP, 'tools'), { recursive: true });
  for (const f of ['src', 'server.js', 'data', '.env', path.join('tools', 'refactor-harness')]) {
    if (fs.existsSync(path.join(ROOT, f))) fs.cpSync(path.join(ROOT, f), path.join(APP, f), { recursive: true });
  }
  // the phone tools are only read, and are too big to copy
  if (fs.existsSync(path.join(ROOT, 'mobile'))) fs.symlinkSync(path.join(ROOT, 'mobile'), path.join(APP, 'mobile'));
  for (const d of ['vmlab', 'uploads']) fs.mkdirSync(path.join(APP, d));
  // 192.0.2.1 is a documentation address: nothing answers there
  const pcs = path.join(APP, 'data', 'laptops', 'laptops.json');
  fs.mkdirSync(path.dirname(pcs), { recursive: true });
  let list = [];
  try { list = JSON.parse(fs.readFileSync(pcs, 'utf8')); } catch {}
  fs.writeFileSync(pcs, JSON.stringify([...(Array.isArray(list) ? list : []),
    { id: 'lint-probe', name: 'Lint probe', host: '192.0.2.1', port: 5900 }]));
}

(async () => {
  makeCopy();
  const srv = spawn('node', ['-r', './tools/refactor-harness/preload.js', 'server.js'], { cwd: APP, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), PASSWORD, VMLAB_DIR: path.join(APP, 'vmlab'), UPLOAD_DIR: 'uploads' } });
  const cleanup = () => { try { srv.kill(); } catch {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} };
  process.on('exit', cleanup);
  // the copy holds secrets; Ctrl-C must still delete it
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(130));
  await new Promise(r => setTimeout(r, 12000));

  let fail = 0;
  const login = await req('/login', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=' + PASSWORD });
  const ck = (login.h['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  if (!ck) { console.error('✗ login failed — wrong password?'); cleanup(); process.exit(1); }

  let nav = null;
  const checked = new Map();   // script URL -> error text, or '' when it parsed
  for (const p of [...PAGES, ...VIEWERS]) {
    const r = await req(p, { headers: { Cookie: ck } });
    if (r.s !== 200) { console.log(`✗ ${p}  HTTP ${r.s}`); fail++; continue; }
    let bad = 0;
    const scripts = [...r.b.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)].map(m => m[2]);
    const types = [...r.b.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>[\s\S]*?<\/script>/gi)].map(m => (m[1].match(/\btype="([^"]+)"/) || [])[1] || '');
    scripts.forEach((s, i) => {
      if (!s.trim()) return;
      // Import maps and JSON blocks are data, not code: they only have to parse.
      if (types[i] === 'importmap' || /json/.test(types[i])) {
        try { JSON.parse(s); } catch (e) { bad++; console.log(`  ✗ ${p} inline ${types[i]} #${i}:\n      ${e.message}`); }
        return;
      }
      const f = path.join(tmp, p.replace(/\W/g, '_') + i + '.js');
      fs.writeFileSync(f, s);
      try { execSync(`node --check ${f}`, { stdio: 'pipe' }); }
      catch (e) {
        bad++;
        const msg = e.stderr.toString().split('\n').slice(0, 3).join('\n      ');
        console.log(`  ✗ ${p} inline script #${i}:\n      ${msg}`);
      }
    });
    // Scripts served by Open HL itself. Most pages share /ui/shell.js, so each URL
    // is fetched and checked once; CDN scripts are not ours to lint.
    for (const m of r.b.matchAll(/<script\b([^>]*)>/gi)) {
      const src = (m[1].match(/\bsrc="([^"]+)"/) || [])[1];
      if (!src || !src.startsWith('/') || src.startsWith('//')) continue;
      if (!checked.has(src)) {
        const js = await req(src, { headers: { Cookie: ck } });
        let err = '';
        if (js.s !== 200) err = 'HTTP ' + js.s;
        else {
          const ext = /\btype="module"/.test(m[1]) ? '.mjs' : '.js';
          const f = path.join(tmp, 'src' + checked.size + ext);
          fs.writeFileSync(f, js.b);
          try { execSync(`node --check ${f}`, { stdio: 'pipe' }); }
          catch (e) { err = e.stderr.toString().split('\n').slice(0, 3).join('\n      '); }
        }
        checked.set(src, err);
      }
      if (checked.get(src)) { console.log(`  ✗ ${p} script ${src}:\n      ${checked.get(src)}`); bad++; }
    }

    // unresolved server-side interpolation leaking into markup
    const markup = r.b.split(/<script[^>]*>[\s\S]*?<\/script>/g).join('');
    if (markup.includes('${')) { console.log(`  ✗ ${p} has unresolved \${...} in markup`); bad++; }

    // CSS custom properties used outside the scope that defines them.
    // An undefined var() inside color-mix() is invalid at computed-value time,
    // so the property silently resets to its INITIAL value — borders vanish,
    // backgrounds go transparent — with no console error anywhere.
    const css = (r.b.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
    if (css) {
      const defs = new Map(), uses = new Map();
      for (const chunk of css.split('}')) {
        const at = chunk.indexOf('{');
        if (at === -1) continue;
        const sel = chunk.slice(0, at).split('\n').pop().trim();
        const body = chunk.slice(at + 1);
        for (const m of body.matchAll(/(--[\w-]+)\s*:/g)) {
          if (!defs.has(m[1])) defs.set(m[1], new Set());
          defs.get(m[1]).add(sel);
        }
        for (const m of body.matchAll(/var\((--[\w-]+)/g)) {
          if (!uses.has(m[1])) uses.set(m[1], new Set());
          uses.get(m[1]).add(sel);
        }
      }
      // key of a selector -> the id/class we can look for in the markup
      const keyOf = sel => {
        const m = sel.match(/[#.]([\w-]+)/);
        return m ? { attr: sel[m.index] === '#' ? 'id' : 'class', name: m[1] } : null;
      };
      // Does `inner` appear inside the element that `outer` selects?
      // Depth-scan the static markup; if either element is built at runtime
      // (absent from markup) we cannot tell, so we stay silent.
      const containedIn = (outer, inner) => {
        const ok = keyOf(outer), ik = keyOf(inner);
        if (!ok || !ik) return null;
        const openRe = new RegExp('<(\\w+)[^>]*' + ok.attr + '="[^"]*\\b' + ok.name + '\\b[^"]*"', 'g');
        const om = openRe.exec(markup);
        if (!om) return null;
        let i2 = om.index, depth = 0, end = -1;
        const tagRe = /<(\/?)(\w+)[^>]*?(\/?)>/g;
        tagRe.lastIndex = i2;
        let t;
        while ((t = tagRe.exec(markup))) {
          if (t[3] === '/' || /^(br|img|input|hr|meta|link)$/i.test(t[2])) continue;
          if (t[1] === '/') { depth--; if (depth === 0) { end = t.index; break; } }
          else depth++;
        }
        if (end === -1) return null;
        const innerRe = new RegExp(ik.attr + '="[^"]*\\b' + ik.name + '\\b[^"]*"', 'g');
        let anyInMarkup = false, anyInside = false, mm;
        while ((mm = innerRe.exec(markup))) {
          anyInMarkup = true;
          if (mm.index > i2 && mm.index < end) anyInside = true;
        }
        if (!anyInMarkup) return null;    // runtime-generated; unknowable here
        return anyInside;
      };
      const GLOBAL = /^(:root|html|body|\*)\b/;
      for (const [tok, useSels] of uses) {
        const defSels = defs.get(tok);
        if (!defSels || [...defSels].some(s2 => GLOBAL.test(s2))) continue;
        const scope = [...defSels][0];
        const orphans = [...useSels].filter(u => {
          if (u.startsWith(scope) || u.includes(scope)) return false;
          return containedIn(scope, u) === false;   // definitively outside
        });
        if (orphans.length) {
          console.log(`  ✗ ${p} var(${tok}) is defined only on "${scope}" but used by ` +
            `elements rendered outside it: ` + orphans.slice(0, 3).join(', ') +
            (orphans.length > 3 ? ` (+${orphans.length - 3} more)` : ''));
          bad++;
        }
      }
    }

    // nav rail must be identical everywhere it appears
    if (p !== '/welcome' && !VIEWERS.includes(p)) {
      const hrefs = [...r.b.matchAll(/<a href="([^"]+)" class="m-link/g)].map(m => m[1]);
      if (!hrefs.length) { console.log(`  ✗ ${p} has no nav rail`); bad++; }
      else if (!nav) nav = hrefs;
      else if (JSON.stringify(hrefs) !== JSON.stringify(nav)) {
        console.log(`  ✗ ${p} nav differs from the rest`); bad++;
      }
    }
    console.log(`${bad ? '✗' : '✓'} ${p}  (${scripts.length} inline scripts, ${r.b.length}b)`);
    if (bad) fail++;
  }
  console.log(fail ? `\n${fail} page(s) FAILED` : `\nall ${PAGES.length + VIEWERS.length} pages and ${checked.size} script files OK  ·  nav: ${(nav || []).join(' ')}`);
  cleanup();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
