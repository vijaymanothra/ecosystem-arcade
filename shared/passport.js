// ============================================================
//  EVERNORTH PASSPORT — shared by the Arcade launcher and all games.
//  • A player signs in once (first name) at the launcher.
//  • Finishing any game stamps their passport (one stamp per game per day).
//  • In booth mode (opened from the launcher) each game shows a small 🏠 "back to the Arcade"
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

  const GAMES = [
    // the order the games appear on the home screen, the passport and the champions
    { id: 'case-files', name: 'Case Files', icon: '🕵️', lb: 'caseFiles.leaderboard.v1', color: '#d62828' },
    { id: 'evernorth-city', name: 'Evernorth City', icon: '🏙️', lb: 'evernorthCity.leaderboard.v1', color: '#1565c0' },
    { id: 'master-the-map', name: 'Master the Map', icon: '🗺️', lb: 'masterTheMap.leaderboard.v1', color: '#7b4dff' },
    { id: 'route-rush', name: 'Route Rush', icon: '🚦', lb: 'routeRush.leaderboard.v1', color: '#ff5f1f' },
    { id: 'health-journey', name: 'The Health Journey', icon: '🎲', lb: 'healthJourney.leaderboard.v1', color: '#2e9d57' },
  ];
  const GAME = Object.fromEntries(GAMES.map((g) => [g.id, g]));
  // Goodies at the booth: a solo game counts as passed with at least PASS_PCT% of its answers right (best attempt
  // counts). Keep in step with GOODIES in server/scores-core.js.
  const PASS_PCT = 40;
  const GOODIES = [
    { id: 'chocolate', name: 'Chocolate', games: 3 },
    { id: 'keychain', name: 'Keychain', games: 4 },
    { id: 'phone-holder', name: 'Phone holder', games: 5 },
  ];

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const read = (k, fallback) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fallback : v; } catch { return fallback; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };
  const keyOf = (name) => String(name || '').trim().toLowerCase();

  // ---------------------------------------------------------------- players
  // A phone belongs to one person: there's no next player to make room for, so the passport stays signed in
  // all day there. Shared screens (kiosks, laptops, tablets) sign a player out after a while without activity.
  // Same sizes as the phone layouts in the stylesheets.
  const isPhone = () => { try { return matchMedia('(max-width: 640px), (max-height: 500px)').matches; } catch { return false; } };
  function current() {
    const c = read(CUR, null);
    if (!c || c.day !== today() || (!isPhone() && Date.now() - c.at > SESSION_TTL_MS)) return null;
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
  // ---------------------------------------------------------------- passport tags
  // Every passport gets a short random tag ("#qw7") that goes with each score it saves, so two people with the
  // same name are told apart on every screen. Letters and digits without look-alikes (0/o, 1/l/i); keep in step
  // with TAG_RE in server/scores-core.js.
  const TAG_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
  const RUDE_TAGS = new Set(['ass', 'fuk', 'fck', 'fcu', 'sex', 'xxx', 'wtf', 'fag', 'cum', 'tit', 'gay', 'kkk', 'die', 'pee', 'poo', 'sht', 'dck', 'cok', 'vag', 'pus', 'nzi', 'jew', 'god', 'hag', 'hoe', 'kys', 'rap', 'ugh', 'stfu']);
  function newTag(avoid) {
    for (;;) {
      const r = new Uint32Array(3);
      (window.crypto || window.msCrypto).getRandomValues(r);
      const t = Array.from(r, (n) => TAG_CHARS[n % TAG_CHARS.length]).join('');
      if (!RUDE_TAGS.has(t) && !(avoid && avoid.has(t))) return t;
    }
  }
  const passportKey = (name, tag) => `${keyOf(name)}#${tag || ''}`;
  // "Priya S." + "qw7" → "Priya S. #qw7"
  const withTag = (name, tag) => (tag ? `${name} #${tag}` : String(name || ''));

  // What the server knows about a passport (from its scores) joins what this device knows: the best of each.
  // Returns whether anything changed.
  function mergeRemote(p, remote) {
    const before = JSON.stringify([p.stamps, p.claims]);
    for (const [id, g] of Object.entries((remote && remote.games) || {})) {
      if (!GAME[id] || !g) continue;
      const mine = p.stamps[id] || { score: 0, at: Date.now() };
      const stamp1 = { ...mine, score: Math.max(mine.score || 0, g.score || 0) };
      const pct = Math.max(mine.pct || 0, g.pct || 0);
      if (pct) stamp1.pct = pct;
      p.stamps[id] = stamp1;
    }
    if (remote && Array.isArray(remote.claims)) p.claims = remote.claims;
    return JSON.stringify([p.stamps, p.claims]) !== before;
  }
  // Bring the signed-in passport up to date with the server; true if something changed.
  function syncRemote(remote) {
    const c = current();
    if (!c) return false;
    const all = dayBook();
    const p = (all[today()] || {})[passportKey(c.name, c.tag)];
    if (!p || !mergeRemote(p, remote)) return false;
    write(KEY, all);
    return true;
  }
  // Sign in to a passport. With a tag: continue that passport (from "is that you?"), bringing in `remote`, what
  // the server has for it, when this device has lost it. Without: a new passport with a new tag, even when the
  // name is already here today (that's a different person with the same name).
  function signIn(name, tag, remote) {
    const clean = String(name || '').trim();
    if (!clean) return null;
    const all = dayBook();
    const day = all[today()] || (all[today()] = {});
    let k = tag ? passportKey(clean, tag) : null;
    if (k && remote) {
      if (!day[k]) day[k] = { name: clean, tag, stamps: {} };
      mergeRemote(day[k], remote);
    }
    if (!k || !day[k]) {
      const taken = new Set(Object.values(day).filter((p) => keyOf(p.name) === keyOf(clean)).map((p) => p.tag));
      const t = newTag(taken);
      k = passportKey(clean, t);
      day[k] = { name: clean, tag: t, stamps: {} };
    }
    write(KEY, all);
    const c = { name: day[k].name, tag: day[k].tag, day: today(), at: Date.now() };
    write(CUR, c);
    return c;
  }
  function signOut() { try { localStorage.removeItem(CUR); } catch { /* ignore */ } }
  // a passport on this device today, by name and tag
  function player(name, tag) {
    const day = dayBook()[today()] || {};
    return day[passportKey(name, tag)] || null;
  }
  // every passport on this device today with this name (for "is that you?")
  function playersNamed(name) {
    return Object.values(dayBook()[today()] || {}).filter((p) => keyOf(p.name) === keyOf(name));
  }
  function playersToday() {
    return Object.values(dayBook()[today()] || {});
  }
  // the signed-in player's name as scores are saved under it ("Priya S."), and their passport tag ("qw7")
  function currentName() {
    const c = current();
    return c ? String(c.name).trim().slice(0, 20) : '';
  }
  function currentTag() {
    const c = current();
    return (c && c.tag) || '';
  }
  // what the player is called on screen: "Priya S. #qw7"
  function currentLabel() {
    const c = current();
    return c ? withTag(c.name, c.tag) : '';
  }

  // ---------------------------------------------------------------- names on screen
  // Leaderboards show other people's names partly hidden ("Pr***a S."), so an open website can't be used to
  // look employees up. The scores API already sends masked names; this masks what this device holds itself.
  // Keep in step with maskName() in server/scores-core.js.
  function maskName(name) {
    const s = String(name || '').trim();
    if (!s || s.includes('*')) return s;
    const [first, ...rest] = s.split(' ');
    const ch = Array.from(first);
    const n = ch.length;
    const masked = n >= 4 ? ch.slice(0, 2).join('') + '***' + ch[n - 1]
      : n === 3 ? ch[0] + '*' + ch[2]
      : n === 2 ? ch[0] + '*'
      : first;
    return [masked, ...rest].join(' ');
  }
  // Scores saved on this device, with the full name they were saved under, so a player still sees their
  // own name in full on the boards (the API hands every name back masked).
  const MINE = 'ecosystemArcade.myScores.v2';
  function rememberMine(id, name, tag) {
    if (!id || !name) return;
    const m = read(MINE, {});
    m[id] = { name: String(name), tag: tag || '' };
    const ids = Object.keys(m);
    for (const old of ids.slice(0, Math.max(0, ids.length - 500))) delete m[old]; // keep the newest 500
    write(MINE, m);
  }
  // What a leaderboard shows for a score: the signed-in player's own scores in full ("Priya S. #qw7"),
  // everyone else masked ("Pr***a S. #k4m"). The tag is never hidden: it identifies nobody.
  function shownName(entry) {
    const e = entry || {};
    // staff switched on "show full names" (admin page): everyone's name in full, as the API now sends them
    if (window.Leaderboard && window.Leaderboard.fullNames && window.Leaderboard.fullNames()) return withTag(e.name, e.tag);
    const c = current();
    if (c) {
      const mine = read(MINE, {})[e.id];
      if (mine && keyOf(mine.name) === keyOf(c.name) && (mine.tag || '') === (c.tag || '')) return withTag(mine.name, mine.tag);
      if (e.tag && e.tag === c.tag && keyOf(maskName(c.name)) === keyOf(maskName(e.name))) return withTag(c.name, c.tag);
    }
    return withTag(maskName(e.name), e.tag);
  }

  // ---------------------------------------------------------------- what this player has already seen
  // Master the Map, Health Journey and Evernorth City share one question bank, and every game can be played
  // again, so each passport remembers the questions (and Case Files cases, Route Rush requests) its player has
  // seen today; the games pick unseen ones first. Only when a player has seen every item of a pool does
  // something come back, the one seen longest ago.
  const SEEN_MAX = 1000;
  // a short, stable key for a question's text
  function seenKey(text) {
    let h = 0x811c9dc5;
    for (const ch of String(text || '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }
  function seenBook() {
    const c = current();
    if (!c) return null;
    const all = dayBook();
    const day = all[today()] || (all[today()] = {});
    const k = passportKey(c.name, c.tag);
    const p = day[k] || (day[k] = { name: c.name, tag: c.tag, stamps: {} });
    return { all, p };
  }
  function markSeen(text) {
    const b = seenBook();
    if (!b) return;
    const seen = b.p.seen || (b.p.seen = {});
    seen[seenKey(text)] = Date.now();
    const keys = Object.keys(seen);
    if (keys.length > SEEN_MAX) for (const k of keys.sort((x, y) => seen[x] - seen[y]).slice(0, keys.length - SEEN_MAX)) delete seen[k];
    write(KEY, b.all);
  }
  // `items` in the order to offer them: never-seen first (shuffled), then the ones seen longest ago.
  // textOf(item) gives the text that identifies an item (a question's wording, a case's title).
  function freshFirst(items, textOf) {
    const b = seenBook();
    const seen = (b && b.p.seen) || {};
    const list = (items || []).map((it) => ({ it, at: seen[seenKey(textOf(it))] || 0, r: Math.random() }));
    list.sort((x, y) => (x.at - y.at) || (x.r - y.r));
    return list.map((x) => x.it);
  }
  // one item the player hasn't seen (or has seen longest ago), remembered as seen from now on
  function pickFresh(items, textOf) {
    const it = freshFirst(items, textOf)[0];
    if (it !== undefined) markSeen(textOf(it));
    return it;
  }

  // pct: the share of answers right in this game; left out for a multiplayer game, which can't count towards goodies
  function stamp(gameId, score, pct) {
    const c = current();
    if (!c || !GAME[gameId]) return null;
    const all = dayBook();
    const day = all[today()] || (all[today()] = {});
    const k = passportKey(c.name, c.tag);
    const p = day[k] || (day[k] = { name: c.name, tag: c.tag, stamps: {} });
    const prev = p.stamps[gameId];
    const isNew = !prev;
    const levelBefore = goodieStatus(p).earned;
    const better = !prev || (score || 0) > prev.score;
    const next = better ? { score: Math.round(score || 0), at: Date.now() } : { ...prev };
    const best = Math.max((prev && prev.pct) || 0, Number.isFinite(pct) ? Math.round(pct) : 0);
    if (best || Number.isFinite(pct) || (prev && Number.isFinite(prev.pct))) next.pct = best;
    p.stamps[gameId] = next;
    write(KEY, all);
    touch();
    const count = Object.keys(p.stamps).length;
    showStamp(gameId, withTag(c.name, c.tag), count, isNew, p, pct);
    updateChip();
    // a new goodie level: tell them once the stamp has had its moment
    const st = goodieStatus(p);
    if (st.earned && st.earned !== levelBefore && !st.collected) setTimeout(showGoodie, 2400);
    return { isNew, count, total: GAMES.length };
  }

  // ---------------------------------------------------------------- goodies
  // Where a passport stands: games passed, the goodie earned, the next one up, and what was already collected.
  function goodieStatus(p) {
    const passed = p ? Object.values(p.stamps).filter((s) => (s.pct || 0) >= PASS_PCT).length : 0;
    const earned = [...GOODIES].reverse().find((g) => passed >= g.games) || null;
    const next = GOODIES.find((g) => passed < g.games) || null;
    const claim = p && Array.isArray(p.claims) && p.claims[0];
    const collected = claim ? (GOODIES.find((g) => g.id === claim.goodie) || null) : null;
    return { passed, earned, next, collected };
  }
  function currentGoodie() {
    const c = current();
    return goodieStatus(c && player(c.name, c.tag));
  }
  // The card a player shows at the goodie desk.
  function showGoodie() {
    const c = current();
    const st = currentGoodie();
    if (!c || !st.earned || !document.body || document.querySelector('.eap-leave')) return;
    injectStyles();
    const wrap = document.createElement('div');
    wrap.className = 'eap-leave eap-goodie';
    wrap.setAttribute('role', 'alertdialog');
    wrap.setAttribute('aria-modal', 'true');
    const box = document.createElement('div');
    box.className = 'box';
    const line = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; box.append(e); return e; };
    line('div', 'ic', '🎁');
    if (st.collected) {
      line('h2', null, `${st.collected.name} collected`);
      dimTag(line('p', 'who', `${withTag(c.name, c.tag)} · ${st.passed} of ${GAMES.length} games passed`));
      line('p', null, 'Each player collects one goodie. Thanks for playing!');
    } else {
      line('h2', null, `You earned a ${st.earned.name.toUpperCase()}!`);
      dimTag(line('p', 'who', `${withTag(c.name, c.tag)} · ${st.passed} of ${GAMES.length} games passed`));
      if (st.next) {
        const more = st.next.games - st.passed;
        line('p', null, `Show this at the goodie desk to collect it, or pass ${more} more game${more === 1 ? '' : 's'} for a ${st.next.name.toLowerCase()}. Once you collect, you can't upgrade.`);
      } else line('p', null, 'Show this at the goodie desk to collect it.');
      line('p', 'small', 'While stocks last.');
    }
    const row = document.createElement('div');
    row.className = 'row';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'stay';
    ok.textContent = 'Got it';
    for (const type of ['pointerdown', 'click']) wrap.addEventListener(type, (e) => e.stopPropagation());
    ok.addEventListener('click', () => wrap.remove());
    row.append(ok);
    box.append(row);
    wrap.append(box);
    document.body.append(wrap);
    ok.focus();
  }

  // ---------------------------------------------------------------- passport tags, dimmed
  // The name is what matters; the tag ("#qw7") is only there to tell namesakes apart, so it sits back, still readable.
  // Takes an element showing text and returns it with any tag in that text dimmed.
  function dimTag(node) {
    if (!node) return node;
    const parts = String(node.textContent).split(/( #[a-hjkmnp-z2-9]{3})(?![a-z0-9])/);
    if (parts.length < 2) return node;
    injectStyles();
    node.replaceChildren(...parts.map((text, i) => {
      if (i % 2 === 0) return text;
      const tag = document.createElement('span');
      tag.className = 'eap-tag';
      tag.textContent = text;
      return tag;
    }));
    return node;
  }

  // ---------------------------------------------------------------- typing a name
  // People type their full name; only the first name and last initial are kept ("Priya Sharma" → "Priya S.").
  const FULL_NAME_MAX = 32;
  const SAVED_NAME_MAX = 20; // the API's limit
  function shortName(typed) {
    const words = String(typed || '').trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return { name: '', problem: words.length ? 'last' : 'empty' };
    const initial = Array.from(words[words.length - 1])[0].toUpperCase();
    return { name: `${Array.from(words[0]).slice(0, SAVED_NAME_MAX - 3).join('')} ${initial}.`, problem: null };
  }
  // The on-screen QWERTY keyboard and the box above it. keys and box are empty elements; onDone gets "Priya S.".
  function nameEntry({ keys, box, onDone, onKey }) {
    injectStyles();
    let typed = '';
    const hint = document.createElement('div');
    hint.className = 'eap-name-hint';
    box.after(hint);
    const text = document.createElement('span');
    text.className = 'eap-typed';
    const key = (cls, label, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = label;
      b.addEventListener('click', fn);
      return b;
    };
    const type = (ch) => {
      if (onKey) onKey();
      if (ch === 'DEL') typed = typed.slice(0, -1);
      else if (ch === ' ') { if (typed && !typed.endsWith(' ') && typed.length < FULL_NAME_MAX) typed += ' '; }
      else if (typed.length < FULL_NAME_MAX) typed += !typed || typed.endsWith(' ') ? ch.toUpperCase() : ch.toLowerCase();
      paint();
    };
    function paint(problem) {
      if (text.parentElement !== box) box.replaceChildren(text);
      // a long name shrinks to fit the box. The room is measured empty, as a long name would stretch the box and its sheet.
      text.textContent = '';
      const room = box.clientWidth - 40; // leaves space for the typing cursor
      text.textContent = typed;
      text.style.fontSize = '';
      if (room > 0 && text.offsetWidth > room) text.style.fontSize = `${Math.max(0.35, room / text.offsetWidth)}em`;
      const s = shortName(typed);
      hint.classList.toggle('bad', Boolean(problem));
      hint.textContent = problem ? 'Please enter your last name too'
        : s.name ? `You'll appear as: ${s.name}`
        : typed.trim() ? 'Now add your last name' : '';
      const ok = keys.querySelector('.ok');
      if (ok) ok.disabled = !typed.trim();
    }
    function confirm() {
      const s = shortName(typed);
      if (s.problem === 'empty') return;
      if (s.problem) { paint(true); return; }
      onDone(s.name);
    }
    keys.classList.add('eap-kbd');
    keys.replaceChildren();
    const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].map((letters) => {
      const row = document.createElement('div');
      row.className = 'eap-kbd-row';
      for (const ch of letters) row.append(key('key', ch, () => type(ch)));
      return row;
    });
    rows[2].append(key('key del', '⌫', () => type('DEL')));
    const last = document.createElement('div');
    last.className = 'eap-kbd-row';
    last.append(key('key space', 'SPACE', () => type(' ')), key('key ok', 'OK', confirm));
    keys.append(...rows, last);
    paint();
    return {
      reset() { typed = ''; paint(); },
      type,
      confirm,
      setHint(message) { hint.classList.remove('bad'); hint.textContent = message; },
    };
  }

  // ---------------------------------------------------------------- champions (reads each game's leaderboard)
  // a leaderboard staff have paused from the admin page shows no names
  const paused = (gameId) => Boolean(window.Leaderboard && window.Leaderboard.isHidden && window.Leaderboard.isHidden(gameId));
  // Today's top `n` for one game, one place per player (their best score).
  function podium(gameId, n) {
    const g = GAME[gameId];
    if (!g || paused(gameId)) return [];
    const best = new Map();
    for (const raw of read(g.lb, [])) {
      if (!raw || raw.day !== today()) continue;
      const e = { ...raw, name: shownName(raw) };
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
        background:rgba(10,10,30,.62);backdrop-filter:blur(6px);color:#fff;font:700 clamp(12px,1.6vmin,40px) "Segoe UI",system-ui,sans-serif;
        box-shadow:0 4px 14px rgba(0,0,0,.35);user-select:none;-webkit-user-select:none;opacity:.88}
      .eap-chip{white-space:nowrap}
      .eap-home{position:relative;width:clamp(34px,4.6vmin,120px);height:clamp(34px,4.6vmin,120px);border-radius:50%;border:0;cursor:pointer;
        background:rgba(255,255,255,.14);color:#fff;font-size:clamp(16px,2.4vmin,60px);display:grid;place-items:center;touch-action:manipulation;transition:transform .1s}
      .eap-home:active{transform:scale(.9)}
      @media (min-width:641px) and (max-width:1500px),(orientation:portrait) and (min-width:641px){.eap-has-bar header.brand{padding-inline:var(--eap-bar-w,0px)}}
      .eap-saved{flex-basis:100%;width:100%;margin:0 0 .6vmin;text-align:center;font:800 clamp(14px,2.4vmin,30px) "Segoe UI",system-ui,sans-serif;color:#2ee59d;text-shadow:0 2px 6px rgba(0,0,0,.45)}
      .eap-tag{opacity:.55;font-weight:600;font-size:.82em}
      .eap-typed{white-space:pre}
      .eap-name-hint{min-height:1.4em;text-align:center;font:700 clamp(14px,2.4vmin,30px) "Segoe UI",system-ui,sans-serif;color:#2ee59d}
      .eap-name-hint.bad{color:#ff8fa3;font-weight:900}
      .keys.eap-kbd{display:flex;flex-direction:column;gap:clamp(4px,.9vmin,14px)}
      .eap-kbd-row{display:flex;justify-content:center;gap:clamp(3px,.8vmin,12px);width:100%}
      .eap-kbd-row .key{flex:1 1 0;min-width:0;padding:0}
      .eap-kbd-row:nth-child(2){padding-inline:5%}
      .eap-kbd-row .key.del{flex-grow:1.6}
      .eap-kbd-row .key.space{flex-grow:6;font-size:.72em;letter-spacing:.14em}
      .eap-kbd-row .key.ok{flex-grow:2.4}
      @media (max-width:640px){.eap-kbd-row .key{height:44px;font-size:17px;border-radius:8px}}
      @media (max-height:500px){.eap-kbd-row .key{height:clamp(26px,9.5vh,40px);font-size:15px;border-radius:7px}.eap-name-hint{font-size:13px}.keys.eap-kbd{gap:3px}}
      .eap-goodie .who{font-weight:800;color:#fff;margin-bottom:10px}
      .eap-goodie p.small{font-size:clamp(12px,1.8vmin,18px);margin-top:-12px;color:#b9b3e6}
      .eap-stamp .n{margin-top:.8vmin;font-weight:800;font-size:clamp(12px,1.9vmin,50px);color:#12935a}
      .eap-stamp .n.low{color:#b45309}
      .eap-stamp{position:fixed;left:50%;top:10vh;z-index:9999;transform:translateX(-50%);pointer-events:none;text-align:center;
        background:#fff8e6;color:#2b2118;border:8px double #d62828;border-radius:18px;padding:2.2vmin 4vmin;font-family:"Segoe UI",system-ui,sans-serif;
        box-shadow:0 18px 50px rgba(0,0,0,.5);animation:eapSlam .6s cubic-bezier(.3,1.6,.5,1) both}
      .eap-stamp .t{font:900 clamp(20px,4.4vmin,120px) Impact,"Arial Black",sans-serif;letter-spacing:.06em;color:#d62828}
      .eap-stamp .g{font-weight:900;font-size:clamp(16px,3vmin,84px)}
      .eap-stamp .c{font-weight:700;font-size:clamp(13px,2.2vmin,62px);color:#6b5a3e;margin-top:.4vmin}
      .eap-stamp .row{display:flex;gap:.8vmin;justify-content:center;margin-top:1vmin;font-size:clamp(20px,4vmin,110px)}
      .eap-stamp .row span{filter:grayscale(1) opacity(.25)} .eap-stamp .row span.on{filter:none}
      .eap-stamp .x{margin-top:1vmin;font:900 clamp(16px,3vmin,90px) Impact,"Arial Black",sans-serif;color:#12935a;letter-spacing:.05em}
      .eap-stamp.out{animation:eapOut .4s ease-in forwards}
      .eap-leave{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:rgba(5,5,20,.72);backdrop-filter:blur(4px);
        font-family:"Segoe UI",system-ui,sans-serif;animation:eapFade .2s ease both}
      .eap-leave .box{width:min(92vw,max(560px,52vmin));background:#16123a;color:#fff;border:2px solid rgba(255,255,255,.16);border-radius:max(22px,2vmin);padding:max(28px,2.6vmin) max(28px,2.6vmin) max(24px,2.2vmin);
        text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.55);animation:eapPop .3s cubic-bezier(.3,1.5,.5,1) both}
      .eap-leave .ic{font-size:clamp(40px,7vmin,max(64px,5.9vmin));line-height:1}
      .eap-leave h2{margin:10px 0 8px;font:900 clamp(22px,3.8vmin,max(36px,3.3vmin)) "Segoe UI",system-ui,sans-serif;color:#ffd23f}
      .eap-leave p{margin:0 0 max(22px,2vmin);font-size:clamp(15px,2.3vmin,max(21px,1.95vmin));line-height:1.4;color:#d9d4ff}
      .eap-leave .row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
      .eap-leave button{min-height:max(52px,4.8vmin);padding:max(12px,1.1vmin) max(26px,2.4vmin);border-radius:999px;font:800 clamp(15px,2.3vmin,max(21px,1.95vmin)) "Segoe UI",system-ui,sans-serif;cursor:pointer}
      .eap-leave .stay{border:0;background:#ffd23f;color:#1a1240;box-shadow:0 5px 0 #b38a00}
      .eap-leave .go{border:2px solid rgba(255,255,255,.35);background:transparent;color:#fff}
      @keyframes eapFade{from{opacity:0}}
      @keyframes eapPop{from{transform:scale(.85);opacity:0}}
      /* phones: just a small round 🏠 in the corner, so it doesn't cover the game */
      @media (max-width:640px),(max-height:500px){
        .eap-bar{top:4px;right:4px;padding:0;gap:0;background:none;box-shadow:none;backdrop-filter:none;opacity:.85}
        .eap-chip{display:none}
        .eap-home{width:32px;height:32px;font-size:16px;background:rgba(10,10,30,.62);box-shadow:0 2px 8px rgba(0,0,0,.35)}
        .eap-stamp{border-width:5px;padding:12px 18px;max-width:92vw}
      }
      @keyframes eapSlam{0%{transform:translateX(-50%) rotate(-8deg) scale(2.6);opacity:0}60%{transform:translateX(-50%) rotate(-3deg) scale(.95);opacity:1}100%{transform:translateX(-50%) rotate(-3deg) scale(1);opacity:1}}
      @keyframes eapOut{to{transform:translateX(-50%) translateY(-30vh) rotate(-3deg);opacity:0}}
    `;
    document.head.append(s);
  }

  function showStamp(gameId, name, count, isNew, p, pct) {
    if (!document.body) return;
    injectStyles();
    const g = GAME[gameId];
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
    dimTag(c);
    const row = document.createElement('div');
    row.className = 'row';
    for (const gg of GAMES) {
      const s = document.createElement('span');
      s.textContent = gg.icon;
      if (p && p.stamps[gg.id]) s.className = 'on';
      row.append(s);
    }
    box.append(t, gEl, c, row);
    // does this game count towards a goodie?
    const note = document.createElement('div');
    if (!Number.isFinite(pct)) { note.className = 'n low'; note.textContent = 'Only solo games count towards goodies'; }
    else if (pct >= PASS_PCT) { note.className = 'n'; note.textContent = `✅ ${Math.round(pct)}% right: passed for goodies`; }
    else { note.className = 'n low'; note.textContent = `${Math.round(pct)}% right: ${PASS_PCT}% counts towards goodies. Play again!`; }
    box.append(note);
    if (count >= GAMES.length && isNew) {
      const x = document.createElement('div');
      x.className = 'x';
      x.textContent = '🏆 ECOSYSTEM EXPERT!';
      box.append(x);
    }
    document.body.append(box);
    // it fades on its own, or as soon as the player taps anything, so it never covers what they want next
    let gone = false;
    const dismiss = () => {
      if (gone) return;
      gone = true;
      document.removeEventListener('pointerdown', dismiss, true);
      box.classList.add('out');
      setTimeout(() => box.remove(), 450);
    };
    document.addEventListener('pointerdown', dismiss, true);
    setTimeout(dismiss, 3600);
  }

  function updateChip() {
    if (!chip) return;
    const c = current();
    const p = c && player(c.name, c.tag);
    chip.textContent = c ? `📮 ${withTag(c.name, c.tag)} · ${p ? Object.keys(p.stamps).length : 0}/${GAMES.length}` : '📮';
    dimTag(chip);
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
    home.setAttribute('aria-label', 'Back to the Arcade');
    home.title = 'Back to the Arcade';
    home.textContent = '🏠';
    // one tap goes home; mid-round or with an unsaved score, the leave warning asks first
    home.addEventListener('pointerdown', (e) => e.stopPropagation()); // the game underneath never sees this tap
    home.addEventListener('click', (e) => {
      e.stopPropagation();
      requestHome();
    });
    bar.append(chip, home);
    document.body.append(bar);
    document.body.classList.add('eap-has-bar'); // games keep top-right content clear of the badge
    updateChip();
    // games can reserve exactly the badge's room: var(--eap-bar-w) / var(--eap-bar-h), kept current
    const measure = () => {
      const r = bar.getBoundingClientRect();
      document.documentElement.style.setProperty('--eap-bar-w', `${Math.ceil(r.width + (innerWidth - r.right))}px`);
      document.documentElement.style.setProperty('--eap-bar-h', `${Math.ceil(r.bottom)}px`);
    };
    measure();
    if (window.ResizeObserver) new ResizeObserver(measure).observe(bar);
    addEventListener('resize', measure);

    // idle → back to the launcher
    let last = Date.now();
    document.addEventListener('pointerdown', () => { last = Date.now(); touch(); }, true);
    setInterval(() => { if (Date.now() - last > IDLE_HOME_SEC * 1000) goHome(); }, 5000);
    // Esc with Shift = straight home (staff)
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && e.shiftKey) goHome(); });
    void gameId;
  }

  // ---------------------------------------------------------------- "turn your phone sideways"
  // Games whose board needs a wide screen (data-landscape on their passport.js tag) cover the
  // screen with this note on a phone held upright; it disappears as soon as the phone is turned.
  function landscapePrompt(gameName) {
    const s = document.createElement('style');
    s.textContent = `
      .eap-rotate{display:none}
      @media (orientation:portrait) and (max-width:640px){
        .eap-rotate{display:flex;position:fixed;inset:0;z-index:9998;flex-direction:column;align-items:center;justify-content:center;gap:14px;
          padding:24px;text-align:center;color:#fff;font-family:"Segoe UI",system-ui,sans-serif;
          background:radial-gradient(ellipse at 50% 0%,#3a1c8a 0%,transparent 60%),#0b0820}
      }
      .eap-rotate .ph{font-size:72px;line-height:1;animation:eapTurn 2.4s ease-in-out infinite}
      .eap-rotate h2{font-size:24px;font-weight:900;color:#ffd23f}
      .eap-rotate p{font-size:16px;line-height:1.4;color:#d9d4ff;max-width:300px}
      .eap-rotate button{margin-top:10px;min-height:46px;padding:10px 22px;border-radius:999px;border:2px solid rgba(255,255,255,.35);
        background:transparent;color:#fff;font:700 15px "Segoe UI",system-ui,sans-serif;cursor:pointer}
      @keyframes eapTurn{0%,30%{transform:rotate(0)}55%,85%{transform:rotate(-90deg)}100%{transform:rotate(0)}}
      @media (prefers-reduced-motion:reduce){.eap-rotate .ph{animation:none}}
    `;
    document.head.append(s);
    const box = document.createElement('div');
    box.className = 'eap-rotate';
    box.setAttribute('role', 'alert');
    const ph = document.createElement('div');
    ph.className = 'ph';
    ph.textContent = '📱';
    const h = document.createElement('h2');
    h.textContent = 'Turn your phone sideways';
    const p = document.createElement('p');
    p.textContent = `${gameName} needs a wide screen. Rotate your phone to play.`;
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = '🏠 Back to the Arcade';
    back.addEventListener('click', requestHome); // mid-game, this asks first, like the 🏠 button
    box.append(ph, h, p, back);
    document.body.append(box);
  }

  // ---------------------------------------------------------------- scores save themselves
  // Games save a finished score automatically under the signed-in name, then show this note just
  // before `anchor` (the results screen's buttons). name null = remove the note.
  function savedNote(anchor, name) {
    if (!anchor || !anchor.parentElement) return;
    injectStyles();
    let note = anchor.parentElement.querySelector(':scope > .eap-saved');
    if (!name) { if (note) note.remove(); return; }
    if (!note) {
      note = document.createElement('p');
      note.className = 'eap-saved';
      note.setAttribute('role', 'status');
      anchor.parentElement.insertBefore(note, anchor);
    }
    const c = current(); // the signed-in player's own score: name and passport tag ("Priya S. #qw7")
    note.textContent = `✅ Saved to the leaderboard as ${c && keyOf(name) === keyOf(c.name) ? withTag(c.name, c.tag) : name}`;
    dimTag(note);
  }

  // ---------------------------------------------------------------- a name is required to play
  // No guest play: a game opened without a signed-in player (a direct link, or after the home screen
  // signed an idle player out) sends them to the home screen's name prompt, then on into this game.
  const PENDING = 'ecosystemArcade.pendingGame';
  function storageWorks() {
    try { localStorage.setItem('ecosystemArcade.probe', '1'); localStorage.removeItem('ecosystemArcade.probe'); return true; } catch { return false; }
  }
  function requireName(gameId) {
    if (current() || !GAME[gameId]) return false;
    // without working storage the name can't be remembered; don't loop players back to the prompt
    if (!storageWorks()) return false;
    try { sessionStorage.setItem(PENDING, gameId); } catch { /* the home screen just won't jump to this game */ }
    leaving = true;
    location.replace(homeUrl());
    return true;
  }
  // the home screen asks which game a player was sent from (once)
  function takePendingGame() {
    try {
      const g = sessionStorage.getItem(PENDING);
      sessionStorage.removeItem(PENDING);
      return GAME[g] ? g : null;
    } catch { return null; }
  }

  window.Passport = { GOODIES, PASS_PCT, goodieStatus, currentGoodie, showGoodie, syncRemote, dimTag, shortName, nameEntry, GAMES, GAME, today, isPhone, current, signIn, signOut, touch, player, playersNamed, playersToday, currentName, currentTag, currentLabel, newTag, withTag, maskName, shownName, rememberMine, freshFirst, pickFresh, markSeen, stamp, podium, champions, paused, setLeaveGuard, mount, takePendingGame, savedNote };

  const script = document.currentScript;
  const gameId = script && script.dataset.game;
  const landscapeOnly = script && script.dataset.landscape !== undefined;
  const onReady = (fn) => { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); };
  if (gameId && requireName(gameId)) return;
  // while someone is playing, keep their sign-in alive (it lapses after 20 idle minutes)
  if (gameId) document.addEventListener('pointerdown', touch, true);
  if (gameId) onReady(() => mount(gameId));
  if (gameId && landscapeOnly) onReady(() => landscapePrompt(GAME[gameId] ? GAME[gameId].name : 'This game'));
})();
