const sseClients = new Set();
// Taps see every broadcast after it goes out; the activity feed behind /world
// uses one to turn existing events into Open HL World errands without touching each sender.
const taps = [];
function broadcast(event, data={}) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of sseClients) { try { c.write(msg); } catch(_) { sseClients.delete(c); } }
  for (const t of taps) { try { t(event, data); } catch(_) {} }
}
function onBroadcast(fn) { taps.push(fn); }

// ═══ HOST METRICS — sampled on a timer so CPU% is a real delta, not a guess ════
// os.cpus() gives cumulative jiffies since boot; a single reading is meaningless.

module.exports = { broadcast, onBroadcast, sseClients };
