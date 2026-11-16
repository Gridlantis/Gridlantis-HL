const { blinkCommand, blinkProbe } = require("./blink");
const { camProbe } = require("./camera");
const { kasaCommand, kasaProbe } = require("./kasa");
const { ringCommand, ringProbe } = require("./ring");
const { sonoffCommand, sonoffProbe } = require("./sonoff");
const { HOMEOS_ENERGY, HOMEOS_STATE, readHomeOS } = require("./store");
const { tuyaCommand, tuyaProbe } = require("./tuya");
const { typhurProbe } = require("./typhur");
const { wyzeCommand, wyzeProbe } = require("./wyze");
const { broadcast } = require("../../sse");

let   homeosPollPromise = null;   // in-flight poll, shared by concurrent callers
// ── Adapter table ────────────────────────────────────────────────────────────
const HOMEOS_ADAPTERS = {
  kasa:   { probe: kasaProbe,   command: kasaCommand },
  tuya:   { probe: tuyaProbe,   command: tuyaCommand },
  gosund: { probe: tuyaProbe,   command: tuyaCommand },   // Gosund is Tuya OEM
  sonoff: { probe: sonoffProbe, command: sonoffCommand },
  wyze:   { probe: wyzeProbe,   command: wyzeCommand },
  blink:  { probe: blinkProbe,  command: blinkCommand },
  ring:   { probe: ringProbe,   command: ringCommand },
  camera: { probe: camProbe,    command: async () => ({ ok: false, error: "read-only" }) },
  typhur: { probe: typhurProbe, command: async () => ({ ok: false, error: "Typhur exposes no control API" }) },
};

// ── Poll loop ────────────────────────────────────────────────────────────────
// Concurrent callers share one in-flight run rather than silently no-opping,
// so `await homeosPoll()` always means "state is now fresh".
function homeosPoll() {
  if (homeosPollPromise) return homeosPollPromise;
  homeosPollPromise = homeosPollRun().finally(() => { homeosPollPromise = null; });
  return homeosPollPromise;
}
async function probeOne(d) {
  const a = HOMEOS_ADAPTERS[d.vendor];
  if (!a) { HOMEOS_STATE[d.id] = { online: false, state: {}, err: "unknown vendor", at: Date.now() }; return; }
  let r;
  try { r = await a.probe(d); } catch (e) { r = { online: false, err: e.message }; }
  const prev = HOMEOS_STATE[d.id];
  HOMEOS_STATE[d.id] = { online: !!r.online, state: r.state || {}, err: r.err || null, at: Date.now() };
  if (r.state && r.state.w != null) {
    const hist = HOMEOS_ENERGY[d.id] || (HOMEOS_ENERGY[d.id] = []);
    hist.push({ at: Date.now(), w: r.state.w });
    if (hist.length > 240) hist.shift();
  }
  if (prev && prev.online !== !!r.online) {
    broadcast("homeos_event", { id: d.id, name: d.name, event: r.online ? "online" : "offline" });
  }
}
async function homeosPollRun() {
  try {
    const devs = readHomeOS().devices.filter(d => d.enabled !== false);
    // Probes run in parallel — one unreachable device must not stall the rest,
    // or a single dead IP would push a poll past the poll interval.
    // Typhur runs in a second wave so it can read a fresh plug wattage.
    await Promise.all(devs.filter(d => d.vendor !== "typhur").map(probeOne));
    await Promise.all(devs.filter(d => d.vendor === "typhur").map(probeOne));
    broadcast("homeos_state", { at: Date.now() });
  } catch {}
}
setTimeout(homeosPoll, 8000);
setInterval(homeosPoll, parseInt(process.env.HOMEOS_POLL_MS || "10000", 10));

// ═══ SOCIAL AUTOPOST ══════════════════════════════════════════════════════════
// Two delivery paths, picked per platform:
//   · NATIVE  — Bluesky + Mastodon publish over their official, free, sanctioned
//               APIs straight from here. No browser, no npm, no ToS grey area.
//   · AGENT   — everything else goes to the Playwright sidecar (social_agent.js),
//               which drives a real logged-in browser profile. Heavier, fragile,
//               and against most platforms' automation terms — see SOCIAL.md.
// The queue, scheduler, rate limiting and history are shared by both.

module.exports = { HOMEOS_ADAPTERS, homeosPoll, homeosPollPromise, homeosPollRun, probeOne };
