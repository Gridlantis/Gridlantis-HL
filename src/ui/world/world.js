/* Metis World — a 3D town where every Metis job is a robot errand.
   Inside the glowing wall: Metis's own districts around the core. Outside:
   the services it talks to. 'activity' SSE events send robots between them. */
import * as THREE from "three";
import { OrbitControls } from "/world/assets/OrbitControls.js";

const $ = id => document.getElementById(id);
const stage = $("stage");
const DEG = Math.PI / 180;
const polar = (r, aDeg, y = 0) => new THREE.Vector3(r * Math.cos(aDeg * DEG), y, r * Math.sin(aDeg * DEG));
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ── The map ──────────────────────────────────────────────────────────────────
const R_DISTRICT = 16, R_INNER_ROAD = 23, R_WALL = 30, R_OUTER_ROAD = 38;

const DISTRICTS = {
  social:   { title: "Social",          color: "#e879f9", href: "/social",     a: 0,   sub: "Packs posts and ships them to the platforms" },
  mail:     { title: "Mail",            color: "#6366f1", href: "/mail",       a: 60,  sub: "Collects mail from your inboxes" },
  calendar: { title: "Calendar",        color: "#fb923c", href: "/calendar",   a: 90,  sub: "Reminders and Google Calendar sync" },
  homeos:   { title: "HomeOS",          color: "#22c55e", href: "/homeos",     a: 150, sub: "Smart home devices" },
  notes:    { title: "Notes",           color: "#00eeff", href: "/notes",      a: 180, sub: "Notes, flows and to-dos" },
  ai:       { title: "AI Lab",          color: "#ff6600", href: "/ai",         a: 240, sub: "Sends questions to the models" },
  docker:   { title: "Containers",      color: "#38bdf8", href: "/docker",     a: 270, sub: "One shipping container per Docker container" },
  monitor:  { title: "Monitoring",      color: "#ef4444", href: "/monitoring", a: 300, sub: "Drones check every node" },
  vmlab:    { title: "VM Lab",          color: "#2dd4bf", href: "/vmlab",      a: 330, sub: "One rack per virtual machine" },
};

const PLATFORM_COLORS = { linkedin: "#0a66c2", mastodon: "#6364ff", bluesky: "#1185fe", x: "#e5e7eb",
  threads: "#c084fc", instagram: "#e1306c", facebook: "#1877f2" };
const PLATFORM_ORDER = ["linkedin", "mastodon", "bluesky", "x", "threads", "instagram", "facebook"];

const EXTERNALS = {
  mailsrv:    { title: "Mail servers",  color: "#818cf8", a: 62,  r: 56, sub: "Your IMAP inboxes" },
  google:     { title: "Google",        color: "#4f8ff7", a: 92,  r: 56, sub: "Google Calendar" },
  weather:    { title: "Weather",       color: "#fde68a", a: 118, r: 55, sub: "weather.gov and Open-Meteo" },
  web:        { title: "The web",       color: "#94a3b8", a: 205, r: 56, sub: "OS image downloads" },
  ollama:     { title: "Ollama peer",   color: "#fb923c", a: 232, r: 55, sub: "Local models on your network" },
  openrouter: { title: "OpenRouter",    color: "#f97316", a: 252, r: 58, sub: "Cloud models" },
  dockerhub:  { title: "Docker Hub",    color: "#1d63ed", a: 272, r: 56, sub: "Container images" },
};
const NODE_ARC = [286, 322];

// Where each kind of activity starts, goes, and what the robot carries.
//   from: district id   to: external id | platform id | "nodes" | district id | null
//   item: carried out ("send") or brought back ("fetch")
function plan(ev) {
  const s = ev.service, a = ev.action;
  if (s === "social" && a === "send")  return { from: "social", to: ev.target, item: "package", mode: "send" };
  if (s === "social" && a === "draft") return { from: "social", to: "ai", item: "page", mode: "fetch", inside: true };
  if (s === "mail")                    return { from: "mail", to: "mailsrv", item: "envelope", mode: "fetch" };
  if (s === "ai")                      return { from: "ai", to: ev.target === "openrouter" ? "openrouter" : "ollama", item: "orb", mode: "fetch" };
  if (s === "weather")                 return { from: "calendar", to: "weather", item: "cloud", mode: "fetch" };
  if (s === "calendar")                return { from: "calendar", to: "google", item: "card", mode: "fetch" };
  if (s === "docker" && a === "pull")  return { from: "docker", to: "dockerhub", item: "crate", mode: "fetch" };
  if (s === "vmlab" && a === "download") return { from: "vmlab", to: "web", item: "crate", mode: "fetch" };
  if (s === "monitor" && a === "sweep") return { sweep: true };
  if (s === "monitor")                 return { from: "monitor", to: "nodes:" + ev.target, item: null, mode: "visit" };
  if (s === "reminders")               return { from: "core", to: "calendar", item: "card", mode: "send", inside: true, waves: "calendar" };
  if (s === "homeos")                  return { from: "core", to: "homeos", item: null, mode: "visit", inside: true };
  if (s === "notes")                   return { from: "core", to: "notes", item: "page", mode: "send", inside: true };
  if (s === "docker" || s === "vmlab") return { from: "core", to: s, item: null, mode: "visit", inside: true };
  return { flash: "core" };
}

// ── Renderer, camera, lights ─────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const SKY = "#22304f";   // sky and fog match so the far ground fades out, never to black
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 150, 340);

const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 600);
const HOME_VIEW = new THREE.Vector3(112, 96, 58);   // the social side, nearest the viewer
camera.position.copy(HOME_VIEW);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = 1.42;
controls.minDistance = 12;
controls.maxDistance = 200;
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.35;

scene.add(new THREE.HemisphereLight("#d6e4ff", "#3a4668", 1.7));
scene.add(new THREE.AmbientLight("#ffffff", 0.5));
// A shadowless fill from the opposite side, so the far faces of buildings aren't black.
const fill = new THREE.DirectionalLight("#ffe7c4", 0.8);
fill.position.set(70, 50, -60);
scene.add(fill);
const moon = new THREE.DirectionalLight("#e3ecff", 1.9);
moon.position.set(-60, 90, 40);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
moon.shadow.intensity = 0.6;   // softer, lighter shadows
Object.assign(moon.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 10, far: 260 });
scene.add(moon);

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  // On wide screens the activity panel covers the right; shift the town's
  // centre into the open space to its left.
  const shift = w > 900 ? 320 : 0;
  camera.aspect = (w + shift) / Math.max(h, 1);
  if (shift) camera.setViewOffset(w + shift, h, shift, 0, w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

// ── Material and geometry helpers ────────────────────────────────────────────
const matCache = new Map();
function mat(color, emissive = 0, extra = {}) {
  const k = color + "|" + emissive + "|" + JSON.stringify(extra);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial(Object.assign(
    { color, roughness: 0.55, metalness: 0.25, emissive: emissive ? color : "#000000", emissiveIntensity: emissive }, extra)));
  return matCache.get(k);
}
// A material a building owns, so a flash only lights that building.
const own = (color, emissive = 0.4, extra = {}) => new THREE.MeshStandardMaterial(Object.assign(
  { color, roughness: 0.5, metalness: 0.3, emissive: color, emissiveIntensity: emissive }, extra));

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function windowTexture(cols, rows) {
  const c = document.createElement("canvas");
  c.width = cols * 8; c.height = rows * 12;
  const g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const v = Math.random();
    if (v < 0.45) continue;
    g.fillStyle = `rgba(255,255,255,${0.35 + v * 0.65})`;
    g.fillRect(x * 8 + 2, y * 12 + 3, 4, 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function textSprite(text, color = "#ffffff", size = 1.5, sub) {
  const c = document.createElement("canvas"), g = c.getContext("2d");
  const font = '600 44px "IBM Plex Sans Condensed", "IBM Plex Sans", sans-serif';
  const subFont = '400 28px "IBM Plex Sans", sans-serif';
  g.font = font;
  let w = g.measureText(text).width;
  if (sub) { g.font = subFont; w = Math.max(w, g.measureText(sub).width); }
  c.width = Math.ceil(w) + 44; c.height = sub ? 104 : 70;
  g.fillStyle = "rgba(8,11,20,.82)";
  g.beginPath(); g.roundRect(2, 2, c.width - 4, c.height - 4, 14); g.fill();
  g.strokeStyle = color; g.lineWidth = 3; g.stroke();
  g.fillStyle = "#fff"; g.font = font; g.textBaseline = "middle";
  g.fillText(text, 22, 37);
  if (sub) { g.font = subFont; g.fillStyle = "rgba(255,255,255,.6)"; g.fillText(sub, 22, 78); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Constant size on screen, so labels stay readable however far you zoom.
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, sizeAttenuation: false }));
  size *= 0.018;
  s.scale.set(size * c.width / 70, size * c.height / 70, 1);
  s.renderOrder = 10;
  return s;
}

// ── Buildings registry ───────────────────────────────────────────────────────
// id -> { group, door (Vector3 where robots stop), a, r, title, sub, href, color, mats[], flash, inside }
const B = {};
const pickables = [];

function register(id, group, info) {
  const shared = new Set(matCache.values());
  const b = Object.assign({ group, mats: [], flash: 0, base: new Map() }, info);
  group.traverse(o => {
    if (!o.isMesh) return;
    o.userData.bid = id;
    pickables.push(o);
    const m = o.material;
    if (m && m.emissive && !shared.has(m) && !b.base.has(m)) {
      b.base.set(m, m.emissiveIntensity); b.mats.push(m);
    }
  });
  B[id] = b;
  scene.add(group);
  return b;
}

function placeAt(group, r, a) {
  group.position.copy(polar(r, a));
  group.rotation.y = -a * DEG - Math.PI / 2;   // local +z faces the core
  return group;
}

// ── The ground, roads and wall ───────────────────────────────────────────────
function buildGround() {
  const ground = mesh(new THREE.CircleGeometry(420, 96), mat("#2a3858", 0, { roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.castShadow = false;
  scene.add(ground);
  const grid = new THREE.PolarGridHelper(150, 24, 24, 96, "#41537c", "#36466a");
  grid.position.y = 0.01; scene.add(grid);

  const inside = mesh(new THREE.CircleGeometry(R_WALL, 96), mat("#34466e", 0, { roughness: 0.9 }));
  inside.rotation.x = -Math.PI / 2; inside.position.y = 0.02; inside.castShadow = false;
  scene.add(inside);

  for (const [r, w] of [[R_INNER_ROAD, 2.4], [R_OUTER_ROAD, 2.6]]) {
    const road = mesh(new THREE.RingGeometry(r - w / 2, r + w / 2, 128), mat("#3a4766", 0, { roughness: 0.95 }));
    road.rotation.x = -Math.PI / 2; road.position.y = 0.04; road.castShadow = false;
    scene.add(road);
    const line = new THREE.Mesh(new THREE.RingGeometry(r - 0.06, r + 0.06, 128), new THREE.MeshBasicMaterial({ color: "#8fa3d1" }));
    line.rotation.x = -Math.PI / 2; line.position.y = 0.06;
    scene.add(line);
  }

  // The network wall: translucent arcs with a gate at every district.
  const wallMat = new THREE.MeshStandardMaterial({ color: "#22d3ee", emissive: "#22d3ee", emissiveIntensity: 0.6,
    transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  const capMat = new THREE.MeshBasicMaterial({ color: "#67e8f9" });
  const pillarGeo = new THREE.BoxGeometry(0.7, 4.2, 0.7);
  for (let a = 0; a < 360; a += 30) {
    const a1 = (a + 4) * DEG, a2 = (a + 26) * DEG;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(R_WALL, R_WALL, 3, 24, 1, true, Math.PI / 2 - a2, a2 - a1), wallMat);
    seg.position.y = 1.5; scene.add(seg);
    const cap = new THREE.Mesh(new THREE.TorusGeometry(R_WALL, 0.07, 4, 24, a2 - a1), capMat);
    cap.rotation.x = Math.PI / 2; cap.rotation.z = a1; cap.position.y = 3;
    scene.add(cap);
    for (const ga of [a - 4, a + 4]) {
      const p = mesh(pillarGeo, mat("#475569"), 0, 2.1, 0);
      p.position.add(polar(R_WALL, ga)); scene.add(p);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), capMat);
      lamp.position.copy(polar(R_WALL, ga, 4.4)); scene.add(lamp);
    }
  }
  const wallLabel = textSprite("Metis network", "#22d3ee", 1.2);
  wallLabel.position.copy(polar(R_WALL + 1, 195, 5)); scene.add(wallLabel);

  // Stars.
  const pts = new Float32Array(1500 * 3);
  for (let i = 0; i < 1500; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(320);
    v.y = Math.abs(v.y) + 20;
    pts.set([v.x, v.y, v.z], i * 3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(pts, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: "#c7d2fe", size: 0.9, sizeAttenuation: true, fog: false })));
}

// ── The core ─────────────────────────────────────────────────────────────────
const spinners = [];   // { obj, axis, speed }
function buildCore() {
  const g = new THREE.Group();
  const coreMat = own("#22d3ee", 0.5);
  g.add(mesh(new THREE.CylinderGeometry(4.2, 5, 1.2, 6), mat("#475569"), 0, 0.6, 0));
  g.add(mesh(new THREE.CylinderGeometry(2.2, 3.2, 13, 6), own("#1a2747", 0.8, { emissive: "#22d3ee", emissiveMap: windowTexture(10, 16) }), 0, 7.7, 0));
  for (let i = 0; i < 5; i++) g.add(mesh(new THREE.CylinderGeometry(2.35 - i * 0.2, 2.45 - i * 0.2, 0.25, 6), coreMat, 0, 3 + i * 2.4, 0));
  const crystal = mesh(new THREE.OctahedronGeometry(1.6), own("#67e8f9", 1.2, { metalness: 0.1, roughness: 0.2 }), 0, 16.4, 0);
  g.add(crystal);
  const ring = mesh(new THREE.TorusGeometry(3.4, 0.12, 8, 48), own("#22d3ee", 1), 0, 16.4, 0);
  ring.rotation.x = Math.PI / 2.4; g.add(ring);
  spinners.push({ obj: crystal, axis: "y", speed: 0.6 }, { obj: ring, axis: "z", speed: 0.9 });
  const light = new THREE.PointLight("#22d3ee", 60, 40, 1.6); light.position.y = 16; g.add(light);
  const lab = textSprite("Metis", "#22d3ee", 1.7); lab.position.y = 20.5; g.add(lab);
  register("core", g, { title: "Metis", sub: "The server everything runs on", href: "/", color: "#22d3ee",
    door: new THREE.Vector3(0, 0, 0), a: 0, r: 0, inside: true });
}

// ── Districts ────────────────────────────────────────────────────────────────
const dyn = {};   // dynamic bits refreshed from the snapshot
let clockCanvas, clockTex;

function districtBase(id, d) {
  const g = new THREE.Group();
  const pad = mesh(new THREE.CylinderGeometry(4.6, 4.8, 0.3, 32), mat("#3b4a6e"), 0, 0.15, 0);
  g.add(pad);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(4.7, 0.08, 6, 48), new THREE.MeshBasicMaterial({ color: d.color }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.32; g.add(rim);
  return g;
}

const BUILDERS = {
  social(g, c) {   // depot with arched roof and a stack of parcels
    g.add(mesh(new THREE.BoxGeometry(6, 3.2, 4.4), own("#5b4a72", 0.15), 0, 1.9, 0));
    const roof = mesh(new THREE.CylinderGeometry(2.2, 2.2, 6, 16, 1, false, 0, Math.PI), own(c, 0.5), 0, 3.5, 0);
    roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2; g.add(roof);
    g.add(mesh(new THREE.BoxGeometry(2.6, 2, 0.1), mat("#05070d"), 0, 1.3, 2.22));
    for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(0.8, 0.6, 0.7), mat("#b07a45"), -2.4 + (i % 2) * 0.9, 0.6 + Math.floor(i / 2) * 0.62, 3));
  },

  mail(g, c) {   // a giant mailbox
    g.add(mesh(new THREE.BoxGeometry(0.5, 2.4, 0.5), mat("#334155"), 0, 1.5, 0));
    g.add(mesh(new THREE.BoxGeometry(3.4, 2.4, 5), own(c, 0.35), 0, 3.8, 0));
    const top = mesh(new THREE.CylinderGeometry(1.7, 1.7, 5, 20, 1, false, 0, Math.PI), own(c, 0.35), 0, 5, 0);
    top.rotation.set(Math.PI / 2, 0, Math.PI / 2); g.add(top);
    const flag = mesh(new THREE.BoxGeometry(0.15, 1.6, 0.9), own("#ef4444", 0.6), 1.8, 5.2, -1); g.add(flag);
    dyn.mailFlag = flag;
  },
  calendar(g, c) {   // clock tower showing the real time
    g.add(mesh(new THREE.BoxGeometry(3, 9, 3), own("#5e4430", 0.1), 0, 4.8, 0));
    const roof = mesh(new THREE.ConeGeometry(2.4, 2.6, 4), own(c, 0.5), 0, 10.6, 0); roof.rotation.y = Math.PI / 4; g.add(roof);
    clockCanvas = document.createElement("canvas"); clockCanvas.width = clockCanvas.height = 256;
    clockTex = new THREE.CanvasTexture(clockCanvas); clockTex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.CircleGeometry(1.25, 40), new THREE.MeshBasicMaterial({ map: clockTex }));
    face.position.set(0, 7.6, 1.52); g.add(face);
    const bell = mesh(new THREE.SphereGeometry(0.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), own("#fbbf24", 0.6), 0, 9.1, 0);
    bell.rotation.x = Math.PI; g.add(bell); dyn.bell = bell;
    drawClock();
  },

  homeos(g, c) {   // a house; windows light per online device
    g.add(mesh(new THREE.BoxGeometry(5, 3, 4), own("#335c44", 0.08), 0, 1.8, 0));
    const roof = mesh(new THREE.ConeGeometry(3.8, 2.4, 4), own(c, 0.35), 0, 4.5, 0); roof.rotation.y = Math.PI / 4; roof.scale.z = 0.8; g.add(roof);
    dyn.homeWindows = [];
    for (let i = 0; i < 6; i++) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ color: "#1f2937" }));
      w.position.set(-1.8 + (i % 3) * 1.8, 1.4 + Math.floor(i / 3) * 1.2, 2.01); g.add(w); dyn.homeWindows.push(w);
    }
  },
  notes(g, c) {   // a stack of books
    const cols = ["#0e7490", "#155e75", "#22d3ee", "#164e63", "#67e8f9"];
    for (let i = 0; i < 5; i++) {
      const bk = mesh(new THREE.BoxGeometry(4.2 - i * 0.3, 1.1, 3), own(cols[i], 0.25), (i % 2 ? 0.2 : -0.2), 0.9 + i * 1.12, 0);
      bk.rotation.y = (i % 2 ? 0.12 : -0.1); g.add(bk);
    }
  },

  ai(g, c) {   // dome with a glowing brain inside
    g.add(mesh(new THREE.CylinderGeometry(3.6, 3.8, 1, 32), mat("#5a3f30"), 0, 0.8, 0));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3.4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: "#fed7aa", transparent: true, opacity: 0.18, roughness: 0.1, metalness: 0.2, depthWrite: false }));
    dome.position.y = 1.3; g.add(dome);
    const brain = mesh(new THREE.IcosahedronGeometry(1.4, 1), own(c, 1.2, { flatShading: true }), 0, 3, 0); g.add(brain);
    spinners.push({ obj: brain, axis: "y", speed: 0.8 });
  },
  docker(g) { dyn.dockerYard = new THREE.Group(); g.add(dyn.dockerYard); },
  monitor(g, c) {   // lattice tower with a rotating radar dish
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = mesh(new THREE.CylinderGeometry(0.12, 0.2, 8, 6), mat("#475569"), x * 0.9, 4, z * 0.9);
      leg.rotation.z = -x * 0.08; leg.rotation.x = z * 0.08; g.add(leg);
    }
    g.add(mesh(new THREE.BoxGeometry(2.4, 0.4, 2.4), own(c, 0.5), 0, 8.1, 0));
    const dish = new THREE.Group(); dish.position.y = 8.6;
    const bowl = mesh(new THREE.SphereGeometry(1.8, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3.2), own("#e2e8f0", 0.1, { side: THREE.DoubleSide }), 0, 1.6, 0);
    bowl.rotation.x = Math.PI * 0.62; dish.add(bowl);
    dish.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), own(c, 1.5), 0, 1.4, 0.8));
    g.add(dish); spinners.push({ obj: dish, axis: "y", speed: 1.2 });
  },
  vmlab(g) { dyn.vmRacks = new THREE.Group(); g.add(dyn.vmRacks); },
};

function buildDistricts() {
  for (const [id, d] of Object.entries(DISTRICTS)) {
    const g = districtBase(id, d);
    BUILDERS[id](g, d.color);
    const lab = textSprite(d.title, d.color, 1.05);
    lab.position.y = id === "calendar" ? 13.6 : id === "monitor" ? 12 : 9.5;
    g.add(lab);
    placeAt(g, R_DISTRICT, d.a);
    register(id, g, { title: d.title, sub: d.sub, href: d.href, color: d.color, a: d.a, r: R_DISTRICT, inside: true,
      door: polar(R_DISTRICT + 3.6, d.a), backDoor: polar(R_DISTRICT - 4.2, d.a) });
  }
}

function drawClock() {
  if (!clockCanvas) return;
  const g = clockCanvas.getContext("2d"), n = new Date();
  g.fillStyle = "#fff7ed"; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#fb923c"; g.lineWidth = 10; g.stroke();
  g.fillStyle = "#7c2d12";
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.fillRect(128 + Math.sin(a) * 98 - 4, 128 - Math.cos(a) * 98 - 4, 8, 8); }
  const hand = (a, len, w) => { g.lineWidth = w; g.lineCap = "round"; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len); g.stroke(); };
  g.strokeStyle = "#1c1917";
  hand(((n.getHours() % 12) + n.getMinutes() / 60) * Math.PI / 6, 60, 12);
  hand(n.getMinutes() * Math.PI / 30, 90, 7);
  clockTex.needsUpdate = true;
}

// ── Outside the wall ─────────────────────────────────────────────────────────
function skyscraper(color, h, connected) {
  const g = new THREE.Group();
  const tex = windowTexture(8, Math.round(h * 1.3));
  const body = mesh(new THREE.BoxGeometry(5.5, h, 5.5),
    own("#3a4560", connected ? 1.1 : 0.25, { emissive: connected ? color : "#94a3b8", emissiveMap: tex }), 0, h / 2, 0);
  g.add(body);
  g.add(mesh(new THREE.BoxGeometry(6, 0.6, 6), own(connected ? color : "#334155", connected ? 0.9 : 0.1), 0, h + 0.3, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 6), mat("#94a3b8"), 0, h + 2, 0));
  const tip = mesh(new THREE.SphereGeometry(0.25, 8, 6), own(connected ? "#f87171" : "#475569", connected ? 2 : 0.2), 0, h + 3.6, 0);
  g.add(tip);
  return g;
}

function buildPlatforms(list) {
  for (const id of PLATFORM_ORDER) if (B[id]) { scene.remove(B[id].group); delete B[id]; }
  pickables.splice(0, pickables.length, ...pickables.filter(o => !PLATFORM_ORDER.includes(o.userData.bid)));
  const byId = Object.fromEntries((list || []).map(p => [p.id, p]));
  PLATFORM_ORDER.forEach((id, i) => {
    const p = byId[id] || { id, label: id, connected: false };
    const a = -30 + i * 10, r = i % 2 ? 61 : 54, h = 15 + ((i * 7) % 4) * 3;
    const color = PLATFORM_COLORS[id];
    const g = skyscraper(color, h, p.connected);
    const lab = textSprite(p.label, p.connected ? color : "#64748b", 1.3, p.connected ? null : "not connected");
    lab.position.y = h + 6; g.add(lab);
    placeAt(g, r, a);
    register(id, g, { title: p.label, sub: p.connected ? "Social platform — robots deliver your posts here" : "Not connected in Social",
      href: "/social", color, a, r, door: polar(r - 3.8, a) });
  });
}

const EXT_BUILDERS = {
  mailsrv(g, c) {
    g.add(mesh(new THREE.BoxGeometry(8, 5, 5), own("#3b4660", 0.6, { emissive: c, emissiveMap: windowTexture(12, 6) }), 0, 2.5, 0));
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.5, 12), mat("#475569"), -2.5 + i * 2.5, 5.75, -1));
  },
  google(g) {
    const cols = ["#4285f4", "#ea4335", "#fbbc05", "#34a853"];
    cols.forEach((c, i) => g.add(mesh(new THREE.BoxGeometry(2.4, 6 + i * 2, 2.4), own(c, 0.55), (i % 2 ? 1.3 : -1.3), (6 + i * 2) / 2, (i > 1 ? 1.3 : -1.3))));
  },
  weather(g, c) {
    g.add(mesh(new THREE.CylinderGeometry(0.25, 0.4, 9, 8), mat("#94a3b8"), 0, 4.5, 0));
    const vane = new THREE.Group(); vane.position.y = 9.2;
    for (let i = 0; i < 3; i++) {
      const arm = new THREE.Group(); arm.rotation.y = i * Math.PI * 2 / 3;
      arm.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 4), mat("#cbd5e1"), 0.8, 0, 0));
      arm.children[0].rotation.z = Math.PI / 2;
      arm.add(mesh(new THREE.SphereGeometry(0.3, 10, 8, 0, Math.PI), own(c, 0.6), 1.6, 0, 0));
      vane.add(arm);
    }
    g.add(vane); spinners.push({ obj: vane, axis: "y", speed: 3 });
    const cloud = new THREE.Group(); cloud.position.y = 12.5;
    [[0, 0, 0, 1.6], [1.4, -0.3, 0, 1.1], [-1.4, -0.3, 0, 1.2], [0.5, 0.6, 0.4, 1.1]].forEach(([x, y, z, r]) =>
      cloud.add(mesh(new THREE.SphereGeometry(r, 14, 10), own("#e2e8f0", 0.25), x, y, z)));
    g.add(cloud);
  },
  web(g, c) {
    const globe = new THREE.Mesh(new THREE.SphereGeometry(4, 18, 12), new THREE.MeshBasicMaterial({ color: c, wireframe: true, transparent: true, opacity: 0.55 }));
    globe.position.y = 6; globe.userData.bid = "web"; g.add(globe);
    g.add(mesh(new THREE.SphereGeometry(3.6, 24, 16), own("#475569", 0.3), 0, 6, 0));
    g.add(mesh(new THREE.CylinderGeometry(1.5, 2.2, 2, 16), mat("#334155"), 0, 1, 0));
    spinners.push({ obj: globe, axis: "y", speed: 0.3 });
  },
  ollama(g, c) {
    g.add(mesh(new THREE.BoxGeometry(5, 4, 5), own("#5a4232", 0.5, { emissive: c, emissiveMap: windowTexture(8, 5) }), 0, 2, 0));
    g.add(mesh(new THREE.BoxGeometry(1.2, 3, 1.2), own(c, 0.5), 0, 5.5, 0));
  },
  openrouter(g, c) {
    g.add(mesh(new THREE.CylinderGeometry(0.4, 1.4, 16, 4), own("#4b5563", 0.3, { emissive: c }), 0, 8, 0));
    for (let i = 0; i < 3; i++) {
      const ring = mesh(new THREE.TorusGeometry(1.2 + i * 0.7, 0.07, 6, 32), own(c, 1.2), 0, 16.5, 0);
      ring.rotation.x = Math.PI / 2; g.add(ring);
      spinners.push({ obj: ring, axis: "x", speed: 0.6 + i * 0.4 });
    }
  },
  dockerhub(g, c) {
    g.add(mesh(new THREE.BoxGeometry(9, 4, 6), own("#24407a", 0.35, { emissive: c }), 0, 2, 0));
    const cols = ["#1d63ed", "#38bdf8", "#0ea5e9", "#2563eb"];
    for (let i = 0; i < 6; i++) g.add(mesh(new THREE.BoxGeometry(2.6, 1.3, 1.4), own(cols[i % 4], 0.3), -3 + (i % 3) * 3, 4.65 + Math.floor(i / 3) * 1.32, 0));
  },
};

function buildExternals() {
  for (const [id, e] of Object.entries(EXTERNALS)) {
    const g = new THREE.Group();
    EXT_BUILDERS[id](g, e.color);
    const lab = textSprite(e.title, e.color, 1.2);
    lab.position.y = id === "openrouter" ? 21 : id === "weather" ? 16 : 12;
    g.add(lab);
    placeAt(g, e.r, e.a);
    register(id, g, { title: e.title, sub: e.sub, color: e.color, a: e.a, r: e.r, door: polar(e.r - 4.6, e.a) });
  }
}

// Monitored nodes: little pylons with a beacon each, fanned across an arc.
let nodeKey = "";
function buildNodes(nodes) {
  const key = nodes.map(n => n.id).join("|");
  if (key === nodeKey) {   // same set: just repaint the beacons
    for (const n of nodes) { const b = B["node:" + n.id]; if (b) setBeacon(b, n.online); }
    return;
  }
  nodeKey = key;
  for (const id of Object.keys(B)) if (id.startsWith("node:")) { scene.remove(B[id].group); delete B[id]; }
  pickables.splice(0, pickables.length, ...pickables.filter(o => !String(o.userData.bid).startsWith("node:")));
  const list = nodes.slice(0, 30);
  const perRow = Math.ceil(list.length / 3) || 1;
  list.forEach((n, i) => {
    const row = Math.floor(i / perRow), col = i % perRow;
    const span = NODE_ARC[1] - NODE_ARC[0];
    const a = NODE_ARC[0] + (perRow === 1 ? span / 2 : (col + (row % 2) * 0.5) * span / perRow);
    const r = 46 + row * 6;
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.5, 0.9, 3.4, 6), mat("#475569"), 0, 1.7, 0));
    const beacon = mesh(new THREE.SphereGeometry(0.55, 14, 10), own("#22c55e", 1.4), 0, 3.9, 0);
    g.add(beacon);
    placeAt(g, r, a);
    const b = register("node:" + n.id, g, { title: n.name, sub: n.kind, href: "/monitoring", color: "#ef4444", a, r,
      door: polar(r - 1.8, a), top: polar(r, a, 5.2), beacon, nodeName: n.name });
    setBeacon(b, n.online);
  });
  const lab = B.__nodesLabel || textSprite("Your nodes", "#ef4444", 1.2);
  lab.position.copy(polar(58, (NODE_ARC[0] + NODE_ARC[1]) / 2, 9));
  if (!B.__nodesLabel) { scene.add(lab); Object.defineProperty(B, "__nodesLabel", { value: lab, enumerable: false }); }
}
function setBeacon(b, online) {
  b.online = online;
  b.beacon.material.color.set(online ? "#22c55e" : "#ef4444");
  b.beacon.material.emissive.set(online ? "#22c55e" : "#ef4444");
  b.sub = (b.sub || "").replace(/ · (online|offline)$/, "") + (online ? " · online" : " · offline");
}

// VM racks, containers and home windows come from the snapshot.
function unpick(group) {
  const gone = new Set();
  group.traverse(o => gone.add(o));
  pickables.splice(0, pickables.length, ...pickables.filter(o => !gone.has(o)));
  group.clear();
}
function paintVMs(vms) {
  const g = dyn.vmRacks; unpick(g);
  const list = vms.length ? vms : [];
  list.slice(0, 9).forEach((v, i) => {
    const x = -2.4 + (i % 3) * 2.4, z = -1.6 + Math.floor(i / 3) * 1.8;
    const rack = mesh(new THREE.BoxGeometry(1.6, 3.6, 1.2), mat("#3b4660"), x, 2.1, z);
    g.add(rack);
    for (let k = 0; k < 4; k++) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.02),
        new THREE.MeshBasicMaterial({ color: v.running ? "#2dd4bf" : "#334155" }));
      led.position.set(x, 0.9 + k * 0.75, z + 0.61);
      led.userData.blink = v.running ? Math.random() * 6 : null;
      g.add(led);
    }
  });
  if (!list.length) g.add(mesh(new THREE.BoxGeometry(1.6, 3.6, 1.2), mat("#3b4660"), 0, 2.1, 0));
  g.traverse(o => { if (o.isMesh) { o.userData.bid = "vmlab"; pickables.push(o); } });
  B.vmlab.sub = list.length ? `${list.filter(v => v.running).length} of ${list.length} VMs running` : DISTRICTS.vmlab.sub;
}
function paintContainers(cs) {
  const g = dyn.dockerYard; unpick(g);
  const list = cs.slice(0, 12);
  const cols = ["#38bdf8", "#f97316", "#22c55e", "#e879f9", "#facc15", "#60a5fa"];
  (list.length ? list : [{ running: false }]).forEach((c, i) => {
    const x = -1.6 + (i % 2) * 3.2, z = -1.8 + Math.floor((i % 6) / 2) * 1.8, y = 0.95 + Math.floor(i / 6) * 1.3;
    g.add(mesh(new THREE.BoxGeometry(3, 1.25, 1.6), own(c.running ? cols[i % cols.length] : "#334155", c.running ? 0.35 : 0.05), x, y, z));
  });
  g.traverse(o => { if (o.isMesh) { o.userData.bid = "docker"; pickables.push(o); } });
  B.docker.sub = list.length ? `${list.filter(c => c.running).length} of ${cs.length} containers running` : DISTRICTS.docker.sub;
}
function paintHome(devs) {
  dyn.homeWindows.forEach((w, i) => {
    const d = devs[i];
    w.material.color.set(d ? (d.online ? "#fde68a" : "#7f1d1d") : "#1f2937");
  });
  if (devs.length) B.homeos.sub = `${devs.filter(d => d.online).length} of ${devs.length} devices online`;
}

// ── Robots ───────────────────────────────────────────────────────────────────
const RG = {
  body: new THREE.BoxGeometry(0.9, 0.9, 0.7), head: new THREE.BoxGeometry(0.75, 0.55, 0.62),
  visor: new THREE.BoxGeometry(0.6, 0.16, 0.05), leg: new THREE.BoxGeometry(0.26, 0.6, 0.3),
  arm: new THREE.BoxGeometry(0.2, 0.55, 0.22), ant: new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6),
  bulb: new THREE.SphereGeometry(0.11, 10, 8), droneBody: new THREE.SphereGeometry(0.45, 16, 12),
  rotor: new THREE.TorusGeometry(0.75, 0.06, 6, 24),
};
const IG = {
  box: new THREE.BoxGeometry(0.7, 0.55, 0.6), tape: new THREE.BoxGeometry(0.72, 0.12, 0.62),
  env: new THREE.BoxGeometry(0.7, 0.08, 0.48), seal: new THREE.CylinderGeometry(0.09, 0.09, 0.02, 10),
  orb: new THREE.SphereGeometry(0.28, 16, 12), page: new THREE.BoxGeometry(0.5, 0.04, 0.65),
  crate: new THREE.BoxGeometry(0.8, 0.5, 0.5), card: new THREE.BoxGeometry(0.55, 0.4, 0.06),
  puff: new THREE.SphereGeometry(0.22, 10, 8),
};

function makeItem(kind, color, count = 1) {
  const g = new THREE.Group();
  if (kind === "package") { g.add(mesh(IG.box, mat("#b07a45"))); g.add(mesh(IG.tape, mat(color, 0.6))); }
  else if (kind === "envelope") {
    for (let i = 0; i < Math.min(Math.max(count, 1), 5); i++) {
      const e = mesh(IG.env, mat("#f8fafc"), 0, -0.2 + i * 0.1, 0); e.rotation.y = (i % 2 ? 0.15 : -0.1); g.add(e);
      if (i === 0) g.add(mesh(IG.seal, mat(color, 0.8), 0, -0.15, 0));
    }
  }
  else if (kind === "orb") { const o = mesh(IG.orb, mat(color, 2)); o.castShadow = false; g.add(o); }
  else if (kind === "page") { g.add(mesh(IG.page, mat("#f1f5f9"))); g.add(mesh(new THREE.BoxGeometry(0.36, 0.05, 0.04), mat(color, 0.8), 0, 0.01, 0.1)); }
  else if (kind === "crate") g.add(mesh(IG.crate, mat(color, 0.3)));
  else if (kind === "card") g.add(mesh(IG.card, mat(color, 0.4), 0, 0.1, 0));
  else if (kind === "cloud") { g.add(mesh(IG.puff, mat("#e2e8f0", 0.3))); g.add(mesh(IG.puff, mat("#e2e8f0", 0.3), 0.2, -0.05, 0)); g.add(mesh(IG.puff, mat("#e2e8f0", 0.3), -0.2, -0.05, 0)); }
  return g;
}

function makeRobot(color, drone) {
  const g = new THREE.Group();
  const bulbMat = new THREE.MeshStandardMaterial({ color: "#22c55e", emissive: "#22c55e", emissiveIntensity: 2 });
  const r = { group: g, color, drone, bulbMat, steps: [], t: Math.random() * 10, carry: new THREE.Group(), legs: [], arms: [] };
  if (drone) {
    const body = mesh(RG.droneBody, mat("#475569", 0, { metalness: 0.7 })); g.add(body);
    const eye = mesh(new THREE.SphereGeometry(0.16, 8, 6), mat(color, 2), 0, 0, 0.4); g.add(eye);
    const rotor = mesh(RG.rotor, mat(color, 1)); rotor.rotation.x = Math.PI / 2; rotor.position.y = 0.35; g.add(rotor);
    r.rotor = rotor;
    r.carry.position.set(0, -0.6, 0);
  } else {
    g.add(mesh(RG.body, mat(color, 0.15), 0, 1.05, 0));
    g.add(mesh(RG.head, mat("#cbd5e1"), 0, 1.8, 0));
    g.add(mesh(RG.visor, mat(color, 2), 0, 1.82, 0.32));
    g.add(mesh(RG.ant, mat("#94a3b8"), 0, 2.25, 0));
    g.add(mesh(RG.bulb, bulbMat, 0, 2.47, 0));
    for (const x of [-0.24, 0.24]) {
      const hip = new THREE.Group(); hip.position.set(x, 0.6, 0);
      hip.add(mesh(RG.leg, mat("#475569"), 0, -0.3, 0)); g.add(hip); r.legs.push(hip);
    }
    for (const x of [-0.58, 0.58]) {
      const sh = new THREE.Group(); sh.position.set(x, 1.4, 0);
      sh.add(mesh(RG.arm, mat(color, 0.1), 0, -0.25, 0)); g.add(sh); r.arms.push(sh);
    }
    r.carry.position.set(0, 1.2, 0.62);
  }
  g.add(r.carry);
  return r;
}

const robots = new Set();
const ROBOT_SCALE = 1.7;   // a little larger than life so they read from the default view
const MAX_ROBOTS = 60;

function setCarry(r, item) {
  r.carry.clear();
  if (item) r.carry.add(item);
  for (const a of r.arms) a.rotation.x = item ? -1.25 : 0;
}

// Steps: { walk: [Vector3…] } | { wait: () => bool, timeout } | { pause: s } | { call: fn }
function spawn(color, start, steps, { drone = false, item = null } = {}) {
  if (robots.size >= MAX_ROBOTS) return null;
  const r = makeRobot(color, drone);
  r.group.position.copy(start);
  r.group.scale.setScalar(0.01);
  r.grow = 0;
  setCarry(r, item);
  r.steps = steps;
  scene.add(r.group);
  robots.add(r);
  return r;
}
function despawn(r) { r.shrink = 1; }

function updateRobot(r, dt) {
  r.t += dt;
  if (r.grow < 1) { r.grow = Math.min(1, r.grow + dt * 3); r.group.scale.setScalar(r.grow * ROBOT_SCALE); }
  if (r.shrink != null) {
    r.shrink -= dt * 2.5;
    r.group.scale.setScalar(Math.max(r.shrink, 0.001) * ROBOT_SCALE);
    if (r.shrink <= 0) { scene.remove(r.group); robots.delete(r); }
    return;
  }
  const step = r.steps[0];
  let moving = false;
  if (!step) { despawn(r); return; }
  if (step.walk) {
    if (step.i == null) step.i = 0;
    const target = step.walk[step.i];
    const pos = r.group.position;
    const to = new THREE.Vector3().subVectors(target, pos);
    const d = to.length(), speed = (r.drone ? 16 : 10) * (step.speed || 1);
    if (d < speed * dt || d < 0.01) {
      pos.copy(target); step.i++;
      if (step.i >= step.walk.length) r.steps.shift();
    } else {
      pos.addScaledVector(to, speed * dt / d);
      const flat = Math.hypot(to.x, to.z);
      if (flat > 0.05) {
        const want = Math.atan2(to.x, to.z);
        let diff = want - r.group.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        r.group.rotation.y += diff * Math.min(1, dt * 10);
      }
      moving = true;
    }
  } else if (step.wait) {
    step.waited = (step.waited || 0) + dt;
    r.bulbMat.color.set("#facc15"); r.bulbMat.emissive.set("#facc15");
    r.bulbMat.emissiveIntensity = 1.5 + Math.sin(r.t * 10) * 1.2;
    if (step.wait() || step.waited > (step.timeout || 90)) { r.bulbMat.emissiveIntensity = 2; r.steps.shift(); }
  } else if (step.pause != null) {
    step.pause -= dt;
    if (step.pause <= 0) r.steps.shift();
  } else if (step.call) {
    r.steps.shift();
    step.call(r);
  }
  // Animate.
  if (r.drone) {
    r.rotor.rotation.z += dt * 20;
    r.group.children[0].position.y = Math.sin(r.t * 4) * 0.08;
  } else {
    const swing = moving ? Math.sin(r.t * 12) * 0.7 : 0;
    r.legs[0].rotation.x = swing; r.legs[1].rotation.x = -swing;
    if (!r.carry.children.length) { r.arms[0].rotation.x = -swing * 0.7; r.arms[1].rotation.x = swing * 0.7; }
    r.group.children[0].position.y = 1.05 + (moving ? Math.abs(Math.sin(r.t * 12)) * 0.06 : 0);
  }
}

// ── Paths ────────────────────────────────────────────────────────────────────
function arc(r, a1, a2, y = 0) {
  let d = ((a2 - a1) % 360 + 540) % 360 - 180;   // shortest way round
  const n = Math.max(1, Math.ceil(Math.abs(d) / 6));
  const pts = [];
  for (let i = 1; i <= n; i++) pts.push(polar(r, a1 + d * i / n, y));
  return pts;
}
// District → anywhere, and back. Outside trips leave through the district's gate.
function route(fromId, toId) {
  const A = B[fromId], T = B[toId];
  if (fromId === "core") {
    if (T.inside) return [polar(4.5, T.a), T.backDoor.clone()];
    return [polar(4.5, T.a), polar(R_DISTRICT - 4.5, T.a + 14), polar(R_INNER_ROAD, T.a + 14), ...arc(R_INNER_ROAD, T.a + 14, T.a), polar(R_OUTER_ROAD, T.a), T.door.clone()];
  }
  if (T.inside) {
    if (toId === "core") return [polar(R_INNER_ROAD, A.a), ...arc(R_INNER_ROAD, A.a, A.a + 14), polar(R_DISTRICT - 4.5, A.a + 14), polar(4.5, A.a)];
    return [polar(R_INNER_ROAD, A.a), ...arc(R_INNER_ROAD, A.a, T.a), T.door.clone()];
  }
  return [polar(R_INNER_ROAD, A.a), polar(R_WALL, A.a), polar(R_OUTER_ROAD, A.a), ...arc(R_OUTER_ROAD, A.a, T.a), T.door.clone()];
}
function startOf(id) { return id === "core" ? polar(3.5, Math.random() * 360) : B[id].door.clone(); }
function back(path, startPt) { return [...path.slice(0, -1).reverse(), startPt]; }

function flyPath(from, to, height = 9) {
  const mid = from.clone().lerp(to, 0.5); mid.y += height;
  const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
  return curve.getPoints(24).slice(1);
}

// ── Effects ──────────────────────────────────────────────────────────────────
const effects = new Set();
const ringGeo = new THREE.RingGeometry(0.6, 0.9, 48);

function burst(pos, color, size = 7) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.copy(pos); m.position.y += 0.2;
  scene.add(m);
  const parts = [];
  for (let i = 0; i < 14; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), new THREE.MeshBasicMaterial({ color, transparent: true }));
    p.position.copy(pos); p.position.y += 1.5;
    p.userData.v = new THREE.Vector3((Math.random() - 0.5) * 8, 4 + Math.random() * 6, (Math.random() - 0.5) * 8);
    scene.add(p); parts.push(p);
  }
  let t = 0;
  effects.add(dt => {
    t += dt;
    const k = t / 1.1;
    m.scale.setScalar(1 + k * size); m.material.opacity = Math.max(0, 1 - k);
    for (const p of parts) {
      p.userData.v.y -= 14 * dt;
      p.position.addScaledVector(p.userData.v, dt);
      p.rotation.x += dt * 5; p.material.opacity = Math.max(0, 1 - k);
    }
    if (k >= 1) { scene.remove(m); m.material.dispose(); parts.forEach(p => { scene.remove(p); p.geometry.dispose(); p.material.dispose(); }); return false; }
    return true;
  });
}

function waves(pos, color, count = 3) {
  for (let i = 0; i < count; i++) setTimeout(() => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 40), new THREE.MeshBasicMaterial({ color, transparent: true }));
    m.position.copy(pos); m.rotation.x = Math.PI / 2;
    scene.add(m);
    let t = 0;
    effects.add(dt => {
      t += dt; m.scale.setScalar(1 + t * 7); m.material.opacity = Math.max(0, 1 - t / 1.4);
      if (t > 1.4) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); return false; }
      return true;
    });
  }, i * 350);
}

function popText(pos, text, color) {
  const s = textSprite(text, color, 1.1);
  s.position.copy(pos); s.position.y += 4;
  scene.add(s);
  let t = 0;
  effects.add(dt => {
    t += dt; s.position.y += dt * 1.6; s.material.opacity = Math.max(0, 1 - Math.max(0, t - 1.2) / 0.8);
    if (t > 2) { scene.remove(s); s.material.map.dispose(); s.material.dispose(); return false; }
    return true;
  });
}

function flash(id, amount = 1) { if (B[id]) B[id].flash = Math.min(2, B[id].flash + amount); }

// ── Errands ──────────────────────────────────────────────────────────────────
const jobs = new Map();   // key -> { done, ok, count }

function targetId(p, ev) {
  if (p.to && p.to.startsWith("nodes:")) {
    const name = p.to.slice(6);
    const hit = Object.values(B).find(b => b.nodeName === name);
    return hit ? Object.keys(B).find(k => B[k] === hit) : null;
  }
  return p.to;
}

function runErrand(ev, job) {
  const p = plan(ev);
  const color = (DISTRICTS[ev.service] || {}).color || "#22d3ee";

  if (p.flash) { flash(p.flash, 1.5); return; }
  if (p.waves) waves(B[p.waves].group.position.clone().setY(5), DISTRICTS[p.waves].color);
  if (p.sweep) return sweep();
  if (!p.from) return;

  const to = targetId(p, ev);
  if (!to || !B[to] || !B[p.from]) { flash(p.from || "core"); return; }
  const fromColor = p.from === "core" ? "#22d3ee" : DISTRICTS[p.from].color;
  const destColor = B[to].color;
  const out = route(p.from, to);
  const start = startOf(p.from);
  const itemColor = PLATFORM_COLORS[to] || destColor;
  const isDone = () => !job || job.done;

  const steps = [
    { pause: 0.25 },
    { walk: out },
    { wait: isDone, timeout: 120 },
    { call: r => {
      const ok = !job || job.ok !== false;
      flash(to, ok ? 1.4 : 0.6);
      if (p.mode === "send") {
        if (ok) { setCarry(r, null); burst(B[to].door, itemColor); popText(B[to].door, "✓ " + B[to].title, itemColor); }
        else popText(B[to].door, "✕ " + B[to].title, "#ef4444");
      } else if (p.mode === "fetch") {
        if (ok) {
          const n = job && job.count != null ? job.count : 1;
          if (p.item === "envelope" && !n) popText(B[to].door, "nothing new", "#94a3b8");
          else { setCarry(r, makeItem(p.item, color, n)); burst(B[to].door, destColor, 4); }
        } else popText(B[to].door, "✕ failed", "#ef4444");
      } else {
        burst(B[to].door, destColor, 4);
      }
      r.bulbMat.color.set(ok ? "#22c55e" : "#ef4444"); r.bulbMat.emissive.set(ok ? "#22c55e" : "#ef4444");
    } },
    { pause: 0.6 },
    { walk: back(out, start) },
    { call: r => {
      if (r.carry.children.length && p.from !== "core") { burst(start, fromColor, 3); flash(p.from, 1); }
      if (p.from === "mail" && job && job.count) flagUp();
      despawn(r);
    } },
  ];
  spawn(fromColor, start, steps, { item: p.mode === "send" && p.item ? makeItem(p.item, itemColor) : null });
}

// Monitoring: one drone per node, out and back from the radar tower.
function sweep() {
  const tower = B.monitor.group.position.clone().setY(9);
  const nodes = Object.entries(B).filter(([k]) => k.startsWith("node:")).slice(0, 24);
  flash("monitor", 0.8);
  nodes.forEach(([id, b], i) => {
    const top = b.top.clone().setY(6.2);
    const out = flyPath(tower, top, 10);
    setTimeout(() => spawn(DISTRICTS.monitor.color, tower.clone(), [
      { walk: out },
      { call: () => { flash(id, 1.5); if (!b.online) burst(b.door, "#ef4444", 3); } },
      { pause: 0.3 },
      { walk: flyPath(top, tower, 10) },
      { call: r => despawn(r) },
    ], { drone: true }), i * 140);
  });
}

function flagUp() {
  if (!dyn.mailFlag) return;
  dyn.mailFlag.rotation.z = -Math.PI / 2;
  clearTimeout(flagUp.t); flagUp.t = setTimeout(() => { dyn.mailFlag.rotation.z = 0; }, 20000);
}

function onActivity(ev, { animate = true } = {}) {
  if (ev.phase === "done") {
    const job = ev.key && jobs.get(ev.key);
    if (job) { job.done = true; job.ok = ev.ok; job.count = ev.count; jobs.delete(ev.key); }
    else if (animate) runErrand(ev, { done: true, ok: ev.ok, count: ev.count });   // opened mid-job
    if (ev.service === "monitor" && ev.target) { const b = Object.values(B).find(x => x.nodeName === ev.target); if (b) setBeacon(b, !!ev.ok); }
    feed(ev);
    return;
  }
  if (ev.service === "monitor" && (ev.action === "up" || ev.action === "down")) {
    const b = Object.values(B).find(x => x.nodeName === ev.target); if (b) setBeacon(b, ev.action === "up");
  }
  if (ev.service === "homeos") refreshSoon();
  if (!animate) return;
  if (ev.phase === "start" && ev.key) {
    const job = { done: false };
    jobs.set(ev.key, job);
    setTimeout(() => jobs.delete(ev.key), 180000);
    runErrand(ev, job);
  } else {
    runErrand(ev, { done: true, ok: ev.ok !== false, count: ev.count });
    feed(ev);
  }
}

// ── The feed ─────────────────────────────────────────────────────────────────
const list = $("w-list");
function fmtTime(ms) { return new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
function feed(ev) {
  if (list.querySelector(".empty")) list.innerHTML = "";
  const label = (ev.demo ? "Demo · " : "") + (ev.label || ev.service + " " + ev.action);
  const top = list.firstElementChild;
  if (top && top.dataset.label === label) {
    const n = (+top.dataset.n || 1) + 1;
    top.dataset.n = n;
    top.querySelector(".l").textContent = label + "  ×" + n;
    top.querySelector(".t").textContent = fmtTime(ev.at);
    return;
  }
  const li = document.createElement("li");
  li.className = "new"; li.dataset.label = label;
  const color = (DISTRICTS[ev.service] || {}).color || (ev.service === "weather" ? DISTRICTS.calendar.color : ev.service === "reminders" ? DISTRICTS.calendar.color : "#22d3ee");
  li.innerHTML = `<span class="sw"></span><span class="l"></span><span class="t"></span>`;
  li.querySelector(".sw").style.background = color;
  li.querySelector(".l").textContent = label;
  if (ev.ok === false) li.querySelector(".l").classList.add("bad");
  li.querySelector(".t").textContent = fmtTime(ev.at);
  list.prepend(li);
  while (list.children.length > 80) list.lastElementChild.remove();
}

function legend() {
  $("w-legend").innerHTML = Object.values(DISTRICTS).map(d => `<span><i style="background:${d.color}"></i>${d.title}</span>`).join("");
}

// ── Snapshot ─────────────────────────────────────────────────────────────────
let refreshTimer = null;
function refreshSoon() { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 1500); }
let platformsKey = null;
async function refresh() {
  try {
    const r = await fetch("/api/world");
    if (r.status === 401) { location.href = "/login"; return; }
    const w = await r.json();
    const pk = JSON.stringify(w.social.platforms);
    if (pk !== platformsKey) { platformsKey = pk; buildPlatforms(w.social.platforms); }
    buildNodes(w.nodes);
    paintVMs(w.vms); paintContainers(w.containers); paintHome(w.home);
    B.social.sub = DISTRICTS.social.sub + (w.social.queued ? ` · ${w.social.queued} queued` : "");
    B.mail.sub = w.mail.length ? "Inboxes: " + w.mail.join(", ") : DISTRICTS.mail.sub;
    B.core.sub = `${w.host.name} · CPU ${Math.round(w.host.cpu)}% · memory ${Math.round(w.host.mem)}%`;
    return w;
  } catch { return null; }
}

// ── Live stream ──────────────────────────────────────────────────────────────
function live() {
  const el = $("w-live");
  const set = (on, text) => { el.classList.toggle("on", on); el.querySelector("span").textContent = text; };
  const es = new EventSource("/api/events");
  es.addEventListener("connected", () => set(true, "live"));
  es.addEventListener("error", () => set(false, "reconnecting"));
  es.addEventListener("activity", e => { try { onActivity(JSON.parse(e.data)); } catch {} });
  es.addEventListener("vmlab", refreshSoon);
  es.addEventListener("docker", refreshSoon);
  es.addEventListener("homeos_state", refreshSoon);
}

// ── Demo: practice errands, nothing real happens ─────────────────────────────
function demo() {
  const connected = PLATFORM_ORDER.filter(id => B[id] && !/Not connected/.test(B[id].sub));
  const plats = (connected.length ? connected : PLATFORM_ORDER).slice(0, 3);
  const now = () => Date.now();
  const k = s => "demo:" + s + ":" + now();
  const seq = [];
  plats.forEach((p, i) => {
    const key = k(p);
    seq.push([i * 500, { service: "social", action: "send", target: p, phase: "start", key, label: "Posting to " + B[p].title }]);
    const ok = i !== 2;   // the third one fails, to show what that looks like
    seq.push([4000 + i * 900, { service: "social", action: "send", target: p, phase: "done", key, ok, label: (ok ? "Posted to " : "Post failed on ") + B[p].title }]);
  });
  const mk = k("mail");
  seq.push([800, { service: "mail", action: "check", phase: "start", key: mk, label: "Checking inbox" }]);
  seq.push([2500, { service: "mail", action: "check", phase: "done", key: mk, ok: true, count: 3, label: "3 new messages" }]);
  const ak = k("ai");
  seq.push([1200, { service: "ai", action: "think", target: "openrouter", phase: "start", key: ak, label: "Asking a model" }]);
  seq.push([6000, { service: "ai", action: "think", target: "openrouter", phase: "done", key: ak, ok: true, label: "Model answered" }]);
  seq.push([1600, { service: "monitor", action: "sweep", label: "Checked the nodes" }]);
  seq.push([2200, { service: "docker", action: "pull", target: "dockerhub", label: "Pulling an image" }]);
  seq.push([2600, { service: "calendar", action: "sync", target: "google", label: "Calendar synced with Google" }]);
  seq.push([3300, { service: "weather", action: "fetch", label: "Fetching the weather" }]);
  seq.push([3800, { service: "notes", action: "save", label: "Note saved" }]);
  seq.push([4600, { service: "reminders", action: "fire", label: "Reminder fired" }]);
  for (const [delay, ev] of seq) setTimeout(() => onActivity(Object.assign({ at: now(), demo: true }, ev)), delay);
}

// ── Picking: hover for details, click to open the page ───────────────────────
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tip = $("w-tip");
let hoverId = null, downAt = null;
function pick(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(pickables, false)[0];
  return hit ? hit.object.userData.bid : null;
}
renderer.domElement.addEventListener("pointermove", e => {
  const id = pick(e);
  hoverId = id && B[id] ? id : null;
  if (!hoverId) { tip.style.display = "none"; renderer.domElement.style.cursor = ""; return; }
  const b = B[hoverId];
  tip.innerHTML = "";
  const t = document.createElement("b"); t.textContent = b.title;
  const s = document.createElement("span"); s.textContent = (b.sub || "") + (b.href ? " — click to open" : "");
  tip.append(t, s);
  const rect = stage.getBoundingClientRect();
  tip.style.display = "block";
  tip.style.left = Math.min(e.clientX - rect.left + 14, rect.width - 270) + "px";
  tip.style.top = (e.clientY - rect.top + 14) + "px";
  renderer.domElement.style.cursor = b.href ? "pointer" : "";
});
renderer.domElement.addEventListener("pointerleave", () => { tip.style.display = "none"; });
renderer.domElement.addEventListener("pointerdown", e => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener("pointerup", e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const id = pick(e);
  if (id && B[id] && B[id].href) location.href = B[id].href;
});

// ── Buttons ──────────────────────────────────────────────────────────────────
$("w-demo").addEventListener("click", () => { demo(); showToast("Demo errands sent. Nothing is really posted.", "info"); });
const spinBtn = $("w-spin");
spinBtn.classList.toggle("on", controls.autoRotate);
spinBtn.addEventListener("click", () => { controls.autoRotate = !controls.autoRotate; spinBtn.classList.toggle("on", controls.autoRotate); });
$("w-reset").addEventListener("click", () => { camera.position.copy(HOME_VIEW); controls.target.set(0, 0, 0); });

// ── Loop ─────────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let ledT = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  controls.update(dt);
  for (const s of spinners) s.obj.rotation[s.axis] += s.speed * dt;
  for (const r of robots) updateRobot(r, dt);
  for (const fx of effects) if (!fx(dt)) effects.delete(fx);
  for (const b of Object.values(B)) {
    if (b.flash > 0.001 || b.flashing) {
      b.flash *= Math.pow(0.08, dt);
      b.flashing = b.flash > 0.001;
      for (const m of b.mats) m.emissiveIntensity = b.base.get(m) + b.flash * 1.8;
    }
  }
  ledT += dt;
  if (dyn.vmRacks && ledT > 0.25) {
    ledT = 0;
    dyn.vmRacks.children.forEach(o => { if (o.userData.blink != null) o.visible = Math.random() > 0.15; });
  }
  if (dyn.bell) dyn.bell.rotation.z = (B.calendar.flash || 0) * Math.sin(performance.now() / 70) * 0.4;
  renderer.render(scene, camera);
}

// ── Boot ─────────────────────────────────────────────────────────────────────
(async function boot() {
  try {
    await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]);
    buildGround(); buildCore(); buildDistricts(); buildExternals(); buildPlatforms([]); legend();
    resize();
    const w = await refresh();
    if (w) for (const ev of w.recent) if (ev.phase !== "start") feed(ev);
    live();
    setInterval(refresh, 20000);
    setInterval(drawClock, 30000);
    renderer.setAnimationLoop(frame);
  } catch (e) {
    const el = $("w-err");
    el.style.display = "flex";
    el.textContent = "Metis World could not start: " + (e && e.message || e) + ". This page needs WebGL.";
    console.error(e);
  }
})();
