const sseClients = new Set();
// Taps see every broadcast after it goes out; the activity feed behind /world
// uses one to turn existing events into Open HL World errands without touching each sender.
const taps = [];
// Two framings of the same event. Named (`event: x`) is the classic one, read
// with es.addEventListener('x'). Wrapped puts the name on the first data line so
// one generic onmessage sees every event — the shared stream every Open HL tab
// reads through (openhlEvents in ui/assets.js) relies on that, since it cannot
// know in advance which event names the pages will want.
function sseFrame(event, json, wrapped) {
  return wrapped ? `data: ${event}\ndata: ${json}\n\n` : `event: ${event}\ndata: ${json}\n\n`;
}
function broadcast(event, data={}) {
  const json = JSON.stringify(data);
  const named = sseFrame(event, json, false), wrapped = sseFrame(event, json, true);
  for (const c of sseClients) { try { c.write(c.openhlWrapped ? wrapped : named); } catch(_) { sseClients.delete(c); } }
  for (const t of taps) { try { t(event, data); } catch(_) {} }
}
function onBroadcast(fn) { taps.push(fn); }

// ═══ HOST METRICS — sampled on a timer so CPU% is a real delta, not a guess ════
// os.cpus() gives cumulative jiffies since boot; a single reading is meaningless.

module.exports = { broadcast, onBroadcast, sseClients, sseFrame };
