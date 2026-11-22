const { haloOn, scriptString, userName } = require("../profile");
const { BASE_CSS, FAVICON, FONT, NAV_CSS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");

// ─── HOME ────────────────────────────────────────────────────────────────────
// The first screen of the control room: what needs attention, what this machine
// is doing, what is coming up, and the last things touched. Everything on it is
// live data; navigation lives in the sidebar, not in tiles.
//
// Client JS below sits inside a template literal: no backticks, no dollar-brace,
// no backslashes.
function homeHtml() {
  const halo = haloOn();
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gridlantis-HL · Home</title>${FONT}${FAVICON}
<style>
${BASE_CSS}${NAV_CSS}${TOAST_CSS}
/* ── Home · glass dashboard ─────────────────────────────────────────────── */
.home{--card-r:22px;--glow:color-mix(in srgb,var(--accent) 22%,transparent);position:relative;}
.home>*{position:relative;z-index:1;}
.hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:20px 28px;align-items:end;margin:4px 0 26px;}
.hero-top{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
.crumbs{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:14px;flex-wrap:wrap;}
.crumbs i{font-size:13px;}
.crumbs .sep{opacity:.5;}
.crumbs .now{color:var(--text);display:inline-flex;align-items:center;gap:8px;}
.tools{display:flex;align-items:center;gap:10px;}
.rbtn{width:44px;height:44px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;
  background:var(--surface);border:1px solid var(--line);color:var(--text);text-decoration:none;font-size:16px;transition:border-color .15s,background .15s;}
.rbtn:hover{border-color:var(--line-strong);background:var(--raised);}
.rbtn.on{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 55%,var(--line));}
.search{position:relative;display:block;width:min(320px,100%);}
.search i{position:absolute;left:16px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:14px;pointer-events:none;}
.search .m-input{height:44px;border-radius:22px;padding-left:42px;padding-right:38px;background:var(--surface);}
.search .m-kbd{position:absolute;right:14px;top:50%;transform:translateY(-50%);}
.hero h1{font:600 clamp(34px,5vw,56px)/1.05 var(--font-display);letter-spacing:-.02em;
  background:linear-gradient(100deg,var(--accent),color-mix(in srgb,var(--accent) 45%,var(--text)) 55%,var(--text));
  -webkit-background-clip:text;background-clip:text;color:transparent;}
.hero-sub{color:var(--text-2);font-size:15.5px;margin-top:10px;display:flex;gap:14px;flex-wrap:wrap;}
.hero-sub span+span::before{content:'';display:inline-block;width:1px;height:13px;background:var(--line-strong);margin-right:14px;vertical-align:-1px;}
.pills{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px;}
.pill{display:inline-flex;align-items:center;gap:9px;height:42px;padding:0 18px;border-radius:21px;background:var(--surface);
  border:1px solid var(--line);color:var(--text);text-decoration:none;font-size:14px;white-space:nowrap;}
.pill:hover{border-color:var(--line-strong);}
.pill b{font-weight:600;}
.pill .m-dot{box-shadow:0 0 0 3px color-mix(in srgb,currentColor 0%,transparent);}
.pill.cta{background:color-mix(in srgb,var(--accent) 16%,var(--surface));border-color:color-mix(in srgb,var(--accent) 55%,var(--line));
  box-shadow:0 8px 28px var(--glow);color:var(--accent);font-weight:500;}
/* Halo: the 3D helper (src/ui/pages/halo.js) */
.home>.hero{z-index:3;}
.halo{position:relative;align-self:end;}
.halo-btn{display:block;width:150px;height:150px;padding:0;border:0;border-radius:50%;background:none;cursor:pointer;position:relative;}
.halo-btn:focus-visible{outline:2px solid var(--accent);outline-offset:4px;}
.halo-btn canvas{width:100%;height:100%;display:block;filter:drop-shadow(0 14px 28px var(--glow));opacity:0;transition:opacity .4s;}
.halo.ready .halo-btn canvas{opacity:1;}
.halo-btn .fallback{display:none;position:absolute;inset:0;align-items:center;justify-content:center;font-size:64px;color:var(--accent);}
.halo.no-gl .halo-btn canvas{display:none;} .halo.no-gl .halo-btn .fallback{display:flex;}
.halo-name{position:absolute;left:50%;bottom:-4px;transform:translateX(-50%);font:600 12px/1 var(--font-display);letter-spacing:.08em;
  text-transform:uppercase;color:var(--accent);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:4px 9px;pointer-events:none;}
.halo-panel{position:absolute;right:0;top:calc(100% + 12px);z-index:30;width:min(400px,calc(100vw - 32px));max-height:min(70vh,560px);overflow:auto;
  background:var(--surface);border:1px solid var(--line-strong);border-radius:18px;padding:18px;box-shadow:0 18px 50px rgba(0,0,0,.35);}
.halo-panel::before{content:'';position:absolute;top:-7px;right:66px;width:12px;height:12px;background:var(--surface);
  border-left:1px solid var(--line-strong);border-top:1px solid var(--line-strong);transform:rotate(45deg);}
.halo-say{display:block;font-size:15px;color:var(--text);margin:0 0 14px;line-height:1.45;}
.halo-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;}
.halo-pick{width:100%;height:42px;}
.halo-info:empty{display:none;}
.halo-info{margin-top:14px;font-size:14px;color:var(--text-2);}
.halo-about{margin:0 0 12px;line-height:1.5;}
.halo-h{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:8px;}
.halo-keys{list-style:none;margin:0 0 12px;padding:0;display:flex;flex-direction:column;gap:8px;}
.halo-keys li{display:flex;flex-direction:column;gap:3px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--raised);}
.halo-keys code{font:600 13px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--accent);overflow-wrap:anywhere;}
.halo-keys span{color:var(--text);line-height:1.4;}
.halo-keys small{color:var(--muted);font-size:12.5px;}
.halo-note{display:flex;gap:9px;align-items:baseline;margin:0 0 8px;line-height:1.45;}
.halo-note i{color:var(--accent);font-size:13px;flex:0 0 auto;}
.halo-go{display:inline-flex;align-items:center;gap:8px;margin-top:4px;color:var(--accent);text-decoration:none;font-weight:500;}
.halo-go:hover{text-decoration:underline;}

.dash{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,380px);gap:18px;align-items:start;}
.col{display:flex;flex-direction:column;gap:18px;min-width:0;}
.card{background:linear-gradient(180deg,color-mix(in srgb,var(--raised) 70%,var(--surface)),var(--surface));
  border:1px solid var(--line);border-radius:var(--card-r);min-width:0;overflow:hidden;}
.card-h{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 22px 14px;}
.card-t{font:600 21px/1.2 var(--font-display);color:var(--text);}
.card-t a{color:inherit;text-decoration:none;} .card-t a:hover{color:var(--accent);}
.card-s{color:var(--muted);font-size:13px;margin-top:3px;}
.card .m-item{padding:11px 22px;}
.card .m-empty{padding:20px 22px;}
.two{display:grid;grid-template-columns:1fr 1fr;gap:18px;}

/* Coming up: task cards */
.tasks{display:flex;flex-direction:column;}
.task{display:block;padding:18px 22px;border-top:1px solid var(--line);color:var(--text);text-decoration:none;position:relative;}
.task:hover{background:color-mix(in srgb,var(--raised) 60%,transparent);}
.task-day{display:flex;align-items:center;gap:8px;color:var(--accent);font-size:13.5px;}
.task-day i{font-size:14px;}
.task-row{display:flex;align-items:flex-start;gap:16px;margin-top:6px;}
.task-mark{width:58px;height:58px;border-radius:16px;flex:0 0 auto;display:none;align-items:center;justify-content:center;font-size:24px;
  color:#fff;background:linear-gradient(140deg,color-mix(in srgb,var(--accent) 85%,#fff),color-mix(in srgb,var(--accent) 70%,#000));
  box-shadow:0 10px 26px var(--glow);}
.task-t{font:600 18px/1.3 var(--font-display);}
.task-d{color:var(--muted);font-size:14px;margin-top:3px;}
.task-d b{color:var(--text-2);font-weight:500;}
.task-f{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;}
.task-time{display:inline-flex;align-items:center;gap:8px;color:var(--accent);font-size:14px;}
.task-time i{color:var(--text);}
.task-rel{height:30px;padding:0 12px;border-radius:15px;display:inline-flex;align-items:center;font-size:13px;color:var(--text-2);
  background:var(--raised);border:1px solid var(--line);}
.task.hot{background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 16%,var(--surface)),color-mix(in srgb,var(--accent) 6%,var(--surface)) 60%,color-mix(in srgb,var(--accent) 24%,var(--surface)));
  box-shadow:inset 0 -40px 60px -30px color-mix(in srgb,var(--accent) 45%,transparent);}
.task.hot .task-mark{display:flex;}
.task.hot .task-t{font-size:20px;}
.task.hot .task-rel{background:color-mix(in srgb,var(--accent) 22%,transparent);border-color:color-mix(in srgb,var(--accent) 45%,transparent);color:var(--text);}

/* Needs attention: the glowing note card */
.note-card{background:linear-gradient(170deg,color-mix(in srgb,var(--accent) 34%,var(--surface)) 0%,color-mix(in srgb,var(--accent) 12%,var(--surface)) 38%,var(--surface) 75%);
  border-color:color-mix(in srgb,var(--accent) 30%,var(--line));}
.note-card .m-item{border-top-color:color-mix(in srgb,var(--line) 70%,transparent);}
.note-card .m-item-t{font-weight:500;}
.attn .m-item{align-items:flex-start;}
.attn .m-dot{margin-top:6px;}
.attn-all{display:flex;align-items:flex-start;gap:12px;padding:4px 22px 22px;color:var(--text-2);}
.attn-all .bar{width:3px;align-self:stretch;border-radius:2px;background:var(--accent);flex:0 0 auto;}
.round-ic{width:40px;height:40px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--bg);
  border:1px solid var(--line);color:var(--text);text-decoration:none;flex:0 0 auto;}
.round-ic:hover{border-color:var(--line-strong);}

/* This machine */
.machine-top{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:0 22px 16px;}
.machine-name{font:600 15px var(--font-display);color:var(--text-2);}
.machine-up{color:var(--muted);font-size:13px;}
.meters{display:grid;gap:16px;padding:0 22px 20px;}
.meters .m-meter-t{height:14px;border-radius:8px;background:var(--bg);border:1px solid var(--line);}
.meters .m-meter-t i{--mc:var(--accent);border-radius:7px;
  background:repeating-linear-gradient(-55deg,var(--mc) 0 5px,color-mix(in srgb,var(--mc) 55%,transparent) 5px 10px);
  box-shadow:0 0 14px color-mix(in srgb,var(--mc) 45%,transparent);}
.meters .m-meter-t i.warn{--mc:var(--warn);} .meters .m-meter-t i.fault{--mc:var(--fault);}
.machine-foot{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 16px 16px;}
.machine-foot a{padding:12px 14px;color:var(--text);text-decoration:none;border-radius:14px;background:var(--bg);border:1px solid var(--line);}
.machine-foot a:hover{border-color:var(--line-strong);}
.machine-foot .k{display:block;color:var(--muted);font-size:12.5px;}
.machine-foot .v{font:600 20px var(--font-display);}

.when{min-width:74px;text-align:right;color:var(--muted);font-size:13px;}
.unread{font-weight:600;}

/* To do */
.todo-add{display:flex;gap:8px;padding:0 16px 12px;}
.todo-add .m-input{height:40px;border-radius:20px;padding:0 16px;}
.todo-add .m-btn{width:40px;height:40px;border-radius:50%;padding:0;}
.todo-scroll{max-height:420px;overflow-y:auto;}
.card .todo-item{gap:6px;padding:4px 12px;align-items:flex-start;}
.td-check,.td-rm{width:30px;height:30px;flex-shrink:0;border:0;background:none;border-radius:50%;cursor:pointer;color:var(--muted);}
.td-check{font-size:17px;}
.td-check:hover{color:var(--ok);background:var(--raised);}
.td-check:focus-visible,.td-rm:focus-visible{outline:2px solid var(--accent);outline-offset:-2px;}
.td-text{flex:1;min-width:0;padding:5px 0;overflow-wrap:anywhere;cursor:text;}
.td-edit{flex:1;min-width:0;height:30px;}
.td-rm{font-size:13px;visibility:hidden;}
.todo-item:hover .td-rm,.td-rm:focus-visible{visibility:visible;}
.td-rm:hover{color:var(--fault);background:var(--raised);}
@media(hover:none){.td-rm{visibility:visible;}}
.todo-item.done .td-check{color:var(--ok);}
.todo-item.done .td-text{color:var(--muted);text-decoration:line-through;}
.todo-foot{display:flex;justify-content:space-between;gap:8px;padding:8px 12px;border-top:1px solid var(--line);}
.todo-foot[hidden]{display:none;}

/* Quick links: round app icons */
.links{display:flex;flex-wrap:wrap;gap:12px;padding:0 22px 22px;}
.link-chip{display:inline-flex;align-items:center;gap:10px;height:46px;padding:0 8px 0 5px;border-radius:23px;
  background:var(--bg);border:1px solid var(--line);color:var(--text);text-decoration:none;font-size:14px;position:relative;}
.link-chip:hover{border-color:var(--line-strong);}
.link-chip .ic{width:36px;height:36px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;
  font:600 12px var(--font-display);color:#fff;}
.link-chip .rm{width:26px;height:26px;border:0;background:none;color:var(--muted);border-radius:50%;font-size:12px;visibility:hidden;}
.link-chip:hover .rm,.link-chip:focus-within .rm{visibility:visible;}
.link-chip .rm:hover{color:var(--fault);background:var(--surface);}
.link-add{border-style:dashed;color:var(--text-2);padding:0 18px;background:transparent;}
.row2{display:grid;grid-template-columns:2fr 1fr;gap:12px;}
.prev-row{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:13px;}

@media(max-width:1180px){.dash{grid-template-columns:1fr;} .dash>.col:last-child{order:-1;}}
@media(max-width:760px){
  .hero{grid-template-columns:minmax(0,1fr) auto;} .halo{grid-row:2;grid-column:2;align-self:start;}
  .halo-btn{width:92px;height:92px;} .halo-name{font-size:10px;padding:3px 7px;} .halo-panel::before{right:38px;}
  .tools{width:100%;} .search{flex:1;width:auto;}
  .two{grid-template-columns:1fr;}
  .card-h{padding:16px 16px 12px;} .task,.card .m-item{padding-left:16px;padding-right:16px;}
  .task.hot .task-mark{display:none;}
}
</style></head><body>
${navBar("/")}
<main class="m-page home">
  <header class="hero">
    <div class="hero-top">
      <nav class="crumbs" aria-label="Where you are"><span><i class="fa-solid fa-house"></i> Gridlantis-HL</span><span class="sep">/</span>
        <span class="now"><i class="fa-regular fa-calendar"></i><span id="crumb-date"></span></span></nav>
      <div class="tools">
        <label class="search" for="home-search"><i class="fa-solid fa-magnifying-glass"></i>
          <input class="m-input" id="home-search" placeholder="Go to a page or open a URL" autocomplete="off" aria-label="Go to a page or open a URL">
          <span class="m-kbd" aria-hidden="true">/</span></label>
        <a class="rbtn" href="/calendar" title="Calendar" aria-label="Calendar"><i class="fa-regular fa-calendar"></i></a>
        <button class="rbtn" type="button" id="voice-toggle" onclick="toggleVoice()" title="Spoken alerts are off" aria-label="Spoken alerts"><i class="fa-solid fa-volume-xmark"></i></button>
      </div>
    </div>
    <div>
      <h1 id="greeting">Good day</h1>
      <div class="hero-sub"><span id="today"></span><span id="weather" hidden></span></div>
      <div class="pills">
        <a class="pill" href="/monitoring"><span class="m-dot ok" id="pill-attn-dot"></span><span id="pill-attn">All clear</span></a>
        <a class="pill" href="/reminders"><i class="fa-regular fa-bell"></i><span id="pill-up">No reminders</span></a>
        <a class="pill" href="#todo-t"><i class="fa-regular fa-circle-check"></i><span id="pill-todo">Nothing to do</span></a>
        <a class="pill cta" id="pill-new" href="/reminders"><i class="fa-solid fa-plus"></i>New reminder</a>
      </div>
    </div>
${halo ? `    <div class="halo" id="halo">
      <button class="halo-btn" type="button" id="halo-btn" aria-haspopup="dialog" aria-expanded="false" aria-controls="halo-panel" aria-label="Halo, your helper" title="Halo, your helper">
        <canvas id="halo-canvas" aria-hidden="true"></canvas><span class="fallback" aria-hidden="true"><i class="fa-solid fa-robot"></i></span>
        <span class="halo-name" aria-hidden="true">Halo</span></button>
      <div class="halo-panel" id="halo-panel" role="dialog" hidden></div>
    </div>
` : ""}  </header>

  <div class="dash">
    <div class="col">
      <section class="card" aria-labelledby="up-t">
        <div class="card-h"><div><h2 class="card-t" id="up-t"><a href="/reminders">Coming up</a></h2><div class="card-s" id="up-meta"></div></div>
          <a class="round-ic" href="/reminders" title="All reminders" aria-label="All reminders"><i class="fa-solid fa-ellipsis"></i></a></div>
        <div class="tasks" id="up-list"></div>
      </section>
      <div class="two">
        <section class="card" aria-labelledby="notes-t">
          <div class="card-h"><h2 class="card-t" id="notes-t"><a href="/notes">Recent notes</a></h2>
            <a class="round-ic" href="/notes" title="Open notes" aria-label="Open notes"><i class="fa-solid fa-arrow-right"></i></a></div>
          <div id="notes-list"></div>
        </section>
        <section class="card" aria-labelledby="mail-t">
          <div class="card-h"><h2 class="card-t" id="mail-t"><a href="/mail">Important mail</a></h2>
            <a class="round-ic" href="/mail" title="Open mail" aria-label="Open mail"><i class="fa-solid fa-arrow-right"></i></a></div>
          <div id="mail-list"></div>
        </section>
      </div>
      <section class="card" aria-labelledby="links-t">
        <div class="card-h"><div><h2 class="card-t" id="links-t">Quick links</h2><div class="card-s">Sites and pages you open often</div></div></div>
        <div class="links" id="ql-rail"></div>
      </section>
    </div>

    <div class="col">
      <section class="card note-card attn" aria-labelledby="attn-t">
        <div class="card-h"><div><h2 class="card-t" id="attn-t">Needs attention</h2><div class="card-s" id="attn-meta"></div></div>
          <a class="round-ic" href="/monitoring" title="Monitoring" aria-label="Monitoring"><i class="fa-solid fa-heart-pulse"></i></a></div>
        <div id="attn-list"><div class="m-empty">Checking&hellip;</div></div>
      </section>

      <section class="card" aria-labelledby="machine-t">
        <div class="card-h"><div><h2 class="card-t" id="machine-t"><a href="/monitoring">This machine</a></h2><div class="card-s" id="machine-os"></div></div>
          <a class="round-ic" href="/monitoring" title="Open monitoring" aria-label="Open monitoring"><i class="fa-solid fa-arrow-up-right-from-square"></i></a></div>
        <div class="machine-top"><span class="machine-name" id="machine-name">&ndash;</span><span class="machine-up" id="machine-up"></span></div>
        <div class="meters">
          <div class="m-meter"><span class="m-meter-l">CPU</span><span class="m-meter-v" id="m-cpu">&ndash;</span><span class="m-meter-t"><i id="b-cpu" style="width:0"></i></span></div>
          <div class="m-meter"><span class="m-meter-l">Memory</span><span class="m-meter-v" id="m-mem">&ndash;</span><span class="m-meter-t"><i id="b-mem" style="width:0"></i></span></div>
          <div class="m-meter"><span class="m-meter-l">Disk</span><span class="m-meter-v" id="m-disk">&ndash;</span><span class="m-meter-t"><i id="b-disk" style="width:0"></i></span></div>
        </div>
        <div class="machine-foot">
          <a href="/monitoring"><span class="k">Nodes online</span><span class="v" id="f-nodes">&ndash;</span></a>
          <a href="/vmlab"><span class="k">VMs running</span><span class="v" id="f-vms">&ndash;</span></a>
        </div>
      </section>

      <section class="card" aria-labelledby="todo-t">
        <div class="card-h"><div><h2 class="card-t" id="todo-t">To do</h2><div class="card-s" id="todo-meta"></div></div></div>
        <form class="todo-add" id="todo-form" autocomplete="off">
          <input class="m-input" id="todo-input" placeholder="Add a task" maxlength="300" aria-label="New task">
          <button class="m-btn primary icon" type="submit" title="Add task" aria-label="Add task"><i class="fa-solid fa-plus"></i></button>
        </form>
        <div class="todo-scroll" id="todo-list"></div>
        <div class="todo-foot" id="todo-foot" hidden>
          <button class="m-btn ghost" type="button" id="todo-showdone"></button>
          <button class="m-btn ghost" type="button" id="todo-clear">Clear done</button>
        </div>
      </section>
    </div>
  </div>
</main>


<div class="m-modal" id="ql-modal">
  <div class="m-modal-box" role="dialog" aria-modal="true" aria-labelledby="ql-title">
    <div class="m-modal-h"><span id="ql-title">Add quick link</span><button class="m-btn ghost icon" type="button" id="ql-x" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="m-modal-b">
      <div><label class="m-label" for="ql-url">Address</label><input class="m-input" id="ql-url" placeholder="example.com or /homeos"></div>
      <div class="row2">
        <div><label class="m-label" for="ql-label">Name</label><input class="m-input" id="ql-label" placeholder="Taken from the address"></div>
        <div><label class="m-label" for="ql-icon">Initials</label><input class="m-input" id="ql-icon" placeholder="AB" maxlength="4"></div>
      </div>
      <div class="prev-row">Preview <span class="link-chip"><span class="ic" id="ql-prev-dot" style="background:#555">?</span><span id="ql-prev-name">Link</span></span></div>
    </div>
    <div class="m-modal-f"><button class="m-btn" type="button" id="ql-cancel">Cancel</button><button class="m-btn primary" type="button" id="ql-save">Add link</button></div>
  </div>
</div>
<div class="toast" id="toast"></div>

<script>
${TOAST_JS}
function el(tag, cls, text){ var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; }
function emptyRow(text){ return el('div', 'm-empty', text); }

var USER_NAME = ${scriptString(userName())};
// ═══ GREETING · DATE · WEATHER ═══════════════════════════════════════════════
(function(){
  function tick(){
    var d = new Date(), h = d.getHours();
    var g = (h < 5) ? 'Good night' : (h < 12) ? 'Good morning' : (h < 18) ? 'Good afternoon' : (h < 22) ? 'Good evening' : 'Good night';
    document.getElementById('greeting').textContent = USER_NAME ? g + ', ' + USER_NAME : g;
    document.getElementById('today').textContent = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    document.getElementById('crumb-date').textContent = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    document.getElementById('pill-new').href = '/reminders?at=' + (Math.ceil((Date.now() + 15 * 60000) / 300000) * 300000);
  }
  tick(); setInterval(tick, 60000);
  function loadWeather(){
    fetch('/api/weather').then(function(r){ return r.json(); }).then(function(d){
      if (!d || d.error || d.temperature === undefined) return;
      var w = document.getElementById('weather');
      w.textContent = d.temperature + '°' + (d.temperatureUnit || '') + (d.shortForecast ? ', ' + d.shortForecast.toLowerCase() : '');
      w.hidden = false;
    }).catch(function(){});
  }
  loadWeather(); setInterval(loadWeather, 600000);
})();

// ═══ LIVE PANELS ═════════════════════════════════════════════════════════════
(function(){
  function fmtUp(sec){
    sec = Math.floor(sec || 0);
    var d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
    return 'up ' + (d ? d + 'd ' + h + 'h' : h ? h + 'h ' + m + 'm' : m + 'm');
  }
  function meter(id, pct, warn, fault){
    pct = Math.max(0, Math.min(100, Math.round(pct || 0)));
    document.getElementById('m-' + id).textContent = pct + '%';
    var b = document.getElementById('b-' + id);
    b.style.width = pct + '%';
    b.className = pct >= fault ? 'fault' : pct >= warn ? 'warn' : '';
  }
  function attnItem(state, title, sub, href){
    var a = el(href ? 'a' : 'div', 'm-item');
    if (href) a.href = href;
    a.appendChild(el('span', 'm-dot ' + state));
    var main = el('span', 'm-item-main');
    main.appendChild(el('span', 'm-item-t', title));
    if (sub) main.appendChild(el('span', 'm-item-s', sub));
    a.appendChild(main);
    return a;
  }

  function render(d){
    // This machine
    document.getElementById('machine-name').textContent = d.host.name;
    document.getElementById('machine-up').textContent = fmtUp(d.host.uptime);
    meter('cpu', d.host.cpu, 75, 92); meter('mem', d.host.mem, 80, 93); meter('disk', d.host.disk, 80, 92);
    document.getElementById('f-nodes').textContent = d.nodes.total ? d.nodes.online + ' of ' + d.nodes.total : 'none added';
    document.getElementById('f-vms').textContent = d.vms.running + ' of ' + d.vms.total;

    // Needs attention
    var items = [];
    (d.nodes.offline || []).forEach(function(n){ items.push(attnItem('fault', n + ' is offline', 'Not answering its health check', '/monitoring')); });
    if (d.host.disk >= 85) items.push(attnItem(d.host.disk >= 92 ? 'fault' : 'warn', 'Disk is ' + Math.round(d.host.disk) + '% full', 'Free space on ' + d.host.name, '/monitoring'));
    if (d.host.mem >= 85) items.push(attnItem('warn', 'Memory is ' + Math.round(d.host.mem) + '% used', 'Running VMs and services are competing for RAM', '/vmlab#host'));
    if (d.mail.unopened) items.push(attnItem('info', d.mail.unopened + ' important ' + (d.mail.unopened === 1 ? 'email' : 'emails') + ' unread', 'From senders you marked important', '/mail'));
    if (d.bank && d.bank.staleDays >= 30) items.push(attnItem('warn', 'Bank balance is ' + d.bank.staleDays + ' days old', 'Update it so Finance totals stay accurate', '/finance'));
    var soon = (d.reminders || []).filter(function(r){ return r.at - Date.now() < 3600000; });
    soon.forEach(function(r){ items.push(attnItem('info', r.title, 'Reminder ' + timeAgo(r.at), '/reminders')); });
    var list = document.getElementById('attn-list'); list.textContent = '';
    if (!items.length){
      var ok = el('div', 'attn-all'); ok.appendChild(el('span', 'bar')); ok.appendChild(el('span', null, 'Nothing needs you right now. All systems are up.'));
      list.appendChild(ok);
    } else items.forEach(function(i){ list.appendChild(i); });
    document.getElementById('attn-meta').textContent = items.length ? items.length + (items.length === 1 ? ' item' : ' items') : 'All clear';
    var worst = items.some(function(i){ return i.querySelector('.m-dot.fault'); }) ? 'fault' : items.some(function(i){ return i.querySelector('.m-dot.warn'); }) ? 'warn' : items.length ? 'info' : 'ok';
    document.getElementById('pill-attn-dot').className = 'm-dot ' + worst;
    document.getElementById('pill-attn').textContent = items.length ? items.length + ' need' + (items.length === 1 ? 's' : '') + ' attention' : 'All clear';

    // Coming up: one card per reminder, the next one highlighted
    var up = document.getElementById('up-list'); up.textContent = '';
    var rs = d.reminders || [];
    document.getElementById('up-meta').textContent = rs.length ? rs.length + ' scheduled' : '';
    document.getElementById('pill-up').textContent = rs.length ? rs.length + (rs.length === 1 ? ' reminder' : ' reminders') : 'No reminders';
    if (!rs.length) up.appendChild(emptyRow('No reminders scheduled.'));
    rs.forEach(function(r, i){
      var at = new Date(r.at), now = new Date();
      var tmr = new Date(now); tmr.setDate(tmr.getDate() + 1);
      var day = at.toDateString() === now.toDateString() ? 'Today' : at.toDateString() === tmr.toDateString() ? 'Tomorrow'
        : at.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
      var a = el('a', 'task' + (i === 0 ? ' hot' : '')); a.href = '/reminders?edit=' + encodeURIComponent(r.id || '');
      var dl = el('div', 'task-day'); dl.appendChild(el('i', 'fa-regular fa-circle')); dl.appendChild(el('span', null, day)); a.appendChild(dl);
      var row = el('div', 'task-row');
      var mk = el('span', 'task-mark'); mk.appendChild(el('i', 'fa-regular fa-bell')); row.appendChild(mk);
      var body = el('div'); body.appendChild(el('div', 'task-t', r.title));
      var rep = r.repeat && r.repeat !== 'none' ? 'Repeats ' + r.repeat : 'One-off reminder';
      var ds = el('div', 'task-d'); ds.appendChild(el('b', null, 'Reminder: ')); ds.appendChild(document.createTextNode(r.note || rep)); body.appendChild(ds);
      row.appendChild(body); a.appendChild(row);
      var f = el('div', 'task-f');
      var tm = el('span', 'task-time'); tm.appendChild(el('i', 'fa-regular fa-clock'));
      tm.appendChild(el('span', null, at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })));
      f.appendChild(tm); f.appendChild(el('span', 'task-rel', timeAgo(r.at))); a.appendChild(f);
      up.appendChild(a);
    });

    // Recent notes
    var nl = document.getElementById('notes-list'); nl.textContent = '';
    if (!(d.notes || []).length) nl.appendChild(emptyRow('No notes yet.'));
    (d.notes || []).forEach(function(n){
      var a = el('a', 'm-item'); a.href = '/notes';
      var main = el('span', 'm-item-main'); main.appendChild(el('span', 'm-item-t', n.title));
      main.appendChild(el('span', 'm-item-s', n.folder || 'No folder'));
      a.appendChild(main); a.appendChild(el('span', 'm-item-end when', timeAgo(Date.parse(n.updated))));
      nl.appendChild(a);
    });

    // Important mail
    var ml = document.getElementById('mail-list'); ml.textContent = '';
    if (!(d.mailRecent || []).length) ml.appendChild(emptyRow('No important mail.'));
    (d.mailRecent || []).forEach(function(m){
      var a = el('a', 'm-item'); a.href = '/mail';
      a.appendChild(el('span', 'm-dot ' + (m.opened ? '' : 'info')));
      var main = el('span', 'm-item-main'); main.appendChild(el('span', 'm-item-t' + (m.opened ? '' : ' unread'), m.subject));
      main.appendChild(el('span', 'm-item-s', m.from));
      a.appendChild(main);
      if (m.date) a.appendChild(el('span', 'm-item-end when', timeAgo(Date.parse(m.date))));
      ml.appendChild(a);
    });
  }
  function load(){ fetch('/api/home').then(function(r){ return r.json(); }).then(render).catch(function(){}); }
  load(); setInterval(function(){ if (!document.hidden) load(); }, 30000);
  window.addEventListener('openhl:pulse', function(e){
    var p = e.detail; if (!p) return;
    meter('cpu', p.host.cpu, 75, 92); meter('mem', p.host.mem, 80, 93);
  });
  window.__homeReload = load;
})();

// ═══ SPOKEN NODE ALERTS ══════════════════════════════════════════════════════
(function(){
  var voiceOn = false;
  try { voiceOn = localStorage.getItem('openhl-voice') === '1'; } catch(e){}
  var prefVoice = null;
  function pickVoice(){
    try {
      var vs = window.speechSynthesis.getVoices();
      for (var i=0;i<vs.length;i++){ var n = vs[i].name + ' ' + vs[i].lang; if (/Daniel|Google UK English Male|Arthur|Oliver|male/i.test(n)) { prefVoice = vs[i]; return; } }
      for (var j=0;j<vs.length;j++){ if (/^en/i.test(vs[j].lang)) { prefVoice = vs[j]; return; } }
    } catch(e){}
  }
  if ('speechSynthesis' in window){ pickVoice(); window.speechSynthesis.onvoiceschanged = pickVoice; }
  var ttsAudio = null;
  function speakFallback(text){
    if (!('speechSynthesis' in window)) return;
    try { var u = new SpeechSynthesisUtterance(text); u.rate = 0.98; u.pitch = 0.85; if (prefVoice) u.voice = prefVoice; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); } catch(e){}
  }
  function speak(text){
    if (!voiceOn) return;
    try {
      if (ttsAudio) { try { ttsAudio.pause(); } catch(e){} ttsAudio = null; }
      var a = new Audio('/api/tts?text=' + encodeURIComponent(text));
      ttsAudio = a;
      a.onerror = function(){ speakFallback(text); };
      var pr = a.play();
      if (pr && pr.catch) pr.catch(function(){ speakFallback(text); });
    } catch(e){ speakFallback(text); }
  }
  function paintVoice(){
    var b = document.getElementById('voice-toggle'); if (!b) return;
    b.classList.toggle('on', voiceOn);
    b.title = voiceOn ? 'Spoken alerts are on' : 'Spoken alerts are off';
    b.firstChild.className = voiceOn ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
  }
  window.toggleVoice = function(){
    voiceOn = !voiceOn;
    try { localStorage.setItem('openhl-voice', voiceOn ? '1' : '0'); } catch(e){}
    paintVoice();
    showToast(voiceOn ? 'Spoken alerts on' : 'Spoken alerts off', 'ok');
    if (voiceOn) { speak('Spoken alerts on. Watching nodes and AI.'); try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch(e){} }
  };
  paintVoice();
  function notify(title, body){ try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body: body }); } catch(e){} }
  function announce(name, online){
    if (online){ showToast(name + ' is back online', 'ok'); speak(name + ' is back online.'); notify('Gridlantis-HL: node recovered', name + ' is back online'); }
    else { showToast(name + ' is offline', 'bad'); speak('Alert. ' + name + ' is offline.'); notify('Gridlantis-HL: node offline', name + ' is offline'); }
    if (window.__homeReload) window.__homeReload();
  }
  if ('EventSource' in window) {
    try {
      var es = openhlEvents();
      es.addEventListener('node_status', function(e){ try { var d = JSON.parse(e.data); announce(d.name, d.online); } catch(err){} });
      es.addEventListener('todo_changed', function(){ if (window.__todoLoad) window.__todoLoad(); });
    } catch(e){}
  }
})();

// ═══ TO DO ═══════════════════════════════════════════════════════════════════
// Open tasks in the order they were added, then (when shown) the ticked-off ones,
// most recent first. Other pages' changes arrive as todo_changed; while a task is
// being edited they wait, so the refresh cannot wipe what is being typed.
(function(){
  var TD = [], showDone = false, editing = null;
  try { showDone = localStorage.getItem('openhl-todo-done') === '1'; } catch(e){}
  var list = document.getElementById('todo-list'), input = document.getElementById('todo-input');

  function api(method, path, body){
    var opt = { method: method };
    if (body) { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(body); }
    return fetch('/api/todo' + path, opt).then(function(r){
      return r.json().then(function(d){ if (!r.ok || d.error) throw new Error(d.error || 'Could not save that'); return d; });
    });
  }
  function apply(d){ TD = d.items || []; render(); }
  function fail(e){ showToast(e.message || 'Could not save that', 'bad'); load(); }
  function load(){ api('GET', '').then(apply).catch(function(){}); }

  function startEdit(t, tx){
    if (editing) return;
    editing = t.id;
    var box = el('input', 'm-input td-edit'); box.value = t.text; box.maxLength = 300;
    box.setAttribute('aria-label', 'Edit task');
    var done = false;
    function finish(save){
      if (done) return; done = true; editing = null;
      var text = box.value.trim();
      if (save && text && text !== t.text) { t.text = text; render(); api('PUT', '/' + t.id, { text: text }).then(apply).catch(fail); }
      else render();
    }
    box.addEventListener('keydown', function(e){
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    box.addEventListener('blur', function(){ finish(true); });
    tx.replaceWith(box);
    box.focus(); box.select();
  }

  function row(t){
    var r = el('div', 'm-item todo-item' + (t.done ? ' done' : ''));
    var c = el('button', 'td-check'); c.type = 'button';
    c.setAttribute('role', 'checkbox'); c.setAttribute('aria-checked', t.done ? 'true' : 'false');
    c.setAttribute('aria-label', t.text); c.title = t.done ? 'Mark as not done' : 'Mark as done';
    c.appendChild(el('i', t.done ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'));
    c.addEventListener('click', function(){
      t.done = !t.done; t.doneAt = t.done ? Date.now() : null; render();
      api('PUT', '/' + t.id, { done: t.done }).then(apply).catch(fail);
    });
    var tx = el('span', 'td-text', t.text); tx.title = 'Click to edit';
    tx.addEventListener('click', function(){ startEdit(t, tx); });
    var x = el('button', 'td-rm'); x.type = 'button'; x.title = 'Delete task'; x.setAttribute('aria-label', 'Delete ' + t.text);
    x.appendChild(el('i', 'fa-solid fa-xmark'));
    x.addEventListener('click', function(){
      TD = TD.filter(function(o){ return o.id !== t.id; }); render();
      api('DELETE', '/' + t.id).then(apply).catch(fail);
    });
    r.appendChild(c); r.appendChild(tx); r.appendChild(x);
    return r;
  }

  function render(){
    if (editing) return;
    var open = TD.filter(function(t){ return !t.done; });
    var done = TD.filter(function(t){ return t.done; }).sort(function(a, b){ return (b.doneAt || 0) - (a.doneAt || 0); });
    list.textContent = '';
    if (!open.length) list.appendChild(emptyRow(done.length ? 'All done.' : 'Nothing to do yet.'));
    open.forEach(function(t){ list.appendChild(row(t)); });
    if (showDone) done.forEach(function(t){ list.appendChild(row(t)); });
    document.getElementById('todo-meta').textContent = open.length ? open.length + ' to do' : (done.length ? 'All done' : '');
    document.getElementById('pill-todo').textContent = open.length ? open.length + ' to do' : 'Nothing to do';
    document.getElementById('todo-foot').hidden = !done.length;
    document.getElementById('todo-showdone').textContent = showDone ? 'Hide done' : 'Show ' + done.length + ' done';
  }

  document.getElementById('todo-form').addEventListener('submit', function(e){
    e.preventDefault();
    var text = input.value.trim();
    if (!text) { input.focus(); return; }
    input.value = '';
    api('POST', '', { text: text }).then(apply).catch(function(err){ input.value = text; fail(err); });
  });
  document.getElementById('todo-showdone').addEventListener('click', function(){
    showDone = !showDone;
    try { localStorage.setItem('openhl-todo-done', showDone ? '1' : '0'); } catch(e){}
    render();
  });
  document.getElementById('todo-clear').addEventListener('click', function(){
    var n = TD.filter(function(t){ return t.done; }).length;
    if (!n || !confirm('Remove ' + n + (n === 1 ? ' done task?' : ' done tasks?'))) return;
    api('POST', '/clear-done').then(function(d){ apply(d); showToast('Cleared ' + n + ' done', 'ok'); }).catch(fail);
  });
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) load(); });
  window.__todoLoad = load;
  load();
})();

// ═══ QUICK LINKS ═════════════════════════════════════════════════════════════
var QL = [];
function qlRender(){
  var rail = document.getElementById('ql-rail');
  rail.textContent = '';
  QL.forEach(function(l){
    var chip = el('span', 'link-chip');
    var a = el('a'); a.href = l.url; a.title = l.url;
    a.style.cssText = 'display:inline-flex;align-items:center;gap:8px;color:inherit;text-decoration:none;';
    if (l.url.charAt(0) !== '/'){ a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    var ic = el('span', 'ic', l.icon); ic.style.background = l.color;
    a.appendChild(ic); a.appendChild(el('span', null, l.label));
    var x = el('button', 'rm'); x.type = 'button'; x.title = 'Remove ' + l.label; x.setAttribute('aria-label', 'Remove ' + l.label);
    x.appendChild(el('i', 'fa-solid fa-xmark'));
    x.addEventListener('click', function(ev){
      ev.preventDefault();
      if (!confirm('Remove the ' + l.label + ' link?')) return;
      fetch('/api/quicklinks/' + l.id, { method:'DELETE' }).then(function(){ showToast('Removed ' + l.label, 'ok'); qlLoad(); });
    });
    chip.appendChild(a); chip.appendChild(x);
    rail.appendChild(chip);
  });
  var add = el('button', 'link-chip link-add'); add.type = 'button';
  add.appendChild(el('i', 'fa-solid fa-plus')); add.appendChild(el('span', null, 'Add link'));
  add.addEventListener('click', qlOpen);
  rail.appendChild(add);
}
function qlLoad(){
  fetch('/api/quicklinks').then(function(r){ return r.json(); }).then(function(d){ QL = d.links || []; qlRender(); })
    .catch(function(){ QL = []; qlRender(); });
}
function qlGuess(){
  var label = document.getElementById('ql-label').value.trim();
  var url = document.getElementById('ql-url').value.trim();
  if (label || !url) return label;
  try { return url.charAt(0) === '/' ? url.slice(1) : new URL(/^https?:/i.test(url) ? url : 'https://' + url).hostname.replace('www.',''); }
  catch(e){ return url; }
}
function qlPreview(){
  var guess = qlGuess();
  var icon = document.getElementById('ql-icon').value.trim();
  var dot = document.getElementById('ql-prev-dot');
  dot.textContent = icon || (guess || '?').replace(/[^A-Za-z0-9]/g,'').slice(0,2).toUpperCase() || '?';
  dot.style.background = qlColor(guess || '?');
  document.getElementById('ql-prev-name').textContent = guess || 'Link';
}
// Mirrors the server's colour function so the preview matches what gets saved.
function qlColor(seed){
  var hsh = 0, str = String(seed || '?');
  for (var i = 0; i < str.length; i++) hsh = (hsh * 31 + str.charCodeAt(i)) >>> 0;
  var hue = hsh % 360, sat = 0.62, li = 0.48;
  function f(n){
    var k = (n + hue / 30) % 12, a = sat * Math.min(li, 1 - li);
    return Math.round(255 * (li - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))));
  }
  return 'rgb(' + f(0) + ',' + f(8) + ',' + f(4) + ')';
}
function qlOpen(){
  ['ql-url','ql-label','ql-icon'].forEach(function(i){ document.getElementById(i).value = ''; });
  qlPreview();
  document.getElementById('ql-modal').classList.add('on');
  setTimeout(function(){ document.getElementById('ql-url').focus(); }, 40);
}
function qlClose(){ document.getElementById('ql-modal').classList.remove('on'); }
function qlSave(){
  var url = document.getElementById('ql-url').value.trim();
  if (!url){ showToast('Enter an address for the link', 'bad'); return; }
  var body = { url: url, label: document.getElementById('ql-label').value.trim(), icon: document.getElementById('ql-icon').value.trim() };
  fetch('/api/quicklinks', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    .then(function(x){ return x.json(); })
    .then(function(r){ if (r.error) throw new Error(r.error); qlClose(); showToast('Added ' + r.label, 'ok'); qlLoad(); })
    .catch(function(e){ showToast(e.message, 'bad'); });
}
(function(){
  document.getElementById('ql-cancel').addEventListener('click', qlClose);
  document.getElementById('ql-x').addEventListener('click', qlClose);
  document.getElementById('ql-save').addEventListener('click', qlSave);
  document.getElementById('ql-modal').addEventListener('click', function(e){ if (e.target === document.getElementById('ql-modal')) qlClose(); });
  ['ql-url','ql-label','ql-icon'].forEach(function(i){
    document.getElementById(i).addEventListener('input', qlPreview);
    document.getElementById(i).addEventListener('keydown', function(e){ if (e.key === 'Enter') qlSave(); });
  });
  qlLoad();
})();

// ═══ GO TO: type a page name (or URL) and press Enter ═══════════════════════
(function(){
  var MAP = [
    { href:'/',           k:['home','dashboard','main','start'] },
    { href:'/notes',      k:['notes','note','notepad','notebook','writing'] },
    { href:'/files',      k:['files','file','filebeam','uploads','transfer'] },
    { href:'/mail',       k:['mail','email','inbox','gmail','messages'] },
    { href:'/ai',         k:['ai','chat','assistant','llm','ollama','models'] },
    { href:'/homeos',     k:['homeos','smart home','lights','plugs','kasa','wyze','ring','blink','sonoff','gosund','typhur','air fryer'] },
    { href:'/monitoring', k:['monitoring','monitor','uptime','status','health','services'] },
    { href:'/vmlab',      k:['vm','vms','vm lab','virtual machine','virtualbox','qemu','iso','boot'] },
    { href:'/finance',    k:['finance','money','budget','stocks','portfolio','bank'] },
    { href:'/reminders',  k:['reminders','reminder','alarm','alarms','remind','timer'] },
    { href:'/settings', k:['settings','preferences','personalize','personalise','theme','themes','name','profile','appearance','keys','api keys','api','env','update','updates','version'] }
  ];
  var inp = document.getElementById('home-search');
  inp.addEventListener('keydown', function(e){
    if (e.key !== 'Enter') return;
    var raw = inp.value.trim(), q = raw.toLowerCase();
    if (!q) return;
    if (q.indexOf('http') === 0) { window.open(raw, '_blank'); inp.value=''; return; }
    if (q.indexOf('.') > 0 && q.indexOf(' ') === -1) { window.open('https://' + raw, '_blank'); inp.value=''; return; }
    for (var i = 0; i < MAP.length; i++){
      for (var j = 0; j < MAP[i].k.length; j++){
        if (MAP[i].k[j].indexOf(q) === 0 || q.indexOf(MAP[i].k[j]) > -1) { location.href = MAP[i].href; return; }
      }
    }
    showToast('No page matches "' + raw + '"', 'bad');
  });
  document.addEventListener('keydown', function(e){
    var t = document.activeElement && document.activeElement.tagName;
    if (e.key === '/' && t !== 'INPUT' && t !== 'TEXTAREA'){ e.preventDefault(); inp.focus(); }
  });
})();

document.addEventListener('keydown', function(e){ if (e.key === 'Escape') qlClose(); });

</script>
${halo ? `<script type="importmap">{"imports":{"three":"/ui/vendor/three-0.170.0/three.module.min.js","three/addons/":"/ui/vendor/three-0.170.0/addons/"}}</script>
<script type="module" src="/ui/pages/halo.js"></script>
` : ""}</body></html>`;
}

module.exports = { homeHtml };
