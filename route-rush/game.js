(() => {
  'use strict';

  // ================================================================ config + content
  const CFG = Object.assign({
    title: 'ROUTE RUSH',
    subtitle: '',
    hearts: 5,
    maxQueue: 5,
    powerupChance: 0.12,
    eventDuration: 8,
    eventSpawnFactor: 0.55,
    wrongRevealMs: 1400,
    resultTimeoutSec: 45,
    leaderboardSize: 10,
    leaderboardScope: 'today',
    sound: true,
    levels: [],
    duel: {},
  }, window.RR_CONFIG || {});
  CFG.duel = Object.assign({ levelDurations: [25, 30, 35], wrongPenalty: 50, expirePenalty: 50 }, CFG.duel);

  const BUSINESSES = window.RR_BUSINESSES || [];
  const BIZ = Object.fromEntries(BUSINESSES.map((b) => [b.id, b]));
  const REQUESTS = (window.RR_REQUESTS || []).filter((r) => r && BIZ[r.to] && r.text);
  const BY_BIZ = {};
  for (const r of REQUESTS) (BY_BIZ[r.to] = BY_BIZ[r.to] || []).push(r);
  const EVENTS = (window.RR_EVENTS || []).filter((e) => e && e.name && Array.isArray(e.bias) && e.bias.every((id) => BIZ[id]));
  const LEVELS = CFG.levels.length ? CFG.levels : [{
    name: 'LEVEL 1', subtitle: '', duration: 90, spawnEvery: 3, patience: 12, event: true, unlock: BUSINESSES.map((b) => b.id),
  }];

  const POWERS = {
    freeze: { icon: '❄️', label: '❄️ FREEZE!' },
    hint:   { icon: '💡', label: '💡 HINTS ×3' },
    double: { icon: '⚡', label: '⚡ DOUBLE POINTS' },
    heart:  { icon: '❤️', label: '❤️ +1 HEART' },
  };
  const LB_KEY = 'routeRush.leaderboard.v1';
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
  const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const patienceColor = (p) => (p > 0.5 ? '#2ee59d' : p > 0.25 ? '#ffc107' : '#ff4d6d');

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
      route() { tone(420, 0.14, 'triangle', 0, 0.18, 1100); tone(1320, 0.08, 'sine', 0.1, 0.12); },
      combo() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.12, 'square', i * 0.05, 0.08)); },
      wrong() { tone(220, 0.4, 'sawtooth', 0, 0.14, 90); },
      expire() { tone(392, 0.5, 'triangle', 0, 0.16, 150); },
      power() { [659, 880, 1109, 1319, 1760].forEach((f, i) => tone(f, 0.1, 'triangle', i * 0.05, 0.14)); },
      alarm() { for (let i = 0; i < 4; i++) tone(i % 2 ? 660 : 880, 0.14, 'square', i * 0.16, 0.1); },
      levelUp() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.18, 'triangle', i * 0.09, 0.18)); },
      count() { tone(440, 0.18, 'square', 0, 0.12); },
      go() { tone(880, 0.35, 'square', 0, 0.14); },
      gameover() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'triangle', i * 0.2, 0.2)); },
      win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, 'triangle', i * 0.11, 0.2)); },
    };
  })();

  // ================================================================ confetti
  const Confetti = (() => {
    const cv = $('#fx');
    const cx = cv.getContext('2d');
    const colors = ['#ffd23f', '#ff4fa3', '#3ee6ff', '#2ee59d', '#ff8a3d', '#a78bfa'];
    let parts = [];
    let running = false;
    function resize() {
      cv.width = innerWidth * devicePixelRatio;
      cv.height = innerHeight * devicePixelRatio;
    }
    addEventListener('resize', resize);
    resize();
    function burst(n = 120, x = innerWidth / 2, y = innerHeight / 3) {
      for (let i = 0; i < n; i++) {
        parts.push({
          x, y,
          vx: (Math.random() - 0.5) * 22,
          vy: -Math.random() * 18 - 4,
          s: 8 + Math.random() * 10,
          r: Math.random() * 6,
          vr: (Math.random() - 0.5) * 0.4,
          c: colors[i % colors.length],
        });
      }
      if (!running) { running = true; requestAnimationFrame(loop); }
    }
    function loop() {
      cx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      cx.clearRect(0, 0, innerWidth, innerHeight);
      parts = parts.filter((p) => p.y < innerHeight + 40);
      for (const p of parts) {
        p.vy += 0.45;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        cx.save();
        cx.translate(p.x, p.y);
        cx.rotate(p.r);
        cx.fillStyle = p.c;
        cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        cx.restore();
      }
      if (parts.length) requestAnimationFrame(loop);
      else running = false;
    }
    return { burst };
  })();

  // ================================================================ leaderboard (solo only, shared/leaderboard.js)
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
  function addScore(name, score, accuracy) {
    const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, score, accuracy, day: today() };
    return window.Leaderboard.add(LB_KEY, entry);
  }
  function renderLeaderboard(highlightId) {
    $('#lbTitle').textContent = CFG.leaderboardScope === 'today'
      ? `🏆 Today's Top ${CFG.leaderboardSize}` : `🏆 Top ${CFG.leaderboardSize}`;
    const ol = $('#lb');
    ol.replaceChildren();
    // staff paused this leaderboard from the admin page: scores are kept, just not shown
    if (window.Leaderboard.isHidden(LB_KEY)) { ol.append(el('li', 'empty', '🔒 Leaderboard paused by staff')); return; }
    const lb = boardEntries();
    if (!lb.length) {
      ol.append(el('li', 'empty', 'No dispatchers yet — set the first record!'));
      return;
    }
    lb.forEach((e, i) => {
      const li = el('li', e.id === highlightId ? 'new' : '');
      li.append(
        el('span', 'rank', i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`),
        el('span', 'name', e.name),
        el('span', 'acc', `🎯 ${e.accuracy}%`),
        el('span', 'pts', e.score.toLocaleString()),
      );
      ol.append(li);
    });
  }

  // ================================================================ game state
  const screens = ['attract', 'ready', 'countdown', 'play', 'soloOver', 'duelOver', 'entry'];
  const G = {
    screen: 'attract',
    mode: 'solo',
    runId: 0,
    lanes: [],
    levels: [],
    levelIdx: 0,
    levelTime: 0,
    clock: 0,
    unlocked: [],
    seq: [],
    recent: [],
    event: null,
    eventPlan: null,
    usedEvents: new Set(),
    running: false,
    paused: false,
    raf: 0,
    last: 0,
    idleTimer: 0,
    finalScore: 0,
    finalAcc: 0,
    name: '',
  };

  function show(name) {
    for (const s of screens) $('#' + s).hidden = s !== name;
    G.screen = name;
  }

  function levelsFor(mode) {
    if (mode === 'solo') return LEVELS;
    return LEVELS.map((l, i) => Object.assign({}, l, { duration: CFG.duel.levelDurations[i] || l.duration }));
  }
  function unlockedThrough(idx) {
    const ids = [];
    for (let i = 0; i <= idx; i++) for (const id of G.levels[i].unlock || []) if (BIZ[id] && BY_BIZ[id] && !ids.includes(id)) ids.push(id);
    return ids;
  }

  // Shared request sequence: in duel mode both players get the same requests in the same order.
  function seqAt(i) {
    while (G.seq.length <= i) G.seq.push(makeRequest());
    return G.seq[i];
  }
  function makeRequest() {
    let pool = G.unlocked;
    if (G.event) {
      const bias = G.event.bias.filter((id) => G.unlocked.includes(id));
      if (bias.length && Math.random() < 0.65) pool = bias;
    } else {
      const fresh = (G.levels[G.levelIdx].unlock || []).filter((id) => G.unlocked.includes(id));
      if (fresh.length && G.levelIdx > 0 && Math.random() < 0.3) pool = fresh;
    }
    const bizId = pick(pool);
    const fresh = BY_BIZ[bizId].filter((r) => !G.recent.includes(r));
    const req = pick(fresh.length ? fresh : BY_BIZ[bizId]);
    G.recent.push(req);
    if (G.recent.length > 14) G.recent.shift();
    const powerKeys = G.mode === 'solo' ? ['freeze', 'hint', 'double', 'heart'] : ['freeze', 'hint', 'double'];
    const power = Math.random() < CFG.powerupChance ? pick(powerKeys) : null;
    return { req, power };
  }

  // ================================================================ Lane: one player's board
  class Lane {
    constructor(host, player, duel) {
      this.player = player;
      this.duel = duel;
      this.dead = false;
      this.build(host);
      Object.assign(this, {
        queue: [], score: 0, streak: 0, best: 0, routed: 0, wrong: 0, expired: 0,
        mistakes: {}, lastMissed: {}, routeTimes: [], bizRouted: new Set(), eventRouted: 0,
        hearts: CFG.hearts, freezeT: 0, doubleT: 0, hintN: 0, spawnT: 0.6, seqIdx: 0, out: false,
        statusText: '',
      });
      this.renderHud();
      this.renderFront();
      this.renderQueue();
    }

    build(host) {
      const root = el('div', `lane ${this.duel ? 'p' + this.player : 'solo'}`);
      const hud = el('div', 'lane-hud');
      this.leftEl = this.duel ? el('div', 'pname', `PLAYER ${this.player}`) : el('div', 'hearts');
      const sc = el('div', 'lane-score');
      sc.append(el('div', 'label', 'SCORE'));
      this.scoreEl = el('div', 'score', '0');
      sc.append(this.scoreEl);
      this.comboEl = el('div', 'combo', 'x1');
      hud.append(this.leftEl, sc, this.comboEl);

      const top = el('div', 'hubs top');
      const bottom = el('div', 'hubs bottom');
      this.hubs = {};
      BUSINESSES.forEach((b, i) => {
        const h = el('button', 'hub locked');
        h.type = 'button';
        h.style.setProperty('--biz', b.color);
        h.append(el('span', 'hub-icon', b.icon), el('span', 'hub-name', b.short || b.name));
        h.addEventListener('pointerdown', (e) => { e.preventDefault(); this.route(b.id); });
        this.hubs[b.id] = h;
        (i < Math.ceil(BUSINESSES.length / 2) ? top : bottom).append(h);
      });

      const stage = el('div', 'stage');
      this.statusEl = el('div', 'status');
      this.slot = el('div', 'card-slot');
      this.queueEl = el('div', 'queue');
      stage.append(this.statusEl, this.slot, this.queueEl);

      root.append(hud, top, stage, bottom);
      host.append(root);
      this.root = root;
    }

    setUnlocked(ids, animate) {
      for (const b of BUSINESSES) {
        const h = this.hubs[b.id];
        const wasLocked = h.classList.contains('locked');
        const locked = !ids.includes(b.id);
        h.classList.toggle('locked', locked);
        if (animate && wasLocked && !locked) restartAnim(h, 'unlocking');
      }
    }

    mult() { return Math.min(4, 1 + Math.floor(this.streak / 4)); }

    renderHud(breakIndex = -1) {
      if (!this.duel) {
        this.leftEl.replaceChildren();
        for (let i = 0; i < CFG.hearts; i++) {
          const h = el('span', '', '❤️');
          if (i >= this.hearts) h.classList.add('lost');
          if (i === breakIndex) h.classList.add('breaking');
          this.leftEl.append(h);
        }
      }
      this.scoreEl.textContent = this.score.toLocaleString();
      const m = this.mult();
      this.comboEl.textContent = m > 1 ? `🔥 x${m}` : 'x1';
      this.comboEl.classList.toggle('hot', m > 1);
    }

    toast(text, kind) {
      const t = el('div', `lane-toast ${kind}`, text);
      t.addEventListener('animationend', () => t.remove());
      this.root.append(t);
    }

    floatAt(node, text, neg) {
      const r = node.getBoundingClientRect();
      const f = el('div', 'float-pts' + (neg ? ' neg' : ''), text);
      f.style.left = `${r.left + r.width / 2}px`;
      f.style.top = `${r.top + r.height / 2}px`;
      f.addEventListener('animationend', () => f.remove());
      document.body.append(f);
    }

    flyTo(fromNode, hub, color) {
      if (!fromNode || !fromNode.isConnected) return;
      const a = fromNode.getBoundingClientRect();
      const b = hub.getBoundingClientRect();
      const f = el('div', 'fly');
      Object.assign(f.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`, background: color });
      document.body.append(f);
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      const anim = f.animate(
        [{ transform: 'translate(0,0) scale(1)', opacity: 0.95 }, { transform: `translate(${dx}px,${dy}px) scale(.06)`, opacity: 0.5 }],
        { duration: 320, easing: 'cubic-bezier(.5,0,.9,.6)' },
      );
      anim.onfinish = () => f.remove();
    }

    // ---- queue rendering
    renderFront() {
      for (const h of Object.values(this.hubs)) h.classList.remove('hint');
      this.slot.replaceChildren();
      const it = this.queue[0];
      if (!it) {
        this.cardEl = null;
        this.slot.append(el('div', 'empty-slot', 'Waiting for requests…'));
        return;
      }
      if (it.frontAt == null) it.frontAt = G.clock;
      const card = el('div', 'card enter');
      card.append(el('div', 'card-from', it.req.from || '📨 Request'), el('div', 'card-text', it.req.text));
      if (it.power) card.append(el('div', 'card-power', POWERS[it.power].icon));
      const bar = el('div', 'patience');
      it.fillEl = el('div', 'patience-fill');
      bar.append(it.fillEl);
      card.append(bar);
      this.slot.append(card);
      this.cardEl = card;
      if (this.hintN > 0) this.hubs[it.req.to].classList.add('hint');
    }

    renderQueue() {
      this.queueEl.replaceChildren();
      const waiting = this.queue.slice(1);
      if (!waiting.length) return;
      this.queueEl.append(el('div', 'label', 'NEXT'));
      for (const it of waiting) {
        const c = el('div', 'qchip');
        c.append(el('span', null, (it.req.from || '📨').split(' ')[0]));
        if (it.power) c.append(el('span', 'pw', POWERS[it.power].icon));
        const mini = el('div', 'mini');
        it.fillEl = el('div');
        mini.append(it.fillEl);
        c.append(mini);
        this.queueEl.append(c);
      }
    }

    paintPatience() {
      for (const it of this.queue) {
        if (!it.fillEl) continue;
        const p = Math.max(0, it.left / it.max);
        it.fillEl.style.transform = `scaleX(${p})`;
        it.fillEl.style.background = patienceColor(p);
      }
    }

    renderStatus() {
      const parts = [];
      if (this.freezeT > 0) parts.push(`❄️ ${this.freezeT.toFixed(1)}s`);
      if (this.doubleT > 0) parts.push(`⚡ x2 ${this.doubleT.toFixed(1)}s`);
      if (this.hintN > 0) parts.push(`💡 ×${this.hintN}`);
      const txt = parts.join('|');
      if (txt === this.statusText) return;
      this.statusText = txt;
      this.statusEl.replaceChildren(...parts.map((p) => el('span', null, p)));
      this.root.classList.toggle('frozen', this.freezeT > 0);
    }

    // ---- simulation
    update(dt, lvl) {
      if (this.out) return;
      const frozen = this.freezeT > 0;
      if (frozen) this.freezeT = Math.max(0, this.freezeT - dt);
      if (this.doubleT > 0) this.doubleT = Math.max(0, this.doubleT - dt);

      if (!frozen) this.spawnT -= dt;
      if (!this.queue.length) this.spawnT = Math.min(this.spawnT, 0.5);
      if (this.spawnT <= 0 && this.queue.length < CFG.maxQueue) {
        this.push(seqAt(this.seqIdx++), lvl);
        this.spawnT = lvl.spawnEvery * (G.event ? CFG.eventSpawnFactor : 1);
      }

      if (!frozen) for (const it of this.queue) if (!it.resolving) it.left -= dt;
      for (const it of this.queue.slice()) {
        if (!it.resolving && it.left <= 0) this.expire(it);
        if (this.out) return;
      }
      this.paintPatience();
      this.renderStatus();
    }

    push(seqItem, lvl) {
      this.queue.push({ req: seqItem.req, power: seqItem.power, max: lvl.patience, left: lvl.patience });
      if (this.queue.length === 1) this.renderFront();
      this.renderQueue();
    }

    advance() {
      if (this.hintN > 0) this.hintN--;
      this.queue.shift();
      this.renderFront();
      this.renderQueue();
    }

    addScore(delta) {
      this.score = Math.max(0, this.score + delta);
      this.renderHud();
    }

    route(id) {
      if (!G.running || G.paused || this.out || this.dead) return;
      const hub = this.hubs[id];
      if (hub.classList.contains('locked')) return;
      const it = this.queue[0];
      if (!it || it.resolving) return;
      Sound.unlock();

      if (it.req.to === id) {
        this.streak++;
        this.best = Math.max(this.best, this.streak);
        this.routed++;
        this.bizRouted.add(id);
        this.routeTimes.push(G.clock - it.frontAt);
        const m = this.mult();
        let pts = (100 + Math.round(100 * Math.max(0, it.left) / it.max)) * m;
        if (this.doubleT > 0) pts *= 2;
        if (G.event) { pts *= 2; this.eventRouted++; }
        this.addScore(pts);
        this.flyTo(this.cardEl, hub, BIZ[id].color);
        restartAnim(hub, 'hit');
        this.floatAt(hub, `+${pts.toLocaleString()}`);
        Sound.route();
        if (this.streak % 4 === 0 && this.streak <= 12) {
          Sound.combo();
          restartAnim(this.comboEl, 'bump');
          this.toast(`🔥 COMBO x${m}!`, 'good');
        }
        if (it.power) this.activate(it.power);
        this.advance();
      } else {
        this.miss(it, hub, 'wrong');
      }
    }

    // Wrong route (or the front request expiring): show the right answer, then move on.
    miss(it, hub, why) {
      it.resolving = true;
      this.streak = 0;
      const to = it.req.to;
      this.mistakes[to] = (this.mistakes[to] || 0) + 1;
      this.lastMissed[to] = it.req.text;
      if (why === 'wrong') { this.wrong++; Sound.wrong(); } else { this.expired++; Sound.expire(); }

      if (this.duel) {
        const pen = why === 'wrong' ? CFG.duel.wrongPenalty : CFG.duel.expirePenalty;
        this.addScore(-pen); // also refreshes the combo display
        this.floatAt(hub || this.hubs[to], `-${pen}`, true);
      } else {
        this.loseHeart(); // also refreshes the combo display
      }
      if (hub) restartAnim(hub, 'miss');
      const right = this.hubs[to];
      right.classList.add('reveal');
      if (this.cardEl) {
        restartAnim(this.cardEl, 'shake');
        const tip = el('div', 'card-tip', `${why === 'wrong' ? '💡' : '😤 Too slow!'} ${it.req.tip || `${BIZ[to].icon} ${BIZ[to].short || BIZ[to].name}: ${BIZ[to].role}`}`);
        this.cardEl.append(tip);
      }

      setTimeout(() => {
        if (this.dead) return;
        right.classList.remove('reveal');
        if (hub) hub.classList.remove('miss');
        this.flyTo(this.cardEl, right, '#888');
        if (this.queue[0] === it) this.advance();
      }, CFG.wrongRevealMs);
    }

    expire(it) {
      if (it === this.queue[0]) { this.miss(it, null, 'expire'); return; }
      // a waiting request gave up before the player reached it
      this.expired++;
      this.streak = 0;
      this.queue.splice(this.queue.indexOf(it), 1);
      this.renderQueue();
      Sound.expire();
      this.toast(`😤 ${(it.req.from || 'Someone').replace(/^\S+\s/, '')} gave up waiting!`, 'bad');
      if (this.duel) this.addScore(-CFG.duel.expirePenalty);
      else this.loseHeart();
    }

    loseHeart() {
      this.hearts = Math.max(0, this.hearts - 1);
      this.renderHud(this.hearts);
      restartAnim($('#flash'), 'on');
      if (this.hearts <= 0 && !this.out) {
        this.out = true;
        setTimeout(() => { if (!this.dead) onLaneOut(this); }, 900);
      }
    }

    activate(power) {
      if (power === 'freeze') this.freezeT = 5;
      else if (power === 'hint') this.hintN = 4; // includes the card being resolved now
      else if (power === 'double') this.doubleT = 8;
      else if (power === 'heart') { this.hearts = Math.min(CFG.hearts, this.hearts + 1); this.renderHud(); }
      Sound.power();
      this.toast(POWERS[power].label, 'power');
    }
  }

  // ================================================================ flow: setup / loop / levels / events
  function teardown() {
    G.runId++;
    G.running = false;
    cancelAnimationFrame(G.raf);
    for (const l of G.lanes) l.dead = true;
    G.lanes = [];
    G.event = null;
    document.body.classList.remove('rush');
    $('#levelCard').hidden = true;
    $('#banner').hidden = true;
    clearTimeout(G.idleTimer);
  }

  function goAttract(highlightId) {
    teardown();
    resetReady();
    renderLeaderboard(highlightId);
    show('attract');
    demo.start();
  }

  async function startGame(mode) {
    teardown();
    demo.stop();
    Sound.unlock();
    tryFullscreen();
    const id = G.runId;
    G.mode = mode;

    show('countdown');
    const n = $('#countNum');
    for (const t of ['3', '2', '1', 'GO!']) {
      n.textContent = t;
      restartAnim(n, 'pop');
      if (t === 'GO!') Sound.go(); else Sound.count();
      await wait(t === 'GO!' ? 600 : 750);
      if (id !== G.runId) return;
    }

    G.levels = levelsFor(mode);
    Object.assign(G, { levelIdx: 0, levelTime: 0, clock: 0, seq: [], recent: [], event: null, eventPlan: null });
    G.usedEvents = new Set();
    G.unlocked = unlockedThrough(0);
    $('#lvlName').dataset.idx = '';

    const arena = $('#arena');
    arena.replaceChildren();
    arena.className = mode;
    G.lanes = mode === 'solo'
      ? [new Lane(arena, 0, false)]
      : [new Lane(arena, 1, true), new Lane(arena, 2, true)];
    G.lanes.forEach((l) => l.setUnlocked(G.unlocked, false));

    const prog = $('#progress');
    prog.replaceChildren();
    for (const l of G.levels) {
      const s = el('div', 'seg');
      s.style.setProperty('--w', l.duration);
      s.append(el('div'));
      prog.append(s);
    }
    planEvent();
    show('play');
    renderTopbar();

    G.running = true;
    G.last = performance.now();
    G.raf = requestAnimationFrame(frame);
    if (mode === 'solo') levelIntro(0);
    else banner(G.levels[0].name, unlockedNames(G.levels[0].unlock));
  }

  function frame() {
    if (!G.running) return;
    const now = performance.now();
    const dt = Math.max(0, Math.min(0.1, (now - G.last) / 1000));
    G.last = now;
    if (!G.paused) step(dt);
    if (G.running) G.raf = requestAnimationFrame(frame);
  }

  function step(dt) {
    const lvl = G.levels[G.levelIdx];
    G.clock += dt;
    G.levelTime += dt;
    updateEvent(dt, lvl);
    for (const l of G.lanes) l.update(dt, lvl);
    renderTopbar();
    if (G.running && G.levelTime >= lvl.duration) nextLevel();
  }

  function renderTopbar() {
    const lvl = G.levels[G.levelIdx];
    const name = $('#lvlName');
    if (name.dataset.idx !== String(G.levelIdx)) {
      name.dataset.idx = String(G.levelIdx);
      name.replaceChildren(lvl.name, el('small', null, lvl.subtitle || ''));
    }
    const left = lvl.duration - G.levelTime;
    const tEl = $('#lvlTime');
    tEl.textContent = fmtTime(left);
    tEl.classList.toggle('low', left <= 5);
    [...$('#progress').children].forEach((seg, i) => {
      const p = i < G.levelIdx ? 1 : i > G.levelIdx ? 0 : Math.min(1, G.levelTime / lvl.duration);
      seg.firstChild.style.transform = `scaleX(${p})`;
    });
    const bar = $('#eventBar');
    if (G.event) {
      bar.textContent = `${G.event.name}  ×2 POINTS  ${Math.ceil(G.event.left)}s`;
      bar.hidden = false;
      $('#progress').hidden = true;
    } else if (!bar.hidden) {
      bar.hidden = true;
      $('#progress').hidden = false;
    }
  }

  const unlockedNames = (ids) => 'Unlocked: ' + (ids || []).filter((id) => BIZ[id]).map((id) => `${BIZ[id].icon} ${BIZ[id].short || BIZ[id].name}`).join('  ');

  function nextLevel() {
    if (G.levelIdx >= G.levels.length - 1) { finish(true); return; }
    G.levelIdx++;
    G.levelTime = 0;
    endEvent();
    G.unlocked = unlockedThrough(G.levelIdx);
    G.lanes.forEach((l) => l.setUnlocked(G.unlocked, true));
    planEvent();
    Sound.levelUp();
    if (G.mode === 'solo') levelIntro(G.levelIdx);
    else banner(G.levels[G.levelIdx].name, unlockedNames(G.levels[G.levelIdx].unlock));
  }

  function levelIntro(idx) {
    const id = G.runId;
    const lvl = G.levels[idx];
    G.paused = true;
    $('#lcLabel').textContent = idx === 0 ? 'YOUR FIRST SHIFT' : 'LEVEL UP!';
    $('#lcTitle').textContent = lvl.name;
    $('#lcSub').textContent = idx === 0
      ? `${lvl.subtitle} — route each request to one of these businesses:`
      : `${lvl.subtitle} — new businesses join the board:`;
    const tiles = $('#lcTiles');
    tiles.replaceChildren();
    (lvl.unlock || []).filter((x) => BIZ[x]).forEach((bid, i) => {
      const b = BIZ[bid];
      const t = el('div', 'lc-tile');
      t.style.setProperty('--biz', b.color);
      t.style.animationDelay = `${0.2 + i * 0.15}s`;
      t.append(el('div', 'i', b.icon), el('div', 'n', b.name), el('div', 'r', b.role));
      tiles.append(t);
    });
    const card = $('#levelCard');
    card.hidden = false;
    if (idx > 0) Confetti.burst(80);
    const shownAt = performance.now();
    const done = () => {
      if (id !== G.runId || card.hidden) return;
      card.hidden = true;
      card.onclick = null;
      G.paused = false;
      G.last = performance.now();
    };
    card.onclick = () => { if (performance.now() - shownAt > 800) { Sound.tap(); done(); } };
    setTimeout(done, 9000);
  }

  function banner(title, sub) {
    const b = $('#banner');
    b.replaceChildren(title);
    if (sub) b.append(el('small', null, sub));
    b.hidden = false;
    restartAnim(b, 'banner');
    clearTimeout(b._t);
    b._t = setTimeout(() => { b.hidden = true; }, 2400);
  }

  function planEvent() {
    G.eventPlan = null;
    const lvl = G.levels[G.levelIdx];
    if (!lvl.event) return;
    const available = EVENTS.filter((e) => !G.usedEvents.has(e.name) && e.bias.every((id) => G.unlocked.includes(id)));
    if (!available.length) return;
    const fresh = available.filter((e) => e.bias.some((id) => (lvl.unlock || []).includes(id)));
    const ev = pick(fresh.length ? fresh : available);
    G.eventPlan = { ev, at: lvl.duration * (0.3 + Math.random() * 0.3) };
  }

  function updateEvent(dt, lvl) {
    if (G.event) {
      G.event.left -= dt;
      if (G.event.left <= 0) endEvent();
      return;
    }
    const p = G.eventPlan;
    if (p && G.levelTime >= p.at && G.levelTime + CFG.eventDuration < lvl.duration) {
      G.event = Object.assign({}, p.ev, { left: CFG.eventDuration });
      G.usedEvents.add(p.ev.name);
      G.eventPlan = null;
      document.body.classList.add('rush');
      Sound.alarm();
      banner(p.ev.name, 'RUSH! Requests flood in — double points!');
    }
  }

  function endEvent() {
    G.event = null;
    document.body.classList.remove('rush');
  }

  function onLaneOut() {
    if (G.mode === 'solo') finish(false);
  }

  // ================================================================ results
  function laneStats(l) {
    const attempts = l.routed + l.wrong + l.expired;
    const accuracy = attempts ? Math.round((100 * l.routed) / attempts) : 0;
    const avg = l.routeTimes.length ? l.routeTimes.reduce((a, b) => a + b, 0) / l.routeTimes.length : null;
    let blind = null;
    for (const [id, n] of Object.entries(l.mistakes)) if (!blind || n > l.mistakes[blind]) blind = id;
    return { attempts, accuracy, avg, blind };
  }

  function finish(completed) {
    if (!G.running) return;
    G.running = false;
    cancelAnimationFrame(G.raf);
    endEvent();
    for (const l of G.lanes) l.dead = true;
    $('#levelCard').hidden = true;
    const lanes = G.lanes;
    if (G.mode === 'solo') soloResults(lanes[0], completed);
    else duelResults(lanes[0], lanes[1]);
  }

  async function soloResults(l, completed) {
    const id = G.runId;
    const s = laneStats(l);
    const bonus = completed ? l.hearts * 200 : 0;
    G.finalScore = l.score + bonus;
    G.finalAcc = s.accuracy;
    if (window.Passport) window.Passport.stamp('route-rush', G.finalScore);

    const title = $('#soTitle');
    title.textContent = completed ? 'SHIFT COMPLETE!' : 'OUT OF HEARTS!';
    title.className = completed ? 'win' : 'lose';
    $('#soSub').textContent = completed
      ? `You survived all ${G.levels.length} levels as dispatcher`
      : `You reached ${G.levels[G.levelIdx].name} — ${G.levels[G.levelIdx].subtitle || ''}`;
    $('#soScore').textContent = '0';
    $('#soBonus').textContent = '';
    $('#stRouted').textContent = l.routed;
    $('#stAcc').textContent = `${s.accuracy}%`;
    $('#stStreak').textContent = l.best;
    $('#stSpeed').textContent = s.avg == null ? '–' : `${s.avg.toFixed(1)}s`;
    renderBlindSpot($('#blind'), l, s.blind);
    renderSoloBadges(l, s, completed);

    const qualifies = isHighScore(G.finalScore);
    $('#saveBtn').hidden = !qualifies;
    $('#againBtn').hidden = qualifies;

    show('soloOver');
    if (completed) Sound.win(); else Sound.gameover();
    animateNumber($('#soScore'), 0, l.score, 1200);
    armIdle();
    if (bonus) {
      await wait(1400);
      if (id !== G.runId) return;
      $('#soBonus').textContent = `+${bonus.toLocaleString()} survival bonus (${l.hearts} ❤️ × 200)`;
      animateNumber($('#soScore'), l.score, G.finalScore, 800);
      Confetti.burst(180);
    } else if (qualifies) {
      Confetti.burst(100);
    }
  }

  function renderBlindSpot(box, l, blindId) {
    box.replaceChildren();
    if (!blindId) {
      box.style.setProperty('--biz', '#2ee59d');
      box.append(el('div', 'label', '🎯 YOUR BLIND SPOT'), el('div', 'bn', '🏅 None — flawless routing!'),
        el('div', 'br', 'You know exactly who does what across The Cigna Group.'));
      return;
    }
    const b = BIZ[blindId];
    box.style.setProperty('--biz', b.color);
    const head = el('div', 'bh');
    const txt = el('div');
    txt.append(el('div', 'bn', b.name), el('div', 'br', b.role));
    head.append(el('div', 'bi', b.icon), txt);
    box.append(el('div', 'label', '🎯 YOUR BLIND SPOT'), head);
    if (l.lastMissed[blindId]) box.append(el('div', 'bx', `You missed: “${l.lastMissed[blindId]}”`));
  }

  function renderSoloBadges(l, s, completed) {
    const list = [];
    if (l.wrong + l.expired === 0 && l.routed >= 10) list.push('🏅 Flawless Dispatcher');
    if (completed) list.push('🛡️ Survivor');
    if (l.bizRouted.size === BUSINESSES.length) list.push('🗺️ Full Map');
    if (l.best >= 12) list.push('🔥 Combo King');
    if (s.avg != null && s.avg < 2.5 && l.routed >= 10) list.push('⚡ Speed Router');
    if (l.eventRouted >= 5) list.push('🚨 Rush Hero');
    if (!list.length) list.push('🎯 Dispatcher in Training');
    const box = $('#soBadges');
    box.replaceChildren();
    list.forEach((t, i) => {
      const b = el('span', 'badge', t);
      b.style.animationDelay = `${0.8 + i * 0.2}s`;
      box.append(b);
    });
  }

  function duelResults(a, b) {
    const sa = laneStats(a);
    const sb = laneStats(b);
    const winner = a.score === b.score ? 0 : a.score > b.score ? 1 : 2;
    if (window.Passport) window.Passport.stamp('route-rush', Math.max(a.score, b.score));
    const title = $('#duTitle');
    title.textContent = winner ? `PLAYER ${winner} WINS!` : "IT'S A DRAW!";
    title.className = winner ? `p${winner}` : 'draw';
    fillDuelCol($('#du1'), a, sa, winner === 1);
    fillDuelCol($('#du2'), b, sb, winner === 2);
    show('duelOver');
    Sound.win();
    Confetti.burst(160, winner === 2 ? innerWidth * 0.75 : winner === 1 ? innerWidth * 0.25 : innerWidth / 2);
    armIdle();
  }

  function fillDuelCol(col, l, s, isWinner) {
    col.replaceChildren();
    col.classList.toggle('winner', isWinner);
    if (isWinner) col.append(el('div', 'crown', '👑'));
    col.append(el('div', 'who', `PLAYER ${l.player}`), el('div', 'big', l.score.toLocaleString()));
    const rows = [
      ['Routed', l.routed],
      ['Accuracy', `${s.accuracy}%`],
      ['Best streak', l.best],
      ['Avg route', s.avg == null ? '–' : `${s.avg.toFixed(1)}s`],
    ];
    for (const [k, v] of rows) {
      const r = el('div', 'row');
      r.append(el('span', null, k), el('b', null, String(v)));
      col.append(r);
    }
    col.append(el('div', 'weak', s.blind
      ? `🎯 Blind spot: ${BIZ[s.blind].icon} ${BIZ[s.blind].name}`
      : '🏅 No blind spots!'));
  }

  function animateNumber(node, from, to, ms) {
    cancelAnimationFrame(node._raf);
    const t0 = performance.now();
    const stepFn = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      node.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))).toLocaleString();
      if (p < 1) node._raf = requestAnimationFrame(stepFn);
    };
    node._raf = requestAnimationFrame(stepFn);
  }

  // ================================================================ duel ready screen
  const readyState = new Set();
  function resetReady() {
    readyState.clear();
    document.querySelectorAll('.ready-btn').forEach((b) => {
      b.classList.remove('on');
      b.querySelector('small').textContent = 'Tap when ready';
    });
  }
  function goReady() {
    demo.stop();
    resetReady();
    show('ready');
    armIdle();
  }
  document.querySelectorAll('.ready-btn').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (G.screen !== 'ready') return;
      Sound.unlock();
      Sound.tap();
      readyState.add(btn.dataset.p);
      btn.classList.add('on');
      btn.querySelector('small').textContent = 'READY!';
      if (readyState.size === 2) setTimeout(() => { if (G.screen === 'ready') startGame('duel'); }, 500);
    });
  });

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
    const entry = addScore(G.name, G.finalScore, G.finalAcc);
    Sound.route();
    goAttract(entry.id);
  }

  // ================================================================ attract demo (teaches while idle)
  const demo = (() => {
    let timer = 0;
    let on = false;
    async function cycle() {
      if (!on || !REQUESTS.length) return;
      const r = pick(REQUESTS);
      const b = BIZ[r.to];
      const card = document.querySelector('.demo-card');
      $('#demoFrom').textContent = r.from || '📨 Request';
      $('#demoText').textContent = r.text;
      restartAnim(card, 'enter');
      const ans = $('#demoAnswer');
      ans.classList.remove('show');
      ans.style.setProperty('--biz', b.color);
      ans.textContent = `→ ${b.icon} ${b.name}`;
      timer = setTimeout(() => {
        if (!on) return;
        restartAnim(ans, 'show');
        timer = setTimeout(cycle, 2600);
      }, 2000);
    }
    return {
      start() { if (on) return; on = true; cycle(); },
      stop() { on = false; clearTimeout(timer); },
    };
  })();

  // ================================================================ kiosk helpers
  function armIdle() {
    clearTimeout(G.idleTimer);
    G.idleTimer = setTimeout(() => {
      if (['soloOver', 'duelOver', 'entry', 'ready'].includes(G.screen)) goAttract();
    }, CFG.resultTimeoutSec * 1000);
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
    t._t = setTimeout(() => { t.hidden = true; }, 2500);
  }

  // Multi-touch test (staff: press T)
  const touchTest = (() => {
    const box = $('#touchTest');
    const dots = new Map();
    let max = 0;
    const update = () => {
      $('#ttNow').textContent = dots.size;
      $('#ttMax').textContent = max;
      $('#ttVerdict').textContent = max >= 2
        ? '✅ Multi-touch works — Duel Mode is good to go!'
        : 'Waiting for 2+ simultaneous touches…';
    };
    box.addEventListener('pointerdown', (e) => {
      const d = el('div', 'tt-dot');
      d.style.left = `${e.clientX}px`;
      d.style.top = `${e.clientY}px`;
      box.append(d);
      dots.set(e.pointerId, d);
      max = Math.max(max, dots.size);
      update();
    });
    box.addEventListener('pointermove', (e) => {
      const d = dots.get(e.pointerId);
      if (d) { d.style.left = `${e.clientX}px`; d.style.top = `${e.clientY}px`; }
    });
    const up = (e) => { const d = dots.get(e.pointerId); if (d) { d.remove(); dots.delete(e.pointerId); update(); } };
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
    return {
      get open() { return !box.hidden; },
      toggle() {
        box.hidden = !box.hidden;
        dots.forEach((d) => d.remove());
        dots.clear();
        max = 0;
        update();
      },
    };
  })();

  // ================================================================ wiring
  $('#soloBtn').addEventListener('click', () => startGame('solo'));
  $('#duelBtn').addEventListener('click', goReady);
  $('#readyBack').addEventListener('click', () => goAttract());
  $('#saveBtn').addEventListener('click', goEntry);
  $('#againBtn').addEventListener('click', () => startGame('solo'));
  $('#homeBtn').addEventListener('click', () => goAttract());
  $('#rematchBtn').addEventListener('click', () => startGame('duel'));
  $('#duHomeBtn').addEventListener('click', () => goAttract());
  $('#skipBtn').addEventListener('click', () => goAttract());

  document.addEventListener('pointerdown', () => {
    if (['soloOver', 'duelOver', 'entry', 'ready'].includes(G.screen)) armIdle();
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // Staff shortcuts (needs a keyboard): Esc = home, M = mute, T = multi-touch test, Ctrl+Shift+X twice = clear leaderboard
  let clearArmed = 0;
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') { if (touchTest.open) touchTest.toggle(); else goAttract(); }
    else if (k === 't' && !e.ctrlKey && G.screen !== 'entry') touchTest.toggle();
    else if (k === 'm' && !e.ctrlKey && G.screen !== 'entry') toast(Sound.toggle() ? '🔊 Sound on' : '🔇 Sound off');
    else if (e.ctrlKey && e.shiftKey && k === 'x') {
      if (Date.now() - clearArmed < 3000) {
        window.Leaderboard.clear(LB_KEY);
        renderLeaderboard();
        toast('Leaderboard cleared');
        clearArmed = 0;
      } else {
        clearArmed = Date.now();
        toast('Press Ctrl+Shift+X again to clear the leaderboard');
      }
    }
  });

  document.title = CFG.title;
  $('#title').textContent = CFG.title;
  $('#subtitle').textContent = CFG.subtitle;
  buildKeys();
  goAttract();
  // shared scores arrived: refresh the board, unless it is showing a just-saved score
  window.Leaderboard.onChange(() => { if (G.screen === 'attract' && !$('#lb .new')) renderLeaderboard(); });
  // warn before leaving for the Arcade mid-game or with an unsaved score (Duel scores are never saved)
  window.Passport.setLeaveGuard(() => {
    if (['countdown', 'play'].includes(G.screen)) return 'playing';
    if (G.screen === 'entry' || (G.screen === 'soloOver' && !$('#saveBtn').hidden)) return 'unsaved';
    return null;
  });
})();
