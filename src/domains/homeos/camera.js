const { probePort } = require("../../net");

// ── Generic IP camera: reachability + RTSP URL + optional ffmpeg still ───────
async function camProbe(dev) {
  const port = dev.port || 554;
  const up = await probePort(dev.host, port, 2500);
  return { online: up, state: { rtsp: dev.rtsp || null, port } };
}

module.exports = { camProbe };
