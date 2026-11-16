const fs = require("fs");
const path = require("path");

const { dataFile, FINANCE_FILE } = require("../config");
const { readJSON, writeJSONFile } = require("../store");

// ── Portfolio history ────────────────────────────────────────────────────────
// One row per day. Written by a sampler so the line graph has real data even if
// the Finance page is never opened.
const PORTFOLIO_FILE = dataFile("portfolio_history.json");
if (!fs.existsSync(PORTFOLIO_FILE)) fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify({ points: [] }, null, 2));
function readPortfolio()  { const d = readJSON(PORTFOLIO_FILE, { points: [] }); if (!Array.isArray(d.points)) d.points = []; return d; }
function writePortfolio(d){ writeJSONFile(PORTFOLIO_FILE, d); }

async function yahooQuote(sym, range, interval) {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(sym) +
    "?interval=" + (interval || "1d") + "&range=" + (range || "1d");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
    return await res.json();
  } finally { clearTimeout(t); }
}
// Everything that is not a market holding is flat over time: bank balance and
// income have no price history, so they contribute a constant baseline.
function financeBaseline(fin) {
  let base = (fin.bank && fin.bank.amount > 0) ? fin.bank.amount : 0;
  for (const inc of (fin.income || [])) {
    let v = inc.amount || 0;
    if (inc.period === "weekly") v = v * 4.33;
    else if (inc.period === "annual") v = v / 12;
    if (v > 0) base += v;
  }
  return base;
}
async function portfolioTotalNow() {
  const fin = readJSON(FINANCE_FILE, { stocks: [], income: [], bank: {} });
  let total = financeBaseline(fin);
  const syms = (fin.stocks || []).map(x => x.symbol).filter(Boolean);
  const prices = {};
  await Promise.all([...new Set(syms)].map(async sym => {
    try {
      const d = await yahooQuote(sym, "1d", "1d");
      const meta = d && d.chart && d.chart.result && d.chart.result[0] && d.chart.result[0].meta;
      if (meta && meta.regularMarketPrice) prices[sym] = meta.regularMarketPrice;
    } catch {}
  }));
  for (const st of (fin.stocks || [])) {
    const price = prices[st.symbol] != null ? prices[st.symbol] : (st.buyPrice || 0);
    total += price * (st.shares || 0);
  }
  return { total, prices };
}
function dayKey(d) { return new Date(d).toISOString().slice(0, 10); }
async function samplePortfolio() {
  try {
    const { total } = await portfolioTotalNow();
    if (!(total > 0)) return;
    const d = readPortfolio();
    const key = dayKey(Date.now());
    const i = d.points.findIndex(pt => pt.d === key);
    // One row per day, overwritten intraday so the latest value wins.
    if (i === -1) d.points.push({ d: key, v: Math.round(total * 100) / 100, at: Date.now() });
    else d.points[i] = { d: key, v: Math.round(total * 100) / 100, at: Date.now() };
    d.points.sort((a, b) => a.d < b.d ? -1 : 1);
    if (d.points.length > 2000) d.points = d.points.slice(-2000);
    writePortfolio(d);
  } catch {}
}
setTimeout(samplePortfolio, 20000);
setInterval(samplePortfolio, parseInt(process.env.PORTFOLIO_SAMPLE_MS || "3600000", 10));

module.exports = { PORTFOLIO_FILE, dayKey, financeBaseline, portfolioTotalNow, readPortfolio, samplePortfolio, writePortfolio, yahooQuote };
