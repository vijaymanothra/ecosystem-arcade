(() => {
  'use strict';

  const CFG = Object.assign({
    title: 'MASTER THE MAP',
    subtitle: '',
    timePerQuestion: 15,
    journeyTimePerStep: 12,
    factCardSec: 5,
    masteryBonus: 1000,
    journeyRound: true,
    resultTimeoutSec: 45,
    leaderboardSize: 10,
    leaderboardScope: 'today',
    sound: true,
  }, window.QUIZ_CONFIG || {});

  const BUSINESSES = window.QUIZ_BUSINESSES || [];
  const BIZ = Object.fromEntries(BUSINESSES.map((b) => [b.id, b]));
  const allQuestions = window.QUIZ_QUESTIONS || [];
  const QUESTIONS = allQuestions.filter((q) =>
    q && BIZ[q.business] && q.q && Array.isArray(q.options) && q.options.length === 4 &&
    Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4);
  if (QUESTIONS.length !== allQuestions.length) {
    console.warn(`Skipped ${allQuestions.length - QUESTIONS.length} invalid question(s) in questions.js`);
  }
  const JOURNEY = Object.assign({ persona: 'Our member', intro: '', steps: [] }, window.QUIZ_JOURNEY || {});
  JOURNEY.steps = (JOURNEY.steps || []).filter((s) => BIZ[s.answer] && s.text);
  const JOURNEY_ON = CFG.journeyRound && JOURNEY.steps.length > 0 && BUSINESSES.length >= 4;

  const TYPES = {
    scenario: '🎯 Who handles this?',
    customer: '🏢 Who\'s the customer?',
    numbers: '🔢 Know the numbers',
    tagline: '💬 Match the tagline',
    tools: '🧰 Know the tools',
  };
  const SHAPES = ['▲', '◆', '●', '■'];
  const LB_KEY = 'masterTheMap.leaderboard.v1';
  const NAME_MAX = 10;

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

  // ---------------------------------------------------------------- sound (synthesised, no assets)
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
      tick() { tone(1200, 0.05, 'square', 0, 0.07); },
      light(i) { tone(523 * Math.pow(2, i / 12), 0.12, 'triangle', 0, 0.14); },
      count() { tone(440, 0.18, 'square', 0, 0.12); },
      go() { tone(880, 0.35, 'square', 0, 0.14); },
      correct() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', i * 0.07, 0.22)); },
      wrong() { tone(220, 0.4, 'sawtooth', 0, 0.14, 90); },
      finish() { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.22, 'triangle', i * 0.12, 0.18)); },
      win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, 'triangle', i * 0.11, 0.2)); },
    };
  })();

  // ---------------------------------------------------------------- confetti
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

  // ---------------------------------------------------------------- leaderboard (shared/leaderboard.js)
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
  function addScore(name, score, mastered, total) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name, score, mastered, total, day: today(),
    };
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
      ol.append(el('li', 'empty', 'No scores yet — be the first on the board!'));
      return;
    }
    lb.forEach((e, i) => {
      const li = el('li', e.id === highlightId ? 'new' : '');
      li.append(
        el('span', 'rank', i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`),
        el('span', 'name', e.name),
        el('span', 'mastered', `🗺️ ${e.mastered}/${e.total}`),
        el('span', 'pts', e.score.toLocaleString()),
      );
      ol.append(li);
    });
  }

  // ---------------------------------------------------------------- business map
  function tile(b, lit) {
    const t = el('div', 'tile' + (lit ? ' lit' : ''));
    t.style.setProperty('--biz', b.color);
    t.append(el('span', 'tile-icon', b.icon), el('span', 'tile-name', b.short || b.name), el('span', 'tile-group', b.group || ''));
    return t;
  }
  function renderAttractMap() {
    const m = $('#attractMap');
    m.replaceChildren();
    BUSINESSES.forEach((b, i) => {
      const t = tile(b, true);
      t.style.animationDelay = `${i * 0.5}s`;
      m.append(t);
    });
  }
  function renderMiniMap(lightId) {
    const w = $('#miniMap');
    w.replaceChildren();
    for (const b of BUSINESSES) {
      const d = el('span', 'dot');
      d.style.setProperty('--biz', b.color);
      d.append(el('span', null, b.icon));
      if (state.mastered.has(b.id)) d.classList.add('lit');
      if (b.id === lightId) d.classList.add('lighting');
      w.append(d);
    }
  }

  // ---------------------------------------------------------------- state + screens
  const screens = ['attract', 'countdown', 'game', 'journey', 'over', 'entry'];
  const state = {
    screen: 'attract',
    runId: 0,
    phase: 'main',
    run: [],
    steps: [],
    idx: 0,
    item: null,
    score: 0,
    finalScore: 0,
    streak: 0,
    bestStreak: 0,
    mastered: new Set(),
    journeyCorrect: 0,
    correctTimes: [],
    locked: true,
    raf: 0,
    qStart: 0,
    lastTickSec: null,
    name: '',
    idleTimer: 0,
    factTimer: 0,
  };
  let attractArmedAt = 0;

  function show(name) {
    for (const s of screens) $('#' + s).hidden = s !== name;
    state.screen = name;
  }

  function buildRun() {
    // one random question per business, in random order
    const run = [];
    for (const b of BUSINESSES) {
      const pool = QUESTIONS.filter((q) => q.business === b.id);
      if (pool.length) run.push(pick(pool));
    }
    return shuffle(run);
  }

  function goAttract(highlightId) {
    state.runId++;
    state.locked = true;
    cancelAnimationFrame(state.raf);
    clearTimeout(state.idleTimer);
    clearTimeout(state.factTimer);
    $('#fact').hidden = true;
    renderLeaderboard(highlightId);
    show('attract');
    attractArmedAt = performance.now() + (highlightId ? 2000 : 400);
  }

  async function startGame() {
    Sound.unlock();
    tryFullscreen();
    const id = ++state.runId;
    Object.assign(state, {
      phase: 'main', run: buildRun(), steps: JOURNEY_ON ? JOURNEY.steps : [], idx: 0,
      score: 0, finalScore: 0, streak: 0, bestStreak: 0,
      mastered: new Set(), journeyCorrect: 0, correctTimes: [], locked: true,
    });
    if (!state.run.length) { toast('No questions found in questions.js'); return; }

    show('countdown');
    const n = $('#countNum');
    for (const t of ['3', '2', '1', 'GO!']) {
      n.textContent = t;
      restartAnim(n, 'pop');
      if (t === 'GO!') Sound.go(); else Sound.count();
      await wait(t === 'GO!' ? 600 : 750);
      if (id !== state.runId) return;
    }

    $('#score').textContent = '0';
    renderMiniMap();
    renderCombo();
    show('game');
    nextQuestion();
  }

  // ---------------------------------------------------------------- HUD
  function multiplier() { return Math.min(4, 1 + Math.floor(state.streak / 3)); }

  function renderCombo(bump) {
    const c = $('#combo');
    const m = multiplier();
    c.textContent = m > 1 ? `🔥 x${m}` : 'x1';
    c.classList.toggle('hot', m > 1);
    if (bump) restartAnim(c, 'bump');
  }

  function animateNumber(node, from, to, ms) {
    cancelAnimationFrame(node._raf);
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      node.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))).toLocaleString();
      if (p < 1) node._raf = requestAnimationFrame(step);
    };
    node._raf = requestAnimationFrame(step);
  }

  function floatPoints(anchor, text) {
    const r = anchor.getBoundingClientRect();
    const f = el('div', 'float-pts', text);
    f.style.left = `${r.left + r.width / 2}px`;
    f.style.top = `${r.top + r.height / 2}px`;
    f.addEventListener('animationend', () => f.remove());
    document.body.append(f);
  }

  // ---------------------------------------------------------------- question flow
  function mainItem(q, i, n) {
    return {
      phase: 'main',
      business: BIZ[q.business],
      text: q.q,
      typeLabel: TYPES[q.type] || '❓ Quiz',
      progress: `Question ${i + 1} / ${n}`,
      options: shuffle(q.options.map((text, k) => ({ text, correct: k === q.answer }))),
      fact: q.fact,
      time: CFG.timePerQuestion,
      base: 100,
    };
  }

  function journeyItem(s, i, n) {
    const others = shuffle(BUSINESSES.filter((b) => b.id !== s.answer)).slice(0, 3);
    const options = shuffle([BIZ[s.answer], ...others]).map((b) => ({ text: b.name, icon: b.icon, correct: b.id === s.answer }));
    return {
      phase: 'journey',
      business: BIZ[s.answer],
      text: s.text,
      typeLabel: `🧭 ${JOURNEY.persona}'s Journey`,
      progress: `Step ${i + 1} / ${n}`,
      options,
      fact: s.fact,
      time: CFG.journeyTimePerStep,
      base: 150,
    };
  }

  function nextQuestion() {
    if (state.phase === 'main') {
      if (state.idx >= state.run.length) {
        if (state.steps.length) { state.phase = 'journey'; state.idx = 0; journeyIntro(); return; }
        endGame();
        return;
      }
      present(mainItem(state.run[state.idx], state.idx, state.run.length));
    } else {
      if (state.idx >= state.steps.length) { endGame(); return; }
      present(journeyItem(state.steps[state.idx], state.idx, state.steps.length));
    }
  }

  function present(item) {
    state.item = item;
    $('#qnum').textContent = item.progress;
    $('#qtype').textContent = item.typeLabel;

    const qEl = $('#question');
    qEl.textContent = item.text;
    qEl.classList.toggle('long', item.text.length > 90);
    restartAnim($('.question-card'), 'slide-in');

    const box = $('#answers');
    box.replaceChildren();
    item.options.forEach((o, i) => {
      const b = el('button', `ans a${i} deal`);
      b.type = 'button';
      if (o.text.length > 26) b.classList.add('long');
      b.style.animationDelay = `${i * 70}ms`;
      b.append(el('span', 'shape', o.icon || SHAPES[i]), el('span', 'txt', o.text));
      b.addEventListener('click', () => answer(i));
      box.append(b);
    });

    const timer = $('.timer');
    timer.classList.remove('low');
    state.locked = false;
    state.qStart = performance.now();
    state.lastTickSec = null;

    const id = state.runId;
    const loop = () => {
      if (id !== state.runId || state.locked) return;
      const left = Math.max(0, item.time - (performance.now() - state.qStart) / 1000);
      $('#timerFill').style.transform = `scaleX(${Math.min(1, left / item.time)})`;
      const sec = Math.ceil(left);
      $('#timerNum').textContent = sec;
      if (left <= 3) {
        timer.classList.add('low');
        if (sec > 0 && sec !== state.lastTickSec) { state.lastTickSec = sec; Sound.tick(); }
      }
      if (left <= 0) { answer(-1); return; }
      state.raf = requestAnimationFrame(loop);
    };
    state.raf = requestAnimationFrame(loop);
  }

  async function answer(choice) {
    if (state.locked) return;
    state.locked = true;
    cancelAnimationFrame(state.raf);

    const id = state.runId;
    const item = state.item;
    const elapsed = Math.min(item.time, (performance.now() - state.qStart) / 1000);
    const btns = [...document.querySelectorAll('.ans')];
    const ci = item.options.findIndex((o) => o.correct);
    const correct = choice === ci;

    btns.forEach((b, k) => {
      b.disabled = true;
      if (k !== ci && k !== choice) b.classList.add('dim');
    });
    btns[ci].classList.add('correct');

    let pts = 0;
    let fast = false;
    if (correct) {
      state.streak++;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      state.correctTimes.push(elapsed);
      const m = multiplier();
      const speed = Math.round(item.base * (1 - elapsed / item.time));
      fast = speed > item.base * 0.7;
      pts = (item.base + speed) * m;
      const from = state.score;
      state.score += pts;
      animateNumber($('#score'), from, state.score, 600);

      if (item.phase === 'main') {
        state.mastered.add(item.business.id);
        renderMiniMap(item.business.id);
      } else {
        state.journeyCorrect++;
      }
      const levelUp = state.streak % 3 === 0 && state.streak <= 9;
      renderCombo(levelUp);
      Sound.correct();
      floatPoints(btns[ci], `+${pts.toLocaleString()}`);
      if (levelUp) Confetti.burst(90);
    } else {
      if (choice >= 0) btns[choice].classList.add('wrong');
      state.streak = 0;
      renderCombo();
      Sound.wrong();
      restartAnim($('#game'), 'shake');
      restartAnim($('#flash'), 'on');
    }

    await wait(correct ? 700 : 1100);
    if (id !== state.runId) return;
    await showFact(item, { correct, pts, fast, timeout: choice < 0, answerText: item.options[ci].text });
    if (id !== state.runId) return;
    state.idx++;
    nextQuestion();
  }

  function showFact(item, r) {
    return new Promise((resolve) => {
      const biz = item.business;
      const overlay = $('#fact');
      const card = overlay.querySelector('.fact-card');
      card.style.setProperty('--biz', biz.color);

      const head = $('#factHead');
      head.classList.toggle('bad', !r.correct);
      if (r.correct) {
        const m = multiplier();
        $('#factTitle').textContent = `✅ ${pick(['Correct!', 'Nailed it!', 'Spot on!', 'Yes!'])}  +${r.pts.toLocaleString()}`;
        $('#factSub').textContent = [r.fast ? '⚡ Lightning fast' : '', m > 1 ? `🔥 Streak x${m}` : '']
          .filter(Boolean).join('   ·   ');
      } else {
        $('#factTitle').textContent = r.timeout ? "⏰ Time's up!" : '❌ Not quite';
        $('#factSub').textContent = `Answer: ${r.answerText}`;
      }
      $('#factIcon').textContent = biz.icon;
      $('#factName').textContent = biz.name;
      $('#factGroup').textContent = biz.group || '';
      $('#factText').textContent = item.fact || '';
      overlay.hidden = false;
      restartAnim(card, 'fact-card');

      const bar = $('#factBar');
      bar.style.transition = 'none';
      bar.style.width = '100%';
      void bar.offsetWidth;
      bar.style.transition = `width ${CFG.factCardSec}s linear`;
      bar.style.width = '0%';

      const shownAt = performance.now();
      const done = () => {
        clearTimeout(state.factTimer);
        overlay.onclick = null;
        overlay.hidden = true;
        resolve();
      };
      overlay.onclick = () => { if (performance.now() - shownAt > 700) { Sound.tap(); done(); } };
      state.factTimer = setTimeout(done, CFG.factCardSec * 1000);
    });
  }

  function waitOrTap(node, ms) {
    return new Promise((resolve) => {
      const shownAt = performance.now();
      let t = 0;
      const done = () => { clearTimeout(t); node.onclick = null; resolve(); };
      node.onclick = () => { if (performance.now() - shownAt > 500) done(); };
      t = setTimeout(done, ms);
    });
  }

  async function journeyIntro() {
    const id = state.runId;
    show('journey');
    Sound.go();
    Confetti.burst(60);
    await waitOrTap($('#journey'), 4500);
    if (id !== state.runId) return;
    show('game');
    nextQuestion();
  }

  // ---------------------------------------------------------------- results
  async function endGame() {
    const id = state.runId;
    state.locked = true;
    const total = state.run.length;
    const mastered = state.mastered.size;
    const allMastered = mastered === total;
    const bonus = allMastered ? CFG.masteryBonus : 0;
    state.finalScore = state.score + bonus;
    if (window.Passport) window.Passport.stamp('master-the-map', state.finalScore);

    const title = $('#overTitle');
    title.textContent = allMastered ? 'MAP MASTERED!'
      : mastered >= total * 0.7 ? 'GREAT EXPLORER!'
      : mastered >= total * 0.4 ? 'GOOD START!'
      : 'KEEP EXPLORING!';
    title.classList.toggle('win', allMastered);
    $('#overSub').textContent = `You mastered ${mastered} of ${total} businesses`;
    $('#finalScore').textContent = '0';
    $('#bonusLine').textContent = '';

    $('#stMastered').textContent = `${mastered}/${total}`;
    $('#stJourneyBox').hidden = !state.steps.length;
    $('#stJourney').textContent = `${state.journeyCorrect}/${state.steps.length}`;
    $('#stStreak').textContent = state.bestStreak;
    const avg = state.correctTimes.length
      ? state.correctTimes.reduce((a, b) => a + b, 0) / state.correctTimes.length
      : null;
    $('#stSpeed').textContent = avg == null ? '–' : `${avg.toFixed(1)}s`;
    renderBadges(mastered, total, avg);

    const qualifies = isHighScore(state.finalScore);
    $('#saveBtn').hidden = !qualifies;
    $('#againBtn').hidden = qualifies;

    // map tiles start unlit, then light up one by one
    const map = $('#resultMap');
    map.replaceChildren();
    const tiles = BUSINESSES.map((b) => { const t = tile(b, false); map.append(t); return t; });

    show('over');
    Sound.finish();
    animateNumber($('#finalScore'), 0, state.score, 1200);
    armIdle();

    await wait(500);
    let lit = 0;
    for (let i = 0; i < BUSINESSES.length; i++) {
      if (!state.mastered.has(BUSINESSES[i].id)) continue;
      await wait(220);
      if (id !== state.runId) return;
      tiles[i].classList.add('lit', 'lighting');
      Sound.light(lit++);
    }

    if (bonus) {
      await wait(400);
      if (id !== state.runId) return;
      $('#bonusLine').textContent = `+${bonus.toLocaleString()} map mastery bonus!`;
      animateNumber($('#finalScore'), state.score, state.finalScore, 800);
      Sound.win();
      Confetti.burst(200);
    } else if (qualifies) {
      Confetti.burst(100);
    }
  }

  function renderBadges(mastered, total, avg) {
    const has = (ids) => ids.every((x) => state.mastered.has(x));
    const ofGroup = (g) => BUSINESSES.filter((b) => b.group === g).map((b) => b.id);
    const list = [];
    if (mastered === total) list.push('🗺️ Map Master');
    const pharmacy = ofGroup('Pharmacy');
    if (pharmacy.length && has(pharmacy) && mastered !== total) list.push('💊 Pharmacy Pro');
    const care = ofGroup('Care');
    if (care.length && has(care) && mastered !== total) list.push('🩺 Care Champion');
    if (state.steps.length && state.journeyCorrect === state.steps.length) list.push('🧭 Journey Guide');
    if (state.bestStreak >= 5) list.push('🔥 On Fire');
    if (avg != null && avg < 4 && state.correctTimes.length >= 5) list.push('⚡ Speed Demon');
    if (!list.length) list.push(mastered > 0 ? '🎯 Explorer' : '🌱 Rookie');
    const box = $('#badges');
    box.replaceChildren();
    list.forEach((t, i) => {
      const b = el('span', 'badge', t);
      b.style.animationDelay = `${1 + i * 0.25}s`;
      box.append(b);
    });
  }

  // ---------------------------------------------------------------- name entry
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
    if (ch === 'DEL') state.name = state.name.slice(0, -1);
    else if (state.name.length < NAME_MAX) state.name += state.name ? ch.toLowerCase() : ch;
    renderName();
  }
  function renderName() {
    $('#nameBox').textContent = state.name;
    $('#keys .ok').disabled = !state.name;
  }
  function goEntry() {
    state.name = (window.Passport && window.Passport.currentName(NAME_MAX)) || '';
    renderName();
    $('#entryTop').textContent = CFG.leaderboardSize;
    show('entry');
    armIdle();
  }
  function saveName() {
    if (!state.name) return;
    const entry = addScore(state.name, state.finalScore, state.mastered.size, state.run.length);
    Sound.correct();
    goAttract(entry.id);
  }

  // ---------------------------------------------------------------- kiosk helpers
  function armIdle() {
    clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(() => {
      if (state.screen === 'over' || state.screen === 'entry') goAttract();
    }, CFG.resultTimeoutSec * 1000);
  }
  function tryFullscreen() {
    const d = document.documentElement;
    if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen().catch(() => {});
  }
  // above = an element to show the message just above (so it doesn't cover it)
  function toast(msg, above) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('above-cta', Boolean(above));
    t.hidden = false;
    if (above) t.style.setProperty('--hint-top', `${Math.max(8, above.getBoundingClientRect().top - t.offsetHeight - 12)}px`);
    clearTimeout(t._t);
    t._t = setTimeout(() => { t.hidden = true; }, 2500);
  }
  function buildBackground() {
    const bg = $('#bg');
    const icons = BUSINESSES.map((b) => b.icon).concat(['?', '?', '★']);
    for (let i = 0; i < 14; i++) {
      const s = el('span', null, pick(icons));
      s.style.left = `${Math.random() * 100}%`;
      s.style.fontSize = `${6 + Math.random() * 12}vmin`;
      s.style.opacity = '0.35';
      s.style.filter = 'grayscale(1)';
      s.style.animationDuration = `${16 + Math.random() * 16}s`;
      s.style.animationDelay = `${-Math.random() * 30}s`;
      bg.append(s);
    }
  }

  // ---------------------------------------------------------------- wiring
  // Only the play button starts a game. The business cards aren't choices — every game asks about
  // all of them — so tapping one (or anywhere else) explains that and points at the button.
  $('#startBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (performance.now() < attractArmedAt) return;
    startGame();
  });
  $('#attract').addEventListener('click', (e) => {
    if (performance.now() < attractArmedAt) return;
    if (!e.target.closest('#attractMap .tile')) return;
    const btn = $('#startBtn');
    toast(`Every game asks about all ${BUSINESSES.length} businesses. Tap PLAY to start!`, btn);
    restartAnim(btn, 'nudge');
    clearTimeout(btn._nudge);
    btn._nudge = setTimeout(() => btn.classList.remove('nudge'), 1300); // back to the usual pulse
  });
  $('#saveBtn').addEventListener('click', goEntry);
  $('#againBtn').addEventListener('click', startGame);
  $('#homeBtn').addEventListener('click', () => goAttract());
  $('#skipBtn').addEventListener('click', () => goAttract());

  document.addEventListener('pointerdown', () => {
    if (state.screen === 'over' || state.screen === 'entry') armIdle();
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // Staff shortcuts (needs a keyboard): Esc = back to attract, M = mute, Ctrl+Shift+X twice = clear leaderboard
  let clearArmed = 0;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') goAttract();
    else if (e.key.toLowerCase() === 'm' && !e.ctrlKey && state.screen !== 'entry') toast(Sound.toggle() ? '🔊 Sound on' : '🔇 Sound off');
    else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'x') {
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
  $('#bizCount').textContent = BUSINESSES.length;
  $('#personaName').textContent = JOURNEY.persona;
  $('#stepJourney').hidden = !JOURNEY_ON;
  $('#jTitle').textContent = `${JOURNEY.persona}'s Journey`;
  $('#jSub').textContent = JOURNEY.intro;
  buildBackground();
  buildKeys();
  renderAttractMap();
  goAttract();
  // shared scores arrived: refresh the board, unless it is showing a just-saved score
  window.Leaderboard.onChange(() => { if (state.screen === 'attract' && !$('#lb .new')) renderLeaderboard(); });
  // warn before leaving for the Arcade mid-game or with an unsaved score
  window.Passport.setLeaveGuard(() => {
    if (['countdown', 'game', 'journey'].includes(state.screen)) return 'playing';
    if (state.screen === 'entry' || (state.screen === 'over' && !$('#saveBtn').hidden)) return 'unsaved';
    return null;
  });
})();
