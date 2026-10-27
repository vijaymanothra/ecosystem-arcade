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
    const me = c && P.player(c.name);
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
    const me = c && P.player(c.name);
    const top = el('div', 'pp-top');
    const txt = el('div');
    if (c) {
      const n = me ? Object.keys(me.stamps).length : 0;
      txt.append(el('div', 'pp-name', `${c.name}'s Passport`), el('div', 'pp-sub', n >= P.GAMES.length ? '🏆 Ecosystem Expert — all stamps collected!' : `${n} of ${P.GAMES.length} stamps · ${P.GAMES.length - n} to go for Ecosystem Expert`));
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
      const done = el('button', 'ghost', "✋ I'm done — next player");
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
    const experts = players.filter((p) => Object.keys(p.stamps).length >= P.GAMES.length);
    const box = $('#experts');
    box.replaceChildren();
    if (!experts.length) box.append(el('div', 'expert-empty', 'Be the first to collect all 5 stamps today!'));
    experts.forEach((p, i) => { const e = el('span', 'expert', `🏆 ${p.name}`); e.style.animationDelay = `${i * 0.08}s`; box.append(e); });
    $('#issued').textContent = `📮 ${players.length} passport${players.length === 1 ? '' : 's'} issued today`;
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

  function openSignin(gameId) {
    pendingGame = gameId;
    typed = '';
    renderName();
    $('#guestBtn').hidden = !gameId;
    $('#signin').hidden = false;
  }
  function closeSignin() { $('#signin').hidden = true; pendingGame = null; }

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
    if (ch === 'DEL') typed = typed.slice(0, -1);
    else if (typed.length < NAME_MAX) typed += typed ? ch.toLowerCase() : ch;
    renderName();
  }
  function renderName() {
    $('#nameBox').textContent = typed;
    $('#keys .ok').disabled = !typed;
  }
  function confirmName() {
    if (!typed) return;
    const c = P.signIn(typed);
    sfx.stamp();
    const game = pendingGame;
    closeSignin();
    renderAll();
    Confetti.burst(120);
    const me = P.player(c.name);
    const n = me ? Object.keys(me.stamps).length : 0;
    toast(n ? `Welcome back, ${c.name}! ${n}/${P.GAMES.length} stamps so far.` : `Passport issued to ${c.name}! 📮`);
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
      if (P.current()) { P.signOut(); renderAll(); }
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

  $('#guestBtn').addEventListener('click', () => { const g = pendingGame; closeSignin(); if (g) go(g); });
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
})();
