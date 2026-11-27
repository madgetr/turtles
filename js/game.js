// Pet Turtle: top-down, procedurally animated turtle you can call, feed, water, clean up after and play with.
import * as snd from './sound.js';
// play a sound for something happening at world point p (skipped when it's off screen)
// ?lab = turtle builder debug page (js/lab.js): the game never starts and never saves
const LAB = new URLSearchParams(location.search).has('lab');
const sfx = (name, p) => { if (!p || inView(p, 80, viewRect())) snd.play(name); };
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
// fits = how many turtles the yard has room for (adopting more needs a bigger yard)
const YARDS = [
  { name: 'Small', m: 1, fits: 3 }, { name: 'Medium', m: 1.6, cost: 60, fits: 5 }, { name: 'Large', m: 2.3, cost: 180, fits: 7 },
  { name: 'Huge', m: 3.2, cost: 400, fits: 8 }, { name: 'Giant', m: 4.2, cost: 1200, fits: 10 },
];
const BOWLS = [
  { name: 'Water bowl', r: 38, cap: 1 }, { name: 'Big bowl', r: 46, cap: 2, cost: 25 }, { name: 'Fountain', r: 60, cap: 3, cost: 120, refill: 1 },
  { name: 'Grand fountain', r: 108, cap: 6, cost: 500, refill: 2 }, // a turtle family can drink all the way round
];
const FEEDERS = [null,
  { name: 'Auto feeder', cost: 60, every: 45, awayEvery: 3 * 3600 },
  { name: 'Deluxe feeder', cost: 150, every: 25, awayEvery: 1.5 * 3600, berries: true },
  { name: 'Mega feeder', cost: 500, every: 14, awayEvery: 0.75 * 3600, berries: true, max: 4 }];
const TOYS = {
  ball: { name: 'Ball', icon: '🔴', r: 13, cost: 0, push: 1, drag: 0.35, desc: 'The classic.' },
  bell: { name: 'Bell ball', icon: '🔔', r: 12, cost: 20, push: 1, drag: 0.35, desc: 'Jingles! Playtime makes turtles extra happy.' },
  treat: { name: 'Treat ball', icon: '🍪', r: 14, cost: 40, push: 0.9, drag: 0.3, desc: 'Drops a snack now and then when nudged.' },
  beach: { name: 'Beach ball', icon: '🏖️', r: 24, cost: 50, push: 1.5, drag: 0.55, desc: 'Big, light and bouncy.' },
};
// Rocks: one of each kind. All are basking spots; each has its own look and a perk.
const ROCKS = {
  rock: { name: 'Basking rock', icon: '🪨', cost: 20, rx: 90, ry: 58, look: 'oval', col: ['#9b9286', '#b3aa9d', '#c8bfb2'], desc: 'A warm spot to nap in the sun.' },
  sandrock: { name: 'Sandstone rock', icon: '🏜️', cost: 120, rx: 106, ry: 67, look: 'layers', col: ['#c98f52', '#dcaa6c', '#ecc890'], sun: 1, desc: 'Soaks up the sun: basking here is extra cozy.' },
  clayrock: { name: 'Clay boulder', icon: '🧱', cost: 150, rx: 83, ry: 70, look: 'lumpy', col: ['#a45a3c', '#bf7452', '#d8946e'], nap: 1, desc: 'Cool and smooth. Tired turtles rest up fast on it.' },
  mossrock: { name: 'Mossy rock', icon: '🍃', cost: 180, rx: 96, ry: 64, look: 'moss', col: ['#7f8a78', '#97a28f', '#b0b9a6'], shy: 1, desc: 'Soft and quiet. Shy turtles feel safe here.' },
  slab: { name: 'Sunning slab', icon: '🌞', cost: 220, rx: 154, ry: 54, look: 'slab', col: ['#8e8a80', '#a8a499', '#c2beb3'], sun: 0.5, desc: 'A long flat stone with room for a row of sunbathers.' },
  heatrock: { name: 'Heated rock', icon: '♨️', cost: 400, rx: 86, ry: 61, look: 'heat', col: ['#4a4440', '#5e5752', '#746c66'], heat: 1, desc: 'Warm all night long, and glows softly in the dark.' },
  lookout: { name: 'Lookout rock', icon: '⛰️', cost: 1800, rx: 223, ry: 148, look: 'lookout', col: ['#8b7f70', '#a39684', '#bdb09c'], climb: 1, needYard: 3, desc: 'A giant rock with a ledge on top. The whole family can climb up and look out over the yard.' },
};
const rockDims = o => { const r = ROCKS[o.kind], k = sizeK(o.kind); return { rx: r.rx * k, ry: r.ry * k }; };
const rocksPlaced = () => objs.filter(o => ROCKS[o.kind]);
const STRUCTS = {
  log: { name: 'Log tunnel', icon: '🪵', cost: 45, desc: 'Curious turtles love crawling through.' },
  hut: { name: 'Hideaway hut', icon: '🛖', cost: 70, desc: 'A cozy hideout. Grumpy turtles calm down inside.' },
  pond: { name: 'Pond', icon: '🌊', cost: 200, desc: 'Swim, splash and drink as much as they like.', needYard: 1 },
  mud: { name: 'Mud pit', icon: '🟫', cost: 60, desc: 'Turtles love a good roll. Wash them afterwards!' },
  slide: { name: 'Slide', icon: '🛝', cost: 80, desc: 'Climb up, zoom down. Wheee!' },
  mirror: { name: 'Mirror', icon: '🪞', cost: 35, desc: 'Curious turtles admire themselves. Grumpy ones... not so much.' },
  mossbed: { name: 'Moss bed', icon: '🛏️', cost: 300, desc: 'A soft mossy bed. Turtles sleep deeper here and love to pile up together.' },
  fog: { name: 'Fog machine', icon: '🌫️', cost: 350, desc: 'Puffs cool mist. Turtles love a misty stroll, mud stays soft, and it glows at night.' },
  cave: { name: 'Stone cave', icon: '🕳️', cost: 400, desc: 'A cool stone hideout. Shy turtles adore it.' },
};
// Wildlife you can attract: a bit comes free, the rest from these. Each level costs more.
const WILD = {
  birdfeeder: { name: 'Bird feeder', icon: '🐦', costs: [80, 200, 450], desc: ['Birds come to visit and sometimes drop a feather find.', 'More birds, more feathers.', 'A whole flock, and lots of feathers.'] },
  lily: { name: 'Lily pads', icon: '🐸', costs: [70, 180, 400], desc: ['Lily pads on the pond, and 2 more frogs.', 'More pads, 2 more frogs.', 'A frog chorus at night!'], needs: 'pond' },
  bughotel: { name: 'Bug hotel', icon: '🐞', costs: [120, 350], desc: ['Ladybugs and dragonflies move in. Treasures turn up critter finds more often.', 'Even more bugs, and more critter finds.'] },
};
const BED = { rx: 82, ry: 56 }, FOG_R = 170, CAVE = { r: 125 }, TREE_R = 150;
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
  coral: { name: 'Coral', icon: '🪸', cost: 40, emoji: true, size: 40, tall: true },
  rose: { name: 'Rose bush', icon: '🌹', cost: 35, emoji: true, size: 36, tall: true },
  sunflower: { name: 'Sunflower', icon: '🌻', cost: 35, emoji: true, size: 42, tall: true },
  cactus: { name: 'Cactus', icon: '🌵', cost: 45, emoji: true, size: 42, tall: true },
  umbrella: { name: 'Beach umbrella', icon: '⛱️', cost: 45, emoji: true, size: 46, tall: true },
  dotstone: { name: 'Ladybug stone', icon: '🐞', cost: 40, emoji: true, size: 30 },
  amethyst: { name: 'Amethyst geode', icon: '🔮', cost: 70, emoji: true, size: 36, tall: true },
  obsidian: { name: 'Obsidian rock', icon: '🌑', cost: 70, emoji: true, size: 32 },
  rainbow: { name: 'Rainbow arch', icon: '🌈', cost: 160, emoji: true, size: 58, tall: true },
  pearl: { name: 'Giant pearl', icon: '🦪', cost: 220, emoji: true, size: 36, desc: 'Very rare albino turtles love it.' },
  idol: { name: 'Golden idol', icon: '🏆', cost: 300, emoji: true, size: 40, tall: true, desc: 'Said to bring golden hatchlings.' },
  castle: { name: 'Sandcastle', icon: '🏰', emoji: true, reward: true, tall: true },
  crystal: { name: 'Glowing crystal', icon: '💎', emoji: true, reward: true, tall: true, light: true },
  statue: { name: 'Stone statue', icon: '🗿', emoji: true, reward: true, tall: true },
  wishtree: { name: 'Wishing tree', icon: '🎋', emoji: true, reward: true, tall: true },
  frogstatue: { name: 'Frog statue', icon: '🐸', emoji: true, reward: true, tall: true },
  flag: { name: 'Pirate flag', icon: '🏴‍☠️', emoji: true, reward: true, tall: true },
  bbush: { name: 'Butterfly bush', icon: '🦋', cost: 60, step: 40, tall: true, wild: true, desc: 'Purple flowers that bring 3 more butterflies each.' },
  tree: { name: 'Shade tree', icon: '🌳', cost: 150, step: 75, canopy: true, desc: 'Turtles nap in its shade on sunny days. Every tree grows a little differently.' },
};
// Each tree's size and look come from its seed: 85-130% of TREE_R, its own greens, some in blossom or fruit.
function treeLook(o) {
  if (o.look) return o.look;
  const r = seeded(o.seed || 0.83), sc = 0.85 + r() * 0.45, R0 = TREE_R * sc, kind = r();
  const hue = 95 + r() * 35, sat = 30 + r() * 22, light = 26 + r() * 12;
  const blobs = Array.from({ length: 8 + Math.floor(r() * 7) }, () => {
    const a = r() * 6.28, d = Math.sqrt(r()) * 0.62;
    return { x: Math.cos(a) * R0 * d, y: Math.sin(a) * R0 * d * 0.72, r: R0 * (0.3 + r() * 0.24), l: light + (r() - 0.5) * 10 };
  });
  const tufts = Array.from({ length: 5 + Math.floor(r() * 6) }, () => ({ x: (r() - 0.5) * R0 * 1.3, y: (r() - 0.65) * R0 * 0.8, r: 10 + r() * 18 }));
  const dots = kind > 0.72 ? Array.from({ length: 14 + Math.floor(r() * 12) }, () => ({ x: (r() - 0.5) * R0 * 1.4, y: (r() - 0.55) * R0, r: 2.5 + r() * 2.5 })) : [];
  return (o.look = { R: R0, lean: (r() - 0.5) * R0 * 0.25, hue, sat, light, blobs, tufts, dots, dotCol: r() < 0.5 ? '#f4a6c4' : '#d8423a' });
}
const trees = () => objs.filter(o => o.kind === 'deco' && o.type === 'tree');
const MUD = { rx: 72, ry: 46 }, SLIDE = { len: 150, w: 46 }, SLOT = 44;
let LAMP_R = 130;
// Bigger versions of placed things, bought once the smaller one is in the yard. k scales its size.
const SIZES = {
  hut: [null, { name: 'Big hut', k: 1.4, cost: 300, desc: 'Room for more turtles to hide and sleep.' }, { name: 'Turtle lodge', k: 1.85, cost: 900, desc: 'A grand hideout for a big turtle family.' }],
  pond: [null, { name: 'Big pond', k: 1.4, cost: 600, needYard: 2, desc: 'More room to swim.' }, { name: 'Lake', k: 1.85, cost: 1500, needYard: 4, desc: 'A whole lake for a whole family.' }],
  lamp: [null, { name: 'Big heat lamp', k: 1.45, cost: 350, desc: 'Warms a much bigger patch of the yard.' }, { name: 'Sun lamp', k: 1.9, cost: 900, desc: 'Warmth for the whole gang on cold nights.' }],
  rock: [null, { name: 'Big basking rock', k: 1.5, cost: 150, desc: 'Space for several sunbathers.' }],
  log: [null, { name: 'Long log tunnel', k: 1.5, cost: 200, desc: 'A longer, roomier tunnel.' }],
  mud: [null, { name: 'Big mud pit', k: 1.5, cost: 250, desc: 'Room for a muddy pile-up.' }],
};
const sizeK = kind => SIZES[kind]?.[up.size[kind] || 0]?.k || 1;
const GROW_MS = { lettuce: 20 * 60e3, berry: 40 * 60e3 }; // garden growing time (real time)
let plots = [];   // garden slots: { t0 (planted, ms) }
let crabs = [];   // clean-up crabs (not saved: they just scuttle back in)
let ground = {};  // painted tiles: "col,row" -> ground type (unpainted = sand)
const TILE = 40;
const tileKey = p => `${Math.floor(p.x / TILE)},${Math.floor(p.y / TILE)}`;
const inWater = p => ground[tileKey(p)] === 'water';
let flies = [];   // fireflies at night
let arranging = false, hourOverride = null;
const POND = { rx: 120, ry: 78 }, LOG = { len: 150, r: 40 }, HUT = { r: 54 }, FEEDER_R = 26;
let up = { yard: 0, bowl: 0, feeder: 0, toys: ['ball'], toy: 'ball', crab: 0, vet: 0, garden: 0, size: {}, birds: 0, lily: 0, bugs: 0, brushes: ['sand'] };
const UP0 = JSON.parse(JSON.stringify(up)); // a brand-new yard's upgrades
const SHARED_UP = ['toys', 'toy', 'vet', 'brushes']; // owned once, used in every yard
let objs = []; // placed things: { kind: 'feeder' | 'rock' | 'log' | 'hut' | 'pond', x, y }
let stars = 0, lastDaily = '', base = null, feederT = 0, waterStarCool = 0;
let YW = 400, YH = 600;
const cam = { x: 200, y: 300, z: 1 };
let placing = null; // object waiting for a tap to be put down
const objOf = kind => objs.find(o => o.kind === kind);
const inPond = p => { const o = objOf('pond'); return (!!o && ((p.x - o.x) / POND.rx) ** 2 + ((p.y - o.y) / POND.ry) ** 2 < 1) || inWater(p); }; // painted water counts as pond
const structCount = () => objs.filter(o => STRUCTS[o.kind] || ROCKS[o.kind]).length;

// Growth: 0 = fresh hatchling, 1 = full-grown. Size (half shell length) scales with it.
const MIN_S = 15, MAX_S = 44;
const STAGES = [[0, 'Hatchling'], [0.15, 'Baby'], [0.4, 'Juvenile'], [0.7, 'Young adult'], [1, 'Adult']];
const stageOf = g => STAGES.filter(([t]) => g >= t).pop()[1];
const aStage = name => (/^[AEIOU]/.test(name) ? 'an ' : 'a ') + name;
const GROW_RATE = 1; // growth multiplier (10 = fast, for testing)
// Hatchling to adult takes about a month of real time with good care (fed, watered, healthy), open or not.
// ~85% of it comes from time; snacks add a small boost on top.
// "3 hours old", "12 days old", "2 months old"
function ageText(t) {
  const h = (Date.now() - t.born) / 3600e3, d = h / 24;
  if (h < 1) return 'Just hatched';
  if (h < 24) return `${Math.floor(h)} hour${h < 2 ? '' : 's'} old`;
  if (d < 60) return `${Math.floor(d)} day${d < 2 ? '' : 's'} old`;
  const mo = d / 30.4;
  return mo < 24 ? `${Math.floor(mo)} months old` : `${Math.floor(mo / 12)} years old`;
}
const GROW_DAYS = 30, GROW_PER_SEC = 0.85 / (GROW_DAYS * 86400), GROW_PER_BITE = 0.00015;
const sizeFor = g => lerp(MIN_S, MAX_S, Math.sqrt(clamp(g, 0, 1))); // grows fast early, slows later

// ---------- turtles ----------
// Each turtle has its own body, needs, health and growth. The brain/legs/drawing code works on the
// "current" turtle via T, S (its size) and st (its stats); use(t) switches which one that is.
const MAX_TURTLES = 10;
const NAMES = [
  'Shelly', 'Pebble', 'Tank', 'Mossy', 'Sheldon', 'Dot', 'Biscuit', 'Ziggy', 'Clover', 'Nugget', 'Pickle', 'Peanut',
  'Sprout', 'Bean', 'Basil', 'Olive', 'Maple', 'Hazel', 'Juniper', 'Willow', 'Fern', 'Ivy', 'Sage', 'Pip',
  'Poppy', 'Daisy', 'Lily', 'Tulip', 'Acorn', 'Chestnut', 'Walnut', 'Pecan', 'Cashew', 'Mochi', 'Dumpling', 'Noodle',
  'Waffle', 'Muffin', 'Cookie', 'Cupcake', 'Pudding', 'Jelly', 'Toffee', 'Fudge', 'Pretzel', 'Nacho', 'Taco', 'Bagel',
  'Sushi', 'Kiwi', 'Mango', 'Peach', 'Plum', 'Fig', 'Cherry', 'Berry', 'Lemon', 'Lime', 'Melon', 'Pumpkin',
  'Squash', 'Turnip', 'Radish', 'Leafy', 'Cabbage', 'Tater', 'Spud', 'Crouton', 'Gizmo', 'Gadget', 'Widget', 'Sprocket',
  'Rocket', 'Comet', 'Cosmo', 'Luna', 'Nova', 'Star', 'Orbit', 'Pluto', 'Ripple', 'Splash', 'Puddle', 'Brook',
  'River', 'Wave', 'Coral', 'Reef', 'Sandy', 'Dusty', 'Rocky', 'Boulder', 'Pebbles', 'Flint', 'Slate', 'Cobble',
  'Marble', 'Jasper', 'Onyx', 'Opal', 'Turbo', 'Zippy', 'Dash', 'Bolt', 'Scooter', 'Bumble', 'Wiggles', 'Snappy',
  'Doodle', 'Noodles', 'Bubbles', 'Buttons', 'Pickles', 'Sparky', 'Speedy', 'Sleepy', 'Grumpy', 'Happy', 'Lucky', 'Sunny',
];
// a random name nobody in the yard has yet (falls back to 'Turtle 7' style if all are taken)
function randomName() {
  const used = new Set([...turtles.map(t => t.name), ...yards.flatMap((y, i) => (i === yardIdx || !y ? [] : y.turtles.map(t => t.name)))]), free = NAMES.filter(n => !used.has(n));
  if (free.length) return free[Math.floor(Math.random() * free.length)];
  let i = turtles.length + 1; while (used.has(`Turtle ${i}`)) i++;
  return `Turtle ${i}`;
}
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
    ...o,
  };
  if (!t.name) t.name = randomName();
  if (!t.morph) t.morph = {}; // rare colours/features (only new hatchlings roll them: see rollMorph)
  if (!t.born) t.born = Date.now() - (t.growth || 0) * GROW_DAYS * 86400e3; // hatch time; older saves: guessed from how grown it is
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
  measureBottom();
  makeSand();
  if (base) applyYard();
}

function applyYard() {
  const m = YARDS[up.yard].m;
  YW = Math.round(base.w * m); YH = Math.round(base.h * m);
  bowl.r = BOWLS[up.bowl].r;
  const k = sizeK;
  POND.rx = 120 * k('pond'); POND.ry = 78 * k('pond'); HUT.r = 54 * k('hut');
  LOG.len = 150 * k('log'); LOG.r = 40 * (1 + (k('log') - 1) * 0.3); MUD.rx = 72 * k('mud'); MUD.ry = 46 * k('mud'); LAMP_R = 130 * k('lamp');
  for (const p of [...poops, ...foods, ...objs, bowl]) keepInYard(p);
  for (const t of turtles) { t.x = clamp(t.x, 35, YW - 35); t.y = clamp(t.y, 25, YH - 15); }
  makeDeco(); clampCam();
}

const keepInYard = p => { // placed things keep their whole body inside the fence
  const big = p === bowl || p.kind, mx = big ? Math.min(YW / 2, Math.max(24, p.kind === 'pond' ? POND.rx + 12 : hitR(p))) : 24, my = big ? Math.min(YH / 2, Math.max(16, p.kind === 'pond' ? POND.ry + 10 : hitR(p) * 0.8)) : 16;
  p.x = clamp(p.x, mx, YW - mx); p.y = clamp(p.y, my, YH - my);
};
const viewH = () => H - TOP - BOTTOM;
const vcx = () => W / 2, vcy = () => TOP + viewH() / 2; // screen point the camera centers on
const zMin = () => Math.min(W / YW, viewH() / YH);   // zoomed all the way out = whole yard fits (can be >1 on big screens)
// Every device gets the same yard; bigger screens just zoom in further.
const STD_BASE = { w: 375, h: 677 };
const zMax = () => 2.5 * Math.max(1, Math.min(W / STD_BASE.w, viewH() / STD_BASE.h));
function measureBottom() { // the visible yard ends at the toolbar, or at the paint palette while painting
  const el = painting ? paintbar : document.getElementById('tools');
  BOTTOM = Math.round(H - el.getBoundingClientRect().top + 6);
}
// Opening a turtle's stats glides the camera over and zooms in, framing it in the space above the card.
// It keeps following while the card is open; closing the card leaves the view where it is.
let camFollow = null;
function focusTurtle(t, glide) { const ds = zMax() / 2.5; camFollow = { t, z: clamp(55 / t.S * ds, 1.3 * ds, zMax()), until: glide ? performance.now() + 1500 : 0 }; }
function followCam(dt) {
  if (!camFollow) return;
  if (!turtles.includes(camFollow.t) || (camFollow.until ? performance.now() > camFollow.until : menu.hidden)) { camFollow = null; return; }
  const card = menu.hidden ? null : menu.querySelector('.card').getBoundingClientRect();
  const sy = card ? TOP + Math.max(40, (card.top - TOP) / 2) : vcy(); // middle of the space above the card, or the view
  const k = Math.min(1, dt * 4), t = camFollow.t;
  cam.z = lerp(cam.z, clamp(camFollow.z, zMin(), zMax()), k);
  cam.x = lerp(cam.x, t.x, k);
  cam.y = lerp(cam.y, t.y - (sy - vcy()) / cam.z, k);
  clampCam();
}
function clampCam() {
  cam.z = clamp(cam.z, zMin(), zMax());
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
  drawGround(v);
  // wooden fence
  c.strokeStyle = '#6b4a2a'; c.lineWidth = 7; c.strokeRect(-4, -4, YW + 8, YH + 8);
  c.strokeStyle = '#9a6e40'; c.lineWidth = 3; c.strokeRect(-4, -4, YW + 8, YH + 8);
  c.fillStyle = '#5a3c20';
  for (let x = -4; x <= YW + 4; x += 60) for (const y of [-4, YH + 4]) { c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill(); }
  for (let y = 56; y < YH; y += 60) for (const x of [-4, YW + 4]) { c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill(); }
}

// ---------- persistence ----------
// v3 keeps several yards. The yard on screen lives in the usual globals; the others are stored packed.
// Older saves (v2, v1) are read once and become "My Yard"; the v2 save is left untouched as a backup.
const SAVE3 = 'turtle-save-v3', SAVE = 'turtle-save-v2', OLD_SAVE = 'turtle-save-v1';
const KEEP = ['name', 'tint', 'traits', 'st', 'x', 'y', 'a', 'gut', 'growth', 'mud', 'chub', 'diet', 'born', 'arrived', 'morph'];
let yards = [null], yardIdx = 0, yardName = 'My Yard';
const packTurtle = t => Object.fromEntries(KEEP.map(k => [k, t[k]]));
let wildPool = [], wildNets = [0, 0, 0]; // released + native wild turtles (shared across yards), nets owned per tier
const own = t => t.releasing === undefined && !t.guest; // your turtles (not fading away, not a friend's visiting turtle)
function packYard() {
  return {
    name: yardName, t: Date.now(),
    turtles: turtles.filter(own).map(packTurtle), sel: Math.max(0, turtles.filter(own).indexOf(sel)),
    poops, level: bowl.level,
    foods: foods.map(({ x, y, type, bites, max, rot, fromFeeder, slot, t }) => ({ x, y, type, bites, max, rot, fromFeeder, slot, t })),
    up: Object.fromEntries(Object.entries(up).filter(([k]) => !SHARED_UP.includes(k))),
    objs: objs.map(({ kind, type, seed, x, y }) => ({ kind, type, seed, x, y })), plots, ground,
    bowlPos: { x: bowl.x, y: bowl.y }, cam: { x: cam.x, y: cam.y, z: cam.z },
  };
}
function setYardState(y) { // put a packed yard into the globals (no layout yet: call applyYard after)
  yardName = y.name || 'My Yard';
  poops = y.poops || []; bowl.level = y.level ?? 1; foods = y.foods || [];
  turtles = (y.turtles || []).map(o => makeTurtle({ ...o, gut: o.gut || [] }));
  sel = turtles[y.sel] || turtles[0];
  const shared = Object.fromEntries(SHARED_UP.map(k => [k, up[k]]));
  up = { ...JSON.parse(JSON.stringify(UP0)), ...(y.up || {}), ...shared }; up.size = { ...(up.size || {}) };
  objs = (y.objs || []).map(o => (o.kind === 'tree' ? { kind: 'deco', type: 'tree', seed: o.seed ?? Math.random(), x: o.x, y: o.y } : o));
  plots = y.plots || [];
  if (!y.ground || y.ground !== ground) { ground = y.ground || {}; groundChanged(); } // same object = same tiles (visits resend the yard often)
  if (y.bowlPos) Object.assign(bowl, y.bowlPos); else if (base) { bowl.x = base.w - 60; bowl.y = 58; }
  if (y.cam) Object.assign(cam, y.cam);
}
// Older saves sized the yard to the screen they started on. Scale everything to the standard size once,
// keeping each thing in the same relative spot.
function rescaleToStandard() {
  if (!base || (base.w === STD_BASE.w && base.h === STD_BASE.h)) return;
  const sx = STD_BASE.w / base.w, sy = STD_BASE.h / base.h, P = p => { if (p && typeof p.x === 'number') { p.x *= sx; p.y *= sy; } };
  yards[yardIdx] = packYard();
  for (const y of yards) {
    if (!y) continue;
    for (const list of [y.turtles, y.objs, y.poops, y.foods]) (list || []).forEach(P);
    P(y.bowlPos); P(y.cam);
    if (y.ground) { // move painted tiles to where their centre lands now
      const g2 = {};
      for (const [k, t] of Object.entries(y.ground)) { const [c, r] = k.split(',').map(Number); g2[`${Math.floor((c + 0.5) * TILE * sx / TILE)},${Math.floor((r + 0.5) * TILE * sy / TILE)}`] = t; }
      y.ground = g2;
    }
  }
  loot.treasures.forEach(P); P(loot.gift);
  base = { ...STD_BASE };
  setYardState(yards[yardIdx]);
}
let loadingBackup = false;
function save() {
  if (LAB || loadingBackup) return; // a backup is being loaded: don't write the old game over it
  yards[yardIdx] = visit?.home || packYard(); // visiting a friend: your own yard waits in visit.home
  localStorage.setItem(SAVE3, JSON.stringify({
    v: 3, yards, active: yardIdx, base, t: Date.now(),
    shared: { stars, lastDaily, loot, wildPool, wildNets, ...Object.fromEntries(SHARED_UP.map(k => [k, up[k]])) },
  }));
}
// Loads the save. Returns { away (seconds), fresh, legacy (old screen coordinates), newStars }.
function load() {
  let d3 = null;
  try { d3 = JSON.parse(localStorage.getItem(SAVE3)); } catch { }
  if (d3?.yards?.length) {
    const sh = d3.shared || {};
    base = d3.base || null; stars = sh.stars ?? 30; lastDaily = sh.lastDaily || '';
    loot = { ...loot, ...(sh.loot || {}) };
    wildPool = sh.wildPool || []; wildNets = sh.wildNets || [0, 0, 0];
    for (const k of SHARED_UP) if (sh[k] !== undefined) up[k] = sh[k];
    yards = d3.yards; yardIdx = clamp(d3.active | 0, 0, yards.length - 1);
    const y = yards[yardIdx];
    setYardState(y);
    if (!turtles.length) { turtles = [makeTurtle()]; sel = turtles[0]; }
    return { away: clamp((Date.now() - (y.t || Date.now())) / 1000, 0, 7 * 86400), hadBowl: !!y.bowlPos };
  }
  let d = null; // no v3 yet: upgrade from the single-yard save
  try { d = JSON.parse(localStorage.getItem(SAVE)); } catch { }
  if (!d) { // migrate the single-turtle save
    try {
      const o = JSON.parse(localStorage.getItem(OLD_SAVE));
      if (o) d = { turtles: [{ name: 'Shelly', st: o.st, x: o.x, y: o.y, a: o.a, gut: o.gut, growth: o.growth ?? 0.12 }], sel: 0, poops: o.poops, level: o.level, t: o.t };
    } catch { }
  }
  if (!d || !d.turtles?.length) { turtles = [makeTurtle({ morph: rollMorph() })]; sel = turtles[0]; stars = 15; return { away: 0, fresh: true }; }
  poops = d.poops || []; bowl.level = d.level ?? 1; foods = d.foods || [];
  turtles = d.turtles.map(o => makeTurtle({ ...o, gut: o.gut || [] }));
  sel = turtles[d.sel] || turtles[0];
  base = d.base || null; up = { ...up, ...(d.up || {}) }; up.size = { ...(up.size || {}) }; objs = (d.objs || []).map(o => (o.kind === 'tree' ? { kind: 'deco', type: 'tree', seed: o.seed ?? Math.random(), x: o.x, y: o.y } : o)); plots = d.plots || [];
  stars = d.stars ?? 30; lastDaily = d.lastDaily || '';
  loot = { ...loot, ...(d.loot || {}) };
  if (d.bowlPos) Object.assign(bowl, d.bowlPos);
  if (d.cam) Object.assign(cam, d.cam);
  return { away: clamp((Date.now() - d.t) / 1000, 0, 7 * 86400), legacy: !d.world, newStars: d.stars === undefined, hadBowl: !!d.bowlPos };
}

// ---------- life goes on while the game is closed ----------
// Rates while away (per second). Turtles drink
// from the bowl / eats leftover food by itself. Run out of both and health starts dropping.
const AWAY_FLOOR = 15;
const AWAY = { // tuned for a ~7-8 h school day (fine, just hungry/thirsty), while skipping a full 24 h hurts health
  hunger: 100 / (12 * 3600), thirst: 100 / (9 * 3600), happy: 100 / (16 * 3600), dirty: 100 / (36 * 3600),
  hurt: 100 / (12 * 3600), filth: 100 / (22 * 3600), heal: 100 / (10 * 3600), // full recovery takes ~10 h away
};
function healthStep(t, dt, r) {
  const s = t.st;
  let d = 0;
  if (s.hunger <= 0) d -= r.hurt;
  if (s.thirst <= 0) d -= r.hurt;
  if (poops.length >= 3) d -= r.filth;
  if (s.happy <= 10) d -= r.filth;
  if (d === 0 && s.hunger > 40 && s.thirst > 40 && poops.length < 3) d = r.heal;
  s.health = clamp(s.health + d * dt, 0, 100);
}
function simulateAway(secs) {
  const n = Math.ceil(secs / 60), dt = secs / n; // one-minute steps
  const rep = turtles.map(t => ({ t, ate: 0, drank: 0, pooped: 0, stage0: stageOf(t.growth), starved: false, parched: false, lowHealth: 100 }));
  let dryAt = null, fed = 0, feedAcc = 0;
  const pond = objOf('pond'), feeder = up.feeder && objOf('feeder'), B = BOWLS[up.bowl], F = FEEDERS[up.feeder];
  const enrich = Math.max(0.55, 1 - 0.05 * structCount()); // structures help, but won't replace a daily check-in
  const lamp = objOf('lamp'), t0ms = Date.now() - secs * 1000;
  let crabAcc = 0, cleaned = 0, grown = 0;
  for (let i = 0; i < n; i++) {
    const simNow = t0ms + (i + 1) * dt * 1000;
    grown += gardenTick(simNow);
    if (B.refill) bowl.level = Math.min(1, bowl.level + dt * B.refill / 7200); // fountain: full again every ~2 h (grand: 1 h)
    if (feeder) {
      feedAcc += dt;
      if (feedAcc >= F.awayEvery) {
        feedAcc -= F.awayEvery;
        if (foods.length < 6 && turtles.some(t => t.st.hunger < 75)) { foods.push(feederFood(feeder, F)); fed++; }
      }
    }
    for (const r of rep) {
      const t = r.t, s = t.st;
      if (t.arrived && simNow < t.arrived) continue; // moved here later: this part of the gap wasn't theirs
      s.hunger = clamp(s.hunger - dt * AWAY.hunger * lerp(0.85, 1.2, t.traits.appetite) * (lamp ? 0.95 : 1), 0, 100);
      s.thirst = clamp(s.thirst - dt * AWAY.thirst, 0, 100);
      if (s.thirst < 55 && (pond || waterTiles.length)) { s.thirst = 100; r.drank++; r.pond = true; } // all-you-can-drink pond
      else if (s.thirst < 55 && bowl.level > 0.01) { // wander over for a drink
        const sip = Math.min(bowl.level, 0.22 / B.cap);
        bowl.level -= sip; s.thirst = clamp(s.thirst + sip * B.cap * 260, 0, 100); r.drank++;
        if (bowl.level <= 0.01 && dryAt === null && !B.refill) dryAt = i * dt;
      }
      if (s.hunger < 70 && foods.length) { // munch leftovers
        const f = foods.shift();
        if (f.slot !== undefined && plots[f.slot]) plots[f.slot].t0 = simNow; // garden replants itself
        s.hunger = clamp(s.hunger + f.bites * 10, 0, 100); r.ate++;
        t.diet.push(f.type); if (t.diet.length > 6) t.diet.shift();
        if (f.type === 'berry') t.chub = clamp(t.chub + 0.05, 0, 1);
        t.growth = clamp(t.growth + f.bites * GROW_PER_BITE * GROW_RATE * 0.75, 0, 1);
        t.gut.push(rand(15, 28) * 40); // digests over ~10-20 min while away
      }
      for (let g = t.gut.length - 1; g >= 0; g--) {
        t.gut[g] -= dt;
        if (t.gut[g] <= 0) {
          t.gut.splice(g, 1); r.pooped++;
          if (poops.length < 14) poops.push({ x: rand(40, YW - 40), y: rand(40, YH - 40), s: rand(0.85, 1.15), born: 1 });
        }
      }
      let drain = (AWAY.happy + poops.length * AWAY.dirty) * enrich;
      if (s.hunger < 25 || s.thirst < 25) drain += AWAY.happy * 2.5;
      s.happy = clamp(s.happy - dt * drain, 0, 100);
      // moods: friends keep each other company, everyone sleeps, a turtle alone gets lonely
      s.social = clamp(s.social + dt * AWAY.happy * (turtles.length > 1 ? 2.5 : -lerp(0.75, 2.2, t.traits.friendly)), 10, 100);
      s.energy = clamp(s.energy + dt * 0.01, 0, 100);
      t.chub = clamp(t.chub - dt * 0.000018, 0, 1); // slims down slowly: a berry binge still shows the next morning
      healthStep(t, dt, AWAY);
      s.health = Math.max(s.health, AWAY_FLOOR); // never dies while you're away: at worst comes back sick
      if (s.health > 50 && s.hunger > 40 && s.thirst > 40) t.growth = clamp(t.growth + dt * GROW_PER_SEC * GROW_RATE * (lamp ? 1.15 : 1), 0, 1);
      if (s.hunger <= 0) r.starved = true;
      if (s.thirst <= 0) r.parched = true;
      r.lowHealth = Math.min(r.lowHealth, s.health);
    }
    if (up.crab) { // crabs tidy up, enough for a school day without keeping up forever
      crabAcc += dt;
      const every = 900 / up.crab;
      while (crabAcc >= every) { crabAcc -= every; if (poops.length) { poops.pop(); cleaned++; } }
    }
  }
  turtles.forEach(t => t.mud = Math.max(0, (t.mud || 0) - secs / 900));
  const chilly = darkness() > 0.5 && !lamp && !['hut', 'cave', 'heatrock', 'mossbed'].some(objOf); // a cold night with nowhere warm
  turtles.forEach(t => t.st.warm = chilly ? Math.min(t.st.warm, 35) : 100);
  turtles.forEach(t => t.S = sizeFor(t.growth));
  return { secs, rep, dryAt, fed, cleaned, grown };
}

const fmtTime = s => { const m = Math.round(s / 60); return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d ${Math.floor(m % 1440 / 60)} h`; }; // round once, so never "1 h 60 min"
function showAway(report, where) {
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
  box.querySelector('.body').innerHTML = `<div class="when">${where ? `${esc(where)}: last visited ${fmtTime(report.secs)} ago` : `You were away ${fmtTime(report.secs)}`}</div>` + lines.join('<hr>') + (extra.length ? '<hr>' + extra.join('<br>') : '');
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
    const pond = objOf('pond'), w = nearestWater(T);
    if (w && (bowl.level <= 0.08 || dist(T, w) < dist(T, bowl)) && (!pond || dist(T, w) < dist(T, pond) - POND.rx)) // painted water is closest
      return { p: w, reach: TILE * 0.5 + 4, bodyReach: TILE * 0.5 + S * 0.9 + 6, by: 'mouth', arrive: () => { T.drinkT = 2.6; T.drinkFrom = 'water'; actStar(); } }; // reaching the edge is enough
    if (pond && (bowl.level <= 0.08 || dist(T, pond) - POND.rx < dist(T, bowl))) { // drink at the near edge of the pond
      const a = Math.atan2(T.y - pond.y, T.x - pond.x);
      const p = { x: pond.x + Math.cos(a) * POND.rx * 0.8, y: pond.y + Math.sin(a) * POND.ry * 0.8 };
      return { p, reach: 12, by: 'mouth', arrive: () => { T.drinkT = 2.6; T.drinkFrom = pond; actStar(); } };
    }
    if (bowl.level > 0.08) return { p: bowl, reach: bowl.r + 4, bodyReach: bowl.r + S * 0.9 + 6, by: 'mouth', arrive: () => { T.drinkT = 2.6; T.drinkFrom = bowl; actStar(); } }; // bumping the rim is close enough
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
      if (o.then === 'bask') { T.rest = { kind: 'bask', t: rand(8, 16) * (o.on === 'lookout' ? 1.6 : 1), on: o.on }; actStar(o.on === 'lookout' ? 2 : 1); }
      if (o.then === 'mist') { st.happy = clamp(st.happy + 4, 0, 100); emit(T.x, T.y - S, 'heart'); actStar(); }
      if (o.then === 'swim') actStar();
      if (o.then === 'hide') { T.rest = { kind: 'hide', t: rand(10, 20) }; actStar(); }
      if (o.then === 'tunnel') { st.happy = clamp(st.happy + 3 + T.traits.curious * 6, 0, 100); emit(T.x, T.y - S, 'heart'); actStar(2); }
      if (o.then === 'sleep') T.rest = { kind: 'sleep', t: rand(40, 120) };
      if (o.then === 'roll') { T.rest = { kind: 'roll', t: rand(3, 5) }; T.mud = 1; st.happy = clamp(st.happy + 8, 0, 100); actStar(); }
      if (o.then === 'mirror') { T.rest = { kind: 'mirror', t: rand(5, 9) }; actStar(); }
      if (o.then === 'greet') { // say hi to a friend
        const f = o.friend;
        if (f && dist(f, T) < (f.S + S) * 1.8) { actStar(); st.social = clamp(st.social + 12, 0, 100); f.st.social = clamp(f.st.social + 6, 0, 100); emit(T.x, T.y - S, 'heart', 2); T.a = Math.atan2(f.y - T.y, f.x - T.x); }
      }
      if (o.then === 'slide') { const sl = objOf('slide'); if (sl) T.sliding = { t: 0, from: { x: T.x, y: sl.y }, to: { x: sl.x - SLIDE.len / 2 - 55, y: sl.y } }; }
    } };
  }
  return null;
}

// Pick something to do when idle: a stroll, or a visit to a play structure the turtle's personality likes.
function pickOuting() {
  const tr = T.traits, opts = [];
  const log = objOf('log'), hut = objOf('hut'), pond = objOf('pond'), dkNow = darkness();
  for (const rk of rocksPlaced()) { // each rock pulls different turtles
    const R = ROCKS[rk.kind], { rx, ry } = rockDims(rk);
    let w = 0.2 + (1 - tr.speed) * 0.2;
    if (R.sun && dkNow < 0.3) w += 0.3 * R.sun;
    if (R.nap && st.energy < 50) w += 1;
    if (R.shy) w += (1 - tr.friendly) * 0.6;
    if (R.heat) w += (st.warm < 60 ? 3 : 0) + (dkNow > 0.5 ? 0.5 : 0);
    if (R.climb) w += 0.3 + tr.curious * 0.6;
    if (dkNow > 0.5 && !R.heat) w *= 0.3; // cold stone at night
    opts.push([w, () => {
      const top = R.climb ? { x: rk.x + rand(-0.35, 0.35) * rx, y: rk.y - ry * 0.12 + rand(-0.25, 0.25) * ry } : { x: rk.x + rand(-0.45, 0.45) * rx, y: rk.y + rand(-0.35, 0.35) * ry };
      return { route: R.climb ? [{ x: rk.x - rx * 0.55, y: rk.y + ry * 0.75 }, top] : [top], then: 'bask', on: rk.kind };
    }]);
  }
  const fog = objOf('fog'), cave = objOf('cave');
  if (fog) opts.push([0.1 + tr.playful * 0.3 + tr.curious * 0.2, () => {
    const pt = () => { const a = rand(0, 7), d = rand(30, FOG_R * 0.8); return { x: clamp(fog.x + Math.cos(a) * d, 40, YW - 40), y: clamp(fog.y + Math.sin(a) * d * 0.7, 30, YH - 20) }; };
    return { route: [pt(), pt(), pt()], then: 'mist' };
  }]);
  if (cave) opts.push([0.05 + (1 - tr.friendly) * 0.7 + (st.happy < 40 ? 0.3 : 0), () => ({ route: [{ x: cave.x, y: cave.y + CAVE.r + 28 }, { x: cave.x + rand(-12, 12), y: cave.y + rand(-8, 8) }], then: 'hide' })]);
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
  if (waterTiles.length >= 4) { // a swim in your own painted water
    const near = waterTiles.filter(w => dist(w, T) < 500), pool = near.length >= 3 ? near : waterTiles;
    const spot = () => { const w = pool[Math.floor(Math.random() * pool.length)]; return { x: w.x + rand(-10, 10), y: w.y + rand(-10, 10) }; };
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
  if (ball.toy === 'bell') { joy *= 1.6; emit(ball.x, ball.y - ball.r, 'note'); sfx('bell', ball); } else sfx('boing', ball);
  if (ball.toy === 'treat' && Math.random() < 0.4) { st.hunger = clamp(st.hunger + 4, 0, 100); emit(ball.x, ball.y, 'crumb', 5); }
  st.happy = clamp(st.happy + joy, 0, 100); T.chub = clamp(T.chub - 0.006, 0, 1); st.energy = clamp(st.energy - 0.5, 0, 100);
  emit(T.x, T.y - S, 'heart');
  if (T.playStarCool <= 0) { earn(1, T.x, T.y - S * 2); T.playStarCool = 4; }
  job('play', T.name);
  buzz(8);
}

// A star for something the current turtle did on its own (eating, drinking, basking, sliding...).
// At most one every couple of seconds per turtle, so a big family earns a steady trickle, not a flood.
function actStar(n = 1) {
  if ((T.actCool || 0) > 0) return;
  T.actCool = 2.2; earn(n, T.x, T.y - S * 2);
}
function think(dt) {
  T.nudgeCool -= dt; T.petCool -= dt; T.starCool -= dt; T.playStarCool -= dt; T.actCool = (T.actCool || 0) - dt;
  if (T.sliding) { // whoosh down the slide
    const sl = T.sliding;
    sl.t = Math.min(1, sl.t + dt / 0.8);
    const k = sl.t * sl.t;
    T.x = lerp(sl.from.x, sl.to.x, k); T.y = lerp(sl.from.y, sl.to.y, k);
    T.a = Math.atan2(sl.to.y - sl.from.y, sl.to.x - sl.from.x); T.v = 140; T.headExt = 1;
    T.tailT += dt * 8;
    if (sl.t >= 1) {
      T.sliding = null; T.v = 30; actStar(2); job('slide'); T.chub = clamp(T.chub - 0.02, 0, 1); st.energy = clamp(st.energy - 1.5, 0, 100);
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
      earn(1, T.eat.f.x, T.eat.f.y - 10); // every bite
      const f = T.eat.f; f.bites--; T.eat.t = 0; sfx(f.type === 'berry' ? 'squish' : 'munch', f);
      const want = craving(T);
      if (st.hunger > 90) T.chub = clamp(T.chub + 0.02, 0, 1); // eating when already full
      st.hunger = clamp(st.hunger + (f.type === 'berry' ? 9 : 12), 0, 100);
      st.happy = clamp(st.happy + (want === f.type ? 10 : want ? -1 : f.type === 'berry' ? 5 : 2), 0, 100); // bored of the same old food
      if (want === f.type && f.bites === 1) emit(T.x, T.y - S, 'heart', 2);
      emit(f.x, f.y, 'crumb', 6); buzz(5);
      grow(GROW_PER_BITE * (f.type === 'berry' ? 1.3 : 1) * (0.5 + st.happy / 100));
      if (f.bites <= 0) {
        T.diet.push(f.type); if (T.diet.length > 6) T.diet.shift();
        if (f.type === 'berry') job('berry', T.name);
        job('eat'); if (f.slot !== undefined) job('harvest');
        if (f.type === 'berry') T.chub = clamp(T.chub + 0.05, 0, 1);
        foods = foods.filter(x => x !== f); T.eat = null; T.gut.push(rand(15, 28)); if (f.slot !== undefined && plots[f.slot]) plots[f.slot].t0 = Date.now(); }
    }
    if (T.eat && !foods.includes(T.eat.f)) T.eat = null;
  } else if (T.drinkT > 0) {
    T.drinkT -= dt;
    const fromBowl = T.drinkFrom === bowl;
    T.lookAt = fromBowl ? bowl : null;
    if (fromBowl) T.a += angDiff(T.a, Math.atan2(bowl.y - T.y, bowl.x - T.x)) * Math.min(1, dt * 3); // face the water
    T.headExt = 1 + Math.sin(T.drinkT * 9) * 0.1;
    if (Math.random() < dt * 4) { emit(mouth().x, mouth().y, 'ripple'); sfx('sip', T); }
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
      else { if (kind === 'sleep' && T.rest.t <= 0) actStar(); T.rest = null; } // woke up from a good nap
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
          const spot = bedSpot();
          if (spot) T.outing = { route: spot, then: 'sleep' };
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
  const wasSwim = T.swim; T.swim = inPond(T);
  if (T.swim && !wasSwim && !T.off) sfx('splash', T);
  if (T.swim && T.mud > 0) { T.mud = 0; for (let i = 0; i < 8; i++) emit(T.x, T.y, 'drop'); } // a dip rinses the mud off
  if (T.swim) { want *= 0.8; st.happy = clamp(st.happy + dt * (0.2 + T.traits.playful * 0.5), 0, 100); if (T.v > 5 && Math.random() < dt * 3) emit(toWorld(-0.9, 0).x, toWorld(-0.9, 0).y, 'ripple'); }
  if (st.health < SICK) want *= st.health < 8 ? 0.15 : 0.5;
  // steering
  const turnRate = (1.7 + (T.v < 10 ? 0.6 : 0)) * lerp(0.8, 1.25, T.traits.speed);
  if (want !== 0) T.a += clamp(angDiff(T.a, desiredA), -turnRate * dt, turnRate * dt);
  T.v = lerp(T.v, want, dt * (want > T.v ? 2.2 : 5));
  T.x += Math.cos(T.a) * T.v * dt; T.y += Math.sin(T.a) * T.v * dt;
  // keep out of the feeder and inside the yard; the bowl is low enough to walk straight over
  for (const [o, r] of solids(false)) {
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
      if (poops.length < 12) { const q = { x: p.x, y: p.y, s: rand(0.85, 1.15), born: 0 }; keepInYard(q); poops.push(q); sfx('plop', q); }
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

function solids(withBowl = true) { // the ball still bounces off the bowl; turtles walk over it
  const f = objOf('feeder'), s = withBowl ? [[bowl, bowl.r]] : [];
  if (f) s.push([f, FEEDER_R]);
  return s;
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
// Where to sleep: hut, cave, moss bed, or under the tree on a sunny day. Returns a route, or null = right here.
function bedSpot() {
  const hut = objOf('hut'), cave = objOf('cave'), bed = objOf('mossbed'), tr = trees(), day = darkness() < 0.3, opts = [];
  if (hut) opts.push([1, () => [{ x: hut.x, y: hut.y + HUT.r + 30 }, { x: hut.x + rand(-15, 15), y: hut.y + rand(-10, 10) }]]);
  if (cave) opts.push([0.4 + (1 - T.traits.friendly), () => [{ x: cave.x, y: cave.y + CAVE.r + 28 }, { x: cave.x + rand(-12, 12), y: cave.y + rand(-8, 8) }]]);
  if (bed) opts.push([1.6, () => [{ x: bed.x + rand(-0.55, 0.55) * BED.rx, y: bed.y + rand(-0.5, 0.5) * BED.ry }]]);
  if (tr.length && day) opts.push([2, () => { // nearest tree's shade
    const tree = tr.reduce((b, o) => (dist(o, T) < dist(b, T) ? o : b)), L = treeLook(tree), a = rand(0, 7), d = rand(20, L.R * 0.6);
    return [{ x: clamp(tree.x + L.lean + Math.cos(a) * d, 40, YW - 40), y: clamp(tree.y - 10 + Math.sin(a) * d * 0.6, 30, YH - 20) }];
  }]);
  if (!opts.length || Math.random() < 0.12) return null;
  let r = Math.random() * opts.reduce((a, o) => a + o[0], 0);
  for (const [w, f] of opts) if ((r -= w) <= 0) return f();
  return opts[0][1]();
}
const near = (kind, t, rr) => { const o = objOf(kind); return !!o && dist(t, o) < rr; };
const onBed = t => { const b = objOf('mossbed'); return !!b && ((t.x - b.x) / BED.rx) ** 2 + ((t.y - b.y) / BED.ry) ** 2 < 1; };
const inShade = t => trees().some(o => { const L = treeLook(o); return ((t.x - o.x - L.lean) / L.R) ** 2 + ((t.y - o.y + 10) / (L.R * 0.72)) ** 2 < 1; });
function onLookout(t) { // 0 = on the ground, 1 = up on the plateau
  const o = objOf('lookout'); if (!o) return 0;
  const { rx, ry } = rockDims(o), e = ((t.x - o.x) / (rx * 0.8)) ** 2 + ((t.y - o.y + ry * 0.12) / (ry * 0.72)) ** 2;
  return clamp((1 - e) * 4, 0, 1);
}

// ---------- hidden moods: no bars, you read them off the turtle (and the ⋯ menu) ----------
const MOOD = { lonely: 30, tired: 25, cold: 35, chubby: 0.45 };
const inHut = t => { const h = objOf('hut'); return !!h && dist(t, h) < HUT.r; };
const inCave = t => near('cave', t, CAVE.r);
const friendNear = (t, k) => turtles.some(o => o !== t && o.releasing === undefined && dist(o, t) < (o.S + t.S) * k);
function craving(t) { // ate the same thing 4 times running: now wants the other one
  const d = t.diet, last = d[d.length - 1];
  return d.length >= 4 && d.slice(-4).every(x => x === last) ? (last === 'berry' ? 'lettuce' : 'berry') : null;
}
function moods(t) {
  const s = t.st, m = [], c = craving(t);
  if (s.health < SICK) m.push(s.health < 25 ? '🤒 Very sick!' : '🤒 Sick'); // the real problems first
  if (s.hunger < 30) m.push('🥬 Hungry');
  if (s.thirst < 30) m.push('💧 Thirsty');
  if (s.happy < 30) m.push('😢 Sad');
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
  emit(t.x, t.y - t.S, 'grr'); say(`😾 ${t.name} was napping and woke up grumpy`); buzz([10, 30, 10]); snd.play('hiss');
  return true;
}

function updateStats(dt) {
  const warm = nearLamp(T), asleep = T.rest?.kind === 'sleep', dk = darkness(), hutIn = inHut(T), cuddle = asleep && friendNear(T, onBed(T) ? 2 : 1.4);
  // loneliness: friendly turtles need company more; cured by petting, bumping into friends, sleeping in a pile
  st.social = clamp(st.social + dt * (cuddle ? 0.6 : T.rest?.kind === 'mirror' ? 0.4 : -0.05 * lerp(0.3, 1.6, T.traits.friendly)), 0, 100);
  // energy: drains while awake, back with sleep (best in the hut, worse under the lamp)
  const caveIn = inCave(T), bedIn = onBed(T), shade = inShade(T) && dk < 0.3, rockR = T.rest?.kind === 'bask' && ROCKS[T.rest.on];
  const heated = near('heatrock', T, ROCKS.heatrock.rx * sizeK('heatrock') + 30), misty = near('fog', T, FOG_R);
  st.energy = clamp(st.energy + dt * (asleep ? (hutIn || caveIn ? 1 : bedIn ? 1.1 : 0.6) * (warm ? 0.5 : 1) : rockR?.nap ? 0.5 : T.rest?.kind === 'bask' ? 0.1 : -0.03 * lerp(0.8, 1.25, T.traits.playful) * (shade ? 0.5 : 1)), 0, 100);
  if (st.energy <= 2 && !asleep && !T.eat && T.drinkT <= 0 && !T.userTarget && !T.sliding) { T.rest = { kind: 'sleep', t: 30 }; T.outing = null; } // dozes off right where it is
  // warmth: nights are chilly away from the lamp, the hut or a sleeping buddy
  const cold = dk > 0.5 && !warm && !heated && !hutIn && !cuddle && !caveIn && !(asleep && bedIn);
  st.warm = clamp(st.warm + dt * (warm || heated ? 0.8 : hutIn || cuddle ? 0.3 : cold ? -(T.swim ? 0.12 : 0.05) * dk : caveIn || bedIn ? 0 : T.rest?.kind === 'bask' ? 0.5 + (rockR?.sun || 0) * 0.5 : 0.15), 0, 100);
  // perks of the spot it's in
  if (rockR?.sun && dk < 0.3) st.happy = clamp(st.happy + dt * 0.5 * rockR.sun, 0, 100);
  if (rockR?.shy) st.happy = clamp(st.happy + dt * (1 - T.traits.friendly) * 0.8, 0, 100);
  if (rockR?.climb) st.happy = clamp(st.happy + dt * 0.35, 0, 100); // what a view
  if (shade) st.happy = clamp(st.happy + dt * 0.15, 0, 100);
  if (misty) st.happy = clamp(st.happy + dt * 0.25, 0, 100);
  // weight: berries and overeating add (see think), exercise and time take it off
  T.chub = clamp(T.chub - dt * (0.00005 + (T.v > 20 ? 0.0003 : 0) + (T.swim ? 0.0015 : 0)), 0, 1);
  st.hunger = clamp(st.hunger - dt * 0.12 * lerp(0.75, 1.35, T.traits.appetite) * (warm ? 0.7 : 1) * (asleep ? 0.6 : 1), 0, 100);
  if (warm) st.happy = clamp(st.happy + dt * 0.15, 0, 100);
  if (T.mud > 0) { if (!misty) T.mud = Math.max(0, T.mud - dt / 900); /* mist keeps mud soft */ if (T.mud < 0.75) st.happy = clamp(st.happy - dt * 0.04, 0, 100); } // dried mud itches
  st.thirst = clamp(st.thirst - dt * 0.15 * (misty ? 0.5 : 1), 0, 100);
  let drain = (0.05 + poops.length * 0.04) * lerp(0.8, 1.25, T.traits.playful); // playful ones get bored faster
  if (st.hunger < 30) drain += 0.12;
  if (st.thirst < 30) drain += 0.12;
  if (st.social < MOOD.lonely) drain += 0.05;
  if (st.energy < MOOD.tired) drain += 0.03;
  if (st.warm < MOOD.cold) drain += 0.04;
  if (T.chub > 0.75) drain += 0.02;
  st.happy = clamp(st.happy - dt * drain, 0, 100);
  healthStep(T, dt, graceT > 0 ? GRACE : LIVE);
  if (isIdle()) st.health = Math.max(st.health, AWAY_FLOOR); // nobody's playing: like being away, sick at worst
  if (st.health < 25 && !T.warned && T.dying === undefined) {
    T.warned = true; say(`⚠️ ${T.name} is very sick! Food & water, quick!`); buzz([60, 80, 60]); snd.play('sick');
  }
  if (st.health > 40) T.warned = false;
  if (st.health <= 0 && T.dying === undefined) { if (up.vet > 0) useVet(T, true); else die(T); }
  // healthy, happy turtles slowly grow on their own
  if (st.hunger > 50 && st.thirst > 50 && st.happy > 50 && st.health > 50 && poops.length < 3) grow(dt * GROW_PER_SEC * (warm ? 1.15 : 1));
  S = T.S = lerp(S, sizeFor(G()), Math.min(1, dt * 2)); // ease size changes
}
// Health change per second while you're watching. Neglect here can be fatal; while away it can't.
const HEAL = 0.04; // ~40 min from very sick to full health (a vet kit is instant)
const LIVE = { hurt: 0.3, filth: 0.06, heal: HEAL };
const GRACE = { hurt: 0, filth: 0, heal: HEAL }; // first few minutes after opening: time to feed everyone
const GRACE_SECS = 180;
let graceT = GRACE_SECS;
// Idle safeguard: a screen left on with nobody touching it counts as away, so turtles can't die.
// The first touch back starts the same grace period as opening the game.
const IDLE_MS = 5 * 60e3;
let lastTouch = performance.now();
const isIdle = () => performance.now() - lastTouch > IDLE_MS;
function touched() {
  if (isIdle()) { graceT = GRACE_SECS; if (turtles.some(t => t.st.health < SICK)) setTimeout(() => say('Welcome back! Someone needs care 🤒 Food & water, quick!', 3500), 300); }
  lastTouch = performance.now();
  snd.unlock();
}
addEventListener('pointerdown', touched, true);
addEventListener('keydown', touched, true);
function die(t) {
  t.dying = true; t.releasing = 2.5; t.v = 0; // reuses the release fade-out
  emit(t.x, t.y - t.S, 'sparkle', 10);
  say(`💔 ${t.name} didn't make it…`); buzz([100, 100, 200]); snd.play('sad');
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
  if (!(amount > 0)) return; // only ever forwards: a full-grown turtle dipping below 1 would "grow up" again for +10
  const before = stageOf(T.growth);
  T.growth = clamp(T.growth + amount * GROW_RATE, 0, 1);
  const after = stageOf(T.growth);
  if (after !== before) {
    emit(T.x, T.y, 'sparkle', 14); emit(T.x, T.y - S, 'heart', 4);
    say(`${T.name} grew into ${aStage(after)}! 🐢`); buzz([30, 60, 30]); snd.play('fanfare');
    earn(10, T.x, T.y - S * 2);
  }
}
const cleanness = () => clamp(100 - poops.length * 20, 0, 100);

const bars = ['health', 'hunger', 'thirst', 'clean', 'happy'].map(k => [k, document.getElementById('b-' + k)]);
const stageEl = document.getElementById('stage');
const starsEl = document.getElementById('stars');
function drawHud() {
  starsEl.textContent = `⭐ ${stars}`;
  const live = turtles.filter(own);
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
// ---------- rare looks: rolled once when a turtle hatches ----------
const MORPHS = [ // [colour, base chance, label, rarity]. Decorations in the yard tilt these (see HATCH_BOOST).
  ['normal', 0.51, '', 0], ['dark', 0.08, 'Dark shell', 1], ['olive', 0.07, 'Olive shell', 1], ['orange', 0.05, 'Orange shell', 1],
  ['yellow', 0.04, 'Sunny yellow', 1], ['red', 0.04, 'Red shell', 2], ['teal', 0.035, 'Teal shell', 2], ['blue', 0.035, 'Blue-grey shell', 2],
  ['navy', 0.03, 'Dark blue', 2], ['green', 0.03, 'Emerald', 2], ['pale', 0.025, 'Pale', 2], ['charcoal', 0.02, 'Jet black', 3],
  ['purple', 0.015, 'Violet', 3], ['pink', 0.012, 'Pink', 3], ['albino', 0.005, 'Albino', 4], ['gold', 0.003, 'Golden', 4],
];
const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Super rare', 'Legendary'];
// What each thing in the yard does to a new hatchling's odds: key -> boost per item ('*' = every unusual colour).
// Several of the same item stack with diminishing returns (see stackK).
const HATCH_BOOST = {
  flowers: { pink: 0.6, yellow: 0.4 }, mushrooms: { spots: 1.2, red: 0.4 }, shell: { pale: 0.8, albino: 0.4, teal: 0.4 },
  stones: { dark: 0.8, charcoal: 0.6 }, bush: { olive: 0.8, green: 0.6 }, lantern: { orange: 0.8, gold: 0.25 },
  tree: { olive: 0.5, green: 0.8 }, bbush: { purple: 0.8, stripes: 0.5 }, crystal: { purple: 0.8, albino: 0.8, gold: 0.4 },
  coral: { navy: 2, blue: 1, teal: 1 }, cactus: { spikes: 2 }, umbrella: { stripes: 2 }, dotstone: { spots: 2 },
  sunflower: { yellow: 1.5, orange: 1.5 }, rose: { red: 1.5, pink: 1.5 }, amethyst: { purple: 2, pink: 0.8 },
  obsidian: { charcoal: 2, dark: 1, navy: 0.6 }, pearl: { albino: 2, pale: 1.5 }, idol: { gold: 2.5 }, rainbow: { '*': 0.6 },
};
const BOOST_STRUCT = { pond: { teal: 0.6, navy: 0.6, blue: 0.4 }, cave: { charcoal: 0.6, spikes: 0.5 } }; // placed structures count too
const BOOST_NAMES = { spots: 'spots', stripes: 'stripes', spikes: 'spikes', '*': 'rare colours of every kind' };
const boostName = k => BOOST_NAMES[k] || MORPHS.find(m => m[0] === k)[2].replace(' shell', '').toLowerCase();
const stackK = n => (1 - 0.6 ** n) / 0.4; // 1 item = 1x its boost, 2 = 1.6x, 3 = 2x ... never more than 2.5x
function hatchBoosts(list = objs) { // key -> multiplier on the base chance
  const n = {};
  for (const o of list) { const k = o.kind === 'deco' ? o.type : BOOST_STRUCT[o.kind] ? o.kind : null; if (k) n[k] = (n[k] || 0) + 1; }
  const m = {};
  for (const [k, cnt] of Object.entries(n)) for (const [key, b] of Object.entries(HATCH_BOOST[k] || BOOST_STRUCT[k] || {})) m[key] = (m[key] || 1) + b * stackK(cnt);
  return m;
}
function hatchOdds(list = objs) { // { colors: [[colour, chance]], spots, stripes, spikes }
  const m = hatchBoosts(list);
  const w = MORPHS.map(([k, p]) => [k, k === 'normal' ? p : p * ((m[k] || 1) + (m['*'] || 1) - 1)]), tot = w.reduce((s, x) => s + x[1], 0);
  const sp = 0.14 * (m.spots || 1), str = 0.1 * (m.stripes || 1), none = 0.76, pt = sp + str + none;
  return { colors: w.map(([k, x]) => [k, x / tot]), spots: sp / pt, stripes: str / pt, spikes: Math.min(0.5, 0.04 * (m.spikes || 1)) };
}
function rollMorph(list = objs) {
  const O = hatchOdds(list);
  let r = Math.random(), color = 'normal';
  for (const [k, p] of O.colors) { if ((r -= p) <= 0) { color = k; break; } }
  const pr = Math.random(), pattern = pr < O.spots ? 'spots' : pr < O.spots + O.stripes ? 'stripes' : '';
  return { color, pattern, spikes: Math.random() < O.spikes };
}
function boostText(b) { return '🧬 Hatchlings: more ' + Object.keys(b).map(boostName).join(', '); }
function yardBoostSummary() { // short line for the shop's adopt row
  const m = hatchBoosts(), keys = Object.keys(m).sort((a, b) => m[b] - m[a]);
  const O = hatchOdds(), rare = O.colors.filter(([k]) => MORPHS.find(x => x[0] === k)[3] >= 2).reduce((s, x) => s + x[1], 0);
  return keys.length ? ` 🧬 Your decorations boost ${keys.slice(0, 4).map(boostName).join(', ')}${keys.length > 4 ? ' and more' : ''}. Rare colour chance ${(rare * 100).toFixed(0)}%.`
    : ` 🧬 Decorations can make rare colours and patterns more likely.`;
}
function morphInfo(t) { // { label: 'Red shell · spotted · spiky', rarity: 0-4 }
  const m = t.morph || {}, row = MORPHS.find(x => x[0] === (m.color || 'normal')), bits = [];
  let rarity = row ? row[3] : 0;
  if (row && row[2]) bits.push(row[2]);
  if (m.pattern) { bits.push(m.pattern === 'spots' ? 'spotted' : 'striped'); rarity = Math.max(rarity, 1); }
  if (m.spikes) { bits.push('spiky'); rarity = Math.max(rarity, 2); }
  if (row && row[3] >= 2 && (m.pattern || m.spikes) && rarity < 4) rarity++; // a rare colour with a pattern or spikes is a step rarer
  return { label: bits.join(' · '), rarity };
}
function announceMorph(t) {
  const { label, rarity } = morphInfo(t);
  if (rarity < 2) return;
  setTimeout(() => { say(`${rarity >= 4 ? '🌟🌟 LEGENDARY!' : rarity >= 3 ? '🌟 WOW, super rare!' : '✨ Rare!'} ${t.name} is ${label.toLowerCase()}!`, 4500); snd.play('fanfare'); emit(t.x, t.y - t.S, 'sparkle', 20); }, 3200);
}
const MORPH_SHELL = { // fixed shell palettes for the colours that aren't just a hue shift: [baby, adult] per part
  red: { hi: ['#ec9a7c', '#9a3f27'], mid: ['#d06446', '#73261a'], lo: ['#9a3f2a', '#43150b'], scute: ['#dc7656', '#82301e'], spine: ['#ea8a66', '#93391f'], rim: ['#6a2414', '#2a0a04'] },
  albino: { hi: ['#fbf3e2', '#e8d8b8'], mid: ['#efe2c6', '#d6c19a'], lo: ['#d6c3a0', '#b49c74'], scute: ['#f3e8d0', '#dccaa6'], spine: ['#f8eedb', '#e4d4b2'], rim: ['#c4ad86', '#9c845e'] },
  pale: { hi: ['#f4e9c8', '#cdbb94'], mid: ['#e2d3aa', '#ad9a72'], lo: ['#bfae86', '#7f6d4c'], scute: ['#eadcb4', '#b9a57e'], spine: ['#f0e5c4', '#c6b38c'], rim: ['#9e8b66', '#5c4e36'] },
  gold: { hi: ['#fff1a8', '#f2c94c'], mid: ['#f5d265', '#c99a1f'], lo: ['#d4a72a', '#8a6410'], scute: ['#f8dc72', '#d6a82a'], spine: ['#ffe58a', '#e2b53a'], rim: ['#9a7414', '#5a420a'] },
};
const hslHex = (h, s, l) => { // h 0-360, s/l 0-100 -> '#rrggbb'
  l = clamp(l, 3, 97) / 100; const a = s / 100 * Math.min(l, 1 - l);
  const f = n => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
};
// The spectrum colours: a hue, saturation and baby/adult lightness, spread into the shell's parts.
for (const [k, h, s, lb, la] of [['orange', 26, 78, 56, 36], ['yellow', 49, 82, 60, 42], ['teal', 178, 52, 48, 28], ['navy', 222, 62, 40, 22],
  ['green', 142, 48, 46, 26], ['purple', 276, 42, 52, 30], ['pink', 336, 62, 70, 48], ['charcoal', 215, 8, 30, 13]]) {
  const p = d => [hslHex(h, s, lb + d), hslHex(h, s, la + d * 0.8)];
  MORPH_SHELL[k] = { hi: p(14), mid: p(2), lo: p(-12), scute: p(6), spine: p(10), rim: p(-24) };
}
const LIGHT_SHELL = new Set(['yellow', 'gold', 'pale', 'albino', 'pink']); // patterns go dark on these so they still show
const MORPH_SKIN = { charcoal: { skin: ['#7d8a70', '#3e4636'], dark: ['#4a5440', '#21271c'], light: ['#a3b094', '#5d6852'] }, albino: { skin: ['#f6e4d8', '#ead0bf'], dark: ['#dcb8a6', '#c49c88'], light: ['#fff4ec', '#f6e2d4'] } };

// Hatchlings: bright, round, big head and eyes, bit of eggshell. Juveniles: bold yellow rays on the shell.
// Adults: dark, longer shell, growth rings, head stripes, long claws, moss and scratches.
function look(g) {
  let { shell: h, skin: hs, light: lt } = T.tint; // this turtle's own slight color variation
  const sick = clamp((SICK - T.st.health) / SICK, 0, 1) * 0.65, M = T.morph || {};
  if (M.color === 'dark') lt -= 0.3;
  if (M.color === 'olive') h += 45;
  if (M.color === 'blue') h += 175;
  const L0 = {
    skin: mix('#a8d062', '#62793a', g, hs, sick, lt), skinDark: mix('#5f8a32', '#37461f', g, hs, sick, lt), skinLight: mix('#d2ee90', '#8aa156', g, hs, sick, lt),
    shellHi: mix('#dcc27c', '#7a5c2e', g, h, sick * 0.4, lt), shellMid: mix('#bb9850', '#56401d', g, h, sick * 0.4, lt), shellLo: mix('#8f7038', '#33240f', g, h, sick * 0.4, lt),
    scute: mix('#c8a75e', '#634a22', g, h, sick * 0.4, lt), spine: mix('#d6b66c', '#735628', g, h, sick * 0.4, lt), rim: mix('#6e5428', '#24190a', g, h, 0, lt),
    head: lerp(1.55, 0.92, g), eye: lerp(1.75, 0.85, g), aspect: lerp(0.97, 0.78, g), claw: lerp(0.5, 1.5, g),
    tail: lerp(1.12, 1.4, g), neck: lerp(1.2, 1, g),
    rays: clamp((g - 0.1) * 4, 0, 1) * lerp(1.1, 0.4, g), rings: Math.floor(g * 4.6),
    stripes: clamp((g - 0.3) * 2.5, 0, 1), egg: clamp(1 - g / 0.15, 0, 1), moss: clamp((g - 0.78) * 5, 0, 1),
  };
  const P = MORPH_SHELL[M.color];
  if (P) { const m2 = (k, gr) => mix(P[k][0], P[k][1], g, 0, gr, M.color === 'gold' ? 0 : lt); Object.assign(L0, { shellHi: m2('hi', sick * 0.4), shellMid: m2('mid', sick * 0.4), shellLo: m2('lo', sick * 0.4), scute: m2('scute', sick * 0.4), spine: m2('spine', sick * 0.4), rim: m2('rim', 0) }); }
  const K = MORPH_SKIN[M.color];
  if (K) Object.assign(L0, { skin: mix(K.skin[0], K.skin[1], g, 0, sick, 0), skinDark: mix(K.dark[0], K.dark[1], g, 0, sick, 0), skinLight: mix(K.light[0], K.light[1], g, 0, sick, 0) });
  L0.eyeCol = M.color === 'albino' ? '#c8323c' : '#1b1b1b';
  return L0;
}

function hex(c, x, y, r, rot = 0) {
  c.beginPath();
  for (let i = 0; i < 6; i++) { const a = rot + i * Math.PI / 3; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  c.closePath();
}

function drawTurtle(time, c = ctx) {
  const g = G(), L = look(g), wide = 1 + 0.25 * T.chub;
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
      c.fillStyle = L.eyeCol; c.beginPath(); c.arc(ex, ey, er, 0, 7); c.fill();
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
  if ((T.morph || {}).spikes) { // triangle spikes poking out all round the rim (gaps for head and tail)
    const n = 18, len = Math.max(S * 0.3, 6), half = Math.PI / n * 0.7; // a minimum length so hatchlings' spikes still show
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) / n * Math.PI * 2;
      if (Math.abs(angDiff(a, 0)) < 0.5 || Math.abs(angDiff(a, Math.PI)) < 0.4) continue;
      const pt = (ang, k) => [Math.cos(ang) * (S * k), Math.sin(ang) * (S * ar * k)];
      const [bx1, by1] = pt(a - half, 0.92), [bx2, by2] = pt(a + half, 0.92), [tx, ty] = pt(a, 1 + len / S);
      c.fillStyle = L.rim; c.beginPath(); c.moveTo(bx1, by1); c.lineTo(tx, ty); c.lineTo(bx2, by2); c.closePath(); c.fill();
      const [mx, my] = pt(a - half * 0.25, 0.95); // lighter face on one side so each spike looks 3D
      c.fillStyle = L.spine; c.beginPath(); c.moveTo(bx1, by1); c.lineTo(tx, ty); c.lineTo(mx, my); c.closePath(); c.fill();
    }
  }
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
  const Mo = T.morph || {};
  if (Mo.pattern === 'spots') { // little yellow spots on every scute
    c.fillStyle = Mo.color === 'albino' ? 'rgba(230,170,140,0.9)' : LIGHT_SHELL.has(Mo.color) ? 'rgba(90,52,20,0.75)' : 'rgba(250,214,92,0.9)';
    for (const [x, y, r] of scutes) for (let i = 0; i < 3; i++) { const a = i * 2.1 + x * 0.1; c.beginPath(); c.arc(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45, Math.max(0.8, r * 0.15), 0, 7); c.fill(); }
  }
  if (Mo.pattern === 'stripes') { // bold stripes radiating across the shell
    c.save(); c.beginPath(); c.ellipse(0, 0, S, S * ar, 0, 0, 7); c.clip();
    c.strokeStyle = LIGHT_SHELL.has(Mo.color) ? 'rgba(90,52,20,0.6)' : 'rgba(240,200,70,0.75)'; c.lineWidth = Math.max(1, S * 0.07); c.lineCap = 'round';
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(a) * S * 0.25, Math.sin(a) * S * ar * 0.25); c.lineTo(Math.cos(a) * S, Math.sin(a) * S * ar); c.stroke(); }
    c.restore();
  }
  if (Mo.color === 'gold') { // a shine that sweeps across the shell
    c.save(); c.beginPath(); c.ellipse(0, 0, S, S * ar, 0, 0, 7); c.clip();
    const sx = ((time * 0.5) % 2.4 - 1.2) * S;
    const sg2 = c.createLinearGradient(sx - S * 0.3, 0, sx + S * 0.3, 0);
    sg2.addColorStop(0, 'rgba(255,255,230,0)'); sg2.addColorStop(0.5, 'rgba(255,255,230,0.55)'); sg2.addColorStop(1, 'rgba(255,255,230,0)');
    c.fillStyle = sg2; c.fillRect(-S, -S, S * 2, S * 2); c.restore();
  }
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
  if (need && !T.wild && !T.eat && T.drinkT <= 0 && T.rest?.kind !== 'sleep') {
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
  if (r > 80) { // grand fountain: stone rim and a raised middle basin
    for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; c.fillStyle = ['#b9b2a6', '#a59e92', '#c9c2b5'][i % 3]; c.beginPath(); c.ellipse(x + Math.cos(a) * (r - 3), y + Math.sin(a) * (r - 3), 11, 8, a, 0, 7); c.fill(); }
    c.fillStyle = '#9aa9b2'; c.beginPath(); c.arc(x, y, r * 0.3, 0, 7); c.fill();
    c.fillStyle = '#5fb0dd'; c.beginPath(); c.arc(x, y, r * 0.24, 0, 7); c.fill();
  }
  if (BOWLS[up.bowl].refill) { // fountain spout in the middle
    c.fillStyle = '#9fb3bf'; c.beginPath(); c.arc(x, y, 9, 0, 7); c.fill();
    c.fillStyle = '#d6e2e8'; c.beginPath(); c.arc(x - 2, y - 2, 4, 0, 7); c.fill();
    c.strokeStyle = '#bfe4fa'; c.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + time, k = (time * 1.5 + i / 6) % 1;
      const reach = r > 80 ? r * 0.55 : 20;
      c.globalAlpha = 1 - k; c.beginPath(); c.arc(x + Math.cos(a) * (8 + k * reach), y + Math.sin(a) * (8 + k * reach), 1.8, 0, 7); c.stroke();
    }
    c.globalAlpha = 1;
  }
  if (bowl.fill > 0) { // pouring stream
    c.strokeStyle = '#7cc4f0'; c.lineWidth = 6 * bowl.fill; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x + 2, y - r - 40); c.lineTo(x, y); c.stroke();
  }
}

// Snacks you drop go off after a while: they fade over the last few seconds, then disappear (garden and feeder food don't).
const FOOD_LIFE = 120e3, FOOD_FADE = 15e3;
const foodLeft = (f, now = Date.now()) => (f.t ? FOOD_LIFE - (now - f.t) : Infinity);
function spoilFood(now) {
  for (const f of foods) if (!f.t && f.slot === undefined && !f.fromFeeder) f.t = now; // dropped before snacks went off: the clock starts now
  const gone = foods.filter(f => foodLeft(f, now) <= 0 && !turtles.some(t => t.eat?.f === f)); // a turtle mid-bite gets to finish
  if (!gone.length) return;
  for (const f of gone) emit(f.x, f.y, 'crumb', 4);
  foods = foods.filter(f => !gone.includes(f));
}
function drawFoodItem(f) {
  const c = ctx, s = 0.5 + 0.5 * f.bites / f.max;
  c.save(); c.translate(f.x, f.y); c.rotate(f.rot); c.scale(s, s);
  c.globalAlpha = clamp(foodLeft(f) / FOOD_FADE, 0.25, 1);
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
      if (c.scoop <= 0) { if (poops.includes(c.tgt)) { poops = poops.filter(q => q !== c.tgt); emit(c.tgt.x, c.tgt.y, 'sparkle', 5); earn(1,c.tgt.x, c.tgt.y); } c.tgt = null; }
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
const gardenCols = () => [2, 2, 3, 4][up.garden] || 2;
function slotPos(i) {
  const g = objOf('garden'), cols = gardenCols();
  return { x: g.x + ((i % cols) - (cols - 1) / 2) * SLOT, y: g.y + (Math.floor(i / cols) - 0.5) * SLOT };
}
const slotType = i => (up.garden > 2 ? (i % 2 === 1 ? 'berry' : 'lettuce') : up.garden > 1 && i % 3 === 1 ? 'berry' : 'lettuce');
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
  const hr = objOf('heatrock'), fog = objOf('fog');
  if (hr) L.push({ x: hr.x, y: hr.y, r: 150 * sizeK('heatrock'), k: 0.7, warm: true });
  if (fog) L.push({ x: fog.x, y: fog.y, r: FOG_R * 1.1, k: 0.45 });
  for (const o of objs) if (o.kind === 'deco' && o.type === 'crystal') L.push({ x: o.x, y: o.y - 20, r: 110, k: 0.8 });
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

// ---------- moss bed, fog machine, stone cave, shade tree ----------
function drawMossBed(o) {
  const c = ctx, rnd = seeded(o.seed || 0.61);
  c.fillStyle = '#0002'; c.beginPath(); c.ellipse(o.x + 4, o.y + 6, BED.rx, BED.ry, 0, 0, 7); c.fill();
  c.fillStyle = '#7a5a36'; c.beginPath(); c.ellipse(o.x, o.y, BED.rx, BED.ry, 0, 0, 7); c.fill(); // twig rim
  c.fillStyle = '#5c8f3a'; c.beginPath(); c.ellipse(o.x, o.y, BED.rx - 8, BED.ry - 7, 0, 0, 7); c.fill();
  for (let i = 0; i < 26; i++) {
    const a = rnd() * 6.28, d = Math.sqrt(rnd()) * 0.85;
    c.fillStyle = ['#6fa84a', '#4f7f30', '#88bf5c'][i % 3];
    c.beginPath(); c.arc(o.x + Math.cos(a) * (BED.rx - 10) * d, o.y + Math.sin(a) * (BED.ry - 9) * d, 4 + rnd() * 5, 0, 7); c.fill();
  }
  c.strokeStyle = '#5a3f22'; c.lineWidth = 2;
  for (let i = 0; i < 14; i++) { const a = i / 14 * 6.28; c.beginPath(); c.moveTo(o.x + Math.cos(a) * (BED.rx - 3), o.y + Math.sin(a) * (BED.ry - 3)); c.lineTo(o.x + Math.cos(a + 0.3) * (BED.rx + 2), o.y + Math.sin(a + 0.3) * (BED.ry + 1)); c.stroke(); }
}
function drawFogMachine(o, time) {
  const c = ctx;
  c.fillStyle = '#0003'; c.beginPath(); c.roundRect(o.x - 16, o.y - 8, 34, 26, 5); c.fill();
  c.fillStyle = '#5d6b78'; c.beginPath(); c.roundRect(o.x - 18, o.y - 12, 34, 26, 5); c.fill();
  c.fillStyle = '#7e8d9a'; c.beginPath(); c.roundRect(o.x - 15, o.y - 10, 28, 9, 3); c.fill();
  c.fillStyle = '#3a454f'; c.beginPath(); c.arc(o.x - 1, o.y - 14, 6, 0, 7); c.fill(); // nozzle
  c.fillStyle = Math.sin(time * 4) > 0 ? '#7fe0ff' : '#3a8fb0'; c.beginPath(); c.arc(o.x + 9, o.y + 6, 2.5, 0, 7); c.fill();
}
function drawMist(o, time, dk) {
  const c = ctx, col = dk > 0.4 ? '190,215,255' : '255,255,255';
  for (let i = 0; i < 14; i++) { // puffs drift out from the nozzle and fade
    const k = (time * 0.07 + i / 14) % 1, a = i * 2.39 + Math.sin(time * 0.2 + i) * 0.3, d = 12 + k * FOG_R;
    const x = o.x + Math.cos(a) * d, y = o.y - 14 + Math.sin(a) * d * 0.7, r = 26 + k * 56;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${col},${0.42 * Math.sin(k * Math.PI)})`); g.addColorStop(0.5, `rgba(${col},${0.2 * Math.sin(k * Math.PI)})`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  }
}
function drawCave(o, layer, a = 1) {
  const c = ctx, r = CAVE.r, rnd = seeded(o.seed || 0.23);
  c.save(); c.translate(o.x, o.y);
  if (layer === 'floor') {
    c.fillStyle = '#0003'; c.beginPath(); c.ellipse(7, 9, r * 1.1, r * 0.95, 0, 0, 7); c.fill();
    c.fillStyle = '#3d3934'; c.beginPath(); c.ellipse(0, 0, r * 1.1, r * 0.95, 0, 0, 7); c.fill(); // cool stone floor
    c.fillStyle = '#4a4540'; for (let i = 0; i < 8; i++) { c.beginPath(); c.ellipse((rnd() - 0.5) * r * 1.4, (rnd() - 0.5) * r * 1.2, 8 + rnd() * 10, 5 + rnd() * 6, rnd() * 3, 0, 7); c.fill(); }
    c.restore(); return;
  }
  c.globalAlpha = a;
  c.fillStyle = '#6f6a63'; c.beginPath(); c.ellipse(0, 0, r * 1.1, r * 0.95, 0, 0, 7); c.fill();
  for (let i = 0; i < 9; i++) { // boulders piled into a dome
    const a2 = rnd() * 6.28, d = rnd() * 0.6;
    c.fillStyle = ['#8a847b', '#7b756d', '#9a948a'][i % 3];
    c.beginPath(); c.ellipse(Math.cos(a2) * r * d, Math.sin(a2) * r * d * 0.8 - 6, r * (0.28 + rnd() * 0.18), r * (0.22 + rnd() * 0.14), a2, 0, 7); c.fill();
  }
  c.fillStyle = '#b2aca1'; c.beginPath(); c.ellipse(-r * 0.25, -r * 0.4, r * 0.25, r * 0.12, -0.3, 0, 7); c.fill();
  c.fillStyle = '#1d1a16'; c.beginPath(); c.ellipse(0, r * 0.72, r * 0.42, r * 0.32, 0, Math.PI, 0); c.fill(); // the opening
  c.globalAlpha = 1;
  c.strokeStyle = '#57524b'; c.lineWidth = 4; c.beginPath(); c.ellipse(0, 0, r * 1.1, r * 0.95, 0, 0, 7); c.stroke();
  c.restore();
}
function drawTrunk(o) {
  const c = ctx, L = treeLook(o);
  c.fillStyle = '#0002'; c.beginPath(); c.ellipse(o.x + L.lean + 18, o.y + 24, L.R, L.R * 0.7, 0, 0, 7); c.fill(); // shade on the ground
  c.strokeStyle = '#4a3019'; c.lineWidth = 7; c.lineCap = 'round'; // roots
  for (const a of [0.4, 1.6, 2.7, 4.2, 5.5]) { c.beginPath(); c.moveTo(o.x, o.y + 8); c.lineTo(o.x + Math.cos(a) * L.R * 0.16, o.y + 8 + Math.sin(a) * L.R * 0.1); c.stroke(); }
  c.fillStyle = '#5a3c20'; c.beginPath(); c.ellipse(o.x, o.y + 8, L.R * 0.12, L.R * 0.08, 0, 0, 7); c.fill();
}
function drawTree(o, time) {
  const c = ctx, L = treeLook(o), cx = o.x + L.lean, cy = o.y - 10;
  const under = turtles.some(t => ((t.x - cx) / L.R) ** 2 + ((t.y - cy) / (L.R * 0.72)) ** 2 < 1);
  o.fade = lerp(o.fade ?? 1, under ? 0.5 : 0.95, 0.08); // see-through while someone naps underneath
  c.save(); c.globalAlpha = o.fade;
  const sway = Math.sin(time * 0.8 + o.x) * 2;
  c.fillStyle = `hsl(${L.hue},${L.sat}%,${L.light - 8}%)`; // dark underside first
  for (const b of L.blobs) { c.beginPath(); c.arc(cx + b.x + 6, cy + b.y + 8, b.r, 0, 7); c.fill(); }
  for (const b of L.blobs) { c.fillStyle = `hsl(${L.hue},${L.sat}%,${b.l}%)`; c.beginPath(); c.arc(cx + b.x + sway, cy + b.y, b.r, 0, 7); c.fill(); }
  c.fillStyle = `hsla(${L.hue + 8},${L.sat + 10}%,${L.light + 16}%,0.55)`; // sunlit tufts on top
  for (const t of L.tufts) { c.beginPath(); c.arc(cx + t.x + sway, cy + t.y, t.r, 0, 7); c.fill(); }
  c.fillStyle = L.dotCol; // blossoms or fruit
  for (const d of L.dots) { c.beginPath(); c.arc(cx + d.x + sway, cy + d.y, d.r, 0, 7); c.fill(); }
  c.restore();
}

// ---------- wildlife attractors ----------
function drawBirdFeeder(o) {
  const c = ctx;
  c.fillStyle = '#0003'; c.beginPath(); c.ellipse(o.x + 3, o.y + 3, 14, 6, 0, 0, 7); c.fill();
  c.strokeStyle = '#6b4a2a'; c.lineWidth = 4; c.beginPath(); c.moveTo(o.x, o.y); c.lineTo(o.x, o.y - 34); c.stroke(); // pole
  c.fillStyle = '#8a5f34'; c.beginPath(); c.roundRect(o.x - 18, o.y - 42, 36, 10, 3); c.fill(); // tray
  c.fillStyle = '#d9b46a'; for (let i = 0; i < 8; i++) { c.beginPath(); c.arc(o.x - 13 + i * 3.7, o.y - 41, 1.6, 0, 7); c.fill(); } // seeds
  c.fillStyle = '#a3462f'; c.beginPath(); c.moveTo(o.x - 22, o.y - 46); c.lineTo(o.x, o.y - 60); c.lineTo(o.x + 22, o.y - 46); c.closePath(); c.fill(); // roof
}
function drawBugHotel(o) {
  const c = ctx;
  c.fillStyle = '#0003'; c.beginPath(); c.ellipse(o.x + 3, o.y + 4, 20, 7, 0, 0, 7); c.fill();
  c.fillStyle = '#8a5f34'; c.beginPath(); c.roundRect(o.x - 18, o.y - 40, 36, 42, 3); c.fill();
  c.fillStyle = '#6b4526'; c.beginPath(); c.moveTo(o.x - 22, o.y - 38); c.lineTo(o.x, o.y - 54); c.lineTo(o.x + 22, o.y - 38); c.closePath(); c.fill();
  const rnd = seeded(o.seed || 0.3);
  for (let r2 = 0; r2 < 3; r2++) for (let k = 0; k < 3; k++) { // little rooms: holes, sticks and pinecones
    const x = o.x - 11 + k * 11, y = o.y - 31 + r2 * 12;
    c.fillStyle = ['#3a2512', '#c9a46a', '#7a5a36'][Math.floor(rnd() * 3)]; c.beginPath(); c.arc(x, y, 4.2, 0, 7); c.fill();
    c.fillStyle = '#1a1008'; c.beginPath(); c.arc(x, y, 1.6, 0, 7); c.fill();
  }
}
function drawLilies(o, time) {
  const c = ctx, rnd = seeded(0.77), n = up.lily * 4;
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.28, d = 0.25 + rnd() * 0.6, x = o.x + Math.cos(a) * POND.rx * d, y = o.y + Math.sin(a) * POND.ry * d, pr = 9 + rnd() * 8, bob = Math.sin(time + i) * 1.2;
    c.fillStyle = '#4f8f3a'; c.beginPath(); c.arc(x, y + bob, pr, 0.3, Math.PI * 2 - 0.1); c.lineTo(x, y + bob); c.fill();
    if (rnd() < 0.35) { c.fillStyle = '#f7c6d9'; c.beginPath(); c.arc(x + pr * 0.2, y + bob - 1, pr * 0.32, 0, 7); c.fill(); c.fillStyle = '#f5d76a'; c.beginPath(); c.arc(x + pr * 0.2, y + bob - 1, pr * 0.1, 0, 7); c.fill(); }
  }
}

// ---------- wildlife: just for looks (not saved) ----------
// butterflies by day, dragonflies and frogs once there's a pond, birds that hop about and flee from turtles
let bugs = [], frogs = [], birds = [], ladybugs = [];
function updateLife(dt, dk) {
  const day = dk < 0.4, pond = objOf('pond');
  const bushes = objs.filter(o => o.kind === 'deco' && o.type === 'bbush'), hotel = objOf('bughotel');
  const flowers = [...bushes, ...bushes, ...objs.filter(o => o.kind === 'deco' && (o.type === 'flowers' || o.type === 'bush'))]; // butterflies favour their bushes
  const hover = pond || hotel; // dragonflies patrol the pond, or the bug hotel if there's no pond
  const wantB = day ? 2 + bushes.length * 3 : 0, wantD = day && hover ? (pond ? 1 : 0) + up.bugs * 2 : 0;
  const nB = bugs.filter(b => !b.drag).length, nD = bugs.length - nB;
  if (nB < wantB) bugs.push({ x: rand(40, YW - 40), y: rand(40, YH - 40), vx: 0, vy: 0, t: rand(0, 9), hue: [330, 45, 200, 280, 20][Math.floor(rand(0, 5))], tgt: null });
  if (nD < wantD) bugs.push({ drag: true, x: hover.x, y: hover.y, vx: 0, vy: 0, t: rand(0, 9), hue: rand(150, 200), tgt: null, hold: 0 });
  if (nB > wantB || nD > wantD) bugs = bugs.filter(b => (b.drag ? nD <= wantD : nB <= wantB)); // night: they all go home
  for (const b of bugs) {
    b.t += dt;
    if (b.drag) { // dart, hover, dart
      if (!hover) { b.gone = true; continue; }
      const hr = pond ? POND.rx * 1.1 : 140, hry = pond ? POND.ry * 1.1 : 100;
      if ((b.hold -= dt) <= 0 || !b.tgt) { b.tgt = { x: hover.x + rand(-1, 1) * hr, y: hover.y + rand(-1, 1) * hry }; b.hold = rand(0.6, 2); }
      b.x = lerp(b.x, b.tgt.x, Math.min(1, dt * 5)); b.y = lerp(b.y, b.tgt.y, Math.min(1, dt * 5));
    } else { // flutter toward a flower or a random spot
      if (!b.tgt || dist(b, b.tgt) < 12 || Math.random() < dt * 0.1) {
        const f = flowers.length && Math.random() < 0.6 ? flowers[Math.floor(rand(0, flowers.length))] : null;
        b.tgt = f ? { x: f.x, y: f.y - 8 } : { x: rand(40, YW - 40), y: rand(40, YH - 40) };
      }
      const a = Math.atan2(b.tgt.y - b.y, b.tgt.x - b.x);
      b.vx = lerp(b.vx, Math.cos(a) * 45 + Math.sin(b.t * 7) * 30, dt * 2); b.vy = lerp(b.vy, Math.sin(a) * 45 + Math.cos(b.t * 5) * 30, dt * 2);
      b.x += b.vx * dt; b.y += b.vy * dt;
    }
  }
  bugs = bugs.filter(b => !b.gone);
  // ladybugs crawl around the bug hotel
  const wantL = hotel ? up.bugs * 3 : 0;
  while (ladybugs.length < wantL) ladybugs.push({ x: hotel.x + rand(-40, 40), y: hotel.y + rand(-20, 40), a: rand(0, 7), t: rand(0, 5) });
  if (ladybugs.length > wantL) ladybugs.length = wantL;
  for (const l of ladybugs) {
    l.t += dt; l.a += rand(-2, 2) * dt;
    if (dist(l, hotel) > 90) l.a = Math.atan2(hotel.y + 20 - l.y, hotel.x - l.x);
    l.x += Math.cos(l.a) * 9 * dt; l.y += Math.sin(l.a) * 9 * dt;
  }
  // frogs sit at the pond edge, hop away from turtles, croak at night
  const wantF = pond ? 1 + up.lily * 2 : 0;
  while (frogs.length < wantF) { const a = rand(0, 7); frogs.push({ a, x: pond.x + Math.cos(a) * POND.rx * 1.05, y: pond.y + Math.sin(a) * POND.ry * 1.05, hop: 0, from: null, to: null, croak: rand(2, 8), face: a }); }
  if (frogs.length > wantF) frogs.length = wantF;
  for (const f of frogs) {
    if (f.hop > 0) {
      f.hop = Math.max(0, f.hop - dt * 2.2); const k = 1 - f.hop;
      f.x = lerp(f.from.x, f.to.x, k); f.y = lerp(f.from.y, f.to.y, k) - Math.sin(k * Math.PI) * 18;
      if (!f.hop) emit(f.x, f.y, 'ripple');
      continue;
    }
    const scared = turtles.some(t => dist(t, f) < t.S + 40);
    if (scared || Math.random() < dt * 0.05) { // hop somewhere else round the pond
      f.a += rand(0.6, 1.6) * (Math.random() < 0.5 ? -1 : 1);
      f.from = { x: f.x, y: f.y }; f.to = { x: pond.x + Math.cos(f.a) * POND.rx * 1.05, y: pond.y + Math.sin(f.a) * POND.ry * 1.05 };
      f.face = Math.atan2(f.to.y - f.y, f.to.x - f.x); f.hop = 1;
    }
    if (dk > 0.5 && (f.croak -= dt) <= 0) { f.croak = rand(4, 12); emit(f.x, f.y - 8, 'note'); if (snd.soundMode() === 2) sfx('croak', f); }
  }
  // birds land, peck, and fly off when a turtle gets close
  const bf = objOf('birdfeeder'), wantBird = day ? 1 + (bf ? up.birds * 2 : 0) : 0;
  if (birds.length < wantBird && Math.random() < dt * (bf ? 0.15 : 0.03)) { // without a feeder a bird only drops by now and then
    const side = Math.random() < 0.5 ? -60 : YW + 60, nearFeeder = bf && Math.random() < 0.75;
    const to = nearFeeder ? { x: clamp(bf.x + rand(-60, 60), 30, YW - 30), y: clamp(bf.y + rand(-10, 50), 30, YH - 30) } : { x: rand(60, YW - 60), y: rand(60, YH - 60) };
    birds.push({ x: side, y: to.y - 120, to, fly: true, peck: 0, t: 0, face: side < 0 ? 0 : Math.PI, hue: [25, 10, 210][Math.floor(rand(0, 3))] });
  }
  for (const b of birds) {
    b.t += dt;
    if (b.fly) {
      const a = Math.atan2(b.to.y - b.y, b.to.x - b.x), d = dist(b, b.to);
      b.face = a; b.x += Math.cos(a) * Math.min(d, 160 * dt); b.y += Math.sin(a) * Math.min(d, 160 * dt);
      if (d < 2) { if (b.leaving) b.gone = true; else b.fly = false; }
      continue;
    }
    b.peck = Math.max(0, b.peck - dt);
    if (Math.random() < dt * 0.8) b.peck = 0.3;
    if (Math.random() < dt * 0.4) { const a = rand(0, 7); b.to = { x: clamp(b.x + Math.cos(a) * 18, 30, YW - 30), y: clamp(b.y + Math.sin(a) * 18, 30, YH - 30) }; b.face = a; b.x = b.to.x; b.y = b.to.y; }
    if (!day || turtles.some(t => dist(t, b) < t.S + 50) || b.t > 40) { // away!
      if (day && Math.random() < 0.04 + 0.06 * up.birds && loot.treasures.length <= MAX_DROPS) dropTreasure({ x: b.x, y: b.y }, 'critters'); // a feather or a bug
      b.fly = true; b.leaving = true; b.to = { x: b.x + (b.x < YW / 2 ? -1 : 1) * 500, y: b.y - 300 };
    }
  }
  birds = birds.filter(b => !b.gone);
}
function drawGroundLife(v) {
  const c = ctx;
  for (const l of ladybugs) {
    if (!inView(l, 10, v)) continue;
    c.save(); c.translate(l.x, l.y); c.rotate(l.a);
    c.fillStyle = '#d8342a'; c.beginPath(); c.ellipse(0, 0, 3.4, 2.8, 0, 0, 7); c.fill();
    c.fillStyle = '#1a1a1a'; c.beginPath(); c.arc(3, 0, 1.4, 0, 7); c.arc(-0.5, -1.1, 0.7, 0, 7); c.arc(-0.5, 1.1, 0.7, 0, 7); c.fill();
    c.restore();
  }
  for (const f of frogs) {
    if (!inView(f, 20, v)) continue;
    c.save(); c.translate(f.x, f.y); c.rotate(f.face + Math.PI / 2);
    c.fillStyle = '#0002'; c.beginPath(); c.ellipse(1, 3, 8, 7, 0, 0, 7); c.fill();
    c.fillStyle = '#5c9a3a'; c.beginPath(); c.ellipse(0, 0, 7, 8, 0, 0, 7); c.fill();
    c.fillStyle = '#4a7f2e'; c.beginPath(); c.ellipse(-6, 4, 3.5, 5, -0.4, 0, 7); c.ellipse(6, 4, 3.5, 5, 0.4, 0, 7); c.fill();
    c.fillStyle = '#e8f0c0'; c.beginPath(); c.arc(-3, -6, 2.6, 0, 7); c.arc(3, -6, 2.6, 0, 7); c.fill();
    c.fillStyle = '#111'; c.beginPath(); c.arc(-3, -6.4, 1.3, 0, 7); c.arc(3, -6.4, 1.3, 0, 7); c.fill();
    c.restore();
  }
  for (const b of birds) if (!b.fly && inView(b, 20, v)) drawBird(b);
}
function drawBird(b) {
  const c = ctx, body = `hsl(${b.hue},35%,${b.hue > 100 ? 45 : 38}%)`;
  c.save(); c.translate(b.x, b.y); c.rotate(b.face);
  if (!b.fly) { c.fillStyle = '#0002'; c.beginPath(); c.ellipse(1, 3, 7, 4, 0, 0, 7); c.fill(); }
  c.fillStyle = body;
  if (b.fly) { const w = Math.sin(b.t * 22) * 9; c.beginPath(); c.ellipse(-1, -4 - w * 0.4, 4, 9, -0.3, 0, 7); c.ellipse(-1, 4 + w * 0.4, 4, 9, 0.3, 0, 7); c.fill(); }
  c.beginPath(); c.ellipse(0, 0, 7, 4.5, 0, 0, 7); c.fill(); // body
  c.beginPath(); c.moveTo(-6, 0); c.lineTo(-11, -3); c.lineTo(-11, 3); c.closePath(); c.fill(); // tail
  const hx = b.peck > 0 ? 8 : 6;
  c.beginPath(); c.arc(hx, 0, 3.4, 0, 7); c.fill();
  c.fillStyle = '#e8a63a'; c.beginPath(); c.moveTo(hx + 3, -1); c.lineTo(hx + 6, 0); c.lineTo(hx + 3, 1); c.closePath(); c.fill();
  c.fillStyle = '#111'; c.beginPath(); c.arc(hx + 1, -1.6, 0.8, 0, 7); c.arc(hx + 1, 1.6, 0.8, 0, 7); c.fill();
  c.restore();
}
function drawAirLife(v) {
  const c = ctx;
  for (const b of bugs) {
    if (!inView(b, 20, v)) continue;
    if (b.drag) {
      c.save(); c.translate(b.x, b.y); c.rotate(Math.atan2(b.tgt.y - b.y, b.tgt.x - b.x));
      c.strokeStyle = `hsl(${b.hue},70%,40%)`; c.lineWidth = 2; c.beginPath(); c.moveTo(-10, 0); c.lineTo(5, 0); c.stroke();
      c.fillStyle = '#e6f6ff88'; const fl = Math.sin(b.t * 60) * 0.3;
      for (const [x, s] of [[1, 1], [1, -1], [-2, 1], [-2, -1]]) { c.beginPath(); c.ellipse(x, s * 5, 2.2, 6, s * (0.3 + fl), 0, 7); c.fill(); }
      c.restore();
    } else {
      const f = Math.abs(Math.sin(b.t * 14)) * 0.8 + 0.2, col = `hsl(${b.hue},80%,62%)`;
      c.save(); c.translate(b.x, b.y); c.scale(1.7, 1.7);
      c.fillStyle = '#0001'; c.beginPath(); c.ellipse(4, 14, 4, 2, 0, 0, 7); c.fill(); // shadow on the ground
      c.fillStyle = col;
      c.beginPath(); c.ellipse(-3 * f, -1, 4 * f, 4.5, -0.3, 0, 7); c.ellipse(3 * f, -1, 4 * f, 4.5, 0.3, 0, 7); c.fill();
      c.beginPath(); c.ellipse(-2.4 * f, 3, 3 * f, 3, 0.3, 0, 7); c.ellipse(2.4 * f, 3, 3 * f, 3, -0.3, 0, 7); c.fill();
      c.strokeStyle = '#2a2a2a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, -4); c.lineTo(0, 5); c.stroke();
      c.restore();
    }
  }
  for (const b of birds) if (b.fly && inView(b, 30, v)) drawBird(b);
}

// ---------- loot: treasure drops, collection book, daily gift, daily jobs ----------
// Treasures turn up in the yard every few hours (up to 3 wait for you while you're away). Each is a find for
// the collection book; finishing a set unlocks a decoration you can't buy. Nothing is lost by skipping a day.
const SETS = [
  { k: 'beach', name: 'Beach finds', reward: 'castle', items: [
    ['shell', '🐚', 'Spiral shell', 'Sea snails make their shells a little bigger every year.', 1],
    ['glass', '💠', 'Sea glass', 'Broken glass turns smooth and frosty after years of tumbling in the waves.', 2],
    ['bottle', '🍾', 'Message in a bottle', 'Some bottles float across whole oceans before washing up.', 3],
    ['starfish', '⭐', 'Starfish', 'A starfish can grow back a lost arm!', 2],
    ['pearl', '⚪', 'Pearl', 'Pearls grow inside oysters, layer by layer, around a tiny grain of sand.', 3]] },
  { k: 'gems', name: 'Sparkly gems', reward: 'crystal', items: [
    ['gem', '💎', 'Sparkly gem', 'Diamonds are the hardest natural thing on Earth.', 2],
    ['orb', '🔮', 'Crystal orb', 'Crystals grow slowly as tiny pieces stack up in neat patterns.', 2],
    ['ring', '💍', 'Lost ring', 'Someone must be missing this! Gold never rusts.', 3],
    ['crown', '👑', 'Tiny crown', 'Fit for the king or queen of the turtle yard.', 3],
    ['coins', '💰', 'Coin pouch', 'The oldest coins ever found are over 2,600 years old.', 1]] },
  { k: 'nature', name: 'Nature treasures', reward: 'statue', items: [
    ['bone', '🦴', 'Old bone', 'Fossils are bones that slowly turned to stone over millions of years.', 2],
    ['snail', '🐌', 'Snail shell', 'Painted turtles love snacking on snails. Crunchy!', 1],
    ['leaf', '🍂', 'Golden leaf', 'Leaves turn gold in autumn when trees stop making their green color.', 1],
    ['acorn', '🌰', 'Acorn', 'A tiny acorn can grow into a giant oak tree.', 1],
    ['shroom', '🍄', 'Lucky mushroom', 'Mushrooms aren\'t plants. They\'re fungi!', 2]] },
  { k: 'flowers', name: 'Flower petals', reward: 'wishtree', items: [
    ['blossom', '🌸', 'Cherry blossom', 'Cherry trees bloom for only about a week each spring.', 1],
    ['sunflower', '🌻', 'Sunflower', 'Young sunflowers turn to follow the sun across the sky.', 1],
    ['rose', '🌹', 'Rose', 'Roses are cousins of apples and strawberries.', 2],
    ['clover', '🍀', 'Four-leaf clover', 'Only about 1 in 5,000 clovers has four leaves. Lucky!', 3],
    ['hibiscus', '🌺', 'Hibiscus', 'Lots of turtles love munching hibiscus flowers.', 2]] },
  { k: 'critters', name: 'Critter friends', reward: 'frogstatue', items: [
    ['ladybug', '🐞', 'Ladybug', 'Ladybugs eat tiny bugs that hurt plants, so gardeners love them.', 1],
    ['bee', '🐝', 'Bumblebee', 'Bees do a little dance to tell their friends where the flowers are.', 2],
    ['caterpillar', '🐛', 'Caterpillar', 'Every caterpillar is a butterfly in training.', 1],
    ['cricket', '🦗', 'Cricket', 'Crickets chirp by rubbing their wings together.', 2],
    ['butterfly', '🦋', 'Butterfly wing', 'Butterflies taste with their feet!', 3]] },
  { k: 'toys', name: 'Lost & found', reward: 'flag', items: [
    ['dice', '🎲', 'Lucky dice', 'Opposite sides of a dice always add up to 7.', 1],
    ['teddy', '🧸', 'Teddy bear', 'Teddy bears are named after a US president, Teddy Roosevelt.', 3],
    ['balloon', '🎈', 'Balloon', 'A balloon rubbed on your hair can stick to a wall.', 1],
    ['key', '🔑', 'Old key', 'What could it open? Nobody knows…', 2],
    ['compass', '🧭', 'Compass', 'A compass needle always points north.', 2]] },
];
const ITEMS = {};
for (const s of SETS) for (const [id, icon, name, fact, rar] of s.items) ITEMS[id] = { id, icon, name, fact, rar, set: s.k };
const RARITY = { 1: 'Common', 2: 'Uncommon', 3: 'Rare' };
const DROP_EVERY = 3 * 3600e3, MAX_DROPS = 3, MILESTONES = { 7: 50, 30: 200, 100: 500 };
let loot = { last: 0, treasures: [], found: {}, sets: [], visits: 0, day: '', gift: null, jobs: null, powers: {}, boostUntil: 0, parcels: [], mailSeen: [] };
let pendingReward = null;

// Most finds only turn up once the yard has the right thing from the shop in it. The game never says which:
// buying things is how you find out. One common per set needs nothing, so every set gets started.
// Placed things and yard upgrades count for the yard you're in; toys count everywhere.
// Each gate says how many of that thing the yard has (0 = locked). More of it means that find turns up more
// often: every extra decoration of the kind, wildlife level or size upgrade adds half again (up to 4x).
const decoN = type => objs.filter(o => o.kind === 'deco' && o.type === type).length;
const objN = kind => (objOf(kind) ? 1 + (up.size[kind] || 0) : 0); // a placed thing, plus any size upgrades
const GATES = {
  glass: () => decoN('shell'),              // seashell decoration
  starfish: () => objN('sandrock'),         // sandstone rock
  bottle: () => objN('pond'),
  pearl: () => Math.max(0, up.bowl - 1),    // fountain, grand fountain
  gem: () => decoN('lantern'),
  orb: () => objN('fog'),
  ring: () => up.birds,                     // bird feeder: magpies love shiny things
  crown: () => objN('cave'),
  bone: () => objN('mud'),
  leaf: () => decoN('bush'),
  acorn: () => decoN('tree'),
  shroom: () => decoN('mushrooms'),
  sunflower: () => objN('lamp'),
  rose: () => decoN('flowers'),
  clover: () => objN('mossrock'),
  hibiscus: () => up.lily,                  // lily pads
  bee: () => decoN('bbush'),
  caterpillar: () => up.garden,
  cricket: () => objN('log'),
  butterfly: () => up.bugs,                 // bug hotel
  balloon: () => objN('slide'),
  key: () => objN('hut'),
  compass: () => objN('lookout'),
  teddy: () => (up.toys.includes('bell') ? 1 : 0),
};
const gateN = id => (GATES[id] ? GATES[id]() || 0 : 1);
const canFind = id => gateN(id) > 0;
const gateBoost = id => Math.min(4, 1 + 0.5 * (gateN(id) - 1));
const findable = () => Object.keys(ITEMS).filter(canFind);

// pick a find: commons are likelier; things you don't have yet get a little boost
function rollItem(setKey, minRar = 0) {
  const ok = Object.values(ITEMS).filter(it => (!setKey || it.set === setKey) && canFind(it.id));
  let pool = ok.filter(it => it.rar >= minRar);
  if (!pool.length) pool = ok.filter(it => it.rar === Math.max(...ok.map(x => x.rar))); // nothing that rare unlocked yet: the rarest it can be
  const w = it => ({ 1: 6, 2: 3, 3: 1 }[it.rar]) * (loot.found[it.id] ? 1 : 1.6) * gateBoost(it.id);
  let r = Math.random() * pool.reduce((a, it) => a + w(it), 0);
  for (const it of pool) if ((r -= w(it)) <= 0) return it.id;
  return pool[0].id;
}
function dropTreasure(at, setKey) { // somewhere open in the yard (or right where a bird took off)
  for (let tries = 0; tries < 25; tries++) {
    const p = at || { x: rand(60, YW - 60), y: rand(60, YH - 60) };
    if (!at && (inPond(p) || dist(p, bowl) < bowl.r + 25 || objs.some(o => o.kind !== 'deco' && dist(o, p) < hitR(o) + 20))) continue;
    keepInYard(p);
    loot.treasures.push({ x: p.x, y: p.y, id: rollItem(setKey) });
    return true;
  }
  return false;
}
function lootTick(now) {
  if (!loot.last) loot.last = now - DROP_EVERY; // first one right away
  let n = 0;
  while (now - loot.last >= DROP_EVERY) { loot.last += DROP_EVERY; if (loot.treasures.length < MAX_DROPS && dropTreasure(null, Math.random() < 0.2 * up.bugs ? 'critters' : null)) n++; }
  if (n) { say(`✨ ${n > 1 ? n + ' treasures' : 'A treasure'} turned up in the yard! Find ${n > 1 ? 'them' : 'it'} and tap`, 3500); save(); }
}
function addFind(id) { // returns true if it's new
  const isNew = !loot.found[id];
  loot.found[id] = (loot.found[id] || 0) + 1;
  const set = SETS.find(s => s.k === ITEMS[id].set);
  if (isNew && !loot.sets.includes(set.k) && set.items.every(([i]) => loot.found[i])) { loot.sets.push(set.k); pendingReward = set; }
  renderPills(); renderPowers();
  return isNew;
}
function collectTreasure(tr) {
  loot.treasures = loot.treasures.filter(x => x !== tr);
  const it = ITEMS[tr.id], isNew = addFind(tr.id), got = isNew ? 3 : 6; // doubles turn into extra stars
  earn(got, tr.x, tr.y - 20); emit(tr.x, tr.y, 'sparkle', 14); buzz([20, 40, 20]); snd.play('treasure');
  job('treasure');
  showFind(it.icon, it.name, isNew ? `New for your book! · ${RARITY[it.rar]}` : `You have ${loot.found[it.id]} of these · +${got} ⭐`, it.fact);
  save();
}
function openGift() {
  const g = loot.gift; loot.gift = null;
  const big = MILESTONES[loot.visits], got = big || Math.round(rand(8, 16) + Math.min(10, loot.visits * 0.3));
  earn(got, g.x, g.y - 30); emit(g.x, g.y, 'sparkle', 18); buzz([20, 40, 20, 40, 20]); snd.play('gift');
  let line = `+${got} ⭐`, it = null;
  if (big || Math.random() < 0.35) { // sometimes there's a find inside (milestone gifts: always a rare one)
    it = ITEMS[rollItem(null, big ? 3 : 0)];
    const isNew = addFind(it.id);
    line += ` and ${it.icon} ${it.name}${isNew ? ' (new!)' : ''}`;
  }
  showFind('🎁', big ? `Visit #${loot.visits} gift!` : 'Mystery gift!', line, it ? it.fact : `Come back tomorrow for another gift. You've visited ${loot.visits} day${loot.visits > 1 ? 's' : ''}!`);
  save();
}
const findEl = document.getElementById('find');
function showFind(icon, title, tag, fact) {
  findEl.querySelector('.big').textContent = icon;
  findEl.querySelector('.title').textContent = title;
  findEl.querySelector('.tag').textContent = tag;
  findEl.querySelector('.fact').textContent = fact;
  findEl.hidden = false;
}
findEl.querySelector('button').onclick = () => {
  findEl.hidden = true;
  if (!pendingReward) return;
  const set = pendingReward, d = DECOS[set.reward]; pendingReward = null;
  earn(50, cam.x, cam.y); snd.play('fanfare');
  const P = POWERS[set.k];
  showFind(d.icon, `${set.name} complete!`, `+50 ⭐ and a ${d.name}, with the power ${P.icon} ${P.name}!`, `${P.desc} Tap the yard to choose where the ${d.name} goes: it works in the yard it's in.`);
  const o = newObj('deco'); o.type = set.reward; o.seed = Math.random(); startPlacing(o);
};
function drawLoot(time, v) {
  const c = ctx, sz = Math.max(30, 22 / cam.z);
  for (const t of loot.treasures) {
    if (!inView(t, sz * 2, v)) continue;
    const pulse = 0.5 + 0.5 * Math.sin(time * 3 + t.y * 0.1), gr = sz * (1.1 + 0.3 * pulse); // soft golden glow so it's easy to spot
    const glow = c.createRadialGradient(t.x, t.y, 0, t.x, t.y, gr);
    glow.addColorStop(0, `rgba(255,230,120,${0.45 + 0.25 * pulse})`); glow.addColorStop(1, 'rgba(255,230,120,0)');
    c.fillStyle = glow; c.beginPath(); c.arc(t.x, t.y, gr, 0, 7); c.fill();
    c.fillStyle = '#b49a64'; c.beginPath(); c.ellipse(t.x, t.y + sz * 0.25, sz * 0.75, sz * 0.32, 0, 0, 7); c.fill(); // little dug-up mound
    c.fillStyle = '#cdb47e'; c.beginPath(); c.ellipse(t.x - sz * 0.15, t.y + sz * 0.15, sz * 0.4, sz * 0.15, 0, 0, 7); c.fill();
    const tw = Math.sin(time * 4 + t.x * 0.1);
    drawEmoji(c, '✨', t.x, t.y - sz * 0.35, sz * (1 + 0.2 * tw));
  }
  const g = loot.gift;
  if (g && inView(g, 50, v)) {
    const gs = Math.max(34, 24 / cam.z), hop = Math.abs(Math.sin(time * 3)) * gs * 0.2;
    c.fillStyle = '#0003'; c.beginPath(); c.ellipse(g.x, g.y + gs * 0.35, gs * 0.45 * (1 - hop / gs), gs * 0.15, 0, 0, 7); c.fill();
    drawEmoji(c, '🎁', g.x, g.y - hop, gs);
  }
  for (const pc of loot.parcels) { // care packages from friends, with who sent them
    if (pc.x === undefined) placeParcel(pc);
    if (!inView(pc, 60, v)) continue;
    const P = PKG[pc.tier || 0], gs = Math.max(34, 24 / cam.z) * P.size, hop = Math.abs(Math.sin(time * 2.6 + pc.x)) * gs * 0.15;
    if (P.glow) { // big and grand boxes shine so they're easy to spot
      const pulse = 0.5 + 0.5 * Math.sin(time * 3 + pc.x), gr = gs * (0.9 + 0.25 * pulse) * P.glow;
      const glow = c.createRadialGradient(pc.x, pc.y, 0, pc.x, pc.y, gr);
      glow.addColorStop(0, `rgba(255,220,110,${0.35 + 0.25 * pulse})`); glow.addColorStop(1, 'rgba(255,220,110,0)');
      c.fillStyle = glow; c.beginPath(); c.arc(pc.x, pc.y, gr, 0, 7); c.fill();
    }
    c.fillStyle = '#0003'; c.beginPath(); c.ellipse(pc.x, pc.y + gs * 0.35, gs * 0.45 * (1 - hop / gs), gs * 0.15, 0, 0, 7); c.fill();
    drawEmoji(c, '📦', pc.x, pc.y - hop, gs);
    if (P.glow > 1) drawEmoji(c, '✨', pc.x + gs * 0.4, pc.y - hop - gs * 0.4, gs * 0.45);
    const sp = textSprite(`${P.tag}from ${pc.name}`, '700 24px system-ui, sans-serif', '#fff', '#0009', 6), k = Math.max(11, 9 / cam.z) / 24; // one sprite, scaled with the zoom
    c.drawImage(sp.cv, pc.x - sp.w * k / 2, pc.y + gs * 0.72 - sp.h * k / 2, sp.w * k, sp.h * k);
  }
}

// ---------- powers: every set unlocks a one-tap ability for the whole yard ----------
// Finishing a set earns its reward decoration; placing that decoration in a yard switches the power on there.
// Powers recharge in 3 hours, or instantly by spending a spare duplicate find from that set.
const POWER_RECHARGE = 3 * 3600e3;
const POWERS = {
  beach: { icon: '🧹', name: 'Tidy Tide', desc: 'Scoops every poop, washes muddy turtles and fills the water.', run() {
    const n = poops.length; poops.forEach(q => emit(q.x, q.y, 'sparkle', 4)); poops = [];
    for (const t of turtles) if (t.mud > 0) { t.mud = 0; emit(t.x, t.y, 'drop', 6); }
    bowl.level = 1; bowl.fill = 1;
    if (n) job('scoop', null, n);
    return n ? `Sparkling clean! ${n} mess${n > 1 ? 'es' : ''} gone` : 'Everything sparkles!';
  } },
  nature: { icon: '🍽️', name: 'Forest Feast', desc: 'Fills every turtle right up.', run() {
    for (const t of turtles) { t.st.hunger = 100; t.st.happy = clamp(t.st.happy + 5, 0, 100); emit(t.x, t.y, 'crumb', 8); }
    return 'A feast for everyone!';
  } },
  flowers: { icon: '💚', name: 'Happy Bloom', desc: 'Everyone happy, and nobody lonely.', run() {
    for (const t of turtles) { t.st.happy = 100; t.st.social = 100; emit(t.x, t.y - t.S, 'heart', 3); }
    return 'Love is in the air!';
  } },
  critters: { icon: '🌙', name: 'Lullaby', desc: 'Everyone rested and toasty warm.', run() {
    for (const t of turtles) { t.st.energy = 100; t.st.warm = 100; emit(t.x, t.y - t.S, 'note', 2); }
    return 'Everyone feels rested!';
  } },
  gems: { icon: '⭐', name: 'Star Shower', desc: 'Double stars from everything for 10 minutes.', run() {
    loot.boostUntil = Date.now() + 10 * 60e3;
    return 'Double stars for 10 minutes!';
  } },
  toys: { icon: '🔍', name: 'Treasure Sense', desc: 'A new treasure appears right now.', run() {
    dropTreasure({ x: clamp(cam.x + rand(-120, 120), 60, YW - 60), y: clamp(cam.y + rand(-120, 120), 60, YH - 60) });
    return 'A treasure appeared nearby! ✨';
  } },
};
const setFinds = k => SETS.find(s => s.k === k).items.filter(([id]) => loot.found[id]).length;
const rewardOf = k => SETS.find(s => s.k === k).reward;
const powerOfDeco = type => SETS.find(s => s.reward === type)?.k;
const powerHere = k => objs.some(o => o.kind === 'deco' && o.type === rewardOf(k)); // its decoration is in this yard
const powerCooldown = () => POWER_RECHARGE;
const powerLeft = k => Math.max(0, (loot.powers[k] || 0) + powerCooldown(k) - Date.now()); // ms until ready
const spares = k => SETS.find(s => s.k === k).items.reduce((a, [id]) => a + Math.max(0, (loot.found[id] || 0) - 1), 0);
function usePower(k) {
  const P = POWERS[k];
  if (powerLeft(k) > 0) {
    const left = fmtTime(powerLeft(k) / 1000), sp = spares(k);
    if (!sp) return say(`${P.icon} ${P.name} recharges in ${left}. Spare duplicate finds can recharge it instantly`, 3500);
    return askConfirm(`${P.icon} Recharge ${P.name}?`, `It's ready in ${left}. Use one of your ${sp} spare duplicate find${sp > 1 ? 's' : ''} to recharge it now?`, '✨ Recharge', () => {
      const set = SETS.find(s => s.k === k), id = set.items.map(([i]) => i).filter(i => (loot.found[i] || 0) > 1).sort((a, b) => ITEMS[a].rar - ITEMS[b].rar)[0]; // spend the commonest spare
      if (!id) return;
      loot.found[id]--; loot.powers[k] = 0; save(); renderPowers(); renderPills();
      say(`✨ ${P.name} is ready! (used a spare ${ITEMS[id].icon} ${ITEMS[id].name})`, 3000); snd.play('job');
    });
  }
  loot.powers[k] = Date.now();
  const msg = P.run();
  emit(cam.x, cam.y, 'sparkle', 24); snd.play('gift'); buzz([20, 40, 20]);
  say(`${P.icon} ${P.name}! ${msg}`, 3000);
  job('power'); save(); renderPowers();
}
function renderPowers() { } // charge is drawn on each set decoration in the yard (see drawDeco)

// ---------- daily jobs: five tasks a day for bonus stars ----------
// g = group (at most one job per group a day), on = the event it counts (default: its own k),
// d = count each turtle only once, state = checked every second instead of counted, ok = only offered when possible.
// n can depend on c, the number of turtles in the yard.
const JOBS = [
  { k: 'pet', g: 'pet', n: () => 15, text: n => `Pet your turtles ${n} times` },
  { k: 'petOne', g: 'pet', n: () => 6, text: (n, w) => `Pet ${w} ${n} times` },
  { k: 'petAll', g: 'pet', on: 'pet', d: true, n: c => c, text: n => `Pet all ${n} of your turtles 💕`, ok: c => c >= 2 },
  { k: 'snack', g: 'food', n: () => 12, text: n => `Drop ${n} snacks` },
  { k: 'berryAll', g: 'food', on: 'berry', d: true, n: c => Math.min(c, 4), text: n => `Feed berries 🍓 to ${n} different turtles`, ok: c => c >= 2 },
  { k: 'berry', g: 'food', n: () => 4, text: n => `Turtles finish ${n} berries 🍓`, ok: c => c < 2 },
  { k: 'eat', g: 'food', n: c => Math.min(6 + c * 2, 14), text: n => `Turtles finish ${n} meals` },
  { k: 'harvest', g: 'food', n: () => 4, text: n => `Turtles eat ${n} things from the garden 🥬`, ok: () => up.garden && !!objOf('garden') },
  { k: 'scoop', g: 'clean', n: c => Math.min(4 + c * 2, 12), text: n => `Scoop ${n} poops` },
  { k: 'wash', g: 'clean', n: () => 2, text: n => `Wash ${n} muddy turtles 🛁`, ok: () => !!objOf('mud') },
  { k: 'play', g: 'play', n: () => 25, text: n => `Turtles nudge the toy ${n} times` },
  { k: 'playAll', g: 'play', on: 'play', d: true, n: c => Math.min(c, 4), text: n => `${n} different turtles play with the toy`, ok: c => c >= 2 },
  { k: 'slide', g: 'play', n: () => 3, text: n => `Turtles go down the slide ${n} times 🛝`, ok: () => !!objOf('slide') },
  { k: 'call', g: 'call', n: () => 5, text: n => `Call a turtle over ${n} times` },
  { k: 'treasure', g: 'treasure', n: () => 1, text: () => 'Find a treasure ✨', ok: () => loot.treasures.length > 0 },
  { k: 'happyAll', g: 'mood', state: t => t.st.happy >= 80, n: () => 1, text: () => 'Get every turtle to 80+ happiness at once 😊' },
  { k: 'fullAll', g: 'mood', state: t => t.st.hunger >= 85, n: () => 1, text: () => 'Get every turtle full (85+ food) at once 🍽️' },
  { k: 'paint', g: 'yard', n: () => 40, text: n => `Paint ${n} squares of ground 🖌️`, ok: () => up.brushes.some(b => b !== 'sand') },
  { k: 'power', g: 'yard', n: () => 1, text: () => 'Use a set decoration\'s power ✨', ok: () => SETS.some(s => powerHere(s.k)) },
  { k: 'package', g: 'yard', n: () => 1, text: () => 'Send a friend a care package 📦', ok: () => friends.length > 0 },
];
const JOB_COUNT = 5, JOB_STARS = 20, JOBS_BONUS = 50;
function newJobs(list = []) { // pass today's jobs to top them up instead of starting over
  const c = turtles.length, groups = new Set(list.map(j => JOBS.find(x => x.k === j.k)?.g || j.k));
  const pool = JOBS.filter(j => (!j.ok || j.ok(c)) && !groups.has(j.g));
  const bonus = list.length > 0 && !!loot.jobs?.bonus; // already got today's bonus: topping up doesn't pay it twice
  while (list.length < JOB_COUNT && pool.length) {
    const j = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    if (groups.has(j.g)) continue; // one job of each kind a day
    groups.add(j.g);
    const who = j.k === 'petOne' ? turtles[Math.floor(Math.random() * turtles.length)].name : null, n = Math.max(1, j.n(c));
    list.push({ k: j.k, on: j.on, d: j.d, n, have: 0, who, seen: j.d ? [] : undefined, text: j.text(n, who) });
  }
  loot.jobs = { list, bonus };
}
let jobCheckT = 0;
function jobTick(dt) { // the "everyone at once" jobs: looked at once a second
  if ((jobCheckT -= dt) > 0 || !loot.jobs) return;
  jobCheckT = 1;
  const live = turtles.filter(t => !t.dying);
  if (!live.length) return;
  for (const j of loot.jobs.list) {
    const J = JOBS.find(x => x.k === j.k);
    if (J?.state && j.have < j.n && live.every(J.state)) job(j.k);
  }
}
function job(k, who = null, amount = 1) {
  if (!loot.jobs) return;
  for (const j of loot.jobs.list) {
    if (j.have >= j.n) continue;
    if ((j.on || j.k) !== k && !(k === 'pet' && j.k === 'petOne' && j.who === who)) continue;
    if (j.d) { // each turtle counts once
      j.seen ??= [];
      if (!who || j.seen.includes(who)) continue;
      j.seen.push(who);
    }
    j.have = Math.min(j.n, j.have + (j.d ? 1 : amount));
    if (j.have >= j.n) { earn(JOB_STARS, cam.x, cam.y); snd.play('job'); say(`📋 Job done: ${j.text}! +${JOB_STARS} ⭐`, 3000); }
  }
  if (!loot.jobs.bonus && loot.jobs.list.every(j => j.have >= j.n)) {
    loot.jobs.bonus = true;
    setTimeout(() => { earn(JOBS_BONUS, cam.x, cam.y); say(`🎉 All of today's jobs done! +${JOBS_BONUS} ⭐ bonus`, 3500); }, 1500);
  }
  renderPills();
}

// ---------- painting the ground ----------
// The yard is a grid of TILE-sized squares. Painted ones are drawn as soft rounded patches (paths as neat paving),
// built into Path2D shapes per 8x8-tile chunk and only rebuilt when something changes, so drawing stays cheap.
const GROUND = {
  // cost = one-time price to unlock that brush; painting with it is free after that
  sand: { name: 'Sand (erase)', col: '#d9c494', cost: 0 },
  grass: { name: 'Grass', col: '#7fb04f', cost: 50, dots: ['#6a9a40', '#93c25e'] },
  dirt: { name: 'Dirt', col: '#9b7650', cost: 40, dots: ['#86643f', '#ad8a62'] },
  gravel: { name: 'Gravel', col: '#b9b2a6', cost: 60, dots: ['#8f887c', '#d6d0c4', '#a39b8e'] },
  moss: { name: 'Moss', col: '#5c8c3c', cost: 100, dots: ['#4c7a30', '#6fa24a'] },
  stone: { name: 'Stone path', col: '#c9c2b5', cost: 150, pave: 'stone' },
  meadow: { name: 'Meadow', col: '#86b552', cost: 180, dots: ['#f26d8f', '#f7d14a', '#ffffff', '#b77df0'], big: true },
  brick: { name: 'Brick path', col: '#b5654a', cost: 220, pave: 'brick' },
  wood: { name: 'Boardwalk', col: '#a8794a', cost: 260, pave: 'wood' },
  water: { name: 'Water', col: '#3f8fc4', cost: 1000 }, // dearer than every fountain upgrade together
};
const CHUNK = 8;
let gChunks = new Map(), gDirty = new Set(), waterTiles = [];
function groundChanged() { gChunks = new Map(); gDirty = new Set(['all']); waterTiles = Object.keys(ground).filter(k => ground[k] === 'water').map(k => { const [c, r] = k.split(',').map(Number); return { x: (c + 0.5) * TILE, y: (r + 0.5) * TILE }; }); }
function nearestWater(p) { let b = null, bd = 1e9; for (const w of waterTiles) { const d = dist(w, p); if (d < bd) { bd = d; b = w; } } return b; } // a tile centre (same object each time)
const tileRand = (c, r) => seeded(((c * 73856093) ^ (r * 19349663)) % 1000003 / 1000003 + 0.0001);
// Smooth auto-tiling: each painted tile is a square whose OUTSIDE corners are rounded (where neither side
// neighbour matches) and whose INSIDE corners get a curved fillet, so neighbouring tiles of one type join into
// a single flowing shape instead of a row of bumps.
const SHADE = { // rim (drawn under the fill so only the outer edge shows) and deep-water colours
  grass: '#5f8f3a', moss: '#466f2c', meadow: '#679a3e', dirt: '#7d5c3c', gravel: '#989083',
  stone: '#a39b8e', brick: '#8e4a34', wood: '#7a5530', water: '#c2a874',
};
const LAYERS = ['bank', 'water', 'deep', 'dirt', 'gravel', 'grass', 'moss', 'meadow', 'stone', 'brick', 'wood']; // bottom to top
function addTileShape(path, x, y, rad, same, c, r) {
  const n = same(c, r - 1), e = same(c + 1, r), s2 = same(c, r + 1), w = same(c - 1, r);
  const o = 0.6; // tiny overlap so neighbours never show a hairline seam
  path.roundRect(x - o, y - o, TILE + 2 * o, TILE + 2 * o, [!n && !w ? rad : 0, !n && !e ? rad : 0, !s2 && !e ? rad : 0, !s2 && !w ? rad : 0]);
  const fillet = (px, py, dx, dy) => { // concave corner: a small curved wedge in the empty diagonal square
    path.moveTo(px, py); path.lineTo(px + dx * rad, py); path.quadraticCurveTo(px, py, px, py + dy * rad); path.closePath();
  };
  // (fillets are drawn from the corner of THIS tile into the empty diagonal; outward directions per corner)
  if (n && e && !same(c + 1, r - 1)) fillet(x + TILE, y, 1, -1);
  if (n && w && !same(c - 1, r - 1)) fillet(x, y, -1, -1);
  if (s2 && e && !same(c + 1, r + 1)) fillet(x + TILE, y + TILE, 1, 1);
  if (s2 && w && !same(c - 1, r + 1)) fillet(x, y + TILE, -1, 1);
}
function buildChunk(cx, cy, gmap = ground) {
  const layers = {}, L = (name, kind, col, extra) => (layers[name + kind + col] ??= { z: LAYERS.indexOf(name) * 10 + (kind === 'rim' ? 0 : kind === 'fill' ? 1 : kind === 'dots' ? 2 : 3), kind, col, path: new Path2D(), ...extra });
  const typeAt = (c, r) => gmap[`${c},${r}`];
  for (let c = cx * CHUNK; c < (cx + 1) * CHUNK; c++) for (let r = cy * CHUNK; r < (cy + 1) * CHUNK; r++) {
    const t = typeAt(c, r); if (!t) continue;
    const G = GROUND[t], x = c * TILE, y = r * TILE, rnd = tileRand(c, r);
    const same = (cc, rr) => typeAt(cc, rr) === t;
    const rad = G.pave ? 7 : TILE * 0.48;
    if (t === 'water') {
      addTileShape(L('bank', 'rim', SHADE.water, { w: 16 }).path, x, y, rad, same, c, r); // sandy bank: a wide stroke under the water
      addTileShape(L('water', 'fill', '#5fb0dc').path, x, y, rad, same, c, r);
      const deep = (cc, rr) => same(cc, rr) && same(cc - 1, rr) && same(cc + 1, rr) && same(cc, rr - 1) && same(cc, rr + 1);
      if (deep(c, r)) addTileShape(L('deep', 'fill', '#3d88c0').path, x, y, TILE * 0.48, deep, c, r); // darker in the middle
      if (rnd() < 0.5) { const sp = L('deep', 'dots', '#ffffff55').path, ex = x + 8 + rnd() * 24, ey = y + 8 + rnd() * 24; sp.moveTo(ex + 6, ey); sp.ellipse(ex, ey, 6, 1.6, 0, 0, Math.PI * 2); }
      continue;
    }
    addTileShape(L(t, 'rim', SHADE[t], { w: 3 }).path, x, y, rad, same, c, r);
    addTileShape(L(t, 'fill', G.col).path, x, y, rad, same, c, r);
    const dot = (path, dx, dy, rr2) => { path.moveTo(dx + rr2, dy); path.arc(dx, dy, rr2, 0, Math.PI * 2); };
    if (G.dots) for (let i = 0; i < (G.big ? 7 : 5); i++) dot(L(t, 'dots', G.dots[Math.floor(rnd() * G.dots.length)]).path, x + 5 + rnd() * (TILE - 10), y + 5 + rnd() * (TILE - 10), G.big ? 2.6 : 1.6);
    if (G.pave === 'stone') { const sp = L(t, 'lines', SHADE.stone).path; for (const [a, b] of [[2, 2], [TILE / 2 + 1, 2], [2, TILE / 2 + 1], [TILE / 2 + 1, TILE / 2 + 1]]) sp.rect(x + a, y + b, TILE / 2 - 3, TILE / 2 - 3); }
    if (G.pave === 'brick') { const sp = L(t, 'lines', SHADE.brick).path; for (let i = 1; i < 4; i++) { sp.moveTo(x, y + i * 10); sp.lineTo(x + TILE, y + i * 10); } for (let i = 0; i < 4; i++) for (let bx = i % 2 ? 10 : 0; bx < TILE; bx += 20) { sp.moveTo(x + bx, y + i * 10); sp.lineTo(x + bx, y + i * 10 + 10); } }
    if (G.pave === 'wood') { const sp = L(t, 'lines', SHADE.wood).path; for (let i = 1; i < 5; i++) { sp.moveTo(x + i * 8, y); sp.lineTo(x + i * 8, y + TILE); } const nl = L(t, 'dots', '#5a3c20').path; for (let i = 0; i < 5; i++) { dot(nl, x + i * 8 + 4, y + 4, 0.9); dot(nl, x + i * 8 + 4, y + TILE - 4, 0.9); } }
  }
  return Object.values(layers);
}
function drawGround(v) {
  if (gDirty.has('all')) {
    gChunks = new Map();
    const keys = new Set(Object.keys(ground).map(k => { const [c, r] = k.split(',').map(Number); return `${Math.floor(c / CHUNK)},${Math.floor(r / CHUNK)}`; }));
    for (const k of keys) { const [cx, cy] = k.split(',').map(Number); gChunks.set(k, buildChunk(cx, cy)); }
  } else for (const k of gDirty) { const [cx, cy] = k.split(',').map(Number); gChunks.set(k, buildChunk(cx, cy)); }
  gDirty.clear();
  drawChunks(gChunks, v, ctx);
}
// Layer by layer across every visible chunk (not chunk by chunk), so one chunk's bank can't cover its neighbour's water.
function drawChunks(chunks, v, c) {
  const span = CHUNK * TILE, ops = [];
  for (const [k, list] of chunks) {
    const [cx, cy] = k.split(',').map(Number);
    if (cx * span > v.x1 + 30 || (cx + 1) * span < v.x0 - 30 || cy * span > v.y1 + 30 || (cy + 1) * span < v.y0 - 30) continue;
    for (const o of list) ops.push(o);
  }
  ops.sort((a, b) => a.z - b.z);
  c.lineJoin = 'round';
  for (const o of ops) {
    if (o.kind === 'rim') { c.strokeStyle = o.col; c.lineWidth = o.w; c.stroke(o.path); }
    else if (o.kind === 'lines') { c.strokeStyle = o.col; c.lineWidth = 1.2; c.stroke(o.path); }
    else { c.fillStyle = o.col; c.fill(o.path); }
  }
  c.lineJoin = 'miter';
}

// paint mode
let painting = false, paintType = 'grass', brush = 2, paintSpent = 0, lastPaint = null, paintBroke = false;
const paintbar = document.getElementById('paintbar');
const BRUSHES = { 1: 'Small', 2: 'Medium', 3: 'Big' };
const hasBrush = k => up.brushes.includes(k);
function renderPaintbar() {
  paintbar.querySelector('.sw').innerHTML = Object.entries(GROUND).map(([k, g]) =>
    `<button data-k="${k}" class="${k === paintType ? 'on' : ''} ${hasBrush(k) ? '' : 'locked'}"><i style="background:${g.col}"></i>${g.name}<span>${hasBrush(k) ? '✓' : '🔒 ⭐' + g.cost}</span></button>`).join('');
  paintbar.querySelector('.brush').textContent = `🖌️ ${BRUSHES[brush]}`;
  const locked = !hasBrush(paintType), ub = paintbar.querySelector('.unlock');
  ub.hidden = !locked;
  if (locked) ub.textContent = `🔓 ⭐${GROUND[paintType].cost}`;
  paintbar.querySelector('.info').textContent = locked ? `Unlock ${GROUND[paintType].name} once, then paint with it for free` : 'One finger paints · two fingers move & zoom';
}
const toolsEl = document.getElementById('tools');
function startPaint() {
  shop.hidden = true; endArrange(); placing = null;
  painting = true; paintSpent = 0;
  toolsEl.style.display = 'none'; // the palette takes the toolbar's place, and the camera can scroll the yard above it
  paintbar.style.bottom = 'calc(env(safe-area-inset-bottom) + 10px)';
  renderPaintbar(); paintbar.hidden = false;
  document.getElementById('toybar').hidden = true;
  requestAnimationFrame(() => { measureBottom(); clampCam(); });
  say('Pick a ground and drag one finger to paint · two fingers move the camera', 3500);
}
function endPaint() {
  if (!painting) return;
  painting = false; paintbar.hidden = true; gest = null;
  toolsEl.style.display = '';
  measureBottom(); clampCam();
  save();
}
function paintAt(p) {
  const rad = brush - 1, c0 = Math.floor(p.x / TILE), r0 = Math.floor(p.y / TILE);
  let changed = false, painted = 0;
  for (let dc = -rad; dc <= rad; dc++) for (let dr = -rad; dr <= rad; dr++) {
    if (dc * dc + dr * dr > rad * rad + rad) continue; // roundish brush
    const c = c0 + dc, r = r0 + dr;
    if (c < 0 || r < 0 || c * TILE >= YW || r * TILE >= YH) continue;
    const k = `${c},${r}`, cur = ground[k] || 'sand';
    if (cur === paintType) continue;
    if (!hasBrush(paintType)) { if (!paintBroke) { say(`🔒 Unlock ${GROUND[paintType].name} first`, 2500); paintBroke = true; } return; }
    if (paintType === 'sand') delete ground[k]; else { ground[k] = paintType; painted++; }
    for (const [dc2, dr2] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) gDirty.add(`${Math.floor((c + dc2) / CHUNK)},${Math.floor((r + dr2) / CHUNK)}`); changed = true;
  }
  if (changed) {
    if (paintType === 'water' || waterTiles.length) waterTiles = Object.keys(ground).filter(k => ground[k] === 'water').map(k => { const [c, r] = k.split(',').map(Number); return { x: (c + 0.5) * TILE, y: (r + 0.5) * TILE }; });
    snd.play('drop'); renderPaintbar();
    if (painted) job('paint', null, painted);
  }
}
paintbar.querySelector('.sw').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; paintType = b.dataset.k; renderPaintbar(); snd.play('click'); });
paintbar.querySelector('.brush').onclick = () => { brush = brush % 3 + 1; renderPaintbar(); snd.play('click'); };
paintbar.querySelector('.done').onclick = () => endPaint();
paintbar.querySelector('.unlock').onclick = () => {
  const g = GROUND[paintType];
  if (hasBrush(paintType)) return;
  if (stars < g.cost) return say(`You need ⭐${g.cost} to unlock ${g.name}`, 2500);
  stars -= g.cost; up.brushes.push(paintType); snd.play('buy'); emit(cam.x, cam.y, 'sparkle', 12);
  say(`🔓 ${g.name} unlocked! Paint away`, 2500); renderPaintbar(); save();
};

// ---------- multiple yards ----------
const MAX_YARDS = 5, YARD_COSTS = [1500, 4000, 8000, 15000];
const yardCost = () => YARD_COSTS[yards.length - 1];
function resetYardRuntime() { // things that only make sense in the yard you were just in
  endArrange();
  endPaint();
  ball = null; crabs = []; bugs = []; frogs = []; birds = []; ladybugs = []; flies = []; parts = [];
  placing = null; marker = null; camFollow = null; feederT = 0;
}
function switchYard(j) {
  if (j === yardIdx || !yards[j]) return;
  yards[yardIdx] = packYard();
  yardIdx = j;
  const y = yards[j];
  setYardState(y); resetYardRuntime(); applyYard(); clampCam();
  syncCrabs(); ensurePlots();
  for (const p of [...loot.treasures, ...(loot.gift ? [loot.gift] : []), ...loot.parcels.filter(p => p.x !== undefined)]) keepInYard(p); // finds, gifts and parcels travel with you
  for (const t of turtles) { use(t); resetFeet(); }
  use(sel);
  graceT = GRACE_SECS;
  const secs = clamp((Date.now() - (y.t || Date.now())) / 1000, 0, 7 * 86400);
  if (secs > 90) showAway(simulateAway(secs), yardName);
  save(); renderPills();
  say(`🏡 Welcome to ${yardName}`, 2200);
}
function buildYard() {
  const n = yards.length + 1;
  const W0 = base.w, H0 = base.h, h = makeTurtle({ growth: 0, x: W0 / 2, y: H0 / 2, a: rand(-3, 3), morph: rollMorph() });
  yards[yardIdx] = packYard();
  yards.push({ name: `Yard ${n}`, t: Date.now(), turtles: [packTurtle(h)], sel: 0, poops: [], level: 1, foods: [], up: {}, objs: [], plots: [], ground: {},
    bowlPos: { x: W0 - 60, y: 58 }, cam: { x: W0 / 2, y: H0 / 2, z: 1 } });
  const j = yards.length - 1;
  shop.hidden = true;
  askName('Name your new yard 🏞️', `Yard ${n}`, name => {
    yards[j].name = name;
    switchYard(j);
    say(`🏞️ ${name} is ready, with a new hatchling, ${h.name}! Move turtles here from their ⋯ menu`, 4500);
  }, 24);
}
function moveTurtle(t, j) {
  const y = yards[j];
  if (!y || j === yardIdx || turtles.length < 2) return;
  const W = base.w * YARDS[y.up?.yard || 0].m, H = base.h * YARDS[y.up?.yard || 0].m;
  const p = packTurtle(t);
  p.x = W / 2 + rand(-60, 60); p.y = H / 2 + rand(-60, 60); p.arrived = Date.now();
  y.turtles.push(p);
  turtles = turtles.filter(x => x !== t);
  if (sel === t || !turtles.includes(sel)) sel = turtles[0];
  use(sel); save(); renderPills();
  say(`🚚 ${t.name} moved to ${y.name}`, 3000); snd.play('hatch');
}
const yardsEl = document.getElementById('yards'), yardsBtn = document.getElementById('yards-btn');
function yardSummary(i) { // turtle count and any problems, for the live yard or a stored one
  const list = i === yardIdx ? turtles.filter(own) : yards[i].turtles;
  const sick = list.filter(t => t.st.health < SICK).length, needy = list.filter(t => t.st.hunger < 30 || t.st.thirst < 30).length;
  const ago = i === yardIdx ? 0 : (Date.now() - yards[i].t) / 1000;
  const st = sick ? '🤒' : needy ? '🥬' : ago > 86400 ? '👀' : '😊';
  const info = `🐢 ${list.length} turtle${list.length === 1 ? '' : 's'}` + (i === yardIdx ? ' · 📍 you are here' : ago > 120 ? ` · visited ${fmtTime(ago)} ago` : '');
  return { name: i === yardIdx ? yardName : yards[i].name, count: list.length, fits: Math.min(MAX_TURTLES, YARDS[(i === yardIdx ? up : yards[i].up || {}).yard || 0].fits), st, info };
}
let movingTurtle = null;
function openYards(moving = null) {
  movingTurtle = moving;
  yardsEl.querySelector('h2').textContent = moving ? `🚚 Move ${moving.name} to…` : '🏡 Your yards';
  yardsEl.querySelector('.sub').textContent = moving ? 'Pick a yard with room' : (yards.length > 1 ? 'Tap a yard to visit it' : 'Build another yard in the shop, then move turtles between them');
  yardsEl.querySelector('.list').innerHTML = yards.map((_, i) => {
    const s = yardSummary(i), full = s.count >= s.fits;
    if (moving && i === yardIdx) return '';
    return `<button class="yd ${i === yardIdx ? 'here' : ''}" data-i="${i}" ${moving && full ? 'disabled' : ''}><b>${esc(s.name)}</b><span class="st">${moving && full ? 'Full' : s.st}</span><small>${s.info}</small></button>`;
  }).join('');
  yardsEl.querySelector('.acts').innerHTML = moving ? '' : `<button class="rename">✏️ Rename ${esc(yardName)}</button><button class="backup">💾 Save &amp; load game</button>`
    + (yards.length < MAX_YARDS ? `<button class="buy" ${stars < yardCost() ? 'disabled' : ''}>🏞️ Build another yard · ⭐ ${yardCost()}</button>` : '');
  yardsEl.hidden = false;
}
yardsEl.querySelector('.list').addEventListener('click', e => {
  const b = e.target.closest('.yd'); if (!b || b.disabled) return;
  const j = +b.dataset.i;
  yardsEl.hidden = true;
  if (movingTurtle) { const t = movingTurtle; movingTurtle = null; return moveTurtle(t, j); }
  switchYard(j);
});
yardsEl.querySelector('.acts').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  yardsEl.hidden = true;
  if (b.classList.contains('backup')) return openBackup();
  if (b.classList.contains('rename')) return askName('Rename this yard', yardName, n => { yardName = n; save(); renderPills(); }, 24);
  if (b.classList.contains('buy') && stars >= yardCost()) { stars -= yardCost(); snd.play('buy'); buildYard(); }
});
yardsEl.querySelector('.close').onclick = () => { yardsEl.hidden = true; movingTurtle = null; };
yardsEl.addEventListener('click', e => { if (e.target === yardsEl) { yardsEl.hidden = true; movingTurtle = null; } });
yardsBtn.onclick = () => openYards();

// ---------- swipe between yards (only when fully zoomed out, so it never fights with panning) ----------
const swipeEl = document.getElementById('swipehint');
const atMinZoom = () => cam.z <= zMin() * 1.01;
const nextYard = dir => (yardIdx + (dir < 0 ? 1 : yards.length - 1)) % yards.length; // finger moving left = next yard
function swipeShow(dx) {
  const n = yards.length;
  cv.style.transition = 'none';
  cv.style.transform = `translateX(${n > 1 ? dx : dx * 0.25}px)`; // one yard: a little stretchy bounce
  if (n < 2) { swipeEl.hidden = true; return; }
  const j = nextYard(dx), name = esc(yards[j]?.name || 'Yard');
  swipeEl.innerHTML = `<b>${dx < 0 ? `${name} →` : `← ${name}`}</b><span>${yards.map((_, i) => (i === yardIdx ? '●' : '○')).join(' ')}</span>`;
  swipeEl.className = dx < 0 ? 'right' : 'left'; swipeEl.hidden = false;
}
function swipeCancel() { swipeEl.hidden = true; cv.style.transition = 'transform .2s ease-out'; cv.style.transform = 'translateX(0)'; }
function swipeEnd(dx, ms) {
  const n = yards.length, go = n > 1 && (Math.abs(dx) > W * 0.33 || (Math.abs(dx) > 50 && Math.abs(dx) / Math.max(1, ms) > 0.6));
  if (!go) { if (n < 2 && Math.abs(dx) > 40) say('Build another yard and you can swipe between them 🏞️', 2500); return swipeCancel(); }
  swipeEl.hidden = true;
  const dir = dx < 0 ? -1 : 1, j = nextYard(dx);
  cv.style.transition = 'transform .16s ease-in'; cv.style.transform = `translateX(${dir * W}px)`; // slide this yard away
  setTimeout(() => {
    switchYard(j);
    cv.style.transition = 'none'; cv.style.transform = `translateX(${-dir * W}px)`; // the next yard comes in from the other side
    requestAnimationFrame(() => requestAnimationFrame(() => { cv.style.transition = 'transform .22s ease-out'; cv.style.transform = 'translateX(0)'; }));
    snd.play('click');
  }, 170);
}

// ---------- save & load: the whole game as a compressed text code (or a file) ----------
// Code = "TURTLEYARD1:" + base64(gzip(save JSON)). Plain JSON (e.g. a downloaded file) is accepted too.
const CODE_TAG = 'TURTLEYARD1:';
const backupEl = document.getElementById('backup');
async function gzipB64(text) {
  const cs = new CompressionStream('gzip'), w = cs.writable.getWriter();
  w.write(new TextEncoder().encode(text)); w.close();
  const bytes = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function gunzipB64(b64) {
  const bin = atob(b64.replace(/\s+/g, '')), bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
  const ds = new DecompressionStream('gzip'), w = ds.writable.getWriter();
  w.write(bytes); w.close();
  return new Response(ds.readable).text();
}
async function makeSaveCode() { save(); return CODE_TAG + await gzipB64(localStorage.getItem(SAVE3)); }
async function readSave(text) { // returns the parsed save, or throws a friendly message
  text = (text || '').trim();
  if (!text) throw new Error('Paste a save code first');
  let json = text;
  if (text.startsWith(CODE_TAG)) { try { json = await gunzipB64(text.slice(CODE_TAG.length)); } catch { throw new Error('That save code looks broken or cut off. Copy the whole thing.'); } }
  let d; try { d = JSON.parse(json); } catch { throw new Error("That doesn't look like a Turtle Yard save"); }
  if (d?.yards?.length && d.yards.some(y => y?.turtles?.length)) return { key: SAVE3, d };
  if (d?.turtles?.length) return { key: SAVE, d }; // an older single-yard save
  throw new Error("That doesn't look like a Turtle Yard save");
}
function describeSave({ d }) {
  const ys = d.yards || [d], n = ys.reduce((a, y) => a + (y?.turtles?.length || 0), 0), stars = d.shared?.stars ?? d.stars ?? 0;
  return `${ys.length} yard${ys.length > 1 ? 's' : ''} (${ys.map(y => y?.name || 'My Yard').join(', ')}), ${n} turtle${n === 1 ? '' : 's'} and ${stars} ⭐`;
}
function loadSave(parsed) {
  askConfirm('Load this backup?', `It has ${describeSave(parsed)}. Everything currently on this device will be replaced.`, '⬆️ Load', () => {
    loadingBackup = true;
    if (parsed.key === SAVE3) localStorage.setItem(SAVE3, JSON.stringify(parsed.d));
    else { localStorage.removeItem(SAVE3); localStorage.setItem(SAVE, JSON.stringify(parsed.d)); } // old format: upgraded on load
    say('Loading your backup… 🐢', 2000);
    setTimeout(() => location.reload(), 400);
  });
}
async function openBackup() {
  backupEl.querySelector('.in').value = '';
  backupEl.querySelector('.out').value = 'Making your save code…';
  backupEl.hidden = false;
  try { backupEl.querySelector('.out').value = await makeSaveCode(); }
  catch { backupEl.querySelector('.out').value = 'Sorry, this device could not make a save code.'; }
}
backupEl.querySelector('.copy').onclick = async () => {
  const ta = backupEl.querySelector('.out'), code = ta.value;
  if (!code.startsWith(CODE_TAG)) return;
  try { await navigator.clipboard.writeText(code); say('📋 Save code copied! Paste it somewhere safe', 3000); }
  catch { ta.focus(); ta.select(); document.execCommand?.('copy'); say('Save code selected: copy it, then paste it somewhere safe', 3500); }
  snd.play('job');
};
// In the phone app downloads are ignored, so the backup is written to a file and handed to Android's share sheet
// (save to Files or Drive, email it, message it). On the web it's an ordinary download.
const isNativeApp = !!window.Capacitor?.isNativePlatform?.();
let nativeFS = null, nativeShare = null;
backupEl.querySelector('.dl').onclick = async () => {
  const code = backupEl.querySelector('.out').value;
  if (!code.startsWith(CODE_TAG)) return;
  const d = new Date(), name = `turtle-yard-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.txt`;
  if (isNativeApp) {
    try {
      nativeFS ??= window.Capacitor.Plugins.Filesystem; nativeShare ??= window.Capacitor.Plugins.Share; // native plugin proxies
      const { uri } = await nativeFS.writeFile({ path: name, data: code, directory: 'CACHE', encoding: 'utf8' });
      await nativeShare.share({ title: 'Turtle Yard backup', text: 'My Turtle Yard save file', files: [uri], dialogTitle: 'Save or send your backup' });
    } catch (e) {
      if (!/cancel/i.test(e?.message || '')) say("Sharing didn't work here. Use 📋 Copy save code instead", 3500);
    }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  say('💾 Backup file saved to your downloads', 3000);
};
if (isNativeApp) backupEl.querySelector('.dl').textContent = '📤 Save or share file';
backupEl.querySelector('.load').onclick = async () => {
  try { loadSave(await readSave(backupEl.querySelector('.in').value)); } catch (e) { say('⚠️ ' + e.message, 3500); }
};
backupEl.querySelector('.file').onclick = () => backupEl.querySelector('.pick').click();
backupEl.querySelector('.pick').onchange = async e => {
  const f = e.target.files?.[0]; e.target.value = '';
  if (!f) return;
  try { loadSave(await readSave(await f.text())); } catch (err) { say('⚠️ ' + err.message, 3500); }
};
backupEl.querySelector('.close').onclick = () => { backupEl.hidden = true; };
backupEl.addEventListener('click', e => { if (e.target === backupEl) backupEl.hidden = true; });

// ---------- book + jobs sheets ----------
const bookEl = document.getElementById('book'), jobsEl = document.getElementById('jobs');
const bookBtn = document.getElementById('book-btn'), jobsBtn = document.getElementById('jobs-btn');
function renderPills() {
  const n = Object.keys(loot.found).length, total = Object.keys(ITEMS).length;
  bookBtn.textContent = `📖 ${n}/${total}`;
  const L = loot.jobs?.list || [], done = L.filter(j => j.have >= j.n).length;
  jobsBtn.textContent = `📋 ${done}/${L.length}`;
  jobsBtn.classList.toggle('ready', L.length > 0 && done === L.length);
  yardsBtn.textContent = yards.length > 1 ? `🏡 ${yardIdx + 1}/${yards.length}` : '🏡';
}
function openBook() {
  const n = Object.keys(loot.found).length;
  bookEl.querySelector('.sub').textContent = `${n} of ${Object.keys(ITEMS).length} found · ${loot.sets.length} of ${SETS.length} sets complete`;
  bookEl.querySelector('.sets').innerHTML = SETS.map(s => {
    const have = s.items.filter(([i]) => loot.found[i]).length, d = DECOS[s.reward], done = loot.sets.includes(s.k);
    return `<div class="set"><div class="hd"><span>${s.name}</span><span>${have}/${s.items.length}</span></div>`
      + `<div class="rw ${done ? 'got' : ''}">${done ? `✓ Unlocked the ${d.icon} ${d.name}` : `Finish the set to unlock the ${d.icon} ${d.name}`}</div>`
      + (done && !powerHere(s.k) ? `<button class="place" data-set="${s.k}">📍 Place the ${d.name} in ${esc(yardName)}</button>` : '')
      + `<div class="pw">${POWERS[s.k].icon} <b>${POWERS[s.k].name}</b>: ${POWERS[s.k].desc} ${done ? `Place the ${d.name} in a yard to use it there (recharges every 3 h).` : `The ${d.name} gives you this power.`}</div><div class="tiles">`
      + s.items.map(([id, icon, name]) => loot.found[id]
        ? `<button class="tile" data-id="${id}"><span class="e">${icon}</span><small>${name}</small></button>`
        : `<button class="tile no" data-id="${id}"><span class="e">${icon}</span><small>???</small></button>`).join('')
      + '</div></div>';
  }).join('');
  bookEl.querySelector('.fact').textContent = 'Tap a find to read about it.';
  bookEl.hidden = false;
}
bookEl.querySelector('.sets').addEventListener('click', e => {
  const pl = e.target.closest('.place');
  if (pl) { // put a finished set's decoration (and its power) into this yard, free
    const k = pl.dataset.set, set = SETS.find(s => s.k === k);
    if (!loot.sets.includes(k) || powerHere(k)) return;
    bookEl.hidden = true;
    const o = newObj('deco'); o.type = set.reward; o.seed = Math.random(); startPlacing(o);
    return say(`Tap the yard where the ${DECOS[set.reward].name} should go`, 3000);
  }
  const id = e.target.closest('.tile')?.dataset.id, it = ITEMS[id];
  if (!it) return;
  bookEl.querySelector('.fact').textContent = loot.found[id]
    ? `${it.icon} ${it.name} (${RARITY[it.rar]}, ×${loot.found[id]}): ${it.fact}`
    : canFind(id) ? `Not found yet. ${RARITY[it.rar]} · it could turn up in this yard now. Keep an eye out for ✨!`
      : `Not found yet. ${RARITY[it.rar]} · this one won't turn up until the yard has the right thing in it… 🤔`;
});
function openJobs() {
  const L = loot.jobs?.list || [];
  jobsEl.querySelector('.sub').textContent = `+${JOB_STARS} ⭐ each · finish all ${L.length} for +${JOBS_BONUS} ⭐ more · new jobs tomorrow`;
  jobsEl.querySelector('.list').innerHTML = L.map(j => `<div class="job ${j.have >= j.n ? 'done' : ''}"><span class="ck">${j.have >= j.n ? '✅' : '⬜'}</span>`
    + `<span>${esc(j.text)}</span><span class="pr">${j.have}/${j.n}</span></div>`).join('') || '<div class="sub">No jobs yet. Check back soon!</div>';
  jobsEl.hidden = false;
}
bookBtn.onclick = openBook;
const sndBtn = document.getElementById('snd-btn');
const showSnd = () => { sndBtn.textContent = ['🔇', '🔉', '🔊'][snd.soundMode()]; };
showSnd();
sndBtn.onclick = () => {
  const m = snd.cycleMode(); showSnd();
  say(['Sound off 🔇', 'Sound effects only 🔉 (no background sounds)', 'All sounds on 🔊'][m], 2200);
  snd.play('click');
};
jobsBtn.onclick = openJobs;
for (const el of [bookEl, jobsEl]) {
  el.querySelector('.close').onclick = () => { el.hidden = true; };
  el.addEventListener('click', e => { if (e.target === el) el.hidden = true; });
}

// ---------- decorations ----------
function seeded(seed) { let s = Math.floor(seed * 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function drawDeco(o, time, dk) {
  const c = ctx, r = seeded(o.seed || 0.5), { x, y } = o;
  if (o.type === 'bbush') { // butterfly bush: a leafy mound with purple flower spikes
    c.fillStyle = '#0003'; c.beginPath(); c.ellipse(x + 3, y + 4, 26, 10, 0, 0, 7); c.fill();
    for (let i = 0; i < 7; i++) { c.fillStyle = ['#3f7a2e', '#4d8a36', '#5c9a40'][i % 3]; c.beginPath(); c.arc(x + (r() - 0.5) * 34, y - 6 - r() * 12, 10 + r() * 6, 0, 7); c.fill(); }
    for (let i = 0; i < 6; i++) {
      const fx = x + (r() - 0.5) * 36, fy = y - 14 - r() * 14;
      c.fillStyle = r() < 0.5 ? '#9b5fd0' : '#b77df0';
      for (let k = 0; k < 4; k++) { c.beginPath(); c.ellipse(fx, fy - k * 3.2, 3.4 - k * 0.6, 2.6, 0, 0, 7); c.fill(); }
    }
    return;
  }
  if (DECOS[o.type]?.emoji) { // collection rewards: a big emoji standing in the yard
    c.fillStyle = '#0003'; c.beginPath(); c.ellipse(x + 3, y + 4, 22, 9, 0, 0, 7); c.fill();
    const pk = powerOfDeco(o.type);
    if (pk) { // its power's charge: a ring that fills gold, then glows when it's ready to tap
      const left = powerLeft(pk), cy = y - 22, R = 34;
      if (!left) {
        const pu = 0.5 + 0.5 * Math.sin(time * 3), gl = c.createRadialGradient(x, cy, 10, x, cy, R + 14);
        gl.addColorStop(0, `rgba(190,255,150,${0.35 + 0.25 * pu})`); gl.addColorStop(1, 'rgba(190,255,150,0)');
        c.fillStyle = gl; c.beginPath(); c.arc(x, cy, R + 14, 0, 7); c.fill();
      }
      c.lineCap = 'round'; c.lineWidth = 5;
      c.strokeStyle = '#0003'; c.beginPath(); c.arc(x, cy, R, 0, 7); c.stroke();
      c.strokeStyle = left ? '#ffd84a' : '#8fe06a';
      c.beginPath(); c.arc(x, cy, R, -Math.PI / 2, -Math.PI / 2 + (1 - left / POWER_RECHARGE) * Math.PI * 2); c.stroke();
      if (pk === 'gems' && loot.boostUntil > Date.now()) drawText(c, textSprite(`⭐×2 · ${Math.ceil((loot.boostUntil - Date.now()) / 60e3)} min`, 'bold 11px system-ui', '#ffe27a', '#000a', 3), x, cy - R - 12);
    }
    const sz = DECOS[o.type].size || 52; drawEmoji(c, DECOS[o.type].icon, x, y - sz * 0.42, sz); return;
  }
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
function drawRock(o, time = 0, dk = 0) {
  const c = ctx, R = ROCKS[o.kind] || ROCKS.rock, { rx, ry } = rockDims(o), [dark, mid, light] = R.col, rnd = seeded(o.seed || 0.37);
  c.save(); c.translate(o.x, o.y);
  const blob = (sx, sy, w, h, rot, n = 9, j = 0.12) => { // a lumpy rounded stone outline
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2, k = 1 + Math.sin(a * 3 + rot * 5) * j;
      const x = sx + Math.cos(a) * w * k, y = sy + Math.sin(a) * h * k;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath();
  };
  if (R.look === 'lookout') {
    c.fillStyle = '#0003'; blob(14, 18, rx, ry, 0.2, 14, 0.06); c.fill();
    c.fillStyle = dark; blob(0, 0, rx, ry, 0.2, 14, 0.07); c.fill();
    c.strokeStyle = '#6a5f53'; c.lineWidth = 3; // cliff face: vertical cracks down the front
    for (let i = 0; i < 9; i++) { const x = -rx * 0.75 + i * rx * 0.19; c.beginPath(); c.moveTo(x, ry * 0.35); c.lineTo(x + 4, ry * 0.85 - Math.abs(x / rx) * ry * 0.4); c.stroke(); }
    c.fillStyle = '#7a6f62'; // a path of steps up the front-left
    for (let i = 0; i < 5; i++) { c.beginPath(); c.ellipse(-rx * 0.55 + i * rx * 0.08, ry * 0.7 - i * ry * 0.16, 16, 9, 0.3, 0, 7); c.fill(); }
    c.fillStyle = mid; blob(0, -ry * 0.1, rx * 0.86, ry * 0.8, 0.6, 12, 0.06); c.fill();
    c.fillStyle = light; blob(0, -ry * 0.14, rx * 0.74, ry * 0.64, 0.9, 12, 0.05); c.fill(); // the plateau
    c.fillStyle = mid; c.beginPath(); c.moveTo(rx * 0.55, -ry * 0.55); c.lineTo(rx * 1.12, -ry * 0.78); c.lineTo(rx * 1.05, -ry * 0.6); c.lineTo(rx * 0.7, -ry * 0.3); c.closePath(); c.fill(); // jutting ledge
    c.fillStyle = light; c.beginPath(); c.moveTo(rx * 0.6, -ry * 0.55); c.lineTo(rx * 1.1, -ry * 0.77); c.lineTo(rx * 0.75, -ry * 0.42); c.closePath(); c.fill();
    c.strokeStyle = '#6e6356'; c.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const a = rnd() * 6.28, d = rnd() * 0.6; c.beginPath(); c.moveTo(Math.cos(a) * rx * d, Math.sin(a) * ry * d - ry * 0.12); c.lineTo(Math.cos(a) * rx * d + 14, Math.sin(a) * ry * d - ry * 0.12 + 6); c.stroke(); }
    c.fillStyle = '#6f9a3c88'; for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse((rnd() - 0.5) * rx * 1.6, (rnd() - 0.2) * ry * 0.9, 14, 7, 0, 0, 7); c.fill(); }
  } else if (R.look === 'slab') {
    c.fillStyle = '#0002'; c.beginPath(); c.roundRect(-rx + 6, -ry + 8, rx * 2, ry * 2, 10); c.fill();
    c.fillStyle = dark; c.beginPath(); c.roundRect(-rx, -ry, rx * 2, ry * 2, 10); c.fill();
    c.fillStyle = mid; c.beginPath(); c.roundRect(-rx + 4, -ry + 3, rx * 2 - 8, ry * 2 - 10, 8); c.fill();
    c.strokeStyle = dark; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(-rx * 0.3, -ry + 4); c.lineTo(-rx * 0.22, ry - 8); c.moveTo(rx * 0.4, -ry + 4); c.lineTo(rx * 0.33, ry * 0.2); c.stroke();
    c.fillStyle = light; c.beginPath(); c.roundRect(-rx + 10, -ry + 7, rx * 0.8, ry * 0.5, 6); c.fill();
  } else {
    const n = R.look === 'lumpy' ? 7 : 10, j = R.look === 'lumpy' ? 0.16 : 0.08;
    c.fillStyle = '#0002'; blob(5, 7, rx, ry, 0.2, n, j); c.fill();
    c.fillStyle = dark; blob(0, 0, rx, ry, 0.2, n, j); c.fill();
    c.fillStyle = mid; blob(-5, -5, rx * 0.78, ry * 0.66, 0.5, n, j); c.fill();
    c.fillStyle = light; c.beginPath(); c.ellipse(-rx * 0.25, -ry * 0.3, rx * 0.3, ry * 0.22, 0.2, 0, 7); c.fill();
    if (R.look === 'layers') { // sandstone stripes
      c.strokeStyle = '#b27740aa'; c.lineWidth = 2.5;
      for (const yy of [-0.35, 0, 0.35]) { c.beginPath(); c.ellipse(0, yy * ry, rx * 0.86, ry * 0.18, 0, 0.15, Math.PI - 0.15); c.stroke(); }
    }
    if (R.look === 'lumpy') { c.fillStyle = '#8a4a30'; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc((rnd() - 0.5) * rx * 1.2, (rnd() - 0.5) * ry * 1.1, 3 + rnd() * 3, 0, 7); c.fill(); } }
    if (R.look === 'moss') {
      c.fillStyle = '#5f8f3a'; for (let i = 0; i < 7; i++) { c.beginPath(); c.ellipse((rnd() - 0.5) * rx * 1.3, (rnd() - 0.6) * ry * 1.1, 8 + rnd() * 10, 5 + rnd() * 6, rnd() * 3, 0, 7); c.fill(); }
      c.fillStyle = '#7fb24e'; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc((rnd() - 0.5) * rx * 1.1, (rnd() - 0.6) * ry, 3 + rnd() * 3, 0, 7); c.fill(); }
    }
    if (R.look === 'heat') { // glowing cracks
      const glow = 0.55 + 0.25 * Math.sin(time * 2) + dk * 0.3;
      c.strokeStyle = `rgba(255,${120 + dk * 40 | 0},40,${clamp(glow, 0, 1)})`; c.lineWidth = 2.5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-rx * 0.5, -ry * 0.1); c.lineTo(-rx * 0.15, ry * 0.15); c.lineTo(rx * 0.2, -ry * 0.05); c.lineTo(rx * 0.5, ry * 0.2);
      c.moveTo(-rx * 0.15, ry * 0.15); c.lineTo(-rx * 0.05, ry * 0.5); c.moveTo(rx * 0.2, -ry * 0.05); c.lineTo(rx * 0.1, -ry * 0.45); c.stroke();
    }
  }
  c.restore();
}
// Hut, cave and log tunnel draw in two passes: a floor under the turtles and a roof over them.
// While a turtle is inside, the roof fades see-through (outline stays solid) so you can watch it in there.
function insideOf(o) {
  if (o.kind === 'hut') return turtles.some(t => dist(t, o) < HUT.r);
  if (o.kind === 'cave') return turtles.some(t => dist(t, o) < CAVE.r);
  return turtles.some(t => Math.abs(t.x - o.x) < LOG.len / 2 && Math.abs(t.y - o.y) < LOG.r);
}
const roofFade = (o, dt) => (o.fade = lerp(o.fade ?? 1, insideOf(o) ? 0.3 : 1, Math.min(1, dt * 5)));
function drawLog(o, layer, a = 1) {
  const c = ctx, L = LOG.len, r = LOG.r;
  c.save(); c.translate(o.x, o.y);
  if (layer === 'floor') {
    c.fillStyle = '#0003'; c.beginPath(); c.roundRect(-L / 2 + 5, -r + 9, L, r * 2, r * 0.5); c.fill();
    c.fillStyle = '#3a2512'; c.beginPath(); c.roundRect(-L / 2, -r * 0.8, L, r * 1.6, r * 0.4); c.fill(); // hollow inside
    c.fillStyle = '#4a311a'; c.beginPath(); c.roundRect(-L / 2 + 8, -r * 0.35, L - 16, r * 0.7, r * 0.3); c.fill();
    c.restore(); return;
  }
  c.globalAlpha = a;
  const g = c.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, '#6b4526'); g.addColorStop(0.35, '#8c5f36'); g.addColorStop(1, '#5a3a1f');
  c.fillStyle = g; c.beginPath(); c.roundRect(-L / 2, -r, L, r * 2, r * 0.5); c.fill();
  c.strokeStyle = '#4a2f18'; c.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) { const y = -r + 8 + i * (r * 2 - 16) / 5; c.beginPath(); c.moveTo(-L / 2 + 14, y); c.bezierCurveTo(-L / 6, y + 4, L / 6, y - 4, L / 2 - 14, y); c.stroke(); }
  c.fillStyle = '#6f9a3c99'; c.beginPath(); c.ellipse(L * 0.15, -r * 0.55, 16, 7, 0, 0, 7); c.fill();
  for (const sx of [-1, 1]) { // cut ends with a dark opening
    c.fillStyle = '#c99c62'; c.beginPath(); c.ellipse(sx * L / 2, 0, r * 0.42, r, 0, 0, 7); c.fill();
    c.strokeStyle = '#8a6438'; c.lineWidth = 1; c.beginPath(); c.ellipse(sx * L / 2, 0, r * 0.3, r * 0.82, 0, 0, 7); c.stroke();
    c.fillStyle = '#241608'; c.beginPath(); c.ellipse(sx * L / 2, 0, r * 0.26, r * 0.68, 0, 0, 7); c.fill();
  }
  c.globalAlpha = 1;
  c.strokeStyle = '#3e2814'; c.lineWidth = 2; c.beginPath(); c.roundRect(-L / 2, -r, L, r * 2, r * 0.5); c.stroke();
  c.restore();
}
function drawHut(o, layer, a = 1) {
  const c = ctx, r = HUT.r;
  c.save(); c.translate(o.x, o.y);
  if (layer === 'floor') {
    c.fillStyle = '#0003'; c.beginPath(); c.arc(6, 8, r, 0, 7); c.fill();
    c.fillStyle = '#6b4c22'; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); // straw-strewn floor
    c.strokeStyle = '#8a6a34'; c.lineWidth = 1.5; const rnd = seeded(o.seed || 0.44);
    for (let i = 0; i < 18; i++) { const a2 = rnd() * 6.28, d = rnd() * r * 0.8, x = Math.cos(a2) * d, y = Math.sin(a2) * d, t = rnd() * 3; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(t) * 9, y + Math.sin(t) * 9); c.stroke(); }
    c.restore(); return;
  }
  c.globalAlpha = a;
  const g = c.createRadialGradient(-r * 0.25, -r * 0.3, 4, 0, 0, r);
  g.addColorStop(0, '#ecc874'); g.addColorStop(1, '#b4853a');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
  c.strokeStyle = '#9a6f2e'; c.lineWidth = 1.2;
  for (let i = 0; i < 40; i++) { const a2 = i / 40 * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(a2) * 6, Math.sin(a2) * 6); c.lineTo(Math.cos(a2) * r, Math.sin(a2) * r); c.stroke(); }
  c.lineWidth = 2; c.strokeStyle = '#8a6224';
  for (const k of [0.4, 0.72]) { c.beginPath(); c.arc(0, 0, r * k, 0, 7); c.stroke(); }
  c.fillStyle = '#7a5520'; c.beginPath(); c.arc(0, 0, 7, 0, 7); c.fill();
  c.fillStyle = '#2b1d0e'; c.beginPath(); c.ellipse(0, r * 0.86, r * 0.36, r * 0.26, 0, Math.PI, 0); c.fill(); // doorway
  c.globalAlpha = 1;
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
  snd.play('click');
  if (b.dataset.act === 'water') {
    if (bowl.level < 0.5 && waterStarCool <= 0) { earn(1, bowl.x, bowl.y - bowl.r - 10); waterStarCool = 60; }
    bowl.level = 1; bowl.fill = 1; buzz(15); job('water'); snd.play('pour');
    for (let i = 0; i < 14; i++) emit(bowl.x, bowl.y, 'drop');
    say('Fresh water!');
    return;
  }
  if (b.dataset.mode === 'food' && mode === 'food') { // tap Feed again: lettuce <-> berries
    foodType = foodType === 'lettuce' ? 'berry' : 'lettuce';
    b.innerHTML = foodType === 'berry' ? '🍓<span>Berry</span>' : '🥬<span>Feed</span>';
    return say(foodType === 'berry' ? 'Berries 🍓 sweet treats, but too many make a chubby turtle' : 'Lettuce 🥬 healthy everyday food', 2600);
  }
  endPaint();
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
  if (Date.now() < loot.boostUntil) n *= 2; // Star Shower
  stars += n; snd.play('star');
  parts.push({ x, y, kind: 'star', text: `+${n}⭐`, t: 0, life: 1.3, vx: 0, vy: -28 });
  starsEl.classList.remove('bump'); void starsEl.offsetWidth; starsEl.classList.add('bump');
}
function dailyBonus() { // first visit of a new day: a mystery gift and five new jobs
  const today = new Date().toDateString();
  if (loot.day === today && loot.jobs && loot.jobs.list.length < JOB_COUNT) { newJobs(loot.jobs.list); renderPills(); } // saves from when there were 3 a day
  if (loot.day === today) return;
  loot.day = today; lastDaily = today; loot.visits++;
  loot.gift = { x: clamp(cam.x + rand(-60, 60), 60, YW - 60), y: clamp(cam.y + rand(-30, 50), 60, YH - 60) };
  newJobs();
  setTimeout(() => say(MILESTONES[loot.visits] ? `🎁 Visit #${loot.visits}! A BIG gift is waiting in the yard!` : '🎁 A mystery gift is waiting in the yard!', 3500), 1500);
  renderPills();
}

let drag = null; // ball being flicked
const ptrs = new Map();
let gest = null;
cv.addEventListener('pointerdown', e => {
  if (camFollow?.until) camFollow = null; // touching the yard takes the camera back
  if (!ptrs.size && (e.clientY < TOP - 20 || e.clientY > H - BOTTOM + 10)) return;
  try { cv.setPointerCapture(e.pointerId); } catch { }
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) { // pinch to zoom (and pan with two fingers)
    if (gest?.kind === 'yardswipe') swipeCancel();
    if (drag) endDrag();
    const [a, b] = [...ptrs.values()], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    gest = { kind: 'pinch', d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), z0: cam.z, w0: s2w(mid.x, mid.y) };
    return;
  }
  if (ptrs.size > 2) return;
  const p = s2w(e.clientX, e.clientY);
  if (painting) { gest = { kind: 'paint' }; lastPaint = p; paintBroke = false; paintAt(p); return; }
  if (arranging) { // grab the nearest movable thing under the finger
    const o = movables().filter(o => dist(p, o) < hitR(o) + 10 / cam.z).sort((a, b) => dist(p, a) - dist(p, b))[0];
    if (o) { gest = { kind: 'move', o, dx: o.x - p.x, dy: o.y - p.y, sx: e.clientX, sy: e.clientY, moved: false }; return; }
  }
  if (!visit && mode === 'play' && ball && !placing && dist(p, ball) < ball.r + 22 / cam.z) {
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
  if (gest.kind === 'paint' && ptrs.size === 1) {
    const p = s2w(e.clientX, e.clientY), d = dist(p, lastPaint), n = Math.ceil(d / (TILE * 0.4));
    for (let i = 1; i <= n; i++) paintAt({ x: lastPaint.x + (p.x - lastPaint.x) * i / n, y: lastPaint.y + (p.y - lastPaint.y) * i / n });
    lastPaint = p;
  } else if (gest.kind === 'move') {
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
    cam.z = clamp(gest.z0 * Math.hypot(a.x - b.x, a.y - b.y) / gest.d0, zMin(), zMax());
    cam.x = gest.w0.x - (mid.x - vcx()) / cam.z; cam.y = gest.w0.y - (mid.y - vcy()) / cam.z;
    clampCam();
  } else if (gest.kind === 'yardswipe') {
    swipeShow(e.clientX - gest.sx);
  } else if (gest.kind === 'maybe' || gest.kind === 'pan') {
    const dx = e.clientX - gest.sx, dy = e.clientY - gest.sy;
    if (gest.kind === 'maybe' && !visit && atMinZoom() && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) { // fully zoomed out: a sideways swipe changes yard
      gest.kind = 'yardswipe'; gest.t0 = performance.now(); swipeShow(dx); return;
    }
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
    const pk = powerOfDeco(o.type);
    askConfirm(`Remove this ${DECOS[o.type].name.toLowerCase()}?`,
      pk ? `This yard will lose its power ${POWERS[pk].icon} ${POWERS[pk].name}. You can place it again any time from the 📖 book.` : "You won't get the stars back.",
      'Remove', () => { objs = objs.filter(x => x !== o); emit(o.x, o.y, 'sparkle', 6); save(); });
  }
  else if (gest?.kind === 'yardswipe') { if (e.type === 'pointerup') swipeEnd(e.clientX - gest.sx, performance.now() - gest.t0); else swipeCancel(); }
  else if (gest?.kind === 'maybe' && e.type === 'pointerup') {
    if (!visit) tap(s2w(e.clientX, e.clientY));
    else if (visit.brought && !visit.pending) { // tap to call the turtle you brought, like the Call button at home
      const p = s2w(e.clientX, e.clientY);
      relay(visit.host, { k: 'go', x: Math.round(p.x), y: Math.round(p.y) });
      emit(p.x, p.y, 'sparkle', 6); say(`🐢 Come here, ${visit.brought}!`, 1500);
    } else say('👀 Just visiting: look around, but no touching', 2000);
  }
  if (gest?.kind === 'pinch' && ptrs.size) gest = { kind: 'done' }; // the finger left behind doesn't tap
  if (!ptrs.size) gest = null;
}
cv.addEventListener('pointerup', pointerEnd);
cv.addEventListener('pointercancel', pointerEnd);
cv.addEventListener('wheel', e => { // desktop zoom
  e.preventDefault();
  const w0 = s2w(e.clientX, e.clientY);
  cam.z = clamp(cam.z * Math.exp(-e.deltaY * 0.0015), zMin(), zMax());
  cam.x = w0.x - (e.clientX - vcx()) / cam.z; cam.y = w0.y - (e.clientY - vcy()) / cam.z;
  clampCam();
}, { passive: false });

const nameOf = o => o === bowl ? BOWLS[up.bowl].name : o.kind === 'feeder' ? FEEDERS[up.feeder].name
  : o.kind === 'deco' ? DECOS[o.type].name : (AUTO[o.kind] || STRUCTS[o.kind] || ROCKS[o.kind] || WILD[o.kind]).name;
const HIT = { pond: 100, log: 75, hut: HUT.r, garden: 55, mud: 60, slide: 75, mirror: 32, lamp: 30, feeder: 30, deco: 24, mossbed: 70, fog: 30, cave: 120, birdfeeder: 28, bughotel: 28 };
const hitR = o => (o === bowl ? bowl.r : ROCKS[o.kind] ? rockDims(o).rx * 0.85 : o.kind === 'garden' ? gardenCols() * SLOT / 2 + 10 : (HIT[o.kind] || 30) * sizeK(o.kind));
const movables = () => [bowl, ...objs];
const doneBtn = document.getElementById('arrange-done');
function startArrange() {
  arranging = true; placing = null; shop.hidden = true; doneBtn.hidden = false;
  say('Drag things to move them · tap a decoration to remove it', 4500);
}
function endArrange() { if (!arranging) return; arranging = false; doneBtn.hidden = true; save(); }
doneBtn.onclick = endArrange;
function wash(t) {
  t.mud = 0; buzz(12); job('wash');
  for (let i = 0; i < 12; i++) emit(t.x, t.y, 'drop');
  emit(t.x, t.y, 'sparkle', 6); earn(10, t.x, t.y - t.S * 2);
  t.st.happy = clamp(t.st.happy + 4, 0, 100);
  say(`${t.name} is squeaky clean ✨`);
}
function tap(p) {
  emit(p.x, p.y, 'tap');
  if (placing) {
    placing.x = p.x; placing.y = p.y; keepInYard(placing);
    const pk = placing.kind === 'deco' && powerOfDeco(placing.type);
    emit(placing.x, placing.y, 'sparkle', 10); buzz(15);
    say(pk ? `${nameOf(placing)} placed! Tap it to use its power ${POWERS[pk].icon} ${POWERS[pk].name} (works in this yard)` : `${nameOf(placing)} placed ✨`, pk ? 4500 : 1800);
    if (pk) setTimeout(renderPowers, 50);
    placing = null; save();
    return;
  }
  if (arranging) return;
  const grab = Math.max(30, 22 / cam.z); // easy to tap even when zoomed out
  const magic = objs.find(o => o.kind === 'deco' && powerOfDeco(o.type) && dist(o, { x: p.x, y: p.y + 20 }) < Math.max(34, 26 / cam.z));
  if (magic) return usePower(powerOfDeco(magic.type)); // tap a set decoration to use its power
  const tr = loot.treasures.find(t => dist(t, p) < grab);
  if (tr) return collectTreasure(tr);
  if (loot.gift && dist(loot.gift, p) < grab + 6) return openGift();
  const pc = loot.parcels.find(q => q.x !== undefined && dist(q, p) < grab + 6);
  if (pc) return openParcel(pc);
  if (p.x < 0 || p.y < 0 || p.x > YW || p.y > YH) { if (isPicked() && turtles.length > 1) deselect(); return; }
  const hitT = turtles.filter(t => t.releasing === undefined && dist(p, t) < t.S * 1.2 + 8 / cam.z).sort((a, b) => dist(p, a) - dist(p, b))[0];
  if (hitT && mode === 'clean' && hitT.mud > 0) return wash(hitT);
  if (hitT && hitT === sel && picked && turtles.length > 1) return deselect(); // tap the picked turtle again to let go
  if (hitT) return pet(hitT);
  if (mode === 'walk' && !isPicked()) say('Tap a turtle to pick it, then tap to call it');
  else if (mode === 'walk') { job('call'); wakeUp(sel); sel.userTarget = { x: p.x, y: p.y }; sel.eat = null; sel.drinkT = 0; sel.outing = null; }
  else if (mode === 'food') {
    if (foods.filter(f => f.slot === undefined).length >= 6) return say('That\'s plenty of food!');
    const type = foodType;
    const bites = type === 'berry' ? 2 : 3;
    const f = { x: p.x, y: p.y, type, bites, max: bites, rot: rand(0, 6), t: Date.now() }; keepInYard(f); foods.push(f); job('snack'); snd.play('drop');
    buzz(8);
  } else if (mode === 'clean') {
    const hit = poops.filter(q => dist(q, p) < Math.max(26, 30 / cam.z));
    if (!hit.length) return say(poops.length ? 'Tap right on a mess' : 'All clean! ✨');
    poops = poops.filter(q => !hit.includes(q));
    hit.forEach(q => emit(q.x, q.y, 'sparkle', 6));
    earn(2 * hit.length, hit[0].x, hit[0].y - 14); job('scoop', null, hit.length); snd.play('scoop');
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
  job('pet', t.name);
  if (f < 0.35 && Math.random() < 0.6) { // not in the mood
    t.st.happy = clamp(t.st.happy + 1, 0, 100); t.st.social = clamp(t.st.social + 5, 0, 100);
    setTimeout(() => { emit(t.x, t.y - t.S, 'grr'); sfx('hiss', t); }, t.petT * 500);
    buzz([10, 30, 10]);
  } else {
    t.st.happy = clamp(t.st.happy + lerp(3, 9, f), 0, 100); t.st.social = clamp(t.st.social + lerp(10, 25, f), 0, 100);
    if (t.starCool <= 0) { earn(1, t.x, t.y - t.S * 2.2); t.starCool = 8; }
    setTimeout(() => { emit(t.x, t.y - t.S, 'heart', 1 + Math.round(f * 3)); sfx('chirp', t); }, t.petT * 500);
    buzz(20);
  }
}

// ---------- adopting more turtles ----------
// bought in the shop; each extra turtle costs a bit more
const adoptCost = () => Math.round(25 * turtles.length ** 1.6 / 5) * 5; // 25, 75, 145 ... ~840 for the 10th
function adopt() {
  const suggestion = randomName();
  const name = suggestion; // the turtle arrives right away; naming it comes after
  shop.hidden = true;
  const t = makeTurtle({ name, tint: pickTint(turtles), x: clamp(cam.x + rand(-80, 80), 60, YW - 60), y: clamp(cam.y + rand(-80, 80), 60, YH - 60), a: rand(-3, 3), morph: rollMorph() });
  turtles.push(t); use(t); resetFeet();
  emit(t.x, t.y, 'sparkle', 12); emit(t.x, t.y - 10, 'heart', 3); snd.play('hatch');
  sel = t; buzz([20, 40, 20]);
  save();
  askName('Name your new hatchling 🥚', name, n => {
    t.name = n; save();
    say(`Welcome, ${n}! Seems ${personality(t.traits).toLowerCase()} 🥚`, 3000);
    announceMorph(t);
  });
}
// In-game name box (the browser's prompt() is blocked in some browsers, like kids' tablets).
// done(name) runs with the typed name (left blank = keep the current one).
const namer = document.getElementById('namer'), namerIn = namer.querySelector('input');
let namerDone = null;
function askName(title, current, done, max = 14) {
  setNamerMode(false);
  namer.querySelector('.title').textContent = title;
  namerIn.maxLength = max; namerIn.value = current; namerDone = n => done((n || '').trim().slice(0, max) || current);
  namer.hidden = false;
  setTimeout(() => { namerIn.focus(); namerIn.select(); }, 50);
}
function closeNamer(ok) {
  if (namer.hidden) return;
  namer.hidden = true; namerIn.blur();
  const f = namerDone; namerDone = null;
  f?.(ok ? namerIn.value : '');
}
namer.querySelector('.ok').onclick = () => closeNamer(true);
// Yes/no questions in the same box (browser confirm() popups are blocked on some tablets).
function setNamerMode(confirming) {
  namerIn.hidden = confirming; namer.querySelector('.ok').hidden = confirming;
  namer.querySelector('.msg').hidden = !confirming; namer.querySelector('.row2').hidden = !confirming;
}
let confirmYes = null;
function askConfirm(title, msg, yesLabel, onYes) {
  setNamerMode(true);
  namer.querySelector('.title').textContent = title;
  namer.querySelector('.msg').textContent = msg;
  namer.querySelector('.yes').textContent = yesLabel;
  confirmYes = onYes; confirmNo = null; namerDone = null;
  namer.hidden = false;
}
let confirmNo = null; // set right after askConfirm for a "no" action
namer.querySelector('.no').onclick = () => { namer.hidden = true; confirmYes = null; const f = confirmNo; confirmNo = null; f?.(); };
namer.querySelector('.yes').onclick = () => { namer.hidden = true; const f = confirmYes; confirmYes = null; confirmNo = null; f?.(); };
namerIn.addEventListener('keydown', e => { if (e.key === 'Enter') closeNamer(true); });
document.getElementById('away-ok').onclick = () => { document.getElementById('away').hidden = true; };

// ---------- tap the name label: rename or release ----------
const menu = document.getElementById('menu');
stageEl.addEventListener('click', () => {
  if (!isPicked()) return openRoster();
  menu.querySelector('.title').textContent = `🐢 ${sel.name}`;
  menu.querySelector('.persona').textContent = personality(sel.traits);
  const mi = morphInfo(sel);
  menu.querySelector('.age').textContent = (sel.guest ? `🏡 Visiting from ${friendName(sel.guest)}'s yard · ` : '') + `🎂 ${ageText(sel)}` + (mi.label ? ` · ${mi.rarity >= 3 ? '🌟' : '✨'} ${mi.label} (${RARITY_NAMES[mi.rarity]})` : '');
  menu.querySelector('.mood').textContent = moods(sel);
  menu.querySelector('.traits').innerHTML = TRAITS.map(d => {
    const n = dots(sel.traits[d.k]);
    return `<div>${d.icon} ${d.label}</div><div class="dots">${'●'.repeat(n)}<span>${'●'.repeat(5 - n)}</span></div>`;
  }).join('');
  document.getElementById('m-release').disabled = turtles.length < 2;
  document.getElementById('m-move').hidden = yards.length < 2;
  const gb = document.getElementById('m-gift');
  gb.hidden = !RELAY_URL || !friends.length; gb.disabled = turtles.length < 2;
  const vb = document.getElementById('m-vet');
  vb.hidden = !up.vet; vb.textContent = `💊 Use vet kit (${up.vet} left)`;
  if (sel.guest) for (const id of ['m-rename', 'm-vet', 'm-move', 'm-gift', 'm-release']) document.getElementById(id).hidden = true; // a friend's turtle: look only
  document.getElementById('m-rename').hidden = !!sel.guest; document.getElementById('m-release').hidden = !!sel.guest;
  document.getElementById('m-close').textContent = sel.guest ? 'Close' : 'Cancel';
  menu.hidden = false;
  focusTurtle(sel);
});
menu.addEventListener('click', e => { if (e.target === menu) menu.hidden = true; });

// ---------- nobody picked: tap "N turtles" for a list of everyone ----------
const roster = document.getElementById('roster');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function statusIcons(t) {
  const s = t.st, c = [], crave = craving(t);
  if (s.health < SICK) c.push('🤒');
  if (s.hunger < 30) c.push('🥬');
  if (s.thirst < 30) c.push('💧');
  if (s.happy < 30) c.push('😢');
  if (s.social < MOOD.lonely) c.push('🤗');
  if (s.warm < MOOD.cold) c.push('🥶');
  if (s.energy < MOOD.tired && t.rest?.kind !== 'sleep') c.push('💤');
  if (crave && s.hunger < 85) c.push(crave === 'berry' ? '🍓' : '🥗');
  if (t.rest?.kind === 'sleep') c.push('😴');
  return c.length ? c.slice(0, 4).join('') : '😊';
}
function openRoster() {
  const live = turtles.filter(own);
  roster.querySelector('.title').textContent = `🐢 ${yards.length > 1 ? yardName : 'Your turtles'} (${live.length})`;
  roster.querySelector('.list').innerHTML = live.map(t => {
    const s = t.st, well = (s.health + s.hunger + s.thirst + s.happy) / 4;
    const col = well < 30 ? '#ef6a5a' : well < 55 ? '#f2c14e' : '#8fd16a';
    const stage = t.growth >= 1 ? 'Adult' : stageOf(t.growth);
    return `<button class="who" data-i="${turtles.indexOf(t)}"><b>${esc(t.name)}</b><span class="chips">${statusIcons(t)}</span>`
      + `<small>${stage} · ${ageText(t)} · ${personality(t.traits)}${morphInfo(t).label ? ' · ' + (morphInfo(t).rarity >= 3 ? '🌟 ' : '✨ ') + morphInfo(t).label : ''}</small><span class="well"><i style="width:${well.toFixed(0)}%;background:${col}"></i></span></button>`;
  }).join('');
  roster.hidden = false;
}
roster.querySelector('.list').addEventListener('click', e => {
  const t = turtles[+e.target.closest('.who')?.dataset.i];
  if (!t) return;
  roster.hidden = true;
  select(t); focusTurtle(t, true);
});
roster.querySelector('.close').onclick = () => { roster.hidden = true; };
roster.addEventListener('click', e => { if (e.target === roster) roster.hidden = true; });
document.getElementById('m-close').onclick = () => { menu.hidden = true; };
document.getElementById('m-rename').onclick = () => {
  menu.hidden = true;
  const t = sel;
  askName(`Rename ${t.name}`, t.name, n => { t.name = n; save(); });
};
document.getElementById('m-move').onclick = () => {
  menu.hidden = true;
  if (turtles.length < 2) return say('A yard needs at least one turtle. Adopt another one first!', 3000);
  openYards(sel);
};
document.getElementById('m-vet').onclick = () => { menu.hidden = true; if (up.vet > 0) useVet(sel, false); };
document.getElementById('m-release').onclick = () => {
  menu.hidden = true;
  if (turtles.length < 2) return;
  const t = sel;
  askConfirm(`Release ${t.name}?`, `${t.name} will go back to the wild. You can try to catch them again there with a net — the longer they're out, the wilder they get.`, '🌿 Release', () => {
    if (!turtles.includes(t) || turtles.length < 2) return;
    t.releasing = 1; // fades out, then is removed in the loop
    releaseToWild(t);
    emit(t.x, t.y, 'sparkle', 12); emit(t.x, t.y - t.S, 'heart', 3);
    sel = turtles.find(o => o !== t);
    say(`Bye ${t.name}! 🌿`); buzz(20);
  });
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
  const fits = YARDS[up.yard].fits;
  rows.push(turtles.length >= MAX_TURTLES ? { icon: '🥚', name: 'Adopt a hatchling', desc: 'Your yard is full of turtles!', done: 'Full' }
    : turtles.length >= fits ? { icon: '🥚', name: 'Adopt a hatchling', desc: `A ${YARDS[up.yard].name.toLowerCase()} yard has room for ${fits} turtles.`, locked: 'Needs a bigger yard' }
      : { icon: '🥚', name: 'Adopt a hatchling', desc: 'A new baby turtle with its own personality and colors.' + yardBoostSummary(), cost: adoptCost(), buy: adopt });
  rows.push({ sec: '🏡 Yard' });
  rows.push(yNext
    ? { icon: '🏡', name: `${yNext.name} yard`, desc: `More room to roam, and space for ${yNext.fits} turtles.`, cost: yNext.cost, buy: () => { up.yard++; applyYard(); say('Bigger yard! Drag to look around · pinch to zoom', 3500); } }
    : { icon: '🏡', name: `${YARDS[up.yard].name} yard`, desc: 'The biggest yard there is.', done: 'Maxed' });
  if (yards.length < MAX_YARDS) rows.push({ icon: '🏞️', name: 'Build another yard', desc: `A brand-new yard with its own upgrades, and a free hatchling to start it. You have ${yards.length}.`, cost: yardCost(), buy: buildYard });
  rows.push({ icon: '🖌️', name: 'Paint the ground', desc: 'Grass, flowers, paths and water in any shape you like. A few ⭐ per tile.', action: startPaint, btn: 'Paint' });
  rows.push({ icon: '✋', name: 'Arrange yard', desc: 'Drag things to new spots. Tap a decoration to remove it.', action: startArrange, btn: 'Arrange' });
  rows.push({ sec: '🤖 Care & automation' });
  rows.push(bNext
    ? { icon: bNext.refill ? '⛲' : '🥣', name: bNext.name, desc: bNext.refill > 1 ? 'Twice the water, refills twice as fast. Built for a crowd.' : bNext.refill ? 'Refills itself, even while you\'re away.' : 'Holds twice as much water.', cost: bNext.cost, buy: () => { up.bowl++; applyYard(); } }
    : { icon: '⛲', name: BOWLS[up.bowl].name, desc: 'Plenty of water for everyone.', done: 'Maxed' });
  rows.push(fNext
    ? { icon: '🥫', name: fNext.name, desc: fNext.max ? 'Feeds a crowd: more often, more food at once.' : up.feeder ? 'Feeds more often and adds strawberries.' : 'Drops food when turtles get hungry, even while you\'re away.', cost: fNext.cost, buy: () => { up.feeder++; if (!objOf('feeder')) startPlacing(newObj('feeder')); } }
    : { icon: '🥫', name: FEEDERS[up.feeder].name, desc: 'Feeding on autopilot.', done: 'Maxed' });
  rows.push(!up.garden ? { icon: '🥬', name: AUTO.garden.name, desc: AUTO.garden.desc, cost: AUTO.garden.cost, buy: () => { up.garden = 1; ensurePlots(); startPlacing(newObj('garden')); } }
    : up.garden === 1 ? { icon: '🍓', name: 'Big garden', desc: 'Six plots, and strawberries too.', cost: 140, buy: () => { up.garden = 2; ensurePlots(); } }
      : up.garden === 2 ? { icon: '🍓', name: 'Huge garden', desc: 'Eight plots, half of them strawberries.', cost: 450, buy: () => { up.garden = 3; ensurePlots(); const g = objOf('garden'); if (g) keepInYard(g); } }
        : { icon: '🍓', name: 'Huge garden', desc: 'Lettuce and strawberries on tap.', done: 'Maxed' });
  rows.push(up.crab === 0 ? { icon: '🦀', name: 'Clean-up crab', desc: 'Scuttles around scooping up poop, even while you\'re away.', cost: 90, buy: () => { up.crab = 1; syncCrabs(); } }
    : up.crab < 4 ? { icon: '🦀', name: ['', 'Second crab', 'Third crab', 'Fourth crab'][up.crab], desc: 'More tidying for more turtles.', cost: [0, 160, 320, 600][up.crab], buy: () => { up.crab++; syncCrabs(); } }
      : { icon: '🦀', name: 'Crab crew', desc: 'Four crabs on poop patrol.', done: 'Maxed' });
  rows.push(objOf('lamp') ? sizeRow('lamp', AUTO.lamp)
    : { icon: AUTO.lamp.icon, name: AUTO.lamp.name, desc: AUTO.lamp.desc, cost: AUTO.lamp.cost, buy: () => startPlacing(newObj('lamp')) });
  rows.push({ icon: '💊', name: 'Vet kit', desc: `Cures sickness instantly, and saves a turtle that's about to die. You have ${up.vet}.`, cost: 40, buy: () => { up.vet++; say('Vet kits are used from a turtle\'s menu (tap its name)', 3000); } });
  rows.push({ sec: '🎾 Toys' });
  for (const [k, toy] of Object.entries(TOYS)) {
    rows.push(up.toys.includes(k) ? { icon: toy.icon, name: toy.name, desc: toy.desc, done: 'Owned' }
      : { icon: toy.icon, name: toy.name, desc: toy.desc, cost: toy.cost, buy: () => { up.toys.push(k); up.toy = k; if (ball) ball = makeBall(ball.x, ball.y); renderToybar(); say('Pick toys in Play mode 🎾', 2500); } });
  }
  rows.push({ sec: '🪨 Rocks' });
  for (const [k, rd] of Object.entries(ROCKS)) {
    if (objOf(k)) rows.push(sizeRow(k, rd));
    else rows.push({ icon: rd.icon, name: rd.name, desc: rd.desc, cost: rd.cost, locked: rd.needYard && up.yard < rd.needYard ? `Needs a ${YARDS[rd.needYard].name} yard` : null, buy: () => startPlacing(newObj(k)) });
  }
  rows.push({ sec: '🛝 Play & rest' });
  for (const [k, sd] of Object.entries(STRUCTS)) {
    if (objOf(k)) rows.push(sizeRow(k, sd));
    else rows.push({ icon: sd.icon, name: sd.name, desc: sd.desc, cost: sd.cost, locked: sd.needYard && up.yard < sd.needYard ? 'Needs a Medium yard' : null, buy: () => startPlacing(newObj(k)) });
  }
  rows.push({ sec: '🦋 Wildlife' });
  { const dd = DECOS.bbush, n = objs.filter(o => o.kind === 'deco' && o.type === 'bbush').length;
    rows.push({ icon: dd.icon, name: dd.name, desc: dd.desc + ' ' + boostText(HATCH_BOOST.bbush) + '.' + (n ? ` You have ${n}.` : ''), cost: dd.cost + dd.step * n, buy: () => { const o = newObj('deco'); o.type = 'bbush'; o.seed = Math.random(); startPlacing(o); } }); }
  for (const [k, w] of Object.entries(WILD)) {
    const lv = up[k === 'birdfeeder' ? 'birds' : k === 'lily' ? 'lily' : 'bugs'], key = k === 'birdfeeder' ? 'birds' : k === 'lily' ? 'lily' : 'bugs';
    if (lv >= w.costs.length) { rows.push({ icon: w.icon, name: w.name, desc: 'All the critters it can attract.', done: 'Maxed' }); continue; }
    const needPond = w.needs === 'pond' && !objOf('pond');
    rows.push({ icon: w.icon, name: lv ? `${w.name} (level ${lv + 1})` : w.name, desc: w.desc[lv], cost: w.costs[lv], locked: needPond ? 'Needs a pond' : null,
      buy: () => { up[key]++; if (k !== 'lily' && !objOf(k)) startPlacing(newObj(k)); say(`${w.icon} ${w.name}${up[key] > 1 ? ` level ${up[key]}` : ''}!`); } });
  }
  rows.push({ sec: '🌷 Decorations' });
  for (const [k, dd] of Object.entries(DECOS)) {
    if (dd.reward || dd.wild) continue; // earned from the collection book / sold under Wildlife
    const n = objs.filter(o => o.kind === 'deco' && o.type === k).length;
    rows.push({ icon: dd.icon, name: dd.name, desc: (dd.desc ? dd.desc + ' ' : '') + (HATCH_BOOST[k] ? boostText(HATCH_BOOST[k]) + '. ' : '') + (dd.light ? 'Glows at night. ' : '') + (n ? `You have ${n}.` : 'Buy as many as you like.'), cost: dd.cost + (dd.step || 0) * n, buy: () => { const o = newObj('deco'); o.type = k; o.seed = Math.random(); startPlacing(o); } });
  }
  wildShopRows(rows);
  return rows;
}
// a placed thing: offer the next size up, if there is one
function sizeRow(kind, base) {
  const lv = up.size[kind] || 0, nx = SIZES[kind]?.[lv + 1];
  if (!nx) return { icon: base.icon, name: lv ? SIZES[kind][lv].name : base.name, desc: base.desc, done: lv ? 'Biggest' : 'Placed' };
  return {
    icon: base.icon, name: nx.name, desc: nx.desc, cost: nx.cost,
    locked: nx.needYard && up.yard < nx.needYard ? `Needs a ${YARDS[nx.needYard].name} yard` : null,
    buy: () => { up.size[kind] = lv + 1; applyYard(); const o = objOf(kind); if (o) { keepInYard(o); emit(o.x, o.y, 'sparkle', 16); } say(`${nx.name}! ✨`); },
  };
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
  stars -= r.cost; buzz([20, 40, 20]); snd.play('buy');
  const before = findable();
  try { r.buy(); if (findable().some(id => !before.includes(id) && !loot.found[id])) setTimeout(() => say('✨ Hmm… something new might turn up in this yard now', 3500), 4200); } catch (err) { stars += r.cost; save(); renderShop(); say('Oops, that didn\'t work. Your stars are back ⭐', 3000); console.error(err); return; }
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

// ---------- friends & visits (through the relay server: see server/README.md) ----------
// The relay only passes messages between two games. The host says yes to every visit, a visitor can look but
// not touch, and there is no chat: games only send yard snapshots, turtle moves and gift offers.
// Friends are kept on this device only: a random device id plus the name you gave them.
const RELAY_DEFAULT = 'wss://turtle-yard-relay.turtle-yard-relay.workers.dev'; // the deployed relay (server/)
const isLocalDev = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !isNativeApp;
// local testing only: ?relay=ws://127.0.0.1:8787 (never on the real site, so a link can't point a game at another server)
const RELAY_URL = (isLocalDev && (new URLSearchParams(location.search).get('relay') || localStorage.getItem('turtle-relay'))) || RELAY_DEFAULT;
if (isLocalDev && new URLSearchParams(location.search).get('relay')) localStorage.setItem('turtle-relay', new URLSearchParams(location.search).get('relay'));
const INVITE_KEY = 'turtle-invite', INVITE_BASE = 'https://madgetr.github.io/turtles/';
const ID_KEY = 'turtle-device-id', FRIENDS_KEY = 'turtle-friends', MAX_FRIENDS = 40, MAX_GUESTS = 3, CODE_MIN = 10;
function deviceId() { // random, made on this device, never tied to a person; not part of backups, so a restored game is a new device
  let id = localStorage.getItem(ID_KEY);
  if (!/^[A-Za-z0-9_-]{16,32}$/.test(id || '')) {
    const b = crypto.getRandomValues(new Uint8Array(16));
    id = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}
let friends = [];
try { friends = (JSON.parse(localStorage.getItem(FRIENDS_KEY)) || []).filter((f, i, all) => f && typeof f.id === 'string' && all.findIndex(g => g?.id === f.id) === i); } catch { }
const friendOf = id => friends.find(f => f.id === id);
const friendName = id => friendOf(id)?.name || 'Your friend';
function saveFriends() { localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends)); netHello(); renderFriends(); renderFriendPill(); }
function addFriend(id, name) {
  const f = friendOf(id);
  if (f) { f.name = name; saveFriends(); renderVisitBar(); return; }
  const twin = friends.find(x => x.name.trim().toLowerCase() === name.trim().toLowerCase()); // same name, different game (new phone, app vs web)?
  const add = (n) => { friends = [...friends, { id, name: n, since: Date.now() }].slice(-MAX_FRIENDS); saveFriends(); renderVisitBar(); };
  if (!twin) return add(name);
  askConfirm(`Is this the same ${twin.name}?`, `You already have a friend called ${twin.name}. If it's the same person on a new phone or game, they'll be replaced. If not, you'll have two.`, 'Same friend', () => {
    twin.id = id; twin.since = Date.now(); delete twin.sent; friends = friends.filter((x, i, all) => all.findIndex(y => y.id === x.id) === i); saveFriends(); renderVisitBar();
  });
  confirmNo = () => { let n = 2; while (friends.some(x => x.name.toLowerCase() === `${name} ${n}`.toLowerCase())) n++; add(`${name} ${n}`); };
}

// ----- connection -----
const net = { ws: null, up: false, tries: 0, timer: 0, online: new Set(), code: null, codeExp: 0, guests: new Set(), knocking: null, gift: null, sending: null };
let visit = null; // looking at a friend's yard: { host, pending, t0, home (your packed yard), picked, yi, groundStr }
const friendsEl = document.getElementById('friends'), friendsBtn = document.getElementById('friends-btn');
const netWanted = () => !!RELAY_URL && !document.hidden && (friends.length > 0 || !!localStorage.getItem(INVITE_KEY) || !friendsEl.hidden || !!net.code || net.guests.size > 0 || !!visit || !!net.knocking);
function netStart() {
  if (LAB || !netWanted() || net.ws) return; // the lab never goes online (it has no real yard to show friends)
  clearTimeout(net.timer);
  let ws;
  try { ws = new WebSocket(`${RELAY_URL}/ws?id=${deviceId()}`); } catch { return netRetry(); }
  net.ws = ws;
  ws.onopen = () => { if (net.ws !== ws) return; net.up = true; net.tries = 0; netHello(); flushThanks(); redeemInvite(); renderFriends(); };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } netOn(m); };
  ws.onclose = () => {
    if (net.ws !== ws) return;
    net.ws = null; net.up = false; net.online.clear(); net.code = null; net.knocking = null; net.gift = null; net.sending = null;
    if (net.guests.size) { net.guests.clear(); say('👋 Your visitors had to go (the connection dropped)', 3000); }
    if (visit) goHome('📶 The connection dropped, so you came home');
    renderFriends(); renderVisitBar(); renderFriendPill();
    netRetry();
  };
}
function netRetry() { clearTimeout(net.timer); if (netWanted()) net.timer = setTimeout(netStart, Math.min(30e3, 1000 * 2 ** net.tries++)); }
function netStop() { clearTimeout(net.timer); net.ws?.close(); }
const netSend = m => { if (!net.up) return false; net.ws.send(JSON.stringify(m)); return true; };
const relay = (to, data) => netSend({ t: 'relay', to, data });
const netHello = () => netSend({ t: 'hello', friends: friends.map(f => f.id) });

function netOn(m) {
  switch (m.t) {
    case 'online': net.online = new Set(m.ids || []); renderFriends(); renderFriendPill(); break;
    case 'code': net.code = m.code; net.codeExp = Date.now() + CODE_MIN * 60e3; renderFriends(); break;
    case 'knock': onKnock(m.from, m.byCode); break;
    case 'knock-fail': {
      const k = net.knocking; net.knocking = null; renderFriends();
      say(m.why === 'slow down' ? '🐢 Slow down! Wait a minute, then try again' : m.why === 'no such code' ? "🔑 That code didn't work. Check it with your friend" : `${k?.id ? friendName(k.id) : 'Your friend'} isn't online right now`, 3500);
      break;
    }
    case 'answer': onAnswer(m.from, m.yes); break;
    case 'left': onLeft(m.from); break;
    case 'relay': if (m.data && typeof m.data === 'object') onRelay(m.from, m.data); break;
    case 'relay-fail': if (net.gift?.to === m.to) { net.gift = null; say(`${friendName(m.to)} isn't online right now`, 3000); } break;
    case 'mail': onMail(m.items); break;
    case 'invite': shareInvite(m.token); break;
    case 'redeemed': {
      localStorage.removeItem(INVITE_KEY);
      if (friendOf(m.owner)) { say(`👫 You're already friends with ${friendName(m.owner)}`, 3000); break; }
      askName('Who sent you this invite? 👫', 'Friend', n => { addFriend(m.owner, n); say(`👫 Sent ${n} a friend request. You'll be friends once they say yes!`, 4000); }, 16);
      break;
    }
    case 'redeem-fail':
      if (m.why !== 'slow down') localStorage.removeItem(INVITE_KEY);
      say(m.why === 'own' ? "🔗 That's your own invite link! Send it to a friend" : m.why === 'expired' ? '🔗 That invite link has expired. Ask your friend for a new one'
        : m.why === 'full' ? "📬 Your friend's mailbox is full. Try again tomorrow" : '🐢 Slow down! Try again in a minute', 4000);
      break;
    case 'package-sent': case 'package-fail': {
      const f = friendOf(m.to); net.sending = null;
      if (m.t === 'package-sent' || m.why === 'already') { if (f) { f.sent = new Date().toDateString(); saveFriends(); } }
      if (m.t === 'package-sent') { snd.play('job'); say(`📦 ${PKG[myPkgTier()].name} on its way to ${friendName(m.to)}!`, 3000); }
      else say(m.why === 'already' ? `📦 You already sent ${friendName(m.to)} a package today` : m.why === 'full' ? `📬 ${friendName(m.to)}'s mailbox is full. Try tomorrow`
        : `📦 ${friendName(m.to)} needs to have you as a friend too`, 3500);
      renderFriends();
      break;
    }
  }
}

// ----- yes/no questions from the network (a queue, so two knocks don't trip over each other) -----
const askEl = document.getElementById('ask'), askQ = [];
function askNet(title, msg, yes, no, onYes, onNo) { askQ.push({ title, msg, yes, no, onYes, onNo }); if (askEl.hidden) showAsk(); snd.play('click'); buzz(40); }
function showAsk() {
  const a = askQ[0]; if (!a) return;
  askEl.querySelector('.title').textContent = a.title; askEl.querySelector('.msg').textContent = a.msg;
  askEl.querySelector('.yes').textContent = a.yes; askEl.querySelector('.no').textContent = a.no;
  askEl.hidden = false;
}
const askDone = yes => { const a = askQ.shift(); askEl.hidden = true; (yes ? a?.onYes : a?.onNo)?.(); showAsk(); };
askEl.querySelector('.yes').onclick = () => askDone(true);
askEl.querySelector('.no').onclick = () => askDone(false);

// ----- hosting: friends looking at your yard -----
const AUTO_KEY = 'turtle-auto-accept'; // friends walk right in (on unless turned off)
const autoAccept = () => localStorage.getItem(AUTO_KEY) !== '0';
function onKnock(from, byCode) {
  const f = friendOf(from), no = () => netSend({ t: 'answer', to: from, yes: false });
  if (net.guests.has(from)) return netSend({ t: 'answer', to: from, yes: true });
  if (visit || net.guests.size >= MAX_GUESTS || (!f && !byCode)) return no();
  const letIn = () => {
    if (visit || net.guests.size >= MAX_GUESTS) return no();
    if (!netSend({ t: 'answer', to: from, yes: true })) return;
    net.guests.add(from); hostSnapNow = true;
    if (!f) { netSend({ t: 'close' }); net.code = null; } // a code lets one visitor in
    renderVisitBar(); renderFriends(); snd.play('job');
    if (!f) askName('Who is visiting? 👫', 'Friend', n => addFriend(from, n), 16);
    else { say(`👀 ${f.name} came to visit!`, 3000); buzz(40); }
  };
  if (f && !byCode && autoAccept()) return letIn(); // friends just walk in, no need to ask
  askNet(f ? `🔔 ${f.name} wants to visit!` : '🔔 Someone used your visit code!',
    f ? `They'd like to look around ${yardName}. They can't change anything.` : `Only let them in if you know who it is. They can look around ${yardName}, but can't change anything.`,
    'Let them in', 'Not now', letIn, no);
}
function dropGuestTurtle(g) { // a visitor went home: their turtle goes with them
  turtles = turtles.filter(t => !(t.guest && (!g || t.guest === g)));
  if (sel.guest && (!g || sel.guest === g)) sel = turtles[0];
  use(sel);
}
function endHosting() {
  dropGuestTurtle();
  for (const g of net.guests) netSend({ t: 'leave', to: g });
  net.guests.clear(); renderVisitBar(); renderFriends();
}
const r2 = v => Math.round((v || 0) * 100) / 100;
const poseOf = t => [Math.round(t.x), Math.round(t.y), r2(t.a), Math.round(t.v), r2(t.headExt), t.rest?.kind || 0, t.eat ? r2(t.eat.t) : -1,
  r2(t.yawn), r2(t.petT), r2(t.drinkT), t.swim ? 1 : 0, r2(t.mud), t.lookAt ? Math.round(t.lookAt.x) : null, t.lookAt ? Math.round(t.lookAt.y) : null];
let hostSnapNow = false, hostSnapT = 0, hostPoseT = 0, hostSending = false, hostYard = -1, hostCount = -1;
function hostTick(now) { // called every frame: the yard every few seconds (and when it changes), turtle moves 4 times a second
  if (!net.guests.size || !net.up || visit) return;
  const live = [...turtles.filter(own), ...turtles.filter(t => t.guest)]; // same order as the snapshot
  if (yardIdx !== hostYard || live.length !== hostCount) hostSnapNow = true;
  if ((hostSnapNow || now - hostSnapT > 4000) && !hostSending) {
    hostSnapNow = false; hostSnapT = now; hostYard = yardIdx; hostCount = live.length; hostSending = true;
    const y = packYard(), yi = yardIdx; delete y.cam;
    y.turtles.push(...turtles.filter(t => t.guest).map(packTurtle));
    gzipB64(JSON.stringify(y)).then(z => { for (const g of net.guests) relay(g, { k: 'snap', z, y: yi }); }).catch(() => { }).finally(() => { hostSending = false; });
  }
  if (now - hostPoseT > 250 && hostYard === yardIdx) {
    hostPoseT = now;
    const p = live.map(poseOf);
    for (const g of net.guests) relay(g, { k: 'pose', p, y: yardIdx });
  }
}

// ----- visiting: looking at a friend's yard -----
function knock(target) { // { code } or { id }
  if (!net.up || visit) return;
  net.knocking = { ...target };
  const k = net.knocking;
  netSend({ t: 'knock', ...(target.code ? { code: target.code } : { to: target.id }) });
  say('🔔 Knocking…', 5000);
  renderFriends();
  setTimeout(() => { if (net.knocking === k) { net.knocking = null; renderFriends(); say('No answer. Maybe they are busy?', 3000); } }, 60e3);
}
function onAnswer(from, yes) {
  const k = net.knocking;
  if (!k || (k.id && k.id !== from)) return;
  net.knocking = null; renderFriends();
  if (!yes) return say(`${k.id ? friendName(from) : 'Your friend'} can't have visitors right now`, 3000);
  visit = { host: from, pending: true };
  say('🚪 Opening the gate…', 3000);
  setTimeout(() => { if (visit?.pending && visit.host === from) { visit = null; netSend({ t: 'leave', to: from }); say("Couldn't load your friend's yard. Try again?", 3000); } }, 10e3);
}
function onLeft(from) {
  if (visit?.host === from) return goHome(visit.pending ? null : `👋 ${friendName(from)} ended the visit`);
  if (net.guests.delete(from)) { dropGuestTurtle(from); say(`👋 ${friendName(from)} went home`, 2500); renderVisitBar(); renderFriends(); }
}
function onRelay(from, d) {
  if (d.k === 'snap' && visit?.host === from && typeof d.z === 'string') return onSnap(d);
  if (d.k === 'pose' && visit?.host === from && !visit.pending) return onPose(d);
  if (d.k === 'bring' && net.guests.has(from) && !visit && d.t && !turtles.some(t => t.guest === from)) return onBring(from, d.t);
  if (d.k === 'go' && net.guests.has(from) && Number.isFinite(d.x) && Number.isFinite(d.y)) { // the visitor calls their turtle
    const t = turtles.find(o => o.guest === from); if (!t) return;
    wakeUp(t); t.userTarget = { x: clamp(d.x, 35, YW - 35), y: clamp(d.y, 25, YH - 15) }; t.eat = null; t.drinkT = 0; t.outing = null;
    return;
  }
  if (d.k === 'gift') return onGiftOffer(from, d);
  if (d.k === 'gift-yes' || d.k === 'gift-no') return onGiftReply(from, d);
}
function onBring(from, p) {
  const t = makeTurtle({ ...cleanTurtle(p), x: cam.x + rand(-40, 40), y: cam.y + rand(-40, 40), a: rand(-3, 3) });
  t.guest = from; keepInYard(t); turtles.push(t); use(t); resetFeet(); use(sel);
  emit(t.x, t.y, 'sparkle', 20); hostSnapNow = true;
  say(`🐢 ${friendName(from)} brought ${t.name} along!`, 3000);
}
async function onSnap(d) {
  let y;
  try { y = JSON.parse(await gunzipB64(d.z)); } catch { return; }
  if (!visit || !y || !Array.isArray(y.turtles) || !y.turtles.length) return;
  if (visit.pending) startVisit(y, d.y); else applyVisitSnap(y, d.y, false);
}
const okObj = o => o && Number.isFinite(o.x) && Number.isFinite(o.y)
  && (o.kind === 'deco' ? !!DECOS[o.type] : !!(STRUCTS[o.kind] || ROCKS[o.kind] || WILD[o.kind] || AUTO[o.kind] || o.kind === 'feeder'));
function cleanTurtle(p) { // only the saved fields, with sane values
  const o = Object.fromEntries(KEEP.filter(k => p[k] !== undefined && k !== 'x' && k !== 'y').map(k => [k, p[k]]));
  o.name = String(o.name || 'Turtle').slice(0, 14);
  o.growth = clamp(+o.growth || 0, 0, 1);
  if (typeof o.st !== 'object' || !o.st) delete o.st;
  if (!Array.isArray(o.gut)) o.gut = [];
  if (typeof o.morph !== 'object' || !o.morph) o.morph = {};
  return o;
}
function startVisit(y, yi) {
  for (const el of document.querySelectorAll('.sheet, #menu, #roster, #shop')) el.hidden = true;
  endHosting(); endArrange(); endPaint();
  save();
  const mine = own(sel) ? packTurtle(sel) : null; // your picked turtle comes along
  visit = { host: visit.host, pending: false, t0: Date.now(), home: packYard(), picked, yi, groundStr: '' };
  if (mine) { relay(visit.host, { k: 'bring', t: mine }); visit.brought = mine.name; visit.buddy = { born: mine.born, name: mine.name }; }
  picked = false;
  document.body.classList.add('visiting');
  applyVisitSnap(y, yi, true);
  renderVisitBar();
  snd.play('hatch');
  const host = visit.host;
  if (!friendOf(host)) askName('Whose yard is this? 👫', 'Friend', n => addFriend(host, n), 16);
  else say(`👀 Welcome to ${friendName(host)}'s yard!`, 2500);
}
function applyVisitSnap(y, yi, first) {
  const sameYard = !first && yi === visit.yi, old = turtles;
  visit.yi = yi;
  const gs = JSON.stringify(y.ground || {});
  const g = gs === visit.groundStr ? ground : (y.ground && typeof y.ground === 'object' ? y.ground : {});
  visit.groundStr = gs;
  const u = y.up && typeof y.up === 'object' ? { ...y.up } : {};
  u.yard = clamp(u.yard | 0, 0, YARDS.length - 1); u.bowl = clamp(u.bowl | 0, 0, BOWLS.length - 1); u.feeder = clamp(u.feeder | 0, 0, FEEDERS.length - 1);
  setYardState({
    name: String(y.name || 'Yard').slice(0, 24), poops: Array.isArray(y.poops) ? y.poops : [], level: y.level, foods: Array.isArray(y.foods) ? y.foods : [],
    turtles: y.turtles.slice(0, MAX_TURTLES).map(p => ({ ...cleanTurtle(p), x: +p.x || 0, y: +p.y || 0, a: +p.a || 0 })), sel: 0,
    up: u, objs: (Array.isArray(y.objs) ? y.objs : []).filter(okObj), plots: Array.isArray(y.plots) ? y.plots : [], ground: g, bowlPos: y.bowlPos && { x: +y.bowlPos.x || 0, y: +y.bowlPos.y || 0 },
  });
  if (sameYard) { // keep the turtles we're already animating; just refresh how they look and feel
    turtles = turtles.map((t, i) => {
      const o = old[i];
      if (!o || o.name !== t.name) return t;
      for (const k of ['st', 'growth', 'chub', 'morph', 'tint', 'traits', 'S']) o[k] = t[k];
      return o;
    });
  } else resetYardRuntime();
  applyYard();
  if (!sameYard) { cam.z = zMin(); cam.x = YW / 2; cam.y = YH / 2; clampCam(); }
  for (const t of turtles) if (!t.feet.length) { use(t); resetFeet(); }
  sel = turtles[0]; use(sel);
}
function onPose(d) {
  if (d.y !== visit.yi || !Array.isArray(d.p) || d.p.length !== turtles.length) return;
  d.p.forEach((p, i) => { if (Array.isArray(p)) turtles[i].net = p; });
}
function visitStep(t, dt) { // glide toward where the host's game says the turtle is
  const p = t.net; if (!p) return;
  const k = Math.min(1, dt * 6);
  t.x += ((+p[0] || 0) - t.x) * k; t.y += ((+p[1] || 0) - t.y) * k; t.a += angDiff(t.a, +p[2] || 0) * k;
  t.v = +p[3] || 0; t.headExt = lerp(t.headExt, +p[4] || 0, k);
  t.rest = p[5] ? { kind: String(p[5]) } : null;
  if (p[6] >= 0) { if (!t.eat || t.netEat !== p[6]) { t.eat = { t: +p[6] }; t.netEat = p[6]; } else t.eat.t += dt; } else t.eat = null;
  t.yawn = +p[7] || 0; t.petT = +p[8] || 0; t.drinkT = +p[9] || 0; t.swim = !!p[10]; t.mud = +p[11] || 0;
  t.lookAt = p[12] == null ? null : { x: +p[12], y: +p[13] };
  t.blinkT -= dt; if (t.blinkT <= 0) { t.blink = 0.15; t.blinkT = rand(2, 5); }
  t.blink = Math.max(0, t.blink - dt);
  t.tailT += dt * (2 + t.v * 0.12);
}
function goHome(msg) {
  if (!visit) return;
  const v = visit; visit = null;
  if (net.up) netSend({ t: 'leave', to: v.host });
  if (v.pending) { if (msg) say(msg, 3000); return; }
  document.body.classList.remove('visiting');
  setYardState(v.home); resetYardRuntime(); applyYard(); clampCam(); syncCrabs(); ensurePlots();
  for (const t of turtles) { use(t); resetFeet(); }
  picked = v.picked; use(sel);
  graceT = GRACE_SECS;
  renderVisitBar();
  const secs = (Date.now() - v.t0) / 1000;
  const warmed = v.buddy && befriend(v.buddy, secs);
  if (secs > 90) showAway(simulateAway(secs), yardName); // your turtles kept living while you were out
  save(); renderPills();
  say(msg || `🏡 Back home in ${yardName}`, 2500);
  if (warmed) setTimeout(() => say(warmed, 3500), 2700);
}
// Visiting friends makes the turtle you brought slowly friendlier: the gain shrinks as it gets cuddlier (1 - f),
// so a grumpy turtle gains about one dot in ~15 min out, and a really long visit counts no more than 3 hours.
const BEFRIEND_RATE = 1 / 3600, BEFRIEND_MAX_SECS = 3 * 3600;
function befriend(b, secs) { // returns a message if the turtle got friendlier
  const t = turtles.find(o => own(o) && sameTurtle(o, b));
  if (!t || secs < 30) return null;
  const f0 = t.traits.friendly;
  t.traits = { ...t.traits, friendly: 1 - (1 - f0) * Math.exp(-BEFRIEND_RATE * Math.min(secs, BEFRIEND_MAX_SECS)) };
  if (dots(t.traits.friendly) > dots(f0)) return `😊 ${t.name} made friends on the visit and feels cuddlier!`;
  return t.traits.friendly - f0 > 0.005 ? `😊 ${t.name} enjoyed the visit and is a little friendlier` : null;
}
const visitBar = document.getElementById('visitbar');
function renderVisitBar() {
  const b = visitBar.querySelector('button');
  visitBar.classList.toggle('host', !visit && net.guests.size > 0);
  if (visit && !visit.pending) {
    visitBar.querySelector('span').textContent = `👀 ${friendName(visit.host)}'s yard: ${yardName}`;
    b.textContent = '🏠 Go home'; b.onclick = () => goHome();
  } else { visitBar.hidden = true; return; } // hosting: end visits from the friends list
  visitBar.hidden = false;
}

// ----- gifts: a turtle moves to a friend's yard (both games must say yes) -----
// Yards are kept packed while you're not in them (and the one you're in is rebuilt when you switch), so a turtle
// is tracked by its hatch time + name, not by object, and looked for in every yard.
let giftTurtle = null;
const sameTurtle = (a, b) => a.born === b.born && a.name === b.name;
function yardTurtles(j) { // { list, live, fits } for yard j; live = the yard on screen (your own, or the one you left to visit)
  if (j === yardIdx && !visit?.home) return { list: turtles.filter(own), live: true, fits: Math.min(MAX_TURTLES, YARDS[up.yard || 0].fits) };
  const y = j === yardIdx ? visit.home : yards[j];
  return { list: y.turtles, live: false, fits: Math.min(MAX_TURTLES, YARDS[y.up?.yard || 0].fits) };
}
const yardNameOf = j => (j === yardIdx ? (visit?.home ? visit.home.name : yardName) : yards[j].name);
function sendGift(to) {
  const t = giftTurtle; giftTurtle = null; friendsEl.hidden = true;
  if (!t || !turtles.includes(t)) return;
  if (turtles.length < 2) return say("You can't give away your only turtle", 3000);
  net.gift = { to, key: { born: t.born, name: t.name }, name: t.name, id: Math.random().toString(36).slice(2) };
  relay(to, { k: 'gift', id: net.gift.id, turtle: packTurtle(t) });
  say(`🎁 Waiting for ${friendName(to)} to say yes to ${t.name}…`, 4000);
}
function onGiftOffer(from, d) {
  if (!d.turtle || typeof d.turtle !== 'object') return;
  const p = cleanTurtle(d.turtle), mi = morphInfo(p);
  askNet(`🎁 ${friendName(from)} has a gift for you!`, `Would you like to adopt ${p.name}${mi.label ? `, ${mi.label.toLowerCase()}` : ''}? They'll come to live in your yard.`,
    'Adopt', 'No thanks', () => acceptGift(from, d.id, p), () => relay(from, { k: 'gift-no', id: d.id }));
}
function acceptGift(from, id, p) {
  // the yard you're in if it has room (when visiting, the one you left), otherwise the first yard that does
  const order = [yardIdx, ...yards.map((_, j) => j).filter(j => j !== yardIdx)];
  const j = order.find(i => { const r = yardTurtles(i); return r.list.length < r.fits; });
  if (j === undefined) { relay(from, { k: 'gift-no', id, full: true }); return say(`🏡 All your yards are full, so ${p.name} couldn't come. Make room and ask again`, 4000); }
  if (!relay(from, { k: 'gift-yes', id })) return say(`📶 Couldn't reach ${friendName(from)}. Try again?`, 3000);
  p.arrived = Date.now();
  const r = yardTurtles(j);
  if (r.live) {
    const t = makeTurtle({ ...p, x: cam.x + rand(-30, 30), y: cam.y + rand(-30, 30), a: rand(-3, 3) });
    keepInYard(t); turtles.push(t); use(t); resetFeet(); use(sel);
    emit(t.x, t.y, 'sparkle', 20);
  } else {
    const y = j === yardIdx ? visit.home : yards[j], m = YARDS[y.up?.yard || 0].m;
    r.list.push({ ...p, x: base.w * m / 2 + rand(-40, 40), y: base.h * m / 2 + rand(-40, 40), a: rand(-3, 3) });
  }
  save(); renderPills();
  const where = yards.length > 1 || !r.live ? ` ${yardNameOf(j)}` : ' your yard';
  snd.play('fanfare'); say(`🎁 ${p.name} joined${where}${visit && j === yardIdx ? ' (waiting for you at home)' : ''}! Thank you, ${friendName(from)}!`, 4500);
}
function onGiftReply(from, d) {
  const g = net.gift;
  if (!g || g.to !== from || g.id !== d.id) return;
  net.gift = null;
  if (d.k === 'gift-no') return say(d.full ? `🏡 ${friendName(from)}'s yard is full` : `${friendName(from)} said no thanks`, 3000);
  // find the turtle in whichever yard it's in now (you may have switched or moved it while waiting)
  for (let j = 0; j < yards.length; j++) {
    const r = yardTurtles(j), t = r.list.find(x => sameTurtle(x, g.key));
    if (!t) continue;
    if (r.list.length < 2) break; // never empty a yard (they keep a copy, rather than leave it bare)
    if (r.live) {
      emit(t.x, t.y, 'sparkle', 16);
      turtles = turtles.filter(x => x !== t);
      if (sel === t) sel = turtles[0];
      use(sel);
    } else r.list.splice(r.list.indexOf(t), 1);
    save(); renderPills();
    break;
  }
  snd.play('job'); say(`🎁 ${g.name} went to live with ${friendName(from)}! 💚`, 4000);
}

// ----- care packages: one a day to each friend, waiting in the relay's mailbox if they're away -----
// The receiver's game picks what's inside when it's opened: stars, and about half the time a find (commons
// likeliest, finds you don't have yet favoured). Opening one sends the sender a thank-you worth a few stars.
const THANK_STARS = 5;
const sentToday = f => f.sent === new Date().toDateString();
function pkgSizeLine() { // "Your game is worth ⭐ 3,240, so you send big boxes. At ⭐ 6,000: huge boxes!"
  const worth = gameWorth(), i = pkgTierFor(worth), next = PKG[i + 1];
  return `Your game is worth ⭐ ${worth.toLocaleString()}, so you send ${PKG[i].tag ? PKG[i].tag.trim().toLowerCase() + 'es' : 'small boxes'}.`
    + (next ? ` At ⭐ ${next.min.toLocaleString()}: ${next.tag.trim().toLowerCase()}es!` : ' The best there is!');
}
function sendPackage(id) {
  const f = friendOf(id);
  if (!f || sentToday(f) || !net.up || net.sending) return;
  net.sending = id; netSend({ t: 'package', to: id, tier: myPkgTier() }); job('package'); renderFriends();
}
function onMail(items) {
  if (!Array.isArray(items)) return;
  let got = 0;
  for (const it of items) {
    if (!Number.isInteger(it?.mid) || typeof it.from !== 'string') continue;
    netSend({ t: 'ack', mid: it.mid });
    if (loot.mailSeen.includes(it.mid)) continue; // delivered twice (an ack got lost)
    loot.mailSeen = [...loot.mailSeen, it.mid].slice(-100);
    if (it.kind === 'package') { loot.parcels.push({ from: it.from, name: friendName(it.from), mid: it.mid, tier: clamp(it.tier | 0, 0, PKG.length - 1) }); got++; }
    else if (it.kind === 'friendreq') { if (!friendOf(it.from) && !friendReqs.includes(it.from)) { friendReqs.push(it.from); saveReqs(); } askFriendReqs(); }
    else if (it.kind === 'thanks') { stars += THANK_STARS; say(`💌 ${friendName(it.from)} opened your care package! +${THANK_STARS} ⭐`, 3500); snd.play('star'); }
  }
  if (got) { snd.play('gift'); say(got > 1 ? `📦 ${got} care packages arrived! Find them in your yard` : `📦 A care package from ${loot.parcels[loot.parcels.length - 1].name} arrived! Find it in your yard`, 4000); }
  save();
}
function placeParcel(pc) { // somewhere open near the middle of the yard you're in
  for (let i = 0; i < 20; i++) {
    const p = { x: YW / 2 + rand(-YW * 0.3, YW * 0.3), y: YH / 2 + rand(-YH * 0.3, YH * 0.3) };
    if (i < 19 && (inPond(p) || dist(p, bowl) < bowl.r + 30 || objs.some(o => o.kind !== 'deco' && dist(o, p) < hitR(o) + 20))) continue;
    keepInYard(p); pc.x = p.x; pc.y = p.y; return;
  }
}
// How big a package is depends on what the sender's whole game is worth when they send it (see gameWorth):
// richer friends send bigger boxes.
// stars = usual range (15% of the time 1.5x the top, 5% of the time 2.5x); find = chance of a find; rar = Common/Uncommon/Rare %
const PKG = [
  { min: 0, name: 'Care package', tag: '', size: 1, glow: 0, stars: [10, 20], find: 0.5, rar: [70, 25, 5] },
  { min: 1500, name: 'Big care package', tag: 'Big box ', size: 1.15, glow: 0, stars: [20, 35], find: 0.65, rar: [60, 30, 10] },
  { min: 6000, name: 'Huge care package', tag: 'Huge box ', size: 1.3, glow: 1, stars: [35, 60], find: 0.8, rar: [45, 40, 15] },
  { min: 20000, name: 'Treasure chest care package', tag: 'Treasure box ', size: 1.5, glow: 1.4, stars: [60, 100], find: 1, rar: [30, 45, 25] },
];
// What your whole game is worth in stars: stars in hand, plus the shop price of everything you've bought or earned
// in every yard (yards, upgrades, things placed, turtles), toys and brushes, and your collection.
const FIND_WORTH = { 1: 15, 2: 40, 3: 120 }, REWARD_WORTH = 300, MORPH_WORTH = [0, 30, 100, 300, 800];
const costsUpTo = (list, lv) => list.slice(1, (lv || 0) + 1).reduce((a, x) => a + (x?.cost || 0), 0); // levels 1..lv
function yardWorth(y) {
  const u = y.up || {};
  let w = costsUpTo(YARDS, u.yard) + costsUpTo(BOWLS, u.bowl) + costsUpTo(FEEDERS, u.feeder);
  w += [0, 70, 210, 660][u.garden || 0] + [0, 90, 250, 570, 1170][u.crab || 0];
  for (const k in SIZES) w += costsUpTo(SIZES[k], u.size?.[k]);
  for (const [k, key] of [['birdfeeder', 'birds'], ['lily', 'lily'], ['bughotel', 'bugs']]) w += WILD[k].costs.slice(0, u[key] || 0).reduce((a, c) => a + c, 0);
  const seen = {};
  for (const o of y.objs || []) {
    if (o.kind === 'deco') { const d = DECOS[o.type]; if (!d) continue; const n = seen[o.type] = (seen[o.type] || 0) + 1; w += d.reward ? REWARD_WORTH : d.cost + (d.step || 0) * (n - 1); }
    else w += (STRUCTS[o.kind] || ROCKS[o.kind] || (o.kind === 'lamp' ? AUTO.lamp : null))?.cost || 0; // feeder, garden and wildlife: counted with their upgrades
  }
  (y.turtles || []).forEach((t, i) => { w += (i ? Math.round(25 * i ** 1.6 / 5) * 5 : 0) + MORPH_WORTH[morphInfo(t).rarity]; });
  return w;
}
function gameWorth() {
  let w = stars + YARD_COSTS.slice(0, yards.length - 1).reduce((a, c) => a + c, 0);
  yards.forEach((y, j) => { w += yardWorth(j === yardIdx ? (visit?.home || packYard()) : y); });
  w += up.toys.reduce((a, k) => a + (TOYS[k]?.cost || 0), 0) + up.brushes.reduce((a, k) => a + (GROUND[k]?.cost || 0), 0) + up.vet * 40;
  for (const [id, n] of Object.entries(loot.found)) if (ITEMS[id]) w += FIND_WORTH[ITEMS[id].rar] * n;
  return Math.round(w);
}
const pkgTierFor = worth => PKG.reduce((t, P, i) => (worth >= P.min ? i : t), 0);
const myPkgTier = () => pkgTierFor(gameWorth());
function rollPackage(tier = 0) {
  const P = PKG[clamp(tier | 0, 0, PKG.length - 1)], [lo, hi] = P.stars, r = Math.random();
  const got = r < 0.05 ? Math.round(hi * 2.5) : r < 0.2 ? Math.round(hi * 1.5) : Math.round(rand(lo, hi));
  if (Math.random() >= P.find) return { got, it: null };
  const q = Math.random() * 100, rar = q < P.rar[2] ? 3 : q < P.rar[2] + P.rar[1] ? 2 : 1;
  const pool = Object.values(ITEMS).filter(i => i.rar === rar), w = i => (loot.found[i.id] ? 1 : 3);
  let x = Math.random() * pool.reduce((a, i) => a + w(i), 0);
  return { got, it: pool.find(i => (x -= w(i)) <= 0) || pool[0] };
}
function openParcel(pc) {
  loot.parcels = loot.parcels.filter(x => x !== pc);
  const { got, it } = rollPackage(pc.tier), P = PKG[pc.tier || 0];
  earn(got, pc.x, pc.y - 30); emit(pc.x, pc.y, 'sparkle', 18); buzz([20, 40, 20]); snd.play('gift');
  let line = `+${got} ⭐`;
  if (it) { const isNew = addFind(it.id); line += ` and ${it.icon} ${it.name} · ${RARITY[it.rar]}${isNew ? ' (new!)' : ''}`; }
  showFind('📦', `${P.name} from ${pc.name}!`, line, it ? it.fact : 'Send one back from 👫 Friends: you can send each friend one care package a day.');
  sendThanks(pc.from);
  save();
}
let thanksQ = [];
try { thanksQ = JSON.parse(localStorage.getItem('turtle-thanks')) || []; } catch { }
function sendThanks(id) { if (!thanksQ.includes(id)) thanksQ.push(id); flushThanks(); }
function flushThanks() { // sent when you're online; kept until then
  if (net.up) { for (const id of thanksQ) netSend({ t: 'thanks', to: id }); thanksQ = []; }
  localStorage.setItem('turtle-thanks', JSON.stringify(thanksQ));
}

// ----- invite links: https://madgetr.github.io/turtles/?invite=<token> (or turtleyard://invite/<token> in the app) -----
// The token comes from the relay (7 days, one live link each). Whoever opens it adds you; you get a friend request to approve.
// friend requests wait on this device until answered (the mail itself is already picked up)
let friendReqs = [], askingReq = null;
try { friendReqs = JSON.parse(localStorage.getItem('turtle-friend-reqs')) || []; } catch { }
const saveReqs = () => localStorage.setItem('turtle-friend-reqs', JSON.stringify(friendReqs));
function askFriendReqs() {
  friendReqs = friendReqs.filter(id => !friendOf(id));
  const from = friendReqs[0];
  if (!from || askingReq) return;
  askingReq = from;
  const done = () => { friendReqs = friendReqs.filter(x => x !== from); saveReqs(); askingReq = null; askFriendReqs(); };
  askNet('👫 Someone used your invite link!', 'Only add them if you know who it is. Friends can visit (you always say yes first) and send care packages.',
    'Add friend', 'No thanks', () => askName('Who is this friend? 👫', 'Friend', n => { addFriend(from, n); snd.play('job'); say(`👫 ${n} is now your friend!`, 3000); done(); }, 16), done);
}
setTimeout(askFriendReqs, 1500); // any left from last time
function takeInvite(url) { // remember an invite from a link; it's used as soon as we're online
  const m = String(url || '').match(/(?:[?&]invite=|invite\/)([A-Za-z0-9_-]{8,40})/);
  if (!m) return false;
  localStorage.setItem(INVITE_KEY, m[1]);
  if (net.up) redeemInvite(); else netStart();
  return true;
}
function redeemInvite() { const t = localStorage.getItem(INVITE_KEY); if (t && net.up) netSend({ t: 'redeem', token: t }); }
async function shareInvite(token) {
  const url = `${INVITE_BASE}?invite=${token}`, text = "Be my friend in Turtle Yard! 🐢 Tap to add me (works for 7 days):";
  try {
    if (isNativeApp) { await window.Capacitor.Plugins.Share.share({ title: 'Turtle Yard invite', text, url, dialogTitle: 'Send your invite link' }); return; }
    if (navigator.share) { await navigator.share({ title: 'Turtle Yard invite', text, url }); return; }
  } catch (e) { if (/cancel|abort/i.test(e?.message || e?.name || '')) return; }
  try { await navigator.clipboard.writeText(`${text} ${url}`); say('🔗 Invite link copied! Paste it in a message to your friend', 3500); }
  catch { askConfirm('Your invite link', url, 'OK', () => { }); }
}
{ // opened from an invite link?
  const q = new URLSearchParams(location.search), inv = q.get('invite');
  if (inv) {
    history.replaceState(null, '', location.pathname + (q.get('relay') ? `?relay=${encodeURIComponent(q.get('relay'))}` : ''));
    if (/Android/i.test(navigator.userAgent) && !isNativeApp && !q.has('web')) { // offer the app first: a web game is a separate player
      const back = `${location.origin}${location.pathname}?web=1&invite=${inv}`;
      askNet('🐢 Open in the Turtle Yard app?', 'If you play in the app, open the invite there so the friend joins your real game.', 'Open the app', 'Use this page',
        () => { location.href = `intent://invite/${inv}#Intent;scheme=turtleyard;package=com.madgetr.petturtle;S.browser_fallback_url=${encodeURIComponent(back)};end`; },
        () => takeInvite(`?invite=${inv}`));
    } else takeInvite(`?invite=${inv}`);
  }
  if (isNativeApp && window.Capacitor.Plugins.App) { // the app opened (or was brought back) by a turtleyard:// link
    const A = window.Capacitor.Plugins.App;
    A.addListener('appUrlOpen', e => takeInvite(e.url));
    A.getLaunchUrl?.().then(r => r?.url && takeInvite(r.url)).catch(() => { });
  }
}

// ----- the friends sheet -----
function openFriends(gift = null) {
  if (!RELAY_URL) return say("👫 Friends aren't switched on in this version yet", 3000);
  if (visit) return;
  giftTurtle = gift;
  friendsEl.hidden = false;
  netStart(); renderFriends();
}
function renderFriends() {
  if (friendsEl.hidden) return;
  if (net.code && Date.now() > net.codeExp) net.code = null;
  friendsEl.querySelector('.sub').textContent = !net.up ? '📶 Connecting to the turtle post office…'
    : giftTurtle ? `🎁 Pick a friend to give ${giftTurtle.name} to. They need to be online.` : `Visit yards, give turtles, and send each friend a 📦 care package every day. ${pkgSizeLine()}`;
  friendsEl.querySelectorAll('.grp').forEach(g => { g.hidden = !!giftTurtle; });
  const codeEl = friendsEl.querySelector('.code'), openB = friendsEl.querySelector('.open');
  codeEl.hidden = !net.code;
  if (net.code) codeEl.textContent = net.code.replace(/^(\d{3})/, '$1 ');
  openB.textContent = net.code ? `✖ Stop (the code works ${Math.ceil((net.codeExp - Date.now()) / 60e3)} more min)` : '🔑 Get a visit code';
  openB.classList.toggle('go', !net.code);
  openB.disabled = !net.up; friendsEl.querySelector('.share').disabled = !net.up;
  friendsEl.querySelector('.knock').disabled = !net.up || !!net.knocking;
  friendsEl.querySelector('.auto').textContent = autoAccept() ? '🚪 Friends walk right in: On' : '🔔 Friends knock first (auto-accept off)';
  const list = [...friends].sort((a, b) => net.online.has(b.id) - net.online.has(a.id));
  friendsEl.querySelector('.list').innerHTML = list.length ? list.map(f => {
    const on = net.online.has(f.id), here = net.guests.has(f.id);
    const sent = sentToday(f);
    const act = giftTurtle ? `<button class="act go give" ${on ? '' : 'disabled'}>🎁 Give</button>`
      : `<button class="act pkg ${sent ? 'done' : 'go'}" ${!sent && net.up && !net.sending ? '' : 'disabled'} aria-label="Send a care package">${sent ? '📦 ✓' : '📦 Send'}</button>${here ? '<button class="act end">👋 End visit</button>' : `<button class="act go visit" ${on && net.up && !net.knocking ? '' : 'disabled'}>👀 Visit</button>`}`;
    return `<div class="fr ${giftTurtle ? '' : 'wide'}" data-id="${esc(f.id)}"><i class="dot ${on ? 'on' : ''}"></i><button class="nm">${esc(f.name)}<small>${here ? 'Visiting you now' : on ? 'Online now' : 'Not online'}${sent ? ' · 📦 sent today' : ''}</small></button>${act}<button class="x" aria-label="Remove">✕</button></div>`;
  }).join('') : '<div class="empty">No friends yet. Swap visit codes to add one!</div>';
}
setInterval(renderFriends, 15e3); // code countdown
const renderFriendPill = () => { friendsBtn.textContent = net.online.size ? `👫 ${net.online.size}` : '👫'; friendsBtn.classList.toggle('ready', net.online.size > 0); };
friendsBtn.onclick = () => openFriends();
friendsEl.querySelector('.auto').onclick = () => { localStorage.setItem(AUTO_KEY, autoAccept() ? '0' : '1'); renderFriends(); };
friendsEl.querySelector('.share').onclick = () => { if (!netSend({ t: 'invite' })) say('📶 Not connected yet. Try again in a moment', 2500); };
friendsEl.querySelector('.open').onclick = () => {
  if (net.code) { netSend({ t: 'close' }); net.code = null; renderFriends(); }
  else netSend({ t: 'open' });
};
friendsEl.querySelector('.in').addEventListener('input', e => { if (!/invite/.test(e.target.value)) e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); }); // digits, or a pasted invite link
friendsEl.querySelector('.in').addEventListener('keydown', e => { if (e.key === 'Enter') friendsEl.querySelector('.knock').click(); });
friendsEl.querySelector('.knock').onclick = () => {
  const inp = friendsEl.querySelector('.in');
  if (/invite/.test(inp.value)) { const ok = takeInvite(inp.value); inp.value = ''; if (!ok) say("🔗 That link didn't look right", 2500); return; }
  const code = inp.value.replace(/\D/g, '');
  if (code.length !== 6) return say('🔑 Visit codes have 6 numbers', 2500);
  if (code === net.code) return say("🔑 That's your own code! Give it to a friend", 3000);
  inp.value = ''; knock({ code });
};
friendsEl.querySelector('.list').addEventListener('click', e => {
  const row = e.target.closest('.fr'); if (!row) return;
  const f = friendOf(row.dataset.id); if (!f) return;
  if (e.target.closest('.visit')) return knock({ id: f.id });
  if (e.target.closest('.end')) { netSend({ t: 'leave', to: f.id }); net.guests.delete(f.id); dropGuestTurtle(f.id); renderFriends(); return; }
  if (e.target.closest('.give')) return sendGift(f.id);
  if (e.target.closest('.pkg')) return sendPackage(f.id);
  if (e.target.closest('.nm')) return askName('Rename your friend', f.name, n => { f.name = n; saveFriends(); renderVisitBar(); }, 16);
  if (e.target.closest('.x')) return askConfirm(`Remove ${f.name}?`, 'You can add them again any time with a visit code.', 'Remove', () => {
    if (net.guests.has(f.id)) { netSend({ t: 'leave', to: f.id }); net.guests.delete(f.id); renderVisitBar(); }
    friends = friends.filter(x => x !== f); saveFriends();
  });
});
friendsEl.querySelector('.close').onclick = () => { friendsEl.hidden = true; giftTurtle = null; };
friendsEl.addEventListener('click', e => { if (e.target === friendsEl) { friendsEl.hidden = true; giftTurtle = null; } });
document.getElementById('m-gift').onclick = () => { menu.hidden = true; if (turtles.length > 1) openFriends(sel); };
if (!RELAY_URL) friendsBtn.hidden = true;
netStart(); // only connects if you already have friends (so they can see you're online)

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
  try { frameBody(now); } catch (e) {
    if (!visit) throw e;
    console.error(e); ctx.reset?.(); goHome("⚠️ Couldn't show your friend's yard, so you came home");
    requestAnimationFrame(frame);
  }
}
function frameBody(now) {
  adaptRes(now - last);
  const dt = clamp((now - last) / 1000, 0, 0.05); last = now; // the first frame's timestamp can be a bit before `last`: never run time backwards
  const time = now / 1000;
  graceT -= dt; waterStarCool -= dt;
  followCam(dt);
  const v = viewRect();
  for (const t of turtles) {
    use(t);
    if (t.guest) t.st.health = 100; // a friend's turtle on a visit: never sick, never saved
    // off-screen turtles keep living but skip the leg animation; feet snap back into place when they reappear
    const vis = inView(t, t.S * 3, v);
    if (vis && t.off) resetFeet();
    t.off = !vis;
    if (visit) visitStep(t, dt); // a friend's turtle: its game moves it, we just follow
    else if (!t.dying) { think(dt); updateStats(dt); }
    if (vis) updateFeet(dt);
  }
  if (!visit && turtles.some(t => t.releasing !== undefined && (t.releasing -= dt) <= 0)) {
    turtles = turtles.filter(t => !(t.releasing <= 0));
    if (!turtles.length) { // the yard is never empty: a new hatchling wanders in
      const t = makeTurtle({ name: randomName(), growth: 0, x: cam.x, y: cam.y, morph: rollMorph() });
      turtles.push(t); use(t); resetFeet(); graceT = GRACE_SECS;
      setTimeout(() => say(`🥚 A new hatchling, ${t.name}, wandered into your yard`), 1200);
    }
    if (!turtles.includes(sel)) sel = turtles[0];
    save();
  }
  if (!visit) separate();
  updateBall(dt);
  bowl.fill = Math.max(0, bowl.fill - dt);
  if (BOWLS[up.bowl].refill) bowl.level = Math.min(1, bowl.level + dt * BOWLS[up.bowl].refill / 600); // fountain tops itself up
  const feeder = up.feeder && objOf('feeder');
  if (feeder && !visit) {
    const F = FEEDERS[up.feeder];
    if ((feederT += dt) > F.every) {
      feederT = 0;
      if (foods.filter(f => f.slot === undefined).length < 6 && foods.filter(f => f.fromFeeder).length < (F.max || 2) && turtles.some(t => t.st.hunger < 65)) {
        const f = feederFood(feeder, F); foods.push(f); emit(f.x, f.y, 'crumb', 6);
      }
    }
  }
  poops.forEach(p => p.born += dt);
  marker = isPicked() ? sel.userTarget : null;
  const nowMs = Date.now(), dk = darkness();
  if (!visit) { gardenTick(nowMs); lootTick(nowMs); jobTick(dt); spoilFood(nowMs); updateCrabs(dt); }
  hostTick(now);
  if (objOf('garden')) for (const f of foods) if (f.slot !== undefined) { const sp = slotPos(f.slot); f.x = sp.x; f.y = sp.y; }
  updateFlies(dt, dk, v);
  updateLife(dt, dk);
  { const pond = objOf('pond'); snd.ambience(dk, !!pond && inView(pond, POND.rx, v)); }

  // ----- draw (world space) -----
  drawYard(v);
  const pond = objOf('pond'), mud = objOf('mud'), slide = objOf('slide'), lamp = objOf('lamp'), garden = objOf('garden'), mirror = objOf('mirror');
  if (lamp && inView(lamp, LAMP_R, v)) drawLampGlow(lamp, dk);
  if (pond && inView(pond, POND.rx + 20, v)) { drawPond(pond, time); if (up.lily) drawLilies(pond, time); }
  if (mud && inView(mud, MUD.rx + 10, v)) drawMud(mud, time);
  for (const rk of rocksPlaced()) if (inView(rk, rockDims(rk).rx + 30, v)) drawRock(rk, time, dk);
  const bed = objOf('mossbed'), fog = objOf('fog'), cave = objOf('cave'), trs = trees();
  for (const o of trs) if (inView(o, treeLook(o).R + 30, v)) drawTrunk(o);
  if (bed && inView(bed, BED.rx + 10, v)) drawMossBed(bed);
  const log = objOf('log'), hut = objOf('hut'); // floors now, roofs after the turtles
  if (log && inView(log, LOG.len, v)) drawLog(log, 'floor');
  if (hut && inView(hut, HUT.r + 10, v)) drawHut(hut, 'floor');
  if (cave && inView(cave, CAVE.r * 1.2, v)) drawCave(cave, 'floor');
  if (fog && inView(fog, 30, v)) drawFogMachine(fog, time);
  drawGroundLife(v);
  if (slide && inView(slide, SLIDE.len, v)) drawSlide(slide);
  if (garden && inView(garden, 100, v)) drawGarden(garden, nowMs);
  for (const o of objs) if (o.kind === 'deco' && !DECOS[o.type].tall && !DECOS[o.type].canopy && inView(o, 40, v)) drawDeco(o, time, dk);
  for (const p of poops) if (inView(p, 30, v)) drawPoop(p, time);
  for (const f of foods) if (inView(f, 30, v)) drawFoodItem(f);
  if (!visit) drawLoot(time, v); // your finds aren't in your friend's yard
  if (inView(bowl, bowl.r + 10, v)) drawBowl(time); // low to the ground: turtles always walk over it
  drawMarker(time);
  // turtles, crabs, toy, bowl, feeder, mirror and tall decorations back-to-front so overlaps look right
  const order = [...turtles.filter(t => !t.off), ...(feeder ? [feeder] : []), ...(ball ? [ball] : []), ...(mirror ? [mirror] : []),
    ...crabs.filter(c => inView(c, 20, v)), ...objs.filter(o => (WILD[o.kind] || (o.kind === 'deco' && DECOS[o.type].tall)) && inView(o, 60, v))].sort((a, b) => a.y - b.y);
  for (const o of order) {
    if (o === ball) drawBall();
    else if (o === feeder) drawFeeder(o, time);
    else if (o === mirror) drawMirror(o, time);
    else if (o.crab) drawCrab(o);
    else if (o.kind === 'birdfeeder') drawBirdFeeder(o);
    else if (o.kind === 'bughotel') drawBugHotel(o);
    else if (o.kind === 'deco') drawDeco(o, time, dk);
    else {
      use(o);
      const lift = slide ? slideLift(o, slide) : 0, up2 = onLookout(o);
      if (lift) S = o.S * (1 + 0.28 * lift); // higher up the slide = closer to the camera
      else if (up2) S = o.S * (1 + 0.18 * up2); // up on the lookout rock
      if (o.swim) { ctx.fillStyle = 'rgba(20,60,100,0.28)'; ctx.beginPath(); ctx.ellipse(o.x, o.y, o.S * 1.5, o.S * 1.3, o.a, 0, 7); ctx.fill(); }
      ctx.globalAlpha = clamp(o.releasing ?? 1, 0, 1) * (o.swim ? 0.88 : 1);
      drawTurtle(time);
      ctx.globalAlpha = 1;
      if (o.swim) { ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(o.x, o.y, o.S * 1.25, o.S * 1.05, o.a, 0, 7); ctx.stroke(); }
    }
  }
  // tunnels, roofs and the lamp cover what's under them
  if (log) { const a = roofFade(log, dt); if (inView(log, LOG.len, v)) drawLog(log, 'roof', a); }
  if (hut) { const a = roofFade(hut, dt); if (inView(hut, HUT.r + 10, v)) drawHut(hut, 'roof', a); }
  if (cave) { const a = roofFade(cave, dt); if (inView(cave, CAVE.r * 1.2, v)) drawCave(cave, 'roof', a); }
  if (fog && inView(fog, FOG_R + 40, v)) drawMist(fog, time, dk);
  for (const o of trs) if (inView(o, treeLook(o).R + 40, v)) drawTree(o, time);
  drawAirLife(v);
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

if (LAB) import('./lab.js').then(m => m.start({
  cv, ctx, makeTurtle, use, resetFeet, updateFeet, drawTurtle, sizeFor, stageOf, morphInfo, personality, randomName, randomTint, rollMorph, randomTraits,
  MORPHS, TRAITS, KEEP, get T() { return T; },
}));
else {
  resize(); // measures the HUD
  const info = load();
  rescaleToStandard();
  const firstWorld = !base;
  if (!base) base = { ...STD_BASE };
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
  renderPills();
  ensurePlots(); syncCrabs();
  addEventListener('resize', resize);
  setInterval(save, 4000);
  addEventListener('pagehide', save);
  // Switching away from the app counts as being away: simulate that time when you come back.
  let hiddenAt = null;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (visit) goHome(); hiddenAt = Date.now(); save(); snd.pause(); netStop(); return; }
    snd.resume(); netStart();
    if (hiddenAt === null) return;
    const away = (Date.now() - hiddenAt) / 1000;
    hiddenAt = null; last = performance.now();
    if (away > 90) { graceT = GRACE_SECS; showAway(simulateAway(away)); dailyBonus(); save(); }
  });
  window.turtle = { get turtles() { return turtles; }, get sel() { return sel; }, get ball() { return ball; }, get foods() { return foods; }, get poops() { return poops; }, bowl, grow: a => { use(sel); grow(a); }, simulateAway: secs => showAway(simulateAway(secs)), endGrace: () => { graceT = 0; }, addStars: n => { stars += n; }, cam, get up() { return up; }, get objs() { return objs; }, get crabs() { return crabs; }, get plots() { return plots; }, setHour: h => { hourOverride = h; }, get yards() { return yards; }, get yardIdx() { return yardIdx; }, switchYard: i => switchYard(i), hatchOdds: () => hatchOdds(), rollMorph: () => rollMorph() };
  requestAnimationFrame(frame);
}

// ---------- the wild: released turtles (plus a few natives) roam a big meadow; catch them back with nets ----------
const FERAL_DAYS = 60, WILD_CAP = 40, WILD_NATIVES = 4, HIDE_HOURS = 8; // a turtle that slips the net won't show up again for a while
const NETS = [ // tier 1..3: odds on a freshly released turtle (hi) and a fully feral one (lo)
  null, { name: 'Basic net', cost: 120, hi: 0.9, lo: 0.12 }, { name: 'Sturdy net', cost: 300, hi: 0.95, lo: 0.3 }, { name: 'Master net', cost: 750, hi: 0.99, lo: 0.55 },
];
const wildnessOf = w => (w.origin === 'native' ? 1 : clamp((Date.now() - (w.releasedAt || 0)) / (FERAL_DAYS * 864e5), 0, 1));
function catchOddsFor(w, netTier) {
  const n = NETS[netTier]; if (!n) return 0;
  const x = wildnessOf(w);
  if (x <= 0.12) return lerp(n.hi, n.hi - 0.05, x / 0.12); // first ~7 days: still remembers you
  return lerp(n.hi - 0.05, n.lo, Math.sqrt((x - 0.12) / 0.88));
}
function pruneWild() { // soft cap: drop the oldest natives first; released turtles are never thrown away
  const natives = wildPool.filter(w => w.origin === 'native').sort((a, b) => (a.releasedAt || 0) - (b.releasedAt || 0));
  while (wildPool.length > WILD_CAP && natives.length) wildPool.splice(wildPool.indexOf(natives.shift()), 1);
}
const wildId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function releaseToWild(t) {
  const now = Date.now();
  wildPool.push({ ...packTurtle(t), id: wildId(), origin: 'released', releasedAt: now, lastSeenAt: now, sightings: 0 });
  pruneWild(); save();
}
function seedNatives() {
  while (wildPool.filter(w => w.origin === 'native').length < WILD_NATIVES) {
    const t = makeTurtle({ growth: rand(0.25, 1), morph: rollMorph([]) });
    wildPool.push({ ...packTurtle(t), id: wildId(), origin: 'native', releasedAt: Date.now() - rand(0, 30) * 864e5, lastSeenAt: 0, sightings: 0 });
  }
  pruneWild();
}
const yardRoom = () => Math.min(MAX_TURTLES, YARDS[up.yard].fits) - turtles.filter(own).length;
// Returns { ok, turtle } on a catch, { ok: false, escaped: true } on a miss, or { ok: false, why } if it couldn't try.
function catchWildTurtle(id, netTier) {
  const w = wildPool.find(o => o.id === id);
  if (!w) return { ok: false, why: 'gone' };
  if (!(wildNets[netTier - 1] > 0)) return { ok: false, why: 'No nets of that kind' };
  if (yardRoom() <= 0) return { ok: false, why: 'No room in this yard' };
  w.lastSeenAt = Date.now();
  if (Math.random() >= catchOddsFor(w, netTier)) { w.hideUntil = Date.now() + HIDE_HOURS * 36e5; save(); return { ok: false, escaped: true }; } // a miss keeps the net
  wildNets[netTier - 1]--; // the net goes home with the turtle
  wildPool.splice(wildPool.indexOf(w), 1);
  const { id: _i, origin, releasedAt, lastSeenAt, sightings, ...rest } = w;
  const t = makeTurtle({ ...rest, gut: [], x: clamp(cam.x + rand(-60, 60), 60, YW - 60), y: clamp(cam.y + rand(-60, 60), 60, YH - 60), a: rand(-3, 3),
    tint: rest.tint || pickTint(turtles), arrived: Date.now() });
  turtles.push(t); use(t); resetFeet(); use(sel);
  save();
  return { ok: true, turtle: t };
}
function wildShopRows(rows) {
  rows.push({ sec: `🌲 The Wild · ${wildNets.map((n, i) => `${netSvg(i + 1)} ${n}`).join(' ')}` });
  rows.push({ icon: '🌲', name: 'Visit the wild', desc: 'Released turtles roam here. Bring a net to catch one back.', btn: 'Go', action: () => { shop.hidden = true; openWild(); } });
  for (let k = 1; k <= 3; k++) {
    const n = NETS[k];
    rows.push({ icon: netSvg(k), name: `${n.name} (have ${wildNets[k - 1]})`, desc: `Used up on a catch (kept if it gets away). ~${Math.round(n.hi * 100)}% on a freshly released turtle, ~${Math.round(n.lo * 100)}% on a fully wild one.`,
      cost: n.cost, buy: () => { wildNets[k - 1]++; say(`${n.name} ready`); } });
  }
}

// --- the meadow scene (its own canvas; pan + pinch zoom like the yard; turtles use the shared drawTurtle) ---
const wildEl = document.getElementById('wild'), wcv = document.getElementById('wild-c'), wctx = wcv.getContext('2d');
const WW = 3200, WH = 3200;
const wild = { open: false, cam: { x: WW / 2, y: WH / 2, z: 1 }, ground: {}, chunks: null, trees: [], tufts: [], walkers: [], pick: null, raf: 0, last: 0, d: 1 };
const wTile = (x, y) => wild.ground[`${Math.floor(x / TILE)},${Math.floor(y / TILE)}`];
const inLake = (p, pad = 0) => [[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad]].some(([dx, dy]) => wTile(p.x + dx, p.y + dy) === 'water');
{ // same meadow every visit, painted with the yard's ground tiles
  let s = 7331; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const blob = (type, n, rMin, rMax, overwrite) => {
    for (let i = 0; i < n; i++) {
      const x = 300 + R() * (WW - 600), y = 300 + R() * (WH - 600), rx = rMin + R() * (rMax - rMin), ry = rx * (0.55 + R() * 0.45), a = R() * 3;
      const ca = Math.cos(-a), sa = Math.sin(-a), ext = Math.ceil(rx / TILE) + 1, c0 = Math.floor(x / TILE), r0 = Math.floor(y / TILE);
      for (let c = c0 - ext; c <= c0 + ext; c++) for (let r = r0 - ext; r <= r0 + ext; r++) {
        const dx = (c + 0.5) * TILE - x, dy = (r + 0.5) * TILE - y, u = dx * ca - dy * sa, v = dx * sa + dy * ca;
        const k = `${c},${r}`;
        if ((u / rx) ** 2 + (v / ry) ** 2 < 1 && (overwrite || !wild.ground[k])) wild.ground[k] = type;
      }
    }
  };
  wild.ground = {};
  blob('water', 7, 140, 320, true);
  blob('dirt', 22, 50, 150, false);
  blob('moss', 12, 80, 200, false);
  blob('meadow', 8, 60, 160, false);
  blob('gravel', 5, 40, 90, false);
  for (let i = 0; i < 1400; i++) { const p = { x: R() * WW, y: R() * WH, k: R() }; if (!wTile(p.x, p.y)) wild.tufts.push(p); }
  for (let i = 0; i < 170; i++) { const t = { x: R() * WW, y: R() * WH, r: 34 + R() * 40, h: R() }; if (!inLake(t, t.r * 0.6)) wild.trees.push(t); }
  wild.chunks = new Map();
  const keys = new Set(Object.keys(wild.ground).map(k => { const [c, r] = k.split(',').map(Number); return `${Math.floor(c / CHUNK)},${Math.floor(r / CHUNK)}`; }));
  for (const k of keys) { const [cx, cy] = k.split(',').map(Number); wild.chunks.set(k, buildChunk(cx, cy, wild.ground)); }
}
function grassSpot() { for (let i = 0; i < 50; i++) { const p = { x: rand(150, WW - 150), y: rand(150, WH - 150) }; if (!inLake(p, 40)) return p; } return { x: WW / 2, y: WH / 2 }; }
const wZmin = () => Math.max(0.35, innerWidth / WW, innerHeight / WH), wZmax = 2.5;
function wClamp() {
  const C = wild.cam; C.z = clamp(C.z, wZmin(), wZmax);
  const hw = innerWidth / 2 / C.z, hh = innerHeight / 2 / C.z;
  C.x = clamp(C.x, hw, WW - hw); C.y = clamp(C.y, hh, WH - hh);
}
const wS2W = (sx, sy) => ({ x: wild.cam.x + (sx - innerWidth / 2) / wild.cam.z, y: wild.cam.y + (sy - innerHeight / 2) / wild.cam.z });
function openWild() {
  if (visit || LAB) return;
  seedNatives();
  wild.cam = { x: WW / 2, y: WH / 2, z: 1 };
  const pool = wildPool.filter(w => !(w.hideUntil > Date.now())).sort(() => Math.random() - 0.5), n = Math.min(pool.length, 1 + (Math.random() < 0.6) + (Math.random() < 0.25));
  wild.walkers = pool.slice(0, n).map(w => {
    let p = grassSpot();
    for (let i = 0; i < 20 && dist(p, wild.cam) < 600; i++) p = grassSpot(); // few and far between: not right where you start
    const { id, origin, releasedAt, lastSeenAt, sightings, ...rest } = w;
    const t = makeTurtle({ ...rest, gut: [], x: p.x, y: p.y, a: rand(-3, 3), st: { hunger: 100, thirst: 100, happy: 80, health: 100, social: 80, energy: 90, warm: 90 } });
    t.wild = w; t.tgt = null; t.idle = rand(0, 3); t.flee = 0;
    use(t); resetFeet();
    w.sightings = (w.sightings || 0) + 1; w.lastSeenAt = Date.now();
    return t;
  });
  use(sel); save();
  wild.pick = null; wild.throwing = null; renderWildPanel();
  wildEl.hidden = false; wild.open = true; wildResize();
  wild.last = performance.now(); wild.raf = requestAnimationFrame(wildFrame);
  say(wild.walkers.length ? '🌲 Something is moving out there… drag to explore · pinch to zoom' : '🌲 It\'s quiet today', 3000);
}
function closeWild() { wild.open = false; wildEl.hidden = true; cancelAnimationFrame(wild.raf); }
function wildResize() { const d = Math.min(devicePixelRatio || 1, 2); wcv.width = innerWidth * d; wcv.height = innerHeight * d; wild.d = d; wClamp(); }
addEventListener('resize', () => { if (wild.open) wildResize(); });
function wildFrame(now) {
  if (!wild.open) return;
  const dt = clamp((now - wild.last) / 1000, 0, 0.05); wild.last = now;
  for (const t of wild.walkers) { // slow wandering
    let want = null;
    if (t.held) t.v = 0;
    else if (t.flee > 0) { t.flee -= dt; t.v = lerp(t.v, 90, dt * 4); if (t.flee <= 0) t.gone = true; }
    else if (t.tgt) {
      want = Math.atan2(t.tgt.y - t.y, t.tgt.x - t.x);
      const da = ((want - t.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      t.a += clamp(da, -1.5 * dt, 1.5 * dt);
      t.v = lerp(t.v, Math.abs(da) < 0.6 ? 22 + 14 * t.traits.speed : 4, dt * 3);
      if (dist(t, t.tgt) < 12) { t.tgt = null; t.idle = rand(2, 7); }
    } else {
      t.v = lerp(t.v, 0, dt * 4);
      if ((t.idle -= dt) <= 0) {
        const a = rand(0, 6.28), d = rand(80, 260);
        t.tgt = { x: clamp(t.x + Math.cos(a) * d, 100, WW - 100), y: clamp(t.y + Math.sin(a) * d, 100, WH - 100) };
        if (inLake(t.tgt, 20)) { t.tgt = null; t.idle = 0.5; }
      }
    }
    t.x += Math.cos(t.a) * t.v * dt; t.y += Math.sin(t.a) * t.v * dt;
    use(t); updateFeet(dt);
  }
  use(sel); throwStep(dt);
  wild.walkers = wild.walkers.filter(t => !t.gone);
  drawWild(now / 1000);
  wild.raf = requestAnimationFrame(wildFrame);
}
function drawWild(time) {
  const c = wctx, d = wild.d, C = wild.cam, vw = innerWidth / C.z, vh = innerHeight / C.z, ox = C.x - vw / 2, oy = C.y - vh / 2;
  const vis = (x, y, r) => x + r > ox && x - r < ox + vw && y + r > oy && y - r < oy + vh;
  c.setTransform(d * C.z, 0, 0, d * C.z, -ox * d * C.z, -oy * d * C.z);
  c.fillStyle = GROUND.grass.col; c.fillRect(ox, oy, vw, vh);
  drawChunks(wild.chunks, { x0: ox, y0: oy, x1: ox + vw, y1: oy + vh }, c);
  c.lineWidth = 2;
  if (C.z > 0.5) for (const p of wild.tufts) if (vis(p.x, p.y, 8)) {
    c.strokeStyle = p.k > 0.5 ? '#6a9a40' : '#93c25e';
    c.beginPath(); c.moveTo(p.x - 4, p.y); c.lineTo(p.x - 6, p.y - 7); c.moveTo(p.x, p.y); c.lineTo(p.x, p.y - 9); c.moveTo(p.x + 4, p.y); c.lineTo(p.x + 6, p.y - 7); c.stroke();
  }
  for (const t of wild.walkers) if (vis(t.x, t.y, t.S * 3)) {
    if (wild.pick === t) { c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.setLineDash([6, 5]); c.lineDashOffset = -time * 12; c.beginPath(); c.ellipse(t.x, t.y, t.S * 1.6, t.S * 1.5, t.a, 0, 7); c.stroke(); c.setLineDash([]); }
    use(t); c.save(); drawTurtle(time, c); c.restore();
  }
  use(sel);
  for (const t of wild.trees) if (vis(t.x, t.y, t.r * 1.3)) {
    c.fillStyle = '#00000033'; c.beginPath(); c.ellipse(t.x + 10, t.y + 12, t.r, t.r * 0.8, 0, 0, 7); c.fill();
    c.fillStyle = t.h > 0.5 ? '#2f6b26' : '#3b7a2a'; c.beginPath(); c.arc(t.x, t.y, t.r, 0, 7); c.fill();
    c.fillStyle = t.h > 0.5 ? '#3f8a33' : '#4f9636'; c.beginPath(); c.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.6, 0, 7); c.fill();
  }
  const th = wild.throwing; // the net drops over the turtle, then lifts (miss) or stays (catch)
  if (th) {
    const k = clamp(th.age / 0.5, 0, 1), lift = !th.ok && th.age > 0.9 ? clamp((th.age - 0.9) / 0.4, 0, 1) : 0;
    c.globalAlpha = 1 - lift; drawNet(c, th.t.x, th.t.y - lift * 60, th.t.S * 1.7 * (1 + (1 - k) * 0.8), -0.5 + (1 - k) * 0.6, th.tier); c.globalAlpha = 1;
  }
}
// a hand-held fishing net seen from above: wooden handle, round hoop, string mesh
function drawNet(c, x, y, r, a, tier = 1) {
  c.save(); c.translate(x, y); c.rotate(a);
  c.lineCap = 'round';
  c.strokeStyle = '#6b4a2a'; c.lineWidth = r * 0.16; c.beginPath(); c.moveTo(r * 0.95, r * 0.2); c.lineTo(r * 2.6, r * 0.9); c.stroke();
  c.strokeStyle = '#8a6238'; c.lineWidth = r * 0.09; c.beginPath(); c.moveTo(r * 0.95, r * 0.2); c.lineTo(r * 2.6, r * 0.9); c.stroke();
  c.save(); c.beginPath(); c.arc(0, 0, r, 0, 7); c.clip();
  c.fillStyle = '#ffffff22'; c.fill();
  const NC = NET_COL[tier] || NET_COL[1];
  c.strokeStyle = NC.mesh; c.lineWidth = Math.max(1, r * 0.035);
  const step = r / (3 + tier);
  c.beginPath();
  for (let i = -r; i <= r; i += step) { c.moveTo(i - r, -r); c.lineTo(i + r, r); c.moveTo(i + r, -r); c.lineTo(i - r, r); }
  c.stroke(); c.restore();
  c.strokeStyle = NC.hoop; c.lineWidth = r * 0.1; c.beginPath(); c.arc(0, 0, r, 0, 7); c.stroke();
  c.restore();
}
const NET_COL = [null, { hoop: '#7a4f28', mesh: '#c49a6c' }, { hoop: '#c9a227', mesh: '#ffe08a' }, { hoop: '#7b3fb8', mesh: '#cfa8f5' }]; // brown, gold, purple
const netSvg = (tier = 1) => { const C = NET_COL[tier]; return `<svg viewBox="0 0 24 24" width="1.2em" height="1.2em" style="vertical-align:-.25em"><line x1="14" y1="14" x2="22" y2="22" stroke="#7a5230" stroke-width="2.6" stroke-linecap="round"/><circle cx="9" cy="9" r="7" fill="#fff3" stroke="${C.hoop}" stroke-width="1.8"/><path d="M4 6l10 10M2.5 10l7.5 7.5M6 3l11 11M10 2.5l7.5 7.5M14 4L4 14M17 6L6 17M12 2.6L2.6 12M16.5 10L10 16.5" stroke="${C.mesh}" stroke-width=".9"/></svg>`; };
const agoText = ms => { const d = Math.round(ms / 864e5); return d < 1 ? `${Math.max(1, Math.round(ms / 36e5))} h` : `${d} day${d === 1 ? '' : 's'}`; };
function renderWildPanel() {
  const p = document.getElementById('wild-panel'), t = wild.pick;
  document.getElementById('wild-nets').innerHTML = wildNets.map((n, i) => `${netSvg(i + 1)} ${n}`).join(' &nbsp;');
  p.hidden = !t; if (!t) return;
  const w = t.wild, x = wildnessOf(w), mood = x <= 0.12 ? 'Still tame' : x < 0.5 ? 'Getting wild' : x < 1 ? 'Wild' : 'Feral';
  const who = w.origin === 'native' ? 'A wild native turtle' : `Released ${agoText(Date.now() - w.releasedAt)} ago`;
  p.innerHTML = `<b>${w.name}</b><small>${who} · ${mood}</small><div class="nets">${[1, 2, 3].map(k =>
    `<button data-k="${k}" ${wildNets[k - 1] ? '' : 'disabled'}>${netSvg(k)} ${NETS[k].name} ×${wildNets[k - 1]}<br>${Math.round(catchOddsFor(w, k) * 100)}%</button>`).join('')}</div>`;
}
document.getElementById('wild-panel').addEventListener('click', e => {
  const k = +e.target.closest('button')?.dataset.k, t = wild.pick; if (!k || !t || wild.throwing) return;
  const r = catchWildTurtle(t.wild.id, k);
  if (r.why) return say(r.why === 'gone' ? 'It wandered off' : r.why, 2200);
  t.tgt = null; t.v = 0; t.held = true; buzz(20);
  wild.throwing = { t, tier: k, ok: r.ok, age: 0, name: r.ok ? r.turtle.name : t.wild.name };
  wild.pick = null; renderWildPanel();
});
function throwStep(dt) { // net animation; the catch itself was already rolled
  const th = wild.throwing; if (!th) return;
  th.age += dt;
  if (th.age > 0.6 && !th.said) {
    th.said = true;
    if (th.ok) { snd.play('buy'); buzz([30, 50, 30]); say(`Caught ${th.name}! They're back in ${yardName}`, 3000); }
    else { buzz(60); say(`💨 ${th.name} wriggled out of the net and ran off!`, 2600); }
  }
  if (!th.ok && th.age > 0.9 && th.t.held) { const t = th.t; t.held = false; t.flee = 2; t.a = Math.atan2(t.y - wild.cam.y, t.x - wild.cam.x) + rand(-0.4, 0.4); }
  if (th.age > (th.ok ? 1.6 : 1.3)) { if (th.ok) wild.walkers.splice(wild.walkers.indexOf(th.t), 1); wild.throwing = null; }
}
document.getElementById('wild-close').onclick = closeWild;
function petWild(t) { // a small ⭐ for a gentle pat: a few per turtle per visit, with a short cooldown
  const now = Date.now();
  if ((t.pets || 0) >= 3 || now < (t.petAt || 0) + 8000) return;
  t.pets = (t.pets || 0) + 1; t.petAt = now; t.idle = Math.max(t.idle, 1.5); t.tgt = null;
  earn(1, t.x, t.y); buzz(15); save();
  say(`💚 ${t.wild.name} liked that · +1⭐ (⭐ ${stars})`, 1600);
}
{ // one finger pans, two fingers pinch-zoom (and pan), wheel zooms, a short tap picks a turtle
  const ptrs = new Map(); let g = null;
  const mid = () => { const [a, b] = [...ptrs.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)) }; };
  wcv.addEventListener('pointerdown', e => {
    try { wcv.setPointerCapture(e.pointerId); } catch { } ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { const m = mid(); g = { kind: 'pinch', d0: m.d, z0: wild.cam.z, w0: wS2W(m.x, m.y) }; }
    else if (ptrs.size === 1) g = { kind: 'pan', x: e.clientX, y: e.clientY, cx: wild.cam.x, cy: wild.cam.y, moved: 0 };
  });
  wcv.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const C = wild.cam;
    if (g?.kind === 'pinch' && ptrs.size >= 2) {
      const m = mid(); C.z = clamp(g.z0 * m.d / g.d0, wZmin(), wZmax);
      C.x = g.w0.x - (m.x - innerWidth / 2) / C.z; C.y = g.w0.y - (m.y - innerHeight / 2) / C.z; wClamp();
    } else if (g?.kind === 'pan') {
      const dx = e.clientX - g.x, dy = e.clientY - g.y; g.moved = Math.max(g.moved, Math.hypot(dx, dy));
      C.x = g.cx - dx / C.z; C.y = g.cy - dy / C.z; wClamp();
    }
  });
  const ptrUp = e => {
    if (!ptrs.delete(e.pointerId)) return;
    if (g?.kind === 'pan' && g.moved < 10 && !ptrs.size) {
      const p = wS2W(e.clientX, e.clientY);
      wild.pick = wild.walkers.filter(t => !(t.flee > 0) && !t.held && dist(p, t) < t.S * 1.6 + 14 / wild.cam.z).sort((a, b) => dist(p, a) - dist(p, b))[0] || null;
      if (wild.pick) petWild(wild.pick);
      renderWildPanel();
    }
    g = ptrs.size ? { kind: 'done' } : null; // the finger left after a pinch doesn't pan or tap
  };
  wcv.addEventListener("pointerup", ptrUp); wcv.addEventListener("pointercancel", ptrUp);
  wcv.addEventListener('wheel', e => {
    e.preventDefault(); const C = wild.cam, w0 = wS2W(e.clientX, e.clientY);
    C.z = clamp(C.z * Math.exp(-e.deltaY * 0.0015), wZmin(), wZmax);
    C.x = w0.x - (e.clientX - innerWidth / 2) / C.z; C.y = w0.y - (e.clientY - innerHeight / 2) / C.z; wClamp();
  }, { passive: false });
}
if (window.turtle) window.turtle.wild = wild; // debug
