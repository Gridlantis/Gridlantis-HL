const net = require("net");

const { CATALOG } = require("../domains/vmlab/catalog");
const hoststats = require("../domains/vmlab/hoststats");
const images = require("../domains/vmlab/images");
const mobileVms = require("../domains/vmlab/mobile");
const { kvmAvailable, kvmStatus, ovmfFiles, qemuBinary, qemuImgBinary, safeId, systemdRunAvailable, onPath } = require("../domains/vmlab/paths");
const { listUsb } = require("../domains/vmlab/usb");
const vm = require("../domains/vmlab/vm");
const ws = require("../ws");

// ─── VM LAB · the machine-facing API ─────────────────────────────────────────
// Everything here acts on the machine this code runs on. Metis mounts it for
// the "local" host (src/routes/vmlab.js) and the VM Lab agent mounts the very
// same module on a second device (src/vmlab-agent.js), so a remote host needs
// no parallel implementation — Metis just proxies to another copy of this file.
setImmediate(vm.startWatcher);   // not a module-level timer, so it runs even under the refactor harness preload

async function capabilities() {
  const probe = await kvmStatus();
  return {
    qemu: !!qemuBinary(), qemuImg: !!qemuImgBinary(), kvm: kvmAvailable(), kvmUsable: !!probe.ok, kvmProblem: probe.reason,
    uefi: !!ovmfFiles(), swtpm: !!onPath("swtpm"), systemdRun: systemdRunAvailable(),
  };
}

// The handshake a host answers with: enough for the Hosts tab to show what the
// machine is and whether it can actually run a VM, in one round trip.
async function agentInfo() {
  const os = require("os");
  const envs = vm.listEnvs();
  return {
    agent: "metis-vmlab", protocol: 1,
    hostname: os.hostname(), platform: os.platform(), arch: os.arch(), uptimeSec: Math.round(os.uptime()),
    capabilities: await capabilities(),
    threads: os.cpus().length, memoryBytes: os.totalmem(),
    envs: { total: envs.length, running: envs.filter(e => e.running).length },
  };
}

// Answers any /api/vmlab/* request that acts on this machine. Like every other
// Metis route module it claims a request simply by replying to it, and falls
// through untouched when the path is not one of its own.
async function handleApi(ctx) {
  const { req, res, parsed, pathname, json, readBody } = ctx;
  const body = async () => { const raw = (await readBody(2 * 1024 * 1024)).toString(); return raw ? JSON.parse(raw) : {}; };
  const m = (re) => pathname.match(re);
  let mm;

  // ── Identity ─────────────────────────────────────────────────────────────
  if (pathname === "/api/vmlab/agent/info" && req.method === "GET") return json(await agentInfo());

  // ── Overview (one call to paint the whole page) ──────────────────────────
  if (pathname === "/api/vmlab/overview" && req.method === "GET") {
    hoststats.touch();
    return json({
      capabilities: await capabilities(),
      envs: vm.listEnvs(),
      images: images.listImages(),
      downloads: images.listJobs(),
      catalog: CATALOG,
      usb: listUsb(),
      host: { threads: require("os").cpus().length, memoryBytes: require("os").totalmem() },
    });
  }

  // ── Host ─────────────────────────────────────────────────────────────────
  if (pathname === "/api/vmlab/host/specs" && req.method === "GET") {
    if (parsed.searchParams.get("refresh")) hoststats.refreshSpecs();
    return json(await hoststats.specs());
  }
  if (pathname === "/api/vmlab/host/stats" && req.method === "GET") {
    const s = hoststats.stats();
    const envs = vm.listEnvs().filter(e => e.running);
    s.allocated = { vcpus: envs.reduce((a, e) => a + e.cpus, 0), memoryMb: envs.reduce((a, e) => a + e.memoryMb, 0), running: envs.length };
    if (parsed.searchParams.get("since")) { const since = +parsed.searchParams.get("since"); s.history = s.history.filter(h => h.t > since); }
    return json(s);
  }
  if (pathname === "/api/vmlab/usb" && req.method === "GET") {
    const attached = {};
    for (const e of vm.listEnvs()) for (const u of e.usbAttached || []) attached[u.key] = { envId: e.id, envName: e.name, qid: u.qid };
    return json(listUsb().map(d => Object.assign(d, { attachedTo: attached[d.key] || null })));
  }

  // ── Images ───────────────────────────────────────────────────────────────
  if (pathname === "/api/vmlab/catalog" && req.method === "GET") return json(CATALOG);
  // New mobile VM: phone OSes, and one-step create (downloading first if needed).
  if (pathname === "/api/vmlab/mobile" && req.method === "GET") return json(mobileVms.mobileCatalog());
  if (pathname === "/api/vmlab/mobile" && req.method === "POST") {
    const b = await body();
    try { return json(await mobileVms.createMobile({ osId: String(b.osId || ""), name: b.name })); }
    catch (e) { return json(Object.assign({ error: e.message }, e.env ? { env: e.env } : {}), e.status || 500); }
  }
  if (pathname === "/api/vmlab/images" && req.method === "GET") return json({ images: images.listImages(), downloads: images.listJobs() });
  if (pathname === "/api/vmlab/images/download" && req.method === "POST") {
    const b = await body();
    return json(images.startDownload({ osId: b.osId, url: b.url, name: b.name }));
  }
  if ((mm = m(/^\/api\/vmlab\/downloads\/([^/]+)$/)) && req.method === "DELETE") {
    return json({ ok: images.cancelDownload(mm[1]) });
  }
  if (pathname === "/api/vmlab/images/upload" && (req.method === "PUT" || req.method === "POST")) {
    const q = parsed.searchParams;
    const name = q.get("name");
    if (!name) return json({ error: "name is required" }, 400);
    const rec = await images.receiveUpload(req, name, {
      name: q.get("label") || undefined, family: q.get("family") || undefined, osId: q.get("osId") || undefined,
      cloudInit: q.has("cloudInit") ? q.get("cloudInit") === "1" : undefined, firmware: q.get("firmware") || undefined,
      desktop: q.has("desktop") ? q.get("desktop") === "1" : undefined,
    });
    return json(rec);
  }
  // Bootable media already in Metis Files — the "pick an ISO you downloaded"
  // path. Returns paths under UPLOAD_DIR only; importing uses /images/import.
  if (pathname === "/api/vmlab/files" && req.method === "GET") {
    return json(images.listFromFiles());
  }
  if (pathname === "/api/vmlab/images/import" && req.method === "POST") {
    const b = await body();
    return json(await images.importPath(b.path, { name: b.name, family: b.family, osId: b.osId || undefined,
      cloudInit: b.cloudInit, firmware: b.firmware, desktop: b.desktop }, b.mode === "link" ? "link" : "copy"));
  }
  if ((mm = m(/^\/api\/vmlab\/images\/([^/]+)$/))) {
    if (req.method === "PATCH") {
      const img = images.updateImage(mm[1], await body());
      return (img ? json(img) : json({ error: "not found" }, 404));
    }
    if (req.method === "DELETE") {
      const r = images.deleteImage(mm[1], vm.imageInUse(mm[1]));
      return (r.error ? json({ error: r.error }, r.status) : json(r));
    }
  }

  // ── Environments ─────────────────────────────────────────────────────────
  if (pathname === "/api/vmlab/envs" && req.method === "GET") return json(vm.listEnvs());
  if (pathname === "/api/vmlab/envs" && req.method === "POST") return json(await vm.createEnv(await body()));

  if ((mm = m(/^\/api\/vmlab\/envs\/([^/]+)(?:\/([a-z-]+))?(?:\/([^/]+))?$/))) {
    const [, id, action, arg] = mm;
    if (!safeId(id)) return json({ error: "bad id" }, 400);
    if (!action) {
      if (req.method === "GET") { const e = vm.getEnv(id); return (e ? json(e) : json({ error: "environment not found" }, 404)); }
      if (req.method === "PATCH") return json(vm.updateEnvSettings(id, await body()));
      if (req.method === "DELETE") return json(await vm.deleteEnv(id));
    }
    if (req.method === "POST") {
      switch (action) {
        case "start": return json(await vm.startEnv(id));
        case "stop": return json(await vm.stopEnv(id));
        case "force-stop": return json(await vm.stopEnv(id, { force: true }));
        case "reboot": return json(await vm.rebootEnv(id));
        case "reset": return json(await vm.resetEnv(id));
        case "save-image": { const b = await body(); return json(await vm.saveAsImage(id, b.name)); }
        case "iso": { const b = await body(); return json(await vm.changeIso(id, b.isoId || null)); }
        case "usb": return json(await vm.usbAttach(id, await body()));
      }
    }
    if (action === "usb" && req.method === "DELETE" && arg) return json(await vm.usbDetach(id, arg));
    if (action === "guest" && req.method === "GET") return json(await vm.guestInfo(id));
    if (action === "logs" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(vm.logs(id, parsed.searchParams.get("kind")));
    }
  }
}

// ── VNC over WebSocket ───────────────────────────────────────────────────────
// noVNC in the browser <-> this tunnel <-> QEMU's VNC unix socket. The socket is
// only reachable through Metis (or the agent), so the console inherits its auth.
function handleVncUpgrade(req, socket, head, id) {
  const conn = ws.accept(req, socket, head);
  if (!conn) return true;
  const vnc = net.connect(vm.sock(id, "vnc"));
  vnc.on("data", d => { if (!conn.send(d)) vnc.pause(); });
  conn.on("drain", () => vnc.resume());
  conn.on("message", msg => { if (!vnc.write(msg)) socket.pause(); });
  vnc.on("drain", () => socket.resume());
  vnc.on("error", () => conn.close(1011, "VNC unavailable"));
  vnc.on("close", () => conn.close(1000, "VM console closed"));
  conn.on("close", () => vnc.destroy());
  return true;
}

// Shared by Metis and the agent: is this env in a state where a console can
// attach at all?
function vncTarget(id) {
  if (!safeId(id)) return null;
  const env = vm.getEnv(id);
  return env && env.running ? env : null;
}

module.exports = { agentInfo, capabilities, handleApi, handleVncUpgrade, vncTarget };
