// Turtle lab: a debug page (index.html?lab) for building a turtle with sliders and dropdowns.
// It draws with the game's own drawTurtle, so what you see here is exactly what the yard shows.
// The game never starts in lab mode and save() is a no-op, so your real yard is never touched.

const CSS = `
body.lab > *:not(#c):not(#lab-stage):not(#lab) { display: none !important; }
#lab-stage { position: fixed; inset: 0; z-index: 50; cursor: crosshair; }
#lab { position: fixed; top: 0; right: 0; bottom: 0; width: 320px; z-index: 60; overflow-y: auto; touch-action: pan-y;
  background: #f7f3e8; color: #2c4020; font: 13px system-ui, sans-serif; box-shadow: -4px 0 18px #0003; padding: 12px 14px 40px; box-sizing: border-box; }
#lab h1 { font-size: 17px; margin: 0 0 2px; }
#lab .sub { color: #6b7560; font-size: 12px; margin-bottom: 8px; }
#lab .sum { background: #fff; border-radius: 10px; padding: 8px 10px; margin-bottom: 6px; line-height: 1.45; }
#lab .sum b { font-size: 15px; }
#lab details { border-top: 1px solid #d9d2bd; padding: 6px 0; }
#lab summary { font-weight: 700; cursor: pointer; padding: 4px 0; user-select: none; }
#lab .row { display: grid; grid-template-columns: 96px 1fr 46px; align-items: center; gap: 6px; margin: 5px 0; }
#lab .row.wide { grid-template-columns: 96px 1fr; }
#lab .row output { text-align: right; font-variant-numeric: tabular-nums; color: #55603f; font-size: 12px; }
#lab input[type=range] { width: 100%; accent-color: #5d8a3a; }
#lab select, #lab input[type=text] { width: 100%; box-sizing: border-box; padding: 4px 6px; border: 1px solid #c9c0a8; border-radius: 6px; background: #fff; font: inherit; }
#lab .btns { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
#lab button { border: 0; border-radius: 8px; padding: 7px 10px; background: #5d8a3a; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
#lab button.alt { background: #e4dcc6; color: #2c4020; }
#lab textarea { width: 100%; box-sizing: border-box; height: 120px; font: 11px ui-monospace, monospace; border: 1px solid #c9c0a8; border-radius: 6px; }
@media (max-width: 700px) { #lab { top: auto; width: 100%; height: 50%; box-shadow: 0 -4px 18px #0003; } }
`;

export function start(api) {
  const { cv, ctx, makeTurtle, use, resetFeet, updateFeet, drawTurtle, sizeFor, stageOf, morphInfo, personality, MORPHS, TRAITS, KEEP } = api;
  document.head.insertAdjacentHTML('beforeend', `<style>${CSS}</style>`);
  document.body.classList.add('lab');
  document.title = 'Turtle lab';

  const t = makeTurtle({ name: 'Lab Turtle', growth: 0.5, x: 0, y: 0, a: 0, tint: { shell: 0, skin: 0, light: 0 } });
  // the stage sits over the game canvas so the game's own tap handlers never fire
  const stage = document.createElement('div'); stage.id = 'lab-stage'; document.body.append(stage);
  const panel = document.createElement('div'); panel.id = 'lab'; document.body.append(panel);

  // ---------- controls ----------
  // each control: [key, label, type, opts]. Values live in `v`; apply() pushes them onto the turtle.
  const v = {};
  const range = (k, label, min, max, step, val, fmt = x => x) => ({ k, label, type: 'range', min, max, step, val, fmt });
  const pick = (k, label, options, val) => ({ k, label, type: 'select', options, val });
  const check = (k, label, val) => ({ k, label, type: 'check', val });
  const pct = x => Math.round(x * 100) + '%';
  const deg = x => Math.round(x) + '°';
  const sections = [
    ['Identity', true, [
      { k: 'name', label: 'Name', type: 'text', val: t.name },
      range('growth', 'Growth', 0, 1, 0.005, 0.5, pct),
      check('sizeOn', 'Override size', false),
      range('size', 'Size (S)', 6, 80, 0.5, 29, x => (+x).toFixed(1)),
    ]],
    ['Colour', true, [
      pick('color', 'Morph colour', MORPHS.map(m => [m[0], `${m[0]}${m[2] ? ' — ' + m[2] : ''} (${(m[1] * 100).toFixed(1)}%)`]), 'normal'),
      pick('pattern', 'Pattern', [['', 'none'], ['spots', 'spots'], ['stripes', 'stripes']], ''),
      check('spikes', 'Spikes', false),
      range('shell', 'Shell hue', -180, 180, 1, 0, deg),
      range('skin', 'Skin hue', -180, 180, 1, 0, deg),
      range('light', 'Lightness', -0.5, 0.5, 0.01, 0, x => (+x).toFixed(2)),
    ]],
    ['Body', true, [
      range('chub', 'Chubby', 0, 1, 0.01, 0, pct),
      range('mud', 'Mud', 0, 1, 0.01, 0, pct),
    ]],
    ['Pose & motion', true, [
      range('angle', 'Heading', -180, 180, 1, 0, deg),
      range('speed', 'Walk speed', 0, 80, 1, 0),
      range('turn', 'Turn rate', -2, 2, 0.05, 0, x => (+x).toFixed(2)),
      range('headExt', 'Head out', 0, 1, 0.01, 1, pct),
      pick('eyes', 'Eyes', [['auto', 'blinking'], ['open', 'open'], ['closed', 'closed'], ['happy', 'happy ^^']], 'auto'),
      range('mouth', 'Mouth open', 0, 1, 0.01, 0, pct),
      check('look', 'Look at mouse', false),
    ]],
    ['Stats (sick tint, shivers, need bubble)', false, [
      ...['health', 'hunger', 'thirst', 'happy', 'energy', 'warm', 'social'].map(k => range('st_' + k, k[0].toUpperCase() + k.slice(1), 0, 100, 1, 100)),
    ]],
    ['Personality', false, TRAITS.map(tr => range('tr_' + tr.k, `${tr.icon} ${tr.label}`, 0, 1, 0.01, 0.5, x => Math.round(x * 4) + 1 + '/5'))],
    ['View', true, [
      range('zoom', 'Zoom', 0.5, 8, 0.05, 3, x => (+x).toFixed(2) + '×'),
      pick('bg', 'Background', [['sand', 'sand'], ['grass', 'grass'], ['night', 'night'], ['white', 'white'], ['check', 'checker']], 'sand'),
      check('grid', 'Ground dots', true),
    ]],
  ];

  panel.innerHTML = `<h1>🐢 Turtle lab</h1><div class="sub">Debug builder · uses the real renderer · your yard isn't touched</div>
    <div class="sum" id="lab-sum"></div>
    <div class="btns"><button id="lab-rand">🎲 Random</button><button class="alt" id="lab-reset">Reset</button><button class="alt" id="lab-feet">Reset feet</button><button id="lab-wild">🌲 Add to wild</button></div>`;
  const inputs = {};
  for (const [title, open, ctrls] of sections) {
    const d = document.createElement('details'); d.open = open;
    d.innerHTML = `<summary>${title}</summary>`;
    for (const c of ctrls) {
      const row = document.createElement('label'); row.className = 'row' + (c.type === 'range' ? '' : ' wide');
      row.append(Object.assign(document.createElement('span'), { textContent: c.label }));
      let el;
      if (c.type === 'range') {
        el = Object.assign(document.createElement('input'), { type: 'range', min: c.min, max: c.max, step: c.step, value: c.val });
        const out = document.createElement('output');
        row.append(el, out);
        el._out = out;
      } else if (c.type === 'select') {
        el = document.createElement('select');
        for (const [val, text] of c.options) el.append(new Option(text, val));
        el.value = c.val; row.append(el);
      } else if (c.type === 'check') {
        el = Object.assign(document.createElement('input'), { type: 'checkbox', checked: c.val });
        el.style.justifySelf = 'start'; row.append(el);
      } else {
        el = Object.assign(document.createElement('input'), { type: 'text', value: c.val }); row.append(el);
      }
      el._c = c; inputs[c.k] = el;
      el.addEventListener('input', () => { read(el); apply(); });
      d.append(row);
    }
    panel.append(d);
  }
  panel.insertAdjacentHTML('beforeend', `<details><summary>Export</summary>
    <div class="sub">The turtle's saved fields (same shape as a yard save).</div>
    <textarea id="lab-json" readonly></textarea>
    <div class="btns"><button id="lab-copy">Copy JSON</button></div></details>`);

  function read(el) {
    const c = el._c;
    v[c.k] = c.type === 'range' ? +el.value : c.type === 'check' ? el.checked : el.value;
    if (el._out) el._out.textContent = c.fmt(v[c.k]);
  }
  function set(k, val) {
    const el = inputs[k];
    if (el._c.type === 'check') el.checked = val; else el.value = val;
    read(el);
  }
  Object.values(inputs).forEach(read);

  let lastSize = null;
  function apply() {
    t.name = v.name || 'Lab Turtle';
    t.growth = v.growth;
    t.S = v.sizeOn ? v.size : sizeFor(v.growth);
    if (!v.sizeOn) set('size', t.S.toFixed(1));
    inputs.size.disabled = !v.sizeOn;
    t.tint = { shell: v.shell, skin: v.skin, light: v.light };
    t.morph = { color: v.color, pattern: v.pattern, spikes: v.spikes };
    t.chub = v.chub; t.mud = v.mud;
    t.headExt = v.headExt;
    for (const k of Object.keys(t.st)) if ('st_' + k in v) t.st[k] = v['st_' + k];
    for (const tr of TRAITS) t.traits[tr.k] = v['tr_' + tr.k];
    if (v.speed === 0 && v.turn === 0) t.a = v.angle * Math.PI / 180;
    use(t);
    if (t.S !== lastSize) { resetFeet(); lastSize = t.S; } // a new size: snap the feet under the new body
    summary();
  }
  function summary() {
    const mi = morphInfo(t), rar = ['Common', 'Uncommon', 'Rare', 'Super rare', 'Legendary'][mi.rarity];
    document.getElementById('lab-sum').innerHTML = `<b>${esc(t.name)}</b><br>${stageOf(t.growth)} · S = ${t.S.toFixed(1)}<br>
      ${rar}${mi.label ? ' · ' + esc(mi.label) : ''}<br>${personality(t.traits)}`;
    const keep = Object.fromEntries(KEEP.filter(k => k in t).map(k => [k, t[k]]));
    keep.x = Math.round(t.x); keep.y = Math.round(t.y); keep.a = +t.a.toFixed(3);
    document.getElementById('lab-json').value = JSON.stringify(keep, null, 1);
  }
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  const defaults = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el._c.val]));
  document.getElementById('lab-reset').onclick = () => { for (const k in defaults) set(k, defaults[k]); t.x = t.y = 0; apply(); resetFeet(); };
  document.getElementById('lab-feet').onclick = () => resetFeet();
  document.getElementById('lab-wild').onclick = e => { // a copy goes into your game's wild pool (an open game tab picks it up too)
    const ok = api.addToWild(t);
    e.target.textContent = ok ? `Added ${t.name} ✓` : 'No saved game'; setTimeout(() => e.target.textContent = '🌲 Add to wild', 1500);
  };
  document.getElementById('lab-rand').onclick = () => {
    const nt = makeTurtle({ morph: api.rollMorph(), growth: Math.random() });
    set('name', nt.name); set('growth', nt.growth.toFixed(3));
    set('color', nt.morph.color); set('pattern', nt.morph.pattern); set('spikes', nt.morph.spikes);
    set('shell', Math.round(nt.tint.shell)); set('skin', Math.round(nt.tint.skin)); set('light', nt.tint.light.toFixed(2));
    set('chub', (Math.random() < 0.3 ? Math.random() : 0).toFixed(2));
    for (const tr of TRAITS) set('tr_' + tr.k, nt.traits[tr.k].toFixed(2));
    apply();
  };
  document.getElementById('lab-copy').onclick = e => {
    navigator.clipboard?.writeText(document.getElementById('lab-json').value).then(() => { e.target.textContent = 'Copied!'; setTimeout(() => e.target.textContent = 'Copy JSON', 1200); });
  };

  // ---------- canvas ----------
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2.5); W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  }
  addEventListener('resize', resize); resize();
  const center = () => {
    const narrow = W <= 700, pw = narrow ? 0 : panel.offsetWidth, ph = narrow ? panel.offsetHeight : 0;
    return { x: (W - pw) / 2, y: (H - ph) / 2 };
  };
  let mouse = null;
  stage.addEventListener('pointermove', e => { mouse = { x: e.clientX, y: e.clientY }; });
  stage.addEventListener('pointerleave', () => { mouse = null; });
  stage.addEventListener('wheel', e => { e.preventDefault(); set('zoom', Math.min(8, Math.max(0.5, v.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))).toFixed(2)); }, { passive: false });

  let checker = null;
  function bgFill() {
    const BG = { sand: '#e8d6a8', grass: '#6f9e45', night: '#1d2a3a', white: '#ffffff' };
    if (v.bg === 'check') {
      if (!checker) { const p = document.createElement('canvas'); p.width = p.height = 32; const g = p.getContext('2d'); g.fillStyle = '#ddd'; g.fillRect(0, 0, 32, 32); g.fillStyle = '#bbb'; g.fillRect(0, 0, 16, 16); g.fillRect(16, 16, 16, 16); checker = ctx.createPattern(p, 'repeat'); }
      ctx.fillStyle = checker;
    } else ctx.fillStyle = BG[v.bg];
    ctx.fillRect(0, 0, W, H);
  }

  let last = performance.now(), blinkT = 2;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const time = now / 1000;
    use(t);
    // motion: walking moves the turtle through the world while the camera follows it
    t.a += v.turn * dt;
    t.v = v.speed;
    t.x += Math.cos(t.a) * t.v * dt; t.y += Math.sin(t.a) * t.v * dt;
    if (v.speed || v.turn) set('angle', Math.round(((t.a * 180 / Math.PI + 540) % 360) - 180));
    t.tailT += dt * (t.v > 3 ? 8 : 1.5);
    // eyes and mouth
    t.blink = 0; t.petT = 0;
    if (v.eyes === 'auto') { blinkT -= dt; if (blinkT < 0) { t.blink = 0.15 + blinkT; if (blinkT < -0.15) blinkT = 2 + Math.random() * 3; } }
    else if (v.eyes === 'closed') t.blink = 1;
    else if (v.eyes === 'happy') t.petT = 0.3;
    t.blink = Math.max(0, t.blink);
    t.yawn = v.mouth * 0.7;
    updateFeet(dt);

    const z = v.zoom, c = center();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    bgFill();
    const ox = c.x - t.x * z, oy = c.y - t.y * z;
    t.lookAt = v.look && mouse ? { x: (mouse.x - ox) / z, y: (mouse.y - oy) / z } : null;
    ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * ox, DPR * oy);
    if (v.grid) { // fixed ground dots, so walking shows
      const gap = 40, x0 = Math.floor((-ox / z) / gap) * gap, y0 = Math.floor((-oy / z) / gap) * gap;
      ctx.fillStyle = v.bg === 'night' ? '#ffffff22' : '#0000001c';
      for (let x = x0; x < x0 + W / z + gap; x += gap) for (let y = y0; y < y0 + H / z + gap; y += gap) { ctx.beginPath(); ctx.arc(x, y, 1.6 / z * 2, 0, 7); ctx.fill(); }
    }
    drawTurtle(time);
    requestAnimationFrame(frame);
  }
  apply(); resetFeet();
  requestAnimationFrame(frame);
}
