// Pet Turtle sounds: everything is synthesized with Web Audio (no sound files).
// Soft, short effects plus gentle background ambience (birds by day, crickets by night, water by the pond).
// Mode: 2 = everything, 1 = effects only, 0 = muted. Remembered between visits.

const KEY = 'turtle-sound';
let mode = +(localStorage.getItem(KEY) ?? 2);
let ac = null, master = null, fx = null, amb = null, noiseBuf = null, water = null;
const lastPlay = new Map(); // per-sound throttle so a big turtle family doesn't make a racket

export const soundMode = () => mode;
export function cycleMode() {
  mode = (mode + 2) % 3; // 2 -> 1 -> 0 -> 2
  localStorage.setItem(KEY, mode);
  apply();
  return mode;
}
function apply() {
  if (!ac) return;
  const t = ac.currentTime;
  master.gain.setTargetAtTime(mode ? 0.55 : 0, t, 0.05);
  amb.gain.setTargetAtTime(mode === 2 ? 1 : 0, t, 0.3);
}

// Browsers only allow audio after the player touches the screen: call this on the first tap.
export function unlock() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.connect(ac.destination);
    fx = ac.createGain(); fx.connect(master);
    amb = ac.createGain(); amb.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    apply();
  }
  if (ac.state === 'suspended') ac.resume();
}
export function pause() { if (ac && ac.state === 'running') ac.suspend(); }
export function resume() { if (ac && ac.state === 'suspended') ac.resume(); }

// ---------- building blocks ----------
function tone(f, dur, { type = 'sine', vol = 0.3, at = 0, to = null, attack = 0.005, dest = fx } = {}) {
  const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { f = 1000, q = 1, type = 'bandpass', vol = 0.3, at = 0, to = null, attack = 0.005, dest = fx } = {}) {
  const t = ac.currentTime + at, s = ac.createBufferSource(), flt = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; s.loop = true;
  flt.type = type; flt.frequency.setValueAtTime(f, t); flt.Q.value = q;
  if (to) flt.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(flt); flt.connect(g); g.connect(dest);
  s.start(t, Math.random()); s.stop(t + dur + 0.02);
}
const r = (a, b) => a + Math.random() * (b - a);

// ---------- effects ----------
const SFX = {
  munch: () => { // a soft bite thump, then a scatter of tiny crisp crackles (lettuce crunch)
    tone(r(150, 180), 0.08, { to: 70, vol: 0.14 });
    let at = 0.01;
    for (let i = 0; i < 7; i++) { noise(r(0.01, 0.022), { f: r(2200, 4800), q: 4, vol: r(0.06, 0.13), at, attack: 0.002 }); at += r(0.012, 0.032); }
  },
  squish: () => { // berries: a softer, wetter bite
    tone(r(130, 160), 0.1, { to: 60, vol: 0.13 });
    noise(0.09, { f: 700, q: 2, vol: 0.1, to: 350, at: 0.02, attack: 0.01 });
    tone(r(500, 600), 0.06, { to: 300, vol: 0.04, at: 0.05 });
  },
  sip: () => { tone(r(500, 650), 0.12, { to: r(900, 1100), vol: 0.08 }); },
  chirp: () => { const b = r(900, 1200); tone(b, 0.09, { to: b * 1.5, vol: 0.12, type: 'triangle' }); tone(b * 1.3, 0.12, { to: b * 1.9, vol: 0.1, type: 'triangle', at: 0.1 }); },
  hiss: () => { noise(0.35, { f: 5000, q: 0.8, type: 'highpass', vol: 0.12, attack: 0.04 }); },
  boing: () => { tone(r(180, 230), 0.25, { to: r(420, 520), vol: 0.18, type: 'triangle' }); },
  bell: () => { const b = r(1300, 1500); for (const [m, v] of [[1, 0.12], [2.76, 0.05], [5.4, 0.03]]) tone(b * m, 0.6, { vol: v }); },
  splash: () => { noise(0.45, { f: 1800, q: 0.7, vol: 0.22, to: 500, attack: 0.01 }); noise(0.2, { f: 3500, q: 1.5, vol: 0.08, at: 0.05 }); },
  plop: () => { tone(r(300, 360), 0.14, { to: 90, vol: 0.25 }); },
  scoop: () => { noise(0.18, { f: 2500, q: 1, vol: 0.12, to: 6000 }); tone(1600, 0.15, { vol: 0.05, at: 0.08, to: 2400 }); },
  star: () => { tone(r(1500, 1650), 0.18, { vol: 0.07, type: 'triangle' }); tone(2400, 0.14, { vol: 0.04, at: 0.05 }); },
  drop: () => { tone(r(220, 260), 0.07, { to: 150, vol: 0.12 }); },
  pour: () => { noise(0.7, { f: 900, q: 1.2, vol: 0.12, to: 1800, attack: 0.08 }); },
  dig: () => { noise(0.08, { f: 400, q: 1, vol: 0.25 }); noise(0.08, { f: 350, q: 1, vol: 0.2, at: 0.12 }); },
  treasure: () => { SFX.dig(); [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.3, { vol: 0.1, type: 'triangle', at: 0.25 + i * 0.08 })); },
  gift: () => { noise(0.25, { f: 3000, q: 0.6, vol: 0.12, to: 1200 }); [659, 831, 988, 1319].forEach((f, i) => tone(f, 0.35, { vol: 0.1, type: 'triangle', at: 0.2 + i * 0.09 })); },
  fanfare: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i === 3 ? 0.6 : 0.18, { vol: 0.12, type: 'triangle', at: i * 0.13 })); tone(1568, 0.5, { vol: 0.05, at: 0.39 }); },
  job: () => { [880, 1175].forEach((f, i) => tone(f, 0.2, { vol: 0.09, type: 'triangle', at: i * 0.1 })); },
  buy: () => { [1047, 1319, 1568].forEach((f, i) => tone(f, 0.15, { vol: 0.08, type: 'triangle', at: i * 0.06 })); },
  hatch: () => { tone(600, 0.1, { to: 900, vol: 0.1, type: 'triangle' }); tone(900, 0.12, { to: 1400, vol: 0.1, type: 'triangle', at: 0.12 }); tone(1300, 0.2, { to: 1800, vol: 0.08, type: 'triangle', at: 0.26 }); },
  sad: () => { [523, 494, 440, 392].forEach((f, i) => tone(f, 0.45, { vol: 0.09, at: i * 0.3 })); },
  sick: () => { tone(440, 0.25, { to: 330, vol: 0.08 }); tone(392, 0.3, { to: 294, vol: 0.07, at: 0.28 }); },
  croak: () => { const g = ac.createGain(); g.gain.value = 0.5; g.connect(fx); for (let i = 0; i < 2; i++) tone(r(110, 140), 0.16, { type: 'square', vol: 0.05, at: i * 0.2, to: 90, dest: g }); },
  click: () => { tone(1200, 0.03, { vol: 0.04 }); },
};
const GAP = { star: 0.09, munch: 0.12, squish: 0.12, sip: 0.25, plop: 0.15, boing: 0.08, chirp: 0.15, croak: 0.6, drop: 0.05 }; // min seconds between repeats

export function play(name) {
  if (!ac || !mode || ac.state !== 'running' || !SFX[name]) return;
  const now = ac.currentTime, gap = GAP[name] ?? 0.05;
  if (now - (lastPlay.get(name) ?? -9) < gap) return;
  lastPlay.set(name, now);
  SFX[name]();
}

// ---------- ambience: call every frame ----------
let nextBird = 0, nextCricket = 0;
export function ambience(dark, pondNear) {
  if (!ac || mode < 2 || ac.state !== 'running') { if (water) water.g.gain.setTargetAtTime(0, ac?.currentTime ?? 0, 0.3); return; }
  const t = ac.currentTime;
  if (dark < 0.5 && t > nextBird) { // a little bird phrase now and then
    nextBird = t + r(3, 9);
    const b = r(2600, 3600), n = 2 + Math.floor(r(0, 4));
    for (let i = 0; i < n; i++) tone(b * r(0.85, 1.15), 0.08, { to: b * r(1.1, 1.4), vol: 0.035, at: i * r(0.09, 0.14), dest: amb });
  }
  if (dark > 0.5 && t > nextCricket) { // cricket trills
    nextCricket = t + r(0.8, 2.2);
    const f = r(4200, 4800), n = 3 + Math.floor(r(0, 4));
    for (let i = 0; i < n; i++) tone(f, 0.035, { vol: 0.02 * dark, at: i * 0.05, dest: amb });
  }
  if (!water) { // gentle running water, faded in while the pond is on screen
    const s = ac.createBufferSource(), flt = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; s.loop = true; flt.type = 'lowpass'; flt.frequency.value = 700; g.gain.value = 0;
    s.connect(flt); flt.connect(g); g.connect(amb); s.start();
    water = { g };
  }
  water.g.gain.setTargetAtTime(pondNear ? 0.035 : 0, t, 0.5);
}
