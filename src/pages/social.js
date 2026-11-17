const { BASE_CSS, FAVICON, FONT, NAV_CSS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");

function socialHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open HL \xb7 Social</title>${FONT}${FAVICON}
<style>
${BASE_CSS}${NAV_CSS}${TOAST_CSS}
.so{max-width:1440px;}
.so-top{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px;}
.so-title{font-family:var(--font-display);font-weight:600;font-size:26px;}
.so-sub{font-family:var(--font-ui);font-size:13px;color:var(--muted);margin-top:3px;}

/* dashboard switcher */
.dtabs{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:16px;border-bottom:1px solid var(--border);padding-bottom:12px;}
.dtab{display:flex;align-items:center;gap:8px;padding:9px 15px;border-radius:var(--r-panel);background:var(--surface2);
  border:1px solid var(--border);color:var(--text);font-family:var(--font-display);font-weight:600;font-size:13px;
  transition:all .15s;}
.dtab:hover{border-color:var(--accent);}
.dtab.on{background:var(--surface);border-color:var(--accent);box-shadow:inset 0 -2px 0 var(--accent);}
.dtab .db{font-family:var(--font-ui);font-size:12px;font-weight:400;color:var(--muted);
  padding:2px 6px;border-radius:var(--r-ctl);background:var(--surface);border:1px solid var(--border);}
.dtab.on .db{color:var(--text);}
.dtab-edit{background:none;border:none;color:var(--muted);font-size:13px;padding:0 2px;}
.dtab-edit:hover{color:var(--accent);}

/* which optional cards this dashboard shows */
.cardvis{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:-6px 0 16px;}
.cardvis .lbl{font-family:var(--font-ui);font-size:12px;color:var(--muted);margin-right:2px;}
.cv{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:var(--r-ctl);background:var(--surface);
  border:1px solid var(--border);color:var(--text);font-family:var(--font-ui);font-size:12.5px;}
.cv:hover{border-color:var(--accent);}
.cv[aria-pressed="false"]{color:var(--muted);background:var(--surface2);border-style:dashed;}
.cv .cv-on{color:var(--yellow);font-size:11.5px;}
.card[hidden]{display:none;}
.so-grid .card.first{margin-top:0;}

.so-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(300px,.85fr);gap:16px;}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-panel);padding:16px;}
.card+.card{margin-top:16px;}
.card-h{font-family:var(--font-display);font-size:16px;font-weight:600;
  color:var(--text);margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:10px;}

.warn{background:color-mix(in srgb,var(--warn) 10%,var(--surface));
  border:1px solid color-mix(in srgb,var(--warn) 45%,transparent);border-radius:var(--r-panel);
  padding:11px 14px;font-size:13px;line-height:1.7;color:var(--text);margin-bottom:16px;}
.warn b{color:var(--warn);}

#compose{width:100%;min-height:150px;background:var(--bg);border:1px solid var(--border);border-radius:var(--r-panel);
  padding:13px 15px;color:var(--text);font-size:14px;line-height:1.65;font-family:inherit;outline:none;resize:vertical;}
#compose:focus{border-color:var(--accent);}
.counts{display:flex;gap:9px;flex-wrap:wrap;margin-top:9px;font-family:var(--font-ui);font-size:12px;}
.cnt{padding:3px 9px;border-radius:var(--r-ctl);background:var(--surface2);border:1px solid var(--border);color:var(--muted);}
.cnt.over{color:var(--red);border-color:var(--red);}
.cnt.near{color:var(--warn);}

.plats{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:8px;margin-top:14px;}
.plat{display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:var(--r-panel);background:var(--surface2);
  border:1px solid var(--border);transition:all .14s;text-align:left;}
.plat:hover:not(.disabled){border-color:var(--accent);}
.plat.sel{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 20%,transparent);}
.plat.disabled{opacity:.42;cursor:not-allowed;}
.plat .pn{flex:1;min-width:0;}
.plat .p1{font-size:12.5px;font-weight:600;}
.plat .p2{font-family:var(--font-ui);font-size:12px;color:var(--muted);margin-top:2px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.pdot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
.pdot.ok{background:var(--green);}
.pdot.no{background:var(--muted);}
.via{font-family:var(--font-ui);font-size:12px;padding:1px 5px;border-radius:4px;
  border:1px solid var(--border);color:var(--muted);}
.via.native{color:var(--green);border-color:color-mix(in srgb,var(--green) 45%,transparent);}
.via.agent{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 45%,transparent);}

/* Autopilot */
.card.ap-on{border-color:color-mix(in srgb,var(--green) 45%,var(--line));}
.ap-pill{font-family:var(--font-ui);font-size:12px;font-weight:400;padding:2px 8px;border-radius:var(--r-ctl);
  border:1px solid var(--border);color:var(--muted);}
.ap-pill.on{color:var(--green);border-color:color-mix(in srgb,var(--green) 50%,transparent);}
.ap-pill.err{color:var(--red);border-color:color-mix(in srgb,var(--red) 50%,transparent);}
#ap-prompt{width:100%;min-height:110px;background:var(--bg);border:1px solid var(--border);border-radius:var(--r-panel);
  padding:10px 12px;color:var(--text);font-size:12.5px;line-height:1.6;font-family:inherit;outline:none;resize:vertical;}
#ap-prompt:focus{border-color:var(--accent);}
.ap-st{font-family:var(--font-ui);font-size:12.5px;color:var(--muted);line-height:1.7;margin-top:10px;}
.ap-st b{color:var(--text);font-weight:600;}
.ap-st .bad{color:var(--red);}
.ap-story{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.ap-story a{color:var(--accent2);}
.ap-refresh{padding:3px 8px;}
.ap-sub{font-family:var(--font-ui);font-size:12px;color:var(--muted);margin:12px 0 6px;}
.ap-plats{display:flex;gap:6px;flex-wrap:wrap;}
.ap-plat{display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:var(--r-ctl);background:var(--surface2);
  border:1px solid var(--border);color:var(--text);font-size:12.5px;}
.ap-plat:hover{border-color:var(--accent);}
.ap-plat.sel{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 20%,transparent);}
.ap-plat .via{font-size:11px;}
.ap-ai{display:flex;gap:8px;flex-wrap:wrap;}
.ap-ai select{flex:1;min-width:150px;}
.ap-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;}
.ap-grid .ai-sel{width:100%;}
.ap-chk{display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;margin-top:4px;}
.ap-news[hidden]{display:none;}
.nw-list{display:flex;flex-direction:column;gap:8px;margin-top:12px;max-height:520px;overflow-y:auto;}
.nw{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid var(--border);border-radius:var(--r-panel);background:var(--surface2);}
.nw.used{opacity:.55;}
.nw-t{flex:1;min-width:0;font-size:13px;line-height:1.5;}
.nw-m{font-family:var(--font-ui);font-size:12px;color:var(--muted);margin-top:3px;}
.nw .btn{flex-shrink:0;}
.qnews{font-family:var(--font-ui);font-size:12px;color:var(--muted);margin-top:4px;}
.qnews a{color:var(--accent2);}
.qsrc{font-family:var(--font-ui);font-size:11px;padding:1px 6px;border-radius:var(--r-ctl);flex-shrink:0;
  color:var(--accent2);border:1px solid color-mix(in srgb,var(--accent2) 45%,transparent);}

/* AI copilot */
.ai-head{display:flex;align-items:center;gap:9px;flex-wrap:wrap;}
.ai-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
.ai-dot.ok{background:var(--green);}
.ai-dot.no{background:var(--muted);}
.ai-row{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:10px;}
#ai-prompt{width:100%;min-height:62px;background:var(--bg);border:1px solid var(--border);border-radius:var(--r-panel);
  padding:10px 12px;color:var(--text);font-size:12.5px;line-height:1.6;font-family:inherit;outline:none;resize:vertical;}
#ai-prompt:focus{border-color:var(--accent);}
.ai-sel{background:var(--bg);border:1px solid var(--border);border-radius:var(--r-ctl);padding:9px 10px;
  color:var(--text);font-size:13px;font-family:var(--font-ui);outline:none;}
.drafts{display:flex;flex-direction:column;gap:10px;margin-top:12px;}
.draft{border:1px solid var(--border);border-radius:var(--r-panel);padding:12px;background:var(--surface2);}
.draft.dupe{border-color:color-mix(in srgb,var(--warn) 60%,transparent);}
.draft.toolong{border-color:color-mix(in srgb,var(--red) 60%,transparent);}
.draft-t{font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word;}
.draft-m{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-top:9px;
  font-family:var(--font-ui);font-size:12px;color:var(--muted);}
.dchip{padding:2px 7px;border-radius:var(--r-ctl);border:1px solid var(--border);}
.dchip.warn{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 50%,transparent);}
.dchip.bad{color:var(--red);border-color:color-mix(in srgb,var(--red) 50%,transparent);}
.dchip.good{color:var(--green);border-color:color-mix(in srgb,var(--green) 50%,transparent);}
.draft-why{font-family:var(--font-ui);font-size:12px;color:var(--muted);
  margin-top:7px;line-height:1.55;font-style:italic;}
.draft-dup{margin-top:8px;padding:8px 10px;border-radius:var(--r-ctl);font-family:var(--font-ui);
  font-size:12px;line-height:1.6;background:color-mix(in srgb,var(--warn) 14%,transparent);
  color:var(--text);}
.draft-acts{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px;align-items:center;}
.draft-when{background:var(--bg);border:1px solid var(--border);border-radius:var(--r-ctl);padding:6px 9px;
  color:var(--text);font-size:13px;font-family:var(--font-ui);outline:none;}
.ai-empty{font-family:var(--font-ui);font-size:13px;color:var(--muted);line-height:1.7;margin-top:10px;}
/* media dropzone + previews */
.drop{margin-top:14px;border:1.5px dashed var(--border);border-radius:var(--r-panel);padding:16px;text-align:center;
  transition:all .15s;background:var(--surface2);cursor:pointer;}
.drop:hover,.drop.over{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--surface2));}
.drop.over{border-style:solid;}
.drop-t{font-size:12.5px;font-weight:600;}
.drop-s{font-family:var(--font-ui);font-size:12px;color:var(--muted);margin-top:5px;line-height:1.6;}
.thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:9px;margin-top:11px;}
.th{position:relative;border-radius:var(--r-panel);overflow:hidden;background:#0a0d16;border:1px solid var(--border);
  aspect-ratio:1;}
.th img,.th video{width:100%;height:100%;object-fit:cover;display:block;}
.th.bad{border-color:var(--red);}
.th-x{position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:var(--r-ctl);border:none;
  background:rgba(0,0,0,.72);color:#fff;font-size:13px;line-height:1;display:flex;align-items:center;
  justify-content:center;}
.th-x:hover{background:var(--red);}
.th-m{position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.72);color:#cbd5e1;
  font-family:var(--font-ui);font-size:12px;padding:3px 5px;display:flex;justify-content:space-between;gap:4px;}
.th-k{position:absolute;top:4px;left:4px;background:rgba(0,0,0,.72);color:#cbd5e1;border-radius:var(--r-ctl);
  font-family:var(--font-ui);font-size:12px;padding:2px 5px;}
.th-up{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  background:rgba(0,0,0,.6);color:#fff;font-family:var(--font-ui);font-size:12px;}
.media-warn{margin-top:9px;font-family:var(--font-ui);font-size:12px;color:var(--red);line-height:1.6;}
.row{display:flex;gap:9px;flex-wrap:wrap;align-items:flex-end;margin-top:14px;}
.fl{font-family:var(--font-ui);font-size:12px;
  color:var(--muted);margin-bottom:5px;}
.fi{background:var(--bg);border:1px solid var(--border);border-radius:var(--r-ctl);padding:9px 12px;color:var(--text);
  font-size:12px;font-family:var(--font-ui);outline:none;}
.fi:focus{border-color:var(--accent);}
.btn{background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:var(--r-ctl);
  padding:10px 17px;font-size:13px;font-family:var(--font-ui);transition:all .15s;}
.btn:hover:not(:disabled){border-color:var(--line-strong);}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:600;}
.btn:disabled{opacity:.45;}
.btn.sm{padding:5px 10px;font-size:12px;}

.q{padding:11px 0;border-bottom:1px solid var(--border);}
.q:last-child{border-bottom:none;}
.qh{display:flex;align-items:baseline;gap:9px;}
.qs{font-family:var(--font-ui);font-size:12px;padding:2px 7px;border-radius:var(--r-ctl);flex-shrink:0;}
.qs.queued{color:var(--muted);border:1px solid var(--border);}
.qs.posting{color:var(--accent2);border:1px solid color-mix(in srgb,var(--accent2) 50%,transparent);}
.qs.posted{color:var(--green);border:1px solid color-mix(in srgb,var(--green) 50%,transparent);}
.qs.partial{color:var(--warn);border:1px solid color-mix(in srgb,var(--warn) 50%,transparent);}
.qs.failed{color:var(--red);border:1px solid color-mix(in srgb,var(--red) 50%,transparent);}
.qt{flex:1;min-width:0;font-size:12.5px;line-height:1.5;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.qm{font-family:var(--font-ui);font-size:12px;color:var(--muted);margin-top:5px;
  display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
.qr{font-family:var(--font-ui);font-size:12px;padding:1px 6px;border-radius:4px;border:1px solid var(--border);}
.qr.ok{color:var(--green);} .qr.no{color:var(--red);}
.qr a{color:inherit;text-decoration:none;} .qr a:hover{text-decoration:underline;}

.acc{padding:10px 0;border-bottom:1px solid var(--border);}
.acc:last-child{border-bottom:none;}
.acc-h{display:flex;align-items:center;gap:8px;}
.acc-n{flex:1;font-size:12.5px;font-weight:600;}
.acc-f{display:none;flex-direction:column;gap:7px;margin-top:9px;}
.acc.open .acc-f{display:flex;}
.acc-f .fi{width:100%;}
.hint{font-family:var(--font-ui);font-size:12px;color:var(--muted);line-height:1.65;}
.hint a{color:var(--accent2);}
.empty{text-align:center;padding:34px 16px;color:var(--muted);font-family:var(--font-ui);font-size:13px;}

/* email register */
.em{display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid var(--border);}
.em:last-of-type{border-bottom:none;}
.em-n{width:78px;flex-shrink:0;font-size:13px;font-weight:600;}
.em-i{flex:1;min-width:0;background:var(--bg);border:1px solid var(--border);border-radius:var(--r-ctl);
  padding:7px 10px;color:var(--text);font-size:13px;font-family:var(--font-ui);outline:none;}
.em-i:focus{border-color:var(--accent);}
.em-i.saved{border-color:color-mix(in srgb,var(--green) 55%,transparent);}
.em-c{font-family:var(--font-ui);font-size:12px;color:var(--muted);flex-shrink:0;width:52px;text-align:right;}
@media(max-width:900px){.so-grid{grid-template-columns:1fr;}}
@media(max-width:560px){.em-n{width:64px;}.em-c{display:none;}}
</style></head><body>

${navBar("/social")}
<div class="so m-page">
  <div class="m-head">
    <div>
      <h1 class="m-title">Social</h1>
      <p class="m-sub" id="so-sub">Draft, queue and schedule posts across your accounts.</p>
    </div>
    <button class="m-btn" id="btn-refresh"><i class="fa-solid fa-rotate"></i>Refresh</button>
  </div>

  <div class="dtabs" id="dtabs"></div>
  <div class="cardvis" id="cardvis"><span class="lbl">Show on this dashboard:</span></div>

  <div class="warn">
    <b>Before you use the browser-driven platforms:</b> X and Threads go through a real logged-in
    browser. That is against their automation terms, and the realistic downside is a locked or
    suspended account. Bluesky, Mastodon, Facebook Pages, Instagram and LinkedIn company pages
    publish over their official APIs and carry no such risk \u2014 prefer them where you can.
  </div>

  <div class="so-grid">
    <div>
      <div class="card" id="ap-card">
        <div class="card-h"><span id="ap-h">Autopilot</span><span class="ap-pill" id="ap-pill">off</span></div>
        <div class="hint" style="margin-bottom:9px">Describe the account and how often to post. While it is on, Open HL writes each post
          with the local AI and publishes it straight away, with no review. It posts to this dashboard's
          accounts below. X and Threads are only used if you pick them.</div>
        <textarea id="ap-prompt" placeholder="e.g. You post for my woodworking shop. Share one practical tip about joinery, finishes or tool care, warm and plain-spoken, no sales pitch. Post about once a day, weekday mornings."></textarea>
        <div class="ap-sub">Posts to</div>
        <div class="ap-plats" id="ap-plats"></div>
        <div class="ap-sub">Written by</div>
        <div class="ap-ai"><select class="ai-sel" id="ap-host"></select><select class="ai-sel" id="ap-model"></select></div>
        <div class="ap-sub">Post rate</div>
        <div class="ap-ai"><select class="ai-sel" id="ap-rate">
          <option value="">From the prompt</option>
          <option value="2">Every 2 hours (12 a day)</option><option value="3">Every 3 hours (8 a day)</option>
          <option value="4">Every 4 hours (6 a day)</option><option value="6">Every 6 hours (4 a day)</option>
          <option value="8">Every 8 hours (3 a day)</option><option value="12">Twice a day</option>
          <option value="24">Once a day</option><option value="48">Every other day</option>
          <option value="56">3 times a week</option><option value="84">Twice a week</option>
          <option value="168">Once a week</option>
        </select></div>
        <div class="ap-sub">News</div>
        <label class="ap-chk"><input type="checkbox" id="ap-news-on"> Post summaries of fresh news (freenewsapi.io)</label>
        <div class="ap-news" id="ap-news" hidden>
          <div class="ap-grid" style="margin-top:8px">
            <select class="ai-sel" id="ap-news-topic"><option value="">Any topic</option></select>
            <input class="ai-sel" id="ap-news-kw" placeholder="title keywords (optional)">
            <input class="ai-sel" id="ap-news-country" placeholder="country, e.g. us" maxlength="2">
            <select class="ai-sel" id="ap-news-age">
              <option value="6">From the last 6 hours</option><option value="12">Last 12 hours</option>
              <option value="24">Last 24 hours</option><option value="72">Last 3 days</option><option value="168">Last week</option>
            </select>
          </div>
          <label class="ap-chk"><input type="checkbox" id="ap-news-link"> Add the article's link to each post</label>
        </div>
        <div class="ai-row">
          <button class="btn" id="ap-save">Save prompt</button>
          <button class="btn" id="ap-try" title="Write a post with this prompt without publishing it">Try it</button>
          <button class="btn" id="ap-now" title="Write and publish one post now; the schedule carries on from there">Post one now</button>
          <button class="btn primary" id="ap-toggle" style="margin-left:auto">Turn on</button>
        </div>
        <div class="ap-st" id="ap-st"></div>
        <div class="drafts" id="ap-preview"></div>
      </div>

      <div class="card" id="ai-card">
        <div class="card-h"><span>AI copilot</span><span id="ai-status"></span></div>
        <div class="ai-head">
          <span class="ai-dot no" id="ai-dot"></span>
          <span class="hint" id="ai-peer">checking local peer\u2026</span>
          <select class="ai-sel" id="ai-host" style="margin-left:auto;max-width:190px"></select>
          <select class="ai-sel" id="ai-model" style="max-width:170px"></select>
        </div>
        <textarea id="ai-prompt" placeholder="What should it post about? e.g. 'the new feature I shipped this week'"></textarea>
        <div class="ai-row">
          <select class="ai-sel" id="ai-count">
            <option value="1">1 draft</option><option value="3" selected>3 drafts</option>
            <option value="5">5 drafts</option>
          </select>
          <input class="ai-sel" id="ai-tone" placeholder="tone (optional) \u2014 dry, technical, upbeat" style="flex:1;min-width:170px">
          <button class="btn primary" id="ai-go">Write drafts</button>
        </div>
        <div class="ai-empty" id="ai-empty">Reads this dashboard's queue and history so it doesn't repeat itself. It never posts \u2014 you queue or schedule each draft yourself.</div>
        <div class="drafts" id="drafts"></div>
      </div>

      <div class="card" id="nw-card">
        <div class="card-h"><span>News</span><span class="hint" id="nw-quota">freenewsapi.io</span></div>
        <div id="nw-setup" hidden>
          <div class="hint" style="margin-bottom:8px">Fresh articles for the copilot and autopilot to summarise. Needs a free key
            (5,000 requests a day) from <a href="https://freenewsapi.io/user/register.php" target="_blank" rel="noopener">freenewsapi.io</a>.</div>
          <div class="ai-row" style="margin-top:0"><input class="ai-sel" id="nw-key" type="password" placeholder="API key" style="flex:1;min-width:200px" autocomplete="off">
            <button class="btn primary" id="nw-key-save">Save key</button></div>
        </div>
        <div id="nw-main" hidden>
          <div class="ap-grid">
            <select class="ai-sel" id="nw-topic"><option value="">Any topic</option></select>
            <input class="ai-sel" id="nw-kw" placeholder="title keywords">
            <input class="ai-sel" id="nw-country" placeholder="country, e.g. us" maxlength="2">
            <button class="btn" id="nw-go"><i class="fa-solid fa-rotate"></i> Latest</button>
          </div>
          <div class="nw-list" id="nw-list"></div>
          <div class="hint" style="margin-top:8px"><span id="nw-sum-hint">Summarise writes drafts in the AI copilot above from the full article, with its link appended.</span>
            <a href="#" id="nw-key-change">Change key</a></div>
        </div>
      </div>

      <div class="card">
        <div class="card-h"><span id="compose-h">Compose</span><span id="gap-note"></span></div>
        <textarea id="compose" placeholder="What are you posting?"></textarea>
        <div class="counts" id="counts"></div>
        <div class="plats" id="plats"></div>
        <div class="drop" id="drop">
          <input type="file" id="f-file" multiple accept="image/*,video/*" style="display:none">
          <div class="drop-t"><i class="fa-solid fa-paperclip"></i> Drop photos or videos here</div>
          <div class="drop-s">or click to browse \u00b7 paste from clipboard \u00b7 jpg png gif webp mp4 mov webm</div>
        </div>
        <div class="thumbs" id="thumbs"></div>
        <div class="media-warn" id="media-warn"></div>
        <div class="row">
          <div style="flex:1"><div class="fl">Alt text (accessibility)</div>
            <input class="fi" id="f-alt" placeholder="describe the media" style="width:100%"></div>
        </div>
        <div class="row">
          <div><div class="fl">Schedule (blank = now)</div>
            <input class="fi" id="f-when" type="datetime-local"></div>
          <button class="btn primary" id="btn-queue" style="margin-left:auto">Queue post</button>
        </div>
      </div>

      <div class="card">
        <div class="card-h"><span id="queue-h">Queue &amp; history</span><span id="q-note"></span></div>
        <div id="queue"><div class="empty">Nothing queued yet.</div></div>
      </div>
    </div>

    <div>
      <div class="card">
        <div class="card-h"><span id="acc-h">Accounts</span></div>
        <div id="accounts"></div>
      </div>

      <div class="card">
        <div class="card-h"><span id="em-h">Emails</span><span class="hint">record only</span></div>
        <div class="hint" style="margin-bottom:10px">
          Which address each account is registered under. Stored for your reference only \u2014
          Open HL never uses these to log in or authenticate.
        </div>
        <div id="emails"></div>
      </div>
    </div>
  </div>

  <div class="card" style="margin-top:16px">
    <div class="card-h"><span>Browser agent \u00b7 shared by all dashboards</span><span id="agent-dot"></span></div>
    <div id="agent-body"><div class="hint">Checking\u2026</div></div>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
${TOAST_JS}
</script>
<script src="/ui/pages/social.js"></script>
</body></html>`;
}


// ─── REMINDERS PAGE ────────────────────────────────────────────────────────────
// Create/edit the schedule. The alarms themselves are not this page's job — they
// are handled by the global layer in navBar(), which is why they still fire when
// you are somewhere else entirely.

module.exports = { socialHtml };
