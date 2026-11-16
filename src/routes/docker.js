const fs = require("fs");
const path = require("path");

const { authenticated } = require("../session");
const containers = require("../domains/docker/containers");
const engine = require("../domains/docker/engine");
const images = require("../domains/docker/images");
const { dockerHtml } = require("../pages/docker");
const ws = require("../ws");

// Docker: containers, images and the interactive terminal tunnel. The daemon
// may be absent or unreachable — that is a normal state the page renders, not
// an error, so /overview always answers 200 with an `engine` block.
const STATIC_ROOTS = {
  "/docker/assets/": path.join(__dirname, "../ui/docker"),
  "/docker/vendor/": path.join(__dirname, "../ui/vendor/xterm"),
  "/docker/shared/": path.join(__dirname, "../ui/shared"),
};
const MIME = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".map": "application/json" };

const ENGINE_HELP = {
  "no-socket": "Docker is not installed or its daemon is not running on this host.",
  "no-permission": "Docker is running, but this user may not use its socket. Add the user to the 'docker' group and log in again.",
  "unreachable": "The Docker socket exists but the daemon did not answer.",
};

module.exports = async function dockerRoutes(ctx) {
  const { req, res, parsed, pathname, json, html, readBody } = ctx;
  if (!pathname.startsWith("/docker") && !pathname.startsWith("/api/docker")) return;

  const body = async () => { const raw = (await readBody(1024 * 1024)).toString(); return raw ? JSON.parse(raw) : {}; };
  const fail = e => json({ error: e.message }, e.status || 500);
  const m = re => pathname.match(re);

  try {
    // ── Page + static ────────────────────────────────────────────────────────
    if (pathname === "/docker" && req.method === "GET") return html(dockerHtml());
    for (const [prefix, root] of Object.entries(STATIC_ROOTS)) {
      if (pathname.startsWith(prefix) && req.method === "GET") {
        const file = path.resolve(root, decodeURIComponent(pathname.slice(prefix.length)));
        if (!file.startsWith(root + path.sep)) return json({ error: "bad path" }, 400);
        let st; try { st = fs.statSync(file); } catch { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
        if (!st.isFile()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Content-Length": st.size,
          "Cache-Control": prefix === "/docker/vendor/" ? "public, max-age=86400" : "no-cache" });
        return fs.createReadStream(file).pipe(res);
      }
    }

    // ── Overview ─────────────────────────────────────────────────────────────
    if (pathname === "/api/docker/overview" && req.method === "GET") {
      const probe = await engine.ping();
      const out = { engine: Object.assign({}, probe, { help: probe.ok ? null : ENGINE_HELP[probe.reason] || probe.error || null,
        socket: engine.SOCKET }), containers: [], images: [], pulls: [] };
      if (probe.ok) {
        // One bad call should not blank the whole page.
        const [c, i] = await Promise.allSettled([containers.list(true), images.list()]);
        out.containers = c.status === "fulfilled" ? c.value : [];
        out.images = i.status === "fulfilled" ? i.value : [];
        out.pulls = images.listJobs();
        if (c.status === "rejected") out.containersError = c.reason.message;
        if (i.status === "rejected") out.imagesError = i.reason.message;
      }
      return json(out);
    }

    // ── Containers ───────────────────────────────────────────────────────────
    if (pathname === "/api/docker/containers" && req.method === "GET") return json(await containers.list(true));
    if (pathname === "/api/docker/containers" && req.method === "POST") return json(await containers.create(await body()));

    let mm;
    if ((mm = m(/^\/api\/docker\/containers\/([A-Za-z0-9][A-Za-z0-9_.-]*)(?:\/([a-z]+))?$/))) {
      const [, id, action] = mm;
      if (!action) {
        if (req.method === "GET") return json(await containers.inspect(id));
        if (req.method === "DELETE") {
          const q = parsed.searchParams;
          return json(await containers.remove(id, { force: q.get("force") === "1", volumes: q.get("volumes") === "1" }));
        }
      }
      if (req.method === "POST" && ["start", "stop", "restart", "kill", "pause", "unpause"].includes(action)) {
        return json(await containers[action](id, await body()));
      }
      if (req.method === "GET" && action === "logs") {
        const text = await containers.logs(id, { tail: parseInt(parsed.searchParams.get("tail"), 10) || 500 });
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(text);
      }
      if (req.method === "GET" && action === "stats") return json(await containers.stats(id));
    }

    // ── Images ───────────────────────────────────────────────────────────────
    if (pathname === "/api/docker/images" && req.method === "GET") return json(await images.list());
    if (pathname === "/api/docker/images/pull" && req.method === "POST") {
      const b = await body();
      return json(images.pull(b.ref || b.image));
    }
    if (pathname === "/api/docker/images/prune" && req.method === "POST") return json(await images.prune());
    if ((mm = m(/^\/api\/docker\/pulls\/([A-Za-z0-9]+)$/)) && req.method === "DELETE") {
      return json({ ok: images.cancelPull(mm[1]) });
    }
    if ((mm = m(/^\/api\/docker\/images\/(.+)$/)) && req.method === "DELETE") {
      return json(await images.remove(decodeURIComponent(mm[1]), { force: parsed.searchParams.get("force") === "1" }));
    }
  } catch (e) {
    if (e instanceof SyntaxError) return json({ error: "Invalid JSON body" }, 400);
    if (!e.status || e.status >= 500) console.error("[docker]", req.method, pathname, "-", e.message);
    return fail(e);
  }
};

// ── Terminal over WebSocket ──────────────────────────────────────────────────
// Browser <-> this tunnel <-> a hijacked Docker exec stream. Binary frames are
// keystrokes; text frames are control JSON (currently just resize), which keeps
// a stray "{" typed at the shell from being mistaken for a command.
module.exports.handleUpgrade = function handleUpgrade(req, socket, head) {
  const url = new URL(req.url, "http://localhost");
  const m = url.pathname.match(/^\/api\/docker\/containers\/([A-Za-z0-9][A-Za-z0-9_.-]*)\/exec$/);
  if (!m) return false;
  if (!authenticated(req)) { ws.reject(socket, 401, "Unauthorized"); return true; }
  const origin = req.headers.origin;
  if (origin) {
    let ok = false;
    try { ok = new URL(origin).host === req.headers.host; } catch {}
    if (!ok) { ws.reject(socket, 403, "Forbidden"); return true; }
  }

  const id = m[1];
  const conn = ws.accept(req, socket, head);
  if (!conn) return true;

  (async () => {
    let execId = null, stream = null;
    try {
      // Prefer bash when the image has it, fall back to sh — /bin/sh exists in
      // essentially every image, and asking for a missing binary fails the exec.
      const shell = url.searchParams.get("shell");
      const cmd = shell
        ? [shell]
        : ["/bin/sh", "-c", "if command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi"];
      const made = await engine.json("POST", "/containers/" + encodeURIComponent(id) + "/exec", {
        AttachStdin: true, AttachStdout: true, AttachStderr: true, Tty: true, Cmd: cmd,
      });
      execId = made.Id;
      stream = await engine.execStart(execId, { tty: true });

      stream.on("data", d => { if (!conn.send(d, 2)) stream.pause(); });
      conn.on("drain", () => stream.resume());
      stream.on("end", () => conn.close(1000, "session ended"));
      stream.on("error", () => conn.close(1011, "exec stream failed"));

      conn.on("message", (msg, isBinary) => {
        if (isBinary) { stream.write(msg); return; }
        let c; try { c = JSON.parse(msg.toString("utf8")); } catch { return; }
        if (c && c.resize) {
          const h = Math.max(1, Math.min(500, parseInt(c.resize.rows, 10) || 24));
          const w = Math.max(1, Math.min(500, parseInt(c.resize.cols, 10) || 80));
          engine.json("POST", "/exec/" + execId + "/resize?h=" + h + "&w=" + w).catch(() => {});
        }
      });
      conn.on("close", () => { try { stream.destroy(); } catch {} });
    } catch (e) {
      try { conn.send(Buffer.from("\r\n\x1b[31m" + (e.message || "could not start a shell") + "\x1b[0m\r\n"), 2); } catch {}
      conn.close(1011, "exec failed");
      if (stream) { try { stream.destroy(); } catch {} }
    }
  })();
  return true;
};
