const crypto = require("crypto");
const { EventEmitter } = require("events");

// ─── Minimal WebSocket server side (RFC 6455) ────────────────────────────────
// Just enough for binary tunnels such as the VM Lab VNC console: handshake,
// masked client frames, fragmentation, ping/pong and close. Open HL stays
// dependency-free, so no `ws` package.
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_MESSAGE = 16 * 1024 * 1024;

function reject(socket, status, text) {
  try { socket.end("HTTP/1.1 " + status + " " + text + "\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"); } catch {}
}

function frame(opcode, payload) {
  const len = payload.length;
  let head;
  if (len < 126) { head = Buffer.alloc(2); head[1] = len; }
  else if (len < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  head[0] = 0x80 | opcode;
  return Buffer.concat([head, payload]);
}

function accept(req, socket, head) {
  const key = req.headers["sec-websocket-key"];
  if (String(req.headers.upgrade || "").toLowerCase() !== "websocket" || !key) { reject(socket, 400, "Bad Request"); return null; }
  const protocols = String(req.headers["sec-websocket-protocol"] || "").split(",").map(s => s.trim()).filter(Boolean);
  const protocol = protocols.includes("binary") ? "binary" : null;
  const acceptKey = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
    "Sec-WebSocket-Accept: " + acceptKey + "\r\n" + (protocol ? "Sec-WebSocket-Protocol: " + protocol + "\r\n" : "") + "\r\n");
  socket.setNoDelay(true);
  socket.setTimeout(0);

  const ws = new EventEmitter();
  let buf = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
  let fragments = [], fragOp = 0, closed = false;

  ws.socket = socket;
  ws.send = (data, opcode = 2) => {
    if (closed) return false;
    return socket.write(frame(opcode, Buffer.isBuffer(data) ? data : Buffer.from(String(data))));
  };
  ws.close = (code = 1000, reason = "") => {
    if (closed) return;
    closed = true;
    const p = Buffer.alloc(2 + Buffer.byteLength(reason));
    p.writeUInt16BE(code, 0); p.write(reason, 2);
    try { socket.write(frame(8, p)); socket.end(); } catch {}
    ws.emit("close", code);
  };

  function parse() {
    for (;;) {
      if (buf.length < 2) return;
      const b0 = buf[0], b1 = buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (!masked) return ws.close(1002, "client frames must be masked");
      if (len > MAX_MESSAGE) return ws.close(1009, "message too big");
      if (buf.length < off + 4 + len) return;
      const mask = buf.subarray(off, off + 4);
      const payload = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      buf = buf.subarray(off + 4 + len);

      if (op === 8) { ws.close(payload.length >= 2 ? payload.readUInt16BE(0) : 1000); return; }
      if (op === 9) { ws.send(payload, 10); continue; }
      if (op === 10) continue;
      if (op === 0) fragments.push(payload);
      else { fragOp = op; fragments = [payload]; }
      if (fin) {
        const msg = fragments.length === 1 ? fragments[0] : Buffer.concat(fragments);
        fragments = [];
        ws.emit("message", msg, fragOp === 2);
      }
    }
  }
  // Optional keep-alive: ping every intervalMs and drop a peer that has sent
  // nothing (not even a pong) for three intervals — a phone that went to sleep
  // or changed networks never sends a close.
  let lastSeen = Date.now(), beat = null;
  ws.heartbeat = (intervalMs = 15000) => {
    clearInterval(beat);
    beat = setInterval(() => {
      if (closed) return clearInterval(beat);
      if (Date.now() - lastSeen > intervalMs * 3) { clearInterval(beat); try { socket.destroy(); } catch {} return; }
      try { socket.write(frame(9, Buffer.alloc(0))); } catch {}
    }, intervalMs);
    beat.unref();
  };
  socket.on("data", d => { lastSeen = Date.now(); buf = buf.length ? Buffer.concat([buf, d]) : d; parse(); });
  socket.on("close", () => { clearInterval(beat); if (!closed) { closed = true; ws.emit("close", 1006); } });
  socket.on("error", () => { try { socket.destroy(); } catch {} });
  socket.on("drain", () => ws.emit("drain"));
  if (buf.length) setImmediate(parse);
  return ws;
}

module.exports = { accept, reject };
