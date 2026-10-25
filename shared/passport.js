// ============================================================
//  EVERNORTH PASSPORT — shared by the Arcade launcher and all games.
//  • A player signs in once (first name) at the launcher.
//  • Finishing any game stamps their passport (one stamp per game per day).
//  • In booth mode (opened from the launcher) each game shows a small "hold for Arcade"
//    button and returns to the launcher after a few idle minutes.
//  Data lives in this browser's localStorage, so it stays on the kiosk.
// ============================================================
(function () {
  'use strict';

  const KEY = 'ecosystemArcade.passport.v1';
  const CUR = 'ecosystemArcade.current.v1';
  const BOOTH = 'ecosystemArcade.booth';
  const SESSION_TTL_MS = 20 * 60 * 1000; // a signed-in player expires after 20 min without activity
  const IDLE_HOME_SEC = 180;              // booth mode: back to the launcher after 3 idle minutes
  const HOLD_MS = 700;                    // hold the home button this long to leave a game

  const GAMES = [
    { id: 'master-the-map', name: 'Master the Map', icon: '🗺️', lb: 'masterTheMap.leaderboard.v1', color: '#7b4dff' },
    { id: 'route-rush', name: 'Route Rush', icon: '🚦', lb: 'routeRush.leaderboard.v1', color: '#ff5f1f' },
    { id: 'health-journey', name: 'The Health Journey', icon: '🎲', lb: 'healthJourney.leaderboard.v1', color: '#2e9d57' },
    { id: 'evernorth-city', name: 'Evernorth City', icon: '🏙️', lb: 'evernorthCity.leaderboard.v1', color: '#1565c0' },
    { id: 'case-files', name: 'Case Files', icon: '🕵️', lb: 'caseFiles.leaderboard.v1', color: '#d62828' },
  ];
  const GAME = Object.fromEntries(GAMES.map((g) => [g.id, g]));

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const read = (k, fallback) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fallback : v; } catch { return fallback; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };
  const keyOf = (name) => String(name || '').trim().toLowerCase();

  // ---------------------------------------------------------------- players
  function current() {
    const c = read(CUR, null);
    if (!c || c.day !== today() || Date.now() - c.at > SESSION_TTL_MS) return null;
    return c;
  }
  function touch() {
    const c = current();
    if (c) { c.at = Date.now(); write(CUR, c); }
  }
  function dayBook() {
    const all = read(KEY, {});
    // keep only the last 14 days
    const days = Object.keys(all).sort();
    while (days.length > 14) delete all[days.shift()];
    return all;
  }
  function signIn(name) {
    const clean = String(name || '').trim();
    if (!clean) return null;
    const all = dayBook();
    const day = all[today()] || (all[today()] = {});
    const k = keyOf(clean);
    if (!day[k]) day[k] = { name: clean, stamps: {} };
    write(KEY, all);
    const c = { name: day[k].name, day: today(), at: Date.now() };
    write(CUR, c);
    return c;
  }
  function signOut() { try { localStorage.removeItem(CUR); } catch { /* ignore */ } }
  function player(name) {
    const day = dayBook()[today()] || {};
    return day[keyOf(name)] || null;
  }
  function playersToday() {
    return Object.values(dayBook()[today()] || {});
  }
  function currentName(max) {
    const c = current();
    if (!c) return '';
    const letters = c.name.replace(/[^A-Za-z]/g, '').slice(0, max || 10);
    return letters ? letters[0].toUpperCase() + letters.slice(1).toLowerCase() : '';
  }

  function stamp(gameId, score) {
    const c = current();
    if (!c || !GAME[gameId]) return null;
    const all = dayBook();
    const day = all[today()] || (all[today()] = {});
    const k = keyOf(c.name);
    const p = day[k] || (day[k] = { name: c.name, stamps: {} });
    const prev = p.stamps[gameId];
    const isNew = !prev;
    if (!prev || (score || 0) > prev.score) p.stamps[gameId] = { score: Math.round(score || 0), at: Date.now() };
    write(KEY, all);
    touch();
    const count = Object.keys(p.stamps).length;
    showStamp(gameId, c.name, count, isNew);
    updateChip();
    return { isNew, count, total: GAMES.length };
  }

  // ---------------------------------------------------------------- champions (reads each game's leaderboard)
  // Today's top `n` for one game, one place per player (their best score).
  function podium(gameId, n) {
    const g = GAME[gameId];
    if (!g) return [];
    const best = new Map();
    for (const e of read(g.lb, [])) {
      if (!e || e.day !== today()) continue;
      const k = keyOf(e.name);
      const b = best.get(k);
      if (!b || e.score > b.score) best.set(k, e);
    }
    return [...best.values()].sort((a, b) => b.score - a.score).slice(0, n || 3);
  }
  function champions() {
    return GAMES.map((g) => ({ game: g, top: podium(g.id, 1)[0] || null }));
  }

  // ---------------------------------------------------------------- in-game chrome (booth mode)
  let chip = null;
  function injectStyles() {
    if (document.getElementById('eap-style')) return;
    const s = document.createElement('style');
    s.id = 'eap-style';
    s.textContent = `
      .eap-bar{position:fixed;top:8px;right:8px;z-index:9990;display:flex;align-items:center;gap:6px;padding:4px 4px 4px 12px;border-radius:999px;
        background:rgba(10,10,30,.62);backdrop-filter:blur(6px);color:#fff;font:700 clamp(12px,1.6vmin,18px) "Segoe UI",system-ui,sans-serif;
        box-shadow:0 4px 14px rgba(0,0,0,.35);user-select:none;-webkit-user-select:none;opacity:.88}
      .eap-chip{white-space:nowrap}
      .eap-home{position:relative;width:clamp(34px,4.6vmin,52px);height:clamp(34px,4.6vmin,52px);border-radius:50%;border:0;cursor:pointer;
        background:rgba(255,255,255,.14);color:#fff;font-size:clamp(16px,2.4vmin,26px);display:grid;place-items:center;touch-action:none}
      .eap-home svg{position:absolute;inset:-3px;width:calc(100% + 6px);height:calc(100% + 6px);transform:rotate(-90deg);pointer-events:none}
      .eap-home circle{fill:none;stroke:#ffd23f;stroke-width:4;stroke-dasharray:157;stroke-dashoffset:157}
      .eap-home.holding circle{transition:stroke-dashoffset ${HOLD_MS}ms linear;stroke-dashoffset:0}
      .eap-tip{position:absolute;top:calc(100% + 6px);right:0;white-space:nowrap;font-size:12px;background:#000c;padding:3px 10px;border-radius:999px;opacity:0;transition:opacity .2s;pointer-events:none}
      .eap-home.holding .eap-tip,.eap-home.hint .eap-tip{opacity:1}
      .eap-stamp{position:fixed;left:50%;top:10vh;z-index:9999;transform:translateX(-50%);pointer-events:none;text-align:center;
        background:#fff8e6;color:#2b2118;border:8px double #d62828;border-radius:18px;padding:2.2vmin 4vmin;font-family:"Segoe UI",system-ui,sans-serif;
        box-shadow:0 18px 50px rgba(0,0,0,.5);animation:eapSlam .6s cubic-bezier(.3,1.6,.5,1) both}
      .eap-stamp .t{font:900 clamp(20px,4.4vmin,56px) Impact,"Arial Black",sans-serif;letter-spacing:.06em;color:#d62828}
      .eap-stamp .g{font-weight:900;font-size:clamp(16px,3vmin,38px)}
      .eap-stamp .c{font-weight:700;font-size:clamp(13px,2.2vmin,28px);color:#6b5a3e;margin-top:.4vmin}
      .eap-stamp .row{display:flex;gap:.8vmin;justify-content:center;margin-top:1vmin;font-size:clamp(20px,4vmin,48px)}
      .eap-stamp .row span{filter:grayscale(1) opacity(.25)} .eap-stamp .row span.on{filter:none}
      .eap-stamp .x{margin-top:1vmin;font:900 clamp(16px,3vmin,40px) Impact,"Arial Black",sans-serif;color:#12935a;letter-spacing:.05em}
      .eap-stamp.out{animation:eapOut .4s ease-in forwards}
      .eap-leave{position:fixed;inset:0;z-index:9995;display:grid;place-items:center;background:rgba(5,5,20,.72);backdrop-filter:blur(4px);
        font-family:"Segoe UI",system-ui,sans-serif;animation:eapFade .2s ease both}
      .eap-leave .box{width:min(92vw,560px);background:#16123a;color:#fff;border:2px solid rgba(255,255,255,.16);border-radius:22px;padding:28px 28px 24px;
        text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.55);animation:eapPop .3s cubic-bezier(.3,1.5,.5,1) both}
      .eap-leave .ic{font-size:clamp(40px,7vmin,64px);line-height:1}
      .eap-leave h2{margin:10px 0 8px;font:900 clamp(22px,3.8vmin,36px) "Segoe UI",system-ui,sans-serif;color:#ffd23f}
      .eap-leave p{margin:0 0 22px;font-size:clamp(15px,2.3vmin,21px);line-height:1.4;color:#d9d4ff}
      .eap-leave .row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
      .eap-leave button{min-height:52px;padding:12px 26px;border-radius:999px;font:800 clamp(15px,2.3vmin,21px) "Segoe UI",system-ui,sans-serif;cursor:pointer}
      .eap-leave .stay{border:0;background:#ffd23f;color:#1a1240;box-shadow:0 5px 0 #b38a00}
      .eap-leave .go{border:2px solid rgba(255,255,255,.35);background:transparent;color:#fff}
      @keyframes eapFade{from{opacity:0}}
      @keyframes eapPop{from{transform:scale(.85);opacity:0}}
      @keyframes eapSlam{0%{transform:translateX(-50%) rotate(-8deg) scale(2.6);opacity:0}60%{transform:translateX(-50%) rotate(-3deg) scale(.95);opacity:1}100%{transform:translateX(-50%) rotate(-3deg) scale(1);opacity:1}}
      @keyframes eapOut{to{transform:translateX(-50%) translateY(-30vh) rotate(-3deg);opacity:0}}
    `;
    document.head.append(s);
  }

  function showStamp(gameId, name, count, isNew) {
    if (!document.body) return;
    injectStyles();
    const g = GAME[gameId];
    const p = player(name);
    const box = document.createElement('div');
    box.className = 'eap-stamp';
    const t = document.createElement('div');
    t.className = 't';
    t.textContent = isNew ? '📮 PASSPORT STAMPED!' : '📮 PASSPORT UPDATED';
    const gEl = document.createElement('div');
    gEl.className = 'g';
    gEl.textContent = `${g.icon} ${g.name}`;
    const c = document.createElement('div');
    c.className = 'c';
    c.textContent = `${name} · ${count} / ${GAMES.length} games`;
    const row = document.createElement('div');
    row.className = 'row';
    for (const gg of GAMES) {
      const s = document.createElement('span');
      s.textContent = gg.icon;
      if (p && p.stamps[gg.id]) s.className = 'on';
      row.append(s);
    }
    box.append(t, gEl, c, row);
    if (count >= GAMES.length && isNew) {
      const x = document.createElement('div');
      x.className = 'x';
      x.textContent = '🏆 ECOSYSTEM EXPERT!';
      box.append(x);
    }
    document.body.append(box);
    setTimeout(() => box.classList.add('out'), 3600);
    setTimeout(() => box.remove(), 4100);
  }

  function updateChip() {
    if (!chip) return;
    const c = current();
    const p = c && player(c.name);
    chip.textContent = c ? `📮 ${c.name} · ${p ? Object.keys(p.stamps).length : 0}/${GAMES.length}` : '📮 Guest';
  }

  function isBooth() {
    try {
      if (new URLSearchParams(location.search).get('booth') === '1') sessionStorage.setItem(BOOTH, '1');
      return sessionStorage.getItem(BOOTH) === '1';
    } catch { return false; }
  }

  // Inside the arcade frame, go straight to the home screen. Opened on its own, load the frame.
  function homeUrl() { return window.parent !== window ? '../home.html' : '../index.html'; }

  // ---------------------------------------------------------------- leaving mid-game
  // A game registers a guard that says what leaving now would lose:
  //   'playing' — a round is under way (no score, no stamp yet)
  //   'unsaved' — the round is over and its score qualifies, but hasn't been saved
  //   null      — nothing to lose
  let leaveGuard = null;
  let leaving = false;
  const LEAVE_TEXT = {
    playing: { icon: '⚠️', title: 'Leave this game?', body: "You're in the middle of a game. If you leave now, your score won't be saved and you won't get this game's passport stamp.", stay: 'Keep playing' },
    unsaved: { icon: '🏆', title: "Your score isn't saved yet!", body: 'Save it to put your name on the leaderboard. If you leave now, this score will be lost.', stay: 'Go back and save' },
  };
  function setLeaveGuard(fn) { leaveGuard = typeof fn === 'function' ? fn : null; }
  function leaveRisk() { try { return (leaveGuard && leaveGuard()) || null; } catch { return null; } }

  // Navigations started here (idle timeout, staff keys, a confirmed leave) never ask again.
  function goHome() { leaving = true; location.href = homeUrl(); }

  // Ask before leaving when there is something to lose; otherwise go straight home.
  function requestHome() {
    const risk = leaveRisk();
    if (!risk || !LEAVE_TEXT[risk]) return goHome();
    if (document.querySelector('.eap-leave')) return;
    injectStyles();
    const t = LEAVE_TEXT[risk];
    const wrap = document.createElement('div');
    wrap.className = 'eap-leave';
    wrap.setAttribute('role', 'alertdialog');
    wrap.setAttribute('aria-modal', 'true');
    const box = document.createElement('div');
    box.className = 'box';
    const ic = document.createElement('div');
    ic.className = 'ic';
    ic.textContent = t.icon;
    const h = document.createElement('h2');
    h.textContent = t.title;
    const p = document.createElement('p');
    p.textContent = t.body;
    const row = document.createElement('div');
    row.className = 'row';
    const stay = document.createElement('button');
    stay.type = 'button';
    stay.className = 'stay';
    stay.textContent = t.stay;
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'go';
    go.textContent = 'Leave anyway';
    // keep taps on the dialog away from the game underneath
    for (const type of ['pointerdown', 'click']) wrap.addEventListener(type, (e) => e.stopPropagation());
    stay.addEventListener('click', () => wrap.remove());
    go.addEventListener('click', goHome);
    row.append(stay, go);
    box.append(ic, h, p, row);
    wrap.append(box);
    document.body.append(wrap);
    stay.focus();
  }

  // Closing the tab or using the browser's back button mid-game (players on their own devices).
  window.addEventListener('beforeunload', (e) => {
    if (leaving || !leaveRisk()) return;
    e.preventDefault();
    e.returnValue = '';
  });

  function mount(gameId) {
    if (!isBooth() || !document.body) return;
    injectStyles();
    const bar = document.createElement('div');
    bar.className = 'eap-bar';
    chip = document.createElement('span');
    chip.className = 'eap-chip';
    const home = document.createElement('button');
    home.type = 'button';
    home.className = 'eap-home';
    home.setAttribute('aria-label', 'Hold to return to the Arcade');
    home.innerHTML = '🏠<svg viewBox="0 0 54 54"><circle cx="27" cy="27" r="25"/></svg><span class="eap-tip">Hold for Arcade</span>';
    let holdT = 0;
    const cancel = () => { clearTimeout(holdT); home.classList.remove('holding'); };
    home.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      home.classList.add('holding');
      holdT = setTimeout(() => { home.classList.remove('holding'); requestHome(); }, HOLD_MS);
    });
    home.addEventListener('pointerup', cancel);
    home.addEventListener('pointerleave', cancel);
    home.addEventListener('pointercancel', cancel);
    home.addEventListener('click', (e) => {
      e.stopPropagation();
      home.classList.add('hint');
      setTimeout(() => home.classList.remove('hint'), 1500);
    });
    bar.append(chip, home);
    document.body.append(bar);
    updateChip();

    // idle → back to the launcher
    let last = Date.now();
    document.addEventListener('pointerdown', () => { last = Date.now(); touch(); }, true);
    setInterval(() => { if (Date.now() - last > IDLE_HOME_SEC * 1000) goHome(); }, 5000);
    // Esc with Shift = straight home (staff)
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && e.shiftKey) goHome(); });
    void gameId;
  }

  window.Passport = { GAMES, GAME, today, current, signIn, signOut, touch, player, playersToday, currentName, stamp, podium, champions, setLeaveGuard, mount };

  const script = document.currentScript;
  const gameId = script && script.dataset.game;
  if (gameId) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(gameId));
    else mount(gameId);
  }
})();
