const fs = require("fs");
const path = require("path");
const tls = require("tls");

const { dataFile } = require("../config");
const { SETTINGS, writeSecretFile } = require("../settings");

const MAIL_ACCOUNTS_FILE = dataFile("mail_accounts.json"); // secrets: mode 600
const MAIL_CACHE_FILE    = dataFile("mail_cache.json");
const MAIL_STATE_FILE    = dataFile("mail_state.json");
const MAIL_PURGE_DAYS = 21;
const MAIL_SEED       = 5;      // seed the last N on first connect, then only-new
const MAIL_POLL_MS    = 45000;
function imapTarget(){
  if (process.env.MAIL_IMAP_HOST) return { host: process.env.MAIL_IMAP_HOST, port: Number(process.env.MAIL_IMAP_PORT||993), useTls: process.env.MAIL_IMAP_TLS !== 'false' };
  return { host: 'imap.gmail.com', port: 993, useTls: true };
}

const _rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
// Replaced in place rather than rebound: several modules hold a reference to
// these arrays, and reassigning would leave them reading a stale copy.
const MAIL_ACCOUNTS = _rj(MAIL_ACCOUNTS_FILE, []);   // [{id,name,email,appPassword}]
const MAIL_CACHE    = _rj(MAIL_CACHE_FILE, []);      // cached message headers (+ body once opened)
function replaceArray(arr, next) { arr.length = 0; for (const x of next) arr.push(x); }
let MAIL_STATE    = _rj(MAIL_STATE_FILE, {});      // { accountId: {uidvalidity, highwater} }
const MAIL_STATUS = {};                            // { accountId: {ok, at, error} } (runtime only)
let mailPolling   = false;

function saveMailAccounts(){ try { writeSecretFile(MAIL_ACCOUNTS_FILE, JSON.stringify(MAIL_ACCOUNTS, null, 2)); } catch(e){ console.error("mail accounts save:", e.message); } }
function saveMailCache(){ try { fs.writeFileSync(MAIL_CACHE_FILE, JSON.stringify(MAIL_CACHE)); } catch(e){ console.error("mail cache save:", e.message); } }
function saveMailState(){ try { fs.writeFileSync(MAIL_STATE_FILE, JSON.stringify(MAIL_STATE)); } catch(e){ console.error("mail state save:", e.message); } }
function mailBlocklist(){ return Array.isArray(SETTINGS.mailBlocklist) ? SETTINGS.mailBlocklist : []; }

// ── low-level IMAP ──────────────────────────────────────────────────────────────
function imapQuote(s){ return '"' + String(s).replace(/([\\"])/g, "\\$1") + '"'; }

// Detect whether a full tagged response has arrived, correctly skipping literals
// ({N} means the next N raw bytes are data and may contain CRLFs).
function taggedDone(buf, tag) {
  const tagPrefix = tag + " ";
  let i = 0;
  while (i < buf.length) {
    const nl = buf.indexOf("\r\n", i);
    if (nl === -1) return false;
    const line = buf.toString("latin1", i, nl);
    const lit = /\{(\d+)\}$/.exec(line);
    if (lit) { i = nl + 2 + parseInt(lit[1], 10); continue; }      // skip literal bytes
    if (line.startsWith(tagPrefix)) return true;                    // tagged completion line
    i = nl + 2;
  }
  return false;
}

function imapConnect(host, port, useTls) {
  return new Promise((resolve, reject) => {
    const net = require("net");
    let buf = Buffer.alloc(0), ready = false, waiter = null, settled = false;
    const sock = useTls
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port });
    const fail = (e) => {
      if (!ready && !settled) { settled = true; reject(e); }
      else if (waiter) { const w = waiter; waiter = null; w.rej(e); }
    };
    sock.setTimeout(30000, () => fail(new Error("IMAP timeout")));
    sock.on("error", fail);
    sock.on("close", () => { if (waiter) { const w = waiter; waiter = null; w.rej(new Error("connection closed")); } });
    const api = {
      sock,
      send(tag, command) {
        return new Promise((res, rej) => { waiter = { tag, res, rej }; sock.write(tag + " " + command + "\r\n"); });
      },
      logout(){ try { sock.write("zz LOGOUT\r\n"); } catch {} setTimeout(() => { try { sock.destroy(); } catch {} }, 150); }
    };
    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!ready) {                                   // consume server greeting
        const nl = buf.indexOf("\r\n");
        if (nl !== -1) { ready = true; settled = true; buf = buf.slice(nl + 2); resolve(api); }
        return;
      }
      if (waiter && taggedDone(buf, waiter.tag)) {
        const w = waiter; waiter = null; const data = buf; buf = Buffer.alloc(0); w.res(data);
      }
    });
  });
}

const _ok = (buf, tag) => new RegExp("(^|\\r\\n)" + tag + " OK", "i").test(buf.toString("latin1"));

// Parse "* n FETCH (...)" records, extracting the {N}-literal payload precisely.
function parseFetchResponses(buf) {
  const out = [];
  const text = buf.toString("latin1");   // 1 byte == 1 char, so indices map to buf offsets
  let pos = 0;
  while (true) {
    const f = text.indexOf("FETCH (", pos);
    if (f === -1) break;
    const brace = text.indexOf("{", f);
    const closeParen = text.indexOf(")\r\n", f);
    let litLen = -1, litStart = -1, metaEnd;
    if (brace !== -1 && (closeParen === -1 || brace < closeParen)) {
      const bm = /\{(\d+)\}\r\n/.exec(text.slice(brace, brace + 24));
      if (bm) { litLen = parseInt(bm[1], 10); litStart = brace + bm[0].length; metaEnd = brace; }
    }
    if (litLen < 0) metaEnd = (closeParen === -1 ? f + 7 : closeParen);
    const meta = text.slice(f, metaEnd);
    const uid   = (/(?:^|[\s(])UID (\d+)/.exec(meta) || [])[1];
    const idate = (/INTERNALDATE "([^"]+)"/.exec(meta) || [])[1] || "";
    const flags = (/FLAGS \(([^)]*)\)/.exec(meta) || [])[1] || "";
    let payload = "";
    if (litLen >= 0) { payload = buf.toString("utf8", litStart, litStart + litLen); pos = litStart + litLen; }
    else { pos = (closeParen === -1 ? f + 7 : closeParen + 3); }
    out.push({ uid: uid ? Number(uid) : null, internaldate: idate, flags, payload });
  }
  return out;
}

function parseHeaders(block) {
  const h = {};
  const unfolded = String(block || "").replace(/\r\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r\n/)) {
    const c = line.indexOf(":");
    if (c > 0) { const k = line.slice(0, c).trim().toLowerCase(); h[k] = (h[k] ? h[k] + " " : "") + line.slice(c + 1).trim(); }
  }
  return h;
}

// RFC 2047 encoded-words: =?charset?B/Q?data?=
function decodeMimeWords(str) {
  if (!str) return "";
  return str.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (m, charset, enc, data) => {
    try {
      let bytes;
      if (enc.toUpperCase() === "B") bytes = Buffer.from(data, "base64");
      else { data = data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (x, hh) => String.fromCharCode(parseInt(hh, 16))); bytes = Buffer.from(data, "latin1"); }
      const cs = charset.toLowerCase();
      if (cs === "utf-8" || cs === "utf8") return bytes.toString("utf8");
      if (cs.includes("8859-1") || cs === "latin1" || cs === "us-ascii" || cs === "ascii") return bytes.toString("latin1");
      return bytes.toString("utf8");
    } catch { return m; }
  }).replace(/\?=\s+=\?/g, "?==?"); // join adjacent words
}

function parseImapDate(s) {
  const m = /^(\d{1,2})-(\w{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})/.exec(s || "");
  if (!m) return 0;
  const d = Date.parse(m[1] + " " + m[2] + " " + m[3] + " " + m[4] + ":" + m[5] + ":" + m[6] + " " + m[7]);
  return isNaN(d) ? 0 : d;
}

function isBlocked(fromName, fromEmail, subject) {
  const hay = (fromName + " " + fromEmail + " " + subject).toLowerCase();
  return mailBlocklist().some(term => term && hay.includes(String(term).toLowerCase()));
}

function mailImportant(){ const v = SETTINGS.mailImportant; return { senders: (v && Array.isArray(v.senders)) ? v.senders : [], keywords: (v && Array.isArray(v.keywords)) ? v.keywords : [] }; }
function isImportant(fromName, fromEmail, subject) {
  const rules = mailImportant();
  const who  = (fromName + " " + fromEmail).toLowerCase();
  const what = (subject + " " + fromName + " " + fromEmail).toLowerCase();
  if (rules.senders.some(s => s && who.includes(String(s).toLowerCase()))) return true;
  if (rules.keywords.some(k => k && what.includes(String(k).toLowerCase()))) return true;
  return false;
}
function retagImportant() {
  let changed = 0;
  for (const m of MAIL_CACHE) { const imp = isImportant(m.fromName || "", m.fromEmail || "", m.subject || ""); if (m.important !== imp) { m.important = imp; changed++; } }
  if (changed) saveMailCache();
  return changed;
}

function stripHtml(t) {
  return String(t || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&#(\d+);/g, (m, n) => { try { return String.fromCodePoint(+n); } catch { return m; } })
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

function decodeCTE(data, encoding) {
  encoding = (encoding || "").toLowerCase().trim();
  if (encoding === "base64") return Buffer.from(String(data).replace(/\s+/g, ""), "base64");
  if (encoding === "quoted-printable")
    return Buffer.from(String(data).replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (m, hh) => String.fromCharCode(parseInt(hh, 16))), "latin1");
  return Buffer.from(String(data), "latin1"); // 7bit/8bit/binary
}
function decodeCharset(buf, charset) {
  charset = (charset || "utf-8").toLowerCase();
  if (charset.includes("utf-8") || charset.includes("utf8")) return buf.toString("utf8");
  if (charset.includes("8859-1") || charset.includes("latin1") || charset.includes("ascii") || charset.includes("1252")) return buf.toString("latin1");
  try { return new TextDecoder(charset).decode(buf); } catch { return buf.toString("utf8"); }
}
function splitHeaderBody(raw) {
  let idx = raw.indexOf("\r\n\r\n");
  if (idx !== -1) return [raw.slice(0, idx), raw.slice(idx + 4)];
  idx = raw.indexOf("\n\n");
  if (idx !== -1) return [raw.slice(0, idx), raw.slice(idx + 2)];
  return [raw, ""];
}
function ctParam(ctValue, name) {
  const m = new RegExp(name + '\\s*=\\s*"?([^";\\r\\n]+)"?', "i").exec(ctValue || "");
  return m ? m[1].trim() : null;
}
function splitMimeParts(body, boundary) {
  const parts = [];
  const chunks = body.split("--" + boundary);
  for (let i = 1; i < chunks.length; i++) {
    let c = chunks[i];
    if (c.startsWith("--")) break;           // closing --boundary--
    c = c.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    parts.push(c);
  }
  return parts;
}
function decodePartBody(h, body) {
  const ctv = h["content-type"] || "text/plain";
  const text = decodeCharset(decodeCTE(body, h["content-transfer-encoding"] || ""), ctParam(ctv, "charset") || "utf-8");
  return /text\/html/i.test(ctv) ? stripHtml(text) : text;
}
// Walk a MIME tree, preferring text/plain, keeping first text/html as fallback.
function collectMime(raw, depth, acc) {
  if (depth > 6) return;
  const [header, body] = splitHeaderBody(raw);
  const h = parseHeaders(header);
  const ctv = h["content-type"] || "text/plain";
  if (/^multipart\//i.test(ctv)) {
    const boundary = ctParam(ctv, "boundary");
    if (!boundary) return;
    for (const p of splitMimeParts(body, boundary)) collectMime(p, depth + 1, acc);
  } else if (/text\/plain/i.test(ctv)) {
    if (!acc.plain) acc.plain = decodePartBody(h, body);
  } else if (/text\/html/i.test(ctv)) {
    if (!acc.html) acc.html = decodePartBody(h, body);
  } // else attachment/other -> skip
}
// Extract clean readable text from a full raw message (header + body).
function extractBestText(raw) {
  const acc = {};
  try { collectMime(raw, 0, acc); } catch (e) {}
  let out = "";
  if (acc.plain && acc.plain.trim()) out = acc.plain;
  else if (acc.html && acc.html.trim()) out = acc.html;
  else out = bestEffortText(raw);
  return out.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 20000);
}

// Fallback single-part cleaner (used only when MIME parse finds nothing)
function bestEffortText(raw) {
  let t = raw || "";
  if (/=[0-9A-Fa-f]{2}/.test(t) && !/<html/i.test(t)) t = t.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (m, hh) => String.fromCharCode(parseInt(hh, 16)));
  if (/<[a-z!][\s\S]*>/i.test(t)) t = stripHtml(t);
  return t.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 20000);
}

// ── sync one account: return newly-fetched raw message records ──────────────────
async function imapSyncAccount(acct) {
  const T = imapTarget();
  const conn = await imapConnect(T.host, T.port, T.useTls);
  try {
    let r = await conn.send("a1", "LOGIN " + imapQuote(acct.email) + " " + imapQuote(acct.appPassword));
    if (!_ok(r, "a1")) throw new Error("login rejected (check the app password & that 2-Step Verification is on)");
    r = await conn.send("a2", 'SELECT "INBOX"');
    if (!_ok(r, "a2")) throw new Error("could not open INBOX");
    const rs = r.toString("latin1");
    const uidvalidity = Number((/UIDVALIDITY (\d+)/i.exec(rs) || [])[1] || 0);
    const uidnext     = Number((/UIDNEXT (\d+)/i.exec(rs) || [])[1] || 0);
    const st = MAIL_STATE[acct.id] || {};
    let fetchFrom;
    if (!st.uidvalidity || st.uidvalidity !== uidvalidity || !st.highwater) fetchFrom = Math.max(1, uidnext - MAIL_SEED); // seed
    else fetchFrom = st.highwater + 1;                                                                                    // only-new
    let messages = [];
    if (uidnext > 1 && fetchFrom < uidnext) {
      const fr = await conn.send("a3", "UID FETCH " + fetchFrom + ":* (UID INTERNALDATE FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID)])");
      if (!_ok(fr, "a3")) throw new Error("fetch failed");
      messages = parseFetchResponses(fr);
    }
    conn.logout();
    let maxUid = st.highwater || 0;
    for (const m of messages) if (m.uid && m.uid > maxUid) maxUid = m.uid;
    MAIL_STATE[acct.id] = { uidvalidity, highwater: Math.max(maxUid, uidnext - 1) };
    saveMailState();
    return messages;
  } catch (e) { conn.logout(); throw e; }
}

function ingestMessages(acct, messages) {
  let added = 0;
  const now = Date.now();
  const seen = new Set(MAIL_CACHE.map(m => m.messageId).filter(Boolean));
  for (const m of messages) {
    if (m.uid == null) continue;
    const h = parseHeaders(m.payload);
    const messageId = (h["message-id"] || "").trim() || (acct.id + ":" + m.uid);
    if (seen.has(messageId)) continue;
    const fromRaw   = decodeMimeWords(h["from"] || "");
    const subject   = decodeMimeWords(h["subject"] || "(no subject)");
    const fromEmail = ((/<([^>]+)>/.exec(fromRaw) || [])[1] || fromRaw).trim();
    const fromName  = (fromRaw.replace(/<[^>]+>/, "").replace(/"/g, "").trim()) || fromEmail;
    if (isBlocked(fromName, fromEmail, subject)) continue;
    const dateMs = parseImapDate(m.internaldate) || Date.parse(h["date"] || "") || now;
    MAIL_CACHE.push({
      id: acct.id + ":" + m.uid, accountId: acct.id, accountName: acct.name, uid: m.uid,
      messageId, fromName, fromEmail, subject, date: dateMs,
      firstSeenAt: now, openedAt: null, body: null, unread: !/\\Seen/i.test(m.flags),
      important: isImportant(fromName, fromEmail, subject)
    });
    seen.add(messageId); added++;
  }
  if (added) saveMailCache();
  return added;
}

function purgeMail() {
  const cutoff = Date.now() - MAIL_PURGE_DAYS * 86400000;
  const before = MAIL_CACHE.length;
  replaceArray(MAIL_CACHE, MAIL_CACHE.filter(m => m.openedAt != null || m.firstSeenAt >= cutoff)); // opened => kept
  if (MAIL_CACHE.length !== before) { saveMailCache(); return before - MAIL_CACHE.length; }
  return 0;
}

async function fetchMailBody(acct, uid) {
  const T = imapTarget();
  const conn = await imapConnect(T.host, T.port, T.useTls);
  try {
    let r = await conn.send("b1", "LOGIN " + imapQuote(acct.email) + " " + imapQuote(acct.appPassword));
    if (!_ok(r, "b1")) throw new Error("login rejected");
    await conn.send("b2", 'SELECT "INBOX"');
    const fr = await conn.send("b3", "UID FETCH " + uid + " (BODY.PEEK[]<0.262144>)");
    conn.logout();
    const items = parseFetchResponses(fr);
    return items.length ? extractBestText(items[0].payload) : "";
  } catch (e) { conn.logout(); throw e; }
}

async function pollAllMail() {
  if (mailPolling) return; mailPolling = true;
  try {
    for (const acct of MAIL_ACCOUNTS) {
      try {
        const msgs = await imapSyncAccount(acct); const added = ingestMessages(acct, msgs); MAIL_STATUS[acct.id] = { ok: true, at: Date.now() };
      }
      catch (e) {
        MAIL_STATUS[acct.id] = { ok: false, at: Date.now(), error: e.message }; console.error("[Mail]", acct.email, "-", e.message); }
    }
    purgeMail();
  } finally { mailPolling = false; }
}
if (MAIL_ACCOUNTS.length) { setTimeout(pollAllMail, 4000); }
setInterval(pollAllMail, MAIL_POLL_MS);
setInterval(purgeMail, 3600000);
// ═══ end MAIL backend ══════════════════════════════════════════════════════════

module.exports = { MAIL_ACCOUNTS, MAIL_ACCOUNTS_FILE, MAIL_CACHE, MAIL_CACHE_FILE, MAIL_POLL_MS, MAIL_PURGE_DAYS, MAIL_SEED, MAIL_STATE, MAIL_STATE_FILE, MAIL_STATUS, _ok, _rj, bestEffortText, collectMime, ctParam, decodeCTE, decodeCharset, decodeMimeWords, decodePartBody, extractBestText, fetchMailBody, imapConnect, imapQuote, imapSyncAccount, imapTarget, ingestMessages, isBlocked, isImportant, mailBlocklist, mailImportant, mailPolling, parseFetchResponses, parseHeaders, parseImapDate, pollAllMail, purgeMail, replaceArray, retagImportant, saveMailAccounts, saveMailCache, saveMailState, splitHeaderBody, splitMimeParts, stripHtml, taggedDone };
