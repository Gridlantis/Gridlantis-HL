const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const path = require("path");

const { dataFile, PORT } = require("../config");
const { readJSON } = require("../store");
const { broadcast } = require("../sse");
const { RINGING, readReminders, writeReminders } = require("./reminders");

// ═══ GOOGLE CALENDAR — two-way sync with Open HL reminders ═══════════════════════
// Open HL → Google: every reminder you make or edit in Open HL becomes an event in
// the calendar (tagged with its reminder id), repeating ones as a recurring event.
// Google → Open HL: renaming, moving or deleting one of those events in Google
// changes or removes the reminder. Everything else in the calendar is shown on
// /calendar next to the reminders but left alone.
//
// Auth is OAuth 2.0 with a "Web application" client you create yourself in Google
// Cloud. Google only redirects back to localhost or a public domain, so the
// default redirect is http://localhost:PORT/api/calendar/callback; from any other
// machine the page lets you paste the address Google sent you to instead.

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/api/calendar/callback`;
const CALENDAR_ID   = process.env.GOOGLE_CALENDAR_ID || "primary";
// calendar.events reads and writes events; calendarlist.readonly only lists
// which calendars exist, so you can pick extra ones (a work schedule feed,
// a shared calendar) to show next to the main one.
const SCOPE_EVENTS  = "https://www.googleapis.com/auth/calendar.events";
const SCOPE_LIST    = "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
const SCOPE         = SCOPE_EVENTS + " " + SCOPE_LIST;
const API           = "https://www.googleapis.com/calendar/v3";
// Holds the refresh token, so it lives next to .env on the SSD at 0600 — never
// on the NTFS drive, where chmod does nothing.
const STATE_FILE    = dataFile("gcal.json");
const SYNC_MS       = 5 * 60 * 1000;
const EVENT_MINUTES = 30;
const TZ            = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

let G = Object.assign({ refreshToken: null, accessToken: null, expiresAt: 0, account: null, lastSync: null, lastError: null },
                      readJSON(STATE_FILE, {}));
function saveState() {
  const tmp = STATE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(G, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, STATE_FILE);
}

const configured = () => !!(CLIENT_ID && CLIENT_SECRET);
const connected  = () => configured() && !!G.refreshToken;
// Connected before the calendar-list permission existed, or it was not ticked
// on Google's consent screen.
const canListCalendars = () => typeof G.scopes === "string" && G.scopes.split(" ").includes(SCOPE_LIST);
// The calendars whose events are shown. Reminders are always written to CALENDAR_ID.
const shownCalendars = () => (Array.isArray(G.shown) && G.shown.length ? G.shown : [CALENDAR_ID]);
function status() {
  return { configured: configured(), connected: connected(), account: G.account, calendar: CALENDAR_ID,
           lastSync: G.lastSync, lastError: G.lastError, redirectUri: REDIRECT_URI, syncing: !!syncing,
           canListCalendars: canListCalendars(), shown: shownCalendars() };
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
function request(method, url, { body, form, token } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = form ? new URLSearchParams(form).toString() : body ? JSON.stringify(body) : null;
    const headers = { "User-Agent": "OpenHL/1.0", Accept: "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    if (data) { headers["Content-Type"] = form ? "application/x-www-form-urlencoded" : "application/json";
                headers["Content-Length"] = Buffer.byteLength(data); }
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method, headers }, res => {
      let d = "";
      res.setEncoding("utf8");
      res.on("data", c => d += c);
      res.on("end", () => {
        let j = null; try { j = d ? JSON.parse(d) : null; } catch {}
        if (res.statusCode >= 400) {
          const e = j && (typeof j.error === "object" ? j.error.message : (j.error_description || j.error));
          const err = new Error(e || `HTTP ${res.statusCode} from ${u.hostname}`);
          err.status = res.statusCode; err.code = j && typeof j.error === "string" ? j.error : null;
          return reject(err);
        }
        resolve(j);
      });
    });
    req.setTimeout(15000, () => req.destroy(new Error("Google did not answer in time")));
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── OAuth ────────────────────────────────────────────────────────────────────
// A state value is minted by a signed-in request and good for one callback, so
// the callback itself can sit outside the login wall (the host's own browser is
// often not signed in at localhost).
const STATES = new Map();
function authUrl() {
  if (!configured()) throw new Error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first");
  const state = crypto.randomBytes(18).toString("base64url");
  const now = Date.now();
  for (const [k, exp] of STATES) if (exp < now) STATES.delete(k);
  STATES.set(state, now + 15 * 60 * 1000);
  return "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: "code", scope: SCOPE,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
}

async function finishAuth(code, state) {
  const exp = STATES.get(state);
  if (!exp || exp < Date.now()) throw new Error("That sign-in link has expired. Click Connect again.");
  STATES.delete(state);
  const t = await request("POST", "https://oauth2.googleapis.com/token",
    { form: { code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: "authorization_code" } });
  // Reconnecting to add a permission may come back without a new refresh
  // token; the one already held stays valid, so keep it.
  if (!t.refresh_token && !G.refreshToken) throw new Error("Google sent no refresh token. Remove Open HL at myaccount.google.com/permissions and connect again.");
  Object.assign(G, { refreshToken: t.refresh_token || G.refreshToken, accessToken: t.access_token, scopes: t.scope || "",
                     expiresAt: Date.now() + (t.expires_in - 60) * 1000, lastError: null, lastSync: null });
  saveState();
  sync().catch(() => {});
}

async function accessToken() {
  if (!connected()) throw new Error("Google Calendar is not connected");
  if (G.accessToken && Date.now() < G.expiresAt) return G.accessToken;
  try {
    const t = await request("POST", "https://oauth2.googleapis.com/token",
      { form: { refresh_token: G.refreshToken, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: "refresh_token" } });
    G.accessToken = t.access_token; G.expiresAt = Date.now() + (t.expires_in - 60) * 1000;
    if (t.scope) G.scopes = t.scope;
    saveState();
    return G.accessToken;
  } catch (e) {
    if (e.code === "invalid_grant") {
      // Revoked, or a "Testing" OAuth app whose tokens Google drops after 7 days.
      Object.assign(G, { refreshToken: null, accessToken: null, expiresAt: 0,
                         lastError: "Google access was revoked or expired. Connect again." });
      saveState();
      broadcast("calendar_changed", {});
    }
    throw e;
  }
}

async function disconnect() {
  const tok = G.refreshToken;
  Object.assign(G, { refreshToken: null, accessToken: null, expiresAt: 0, account: null, lastSync: null, lastError: null, scopes: null });
  saveState();
  if (tok) await request("POST", "https://oauth2.googleapis.com/revoke", { form: { token: tok } }).catch(() => {});
}

const calPath = (cal) => API + "/calendars/" + encodeURIComponent(cal || CALENDAR_ID) + "/events";
async function api(method, url, body) {
  return request(method, url, { body, token: await accessToken() });
}

// Every page of a listing. Google caps a page at 2500 events.
async function listAll(params, cal) {
  const out = [];
  let pageToken = null, summary = null;
  do {
    const q = new URLSearchParams(Object.assign({ maxResults: "2500" }, params, pageToken ? { pageToken } : {}));
    const r = await api("GET", calPath(cal) + "?" + q);
    summary = summary || r.summary;
    out.push(...(r.items || []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  if (!cal && summary && summary !== G.account) { G.account = summary; saveState(); }
  return out;
}

// ── Calendar list ────────────────────────────────────────────────────────────
// Names and colours, cached so the event view does not list calendars on every
// month it shows.
let CAL_CACHE = { at: 0, items: null };
const HEX_RE = /^#[0-9a-f]{6}$/i;
async function calendars(force) {
  if (!canListCalendars()) {
    const e = new Error("Reconnect Google Calendar to choose which calendars to show");
    e.status = 403; e.code = "needs_scope"; throw e;
  }
  if (!force && CAL_CACHE.items && Date.now() - CAL_CACHE.at < 10 * 60 * 1000) return CAL_CACHE.items;
  const items = [];
  let pageToken = null;
  do {
    const q = new URLSearchParams(Object.assign({ maxResults: "250", showHidden: "true" }, pageToken ? { pageToken } : {}));
    const r = await api("GET", API + "/users/me/calendarList?" + q);
    items.push(...(r.items || []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  const shown = shownCalendars();
  const out = items.filter(c => !c.deleted).map(c => ({
    id: c.id, name: c.summaryOverride || c.summary || c.id, primary: !!c.primary,
    color: HEX_RE.test(c.backgroundColor || "") ? c.backgroundColor : null,
    access: c.accessRole, hidden: !!c.hidden,
    shown: shown.includes(c.id) || (!!c.primary && shown.includes("primary")),
  })).sort((a, b) => (b.primary - a.primary) || a.name.localeCompare(b.name));
  CAL_CACHE = { at: Date.now(), items: out };
  return out;
}
async function setShown(ids) {
  const known = new Set((await calendars(true)).map(c => c.id));
  const pick = [...new Set((Array.isArray(ids) ? ids : []).map(String))].filter(id => known.has(id)).slice(0, 25);
  G.shown = pick.length ? pick : [CALENDAR_ID];
  saveState();
  CAL_CACHE.items = CAL_CACHE.items && CAL_CACHE.items.map(c => Object.assign({}, c, { shown: G.shown.includes(c.id) }));
  broadcast("calendar_changed", {});
  return shownCalendars();
}

// ── Mapping ──────────────────────────────────────────────────────────────────
const RRULE = { daily: "RRULE:FREQ=DAILY", weekdays: "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", weekly: "RRULE:FREQ=WEEKLY" };
function eventFor(rem) {
  return {
    summary: rem.title,
    description: rem.note || "",
    start: { dateTime: new Date(rem.at).toISOString(), timeZone: TZ },
    end:   { dateTime: new Date(rem.at + EVENT_MINUTES * 60000).toISOString(), timeZone: TZ },
    recurrence: RRULE[rem.repeat] ? [RRULE[rem.repeat]] : [],
    // openhlApp is a fixed tag so the sync can list every Open HL event: Google
    // only filters on name=value, never on "has this property".
    extendedProperties: { private: { openhlId: rem.id, openhlApp: "1" } },
  };
}
// Google's web editor stores descriptions as HTML.
const plainText = s => String(s || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p>/gi, "\n").replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const eventStart = ev => ev.start && (ev.start.dateTime ? Date.parse(ev.start.dateTime) : Date.parse(ev.start.date + "T00:00:00"));
// Reminders made from a Google event already have that event; one that has long
// since fired and been switched off is history not worth adding now.
const wantsEvent = rem => !rem.fromEvent && (rem.enabled || rem.at > Date.now());

function setReminderField(id, patch) {
  const list = readReminders();
  const rem = list.find(r => r.id === id);
  if (!rem) return;
  Object.assign(rem, patch);
  writeReminders(list);
}

// ── Open HL → Google ───────────────────────────────────────────────────────────
const PUSHING = new Set();
const LAST_PUSH = new Map();   // id -> when Open HL last sent it, so a sync already under way cannot undo the edit
async function pushReminder(rem) {
  if (!connected() || !rem || rem.fromEvent || PUSHING.has(rem.id)) return;
  PUSHING.add(rem.id);
  LAST_PUSH.set(rem.id, Date.now());
  try {
    if (rem.gcalId) {
      try { await api("PATCH", calPath() + "/" + encodeURIComponent(rem.gcalId), eventFor(rem)); return pushed(); }
      catch (e) { if (e.status !== 404 && e.status !== 410) throw e; }   // deleted in Google meanwhile: make a new one
    }
    const ev = await api("POST", calPath(), eventFor(rem));
    setReminderField(rem.id, { gcalId: ev.id });
    pushed();
  } catch (e) {
    console.error("[gcal:push]", e.message);
    G.lastError = "Could not save \"" + rem.title + "\" to Google: " + e.message; saveState();
  } finally { PUSHING.delete(rem.id); }
}
function pushed() {
  if (G.lastError && /^Could not save/.test(G.lastError)) { G.lastError = null; saveState(); }
}
async function removeReminder(rem) {
  if (!connected() || !rem || !rem.gcalId) return;
  try { await api("DELETE", calPath() + "/" + encodeURIComponent(rem.gcalId)); }
  catch (e) { if (e.status !== 404 && e.status !== 410) console.error("[gcal:delete]", e.message); }
}
// Fire-and-forget versions for the reminder routes: the reminder is saved in
// Open HL whether or not Google answers.
const queuePush   = rem => { pushReminder(rem).catch(() => {}); };
const queueRemove = rem => { removeReminder(rem).catch(() => {}); };

// ── Google → Open HL ───────────────────────────────────────────────────────────
let syncing = null;
function sync() {
  if (!connected()) return Promise.resolve(false);
  if (!syncing) syncing = doSync().finally(() => { syncing = null; });
  return syncing;
}
async function doSync() {
  try {
    const started = Date.now();
    const linked = await listAll({ privateExtendedProperty: "openhlApp=1", showDeleted: "false" });
    const openhlIdOf = ev => ev.extendedProperties && ev.extendedProperties.private && ev.extendedProperties.private.openhlId;
    const byOpenHL = new Map(linked.filter(ev => ev.status !== "cancelled" && openhlIdOf(ev)).map(ev => [openhlIdOf(ev), ev]));
    const now = Date.now();
    const patches = new Map(), gone = new Set();

    for (const rem of readReminders()) {
      // Sent to Google after the listing was taken: the listing is the stale side.
      if (PUSHING.has(rem.id) || (LAST_PUSH.get(rem.id) || 0) >= started) continue;
      let ev = byOpenHL.get(rem.id);
      if (!ev) {
        if (!rem.gcalId) continue;
        // Not in the listing: deleted in Google, or made before events carried
        // the openhlApp tag. Ask Google about this one event before deleting anything.
        try {
          const e = await api("GET", calPath() + "/" + encodeURIComponent(rem.gcalId));
          if (e.status === "cancelled") { gone.add(rem.id); continue; }
          ev = e;
          // Tag it so later syncs find it in the listing.
          await api("PATCH", calPath() + "/" + encodeURIComponent(rem.gcalId),
                    { extendedProperties: { private: { openhlId: rem.id, openhlApp: "1" } } }).catch(() => {});
        } catch (e) {
          if (e.status === 404 || e.status === 410) gone.add(rem.id);
          continue;
        }
      }
      const patch = {};
      const title = String(ev.summary || "").trim().slice(0, 200) || rem.title;
      const note  = plainText(ev.description).slice(0, 2000);
      if (title !== rem.title) patch.title = title;
      if (note !== (rem.note || "")) patch.note = note;
      if (ev.id !== rem.gcalId) patch.gcalId = ev.id;
      // A repeating reminder's own time advances after every ring while the
      // series start stays put, so only a one-off follows a move in Google.
      // Google keeps whole seconds; "in 15 min" times carry milliseconds.
      const at = eventStart(ev);
      if (rem.repeat === "none" && Number.isFinite(at) && Math.floor(at / 1000) !== Math.floor(rem.at / 1000)) {
        patch.at = at; patch.snoozeUntil = null;
        if (at > now) patch.enabled = true;
      }
      if (Object.keys(patch).length) patches.set(rem.id, patch);
    }

    // Apply to a fresh read: the deletion checks above awaited, and a route may
    // have written the file meanwhile.
    if (patches.size || gone.size) {
      const out = [];
      for (const r of readReminders()) {
        if ((LAST_PUSH.get(r.id) || 0) >= started) { out.push(r); continue; }
        if (gone.has(r.id)) { if (RINGING.delete(r.id)) broadcast("reminder_clear", { id: r.id }); continue; }
        const patch = patches.get(r.id);
        if (patch) { Object.assign(r, patch); if ("at" in patch) delete r.missedAt; }
        out.push(r);
      }
      writeReminders(out);
      broadcast("reminders_changed", {});
    }

    // Reminders that have no event yet: made before connecting, or while Google
    // was unreachable.
    for (const rem of readReminders()) if (!rem.gcalId && wantsEvent(rem)) await pushReminder(rem);

    G.lastSync = Date.now();
    if (G.lastError && !/^Could not save/.test(G.lastError)) G.lastError = null;
    saveState();
    broadcast("calendar_changed", {});
    return true;
  } catch (e) {
    console.error("[gcal:sync]", e.message);
    G.lastError = e.message; saveState();
    broadcast("calendar_changed", {});
    throw e;
  }
}

// Events in [from, to) from every shown calendar, recurring ones expanded.
// One calendar failing (a feed that stopped working) does not hide the rest.
async function eventsBetween(from, to) {
  const cals = shownCalendars();
  let meta = {};
  if (canListCalendars()) { try { for (const c of await calendars()) meta[c.id] = c; } catch {} }
  const params = { timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(), singleEvents: "true", orderBy: "startTime" };
  const results = await Promise.allSettled(cals.map(cal => listAll(params, cal).then(items => ({ cal, items }))));
  const ok = results.filter(r => r.status === "fulfilled").map(r => r.value);
  if (!ok.length && results.length) throw results[0].reason;
  const seen = new Set(), out = [];
  for (const { cal, items } of ok) {
    const m = meta[cal] || (cal === "primary" ? Object.values(meta).find(c => c.primary) : null) || {};
    for (const ev of items) {
      if (ev.status === "cancelled") continue;
      // The same meeting can sit on two shown calendars; show it once.
      const key = (ev.iCalUID || ev.id) + "|" + ((ev.start && (ev.start.dateTime || ev.start.date)) || "");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(mapEvent(ev, cal, m));
    }
  }
  return out;
}
function mapEvent(ev, cal, m) {
  return {
    id: ev.id, calendarId: cal, calendar: m.name || null, color: m.color || null,
    title: ev.summary || "(no title)",
    note: plainText(ev.description).slice(0, 2000),
    location: ev.location || "",
    allDay: !ev.start.dateTime,
    start: ev.start.dateTime || ev.start.date,
    end: (ev.end && (ev.end.dateTime || ev.end.date)) || null,
    link: ev.htmlLink || null,
    openhlId: (ev.extendedProperties && ev.extendedProperties.private && ev.extendedProperties.private.openhlId) || null,
  };
}

// Only from a calendar that is shown, so the id cannot reach anything else.
async function getEvent(id, cal) {
  const c = cal && shownCalendars().includes(cal) ? cal : CALENDAR_ID;
  return api("GET", calPath(c) + "/" + encodeURIComponent(id));
}

setTimeout(() => sync().catch(() => {}), 15000);
setInterval(() => sync().catch(() => {}), SYNC_MS).unref?.();

module.exports = { authUrl, calendars, configured, connected, disconnect, eventStart, eventsBetween, finishAuth, getEvent, queuePush, queueRemove, setShown, status, sync };
