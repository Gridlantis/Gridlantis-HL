const fs = require("fs");

const { FINANCE_FILE } = require("../config");
const { dayKey, financeBaseline, readPortfolio, samplePortfolio, yahooQuote } = require("../domains/finance");
const { readJSON, writeJSONFile } = require("../store");

// Portfolio history, holdings, income, bank balance, and live prices.
module.exports = async function financeRoutes(ctx) {
  const { req, res, parsed, pathname, json, readBody } = ctx;

  // ── Portfolio history for the line graph ─────────────────────────────────────
  // Recorded history is authoritative. Where it doesn't reach back far enough,
  // the series is RECONSTRUCTED from each holding's Yahoo close prices plus a
  // flat baseline — clearly flagged so it isn't mistaken for measured data.
  if (pathname === '/api/finance/history' && req.method === 'GET') {
    const RANGES = {
      '1w':  { days: 7,    yr: '5d',  label: 'Week' },
      '1m':  { days: 31,   yr: '1mo', label: 'Month' },
      '3m':  { days: 92,   yr: '3mo', label: '3 Months' },
      '6m':  { days: 183,  yr: '6mo', label: '6 Months' },
      '12m': { days: 366,  yr: '1y',  label: '12 Months' },
    };
    // The UI sends "1W"/"12M"; RANGES is keyed lowercase. Without normalising,
    // every lookup missed and silently fell back to 1m, so all five buttons
    // returned the same 31-day window.
    const want = String(parsed.searchParams.get('range') || '').trim().toLowerCase();
    const key = RANGES[want] ? want : '1m';
    const R = RANGES[key];
    const since = Date.now() - R.days * 86400000;
    const rec = readPortfolio().points.filter(pt => new Date(pt.d + 'T12:00:00Z').getTime() >= since);
    const fin = readJSON(FINANCE_FILE, { stocks: [], income: [], bank: {} });
    const base = financeBaseline(fin);
    const holdings = (fin.stocks || []).filter(x => x.symbol && x.shares > 0);

    let series = rec.map(pt => ({ d: pt.d, v: pt.v, measured: true }));
    let reconstructed = false;
    // Fewer than two measured points can't draw a line — rebuild from market data.
    if (series.length < 2 && holdings.length) {
      const byDay = {};
      await Promise.all(holdings.map(async st => {
        try {
          const d = await yahooQuote(st.symbol, R.yr, '1d');
          const r0 = d && d.chart && d.chart.result && d.chart.result[0];
          if (!r0 || !r0.timestamp) return;
          const closes = (r0.indicators && r0.indicators.quote && r0.indicators.quote[0] &&
                          r0.indicators.quote[0].close) || [];
          r0.timestamp.forEach((ts, ix) => {
            const c = closes[ix];
            if (c == null) return;
            const k = dayKey(ts * 1000);
            byDay[k] = (byDay[k] || 0) + c * st.shares;
          });
        } catch {}
      }));
      const days = Object.keys(byDay).sort();
      if (days.length >= 2) {
        series = days.map(k => ({ d: k, v: Math.round((byDay[k] + base) * 100) / 100, measured: false }));
        reconstructed = true;
      }
    }
    // Nothing but a baseline (no stocks at all) — draw it flat rather than empty.
    if (series.length < 2 && base > 0) {
      series = [
        { d: dayKey(since), v: Math.round(base * 100) / 100, measured: false },
        { d: dayKey(Date.now()), v: Math.round(base * 100) / 100, measured: false },
      ];
      reconstructed = true;
    }
    const first = series.length ? series[0].v : 0;
    const last = series.length ? series[series.length - 1].v : 0;
    return json({
      range: key, label: R.label, series, reconstructed,
      baseline: Math.round(base * 100) / 100,
      change: Math.round((last - first) * 100) / 100,
      changePct: first ? Math.round(((last - first) / first) * 10000) / 100 : 0,
      high: series.length ? Math.max(...series.map(x => x.v)) : 0,
      low: series.length ? Math.min(...series.map(x => x.v)) : 0,
      measuredCount: rec.length,
    });
  }
  if (pathname === '/api/finance/history/sample' && req.method === 'POST') {
    await samplePortfolio();
    return json({ ok: true });
  }

  // ── Finance API ─────────────────────────────────────────────────────────────
  if (pathname === '/api/finance' && req.method === 'GET') {
    let data = { stocks: [], income: [], bank: { amount: 0, lastUpdated: null } };
    try { data = JSON.parse(fs.readFileSync(FINANCE_FILE, 'utf8')); } catch {}
    return json(data);
  }

  function readFinance() {
    try { return JSON.parse(fs.readFileSync(FINANCE_FILE, 'utf8')); }
    catch { return { stocks: [], income: [], bank: { amount: 0, lastUpdated: null } }; }
  }
  function writeFinance(d) { writeJSONFile(FINANCE_FILE, d); }

  if (pathname === '/api/finance/bank' && req.method === 'PATCH') {
    const body = JSON.parse((await readBody()).toString());
    const d = readFinance();
    d.bank = { amount: parseFloat(body.amount) || 0, lastUpdated: new Date().toISOString() };
    writeFinance(d);
    return json({ bank: d.bank });
  }

  if (pathname === '/api/finance/stocks' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString());
    const d = readFinance();
    const stock = { id: Date.now().toString(), symbol: (body.symbol||'').toUpperCase(),
      shares: parseFloat(body.shares)||0, buyPrice: parseFloat(body.buyPrice)||0,
      color: body.color || '#6d28d9', addedAt: new Date().toISOString() };
    d.stocks.push(stock);
    writeFinance(d);
    return json({ stocks: d.stocks });
  }

  if (pathname.startsWith('/api/finance/stocks/') && req.method === 'PATCH') {
    const id = pathname.split('/')[4];
    const body = JSON.parse((await readBody()).toString());
    const d = readFinance();
    const idx = d.stocks.findIndex(s => s.id === id);
    if (idx < 0) return json({ error: 'Not found' }, 404);
    d.stocks[idx] = { ...d.stocks[idx], ...body, id };
    writeFinance(d);
    return json({ stocks: d.stocks });
  }

  if (pathname.startsWith('/api/finance/stocks/') && req.method === 'DELETE') {
    const id = pathname.split('/')[4];
    const d = readFinance();
    d.stocks = d.stocks.filter(s => s.id !== id);
    writeFinance(d);
    return json({ stocks: d.stocks });
  }

  if (pathname === '/api/finance/income' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString());
    const d = readFinance();
    const inc = { id: Date.now().toString(), name: body.name || 'Income',
      amount: parseFloat(body.amount) || 0, period: body.period || 'monthly',
      color: body.color || '#10b981', addedAt: new Date().toISOString() };
    d.income.push(inc);
    writeFinance(d);
    return json({ income: d.income });
  }

  if (pathname.startsWith('/api/finance/income/') && req.method === 'PATCH') {
    const id = pathname.split('/')[4];
    const body = JSON.parse((await readBody()).toString());
    const d = readFinance();
    const idx = d.income.findIndex(i => i.id === id);
    if (idx < 0) return json({ error: 'Not found' }, 404);
    d.income[idx] = { ...d.income[idx], ...body, id };
    writeFinance(d);
    return json({ income: d.income });
  }

  if (pathname.startsWith('/api/finance/income/') && req.method === 'DELETE') {
    const id = pathname.split('/')[4];
    const d = readFinance();
    d.income = d.income.filter(i => i.id !== id);
    writeFinance(d);
    return json({ income: d.income });
  }

  if (pathname === '/api/finance/prices' && req.method === 'GET') {
    const symbols = (parsed.searchParams.get('symbols') || '').split(',').filter(Boolean).slice(0, 20);
    const results = {};
    await Promise.all(symbols.map(async sym => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(
          'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=1d&range=1d',
          { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }
        );
        clearTimeout(t);
        const data = await res.json();
        const meta = data.chart?.result?.[0]?.meta;
        if (meta) {
          results[sym] = {
            price: meta.regularMarketPrice,
            prevClose: meta.previousClose || meta.chartPreviousClose,
            change: meta.regularMarketPrice && meta.previousClose ? meta.regularMarketPrice - meta.previousClose : 0,
            changePct: meta.regularMarketPrice && meta.previousClose
              ? ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100 : 0,
            currency: meta.currency
          };
        } else {
          results[sym] = { error: 'Symbol not found' };
        }
      } catch(e) { results[sym] = { error: e.message }; }
    }));
    return json(results);
  }
};
