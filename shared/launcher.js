(() => {
  'use strict';

  const P = window.Passport;
  const LAUNCHER_IDLE_SIGNOUT_SEC = 90; // nobody touches the launcher → sign the player out for the next person
  const NAME_MAX = 10;

  // Tile copy + look. Game ids must match the folder names and Passport.GAMES.
  const TILES = {
    'master-the-map': { art: '🗺️', tagline: 'One question per business. Light up the whole map.', time: '⏱ 3 min', players: '👤 1 player', c1: '#8a5cff', c2: '#3a1c8a' },
    'route-rush':     { art: '🚦', tagline: 'Route every request to the right business — fast!', time: '⏱ 2–3 min', players: '👤 1 · ⚔️ duel', c1: '#ff8a3d', c2: '#c2185b' },
    'health-journey': { art: '🎲', tagline: 'Roll the dice and race through the patient journey.', time: '⏱ 5–8 min', players: '👥 1–4 players', c1: '#2ec27e', c2: '#14385a' },
    'evernorth-city': { art: '🏙️', tagline: 'Become mayor. Build a healthier city.', time: '⏱ 4 min', players: '👤 1 player', c1: '#4fb3ff', c2: '#1d3f9e' },
    'case-files':     { art: '🕵️', tagline: 'Connect the clues. Reveal how the ecosystem works.', time: '⏱ 3–4 min', players: '👤 1 player', c1: '#b0723a', c2: '#3d2a1c', isNew: true },
  };

  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  // ---------------------------------------------------------------- sound
  let actx = null;
  function tone(freq, dur, type = 'triangle', when = 0, vol = 0.15) {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime + when;
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(actx.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    } catch { /* audio unavailable */ }
  }
  const sfx = {
    tap: () => tone(660, 0.06, 'square', 0, 0.06),
    go: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'triangle', i * 0.07, 0.16)),
    stamp: () => { tone(110, 0.2, 'triangle', 0, 0.3); tone(1568, 0.25, 'sine', 0.1, 0.1); },
  };

  // ---------------------------------------------------------------- confetti
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

  // ---------------------------------------------------------------- render
  function renderTiles() {
    const box = $('#tiles');
    box.replaceChildren();
    const c = P.current();
    const me = c && P.player(c.name, c.tag);
    const champs = Object.fromEntries(P.champions().map((x) => [x.game.id, x.top]));
    P.GAMES.forEach((g, i) => {
      const t = TILES[g.id] || { art: g.icon, tagline: '', time: '', players: '' };
      const tile = el('button', 'tile');
      tile.type = 'button';
      tile.dataset.id = g.id;
      tile.style.setProperty('--c1', t.c1 || g.color);
      tile.style.setProperty('--c2', t.c2 || '#1a1240');
      tile.style.animationDelay = `${i * 0.08}s`;
      if (t.isNew) tile.append(el('span', 'new', 'NEW'));
      if (me && me.stamps[g.id]) tile.append(el('span', 'stamped', '✔ STAMPED'));
      const chips = el('div', 'chips');
      chips.append(el('span', null, t.time), el('span', null, t.players));
      const top = champs[g.id];
      const art = el('div', 'art');
      art.append(el('span', null, t.art)); // inner span lets the picture scale with the space it gets
      tile.append(
        art,
        el('div', 'tn', g.name),
        el('div', 'tt', t.tagline),
        chips,
        el('div', 'best', P.paused(g.id) ? '🔒 Leaderboard paused' : top ? `👑 Today: ${top.name} · ${top.score.toLocaleString()}` : '👑 No champion yet today'),
        el('div', 'play', '▶ PLAY'),
      );
      tile.querySelector('.art').style.animationDelay = `${-i * 0.6}s`;
      tile.addEventListener('click', () => choose(g.id));
      box.append(tile);
    });
    fitArt();
  }

  // Each tile's picture shrinks when its text needs the room (see .tile .art). Give every tile the smallest
  // of those sizes so the five pictures stay the same size as each other.
  function fitArt() {
    const box = $('#tiles');
    box.style.removeProperty('--art-h');
    const arts = [...box.querySelectorAll('.art')];
    if (arts.length) box.style.setProperty('--art-h', `${Math.min(...arts.map((a) => a.clientHeight))}px`);
  }
  addEventListener('resize', fitArt);
  if (document.fonts) document.fonts.ready.then(fitArt);

  function renderPassport() {
    const box = $('#passportPanel');
    box.replaceChildren();
    const c = P.current();
    const me = c && P.player(c.name, c.tag);
    const top = el('div', 'pp-top');
    const txt = el('div');
    if (c) {
      const n = me ? Object.keys(me.stamps).length : 0;
      txt.append(el('div', 'pp-name', `${P.withTag(c.name, c.tag)}'s Passport`), el('div', 'pp-sub', n >= P.GAMES.length ? '🏆 Ecosystem Expert — all stamps collected!' : `${n} of ${P.GAMES.length} stamps · ${P.GAMES.length - n} to go for Ecosystem Expert`));
      top.append(el('div', 'pp-icon', n >= P.GAMES.length ? '🏆' : '📮'), txt);
    } else {
      txt.append(el('div', 'pp-name', 'Evernorth Passport'), el('div', 'pp-sub', 'Get a stamp from every game today — all 5 makes you an Ecosystem Expert!'));
      top.append(el('div', 'pp-icon', '📮'), txt);
    }
    const stamps = el('div', 'stamps');
    for (const g of P.GAMES) {
      const s = el('div', 'stamp-slot');
      s.style.setProperty('--c1', g.color);
      if (me && me.stamps[g.id]) s.classList.add('on');
      s.append(el('span', 'si', g.icon), el('span', null, g.name.replace('The ', '')));
      stamps.append(s);
    }
    const actions = el('div', 'pp-actions');
    if (c) {
      const done = el('button', 'ghost next-player', "✋ I'm done — next player"); // hidden on phones: one phone, one player
      done.type = 'button';
      done.addEventListener('click', () => { sfx.tap(); P.signOut(); renderAll(); toast('See you later! 👋 Passport saved for today.'); });
      actions.append(done);
    } else {
      const get = el('button', 'btn pulse', '📮 Get my passport');
      get.type = 'button';
      get.addEventListener('click', () => openSignin(null));
      actions.append(get);
    }
    box.append(top, stamps, actions);
  }

  // Today's Champions: one game's top 3 at a time, moving on every few seconds. Tap an icon to jump.
  const CHAMP_ROTATE_MS = 6000;
  let champIdx = 0;
  let champTimer = 0;
  function renderChamps(animate) {
    const g = P.GAMES[champIdx];
    const panel = $('#champsPanel');
    panel.style.setProperty('--c1', g.color);
    panel.style.setProperty('--rotate-ms', `${CHAMP_ROTATE_MS}ms`);

    const dots = $('#champDots');
    dots.replaceChildren();
    P.GAMES.forEach((gg, i) => {
      const d = el('button', i === champIdx ? 'on' : '', gg.icon);
      d.type = 'button';
      d.style.setProperty('--c1', gg.color);
      d.setAttribute('aria-label', `${gg.name} champions`);
      d.setAttribute('aria-pressed', String(i === champIdx));
      d.addEventListener('click', () => { sfx.tap(); showChamp(i); });
      dots.append(d);
    });

    const head = $('#champGame');
    head.replaceChildren(el('span', null, g.icon), el('span', null, g.name));
    const ol = $('#champs');
    ol.replaceChildren();
    if (P.paused(g.id)) { // staff paused this leaderboard from the admin page
      const li = el('li', 'p1');
      li.append(el('span', 'medal', '🔒'), el('span', 'none', 'Leaderboard paused by staff'));
      ol.append(li);
      if (animate) for (const n of [head, ol, $('.champ-timer')]) { n.classList.remove('swap'); void n.offsetWidth; n.classList.add('swap'); }
      return;
    }
    const top = P.podium(g.id, 3);
    ['🥇', '🥈', '🥉'].forEach((medal, i) => {
      const e = top[i];
      const li = el('li', `p${i + 1}`);
      li.append(el('span', 'medal', medal));
      if (e) li.append(el('span', 'who', e.name), el('span', 'sc', e.score.toLocaleString()));
      else li.append(el('span', 'none', i === 0 ? 'up for grabs — play now!' : 'up for grabs'));
      ol.append(li);
    });
    if (animate) {
      for (const n of [head, ol, $('.champ-timer')]) { n.classList.remove('swap'); void n.offsetWidth; n.classList.add('swap'); }
    }
  }
  function showChamp(i) {
    champIdx = (i + P.GAMES.length) % P.GAMES.length;
    renderChamps(true);
    clearTimeout(champTimer);
    champTimer = setTimeout(() => showChamp(champIdx + 1), CHAMP_ROTATE_MS);
  }

  function renderExperts() {
    const players = P.playersToday();
    // Everyone who played all 5 today on any device (from the scores API), plus this device's own passports
    // (they show straight away, even offline). One entry per person: same name and passport tag.
    const shared = (window.Leaderboard && window.Leaderboard.experts) ? window.Leaderboard.experts() : [];
    const local = players.filter((p) => Object.keys(p.stamps).length >= P.GAMES.length);
    const keyOf = (e) => `${P.maskName(e.name).toLowerCase()}#${e.tag || ''}`;
    const seen = new Set();
    const experts = [];
    for (const e of [...shared, ...local]) {
      const k = keyOf(e);
      if (seen.has(k)) continue;
      seen.add(k);
      experts.push(e);
    }
    const box = $('#experts');
    box.replaceChildren();
    if (!experts.length) box.append(el('div', 'expert-empty', 'Be the first to collect all 5 stamps today!'));
    experts.forEach((p, i) => { const e = el('span', 'expert', `🏆 ${P.shownName({ name: p.name, tag: p.tag })}`); e.style.animationDelay = `${i * 0.08}s`; box.append(e); });
    // passports issued = players who played at least one game today: everyone, on any device (from the scores),
    // or this device's own players who've played when the scores API hasn't answered yet
    const playedHere = players.filter((p) => Object.keys(p.stamps).length > 0).length;
    const playedEverywhere = window.Leaderboard && window.Leaderboard.playersToday ? window.Leaderboard.playersToday() : null;
    const issued = Math.max(playedEverywhere || 0, playedHere);
    $('#issued').textContent = `📮 ${issued} passport${issued === 1 ? '' : 's'} issued today`;
  }

  function renderAll() {
    renderTiles();
    renderPassport();
    renderChamps();
    renderExperts();
  }

  // ---------------------------------------------------------------- choose + sign in
  let pendingGame = null;
  let typed = '';

  function choose(id) {
    sfx.tap();
    if (P.current()) go(id);
    else openSignin(id);
  }

  function go(id) {
    sfx.go();
    P.touch();
    try { sessionStorage.setItem('ecosystemArcade.booth', '1'); } catch { /* ignore */ }
    const tile = document.querySelector(`.tile[data-id="${id}"]`);
    if (tile) {
      const r = tile.getBoundingClientRect();
      Confetti.burst(80, r.left + r.width / 2, r.top + r.height / 2);
    }
    setTimeout(() => { location.href = `${id}/index.html?booth=1`; }, 450);
  }

  // Signing in takes the first name, then the first letter of the last name: "Priya S."
  let initial = '';
  let step = 'first'; // 'first' → 'initial' → (same name already here today?) 'same'
  function openSignin(gameId) {
    pendingGame = gameId;
    typed = '';
    initial = '';
    setStep('first');
    $('#signin').hidden = false;
  }
  function closeSignin() { $('#signin').hidden = true; pendingGame = null; }
  function setStep(s) {
    step = s;
    // a clear question for each step, its key words in bold: "Type your first name", then
    // "Tap the first letter of your last name"
    const ask = (before, bold) => { const q = el('span', 'ask-q', before); q.append(el('b', null, bold)); return q; };
    $('#nameLabel').replaceChildren(...(s === 'first' ? [el('span', 'ask-step', 'STEP 1 OF 2'), ask('Type your ', 'first name')]
      : s === 'initial' ? [el('span', 'ask-step', 'STEP 2 OF 2'), ask('Tap the ', 'first letter of your last name')]
      : [el('span', 'ask-step', 'ONE QUICK CHECK')]));
    $('#keys').hidden = s === 'same';
    $('#sameName').hidden = s !== 'same';
    $('#nameBox').classList.toggle('initial-step', s !== 'first'); // no typing cursor once the name is complete
    renderName();
  }
  const fullName = () => `${typed} ${initial}.`;

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
    ok.addEventListener('click', confirmName);
    k.append(del, ok);
  }
  function typeKey(ch) {
    sfx.tap();
    if (step === 'initial') {
      if (ch !== 'DEL') initial = ch;          // one letter: tapping another just replaces it
      else if (initial) initial = '';
      else setStep('first');                   // ⌫ with no initial goes back to the first name
    } else if (ch === 'DEL') typed = typed.slice(0, -1);
    else if (typed.length < NAME_MAX) typed += typed ? ch.toLowerCase() : ch;
    renderName();
  }
  function renderName() {
    const box = $('#nameBox');
    if (step === 'first') box.textContent = typed;
    // "Priya _." — the space for the last-name letter blinks until it's tapped, then shows the letter in gold
    else box.replaceChildren(`${typed} `, el('span', initial ? 'ini' : 'ini empty', initial || '_'), '.');
    $('#keys .ok').disabled = step === 'first' ? !typed : !initial;
  }
  function confirmName() {
    if (step === 'first') { if (typed) setStep('initial'); return; }
    if (!initial) return;
    // someone with this name already has a passport on this device today: ask before joining it. Each passport
    // is listed by its tag ("Yes — I'm #qw7"); "No" makes a new passport with a new tag.
    const existing = P.playersNamed(fullName());
    if (existing.length) {
      $('#sameText').textContent = existing.length === 1
        ? `${fullName()} already has a passport on this device today. Is that you?`
        : `${existing.length} people called ${fullName()} have a passport on this device today. Are you one of them?`;
      const box = $('#sameActions');
      box.replaceChildren();
      for (const p of existing.slice(0, 4)) {
        const n = Object.keys(p.stamps).length;
        const b = el('button', 'cta-small', `Yes — I'm #${p.tag} · ${n}/${P.GAMES.length} stamps`);
        b.type = 'button';
        b.addEventListener('click', () => { sfx.tap(); finishSignin(fullName(), p.tag); });
        box.append(b);
      }
      const no = el('button', 'ghost', `No — I'm a different ${fullName()}`);
      no.type = 'button';
      no.addEventListener('click', () => { sfx.tap(); finishSignin(fullName()); });
      box.append(no);
      setStep('same');
      return;
    }
    finishSignin(fullName());
  }
  function finishSignin(name, tag) {
    const c = P.signIn(name, tag);
    sfx.stamp();
    const game = pendingGame;
    closeSignin();
    renderAll();
    Confetti.burst(120);
    const me = P.player(c.name, c.tag);
    const n = me ? Object.keys(me.stamps).length : 0;
    const label = P.withTag(c.name, c.tag);
    toast(n ? `Welcome back, ${label}! ${n}/${P.GAMES.length} stamps so far.` : `Passport issued to ${label}! 📮`);
    if (game) setTimeout(() => go(game), 900);
  }

  // ---------------------------------------------------------------- attract: spotlight + idle sign-out
  let spot = 0;
  setInterval(() => {
    const tiles = [...document.querySelectorAll('.tile')];
    if (!tiles.length || !$('#signin').hidden) return;
    const t = tiles[spot++ % tiles.length];
    t.classList.remove('spot');
    void t.offsetWidth;
    t.classList.add('spot');
  }, 2200);

  let lastTouch = Date.now();
  document.addEventListener('pointerdown', () => { lastTouch = Date.now(); }, true);
  setInterval(() => {
    if (Date.now() - lastTouch > LAUNCHER_IDLE_SIGNOUT_SEC * 1000) {
      if (P.current() && !P.isPhone()) { P.signOut(); renderAll(); } // a phone has no next player: stay signed in
      if (!$('#signin').hidden) closeSignin();
      lastTouch = Date.now();
    }
  }, 5000);
  // refresh champions periodically (other tabs / games update storage)
  setInterval(renderAll, 30000);
  if (window.Leaderboard) window.Leaderboard.onChange(renderAll);

  function buildBg() {
    const bg = $('#bg');
    const icons = ['🛡️', '💊', '🧬', '💉', '🌱', '🌸', '📱', '🧠', '📋', '🚚', '🗺️', '🚦', '🎲', '🏙️', '🕵️'];
    for (let i = 0; i < 16; i++) {
      const s = el('span', null, icons[i % icons.length]);
      s.style.left = `${Math.random() * 100}%`;
      s.style.fontSize = `${5 + Math.random() * 9}vmin`;
      s.style.animationDuration = `${20 + Math.random() * 20}s`;
      s.style.animationDelay = `${-Math.random() * 40}s`;
      bg.append(s);
    }
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._t);
    t._t = setTimeout(() => { t.hidden = true; }, 3000);
  }

  $('#cancelBtn').addEventListener('click', () => { sfx.tap(); closeSignin(); });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSignin();
    if (e.key.length === 1 && /[a-z]/i.test(e.key) && !$('#signin').hidden) typeKey(e.key.toUpperCase());
    if (e.key === 'Backspace' && !$('#signin').hidden) typeKey('DEL');
    if (e.key === 'Enter' && !$('#signin').hidden) confirmName();
  });

  try { sessionStorage.setItem('ecosystemArcade.booth', '1'); } catch { /* ignore */ }
  buildBg();
  buildKeys();
  renderAll();
  showChamp(0);
  // sent here from a game because nobody was signed in: ask for the name, then go on to that game
  const sentFrom = P.takePendingGame();
  if (sentFrom) { if (P.current()) go(sentFrom); else openSignin(sentFrom); }
})();
