const net = require("net");

// ─── VM LAB · QMP (QEMU monitor) and QGA (guest agent) over unix sockets ─────
// Both speak newline-delimited JSON. One short-lived connection per call keeps
// this stateless: nothing to reconnect after a VM or Metis restarts.

function jsonLines(sock, onMsg) {
  let buf = "";
  sock.setEncoding("utf8");
  sock.on("data", d => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, i); buf = buf.slice(i + 1);
      // QGA prefixes a guest-sync-delimited reply with a raw 0xFF byte, which
      // arrives as U+FFFD after UTF-8 decoding. Start at the JSON object.
      const start = line.indexOf("{");
      if (start === -1) continue;
      line = line.slice(start).trim();
      let m; try { m = JSON.parse(line); } catch { continue; }
      onMsg(m);
    }
  });
}

// Run QMP commands in order on one connection; resolves with their returns.
function qmp(sockPath, commands, timeoutMs = 5000) {
  const cmds = Array.isArray(commands) ? commands : [commands];
  return new Promise((resolve, reject) => {
    const sock = net.connect(sockPath);
    const results = [];
    let step = -1, done = false;
    const finish = (err, val) => { if (done) return; done = true; clearTimeout(t); sock.destroy(); err ? reject(err) : resolve(val); };
    const t = setTimeout(() => finish(new Error("QEMU monitor timed out")), timeoutMs);
    const next = () => {
      step++;
      if (step === 0) return sock.write(JSON.stringify({ execute: "qmp_capabilities" }) + "\n");
      if (step > cmds.length) return finish(null, Array.isArray(commands) ? results : results[0]);
      const c = cmds[step - 1];
      sock.write(JSON.stringify(typeof c === "string" ? { execute: c } : c) + "\n");
    };
    jsonLines(sock, m => {
      if (m.QMP) return next();
      if (m.event) return;
      if (m.error) return finish(new Error(m.error.desc || "QMP error"));
      if (step >= 1) results.push(m.return);
      next();
    });
    sock.on("error", e => finish(new Error(e.code === "ENOENT" || e.code === "ECONNREFUSED" ? "VM is not running" : e.message)));
  });
}

// Human monitor command through QMP (e.g. "info usernet").
const hmp = (sockPath, line) => qmp(sockPath, { execute: "human-monitor-command", arguments: { "command-line": line } });

// One guest-agent command. guest-sync-delimited first flushes anything a
// previous, timed-out client left in the channel.
function qga(sockPath, execute, args, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(sockPath);
    const syncId = Math.floor(Math.random() * 2 ** 31);
    let synced = false, done = false;
    const finish = (err, val) => { if (done) return; done = true; clearTimeout(t); sock.destroy(); err ? reject(err) : resolve(val); };
    const t = setTimeout(() => finish(new Error("guest agent is not responding (is qemu-guest-agent installed and running in the VM?)")), timeoutMs);
    sock.on("connect", () => sock.write(JSON.stringify({ execute: "guest-sync-delimited", arguments: { id: syncId } }) + "\n"));
    jsonLines(sock, m => {
      if (!synced) {
        if (m.return === syncId) {
          synced = true;
          sock.write(JSON.stringify(args ? { execute, arguments: args } : { execute }) + "\n");
        }
        return;
      }
      if (m.error) return finish(new Error(m.error.desc || "guest agent error"));
      finish(null, m.return);
    });
    sock.on("error", e => finish(new Error(e.code === "ENOENT" || e.code === "ECONNREFUSED" ? "VM is not running" : e.message)));
  });
}

// Run a program in the guest and wait for it. Output is base64 in QGA.
async function guestExec(sockPath, file, argv, { timeoutSec = 60, input } = {}) {
  const args = { path: file, arg: argv, "capture-output": true };
  if (input != null) args["input-data"] = Buffer.from(String(input)).toString("base64");
  const { pid } = await qga(sockPath, "guest-exec", args, 8000);
  const deadline = Date.now() + timeoutSec * 1000;
  for (;;) {
    const st = await qga(sockPath, "guest-exec-status", { pid }, 8000);
    if (st.exited) {
      return {
        exitCode: st.exitcode != null ? st.exitcode : (st.signal != null ? 128 + st.signal : null),
        stdout: st["out-data"] ? Buffer.from(st["out-data"], "base64").toString("utf8") : "",
        stderr: st["err-data"] ? Buffer.from(st["err-data"], "base64").toString("utf8") : "",
        truncated: !!(st["out-truncated"] || st["err-truncated"]),
      };
    }
    if (Date.now() > deadline) {
      const e = new Error("timed out after " + timeoutSec + "s"); e.timeout = true; throw e;
    }
    await new Promise(r => setTimeout(r, 400));
  }
}

module.exports = { guestExec, hmp, qga, qmp };
