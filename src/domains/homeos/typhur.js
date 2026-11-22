const { sendAlert } = require("../../alerts");
const { HOMEOS_STATE } = require("./store");
const { probePort } = require("../../net");
const { broadcast } = require("../../sse");

// ── Typhur: no API exists. Two things we CAN observe, both indirect. ─────────
// 1. Network presence — the Dome joins 2.4GHz Wi-Fi, so it answers ARP/TCP.
// 2. Power draw — if it is plugged into an energy-monitoring smart plug, the
//    wattage curve tells you idle / preheat / cook / done with good fidelity.
// Bind a plug with `powerFrom: "<device id>"` and this adapter reads that
// device's watts and classifies the cook phase.
const TYPHUR_PHASE = { IDLE: "idle", PREHEAT: "preheating", COOK: "cooking", DONE: "finished" };
function typhurClassify(dev, watts, prev) {
  const idleMax = dev.idleWatts != null ? dev.idleWatts : 10;
  const cookMin = dev.cookWatts != null ? dev.cookWatts : 400;
  if (watts == null) return { phase: null };
  if (watts <= idleMax) {
    // A drop from cooking to idle is the end of a cook, not merely "idle".
    if (prev && (prev.phase === TYPHUR_PHASE.COOK || prev.phase === TYPHUR_PHASE.PREHEAT)) {
      return { phase: TYPHUR_PHASE.DONE, since: Date.now() };
    }
    // "Finished" is sticky for a hold window, otherwise the very next poll would
    // erase it and you would only ever catch it by staring at the screen.
    if (prev && prev.phase === TYPHUR_PHASE.DONE && prev.since &&
        Date.now() - prev.since < (dev.doneHoldMs != null ? dev.doneHoldMs : 900000)) {
      return { phase: TYPHUR_PHASE.DONE, since: prev.since };
    }
    return { phase: TYPHUR_PHASE.IDLE };
  }
  if (watts >= cookMin) {
    if (!prev || prev.phase === TYPHUR_PHASE.IDLE || prev.phase === TYPHUR_PHASE.DONE) {
      return { phase: TYPHUR_PHASE.PREHEAT, since: Date.now() };
    }
    // Elements cycle once at temperature; sustained high draw = still preheating
    if (prev.phase === TYPHUR_PHASE.PREHEAT && prev.since && Date.now() - prev.since > (dev.preheatMs || 180000)) {
      return { phase: TYPHUR_PHASE.COOK, since: prev.since };
    }
    return { phase: prev.phase, since: prev.since };
  }
  return { phase: prev && prev.phase === TYPHUR_PHASE.PREHEAT ? TYPHUR_PHASE.COOK : (prev ? prev.phase : TYPHUR_PHASE.IDLE), since: prev && prev.since };
}
async function typhurProbe(dev) {
  const reachable = dev.host ? await probePort(dev.host, dev.port || 80, 2000).catch(() => false) : null;
  let watts = null, plugOnline = null;
  if (dev.powerFrom) {
    const src = HOMEOS_STATE[dev.powerFrom];
    if (src) { plugOnline = src.online; watts = src.state && src.state.w != null ? src.state.w : null; }
  }
  const prev = (HOMEOS_STATE[dev.id] && HOMEOS_STATE[dev.id].state) || null;
  const cls = typhurClassify(dev, watts, prev);
  const online = dev.powerFrom ? !!plugOnline : (reachable === true);
  const state = {
    w: watts, phase: cls.phase, since: cls.since || (prev && prev.since) || null,
    reachable, boundPlug: dev.powerFrom || null,
    note: dev.powerFrom ? "inferred from plug power draw" : "network presence only — no vendor API",
  };
  if (watts != null && prev && prev.phase && cls.phase && prev.phase !== cls.phase) {
    broadcast("homeos_event", { id: dev.id, name: dev.name, event: "phase", from: prev.phase, to: cls.phase });
    if (cls.phase === TYPHUR_PHASE.DONE && dev.alertOnDone !== false) {
      sendAlert("Gridlantis-HL \u00b7 " + dev.name, "Cook finished \u2014 power dropped to idle", false);
    }
  }
  return { online, state };
}

module.exports = { TYPHUR_PHASE, typhurClassify, typhurProbe };
