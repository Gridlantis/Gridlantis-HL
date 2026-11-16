const fs = require("fs");
const os = require("os");
const path = require("path");

const { FINANCE_FILE, NOTES_FILE, FOLDERS_FILE } = require("../config");
const { MAIL_CACHE } = require("../domains/mail");
const { MONITOR } = require("../domains/monitor");
const { readReminders, reminderDueAt } = require("../domains/reminders");
const { readTexts } = require("../domains/texts");
const { readVoicemail } = require("../domains/voicemail");
const { HOST } = require("../host");
const { readJSON } = require("../store");

// The shell every page shares: the live status strip, its script, and the
// summary behind the Home page. Kept small and cheap — the strip polls it.
const SHELL_JS = path.join(__dirname, "../ui/shell.js");

function vmCounts() {
  try {
    const { envs } = require("../domains/vmlab/store");
    const { pidAlive } = require("../domains/vmlab/vm");
    const all = envs.read();
    return { running: all.filter(e => e.pid && pidAlive(e.pid, e.id)).length, total: all.length };
  } catch { return { running: 0, total: 0 }; }
}

function nodeCounts() {
  const nodes = Object.values(MONITOR);
  return { online: nodes.filter(n => n.online).length, total: nodes.length,
    offline: nodes.filter(n => n.online === false).map(n => n.name) };
}

function upcomingReminders(limit) {
  const now = Date.now();
  return readReminders().filter(r => r.enabled !== false && reminderDueAt(r) > now - 60000)
    .map(r => ({ id: r.id, title: r.title, note: r.note || "", at: reminderDueAt(r), repeat: r.repeat }))
    .sort((a, b) => a.at - b.at).slice(0, limit);
}

// IMAP dates arrive in several formats; hand the browser ISO or nothing.
function isoDate(v) {
  if (v == null || v === "") return null;
  const t = typeof v === "number" ? v : Date.parse(String(v).replace(/ \([^)]*\)$/, ""));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function importantMail() {
  const list = MAIL_CACHE.filter(m => m.important);
  return { unopened: list.filter(m => !m.openedAt).length, total: list.length,
    recent: list.slice().sort((a, b) => (Date.parse(isoDate(b.date) || isoDate(b.firstSeenAt) || 0) || 0) - (Date.parse(isoDate(a.date) || isoDate(a.firstSeenAt) || 0) || 0)).slice(0, 5)
      .map(m => ({ id: m.id, from: m.fromName || m.fromEmail || "unknown sender", subject: m.subject || "(no subject)", date: isoDate(m.date) || isoDate(m.firstSeenAt), opened: !!m.openedAt })) };
}

function voicemailPulse() {
  const items = readVoicemail().items;
  const newest = items.reduce((a, v) => (!a || v.at > a.at ? v : a), null);
  return { unheard: items.filter(v => !v.heardAt).length,
    latest: newest ? { sid: newest.sid, from: newest.from, heard: !!newest.heardAt } : null };
}

function textsPulse() {
  const items = readTexts().items;
  const newest = items.reduce((a, t) => (!a || t.at > a.at ? t : a), null);
  return { unread: items.filter(t => !t.readAt).length,
    latest: newest ? { sid: newest.sid, from: newest.from, body: String(newest.body || "").slice(0, 120), read: !!newest.readAt } : null };
}

function pulse() {
  const mail = importantMail();
  return {
    host: { name: os.hostname(), cpu: HOST.cpu, mem: HOST.mem, disk: HOST.disk, uptime: os.uptime() },
    nodes: nodeCounts(), vms: vmCounts(),
    mail: { unopened: mail.unopened, total: mail.total },
    voicemail: voicemailPulse(),
    texts: textsPulse(),
    next: upcomingReminders(1)[0] || null,
    now: Date.now(),
  };
}

module.exports = async function shellRoutes(ctx) {
  const { req, res, pathname, json } = ctx;

  if (pathname === "/ui/shell.js" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" });
    return fs.createReadStream(SHELL_JS).pipe(res);
  }
  if (pathname === "/api/pulse" && req.method === "GET") return json(pulse());

  if (pathname === "/api/home" && req.method === "GET") {
    const folders = readJSON(FOLDERS_FILE, []);
    const folderName = id => (folders.find(f => f.id === id) || {}).name || null;
    const notes = readJSON(NOTES_FILE, []).filter(n => !n.hidden)
      .sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created))).slice(0, 6)
      .map(n => ({ id: n.id, title: n.title || "Untitled", folder: folderName(n.folderId), updated: n.updated || n.created }));
    const fin = readJSON(FINANCE_FILE, {});
    const bankUpdated = fin.bank && fin.bank.lastUpdated;
    return json(Object.assign(pulse(), {
      reminders: upcomingReminders(5),
      notes,
      mailRecent: importantMail().recent,
      bank: bankUpdated ? { updated: bankUpdated, staleDays: Math.floor((Date.now() - Date.parse(bankUpdated)) / 86400000) } : null,
    }));
  }
};
