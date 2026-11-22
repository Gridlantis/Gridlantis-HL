// Halo — the home page's 3D helper. Click it and it offers Help or Nevermind;
// Help opens a feature picker that says which API keys and credentials each
// Gridlantis-HL feature needs and where to put them.
//
// Loaded as an ES module by src/pages/home.js, with an import map that points
// "three" at the vendored copy in src/ui/vendor/three-0.170.0.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// ── What each feature needs ──────────────────────────────────────────────────
// keys: [name, what it is, where to get it]. Names in CAPS are set in
// Settings → Keys (they live in .env);
// lower-case ones are typed into the page itself.
const FEATURES = [
  { id: 'ai', name: 'AI chat', href: '/ai',
    about: 'Chat with a model in the cloud through OpenRouter, or with one running on your own network through Ollama.',
    keys: [['OPENROUTER_API_KEY', 'Your OpenRouter API key, for cloud models.', 'openrouter.ai/keys']],
    free: 'Local models need no key: run Ollama and set OLLAMA_HOST if it is not on this machine.',
    where: 'Paste the key on the AI page, or put it in .env.' },
  { id: 'calendar', name: 'Calendar (Google sync)', href: '/calendar',
    about: 'Two-way sync between the Gridlantis-HL calendar and Google Calendar.',
    keys: [['GOOGLE_CLIENT_ID', 'OAuth client ID of a "Web application" client.', 'Google Cloud console, with the Calendar API turned on'],
           ['GOOGLE_CLIENT_SECRET', 'The secret of that same OAuth client.', 'Google Cloud console'],
           ['GOOGLE_REDIRECT_URI', 'Optional. Only if you do not use http://localhost:<PORT>/api/calendar/callback.', 'Must match the redirect URI on the client']],
    free: 'The calendar itself works without Google. Keys are only for syncing.',
    where: 'Add them in Settings → Keys, restart, then press Connect on the Calendar page.' },
  { id: 'mail', name: 'Mail', href: '/mail',
    about: 'Reads your inboxes over IMAP.',
    keys: [['account address', 'The email address to read.', 'Your mail provider'],
           ['app password', 'An app password, not your normal login. Gmail, Outlook and iCloud all require one.', 'Your mail account security settings']],
    free: 'No API key needed. MAIL_IMAP_HOST is only for providers Gridlantis-HL cannot detect.',
    where: 'Add accounts on the Mail page, under Accounts and rules.' },
  { id: 'voicemail', name: 'Voicemail and Texts', href: '/voicemail',
    about: 'Pulls voicemail recordings and incoming text messages from a Twilio number.',
    keys: [['TWILIO_ACCOUNT_SID', 'Your Twilio account SID (starts with AC).', 'console.twilio.com'],
           ['TWILIO_AUTH_TOKEN', 'Your Twilio auth token.', 'console.twilio.com'],
           ['TWILIO_NUMBER', 'Optional. Only keep messages left on this number, like +18335550100.', 'Your Twilio phone numbers']],
    where: 'Add them in Settings → Keys and restart. Both pages stay off until the SID and token are set.' },
  { id: 'homeos', name: 'HomeOS (smart home)', href: '/homeos',
    about: 'Controls lights, plugs and cameras. Kasa, Sonoff and Tuya-local devices are found on your network and need nothing.',
    keys: [['WYZE_EMAIL / WYZE_PASSWORD', 'Your Wyze login.', 'Wyze app'],
           ['WYZE_API_KEY / WYZE_KEY_ID', 'A Wyze developer API key and its ID.', 'developer-api-console.wyze.com'],
           ['BLINK_EMAIL / BLINK_PASSWORD', 'Your Blink login. Set BLINK_UUID too so you are not asked for 2FA after every restart.', 'Blink app'],
           ['RING_REFRESH_TOKEN', 'A Ring refresh token.', 'The ring-client-api command-line tool'],
           ['TUYA_CLIENT_ID / TUYA_CLIENT_SECRET', 'Only for Tuya devices that cannot be reached locally.', 'iot.tuya.com']],
    where: 'Only add the vendors you own, in Settings → Keys, then restart.' },
  { id: 'monitoring', name: 'Monitoring', href: '/monitoring',
    about: 'Watches your machines and services and shows what is up or down.',
    keys: [['UPTIMEROBOT_KEY', 'Optional. A read-only UptimeRobot API key, to show your UptimeRobot monitors too.', 'uptimerobot.com: Integrations and API']],
    free: 'Checking your own machines needs no key.',
    where: 'Add it in Settings → Keys and restart.' },
  { id: 'weather', name: 'Weather', href: '/',
    about: 'The weather line under the greeting on this page.',
    keys: [],
    free: 'No key needed. Set the location in Settings → Keys → Weather.' },
  { id: 'finance', name: 'Finance', href: '/finance',
    about: 'Stock and portfolio prices.',
    keys: [],
    free: 'No key needed. Prices come from a public quote feed.' },
  { id: 'tts', name: 'Spoken alerts', href: '/',
    about: 'Reads alerts out loud. Turn it on with the speaker button at the top of this page.',
    keys: [],
    free: 'No key needed. TTS_VOICE picks the online voice, PIPER_VOICE the offline one.' },
  { id: 'login', name: 'Signing in', href: '/',
    about: 'The password that protects this dashboard.',
    keys: [['PASSWORD', 'Required. Gridlantis-HL will not start without it.', 'You choose it']],
    where: 'Gridlantis-HL Server: its window, under Settings. Otherwise PASSWORD in .env.' },
];

// ── The panel ────────────────────────────────────────────────────────────────
const root = document.getElementById('halo');
const btn = document.getElementById('halo-btn');
const panel = document.getElementById('halo-panel');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function showAsk() {
  panel.innerHTML =
    '<p class="halo-say" id="halo-say">Hi, I\'m <b>Halo</b>. Want a hand with something?</p>' +
    '<div class="halo-acts"><button class="m-btn primary" type="button" data-act="help"><i class="fa-solid fa-circle-question"></i>Help</button>' +
    '<button class="m-btn ghost" type="button" data-act="close">Nevermind</button></div>';
  panel.setAttribute('aria-labelledby', 'halo-say');
}

function showHelp() {
  panel.innerHTML =
    '<label class="halo-say" for="halo-pick" id="halo-say">Which feature do you want to set up?</label>' +
    '<select class="m-input halo-pick" id="halo-pick"><option value="">Choose a feature…</option>' +
    FEATURES.map(f => '<option value="' + f.id + '">' + esc(f.name) + '</option>').join('') + '</select>' +
    '<div class="halo-info" id="halo-info" aria-live="polite"></div>' +
    '<div class="halo-acts"><button class="m-btn ghost" type="button" data-act="back"><i class="fa-solid fa-arrow-left"></i>Back</button>' +
    '<button class="m-btn ghost" type="button" data-act="close">Done</button></div>';
  const pick = document.getElementById('halo-pick');
  pick.addEventListener('change', () => showFeature(pick.value));
  pick.focus();
}

function showFeature(id) {
  const f = FEATURES.find(x => x.id === id), out = document.getElementById('halo-info');
  if (!f) { out.innerHTML = ''; return; }
  let h = '<p class="halo-about">' + esc(f.about) + '</p>';
  if (f.keys.length) {
    h += '<div class="halo-h">What you need</div><ul class="halo-keys">' + f.keys.map(k =>
      '<li><code>' + esc(k[0]) + '</code><span>' + esc(k[1]) + '</span><small>Get it from: ' + esc(k[2]) + '</small></li>').join('') + '</ul>';
  }
  if (f.free) h += '<p class="halo-note"><i class="fa-solid fa-circle-check"></i>' + esc(f.free) + '</p>';
  if (f.where) h += '<p class="halo-note"><i class="fa-solid fa-location-dot"></i>' + esc(f.where) + '</p>';
  if (f.href !== '/') h += '<a class="halo-go" href="' + f.href + '">Open ' + esc(f.name) + '<i class="fa-solid fa-arrow-right"></i></a>';
  out.innerHTML = h;
}

function open() { showAsk(); panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); panel.querySelector('button').focus(); }
function close() { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.focus(); }

btn.addEventListener('click', () => (panel.hidden ? open() : close()));
panel.addEventListener('click', e => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  if (a.dataset.act === 'help') showHelp();
  else if (a.dataset.act === 'back') { showAsk(); panel.querySelector('button').focus(); }
  else close();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) close(); });
// A click that redrew the panel leaves its target detached, so it is not "outside".
document.addEventListener('click', e => { if (!panel.hidden && e.target.isConnected && !root.contains(e.target)) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });

// ── The 3D robot ─────────────────────────────────────────────────────────────
const canvas = document.getElementById('halo-canvas');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }); }
catch (e) { root.classList.add('no-gl'); }

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(2, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x88ccff, 1.6); rim.position.set(-3, 1, -2); scene.add(rim);

  const size = () => {
    const w = canvas.clientWidth || 150, h = canvas.clientHeight || 150;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  size(); new ResizeObserver(size).observe(canvas);

  const tex = new THREE.TextureLoader().setPath('/home/halo/textures/');
  const load = (f, color) => { const t = tex.load(f); if (color) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const bot = new THREE.MeshStandardMaterial({
    map: load('bot_sg_albedo.jpg', true), metalnessMap: load('bot_sg_metallic.jpg'), roughnessMap: load('bot_sg_roughness.jpg'),
    emissiveMap: load('bot_sg_emissive.jpg', true), emissive: 0xffffff, emissiveIntensity: 1.4, metalness: 1, roughness: 1 });
  const holo = new THREE.MeshStandardMaterial({
    map: load('holo_sg_albedo.jpg', true), emissiveMap: load('holo_sg_emissive.jpg', true), emissive: 0xffffff, emissiveIntensity: 1.6,
    alphaMap: load('holo_sg_opacity.jpg'), transparent: true, depthWrite: false, side: THREE.DoubleSide });

  let mixer = null, model = null;
  const clock = new THREE.Clock();

  new FBXLoader().setResourcePath('/home/halo/textures/').load('/home/halo/halo.fbx', obj => {
    obj.traverse(o => {
      if (!o.isMesh) return;
      const swap = m => (/holo/i.test((m && m.name) + ' ' + o.name) ? holo : bot);
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
      if (o.material === holo || (Array.isArray(o.material) && o.material.includes(holo))) o.renderOrder = 1;
    });
    // Fit whatever scale the file came in at to the camera.
    const box = new THREE.Box3().setFromObject(obj), s = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const r = Math.max(s.x, s.y, s.z) || 1;
    obj.position.sub(c); const pivot = new THREE.Group(); pivot.add(obj); pivot.scale.setScalar(2 / r); scene.add(pivot);
    camera.position.set(0, 0.1, 3.8); camera.lookAt(0, 0, 0);
    model = pivot;
    if (obj.animations && obj.animations.length) { mixer = new THREE.AnimationMixer(obj); mixer.clipAction(obj.animations[0]).play(); }
    root.classList.add('ready');
    if (still) { mixer && mixer.update(0); renderer.render(scene, camera); }
  }, undefined, () => root.classList.add('no-gl'));

  // Turn a little toward the pointer while it is over the hero.
  let lookX = 0, lookY = 0;
  document.querySelector('.hero').addEventListener('pointermove', e => {
    const b = canvas.getBoundingClientRect();
    lookX = Math.max(-1, Math.min(1, (e.clientX - (b.left + b.width / 2)) / 600));
    lookY = Math.max(-1, Math.min(1, (e.clientY - (b.top + b.height / 2)) / 600));
  });

  if (!still) renderer.setAnimationLoop(() => {
    if (document.hidden) return;
    const dt = clock.getDelta();
    if (mixer) mixer.update(dt);
    if (model) {
      model.rotation.y += (lookX * 0.6 - model.rotation.y) * 0.06;
      model.rotation.x += (lookY * 0.25 - model.rotation.x) * 0.06;
    }
    renderer.render(scene, camera);
  });
}
