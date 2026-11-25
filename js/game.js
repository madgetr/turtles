// Pet Turtle: top-down, procedurally animated turtle you can call, feed, water, clean up after and play with.
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, dprCap = 2.5; // dprCap drops on slow devices (see frame())
let TOP = 70, BOTTOM = 110; // space taken by the HUD and toolbar (CSS px), measured from the page in resize()

// ---------- helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const ease = t => t * t * (3 - 2 * t);
const buzz = ms => navigator.vibrate && navigator.vibrate(ms);

// ---------- world state ----------
const bowl = { x: 0, y: 0, r: 38, level: 1, fill: 0 };
let foods = [], poops = [], parts = [], ball = null, marker = null;
let mode = 'walk', foodType = 'lettuce';

// ---------- yard, camera, upgrades ----------
// Everything lives in world coordinates inside a yard of YW x YH. The camera (pan + pinch zoom)
// maps the world onto the screen area between the HUD and the toolbar.
const YARDS = [
  { name: 'Small', m: 1 }, { name: 'Medium', m: 1.6, cost: 60 }, { name: 'Large', m: 2.3, cost: 180 }, { name: 'Huge', m: 3.2, cost: 400 },
];
const BOWLS = [
  { name: 'Water bowl', r: 38, cap: 1 }, { name: 'Big bowl', r: 46, cap: 2, cost: 25 }, { name: 'Fountain', r: 52, cap: 3, cost: 120, refill: true },
];
const FEEDERS = [null,
  { name: 'Auto feeder', cost: 60, every: 45, awayEvery: 3 * 3600 },
  { name: 'Deluxe feeder', cost: 150, every: 25, awayEvery: 1.5 * 3600, berries: true }];
const TOYS = {
  ball: { name: 'Ball', icon: '🔴', r: 13, cost: 0, push: 1, drag: 0.35, desc: 'The classic.' },
  bell: { name: 'Bell ball', icon: '🔔', r: 12, cost: 20, push: 1, drag: 0.35, desc: 'Jingles! Playtime makes turtles extra happy.' },
  treat: { name: 'Treat ball', icon: '🍪', r: 14, cost: 40, push: 0.9, drag: 0.3, desc: 'Drops a snack now and then when nudged.' },
  beach: { name: 'Beach ball', icon: '🏖️', r: 24, cost: 50, push: 1.5, drag: 0.55, desc: 'Big, light and bouncy.' },
};
const STRUCTS = {
  rock: { name: 'Basking rock', icon: '🪨', cost: 20, desc: 'A warm spot to nap in the sun.' },
  log: { name: 'Log tunnel', icon: '🪵', cost: 45, desc: 'Curious turtles love crawling through.' },
  hut: { name: 'Hideaway hut', icon: '🛖', cost: 70, desc: 'A cozy hideout. Grumpy turtles calm down inside.' },
  pond: { name: 'Pond', icon: '🌊', cost: 200, desc: 'Swim, splash and drink as much as they like.', needYard: 1 },
  mud: { name: 'Mud pit', icon: '🟫', cost: 60, desc: 'Turtles love a good roll. Wash them afterwards!' },
  slide: { name: 'Slide', icon: '🛝', cost: 80, desc: 'Climb up, zoom down. Wheee!' },
  mirror: { name: 'Mirror', icon: '🪞', cost: 35, desc: 'Curious turtles admire themselves. Grumpy ones... not so much.' },
};
const AUTO = {
  lamp: { name: 'Heat lamp', icon: '🔆', cost: 80, desc: 'Turtles nearby stay full longer and grow faster. Glows at night.' },
  garden: { name: 'Veggie garden', icon: '🥬', cost: 70, desc: 'Grows lettuce in real time. Turtles help themselves.' },
};
const DECOS = {
  flowers: { name: 'Flower patch', icon: '🌷', cost: 10 },
  shell: { name: 'Seashell', icon: '🐚', cost: 8 },
  mushrooms: { name: 'Mushrooms', icon: '🍄', cost: 8 },
  stones: { name: 'Stepping stones', icon: '🪨', cost: 12 },
  bush: { name: 'Bush', icon: '🌿', cost: 15, tall: true },
  lantern: { name: 'Lantern', icon: '🏮', cost: 25, tall: true, light: true },
};
const MUD = { rx: 72, ry: 46 }, SLIDE = { len: 150, w: 46 }, LAMP_R = 130, SLOT = 44;
const GROW_MS = { lettuce: 20 * 60e3, berry: 40 * 60e3 }; // garden growing time (real time)
let plots = [];   // garden slots: { t0 (planted, ms) }
let crabs = [];   // clean-up crabs (not saved: they just scuttle back in)
let flies = [];   // fireflies at night
let arranging = false, hourOverride = null;
const POND = { rx: 120, ry: 78 }, LOG = { len: 150, r: 40 }, HUT = { r: 54 }, ROCK = { rx: 56, ry: 36 }, FEEDER_R = 26;
let up = { yard: 0, bowl: 0, feeder: 0, toys: ['ball'], toy: 'ball', crab: 0, vet: 0, garden: 0 };
let objs = []; // placed things: { kind: 'feeder' | 'rock' | 'log' | 'hut' | 'pond', x, y }
let stars = 0, lastDaily = '', base = null, feederT = 0, waterStarCool = 0;
let YW = 400, YH = 600;
const cam = { x: 200, y: 300, z: 1 };
let placing = null; // object waiting for a tap to be put down
const objOf = kind => objs.find(o => o.kind === kind);
const inPond = p => { const o = objOf('pond'); return !!o && ((p.x - o.x) / POND.rx) ** 2 + ((p.y - o.y) / POND.ry) ** 2 < 1; };
const structCount = () => objs.filter(o => STRUCTS[o.kind]).length;

// Growth: 0 = fresh hatchling, 1 = full-grown. Size (half shell length) scales with it.
const MIN_S = 15, MAX_S = 44;
const STAGES = [[0, 'Hatchling'], [0.15, 'Baby'], [0.4, 'Juvenile'], [0.7, 'Young adult'], [1, 'Adult']];
const stageOf = g => STAGES.filter(([t]) => g >= t).pop()[1];
const aStage = name => (/^[AEIOU]/.test(name) ? 'an ' : 'a ') + name;
const GROW_RATE = 1; // growth per bite multiplier (10 = fast, for testing)
const sizeFor = g => lerp(MIN_S, MAX_S, Math.sqrt(clamp(g, 0, 1))); // grows fast early, slows later

// ---------- turtles ----------
// Each turtle has its own body, needs, health and growth. The brain/legs/drawing code works on the
// "current" turtle via T, S (its size) and st (its stats); use(t) switches which one that is.
const MAX_TURTLES = 10;
const NAMES = ['Shelly', 'Pebble', 'Tank', 'Mossy', 'Sheldon', 'Dot', 'Biscuit', 'Ziggy', 'Clover', 'Nugget'];
// Each turtle gets a slight color variation: shell hue, skin hue (degrees) and brightness.
const randomTint = () => ({ shell: rand(-28, 28), skin: rand(-18, 18), light: rand(-0.12, 0.12) });
const tintGap = (a, b) => Math.abs(a.shell - b.shell) / 28 + Math.abs(a.skin - b.skin) / 18 + Math.abs(a.light - b.light) / 0.12;
function pickTint(others) { // best of a few random tints: the one least like the turtles you already have
  let best = randomTint(), bestGap = -1;
  for (let i = 0; i < 12 && others.length; i++) {
    const c = randomTint(), gap = Math.min(...others.map(o => tintGap(c, o.tint)));
    if (gap > bestGap) { best = c; bestGap = gap; }
  }
  return best;
}
const SICK = 35; // health below this = sick
let turtles = [], sel = null, picked = true; // sel = last turtle picked; picked = it's currently selected
const isPicked = () => picked || turtles.length < 2;
let T = null, S = MIN_S, st = null;
function use(t) { T = t; S = t.S; st = t.st; }
// Personality: each trait is 0..1 (shown as 1-5 dots). Rolled once when a turtle is adopted.
const TRAITS = [
  { k: 'speed', icon: '⚡', label: 'Speed', hi: 'Speedy', lo: 'Slowpoke' },
  { k: 'friendly', icon: '😊', label: 'Friendly', hi: 'Cuddly', lo: 'Grumpy' },
  { k: 'appetite', icon: '🍽️', label: 'Appetite', hi: 'Hungry', lo: 'Picky' },
  { k: 'playful', icon: '🎾', label: 'Playful', hi: 'Playful', lo: 'Lazy' },
  { k: 'curious', icon: '🔍', label: 'Curious', hi: 'Curious', lo: 'Homebody' },
];
const randomTraits = () => Object.fromEntries(TRAITS.map(({ k }) => [k, Math.random()]));
const dots = v => Math.round(v * 4) + 1; // 1..5
// the one or two traits that stand out most, e.g. "Speedy · Grumpy"
function personality(tr) {
  const notable = TRAITS.map(d => ({ d, v: tr[d.k] })).filter(x => Math.abs(x.v - 0.5) > 0.25)
    .sort((a, b) => Math.abs(b.v - 0.5) - Math.abs(a.v - 0.5)).slice(0, 2);
  return notable.length ? notable.map(x => (x.v > 0.5 ? x.d.hi : x.d.lo)).join(' · ') : 'Easygoing';
}

function makeTurtle(o = {}) {
  const t = {
    x: 200, y: 400, a: -Math.PI / 2, v: 0,
    feet: [], head: { x: 0, y: 0 }, headA: 0, headExt: 1,
    userTarget: null, outing: null, rest: null, idleT: rand(1, 4), starCool: 0, playStarCool: 0,
    eat: null, drinkT: 0, petT: 0, petCool: 0, nudgeCool: 0,
    gut: [], growth: 0, blinkT: rand(1, 4), blink: 0, tailT: rand(0, 6), lookAt: null,
    name: 'Shelly',
    ...o,
  };
  if (!t.tint) t.tint = o.hue ? { shell: clamp(o.hue * 0.5, -28, 28), skin: clamp(o.hue * 0.3, -18, 18), light: rand(-0.12, 0.12) } : randomTint();
  t.st = { hunger: 80, thirst: 80, happy: 70, health: 100, social: 80, energy: 85, warm: 90, ...(o.st || {}) }; // last three are hidden moods
  t.chub = o.chub || 0; t.diet = o.diet || []; // chub: 0 = trim, 1 = very round; diet = last few foods eaten
  t.traits = { ...randomTraits(), ...(o.traits || {}) };
  t.S = sizeFor(t.growth);
  return t;
}
// hip (h) and foot rest (r) in local coords, +x is forward. Diagonal pairs share a gait group.
const LEGS = [
  { hx: 0.45, hy: -0.55, rx: 0.8, ry: -1.0, g: 0 },
  { hx: 0.45, hy: 0.55, rx: 0.8, ry: 1.0, g: 1 },
  { hx: -0.45, hy: -0.55, rx: -0.65, ry: -0.95, g: 1 },
  { hx: -0.45, hy: 0.55, rx: -0.65, ry: 0.95, g: 0 },
];
const toWorld = (lx, ly) => {
  const c = Math.cos(T.a), s = Math.sin(T.a);
  return { x: T.x + (lx * c - ly * s) * S, y: T.y + (lx * s + ly * c) * S };
};
const mouth = () => toWorld(1.25 + 0.45 * T.headExt, 0);

function resetFeet() {
  T.feet = LEGS.map(l => { const p = toWorld(l.rx, l.ry); return { x: p.x, y: p.y, fx: p.x, fy: p.y, tx: p.x, ty: p.y, t: 1 }; });
  const m = toWorld(1.6, 0); T.head.x = m.x; T.head.y = m.y;
}

// ---------- layout, camera, background ----------
function resize() {
  DPR = Math.min(devicePixelRatio || 1, dprCap);
  W = innerWidth; H = innerHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  // the HUD grows with the phone's status bar / camera cutout, so measure it instead of guessing
  TOP = Math.round(document.getElementById('stage').getBoundingClientRect().bottom + 6);
  BOTTOM = Math.round(H - document.getElementById('tools').getBoundingClientRect().top + 6);
  makeSand();
  if (base) applyYard();
}

function applyYard() {
  const m = YARDS[up.yard].m;
  YW = Math.round(base.w * m); YH = Math.round(base.h * m);
  bowl.r = BOWLS[up.bowl].r;
  for (const p of [...poops, ...foods, ...objs, bowl]) keepInYard(p);
  for (const t of turtles) { t.x = clamp(t.x, 35, YW - 35); t.y = clamp(t.y, 25, YH - 15); }
  makeDeco(); clampCam();
}

const keepInYard = p => { p.x = clamp(p.x, 24, YW - 24); p.y = clamp(p.y, 16, YH - 16); };
const viewH = () => H - TOP - BOTTOM;
const vcx = () => W / 2, vcy = () => TOP + viewH() / 2; // screen point the camera centers on
const zMin = () => Math.min(1, W / YW, viewH() / YH);   // zoomed all the way out = whole yard fits
const Z_MAX = 2.5;
function clampCam() {
  cam.z = clamp(cam.z, zMin(), Z_MAX);
  const hw = W / 2 / cam.z, hh = viewH() / 2 / cam.z;
  cam.x = YW <= hw * 2 ? YW / 2 : clamp(cam.x, hw, YW - hw);
  cam.y = YH <= hh * 2 ? YH / 2 : clamp(cam.y, hh, YH - hh);
}
const s2w = (sx, sy) => ({ x: (sx - vcx()) / cam.z + cam.x, y: (sy - vcy()) / cam.z + cam.y });
const viewRect = () => ({ x0: cam.x - vcx() / cam.z, x1: cam.x + (W - vcx()) / cam.z, y0: cam.y - vcy() / cam.z, y1: cam.y + (H - vcy()) / cam.z });
const inView = (p, m, v) => p.x > v.x0 - m && p.x < v.x1 + m && p.y > v.y0 - m && p.y < v.y1 + m;
const worldTransform = () => ctx.setTransform(DPR * cam.z, 0, 0, DPR * cam.z, DPR * (vcx() - cam.x * cam.z), DPR * (vcy() - cam.y * cam.z));

// sand is a repeating tile (crisp at any zoom); pebbles and grass are world objects, drawn only when visible
let sandPat = null, deco = [];
function makeSand() {
  const k = DPR * 2, n = 256, c = document.createElement('canvas');
  c.width = c.height = n * k;
  const g = c.getContext('2d', { willReadFrequently: true }); g.scale(k, k); // software canvas: handed to the GPU as plain pixels
  let seed = 3; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#d9c494'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 18; i++) {
    g.fillStyle = r() < 0.5 ? '#00000005' : '#ffffff08';
    const x = r() * n, y = r() * n, rr = 10 + r() * 40;
    for (const [ox, oy] of [[0, 0], [n, 0], [-n, 0], [0, n], [0, -n]]) { g.beginPath(); g.ellipse(x + ox, y + oy, rr, rr * 0.7, 0, 0, 7); g.fill(); }
  }
  for (let i = 0; i < 1500; i++) { g.fillStyle = r() < 0.5 ? '#00000012' : '#ffffff1c'; g.fillRect(r() * n, r() * n, 1.5, 1.5); }
  g.getImageData(0, 0, 1, 1);
  sandPat = ctx.createPattern(c, 'repeat');
  sandPat.setTransform(new DOMMatrix().scale(1 / k));
}
function makeDeco() {
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const tuft = (x, y) => ({ t: 'grass', x, y, blades: Array.from({ length: 7 }, (_, b) => ({ a: -Math.PI / 2 + (r() - 0.5) * 1.2, l: 8 + r() * 12, c: b % 3 })) });
  deco = [];
  for (let i = 0; i < YW * YH / 5000; i++) deco.push({ t: 'pebble', x: r() * YW, y: r() * YH, s: 2 + r() * 5, rot: r() * 3, c: i % 4 });
  const per = 2 * (YW + YH); // grass hugs the fence
  for (let i = 0; i < per / 16; i++) {
    let d = r() * per, x, y; const inset = r() * 24 + 2;
    if (d < YW) { x = d; y = inset; } else if ((d -= YW) < YH) { x = YW - inset; y = d; } else if ((d -= YH) < YW) { x = d; y = YH - inset; } else { x = inset; y = d - YW; }
    deco.push(tuft(x, y));
  }
  for (let i = 0; i < YW * YH / 30000; i++) deco.push(tuft(r() * YW, r() * YH));
}
const PEBBLE = ['#a8988a', '#8f8274', '#c4b8a8', '#7d7468'], GRASS = ['#5d8a3a', '#6f9e45', '#4c7630'];
function drawYard(v) {
  const c = ctx;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.fillStyle = '#4a7230'; c.fillRect(0, 0, W, H); // lawn outside the fence
  worldTransform();
  c.fillStyle = '#0003'; c.fillRect(6, 8, YW, YH);
  c.fillStyle = sandPat; c.fillRect(0, 0, YW, YH);
  // one path per colour: hundreds of separate little strokes are what slows small tablets down
  const peb = PEBBLE.map(() => new Path2D()), shine = new Path2D(), grass = GRASS.map(() => new Path2D());
  for (const d of deco) {
    if (!inView(d, 30, v)) continue;
    if (d.t === 'pebble') {
      const P = peb[d.c]; P.moveTo(d.x + d.s * Math.cos(d.rot), d.y + d.s * Math.sin(d.rot)); P.ellipse(d.x, d.y, d.s, d.s * 0.75, d.rot, 0, 7);
      const hx = d.x - d.s * 0.3, hy = d.y - d.s * 0.3; shine.moveTo(hx + d.s * 0.35, hy); shine.ellipse(hx, hy, d.s * 0.35, d.s * 0.25, 0, 0, 7);
    } else {
      for (const b of d.blades) {
        const G = grass[b.c]; G.moveTo(d.x, d.y);
        G.quadraticCurveTo(d.x + Math.cos(b.a) * b.l * 0.5 + 3, d.y + Math.sin(b.a) * b.l * 0.5, d.x + Math.cos(b.a) * b.l, d.y + Math.sin(b.a) * b.l);
      }
    }
  }
  peb.forEach((P, i) => { c.fillStyle = PEBBLE[i]; c.fill(P); });
  c.fillStyle = '#ffffff40'; c.fill(shine);
  c.lineWidth = 2; c.lineCap = 'round';
  grass.forEach((G, i) => { c.strokeStyle = GRASS[i]; c.stroke(G); });
  // wooden fence
  c.strokeStyle = '#6b4a2a'; c.lineWidth = 7; c.strokeRect(-4, -4, YW + 8, YH + 8);
  c.strokeStyle = '#9a6e40'; c.lineWidth = 3; c.strokeRect(-4, -4, YW + 8, YH + 8);
  c.fillStyle = '#5a3c20';
  for (let x = -4; x <= YW + 4; x += 60) for (const y of [-4, YH + 4]) { c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill(); }
  for (let y = 56; y < YH; y += 60) for (const x of [-4, YW + 4]) { c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill(); }
}

// ---------- persistence ----------
const SAVE = 'turtle-save-v2', OLD_SAVE = 'turtle-save-v1';
const KEEP = ['name', 'tint', 'traits', 'st', 'x', 'y', 'a', 'gut', 'growth', 'mud', 'chub', 'diet'];
function save() {
  localStorage.setItem(SAVE, JSON.stringify({
    turtles: turtles.filter(t => t.releasing === undefined).map(t => Object.fromEntries(KEEP.map(k => [k, t[k]]))),
    sel: turtles.indexOf(sel), poops, level: bowl.level, t: Date.now(),
    foods: foods.map(({ x, y, type, bites, max, rot, fromFeeder, slot }) => ({ x, y, type, bites, max, rot, fromFeeder, slot })),
    world: true, base, up, objs: objs.map(({ kind, type, seed, x, y }) => ({ kind, type, seed, x, y })), plots, bowlPos: { x: bowl.x, y: bowl.y },
    stars, lastDaily, cam: { x: cam.x, y: cam.y, z: cam.z },
  }));
}
// Loads the save. Returns { away (seconds), fresh, legacy (old screen coordinates), newStars }.
function load() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(SAVE)); } catch { }
  if (!d) { // migrate the single-turtle save
    try {
      const o = JSON.parse(localStorage.getItem(OLD_SAVE));
      if (o) d = { turtles: [{ name: 'Shelly', st: o.st, x: o.x, y: o.y, a: o.a, gut: o.gut, growth: o.growth ?? 0.12 }], sel: 0, poops: o.poops, level: o.level, t: o.t };
    } catch { }
  }
  if (!d || !d.turtles?.length) { turtles = [makeTurtle()]; sel = turtles[0]; stars = 15; return { away: 0, fresh: true }; }
  poops = d.poops || []; bowl.level = d.level ?? 1; foods = d.foods || [];
  turtles = d.turtles.map(o => makeTurtle({ ...o, gut: o.gut || [] }));
  sel = turtles[d.sel] || turtles[0];
  base = d.base || null; up = { ...up, ...(d.up || {}) }; objs = d.objs || []; plots = d.plots || [];
  stars = d.stars ?? 30; lastDaily = d.lastDaily || '';
  if (d.bowlPos) Object.assign(bowl, d.bowlPos);
  if (d.cam) Object.assign(cam, d.cam);
  return { away: clamp((Date.now() - d.t) / 1000, 0, 7 * 86400), legacy: !d.world, newStars: d.stars === undefined, hadBowl: !!d.bowlPos };
}

// ---------- life goes on while the game is closed ----------
// Rates while away (per second). Turtles drink
// from the bowl / eats leftover food by itself. Run out of both and health starts dropping.
const AWAY_FLOOR = 25;
const AWAY = { // tuned so a fed + watered turtle is hungry but fine after a day; ~2 days of neglect makes it sick
  hunger: 100 / (22 * 3600), thirst: 100 / (16 * 3600), happy: 100 / (30 * 3600), dirty: 100 / (72 * 3600),
  hurt: 100 / (18 * 3600), filth: 100 / (36 * 3600), heal: 100 / (4 * 3600), grow: 0.000002,
};
function healthStep(t, dt, r) {
  const s = t.st;
  let d = 0;
  if (s.hunger <= 0) d -= r.hurt;
  if (s.thirst <= 0) d -= r.hurt;
  if (poops.length >= 4) d -= r.filth;
  if (s.happy <= 5) d -= r.filth;
  if (d === 0 && s.hunger > 40 && s.thirst > 40 && poops.length < 4) d = r.heal;
  s.health = clamp(s.health + d * dt, 0, 100);
}
function simulateAway(secs) {
  const n = Math.ceil(secs / 60), dt = secs / n; // one-minute steps
  const rep = turtles.map(t => ({ t, ate: 0, drank: 0, pooped: 0, stage0: stageOf(t.growth), starved: false, parched: false, lowHealth: 100 }));
  let dryAt = null, fed = 0, feedAcc = 0;
  const pond = objOf('pond'), feeder = up.feeder && objOf('feeder'), B = BOWLS[up.bowl], F = FEEDERS[up.feeder];
  const enrich = Math.max(0.4, 1 - 0.08 * structCount()); // play structures keep turtles happier while you're gone
  const lamp = objOf('lamp'), t0ms = Date.now() - secs * 1000;
  let crabAcc = 0, cleaned = 0, grown = 0;
  for (let i = 0; i < n; i++) {
    const simNow = t0ms + (i + 1) * dt * 1000;
    grown += gardenTick(simNow);
    if (B.refill) bowl.level = Math.min(1, bowl.level + dt / 7200); // fountain: full again every ~2 h
    if (feeder) {
      feedAcc += dt;
      if (feedAcc >= F.awayEvery) {
        feedAcc -= F.awayEvery;
        if (foods.length < 6 && turtles.some(t => t.st.hunger < 75)) { foods.push(feederFood(feeder, F)); fed++; }
      }
    }
    for (const r of rep) {
      const t = r.t, s = t.st;
      s.hunger = clamp(s.hunger - dt * AWAY.hunger * lerp(0.85, 1.2, t.traits.appetite) * (lamp ? 0.9 : 1), 0, 100);
      s.thirst = clamp(s.thirst - dt * AWAY.thirst, 0, 100);
      if (s.thirst < 55 && pond) { s.thirst = 100; r.drank++; r.pond = true; } // all-you-can-drink pond
      else if (s.thirst < 55 && bowl.level > 0.01) { // wander over for a drink
        const sip = Math.min(bowl.level, 0.12 / B.cap);
        bowl.level -= sip; s.thirst = clamp(s.thirst + sip * B.cap * 333, 0, 100); r.drank++;
        if (bowl.level <= 0.01 && dryAt === null && !B.refill) dryAt = i * dt;
      }
      if (s.hunger < 70 && foods.length) { // munch leftovers
        const f = foods.shift();
        if (f.slot !== undefined && plots[f.slot]) plots[f.slot].t0 = simNow; // garden replants itself
        s.hunger = clamp(s.hunger + f.bites * 12, 0, 100); r.ate++;
        t.diet.push(f.type); if (t.diet.length > 6) t.diet.shift();
        if (f.type === 'berry') t.chub = clamp(t.chub + 0.05, 0, 1);
        t.growth = clamp(t.growth + f.bites * 0.003 * GROW_RATE * 0.8, 0, 1);
        t.gut.push(rand(15, 28) * 40); // digests over ~10-20 min while away
      }
      for (let g = t.gut.length - 1; g >= 0; g--) {
        t.gut[g] -= dt;
        if (t.gut[g] <= 0) {
          t.gut.splice(g, 1); r.pooped++;
          if (poops.length < 12) poops.push({ x: rand(40, YW - 40), y: rand(40, YH - 40), s: rand(0.85, 1.15), born: 1 });
        }
      }
      let drain = (AWAY.happy + poops.length * AWAY.dirty) * enrich;
      if (s.hunger < 20 || s.thirst < 20) drain += AWAY.happy * 2;
      s.happy = clamp(s.happy - dt * drain, 0, 100);
      // moods: friends keep each other company, everyone sleeps, a turtle alone gets lonely
      s.social = clamp(s.social + dt * AWAY.happy * (turtles.length > 1 ? 3 : -lerp(0.5, 2, t.traits.friendly)), 15, 100);
      s.energy = clamp(s.energy + dt * 0.01, 0, 100);
      t.chub = clamp(t.chub - dt * 0.000015, 0, 1); // slims down slowly: a berry binge still shows the next morning
      healthStep(t, dt, AWAY);
      s.health = Math.max(s.health, AWAY_FLOOR); // never dies while you're away: at worst comes back sick
      if (s.health > 50 && s.hunger > 40 && s.thirst > 40) t.growth = clamp(t.growth + dt * AWAY.grow * (lamp ? 1.3 : 1), 0, 1);
      if (s.hunger <= 0) r.starved = true;
      if (s.thirst <= 0) r.parched = true;
      r.lowHealth = Math.min(r.lowHealth, s.health);
    }
    if (up.crab) { // crabs tidy up
      crabAcc += dt;
      const every = 1200 / up.crab;
      while (crabAcc >= every) { crabAcc -= every; if (poops.length) { poops.pop(); cleaned++; } }
    }
  }
  turtles.forEach(t => t.mud = Math.max(0, (t.mud || 0) - secs / 900));
  const chilly = darkness() > 0.5 && !lamp && !objOf('hut'); // a cold night with nowhere warm
  turtles.forEach(t => t.st.warm = chilly ? Math.min(t.st.warm, 45) : 100);
  turtles.forEach(t => t.S = sizeFor(t.growth));
  return { secs, rep, dryAt, fed, cleaned, grown };
}

const fmtTime = s => s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.floor(s / 3600)} h ${Math.round(s % 3600 / 60)} min` : `${Math.floor(s / 86400)} d ${Math.floor(s % 86400 / 3600)} h`;
function showAway(report) {
  const box = document.getElementById('away');
  const lines = [];
  for (const r of report.rep) {
    const t = r.t, s = t.st, bits = [];
    if (r.ate) bits.push(`ate ${r.ate} leftover snack${r.ate > 1 ? 's' : ''}`);
    if (r.drank) bits.push(r.pond ? 'swam and drank in the pond' : 'drank from the bowl');
    if (r.pooped) bits.push(`pooped ${r.pooped}×`);
    const stage = stageOf(t.growth);
    if (stage !== r.stage0) bits.push(`grew into ${aStage(stage)}! 🎉`);
    const now = [];
    if (s.health < SICK) now.push('🤒 <b>sick</b>');
    if (s.hunger < 30) now.push('🥬 very hungry');
    if (s.thirst < 30) now.push('💧 thirsty');
    if (s.happy < 30) now.push('😢 sad');
    if (s.social < MOOD.lonely) now.push('🤗 lonely');
    if (!now.length) now.push('😊 doing great');
    lines.push(`<div class="who">🐢 ${t.name}</div><div>${bits.length ? bits.join(', ') + '.' : 'Mostly napped.'}</div><div>Now: ${now.join(' · ')}</div>`);
  }
  const extra = [];
  if (report.dryAt !== null) extra.push(`💧 The water bowl ran dry ${fmtTime(report.dryAt)} after you left.`);
  if (report.grown) extra.push(`🥬 The garden grew ${report.grown} veggie${report.grown > 1 ? 's' : ''}.`);
  if (report.cleaned) extra.push(`🦀 The crab${up.crab > 1 ? 's' : ''} cleaned up ${report.cleaned} mess${report.cleaned > 1 ? 'es' : ''}.`);
  if (report.fed) extra.push(`🥫 The feeder dropped ${report.fed} snack${report.fed > 1 ? 's' : ''}.`);
  if (poops.length) extra.push(`🧹 ${poops.length} mess${poops.length > 1 ? 'es' : ''} to clean up.`);
  box.querySelector('.body').innerHTML = `<div class="when">You were away ${fmtTime(report.secs)}</div>` + lines.join('<hr>') + (extra.length ? '<hr>' + extra.join('<br>') : '');
  box.hidden = false;
}

// ---------- particles ----------
function emit(x, y, kind, n = 1) {
  for (let i = 0; i < n; i++) {
    const p = { x, y, kind, t: 0, life: 1, vx: rand(-20, 20), vy: rand(-40, -15), r: rand(0, 6) };
    if (kind === 'crumb') { p.vx = rand(-50, 50); p.vy = rand(-50, 50); p.life = 0.5; }
    if (kind === 'drop') { p.vx = rand(-60, 60); p.vy = rand(-60, 60); p.life = 0.6; }
    if (kind === 'ripple') { p.vx = p.vy = 0; p.life = 0.8; }
    if (kind === 'sparkle') { p.vx = rand(-70, 70); p.vy = rand(-70, 70); p.life = 0.7; }
    if (kind === 'heart' || kind === 'grr' || kind === 'note' || kind === 'zzz') { p.life = 1.4; p.vx = rand(-15, 15); }
    if (kind === 'mud') { p.vx = rand(-50, 50); p.vy = rand(-50, 50); p.life = 0.6; }
    parts.push(p);
  }
}

// ---------- turtle brain ----------
function goalFor() {
  if (T.userTarget) return { p: T.userTarget, reach: 12, by: 'body', arrive: () => { T.userTarget = null; st.happy = clamp(st.happy + 1, 0, 100); } };
  // food nobody else is already munching on
  const free = foods.filter(f => !f.eater || f.eater === T || f.eater.eat?.f !== f);
  if (free.length && st.hunger < lerp(75, 98, T.traits.appetite)) { // picky eaters wait until they're hungrier
    const f = free.reduce((b, f) => (dist(f, T) < dist(b, T) ? f : b));
    return { p: f, reach: 12, by: 'mouth', arrive: () => { T.eat = { f, t: 0 }; f.eater = T; } };
  }
  if (st.thirst < 65) {
    const pond = objOf('pond');
    if (pond && (bowl.level <= 0.08 || dist(T, pond) - POND.rx < dist(T, bowl))) { // drink at the near edge of the pond
      const a = Math.atan2(T.y - pond.y, T.x - pond.x);
      const p = { x: pond.x + Math.cos(a) * POND.rx * 0.8, y: pond.y + Math.sin(a) * POND.ry * 0.8 };
      return { p, reach: 12, by: 'mouth', arrive: () => { T.drinkT = 2.6; T.drinkFrom = pond; } };
    }
    if (bowl.level > 0.08) return { p: bowl, reach: bowl.r + 4, bodyReach: bowl.r + S * 0.9 + 6, by: 'mouth', arrive: () => { T.drinkT = 2.6; T.drinkFrom = bowl; } }; // bumping the rim is close enough
  }
  if (ball && st.hunger > 15 && st.thirst > 15 && (T.traits.playful > 0.3 || st.happy < 40)) { // lazy turtles only play when they're down
    return { p: ball, reach: 14 + ball.r, by: 'mouth', arrive: nudgeBall, keepGoing: true };
  }
  if (T.outing) {
    const o = T.outing;
    return { p: o.route[0], reach: 14, by: 'body', slow: !o.then, arrive: () => {
      o.route.shift();
      if (o.route.length) return;
      T.outing = null; T.idleT = rand(2, 6) * lerp(2.2, 0.5, T.traits.curious);
      if (o.then === 'bask') T.rest = { kind: 'bask', t: rand(8, 16) };
      if (o.then === 'hide') T.rest = { kind: 'hide', t: rand(10, 20) };
      if (o.then === 'tunnel') { st.happy = clamp(st.happy + 3 + T.traits.curious * 6, 0, 100); emit(T.x, T.y - S, 'heart'); }
      if (o.then === 'sleep') T.rest = { kind: 'sleep', t: rand(40, 120) };
      if (o.then === 'roll') { T.rest = { kind: 'roll', t: rand(3, 5) }; T.mud = 1; st.happy = clamp(st.happy + 8, 0, 100); }
      if (o.then === 'mirror') T.rest = { kind: 'mirror', t: rand(5, 9) };
      if (o.then === 'greet') { // say hi to a friend
        const f = o.friend;
        if (f && dist(f, T) < (f.S + S) * 1.8) { st.social = clamp(st.social + 12, 0, 100); f.st.social = clamp(f.st.social + 6, 0, 100); emit(T.x, T.y - S, 'heart', 2); T.a = Math.atan2(f.y - T.y, f.x - T.x); }
      }
      if (o.then === 'slide') { const sl = objOf('slide'); if (sl) T.sliding = { t: 0, from: { x: T.x, y: sl.y }, to: { x: sl.x - SLIDE.len / 2 - 55, y: sl.y } }; }
    } };
  }
  return null;
}

// Pick something to do when idle: a stroll, or a visit to a play structure the turtle's personality likes.
function pickOuting() {
  const tr = T.traits, opts = [];
  const rock = objOf('rock'), log = objOf('log'), hut = objOf('hut'), pond = objOf('pond');
  if (rock) opts.push([0.25 + (1 - tr.speed) * 0.25, () => ({ route: [{ x: rock.x + rand(-10, 10), y: rock.y + rand(-6, 6) }], then: 'bask' })]);
  if (log) opts.push([0.1 + tr.curious * 0.45, () => {
    const e = [{ x: log.x - LOG.len / 2 - 40, y: log.y }, { x: log.x + LOG.len / 2 + 40, y: log.y }];
    if (dist(T, e[1]) < dist(T, e[0])) e.reverse();
    return { route: e, then: 'tunnel' };
  }]);
  if (hut) opts.push([0.05 + (1 - tr.friendly) * 0.4 + (st.happy < 40 ? 0.3 : 0) + (st.warm < 60 ? 1.5 : 0), () => ({ route: [{ x: hut.x, y: hut.y + HUT.r + 30 }, { x: hut.x, y: hut.y }], then: 'hide' })]);
  if (pond) {
    const spot = () => ({ x: pond.x + rand(-0.55, 0.55) * POND.rx, y: pond.y + rand(-0.45, 0.45) * POND.ry });
    opts.push([0.1 + tr.playful * 0.4, () => ({ route: [spot(), spot(), spot()], then: 'swim' })]);
  }
  const lamp = objOf('lamp'), mud = objOf('mud'), slide = objOf('slide'), mirror = objOf('mirror');
  if (lamp) opts.push([0.15 + (darkness() > 0.5 ? 0.35 : 0) + (st.warm < 60 ? 3 : 0), () => ({ route: [{ x: lamp.x + rand(-50, 50), y: lamp.y + rand(-40, 40) }], then: 'bask' })]);
  if (mud) opts.push([0.05 + tr.playful * 0.3 + tr.curious * 0.1, () => ({ route: [{ x: mud.x + rand(-0.4, 0.4) * MUD.rx, y: mud.y + rand(-0.3, 0.3) * MUD.ry }], then: 'roll' })]);
  if (slide) opts.push([0.08 + tr.playful * 0.35 + tr.speed * 0.1, () => {
    const lo = slide.x - SLIDE.len / 2, hi = slide.x + SLIDE.len / 2;
    return { route: [{ x: lo - 30, y: slide.y }, { x: lo + 4, y: slide.y }, { x: hi - 10, y: slide.y }], then: 'slide' };
  }]);
  if (mirror) opts.push([0.05 + tr.curious * 0.35, () => ({ route: [{ x: mirror.x, y: mirror.y + 50 }], then: 'mirror' })]);
  const others = turtles.filter(o => o !== T && o.releasing === undefined && !o.dying);
  if (others.length) opts.push([st.social < 40 ? 4 : 0.1 + tr.friendly * 0.3, () => { // go see a friend
    const f = others.reduce((b, o) => (dist(o, T) < dist(b, T) ? o : b)), d = Math.max(1, dist(f, T)), gap = (f.S + S) * 1.1;
    return { route: [{ x: clamp(f.x + (T.x - f.x) / d * gap, 40, YW - 40), y: clamp(f.y + (T.y - f.y) / d * gap, 30, YH - 20) }], then: 'greet', friend: f };
  }]);
  opts.push([0.7, () => ({ route: [{ x: clamp(T.x + rand(-260, 260), 50, YW - 50), y: clamp(T.y + rand(-260, 260), 50, YH - 50) }] })]);
  let r = Math.random() * opts.reduce((a, o) => a + o[0], 0);
  for (const [w, make] of opts) if ((r -= w) <= 0) return make();
  return opts[opts.length - 1][1]();
}

function nudgeBall() {
  if (T.nudgeCool > 0) return;
  T.nudgeCool = 0.7;
  const toy = TOYS[ball.toy] || TOYS.ball;
  const push = (160 + T.v * 2) * toy.push;
  ball.vx += Math.cos(T.a) * push + rand(-40, 40);
  ball.vy += Math.sin(T.a) * push + rand(-40, 40);
  let joy = lerp(1, 7, T.traits.playful);
  if (ball.toy === 'bell') { joy *= 1.6; emit(ball.x, ball.y - ball.r, 'note'); }
  if (ball.toy === 'treat' && Math.random() < 0.4) { st.hunger = clamp(st.hunger + 4, 0, 100); emit(ball.x, ball.y, 'crumb', 5); }
  st.happy = clamp(st.happy + joy, 0, 100); T.chub = clamp(T.chub - 0.006, 0, 1); st.energy = clamp(st.energy - 0.5, 0, 100);
  emit(T.x, T.y - S, 'heart');
  if (T.playStarCool <= 0) { earn(1, T.x, T.y - S * 2); T.playStarCool = 4; }
  buzz(8);
}

function think(dt) {
  T.nudgeCool -= dt; T.petCool -= dt; T.starCool -= dt; T.playStarCool -= dt;
  if (T.sliding) { // whoosh down the slide
    const sl = T.sliding;
    sl.t = Math.min(1, sl.t + dt / 0.8);
    const k = sl.t * sl.t;
    T.x = lerp(sl.from.x, sl.to.x, k); T.y = lerp(sl.from.y, sl.to.y, k);
    T.a = Math.atan2(sl.to.y - sl.from.y, sl.to.x - sl.from.x); T.v = 140; T.headExt = 1;
    T.tailT += dt * 8;
    if (sl.t >= 1) {
      T.sliding = null; T.v = 30; T.chub = clamp(T.chub - 0.02, 0, 1); st.energy = clamp(st.energy - 1.5, 0, 100);
      st.happy = clamp(st.happy + 6 + T.traits.playful * 6, 0, 100); emit(T.x, T.y - S, 'heart', 2);
      if (inPond(T)) for (let i = 0; i < 12; i++) emit(T.x, T.y, 'drop');
    }
    return;
  }
  let want = 0, desiredA = T.a;
  T.lookAt = null;

  if (T.petT > 0) { // shy: pull head in, then pop out happy
    T.petT -= dt;
    T.headExt = lerp(T.headExt, T.petT > 0.5 ? 0 : 1, dt * 8);
  } else if (T.eat) {
    T.eat.t += dt;
    T.lookAt = T.eat.f;
    T.headExt = 0.9 + Math.sin(T.eat.t * 14) * 0.15;
    if (T.eat.t > lerp(1.5, 0.75, T.traits.appetite)) { // big appetites chomp faster
      if (T.eat.f.bites === 1) earn(1, T.eat.f.x, T.eat.f.y - 10);
      const f = T.eat.f; f.bites--; T.eat.t = 0;
      const want = craving(T);
      if (st.hunger > 90) T.chub = clamp(T.chub + 0.02, 0, 1); // eating when already full
      st.hunger = clamp(st.hunger + (f.type === 'berry' ? 9 : 12), 0, 100);
      st.happy = clamp(st.happy + (want === f.type ? 10 : want ? -1 : f.type === 'berry' ? 5 : 2), 0, 100); // bored of the same old food
      if (want === f.type && f.bites === 1) emit(T.x, T.y - S, 'heart', 2);
      emit(f.x, f.y, 'crumb', 6); buzz(5);
      grow((f.type === 'berry' ? 0.004 : 0.003) * (0.5 + st.happy / 100));
      if (f.bites <= 0) {
        T.diet.push(f.type); if (T.diet.length > 6) T.diet.shift();
        if (f.type === 'berry') T.chub = clamp(T.chub + 0.05, 0, 1);
        foods = foods.filter(x => x !== f); T.eat = null; T.gut.push(rand(15, 28)); if (f.slot !== undefined && plots[f.slot]) plots[f.slot].t0 = Date.now(); }
    }
    if (T.eat && !foods.includes(T.eat.f)) T.eat = null;
  } else if (T.drinkT > 0) {
    T.drinkT -= dt;
    const fromBowl = T.drinkFrom !== objOf('pond');
    T.lookAt = fromBowl ? bowl : null;
    if (fromBowl) T.a += angDiff(T.a, Math.atan2(bowl.y - T.y, bowl.x - T.x)) * Math.min(1, dt * 3); // face the water
    T.headExt = 1 + Math.sin(T.drinkT * 9) * 0.1;
    if (Math.random() < dt * 4) emit(mouth().x, mouth().y, 'ripple');
    st.thirst = clamp(st.thirst + dt * 16, 0, 100);
    if (fromBowl) {
      bowl.level = clamp(bowl.level - dt * 0.09 / BOWLS[up.bowl].cap, 0, 1);
      if (bowl.level <= 0) T.drinkT = 0;
    }
  } else if (T.rest) { // basking on the rock or hiding in the hut
    T.rest.t -= dt;
    const kind = T.rest.kind;
    T.headExt = lerp(T.headExt, { hide: 0.2, sleep: 0.15, bask: 0.55, roll: 0.8, mirror: 1 }[kind], dt * 3);
    st.happy = clamp(st.happy + dt * ({ hide: 0.5 + (1 - T.traits.friendly) * 0.6, sleep: 0.1, bask: 0.6, roll: 0.8, mirror: T.traits.friendly < 0.35 ? -0.1 : 0.5 }[kind]), 0, 100);
    if (kind === 'sleep' && Math.random() < dt * 0.6) emit(T.x + S * 0.5, T.y - S, 'zzz');
    if (kind === 'roll') { T.a += Math.sin(T.rest.t * 12) * dt * 4; if (Math.random() < dt * 6) emit(T.x, T.y, 'mud'); }
    if (kind === 'mirror') {
      T.a += angDiff(T.a, -Math.PI / 2) * Math.min(1, dt * 4);
      if (Math.random() < dt * 0.7) emit(T.x, T.y - S, T.traits.friendly < 0.35 ? 'grr' : 'heart');
    }
    if (T.rest.t <= 0 || T.userTarget || (foods.length && st.hunger < 60) || st.thirst < 35 || (kind === 'sleep' && darkness() < 0.3 && st.energy > 90)) {
      if (kind === 'sleep' && T.rest.t <= 0 && st.energy < 60 && !T.userTarget && st.thirst >= 35 && !(foods.length && st.hunger < 60)) T.rest.t = rand(20, 40); // still sleepy: keep dozing
      else T.rest = null;
    }
  } else {
    T.headExt = lerp(T.headExt, st.energy < MOOD.tired ? 0.7 : st.social < MOOD.lonely ? 0.8 : st.warm < MOOD.cold ? 0.6 : 1, dt * 4); // droopy when tired, lonely or cold
    const g = goalFor();
    if (g) {
      const from = g.by === 'mouth' ? mouth() : T;
      const d = dist(from, g.p);
      if (d < g.reach || (g.bodyReach && dist(T, g.p) < g.bodyReach)) { g.arrive(); if (g.keepGoing) want = 25; }
      else if (g.by === 'mouth' && !g.bodyReach && (dist(T, g.p) < S * 1.3 || (T.backFrom === g.p && dist(T, g.p) < S * 2.1))) {
        T.backFrom = g.p; desiredA = T.a; want = -16 * (0.6 + 0.4 * S / 34); // it's under the belly: back up until it's well in front
      } else {
        T.backFrom = null;
        desiredA = Math.atan2(g.p.y - T.y, g.p.x - T.x);
        const turn = Math.abs(angDiff(T.a, desiredA));
        want = (g.slow ? 32 : 48) * (0.55 + 0.45 * S / 34) * clamp(d / (S * 2), 0.35, 1) * (turn > 1.0 ? 0.15 : 1);
        if (g.by === 'mouth' && d < 60) T.lookAt = g.p;
      }
    } else {
      T.idleT -= dt;
      if (T.idleT <= 0) {
        if ((darkness() > 0.6 || st.energy < 35) && st.hunger > 35 && st.thirst > 35 && Math.random() < 0.85) { // bedtime, or a nap
          const hut = objOf('hut');
          if (hut && Math.random() < 0.6) T.outing = { route: [{ x: hut.x, y: hut.y + HUT.r + 30 }, { x: hut.x + rand(-15, 15), y: hut.y + rand(-10, 10) }], then: 'sleep' };
          else T.rest = { kind: 'sleep', t: rand(40, 120) };
        } else T.outing = pickOuting();
        T.idleT = rand(3, 8) * lerp(2.2, 0.5, T.traits.curious);
      }
    }
  }

  want *= lerp(0.7, 1.35, T.traits.speed);
  if (st.energy < 30) want *= lerp(0.55, 1, st.energy / 30);
  if (st.warm < MOOD.cold) want *= 0.6;
  if (T.chub > MOOD.chubby) want *= lerp(1, 0.7, (T.chub - MOOD.chubby) / (1 - MOOD.chubby));
  T.swim = inPond(T);
  if (T.swim && T.mud > 0) { T.mud = 0; for (let i = 0; i < 8; i++) emit(T.x, T.y, 'drop'); } // a dip rinses the mud off
  if (T.swim) { want *= 0.8; st.happy = clamp(st.happy + dt * (0.2 + T.traits.playful * 0.5), 0, 100); if (T.v > 5 && Math.random() < dt * 3) emit(toWorld(-0.9, 0).x, toWorld(-0.9, 0).y, 'ripple'); }
  if (st.health < SICK) want *= st.health < 8 ? 0.15 : 0.5;
  // steering
  const turnRate = (1.7 + (T.v < 10 ? 0.6 : 0)) * lerp(0.8, 1.25, T.traits.speed);
  if (want !== 0) T.a += clamp(angDiff(T.a, desiredA), -turnRate * dt, turnRate * dt);
  T.v = lerp(T.v, want, dt * (want > T.v ? 2.2 : 5));
  T.x += Math.cos(T.a) * T.v * dt; T.y += Math.sin(T.a) * T.v * dt;
  // keep out of the bowl and feeder, and inside the yard
  for (const [o, r] of solids()) {
    const d = dist(T, o), minD = r + S * 0.9;
    if (d < minD && d > 0.01) { T.x = o.x + (T.x - o.x) / d * minD; T.y = o.y + (T.y - o.y) / d * minD; }
  }
  T.x = clamp(T.x, 35, YW - 35); T.y = clamp(T.y, 25, YH - 15);

  // digestion -> poop
  for (let i = T.gut.length - 1; i >= 0; i--) {
    T.gut[i] -= dt;
    if (T.gut[i] <= 0) {
      T.gut.splice(i, 1);
      const p = toWorld(-1.5, rand(-0.2, 0.2));
      if (poops.length < 12) { const q = { x: p.x, y: p.y, s: rand(0.85, 1.15), born: 0 }; keepInYard(q); poops.push(q); }
    }
  }

  // blink + tail
  T.blinkT -= dt;
  const tired = st.energy < MOOD.tired;
  if (T.blinkT <= 0) { T.blink = tired ? 0.45 : 0.15; T.blinkT = tired ? rand(0.8, 2) : rand(2, 5); } // heavy eyelids
  T.blink = Math.max(0, T.blink - dt);
  T.yawn = Math.max(0, (T.yawn || 0) - dt);
  if (tired && !T.rest && !T.eat && Math.random() < dt * 0.1) T.yawn = 1.4;
  T.tailT += dt * (2 + T.v * 0.12);
}

function solids() {
  const f = objOf('feeder');
  return f ? [[bowl, bowl.r], [f, FEEDER_R]] : [[bowl, bowl.r]];
}

// ---------- procedural legs: foot planting with diagonal gait ----------
function updateFeet(dt) {
  const stepDur = clamp(0.32 - T.v * 0.003, 0.18, 0.32);
  const lead = 0.28;
  const fwd = { x: Math.cos(T.a) * T.v * lead, y: Math.sin(T.a) * T.v * lead };
  const wide = 1 + 0.25 * T.chub;
  const targets = LEGS.map(l => { const p = toWorld(l.rx, l.ry * wide); return { x: p.x + fwd.x, y: p.y + fwd.y }; });
  let anyStepping = false;
  T.feet.forEach((f, i) => {
    if (f.t < 1) {
      anyStepping = true;
      f.t = Math.min(1, f.t + dt / stepDur);
      // retarget mid-step so turning feels responsive
      f.tx = lerp(f.tx, targets[i].x, dt * 6); f.ty = lerp(f.ty, targets[i].y, dt * 6);
      const e = ease(f.t);
      f.x = lerp(f.fx, f.tx, e); f.y = lerp(f.fy, f.ty, e);
    }
  });
  if (anyStepping) return;
  const err = [0, 0];
  T.feet.forEach((f, i) => { err[LEGS[i].g] = Math.max(err[LEGS[i].g], dist(f, targets[i])); });
  const grp = err[0] >= err[1] ? 0 : 1;
  const moving = T.v > 3;
  const thresh = moving ? S * 0.3 : S * 0.12;
  if (err[grp] > thresh) {
    T.feet.forEach((f, i) => {
      if (LEGS[i].g !== grp || dist(f, targets[i]) < S * 0.05) return;
      f.fx = f.x; f.fy = f.y; f.tx = targets[i].x; f.ty = targets[i].y; f.t = 0;
    });
  }
}

// ---------- ball physics ----------
const BALL_TIME = 15; // seconds a ball sticks around after you last touched it
function updateBall(dt) {
  if (!ball) return;
  ball.idle = (ball.idle || 0) + (ball.held ? 0 : dt);
  if (ball.idle > BALL_TIME) { emit(ball.x, ball.y, 'sparkle', 6); ball = null; return; }
  if (ball.held) return;
  ball.x += ball.vx * dt; ball.y += ball.vy * dt;
  const f = Math.pow((TOYS[ball.toy] || TOYS.ball).drag, dt);
  ball.vx *= f; ball.vy *= f;
  ball.spin += Math.hypot(ball.vx, ball.vy) * dt / ball.r;
  const bounce = ball.toy === 'beach' ? 0.85 : 0.7;
  if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx) * bounce; }
  if (ball.x > YW - ball.r) { ball.x = YW - ball.r; ball.vx = -Math.abs(ball.vx) * bounce; }
  if (ball.y < ball.r) { ball.y = ball.r; ball.vy = Math.abs(ball.vy) * bounce; }
  if (ball.y > YH - ball.r) { ball.y = YH - ball.r; ball.vy = -Math.abs(ball.vy) * bounce; }
  // bump off the shells
  for (const t of turtles) {
    const d = dist(ball, t), m = t.S * 0.95 + ball.r;
    if (d < m && d > 0) {
      const nx = (ball.x - t.x) / d, ny = (ball.y - t.y) / d;
      ball.x = t.x + nx * m; ball.y = t.y + ny * m;
      const dot = ball.vx * nx + ball.vy * ny;
      if (dot < 0) { ball.vx -= 1.6 * dot * nx; ball.vy -= 1.6 * dot * ny; }
    }
  }
  for (const [o, r] of solids()) {
    const db = dist(ball, o), mb = r + ball.r;
    if (db < mb && db > 0) {
      const nx = (ball.x - o.x) / db, ny = (ball.y - o.y) / db;
      ball.x = o.x + nx * mb; ball.y = o.y + ny * mb;
      const dot = ball.vx * nx + ball.vy * ny;
      if (dot < 0) { ball.vx -= 1.7 * dot * nx; ball.vy -= 1.7 * dot * ny; }
    }
  }
}
const makeBall = (x, y) => ({ x, y, vx: 0, vy: 0, r: TOYS[up.toy].r, spin: 0, idle: 0, toy: up.toy });

// ---------- stats ----------
// ---------- hidden moods: no bars, you read them off the turtle (and the ⋯ menu) ----------
const MOOD = { lonely: 30, tired: 25, cold: 35, chubby: 0.45 };
const inHut = t => { const h = objOf('hut'); return !!h && dist(t, h) < HUT.r; };
const friendNear = (t, k) => turtles.some(o => o !== t && o.releasing === undefined && dist(o, t) < (o.S + t.S) * k);
function craving(t) { // ate the same thing 4 times running: now wants the other one
  const d = t.diet, last = d[d.length - 1];
  return d.length >= 4 && d.slice(-4).every(x => x === last) ? (last === 'berry' ? 'lettuce' : 'berry') : null;
}
function moods(t) {
  const s = t.st, m = [], c = craving(t);
  if (s.social < MOOD.lonely) m.push('🤗 Lonely');
  if (s.energy < MOOD.tired) m.push('💤 Sleepy');
  if (s.warm < MOOD.cold) m.push('🥶 Chilly');
  if (c) m.push(c === 'berry' ? '🍓 Wants berries' : '🥗 Wants greens');
  if (t.chub > MOOD.chubby) m.push(t.chub > 0.75 ? '🐷 Very chubby' : '🍩 A bit chubby');
  return m.length ? m.join(' · ') : '😊 Feeling good';
}
function wakeUp(t) { // nobody likes being woken up
  if (t.rest?.kind !== 'sleep') { t.rest = null; return false; }
  t.rest = null; t.st.happy = clamp(t.st.happy - 6, 0, 100);
  emit(t.x, t.y - t.S, 'grr'); say(`😾 ${t.name} was napping and woke up grumpy`); buzz([10, 30, 10]);
  return true;
}

function updateStats(dt) {
  const warm = nearLamp(T), asleep = T.rest?.kind === 'sleep', dk = darkness(), hutIn = inHut(T), cuddle = asleep && friendNear(T, 1.4);
  // loneliness: friendly turtles need company more; cured by petting, bumping into friends, sleeping in a pile
  st.social = clamp(st.social + dt * (cuddle ? 0.6 : T.rest?.kind === 'mirror' ? 0.4 : -0.05 * lerp(0.3, 1.6, T.traits.friendly)), 0, 100);
  // energy: drains while awake, back with sleep (best in the hut, worse under the lamp)
  st.energy = clamp(st.energy + dt * (asleep ? (hutIn ? 1 : 0.6) * (warm ? 0.5 : 1) : T.rest?.kind === 'bask' ? 0.1 : -0.03 * lerp(0.8, 1.25, T.traits.playful)), 0, 100);
  if (st.energy <= 2 && !asleep && !T.eat && T.drinkT <= 0 && !T.userTarget && !T.sliding) { T.rest = { kind: 'sleep', t: 30 }; T.outing = null; } // dozes off right where it is
  // warmth: nights are chilly away from the lamp, the hut or a sleeping buddy
  const cold = dk > 0.5 && !warm && !hutIn && !cuddle;
  st.warm = clamp(st.warm + dt * (warm ? 0.8 : hutIn || cuddle ? 0.3 : cold ? -(T.swim ? 0.12 : 0.05) * dk : T.rest?.kind === 'bask' ? 0.5 : 0.15), 0, 100);
  // weight: berries and overeating add (see think), exercise and time take it off
  T.chub = clamp(T.chub - dt * (0.00005 + (T.v > 20 ? 0.0003 : 0) + (T.swim ? 0.0015 : 0)), 0, 1);
  st.hunger = clamp(st.hunger - dt * 0.12 * lerp(0.75, 1.35, T.traits.appetite) * (warm ? 0.7 : 1) * (asleep ? 0.6 : 1), 0, 100);
  if (warm) st.happy = clamp(st.happy + dt * 0.15, 0, 100);
  if (T.mud > 0) { T.mud = Math.max(0, T.mud - dt / 900); if (T.mud < 0.75) st.happy = clamp(st.happy - dt * 0.04, 0, 100); } // dried mud itches
  st.thirst = clamp(st.thirst - dt * 0.15, 0, 100);
  let drain = (0.05 + poops.length * 0.04) * lerp(0.8, 1.25, T.traits.playful); // playful ones get bored faster
  if (st.hunger < 30) drain += 0.12;
  if (st.thirst < 30) drain += 0.12;
  if (st.social < MOOD.lonely) drain += 0.05;
  if (st.energy < MOOD.tired) drain += 0.03;
  if (st.warm < MOOD.cold) drain += 0.04;
  if (T.chub > 0.75) drain += 0.02;
  st.happy = clamp(st.happy - dt * drain, 0, 100);
  healthStep(T, dt, graceT > 0 ? GRACE : LIVE);
  if (st.health < 25 && !T.warned && T.dying === undefined) {
    T.warned = true; say(`⚠️ ${T.name} is very sick! Food & water, quick!`); buzz([60, 80, 60]);
  }
  if (st.health > 40) T.warned = false;
  if (st.health <= 0 && T.dying === undefined) { if (up.vet > 0) useVet(T, true); else die(T); }
  // healthy, happy turtles slowly grow on their own
  if (st.hunger > 50 && st.thirst > 50 && st.happy > 50 && st.health > 50 && poops.length < 3) grow(dt * 0.000012 * (warm ? 2 : 1));
  S = T.S = lerp(S, sizeFor(G()), Math.min(1, dt * 2)); // ease size changes
}
// Health change per second while you're watching. Neglect here can be fatal; while away it can't.
const LIVE = { hurt: 0.3, filth: 0.06, heal: 0.25 };
const GRACE = { hurt: 0, filth: 0, heal: 0.25 }; // first few minutes after opening: time to feed everyone
const GRACE_SECS = 180;
let graceT = GRACE_SECS;
function die(t) {
  t.dying = true; t.releasing = 2.5; t.v = 0; // reuses the release fade-out
  emit(t.x, t.y - t.S, 'sparkle', 10);
  say(`💔 ${t.name} didn't make it…`); buzz([100, 100, 200]);
  if (sel === t) sel = turtles.find(o => o.releasing === undefined) || t;
}

const nearLamp = t => { const l = objOf('lamp'); return !!l && dist(t, l) < LAMP_R * 0.8; };
function useVet(t, auto) {
  up.vet--; t.st.health = 100; t.st.hunger = Math.max(t.st.hunger, 40); t.st.thirst = Math.max(t.st.thirst, 40); t.warned = false;
  emit(t.x, t.y, 'sparkle', 12); emit(t.x, t.y - t.S, 'heart', 3); buzz([30, 50, 30]);
  say(auto ? `💊 A vet kit saved ${t.name}!` : `${t.name} feels much better 💊`, 3000);
  save();
}

function grow(amount) {
  const before = stageOf(T.growth);
  T.growth = clamp(T.growth + amount * GROW_RATE, 0, 1);
  const after = stageOf(T.growth);
  if (after !== before) {
    emit(T.x, T.y, 'sparkle', 14); emit(T.x, T.y - S, 'heart', 4);
    say(`${T.name} grew into ${aStage(after)}! 🐢`); buzz([30, 60, 30]);
    earn(10, T.x, T.y - S * 2);
  }
}
const cleanness = () => clamp(100 - poops.length * 20, 0, 100);

const bars = ['health', 'hunger', 'thirst', 'clean', 'happy'].map(k => [k, document.getElementById('b-' + k)]);
const stageEl = document.getElementById('stage');
const starsEl = document.getElementById('stars');
function drawHud() {
  starsEl.textContent = `⭐ ${stars}`;
  const live = turtles.filter(t => t.releasing === undefined);
  if (isPicked()) stageEl.textContent = `${st.health < SICK ? '🤒' : '🐢'} ${T.name} · ` + (T.growth >= 1 ? 'Adult' : `${stageOf(T.growth)} · ${Math.floor(T.growth * 100)}%`) + (st.health < SICK ? ' · sick' : '') + '  ⋯';
  else stageEl.textContent = `🐢 ${live.length} turtles` + (live.some(t => t.st.health < SICK) ? ' · 🤒 someone is sick' : '');
  for (const [k, el] of bars) { // nobody picked: the bars show the yard average
    const v = k === 'clean' ? cleanness() : isPicked() ? st[k] : live.reduce((a, t) => a + t.st[k], 0) / Math.max(1, live.length);
    el.style.width = v + '%';
    el.style.background = v < 25 ? '#ef6a5a' : v < 50 ? '#f2c14e' : '#8fd16a';
  }
}

// ---------- drawing ----------
// ---------- age-based appearance ----------
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function hueRot([r, g, b], deg) {
  if (!deg) return [r, g, b];
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [
    (0.213 + c * 0.787 - s * 0.213) * r + (0.715 - c * 0.715 - s * 0.715) * g + (0.072 - c * 0.072 + s * 0.928) * b,
    (0.213 - c * 0.213 + s * 0.143) * r + (0.715 + c * 0.285 + s * 0.140) * g + (0.072 - c * 0.072 - s * 0.283) * b,
    (0.213 - c * 0.213 - s * 0.787) * r + (0.715 - c * 0.715 + s * 0.715) * g + (0.072 + c * 0.928 + s * 0.072) * b,
  ];
}
// blend two colors by t, shift hue, and wash toward grey (for sick turtles)
const mix = (a, b, t, hue = 0, grey = 0, light = 0) => {
  const A = hexRgb(a), B = hexRgb(b);
  const c = hueRot(A.map((v, i) => lerp(v, B[i], t) * (1 + light)), hue);
  const avg = (c[0] + c[1] + c[2]) / 3 + 15 * grey;
  return `rgb(${c.map(v => clamp(Math.round(lerp(v, avg, grey)), 0, 255)).join(',')})`;
};
const G = () => T.growth;

// Hatchlings: bright, round, big head and eyes, bit of eggshell. Juveniles: bold yellow rays on the shell.
// Adults: dark, longer shell, growth rings, head stripes, long claws, moss and scratches.
function look(g) {
  const { shell: h, skin: hs, light: lt } = T.tint; // this turtle's own slight color variation
  const sick = clamp((SICK - T.st.health) / SICK, 0, 1) * 0.65;
  return {
    skin: mix('#a8d062', '#62793a', g, hs, sick, lt), skinDark: mix('#5f8a32', '#37461f', g, hs, sick, lt), skinLight: mix('#d2ee90', '#8aa156', g, hs, sick, lt),
    shellHi: mix('#dcc27c', '#7a5c2e', g, h, sick * 0.4, lt), shellMid: mix('#bb9850', '#56401d', g, h, sick * 0.4, lt), shellLo: mix('#8f7038', '#33240f', g, h, sick * 0.4, lt),
    scute: mix('#c8a75e', '#634a22', g, h, sick * 0.4, lt), spine: mix('#d6b66c', '#735628', g, h, sick * 0.4, lt), rim: mix('#6e5428', '#24190a', g, h, 0, lt),
    head: lerp(1.55, 0.92, g), eye: lerp(1.75, 0.85, g), aspect: lerp(0.97, 0.78, g), claw: lerp(0.5, 1.5, g),
    tail: lerp(1.12, 1.4, g), neck: lerp(1.2, 1, g),
    rays: clamp((g - 0.1) * 4, 0, 1) * lerp(1.1, 0.4, g), rings: Math.floor(g * 4.6),
    stripes: clamp((g - 0.3) * 2.5, 0, 1), egg: clamp(1 - g / 0.15, 0, 1), moss: clamp((g - 0.78) * 5, 0, 1),
  };
}

function hex(c, x, y, r, rot = 0) {
  c.beginPath();
  for (let i = 0; i < 6; i++) { const a = rot + i * Math.PI / 3; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  c.closePath();
}

function drawTurtle(time) {
  const c = ctx, g = G(), L = look(g), wide = 1 + 0.25 * T.chub;
  const shiver = st.warm < MOOD.cold && !T.rest ? Math.sin(time * 55) * Math.max(0.6, S * 0.03) : 0; // cold: little shivers
  c.save(); c.translate(shiver, 0);
  if (turtles.length > 1 && T === sel && picked) { // selection ring
    c.strokeStyle = '#ffffffb0'; c.lineWidth = 2.5; c.setLineDash([6, 5]); c.lineDashOffset = -time * 12;
    c.beginPath(); c.ellipse(T.x, T.y, S * 1.55, S * 1.45, T.a, 0, 7); c.stroke(); c.setLineDash([]);
  }
  // shadow
  c.fillStyle = '#00000030';
  c.beginPath(); c.ellipse(T.x + S * 0.15, T.y + S * 0.2, S * 1.15, S * 1.0 * wide, T.a, 0, 7); c.fill();

  const { skin, skinDark, skinLight } = L;
  // legs
  T.feet.forEach((f, i) => {
    const Lg = LEGS[i], hip = toWorld(Lg.hx, Lg.hy * wide);
    const lift = f.t < 1 ? Math.sin(Math.PI * f.t) : 0;
    const w = S * 0.36 * (1 + lift * 0.15);
    c.lineCap = 'round';
    c.strokeStyle = skinDark; c.lineWidth = w + 3;
    c.beginPath(); c.moveTo(hip.x, hip.y); c.lineTo(f.x, f.y); c.stroke();
    c.strokeStyle = lift > 0 ? skinLight : skin; c.lineWidth = w;
    c.beginPath(); c.moveTo(hip.x, hip.y); c.lineTo(f.x, f.y); c.stroke();
    const fr = S * 0.22 * (1 + lift * 0.2);
    c.fillStyle = skinDark; c.beginPath(); c.arc(f.x, f.y, fr + 1.5, 0, 7); c.fill();
    c.fillStyle = lift > 0 ? skinLight : skin; c.beginPath(); c.arc(f.x, f.y, fr, 0, 7); c.fill();
    // adult scale spots on the feet
    if (g > 0.5) { c.fillStyle = skinDark; c.globalAlpha = (g - 0.5) * 1.4; c.beginPath(); c.arc(f.x - fr * 0.3, f.y - fr * 0.2, fr * 0.22, 0, 7); c.arc(f.x + fr * 0.3, f.y + fr * 0.25, fr * 0.18, 0, 7); c.fill(); c.globalAlpha = 1; }
    const out = Math.atan2(f.y - hip.y, f.x - hip.x);
    c.fillStyle = '#ece4cc';
    const cr = Math.max(1, S * 0.06 * L.claw);
    for (let k = -1; k <= 1; k++) {
      const a = out + k * 0.5;
      c.beginPath(); c.ellipse(f.x + Math.cos(a) * (fr + cr * 0.6), f.y + Math.sin(a) * (fr + cr * 0.6), cr * 1.3, cr * 0.7, a, 0, 7); c.fill();
    }
  });

  // tail
  const sway = Math.sin(T.tailT) * 0.25;
  const tb = toWorld(-0.85, 0), tt = toWorld(-L.tail, sway), tl = toWorld(-0.85, -0.14), tr = toWorld(-0.85, 0.14);
  c.fillStyle = skin; c.strokeStyle = skinDark; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(tl.x, tl.y); c.quadraticCurveTo(tb.x, tb.y, tt.x, tt.y); c.lineTo(tr.x, tr.y); c.closePath(); c.fill(); c.stroke();

  // neck + head (head lags behind the body like a spring)
  const base = toWorld(0.75, 0);
  const reach = (0.5 + 0.5 * T.headExt) * S * lerp(1.15, 1, g);
  let tgt = toWorld(0.75 + reach / S, 0);
  if (T.lookAt) {
    const a = Math.atan2(T.lookAt.y - base.y, T.lookAt.x - base.x);
    const rel = clamp(angDiff(T.a, a), -0.9, 0.9);
    tgt = { x: base.x + Math.cos(T.a + rel) * reach, y: base.y + Math.sin(T.a + rel) * reach };
  } else if (T.v < 5 && !T.eat && T.petT <= 0) {
    const rel = Math.sin(time * 0.7) * 0.5 * Math.sin(time * 0.23);
    tgt = { x: base.x + Math.cos(T.a + rel) * reach, y: base.y + Math.sin(T.a + rel) * reach };
  }
  T.head.x = lerp(T.head.x, tgt.x, 0.2); T.head.y = lerp(T.head.y, tgt.y, 0.2);
  const hx = T.head.x, hy = T.head.y;
  T.headA = Math.atan2(hy - base.y, hx - base.x);
  const nw = S * 0.42 * L.neck;
  c.lineCap = 'round';
  c.strokeStyle = skinDark; c.lineWidth = nw + 3;
  c.beginPath(); c.moveTo(base.x, base.y); c.lineTo(hx, hy); c.stroke();
  c.strokeStyle = skin; c.lineWidth = nw;
  c.beginPath(); c.moveTo(base.x, base.y); c.lineTo(hx, hy); c.stroke();
  if (L.stripes > 0) { // yellow neck stripes on older turtles
    const nx = -Math.sin(T.headA) * nw * 0.22, ny = Math.cos(T.headA) * nw * 0.22;
    c.strokeStyle = `rgba(236,206,92,${L.stripes * 0.85})`; c.lineWidth = Math.max(1, S * 0.04);
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(base.x + nx * s, base.y + ny * s); c.lineTo(hx + nx * s, hy + ny * s); c.stroke(); }
  }
  const hs = L.head;
  c.save(); c.translate(hx, hy); c.rotate(T.headA);
  c.fillStyle = skin; c.strokeStyle = skinDark; c.lineWidth = 1.5;
  c.beginPath(); c.ellipse(S * 0.08 * hs, 0, S * 0.36 * hs, S * 0.28 * hs, 0, 0, 7); c.fill(); c.stroke();
  c.fillStyle = skinLight; c.beginPath(); c.ellipse(S * 0.05 * hs, -S * 0.06 * hs, S * 0.18 * hs, S * 0.1 * hs, 0, 0, 7); c.fill();
  if (L.stripes > 0) {
    c.strokeStyle = `rgba(236,206,92,${L.stripes * 0.9})`; c.lineWidth = Math.max(1, S * 0.045); c.lineCap = 'round';
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(S * 0.05 * hs, s * S * 0.13 * hs); c.quadraticCurveTo(-S * 0.1 * hs, s * S * 0.2 * hs, -S * 0.26 * hs, s * S * 0.12 * hs); c.stroke(); }
    c.beginPath(); c.moveTo(S * 0.3 * hs, 0); c.lineTo(-S * 0.2 * hs, 0); c.stroke();
  }
  const open = T.eat ? Math.max(0, Math.sin(T.eat.t * 14)) : T.yawn > 0 ? Math.sin(Math.PI * T.yawn / 1.4) * 1.6 : 0;
  if (open > 0.1) { c.fillStyle = '#5a2a2a'; c.beginPath(); c.ellipse(S * 0.4 * hs, 0, S * 0.08 * hs * open + 1, S * 0.12 * hs, 0, 0, 7); c.fill(); }
  c.fillStyle = skinDark; c.beginPath(); c.arc(S * 0.4 * hs, -S * 0.05 * hs, 1.2, 0, 7); c.arc(S * 0.4 * hs, S * 0.05 * hs, 1.2, 0, 7); c.fill();
  const happyEyes = T.petT > 0 && T.petT < 0.5;
  const er = S * 0.123 * L.eye;
  for (const sgn of [-1, 1]) {
    const ex = S * 0.14 * hs, ey = sgn * S * 0.21 * hs;
    if (T.blink > 0 || happyEyes || T.petT > 0.5 || (T.rest && T.rest.kind !== 'mirror' && T.rest.kind !== 'roll')) {
      c.strokeStyle = '#1b1b1b'; c.lineWidth = Math.max(1.2, er * 0.45);
      c.beginPath(); c.arc(ex, ey, er * 0.85, happyEyes ? Math.PI : 0, happyEyes ? 0 : Math.PI, !happyEyes); c.stroke();
    } else {
      if (g > 0.6) { c.fillStyle = '#c9a23a'; c.beginPath(); c.arc(ex, ey, er * 1.15, 0, 7); c.fill(); } // golden iris ring on adults
      c.fillStyle = '#1b1b1b'; c.beginPath(); c.arc(ex, ey, er, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + er * 0.3, ey - er * 0.3, er * 0.36, 0, 7); c.fill();
      if (g < 0.3) { c.beginPath(); c.arc(ex - er * 0.35, ey + er * 0.3, er * 0.16, 0, 7); c.fill(); } // extra baby sparkle
    }
  }
  c.restore();

  // shell
  const ar = L.aspect, k = ar / 0.84;
  c.save(); c.translate(T.x, T.y); c.rotate(T.a); c.scale(1, wide);
  const sg = c.createRadialGradient(-S * 0.2, -S * 0.25, S * 0.1, 0, 0, S * 1.1);
  sg.addColorStop(0, L.shellHi); sg.addColorStop(0.7, L.shellMid); sg.addColorStop(1, L.shellLo);
  c.fillStyle = L.rim; c.beginPath(); c.ellipse(0, 0, S + 2.5, S * ar + 2.5, 0, 0, 7); c.fill();
  c.fillStyle = sg; c.beginPath(); c.ellipse(0, 0, S, S * ar, 0, 0, 7); c.fill();
  c.strokeStyle = L.rim; c.lineWidth = Math.max(1, S * 0.04);
  const marg = Math.round(lerp(16, 24, g));
  for (let i = 0; i < marg; i++) {
    const a = i / marg * Math.PI * 2;
    c.beginPath(); c.moveTo(Math.cos(a) * S * 0.82, Math.sin(a) * S * ar * 0.81); c.lineTo(Math.cos(a) * S, Math.sin(a) * S * ar); c.stroke();
  }
  c.beginPath(); c.ellipse(0, 0, S * 0.82, S * ar * 0.81, 0, 0, 7); c.stroke();
  c.lineWidth = Math.max(1, S * 0.055);
  const scutes = [];
  for (const y of [-1, 1]) for (const x of [-0.42, 0, 0.42]) scutes.push([x * S, y * S * 0.4 * k, S * 0.24, L.scute]);
  for (const x of [-0.5, 0, 0.5]) scutes.push([x * S, 0, S * 0.22, L.spine]);
  for (const [x, y, r, col] of scutes) { hex(c, x, y, r, Math.PI / 6); c.fillStyle = col; c.fill(); c.stroke(); }
  // juvenile rays: bright lines radiating from each scute's center
  if (L.rays > 0.02) {
    c.strokeStyle = `rgba(245,214,96,${Math.min(1, L.rays)})`; c.lineWidth = Math.max(1, S * 0.035); c.lineCap = 'round';
    for (const [x, y, r] of scutes) {
      c.fillStyle = `rgba(245,214,96,${Math.min(1, L.rays)})`; c.beginPath(); c.arc(x, y, r * 0.18, 0, 7); c.fill();
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; c.beginPath(); c.moveTo(x + Math.cos(a) * r * 0.25, y + Math.sin(a) * r * 0.25); c.lineTo(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75); c.stroke(); }
    }
  }
  // growth rings: one more per stage
  if (L.rings) {
    c.strokeStyle = 'rgba(30,20,8,0.35)'; c.lineWidth = Math.max(0.8, S * 0.022);
    for (const [x, y, r] of scutes) for (let i = 1; i <= L.rings; i++) { hex(c, x, y, r * (1 - i * 0.17), Math.PI / 6); c.stroke(); }
  }
  // adult wear: moss and a scratch
  if (L.moss > 0) {
    c.fillStyle = `rgba(92,128,52,${L.moss * 0.55})`;
    for (const [x, y, r] of [[-0.55, 0.45, 0.2], [-0.7, 0.2, 0.13], [0.35, -0.55, 0.14], [-0.4, -0.6, 0.1]]) { c.beginPath(); c.ellipse(x * S, y * S * k, r * S, r * S * 0.75, x, 0, 7); c.fill(); }
    c.strokeStyle = `rgba(230,215,180,${L.moss * 0.5})`; c.lineWidth = Math.max(1, S * 0.025);
    c.beginPath(); c.moveTo(S * 0.15, S * 0.25 * k); c.lineTo(S * 0.5, S * 0.42 * k); c.moveTo(S * 0.2, S * 0.36 * k); c.lineTo(S * 0.42, S * 0.47 * k); c.stroke();
  }
  // dome shine (glossier on babies)
  c.fillStyle = `rgba(255,255,255,${lerp(0.3, 0.12, g)})`; c.beginPath(); c.ellipse(-S * 0.15, -S * 0.3 * k, S * 0.45, S * 0.18, -0.2, 0, 7); c.fill();
  if (T.mud > 0) { // mud splotches
    c.save(); c.globalAlpha *= Math.min(1, T.mud * 1.3) * 0.85; c.fillStyle = '#5b3d22';
    for (const [x, y, r] of [[-0.4, 0.3, 0.32], [0.3, -0.35, 0.26], [0.1, 0.45, 0.2], [-0.55, -0.25, 0.18], [0.55, 0.15, 0.2]]) { c.beginPath(); c.ellipse(x * S, y * S * k, r * S, r * S * 0.75, x * 3, 0, 7); c.fill(); }
    c.restore();
  }
  // hatchling: a bit of eggshell still stuck on its back
  if (L.egg > 0) {
    c.globalAlpha = L.egg;
    c.fillStyle = '#f7f1e2'; c.strokeStyle = '#cfc4aa'; c.lineWidth = 1;
    c.beginPath();
    const pts = [[-0.95, 0.15], [-0.85, -0.35], [-0.7, -0.1], [-0.6, -0.42], [-0.45, -0.12], [-0.35, -0.3], [-0.3, 0.05], [-0.5, 0.45], [-0.8, 0.5]];
    pts.forEach(([x, y], i) => i ? c.lineTo(x * S, y * S) : c.moveTo(x * S, y * S));
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#d9cdb0'; c.beginPath(); c.arc(-0.65 * S, 0.2 * S, 1, 0, 7); c.arc(-0.5 * S, 0.05 * S, 0.8, 0, 7); c.fill();
    c.globalAlpha = 1;
  }
  c.restore();

  c.restore(); // shiver
  // name tag when there's more than one turtle
  if (turtles.length > 1 && T === sel && picked) {
    const ty = T.y + S * 1.45 + 10, lab = textSprite(T.name, 'bold 12px system-ui', '#2c4020'), tw = lab.w + 12;
    c.fillStyle = '#fffe'; c.beginPath(); c.roundRect(T.x - tw / 2, ty - 9, tw, 18, 9); c.fill();
    drawText(c, lab, T.x, ty + 0.5);
  }
  // need bubble
  const crave = st.hunger < 85 && craving(T);
  const need = st.health < SICK ? '🤒' : st.hunger < 30 ? '🥬' : st.thirst < 30 ? '💧' : poops.length >= 3 ? '🧹' : st.warm < MOOD.cold ? '🥶' : st.energy < MOOD.tired ? '💤'
    : st.social < MOOD.lonely ? '🤗' : crave ? (crave === 'berry' ? '🍓' : '🥗') : st.happy < 25 ? '🎾' : T.mud > 0 && T.mud < 0.75 ? '🛁' : null;
  if (need && !T.eat && T.drinkT <= 0 && T.rest?.kind !== 'sleep') {
    const bx = T.x + S * 0.9 + 6, by = T.y - S * 1.5 - 8 + Math.sin(time * 3) * 3;
    c.fillStyle = '#fffe'; c.beginPath(); c.arc(bx, by, 17, 0, 7); c.fill();
    c.beginPath(); c.arc(bx - 12, by + 16, 4, 0, 7); c.fill();
    c.beginPath(); c.arc(bx - 18, by + 23, 2.5, 0, 7); c.fill();
    drawEmoji(c, need, bx, by + 1, 18);
  }
}

function drawBowl(time) {
  const c = ctx, { x, y, r } = bowl;
  c.fillStyle = '#0003'; c.beginPath(); c.arc(x + 4, y + 6, r + 4, 0, 7); c.fill();
  c.fillStyle = '#5f7f94'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  c.fillStyle = '#86a6ba'; c.beginPath(); c.arc(x, y, r - 4, 0, 7); c.fill();
  c.fillStyle = '#c8d4da'; c.beginPath(); c.arc(x, y, r - 8, 0, 7); c.fill();
  if (bowl.level > 0.01) {
    const wr = (r - 9) * Math.sqrt(bowl.level);
    c.fillStyle = '#4aa3d8cc'; c.beginPath(); c.arc(x, y, wr, 0, 7); c.fill();
    c.strokeStyle = '#ffffff66'; c.lineWidth = 2;
    c.beginPath(); c.arc(x, y, wr * (0.5 + 0.2 * Math.sin(time * 2)), -2.4, -1.2); c.stroke();
  }
  if (BOWLS[up.bowl].refill) { // fountain spout in the middle
    c.fillStyle = '#9fb3bf'; c.beginPath(); c.arc(x, y, 9, 0, 7); c.fill();
    c.fillStyle = '#d6e2e8'; c.beginPath(); c.arc(x - 2, y - 2, 4, 0, 7); c.fill();
    c.strokeStyle = '#bfe4fa'; c.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + time, k = (time * 1.5 + i / 6) % 1;
      c.globalAlpha = 1 - k; c.beginPath(); c.arc(x + Math.cos(a) * (8 + k * 20), y + Math.sin(a) * (8 + k * 20), 1.8, 0, 7); c.stroke();
    }
    c.globalAlpha = 1;
  }
  if (bowl.fill > 0) { // pouring stream
    c.strokeStyle = '#7cc4f0'; c.lineWidth = 6 * bowl.fill; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x + 2, y - r - 40); c.lineTo(x, y); c.stroke();
  }
}

function drawFoodItem(f) {
  const c = ctx, s = 0.5 + 0.5 * f.bites / f.max;
  c.save(); c.translate(f.x, f.y); c.rotate(f.rot); c.scale(s, s);
  c.fillStyle = '#0002'; c.beginPath(); c.ellipse(3, 4, 16, 13, 0, 0, 7); c.fill();
  if (f.type === 'lettuce') {
    c.fillStyle = '#6cc04a'; c.strokeStyle = '#3f8a2a'; c.lineWidth = 2;
    c.beginPath();
    for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI * 2, rr = 15 + (i % 2 ? 3 : 0); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.85); }
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#9be070'; c.beginPath(); c.ellipse(-3, -2, 8, 6, 0.4, 0, 7); c.fill();
    c.strokeStyle = '#d8f5b8'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(-12, 6); c.lineTo(12, -6); for (const t of [-6, 0, 6]) { c.moveTo(t, -t * 0.5); c.lineTo(t + 4, -t * 0.5 + 7); } c.stroke();
  } else {
    c.fillStyle = '#e0343c'; c.strokeStyle = '#9a1c22'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, 14); c.bezierCurveTo(-16, 4, -12, -12, 0, -9); c.bezierCurveTo(12, -12, 16, 4, 0, 14); c.fill(); c.stroke();
    c.fillStyle = '#ffe680';
    for (const [sx, sy] of [[-5, -3], [4, -4], [0, 2], [-4, 6], [5, 5], [0, -6]]) { c.beginPath(); c.ellipse(sx, sy, 1, 1.5, 0, 0, 7); c.fill(); }
    c.fillStyle = '#3e9a3a';
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.5; c.beginPath(); c.ellipse(Math.cos(a) * 4, -10 + Math.sin(a) * 2, 5, 2, a, 0, 7); c.fill(); }
  }
  c.restore();
}

function drawPoop(p, time) {
  const c = ctx, s = p.s * Math.min(1, p.born * 4);
  c.save(); c.translate(p.x, p.y); c.scale(s, s);
  c.fillStyle = '#0002'; c.beginPath(); c.ellipse(2, 3, 10, 7, 0, 0, 7); c.fill();
  c.fillStyle = '#6b4a2b'; c.strokeStyle = '#47301a'; c.lineWidth = 1.5;
  for (const [x, y, r] of [[0, 2, 8], [0, -3, 6], [0, -7, 3.5]]) { c.beginPath(); c.ellipse(x, y, r, r * 0.8, 0, 0, 7); c.fill(); c.stroke(); }
  c.fillStyle = '#ffffff30'; c.beginPath(); c.ellipse(-2, -4, 2, 1.2, 0, 0, 7); c.fill();
  c.restore();
  // stink flies
  c.fillStyle = '#222';
  for (let i = 0; i < 2; i++) {
    const a = time * (3 + i) + i * 3 + p.x;
    c.beginPath(); c.arc(p.x + Math.cos(a) * 14, p.y - 8 + Math.sin(a * 1.3) * 7, 1.5, 0, 7); c.fill();
  }
}

function drawBall() {
  if (!ball) return;
  const c = ctx, r = ball.r, toy = ball.toy || 'ball';
  c.globalAlpha = clamp((BALL_TIME - (ball.idle || 0)) / 2, 0, 1);
  c.fillStyle = '#0003'; c.beginPath(); c.ellipse(ball.x + 3, ball.y + 5, r, r * 0.8, 0, 0, 7); c.fill();
  c.save(); c.translate(ball.x, ball.y);
  c.beginPath(); c.arc(0, 0, r, 0, 7); c.clip();
  const dir = Math.atan2(ball.vy, ball.vx) + Math.PI / 2;
  if (toy === 'ball') {
    c.fillStyle = '#f4f0e6'; c.fillRect(-r, -r, r * 2, r * 2);
    c.rotate(dir);
    const off = ((ball.spin * r) % (r * 4)) - r * 2;
    c.fillStyle = '#e8483a';
    for (const o of [off - r * 4, off, off + r * 4]) c.fillRect(-r, o - r * 0.45, r * 2, r * 0.9);
  } else if (toy === 'bell') {
    c.fillStyle = '#e9b93a'; c.fillRect(-r, -r, r * 2, r * 2);
    c.rotate(ball.spin);
    c.fillStyle = '#9c7414'; c.fillRect(-r, -1.5, r * 2, 3); c.beginPath(); c.arc(0, r * 0.45, 2.5, 0, 7); c.fill();
  } else if (toy === 'treat') {
    c.fillStyle = '#e8873a'; c.fillRect(-r, -r, r * 2, r * 2);
    c.rotate(ball.spin);
    c.fillStyle = '#7a3e12';
    for (const [hx, hy] of [[0, -0.5], [0.45, 0.25], [-0.45, 0.25]]) { c.beginPath(); c.arc(hx * r, hy * r, r * 0.2, 0, 7); c.fill(); }
  } else { // beach ball: colored wedges spinning
    c.rotate(ball.spin * 0.6);
    const cols = ['#e84a4a', '#f4f0e6', '#3a8ee8', '#f4f0e6', '#f2c73a', '#f4f0e6'];
    cols.forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r, i * Math.PI / 3, (i + 1) * Math.PI / 3); c.fill(); });
    c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, r * 0.18, 0, 7); c.fill();
  }
  c.restore();
  c.strokeStyle = '#0005'; c.lineWidth = 1.5; c.beginPath(); c.arc(ball.x, ball.y, r, 0, 7); c.stroke();
  c.fillStyle = '#ffffff70'; c.beginPath(); c.arc(ball.x - r * 0.35, ball.y - r * 0.35, r * 0.3, 0, 7); c.fill();
  c.globalAlpha = 1;
}

// ---------- clean-up crabs ----------
function syncCrabs() {
  while (crabs.length < up.crab) crabs.push({ crab: true, x: rand(40, YW - 40), y: rand(40, YH - 40), a: 0, tgt: null, scoop: 0, legT: 0, idle: 0, moving: false });
  crabs.length = Math.min(crabs.length, up.crab);
}
function updateCrabs(dt) {
  for (const c of crabs) {
    c.legT += dt; c.moving = false;
    if (c.scoop > 0) {
      c.scoop -= dt;
      if (c.scoop <= 0) { if (poops.includes(c.tgt)) { poops = poops.filter(q => q !== c.tgt); emit(c.tgt.x, c.tgt.y, 'sparkle', 5); } c.tgt = null; }
      continue;
    }
    if (c.tgt && !c.tgt.wander && !poops.includes(c.tgt)) c.tgt = null;
    const taken = crabs.filter(o => o !== c).map(o => o.tgt);
    const free = poops.filter(q => !taken.includes(q));
    if ((!c.tgt || c.tgt.wander) && free.length) c.tgt = free.reduce((b, q) => (dist(q, c) < dist(b, c) ? q : b));
    if (!c.tgt) {
      c.idle -= dt;
      if (c.idle <= 0) { c.tgt = { wander: true, x: clamp(c.x + rand(-150, 150), 30, YW - 30), y: clamp(c.y + rand(-150, 150), 30, YH - 30) }; c.idle = rand(3, 7); }
      continue;
    }
    if (dist(c, c.tgt) < 6) { if (c.tgt.wander) c.tgt = null; else c.scoop = 1.2; continue; }
    const dir = Math.atan2(c.tgt.y - c.y, c.tgt.x - c.x), sp = c.tgt.wander ? 22 : 45;
    c.x += Math.cos(dir) * sp * dt; c.y += Math.sin(dir) * sp * dt;
    c.a += angDiff(c.a, dir + Math.PI / 2) * Math.min(1, dt * 5); // crabs walk sideways
    c.moving = true;
  }
}
function drawCrab(c) {
  const g = ctx;
  g.save(); g.translate(c.x, c.y); g.rotate(c.a);
  g.fillStyle = '#0003'; g.beginPath(); g.ellipse(2, 3, 13, 10, 0, 0, 7); g.fill();
  g.strokeStyle = '#b8381f'; g.lineWidth = 2; g.lineCap = 'round';
  for (const sy of [-1, 1]) for (let i = 0; i < 3; i++) { // legs
    const w = c.moving || c.scoop > 0 ? Math.sin(c.legT * 22 + i * 2 + (sy > 0 ? 1 : 0)) * 3 : 0;
    const x = -6 + i * 5;
    g.beginPath(); g.moveTo(x, sy * 6); g.lineTo(x - 2 + w, sy * 13); g.stroke();
  }
  const pinch = c.scoop > 0 ? Math.sin(c.legT * 25) * 2 : 0;
  g.fillStyle = '#d9472b';
  for (const sy of [-1, 1]) { g.beginPath(); g.moveTo(8, sy * 5); g.lineTo(14, sy * (9 + pinch)); g.stroke(); g.beginPath(); g.arc(15, sy * (10 + pinch), 4, 0, 7); g.fill(); }
  g.fillStyle = '#e2553a'; g.beginPath(); g.ellipse(0, 0, 10, 8, 0, 0, 7); g.fill();
  g.fillStyle = '#f08a6a'; g.beginPath(); g.ellipse(-2, -2, 5, 3.5, 0, 0, 7); g.fill();
  g.fillStyle = '#111'; for (const sy of [-1, 1]) { g.beginPath(); g.arc(9, sy * 3, 1.8, 0, 7); g.fill(); }
  g.restore();
}

// ---------- veggie garden ----------
const gardenCols = () => (up.garden > 1 ? 3 : 2);
function slotPos(i) {
  const g = objOf('garden'), cols = gardenCols();
  return { x: g.x + ((i % cols) - (cols - 1) / 2) * SLOT, y: g.y + (Math.floor(i / cols) - 0.5) * SLOT };
}
const slotType = i => (up.garden > 1 && i % 3 === 1 ? 'berry' : 'lettuce');
function ensurePlots() {
  if (!up.garden) return;
  const n = gardenCols() * 2;
  while (plots.length < n) plots.push({ t0: Date.now() });
}
// ripe plants become food sitting in their slot; returns how many ripened
function gardenTick(now) {
  if (!up.garden || !objOf('garden')) return 0;
  let grown = 0;
  plots.forEach((pl, i) => {
    const type = slotType(i);
    if (now - pl.t0 < GROW_MS[type] || foods.some(f => f.slot === i)) return;
    const bites = type === 'berry' ? 2 : 3, sp = slotPos(i);
    foods.push({ x: sp.x, y: sp.y, type, bites, max: bites, rot: rand(-0.4, 0.4), slot: i });
    grown++;
  });
  return grown;
}
function drawGarden(o, now) {
  const c = ctx, cols = gardenCols(), w = cols * SLOT + 18, h = 2 * SLOT + 18;
  c.fillStyle = '#0003'; c.beginPath(); c.roundRect(o.x - w / 2 + 4, o.y - h / 2 + 6, w, h, 8); c.fill();
  c.fillStyle = '#8a5f34'; c.beginPath(); c.roundRect(o.x - w / 2, o.y - h / 2, w, h, 8); c.fill();
  c.fillStyle = '#5a3d22'; c.beginPath(); c.roundRect(o.x - w / 2 + 6, o.y - h / 2 + 6, w - 12, h - 12, 5); c.fill();
  c.strokeStyle = '#4a311a'; c.lineWidth = 1.5;
  for (let r = 0; r < 6; r++) { const y = o.y - h / 2 + 12 + r * (h - 24) / 5; c.beginPath(); c.moveTo(o.x - w / 2 + 10, y); c.lineTo(o.x + w / 2 - 10, y); c.stroke(); }
  plots.forEach((pl, i) => {
    if (foods.some(f => f.slot === i)) return; // ripe: the food itself is drawn
    const sp = slotPos(i), k = clamp((now - pl.t0) / GROW_MS[slotType(i)], 0, 1), sc = 0.25 + k * 0.6;
    c.fillStyle = '#6fbf4a';
    for (let l = 0; l < 4; l++) { const a = l * Math.PI / 2 + 0.6; c.beginPath(); c.ellipse(sp.x + Math.cos(a) * 6 * sc, sp.y + Math.sin(a) * 6 * sc, 8 * sc, 4 * sc, a, 0, 7); c.fill(); }
    if (slotType(i) === 'berry' && k > 0.6) { c.fillStyle = '#fff'; c.beginPath(); c.arc(sp.x, sp.y, 2.5, 0, 7); c.fill(); }
  });
}

// ---------- day and night (follows the phone's clock) ----------
function hourNow() { if (hourOverride !== null) return hourOverride; const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
function darkness() {
  const h = hourNow();
  if (h >= 21 || h < 5) return 1;
  if (h >= 18.5) return (h - 18.5) / 2.5;
  if (h < 7) return 1 - (h - 5) / 2;
  return 0;
}
function lights() {
  const L = [];
  const lamp = objOf('lamp');
  if (lamp) L.push({ x: lamp.x, y: lamp.y, r: LAMP_R * 1.3, k: 1, warm: true });
  for (const o of objs) if (o.kind === 'deco' && o.type === 'lantern') L.push({ x: o.x, y: o.y, r: 95, k: 0.95, warm: true });
  for (const f of flies) L.push({ x: f.x, y: f.y, r: 18, k: 0.6 * (0.5 + 0.5 * Math.sin(f.ph * 3)) });
  return L;
}
// Darkness with lights cut out of it. Rendered small on a *software* canvas (plain pixels): GPU or
// recorded offscreen canvases got dropped by phone GPUs. destination-out makes overlapping lights add up.
const NIGHT_RES = 0.25, nightCv = document.createElement('canvas'), nctx = nightCv.getContext('2d', { willReadFrequently: true });
function drawNight(dk) {
  if (dk < 0.02) return;
  const ls = lights(), nw = Math.max(1, Math.ceil(W * NIGHT_RES)), nh = Math.max(1, Math.ceil(H * NIGHT_RES));
  if (nightCv.width !== nw || nightCv.height !== nh) { nightCv.width = nw; nightCv.height = nh; }
  const toS = (l, k) => [((l.x - cam.x) * cam.z + vcx()) * k, ((l.y - cam.y) * cam.z + vcy()) * k, l.r * cam.z * k];
  const n = nctx;
  n.globalCompositeOperation = 'copy'; n.fillStyle = `rgba(10,16,44,${0.62 * dk})`; n.fillRect(0, 0, nw, nh);
  n.globalCompositeOperation = 'destination-out';
  for (const l of ls) {
    if (!l.warm) continue; // fireflies are drawn as their own glow
    const [sx, sy, r] = toS(l, NIGHT_RES);
    if (r < 1 || sx + r < 0 || sy + r < 0 || sx - r > nw || sy - r > nh) continue;
    const g = n.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, `rgba(0,0,0,${l.k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    n.fillStyle = g; n.fillRect(sx - r, sy - r, r * 2, r * 2);
  }
  n.globalCompositeOperation = 'source-over';
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true;
  ctx.drawImage(nightCv, 0, 0, cv.width, cv.height);
  ctx.globalCompositeOperation = 'lighter';
  for (const l of ls) if (l.warm) {
    const [sx, sy, r] = toS(l, DPR); if (sx + r < 0 || sy + r < 0 || sx - r > cv.width || sy - r > cv.height) continue;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.6);
    g.addColorStop(0, `rgba(255,170,70,${0.22 * dk})`); g.addColorStop(1, 'rgba(255,170,70,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, r * 0.6, 0, 7); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}
function updateFlies(dt, dk, v) {
  const want = dk > 0.4 ? 14 : 0;
  while (flies.length < want) flies.push({ x: rand(v.x0, v.x1), y: rand(v.y0, v.y1), ph: rand(0, 6), vx: 0, vy: 0 });
  if (flies.length > want) flies.length = want;
  for (const f of flies) {
    f.ph += dt; f.vx = (f.vx + rand(-25, 25) * dt) * 0.98; f.vy = (f.vy + rand(-25, 25) * dt) * 0.98;
    f.x += f.vx * dt; f.y += f.vy * dt;
    if (!inView(f, 40, v)) { f.x = rand(v.x0, v.x1); f.y = rand(v.y0, v.y1); }
  }
}
function drawFlies(dk) {
  if (!flies.length) return;
  worldTransform(); ctx.globalCompositeOperation = 'lighter';
  for (const f of flies) {
    const a = (0.5 + 0.5 * Math.sin(f.ph * 3)) * dk, g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 9);
    g.addColorStop(0, `rgba(230,255,130,${a})`); g.addColorStop(1, 'rgba(230,255,130,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, 9, 0, 7); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ---------- decorations ----------
function seeded(seed) { let s = Math.floor(seed * 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function drawDeco(o, time, dk) {
  const c = ctx, r = seeded(o.seed || 0.5), { x, y } = o;
  if (o.type === 'flowers') {
    const cols = ['#f26d8f', '#f7d14a', '#b77df0', '#fff', '#ff8f4a'];
    for (let i = 0; i < 6; i++) {
      const fx = x + (r() - 0.5) * 34, fy = y + (r() - 0.5) * 26, col = cols[Math.floor(r() * cols.length)];
      c.fillStyle = '#4f8f3a'; c.beginPath(); c.ellipse(fx + 4, fy + 3, 5, 2.5, 0.6, 0, 7); c.fill();
      c.fillStyle = col; for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; c.beginPath(); c.arc(fx + Math.cos(a) * 3.2, fy + Math.sin(a) * 3.2, 2.6, 0, 7); c.fill(); }
      c.fillStyle = '#f5c242'; c.beginPath(); c.arc(fx, fy, 1.8, 0, 7); c.fill();
    }
  } else if (o.type === 'shell') {
    c.save(); c.translate(x, y); c.rotate((o.seed || 0) * 6);
    c.fillStyle = '#0002'; c.beginPath(); c.ellipse(2, 3, 13, 10, 0, 0, 7); c.fill();
    c.fillStyle = '#f6d5c4'; c.beginPath(); c.moveTo(0, 8); c.arc(0, 0, 12, Math.PI * 1.05, Math.PI * 1.95); c.closePath(); c.fill();
    c.strokeStyle = '#d99c86'; c.lineWidth = 1.2; for (let k = 0; k < 6; k++) { const a = Math.PI * (1.1 + k * 0.16); c.beginPath(); c.moveTo(0, 8); c.lineTo(Math.cos(a) * 11, Math.sin(a) * 11); c.stroke(); }
    c.fillStyle = '#e8b4a0'; c.beginPath(); c.ellipse(0, 9, 4, 2.5, 0, 0, 7); c.fill();
    c.restore();
  } else if (o.type === 'mushrooms') {
    for (let i = 0; i < 3; i++) {
      const mx = x + (r() - 0.5) * 24, my = y + (r() - 0.5) * 18, mr = 5 + r() * 4;
      c.fillStyle = '#0002'; c.beginPath(); c.arc(mx + 2, my + 3, mr, 0, 7); c.fill();
      c.fillStyle = '#d8392f'; c.beginPath(); c.arc(mx, my, mr, 0, 7); c.fill();
      c.fillStyle = '#fff'; for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(mx + (r() - 0.5) * mr * 1.2, my + (r() - 0.5) * mr * 1.2, 1.2 + r(), 0, 7); c.fill(); }
    }
  } else if (o.type === 'stones') {
    for (let i = 0; i < 3; i++) {
      const sx = x + (i - 1) * 24, sy = y + (r() - 0.5) * 8;
      c.fillStyle = '#0002'; c.beginPath(); c.ellipse(sx + 2, sy + 3, 11, 8, 0, 0, 7); c.fill();
      c.fillStyle = '#a49c90'; c.beginPath(); c.ellipse(sx, sy, 11, 8, r(), 0, 7); c.fill();
      c.fillStyle = '#bdb5a8'; c.beginPath(); c.ellipse(sx - 2, sy - 2, 6, 4, 0, 0, 7); c.fill();
    }
  } else if (o.type === 'bush') {
    c.fillStyle = '#0003'; c.beginPath(); c.ellipse(x + 6, y + 8, 30, 24, 0, 0, 7); c.fill();
    for (const [dx, dy, rr, col] of [[-12, 4, 16, '#3f7a2c'], [12, 4, 16, '#3f7a2c'], [0, -8, 18, '#4a8a33'], [-6, 2, 14, '#5a9c3c'], [8, -4, 12, '#6aad48']]) { c.fillStyle = col; c.beginPath(); c.arc(x + dx, y + dy, rr, 0, 7); c.fill(); }
    c.fillStyle = '#e8484f'; for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(x + (r() - 0.5) * 34, y + (r() - 0.5) * 26, 2, 0, 7); c.fill(); }
  } else if (o.type === 'lantern') {
    c.fillStyle = '#0003'; c.beginPath(); c.ellipse(x + 4, y + 6, 12, 9, 0, 0, 7); c.fill();
    c.fillStyle = '#3b2a1a'; c.beginPath(); c.roundRect(x - 10, y - 10, 20, 20, 4); c.fill();
    const glow = 0.45 + 0.55 * dk + Math.sin(time * 7 + x) * 0.05;
    c.fillStyle = `rgba(255,${Math.round(190 + 40 * dk)},90,${glow})`; c.beginPath(); c.roundRect(x - 6, y - 6, 12, 12, 3); c.fill();
    c.strokeStyle = '#3b2a1a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x, y + 6); c.moveTo(x - 6, y); c.lineTo(x + 6, y); c.stroke();
  }
}

// ---------- structures ----------
function drawMud(o, time) {
  const c = ctx, { rx, ry } = MUD;
  c.save(); c.translate(o.x, o.y);
  const g = c.createRadialGradient(-rx * 0.2, -ry * 0.2, 5, 0, 0, rx);
  g.addColorStop(0, '#7a5534'); g.addColorStop(1, '#4e3420');
  c.fillStyle = '#6b4c30'; c.beginPath(); c.ellipse(0, 0, rx + 8, ry + 6, 0, 0, 7); c.fill();
  c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, 7); c.fill();
  c.fillStyle = '#ffffff22';
  for (const [x, y, r] of [[-0.4, -0.3, 10], [0.3, 0.2, 7], [0.1, -0.5, 5]]) { c.beginPath(); c.ellipse(x * rx, y * ry, r, r * 0.5, 0.3, 0, 7); c.fill(); }
  for (let i = 0; i < 3; i++) { // bubbles
    const k = (time * 0.5 + i / 3) % 1;
    c.strokeStyle = `rgba(40,25,12,${1 - k})`; c.lineWidth = 1.5;
    c.beginPath(); c.arc(Math.sin(i * 2.3) * rx * 0.5, Math.cos(i * 1.9) * ry * 0.4, 2 + k * 5, 0, 7); c.stroke();
  }
  c.restore();
}
function drawSlide(o) {
  const c = ctx, L = SLIDE.len, w = SLIDE.w, lo = o.x - L / 2;
  c.fillStyle = '#0003'; // shadow grows toward the high end
  c.beginPath(); c.moveTo(lo + 4, o.y - w / 2 + 6); c.lineTo(lo + L + 26, o.y - w / 2 + 22); c.lineTo(lo + L + 26, o.y + w / 2 + 22); c.lineTo(lo + 4, o.y + w / 2 + 6); c.fill();
  c.fillStyle = '#9a6e40'; c.beginPath(); c.roundRect(lo + L - 6, o.y - w / 2 - 8, 48, w + 16, 6); c.fill(); // platform
  c.strokeStyle = '#6b4a2a'; c.lineWidth = 3;
  for (let i = 0; i < 4; i++) { const x = lo + L + 46 + i * 0; c.beginPath(); c.moveTo(lo + L + 44, o.y - w / 2 - 4 + i * (w + 8) / 3); c.lineTo(lo + L + 58, o.y - w / 2 - 4 + i * (w + 8) / 3); c.stroke(); } // ladder
  const g = c.createLinearGradient(lo, 0, lo + L, 0);
  g.addColorStop(0, '#e0483f'); g.addColorStop(1, '#ff9a7a');
  c.fillStyle = g; c.fillRect(lo, o.y - w / 2, L, w);
  c.fillStyle = '#b22f28'; c.fillRect(lo, o.y - w / 2 - 4, L, 5); c.fillRect(lo, o.y + w / 2 - 1, L, 5); // rails
  c.strokeStyle = '#ffffff44'; c.lineWidth = 2; c.beginPath(); c.moveTo(lo + 6, o.y - w / 4); c.lineTo(lo + L - 6, o.y - w / 4); c.stroke();
}
// how high up the slide a turtle is (0 = ground, 1 = top), for drawing it bigger
function slideLift(t, sl) {
  const lo = sl.x - SLIDE.len / 2;
  if (Math.abs(t.y - sl.y) > SLIDE.w / 2 + 6 || t.x < lo || t.x > sl.x + SLIDE.len / 2 + 20) return 0;
  return clamp((t.x - lo) / SLIDE.len, 0, 1);
}
function drawMirror(o, time) {
  const c = ctx, { x, y } = o;
  c.fillStyle = '#0003'; c.beginPath(); c.ellipse(x + 4, y + 22, 26, 8, 0, 0, 7); c.fill();
  c.fillStyle = '#6b4a2a'; c.fillRect(x - 20, y + 16, 40, 6); // stand
  c.fillStyle = '#8a5f34'; c.beginPath(); c.ellipse(x, y - 8, 22, 28, 0, 0, 7); c.fill();
  const g = c.createLinearGradient(x - 18, y - 34, x + 18, y + 18);
  g.addColorStop(0, '#dff3ff'); g.addColorStop(0.5, '#9cc7df'); g.addColorStop(1, '#cfe7f5');
  c.fillStyle = g; c.beginPath(); c.ellipse(x, y - 8, 17, 23, 0, 0, 7); c.fill();
  if (turtles.some(t => t.rest?.kind === 'mirror' && dist(t, o) < 90)) { // a little reflection looking back
    c.fillStyle = '#7f9c4c'; c.beginPath(); c.arc(x, y, 7, 0, 7); c.fill();
    c.fillStyle = '#111'; c.beginPath(); c.arc(x - 3, y - 2, 1.4, 0, 7); c.arc(x + 3, y - 2, 1.4, 0, 7); c.fill();
  }
  c.strokeStyle = '#ffffffaa'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 9, y - 22); c.lineTo(x - 3, y - 28); c.stroke();
}
function drawLampGlow(o, dk) {
  const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, LAMP_R);
  g.addColorStop(0, `rgba(255,190,90,${0.22 + 0.1 * dk})`); g.addColorStop(1, 'rgba(255,190,90,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, LAMP_R, 0, 7); ctx.fill();
}
function drawLamp(o, time) {
  const c = ctx, { x, y } = o;
  c.strokeStyle = '#333'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 30, y - 10, x + 40, y - 40); c.stroke(); // cord
  c.fillStyle = '#3a3a3a'; c.beginPath(); c.arc(x, y, 17, 0, 7); c.fill();
  c.fillStyle = '#6a6a6a'; c.beginPath(); c.arc(x, y, 13, 0, 7); c.fill();
  c.fillStyle = `rgba(255,${200 + Math.sin(time * 3) * 20},110,1)`; c.beginPath(); c.arc(x, y, 8, 0, 7); c.fill();
  c.fillStyle = '#fff8'; c.beginPath(); c.arc(x - 3, y - 3, 3, 0, 7); c.fill();
}


function drawPond(o, time) {
  const c = ctx, { rx, ry } = POND;
  c.save(); c.translate(o.x, o.y);
  c.fillStyle = '#7d766a'; c.beginPath(); c.ellipse(0, 0, rx + 13, ry + 11, 0, 0, 7); c.fill();
  for (let i = 0; i < 30; i++) {
    const a = i / 30 * Math.PI * 2;
    c.fillStyle = ['#9a9284', '#857d70', '#aaa294'][i % 3];
    c.beginPath(); c.ellipse(Math.cos(a) * (rx + 6), Math.sin(a) * (ry + 5), 9, 7, a, 0, 7); c.fill();
  }
  const g = c.createRadialGradient(-rx * 0.2, -ry * 0.2, 10, 0, 0, rx);
  g.addColorStop(0, '#4f9fcc'); g.addColorStop(1, '#2b6c96');
  c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, 7); c.fill();
  c.strokeStyle = '#ffffff38'; c.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const k = (time * 0.15 + i / 4) % 1;
    c.globalAlpha = Math.sin(k * Math.PI) * 0.8;
    c.beginPath(); c.ellipse(Math.sin(i * 2.1) * rx * 0.4, Math.cos(i * 1.7) * ry * 0.35, 10 + k * 30, (10 + k * 30) * 0.6, 0, 0, 7); c.stroke();
  }
  c.globalAlpha = 1;
  for (const [px, py, pr, flower] of [[-0.55, -0.3, 17, true], [0.5, 0.35, 14, false], [0.15, -0.55, 11, false], [-0.2, 0.5, 12, false]]) {
    const x = px * rx, y = py * ry;
    c.fillStyle = '#4f9a3c'; c.beginPath(); c.moveTo(x, y); c.arc(x, y, pr, 0.3, Math.PI * 2 - 0.1); c.closePath(); c.fill();
    c.strokeStyle = '#3c7a2c'; c.lineWidth = 1; c.stroke();
    if (flower) { c.fillStyle = '#f5a8c8'; for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; c.beginPath(); c.ellipse(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 4, 2.5, a, 0, 7); c.fill(); } c.fillStyle = '#f7d94a'; c.beginPath(); c.arc(x, y, 2.5, 0, 7); c.fill(); }
  }
  c.restore();
}
function drawRock(o) {
  const c = ctx, { rx, ry } = ROCK;
  c.fillStyle = '#0002'; c.beginPath(); c.ellipse(o.x + 5, o.y + 7, rx, ry, 0.2, 0, 7); c.fill();
  c.fillStyle = '#9b9286'; c.beginPath(); c.ellipse(o.x, o.y, rx, ry, 0.2, 0, 7); c.fill();
  c.fillStyle = '#b3aa9d'; c.beginPath(); c.ellipse(o.x - 6, o.y - 5, rx * 0.72, ry * 0.62, 0.2, 0, 7); c.fill();
  c.fillStyle = '#c8bfb2'; c.beginPath(); c.ellipse(o.x - 14, o.y - 10, rx * 0.3, ry * 0.22, 0.2, 0, 7); c.fill();
}
function drawLog(o) {
  const c = ctx, L = LOG.len, r = LOG.r;
  c.save(); c.translate(o.x, o.y);
  c.fillStyle = '#0003'; c.beginPath(); c.roundRect(-L / 2 + 5, -r + 9, L, r * 2, r * 0.5); c.fill();
  const g = c.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, '#6b4526'); g.addColorStop(0.35, '#8c5f36'); g.addColorStop(1, '#5a3a1f');
  c.fillStyle = g; c.beginPath(); c.roundRect(-L / 2, -r, L, r * 2, r * 0.5); c.fill();
  c.strokeStyle = '#3e2814'; c.lineWidth = 2; c.stroke();
  c.strokeStyle = '#4a2f18'; c.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) { const y = -r + 8 + i * (r * 2 - 16) / 5; c.beginPath(); c.moveTo(-L / 2 + 14, y); c.bezierCurveTo(-L / 6, y + 4, L / 6, y - 4, L / 2 - 14, y); c.stroke(); }
  c.fillStyle = '#6f9a3c99'; c.beginPath(); c.ellipse(L * 0.15, -r * 0.55, 16, 7, 0, 0, 7); c.fill();
  for (const sx of [-1, 1]) { // cut ends with a dark opening
    c.fillStyle = '#c99c62'; c.beginPath(); c.ellipse(sx * L / 2, 0, r * 0.42, r, 0, 0, 7); c.fill();
    c.strokeStyle = '#8a6438'; c.lineWidth = 1; c.beginPath(); c.ellipse(sx * L / 2, 0, r * 0.3, r * 0.82, 0, 0, 7); c.stroke();
    c.fillStyle = '#241608'; c.beginPath(); c.ellipse(sx * L / 2, 0, r * 0.26, r * 0.68, 0, 0, 7); c.fill();
  }
  c.restore();
}
function drawHut(o) {
  const c = ctx, r = HUT.r;
  c.save(); c.translate(o.x, o.y);
  c.fillStyle = '#0003'; c.beginPath(); c.arc(6, 8, r, 0, 7); c.fill();
  const g = c.createRadialGradient(-r * 0.25, -r * 0.3, 4, 0, 0, r);
  g.addColorStop(0, '#ecc874'); g.addColorStop(1, '#b4853a');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
  c.strokeStyle = '#9a6f2e'; c.lineWidth = 1.2;
  for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(a) * 6, Math.sin(a) * 6); c.lineTo(Math.cos(a) * r, Math.sin(a) * r); c.stroke(); }
  c.lineWidth = 2; c.strokeStyle = '#8a6224';
  for (const k of [0.4, 0.72]) { c.beginPath(); c.arc(0, 0, r * k, 0, 7); c.stroke(); }
  c.fillStyle = '#7a5520'; c.beginPath(); c.arc(0, 0, 7, 0, 7); c.fill();
  c.fillStyle = '#2b1d0e'; c.beginPath(); c.ellipse(0, r * 0.86, r * 0.36, r * 0.26, 0, Math.PI, 0); c.fill(); // doorway
  c.strokeStyle = '#6b4a1e'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, r, 0, 7); c.stroke();
  c.restore();
}
function drawFeeder(o, time) {
  const c = ctx, { x, y } = o;
  c.fillStyle = '#0003'; c.beginPath(); c.ellipse(x + 5, y + 8, 28, 26, 0, 0, 7); c.fill();
  c.fillStyle = '#b98c56'; c.beginPath(); c.ellipse(x, y + 26, 24, 11, 0, 0, 7); c.fill(); // tray
  c.fillStyle = '#7fc35a'; for (const k of [-10, 0, 9]) { c.beginPath(); c.ellipse(x + k, y + 26, 6, 3.5, k, 0, 7); c.fill(); }
  c.fillStyle = '#8a5f34'; c.beginPath(); c.roundRect(x - 22, y - 26, 44, 44, 7); c.fill(); // hopper
  c.fillStyle = '#a7744a'; c.beginPath(); c.roundRect(x - 18, y - 22, 36, 36, 5); c.fill();
  c.fillStyle = '#d9f2c4'; c.beginPath(); c.roundRect(x - 11, y - 14, 22, 18, 4); c.fill(); // window
  c.fillStyle = '#5fae3e'; c.beginPath(); c.roundRect(x - 11, y - 14 + 18 * (0.3 + 0.1 * Math.sin(time)), 22, 18 * (0.7 - 0.1 * Math.sin(time)), 4); c.fill();
  if (up.feeder > 1) { c.fillStyle = '#e0343c'; c.beginPath(); c.arc(x + 5, y - 2, 3, 0, 7); c.arc(x - 4, y + 1, 2.5, 0, 7); c.fill(); }
}
function feederFood(feeder, F) {
  const type = F.berries && Math.random() < 0.35 ? 'berry' : 'lettuce', bites = type === 'berry' ? 2 : 3;
  const f = { x: feeder.x + rand(-22, 22), y: feeder.y + 52 + rand(0, 10), type, bites, max: bites, rot: rand(0, 6), fromFeeder: true };
  keepInYard(f);
  return f;
}

// Emoji are drawn from cached bitmaps: fillText at ever-changing sizes (zoom x animation) floods the
// phone's GPU glyph cache, which then drops whole frames (night overlay vanished, UI text went blank).
const emojiCache = new Map();
function drawEmoji(c, ch, x, y, size) {
  let sp = emojiCache.get(ch);
  if (!sp) {
    const n = 128; sp = document.createElement('canvas'); sp.width = sp.height = n;
    const g = sp.getContext('2d', { willReadFrequently: true }); g.font = `${n * 0.78}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ch, n / 2, n * 0.54); g.getImageData(0, 0, 1, 1); emojiCache.set(ch, sp); // software canvas = plain pixels, no glyphs sent to the GPU
  }
  c.drawImage(sp, x - size / 2, y - size / 2, size, size);
}
// Same for words drawn in the zoomed world: render once at high res, then scale the bitmap.
const textCache = new Map();
function textSprite(text, font, fill, stroke, lw = 0) {
  const key = [text, font, fill, stroke, lw].join('|');
  let sp = textCache.get(key);
  if (sp) return sp;
  const k = 4, m = document.createElement('canvas').getContext('2d');
  m.font = font; const w = Math.ceil(m.measureText(text).width) + lw * 2 + 4, h = Math.ceil(parseFloat(font.match(/(\d+)px/)[1]) * 1.5) + lw * 2;
  const cv2 = document.createElement('canvas'); cv2.width = w * k; cv2.height = h * k;
  const g = cv2.getContext('2d', { willReadFrequently: true }); g.scale(k, k); g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (stroke) { g.lineWidth = lw; g.lineJoin = 'round'; g.strokeStyle = stroke; g.strokeText(text, w / 2, h / 2); }
  g.fillStyle = fill; g.fillText(text, w / 2, h / 2); g.getImageData(0, 0, 1, 1);
  sp = { cv: cv2, w, h };
  if (textCache.size > 200) textCache.clear();
  textCache.set(key, sp); return sp;
}
const drawText = (c, sp, x, y) => c.drawImage(sp.cv, x - sp.w / 2, y - sp.h / 2, sp.w, sp.h);
function drawParts(dt) {
  const c = ctx;
  parts = parts.filter(p => (p.t += dt) < p.life);
  for (const p of parts) {
    const k = p.t / p.life;
    p.x += p.vx * dt; p.y += p.vy * dt;
    c.globalAlpha = 1 - k;
    if (p.kind === 'grr') {
      drawEmoji(c, '💢', p.x + Math.sin(p.t * 20) * 2, p.y - 6, 18 + k * 6);
    } else if (p.kind === 'star') {
      drawText(c, textSprite(p.text, 'bold 15px system-ui', '#ffd84a', '#0009', 3), p.x, p.y - 5);
    } else if (p.kind === 'zzz') {
      drawEmoji(c, '💤', p.x + Math.sin(p.t * 3) * 4, p.y - 5, 12 + k * 6);
    } else if (p.kind === 'mud') { c.fillStyle = '#5b3d22'; c.beginPath(); c.arc(p.x, p.y, 2.5, 0, 7); c.fill();
    } else if (p.kind === 'note') {
      drawEmoji(c, '🎵', p.x + Math.sin(p.t * 6) * 6, p.y - 6, 16 + k * 4);
    } else if (p.kind === 'heart') {
      drawEmoji(c, '💚', p.x + Math.sin(p.t * 5) * 5, p.y - 6, 16 + k * 6);
    } else if (p.kind === 'crumb') { c.fillStyle = '#7ccf52'; c.fillRect(p.x, p.y, 3, 3); }
    else if (p.kind === 'drop') { c.fillStyle = '#7cc4f0'; c.beginPath(); c.arc(p.x, p.y, 3, 0, 7); c.fill(); }
    else if (p.kind === 'sparkle') { drawEmoji(c, '✨', p.x, p.y - 5, 14); }
    else if (p.kind === 'ripple') { c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y, 4 + k * 16, 0, 7); c.stroke(); }
    else if (p.kind === 'tap') { c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.arc(p.x, p.y, 6 + k * 24, 0, 7); c.stroke(); }
  }
  c.globalAlpha = 1;
}

function drawMarker(time) {
  if (!marker) return;
  const c = ctx, b = Math.abs(Math.sin(time * 4)) * 6;
  c.fillStyle = '#0002'; c.beginPath(); c.ellipse(marker.x, marker.y, 7, 3, 0, 0, 7); c.fill();
  c.fillStyle = '#ffffffd0'; c.beginPath(); c.arc(marker.x, marker.y - 8 - b, 5, 0, 7); c.fill();
}

// ---------- input ----------
const hint = document.getElementById('hint');
let hintT;
function say(text, ms = 1800) { hint.textContent = text; hint.classList.add('show'); clearTimeout(hintT); hintT = setTimeout(() => hint.classList.remove('show'), ms); }

document.querySelectorAll('#tools button').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.act === 'water') {
    if (bowl.level < 0.5 && waterStarCool <= 0) { earn(1, bowl.x, bowl.y - bowl.r - 10); waterStarCool = 60; }
    bowl.level = 1; bowl.fill = 1; buzz(15);
    for (let i = 0; i < 14; i++) emit(bowl.x, bowl.y, 'drop');
    say('Fresh water!');
    return;
  }
  if (b.dataset.mode === 'food' && mode === 'food') { // tap Feed again: lettuce <-> berries
    foodType = foodType === 'lettuce' ? 'berry' : 'lettuce';
    b.innerHTML = foodType === 'berry' ? '🍓<span>Berry</span>' : '🥬<span>Feed</span>';
    return say(foodType === 'berry' ? 'Berries 🍓 sweet treats, but too many make a chubby turtle' : 'Lettuce 🥬 healthy everyday food', 2600);
  }
  mode = b.dataset.mode;
  placing = null; endArrange();
  document.querySelectorAll('#tools button').forEach(x => x.classList.toggle('on', x === b));
  say({ walk: turtles.length > 1 ? (isPicked() ? `Tap to call ${sel.name} · tap ${sel.name} again to deselect` : 'Tap a turtle to pick it') : 'Tap to call your turtle · tap him to pet', food: `Tap to drop ${foodType === 'berry' ? 'berries' : 'lettuce'} · tap Feed again to switch`, clean: 'Tap the messes to scoop them', play: 'Tap to toss the ball · flick it' }[mode]);
  if (mode === 'play' && !ball) ball = makeBall(cam.x, cam.y);
  renderToybar();
}));

// ---------- toy picker (Play mode) ----------
const toybar = document.getElementById('toybar');
function renderToybar() {
  toybar.hidden = mode !== 'play' || up.toys.length < 2;
  if (toybar.hidden) return;
  toybar.innerHTML = up.toys.map(k => `<button data-toy="${k}" class="${k === up.toy ? 'on' : ''}">${TOYS[k].icon}</button>`).join('');
}
toybar.addEventListener('click', e => {
  const k = e.target.closest('button')?.dataset.toy;
  if (!k) return;
  up.toy = k;
  ball = makeBall(ball ? ball.x : cam.x, ball ? ball.y : cam.y);
  renderToybar(); say(TOYS[k].name);
});

// ---------- stars ----------
function earn(n, x, y) {
  stars += n;
  parts.push({ x, y, kind: 'star', text: `+${n}⭐`, t: 0, life: 1.3, vx: 0, vy: -28 });
  starsEl.classList.remove('bump'); void starsEl.offsetWidth; starsEl.classList.add('bump');
}
function dailyBonus() {
  const today = new Date().toDateString();
  if (lastDaily === today) return;
  const first = !lastDaily;
  lastDaily = today;
  if (!first) { earn(5, sel.x, sel.y - 60); setTimeout(() => say('Daily visit bonus: +5 ⭐', 2500), 600); }
}

let drag = null; // ball being flicked
const ptrs = new Map();
let gest = null;
cv.addEventListener('pointerdown', e => {
  if (!ptrs.size && (e.clientY < TOP - 20 || e.clientY > H - BOTTOM + 10)) return;
  try { cv.setPointerCapture(e.pointerId); } catch { }
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) { // pinch to zoom (and pan with two fingers)
    if (drag) endDrag();
    const [a, b] = [...ptrs.values()], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    gest = { kind: 'pinch', d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), z0: cam.z, w0: s2w(mid.x, mid.y) };
    return;
  }
  if (ptrs.size > 2) return;
  const p = s2w(e.clientX, e.clientY);
  if (arranging) { // grab the nearest movable thing under the finger
    const o = movables().filter(o => dist(p, o) < hitR(o) + 10 / cam.z).sort((a, b) => dist(p, a) - dist(p, b))[0];
    if (o) { gest = { kind: 'move', o, dx: o.x - p.x, dy: o.y - p.y, sx: e.clientX, sy: e.clientY, moved: false }; return; }
  }
  if (mode === 'play' && ball && !placing && dist(p, ball) < ball.r + 22 / cam.z) {
    drag = { hist: [{ x: p.x, y: p.y, t: performance.now() }] }; ball.held = true; ball.idle = 0; ball.vx = ball.vy = 0;
    gest = { kind: 'ball' };
    return;
  }
  gest = { kind: 'maybe', sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y }; // a tap, unless the finger moves (then it's a pan)
});
cv.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!gest) return;
  if (gest.kind === 'move') {
    const p = s2w(e.clientX, e.clientY);
    if (Math.hypot(e.clientX - gest.sx, e.clientY - gest.sy) > 6) gest.moved = true;
    if (gest.moved) { gest.o.x = p.x + gest.dx; gest.o.y = p.y + gest.dy; keepInYard(gest.o); }
  } else if (gest.kind === 'ball' && drag) {
    const p = s2w(e.clientX, e.clientY);
    ball.x = clamp(p.x, ball.r, YW - ball.r); ball.y = clamp(p.y, ball.r, YH - ball.r);
    drag.hist.push({ x: ball.x, y: ball.y, t: performance.now() });
    if (drag.hist.length > 6) drag.hist.shift();
  } else if (gest.kind === 'pinch' && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    cam.z = clamp(gest.z0 * Math.hypot(a.x - b.x, a.y - b.y) / gest.d0, zMin(), Z_MAX);
    cam.x = gest.w0.x - (mid.x - vcx()) / cam.z; cam.y = gest.w0.y - (mid.y - vcy()) / cam.z;
    clampCam();
  } else if (gest.kind === 'maybe' || gest.kind === 'pan') {
    const dx = e.clientX - gest.sx, dy = e.clientY - gest.sy;
    if (gest.kind === 'maybe' && Math.hypot(dx, dy) > 10) gest.kind = 'pan';
    if (gest.kind === 'pan') { cam.x = gest.cx - dx / cam.z; cam.y = gest.cy - dy / cam.z; clampCam(); }
  }
});
const endDrag = () => {
  if (!drag) return;
  const h = drag.hist, a = h[0], b = h[h.length - 1], dt = Math.max(16, b.t - a.t) / 1000;
  ball.vx = clamp((b.x - a.x) / dt, -900, 900); ball.vy = clamp((b.y - a.y) / dt, -900, 900);
  ball.held = false; drag = null;
};
function pointerEnd(e) {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (gest?.kind === 'ball') endDrag();
  else if (gest?.kind === 'move' && !gest.moved && gest.o.kind === 'deco' && e.type === 'pointerup') {
    const o = gest.o;
    if (confirm(`Remove this ${DECOS[o.type].name.toLowerCase()}? (no refund)`)) { objs = objs.filter(x => x !== o); emit(o.x, o.y, 'sparkle', 6); save(); }
  }
  else if (gest?.kind === 'maybe' && e.type === 'pointerup') tap(s2w(e.clientX, e.clientY));
  if (gest?.kind === 'pinch' && ptrs.size) gest = { kind: 'done' }; // the finger left behind doesn't tap
  if (!ptrs.size) gest = null;
}
cv.addEventListener('pointerup', pointerEnd);
cv.addEventListener('pointercancel', pointerEnd);
cv.addEventListener('wheel', e => { // desktop zoom
  e.preventDefault();
  const w0 = s2w(e.clientX, e.clientY);
  cam.z = clamp(cam.z * Math.exp(-e.deltaY * 0.0015), zMin(), Z_MAX);
  cam.x = w0.x - (e.clientX - vcx()) / cam.z; cam.y = w0.y - (e.clientY - vcy()) / cam.z;
  clampCam();
}, { passive: false });

const nameOf = o => o === bowl ? BOWLS[up.bowl].name : o.kind === 'feeder' ? FEEDERS[up.feeder].name
  : o.kind === 'deco' ? DECOS[o.type].name : (AUTO[o.kind] || STRUCTS[o.kind]).name;
const HIT = { pond: 100, rock: 50, log: 75, hut: HUT.r, garden: 55, mud: 60, slide: 75, mirror: 32, lamp: 30, feeder: 30, deco: 24 };
const hitR = o => (o === bowl ? bowl.r : HIT[o.kind] || 30);
const movables = () => [bowl, ...objs];
const doneBtn = document.getElementById('arrange-done');
function startArrange() {
  arranging = true; placing = null; shop.hidden = true; doneBtn.hidden = false;
  say('Drag things to move them · tap a decoration to remove it', 4500);
}
function endArrange() { if (!arranging) return; arranging = false; doneBtn.hidden = true; save(); }
doneBtn.onclick = endArrange;
function wash(t) {
  t.mud = 0; buzz(12);
  for (let i = 0; i < 12; i++) emit(t.x, t.y, 'drop');
  emit(t.x, t.y, 'sparkle', 6); earn(1, t.x, t.y - t.S * 2);
  t.st.happy = clamp(t.st.happy + 4, 0, 100);
  say(`${t.name} is squeaky clean ✨`);
}
function tap(p) {
  emit(p.x, p.y, 'tap');
  if (placing) {
    placing.x = p.x; placing.y = p.y; keepInYard(placing);
    emit(placing.x, placing.y, 'sparkle', 10); say(`${nameOf(placing)} placed ✨`); buzz(15);
    placing = null; save();
    return;
  }
  if (arranging) return;
  if (p.x < 0 || p.y < 0 || p.x > YW || p.y > YH) { if (isPicked() && turtles.length > 1) deselect(); return; }
  const hitT = turtles.filter(t => t.releasing === undefined && dist(p, t) < t.S * 1.2 + 8 / cam.z).sort((a, b) => dist(p, a) - dist(p, b))[0];
  if (hitT && mode === 'clean' && hitT.mud > 0) return wash(hitT);
  if (hitT && hitT === sel && picked && turtles.length > 1) return deselect(); // tap the picked turtle again to let go
  if (hitT) return pet(hitT);
  if (mode === 'walk' && !isPicked()) say('Tap a turtle to pick it, then tap to call it');
  else if (mode === 'walk') { wakeUp(sel); sel.userTarget = { x: p.x, y: p.y }; sel.eat = null; sel.drinkT = 0; sel.outing = null; }
  else if (mode === 'food') {
    if (foods.filter(f => f.slot === undefined).length >= 6) return say('That\'s plenty of food!');
    const type = foodType;
    const bites = type === 'berry' ? 2 : 3;
    const f = { x: p.x, y: p.y, type, bites, max: bites, rot: rand(0, 6) }; keepInYard(f); foods.push(f);
    buzz(8);
  } else if (mode === 'clean') {
    const hit = poops.filter(q => dist(q, p) < Math.max(26, 30 / cam.z));
    if (!hit.length) return say(poops.length ? 'Tap right on a mess' : 'All clean! ✨');
    poops = poops.filter(q => !hit.includes(q));
    hit.forEach(q => emit(q.x, q.y, 'sparkle', 6));
    earn(2 * hit.length, hit[0].x, hit[0].y - 14);
    turtles.forEach(t => t.st.happy = clamp(t.st.happy + 3 * hit.length, 0, 100)); buzz(12);
    if (!poops.length) say('Spotless! ✨');
  } else if (mode === 'play' && !ball) { // toy timed out: a new one appears where you tap
    ball = makeBall(p.x, p.y); buzz(6);
  } else if (mode === 'play' && ball) { // toss the toy toward the tap
    ball.idle = 0;
    const d = Math.max(1, dist(p, ball)), sp = Math.min(520, d * 2.6);
    ball.vx = (p.x - ball.x) / d * sp; ball.vy = (p.y - ball.y) / d * sp; buzz(6);
  }
}

function select(t) {
  if (t === sel && picked) return;
  sel = t; picked = true; say(`${t.name} picked 🐢`);
}
function deselect() {
  picked = false; sel.userTarget = null;
  say('No turtle picked · tap one to pick it');
}
function pet(t) {
  select(t);
  if (wakeUp(t)) return;
  if (t.petCool > 0) return;
  const f = t.traits.friendly;
  t.petT = lerp(1.9, 0.9, f); t.petCool = 1.2; t.v *= 0.2; // grumpy turtles hide in their shell longer
  if (f < 0.35 && Math.random() < 0.6) { // not in the mood
    t.st.happy = clamp(t.st.happy + 1, 0, 100); t.st.social = clamp(t.st.social + 5, 0, 100);
    setTimeout(() => emit(t.x, t.y - t.S, 'grr'), t.petT * 500);
    buzz([10, 30, 10]);
  } else {
    t.st.happy = clamp(t.st.happy + lerp(3, 9, f), 0, 100); t.st.social = clamp(t.st.social + lerp(10, 25, f), 0, 100);
    if (t.starCool <= 0) { earn(1, t.x, t.y - t.S * 2.2); t.starCool = 8; }
    setTimeout(() => emit(t.x, t.y - t.S, 'heart', 1 + Math.round(f * 3)), t.petT * 500);
    buzz(20);
  }
}

// ---------- adopting more turtles ----------
// bought in the shop; each extra turtle costs a bit more
const adoptCost = () => 25 * turtles.length;
function adopt() {
  const used = new Set(turtles.map(t => t.name));
  const suggestion = NAMES.find(n => !used.has(n)) || `Turtle ${turtles.length + 1}`;
  const answer = prompt(`Name your new hatchling (blank = ${suggestion}):`, suggestion);
  const name = ((answer ?? '').trim() || suggestion).slice(0, 14); // already paid, so cancelling keeps the suggested name
  shop.hidden = true;
  const t = makeTurtle({ name, tint: pickTint(turtles), x: clamp(cam.x + rand(-80, 80), 60, YW - 60), y: clamp(cam.y + rand(-80, 80), 60, YH - 60), a: rand(-3, 3) });
  turtles.push(t); use(t); resetFeet();
  emit(t.x, t.y, 'sparkle', 12); emit(t.x, t.y - 10, 'heart', 3);
  sel = t; say(`Welcome, ${name}! Seems ${personality(t.traits).toLowerCase()} 🥚`, 3000); buzz([20, 40, 20]);
  save();
}
document.getElementById('away-ok').onclick = () => { document.getElementById('away').hidden = true; };

// ---------- tap the name label: rename or release ----------
const menu = document.getElementById('menu');
stageEl.addEventListener('click', () => {
  if (!isPicked()) return say('Tap a turtle to pick it');
  menu.querySelector('.title').textContent = `🐢 ${sel.name}`;
  menu.querySelector('.persona').textContent = personality(sel.traits);
  menu.querySelector('.mood').textContent = moods(sel);
  menu.querySelector('.traits').innerHTML = TRAITS.map(d => {
    const n = dots(sel.traits[d.k]);
    return `<div>${d.icon} ${d.label}</div><div class="dots">${'●'.repeat(n)}<span>${'●'.repeat(5 - n)}</span></div>`;
  }).join('');
  document.getElementById('m-release').disabled = turtles.length < 2;
  const vb = document.getElementById('m-vet');
  vb.hidden = !up.vet; vb.textContent = `💊 Use vet kit (${up.vet} left)`;
  menu.hidden = false;
});
menu.addEventListener('click', e => { if (e.target === menu) menu.hidden = true; });
document.getElementById('m-close').onclick = () => { menu.hidden = true; };
document.getElementById('m-rename').onclick = () => {
  menu.hidden = true;
  const name = (prompt(`Rename ${sel.name}:`, sel.name) ?? '').trim().slice(0, 14);
  if (name) { sel.name = name; save(); }
};
document.getElementById('m-vet').onclick = () => { menu.hidden = true; if (up.vet > 0) useVet(sel, false); };
document.getElementById('m-release').onclick = () => {
  menu.hidden = true;
  if (turtles.length < 2) return;
  const t = sel;
  if (!confirm(`Release ${t.name} back to the wild? This can't be undone.`)) return;
  t.releasing = 1; // fades out, then is removed in the loop
  emit(t.x, t.y, 'sparkle', 12); emit(t.x, t.y - t.S, 'heart', 3);
  sel = turtles.find(o => o !== t);
  say(`Bye ${t.name}! 🌿`); buzz(20);
};

// ---------- shop ----------
const shop = document.getElementById('shop'), shopList = document.getElementById('shop-list');
let shopRows = [];
function newObj(kind) { const o = { kind, x: cam.x, y: cam.y }; keepInYard(o); objs.push(o); return o; }
function startPlacing(o) {
  placing = o; shop.hidden = true;
  say(`Tap where the ${nameOf(o).toLowerCase()} should go`, 4000);
}
function buildShop() {
  const rows = [], yNext = YARDS[up.yard + 1], bNext = BOWLS[up.bowl + 1], fNext = FEEDERS[up.feeder + 1];
  rows.push({ sec: `🐢 Turtles · ${turtles.length}/${MAX_TURTLES}` });
  rows.push(turtles.length < MAX_TURTLES
    ? { icon: '🥚', name: 'Adopt a hatchling', desc: 'A new baby turtle with its own personality and colors.', cost: adoptCost(), buy: adopt }
    : { icon: '🥚', name: 'Adopt a hatchling', desc: 'Your yard is full of turtles!', done: 'Full' });
  rows.push({ sec: '🏡 Yard' });
  rows.push(yNext
    ? { icon: '🏡', name: `${yNext.name} yard`, desc: `More room to roam. Drag to look around, pinch to zoom.`, cost: yNext.cost, buy: () => { up.yard++; applyYard(); say('Bigger yard! Drag to look around · pinch to zoom', 3500); } }
    : { icon: '🏡', name: 'Huge yard', desc: 'The biggest yard there is.', done: 'Maxed' });
  rows.push({ icon: '✋', name: 'Arrange yard', desc: 'Drag things to new spots. Tap a decoration to remove it.', action: startArrange, btn: 'Arrange' });
  rows.push({ sec: '🤖 Care & automation' });
  rows.push(bNext
    ? { icon: bNext.refill ? '⛲' : '🥣', name: bNext.name, desc: bNext.refill ? 'Refills itself, even while you\'re away.' : 'Holds twice as much water.', cost: bNext.cost, buy: () => { up.bowl++; applyYard(); } }
    : { icon: '⛲', name: 'Fountain', desc: 'Refills itself, even while you\'re away.', done: 'Maxed' });
  rows.push(fNext
    ? { icon: '🥫', name: fNext.name, desc: up.feeder ? 'Feeds more often and adds strawberries.' : 'Drops food when turtles get hungry, even while you\'re away.', cost: fNext.cost, buy: () => { up.feeder++; if (!objOf('feeder')) startPlacing(newObj('feeder')); } }
    : { icon: '🥫', name: 'Deluxe feeder', desc: 'Feeding on autopilot.', done: 'Maxed' });
  rows.push(!up.garden ? { icon: '🥬', name: AUTO.garden.name, desc: AUTO.garden.desc, cost: AUTO.garden.cost, buy: () => { up.garden = 1; ensurePlots(); startPlacing(newObj('garden')); } }
    : up.garden === 1 ? { icon: '🍓', name: 'Big garden', desc: 'Six plots, and strawberries too.', cost: 140, buy: () => { up.garden = 2; ensurePlots(); } }
      : { icon: '🍓', name: 'Big garden', desc: 'Lettuce and strawberries on tap.', done: 'Maxed' });
  rows.push(up.crab === 0 ? { icon: '🦀', name: 'Clean-up crab', desc: 'Scuttles around scooping up poop, even while you\'re away.', cost: 90, buy: () => { up.crab = 1; syncCrabs(); } }
    : up.crab === 1 ? { icon: '🦀', name: 'Second crab', desc: 'Twice the tidying.', cost: 160, buy: () => { up.crab = 2; syncCrabs(); } }
      : { icon: '🦀', name: 'Crab crew', desc: 'Two crabs on poop patrol.', done: 'Maxed' });
  rows.push(objOf('lamp') ? { icon: AUTO.lamp.icon, name: AUTO.lamp.name, desc: AUTO.lamp.desc, done: 'Placed' }
    : { icon: AUTO.lamp.icon, name: AUTO.lamp.name, desc: AUTO.lamp.desc, cost: AUTO.lamp.cost, buy: () => startPlacing(newObj('lamp')) });
  rows.push({ icon: '💊', name: 'Vet kit', desc: `Cures sickness instantly, and saves a turtle that's about to die. You have ${up.vet}.`, cost: 40, buy: () => { up.vet++; say('Vet kits are used from a turtle\'s menu (tap its name)', 3000); } });
  rows.push({ sec: '🎾 Toys' });
  for (const [k, toy] of Object.entries(TOYS)) {
    rows.push(up.toys.includes(k) ? { icon: toy.icon, name: toy.name, desc: toy.desc, done: 'Owned' }
      : { icon: toy.icon, name: toy.name, desc: toy.desc, cost: toy.cost, buy: () => { up.toys.push(k); up.toy = k; if (ball) ball = makeBall(ball.x, ball.y); renderToybar(); say('Pick toys in Play mode 🎾', 2500); } });
  }
  rows.push({ sec: '🪨 Play structures' });
  for (const [k, sd] of Object.entries(STRUCTS)) {
    if (objOf(k)) rows.push({ icon: sd.icon, name: sd.name, desc: sd.desc, done: 'Placed' });
    else rows.push({ icon: sd.icon, name: sd.name, desc: sd.desc, cost: sd.cost, locked: sd.needYard && up.yard < sd.needYard ? 'Needs a Medium yard' : null, buy: () => startPlacing(newObj(k)) });
  }
  rows.push({ sec: '🌷 Decorations' });
  for (const [k, dd] of Object.entries(DECOS)) {
    const n = objs.filter(o => o.kind === 'deco' && o.type === k).length;
    rows.push({ icon: dd.icon, name: dd.name, desc: (dd.light ? 'Glows at night. ' : '') + (n ? `You have ${n}.` : 'Buy as many as you like.'), cost: dd.cost, buy: () => { const o = newObj('deco'); o.type = k; o.seed = Math.random(); startPlacing(o); } });
  }
  return rows;
}
function renderShop() {
  shopRows = buildShop();
  document.getElementById('shop-stars').textContent = `⭐ ${stars}`;
  shopList.innerHTML = shopRows.map((r, i) => {
    if (r.sec) return `<div class="sec">${r.sec}</div>`;
    let btn;
    if (r.done) btn = `<span class="done">${r.done}</span>`;
    else if (r.action) btn = `<button data-i="${i}" class="move">${r.btn}</button>`;
    else if (r.locked) btn = `<span class="done">${r.locked}</span>`;
    else btn = `<button data-i="${i}" ${stars < r.cost ? 'disabled' : ''}>⭐ ${r.cost}</button>`;
    return `<div class="row"><div class="ic">${r.icon}</div><div><b>${r.name}</b><small>${r.desc || ''}</small></div>${btn}</div>`;
  }).join('');
}
starsEl.addEventListener('click', () => { renderShop(); shop.hidden = false; });
document.getElementById('shop-close').onclick = () => { shop.hidden = true; };
shop.addEventListener('click', e => { if (e.target === shop) shop.hidden = true; });
shopList.addEventListener('click', e => {
  const i = e.target.closest('button')?.dataset.i;
  if (i === undefined) return;
  const r = shopRows[+i];
  if (r.action) return r.action();
  if (stars < r.cost) return;
  stars -= r.cost; buzz([20, 40, 20]);
  r.buy();
  emit(cam.x, cam.y, 'sparkle', 10);
  save();
  if (!shop.hidden) renderShop();
});

// turtles gently push each other apart instead of overlapping
function separate() {
  for (let i = 0; i < turtles.length; i++) for (let j = i + 1; j < turtles.length; j++) {
    const a = turtles[i], b = turtles[j], d = dist(a, b), m = (a.S + b.S) * 0.95;
    if (d < m && d > 0.01) {
      const push = (m - d) / 2, nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      for (const t of [a, b]) if (!(t.bumpCool > performance.now())) { // a friendly bump
        t.bumpCool = performance.now() + 1500;
        if (t.st.social < 60) emit(t.x, t.y - t.S, 'heart');
        t.st.social = clamp(t.st.social + 8, 0, 100);
      }
    }
  }
}

let last = performance.now();
// Slow device? Draw fewer pixels. Every 2 seconds, if most frames missed ~40fps, step the canvas resolution down (never below 1×).
const perf = { n: 0, slow: 0, sum: 0, fps: 0 };
function adaptRes(gap) {
  if (gap > 150) return; // app was paused or a one-off hitch
  perf.n++; perf.sum += gap; if (gap > 25) perf.slow++;
  if (perf.sum < 2000) return;
  perf.fps = Math.round(1000 * perf.n / perf.sum);
  if (perf.slow > perf.n * 0.6 && DPR > 1) { dprCap = Math.max(1, DPR - 0.5); resize(); }
  perf.n = perf.slow = perf.sum = 0;
}
window.__perf = perf;

function frame(now) {
  adaptRes(now - last);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const time = now / 1000;
  graceT -= dt; waterStarCool -= dt;
  const v = viewRect();
  for (const t of turtles) {
    use(t);
    // off-screen turtles keep living but skip the leg animation; feet snap back into place when they reappear
    const vis = inView(t, t.S * 3, v);
    if (vis && t.off) resetFeet();
    t.off = !vis;
    if (!t.dying) { think(dt); updateStats(dt); }
    if (vis) updateFeet(dt);
  }
  if (turtles.some(t => t.releasing !== undefined && (t.releasing -= dt) <= 0)) {
    turtles = turtles.filter(t => !(t.releasing <= 0));
    if (!turtles.length) { // the yard is never empty: a new hatchling wanders in
      const t = makeTurtle({ name: NAMES[Math.floor(rand(0, NAMES.length))], growth: 0, x: cam.x, y: cam.y });
      turtles.push(t); use(t); resetFeet(); graceT = GRACE_SECS;
      setTimeout(() => say(`🥚 A new hatchling, ${t.name}, wandered into your yard`), 1200);
    }
    if (!turtles.includes(sel)) sel = turtles[0];
    save();
  }
  separate();
  updateBall(dt);
  bowl.fill = Math.max(0, bowl.fill - dt);
  if (BOWLS[up.bowl].refill) bowl.level = Math.min(1, bowl.level + dt / 600); // fountain tops itself up
  const feeder = up.feeder && objOf('feeder');
  if (feeder) {
    const F = FEEDERS[up.feeder];
    if ((feederT += dt) > F.every) {
      feederT = 0;
      if (foods.filter(f => f.slot === undefined).length < 6 && foods.filter(f => f.fromFeeder).length < 2 && turtles.some(t => t.st.hunger < 65)) {
        const f = feederFood(feeder, F); foods.push(f); emit(f.x, f.y, 'crumb', 6);
      }
    }
  }
  poops.forEach(p => p.born += dt);
  marker = isPicked() ? sel.userTarget : null;
  const nowMs = Date.now(), dk = darkness();
  gardenTick(nowMs);
  if (objOf('garden')) for (const f of foods) if (f.slot !== undefined) { const sp = slotPos(f.slot); f.x = sp.x; f.y = sp.y; }
  updateCrabs(dt);
  updateFlies(dt, dk, v);

  // ----- draw (world space) -----
  drawYard(v);
  const pond = objOf('pond'), rock = objOf('rock'), mud = objOf('mud'), slide = objOf('slide'), lamp = objOf('lamp'), garden = objOf('garden'), mirror = objOf('mirror');
  if (lamp && inView(lamp, LAMP_R, v)) drawLampGlow(lamp, dk);
  if (pond && inView(pond, POND.rx + 20, v)) drawPond(pond, time);
  if (mud && inView(mud, MUD.rx + 10, v)) drawMud(mud, time);
  if (rock && inView(rock, 70, v)) drawRock(rock);
  if (slide && inView(slide, SLIDE.len, v)) drawSlide(slide);
  if (garden && inView(garden, 100, v)) drawGarden(garden, nowMs);
  for (const o of objs) if (o.kind === 'deco' && !DECOS[o.type].tall && inView(o, 40, v)) drawDeco(o, time, dk);
  for (const p of poops) if (inView(p, 30, v)) drawPoop(p, time);
  for (const f of foods) if (inView(f, 30, v)) drawFoodItem(f);
  if (inView(bowl, bowl.r + 10, v)) drawBowl(time); // low to the ground: turtles always walk over it
  drawMarker(time);
  // turtles, crabs, toy, bowl, feeder, mirror and tall decorations back-to-front so overlaps look right
  const order = [...turtles.filter(t => !t.off), ...(feeder ? [feeder] : []), ...(ball ? [ball] : []), ...(mirror ? [mirror] : []),
    ...crabs.filter(c => inView(c, 20, v)), ...objs.filter(o => o.kind === 'deco' && DECOS[o.type].tall && inView(o, 50, v))].sort((a, b) => a.y - b.y);
  for (const o of order) {
    if (o === ball) drawBall();
    else if (o === feeder) drawFeeder(o, time);
    else if (o === mirror) drawMirror(o, time);
    else if (o.crab) drawCrab(o);
    else if (o.kind === 'deco') drawDeco(o, time, dk);
    else {
      use(o);
      const lift = slide ? slideLift(o, slide) : 0;
      if (lift) S = o.S * (1 + 0.28 * lift); // higher up the slide = closer to the camera
      if (o.swim) { ctx.fillStyle = 'rgba(20,60,100,0.28)'; ctx.beginPath(); ctx.ellipse(o.x, o.y, o.S * 1.5, o.S * 1.3, o.a, 0, 7); ctx.fill(); }
      ctx.globalAlpha = clamp(o.releasing ?? 1, 0, 1) * (o.swim ? 0.88 : 1);
      drawTurtle(time);
      ctx.globalAlpha = 1;
      if (o.swim) { ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(o.x, o.y, o.S * 1.25, o.S * 1.05, o.a, 0, 7); ctx.stroke(); }
    }
  }
  // tunnels, roofs and the lamp cover what's under them
  const log = objOf('log'), hut = objOf('hut');
  if (log && inView(log, LOG.len, v)) drawLog(log);
  if (hut && inView(hut, HUT.r + 10, v)) drawHut(hut);
  if (lamp && inView(lamp, 40, v)) drawLamp(lamp, time);
  ctx.setLineDash([8 / cam.z, 6 / cam.z]); ctx.lineDashOffset = -time * 20; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5 / cam.z;
  if (placing) { ctx.beginPath(); ctx.arc(placing.x, placing.y, 70, 0, 7); ctx.stroke(); }
  if (arranging) for (const o of movables()) { ctx.beginPath(); ctx.arc(o.x, o.y, hitR(o) + 6, 0, 7); ctx.stroke(); }
  ctx.setLineDash([]);
  drawNight(dk);
  drawFlies(dk);
  worldTransform();
  drawParts(dt);
  use(sel);
  drawHud();
  requestAnimationFrame(frame);
}

resize(); // measures the HUD
const info = load();
const firstWorld = !base;
if (!base) base = { w: Math.max(340, W), h: Math.max(460, viewH()) };
if (info.legacy) for (const p of [...turtles, ...poops, ...foods]) p.y -= TOP; // old saves used screen coordinates
if (!info.hadBowl) { bowl.x = base.w - 60; bowl.y = 58; }
if (info.fresh) { turtles[0].x = base.w / 2; turtles[0].y = base.h / 2; }
applyYard();
if (firstWorld) { cam.x = YW / 2; cam.y = YH / 2; cam.z = 1; clampCam(); }
for (const t of turtles) { use(t); resetFeet(); }
use(sel);
if (info.away > 90) showAway(simulateAway(info.away));
if (info.newStars) setTimeout(() => say('New: collect ⭐ by caring for your turtles. Tap ⭐ to shop!', 4000), 800);
dailyBonus();
ensurePlots(); syncCrabs();
addEventListener('resize', resize);
setInterval(save, 4000);
addEventListener('pagehide', save);
// Switching away from the app counts as being away: simulate that time when you come back.
let hiddenAt = null;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); save(); return; }
  if (hiddenAt === null) return;
  const away = (Date.now() - hiddenAt) / 1000;
  hiddenAt = null; last = performance.now();
  if (away > 90) { graceT = GRACE_SECS; showAway(simulateAway(away)); dailyBonus(); save(); }
});
window.turtle = { get turtles() { return turtles; }, get sel() { return sel; }, get ball() { return ball; }, get foods() { return foods; }, get poops() { return poops; }, bowl, grow: a => { use(sel); grow(a); }, simulateAway: secs => showAway(simulateAway(secs)), endGrace: () => { graceT = 0; }, addStars: n => { stars += n; }, cam, get up() { return up; }, get objs() { return objs; }, get crabs() { return crabs; }, get plots() { return plots; }, setHour: h => { hourOverride = h; } };
requestAnimationFrame(frame);
