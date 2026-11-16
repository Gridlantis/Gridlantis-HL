const { BASE_CSS, FAVICON, FONT, NAV_CSS, SSE_JS, THEME_JS, TOAST_CSS, TOAST_JS, navBar } = require("../ui/assets");

function financeHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Open HL · Finance</title>${FONT}${FAVICON}
<style>
${BASE_CSS}${NAV_CSS}${TOAST_CSS}
.fin-reminder{display:flex;align-items:center;gap:12px;padding:12px 16px;margin-bottom:16px;border-color:color-mix(in srgb,var(--warn) 45%,var(--line));}
.fin-reminder span{flex:1;}
.fin-reminder .rem-icon{color:var(--warn);}
.rem-dismiss{background:none;border:none;color:var(--muted);width:30px;height:30px;border-radius:var(--r-ctl);}
.rem-dismiss:hover{background:var(--raised);color:var(--text);}
.fin-grid{display:grid;grid-template-columns:340px minmax(0,1fr);gap:16px;align-items:start;}
.fin-left,.fin-right{display:flex;flex-direction:column;gap:16px;min-width:0;}
.fin-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-panel);padding:16px;position:relative;}
.fin-card-hdr{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;}
.fin-card-title{font:600 16px var(--font-display);}
.fin-card-action{height:32px;padding:0 12px;background:var(--raised);color:var(--text);border:1px solid var(--line);border-radius:var(--r-ctl);font-weight:500;display:inline-flex;align-items:center;gap:6px;}
.fin-card-action:hover{border-color:var(--line-strong);}
.chart-wrap{display:flex;justify-content:center;padding:4px 0;position:relative;}
canvas{max-width:100%;}
.legend{display:flex;flex-direction:column;margin-top:12px;border-top:1px solid var(--line);}
.legend-item{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);font-size:13.5px;}
.legend-item:last-child{border-bottom:0;}
.legend-dot{width:10px;height:10px;border-radius:3px;flex-shrink:0;}
.legend-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.legend-pct{color:var(--muted);flex-shrink:0;}
.legend-val{flex-shrink:0;min-width:84px;text-align:right;font-weight:500;}
.chart-tip{position:absolute;pointer-events:none;background:var(--raised);border:1px solid var(--line-strong);border-radius:var(--r-ctl);padding:6px 10px;
  font-size:13px;line-height:1.4;white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.3);display:none;z-index:5;}
.chart-tip b{display:block;font-weight:600;}
.chart-tip span{color:var(--muted);}
.pf-val{font:600 30px/1.1 var(--font-display);margin-top:4px;}
.pf-delta{font-size:14px;margin-top:4px;font-weight:500;}
.pf-delta.up{color:var(--ok);} .pf-delta.dn{color:var(--fault);} .pf-delta.flat{color:var(--muted);font-weight:400;}
.pf-ranges{display:flex;gap:2px;padding:3px;background:var(--raised);border:1px solid var(--line);border-radius:var(--r-ctl);}
.pf-r{height:28px;padding:0 10px;border:0;border-radius:4px;background:none;color:var(--text-2);font-size:13px;font-weight:500;}
.pf-r:hover{color:var(--text);}
.pf-r.on{background:var(--surface);color:var(--text);box-shadow:0 0 0 1px var(--line);}
#pf-chart{width:100%;height:240px;display:block;margin-top:12px;cursor:crosshair;}
.pf-note{font-size:13px;color:var(--muted);margin-top:8px;line-height:1.55;}
.pf-stats{display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:var(--muted);margin-top:10px;}
.pf-stats b{color:var(--text);font-weight:600;margin-left:4px;}
.bank-row{display:flex;align-items:flex-end;gap:12px;}
.bank-amount{font:600 34px/1 var(--font-display);}
.bank-meta{font-size:13px;color:var(--muted);margin-top:6px;}
.stock-wrap{overflow-x:auto;margin:0 -16px -16px;}
.stock-table{width:100%;border-collapse:collapse;font-size:14px;}
.stock-table th{text-align:left;color:var(--muted);font-size:13px;font-weight:500;padding:8px 16px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);white-space:nowrap;}
.stock-table td{padding:10px 16px;border-bottom:1px solid var(--line);vertical-align:middle;white-space:nowrap;}
.stock-table tr:last-child td{border-bottom:none;}
.stock-table th:nth-child(n+3),.stock-table td:nth-child(n+3){text-align:right;}
.stock-symbol{font-weight:600;}
.stock-pl{font-weight:500;}
.stock-pl.pos{color:var(--ok);} .stock-pl.neg{color:var(--fault);} .stock-pl.neu{color:var(--muted);}
.stock-del,.income-del{background:none;border:none;color:var(--muted);width:30px;height:30px;border-radius:var(--r-ctl);}
.stock-del:hover,.income-del:hover{color:var(--fault);background:var(--raised);}
.stock-color{width:10px;height:10px;border-radius:3px;display:inline-block;}
.refresh-badge{font-size:13px;color:var(--muted);}
.income-item{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line);}
.income-dot{width:10px;height:10px;border-radius:3px;flex-shrink:0;}
.income-name{flex:1;font-weight:500;}
.income-amount{font-weight:500;}
.income-period{font-size:13px;color:var(--muted);margin-left:3px;font-weight:400;}
.empty-state{text-align:center;color:var(--muted);padding:16px 0;}
.fin-modal-bg{position:fixed;inset:0;background:rgba(5,8,12,.6);z-index:300;display:none;align-items:flex-start;justify-content:center;padding:10vh 16px 16px;}
.fin-modal-bg.open{display:flex;}
.fin-modal{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-panel);width:100%;max-width:420px;box-shadow:0 24px 60px rgba(0,0,0,.45);}
.fin-modal-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--line);}
.fin-modal-title{font:600 17px var(--font-display);}
.fin-modal-close{background:none;border:1px solid transparent;color:var(--muted);width:30px;height:30px;border-radius:var(--r-ctl);}
.fin-modal-close:hover{background:var(--raised);color:var(--text);}
.fin-modal-body{padding:16px;display:flex;flex-direction:column;gap:14px;}
.fin-field label{display:block;font-size:13px;font-weight:500;color:var(--text-2);margin-bottom:6px;}
.fin-field input,.fin-field select{width:100%;height:36px;background:var(--field);border:1px solid var(--line);border-radius:var(--r-ctl);padding:0 12px;color:var(--text);}
.fin-field input:focus,.fin-field select:focus{outline:none;border-color:var(--accent);}
.fin-modal-footer{padding:12px 16px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:8px;}
.fin-btn-cancel{height:34px;background:var(--raised);border:1px solid var(--line);color:var(--text);padding:0 14px;border-radius:var(--r-ctl);font-weight:500;}
.fin-btn-save{height:34px;background:var(--accent);color:var(--accent-ink);border:none;padding:0 16px;border-radius:var(--r-ctl);font-weight:500;}
.fin-btn-save:hover{filter:brightness(1.08);}
@media(max-width:960px){.fin-grid{grid-template-columns:1fr;} .fin-left{order:1;}.fin-right{order:0;}}
</style></head><body>
${navBar('/finance')}
<main class="m-page">
  <div class="m-head"><div><h1 class="m-title">Finance</h1><p class="m-sub">Bank balance, stocks and income in one place.</p></div></div>
  <div class="m-panel fin-reminder" id="reminder" style="display:none" role="status">
    <i class="fa-solid fa-triangle-exclamation rem-icon"></i>
    <span id="reminder-text">Your bank balance has not been updated recently.</span>
    <button class="m-btn" onclick="openModal('bank')">Update balance</button>
    <button class="rem-dismiss" onclick="document.getElementById('reminder').style.display='none'" title="Dismiss" aria-label="Dismiss"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <div class="fin-grid">
    <div class="fin-left">
      <section class="fin-card" aria-labelledby="ov-t">
        <div class="fin-card-hdr"><h2 class="fin-card-title" id="ov-t">Where it is</h2><span class="refresh-badge" id="refresh-badge"></span></div>
        <div class="chart-wrap"><canvas id="donut" width="260" height="260" role="img" aria-label="Portfolio breakdown"></canvas><div class="chart-tip" id="donut-tip"></div></div>
        <div class="legend" id="legend"></div>
      </section>
    </div>
    <div class="fin-right">
      <section class="fin-card" aria-labelledby="tr-t">
        <div class="fin-card-hdr" style="align-items:flex-start">
          <div>
            <h2 class="fin-card-title" id="tr-t">Total over time</h2>
            <div class="pf-val" id="pf-val">$—</div>
            <div class="pf-delta flat" id="pf-delta">—</div>
          </div>
          <div class="pf-ranges" id="pf-ranges" role="group" aria-label="Time range">
            <button class="pf-r" data-r="1w">1W</button>
            <button class="pf-r on" data-r="1m">1M</button>
            <button class="pf-r" data-r="3m">3M</button>
            <button class="pf-r" data-r="6m">6M</button>
            <button class="pf-r" data-r="12m">1Y</button>
          </div>
        </div>
        <div style="position:relative"><canvas id="pf-chart" role="img" aria-label="Portfolio total over time"></canvas><div class="chart-tip" id="pf-tip"></div></div>
        <div class="pf-stats" id="pf-stats"></div>
        <div class="pf-note" id="pf-note"></div>
      </section>

      <section class="fin-card" aria-labelledby="bank-t">
        <div class="fin-card-hdr">
          <h2 class="fin-card-title" id="bank-t">Bank account</h2>
          <button class="fin-card-action" onclick="openModal('bank')"><i class="fa-solid fa-pen"></i>Update balance</button>
        </div>
        <div class="bank-row">
          <div>
            <div class="bank-amount" id="bank-amount">$—</div>
            <div class="bank-meta" id="bank-meta">Never updated</div>
          </div>
        </div>
      </section>
      <section class="fin-card" aria-labelledby="st-t">
        <div class="fin-card-hdr">
          <h2 class="fin-card-title" id="st-t">Stocks</h2>
          <button class="fin-card-action" onclick="openModal('stock')"><i class="fa-solid fa-plus"></i>Add stock</button>
        </div>
        <div id="stocks-body"><div class="empty-state">No stocks yet.</div></div>
      </section>
      <section class="fin-card" aria-labelledby="in-t">
        <div class="fin-card-hdr">
          <h2 class="fin-card-title" id="in-t">Income</h2>
          <button class="fin-card-action" onclick="openModal('income')"><i class="fa-solid fa-plus"></i>Add income</button>
        </div>
        <div id="income-body"><div class="empty-state">No income sources yet.</div></div>
      </section>
    </div>
  </div>
</main>

<div class="fin-modal-bg" id="modal-bank">
  <div class="fin-modal" role="dialog" aria-modal="true" aria-labelledby="mb-t">
    <div class="fin-modal-hdr"><span class="fin-modal-title" id="mb-t">Update bank balance</span><button class="fin-modal-close" onclick="closeModal('bank')" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="fin-modal-body">
      <div class="fin-field"><label for="bank-input">Current balance in dollars</label><input id="bank-input" type="number" step="0.01" placeholder="12500.00"></div>
    </div>
    <div class="fin-modal-footer"><button class="fin-btn-cancel" onclick="closeModal('bank')">Cancel</button><button class="fin-btn-save" onclick="saveBank()">Save balance</button></div>
  </div>
</div>

<div class="fin-modal-bg" id="modal-stock">
  <div class="fin-modal" role="dialog" aria-modal="true" aria-labelledby="ms-t">
    <div class="fin-modal-hdr"><span class="fin-modal-title" id="ms-t">Add stock</span><button class="fin-modal-close" onclick="closeModal('stock')" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="fin-modal-body">
      <div class="fin-field"><label for="stock-symbol">Ticker symbol</label><input id="stock-symbol" placeholder="AAPL" style="text-transform:uppercase" oninput="this.value=this.value.toUpperCase()"></div>
      <div class="fin-field"><label for="stock-shares">Shares owned</label><input id="stock-shares" type="number" step="0.0001" min="0" placeholder="10"></div>
      <div class="fin-field"><label for="stock-buy">Purchase price per share in dollars</label><input id="stock-buy" type="number" step="0.01" min="0" placeholder="150.00"></div>
    </div>
    <div class="fin-modal-footer"><button class="fin-btn-cancel" onclick="closeModal('stock')">Cancel</button><button class="fin-btn-save" onclick="saveStock()">Add stock</button></div>
  </div>
</div>

<div class="fin-modal-bg" id="modal-income">
  <div class="fin-modal" role="dialog" aria-modal="true" aria-labelledby="income-modal-title">
    <div class="fin-modal-hdr"><span class="fin-modal-title" id="income-modal-title">Add income</span><button class="fin-modal-close" onclick="closeModal('income')" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="fin-modal-body">
      <div class="fin-field"><label for="income-name">Name</label><input id="income-name" placeholder="Salary, freelance, dividends"></div>
      <div class="fin-field"><label for="income-amount">Amount in dollars</label><input id="income-amount" type="number" step="0.01" min="0" placeholder="5000"></div>
      <div class="fin-field"><label for="income-period">How often</label>
        <select id="income-period">
          <option value="monthly">Monthly</option>
          <option value="weekly">Weekly</option>
          <option value="annual">Yearly</option>
          <option value="once">One time</option>
        </select>
      </div>
    </div>
    <div class="fin-modal-footer"><button class="fin-btn-cancel" onclick="closeModal('income')">Cancel</button><button class="fin-btn-save" id="income-save-btn" onclick="saveIncome()">Add income</button></div>
  </div>
</div>

<div class="toast" id="toast"></div>
<script>
${TOAST_JS}
${THEME_JS}

// ── State ─────────────────────────────────────────────────────────────────────
let FIN = { stocks: [], income: [], bank: { amount: 0, lastUpdated: null } };
let PRICES = {};  // { SYMBOL: { price, prevClose } }
let editingIncomeId = null;

const PALETTE = ['#6d28d9','#2563eb','#059669','#d97706','#e11d48',
                 '#7c3aed','#0891b2','#65a30d','#ea580c','#db2777',
                 '#8b5cf6','#0284c7','#84cc16','#f97316','#ec4899',
                 '#a855f7','#06b6d4','#bef264','#fb923c','#f472b6'];

// Chart colours come from the theme's validated series tokens, assigned in a
// fixed order (bank, then stocks, then income) so an item keeps its colour.
function cssv(name, fallback){ return (getComputedStyle(document.documentElement).getPropertyValue(name) || fallback || '').trim(); }
function seriesOrder(){
  const keys = [];
  if (FIN.bank && FIN.bank.amount > 0) keys.push('bank');
  FIN.stocks.forEach(s => keys.push('stock:' + s.id));
  FIN.income.forEach(inc => keys.push('income:' + inc.id));
  return keys;
}
function colorFor(key){
  const i = seriesOrder().indexOf(key);
  return (i < 0 || i > 6 && seriesOrder().length > 8) || i > 7 ? cssv('--muted', '#888') : cssv('--series-' + (i + 1), '#888');
}
function nextColor(usedColors) {
  return PALETTE.find(c => !usedColors.includes(c)) || PALETTE[Math.floor(Math.random()*PALETTE.length)];
}

// ── Formatting ────────────────────────────────────────────────────────────────
function fmt$(n) { return '$' + (n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtPct(n) { return (n>=0?'+':'')+n.toFixed(2)+'%'; }

// ── Reminder ──────────────────────────────────────────────────────────────────
function checkReminder() {
  const last = FIN.bank.lastUpdated ? new Date(FIN.bank.lastUpdated) : null;
  const days = last ? Math.floor((Date.now()-last)/86400000) : null;
  const banner = document.getElementById('reminder');
  if (!last || days >= 14) {
    document.getElementById('reminder-text').textContent = last
      ? 'Your bank balance was last updated ' + days + ' days ago. Update it so totals stay accurate.'
      : 'Your bank balance has never been set. Add it for accurate totals.';
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

// ── Donut Chart ───────────────────────────────────────────────────────────────
function buildSlices() {
  const slices = [];
  // Bank balance
  if (FIN.bank && FIN.bank.amount > 0) {
    slices.push({ label: 'Bank account', value: FIN.bank.amount, key: 'bank', type: 'bank' });
  }
  // Stocks: current market value
  for (const s of FIN.stocks) {
    const p = PRICES[s.symbol];
    const price = p?.price || s.buyPrice || 0;
    const val = price * s.shares;
    if (val > 0) slices.push({ label: s.symbol, value: val, key: 'stock:' + s.id, type:'stock' });
  }
  // Income: normalize recurring to monthly, keep one-time at full value
  for (const inc of FIN.income) {
    let val = inc.amount;
    if (inc.period === 'weekly')  val = inc.amount * 4.33;
    if (inc.period === 'annual')  val = inc.amount / 12;
    // 'once' uses full amount — it's a lump sum, not divided
    if (val > 0) slices.push({ label: inc.name, value: val, key: 'income:' + inc.id, type:'income' });
  }
  // More than eight: the first seven keep their colours, the rest fold into Other.
  slices.forEach(sl => { sl.color = colorFor(sl.key); });
  if (slices.length > 8) {
    const rest = slices.splice(7);
    slices.push({ label: 'Other (' + rest.length + ')', value: rest.reduce((a, r) => a + r.value, 0), color: cssv('--muted', '#888'), type: 'other' });
  }
  return slices;
}

function drawDonut() {
  const canvas = document.getElementById('donut');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const size = 260;
  canvas.width = size * dpr; canvas.height = size * dpr;
  canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
  ctx.scale(dpr, dpr);

  const cx = size/2, cy = size/2;
  const outerR = size * 0.42, innerR = outerR * 0.58;
  const slices = buildSlices();
  const total  = slices.reduce((s,sl) => s+sl.value, 0);

  ctx.clearRect(0, 0, size, size);

  if (!total || !slices.length) {
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#333';
    ctx.beginPath(); ctx.arc(cx,cy,outerR,0,Math.PI*2); ctx.fill();
    ctx.clearRect(0,0,size,size);
    ctx.beginPath(); ctx.arc(cx,cy,outerR,0,Math.PI*2);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#333';
    ctx.lineWidth = outerR - innerR; ctx.stroke();
    const textC = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#888';
    ctx.fillStyle = textC; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font = '13px "IBM Plex Sans", sans-serif'; ctx.fillText('Add a balance or', cx, cy-8);
    ctx.fillText('a stock to begin', cx, cy+12);
    updateLegend([]);
    return;
  }

  let angle = -Math.PI/2;
  const GAP = slices.length > 1 ? 2 / outerR : 0;   // a 2px surface gap between segments
  DONUT = { cx, cy, outerR, innerR, total, arcs: [] };
  for (const sl of slices) {
    const sweep = (sl.value/total)*Math.PI*2 - GAP;
    DONUT.arcs.push({ from: angle, to: angle + sweep + GAP, sl });
    ctx.beginPath();
    ctx.moveTo(cx + outerR*Math.cos(angle+GAP/2), cy + outerR*Math.sin(angle+GAP/2));
    ctx.arc(cx, cy, outerR, angle+GAP/2, angle+sweep);
    ctx.arc(cx, cy, innerR, angle+sweep, angle+GAP/2, true);
    ctx.closePath();
    ctx.fillStyle = sl.color;
    ctx.fill();
    angle += sweep + GAP;
  }

  // Center text — use the same total that drives the slices so it always matches
  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#fff';
  const mutedColor = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#888';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = textColor;
  ctx.font = '600 19px "IBM Plex Sans Condensed", sans-serif';
  ctx.fillText(fmt$(total), cx, cy - 9);
  ctx.fillStyle = mutedColor; ctx.font = '13px "IBM Plex Sans", sans-serif';
  ctx.fillText('total', cx, cy + 12);

  updateLegend(slices, total);
}

let DONUT = null;
(function(){
  const cv = document.getElementById('donut'), tip = document.getElementById('donut-tip');
  cv.addEventListener('mousemove', e => {
    if (!DONUT || !DONUT.arcs.length) return;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left - DONUT.cx, y = e.clientY - r.top - DONUT.cy;
    const dist = Math.hypot(x, y);
    let a = Math.atan2(y, x); if (a < -Math.PI/2) a += Math.PI*2;
    const hit = dist >= DONUT.innerR - 6 && dist <= DONUT.outerR + 6 && DONUT.arcs.find(arc => a >= arc.from && a < arc.to);
    if (!hit) { tip.style.display = 'none'; return; }
    tip.innerHTML = '';
    const b = document.createElement('b'); b.textContent = hit.sl.label; tip.appendChild(b);
    const sp = document.createElement('span'); sp.textContent = fmt$(hit.sl.value) + ', ' + (hit.sl.value / DONUT.total * 100).toFixed(1) + '%'; tip.appendChild(sp);
    tip.style.display = 'block';
    tip.style.left = (cv.offsetLeft + e.clientX - r.left + 14) + 'px';
    tip.style.top = (cv.offsetTop + e.clientY - r.top + 14) + 'px';
  });
  cv.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
})();
function updateLegend(slices, total) {
  const leg = document.getElementById('legend');
  if (!slices.length) { leg.innerHTML=''; return; }
  leg.innerHTML = slices.map(sl => {
    const pct = ((sl.value/total)*100).toFixed(1);
    return '<div class="legend-item">'
      +'<div class="legend-dot" style="background:'+sl.color+'"></div>'
      +'<span class="legend-name">'+sl.label+'</span>'
      +'<span class="legend-pct">'+pct+'%</span>'
      +'<span class="legend-val">'+fmt$(sl.value)+'</span>'
      +'</div>';
  }).join('');
}

// ── Stocks render ─────────────────────────────────────────────────────────────
function renderStocks() {
  const el = document.getElementById('stocks-body');
  if (!FIN.stocks.length) { el.innerHTML='<div class="empty-state">No stocks yet. Add a ticker to track it.</div>'; return; }
  let html = '<div class="stock-wrap"><table class="stock-table"><thead><tr>'
    +'<th><span class="sr-only"></span></th><th>Symbol</th><th>Shares</th><th>Bought at</th><th>Price</th><th>Value</th><th>Gain or loss</th><th></th>'
    +'</tr></thead><tbody>';
  for (const s of FIN.stocks) {
    const p = PRICES[s.symbol];
    const cur   = p?.price ?? null;
    const value = cur != null ? cur * s.shares : null;
    const cost  = s.buyPrice * s.shares;
    const pl    = value != null && s.buyPrice ? value - cost : null;
    const plPct = pl != null && cost ? (pl/cost)*100 : null;
    const plClass = pl == null ? 'neu' : pl > 0 ? 'pos' : pl < 0 ? 'neg' : 'neu';
    html += '<tr>'
      +'<td><span class="stock-color" style="background:'+colorFor('stock:'+s.id)+'"></span></td>'
      +'<td class="stock-symbol">'+s.symbol+'</td>'
      +'<td class="stock-price">'+s.shares+'</td>'
      +'<td class="stock-price">'+fmt$(s.buyPrice)+'</td>'
      +'<td class="stock-price">'+(cur != null ? fmt$(cur) : '—')+'</td>'
      +'<td class="stock-price">'+(value != null ? fmt$(value) : '—')+'</td>'
      +'<td class="stock-pl '+plClass+'">'+(pl != null ? (pl>=0?'+':'')+fmt$(Math.abs(pl))+(plPct!=null?' ('+fmtPct(plPct)+')':'') : '—')+'</td>'
      +'<td><button class="stock-del" data-id="'+s.id+'" onclick="deleteStock(this.dataset.id)" title="Remove" aria-label="Remove '+s.symbol+'"><i class="fa-solid fa-xmark"></i></button></td>'
      +'</tr>';
  }
  el.innerHTML = html + '</tbody></table></div>';
}

// ── Income render ─────────────────────────────────────────────────────────────
function renderIncome() {
  const el = document.getElementById('income-body');
  if (!FIN.income.length) { el.innerHTML='<div class="empty-state">No income sources yet.</div>'; return; }
  el.innerHTML = FIN.income.map(inc =>
    '<div class="income-item">'
    +'<div class="income-dot" style="background:'+colorFor('income:'+inc.id)+'"></div>'
    +'<span class="income-name">'+inc.name+'</span>'
    +'<span class="income-amount">'+fmt$(inc.amount)+'<span class="income-period">/'+inc.period+'</span></span>'
    +'<button class="income-del" data-id="'+inc.id+'" onclick="deleteIncome(this.dataset.id)" title="Remove" aria-label="Remove '+inc.name+'"><i class="fa-solid fa-xmark"></i></button>'
    +'</div>'
  ).join('');
}

// ── Bank render ───────────────────────────────────────────────────────────────
function renderBank() {
  const b = FIN.bank;
  document.getElementById('bank-amount').textContent = b.amount ? fmt$(b.amount) : '$—';
  if (b.lastUpdated) {
    const d = Math.floor((Date.now()-new Date(b.lastUpdated))/86400000);
    document.getElementById('bank-meta').textContent = 'Last updated '+(d===0?'today':d+' day'+(d===1?'':'s')+' ago');
  } else {
    document.getElementById('bank-meta').textContent = 'Never updated';
  }
}

function renderAll() { renderBank(); renderStocks(); renderIncome(); drawDonut(); loadTrend(); }

// ── Portfolio trend ───────────────────────────────────────────────────────────
var PF = { range: '1m', data: null };
function fmtMoney(v){
  if (v == null) return '$—';
  return '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
async function loadTrend(){
  try {
    PF.data = await fetch('/api/finance/history?range=' + PF.range).then(function(r){ return r.json(); });
  } catch(e){ PF.data = null; }
  renderTrend();
}
function renderTrend(){
  var d = PF.data;
  var note = document.getElementById('pf-note');
  var stats = document.getElementById('pf-stats');
  if (!d || !d.series || d.series.length < 2){
    document.getElementById('pf-val').textContent = '$—';
    document.getElementById('pf-delta').textContent = '—';
    document.getElementById('pf-delta').className = 'pf-delta flat';
    stats.textContent = '';
    note.textContent = 'Not enough data yet. Add a bank balance or a stock, and Open HL records a point every hour.';
    drawTrend([]);
    return;
  }
  var last = d.series[d.series.length - 1].v;
  document.getElementById('pf-val').textContent = fmtMoney(last);
  var dl = document.getElementById('pf-delta');
  var up = d.change > 0, dn = d.change < 0;
  dl.className = 'pf-delta ' + (up ? 'up' : dn ? 'dn' : 'flat');
  dl.textContent = (up ? '▲ up ' : dn ? '▼ down ' : 'no change, ') + fmtMoney(Math.abs(d.change)) +
    ' (' + (d.changePct > 0 ? '+' : '') + d.changePct + '%) over ' + d.label.toLowerCase();
  stats.textContent = '';
  [['High', fmtMoney(d.high)], ['Low', fmtMoney(d.low)], ['Points', d.series.length]].forEach(function(pair){
    var sp = document.createElement('span');
    sp.appendChild(document.createTextNode(pair[0] + ' '));
    var b = document.createElement('b'); b.textContent = pair[1];
    sp.appendChild(b); stats.appendChild(sp);
  });
  note.textContent = d.reconstructed
    ? 'Reconstructed from market close prices plus your current bank and income baseline. Once Open HL has recorded its own daily snapshots, the line switches to measured data.'
    : 'Measured from ' + d.measuredCount + ' daily snapshot' + (d.measuredCount === 1 ? '' : 's') + ' recorded by Open HL.';
  drawTrend(d.series);
}
function drawTrend(series){
  var cv = document.getElementById('pf-chart');
  if (!cv) return;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  cv.width = w * dpr; cv.height = h * dpr;
  var x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, w, h);
  var cs = getComputedStyle(document.documentElement);
  var muted = (cs.getPropertyValue('--muted') || '#888').trim();
  var accent = (cs.getPropertyValue('--accent') || '#6d28d9').trim();
  var grid = (cs.getPropertyValue('--line') || '#333').trim();
  var lineC = (cs.getPropertyValue('--series-1') || '#3987e5').trim();
  if (series.length < 2){
    x.fillStyle = muted; x.font = '11px "IBM Plex Sans", sans-serif'; x.textAlign = 'center';
    x.font = '13px "IBM Plex Sans", sans-serif'; x.fillText('No data for this range yet', w / 2, h / 2);
    return;
  }
  var padL = 70, padR = 12, padT = 12, padB = 26;
  var pw = w - padL - padR, ph = h - padT - padB;
  var vals = series.map(function(p){ return p.v; });
  var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
  if (mn === mx){ mn = mn * 0.98; mx = mx * 1.02 || 1; }
  var pad = (mx - mn) * 0.08; mn -= pad; mx += pad;
  var px = function(i){ return padL + (i / (series.length - 1)) * pw; };
  var py = function(v){ return padT + ph - ((v - mn) / (mx - mn)) * ph; };

  x.strokeStyle = grid; x.lineWidth = 1;
  x.font = '12px "IBM Plex Sans", sans-serif'; x.fillStyle = muted; x.textAlign = 'right';
  for (var i = 0; i <= 4; i++){
    var yy = padT + ph - (i / 4) * ph;
    x.beginPath(); x.moveTo(padL, yy); x.lineTo(w - padR, yy); x.stroke();
    var v = mn + (i / 4) * (mx - mn);
    x.fillText('$' + Math.round(v).toLocaleString(), padL - 7, yy + 3);
  }
  // gain/loss colour is judged against the first point in the window
  // One series: the line wears the first series colour; gain or loss is stated in text above.
  var line = lineC;
  var g = x.createLinearGradient(0, padT, 0, padT + ph);
  g.addColorStop(0, lineC + '33');
  g.addColorStop(1, lineC + '00');
  x.beginPath(); x.moveTo(px(0), py(series[0].v));
  series.forEach(function(p, i){ x.lineTo(px(i), py(p.v)); });
  x.lineTo(px(series.length - 1), padT + ph); x.lineTo(px(0), padT + ph); x.closePath();
  x.fillStyle = g; x.fill();

  x.beginPath();
  series.forEach(function(p, i){ i ? x.lineTo(px(i), py(p.v)) : x.moveTo(px(i), py(p.v)); });
  x.strokeStyle = line; x.lineWidth = 2; x.lineJoin = 'round'; x.stroke();

  x.beginPath(); x.arc(px(series.length - 1), py(series[series.length - 1].v), 3.5, 0, 6.283);
  x.fillStyle = line; x.fill();

  x.fillStyle = muted; x.textAlign = 'center'; x.font = '12px "IBM Plex Sans", sans-serif';
  var steps = Math.min(5, series.length);
  for (var t = 0; t < steps; t++){
    var idx = Math.round(t * (series.length - 1) / (steps - 1 || 1));
    var dt = new Date(series[idx].d + 'T12:00:00');
    x.textAlign = t === 0 ? 'left' : (t === steps - 1 ? 'right' : 'center');
    x.fillText(dt.toLocaleDateString([], { month: 'short', day: 'numeric' }), t === 0 ? px(idx) - 4 : px(idx), h - 7);
  }
  PFGEO = { series: series, px: px, py: py, padT: padT, ph: ph, padL: padL, pw: pw };
  if (PFHOVER != null && series[PFHOVER]) {
    var hx = px(PFHOVER), hy = py(series[PFHOVER].v);
    x.strokeStyle = (cs.getPropertyValue('--line-strong') || '#555').trim(); x.lineWidth = 1;
    x.beginPath(); x.moveTo(hx, padT); x.lineTo(hx, padT + ph); x.stroke();
    x.beginPath(); x.arc(hx, hy, 5, 0, 6.283); x.fillStyle = (cs.getPropertyValue('--surface') || '#000').trim(); x.fill();
    x.beginPath(); x.arc(hx, hy, 4, 0, 6.283); x.fillStyle = line; x.fill();
  }
  void accent;
}
var PFGEO = null, PFHOVER = null;
(function(){
  var cv = document.getElementById('pf-chart'), tip = document.getElementById('pf-tip');
  cv.addEventListener('mousemove', function(e){
    if (!PFGEO || PFGEO.series.length < 2) return;
    var r = cv.getBoundingClientRect(), mx = e.clientX - r.left;
    var i = Math.round((mx - PFGEO.padL) / PFGEO.pw * (PFGEO.series.length - 1));
    i = Math.max(0, Math.min(PFGEO.series.length - 1, i));
    if (i !== PFHOVER) { PFHOVER = i; drawTrend(PFGEO.series); }
    var p = PFGEO.series[i];
    tip.innerHTML = '';
    var b = document.createElement('b'); b.textContent = fmtMoney(p.v); tip.appendChild(b);
    var sp = document.createElement('span'); sp.textContent = new Date(p.d + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }); tip.appendChild(sp);
    tip.style.display = 'block';
    var left = PFGEO.px(i) + 12; if (left > r.width - 150) left = PFGEO.px(i) - 150;
    tip.style.left = left + 'px'; tip.style.top = (PFGEO.py(p.v) - 10) + 'px';
  });
  cv.addEventListener('mouseleave', function(){ PFHOVER = null; tip.style.display = 'none'; if (PFGEO) drawTrend(PFGEO.series); });
  window.addEventListener('openhl:theme', function(){ renderAll(); });
})();
(function(){
  var wrap = document.getElementById('pf-ranges');
  if (!wrap) return;
  wrap.querySelectorAll('.pf-r').forEach(function(b){
    b.addEventListener('click', function(){
      wrap.querySelectorAll('.pf-r').forEach(function(o){ o.classList.remove('on'); });
      b.classList.add('on');
      PF.range = b.getAttribute('data-r');
      loadTrend();
    });
  });
  window.addEventListener('resize', function(){ if (PF.data) drawTrend(PF.data.series); });
})();

// ── Price fetching ────────────────────────────────────────────────────────────
async function fetchPrices() {
  if (!FIN.stocks.length) return;
  const symbols = FIN.stocks.map(s=>s.symbol).join(',');
  try {
    const data = await fetch('/api/finance/prices?symbols='+encodeURIComponent(symbols)).then(r=>r.json());
    let updated = false;
    for (const [sym, info] of Object.entries(data)) {
      if (info.price != null) { PRICES[sym] = info; updated = true; }
    }
    if (updated) {
      renderAll();
      const now = new Date();
      document.getElementById('refresh-badge').textContent = 'Updated '+now.toLocaleTimeString();
    }
  } catch(e) { console.error('Price fetch failed:', e.message); }
}

// ── Modals ────────────────────────────────────────────────────────────────────
function openModal(type) {
  if (type==='income') {
    editingIncomeId = null;
    document.getElementById('income-modal-title').textContent = 'Add Income Source';
    document.getElementById('income-save-btn').textContent = 'Add Source';
    document.getElementById('income-name').value='';
    document.getElementById('income-amount').value='';
    document.getElementById('income-period').value='monthly';
  }
  if (type==='bank') document.getElementById('bank-input').value = FIN.bank.amount||'';
  if (type==='stock') {
    document.getElementById('stock-symbol').value='';
    document.getElementById('stock-shares').value='';
    document.getElementById('stock-buy').value='';
  }
  document.getElementById('modal-'+type).classList.add('open');
  setTimeout(()=>{
    const inp = document.querySelector('#modal-'+type+' input');
    if(inp) inp.focus();
  },50);
}
function closeModal(type) { document.getElementById('modal-'+type).classList.remove('open'); }

// ── CRUD operations ───────────────────────────────────────────────────────────
async function saveBank() {
  const amt = parseFloat(document.getElementById('bank-input').value);
  if (isNaN(amt)) { showToast('Enter a valid amount','bad'); return; }
  const res = await fetch('/api/finance/bank',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount:amt})});
  if (!res.ok) { showToast('Failed to save','bad'); return; }
  FIN.bank = (await res.json()).bank;
  closeModal('bank'); renderAll(); checkReminder(); showToast('Bank balance updated','ok');
}

async function saveStock() {
  const symbol = document.getElementById('stock-symbol').value.trim().toUpperCase();
  const shares = parseFloat(document.getElementById('stock-shares').value);
  const buyPrice = parseFloat(document.getElementById('stock-buy').value)||0;
  if (!symbol) { showToast('Enter a ticker symbol','bad'); return; }
  if (!shares || shares<=0) { showToast('Enter number of shares','bad'); return; }
  const usedColors = FIN.stocks.map(s=>s.color).concat(FIN.income.map(i=>i.color));
  const color = nextColor(usedColors);
  const res = await fetch('/api/finance/stocks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol,shares,buyPrice,color})});
  if (!res.ok) { showToast('Failed to add stock','bad'); return; }
  FIN.stocks = (await res.json()).stocks;
  closeModal('stock'); await fetchPrices(); renderAll(); showToast(symbol+' added','ok');
}

async function deleteStock(id) {
  if (!confirm('Remove this stock?')) return;
  const res = await fetch('/api/finance/stocks/'+id,{method:'DELETE'});
  if (!res.ok) { showToast('Failed','bad'); return; }
  FIN.stocks = (await res.json()).stocks;
  delete PRICES[FIN.stocks.find?.(()=>false)]; // cleanup is fine, stale prices harmless
  renderAll(); showToast('Removed','ok');
}

async function saveIncome() {
  const name   = document.getElementById('income-name').value.trim();
  const amount = parseFloat(document.getElementById('income-amount').value);
  const period = document.getElementById('income-period').value;
  if (!name) { showToast('Enter a name','bad'); return; }
  if (!amount||amount<=0) { showToast('Enter a valid amount','bad'); return; }
  const usedColors = FIN.stocks.map(s=>s.color).concat(FIN.income.map(i=>i.color));
  let res;
  if (editingIncomeId) {
    res = await fetch('/api/finance/income/'+editingIncomeId,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,amount,period})});
  } else {
    const color = nextColor(usedColors);
    res = await fetch('/api/finance/income',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,amount,period,color})});
  }
  if (!res.ok) { showToast('Failed','bad'); return; }
  FIN.income = (await res.json()).income;
  closeModal('income'); renderAll(); showToast(editingIncomeId?'Updated':'Income source added','ok');
  editingIncomeId = null;
}

async function deleteIncome(id) {
  if (!confirm('Remove this income source?')) return;
  const res = await fetch('/api/finance/income/'+id,{method:'DELETE'});
  if (!res.ok) { showToast('Failed','bad'); return; }
  FIN.income = (await res.json()).income;
  renderAll(); showToast('Removed','ok');
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function initFinance() {
  const data = await fetch('/api/finance').then(r=>r.json());
  FIN = data;
  renderAll();
  checkReminder();
  await fetchPrices();
}

// Close modals on backdrop click + Escape
['bank','stock','income'].forEach(type => {
  document.getElementById('modal-'+type).addEventListener('click', e => {
    if (e.target === document.getElementById('modal-'+type)) closeModal(type);
  });
});
document.addEventListener('keydown', e => {
  if (e.key==='Escape') ['bank','stock','income'].forEach(closeModal);
});

// Redraw chart on theme change (CSS variables change)
new MutationObserver(()=>drawDonut()).observe(document.documentElement,{attributes:true,attributeFilter:['style']});

// Refresh prices every 60 seconds
setInterval(fetchPrices, 60000);

initFinance();
${SSE_JS}
</script></body></html>`;
}

module.exports = { financeHtml };
