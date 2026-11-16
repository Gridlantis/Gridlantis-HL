const { MAIL_ACCOUNTS, MAIL_CACHE, MAIL_PURGE_DAYS, MAIL_STATE, MAIL_STATUS, fetchMailBody, mailBlocklist, mailImportant, pollAllMail, replaceArray, retagImportant, saveMailAccounts, saveMailCache, saveMailState } = require("../domains/mail");
const { SETTINGS, saveSettings } = require("../settings");

// Multi-account IMAP mail, read-only.
module.exports = async function mailRoutes(ctx) {
  const { req, parsed, pathname, json, readBody } = ctx;

  // ── Mail API (multi-account Gmail, read-only) ─────────────────────────────────
  if (pathname === '/api/mail/accounts' && req.method === 'GET') {
    return json({
      purgeDays: MAIL_PURGE_DAYS,
      blocklist: mailBlocklist(),
      accounts: MAIL_ACCOUNTS.map(a => ({
        id: a.id, name: a.name, email: a.email,
        status: MAIL_STATUS[a.id] || { ok: null },
        count: MAIL_CACHE.filter(m => m.accountId === a.id).length
      }))
    });
  }
  if (pathname === '/api/mail/accounts' && req.method === 'POST') {
    const b = JSON.parse((await readBody()).toString());
    const email = String(b.email || '').trim();
    const appPassword = String(b.appPassword || '').replace(/\s+/g, ''); // app passwords shown with spaces
    const name = String(b.name || '').trim() || email;
    if (!email || !appPassword) return json({ error: 'email and app password required' }, 400);
    if (MAIL_ACCOUNTS.some(a => a.email.toLowerCase() === email.toLowerCase())) return json({ error: 'account already added' }, 400);
    const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    MAIL_ACCOUNTS.push({ id, name, email, appPassword });
    saveMailAccounts();
    pollAllMail(); // kick an immediate sync
    return json({ ok: true, id });
  }
  if (pathname === '/api/mail/accounts/delete' && req.method === 'POST') {
    const b = JSON.parse((await readBody()).toString());
    const id = b.id;
    replaceArray(MAIL_ACCOUNTS, MAIL_ACCOUNTS.filter(a => a.id !== id));
    replaceArray(MAIL_CACHE, MAIL_CACHE.filter(m => m.accountId !== id));
    delete MAIL_STATE[id]; delete MAIL_STATUS[id];
    saveMailAccounts(); saveMailCache(); saveMailState();
    return json({ ok: true });
  }
  if (pathname === '/api/mail/messages' && req.method === 'GET') {
    const box = parsed.searchParams.get('box') || 'all';
    let list = MAIL_CACHE
      .map(m => ({ id: m.id, accountId: m.accountId, accountName: m.accountName, fromName: m.fromName, fromEmail: m.fromEmail, subject: m.subject, date: m.date, openedAt: m.openedAt, firstSeenAt: m.firstSeenAt, hasBody: !!m.body, important: !!m.important }))
      .sort((a, b) => b.date - a.date);
    if (box === 'important') list = list.filter(m => m.important);
    return json({ messages: list, purgeDays: MAIL_PURGE_DAYS, importantCount: MAIL_CACHE.filter(m => m.important).length, total: MAIL_CACHE.length });
  }
  if (pathname === '/api/mail/open' && req.method === 'POST') {
    const b = JSON.parse((await readBody()).toString());
    const msg = MAIL_CACHE.find(m => m.id === b.id);
    if (!msg) return json({ error: 'not found' }, 404);
    if (!msg.openedAt) msg.openedAt = Date.now(); // opened => kept (excluded from purge)
    if (!msg.body) {
      const acct = MAIL_ACCOUNTS.find(a => a.id === msg.accountId);
      if (acct) { try { msg.body = await fetchMailBody(acct, msg.uid); } catch (e) { msg.body = '[could not load body: ' + e.message + ']'; } }
    }
    saveMailCache();
    return json({ ok: true, subject: msg.subject, fromName: msg.fromName, fromEmail: msg.fromEmail, date: msg.date, body: msg.body || '' });
  }
  if (pathname === '/api/mail/delete' && req.method === 'POST') {
    const b = JSON.parse((await readBody()).toString());
    const before = MAIL_CACHE.length;
    replaceArray(MAIL_CACHE, MAIL_CACHE.filter(m => m.id !== b.id));
    if (MAIL_CACHE.length !== before) saveMailCache();
    return json({ ok: true });
  }
  if (pathname === '/api/mail/poll' && req.method === 'POST') {
    await pollAllMail();
    return json({ ok: true, accounts: MAIL_ACCOUNTS.map(a => ({ id: a.id, status: MAIL_STATUS[a.id] || {} })) });
  }
  if (pathname === '/api/mail/blocklist' && req.method === 'POST') {
    const b = JSON.parse((await readBody()).toString());
    if (Array.isArray(b.blocklist)) SETTINGS.mailBlocklist = b.blocklist.map(x => String(x).trim()).filter(Boolean).slice(0, 200);
    saveSettings();
    return json({ ok: true, blocklist: mailBlocklist() });
  }
  if (pathname === '/api/mail/important' && req.method === 'GET') {
    return json(mailImportant());
  }
  if (pathname === '/api/mail/important' && req.method === 'POST') {
    const b = JSON.parse((await readBody()).toString());
    const clean = a => Array.isArray(a) ? a.map(x => String(x).trim()).filter(Boolean).slice(0, 200) : [];
    SETTINGS.mailImportant = { senders: clean(b.senders), keywords: clean(b.keywords) };
    saveSettings();
    const changed = retagImportant(); // re-classify existing cached mail
    return json({ ok: true, rules: mailImportant(), retagged: changed });
  }
};
