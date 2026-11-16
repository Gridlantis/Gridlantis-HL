const dgram = require("dgram");

// ── TP-Link Kasa: local TCP 9999, autokey-XOR "encryption" (key 171) ─────────
// Not real crypto — TP-Link's obfuscation — but it is fully local and needs no
// account. Newer firmware speaks KLAP instead and will simply not respond here.
function kasaEncrypt(str) {
  let key = 171; const buf = Buffer.alloc(str.length);
  for (let i = 0; i < str.length; i++) { key = key ^ str.charCodeAt(i); buf[i] = key; }
  return buf;
}
function kasaDecrypt(buf) {
  let key = 171; let out = "";
  for (let i = 0; i < buf.length; i++) { const c = buf[i]; out += String.fromCharCode(key ^ c); key = c; }
  return out;
}
function kasaSend(host, payload, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const net = require("net");
    const body = kasaEncrypt(JSON.stringify(payload));
    const head = Buffer.alloc(4); head.writeUInt32BE(body.length, 0);
    const sock = new net.Socket();
    let chunks = [], want = null, done = false;
    const finish = (err, val) => { if (done) return; done = true; try { sock.destroy(); } catch {} err ? reject(err) : resolve(val); };
    sock.setTimeout(timeoutMs);
    sock.on("timeout", () => finish(new Error("kasa timeout")));
    sock.on("error", e => finish(e));
    sock.on("data", d => {
      chunks.push(d);
      const all = Buffer.concat(chunks);
      if (want === null && all.length >= 4) want = all.readUInt32BE(0);
      if (want !== null && all.length >= want + 4) {
        try { finish(null, JSON.parse(kasaDecrypt(all.slice(4, want + 4)))); }
        catch (e) { finish(new Error("kasa parse: " + e.message)); }
      }
    });
    sock.connect(9999, host, () => sock.write(Buffer.concat([head, body])));
  });
}
async function kasaProbe(dev) {
  try {
    const r = await kasaSend(dev.host, { system: { get_sysinfo: {} } });
    const si = r && r.system && r.system.get_sysinfo;
    if (!si) return { online: false, err: "no sysinfo" };
    // Plugs report relay_state; multi-outlet strips report a children[] array;
    // bulbs report light_state.on_off.
    let on = null, children = null;
    if (Array.isArray(si.children) && si.children.length) {
      children = si.children.map(c => ({ id: c.id, alias: c.alias, on: c.state === 1 }));
      on = children.some(c => c.on);
    } else if (si.relay_state !== undefined) on = si.relay_state === 1;
    else if (si.light_state) on = si.light_state.on_off === 1;
    const state = { on, children, model: si.model, alias: si.alias, rssi: si.rssi, sw: si.sw_ver };
    if (si.brightness !== undefined) state.brightness = si.brightness;
    if (si.light_state && si.light_state.brightness !== undefined) state.brightness = si.light_state.brightness;
    // Energy monitoring, where the hardware has it (KP115, HS110, KP125…)
    try {
      const e = await kasaSend(dev.host, { emeter: { get_realtime: {} } }, 3000);
      const rt = e && e.emeter && e.emeter.get_realtime;
      if (rt && !rt.err_code) {
        state.w   = rt.power_mw   !== undefined ? rt.power_mw / 1000   : rt.power;
        state.v   = rt.voltage_mv !== undefined ? rt.voltage_mv / 1000 : rt.voltage;
        state.a   = rt.current_ma !== undefined ? rt.current_ma / 1000 : rt.current;
        state.kwh = rt.total_wh   !== undefined ? rt.total_wh / 1000   : rt.total;
      }
    } catch {}
    return { online: true, state };
  } catch (e) { return { online: false, err: e.message }; }
}
async function kasaCommand(dev, cmd) {
  if (cmd.action === "set") {
    const on = cmd.on ? 1 : 0;
    if (cmd.childId) {
      await kasaSend(dev.host, { context: { child_ids: [cmd.childId] }, system: { set_relay_state: { state: on } } });
    } else if (dev.kind === "bulb") {
      await kasaSend(dev.host, { "smartlife.iot.smartbulb.lightingservice": { transition_light_state: { on_off: on } } });
    } else {
      await kasaSend(dev.host, { system: { set_relay_state: { state: on } } });
    }
    return { ok: true };
  }
  if (cmd.action === "brightness") {
    const b = Math.max(1, Math.min(100, parseInt(cmd.value, 10) || 50));
    if (dev.kind === "bulb") await kasaSend(dev.host, { "smartlife.iot.smartbulb.lightingservice": { transition_light_state: { on_off: 1, brightness: b } } });
    else await kasaSend(dev.host, { "smartlife.iot.dimmer": { set_brightness: { brightness: b } } });
    return { ok: true };
  }
  return { ok: false, error: "unsupported command" };
}
// UDP broadcast discovery — every Kasa device on the subnet answers on 9999.
function kasaDiscover(ms = 3000) {
  return new Promise(resolve => {
    const found = [];
    const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
    const probe = kasaEncrypt(JSON.stringify({ system: { get_sysinfo: {} } }));
    sock.on("message", (msg, rinfo) => {
      try {
        const si = JSON.parse(kasaDecrypt(msg)).system.get_sysinfo;
        if (si) found.push({ vendor: "kasa", host: rinfo.address, name: si.alias || si.dev_name || "Kasa device",
          model: si.model, mac: si.mac || si.mic_mac,
          kind: /bulb|KL/i.test(si.model || "") ? "bulb" : (/cam|KC/i.test(si.model || "") ? "camera" : "plug") });
      } catch {}
    });
    sock.on("error", () => { try { sock.close(); } catch {} resolve(found); });
    sock.bind(() => {
      try {
        sock.setBroadcast(true);
        sock.send(probe, 0, probe.length, 9999, "255.255.255.255");
      } catch {}
      setTimeout(() => { try { sock.close(); } catch {} resolve(found); }, ms);
    });
  });
}

module.exports = { kasaCommand, kasaDecrypt, kasaDiscover, kasaEncrypt, kasaProbe, kasaSend };
