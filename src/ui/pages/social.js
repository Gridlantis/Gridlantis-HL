/* Social page (/social): dashboards, compose, the post queue, autopilot and news.
   Loaded by src/pages/social.js after the shared toast helpers. */
var PLATFORMS = [], AGENT = {}, SELECTED = {}, MINGAP = 60000, ACCTS = {}, OAUTH = {}, PENDING = {};
var DASHBOARDS = [], DASH = null, EMAILS = {};
function el(id){ return document.getElementById(id); }
// Absolute, short, and unambiguous: "Fri 8 Aug, 09:00". Times matter here, so
// a bare relative "in 2 days" is not enough on its own.
function fmtWhen(iso){
  if (!iso) return '—';
  var d = new Date(iso);
  if (isNaN(d)) return '—';
  var now = new Date();
  var sameDay = d.toDateString() === now.toDateString();
  var time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return 'today ' + time;
  var tm = new Date(now); tm.setDate(tm.getDate() + 1);
  if (d.toDateString() === tm.toDateString()) return 'tomorrow ' + time;
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + time;
}
function qs(extra){ return '?dashboard=' + encodeURIComponent(DASH || '') + (extra || ''); }
function dashName(){ var d = DASHBOARDS.filter(function(x){ return x.id===DASH; })[0]; return d ? d.name : ''; }

// ═══ DASHBOARD SWITCHER ══════════════════════════════════════════════════════
function renderTabs(){
  var wrap = el('dtabs'); wrap.textContent = '';
  DASHBOARDS.forEach(function(d){
    var b = document.createElement('button');
    b.className = 'dtab' + (d.id === DASH ? ' on' : '');
    var n = document.createElement('span'); n.textContent = d.name;
    b.appendChild(n);
    var badge = document.createElement('span'); badge.className = 'db';
    badge.textContent = (d.accounts || 0) + ' acct' + ((d.accounts||0)===1?'':'s') +
      ((d.queued||0) ? ' \u00b7 ' + d.queued + ' pending' : '');
    b.appendChild(badge);
    if (d.id === DASH){
      var ed = document.createElement('span'); ed.className = 'dtab-edit'; ed.innerHTML = '<i class="fa-solid fa-pen"></i>'; ed.title = 'Rename';
      ed.title = 'Rename this dashboard';
      ed.addEventListener('click', function(ev){ ev.stopPropagation(); renameDash(d); });
      b.appendChild(ed);
    }
    b.addEventListener('click', function(){
      if (DASH === d.id) return;
      DASH = d.id; SELECTED = {};
      try{ localStorage.setItem('openhl-social-dash', DASH); }catch(e){}
      loadAll();
    });
    wrap.appendChild(b);
  });
}
async function renameDash(d){
  var name = prompt('Rename dashboard', d.name);
  if (!name || !name.trim()) return;
  await fetch('/api/social/dashboards/' + d.id, { method:'PUT',
    headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: name.trim() }) });
  showToast('Renamed', 'ok'); loadAll();
}

// ═══ OPTIONAL CARDS ══════════════════════════════════════════════════════════
// Some account groups don't use autopilot, the copilot or news. Each dashboard
// remembers which of them it hides (on the server, so every device agrees)
// until they are shown again. Hiding is only about the page: an autopilot that
// is on keeps posting, and its chip says so.
var CARDS = [
  { id: 'autopilot', label: 'Autopilot', card: 'ap-card', icon: 'fa-solid fa-plane' },
  { id: 'copilot', label: 'AI copilot', card: 'ai-card', icon: 'fa-solid fa-wand-magic-sparkles' },
  { id: 'news', label: 'News', card: 'nw-card', icon: 'fa-regular fa-newspaper' },
];
function curDash(){ return DASHBOARDS.filter(function(x){ return x.id===DASH; })[0] || null; }
function isHidden(id){ var d = curDash(); return !!(d && d.hidden && d.hidden[id]); }
function applyCards(){
  var wrap = el('cardvis');
  while (wrap.children.length > 1) wrap.removeChild(wrap.lastChild);
  CARDS.forEach(function(c){
    var hidden = isHidden(c.id);
    el(c.card).hidden = hidden;
    var b = document.createElement('button'); b.className = 'cv';
    b.setAttribute('aria-pressed', String(!hidden));
    b.title = (hidden ? 'Show ' : 'Hide ') + c.label + ' on ' + dashName();
    b.innerHTML = '<i class="' + (hidden ? 'fa-regular fa-eye-slash' : c.icon) + '"></i>';
    b.appendChild(document.createTextNode(c.label));
    if (c.id === 'autopilot' && hidden && AP && AP.enabled && AP_FOR === DASH){
      var on = document.createElement('span'); on.className = 'cv-on'; on.textContent = '· still on';
      b.title += '. It is still on and posting.';
      b.appendChild(on);
    }
    b.addEventListener('click', function(){ setHidden(c, !hidden); });
    wrap.appendChild(b);
  });
  // Summarise writes into the copilot, so it goes when the copilot is hidden.
  document.querySelectorAll('.nw-sum').forEach(function(b){ b.hidden = isHidden('copilot'); });
  el('nw-sum-hint').hidden = isHidden('copilot');
  // No gap above whichever card now starts its column.
  document.querySelectorAll('.so-grid > div').forEach(function(col){
    var first = true;
    Array.prototype.forEach.call(col.children, function(x){
      if (!x.classList.contains('card')) return;
      x.classList.toggle('first', first && !x.hidden);
      if (!x.hidden) first = false;
    });
  });
}
async function setHidden(c, hide){
  var d = curDash(); if (!d) return;
  var patch = {}; patch[c.id] = hide;
  try {
    var r = await fetch('/api/social/dashboards/' + d.id, { method:'PUT',
      headers:{'Content-Type':'application/json'}, body: JSON.stringify({ hidden: patch }) }).then(function(x){ return x.json(); });
    if (r.error) throw new Error(r.error);
    d.hidden = r.hidden || {};
  } catch(e){ showToast('Could not save: ' + e.message, 'bad'); return; }
  applyCards();
  if (c.id === 'news' && !hide && NEWS.configured && !el('nw-list').children.length) newsList();
  showToast(c.label + (hide ? ' hidden on ' : ' shown on ') + d.name, 'ok');
}

// ═══ COMPOSER ════════════════════════════════════════════════════════════════
function renderPlats(){
  var wrap = el('plats'); wrap.textContent = '';
  PLATFORMS.forEach(function(p){
    var b = document.createElement('button');
    var usable = p.configured;
    b.className = 'plat' + (SELECTED[p.id] ? ' sel' : '') + (usable ? '' : ' disabled');
    b.disabled = !usable;
    var dot = document.createElement('span'); dot.className = 'pdot ' + (usable ? 'ok' : 'no');
    var nm = document.createElement('span'); nm.className = 'pn';
    var p1 = document.createElement('div'); p1.className = 'p1'; p1.textContent = p.label;
    var p2 = document.createElement('div'); p2.className = 'p2';
    p2.textContent = usable ? (EMAILS[p.id] || (p.limit + ' chars')) : 'not set up';
    if (EMAILS[p.id]) p2.title = EMAILS[p.id];
    nm.appendChild(p1); nm.appendChild(p2);
    var v = document.createElement('span'); v.className = 'via ' + p.via; v.textContent = p.via;
    v.title = p.via === 'native' ? 'official API' : 'browser automation \u2014 shared session';
    b.appendChild(dot); b.appendChild(nm); b.appendChild(v);
    b.addEventListener('click', function(){
      SELECTED[p.id] = !SELECTED[p.id]; renderPlats(); renderCounts();
      if (typeof checkMediaLimits === 'function') checkMediaLimits();
    });
    wrap.appendChild(b);
  });
}
function renderCounts(){
  var n = el('compose').value.length;
  var wrap = el('counts'); wrap.textContent = '';
  var any = false;
  PLATFORMS.forEach(function(p){
    if (!SELECTED[p.id]) return;
    any = true;
    var c = document.createElement('span');
    var left = p.limit - n;
    c.className = 'cnt' + (left < 0 ? ' over' : (left < 20 ? ' near' : ''));
    c.textContent = p.label + ' ' + n + '/' + p.limit;
    wrap.appendChild(c);
  });
  if (!any){ var s = document.createElement('span'); s.className = 'cnt';
    s.textContent = n + ' chars \u00b7 pick a platform'; wrap.appendChild(s); }
}
el('compose').addEventListener('input', renderCounts);

// ═══ AUTOPILOT ═══════════════════════════════════════════════════════════════
var AP = {}, AP_DIRTY = false;
var AP_FOR = null;   // the dashboard AP was loaded for
async function loadAutopilot(){
  var want = DASH;
  try { AP = await fetch('/api/social/autopilot' + qs()).then(function(r){ return r.json(); }); } catch(e){ return; }
  AP_FOR = want;
  if (!AP_DIRTY) el('ap-prompt').value = AP.systemPrompt || '';
  renderAutopilot();
  applyCards();   // a hidden autopilot's chip says whether it is still on
}
function renderAutopilot(){
  el('ap-h').textContent = 'Autopilot · ' + dashName();
  el('ap-card').classList.toggle('ap-on', !!AP.enabled);
  var pill = el('ap-pill');
  pill.className = 'ap-pill' + (AP.running ? ' on' : AP.enabled ? (AP.lastError ? ' err' : ' on') : '');
  pill.textContent = AP.running ? 'writing…' : AP.enabled ? (AP.lastError ? 'on · last run failed' : 'on') : 'off';
  var t = el('ap-toggle');
  t.textContent = AP.enabled ? 'Turn off' : 'Turn on';
  t.className = 'btn' + (AP.enabled ? '' : ' primary');
  el('ap-now').disabled = el('ap-try').disabled = !!AP.running;
  var st = el('ap-st'); st.textContent = '';
  function line(html){ var d = document.createElement('div'); d.innerHTML = html; st.appendChild(d); }
  renderApPlats(); renderApModel(); renderApRate(); renderApNews();
  var plats = (AP.platforms || []).map(plabel);
  if (!plats.length) line((AP.selectable || []).length ? '<span class="bad">Pick at least one platform.</span>'
    : '<span class="bad">No account it can post to on this dashboard yet. Connect Bluesky, Mastodon, Facebook or LinkedIn below.</span>');
  if ((AP.platforms || []).some(function(p){ return pinfo(p).via === 'agent'; }))
    line('<span class="bad">X and Threads go through the browser agent. An unattended bot is what gets those accounts locked.</span>');
  if (AP.enabled && AP.nextRunAt) line('Next post: <b>' + esc(fmtWhen(AP.nextRunAt)) + '</b>');
  if (AP.news && AP.news.enabled && NEWS.configured) st.appendChild(nextStoryLine());
  if (AP.news && AP.news.enabled && !NEWS.configured) line('<span class="bad">News is on but there is no freenewsapi.io key yet. Add it in the News card.</span>');
  if (AP.lastNews) line('Last story: ' + (AP.lastNews.url ? '<a href="' + esc(AP.lastNews.url) + '" target="_blank" rel="noopener">' + esc(AP.lastNews.title) + '</a>' : esc(AP.lastNews.title)) +
    (AP.lastNews.publisher ? ' (' + esc(AP.lastNews.publisher) + ')' : ''));
  if (AP.lastRunAt) line('Last post written ' + esc(timeAgo(AP.lastRunAt)) + (AP.lastWhy ? ' · <i>' + esc(AP.lastWhy) + '</i>' : ''));
  if (AP.lastError) line('<span class="bad">Last run failed: ' + esc(AP.lastError) + '. It retries every 30 minutes.</span>');
}
function pinfo(id){ return PLATFORMS.filter(function(p){ return p.id === id; })[0] || { id: id, label: id, via: 'native' }; }
function plabel(id){ return pinfo(id).label; }
function renderApPlats(){
  var wrap = el('ap-plats'); wrap.textContent = '';
  var on = AP.platforms || [];
  (AP.selectable || []).forEach(function(id){
    var p = pinfo(id), b = document.createElement('button');
    b.className = 'ap-plat' + (on.indexOf(id) > -1 ? ' sel' : '');
    b.textContent = p.label;
    if (p.via === 'agent'){ var v = document.createElement('span'); v.className = 'via agent'; v.textContent = 'browser'; b.appendChild(v); }
    b.addEventListener('click', function(){
      var next = on.indexOf(id) > -1 ? on.filter(function(x){ return x !== id; }) : on.concat([id]);
      apSave({ platforms: next });
    });
    wrap.appendChild(b);
  });
  if (!(AP.selectable || []).length){ var h = document.createElement('span'); h.className = 'hint'; h.textContent = 'No accounts connected on this dashboard.'; wrap.appendChild(h); }
}
// Host and model: "Automatic" follows whatever the copilot would use.
function renderApModel(){
  var peers = (AICFG && AICFG.peers) || [];
  var hs = el('ap-host'), ms = el('ap-model');
  hs.innerHTML = ''; ms.innerHTML = '';
  function opt(sel, v, t){ var o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); }
  opt(hs, '', 'Automatic host' + (AICFG.host ? ' (' + shortHost(AICFG.host) + ')' : ''));
  peers.forEach(function(p){ opt(hs, p.host, (p.online ? '● ' : '○ ') + (p.name || shortHost(p.host))); });
  if (AP.host && !peers.some(function(p){ return p.host === AP.host; })) opt(hs, AP.host, shortHost(AP.host));
  hs.value = AP.host || '';
  var peer = peers.filter(function(p){ return p.host === (AP.host || AICFG.host); })[0];
  var models = (peer && peer.models) || [];
  opt(ms, '', 'Automatic model' + (!AP.host && AICFG.model ? ' (' + AICFG.model + ')' : ''));
  models.forEach(function(m){ opt(ms, m, m); });
  if (AP.model && models.indexOf(AP.model) < 0) opt(ms, AP.model, AP.model + ' (not on this host)');
  ms.value = AP.model || '';
}
// "Next story: <title> (publisher) ↻" — the article the next post will use;
// ↻ swaps it for another one that fits the news filters.
function nextStoryLine(){
  var d = document.createElement('div'); d.className = 'ap-story';
  d.appendChild(document.createTextNode('Next story: '));
  var n = AP.nextNews;
  if (n){
    var a = document.createElement(n.url ? 'a' : 'b'); a.textContent = n.title;
    if (n.url){ a.href = n.url; a.target = '_blank'; a.rel = 'noopener'; }
    d.appendChild(a);
    if (n.publisher) d.appendChild(document.createTextNode(' (' + n.publisher + ')'));
  } else {
    var i = document.createElement('i'); i.textContent = 'picked when it posts'; d.appendChild(i);
  }
  var b = document.createElement('button'); b.className = 'btn sm ap-refresh';
  b.title = n ? 'Find another article that fits the news filters' : 'Pick the article now';
  b.innerHTML = '<i class="fa-solid fa-rotate"></i>';
  b.setAttribute('aria-label', b.title);
  b.addEventListener('click', async function(){
    b.disabled = true; b.firstChild.classList.add('fa-spin');
    try {
      var r = await fetch('/api/social/autopilot/next-story', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ dashboardId: DASH }) }).then(function(x){ return x.json(); });
      if (r.error) throw new Error(r.error);
      AP = r; renderAutopilot();
    } catch(e){ showToast(e.message, 'bad'); b.disabled = false; b.firstChild.classList.remove('fa-spin'); }
  });
  d.appendChild(b);
  return d;
}
function renderApRate(){
  var sel = el('ap-rate'), v = AP.gapHours ? String(AP.gapHours) : '';
  if (v && !sel.querySelector('option[value="' + v + '"]')){ var o = document.createElement('option'); o.value = v; o.textContent = 'Every ' + v + ' hours'; sel.appendChild(o); }
  sel.value = v;
  sel.options[0].textContent = 'From the prompt' + (AP.statedGapHours ? ' (every ' + (+AP.statedGapHours.toFixed(1)) + ' h)' : ' (or the AI decides)');
}
el('ap-rate').addEventListener('change', function(){ apSave({ gapHours: el('ap-rate').value ? Number(el('ap-rate').value) : null }); });
function renderApNews(){
  var n = AP.news || {};
  el('ap-news-on').checked = !!n.enabled;
  el('ap-news').hidden = !n.enabled;
  el('ap-news-topic').dataset.want = n.topic || '';
  if (TOPICS) loadTopics(); else el('ap-news-topic').value = n.topic || '';
  if (document.activeElement !== el('ap-news-kw')) el('ap-news-kw').value = n.keywords || '';
  if (document.activeElement !== el('ap-news-country')) el('ap-news-country').value = n.country || '';
  el('ap-news-age').value = String(n.maxAgeHours || 24);
  el('ap-news-link').checked = n.link !== false;
}
function apNewsSave(){
  apSave({ news: { enabled: el('ap-news-on').checked, topic: el('ap-news-topic').value, keywords: el('ap-news-kw').value,
    country: el('ap-news-country').value, maxAgeHours: Number(el('ap-news-age').value), link: el('ap-news-link').checked } });
}
['ap-news-on', 'ap-news-topic', 'ap-news-age', 'ap-news-link', 'ap-news-kw', 'ap-news-country'].forEach(function(id){
  el(id).addEventListener('change', apNewsSave);
});
el('ap-host').addEventListener('change', function(){ apSave({ host: el('ap-host').value, model: '' }); });
el('ap-model').addEventListener('change', function(){ apSave({ model: el('ap-model').value }); });
async function apSave(extra){
  var body = Object.assign({ dashboardId: DASH, systemPrompt: el('ap-prompt').value }, extra || {});
  var r = await fetch('/api/social/autopilot', { method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body) }).then(function(x){ return x.json(); });
  if (r.error) { showToast(r.error, 'bad'); return false; }
  AP = r; AP_DIRTY = false; renderAutopilot(); return true;
}
el('ap-prompt').addEventListener('input', function(){ AP_DIRTY = true; });
el('ap-save').addEventListener('click', async function(){ if (await apSave()) showToast('Prompt saved', 'ok'); });
el('ap-toggle').addEventListener('click', async function(){
  var on = !AP.enabled;
  if (on && !confirm('Turn on autopilot for ' + dashName() + '? Open HL will publish AI-written posts to ' +
    ((AP.platforms || []).map(plabel).join(', ') || 'its accounts') + ' with no review. The first one goes out within a minute or two.')) return;
  if (await apSave({ enabled: on })) showToast(on ? 'Autopilot on' : 'Autopilot off', 'ok');
});
async function apRun(preview){
  if (AP_DIRTY && !(await apSave())) return;
  if (!preview && !confirm('Write and publish a post to ' + ((AP.platforms || []).map(plabel).join(', ') || 'this dashboard') + ' now?')) return;
  var box = el('ap-preview'); box.textContent = '';
  var btn = el(preview ? 'ap-try' : 'ap-now'), label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Writing…';
  try {
    var r = await fetch('/api/social/autopilot/run', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ dashboardId: DASH, preview: preview }) }).then(function(x){ return x.json(); });
    if (r.error) throw new Error(r.error);
    if (preview){
      var d = document.createElement('div'); d.className = 'draft';
      var t = document.createElement('div'); t.className = 'draft-t'; t.textContent = r.result.text;
      var m = document.createElement('div'); m.className = 'draft-m';
      m.innerHTML = '<span class="dchip">' + r.result.text.length + ' chars</span><span class="dchip">preview · not posted</span>' +
        '<span>would write the next one ' + esc(fmtWhen(r.result.nextRunAt)) + '</span>';
      d.appendChild(t); d.appendChild(m);
      if (r.result.why){ var w = document.createElement('div'); w.className = 'draft-why'; w.textContent = r.result.why; d.appendChild(w); }
      if (r.result.news){ var nn = document.createElement('div'); nn.className = 'qnews'; nn.textContent = 'From: ' + r.result.news.title + (r.result.news.publisher ? ' (' + r.result.news.publisher + ')' : ''); d.appendChild(nn); }
      box.appendChild(d);
    } else { showToast('Written and queued', 'ok'); loadQueue(); }
  } catch(e){ showToast(e.message, 'bad'); }
  btn.textContent = label; btn.disabled = false;
  loadAutopilot();
}
el('ap-try').addEventListener('click', function(){ apRun(true); });
el('ap-now').addEventListener('click', function(){ apRun(false); });

// ═══ NEWS ════════════════════════════════════════════════════════════════════
var NEWS = { configured: false }, TOPICS = null;
async function loadNews(){
  try { NEWS = await fetch('/api/social/news/status').then(function(r){ return r.json(); }); } catch(e){ return; }
  el('nw-setup').hidden = NEWS.configured; el('nw-main').hidden = !NEWS.configured;
  el('nw-quota').textContent = NEWS.configured ? 'freenewsapi.io · key ' + NEWS.key : 'freenewsapi.io · not set up';
  if (NEWS.configured){ loadTopics(); if (!el('nw-list').children.length && !isHidden('news')) newsList(); }
}
async function loadTopics(){
  if (!TOPICS){
    try { TOPICS = (await fetch('/api/social/news/topics').then(function(r){ return r.json(); })).topics || []; } catch(e){ TOPICS = []; }
  }
  ['nw-topic', 'ap-news-topic'].forEach(function(id){
    var sel = el(id), keep = sel.value || sel.dataset.want || '';
    sel.innerHTML = '<option value="">Any topic</option>';
    TOPICS.forEach(function(t){ var o = document.createElement('option'); o.value = t; o.textContent = t; sel.appendChild(o); });
    if (keep && TOPICS.indexOf(keep) < 0){ var o = document.createElement('option'); o.value = keep; o.textContent = keep; sel.appendChild(o); }
    sel.value = keep;
  });
}
async function newsList(fresh){
  var wrap = el('nw-list'); wrap.innerHTML = '<div class="hint">Loading…</div>';
  var qp = '?topic=' + encodeURIComponent(el('nw-topic').value) + '&keywords=' + encodeURIComponent(el('nw-kw').value.trim()) +
    '&country=' + encodeURIComponent(el('nw-country').value.trim()) + '&maxAgeHours=72' + (fresh ? '&fresh=1' : '');
  try {
    var r = await fetch('/api/social/news' + qp).then(function(x){ return x.json(); });
    if (r.error) throw new Error(r.error);
    wrap.textContent = '';
    if (!r.articles.length){ wrap.innerHTML = '<div class="hint">No articles in the last 3 days match.</div>'; return; }
    var used = (AP.lastNews ? [AP.lastNews.uuid] : []);
    r.articles.forEach(function(a){
      var row = document.createElement('div'); row.className = 'nw' + (used.indexOf(a.uuid) > -1 ? ' used' : '');
      var t = document.createElement('div'); t.className = 'nw-t'; t.textContent = a.title;
      var m = document.createElement('div'); m.className = 'nw-m';
      m.textContent = (a.publisher || 'unknown source') + (a.publishedAt ? ' · ' + timeAgo(a.publishedAt) : '');
      t.appendChild(m);
      var b = document.createElement('button'); b.className = 'btn sm'; b.textContent = 'Summarise';
      b.title = 'Write drafts about this article in the AI copilot';
      b.addEventListener('click', function(){ el('drafts').scrollIntoView({ behavior: 'smooth', block: 'center' }); aiDraft(a); });
      b.className += ' nw-sum'; b.hidden = isHidden('copilot');
      row.appendChild(t); row.appendChild(b); wrap.appendChild(row);
    });
  } catch(e){ wrap.innerHTML = ''; var d = document.createElement('div'); d.className = 'hint'; d.style.color = 'var(--red)'; d.textContent = e.message; wrap.appendChild(d); }
}
el('nw-go').addEventListener('click', function(){ newsList(true); });
el('nw-kw').addEventListener('keydown', function(e){ if (e.key === 'Enter') newsList(true); });
el('nw-topic').addEventListener('change', function(){ newsList(); });
el('nw-key-save').addEventListener('click', async function(){
  var r = await fetch('/api/social/news/key', { method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ key: el('nw-key').value }) }).then(function(x){ return x.json(); });
  el('nw-key').value = '';
  showToast(r.configured ? 'News key saved' : 'News key removed', 'ok');
  el('nw-list').textContent = ''; TOPICS = null; loadNews(); renderAutopilot();
});
el('nw-key-change').addEventListener('click', function(e){ e.preventDefault(); el('nw-setup').hidden = false; el('nw-key').focus(); });

// ═══ AI COPILOT ══════════════════════════════════════════════════════════════
var AICFG = { reachable: false };
function shortHost(h){ return String(h || '').split('//').pop(); }
async function loadAiCfg(){
  try {
    AICFG = await fetch('/api/social/ai/config').then(function(r){ return r.json(); });
  } catch(e){ AICFG = { reachable: false, peers: [] }; }
  var dot = el('ai-dot'), peer = el('ai-peer');
  var hostSel = el('ai-host'), modelSel = el('ai-model');
  var peers = AICFG.peers || [];

  // Peer picker: same list the AI page and Monitoring use.
  hostSel.innerHTML = '';
  peers.forEach(function(p){
    var o = document.createElement('option');
    o.value = p.host;
    o.textContent = (p.online ? '● ' : '○ ') + (p.name || shortHost(p.host));
    o.title = p.host + (p.online ? '' : ' (not responding)');
    hostSel.appendChild(o);
  });
  if (AICFG.host) hostSel.value = AICFG.host;
  hostSel.style.display = peers.length > 1 ? '' : 'none';

  function fillModels(){
    var sel = peers.filter(function(p){ return p.host === hostSel.value; })[0];
    var models = (sel && sel.models) || [];
    modelSel.innerHTML = '';
    models.forEach(function(m){
      var o = document.createElement('option'); o.value = m; o.textContent = m; modelSel.appendChild(o);
    });
    if (AICFG.model && models.indexOf(AICFG.model) > -1) modelSel.value = AICFG.model;
    modelSel.style.display = models.length ? '' : 'none';
    var live = sel && sel.online;
    dot.className = 'ai-dot ' + (live ? 'ok' : 'no');
    el('ai-go').disabled = !live;
    if (live) peer.textContent = 'ready on ' + shortHost(hostSel.value);
    else if (hostSel.value) peer.textContent = 'not responding: ' + shortHost(hostSel.value);
  }
  hostSel.addEventListener('change', fillModels);

  if (!peers.length){
    peer.textContent = 'no AI peer configured — add one on the AI page';
    dot.className = 'ai-dot no';
    hostSel.style.display = 'none'; modelSel.style.display = 'none';
    el('ai-go').disabled = true;
    return;
  }
  fillModels();
  if (!AICFG.reachable){
    // Say which hosts were tried, so a mismatch with Monitoring is obvious.
    peer.textContent = 'no peer responding — tried ' +
      peers.map(function(p){ return shortHost(p.host); }).join(', ');
  }
}
function draftCard(dr){
  var wrap = document.createElement('div');
  wrap.className = 'draft' + (dr.duplicateOf ? ' dupe' : '') + (dr.tooLongFor.length ? ' toolong' : '');
  var t = document.createElement('div'); t.className = 'draft-t'; t.textContent = dr.text;
  wrap.appendChild(t);

  var m = document.createElement('div'); m.className = 'draft-m';
  function chip(txt, cls){ var c = document.createElement('span'); c.className = 'dchip' + (cls ? ' ' + cls : '');
    c.textContent = txt; m.appendChild(c); return c; }
  chip(dr.chars + ' chars');
  PLATFORMS.forEach(function(p){
    if (!SELECTED[p.id]) return;
    chip(p.label + ' ' + dr.chars + '/' + p.limit, dr.chars > p.limit ? 'bad' : 'good');
  });
  if (dr.whenLabel && dr.scheduledAt) chip('⏰ ' + dr.whenLabel);
  else if (dr.whenUnparsed) chip('couldn’t read "' + dr.whenUnparsed + '"', 'warn');
  if (dr.similarToDraft) chip('similar to another draft', 'warn');
  wrap.appendChild(m);

  if (dr.why){ var w = document.createElement('div'); w.className = 'draft-why'; w.textContent = dr.why; wrap.appendChild(w); }

  if (dr.duplicateOf){
    var d = document.createElement('div'); d.className = 'draft-dup';
    d.textContent = '⚠ ' + Math.round(dr.duplicateOf.score * 100) + '% similar to a post from ' +
      (dr.duplicateOf.at ? new Date(dr.duplicateOf.at).toLocaleDateString() : 'earlier') +
      ': “' + String(dr.duplicateOf.text).slice(0, 110) + '”';
    wrap.appendChild(d);
  }

  var acts = document.createElement('div'); acts.className = 'draft-acts';
  var when = document.createElement('input'); when.type = 'datetime-local'; when.className = 'draft-when';
  if (dr.scheduledAt){
    var dt = new Date(dr.scheduledAt);
    when.value = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  when.title = 'Leave blank to post immediately';
  var useBtn = document.createElement('button'); useBtn.className = 'btn sm'; useBtn.textContent = 'Edit in composer';
  useBtn.addEventListener('click', function(){
    el('compose').value = dr.text;
    if (when.value) el('f-when').value = when.value;
    renderCounts();
    el('compose').scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('Loaded into composer', 'ok');
  });
  var qBtn = document.createElement('button'); qBtn.className = 'btn sm primary';
  qBtn.textContent = when.value ? 'Schedule' : 'Queue now';
  when.addEventListener('change', function(){ qBtn.textContent = when.value ? 'Schedule' : 'Queue now'; });
  qBtn.addEventListener('click', async function(){
    var platforms = Object.keys(SELECTED).filter(function(k){ return SELECTED[k]; });
    if (!platforms.length){ showToast('Pick a platform first', 'bad'); return; }
    if (dr.duplicateOf && !confirm('This looks ' + Math.round(dr.duplicateOf.score * 100) +
        '% similar to an earlier post. Queue it anyway?')) return;
    qBtn.disabled = true;
    try {
      var r = await fetch('/api/social/queue', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ dashboardId: DASH, text: dr.text, platforms: platforms,
          scheduledAt: when.value ? new Date(when.value).toISOString() : null }) })
        .then(function(x){ return x.json(); });
      if (r.error) throw new Error(r.error);
      showToast(when.value ? 'Scheduled' : 'Queued', 'ok');
      wrap.remove(); loadQueue();
    } catch(e){ showToast(e.message, 'bad'); qBtn.disabled = false; }
  });
  var xBtn = document.createElement('button'); xBtn.className = 'btn sm'; xBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>'; xBtn.setAttribute('aria-label','Remove');
  xBtn.title = 'Discard';
  xBtn.addEventListener('click', function(){ wrap.remove(); });
  acts.appendChild(when); acts.appendChild(useBtn); acts.appendChild(qBtn); acts.appendChild(xBtn);
  wrap.appendChild(acts);
  return wrap;
}
// art: a news article to summarise (from the News card); the prompt is then optional.
async function aiDraft(art){
  if (art && art.uuid === undefined) art = null;   // called as a click handler
  var prompt = el('ai-prompt').value.trim();
  if (!prompt && !art){ showToast('Tell it what to post about', 'bad'); return; }
  var btn = el('ai-go'); btn.disabled = true; btn.textContent = 'Writing…';
  el('ai-empty').textContent = 'Reading queue + history and drafting on ' + (AICFG.model || 'the local peer') + '…';
  try {
    var r = await fetch('/api/social/ai/draft', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ dashboardId: DASH, prompt: prompt, newsUuid: art ? art.uuid : undefined,
        count: parseInt(el('ai-count').value, 10), tone: el('ai-tone').value.trim(),
        host: el('ai-host').value || undefined, model: el('ai-model').value || undefined,
        platforms: Object.keys(SELECTED).filter(function(k){ return SELECTED[k]; }) }) })
      .then(function(x){ return x.json(); });
    if (r.error) throw new Error(r.error);
    var wrap = el('drafts'); wrap.textContent = '';
    r.drafts.forEach(function(dr){ wrap.appendChild(draftCard(dr)); });
    el('ai-empty').textContent = (r.news ? 'Summarising "' + r.news.title + '" (' + (r.news.publisher || 'news') + ') · ' : '') +
      r.drafts.length + ' draft' + (r.drafts.length===1?'':'s') +
      ' from ' + r.model + ' · checked against ' + r.context.historyCount + ' past post' +
      (r.context.historyCount===1?'':'s');
  } catch(e){
    showToast(e.message, 'bad');
    el('ai-empty').textContent = e.message;
  }
  btn.disabled = false; btn.textContent = 'Write drafts';
}
el('ai-go').addEventListener('click', aiDraft);
el('ai-prompt').addEventListener('keydown', function(e){
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') aiDraft();
});

// ═══ MEDIA UPLOAD ════════════════════════════════════════════════════════════
var MEDIA = [];   // { id, name, size, kind, mime } as returned by the server
function fmtSize(b){ return b >= 1048576 ? (b/1048576).toFixed(1)+'MB' : Math.round(b/1024)+'KB'; }
function renderThumbs(){
  var wrap = el('thumbs'); wrap.textContent = '';
  MEDIA.forEach(function(m){
    var t = document.createElement('div'); t.className = 'th';
    if (m.uploading){
      var u = document.createElement('div'); u.className = 'th-up'; u.textContent = 'uploading…';
      t.appendChild(u);
    } else if (m.kind === 'video'){
      var v = document.createElement('video');
      v.src = '/api/social/media?id=' + encodeURIComponent(m.id);
      v.muted = true; v.playsInline = true; v.preload = 'metadata'; v.controls = false;
      v.addEventListener('mouseenter', function(){ v.play().catch(function(){}); });
      v.addEventListener('mouseleave', function(){ v.pause(); v.currentTime = 0; });
      t.appendChild(v);
    } else {
      var i = document.createElement('img');
      i.src = '/api/social/media?id=' + encodeURIComponent(m.id);
      i.alt = m.name;
      t.appendChild(i);
    }
    var k = document.createElement('span'); k.className = 'th-k';
    k.textContent = m.kind === 'video' ? '▶ VID' : 'IMG';
    t.appendChild(k);
    var meta = document.createElement('div'); meta.className = 'th-m';
    var n = document.createElement('span');
    n.textContent = m.name.length > 12 ? m.name.slice(0, 11) + '…' : m.name;
    n.title = m.name;
    var sz = document.createElement('span'); sz.textContent = fmtSize(m.size || 0);
    meta.appendChild(n); meta.appendChild(sz); t.appendChild(meta);
    if (!m.uploading){
      var x = document.createElement('button'); x.className = 'th-x'; x.innerHTML = '<i class="fa-solid fa-xmark"></i>'; x.setAttribute('aria-label','Remove');
      x.title = 'Remove';
      x.addEventListener('click', function(ev){ ev.stopPropagation(); removeMedia(m); });
      t.appendChild(x);
    }
    wrap.appendChild(t);
  });
  checkMediaLimits();
}
// Mirrors the server-side ceilings so a bad combination is caught before you
// hit Queue, not three platforms into publishing.
var CLIENT_LIMITS = {
  bluesky:{images:4,video:1,imageBytes:976560,videoBytes:52428800},
  mastodon:{images:4,video:1,imageBytes:8388608,videoBytes:41943040},
  x:{images:4,video:1,imageBytes:5242880,videoBytes:536870912},
  linkedin:{images:9,video:1,imageBytes:10485760,videoBytes:209715200},
  threads:{images:10,video:1,imageBytes:8388608,videoBytes:1073741824},
  instagram:{images:10,video:1,imageBytes:8388608,videoBytes:1073741824},
  facebook:{images:10,video:1,imageBytes:10485760,videoBytes:1073741824}
};
function checkMediaLimits(){
  var warn = el('media-warn'); warn.textContent = '';
  var done = MEDIA.filter(function(m){ return !m.uploading; });
  var imgs = done.filter(function(m){ return m.kind === 'image'; });
  var vids = done.filter(function(m){ return m.kind === 'video'; });
  var msgs = [];
  PLATFORMS.forEach(function(p){
    if (!SELECTED[p.id]) return;
    var L = CLIENT_LIMITS[p.id]; if (!L) return;
    if (p.needsMedia && !done.length) msgs.push(p.label + ' requires an image or video');
    if (!done.length) return;
    if (vids.length > L.video) msgs.push(p.label + ': at most ' + L.video + ' video');
    if (vids.length && imgs.length) msgs.push(p.label + ': cannot mix video and images');
    if (imgs.length > L.images) msgs.push(p.label + ': at most ' + L.images + ' images');
    imgs.forEach(function(m){ if (m.size > L.imageBytes)
      msgs.push(p.label + ': ' + m.name + ' is ' + fmtSize(m.size) + ', limit ' + fmtSize(L.imageBytes)); });
    vids.forEach(function(m){ if (m.size > L.videoBytes)
      msgs.push(p.label + ': ' + m.name + ' is ' + fmtSize(m.size) + ', limit ' + fmtSize(L.videoBytes)); });
  });
  if (msgs.length) warn.textContent = '⚠ ' + msgs.slice(0, 4).join(' · ');
  return msgs.length === 0;
}
async function uploadFiles(fileList){
  var files = [].slice.call(fileList).filter(function(f){ return f && f.size; });
  if (!files.length) return;
  var fd = new FormData();
  var placeholders = files.map(function(f){
    var ph = { id: 'tmp' + Math.random(), name: f.name, size: f.size,
      // No regex here: a backslash inside the server's template literal is eaten,
      // so /^video// would reach the browser as /^video// and kill the script.
      kind: String(f.type || '').indexOf('video/') === 0 ? 'video' : 'image', uploading: true };
    MEDIA.push(ph); fd.append('file', f, f.name); return ph;
  });
  renderThumbs();
  try {
    var r = await fetch('/api/social/upload', { method: 'POST', body: fd }).then(function(x){ return x.json(); });
    MEDIA = MEDIA.filter(function(m){ return placeholders.indexOf(m) === -1; });
    if (r.error) throw new Error(r.error);
    (r.files || []).forEach(function(f){ MEDIA.push(f); });
    (r.rejected || []).forEach(function(f){ showToast(f.name + ': ' + f.error, 'bad'); });
    if ((r.files || []).length) showToast(r.files.length + ' file' + (r.files.length===1?'':'s') + ' attached', 'ok');
  } catch(e){
    MEDIA = MEDIA.filter(function(m){ return placeholders.indexOf(m) === -1; });
    showToast('Upload failed: ' + e.message, 'bad');
  }
  renderThumbs();
}
async function removeMedia(m){
  MEDIA = MEDIA.filter(function(x){ return x !== m; });
  renderThumbs();
  try { await fetch('/api/social/media?id=' + encodeURIComponent(m.id), { method: 'DELETE' }); } catch(e){}
}
(function(){
  var dz = el('drop'), inp = el('f-file');
  dz.addEventListener('click', function(){ inp.click(); });
  inp.addEventListener('change', function(){ uploadFiles(inp.files); inp.value = ''; });
  ['dragenter','dragover'].forEach(function(ev){
    dz.addEventListener(ev, function(e){ e.preventDefault(); dz.classList.add('over'); });
  });
  ['dragleave','drop'].forEach(function(ev){
    dz.addEventListener(ev, function(e){ e.preventDefault(); dz.classList.remove('over'); });
  });
  dz.addEventListener('drop', function(e){
    if (e.dataTransfer && e.dataTransfer.files) uploadFiles(e.dataTransfer.files);
  });
  // Paste a screenshot straight into the composer
  el('compose').addEventListener('paste', function(e){
    var items = (e.clipboardData || {}).items; if (!items) return;
    var files = [];
    for (var i = 0; i < items.length; i++){
      if (items[i].kind === 'file'){ var f = items[i].getAsFile(); if (f) files.push(f); }
    }
    if (files.length){ e.preventDefault(); uploadFiles(files); }
  });
})();

async function queuePost(){
  var text = el('compose').value.trim();
  var platforms = Object.keys(SELECTED).filter(function(k){ return SELECTED[k]; });
  if (!text){ showToast('Nothing to post', 'bad'); return; }
  if (!platforms.length){ showToast('Pick at least one platform', 'bad'); return; }
  var over = PLATFORMS.filter(function(p){ return SELECTED[p.id] && text.length > p.limit; });
  if (over.length){ showToast('Too long for ' + over.map(function(p){return p.label;}).join(', '), 'bad'); return; }
  if (MEDIA.some(function(m){ return m.uploading; })){ showToast('Wait for uploads to finish', 'bad'); return; }
  if (!checkMediaLimits()){ showToast('Fix the media warnings first', 'bad'); return; }
  var when = el('f-when').value;
  var btn = el('btn-queue'); btn.disabled = true;
  try {
    var body = { dashboardId: DASH, text: text, platforms: platforms,
      media: MEDIA.filter(function(m){ return !m.uploading; }).map(function(m){ return m.id; }),
      alt: el('f-alt').value.trim(),
      scheduledAt: when ? new Date(when).toISOString() : null };
    var r = await fetch('/api/social/queue', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body) }).then(function(x){ return x.json(); });
    if (r.error) throw new Error(r.error);
    showToast((when ? 'Scheduled' : 'Queued') + ' on ' + dashName(), 'ok');
    el('compose').value = ''; el('f-alt').value = ''; el('f-when').value = '';
    MEDIA = []; renderThumbs();
    renderCounts(); loadQueue();
  } catch(e){ showToast(e.message, 'bad'); }
  btn.disabled = false;
}
el('btn-queue').addEventListener('click', queuePost);

// ═══ QUEUE ═══════════════════════════════════════════════════════════════════
async function loadQueue(){
  try {
    var j = await fetch('/api/social/queue' + qs()).then(function(r){ return r.json(); });
    var wrap = el('queue'); wrap.textContent = '';
    if (!j.queue.length){
      var e = document.createElement('div'); e.className = 'empty';
      e.textContent = 'Nothing queued on ' + dashName() + ' yet.';
      wrap.appendChild(e); el('q-note').textContent = ''; return;
    }
    var pending = j.queue.filter(function(q){ return q.status==='queued'||q.status==='posting'; }).length;
    el('q-note').textContent = pending ? pending + ' pending' : '';
    j.queue.forEach(function(q){
      var d = document.createElement('div'); d.className = 'q';
      var h = document.createElement('div'); h.className = 'qh';
      var s = document.createElement('span'); s.className = 'qs ' + q.status; s.textContent = q.status;
      var t = document.createElement('span'); t.className = 'qt'; t.textContent = q.text;
      h.appendChild(s);
      if (q.source === 'autopilot'){ var src = document.createElement('span'); src.className = 'qsrc'; src.textContent = 'autopilot';
        if (q.why) src.title = q.why; h.appendChild(src); }
      h.appendChild(t);
      var m = document.createElement('div'); m.className = 'qm';
      // Every state gets its own label. "for <date>" used to appear on retrying
      // posts showing the backoff time, which read like a schedule you set.
      var when = document.createElement('span');
      if (q.status === 'posted' || q.status === 'partial'){
        when.textContent = 'posted ' + fmtWhen(q.finishedAt) + ' · ' + timeAgo(q.finishedAt);
      } else if (q.status === 'failed'){
        when.textContent = 'failed ' + fmtWhen(q.finishedAt || q.createdAt);
      } else if (q.status === 'posting'){
        when.textContent = 'publishing now…';
      } else if (q.nextAttemptAt){
        when.textContent = 'retry ' + ((q.attempts || 0) + 1) + '/3 at ' + fmtWhen(q.nextAttemptAt);
        when.style.color = 'var(--warn)';
      } else if (q.scheduledAt){
        when.textContent = '⏰ scheduled for ' + fmtWhen(q.scheduledAt);
        when.style.color = 'var(--accent2)';
      } else {
        when.textContent = 'queued · sending shortly';
      }
      m.appendChild(when);
      // The time it was written is separate from the time it goes out.
      if (q.createdAt && q.status !== 'posted'){
        var cr = document.createElement('span');
        cr.textContent = 'written ' + timeAgo(q.createdAt);
        cr.style.opacity = '.65';
        m.appendChild(cr);
      }
      q.platforms.forEach(function(p){
        var r = (q.results||{})[p];
        var c = document.createElement('span');
        c.className = 'qr' + (r ? (r.ok ? ' ok' : ' no') : '');
        if (r && r.ok && r.url){
          var a = document.createElement('a'); a.href = r.url; a.target = '_blank';
          a.rel = 'noopener'; a.textContent = p + ' \u2197'; c.appendChild(a);
        } else {
          c.textContent = p + (r ? (r.ok ? ' \u2713' : ' \u2717') : '');
          if (r && !r.ok) c.title = r.error || '';
        }
        m.appendChild(c);
      });
      // Show the actual error inline. A truncated tooltip is not debuggable.
      var errBox = null;
      var errs = q.platforms.map(function(p){
        var r = (q.results || {})[p];
        return (r && !r.ok && r.error) ? (p + ': ' + r.error) : null;
      }).filter(Boolean);
      if (errs.length){
        var eb = document.createElement('div');
        eb.style.cssText = 'font-family:var(--font-ui);font-size:9.5px;line-height:1.6;margin-top:6px;' +
          'padding:7px 9px;border-radius:7px;color:var(--red);' +
          'background:color-mix(in srgb,var(--red) 12%,transparent);word-break:break-word;';
        eb.textContent = errs.join(' · ');
        errBox = eb;   // appended after the meta row, not before the post text
      }
      if (q.status === 'failed' || q.status === 'partial'){
        var rt = document.createElement('button'); rt.className = 'btn sm'; rt.textContent = 'Retry';
        rt.addEventListener('click', async function(){
          await fetch('/api/social/retry/' + q.id, { method:'POST' });
          showToast('Requeued', 'ok'); loadQueue();
        });
        m.appendChild(rt);
      }
      if (q.status !== 'posting'){
        var dl = document.createElement('button'); dl.className = 'btn sm'; dl.innerHTML = '<i class="fa-solid fa-xmark"></i>'; dl.setAttribute('aria-label','Delete');
        dl.title = 'Remove';
        dl.addEventListener('click', async function(){
          await fetch('/api/social/queue/' + q.id, { method:'DELETE' }); loadQueue();
        });
        m.appendChild(dl);
      }
      d.appendChild(h); d.appendChild(m);
      if (q.news){ var qn = document.createElement('div'); qn.className = 'qnews';
        qn.appendChild(document.createTextNode('↳ '));
        var qa = document.createElement(q.news.url ? 'a' : 'span'); qa.textContent = q.news.title;
        if (q.news.url){ qa.href = q.news.url; qa.target = '_blank'; qa.rel = 'noopener'; }
        qn.appendChild(qa); if (q.news.publisher) qn.appendChild(document.createTextNode(' · ' + q.news.publisher)); d.appendChild(qn); }
      if (errBox) d.appendChild(errBox);
      wrap.appendChild(d);
    });
  } catch(e){}
}

// ═══ EMAILS (record-keeping) ═════════════════════════════════════════════════
function renderEmails(){
  var wrap = el('emails'); wrap.textContent = '';
  PLATFORMS.forEach(function(p){
    var row = document.createElement('div'); row.className = 'em';
    var n = document.createElement('span'); n.className = 'em-n'; n.textContent = p.label;
    var i = document.createElement('input'); i.className = 'em-i'; i.type = 'email';
    i.placeholder = 'not recorded'; i.value = EMAILS[p.id] || '';
    if (EMAILS[p.id]) i.classList.add('saved');
    var c = document.createElement('span'); c.className = 'em-c';
    c.textContent = p.configured ? 'linked' : '\u2014';
    var save = async function(){
      var v = i.value.trim();
      if (v === (EMAILS[p.id] || '')) return;
      try {
        var r = await fetch('/api/social/emails', { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ dashboardId: DASH, platform: p.id, email: v }) })
          .then(function(x){ return x.json(); });
        EMAILS = r.emails || {};
        i.classList.toggle('saved', !!v);
        showToast(p.label + ' email ' + (v ? 'saved' : 'cleared'), 'ok');
        renderPlats();
      } catch(e){ showToast('Could not save', 'bad'); }
    };
    i.addEventListener('blur', save);
    i.addEventListener('keydown', function(ev){ if (ev.key === 'Enter') i.blur(); });
    row.appendChild(n); row.appendChild(i); row.appendChild(c);
    wrap.appendChild(row);
  });
}

// ═══ ACCOUNTS ════════════════════════════════════════════════════════════════
// Facebook, Instagram and LinkedIn connect through their own sign-in pages
// (official APIs). Google-style rule: they only send you back to localhost, so a
// browser on another machine pastes the address it lands on instead.
function isRemoteHost(){
  return ['localhost', '127.0.0.1', '[::1]', '::1'].indexOf(location.hostname) === -1 && /[/][/]localhost[:/]/.test(OAUTH.redirectUri || '');
}
var OAUTH_HELP = {
  meta: 'Needs <b>META_APP_ID</b> and <b>META_APP_SECRET</b> in Open HL&#39;s .env (a Meta app with Facebook Login). Redirect URI: ',
  linkedin: 'Needs <b>LINKEDIN_CLIENT_ID</b> and <b>LINKEDIN_CLIENT_SECRET</b> in Open HL&#39;s .env (a LinkedIn app approved for the Community Management API). Redirect URI: '
};
function oauthCard(p){
  var d = document.createElement('div'); d.className = 'acc';
  var h = document.createElement('div'); h.className = 'acc-h';
  var dot = document.createElement('span'); dot.className = 'pdot ' + (p.configured ? 'ok' : 'no');
  var n = document.createElement('span'); n.className = 'acc-n'; n.textContent = p.label;
  var v = document.createElement('span'); v.className = 'via native'; v.textContent = 'native'; v.title = 'official API';
  h.appendChild(dot); h.appendChild(n); h.appendChild(v);
  var ready = !!OAUTH[p.oauth];
  if (ready){
    var c = document.createElement('a'); c.className = 'btn sm';
    c.textContent = p.configured ? 'Reconnect' : 'Connect';
    c.href = '/api/social/oauth/' + p.oauth + '/start?dashboard=' + encodeURIComponent(DASH);
    if (isRemoteHost()){
      c.target = '_blank'; c.rel = 'noopener';
      c.addEventListener('click', function(){ d.classList.add('open'); });
    }
    h.appendChild(c);
  }
  if (p.configured){
    var dg = document.createElement('button'); dg.className = 'btn sm'; dg.textContent = 'Diagnose';
    dg.addEventListener('click', function(){ diagnose(p.id, d, dg); });
    h.appendChild(dg);
    var rm = document.createElement('button'); rm.className = 'btn sm'; rm.textContent = 'Remove';
    rm.addEventListener('click', async function(){
      if (!confirm('Disconnect ' + p.label + ' from ' + dashName() + '?')) return;
      await fetch('/api/social/accounts/' + p.id + qs(), { method:'DELETE' });
      showToast(p.label + ' removed from ' + dashName(), 'ok'); loadAll();
    });
    h.appendChild(rm);
  }
  d.appendChild(h);
  var sub = document.createElement('div'); sub.className = 'hint'; sub.style.marginTop = '5px';
  var a = ACCTS[p.id];
  if (p.configured && a){
    sub.textContent = (p.id === 'linkedin' ? 'Company page: ' : p.id === 'facebook' ? 'Page: ' : '') + (a.handle || 'connected') +
      (a.expiresAt ? ' · sign-in lasts until ' + new Date(a.expiresAt).toLocaleDateString() : '');
  } else if (!ready){
    sub.innerHTML = OAUTH_HELP[p.oauth] + '<code>' + esc(OAUTH.redirectUri || '') + '</code>';
  } else {
    sub.textContent = p.id === 'instagram' ? 'Connect with Facebook; the Instagram professional account linked to your Page is picked up too.'
      : p.id === 'facebook' ? 'Connect with Facebook and choose the Page to post to.' : 'Connect with LinkedIn and choose the company page to post as.';
  }
  d.appendChild(sub);
  if (ready && isRemoteHost()){
    var f = document.createElement('div'); f.className = 'acc-f';
    var hint = document.createElement('div'); hint.className = 'hint';
    hint.innerHTML = 'After signing in you land on a <b>localhost</b> address that will not load on this computer. Copy that whole address and paste it here.';
    var inp = document.createElement('input'); inp.className = 'fi'; inp.placeholder = 'http://localhost:…/api/social/oauth/callback?code=…';
    var fin = document.createElement('button'); fin.className = 'btn sm'; fin.textContent = 'Finish';
    fin.addEventListener('click', async function(){
      var r = await fetch('/api/social/oauth/finish', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: inp.value }) })
        .then(function(x){ return x.json().then(function(j){ return { ok: x.ok, j: j }; }); });
      if (!r.ok){ showToast(r.j.error || 'Could not finish', 'bad'); return; }
      showToast('Signed in — now choose below', 'ok'); loadAll();
    });
    f.appendChild(hint); f.appendChild(inp); f.appendChild(fin);
    d.appendChild(f);
  }
  return d;
}
// After signing in: choose the Page (and Instagram) or the company page for this dashboard.
function pendingBox(){
  var box = document.createElement('div');
  if (PENDING.meta){
    var m = document.createElement('div'); m.className = 'acc open';
    m.innerHTML = '<div class="acc-h"><span class="acc-n">Choose a Facebook Page for ' + esc(dashName()) + '</span></div>';
    var f = document.createElement('div'); f.className = 'acc-f';
    PENDING.meta.forEach(function(pg, i){
      var lab = document.createElement('label'); lab.className = 'hint'; lab.style.cssText = 'display:flex;gap:8px;align-items:center;cursor:pointer;';
      lab.innerHTML = '<input type="radio" name="meta-page" value="' + esc(pg.id) + '"' + (i === 0 ? ' checked' : '') + (pg.canPost ? '' : ' disabled') + '> ' +
        '<span><b>' + esc(pg.name) + '</b>' + (pg.instagram ? ' · Instagram @' + esc(pg.instagram) : ' · no Instagram linked') +
        (pg.canPost ? '' : ' · you cannot post on this Page') + '</span>';
      f.appendChild(lab);
    });
    var opts = document.createElement('div'); opts.className = 'hint'; opts.style.cssText = 'display:flex;gap:14px;margin-top:6px;';
    opts.innerHTML = '<label><input type="checkbox" id="meta-fb" checked> Use for Facebook</label><label><input type="checkbox" id="meta-ig" checked> Use for Instagram</label>';
    f.appendChild(opts);
    var sv = document.createElement('button'); sv.className = 'btn sm'; sv.textContent = 'Save';
    sv.addEventListener('click', async function(){
      var pick = f.querySelector('input[name=meta-page]:checked');
      if (!pick){ showToast('Choose a Page', 'bad'); return; }
      var r = await fetch('/api/social/oauth/choose', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ dashboardId: DASH, provider:'meta', pageId: pick.value, facebook: el('meta-fb').checked, instagram: el('meta-ig').checked }) })
        .then(function(x){ return x.json().then(function(j){ return { ok: x.ok, j: j }; }); });
      if (!r.ok){ showToast(r.j.error || 'Could not save', 'bad'); return; }
      showToast('Connected ' + r.j.saved.join(' and ') + ' on ' + dashName(), 'ok'); loadAll();
    });
    f.appendChild(sv); m.appendChild(f); box.appendChild(m);
  }
  if (PENDING.linkedin){
    var l = document.createElement('div'); l.className = 'acc open';
    l.innerHTML = '<div class="acc-h"><span class="acc-n">Choose a LinkedIn company page for ' + esc(dashName()) + '</span></div>';
    var g = document.createElement('div'); g.className = 'acc-f';
    PENDING.linkedin.forEach(function(o, i){
      var lab = document.createElement('label'); lab.className = 'hint'; lab.style.cssText = 'display:flex;gap:8px;align-items:center;cursor:pointer;';
      lab.innerHTML = '<input type="radio" name="li-org" value="' + esc(o.id) + '"' + (i === 0 ? ' checked' : '') + '> <span><b>' + esc(o.name) + '</b> · ' + esc(String(o.role).toLowerCase().split('_').join(' ')) + '</span>';
      g.appendChild(lab);
    });
    var sv2 = document.createElement('button'); sv2.className = 'btn sm'; sv2.textContent = 'Save';
    sv2.addEventListener('click', async function(){
      var pick = g.querySelector('input[name=li-org]:checked');
      var r = await fetch('/api/social/oauth/choose', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ dashboardId: DASH, provider:'linkedin', orgId: pick && pick.value }) })
        .then(function(x){ return x.json().then(function(j){ return { ok: x.ok, j: j }; }); });
      if (!r.ok){ showToast(r.j.error || 'Could not save', 'bad'); return; }
      showToast('Connected LinkedIn on ' + dashName(), 'ok'); loadAll();
    });
    g.appendChild(sv2); l.appendChild(g); box.appendChild(l);
  }
  return box;
}
function accountCard(p){
  if (p.oauth) return oauthCard(p);
  var d = document.createElement('div'); d.className = 'acc';
  var h = document.createElement('div'); h.className = 'acc-h';
  var dot = document.createElement('span'); dot.className = 'pdot ' + (p.configured ? 'ok' : 'no');
  var n = document.createElement('span'); n.className = 'acc-n'; n.textContent = p.label;
  var v = document.createElement('span'); v.className = 'via ' + p.via; v.textContent = p.via;
  h.appendChild(dot); h.appendChild(n); h.appendChild(v);

  if (p.via === 'native'){
    var tog = document.createElement('button'); tog.className = 'btn sm';
    tog.textContent = p.configured ? 'Edit' : 'Set up';
    tog.addEventListener('click', function(){ d.classList.toggle('open'); });
    h.appendChild(tog);
    if (p.configured){
      var dg = document.createElement('button'); dg.className = 'btn sm';
      dg.textContent = 'Diagnose'; dg.title = 'Check instance, token, scopes and limits';
      dg.addEventListener('click', function(){ diagnose(p.id, d, dg); });
      h.appendChild(dg);
    }
    d.appendChild(h);
    var f = document.createElement('div'); f.className = 'acc-f';
    var eIn = document.createElement('input'); eIn.className='fi'; eIn.type='email';
    eIn.placeholder='account email (for your records)'; eIn.value = EMAILS[p.id] || '';
    if (p.id === 'bluesky'){
      var hIn = document.createElement('input'); hIn.className='fi'; hIn.placeholder='you.bsky.social';
      var pIn = document.createElement('input'); pIn.className='fi'; pIn.type='password';
      pIn.placeholder = p.configured ? 'app password (saved)' : 'app password';
      var hint = document.createElement('div'); hint.className='hint';
      hint.innerHTML = 'Make an <b>app password</b> at Settings \u2192 Privacy and Security \u2192 App Passwords. ' +
        'Never use your real password here.';
      var save = document.createElement('button'); save.className='btn sm'; save.textContent='Save';
      save.addEventListener('click', async function(){
        await fetch('/api/social/accounts', { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ dashboardId: DASH, platform:'bluesky', handle:hIn.value,
            appPassword:pIn.value, email:eIn.value }) });
        showToast('Saved to ' + dashName(), 'ok'); verify('bluesky'); loadAll();
      });
      f.appendChild(hIn); f.appendChild(pIn); f.appendChild(eIn); f.appendChild(hint); f.appendChild(save);
    } else {
      var iIn = document.createElement('input'); iIn.className='fi'; iIn.placeholder='https://mastodon.social';
      var tIn = document.createElement('input'); tIn.className='fi'; tIn.type='password';
      tIn.placeholder = p.configured ? 'access token (saved)' : 'access token';
      var hint2 = document.createElement('div'); hint2.className='hint';
      hint2.innerHTML = 'Your instance \u2192 Preferences \u2192 Development \u2192 New application, ' +
        'scope <b>write:statuses</b> (plus <b>write:media</b> for images).';
      var save2 = document.createElement('button'); save2.className='btn sm'; save2.textContent='Save';
      save2.addEventListener('click', async function(){
        await fetch('/api/social/accounts', { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ dashboardId: DASH, platform:'mastodon', instance:iIn.value,
            token:tIn.value, email:eIn.value }) });
        showToast('Saved to ' + dashName(), 'ok'); verify('mastodon'); loadAll();
      });
      f.appendChild(iIn); f.appendChild(tIn); f.appendChild(eIn); f.appendChild(hint2); f.appendChild(save2);
    }
    d.appendChild(f);
  } else {
    var st = document.createElement('span'); st.className = 'hint';
    st.textContent = p.sessionAge ? timeAgo(p.sessionAge) : 'no session';
    st.title = 'Browser sessions are shared across all three dashboards';
    h.appendChild(st);
    d.appendChild(h);
    var sub = document.createElement('div'); sub.className = 'hint'; sub.style.marginTop = '5px';
    sub.textContent = 'shared session \u00b7 sign in from Browser agent below';
    d.appendChild(sub);
  }
  return d;
}
async function diagnose(platform, card, btn){
  var old = card.querySelector('.diag'); if (old) old.remove();
  btn.disabled = true; btn.textContent = 'Checking…';
  try {
    var r = await fetch('/api/social/diagnose', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ dashboardId: DASH, platform: platform }) }).then(function(x){ return x.json(); });
    var box = document.createElement('div'); box.className = 'diag';
    box.style.cssText = 'margin-top:9px;padding:9px 11px;border-radius:9px;background:var(--surface2);' +
      'border:1px solid var(--border);font-family:var(--font-ui);font-size:9.5px;line-height:1.75;';
    (r.steps || []).forEach(function(st){
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:7px;align-items:baseline;';
      var ic = document.createElement('span');
      ic.textContent = st.ok ? '✓' : '✗';
      ic.style.color = st.ok ? 'var(--green)' : 'var(--red)';
      ic.style.flexShrink = '0';
      var tx = document.createElement('span');
      tx.textContent = st.name + ': ' + st.detail;
      tx.style.wordBreak = 'break-word';
      if (!st.ok) tx.style.color = 'var(--red)';
      row.appendChild(ic); row.appendChild(tx); box.appendChild(row);
    });
    card.appendChild(box);
    showToast(r.ok ? 'All checks passed' : 'Found a problem — see the details', r.ok ? 'ok' : 'bad');
  } catch(e){ showToast('Diagnose failed: ' + e.message, 'bad'); }
  btn.disabled = false; btn.textContent = 'Diagnose';
}
async function verify(platform){
  try {
    var r = await fetch('/api/social/verify', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ dashboardId: DASH, platform: platform }) }).then(function(x){ return x.json(); });
    showToast(r.ok ? (platform + ' verified: ' + (r.detail||'')) : (platform + ': ' + r.error), r.ok ? 'ok' : 'bad');
  } catch(e){}
}
async function agentLogin(platform, btn){
  btn.disabled = true; btn.textContent = 'Opening\u2026';
  showToast('A browser window is opening on the Open HL host \u2014 sign in there', 'info');
  try {
    var r = await fetch('/api/social/agent/login', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ platform: platform }) }).then(function(x){ return x.json(); });
    showToast(r.ok ? (platform + ' session saved') : (r.error || 'login failed'), r.ok ? 'ok' : 'bad');
  } catch(e){ showToast('Agent unreachable', 'bad'); }
  btn.disabled = false; loadAll();
}
function renderAgent(){
  var b = el('agent-body'); b.textContent = '';
  var dot = el('agent-dot');
  dot.textContent = AGENT.online ? '\u25cf online' : '\u25cb offline';
  dot.style.color = AGENT.online ? 'var(--green)' : 'var(--muted)';
  var h = document.createElement('div'); h.className = 'hint';
  if (AGENT.online){
    h.innerHTML = 'Running on <b>127.0.0.1:' + AGENT.port + '</b>. One browser session per platform, ' +
      '<b>shared by all three dashboards</b>. Login opens a real browser window on the Open HL host \u2014 ' +
      'you sign in by hand, and only the session cookie is kept.';
    b.appendChild(h);
    var row = document.createElement('div'); row.className = 'row';
    PLATFORMS.filter(function(p){ return p.via === 'agent'; }).forEach(function(p){
      var wrapb = document.createElement('div');
      var lab = document.createElement('div'); lab.className = 'fl'; lab.textContent = p.label;
      var lb = document.createElement('button'); lb.className = 'btn sm';
      lb.textContent = p.sessionAge ? 'Re-login' : 'Login';
      lb.addEventListener('click', function(){ agentLogin(p.id, lb); });
      wrapb.appendChild(lab); wrapb.appendChild(lb);
      row.appendChild(wrapb);
    });
    b.appendChild(row);
  } else {
    h.innerHTML = 'Not running. Bluesky and Mastodon still work on every dashboard without it. ' +
      'To enable the browser platforms:<br><br><code>cd agents/social<br>npm install<br>' +
      'npx playwright install chromium<br>node social_agent.js</code>';
    b.appendChild(h);
  }
}

async function loadAll(){
  try {
    var dl = await fetch('/api/social/dashboards').then(function(r){ return r.json(); });
    DASHBOARDS = dl.dashboards || [];
    if (!DASH || !DASHBOARDS.filter(function(x){ return x.id===DASH; }).length){
      var saved = null; try{ saved = localStorage.getItem('openhl-social-dash'); }catch(e){}
      DASH = (saved && DASHBOARDS.filter(function(x){ return x.id===saved; }).length)
        ? saved : (DASHBOARDS[0] && DASHBOARDS[0].id);
    }
    renderTabs();
    applyCards();

    var j = await fetch('/api/social/platforms' + qs()).then(function(r){ return r.json(); });
    PLATFORMS = j.platforms || []; AGENT = j.agent || {}; MINGAP = j.minGapMs || 60000; OAUTH = j.oauth || {};
    ACCTS = {};
    try { ((await fetch('/api/social/accounts' + qs()).then(function(r){ return r.json(); })).accounts || []).forEach(function(a){ ACCTS[a.platform] = a; }); } catch(e){}
    try { PENDING = (await fetch('/api/social/oauth/pending' + qs()).then(function(r){ return r.json(); })).choices || {}; } catch(e){ PENDING = {}; }
    EMAILS = j.emails || {};
    el('gap-note').textContent = 'min ' + Math.round(MINGAP/1000) + 's between posts';
    var nm = dashName();
    el('compose-h').textContent = 'Compose \u00b7 ' + nm;
    el('acc-h').textContent = 'Accounts \u00b7 ' + nm;
    el('em-h').textContent = 'Emails \u00b7 ' + nm;
    el('queue-h').textContent = 'Queue & history \u00b7 ' + nm;
    var ready = PLATFORMS.filter(function(p){ return p.configured; }).length;
    el('so-sub').textContent = '// ' + nm + ' \u00b7 ' + ready + ' of ' + PLATFORMS.length + ' platforms ready';
    renderPlats(); renderCounts(); renderAgent(); renderEmails();
    var wrap = el('accounts'); wrap.textContent = '';
    wrap.appendChild(pendingBox());
    PLATFORMS.forEach(function(p){ wrap.appendChild(accountCard(p)); });
  } catch(e){}
  AP_DIRTY = false; el('ap-preview').textContent = '';
  loadAutopilot();
  loadQueue();
}
el('btn-refresh').addEventListener('click', loadAll);
(function(){
  if (!('EventSource' in window)) return;
  try {
    var es = openhlEvents();
    es.addEventListener('social_update', function(ev){
      try {
        var d = JSON.parse(ev.data);
        if (d.status === 'posted') showToast('Published \u2713', 'ok');
        else if (d.status === 'failed') showToast('Post failed', 'bad');
        else if (d.status === 'partial') showToast('Partially published', 'bad');
      } catch(e){}
      loadQueue();
    });
    es.addEventListener('social_autopilot', function(ev){
      try { if (JSON.parse(ev.data).dashboardId === DASH) loadAutopilot(); } catch(e){}
    });
  } catch(e){}
})();
// Back from a Facebook / LinkedIn sign-in: open the dashboard it was for, where
// the choice of Page or company is waiting; or show why it failed.
(function(){
  var q = new URLSearchParams(location.search);
  if (q.get('dashboard')) { DASH = q.get('dashboard'); try { localStorage.setItem('openhl-social-dash', DASH); } catch(e){} }
  if (q.get('pick')) showToast('Signed in — choose ' + (q.get('pick') === 'meta' ? 'a Page' : 'a company page') + ' under Accounts', 'ok');
  if (q.get('serr')) showToast(q.get('serr'), 'bad');
  if (q.get('pick') || q.get('serr')) history.replaceState(null, '', '/social');
})();
loadAll();
loadAiCfg().then(function(){ if (AP.selectable) renderAutopilot(); });
loadNews();
setInterval(loadQueue, 15000);
