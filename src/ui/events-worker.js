// One /api/events connection shared by every Open HL tab in this browser.
//
// Browsers allow only six HTTP/1.1 connections per server, and an event stream
// holds one for as long as its page is open. With a stream per tab, three tabs
// used every slot and page loads queued behind them. Tabs instead connect to
// this SharedWorker (see openhlEvents in ui/assets.js), which keeps a single
// stream and forwards each event to all of them as { t: name, d: jsonString }.
//
// The stream uses the wrapped framing (/api/events?wrap=1): the first data line
// is the event name, so this worker needs no list of names.

const ports = new Set();
let es = null, isOpen = false, retry = 1000, timer = null;

function send(msg) { for (const p of ports) p.postMessage(msg); }

function connect() {
  timer = null;
  es = new EventSource("/api/events?wrap=1");
  es.onmessage = e => {
    const i = e.data.indexOf("\n");
    if (i < 0) return;
    const t = e.data.slice(0, i), d = e.data.slice(i + 1);
    if (t === "connected") { isOpen = true; retry = 1000; }
    send({ t, d });
  };
  es.onerror = () => {
    isOpen = false;
    send({ t: "error", d: "{}" });
    // A dropped stream the browser retries by itself. One it was refused
    // (signed out, server down at that moment) it gives up on, so retry here.
    if (es && es.readyState === EventSource.CLOSED) {
      es = null;
      if (ports.size) { timer = setTimeout(connect, retry); retry = Math.min(retry * 2, 30000); }
    }
  };
}

function ensure() { if (!es && !timer) connect(); }

function stop() {
  if (es) { es.close(); es = null; }
  if (timer) { clearTimeout(timer); timer = null; }
  isOpen = false;
}

function join(port) {
  ports.add(port);
  ensure();
  // A tab that joins an already open stream still needs to hear it is live.
  if (isOpen) port.postMessage({ t: "connected", d: "{}" });
}

onconnect = e => {
  const port = e.ports[0];
  if (typeof EventSource === "undefined") { port.postMessage({ t: "unsupported" }); return; }
  // "bye" when the page is hidden for navigation or the back/forward cache,
  // "hello" when a cached page comes back.
  port.onmessage = ev => {
    if (ev.data === "bye") { ports.delete(port); if (!ports.size) stop(); }
    else if (ev.data === "hello") join(port);
  };
  join(port);
};
