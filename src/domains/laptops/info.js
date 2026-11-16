const net = require("net");

// Hardware and live usage for the PC host card. The setup script installs a
// systemd socket one port below VNC (tailnet address, Metis only) that answers
// each connection with one line of JSON from /etc/metis-remote/info.sh and
// hangs up. A PC set up before that existed simply refuses the connection.
function fetchInfo(pc, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: pc.host, port: (pc.port || 5900) - 1 });
    let buf = "";
    const done = (e, v) => { clearTimeout(t); sock.destroy(); e ? reject(e) : resolve(v); };
    const t = setTimeout(() => done(new Error("no answer")), timeoutMs);
    sock.setEncoding("utf8");
    sock.on("data", d => { buf += d; if (buf.length > 16384) done(new Error("reply too long")); });
    sock.on("error", e => done(new Error(e.code === "ECONNREFUSED" ? "not set up" : e.message)));
    sock.on("end", () => {
      let o;
      try { o = JSON.parse(buf); } catch { return done(new Error("unreadable reply")); }
      const kb = n => Math.max(0, +n || 0) * 1024;
      done(null, {
        cpu: String(o.cpu || ""), cores: +o.cores || 0, cpuPct: o.cpuPct == null ? null : +o.cpuPct,
        ramBytes: kb(o.ramKb), ramUsedBytes: o.ramAvailKb == null ? null : Math.max(0, kb(o.ramKb) - kb(o.ramAvailKb)),
        gpus: (Array.isArray(o.gpus) ? o.gpus : []).map(g => ({ name: String(g.name || ""),
          vramMb: g.vramMb == null ? null : +g.vramMb, vramUsedMb: g.vramUsedMb == null ? null : +g.vramUsedMb,
          util: g.util == null ? null : +g.util })),
        os: String(o.os || ""), uptime: +o.uptime || 0,
      });
    });
  });
}

module.exports = { fetchInfo };
