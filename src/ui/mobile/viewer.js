/* Mobile host — mirror and control one Android phone (scrcpy over Gridlantis-HL). Plain script, uses window.VL. */
(function () {
  "use strict";
  const { h, toast, writeClipboard } = window.VL;
  const $ = s => document.querySelector(s);
  const SERIAL = document.body.dataset.serial;
  const VIEW_ONLY = document.body.dataset.viewonly === "1";   // AirPlay: watch and listen, no input
  const enc = encodeURIComponent;

  // ── Settings ────────────────────────────────────────────────────────────────
  const Q_KEY = "openhl-mobile-quality";
  let Q = { max: "1600", br: "8000000", fps: "60", audio: "1", audioDup: "" };
  try { Q = Object.assign(Q, JSON.parse(localStorage.getItem(Q_KEY) || "{}")); } catch (e) {}
  ["max", "br", "fps"].forEach(k => {
    const sel = $("#q-" + k); sel.value = Q[k];
    sel.addEventListener("change", () => { Q[k] = sel.value; saveQ(); reconnect(); });
  });
  function saveQ() { try { localStorage.setItem(Q_KEY, JSON.stringify(Q)); } catch (e) {} }

  // ── Display: WebCodecs on a canvas when the page is secure, otherwise
  // jMuxer feeding a <video> through Media Source Extensions (works on plain
  // http, which is how Gridlantis-HL is usually reached; a little more latency).
  const USE_WEBCODECS = typeof window.VideoDecoder === "function" && window.isSecureContext;
  const canvas = $("#cv");
  let media = canvas;                              // the element that shows the phone and takes input
  if (!USE_WEBCODECS) {
    media = h("video", { muted: true, autoplay: true, playsinline: true, tabindex: "0" });
    media.muted = true;
    media.style.cssText = "max-width:100%;max-height:100%;touch-action:none;cursor:pointer;outline:none;background:#000;";
    canvas.replaceWith(media);
  }
  const ctx2d = USE_WEBCODECS ? canvas.getContext("2d") : null;

  let ws = null, size = { w: 0, h: 0 }, connected = false, retry = 0, retryT = null, closing = false;
  let decoder = null, codec = null, pendingConfig = null, needKey = true;
  let jmux = null, jmuxConfig = null, jmuxReady = false, jmuxQueue = [];

  function setStatus(text, dot) { $("#c-status").textContent = text; $("#c-dot").className = "dot " + (dot || ""); }
  function overlay(title, text, actions) {
    $("#overlay").hidden = false; $("#ov-title").textContent = title; $("#ov-text").textContent = text || "";
    const a = $("#ov-acts"); a.innerHTML = ""; (actions || []).forEach(x => a.appendChild(x));
  }
  const hideOverlay = () => { $("#overlay").hidden = true; };
  const retryBtn = () => h("button", { class: "btn primary", onclick: () => { retry = 0; connect(); } }, "Try again");
  const backBtn = () => h("a", { class: "btn", href: "/mobile" }, "Mobile host");

  // ── Video ───────────────────────────────────────────────────────────────────
  // "avc1.PPCCLL" from the SPS in an Annex B config packet.
  function codecFromConfig(data) {
    for (let i = 0; i + 4 < data.length; i++) {
      if (data[i] === 0 && data[i + 1] === 0 && (data[i + 2] === 1 || (data[i + 2] === 0 && data[i + 3] === 1))) {
        const n = data[i + 2] === 1 ? i + 3 : i + 4;
        if ((data[n] & 0x1f) === 7) return "avc1." + [data[n + 1], data[n + 2], data[n + 3]].map(x => x.toString(16).padStart(2, "0")).join("");
      }
    }
    return "avc1.42e01f";
  }
  const concat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a, 0); o.set(b, a.length); return o; };

  function resetDecoder() {
    try { decoder && decoder.state !== "closed" && decoder.close(); } catch (e) {}
    decoder = null; codec = null; needKey = true;
  }
  function onSession(w, hgt) {
    if (w && hgt) size = { w, h: hgt };
    if (USE_WEBCODECS) { if (w && hgt) { canvas.width = w; canvas.height = hgt; } resetDecoder(); }
    else startJmux();
  }
  function onPacket(flags, pts, data) {
    const config = flags & 1, key = flags & 2;
    if (USE_WEBCODECS) {
      if (config) {
        pendingConfig = data;
        const c = codecFromConfig(data);
        if (!decoder || decoder.state === "closed" || c !== codec) {
          resetDecoder();
          decoder = new VideoDecoder({
            output: f => {
              // AirPlay sends no size up front, and it changes on rotation.
              if (canvas.width !== f.displayWidth || canvas.height !== f.displayHeight) {
                canvas.width = f.displayWidth; canvas.height = f.displayHeight; size = { w: f.displayWidth, h: f.displayHeight };
              }
              ctx2d.drawImage(f, 0, 0, canvas.width, canvas.height); f.close();
            },
            error: e => { console.warn("decoder", e); resetDecoder(); send({ t: "cmd", c: "resetVideo" }); },
          });
          decoder.configure({ codec: c, optimizeForLatency: true });
          codec = c;
        }
        return;
      }
      if (!decoder || decoder.state !== "configured") return;
      if (needKey && !key) return;
      // Stay live: if decoding falls behind, skip to the next key frame.
      if (!key && decoder.decodeQueueSize > 4) { needKey = true; send({ t: "cmd", c: "resetVideo" }); return; }
      if (key && pendingConfig) { data = concat(pendingConfig, data); }
      needKey = false;
      decoder.decode(new EncodedVideoChunk({ type: key ? "key" : "delta", timestamp: Number(pts), data }));
    } else {
      if (config) { jmuxConfig = data; return; }
      if (!jmux) return;
      if (key && jmuxConfig) data = concat(jmuxConfig, data);
      // Until its MediaSource is open jMuxer can drop what it is fed — and with
      // it the key frame, which an iPhone may not send again for a long time.
      // Hold everything from the last key frame and feed it once ready.
      if (!jmuxReady) { if (key) jmuxQueue = []; if (key || jmuxQueue.length) jmuxQueue.push(data); return; }
      jmux.feed({ video: data });
    }
  }
  function startJmux() {
    try { jmux && jmux.destroy(); } catch (e) {}
    if (typeof window.JMuxer !== "function") { overlay("Cannot show video", "The video player script did not load.", [retryBtn()]); return; }
    jmuxReady = false; jmuxQueue = [];
    const mine = jmux = new window.JMuxer({ node: media, mode: "video", flushingTime: 1, maxDelay: 200, clearBuffer: true, fps: +Q.fps || 60, debug: false,
      onReady: () => { if (jmux !== mine) return; jmuxReady = true; jmuxQueue.forEach(d => mine.feed({ video: d })); jmuxQueue = []; },
      onError: () => send({ t: "cmd", c: "resetVideo" }) });
    media.play().catch(() => {});
  }
  // MSE buffers; keep the picture at the live edge.
  if (!USE_WEBCODECS) setInterval(() => {
    const b = media.buffered;
    if (b && b.length) { const end = b.end(b.length - 1); if (end - media.currentTime > 0.25) media.currentTime = Math.max(0, end - 0.03); }
    if (media.paused && connected) media.play().catch(() => {});
  }, 250);

  // ── Connection ──────────────────────────────────────────────────────────────
  function connect() {
    clearTimeout(retryT);
    closing = false;
    if (!connected) overlay(retry ? "Reconnecting…" : "Connecting to the phone…", "", [backBtn()]);
    setStatus("connecting…", "starting");
    const url = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/mobile/" + enc(SERIAL) + "/stream" +
      "?max=" + Q.max + "&br=" + Q.br + "&fps=" + Q.fps + (screenOff ? "&screenOff=1" : "") +
      (Q.audio ? "&audio=" + AUDIO_CODEC + (Q.audioDup ? "&audioDup=1" : "") : "");
    ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    let lastError = "";
    ws.onmessage = ev => {
      if (typeof ev.data === "string") {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.type === "status" && m.text === "connected") { connected = true; retry = 0; hideOverlay(); setStatus(VIEW_ONLY ? "mirroring" : "connected", "running"); media.focus(); }
        else if (m.type === "status" && m.text === "waiting") { connected = true; retry = 0; overlay(m.title, m.hint, [backBtn()]); setStatus("waiting", "starting"); }
        else if (m.type === "status") setStatus(m.text, "starting");
        else if (m.type === "error") lastError = m.text;
        else if (m.type === "clipboard") onPhoneClipboard(m.text);
        else if (m.type === "audio") audioStarted(m.codec);
        else if (m.type === "audioOff") audioUnavailable(m.text);
        return;
      }
      const d = new Uint8Array(ev.data);
      if (d[0] === 2) { const v = new DataView(ev.data); onSession(v.getUint32(1), v.getUint32(5)); }
      else if (d[0] === 1) { const v = new DataView(ev.data); onPacket(d[1], v.getBigUint64(2), d.subarray(10)); }
      else if (d[0] === 3) { const v = new DataView(ev.data); onAudio(d[1], v.getBigUint64(2), d.subarray(10)); }
    };
    ws.onclose = () => {
      const was = connected; connected = false; ws = null;
      setStatus("disconnected", "error");
      if (closing) return;
      if (/unauthorized|no permissions|device .* not found|offline/i.test(lastError) || retry >= 5) {
        return overlay("Can't mirror the phone", lastError || "The connection keeps dropping.", [retryBtn(), backBtn()]);
      }
      retry++;
      overlay(was ? "Connection lost — reconnecting…" : "Starting… retrying", lastError, [backBtn()]);
      retryT = setTimeout(connect, Math.min(8000, 1000 * retry));
    };
  }
  function reconnect() { closing = true; if (ws) ws.close(); retry = 0; setTimeout(connect, 300); }
  const send = o => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };

  // ── Audio ───────────────────────────────────────────────────────────────────
  // 48 kHz stereo from the phone. Opus decoded by WebCodecs on secure pages;
  // on plain http (no AudioDecoder there) the phone sends raw PCM instead,
  // ~1.5 Mbps. Either way each chunk is scheduled back to back on an
  // AudioContext, ~80 ms behind live, and re-synced after a gap or a pile-up.
  const AUDIO_CODEC = typeof window.AudioDecoder === "function" && window.isSecureContext ? "opus" : "raw";
  const RATE = 48000, LEAD = 0.08;
  let actx = null, aNext = 0, adec = null, audioCodec = null;
  const audioStats = { chunks: 0, seconds: 0 };
  function ensureAudio() {
    if (!Q.audio) return;
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: RATE, latencyHint: "interactive" }); } catch (e) { return; } }
    if (actx.state === "suspended") actx.resume().then(paintAudio, () => {});
  }
  // Browsers only start sound after a click or key press.
  ["pointerdown", "keydown"].forEach(t => window.addEventListener(t, ensureAudio, true));
  function schedule(channels, frames) {
    if (!actx || actx.state !== "running" || !frames) return;
    const buf = actx.createBuffer(2, frames, RATE);
    buf.copyToChannel(channels[0], 0); buf.copyToChannel(channels[1] || channels[0], 1);
    const src = actx.createBufferSource(); src.buffer = buf; src.connect(actx.destination);
    const now = actx.currentTime;
    if (aNext < now + 0.01 || aNext > now + LEAD + 0.25) aNext = now + LEAD;
    src.start(aNext); aNext += frames / RATE;
    audioStats.chunks++; audioStats.seconds += frames / RATE;
  }
  function onAudio(flags, pts, data) {
    if (!Q.audio) return;
    if (audioCodec === "raw") {
      if (flags & 1) return;
      const n = data.length >> 2, l = new Float32Array(n), r = new Float32Array(n);
      const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      for (let i = 0; i < n; i++) { l[i] = dv.getInt16(i * 4, true) / 32768; r[i] = dv.getInt16(i * 4 + 2, true) / 32768; }
      schedule([l, r], n);
    } else if (audioCodec === "opus") {
      if (flags & 1) {                       // OpusHead
        try { adec && adec.state !== "closed" && adec.close(); } catch (e) {}
        adec = new AudioDecoder({
          output: ad => {
            const n = ad.numberOfFrames, ch = [];
            for (let c = 0; c < Math.min(2, ad.numberOfChannels); c++) { const a = new Float32Array(n); ad.copyTo(a, { planeIndex: c, format: "f32-planar" }); ch.push(a); }
            ad.close(); schedule(ch, n);
          },
          error: e => console.warn("audio decoder", e),
        });
        adec.configure({ codec: "opus", sampleRate: RATE, numberOfChannels: 2, description: data.slice() });
        return;
      }
      if (adec && adec.state === "configured") adec.decode(new EncodedAudioChunk({ type: "key", timestamp: Number(pts), data }));
    }
  }
  function audioStarted(codec) { audioCodec = codec; ensureAudio(); paintAudio(); }
  function audioUnavailable(text) { audioCodec = null; $("#a-info").textContent = text; paintAudio(text); }
  function paintAudio(off) {
    const b = $("#b-audio"), on = !!Q.audio;
    const waiting = on && audioCodec && (!actx || actx.state !== "running");
    b.firstChild.className = "fa-solid " + (!on || off ? "fa-volume-xmark" : "fa-volume-high");
    b.classList.toggle("primary", on && !!audioCodec && !waiting);
    b.title = !on ? "Phone audio is off — click to turn it on"
      : typeof off === "string" ? off
      : waiting ? "Click anywhere to start the sound (browsers wait for a click)"
      : audioCodec ? "Phone audio on (" + (audioCodec === "opus" ? "Opus" : "PCM") + ") — click to turn off" : "Phone audio: starting…";
    b.dataset.chunks = audioStats.chunks;
    $("#a-on").checked = on; $("#a-dup").checked = !!Q.audioDup;
    if (on && audioCodec && typeof off !== "string") $("#a-info").textContent = "Playing " + (audioCodec === "opus" ? "Opus" : "uncompressed PCM, ~1.5 Mbps") + ". Needs Android 11 or newer.";
  }
  function setAudio(on, dup) {
    Q.audio = on ? "1" : ""; if (dup !== undefined) Q.audioDup = dup ? "1" : "";
    saveQ(); audioCodec = null;
    if (on) ensureAudio(); else if (actx) { actx.close(); actx = null; }
    paintAudio(); reconnect();
  }
  $("#b-audio").addEventListener("click", () => setAudio(!Q.audio));
  $("#a-on").addEventListener("change", e => setAudio(e.target.checked));
  $("#a-dup").addEventListener("change", e => setAudio(!!Q.audio, e.target.checked));
  setInterval(() => { if (Q.audio && audioCodec) paintAudio(); }, 2000);
  paintAudio();

  // ── Pointer: tap, swipe, multi-touch, wheel; right = Back, middle = Home ─────
  const down = new Map();
  function pos(e) {
    const r = media.getBoundingClientRect();
    return { x: Math.max(0, Math.min(size.w, (e.clientX - r.left) / r.width * size.w)), y: Math.max(0, Math.min(size.h, (e.clientY - r.top) / r.height * size.h)) };
  }
  const fingerId = e => e.pointerType === "mouse" ? -1 : (e.pointerId % 1000);
  media.addEventListener("pointerdown", e => {
    if (!connected || !size.w || VIEW_ONLY) return;
    media.focus();
    if (e.button === 2) { send({ t: "back", a: 0 }); send({ t: "back", a: 1 }); e.preventDefault(); return; }
    if (e.button === 1) { key(3); e.preventDefault(); return; }
    if (e.button !== 0) return;
    media.setPointerCapture(e.pointerId);
    down.set(e.pointerId, true);
    send(Object.assign({ t: "touch", a: 0, id: fingerId(e) }, pos(e)));
    e.preventDefault();
  });
  media.addEventListener("pointermove", e => { if (down.has(e.pointerId)) send(Object.assign({ t: "touch", a: 2, id: fingerId(e) }, pos(e))); });
  const up = e => { if (!down.has(e.pointerId)) return; down.delete(e.pointerId); send(Object.assign({ t: "touch", a: 1, id: fingerId(e) }, pos(e))); };
  media.addEventListener("pointerup", up);
  media.addEventListener("pointercancel", up);
  media.addEventListener("contextmenu", e => e.preventDefault());
  media.addEventListener("wheel", e => {
    if (!connected || VIEW_ONLY) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 1 : 1 / 100;
    send(Object.assign({ t: "scroll", dx: Math.max(-16, Math.min(16, -e.deltaX * unit)), dy: Math.max(-16, Math.min(16, -e.deltaY * unit)) }, pos(e)));
  }, { passive: false });

  // ── Keyboard ────────────────────────────────────────────────────────────────
  // Printable text goes as text (any language, symbols); everything else, and
  // anything with Ctrl/Alt/Meta, as Android keycodes with meta state.
  const KC = { Enter: 66, NumpadEnter: 66, Backspace: 67, Delete: 112, Tab: 61, Space: 62, Escape: 111, ArrowUp: 19, ArrowDown: 20,
    ArrowLeft: 21, ArrowRight: 22, Home: 122, End: 123, PageUp: 92, PageDown: 93, Insert: 124, Minus: 69, Equal: 70, BracketLeft: 71,
    BracketRight: 72, Backslash: 73, Semicolon: 74, Quote: 75, Comma: 55, Period: 56, Slash: 76, Backquote: 68 };
  for (let i = 0; i < 26; i++) KC["Key" + String.fromCharCode(65 + i)] = 29 + i;
  for (let i = 0; i < 10; i++) { KC["Digit" + i] = 7 + i; KC["Numpad" + i] = 144 + i; }
  for (let i = 1; i <= 12; i++) KC["F" + i] = 130 + i;
  const MODS = new Set(["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight", "CapsLock"]);
  const meta = e => (e.shiftKey ? 0x41 : 0) | (e.altKey ? 0x12 : 0) | (e.ctrlKey ? 0x3000 : 0) | (e.metaKey ? 0x30000 : 0);
  function key(code, m) { send({ t: "key", a: 0, code, meta: m || 0 }); send({ t: "key", a: 1, code, meta: m || 0 }); }
  const focused = () => document.activeElement === media || document.activeElement === document.body;

  // Ctrl+V: the browser only hands over clipboard text in a real paste event,
  // and not to a canvas/video — so a hidden box takes the paste (same as the
  // PC viewer), and the text goes to the phone with "paste" set.
  const pasteSink = h("textarea", { "aria-hidden": "true", tabindex: "-1", style: { position: "fixed", left: "-9999px", top: "0", width: "1px", height: "1px", opacity: "0" } });
  document.body.appendChild(pasteSink);
  let pastePending = false, pasteT = null;
  pasteSink.addEventListener("paste", e => {
    e.preventDefault();
    if (!pastePending) return;
    pastePending = false; clearTimeout(pasteT);
    const text = e.clipboardData && e.clipboardData.getData("text/plain");
    if (text) { send({ t: "clipboard", s: text, paste: true }); $("#clip-text").value = text; }
    media.focus();
  });

  window.addEventListener("keydown", e => {
    lastGesture = Date.now();
    if (!connected || !focused() || VIEW_ONLY) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "v" || e.key === "V")) {
      pasteSink.value = ""; pasteSink.focus(); pastePending = true;
      clearTimeout(pasteT); pasteT = setTimeout(() => { if (pastePending) { pastePending = false; key(50, 0x3000); media.focus(); } }, 400);
      return;
    }
    if (MODS.has(e.code)) return;
    e.preventDefault();
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) { send({ t: "text", s: e.key }); return; }
    const code = KC[e.code];
    if (code !== undefined) send({ t: "key", a: 0, code, meta: meta(e), repeat: e.repeat ? 1 : 0 });
  }, true);
  window.addEventListener("keyup", e => {
    if (!connected || !focused() || MODS.has(e.code) || VIEW_ONLY) return;
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V")) return;
    const code = KC[e.code];
    if (code !== undefined) { e.preventDefault(); send({ t: "key", a: 1, code, meta: meta(e) }); }
  }, true);
  let lastGesture = 0;
  window.addEventListener("mousedown", () => { lastGesture = Date.now(); }, true);

  // ── Clipboard: phone → here ─────────────────────────────────────────────────
  async function onPhoneClipboard(text) {
    $("#clip-text").value = text;
    const ok = Date.now() - lastGesture < 5000 ? await writeClipboard(text) : false;
    if (!ok) toast("Copied on the phone — open the panel and press Copy");
    if (connected) media.focus();
  }
  $("#clip-send").addEventListener("click", () => { send({ t: "clipboard", s: $("#clip-text").value, paste: false }); toast("Sent to the phone's clipboard"); });
  $("#clip-paste").addEventListener("click", () => { send({ t: "clipboard", s: $("#clip-text").value, paste: true }); media.focus(); });
  $("#clip-copy").addEventListener("click", async () => toast(await writeClipboard($("#clip-text").value) ? "Copied" : "Copy failed"));

  // ── Toolbar ─────────────────────────────────────────────────────────────────
  const NAV = { home: 3, recents: 187, power: 26, volup: 24, voldown: 25 };
  document.querySelectorAll("[data-key]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.key;
    if (k === "back") { send({ t: "back", a: 0 }); send({ t: "back", a: 1 }); }
    else key(NAV[k]);
    media.focus();
  }));
  let notifT = null;
  $("#b-notif").addEventListener("click", () => { clearTimeout(notifT); notifT = setTimeout(() => send({ t: "cmd", c: "notifications" }), 250); });
  $("#b-notif").addEventListener("dblclick", () => { clearTimeout(notifT); send({ t: "cmd", c: "settings" }); });
  $("#b-rotate").addEventListener("click", () => send({ t: "cmd", c: "rotate" }));
  let screenOff = false;
  $("#b-screenoff").addEventListener("click", () => {
    screenOff = !screenOff; send({ t: "power", on: !screenOff });
    $("#b-screenoff").classList.toggle("primary", screenOff);
    toast(screenOff ? "Phone screen off — still mirroring and controllable" : "Phone screen on");
  });
  $("#b-side").addEventListener("click", () => { $("#drawer").hidden = !$("#drawer").hidden; });
  $("#b-full").addEventListener("click", () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); });

  // Screenshot and recording, from what is on screen.
  function frameCanvas() {
    if (USE_WEBCODECS) return canvas;
    const c = document.createElement("canvas"); c.width = media.videoWidth || size.w; c.height = media.videoHeight || size.h;
    c.getContext("2d").drawImage(media, 0, 0, c.width, c.height); return c;
  }
  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  function save(blob, name) { const a = h("a", { href: URL.createObjectURL(blob), download: name }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
  $("#b-shot").addEventListener("click", () => {
    if (!size.w) return;
    frameCanvas().toBlob(b => { if (b) { save(b, "phone-" + stamp() + ".png"); toast("Screenshot saved", "ok"); } }, "image/png");
  });
  let recorder = null, chunks = [];
  $("#b-rec").addEventListener("click", () => {
    if (recorder) { recorder.stop(); return; }
    const stream = USE_WEBCODECS ? canvas.captureStream(30) : (media.captureStream ? media.captureStream() : media.mozCaptureStream ? media.mozCaptureStream() : null);
    if (!stream || typeof MediaRecorder !== "function") return toast("This browser cannot record", "bad");
    chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm" });
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => { save(new Blob(chunks, { type: "video/webm" }), "phone-" + stamp() + ".webm"); recorder = null; $("#b-rec").classList.remove("rec"); toast("Recording saved", "ok"); };
    recorder.start(1000);
    $("#b-rec").classList.add("rec");
    toast("Recording — press again to stop");
  });

  // Files: the button, or drop onto the screen. APKs are installed.
  async function sendFile(f) {
    const apk = /\.apk$/i.test(f.name);
    toast((apk ? "Installing " : "Sending ") + f.name + "…");
    try {
      const r = await fetch("/api/mobile/" + enc(SERIAL) + "/" + (apk ? "install" : "push") + "?name=" + enc(f.name), { method: "POST", body: f });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.statusText);
      toast(apk ? f.name + " installed" : f.name + " → " + j.path, "ok");
    } catch (e) { toast(f.name + ": " + e.message, "bad"); }
  }
  $("#b-file").addEventListener("click", () => $("#f-file").click());
  $("#f-file").multiple = true;
  $("#f-file").addEventListener("change", async () => { for (const f of $("#f-file").files) await sendFile(f); $("#f-file").value = ""; });
  const screen = $("#screen");
  let dragDepth = 0;
  screen.addEventListener("dragenter", e => { if ([...e.dataTransfer.types].includes("Files")) { dragDepth++; $("#drop-hint").hidden = false; e.preventDefault(); } });
  screen.addEventListener("dragover", e => { if ([...e.dataTransfer.types].includes("Files")) e.preventDefault(); });
  screen.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; $("#drop-hint").hidden = true; } });
  screen.addEventListener("drop", async e => {
    e.preventDefault(); dragDepth = 0; $("#drop-hint").hidden = true;
    for (const f of e.dataTransfer.files) await sendFile(f);
  });

  window.addEventListener("beforeunload", () => { closing = true; if (ws) ws.close(); });
  if (!USE_WEBCODECS && !window.MediaSource && !window.ManagedMediaSource) {
    overlay("This browser cannot play the phone's video", "It has neither WebCodecs (secure pages) nor Media Source Extensions. Try Chrome, Edge, Firefox or the Gridlantis-HL desktop app.", [backBtn()]);
  } else connect();
})();
