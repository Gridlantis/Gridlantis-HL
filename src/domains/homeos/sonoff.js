const { httpGet, httpPost } = require("../../net");

// ── Sonoff: Tasmota/ESPHome HTTP, or stock eWeLink "DIY mode" LAN API ────────
async function sonoffProbe(dev) {
  if (dev.mode === "ewelink") {
    // Stock firmware in DIY mode answers on :8081 with a zeroconf-style API
    try {
      const r = await httpPost(`http://${dev.host}:8081/zeroconf/info`,
        { deviceid: dev.devId || "", data: {} }, { "Content-Type": "application/json" }, 4000);
      const o = JSON.parse(r);
      const data = typeof o.data === "string" ? JSON.parse(o.data) : (o.data || {});
      return { online: true, state: { on: data.switch === "on", raw: data } };
    } catch (e) { return { online: false, err: e.message }; }
  }
  // Tasmota / ESPHome
  try {
    const r = await httpGet(`http://${dev.host}/cm?cmnd=Status%200`, 4000);
    const o = JSON.parse(r);
    const st = o.Status || {};
    const sns = (o.StatusSNS || {}).ENERGY || {};
    const power = (o.StatusSTS && (o.StatusSTS.POWER || o.StatusSTS.POWER1)) || null;
    return { online: true, state: {
      on: power ? power === "ON" : null,
      w: sns.Power, v: sns.Voltage, a: sns.Current, kwh: sns.Total,
      name: st.FriendlyName && st.FriendlyName[0], raw: o.StatusSTS || {},
    } };
  } catch (e) { return { online: false, err: e.message }; }
}
async function sonoffCommand(dev, cmd) {
  if (cmd.action !== "set") return { ok: false, error: "unsupported command" };
  try {
    if (dev.mode === "ewelink") {
      await httpPost(`http://${dev.host}:8081/zeroconf/switch`,
        { deviceid: dev.devId || "", data: { switch: cmd.on ? "on" : "off" } },
        { "Content-Type": "application/json" }, 4000);
    } else {
      const ch = dev.channel ? String(dev.channel) : "";
      await httpGet(`http://${dev.host}/cm?cmnd=Power${ch}%20${cmd.on ? "On" : "Off"}`, 4000);
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { sonoffCommand, sonoffProbe };
