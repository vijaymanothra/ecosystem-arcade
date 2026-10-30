(() => {
  'use strict';

  // ================================================================ config + content
  const CFG = Object.assign({
    title: 'EVERNORTH CITY',
    tagline: '',
    turns: 10,
    newsEvery: 3,
    questionTime: 15,
    factSec: 5,
    levelPop: [1000, 1500, 2500],
    speedBonusMax: 500,
    newsReward: 1500,
    newsPenalty: -1000,
    autoPickSec: 25,
    idleAbandonSec: 120,
    resultTimeoutSec: 60,
    leaderboardSize: 10,
    leaderboardScope: 'today',
    sound: true,
    ranks: [[0, 'Hamlet', '🏡'], [4000, 'Village', '🏘️'], [8000, 'Town', '🏙️'], [13000, 'City', '🌆'], [19000, 'Metropolis', '🌃']],
  }, window.EC_CONFIG || {});

  const BUSINESSES = window.QUIZ_BUSINESSES || [];
  const BIZ = Object.fromEntries(BUSINESSES.map((b) => [b.id, b]));
  const QUESTIONS = (window.QUIZ_QUESTIONS || []).filter((q) =>
    q && BIZ[q.business] && q.q && Array.isArray(q.options) && q.options.length === 4 &&
    Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4);
  const PLOTS = window.EC_PLOTS || [];
  const STYLES = window.EC_STYLES || {};
  const ROLES = window.EC_ROLES || {};
  const EVENTS = (window.EC_EVENTS || []).filter((e) => e && Array.isArray(e.needs) && e.needs.some((id) => BIZ[id]));
  const CITY_BIZ = BUSINESSES.filter((b) => PLOTS.includes(b.id));
  const SHAPES = ['▲', '◆', '●', '■'];
  const LB_KEY = 'evernorthCity.leaderboard.v1';
  const NAME_MAX = 10;

  // ================================================================ helpers
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const NS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs, cls) => {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (cls) e.setAttribute('class', cls);
    return e;
  };
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const restartAnim = (node, cls) => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };
  function shade(hex, amt) {
    const n = parseInt(hex.replace('#', ''), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = amt < 0 ? 0 : 255;
    const p = Math.abs(amt);
    r = Math.round((t - r) * p + r);
    g = Math.round((t - g) * p + g);
    b = Math.round((t - b) * p + b);
    return `rgb(${r},${g},${b})`;
  }

  // ================================================================ sound (synthesised, no assets)
  const Sound = (() => {
    let ctx = null;
    let enabled = CFG.sound;
    function unlock() {
      if (!ctx) {
        try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; }
      }
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(freq, dur, type = 'sine', when = 0, vol = 0.2, slideTo) {
      if (!enabled) return;
      const c = unlock();
      if (!c) return;
      const t = c.currentTime + when;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    return {
      unlock,
      toggle() { enabled = !enabled; return enabled; },
      tap() { tone(660, 0.06, 'square', 0, 0.06); },
      deal() { [0, 1, 2].forEach((i) => tone(500 + i * 120, 0.08, 'triangle', i * 0.09, 0.1, 900 + i * 120)); },
      select() { tone(523, 0.1, 'triangle', 0, 0.14); tone(784, 0.14, 'triangle', 0.08, 0.14); },
      tick() { tone(1200, 0.05, 'square', 0, 0.06); },
      approved() { tone(110, 0.2, 'triangle', 0, 0.3, 60); [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.12 + i * 0.07, 0.2)); },
      denied() { tone(110, 0.2, 'triangle', 0, 0.3, 60); tone(220, 0.45, 'sawtooth', 0.1, 0.13, 90); },
      build() { for (let i = 0; i < 6; i++) tone(180 + Math.random() * 80, 0.05, 'square', i * 0.13, 0.12); },
      rise() { tone(200, 0.7, 'sawtooth', 0, 0.05, 900); [784, 988, 1175].forEach((f, i) => tone(f, 0.18, 'triangle', 0.55 + i * 0.08, 0.14)); },
      news() { [659, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'square', i * 0.12, 0.08)); },
      good() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, 'triangle', i * 0.08, 0.18)); },
      bad() { [392, 330, 262].forEach((f, i) => tone(f, 0.25, 'triangle', i * 0.15, 0.16)); },
      boom() { tone(80 + Math.random() * 40, 0.5, 'sawtooth', 0, 0.12, 40); tone(1400 + Math.random() * 600, 0.3, 'sine', 0.05, 0.05, 600); },
      fanfare() { [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.22, 'triangle', i * 0.12, 0.2)); },
    };
  })();

  // ================================================================ confetti + fireworks
  const FX = (() => {
    const cv = $('#fx');
    const cx = cv.getContext('2d');
    const colors = ['#ffd23f', '#ff4fa3', '#3ee6ff', '#2ee59d', '#ff8a3d', '#a78bfa'];
    let parts = [];
    let running = false;
    function resize() { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; }
    addEventListener('resize', resize);
    resize();
    function start() { if (!running) { running = true; requestAnimationFrame(loop); } }
    function burst(n = 120, x = innerWidth / 2, y = innerHeight / 3) {
      for (let i = 0; i < n; i++) {
        parts.push({ k: 'c', x, y, vx: (Math.random() - 0.5) * 22, vy: -Math.random() * 18 - 4, g: 0.45, s: 8 + Math.random() * 10, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[i % colors.length], life: 1 });
      }
      start();
    }
    function firework(x, y) {
      const c1 = pick(colors);
      const c2 = pick(colors);
      const n = 70;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const sp = 5 + Math.random() * 5;
        parts.push({ k: 's', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.08, s: 3 + Math.random() * 2, c: i % 2 ? c1 : c2, life: 1, decay: 0.012 + Math.random() * 0.01 });
      }
      start();
    }
    function loop() {
      cx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      cx.clearRect(0, 0, innerWidth, innerHeight);
      parts = parts.filter((p) => p.y < innerHeight + 40 && p.life > 0);
      for (const p of parts) {
        p.vy += p.g;
        p.vx *= p.k === 's' ? 0.975 : 0.985;
        p.vy *= p.k === 's' ? 0.975 : 1;
        p.x += p.vx;
        p.y += p.vy;
        if (p.k === 's') {
          p.life -= p.decay;
          cx.globalAlpha = Math.max(0, p.life);
          cx.fillStyle = p.c;
          cx.beginPath();
          cx.arc(p.x, p.y, p.s, 0, Math.PI * 2);
          cx.fill();
          cx.globalAlpha = 1;
        } else {
          p.r += p.vr;
          cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); cx.restore();
        }
      }
      if (parts.length) requestAnimationFrame(loop); else running = false;
    }
    return { burst, firework };
  })();

  // ================================================================ leaderboard
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const loadLB = () => window.Leaderboard.load(LB_KEY);
  function boardEntries() {
    const all = loadLB();
    const list = CFG.leaderboardScope === 'today' ? all.filter((e) => e.day === today()) : all;
    return list.sort((a, b) => b.score - a.score).slice(0, CFG.leaderboardSize);
  }
  function isHighScore(score) {
    const b = boardEntries();
    return score > 0 && (b.length < CFG.leaderboardSize || score > b[b.length - 1].score);
  }
  function addScore(name, score, built) {
    const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, score, built, day: today() };
    return window.Leaderboard.add(LB_KEY, entry);
  }
  function renderLeaderboard(highlightId) {
    $('#lbTitle').textContent = CFG.leaderboardScope === 'today' ? "🏆 Today's Top Mayors" : '🏆 Top Mayors';
    const ol = $('#lb');
    ol.replaceChildren();
    // staff paused this leaderboard from the admin page: scores are kept, just not shown
    if (window.Leaderboard.isHidden(LB_KEY)) { ol.append(el('li', 'empty', '🔒 Leaderboard paused by staff')); return; }
    const lb = boardEntries();
    if (!lb.length) { ol.append(el('li', 'empty', 'No mayors yet — the city awaits you!')); return; }
    lb.forEach((e, i) => {
      const li = el('li', e.id === highlightId ? 'new' : '');
      li.append(
        el('span', 'rank', i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`),
        el('span', 'name', `Mayor ${e.name}`),
        el('span', 'bl', `🏢 ${e.built}/${CITY_BIZ.length}`),
        el('span', 'pts', `👥 ${e.score.toLocaleString()}`),
      );
      ol.append(li);
    });
  }

  // ================================================================ isometric city renderer
  const TW = 128;
  const TH = 64;
  const MW = 13; // tiles across (gx)
  const MH = 10; // tiles deep (gy)
  const P = (gx, gy, z = 0) => [(gx - gy) * (TW / 2), (gx + gy) * (TH / 2) - z];
  const pts = (arr) => arr.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const isRoad = (gx, gy) => gx % 3 === 0 || gy % 3 === 0;

  const RECIPES = {
    tower: [
      { p: [[0.35, 0.35, 1.3, 1.3, 0, 80]] },
      { p: [[0.3, 0.3, 1.4, 1.4, 0, 140]] },
      { p: [[0.25, 0.25, 1.5, 1.5, 0, 120], [0.45, 0.45, 1.1, 1.1, 120, 95], [0.9, 0.9, 0.2, 0.2, 215, 60, 'gold']] },
    ],
    warehouse: [
      { p: [[0.2, 0.45, 1.6, 1.15, 0, 40]] },
      { p: [[0.15, 0.15, 0.9, 0.8, 0, 75], [0.2, 0.95, 1.6, 0.9, 0, 40]], d: [['🚚', 1.85, 1.9]] },
      { p: [[0.15, 0.15, 0.9, 0.8, 0, 110], [1.15, 0.15, 0.7, 0.7, 0, 60], [0.2, 0.95, 1.6, 0.9, 0, 45]], d: [['🚚', 1.85, 1.9], ['🚚', 0.15, 1.95]] },
    ],
    lab: [
      { p: [[0.4, 0.4, 1.2, 1.2, 0, 55]] },
      { p: [[0.3, 0.3, 1.4, 1.4, 0, 75], [0.65, 0.65, 0.7, 0.7, 75, 35, 'glass']] },
      { p: [[0.25, 0.25, 1.5, 1.5, 0, 95], [0.55, 0.55, 0.9, 0.9, 95, 45, 'glass'], [0.85, 0.85, 0.3, 0.3, 140, 35]] },
    ],
    office: [
      { p: [[0.45, 0.35, 1.1, 1.3, 0, 70]] },
      { p: [[0.4, 0.3, 1.2, 1.4, 0, 120]] },
      { p: [[0.3, 0.3, 1.4, 1.4, 0, 170], [0.6, 0.6, 0.8, 0.8, 170, 25, 'glass']] },
    ],
    antenna: [
      { p: [[0.4, 0.4, 1.2, 1.2, 0, 70]] },
      { p: [[0.35, 0.35, 1.3, 1.3, 0, 125], [0.93, 0.93, 0.14, 0.14, 125, 55, 'gold']] },
      { p: [[0.3, 0.3, 1.4, 1.4, 0, 165], [0.93, 0.93, 0.14, 0.14, 165, 85, 'gold']], d: [['📡', 0.55, 0.55, 185]] },
    ],
    garden: [
      { p: [[0.55, 0.55, 0.95, 0.95, 0, 42]], d: [['🌳', 0.3, 0.35], ['🌷', 1.75, 1.7]] },
      { p: [[0.35, 0.45, 1.3, 1.05, 0, 55], [0.35, 0.45, 0.6, 1.05, 55, 28]], d: [['🌳', 0.25, 0.25], ['🌳', 1.75, 0.3], ['🌷', 1.75, 1.75], ['🌷', 0.3, 1.8]] },
      { p: [[0.3, 0.3, 1.4, 1.4, 0, 70], [0.5, 0.5, 1.0, 1.0, 70, 35, 'glass']], d: [['🌳', 0.15, 0.15], ['🌳', 1.85, 0.2], ['🌳', 0.2, 1.85], ['🌷', 1.8, 1.8], ['⛲', 1.9, 1.0]] },
    ],
  };

  const city = {
    svg: $('#city'),
    layers: {},
    slots: {}, // id -> { id, ox, oy, lotEl, group, labelEl, level }
  };

  function buildCity() {
    const svg = city.svg;
    svg.replaceChildren();
    const minX = P(0, MH)[0] - 60;
    const maxX = P(MW, 0)[0] + 60;
    const minY = -300; // room for the tallest landmark + its sign
    const maxY = P(MW, MH)[1] + 90;
    svg.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const L = (name) => { const g = sv('g', null, name); svg.append(g); city.layers[name] = g; return g; };
    const ground = L('ground');
    const cars = L('cars');
    const builds = L('builds');
    L('labels');
    L('fxl');

    // floating island edges
    const depth = 46;
    ground.append(sv('polygon', { points: pts([P(0, MH), P(MW, MH), P(MW, MH, -depth), P(0, MH, -depth)]) }, 'earth-l'));
    ground.append(sv('polygon', { points: pts([P(MW, MH), P(MW, 0), P(MW, 0, -depth), P(MW, MH, -depth)]) }, 'earth-r'));
    ground.append(sv('polygon', { points: pts([P(0, MH), P(MW, MH), P(MW, MH, -9), P(0, MH, -9)]) }, 'lip-l'));
    ground.append(sv('polygon', { points: pts([P(MW, MH), P(MW, 0), P(MW, 0, -9), P(MW, MH, -9)]) }, 'lip-r'));

    // tiles
    for (let gy = 0; gy < MH; gy++) {
      for (let gx = 0; gx < MW; gx++) {
        const cls = isRoad(gx, gy) ? 'road-tile' : (gx + gy) % 2 ? 'grass-a' : 'grass-b';
        ground.append(sv('polygon', { points: pts([P(gx, gy), P(gx + 1, gy), P(gx + 1, gy + 1), P(gx, gy + 1)]) }, cls));
      }
    }
    // lane markings
    const lanes = [];
    for (let gy = 0; gy < MH; gy += 3) lanes.push([P(0, gy + 0.5), P(MW, gy + 0.5)]);
    for (let gx = 0; gx < MW; gx += 3) lanes.push([P(gx + 0.5, 0), P(gx + 0.5, MH)]);
    for (const [a, b] of lanes) ground.append(sv('path', { d: `M${a[0]} ${a[1]} L${b[0]} ${b[1]}` }, 'lane'));

    // lots, in depth order
    const slots = PLOTS.map((id, k) => ({ id, ox: 1 + 3 * (k % 4), oy: 1 + 3 * Math.floor(k / 4) }))
      .sort((a, b) => (a.ox + a.oy) - (b.ox + b.oy));
    city.slots = {};
    for (const s of slots) {
      const lot = sv('polygon', { points: pts([P(s.ox, s.oy), P(s.ox + 2, s.oy), P(s.ox + 2, s.oy + 2), P(s.ox, s.oy + 2)]) }, 'lot');
      ground.append(lot);
      s.lotEl = lot;
      s.group = sv('g', null, 'slot');
      builds.append(s.group);
      s.level = 0;
      city.slots[s.id] = s;
      if (s.id === 'park' || s.id === 'plaza') drawPark(s);
      else if (BIZ[s.id]) drawEmptyLot(s);
    }
    // labels on top
    for (const s of slots) if (BIZ[s.id]) drawLabel(s);

    // traffic
    const vehicles = ['🚗', '🚕', '🚙', '🚌', '🚑', '🚚', '🚗', '🚕'];
    shuffle(lanes).slice(0, 7).forEach(([a, b], i) => {
      const car = sv('text', { x: 0, y: -8, 'font-size': 30 }, 'emoji car');
      car.textContent = vehicles[i % vehicles.length];
      const am = sv('animateMotion', {
        dur: `${12 + Math.random() * 10}s`, repeatCount: 'indefinite', path: `M${a[0]} ${a[1]} L${b[0]} ${b[1]}`,
        keyPoints: '0;1;0', keyTimes: '0;0.5;1', calcMode: 'linear', begin: `${-Math.random() * 20}s`,
      });
      car.append(am);
      cars.append(car);
    });
  }

  function emoji(char, x, y, size, cls) {
    const t = sv('text', { x, y, 'font-size': size }, `emoji ${cls || ''}`);
    t.textContent = char;
    return t;
  }

  function drawPark(s) {
    s.lotEl.style.fill = '#4fae4f';
    const g = s.group;
    const spots = s.id === 'plaza'
      ? [['⛲', 1, 1, 64], ['🌸', 0.3, 0.3, 34], ['🌸', 1.7, 1.7, 34], ['🌳', 1.7, 0.3, 40], ['🌳', 0.3, 1.7, 40]]
      : [['🌳', 0.4, 0.4, 46], ['🌲', 1.2, 0.4, 44], ['🌳', 0.5, 1.3, 46], ['🌲', 1.5, 1.2, 44], ['🌳', 1.6, 1.8, 40], ['🎠', 1.0, 0.9, 36]];
    for (const [ch, lx, ly, size] of spots.sort((a, b) => (a[1] + a[2]) - (b[1] + b[2]))) {
      const [x, y] = P(s.ox + lx, s.oy + ly);
      g.append(emoji(ch, x, y - size * 0.4, size));
    }
  }

  function drawEmptyLot(s) {
    s.group.replaceChildren();
    const [x, y] = P(s.ox + 1, s.oy + 1);
    s.group.append(emoji(BIZ[s.id].icon, x, y, 54, 'ghost-icon'));
  }

  function drawLabel(s) {
    const b = BIZ[s.id];
    const [x, y] = P(s.ox + 2, s.oy + 2);
    const g = sv('g', null, 'lot-label');
    g.style.setProperty('--bc', b.color);
    const text = sv('text', { x, y: y + 22, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    text.textContent = b.short || b.name;
    const rect = sv('rect', { rx: 13, ry: 13 });
    g.append(rect, text);
    city.layers.labels.append(g);
    const w = (b.short || b.name).length * 9.6 + 26;
    rect.setAttribute('x', x - w / 2);
    rect.setAttribute('y', y + 9);
    rect.setAttribute('width', w);
    rect.setAttribute('height', 26);
    s.labelEl = g;
  }

  function prism(g, ox, oy, spec, color) {
    const [lx, ly, w, d, z0, h, mat] = spec;
    const x0 = ox + lx, y0 = oy + ly, x1 = x0 + w, y1 = y0 + d;
    const zt = z0 + h;
    let top, left, right;
    if (mat === 'glass') { top = '#d6f1ff'; left = '#8fd0f5'; right = '#5fa9d6'; }
    else if (mat === 'gold') { top = '#ffe680'; left = '#ffc83d'; right = '#d99a00'; }
    else { top = shade(color, 0.3); left = color; right = shade(color, -0.28); }
    g.append(sv('polygon', { points: pts([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, zt), P(x0, y1, zt)]), fill: left }));
    g.append(sv('polygon', { points: pts([P(x1, y1, z0), P(x1, y0, z0), P(x1, y0, zt), P(x1, y1, zt)]), fill: right }));
    g.append(sv('polygon', { points: pts([P(x0, y0, zt), P(x1, y0, zt), P(x1, y1, zt), P(x0, y1, zt)]), fill: top }));
    if (mat) return zt;
    // windows on both visible faces
    const rows = Math.floor((h - 12) / 22);
    const faces = [
      { a: [x0, y1], b: [x1, y1], len: w },
      { a: [x1, y1], b: [x1, y0], len: d },
    ];
    for (const f of faces) {
      const cols = Math.max(1, Math.round(f.len * 2.4));
      for (let r = 0; r < rows; r++) {
        const zb = z0 + 10 + r * 22;
        for (let c = 0; c < cols; c++) {
          const u0 = (c + 0.22) / cols;
          const u1 = (c + 0.78) / cols;
          const at = (u, z) => P(f.a[0] + (f.b[0] - f.a[0]) * u, f.a[1] + (f.b[1] - f.a[1]) * u, z);
          const win = sv('polygon', { points: pts([at(u0, zb), at(u1, zb), at(u1, zb + 12), at(u0, zb + 12)]) }, `win${Math.random() < 0.28 ? ' off' : ''}`);
          g.append(win);
        }
      }
    }
    return zt;
  }

  function drawBuilding(s, level, animate) {
    const b = BIZ[s.id];
    const recipe = (RECIPES[STYLES[s.id]] || RECIPES.office)[level - 1];
    s.group.replaceChildren();
    const g = sv('g', null, `bld${animate ? ' rise' : ''}`);
    const items = [];
    for (const p of recipe.p) items.push({ k: 'p', spec: p, key: p[0] + p[1] + (p[2] + p[3]) / 2 + p[4] * 0.001 });
    for (const d of recipe.d || []) items.push({ k: 'd', spec: d, key: d[1] + d[2] + (d[3] ? 10 : 0) });
    items.sort((a, c) => a.key - c.key);
    let top = null;
    for (const it of items) {
      if (it.k === 'p') {
        const zt = prism(g, s.ox, s.oy, it.spec, b.color);
        const [lx, ly, w, d, z0, h] = it.spec;
        if (!top || z0 + h >= top.z) top = { x: s.ox + lx + w / 2, y: s.oy + ly + d / 2, z: zt };
      } else {
        const [ch, lx, ly, z] = it.spec;
        const [x, y] = P(s.ox + lx, s.oy + ly, z || 0);
        g.append(emoji(ch, x, y - 16, ch === '🚚' ? 34 : 40));
      }
    }
    if (top) {
      const [x, y] = P(top.x, top.y, top.z + 26);
      g.append(emoji(b.icon, x, y, level === 3 ? 50 : 42, 'sign'));
      if (level === 3) g.append(emoji('⭐', x + 30, y - 22, 24, 'sign'));
    }
    s.group.append(g);
    s.level = level;
    if (s.labelEl) s.labelEl.classList.add('built');
    return g;
  }

  function resetCity() {
    for (const s of Object.values(city.slots)) {
      if (!BIZ[s.id]) continue;
      s.level = 0;
      drawEmptyLot(s);
      if (s.labelEl) s.labelEl.classList.remove('built');
      s.lotEl.classList.remove('target');
    }
    city.layers.fxl.replaceChildren();
  }

  function screenPos(s) {
    const r = s.lotEl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top };
  }

  // ================================================================ sky
  function setSky(mode) {
    const st = $('#stage');
    st.classList.remove('day', 'sunset', 'night');
    st.classList.add(mode);
  }
  function buildClouds() {
    const c = $('#clouds');
    for (let i = 0; i < 4; i++) {
      const d = el('div', 'cloud', '☁️');
      d.style.top = `${3 + i * 9 + Math.random() * 5}%`;
      d.style.animationDuration = `${60 + Math.random() * 50}s`;
      d.style.animationDelay = `${-Math.random() * 100}s`;
      d.style.fontSize = `${10 + Math.random() * 8}vmin`;
      c.append(d);
    }
  }

  // ================================================================ state
  const screens = ['attract', 'play', 'results', 'entry'];
  const G = {
    screen: 'attract',
    runId: 0,
    day: 1,
    pop: 0,
    used: new Set(),
    usedEvents: new Set(),
    permits: 0,
    approved: 0,
    newsGood: 0,
    newsTotal: 0,
    answerTimes: [],
    lastTouch: 0,
    idleTimer: 0,
    attractTimer: 0,
    pickResolve: null,
    autoTimer: 0,
    name: '',
  };

  function show(name) {
    for (const s of screens) $('#' + s).hidden = s !== name;
    G.screen = name;
    const st = $('#stage');
    st.classList.toggle('attract', name === 'attract');
    st.classList.toggle('playing', name === 'play');
    st.classList.toggle('finale', name === 'results' || name === 'entry');
  }

  // ================================================================ attract
  function goAttract(highlightId) {
    // back from a game whose score saved itself: highlight that score on the board (once)
    if (!highlightId && G.savedId) highlightId = G.savedId;
    G.savedId = null;
    G.runId++;
    clearInterval(G.autoTimer);
    clearTimeout(G.idleTimer);
    $('#permit').hidden = true;
    $('#news').hidden = true;
    renderLeaderboard(highlightId);
    show('attract');
    // showcase a finished city
    for (const s of Object.values(city.slots)) if (BIZ[s.id]) drawBuilding(s, 2 + Math.floor(Math.random() * 2), false);
    const cycle = ['day', 'sunset', 'night'];
    let k = 0;
    setSky(cycle[0]);
    clearInterval(G.attractTimer);
    G.attractTimer = setInterval(() => { k = (k + 1) % cycle.length; setSky(cycle[k]); }, 7000);
  }

  // ================================================================ game flow
  async function startGame() {
    Sound.unlock();
    tryFullscreen();
    clearInterval(G.attractTimer);
    G.runId++;
    const id = G.runId;
    Object.assign(G, { day: 1, pop: 0, permits: 0, approved: 0, newsGood: 0, newsTotal: 0, answerTimes: [], lastTouch: performance.now() });
    G.used = new Set();
    G.usedEvents = new Set();
    resetCity();
    setSky('day');
    show('play');
    renderHud();
    $('#hand').replaceChildren();
    prompt('🏗️ Welcome, Mayor!', 'Build our businesses to grow Evernorth City');
    Sound.fanfare();
    await wait(2200);
    if (id !== G.runId) return;
    runDays(id);
  }

  async function runDays(id) {
    while (G.day <= CFG.turns) {
      if (id !== G.runId) return;
      setSky(G.day > CFG.turns * 0.7 ? 'sunset' : 'day');
      renderHud();
      const bizId = await chooseBlueprint();
      if (id !== G.runId || !bizId) return;
      const s = city.slots[bizId];
      const level = s.level + 1;
      s.lotEl.classList.add('target');
      const arrow = placeArrow(s);
      await wait(700);
      if (id !== G.runId) return;
      const res = await permit(bizId, level);
      if (id !== G.runId) return;
      s.lotEl.classList.remove('target');
      arrow.remove();
      if (res.ok) await construct(s, level, res.gain);
      if (id !== G.runId) return;
      if (G.day % CFG.newsEvery === 0 && G.day < CFG.turns) {
        await news();
        if (id !== G.runId) return;
      }
      G.day++;
    }
    finale(id);
  }

  function prompt(text, sub) {
    const p = $('#prompt');
    p.replaceChildren(text);
    if (sub) p.append(el('small', null, sub));
    restartAnim(p, 'pop');
  }

  function renderHud(bumpId) {
    const popEl = $('#pop');
    popEl.textContent = G.pop.toLocaleString();
    $('#day').textContent = `${Math.min(G.day, CFG.turns)} / ${CFG.turns}`;
    const cov = $('#cov');
    if (!cov.children.length) for (const b of CITY_BIZ) { const s = el('span', null, b.icon); s.dataset.id = b.id; cov.append(s); }
    for (const s of cov.children) {
      const lv = city.slots[s.dataset.id] ? city.slots[s.dataset.id].level : 0;
      s.classList.toggle('on', lv > 0);
      s.classList.toggle('l3', lv >= 3);
      if (s.dataset.id === bumpId) restartAnim(s, 'new');
    }
    const nextNews = Math.ceil(G.day / CFG.newsEvery) * CFG.newsEvery;
    const n = $('#newsIn');
    if (nextNews >= CFG.turns) { n.textContent = '—'; n.classList.remove('soon'); }
    else {
      const inDays = nextNews - G.day;
      n.textContent = inDays === 0 ? 'TONIGHT' : `in ${inDays} day${inDays > 1 ? 's' : ''}`;
      n.classList.toggle('soon', inDays === 0);
    }
  }

  function setPop(delta) {
    const from = G.pop;
    G.pop = Math.max(0, G.pop + delta);
    const node = $('#pop');
    node.classList.toggle('down', delta < 0);
    restartAnim(node, 'bump');
    animateNumber(node, from, G.pop, 900);
  }

  // ---- blueprints
  // Each day's three blueprints always give a real choice: at least one NEW business while any are
  // still unbuilt (so all of them can be built in the game's days) and at least one UPGRADE once
  // something is built. The third card is random as before, favouring new and low-level ones.
  function dealOptions() {
    const cands = CITY_BIZ.filter((b) => city.slots[b.id].level < 3 && QUESTIONS.some((q) => q.business === b.id));
    const weight = (b) => [3, 2, 1][city.slots[b.id].level] || 0;
    const takeFrom = (list) => {
      const total = list.reduce((t, b) => t + weight(b), 0);
      let r = Math.random() * total;
      let idx = 0;
      for (; idx < list.length; idx++) { r -= weight(list[idx]); if (r <= 0) break; }
      return list.splice(Math.min(idx, list.length - 1), 1)[0];
    };
    const pool = cands.slice();
    const chosen = [];
    const fresh = pool.filter((b) => city.slots[b.id].level === 0);
    const upgrades = pool.filter((b) => city.slots[b.id].level > 0);
    for (const group of [fresh, upgrades]) {
      if (!group.length) continue;
      const b = takeFrom(group);
      chosen.push(b);
      pool.splice(pool.indexOf(b), 1);
    }
    while (chosen.length < 3 && pool.length) chosen.push(takeFrom(pool));
    return shuffle(chosen);
  }

  function chooseBlueprint() {
    return new Promise((resolve) => {
      const id = G.runId;
      const opts = dealOptions();
      if (!opts.length) { resolve(null); return; }
      prompt(`📜 Day ${G.day} — pick a blueprint`, 'Which business should the city build?');
      const hand = $('#hand');
      hand.replaceChildren();
      const timer = el('div', 'hand-timer');
      timer.hidden = true;
      hand.append(timer);
      opts.forEach((b, i) => {
        const lv = city.slots[b.id].level;
        const next = lv + 1;
        const c = el('button', 'bp');
        c.type = 'button';
        c.style.setProperty('--bc', b.color);
        c.style.animationDelay = `${i * 0.1}s`;
        const top = el('div', 'bp-top');
        top.append(el('span', 'bp-icon', b.icon), el('span', 'bp-name', b.name));
        c.append(
          el('span', 'bp-stars', '★'.repeat(lv) + '☆'.repeat(3 - lv)),
          el('span', `bp-kind${lv ? ' up' : ''}`, lv ? `UPGRADE → LEVEL ${next}` : 'NEW BUILD'),
          top,
          el('span', 'bp-role', ROLES[b.id] || ''),
          el('span', 'bp-gain', `+${CFG.levelPop[next - 1].toLocaleString()} 👥`),
        );
        c.addEventListener('click', () => done(b.id));
        hand.append(c);
      });
      Sound.deal();
      const deadline = performance.now() + CFG.autoPickSec * 1000;
      clearInterval(G.autoTimer);
      G.autoTimer = setInterval(() => {
        if (id !== G.runId) { clearInterval(G.autoTimer); return; }
        if (performance.now() - G.lastTouch > CFG.idleAbandonSec * 1000) { goAttract(); return; }
        const left = Math.ceil((deadline - performance.now()) / 1000);
        timer.hidden = left > 10;
        timer.textContent = `Auto-pick in ${Math.max(0, left)}s`;
        if (left <= 0) done(pick(opts).id);
      }, 250);
      function done(bizId) {
        clearInterval(G.autoTimer);
        if (id !== G.runId) return;
        Sound.select();
        hand.replaceChildren();
        prompt(`${BIZ[bizId].icon} ${BIZ[bizId].name}`, 'Pass the permit to build!');
        resolve(bizId);
      }
    });
  }

  function placeArrow(s) {
    const [x, y] = P(s.ox + 1, s.oy + 1, 230);
    const a = emoji('⬇️', x, y, 56, 'arrow');
    city.layers.fxl.append(a);
    return a;
  }

  // ---- permit question
  function pickQuestion(bizId) {
    const pool = QUESTIONS.filter((q) => q.business === bizId);
    const fresh = pool.filter((q) => !G.used.has(q));
    const q = pick(fresh.length ? fresh : pool);
    G.used.add(q);
    return q;
  }

  function permit(bizId, level) {
    return new Promise((resolve) => {
      const id = G.runId;
      const b = BIZ[bizId];
      const q = pickQuestion(bizId);
      const card = $('#permitCard');
      card.style.setProperty('--bc', b.color);
      $('#pmIcon').textContent = b.icon;
      $('#pmLevel').textContent = level === 1 ? 'NEW BUILD' : `UPGRADE TO LEVEL ${level}`;
      $('#pmName').textContent = b.name;
      const qEl = $('#pmQ');
      qEl.textContent = q.q;
      qEl.classList.toggle('long', q.q.length > 90);
      $('#pmResult').hidden = true;
      $('#pmStamp').hidden = true;
      const opts = shuffle(q.options.map((text, k) => ({ text, correct: k === q.answer })));
      const box = $('#pmOpts');
      box.replaceChildren();
      box.hidden = false;
      const btns = opts.map((o, i) => {
        const btn = el('button', `opt o${i}`);
        btn.type = 'button';
        btn.style.animationDelay = `${0.2 + i * 0.07}s`;
        btn.append(el('span', 'sh', SHAPES[i]), el('span', null, o.text));
        btn.addEventListener('click', () => answer(i));
        box.append(btn);
        return btn;
      });
      $('#permit').hidden = false;
      restartAnim(card, 'permit');
      G.permits++;

      const fill = $('#pmTimerFill');
      const t0 = performance.now();
      let locked = false;
      let lastTick = null;
      let raf = 0;
      const loop = () => {
        if (locked || id !== G.runId) return;
        const left = Math.max(0, CFG.questionTime - (performance.now() - t0) / 1000);
        fill.style.transform = `scaleX(${left / CFG.questionTime})`;
        fill.classList.toggle('low', left <= 5);
        const sec = Math.ceil(left);
        if (left <= 5 && sec !== lastTick && sec > 0) { lastTick = sec; Sound.tick(); }
        if (left <= 0) { answer(-1); return; }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      async function answer(choice) {
        if (locked) return;
        locked = true;
        cancelAnimationFrame(raf);
        const elapsed = (performance.now() - t0) / 1000;
        const ci = opts.findIndex((o) => o.correct);
        const ok = choice === ci;
        btns.forEach((bt, k) => { bt.disabled = true; if (k !== ci && k !== choice) bt.classList.add('dim'); });
        btns[ci].classList.add('right');
        if (choice >= 0 && !ok) btns[choice].classList.add('wrong');
        const stamp = $('#pmStamp');
        stamp.className = `pm-stamp ${ok ? 'ok' : 'no'}`;
        stamp.textContent = ok ? 'APPROVED' : 'DENIED';
        stamp.hidden = false;
        let gain = 0;
        if (ok) {
          G.approved++;
          G.answerTimes.push(elapsed);
          const speed = Math.round((CFG.speedBonusMax * Math.max(0, 1 - elapsed / CFG.questionTime)) / 10) * 10;
          gain = CFG.levelPop[level - 1] + speed;
          Sound.approved();
        } else {
          Sound.denied();
        }
        await wait(800);
        if (id !== G.runId) return;
        box.hidden = true;
        $('#pmAnswer').textContent = ok ? `🏗️ Construction approved: +${gain.toLocaleString()} citizens` : `${choice < 0 ? "⏰ Time's up" : '❌ Not quite'} — answer: ${opts[ci].text}`;
        $('#pmFact').textContent = q.fact || '';
        $('#pmResult').hidden = false;
        const bar = $('#pmBar');
        bar.style.transition = 'none';
        bar.style.width = '100%';
        void bar.offsetWidth;
        bar.style.transition = `width ${CFG.factSec}s linear`;
        bar.style.width = '0%';
        const overlay = $('#permit');
        const shownAt = performance.now();
        let t = 0;
        const done = () => {
          clearTimeout(t);
          overlay.onclick = null;
          overlay.hidden = true;
          resolve({ ok, gain });
        };
        overlay.onclick = () => { if (performance.now() - shownAt > 900) { Sound.tap(); done(); } };
        t = setTimeout(done, CFG.factSec * 1000);
      }
    });
  }

  // ---- construction
  async function construct(s, level, gain) {
    const id = G.runId;
    const fxl = city.layers.fxl;
    const [cx, cy] = P(s.ox + 1, s.oy + 1, 70);
    const crane = emoji('🏗️', cx + 20, cy, 96, 'crane');
    fxl.append(crane);
    const dusts = [];
    for (let i = 0; i < 4; i++) {
      const [dx, dy] = P(s.ox + 0.3 + Math.random() * 1.4, s.oy + 0.3 + Math.random() * 1.4, 10);
      const d = emoji('💨', dx, dy, 40, 'dust');
      d.style.animationDelay = `${i * 0.18}s`;
      dusts.push(d);
      fxl.append(d);
    }
    prompt(`🏗️ Building ${BIZ[s.id].name}…`, level > 1 ? `Upgrading to level ${level}` : 'Breaking ground');
    Sound.build();
    await wait(1100);
    crane.remove();
    dusts.forEach((d) => d.remove());
    if (id !== G.runId) return;
    drawBuilding(s, level, true);
    Sound.rise();
    await wait(500);
    const p = screenPos(s);
    FX.burst(level === 3 ? 160 : 90, p.x, p.y - 60);
    floatText(`+${gain.toLocaleString()} 👥`, p.x, p.y - 80);
    setPop(gain);
    renderHud(s.id);
    prompt(level === 3 ? `⭐ ${BIZ[s.id].name} is now a LANDMARK!` : `✅ ${BIZ[s.id].name} ${level > 1 ? 'upgraded' : 'is open'}!`, `Population +${gain.toLocaleString()}`);
    await wait(1500);
  }

  function floatText(text, x, y, neg) {
    const f = el('div', `float-txt${neg ? ' neg' : ''}`, text);
    f.style.left = `${x}px`;
    f.style.top = `${y}px`;
    f.addEventListener('animationend', () => f.remove());
    document.body.append(f);
  }

  // ---- news events
  function news() {
    return new Promise((resolve) => {
      const id = G.runId;
      const built = (e) => e.needs.some((n) => city.slots[n] && city.slots[n].level > 0);
      let pool = EVENTS.filter((e) => !G.usedEvents.has(e.headline));
      if (!pool.length) pool = EVENTS.slice();
      const ready = pool.filter(built);
      const ev = ready.length && Math.random() < 0.5 ? pick(ready) : pick(pool);
      G.usedEvents.add(ev.headline);
      const ok = built(ev);
      G.newsTotal++;
      if (ok) G.newsGood++;
      const delta = ok ? CFG.newsReward : CFG.newsPenalty;

      $('#paperDay').textContent = `DAY ${G.day}`;
      $('#nwIcon').textContent = ev.icon;
      $('#nwHeadline').textContent = ev.headline;
      const out = $('#nwOutcome');
      out.className = `nw-outcome ${ok ? 'good' : 'bad'}`;
      out.replaceChildren(el('span', null, ok ? `✅ ${ev.good}` : `⚠️ ${ev.bad}`), el('b', null, `${delta > 0 ? '+' : ''}${delta.toLocaleString()} 👥`));
      $('#nwTip').textContent = `💡 ${ev.tip}`;
      $('#news').hidden = false;
      restartAnim($('#paper'), 'paper');
      Sound.news();
      prompt('📰 Breaking news!', '');

      setTimeout(() => {
        if (id !== G.runId) return;
        if (ok) {
          Sound.good();
          FX.burst(120);
          ev.needs.forEach((n) => { const s = city.slots[n]; if (s && s.level > 0) { const g = s.group.firstChild; if (g) restartAnim(g, 'glow'); } });
        } else {
          Sound.bad();
          restartAnim($('#flash'), 'on');
        }
        setPop(delta);
      }, 1000);

      const overlay = $('#news');
      const shownAt = performance.now();
      let t = 0;
      const done = () => {
        clearTimeout(t);
        overlay.onclick = null;
        overlay.hidden = true;
        resolve();
      };
      overlay.onclick = () => { if (performance.now() - shownAt > 1800) { Sound.tap(); done(); } };
      t = setTimeout(done, 7000);
    });
  }

  // ---- finale
  async function finale(id) {
    $('#hand').replaceChildren();
    prompt('🌃 Night falls over Evernorth City…', '');
    setSky('night');
    await wait(2200);
    if (id !== G.runId) return;
    for (let i = 0; i < 9; i++) {
      FX.firework(innerWidth * (0.15 + Math.random() * 0.7), innerHeight * (0.12 + Math.random() * 0.3));
      Sound.boom();
      await wait(350 + Math.random() * 250);
      if (id !== G.runId) return;
    }
    showResults();
  }

  function cityRank(pop) {
    let r = CFG.ranks[0];
    for (const rk of CFG.ranks) if (pop >= rk[0]) r = rk;
    return r;
  }

  function showResults() {
    if (window.Passport) window.Passport.stamp('evernorth-city', G.pop);
    const built = CITY_BIZ.filter((b) => city.slots[b.id].level > 0).length;
    const landmarks = CITY_BIZ.filter((b) => city.slots[b.id].level >= 3).length;
    const [, rankName, rankIcon] = cityRank(G.pop);
    $('#resRankIcon').textContent = rankIcon;
    $('#resRank').textContent = rankName.toUpperCase();
    $('#resPop').textContent = '0';
    $('#rsBuilt').textContent = `${built}/${CITY_BIZ.length}`;
    $('#rsLand').textContent = landmarks;
    $('#rsPermits').textContent = `${G.approved}/${G.permits}`;
    $('#rsNews').textContent = `${G.newsGood}/${G.newsTotal}`;

    const badges = [];
    if (built === CITY_BIZ.length) badges.push('🏙️ Full Coverage');
    if (landmarks >= 2) badges.push('🏛️ Landmark Builder');
    if (G.newsTotal && G.newsGood === G.newsTotal) badges.push('📰 Crisis Ready');
    if (G.permits && G.approved === G.permits) badges.push('✅ Perfect Permits');
    const avg = G.answerTimes.length ? G.answerTimes.reduce((a, b) => a + b, 0) / G.answerTimes.length : null;
    if (avg != null && avg < 5 && G.answerTimes.length >= 5) badges.push('⚡ Fast-Track Mayor');
    if (!badges.length) badges.push('🏗️ Rising Mayor');
    const bx = $('#resBadges');
    bx.replaceChildren();
    badges.forEach((t, i) => { const b = el('span', 'badge', t); b.style.animationDelay = `${0.8 + i * 0.2}s`; bx.append(b); });

    // every business is shown: the ones this city didn't build are listed with what they do
    const missing = CITY_BIZ.filter((b) => city.slots[b.id].level === 0);
    const ml = $('#resMissingList');
    ml.replaceChildren();
    for (const b of missing) {
      const chip = el('span', 'res-missing-chip');
      chip.style.setProperty('--bc', b.color);
      chip.title = ROLES[b.id] || '';
      chip.append(el('span', null, b.icon), el('b', null, b.short || b.name), el('small', null, ROLES[b.id] || ''));
      ml.append(chip);
    }
    $('#resMissing').hidden = !missing.length;

    // every finished score is saved automatically under the signed-in name
    // (Save + name screen only if no name is known, e.g. a browser that can't store it)
    const autoName = window.Passport && window.Passport.currentName(NAME_MAX);
    if (autoName) G.savedId = addScore(autoName, G.pop, CITY_BIZ.filter((b) => city.slots[b.id].level > 0).length).id;
    if (window.Passport) window.Passport.savedNote($('#againBtn'), autoName);
    const qualifies = !autoName && isHighScore(G.pop);
    $('#saveBtn').hidden = !qualifies;
    $('#againBtn').hidden = qualifies;
    show('results');
    Sound.fanfare();
    animateNumber($('#resPop'), 0, G.pop, 1500);
    FX.burst(160);
    armIdle();
  }

  function animateNumber(node, from, to, ms) {
    cancelAnimationFrame(node._raf);
    const t0 = performance.now();
    const step = (t) => {
      const pr = Math.min(1, (t - t0) / ms);
      node.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - pr, 3))).toLocaleString();
      if (pr < 1) node._raf = requestAnimationFrame(step);
    };
    node._raf = requestAnimationFrame(step);
  }

  // ================================================================ name entry
  function buildKeys() {
    const k = $('#keys');
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      const b = el('button', 'key', ch);
      b.type = 'button';
      b.addEventListener('click', () => typeKey(ch));
      k.append(b);
    }
    const del = el('button', 'key del', '⌫');
    del.type = 'button';
    del.addEventListener('click', () => typeKey('DEL'));
    const ok = el('button', 'key ok', 'OK');
    ok.type = 'button';
    ok.addEventListener('click', saveName);
    k.append(del, ok);
  }
  function typeKey(ch) {
    Sound.tap();
    if (ch === 'DEL') G.name = G.name.slice(0, -1);
    else if (G.name.length < NAME_MAX) G.name += G.name ? ch.toLowerCase() : ch;
    renderName();
  }
  function renderName() {
    $('#nameBox').textContent = G.name;
    $('#keys .ok').disabled = !G.name;
  }
  function goEntry() {
    G.name = (window.Passport && window.Passport.currentName(NAME_MAX)) || '';
    renderName();
    $('#entryTop').textContent = CFG.leaderboardSize;
    show('entry');
    armIdle();
  }
  function saveName() {
    if (!G.name) return;
    const built = CITY_BIZ.filter((b) => city.slots[b.id].level > 0).length;
    const entry = addScore(G.name, G.pop, built);
    Sound.good();
    goAttract(entry.id);
  }

  // ================================================================ kiosk helpers
  function armIdle() {
    clearTimeout(G.idleTimer);
    G.idleTimer = setTimeout(() => { if (G.screen === 'results' || G.screen === 'entry') goAttract(); }, CFG.resultTimeoutSec * 1000);
  }
  function tryFullscreen() {
    const d = document.documentElement;
    if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen().catch(() => {});
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._t);
    t._t = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ================================================================ wiring
  $('#startBtn').addEventListener('click', startGame);
  // Save stores the score under the name the player signed in with: one tap, no keyboard.
  // (The name screen only appears if no name is known, e.g. a browser that can't store it.)
  $('#saveBtn').addEventListener('click', () => {
    const name = window.Passport && window.Passport.currentName(NAME_MAX);
    if (!name) return goEntry();
    G.name = name;
    saveName();
  });
  $('#againBtn').addEventListener('click', startGame);
  $('#homeBtn').addEventListener('click', () => goAttract());
  $('#skipBtn').addEventListener('click', () => goAttract());

  document.addEventListener('pointerdown', () => {
    G.lastTouch = performance.now();
    if (G.screen === 'results' || G.screen === 'entry') armIdle();
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // Staff shortcuts: Esc = home, M = mute, Ctrl+Shift+X twice = clear leaderboard
  let clearArmed = 0;
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') goAttract();
    else if (k === 'm' && !e.ctrlKey && G.screen !== 'entry') toast(Sound.toggle() ? '🔊 Sound on' : '🔇 Sound off');
    else if (e.ctrlKey && e.shiftKey && k === 'x') {
      if (Date.now() - clearArmed < 3000) { window.Leaderboard.clear(LB_KEY); renderLeaderboard(); toast('Leaderboard cleared'); clearArmed = 0; }
      else { clearArmed = Date.now(); toast('Press Ctrl+Shift+X again to clear the leaderboard'); }
    }
  });

  document.title = 'Evernorth City';
  $('#title').textContent = CFG.title;
  $('#tagline').textContent = CFG.tagline;
  buildClouds();
  buildCity();
  buildKeys();
  goAttract();
  // shared scores arrived: refresh the board, unless it is showing a just-saved score
  window.Leaderboard.onChange(() => { if (G.screen === 'attract' && !$('#lb .new')) renderLeaderboard(); });
  // warn before leaving for the Arcade mid-game or with an unsaved score
  window.Passport.setLeaveGuard(() => {
    if (G.screen === 'play') return 'playing';
    if (G.screen === 'entry' || (G.screen === 'results' && !$('#saveBtn').hidden)) return 'unsaved';
    return null;
  });
})();
