const { BLINK_EMAIL, BLINK_PASSWORD, RING_REFRESH_TOKEN, WYZE_API_KEY, WYZE_EMAIL, WYZE_KEY_ID, WYZE_PASSWORD } = require("../config");
const { BLINK, blinkFetchImage, blinkHomescreen, blinkThumbUrl, blinkVerify } = require("../domains/homeos/blink");
const { HOMEOS_ADAPTERS, homeosPoll } = require("../domains/homeos/index");
const { kasaDiscover } = require("../domains/homeos/kasa");
const { ringDevices } = require("../domains/homeos/ring");
const { HOMEOS_ENERGY, HOMEOS_STATE, readHomeOS, writeHomeOS } = require("../domains/homeos/store");
const { tuyaDiscover } = require("../domains/homeos/tuya");
const { wyzeList } = require("../domains/homeos/wyze");

// HomeOS: device registry, commands, discovery, and vendor credentials.
module.exports = async function homeosRoutes(ctx) {
  const { req, res, parsed, pathname, json, readBody } = ctx;

  // ── HomeOS API ───────────────────────────────────────────────────────────────
  if (pathname === '/api/homeos/devices' && req.method === 'GET') {
    const d = readHomeOS();
    return json({ devices: d.devices.map(x => Object.assign({}, x, {
      // never leak secrets to the browser
      localKey: x.localKey ? '\u2022'.repeat(8) : undefined,
      rtsp: x.rtsp ? x.rtsp.replace(/\/\/[^@]*@/, '//\u2022\u2022\u2022@') : undefined,
      live: HOMEOS_STATE[x.id] || { online: null, state: {}, at: 0 },
    })), rooms: d.rooms || [] });
  }
  if (pathname === '/api/homeos/devices' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString() || '{}');
    if (!body.vendor || !HOMEOS_ADAPTERS[body.vendor]) return json({ error: 'unknown vendor' }, 400);
    const d = readHomeOS();
    const dev = {
      id: 'ho_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      vendor: body.vendor, name: body.name || 'Device', kind: body.kind || 'plug',
      room: body.room || '', host: body.host || '', enabled: true,
      devId: body.devId || '', localKey: body.localKey || '', mode: body.mode || '',
      networkId: body.networkId || '', rtsp: body.rtsp || '', port: body.port || undefined,
      powerFrom: body.powerFrom || '', idleWatts: body.idleWatts, cookWatts: body.cookWatts,
      preheatMs: body.preheatMs, doneHoldMs: body.doneHoldMs, alertOnDone: body.alertOnDone,
      dp: body.dp || undefined, channel: body.channel || undefined,
      createdAt: new Date().toISOString(),
    };
    d.devices.push(dev); writeHomeOS(d);
    homeosPoll();
    return json(dev);
  }
  if (pathname.startsWith('/api/homeos/devices/') && req.method === 'PUT') {
    const id = pathname.split('/')[4];
    const body = JSON.parse((await readBody()).toString() || '{}');
    const d = readHomeOS();
    const i = d.devices.findIndex(x => x.id === id);
    if (i === -1) return json({ error: 'not found' }, 404);
    // a masked localKey coming back from the UI must not overwrite the real one
    if (body.localKey && /^\u2022+$/.test(body.localKey)) delete body.localKey;
    if (body.rtsp && body.rtsp.includes('\u2022\u2022\u2022@')) delete body.rtsp;
    d.devices[i] = Object.assign({}, d.devices[i], body, { id });
    writeHomeOS(d); homeosPoll();
    return json(d.devices[i]);
  }
  if (pathname.startsWith('/api/homeos/devices/') && req.method === 'DELETE') {
    const id = pathname.split('/')[4];
    const d = readHomeOS();
    d.devices = d.devices.filter(x => x.id !== id);
    delete HOMEOS_STATE[id]; delete HOMEOS_ENERGY[id];
    writeHomeOS(d);
    return json({ ok: true });
  }
  if (pathname === '/api/homeos/command' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString() || '{}');
    const dev = readHomeOS().devices.find(x => x.id === body.id);
    if (!dev) return json({ error: 'device not found' }, 404);
    const a = HOMEOS_ADAPTERS[dev.vendor];
    if (!a) return json({ error: 'unknown vendor' }, 400);
    try {
      const r = await a.command(dev, body);
      setTimeout(homeosPoll, 400);   // reflect the new state quickly
      return json(r, r.ok ? 200 : 502);
    } catch (e) { return json({ ok: false, error: e.message }, 502); }
  }
  // Camera still image. Binary — never JSON-encoded, never cached.
  if (pathname === '/api/homeos/thumb' && req.method === 'GET') {
    const dev = readHomeOS().devices.find(x => x.id === (parsed.searchParams.get('id') || ''));
    if (!dev) return json({ error: 'device not found' }, 404);
    try {
      if (dev.vendor === 'blink') {
        const url = await blinkThumbUrl(dev);
        if (!url) return json({ error: 'no thumbnail yet \u2014 take a snapshot first' }, 404);
        const img = await blinkFetchImage(url);
        res.writeHead(200, { 'Content-Type': img.type, 'Cache-Control': 'no-store', 'Content-Length': img.buf.length });
        return res.end(img.buf);
      }
      return json({ error: dev.vendor + ' has no still-image endpoint' }, 501);
    } catch (e) { return json({ error: e.message }, 502); }
  }
  if (pathname === '/api/homeos/energy' && req.method === 'GET') {
    const id = parsed.searchParams.get('id') || '';
    return json({ id, series: HOMEOS_ENERGY[id] || [] });
  }
  if (pathname === '/api/homeos/discover' && req.method === 'POST') {
    const known = new Set(readHomeOS().devices.map(d => (d.host || '') + '|' + (d.devId || '')));
    const [kasa, tuya] = await Promise.all([
      kasaDiscover(3000).catch(() => []),
      tuyaDiscover(4000).catch(() => []),
    ]);
    const all = [].concat(kasa, tuya).filter(f =>
      !known.has((f.host || '') + '|' + (f.devId || '')) && !known.has((f.host || '') + '|'));
    return json({ found: all });
  }
  if (pathname === '/api/homeos/poll' && req.method === 'POST') {
    // Await twice: the first may be an already-running sweep that predates a
    // just-added device, the second is guaranteed to include it.
    await homeosPoll();
    await homeosPoll();
    return json({ ok: true, at: Date.now() });
  }
  // Cloud account helpers — list what the account can see, so devices can be
  // added by picking from a list instead of hand-typing IDs.
  if (pathname === '/api/homeos/cloud/wyze' && req.method === 'GET') {
    try {
      const list = await wyzeList();
      return json({ devices: list.map(d => ({ devId: d.mac, name: d.nickname, model: d.product_model, type: d.product_type })) });
    } catch (e) { return json({ error: e.message, devices: [] }, 502); }
  }
  if (pathname === '/api/homeos/cloud/blink' && req.method === 'GET') {
    try {
      const hs = await blinkHomescreen();
      const cams = [].concat(hs.cameras || [], hs.owls || [], hs.doorbells || []);
      return json({ needs2fa: !!BLINK.needs2fa,
        devices: cams.map(c => ({ devId: String(c.id), name: c.name, networkId: c.network_id, type: c.type || 'camera' })) });
    } catch (e) { return json({ error: e.message, needs2fa: !!BLINK.needs2fa, devices: [] }, 502); }
  }
  if (pathname === '/api/homeos/cloud/blink/2fa' && req.method === 'POST') {
    const body = JSON.parse((await readBody()).toString() || '{}');
    try { return json(await blinkVerify(body.pin)); }
    catch (e) { return json({ error: e.message }, 502); }
  }
  if (pathname === '/api/homeos/cloud/ring' && req.method === 'GET') {
    try {
      const d = await ringDevices();
      const all = [].concat(d.doorbots || [], d.authorized_doorbots || [], d.stickup_cams || []);
      return json({ devices: all.map(c => ({ devId: String(c.id), name: c.description, model: c.kind })) });
    } catch (e) { return json({ error: e.message, devices: [] }, 502); }
  }
  if (pathname === '/api/homeos/credentials' && req.method === 'GET') {
    // which vendors are actually usable right now, so the UI can say so
    return json({
      kasa:   { needsCreds: false, ready: true,  note: 'local LAN protocol' },
      gosund: { needsCreds: false, ready: true,  note: 'local; needs devId + localKey per device' },
      sonoff: { needsCreds: false, ready: true,  note: 'Tasmota HTTP or eWeLink DIY mode' },
      camera: { needsCreds: false, ready: true,  note: 'RTSP / ONVIF reachability' },
      typhur: { needsCreds: false, ready: true,  note: 'no vendor API \u2014 inferred from a bound power plug' },
      wyze:   { needsCreds: true,  ready: !!(WYZE_EMAIL && WYZE_PASSWORD && WYZE_API_KEY && WYZE_KEY_ID),
                envKeys: ['WYZE_EMAIL', 'WYZE_PASSWORD', 'WYZE_API_KEY', 'WYZE_KEY_ID'] },
      blink:  { needsCreds: true,  ready: !!(BLINK_EMAIL && BLINK_PASSWORD),
                envKeys: ['BLINK_EMAIL', 'BLINK_PASSWORD', 'BLINK_UUID'] },
      ring:   { needsCreds: true,  ready: !!RING_REFRESH_TOKEN, envKeys: ['RING_REFRESH_TOKEN'] },
    });
  }
};
