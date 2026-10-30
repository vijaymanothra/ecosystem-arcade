(() => {
  'use strict';

  // ================================================================ config + content
  const CFG = Object.assign({
    title: 'CASE FILES',
    tagline: '',
    casesPerGame: 2,
    folderChoices: 3,
    stepPoints: [200, 100, 0],
    speedBonus: [[8, 100], [15, 50]],
    perfectCaseBonus: 300,
    evidenceSec: 3.2,
    idleHintSec: 25,
    idleAbandonSec: 120,
    resultTimeoutSec: 60,
    leaderboardSize: 10,
    leaderboardScope: 'today',
    sound: true,
    ranks: [[0, 'Rookie', '🔰'], [800, 'Sleuth', '🔎'], [1600, 'Detective', '🕵️'], [2400, 'Inspector', '🎖️'], [3000, 'Chief Inspector', '👑']],
  }, window.CF_CONFIG || {});

  const BUSINESSES = window.QUIZ_BUSINESSES || [];
  const BIZ = Object.fromEntries(BUSINESSES.map((b) => [b.id, b]));
  const CASES = (window.CF_CASES || []).map((c, i) => Object.assign({ num: i + 1 }, c, { steps: (c.steps || []).filter((s) => BIZ[s.to]) }))
    .filter((c) => c.steps.length);
  const ROLES = {
    cigna: 'Health insurance', express: 'Pharmacy benefits + home delivery', accredo: 'Specialty pharmacy',
    enguide: 'GLP-1 home delivery', freedom: 'Online fertility pharmacy', vfp: 'Fertility pharmacy · on-site pickup',
    mdlive: '24/7 virtual care', ebcg: 'In-person & virtual therapy', evicore: 'Prior authorization', curascript: 'Specialty distribution',
  };
  const LB_KEY = 'caseFiles.leaderboard.v1';
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
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const restartAnim = (node, cls) => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };
  const fmtTime = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const caseCode = (c) => `CASE #${String(c.num).padStart(3, '0')}`;

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
      g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    return {
      unlock,
      toggle() { enabled = !enabled; return enabled; },
      key() { tone(1800 + Math.random() * 600, 0.02, 'square', 0, 0.035); },
      ding() { tone(2093, 0.4, 'sine', 0, 0.12); },
      paper() { tone(500, 0.18, 'sawtooth', 0, 0.03, 2500); },
      folder() { tone(220, 0.12, 'triangle', 0, 0.15, 160); tone(600, 0.2, 'sine', 0.05, 0.05, 1600); },
      grab() { tone(300, 0.1, 'triangle', 0, 0.08, 500); },
      pin() { tone(140, 0.12, 'triangle', 0, 0.3, 70); tone(1400, 0.08, 'square', 0.02, 0.05); },
      twang() { tone(196, 0.5, 'triangle', 0, 0.16, 392); },
      correct() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.15, 'triangle', 0.1 + i * 0.07, 0.18)); },
      wrong() { tone(196, 0.35, 'sawtooth', 0, 0.12, 98); tone(1200, 0.15, 'sine', 0, 0.05, 300); },
      reveal() { [392, 494, 587].forEach((f, i) => tone(f, 0.2, 'triangle', i * 0.12, 0.14)); },
      stamp() { tone(90, 0.25, 'triangle', 0, 0.35, 50); tone(180, 0.1, 'square', 0, 0.08); },
      fanfare() { [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', i * 0.12, 0.18)); },
    };
  })();

  // ================================================================ confetti
  const Confetti = (() => {
    const cv = $('#fx');
    const cx = cv.getContext('2d');
    const colors = ['#d62828', '#ffcf4a', '#f7f0dc', '#2ee59d', '#e9c98a'];
    let parts = [];
    let running = false;
    function resize() { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; }
    addEventListener('resize', resize);
    resize();
    function burst(n = 120, x = innerWidth / 2, y = innerHeight / 3) {
      for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 22, vy: -Math.random() * 18 - 4, s: 8 + Math.random() * 10, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[i % colors.length] });
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
  function addScore(name, score, rank) {
    const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, score, rank, day: today() };
    return window.Leaderboard.add(LB_KEY, entry);
  }
  function renderLeaderboard(highlightId) {
    $('#lbTitle').textContent = CFG.leaderboardScope === 'today' ? "🏆 Today's Top Detectives" : '🏆 Top Detectives';
    const ol = $('#lb');
    ol.replaceChildren();
    // staff paused this leaderboard from the admin page: scores are kept, just not shown
    if (window.Leaderboard.isHidden(LB_KEY)) { ol.append(el('li', 'empty', '🔒 Leaderboard paused by staff')); return; }
    const lb = boardEntries();
    if (!lb.length) { ol.append(el('li', 'empty', 'No cases closed yet. The city needs you, detective.')); return; }
    lb.forEach((e, i) => {
      const li = el('li', e.id === highlightId ? 'new' : '');
      li.append(el('span', 'rank', i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`), el('span', 'name', `Det. ${e.name}`), el('span', 'rk', e.rank || ''), el('span', 'pts', e.score.toLocaleString()));
      ol.append(li);
    });
  }

  // ================================================================ state
  const screens = ['attract', 'desk', 'briefing', 'board', 'closed', 'report', 'entry'];
  const G = {
    screen: 'attract',
    runId: 0,
    done: [],          // closed case results
    offered: [],
    kase: null,
    stepIdx: 0,
    tries: 0,
    chain: [],
    links: [],
    nodes: {},
    canPlay: false,
    drag: null,
    score: 0,
    caseScore: 0,
    caseMistakes: 0,
    firstTry: 0,
    totalSteps: 0,
    stepTimes: [],
    reveals: 0,
    caseStart: 0,
    stepStart: 0,
    lastMove: 0,
    lastTouch: 0,
    hintShown: false,
    skipType: false,
    tick: 0,
    idleTimer: 0,
    name: '',
  };
  const step = () => G.kase.steps[G.stepIdx];

  function show(name) {
    for (const s of screens) $('#' + s).hidden = s !== name;
    G.screen = name;
  }

  // ================================================================ typewriter
  function typeText(node, text, speed = 16) {
    return new Promise((resolve) => {
      const id = G.runId;
      node.textContent = '';
      node.classList.add('caret');
      G.skipType = false;
      let i = 0;
      const t = setInterval(() => {
        if (id !== G.runId) { clearInterval(t); resolve(); return; }
        i = G.skipType ? text.length : i + 1;
        node.textContent = text.slice(0, i);
        if (i % 3 === 0) Sound.key();
        if (i >= text.length) {
          clearInterval(t);
          node.classList.remove('caret');
          G.skipType = false;
          resolve();
        }
      }, speed);
    });
  }

  // ================================================================ attract + desk
  function goAttract(highlightId) {
    G.runId++;
    G.canPlay = false;
    clearInterval(G.tick);
    clearTimeout(G.idleTimer);
    renderLeaderboard(highlightId);
    show('attract');
  }

  function startGame() {
    Sound.unlock();
    tryFullscreen();
    G.runId++;
    Object.assign(G, { done: [], score: 0, firstTry: 0, totalSteps: 0, stepTimes: [], reveals: 0, lastTouch: performance.now() });
    goDesk();
  }

  function goDesk() {
    const remaining = CASES.filter((c) => !G.done.some((d) => d.kase === c));
    G.offered = shuffle(remaining).slice(0, CFG.folderChoices);
    $('#deskCount').textContent = `CASE ${G.done.length + 1} OF ${CFG.casesPerGame}`;
    const box = $('#folders');
    box.replaceChildren();
    G.offered.forEach((c, i) => {
      const f = el('button', 'folder');
      f.type = 'button';
      f.style.transform = `rotate(${(i - 1) * 3 + (Math.random() - 0.5) * 2}deg)`;
      f.style.animationDelay = `${i * 0.12}s`;
      f.append(
        el('div', 'fcode', caseCode(c)),
        el('div', 'ficon', c.icon),
        el('div', 'fstamp', 'UNSOLVED'),
        el('div', 'ftitle', c.title),
        el('div', 'fpatient', `${c.patient.icon} ${c.patient.name}`),
        el('div', 'fsteps', `${c.steps.length} clues · ${'🔍'.repeat(Math.min(5, c.steps.length - 2))}`),
      );
      f.addEventListener('click', () => openCase(c));
      box.append(f);
    });
    show('desk');
    Sound.folder();
    armIdle();
  }

  async function openCase(c) {
    const id = G.runId;
    Sound.folder();
    G.kase = c;
    $('#brCode').textContent = `${caseCode(c)} · CONFIDENTIAL`;
    $('#brPhoto').textContent = c.patient.icon;
    $('#brName').textContent = c.patient.name;
    $('#brTag').textContent = c.patient.tag || '';
    $('#brTitle').textContent = c.title;
    const st = $('#brSteps');
    st.replaceChildren(el('b', null, 'Clues to solve:'));
    c.steps.forEach(() => st.append(el('span', null, '?')));
    show('briefing');
    armIdle();
    await typeText($('#brIntro'), c.intro, 14);
    if (id !== G.runId) return;
  }

  // ================================================================ board
  const COLS_X = [29, 44.5, 60, 75.5, 91];
  const ROWS_Y = [28, 72];

  function buildBoard() {
    const nodes = $('#nodes');
    nodes.replaceChildren();
    $('#strings').replaceChildren();
    G.nodes = {};
    G.links = [];

    const p = el('div', 'node patient polaroid');
    p.style.left = '11%';
    p.style.top = '50%';
    p.style.setProperty('--rot', '-4deg');
    p.append(el('div', 'ph', G.kase.patient.icon), el('div', 'cap', G.kase.patient.name), el('div', 'tag', G.kase.patient.tag || ''));
    nodes.append(p);
    G.nodes.patient = p;

    shuffle(BUSINESSES).forEach((b, i) => {
      const c = el('div', 'node card');
      c.dataset.id = b.id;
      c.style.setProperty('--bc', b.color);
      c.style.setProperty('--rot', `${(Math.random() - 0.5) * 7}deg`);
      c.style.left = `${COLS_X[i % 5] + (Math.random() - 0.5) * 2.5}%`;
      c.style.top = `${ROWS_Y[Math.floor(i / 5) % 2] + (Math.random() - 0.5) * 5}%`;
      c.append(el('div', 'tape'), el('div', 'ci', b.icon), el('div', 'cn', b.short || b.name), el('div', 'cr', ROLES[b.id] || b.group || ''));
      nodes.append(c);
      G.nodes[b.id] = c;
    });
  }

  function startInvestigation() {
    if (!G.kase) return;
    Sound.paper();
    G.runId++;
    G.stepIdx = 0;
    G.chain = ['patient'];
    G.caseScore = 0;
    G.caseMistakes = 0;
    G.caseStart = performance.now();
    $('#bdCode').textContent = caseCode(G.kase);
    $('#bdTitle').textContent = `${G.kase.icon} ${G.kase.title}`;
    $('#evidence').replaceChildren();
    $('#dragHint').hidden = false;
    show('board');
    buildBoard();
    renderFoot();
    const id = G.runId;
    clearInterval(G.tick);
    G.tick = setInterval(() => {
      if (id !== G.runId) { clearInterval(G.tick); return; }
      $('#bdTime').textContent = fmtTime((performance.now() - G.caseStart) / 1000);
      const now = performance.now();
      if (now - G.lastTouch > CFG.idleAbandonSec * 1000) { goAttract(); return; }
      if (G.canPlay && !G.hintShown && now - G.lastMove > CFG.idleHintSec * 1000) showHint(true);
    }, 250);
    presentStep();
  }

  async function presentStep() {
    const id = G.runId;
    const s = step();
    G.tries = 0;
    G.hintShown = false;
    setActive(G.chain[G.chain.length - 1]);
    const sticky = $('#sticky');
    sticky.classList.remove('evidence-mode');
    restartAnim(sticky, 'flip');
    $('#clueLabel').textContent = `🔎 CLUE ${G.stepIdx + 1} OF ${G.kase.steps.length}`;
    $('#hint').hidden = true;
    G.canPlay = true;
    G.stepStart = performance.now();
    G.lastMove = performance.now();
    await typeText($('#clueText'), s.clue);
    if (id !== G.runId) return;
  }

  function setActive(id) {
    Object.values(G.nodes).forEach((n) => n.classList.remove('active'));
    if (G.nodes[id]) G.nodes[id].classList.add('active');
  }

  function showHint(free) {
    const b = BIZ[step().to];
    const h = $('#hint');
    h.textContent = free
      ? `💡 Stuck? Look for a ${String(b.group || 'business').toLowerCase()} business.`
      : `🔎 Hint: it's a ${String(b.group || 'business').toLowerCase()} business.`;
    h.hidden = false;
    restartAnim(h, 'hint');
    G.hintShown = true;
  }

  function renderFoot(bump) {
    const s = $('#bdScore');
    s.textContent = (G.score + G.caseScore).toLocaleString();
    $('#bdMistakes').textContent = G.caseMistakes;
    if (bump) restartAnim(s, 'bump');
  }

  // ---- string geometry
  function anchor(id) {
    const n = G.nodes[id];
    const cr = $('#cork').getBoundingClientRect();
    const r = n.getBoundingClientRect();
    return { x: r.left + r.width / 2 - cr.left, y: r.top + Math.min(14, r.height * 0.08) - cr.top };
  }
  function stringPath(a, b) {
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 + Math.min(110, dist * 0.18);
    return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }
  function newPath(cls) {
    const p = document.createElementNS(NS, 'path');
    if (cls) p.setAttribute('class', cls);
    $('#strings').append(p);
    return p;
  }
  function drawLink(from, to, animate) {
    const p = newPath();
    p.setAttribute('d', stringPath(anchor(from), anchor(to)));
    p.dataset.from = from;
    p.dataset.to = to;
    if (animate) {
      const len = p.getTotalLength();
      p.style.setProperty('--len', len);
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
      p.classList.add('draw');
      p.addEventListener('animationend', () => { p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; p.classList.remove('draw'); }, { once: true });
    }
    return p;
  }
  function redrawLinks() {
    $('#strings').querySelectorAll('path:not(.live)').forEach((p) => {
      if (p.dataset.from) p.setAttribute('d', stringPath(anchor(p.dataset.from), anchor(p.dataset.to)));
    });
  }
  addEventListener('resize', () => { if (G.screen === 'board') redrawLinks(); });

  // ---- input: drag a string, or tap a card
  const cork = $('#cork');
  function cardAt(x, y) {
    const hit = document.elementFromPoint(x, y);
    const c = hit && hit.closest ? hit.closest('.card') : null;
    return c && cork.contains(c) ? c : null;
  }
  function clearHover() { cork.querySelectorAll('.card.hover').forEach((c) => c.classList.remove('hover')); }
  cork.addEventListener('pointerdown', (e) => {
    if (!G.canPlay || G.drag) return;
    G.lastMove = performance.now();
    G.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, path: newPath('live') };
    try { cork.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    Sound.grab();
    moveLive(e);
  });
  cork.addEventListener('pointermove', (e) => {
    if (!G.drag || e.pointerId !== G.drag.id) return;
    if (Math.hypot(e.clientX - G.drag.x0, e.clientY - G.drag.y0) > 12) G.drag.moved = true;
    moveLive(e);
  });
  function moveLive(e) {
    const cr = cork.getBoundingClientRect();
    const from = anchor(G.chain[G.chain.length - 1]);
    G.drag.path.setAttribute('d', stringPath(from, { x: e.clientX - cr.left, y: e.clientY - cr.top }));
    clearHover();
    const c = cardAt(e.clientX, e.clientY);
    if (c) c.classList.add('hover');
  }
  function endDrag(e, cancelled) {
    if (!G.drag || e.pointerId !== G.drag.id) return;
    const d = G.drag;
    G.drag = null;
    d.path.remove();
    clearHover();
    if (cancelled) return;
    const c = cardAt(e.clientX, e.clientY);
    if (c) attempt(c.dataset.id);
  }
  cork.addEventListener('pointerup', (e) => endDrag(e, false));
  cork.addEventListener('pointercancel', (e) => endDrag(e, true));

  // ---- attempt a connection
  async function attempt(bizId) {
    if (!G.canPlay) return;
    const last = G.chain[G.chain.length - 1];
    if (bizId === last) return;
    const id = G.runId;
    const s = step();
    const card = G.nodes[bizId];
    G.canPlay = false;
    G.skipType = true;
    $('#dragHint').hidden = true;

    if (bizId === s.to) {
      const secs = (performance.now() - G.stepStart) / 1000;
      let pts = CFG.stepPoints[Math.min(G.tries, CFG.stepPoints.length - 1)];
      if (G.tries === 0) {
        G.firstTry++;
        for (const [lim, bonus] of CFG.speedBonus) if (secs <= lim) { pts += bonus; break; }
      }
      G.stepTimes.push(secs);
      await connect(bizId, pts, true);
    } else {
      G.tries++;
      G.caseMistakes++;
      renderFoot();
      const p = drawLink(last, bizId, true);
      Sound.twang();
      await wait(380);
      if (id !== G.runId) return;
      Sound.wrong();
      restartAnim(card, 'wrong');
      restartAnim($('#flash'), 'on');
      p.classList.add('snap');
      setTimeout(() => p.remove(), 450);
      setTimeout(() => card.classList.remove('wrong'), 700);
      if (G.tries >= 2) {
        // reveal the answer and move on
        G.reveals++;
        const right = G.nodes[s.to];
        right.classList.add('reveal');
        const h = $('#hint');
        h.textContent = `🗂️ The answer was ${BIZ[s.to].name}.`;
        h.hidden = false;
        Sound.reveal();
        await wait(1500);
        if (id !== G.runId) return;
        right.classList.remove('reveal');
        G.stepTimes.push((performance.now() - G.stepStart) / 1000);
        await connect(s.to, 0, false);
      } else {
        showHint(false);
        G.canPlay = true;
        G.lastMove = performance.now();
      }
    }
  }

  async function connect(bizId, pts, earned) {
    const id = G.runId;
    const s = step();
    const last = G.chain[G.chain.length - 1];
    const card = G.nodes[bizId];
    drawLink(last, bizId, true);
    Sound.twang();
    await wait(420);
    if (id !== G.runId) return;
    Sound.pin();
    G.chain.push(bizId);
    card.append(el('div', 'order', String(G.stepIdx + 1)));
    restartAnim(card, 'right');
    if (earned) {
      Sound.correct();
      G.caseScore += pts;
      const r = card.getBoundingClientRect();
      floatText(`+${pts}`, r.left + r.width / 2, r.top);
      Confetti.burst(50, r.left + r.width / 2, r.top + r.height / 2);
    }
    renderFoot(earned);
    addEvidence(s, bizId);
    G.totalSteps++;

    // evidence note
    const sticky = $('#sticky');
    sticky.classList.add('evidence-mode');
    restartAnim(sticky, 'flip');
    $('#clueLabel').textContent = earned ? `📎 EVIDENCE FOUND · ${BIZ[bizId].icon} ${BIZ[bizId].short || BIZ[bizId].name}` : `📎 EVIDENCE · ${BIZ[bizId].icon} ${BIZ[bizId].short || BIZ[bizId].name}`;
    $('#hint').hidden = true;
    await typeText($('#clueText'), s.fact, 12);
    if (id !== G.runId) return;
    await waitOrTap($('#sticky'), CFG.evidenceSec * 1000);
    if (id !== G.runId) return;

    G.stepIdx++;
    if (G.stepIdx >= G.kase.steps.length) closeCase();
    else presentStep();
  }

  function addEvidence(s, bizId) {
    const b = BIZ[bizId];
    const li = el('li');
    li.style.setProperty('--bc', b.color);
    const txt = el('div');
    txt.append(el('b', null, b.name), s.fact);
    li.append(el('span', 'en', String(G.stepIdx + 1)), el('span', 'ei', b.icon), txt);
    const list = $('#evidence');
    list.append(li);
    while (list.children.length > 4) list.firstChild.remove();
  }

  function floatText(text, x, y, neg) {
    const f = el('div', `float-pts${neg ? ' neg' : ''}`, text);
    f.style.left = `${x}px`;
    f.style.top = `${y}px`;
    f.addEventListener('animationend', () => f.remove());
    document.body.append(f);
  }

  function waitOrTap(node, ms) {
    return new Promise((resolve) => {
      const shownAt = performance.now();
      let t = 0;
      const done = () => { clearTimeout(t); node.removeEventListener('click', onTap); resolve(); };
      const onTap = () => { if (performance.now() - shownAt > 500) done(); };
      node.addEventListener('click', onTap);
      t = setTimeout(done, ms);
    });
  }

  // ================================================================ case closed
  async function closeCase() {
    const id = G.runId;
    clearInterval(G.tick);
    G.canPlay = false;
    const secs = (performance.now() - G.caseStart) / 1000;
    const perfect = G.caseMistakes === 0;
    if (perfect) G.caseScore += CFG.perfectCaseBonus;
    G.score += G.caseScore;
    G.done.push({ kase: G.kase, score: G.caseScore, mistakes: G.caseMistakes, secs, perfect });

    await wait(400);
    if (id !== G.runId) return;
    $('#clCode').textContent = `${caseCode(G.kase)} · ${G.kase.patient.name}`;
    $('#clTitle').textContent = G.kase.title;
    const chain = $('#chain');
    chain.replaceChildren();
    const start = el('div', 'link start');
    start.append(el('div', 'li', G.kase.patient.icon), el('div', 'ln', G.kase.patient.name), el('div', 'lf', 'Where it starts'));
    chain.append(start);
    G.kase.steps.forEach((s, i) => {
      const b = BIZ[s.to];
      const a = el('div', 'arrow', '➜');
      a.style.animationDelay = `${0.3 + i * 0.25}s`;
      const l = el('div', 'link');
      l.style.setProperty('--bc', b.color);
      l.style.animationDelay = `${0.4 + i * 0.25}s`;
      l.append(el('div', 'li', b.icon), el('div', 'ln', b.name), el('div', 'lf', s.fact));
      chain.append(a, l);
    });
    $('#clScore').textContent = G.caseScore.toLocaleString();
    $('#clMistakes').textContent = G.caseMistakes;
    $('#clTime').textContent = fmtTime(secs);
    $('#clBonus').textContent = perfect ? `🏅 Perfect case! +${CFG.perfectCaseBonus} bonus` : '';
    const last = G.done.length >= CFG.casesPerGame || G.done.length >= CASES.length;
    $('#nextBtn').textContent = last ? '📋 FINAL REPORT' : 'NEXT CASE ➜';
    show('closed');
    setTimeout(() => { if (id === G.runId) { Sound.stamp(); Confetti.burst(perfect ? 180 : 100); } }, 450);
    armIdle();
  }

  function nextAfterClose() {
    const last = G.done.length >= CFG.casesPerGame || G.done.length >= CASES.length;
    if (last) finalReport(); else goDesk();
  }

  // ================================================================ final report
  function rankFor(score) {
    let r = CFG.ranks[0];
    for (const rk of CFG.ranks) if (score >= rk[0]) r = rk;
    return r;
  }
  function finalReport() {
    const [, name, icon] = rankFor(G.score);
    G.rank = name;
    if (window.Passport) window.Passport.stamp('case-files', G.score);
    const acc = G.totalSteps ? Math.round((100 * G.firstTry) / G.totalSteps) : 0;
    const total = G.done.reduce((t, d) => t + d.secs, 0);
    $('#rpIcon').textContent = icon;
    $('#rpRank').textContent = name.toUpperCase();
    $('#rpScore').textContent = '0';
    $('#rpCases').textContent = G.done.length;
    $('#rpAcc').textContent = `${acc}%`;
    $('#rpTime').textContent = fmtTime(total);
    const badges = [];
    if (acc === 100) badges.push('🎯 Sharp Eye');
    if (G.done.length && G.done.every((d) => d.perfect)) badges.push('🗂️ Flawless Files');
    if (G.reveals === 0 && acc < 100) badges.push('🧵 Never Gave Up');
    const avg = G.stepTimes.length ? G.stepTimes.reduce((a, b) => a + b, 0) / G.stepTimes.length : 99;
    if (avg < 8) badges.push('⚡ Quick Draw');
    if (!badges.length) badges.push('🔍 On the Case');
    const bx = $('#rpBadges');
    bx.replaceChildren();
    badges.forEach((t, i) => { const b = el('span', 'badge', t); b.style.animationDelay = `${0.6 + i * 0.2}s`; bx.append(b); });
    const qualifies = isHighScore(G.score);
    $('#saveBtn').hidden = !qualifies;
    $('#againBtn').hidden = qualifies;
    show('report');
    Sound.fanfare();
    animateNumber($('#rpScore'), 0, G.score, 1300);
    Confetti.burst(160);
    armIdle();
  }

  function animateNumber(node, from, to, ms) {
    cancelAnimationFrame(node._raf);
    const t0 = performance.now();
    const stepFn = (t) => {
      const pr = Math.min(1, (t - t0) / ms);
      node.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - pr, 3))).toLocaleString();
      if (pr < 1) node._raf = requestAnimationFrame(stepFn);
    };
    node._raf = requestAnimationFrame(stepFn);
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
    Sound.key();
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
    const entry = addScore(G.name, G.score, G.rank);
    Sound.stamp();
    goAttract(entry.id);
  }

  // ================================================================ kiosk helpers
  function armIdle() {
    clearTimeout(G.idleTimer);
    G.idleTimer = setTimeout(() => {
      if (['desk', 'briefing', 'closed', 'report', 'entry'].includes(G.screen)) goAttract();
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
    t._t = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ================================================================ wiring
  $('#startBtn').addEventListener('click', startGame);
  $('#investigateBtn').addEventListener('click', startInvestigation);
  $('#brIntro').addEventListener('click', () => { G.skipType = true; });
  $('#sticky').addEventListener('click', () => { G.skipType = true; });
  $('#nextBtn').addEventListener('click', nextAfterClose);
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
    if (['desk', 'briefing', 'closed', 'report', 'entry'].includes(G.screen)) armIdle();
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

  document.title = 'Case Files';
  $('#title').textContent = CFG.title;
  $('#tagline').textContent = CFG.tagline;
  buildKeys();
  goAttract();
  // shared scores arrived: refresh the board, unless it is showing a just-saved score
  window.Leaderboard.onChange(() => { if (G.screen === 'attract' && !$('#lb .new')) renderLeaderboard(); });
  // warn before leaving for the Arcade mid-game or with an unsaved score
  window.Passport.setLeaveGuard(() => {
    if (['desk', 'briefing', 'board', 'closed'].includes(G.screen)) return 'playing';
    if (G.screen === 'entry' || (G.screen === 'report' && !$('#saveBtn').hidden)) return 'unsaved';
    return null;
  });
})();
