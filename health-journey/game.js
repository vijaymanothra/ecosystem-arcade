(() => {
  'use strict';

  // ================================================================ config + content
  const CFG = Object.assign({
    title: 'THE HEALTH JOURNEY',
    kicker: '',
    tagline: '',
    maxRounds: { 1: 12, 2: 10, 3: 8, 4: 7 },
    questionTime: 20,
    correctCoins: 100,
    speedBonusMax: 50,
    finishBonus: 300,
    stampBonus: 50,
    factSec: 6,
    autoRollSec: 20,
    idleAbandonSec: 120,
    resultTimeoutSec: 60,
    leaderboardSize: 10,
    leaderboardScope: 'today',
    sound: true,
  }, window.HJ_CONFIG || {});

  const BUSINESSES = window.QUIZ_BUSINESSES || [];
  const BIZ = Object.fromEntries(BUSINESSES.map((b) => [b.id, b]));
  const QUESTIONS = (window.QUIZ_QUESTIONS || []).filter((q) =>
    q && BIZ[q.business] && q.q && Array.isArray(q.options) && q.options.length === 4 &&
    Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4);
  const PLAYER_DEFS = (window.HJ_PLAYERS || []).slice(0, 4);
  const ZONES = window.HJ_ZONES || [];
  const SPECIAL = {
    start:   { icon: '🚩', color: '#2e9d57', label: 'START' },
    finish:  { icon: '🏆', color: '#ffb703', label: 'HEALTHY LIFE' },
    boost:   { icon: '🚀', color: '#ff7a1a', label: 'BOOST' },
    setback: { icon: '⛈️', color: '#5c6378', label: 'SETBACK' },
    mystery: { icon: '🎁', color: '#7b4dff', label: 'MYSTERY' },
  };
  const BOARD = (window.HJ_BOARD || []).filter((s) => SPECIAL[s] || BIZ[s]);
  const EVENTS = window.HJ_EVENTS || {};
  const LAST = BOARD.length - 1;
  const COLS = 6;
  const ROWS = Math.ceil(BOARD.length / COLS);
  const VB = { w: 1600, h: 1000 };
  const SHAPES = ['▲', '◆', '●', '■'];
  const LB_KEY = 'healthJourney.leaderboard.v1';
  const NAME_MAX = 10;

  // ================================================================ helpers
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
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
  const pct = (v, total) => `${(v / total) * 100}%`;

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
      join(i) { tone(523 * Math.pow(2, i / 4), 0.15, 'triangle', 0, 0.16); tone(784 * Math.pow(2, i / 4), 0.15, 'triangle', 0.08, 0.12); },
      rattle() { for (let i = 0; i < 11; i++) tone(260 + Math.random() * 500, 0.035, 'square', i * 0.1 * (1 + i * 0.04), 0.07); },
      diceLand() { tone(180, 0.18, 'triangle', 0, 0.22, 90); tone(880, 0.12, 'sine', 0.05, 0.12); },
      hop(i) { tone(440 + i * 45, 0.08, 'triangle', 0, 0.12, 620 + i * 45); },
      land() { tone(330, 0.16, 'sine', 0, 0.16, 220); },
      flip() { tone(300, 0.25, 'sine', 0, 0.1, 1200); },
      whoosh() { tone(900, 0.3, 'sawtooth', 0, 0.05, 200); },
      correct() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', i * 0.07, 0.22)); },
      wrong() { tone(220, 0.4, 'sawtooth', 0, 0.14, 90); },
      tick() { tone(1200, 0.05, 'square', 0, 0.06); },
      coin() { tone(988, 0.08, 'square', 0, 0.08); tone(1319, 0.14, 'square', 0.07, 0.08); },
      stamp() { tone(120, 0.2, 'triangle', 0, 0.3, 60); tone(1568, 0.25, 'sine', 0.1, 0.1); },
      boost() { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.1, 'square', i * 0.05, 0.08)); },
      setback() { [523, 440, 349, 262].forEach((f, i) => tone(f, 0.16, 'triangle', i * 0.1, 0.14)); },
      fanfare() { [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.22, 'triangle', i * 0.12, 0.2)); },
    };
  })();

  // ================================================================ confetti
  const Confetti = (() => {
    const cv = $('#fx');
    const cx = cv.getContext('2d');
    const colors = ['#ffd23f', '#ff4fa3', '#3ee6ff', '#2ee59d', '#ff8a3d', '#a78bfa'];
    let parts = [];
    let running = false;
    function resize() { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; }
    addEventListener('resize', resize);
    resize();
    function burst(n = 120, x = innerWidth / 2, y = innerHeight / 3) {
      for (let i = 0; i < n; i++) {
        parts.push({ x, y, vx: (Math.random() - 0.5) * 22, vy: -Math.random() * 18 - 4, s: 8 + Math.random() * 10, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[i % colors.length] });
      }
      if (!running) { running = true; requestAnimationFrame(loop); }
    }
    function loop() {
      cx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      cx.clearRect(0, 0, innerWidth, innerHeight);
      parts = parts.filter((p) => p.y < innerHeight + 40);
      for (const p of parts) {
        p.vy += 0.45; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); cx.restore();
      }
      if (parts.length) requestAnimationFrame(loop); else running = false;
    }
    return { burst };
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
  function addScore(name, score, stamps, token) {
    const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, score, stamps, token, day: today() };
    return window.Leaderboard.add(LB_KEY, entry);
  }
  function renderLeaderboard(highlightId) {
    $('#lbTitle').textContent = CFG.leaderboardScope === 'today' ? `🏆 Today's Top Travelers` : '🏆 Top Travelers';
    const ol = $('#lb');
    ol.replaceChildren();
    // staff paused this leaderboard from the admin page: scores are kept, just not shown
    if (window.Leaderboard.isHidden(LB_KEY)) { ol.append(el('li', 'empty', '🔒 Leaderboard paused by staff')); return; }
    const lb = boardEntries();
    if (!lb.length) { ol.append(el('li', 'empty', 'No journeys finished yet — be the first legend!')); return; }
    lb.forEach((e, i) => {
      const li = el('li', e.id === highlightId ? 'new' : '');
      li.append(
        el('span', 'rank', i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`),
        el('span', 'name', `${e.token || ''} ${e.name}`),
        el('span', 'stamps', `📮 ${e.stamps}/${BUSINESSES.length}`),
        el('span', 'pts', e.score.toLocaleString()),
      );
      ol.append(li);
    });
  }

  // ================================================================ board rendering
  function boardPoints() {
    const pts = [];
    const x0 = 150, x1 = 1450, yTop = 125, yBot = 875;
    const yGap = ROWS > 1 ? (yBot - yTop) / (ROWS - 1) : 0;
    for (let i = 0; i < BOARD.length; i++) {
      const r = Math.floor(i / COLS);
      const c = i % COLS;
      const cc = r % 2 === 0 ? c : COLS - 1 - c;
      pts.push({ x: x0 + (cc * (x1 - x0)) / (COLS - 1), y: yTop + r * yGap + Math.sin(cc * 1.7 + r * 2.1) * 16, r });
    }
    return pts;
  }

  function roadPath(pts) {
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  }

  function renderBoard(host) {
    host.replaceChildren();
    const pts = boardPoints();

    // zone bands
    for (let r = 0; r < ROWS; r++) {
      const z = ZONES[r % Math.max(1, ZONES.length)];
      if (!z) continue;
      const y = pts[r * COLS].y;
      const band = el('div', 'zone');
      band.style.setProperty('--z', z.color);
      band.style.top = pct(y - 78, VB.h);
      band.style.height = pct(156, VB.h);
      // centred on the top edge, between the middle spaces (row ends are taken by road turns)
      band.append(el('div', 'zone-label', `${z.icon} ${z.name.toUpperCase()}`));
      host.append(band);
    }

    // road
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${VB.w} ${VB.h}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.classList.add('road');
    const d = roadPath(pts);
    for (const cls of ['edge', 'curb', 'asphalt', 'dash']) {
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      p.setAttribute('class', cls);
      svg.append(p);
    }
    host.append(svg);

    // decorations between spaces (above / below the road)
    for (let r = 0; r < ROWS; r++) {
      const z = ZONES[r % Math.max(1, ZONES.length)];
      if (!z || !z.decor) continue;
      const cols = shuffle([0, 1, 3, 4]).slice(0, 3); // skip the middle gap — the zone label sits there
      cols.forEach((c, k) => {
        const a = pts[r * COLS + c];
        const b = pts[r * COLS + c + 1];
        if (!a || !b) return;
        const dEl = el('div', 'decor', z.decor[(r + k) % z.decor.length]);
        dEl.style.left = pct((a.x + b.x) / 2, VB.w);
        dEl.style.top = pct((a.y + b.y) / 2 + (k % 2 ? 50 : -50), VB.h);
        dEl.style.animationDelay = `${-Math.random() * 3}s`;
        host.append(dEl);
      });
    }

    // spaces
    const nodes = BOARD.map((s, i) => {
      const p = pts[i];
      const sp = SPECIAL[s];
      const b = BIZ[s];
      const n = el('div', `node ${sp ? `special ${s}` : 'biz'}`);
      n.style.left = pct(p.x, VB.w);
      n.style.top = pct(p.y, VB.h);
      n.style.setProperty('--nc', sp ? sp.color : b.color);
      n.append(el('span', 'ni', sp ? sp.icon : b.icon));
      n.append(el('span', 'nl', sp ? sp.label : (b.short || b.name)));
      if (i > 0 && i < LAST) n.append(el('span', 'nn', String(i)));
      host.append(n);
      return n;
    });

    // drifting clouds
    for (let i = 0; i < 3; i++) {
      const c = el('div', 'cloud', '☁️');
      c.style.top = `${8 + i * 30 + Math.random() * 10}%`;
      c.style.animationDuration = `${70 + Math.random() * 40}s`;
      c.style.animationDelay = `${-Math.random() * 90}s`;
      host.append(c);
    }
    return { pts, nodes };
  }

  // ================================================================ state
  const screens = ['lobby', 'play', 'results', 'entry'];
  const G = {
    screen: 'lobby',
    runId: 0,
    joined: new Set(),
    players: [],
    turn: 0,
    round: 1,
    maxRounds: 10,
    used: new Set(),
    pts: [],
    nodes: [],
    awaitingRoll: false,
    autoTimer: 0,
    autoDeadline: 0,
    lastTouch: 0,
    idleTimer: 0,
    spinX: 0,
    spinY: 0,
    winner: null,
    name: '',
  };
  const cur = () => G.players[G.turn];

  function show(name) {
    for (const s of screens) $('#' + s).hidden = s !== name;
    G.screen = name;
  }

  // ================================================================ lobby
  function buildSeats() {
    const box = $('#seats');
    box.replaceChildren();
    PLAYER_DEFS.forEach((def, i) => {
      const s = el('button', 'seat');
      s.type = 'button';
      s.style.setProperty('--pc', def.color);
      s.append(el('span', 'st', def.token), el('span', 'sn', def.name), el('span', 'ss', 'Tap to join'));
      s.addEventListener('click', () => {
        Sound.unlock();
        if (G.joined.has(i)) { G.joined.delete(i); Sound.tap(); } else { G.joined.add(i); Sound.join(i); }
        renderSeats();
      });
      box.append(s);
    });
    renderSeats();
  }
  function renderSeats() {
    [...$('#seats').children].forEach((s, i) => {
      const on = G.joined.has(i);
      s.classList.toggle('on', on);
      s.querySelector('.ss').textContent = on ? 'READY! ✓' : 'Tap to join';
    });
    const n = G.joined.size;
    const btn = $('#startBtn');
    btn.disabled = n === 0;
    btn.classList.toggle('pulse', n > 0);
    btn.textContent = n === 0 ? 'START JOURNEY' : `START JOURNEY · ${n} PLAYER${n > 1 ? 'S' : ''}`;
  }

  function goLobby(highlightId) {
    G.runId++;
    stopAutoRoll();
    clearTimeout(G.idleTimer);
    for (const id of ['challenge', 'eventOverlay']) $('#' + id).hidden = true;
    $('#diceStage').hidden = true;
    $('#turnBanner').hidden = true;
    G.joined.clear();
    renderSeats();
    renderLeaderboard(highlightId);
    show('lobby');
  }

  // ================================================================ game setup
  function startGame(seatIdx) {
    Sound.unlock();
    tryFullscreen();
    G.runId++;
    const seats = seatIdx || [...G.joined].sort();
    G.players = seats.map((i) => ({
      def: PLAYER_DEFS[i], seat: i, pos: 0, coins: 0, stamps: new Set(), double: false, finished: false, tokenEl: null, cardEl: null,
    }));
    G.turn = 0;
    G.round = 1;
    G.maxRounds = CFG.maxRounds[G.players.length] || 10;
    G.used = new Set();
    G.winner = null;
    G.lastTouch = performance.now();

    const { pts, nodes } = renderBoard($('#board'));
    G.pts = pts;
    G.nodes = nodes;
    for (const p of G.players) {
      const t = el('div', 'token');
      t.style.setProperty('--pc', p.def.color);
      t.append(el('div', 'tb', p.def.token));
      $('#board').append(t);
      p.tokenEl = t;
    }
    placeTokens();
    buildPlayerCards();
    show('play');
    beginTurn();
  }

  function buildPlayerCards() {
    const box = $('#playerCards');
    box.replaceChildren();
    for (const p of G.players) {
      const c = el('div', 'pcard');
      c.style.setProperty('--pc', p.def.color);
      const stamps = el('div', 'ps');
      for (const b of BUSINESSES) { const s = el('span', null, b.icon); s.dataset.id = b.id; stamps.append(s); }
      c.append(el('div', 'pt', p.def.token), el('div', 'pn', p.def.name), el('div', 'pc', '💰 0'), stamps, el('div', 'pp', 'Space 0'));
      box.append(c);
      p.cardEl = c;
    }
    renderPlayerCards();
  }

  function renderPlayerCards() {
    G.players.forEach((p, i) => {
      const c = p.cardEl;
      c.classList.toggle('active', i === G.turn && G.screen === 'play');
      c.querySelector('.pc').textContent = `💰 ${p.coins.toLocaleString()}`;
      c.querySelector('.pp').textContent = p.pos >= LAST ? '🏁 Finished' : `Space ${p.pos}/${LAST}${p.double ? ' · ✨×2' : ''}`;
      c.querySelectorAll('.ps span').forEach((s) => s.classList.toggle('got', p.stamps.has(s.dataset.id)));
    });
    const r = $('#roundInfo');
    r.textContent = `ROUND ${Math.min(G.round, G.maxRounds)} / ${G.maxRounds}`;
    r.classList.toggle('last', G.round >= G.maxRounds);
  }

  // Spread tokens that share a space so they don't overlap.
  const OFFSETS = [[[0, 0]], [[-24, 0], [24, 0]], [[-24, -10], [24, -10], [0, 20]], [[-24, -14], [24, -14], [-24, 18], [24, 18]]];
  function placeTokens(except) {
    const groups = {};
    G.players.forEach((p) => { if (p !== except) (groups[p.pos] = groups[p.pos] || []).push(p); });
    for (const [pos, list] of Object.entries(groups)) {
      const offs = OFFSETS[Math.min(list.length, 4) - 1];
      list.forEach((p, k) => {
        const pt = G.pts[pos];
        const [dx, dy] = offs[k] || [0, 0];
        p.tokenEl.style.left = pct(pt.x + dx, VB.w);
        p.tokenEl.style.top = pct(pt.y + dy, VB.h);
      });
    }
    G.players.forEach((p, i) => p.tokenEl.classList.toggle('active', i === G.turn));
  }

  // ================================================================ turn flow
  function beginTurn() {
    const p = cur();
    renderPlayerCards();
    placeTokens();
    $('#turnWho').textContent = `${p.def.token} ${p.def.name}, roll the dice!`;
    const rb = $('#rollBtn');
    rb.disabled = false;
    rb.classList.add('ready');
    if (G.players.length > 1) turnBanner(p);
    G.awaitingRoll = true;
    startAutoRoll();
  }

  function turnBanner(p) {
    const b = $('#turnBanner');
    b.style.setProperty('--pc', p.def.color);
    b.textContent = `${p.def.token}  ${p.def.name.toUpperCase()}'S TURN`;
    b.hidden = false;
    restartAnim(b, 'turn-banner');
    Sound.whoosh();
    clearTimeout(b._t);
    b._t = setTimeout(() => { b.hidden = true; }, 1300);
  }

  function startAutoRoll() {
    stopAutoRoll();
    G.autoDeadline = performance.now() + CFG.autoRollSec * 1000;
    const id = G.runId;
    G.autoTimer = setInterval(() => {
      if (id !== G.runId) { stopAutoRoll(); return; }
      if (performance.now() - G.lastTouch > CFG.idleAbandonSec * 1000) { goLobby(); return; }
      const left = Math.ceil((G.autoDeadline - performance.now()) / 1000);
      $('#autoRoll').textContent = left <= 10 ? `Auto-roll in ${Math.max(0, left)}s` : '';
      if (left <= 0) doTurn();
    }, 250);
  }
  function stopAutoRoll() {
    clearInterval(G.autoTimer);
    $('#autoRoll').textContent = '';
  }

  async function doTurn() {
    if (!G.awaitingRoll || G.screen !== 'play') return;
    G.awaitingRoll = false;
    stopAutoRoll();
    const rb = $('#rollBtn');
    rb.disabled = true;
    rb.classList.remove('ready');
    const id = G.runId;
    const p = cur();

    const n = await rollDice();
    if (id !== G.runId) return;
    $('#turnWho').textContent = `${p.def.token} ${p.def.name} moves ${n}…`;
    await moveBy(p, n);
    if (id !== G.runId) return;

    let again = false;
    if (p.pos >= LAST) { await reachFinish(p); if (id === G.runId) endGame(); return; }

    const space = BOARD[p.pos];
    if (BIZ[space]) {
      await challenge(p, space);
    } else if (space === 'boost' || space === 'setback') {
      const ev = pick(EVENTS[space] || [{ icon: SPECIAL[space].icon, title: SPECIAL[space].label, text: '', move: space === 'boost' ? 2 : -2 }]);
      await showEvent(space, ev);
      if (id !== G.runId) return;
      if (ev.move) await moveBy(p, ev.move);
      if (id !== G.runId) return;
      if (p.pos >= LAST) { await reachFinish(p); if (id === G.runId) endGame(); return; }
    } else if (space === 'mystery') {
      const ev = pick(EVENTS.mystery || [{ icon: '🎁', title: 'Bonus!', text: '', coins: 100 }]);
      await showEvent(space, ev);
      if (id !== G.runId) return;
      again = applyMystery(p, ev);
    }
    if (id !== G.runId) return;
    renderPlayerCards();
    await wait(400);
    if (id !== G.runId) return;
    nextTurn(again);
  }

  function nextTurn(again) {
    if (!again) {
      G.turn = (G.turn + 1) % G.players.length;
      if (G.turn === 0) G.round++;
    }
    if (G.round > G.maxRounds) { endGame(); return; }
    beginTurn();
  }

  // ================================================================ dice
  const FACE_ROT = { 1: [0, 0], 2: [90, 0], 3: [0, -90], 4: [0, 90], 5: [-90, 0], 6: [0, 180] };
  const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  function buildDice() {
    const d = $('#dice');
    for (let f = 1; f <= 6; f++) {
      const face = el('div', `dface f${f}`);
      for (const cell of PIPS[f]) {
        const pip = el('span', 'pip');
        pip.style.gridRow = String(Math.ceil(cell / 3));
        pip.style.gridColumn = String(((cell - 1) % 3) + 1);
        face.append(pip);
      }
      d.append(face);
    }
    d.style.transform = 'rotateX(-20deg) rotateY(30deg)';
  }
  async function rollDice() {
    const v = 1 + Math.floor(Math.random() * 6);
    const stage = $('#diceStage');
    const res = $('#diceResult');
    res.textContent = '';
    res.classList.remove('show');
    stage.hidden = false;
    const dice = $('#dice');
    void dice.offsetWidth;
    G.spinX += 720 + 360 * Math.floor(Math.random() * 2);
    G.spinY += 1080 + 360 * Math.floor(Math.random() * 2);
    const [bx, by] = FACE_ROT[v];
    dice.style.transform = `rotateX(${G.spinX + bx}deg) rotateY(${G.spinY + by}deg)`;
    Sound.rattle();
    await wait(1300);
    Sound.diceLand();
    res.textContent = `🎲 ${v}!`;
    restartAnim(res, 'show');
    await wait(750);
    stage.hidden = true;
    return v;
  }

  // ================================================================ movement
  async function moveBy(p, delta) {
    const id = G.runId;
    const dir = Math.sign(delta);
    let steps = Math.abs(delta);
    if (dir > 0) G.nodes.forEach((n) => n.classList.remove('target'));
    const target = Math.max(0, Math.min(LAST, p.pos + delta));
    if (G.nodes[target]) G.nodes[target].classList.add('target');
    let i = 0;
    while (steps-- > 0) {
      if (id !== G.runId) return;
      const next = p.pos + dir;
      if (next < 0 || next > LAST) break;
      p.pos = next;
      const pt = G.pts[p.pos];
      p.tokenEl.style.left = pct(pt.x, VB.w);
      p.tokenEl.style.top = pct(pt.y, VB.h);
      restartAnim(p.tokenEl.firstChild, 'hop');
      Sound.hop(dir > 0 ? i++ : -i++);
      await wait(260);
    }
    if (G.nodes[target]) G.nodes[target].classList.remove('target');
    const node = G.nodes[p.pos];
    restartAnim(node, 'land');
    puff(G.pts[p.pos]);
    Sound.land();
    placeTokens();
    renderPlayerCards();
    await wait(250);
  }

  function puff(pt) {
    const f = el('div', 'puff');
    f.style.left = pct(pt.x, VB.w);
    f.style.top = pct(pt.y + 20, VB.h);
    f.addEventListener('animationend', () => f.remove());
    $('#board').append(f);
  }

  async function reachFinish(p) {
    p.finished = true;
    Sound.fanfare();
    const r = G.nodes[LAST].getBoundingClientRect();
    Confetti.burst(220, r.left + r.width / 2, r.top + r.height / 2);
    await addCoins(p, CFG.finishBonus, G.nodes[LAST], `🏁 +${CFG.finishBonus}`);
    toast(`🏁 ${p.def.token} ${p.def.name} reached Healthy Life!`);
    await wait(1600);
  }

  // ================================================================ coins + stamps
  async function addCoins(p, amount, fromEl, label) {
    if (!amount) return;
    const from = fromEl ? fromEl.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    const fx = from.left + from.width / 2;
    const fy = from.top + from.height / 2;
    const target = p.cardEl.querySelector('.pc').getBoundingClientRect();
    const tx = target.left + target.width / 2;
    const ty = target.top + target.height / 2;
    if (label) {
      const f = el('div', 'float-pts', label);
      f.style.left = `${fx}px`;
      f.style.top = `${fy}px`;
      f.addEventListener('animationend', () => f.remove());
      document.body.append(f);
    }
    const count = Math.min(8, 3 + Math.round(amount / 60));
    for (let i = 0; i < count; i++) {
      const c = el('div', 'coin-fly', '🪙');
      c.style.left = `${fx}px`;
      c.style.top = `${fy}px`;
      document.body.append(c);
      const mx = (fx + tx) / 2 + (Math.random() - 0.5) * 300;
      const my = Math.min(fy, ty) - 120 - Math.random() * 120;
      const anim = c.animate([
        { transform: 'translate(-50%,-50%) scale(.6)', offset: 0 },
        { transform: `translate(calc(${mx - fx}px - 50%), calc(${my - fy}px - 50%)) scale(1.2)`, offset: 0.5 },
        { transform: `translate(calc(${tx - fx}px - 50%), calc(${ty - fy}px - 50%)) scale(.7)`, offset: 1 },
      ], { duration: 650 + i * 60, easing: 'ease-in-out', fill: 'forwards' });
      anim.onfinish = () => { c.remove(); if (i % 2 === 0) Sound.coin(); };
    }
    await wait(700);
    p.coins = Math.max(0, p.coins + amount);
    const pc = p.cardEl.querySelector('.pc');
    renderPlayerCards();
    restartAnim(pc, 'bump');
  }

  function giveStamp(p, bizId) {
    if (p.stamps.has(bizId)) return false;
    p.stamps.add(bizId);
    renderPlayerCards();
    const s = p.cardEl.querySelector(`.ps span[data-id="${bizId}"]`);
    if (s) restartAnim(s, 'new');
    return true;
  }

  // ================================================================ challenge card
  function pickQuestion(bizId) {
    const pool = QUESTIONS.filter((q) => q.business === bizId);
    if (!pool.length) return null;
    const fresh = pool.filter((q) => !G.used.has(q));
    const q = pick(fresh.length ? fresh : pool);
    G.used.add(q);
    return q;
  }

  function challenge(p, bizId) {
    return new Promise((resolve) => {
      const id = G.runId;
      const b = BIZ[bizId];
      const q = pickQuestion(bizId);
      if (!q) { resolve(); return; }
      const zone = ZONES[Math.floor(p.pos / COLS) % Math.max(1, ZONES.length)];
      const card = $('#chCard');
      card.style.setProperty('--biz', b.color);
      $('#chIcon').textContent = b.icon;
      $('#chZone').textContent = zone ? zone.name.toUpperCase() : '';
      $('#chName').textContent = b.name;
      $('#chPlayer').textContent = `${p.def.token} ${p.def.name}`;
      $('#chDouble').hidden = !p.double;
      const qEl = $('#chQ');
      qEl.textContent = q.q;
      qEl.classList.toggle('long', q.q.length > 90);
      $('#chResult').hidden = true;
      $('#chStamp').hidden = true;

      const opts = shuffle(q.options.map((text, k) => ({ text, correct: k === q.answer })));
      const box = $('#chOpts');
      box.replaceChildren();
      box.hidden = false;
      const btns = opts.map((o, i) => {
        const btn = el('button', `opt o${i}`);
        btn.type = 'button';
        btn.style.animationDelay = `${0.15 + i * 0.07}s`;
        btn.append(el('span', 'sh', SHAPES[i]), el('span', null, o.text));
        btn.addEventListener('click', () => answer(i));
        box.append(btn);
        return btn;
      });

      $('#challenge').hidden = false;
      restartAnim(card, 'ch-card');
      Sound.flip();

      const fill = $('#chTimerFill');
      const t0 = performance.now();
      let locked = false;
      let lastTick = null;
      let raf = 0;
      const loop = () => {
        if (locked || id !== G.runId) return;
        const left = Math.max(0, CFG.questionTime - (performance.now() - t0) / 1000);
        fill.style.transform = `scaleX(${left / CFG.questionTime})`;
        fill.classList.toggle('low', left <= 5);
        const s = Math.ceil(left);
        if (left <= 5 && s !== lastTick && s > 0) { lastTick = s; Sound.tick(); }
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

        let coins = 0;
        if (ok) {
          const speed = Math.round(CFG.speedBonusMax * Math.max(0, 1 - elapsed / CFG.questionTime));
          coins = (CFG.correctCoins + speed) * (p.double ? 2 : 1);
          Sound.correct();
        } else {
          Sound.wrong();
          restartAnim($('#flash'), 'on');
        }
        p.double = false;

        await wait(700);
        if (id !== G.runId) return;
        box.hidden = true;
        const rt = $('#chResTitle');
        rt.className = `ch-res-title ${ok ? 'good' : 'bad'}`;
        rt.textContent = ok ? `✅ Correct! +${coins} coins` : choice < 0 ? "⏰ Time's up!" : '❌ Not quite';
        $('#chAnswer').textContent = ok ? '' : `Answer: ${opts[ci].text}`;
        $('#chFact').textContent = q.fact || '';
        $('#chResult').hidden = false;

        let newStamp = false;
        if (ok) {
          newStamp = giveStamp(p, bizId);
          if (newStamp) {
            const st = $('#chStamp');
            st.replaceChildren(el('b', null, b.icon), el('span', null, 'STAMPED!'));
            st.hidden = false;
            restartAnim(st, 'stamp-slam');
            setTimeout(() => Sound.stamp(), 250);
          }
          addCoins(p, coins, rt, null);
          const r = card.getBoundingClientRect();
          Confetti.burst(newStamp ? 120 : 60, r.left + r.width / 2, r.top + r.height / 3);
        }

        const bar = $('#chBar');
        bar.style.transition = 'none';
        bar.style.width = '100%';
        void bar.offsetWidth;
        bar.style.transition = `width ${CFG.factSec}s linear`;
        bar.style.width = '0%';

        const shownAt = performance.now();
        const overlay = $('#challenge');
        let t = 0;
        const done = () => {
          clearTimeout(t);
          overlay.onclick = null;
          overlay.hidden = true;
          resolve();
        };
        overlay.onclick = () => { if (performance.now() - shownAt > 900) { Sound.tap(); done(); } };
        t = setTimeout(done, CFG.factSec * 1000);
      }
    });
  }

  // ================================================================ event cards
  const KIND_STYLE = {
    boost:   { color: '#ff7a1a', label: 'BOOST CARD', icon: '🚀' },
    setback: { color: '#5c6378', label: 'SETBACK CARD', icon: '⛈️' },
    mystery: { color: '#7b4dff', label: 'MYSTERY CARD', icon: '🎁' },
  };
  function effectText(ev) {
    if (ev.move > 0) return `Move ahead ${ev.move} ➜`;
    if (ev.move < 0) return `⬅ Go back ${-ev.move}`;
    if (ev.coins) return `+${ev.coins} coins`;
    if (ev.again) return '🎲 Roll again!';
    if (ev.stamp) return '📮 Free stamp!';
    if (ev.allCoins) return `+${ev.allCoins} for everyone`;
    if (ev.double) return 'Next challenge ×2';
    return '';
  }
  function showEvent(kind, ev) {
    return new Promise((resolve) => {
      const id = G.runId;
      const ks = KIND_STYLE[kind];
      const flip = $('#flip');
      flip.classList.remove('flipped');
      flip.querySelectorAll('.face').forEach((f) => f.style.setProperty('--ec', ks.color));
      $('#evBackIcon').textContent = ks.icon;
      $('#evKind').textContent = ks.label;
      $('#evIcon').textContent = ev.icon || ks.icon;
      $('#evTitle').textContent = ev.title || '';
      $('#evText').textContent = ev.text || '';
      $('#evEffect').textContent = effectText(ev);
      const overlay = $('#eventOverlay');
      overlay.hidden = false;
      restartAnim(flip.firstElementChild, 'flip-inner');
      Sound.flip();
      setTimeout(() => {
        if (id !== G.runId) return;
        flip.classList.add('flipped');
        if (kind === 'setback') Sound.setback(); else Sound.boost();
        if (kind !== 'setback') {
          const r = flip.getBoundingClientRect();
          Confetti.burst(50, r.left + r.width / 2, r.top + r.height / 2);
        }
      }, 750);
      const shownAt = performance.now();
      let t = 0;
      const done = () => {
        clearTimeout(t);
        overlay.onclick = null;
        overlay.hidden = true;
        resolve();
      };
      overlay.onclick = () => { if (performance.now() - shownAt > 1500) { Sound.tap(); done(); } };
      t = setTimeout(done, 5200);
    });
  }

  function applyMystery(p, ev) {
    if (ev.coins) addCoins(p, ev.coins, null, `+${ev.coins}`);
    if (ev.allCoins) G.players.forEach((pl) => addCoins(pl, ev.allCoins, null, pl === p ? `+${ev.allCoins} each` : null));
    if (ev.double) p.double = true;
    if (ev.stamp) {
      const missing = BUSINESSES.filter((b) => !p.stamps.has(b.id));
      if (missing.length) {
        const b = pick(missing);
        giveStamp(p, b.id);
        Sound.stamp();
        toast(`📮 ${p.def.name} got the ${b.icon} ${b.name} stamp!`);
      } else {
        addCoins(p, 100, null, '+100');
      }
    }
    renderPlayerCards();
    return !!ev.again;
  }

  // ================================================================ end of game
  function endGame() {
    if (G.screen !== 'play') return;
    G.runId++;
    stopAutoRoll();
    G.awaitingRoll = false;
    const ranked = G.players.map((p) => {
      const stampBonus = p.stamps.size * CFG.stampBonus;
      return Object.assign(p, { stampBonus, total: p.coins + stampBonus });
    }).sort((a, b) => b.total - a.total || b.pos - a.pos);
    G.winner = ranked[0];
    if (window.Passport) window.Passport.stamp('health-journey', G.winner.total);

    const finisher = G.players.find((p) => p.finished);
    const title = $('#resTitle');
    if (G.players.length === 1) title.textContent = finisher ? 'JOURNEY COMPLETE!' : 'OUT OF ROUNDS!';
    else title.textContent = `${G.winner.def.token} ${G.winner.def.name.toUpperCase()} WINS!`;
    $('#resSub').textContent = finisher
      ? `${finisher.def.token} ${finisher.def.name} reached Healthy Life first · passport stamps +${CFG.stampBonus} each`
      : `Passport stamps +${CFG.stampBonus} each`;

    const pod = $('#podium');
    pod.replaceChildren();
    const order = ranked.length >= 3 ? [ranked[1], ranked[0], ranked[2], ...ranked.slice(3)] : ranked.length === 2 ? [ranked[1], ranked[0]] : ranked;
    order.forEach((p, k) => {
      const rank = ranked.indexOf(p) + 1;
      const c = el('div', `pod r${rank}`);
      c.style.setProperty('--pc', p.def.color);
      c.style.animationDelay = `${0.2 + (ranked.length - rank) * 0.25}s`;
      if (rank === 1) c.append(el('div', 'crown', '👑'));
      c.append(el('div', 'ptok', p.def.token), el('div', 'pname', p.def.name));
      const total = el('div', 'ptotal', '0');
      c.append(total);
      const brk = el('div', 'pbreak');
      brk.append(`💰 ${p.coins.toLocaleString()} coins`, el('br'), `📮 ${p.stamps.size}/${BUSINESSES.length} stamps · +${p.stampBonus}`);
      if (p.finished) brk.append(el('br'), '🏁 Reached Healthy Life');
      c.append(brk);
      const st = el('div', 'pstamps');
      for (const b of BUSINESSES) { const s = el('span', p.stamps.has(b.id) ? 'got' : '', b.icon); st.append(s); }
      c.append(st, el('div', 'block', String(rank)));
      pod.append(c);
      setTimeout(() => animateNumber(total, 0, p.total, 1200), 400 + k * 150);
    });

    const qualifies = isHighScore(G.winner.total);
    $('#saveBtn').hidden = !qualifies;
    $('#againBtn').hidden = qualifies;
    show('results');
    Sound.fanfare();
    setTimeout(() => Confetti.burst(220), 600);
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
    $('#entryWho').textContent = `${G.winner.def.token} ${G.winner.def.name}`;
    $('#entryTop').textContent = CFG.leaderboardSize;
    show('entry');
    armIdle();
  }
  function saveName() {
    if (!G.name || !G.winner) return;
    const entry = addScore(G.name, G.winner.total, G.winner.stamps.size, G.winner.def.token);
    Sound.correct();
    goLobby(entry.id);
  }

  // ================================================================ kiosk helpers
  function armIdle() {
    clearTimeout(G.idleTimer);
    G.idleTimer = setTimeout(() => { if (G.screen === 'results' || G.screen === 'entry') goLobby(); }, CFG.resultTimeoutSec * 1000);
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
  $('#startBtn').addEventListener('click', () => { if (G.joined.size) startGame(); });
  $('#rollBtn').addEventListener('click', () => { Sound.unlock(); doTurn(); });
  $('#saveBtn').addEventListener('click', goEntry);
  $('#againBtn').addEventListener('click', () => startGame(G.players.map((p) => p.seat)));
  $('#homeBtn').addEventListener('click', () => goLobby());
  $('#skipBtn').addEventListener('click', () => goLobby());

  document.addEventListener('pointerdown', () => {
    G.lastTouch = performance.now();
    if (G.screen === 'results' || G.screen === 'entry') armIdle();
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // Staff shortcuts: Esc = lobby, M = mute, Ctrl+Shift+X twice = clear leaderboard
  let clearArmed = 0;
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') goLobby();
    else if (k === 'm' && !e.ctrlKey && G.screen !== 'entry') toast(Sound.toggle() ? '🔊 Sound on' : '🔇 Sound off');
    else if (e.ctrlKey && e.shiftKey && k === 'x') {
      if (Date.now() - clearArmed < 3000) { window.Leaderboard.clear(LB_KEY); renderLeaderboard(); toast('Leaderboard cleared'); clearArmed = 0; }
      else { clearArmed = Date.now(); toast('Press Ctrl+Shift+X again to clear the leaderboard'); }
    }
  });

  document.title = 'The Health Journey';
  $('#title').textContent = CFG.title;
  $('#kicker').textContent = CFG.kicker;
  $('#tagline').textContent = CFG.tagline;
  renderBoard($('#lobbyBoard'));
  buildDice();
  buildSeats();
  buildKeys();
  goLobby();
  // shared scores arrived: refresh the board, unless it is showing a just-saved score
  window.Leaderboard.onChange(() => { if (G.screen === 'lobby' && !$('#lb .new')) renderLeaderboard(); });
  // warn before leaving for the Arcade mid-game or with an unsaved score
  window.Passport.setLeaveGuard(() => {
    if (G.screen === 'play') return 'playing';
    if (G.screen === 'entry' || (G.screen === 'results' && !$('#saveBtn').hidden)) return 'unsaved';
    return null;
  });
})();
