const engine = require("./engine");
const { broadcast } = require("../../sse");
const { errorWithStatus } = require("../../helpers");

// ─── DOCKER · images ─────────────────────────────────────────────────────────
// Pull is a long streaming operation with per-layer progress, so it runs as a
// tracked job exactly like a VM Lab ISO download: start it, poll or listen for
// SSE, cancel if you change your mind.

const err = errorWithStatus(400);

function publicImage(i) {
  const tags = (i.RepoTags || []).filter(t => t && t !== "<none>:<none>");
  return {
    id: i.Id, shortId: String(i.Id || "").replace(/^sha256:/, "").slice(0, 12),
    tags, name: tags[0] || String(i.Id || "").replace(/^sha256:/, "").slice(0, 12),
    dangling: tags.length === 0,
    sizeBytes: i.Size || 0, created: i.Created ? i.Created * 1000 : null,
    containers: i.Containers != null && i.Containers >= 0 ? i.Containers : null,
  };
}

async function list() {
  const raw = await engine.json("GET", "/images/json");
  return (raw || []).map(publicImage).sort((a, b) => (b.created || 0) - (a.created || 0));
}

// "nginx" -> nginx:latest ; "ghcr.io/o/p:1.2" -> as written. Rejects anything
// that is not a plausible reference so it never reaches the daemon as garbage.
const REF_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*(?::[a-zA-Z0-9._-]+)?(?:@sha256:[a-f0-9]{64})?$/;
function parseRef(ref) {
  const s = String(ref || "").trim();
  if (!s) throw err("enter an image name");
  const host = s.split("/")[0];
  const hasHost = s.includes("/") && (host.includes(".") || host.includes(":") || host === "localhost");
  const check = hasHost ? s.slice(host.length + 1) : s;
  if (!REF_RE.test(check.toLowerCase())) throw err("“" + s + "” is not a valid image name");
  if (s.includes("@")) return { fromImage: s.split("@")[0], tag: s.split("@")[1], full: s };
  // A colon in the last path segment is the tag; a colon in the host is a port.
  const lastSlash = s.lastIndexOf("/");
  const colon = s.indexOf(":", lastSlash + 1);
  if (colon === -1) return { fromImage: s, tag: "latest", full: s + ":latest" };
  return { fromImage: s.slice(0, colon), tag: s.slice(colon + 1), full: s };
}

// ── Pull jobs ────────────────────────────────────────────────────────────────
const JOBS = new Map();

const publicJob = j => ({ id: j.id, ref: j.ref, status: j.status, error: j.error || null,
  layers: Object.values(j.layers), current: j.current, total: j.total, startedAt: j.startedAt });
const listJobs = () => Array.from(JOBS.values()).map(publicJob);

function pull(ref) {
  const parsed = parseRef(ref);
  const running = Array.from(JOBS.values()).find(j => j.ref === parsed.full && j.status === "pulling");
  if (running) throw err("that image is already being pulled", 409);
  const job = { id: "pull" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ref: parsed.full, status: "pulling", layers: {}, current: 0, total: 0,
    startedAt: new Date().toISOString(), abort: null, error: null };
  JOBS.set(job.id, job);

  let lastPush = 0;
  const push = (force) => {
    const now = Date.now();
    if (!force && now - lastPush < 500) return;        // the daemon emits hundreds of events a second
    lastPush = now;
    broadcast("docker", { what: "pull", jobId: job.id });
  };

  (async () => {
    try {
      await engine.streamJson("POST",
        "/images/create?fromImage=" + encodeURIComponent(parsed.fromImage) + "&tag=" + encodeURIComponent(parsed.tag),
        null,
        ev => {
          if (ev.error) throw err(ev.error);
          if (ev.id && ev.progressDetail && ev.progressDetail.total) {
            job.layers[ev.id] = { id: ev.id, status: ev.status,
              current: ev.progressDetail.current || 0, total: ev.progressDetail.total };
          } else if (ev.id) {
            job.layers[ev.id] = Object.assign(job.layers[ev.id] || { id: ev.id, current: 0, total: 0 }, { status: ev.status });
          }
          const vals = Object.values(job.layers);
          job.current = vals.reduce((a, l) => a + (l.current || 0), 0);
          job.total = vals.reduce((a, l) => a + (l.total || 0), 0);
          job.lastStatus = ev.status || job.lastStatus;
          push();
        },
        { signal: job });
      if (job.status === "pulling") job.status = "done";
    } catch (e) {
      if (job.status !== "cancelled") { job.status = "error"; job.error = e.message; }
    }
    push(true);
    broadcast("docker", { what: "images" });
    setTimeout(() => JOBS.delete(job.id), 5 * 60 * 1000).unref?.();
  })();

  return publicJob(job);
}

function cancelPull(id) {
  const j = JOBS.get(id);
  if (!j) return false;
  if (j.status === "pulling") { j.status = "cancelled"; try { j.onAbort && j.onAbort(); } catch {} }
  JOBS.delete(id);
  broadcast("docker", { what: "pull", jobId: id });
  return true;
}

async function remove(id, { force = false } = {}) {
  try {
    await engine.json("DELETE", "/images/" + encodeURIComponent(id) + "?force=" + (force ? 1 : 0));
  } catch (e) {
    if (e.status === 409) throw err("that image is used by a container — remove the container first, or force it", 409);
    throw e;
  }
  broadcast("docker", { what: "images" });
  return { ok: true };
}

async function prune() {
  const r = await engine.json("POST", "/images/prune?filters=" + encodeURIComponent(JSON.stringify({ dangling: { true: true } })));
  broadcast("docker", { what: "images" });
  return { reclaimedBytes: (r && r.SpaceReclaimed) || 0, deleted: ((r && r.ImagesDeleted) || []).length };
}

module.exports = { cancelPull, list, listJobs, parseRef, prune, publicImage, pull, remove };
