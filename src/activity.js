const { broadcast, onBroadcast } = require("./sse");

// ═══ ACTIVITY FEED ══════════════════════════════════════════════════════════════
// One stream of "Metis is doing X" events for the /world page, where each one
// becomes a robot errand. Sent as the 'activity' SSE event and kept in a short
// ring so a freshly opened page has something to replay.
//
//   service  which part of Metis: social, mail, ai, monitor, vmlab, docker, …
//   action   what it did: send, receive, think, check, sweep, up, down, …
//   target   where it went, when that matters (a platform, a node, a model host)
//   phase    "start" | "done" for jobs that take a while, omitted for instant ones
//   key      pairs a "done" with its "start"
const RECENT = [];
let seq = 0;

function activity(service, action, detail = {}) {
  const ev = Object.assign({ id: ++seq, at: Date.now(), service, action }, detail);
  if (ev.label) ev.label = String(ev.label).slice(0, 120);
  RECENT.push(ev);
  if (RECENT.length > 80) RECENT.shift();
  broadcast("activity", ev);
  return ev;
}

// Some senders fire many times a second (docker pull progress, VM Lab state
// writes). One errand per key per window is plenty to show it happening.
const lastSeen = new Map();
function throttled(key, ms) {
  const now = Date.now();
  if (now - (lastSeen.get(key) || 0) < ms) return true;
  lastSeen.set(key, now);
  return false;
}

// ── Existing broadcasts → errands ─────────────────────────────────────────────
onBroadcast((event, d) => {
  switch (event) {
    case "node_status":
      return activity("monitor", d.online ? "up" : "down", { target: d.name, label: d.name + (d.online ? " back online" : " went offline"), ok: d.online });
    case "docker":
      if (d.what === "pull" && !throttled("docker:" + d.jobId, 20000)) return activity("docker", "pull", { target: "dockerhub", label: "Pulling an image" });
      if (d.what === "images" && !throttled("docker:images", 4000)) return activity("docker", "change", { label: "Images changed" });
      return;
    case "vmlab":
      if ((d.what === "envs" || d.what === "state") && !throttled("vmlab:envs", 4000)) return activity("vmlab", "change", { label: "VM Lab changed" });
      if (d.what === "downloads" && !throttled("vmlab:dl", 15000)) return activity("vmlab", "download", { target: "web", label: "Downloading an OS image" });
      return;
    case "reminder_fire":
      return activity("reminders", "fire", { label: "Reminder: " + (d.title || "") });
    case "homeos_event":
      return activity("homeos", d.event, { target: d.name, label: d.name + " " + d.event, ok: d.event === "online" });
    case "calendar_changed":
      if (!throttled("gcal", 5000)) return activity("calendar", "sync", { target: "google", label: "Calendar synced with Google" });
      return;
    case "change":
      if (d.type && !throttled("change:" + d.type, 3000)) return activity(d.type === "ai" ? "ai" : "notes", "save", { label: d.type + " saved" });
      return;
    case "todo_changed":
    case "flows_changed":
      if (!throttled(event, 3000)) return activity("notes", "save", { label: event === "todo_changed" ? "To-do list saved" : "Flow saved" });
      return;
    case "social_autopilot":
      if (!throttled("autopilot:" + d.dashboardId, 10000)) return activity("social", "draft", { label: "Autopilot drafting" });
      return;
  }
});

module.exports = { RECENT, activity };
