const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { callAI } = require("../domains/ai");
const { ollamaFirstModel } = require("../domains/ai");
const { agentCall } = require("../domains/social/agent");
const autopilot = require("../domains/social/autopilot");
const news = require("../domains/social/news");
const { linkLength, postLength } = require("../domains/social/length");
const { SOCIAL_AI_SYSTEM, buildSocialAiPrompt, extractJsonArray, resolveAiPeers } = require("../domains/social/ai");
const { bskySession } = require("../domains/social/bluesky");
const { findDuplicate, socialSimilarity } = require("../domains/social/dedupe");
const { liDiagnose } = require("../domains/social/linkedin");
const { metaDiagnose } = require("../domains/social/meta");
const { choose, finish, oauthStatus, pendingChoices, startUrl } = require("../domains/social/oauth");
const { saveAccount, socialTick } = require("../domains/social/publish");
const { parseWhen } = require("../domains/social/schedule");
const { MEDIA_MIME, SOCIAL_AGENT_PORT, SOCIAL_HIDEABLE, SOCIAL_MAX_UPLOAD, SOCIAL_MEDIA_DIR, SOCIAL_MIN_GAP_MS, SOCIAL_PLATFORMS, checkMedia, getDashboard, isVideo, mediaMime, readSocial, writeSocial } = require("../domains/social/store");
const { parseMultipart } = require("../multipart");
const { httpGet } = require("../net");

// Social: the AI copilot, media uploads, accounts, and the post queue.
module.exports = async function socialRoutes(ctx) {
  const { req, res, parsed, pathname, readBody } = ctx;
  // Errors are shown on the page; log them too, so "an error code showed"
  // can be traced afterwards (AI peer down, freenewsapi.io, a platform...).
  const json = (o, status) => {
    if (status >= 400 && o && o.error) console.error("[social]", req.method, pathname, status, "-", o.error);
    return ctx.json(o, status);
  };

  // ── Social AI copilot ────────────────────────────────────────────────────────
  if (pathname === '/api/social/ai/config' && req.method === 'GET') {
    const r = await resolveAiPeers();
    return json({
      host: r.chosen ? r.chosen.host : null,
      name: r.chosen ? r.chosen.name : null,
      model: r.model || null,
      models: r.chosen ? r.chosen.models : [],
      reachable: !!(r.chosen && r.chosen.online),
      // every candidate, so the page can offer a picker and explain what it found
      peers: r.peers.map(p => ({ id: p.id, name: p.name, host: p.host,
        online: p.online, models: p.models, source: p.source })),
    });
  }
  if (pathname === '/api/social/ai/draft' && req.method === 'POST') {
    const b = JSON.parse((await readBody()).toString() || '{}');
    // A news draft: the article (fetched here, never trusted from the page)
    // becomes the context, and its link is appended to each draft.
    let article = null;
    if (b.newsUuid) {
      try { article = await news.articleDetails(b.newsUuid); }
      catch (e) { return json({ error: e.message }, e.status || 502); }
      if (!news.usableArticle(article)) return json({ error: "This article's text isn't available (paywall or login page), so there is nothing to summarise. Pick another." }, 422);
    }
    const promptText = String(b.prompt || '').trim() || (article ? 'this news story, for my audience' : '');
    if (!promptText) return json({ error: 'describe what to post about' }, 400);
    const link = article && article.url && b.link !== false ? '\n\n' + article.url : '';
    const resolved = await resolveAiPeers();
    // An explicit choice from the page wins; otherwise use whatever is online.
    let host = String(b.host || '').trim() || (resolved.chosen && resolved.chosen.host) || '';
    let model = String(b.model || '').trim() || resolved.model || '';
    if (!host) {
      return json({ error: 'No AI peer configured — add one on the AI page' }, 400);
    }
    if (!resolved.peers.some(p => p.online)) {
      const tried = resolved.peers.map(p => p.host).join(', ') || 'none';
      return json({ error: 'No AI peer is responding. Tried: ' + tried }, 502);
    }

    const d = readSocial();
    const dash = getDashboard(d, b.dashboardId);
    const platforms = (Array.isArray(b.platforms) ? b.platforms : []).filter(p => SOCIAL_PLATFORMS[p]);
    const mine = d.queue.filter(q => q.dashboardId === dash.id);
    const history = mine.filter(q => q.status === 'posted' || q.status === 'partial')
      .sort((a, x) => new Date(x.finishedAt || x.createdAt) - new Date(a.finishedAt || a.createdAt));
    const upcoming = mine.filter(q => q.status === 'queued' && q.scheduledAt)
      .sort((a, x) => new Date(a.scheduledAt) - new Date(x.scheduledAt));
    const count = Math.max(1, Math.min(5, parseInt(b.count, 10) || 3));
    const now = new Date();

    if (!model) model = await ollamaFirstModel(host);
    if (!model) return json({ error: 'No model available on ' + host }, 400);

    let raw;
    try {
      raw = await callAI('local', model,
        [{ role: 'user', content: buildSocialAiPrompt({ prompt: promptText, count, tone: b.tone,
          platforms, dash, history, upcoming, now,
          article: article ? news.articleContext(article) : null,
          reserve: link ? Math.max(2, ...platforms.map(p => linkLength(p, article.url) + 2)) : 0 }) }],
        SOCIAL_AI_SYSTEM, 0, { host });
    } catch (e) { return json({ error: 'AI peer: ' + e.message }, 502); }

    const parsed2 = extractJsonArray(raw);
    if (!parsed2 || !Array.isArray(parsed2) || !parsed2.length) {
      return json({ error: 'The model did not return usable JSON', raw: String(raw).slice(0, 600) }, 502);
    }
    // Compare each draft against history AND against the other drafts, so a model
    // that produces three near-identical variants is caught too.
    const drafts = [];
    for (const item of parsed2.slice(0, count)) {
      const body = String((item && item.text) || '').trim();
      if (!body) continue;
      const text = body + link;
      const when = parseWhen(item && item.when, now);
      const dupe = findDuplicate(text, history);
      const selfDupe = drafts.find(prev => socialSimilarity(prev.text, text) >= 0.6);
      const tooLong = platforms.filter(p => postLength(p, text) > SOCIAL_PLATFORMS[p].limit)
        .map(p => SOCIAL_PLATFORMS[p].label);
      drafts.push({
        text, chars: text.length,
        why: String((item && item.why) || '').slice(0, 200),
        whenHint: (item && item.when) || 'now',
        scheduledAt: when.at, whenLabel: when.label, whenUnparsed: when.unparsed || null,
        duplicateOf: dupe, similarToDraft: selfDupe ? true : false,
        tooLongFor: tooLong,
      });
    }
    if (!drafts.length) return json({ error: 'The model returned no usable drafts' }, 502);
    return json({ drafts, model, host, news: article ? { uuid: article.uuid, title: article.title, publisher: article.publisher, url: article.url } : null,
      context: { historyCount: history.length, upcomingCount: upcoming.length, dashboard: dash.name } });
  }

  // ── News (freenewsapi.io) ─────────────────────────────────────────────────────
  if (pathname === '/api/social/news/status' && req.method === 'GET') return json(news.newsStatus());
  if (pathname === '/api/social/news/key' && req.method === 'PUT') {
    const b = JSON.parse((await readBody(4096)).toString() || '{}');
    news.setNewsKey(b.key);
    return json(news.newsStatus());
  }
  if (pathname === '/api/social/news/topics' && req.method === 'GET') {
    try { return json({ topics: await news.listTopics() }); } catch (e) { return json({ error: e.message }, e.status || 502); }
  }
  if (pathname === '/api/social/news' && req.method === 'GET') {
    const q = parsed.searchParams;
    try {
      return json({ articles: await news.listNews({ topic: q.get('topic'), country: q.get('country'), language: q.get('language'),
        keywords: q.get('keywords'), maxAgeHours: Number(q.get('maxAgeHours')) || 0 }, { fresh: q.get('fresh') === '1' }) });
    } catch (e) { return json({ error: e.message }, e.status || 502); }
  }

  // ── Autopilot: writes and publishes on its own from one system prompt ──────
  if (pathname === '/api/social/autopilot' && req.method === 'GET') {
    return json(autopilot.publicCfg(getDashboard(readSocial(), parsed.searchParams.get('dashboard') || '')));
  }
  if (pathname === '/api/social/autopilot' && req.method === 'PUT') {
    const b = JSON.parse((await readBody(64 * 1024)).toString() || '{}');
    try { return json(autopilot.configure(b.dashboardId, b)); }
    catch (e) { return json({ error: e.message }, e.status || 500); }
  }
  if (pathname === '/api/social/autopilot/next-story' && req.method === 'POST') {
    const b = JSON.parse((await readBody(4096)).toString() || '{}');
    try { return json(await autopilot.refreshNextStory(b.dashboardId)); }
    catch (e) { return json({ error: e.message }, e.status || 502); }
  }
  if (pathname === '/api/social/autopilot/run' && req.method === 'POST') {
    const b = JSON.parse((await readBody(16 * 1024)).toString() || '{}');
    try { return json({ ok: true, result: await autopilot.runOnce(b.dashboardId, { preview: !!b.preview }) }); }
    catch (e) { return json({ error: e.message }, 502); }
  }

  // ── Social media uploads ─────────────────────────────────────────────────────
  // Files are stored on the Open HL host and referenced by id. The browser never
  // sends a filesystem path, and ids are validated against the store directory
  // so a crafted id cannot read outside it.
  if (pathname === '/api/social/upload' && req.method === 'POST') {
    const ct = req.headers['content-type'] || '';
    const m = ct.match(/boundary=(?:\"([^\"]+)\"|([^;]+))/);
    if (!m) return json({ error: 'expected multipart/form-data' }, 400);
    const raw = await readBody();
    if (raw.length > SOCIAL_MAX_UPLOAD) {
      return json({ error: 'upload exceeds ' + Math.round(SOCIAL_MAX_UPLOAD / 1048576) + 'MB' }, 413);
    }
    const parts = parseMultipart(raw, (m[1] || m[2]).trim());
    if (!parts.length) return json({ error: 'no files received' }, 400);
    const saved = [], rejected = [];
    for (const p of parts) {
      const ext = path.extname(p.filename).toLowerCase();
      if (!MEDIA_MIME[ext]) { rejected.push({ name: p.filename, error: 'unsupported type ' + (ext || '?') }); continue; }
      if (!p.data.length) { rejected.push({ name: p.filename, error: 'empty file' }); continue; }
      const id = 'm_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex') + ext;
      const dest = path.join(SOCIAL_MEDIA_DIR, id);
      fs.writeFileSync(dest, p.data);
      saved.push({ id, name: p.filename, path: dest, size: p.data.length,
        mime: mediaMime(dest), kind: isVideo(dest) ? 'video' : 'image' });
    }
    return json({ files: saved, rejected });
  }
  if (pathname === '/api/social/media' && (req.method === 'GET' || req.method === 'DELETE')) {
    const id = parsed.searchParams.get('id') || '';
    // basename() strips any traversal; the resolved path must still sit inside
    // the media dir before we touch it.
    const dest = path.join(SOCIAL_MEDIA_DIR, path.basename(id));
    if (!dest.startsWith(SOCIAL_MEDIA_DIR + path.sep) || !fs.existsSync(dest)) {
      return json({ error: 'not found' }, 404);
    }
    if (req.method === 'DELETE') { fs.unlinkSync(dest); return json({ ok: true }); }
    const stat = fs.statSync(dest);
    const range = req.headers.range;
    if (range && isVideo(dest)) {
      // Video previews need range support or Chrome will not scrub or even play.
      const mm = /bytes=(\d*)-(\d*)/.exec(range) || [];
      const start = mm[1] ? parseInt(mm[1], 10) : 0;
      const end = mm[2] ? parseInt(mm[2], 10) : stat.size - 1;
      res.writeHead(206, { 'Content-Type': mediaMime(dest),
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-store' });
      return fs.createReadStream(dest, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': mediaMime(dest), 'Content-Length': stat.size,
      'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
    return fs.createReadStream(dest).pipe(res);
  }

  // ── Official-API sign-in (Facebook/Instagram via Meta, LinkedIn) ─────────────
  // The callback itself is in routes/public.js; it needs no Open HL session.
  const oauthStart = pathname.match(/^\/api\/social\/oauth\/(meta|linkedin)\/start$/);
  if (oauthStart && req.method === 'GET') {
    const dash = parsed.searchParams.get('dashboard') || '';
    try { res.writeHead(302, { Location: startUrl(oauthStart[1], dash) }); return res.end(); }
    catch (e) { res.writeHead(302, { Location: '/social?serr=' + encodeURIComponent(e.message) }); return res.end(); }
  }
  if (pathname === '/api/social/oauth/finish' && req.method === 'POST') {
    const body = JSON.parse((await readBody(16 * 1024)).toString() || '{}');
    let u; try { u = new URL(String(body.url || '').trim()); } catch { return json({ error: 'Paste the whole address from the address bar' }, 400); }
    try { return json(Object.assign({ ok: true }, await finish(u.searchParams))); }
    catch (e) { return json({ error: e.message }, 400); }
  }
  if (pathname === '/api/social/oauth/pending' && req.method === 'GET') {
    return json({ choices: pendingChoices(getDashboard(readSocial(), parsed.searchParams.get('dashboard') || '').id) });
  }
  if (pathname === '/api/social/oauth/choose' && req.method === 'POST') {
    const body = JSON.parse((await readBody(16 * 1024)).toString() || '{}');
    if (body.provider !== 'meta' && body.provider !== 'linkedin') return json({ error: 'unknown provider' }, 400);
    try { return json({ ok: true, saved: choose(body.dashboardId, body.provider, body) }); }
    catch (e) { return json({ error: e.message }, 400); }
  }

  // ── Social autopost API ──────────────────────────────────────────────────────
  if (pathname === '/api/social/platforms' && req.method === 'GET') {
    const d = readSocial();
    const dash = getDashboard(d, parsed.searchParams.get('dashboard') || '');
    let agent = { online: false, sessions: {} };
    try {
      const r = await agentCall('/status', 'GET', null, 4000);
      agent = Object.assign({ online: true }, JSON.parse(r.body || '{}'));
    } catch (e) { agent = { online: false, error: e.message, sessions: {} }; }
    return json({
      platforms: Object.entries(SOCIAL_PLATFORMS).map(([id, m]) => {
        const acct = dash.accounts.find(a => a.platform === id);
        return Object.assign({ id }, m, {
          configured: m.via === 'native' ? !!acct : !!(agent.sessions && agent.sessions[id]),
          enabled: acct ? acct.enabled !== false : (m.via === 'agent'),
          sessionAge: agent.sessions ? agent.sessions[id] : null,
        });
      }),
      agent: { online: agent.online, port: SOCIAL_AGENT_PORT, error: agent.error || null },
      minGapMs: SOCIAL_MIN_GAP_MS,
      oauth: oauthStatus(),
      dashboards: d.dashboards.map(x => ({ id: x.id, name: x.name })),
      dashboardId: dash.id,
      emails: dash.emails || {},
    });
  }
  if (pathname === '/api/social/dashboards' && req.method === 'GET') {
    const d = readSocial();
    return json({ dashboards: d.dashboards.map(x => ({
      id: x.id, name: x.name,
      hidden: x.hidden || {},
      accounts: x.accounts.length,
      queued: d.queue.filter(q => q.dashboardId === x.id &&
        (q.status === 'queued' || q.status === 'posting')).length,
    })) });
  }
  if (pathname.startsWith('/api/social/dashboards/') && req.method === 'PUT') {
    const id = pathname.split('/')[4];
    const body = JSON.parse((await readBody()).toString() || '{}');
    const d = readSocial();
    const dash = d.dashboards.find(x => x.id === id);
    if (!dash) return json({ error: 'not found' }, 404);
    if (typeof body.name === 'string' && body.name.trim()) dash.name = body.name.trim().slice(0, 40);
    // { autopilot: true } hides that card on this dashboard, false shows it again.
    if (body.hidden && typeof body.hidden === 'object') {
      dash.hidden = dash.hidden || {};
      for (const k of SOCIAL_HIDEABLE) {
        if (body.hidden[k] === true) dash.hidden[k] = true;
        else if (body.hidden[k] === false) delete dash.hidden[k];
      }
    }
    writeSocial(d);
    return json({ ok: true, id: dash.id, name: dash.name, hidden: dash.hidden || {} });
  }
  // Contact emails: pure record-keeping for "which address did I sign up with".
  // Never used to authenticate anything.
  if (pathname === '/api/social/emails' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString() || '{}');
    const d = readSocial();
    const dash = getDashboard(d, body.dashboardId);
    if (!SOCIAL_PLATFORMS[body.platform]) return json({ error: 'unknown platform' }, 400);
    const v = (body.email || '').trim();
    if (v) dash.emails[body.platform] = v.slice(0, 160);
    else delete dash.emails[body.platform];
    writeSocial(d);
    return json({ ok: true, emails: dash.emails });
  }
  if (pathname === '/api/social/accounts' && req.method === 'GET') {
    const dsh = getDashboard(readSocial(), parsed.searchParams.get('dashboard') || '');
    return json({ accounts: dsh.accounts.map(a => ({
      platform: a.platform, enabled: a.enabled !== false,
      handle: a.handle || a.instance || (a.platform === 'instagram' && a.username ? '@' + a.username : '') || a.pageName || a.orgName || '',
      hasSecret: !!(a.appPassword || a.token),
      expiresAt: a.platform === 'linkedin' ? (a.refreshToken ? null : a.expiresAt || null) : null,
    })) });
  }
  if (pathname === '/api/social/accounts' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString() || '{}');
    if (!SOCIAL_PLATFORMS[body.platform]) return json({ error: 'unknown platform' }, 400);
    const d = readSocial();
    const dash = getDashboard(d, body.dashboardId);
    const i = dash.accounts.findIndex(a => a.platform === body.platform);
    const next = Object.assign({}, i === -1 ? {} : dash.accounts[i], {
      platform: body.platform, enabled: body.enabled !== false,
    });
    if (body.platform === 'bluesky') {
      if (body.handle) next.handle = body.handle.trim().replace(/^@/, '');
      if (body.appPassword) next.appPassword = body.appPassword.trim();
      if (body.host) next.host = body.host.trim();
    }
    if (body.platform === 'mastodon') {
      // "mastodon.social" with no scheme makes new URL() throw "Invalid URL",
      // which surfaces as a baffling error at publish time. Normalise here.
      if (body.instance) {
        let inst = body.instance.trim().replace(/\/+$/, '');
        if (inst && !/^https?:/i.test(inst)) inst = 'https://' + inst;
        next.instance = inst;
      }
      if (body.token) next.token = body.token.trim();
      if (body.visibility) next.visibility = body.visibility;
    }
    if (typeof body.email === 'string') {
      const e = body.email.trim();
      if (e) dash.emails[body.platform] = e.slice(0, 160); else delete dash.emails[body.platform];
    }
    if (i === -1) dash.accounts.push(next); else dash.accounts[i] = next;
    writeSocial(d);
    return json({ ok: true });
  }
  if (pathname.startsWith('/api/social/accounts/') && req.method === 'DELETE') {
    const p = pathname.split('/')[4];
    const d = readSocial();
    const dash = getDashboard(d, parsed.searchParams.get('dashboard') || '');
    dash.accounts = dash.accounts.filter(a => a.platform !== p);
    writeSocial(d);
    return json({ ok: true });
  }
  // Verify credentials without publishing anything.
  if (pathname === '/api/social/verify' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString() || '{}');
    const d = readSocial();
    const acct = getDashboard(d, body.dashboardId).accounts.find(a => a.platform === body.platform);
    if (!acct) return json({ ok: false, error: 'not configured' }, 400);
    try {
      if (body.platform === 'bluesky') {
        const s = await bskySession(acct);
        return json({ ok: true, detail: s.did });
      }
      if (body.platform === 'mastodon') {
        const r = await httpGet(acct.instance.replace(/\/$/, '') + '/api/v1/accounts/verify_credentials',
          15000, { Authorization: 'Bearer ' + acct.token });
        const o = JSON.parse(r);
        return json({ ok: true, detail: '@' + o.acct });
      }
      if (acct.via === 'api') {
        const steps = [];
        const step = async (name, fn) => { try { steps.push({ name, ok: true, detail: await fn() }); } catch (e) { steps.push({ name, ok: false, detail: e.message }); } };
        if (body.platform === 'linkedin') await liDiagnose(acct, step, a => saveAccount(body.dashboardId, a));
        else await metaDiagnose(acct, step);
        const bad = steps.find(x => !x.ok);
        return bad ? json({ ok: false, error: bad.name + ': ' + bad.detail }, 502) : json({ ok: true, detail: steps[steps.length - 1].detail });
      }
      return json({ ok: false, error: 'browser-session platforms verify via the agent' }, 400);
    } catch (e) { return json({ ok: false, error: e.message }, 502); }
  }

  // Preflight a native account and report exactly what the server said, so a
  // failure is actionable instead of a red chip with a truncated message.
  if (pathname === '/api/social/diagnose' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString() || '{}');
    const d = readSocial();
    const dash = getDashboard(d, body.dashboardId);
    const acct = dash.accounts.find(a => a.platform === body.platform);
    if (!acct) return json({ ok: false, steps: [{ name: 'Account', ok: false, detail: 'not configured on ' + dash.name }] });
    const steps = [];
    const step = async (name, fn) => {
      try { const detail = await fn(); steps.push({ name, ok: true, detail: detail || 'ok' }); return true; }
      catch (e) { steps.push({ name, ok: false, detail: e.message }); return false; }
    };
    if (body.platform === 'mastodon') {
      const base = String(acct.instance || '').replace(/\/+$/, '');
      await step('Instance URL', async () => {
        if (!base) throw new Error('no instance set');
        if (!/^https?:\/\//.test(base)) throw new Error('missing http:// or https://');
        return base;
      });
      let inst = null;
      await step('Instance reachable', async () => {
        const raw = await httpGet(base + '/api/v1/instance', 12000, { Accept: 'application/json' });
        inst = JSON.parse(raw);
        return (inst.title || inst.domain || 'ok') + ' \u00b7 ' + (inst.version || '');
      });
      await step('Token valid', async () => {
        const raw = await httpGet(base + '/api/v1/accounts/verify_credentials', 12000,
          { Authorization: 'Bearer ' + acct.token });
        const me = JSON.parse(raw);
        if (!me.acct) throw new Error('no account returned');
        return '@' + me.acct + ' (' + (me.display_name || '') + ')';
      });
      await step('Token scopes', async () => {
        const raw = await httpGet(base + '/api/v1/apps/verify_credentials', 12000,
          { Authorization: 'Bearer ' + acct.token });
        const app = JSON.parse(raw);
        return 'app "' + (app.name || '?') + '" \u2014 if posting 403s, recreate it with write:statuses and write:media';
      });
      if (inst) {
        const cfg = inst.configuration || {};
        const chars = (cfg.statuses && cfg.statuses.max_characters) || inst.max_toot_chars || 500;
        steps.push({ name: 'Character limit', ok: true, detail: chars + ' (Open HL assumes 500)' });
        const mm = cfg.media_attachments || {};
        if (mm.image_size_limit) {
          steps.push({ name: 'Media limits', ok: true,
            detail: 'image ' + Math.round(mm.image_size_limit / 1048576) + 'MB, video ' +
              Math.round((mm.video_size_limit || 0) / 1048576) + 'MB, up to ' +
              ((cfg.statuses && cfg.statuses.max_media_attachments) || 4) + ' attachments' });
        }
      }
    } else if (body.platform === 'bluesky') {
      await step('Login', async () => {
        const sess = await bskySession(acct);
        return sess.did;
      });
    } else if (acct.via === 'api' && body.platform === 'linkedin') {
      await liDiagnose(acct, step, a => saveAccount(dash.id, a));
    } else if (acct.via === 'api') {
      await metaDiagnose(acct, step);
    } else {
      steps.push({ name: 'Unsupported', ok: false, detail: 'diagnostics cover accounts connected through an official API' });
    }
    return json({ ok: steps.every(x => x.ok), steps });
  }

  if (pathname === '/api/social/queue' && req.method === 'GET') {
    const d = readSocial();
    const want = parsed.searchParams.get('dashboard') || '';
    const rows = want ? d.queue.filter(q => q.dashboardId === want) : d.queue;
    return json({ queue: rows.slice().sort((a, b) =>
      new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 100) });
  }
  if (pathname === '/api/social/queue' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString() || '{}');
    const text = (body.text || '').trim();
    const platforms = Array.isArray(body.platforms) ? body.platforms.filter(p => SOCIAL_PLATFORMS[p]) : [];
    if (!text) return json({ error: 'post text is empty' }, 400);
    if (!platforms.length) return json({ error: 'pick at least one platform' }, 400);
    const over = platforms.filter(p => SOCIAL_PLATFORMS[p].limit && postLength(p, text) > SOCIAL_PLATFORMS[p].limit);
    if (over.length) return json({ error: 'too long for ' + over.map(p => SOCIAL_PLATFORMS[p].label).join(', ') }, 400);
    const d = readSocial();
    const dash = getDashboard(d, body.dashboardId);
    const missing = platforms.filter(p => SOCIAL_PLATFORMS[p].via === 'native' &&
      !dash.accounts.find(a => a.platform === p && a.enabled !== false));
    if (missing.length) {
      return json({ error: 'no account on ' + dash.name + ' for ' +
        missing.map(p => SOCIAL_PLATFORMS[p].label).join(', ') }, 400);
    }
    // media arrives as upload ids; resolve to on-disk paths server-side
    const mediaPaths = (Array.isArray(body.media) ? body.media : (body.media ? [body.media] : []))
      .map(x => path.join(SOCIAL_MEDIA_DIR, path.basename(String(x))))
      .filter(f => f.startsWith(SOCIAL_MEDIA_DIR + path.sep) && fs.existsSync(f));
    for (const p of platforms) {
      const bad = checkMedia(p, mediaPaths);
      if (bad) return json({ error: bad }, 400);
      if (SOCIAL_PLATFORMS[p].needsMedia && !mediaPaths.length) {
        return json({ error: SOCIAL_PLATFORMS[p].label + ' requires an image or video' }, 400);
      }
    }
    const item = {
      id: 'sp_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'),
      dashboardId: dash.id,
      text, platforms, media: mediaPaths, alt: body.alt || '',
      scheduledAt: body.scheduledAt || null,
      status: 'queued', results: {}, attempts: 0,
      createdAt: new Date().toISOString(),
    };
    d.queue.unshift(item);
    if (d.queue.length > 500) d.queue.length = 500;
    writeSocial(d);
    if (!item.scheduledAt || new Date(item.scheduledAt).getTime() <= Date.now()) setTimeout(socialTick, 300);
    return json(item);
  }
  if (pathname.startsWith('/api/social/queue/') && req.method === 'DELETE') {
    const id = pathname.split('/')[4];
    const d = readSocial();
    const item = d.queue.find(q => q.id === id);
    if (item && item.status === 'posting') return json({ error: 'already publishing' }, 409);
    d.queue = d.queue.filter(q => q.id !== id);
    writeSocial(d);
    return json({ ok: true });
  }
  if (pathname.startsWith('/api/social/retry/') && req.method === 'POST') {
    const id = pathname.split('/')[4];
    const d = readSocial();
    const item = d.queue.find(q => q.id === id);
    if (!item) return json({ error: 'not found' }, 404);
    if (item.status === 'posting') return json({ error: 'already publishing' }, 409);
    item.status = 'queued'; item.attempts = 0;
    delete item.nextAttemptAt;
    item.scheduledAt = null;          // manual retry means "send it now"
    writeSocial(d);
    setTimeout(socialTick, 300);
    return json({ ok: true });
  }
  // Agent-side browser login: opens a real window so YOU sign in by hand.
  // No password is ever sent to or stored by Open HL.
  if (pathname === '/api/social/agent/login' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString() || '{}');
    try {
      const r = await agentCall('/login', 'POST', { platform: body.platform }, 300000);
      return json(JSON.parse(r.body || '{}'), r.status);
    } catch (e) { return json({ error: e.message }, 503); }
  }
  if (pathname === '/api/social/agent/logout' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString() || '{}');
    try {
      const r = await agentCall('/logout', 'POST', { platform: body.platform }, 15000);
      return json(JSON.parse(r.body || '{}'), r.status);
    } catch (e) { return json({ error: e.message }, 503); }
  }
};
