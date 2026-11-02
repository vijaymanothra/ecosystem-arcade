// ============================================================
//  SHARED LEADERBOARD — used by all five games and the home screen.
//  • Scores are always written to this browser's localStorage first, so the games
//    keep working with no network and the boards render instantly.
//  • When a scores API is configured (shared/config.js), new scores are queued and
//    sent to it, and the local copy is refreshed with the shared top scores every
//    few seconds, so every kiosk and browser shows the same boards.
//  • Offline? Scores wait in the queue and are sent once the API is reachable again.
//  Load after passport.js (for the game list) and before the game script.
// ============================================================
(function () {
  'use strict';

  const CFG = window.ARCADE_CONFIG || {};
  const QUEUE = 'ecosystemArcade.scoreQueue.v1';
  const CLEARED = 'ecosystemArcade.lbCleared.v1';
  const MIGRATED = 'ecosystemArcade.lbMigrated.v1';
  const HIDDEN = 'ecosystemArcade.hiddenBoards.v1'; // game ids whose leaderboard staff have paused
  const FULL = 'ecosystemArcade.fullNames.v1';      // staff switched on "show full names" on the admin page
  const EXPERTS = 'ecosystemArcade.experts.v1';     // today's Ecosystem Experts from every device, as the API sent them
  const KEEP = 2000;          // entries kept per game on this device
  const FETCH_LIMIT = 50;     // top N per game pulled from the API, for today and for all time
  const BATCH = 25;           // scores per upload request
  const TIMEOUT_MS = 8000;
  const SYNC_MS = Math.max(5, Number(CFG.syncSeconds) || 20) * 1000;

  const GAMES = (window.Passport && window.Passport.GAMES) || [];
  const gameByKey = Object.fromEntries(GAMES.map((g) => [g.lb, g.id]));

  const read = (k, fallback) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fallback : v; } catch { return fallback; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const byScore = (a, b) => (b.score - a.score) || ((a.at || 0) - (b.at || 0));
  const withoutGame = ({ game, ...e }) => { void game; return e; };

  // ---------------------------------------------------------------- API location
  function resolveApi() {
    const v = CFG.scoresApi == null ? 'auto' : String(CFG.scoresApi).trim();
    if (v === 'auto') return /^https?:$/.test(location.protocol) ? { url: `${location.origin}/api`, auto: true } : null;
    return v ? { url: v.replace(/\/+$/, ''), auto: false } : null;
  }
  const api = resolveApi();
  let reachable = false;   // has the API answered on this page yet?
  let disabled = !api;     // 'auto' on a plain static host (no API there) turns sharing off
  let clockOffset = 0;     // server clock minus this device's clock
  const now = () => Date.now() + clockOffset;

  // ---------------------------------------------------------------- public: local reads and writes
  function stored(key) {
    const v = read(key, []);
    return Array.isArray(v) ? v : [];
  }

  // Staff can pause a leaderboard from the admin page: its scores stay saved but aren't shown.
  // key = a game's leaderboard key or its id
  function isHidden(key) {
    return read(HIDDEN, []).includes(gameByKey[key] || key);
  }
  // While staff show full names (to announce winners), boards show everyone's name unmasked.
  function fullNames() {
    return read(FULL, false) === true;
  }
  // Everyone with a score in every game today (any device): [{ name, tag, at }], names as the API sent them.
  function experts() {
    const e = read(EXPERTS, null);
    return e && e.day === today() && Array.isArray(e.list) ? e.list : [];
  }
  // How many different players played at least one game today, on any device (null before the API answers).
  function playersToday() {
    const e = read(EXPERTS, null);
    return e && e.day === today() && Number.isFinite(e.players) ? e.players : null;
  }

  // what a leaderboard shows: nothing while it's paused; other players' names partly hidden ("Pr***a S."),
  // the signed-in player's own scores in full
  function load(key) {
    if (isHidden(key)) return [];
    const P = window.Passport;
    return P && P.shownName ? stored(key).map((e) => ({ ...e, name: P.shownName(e) })) : stored(key);
  }

  function add(key, entry) {
    entry.at = now();
    const P = window.Passport;
    if (P && P.newTag && !entry.tag) {
      // the signed-in player's score carries their passport tag ("#qw7"); a score saved under another name
      // (a Health Journey winner who isn't signed in here) gets a tag of its own, so namesakes stay apart
      const mine = P.currentName && entry.name && entry.name.toLowerCase() === P.currentName().toLowerCase();
      entry.tag = mine ? P.currentTag() : P.newTag();
    }
    if (P && P.rememberMine) P.rememberMine(entry.id, entry.name, entry.tag); // so this player keeps seeing it in full
    const all = stored(key);
    all.push(entry);
    all.sort(byScore);
    write(key, all.slice(0, KEEP));
    const game = gameByKey[key];
    if (!disabled && game) {
      const q = read(QUEUE, []);
      q.push({ game, ...entry });
      write(QUEUE, q);
      sync();
    }
    return entry;
  }

  // Staff "clear leaderboard" only resets the board on this device: shared scores
  // older than this moment stop showing here. Reset the shared board on the server.
  function clear(key) {
    write(key, []);
    const c = read(CLEARED, {});
    c[key] = now();
    write(CLEARED, c);
  }

  // ---------------------------------------------------------------- talking to the API
  async function request(path, opts) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(api.url + path, { ...opts, signal: ctl.signal, cache: 'no-store' });
      if (!res.ok) { const err = new Error(`HTTP ${res.status}`); err.status = res.status; throw err; }
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  // The first time this device reaches an API, upload the scores it already holds.
  function migrateOnce() {
    const done = read(MIGRATED, {});
    if (done[api.url]) return;
    const q = read(QUEUE, []);
    const queued = new Set(q.map((e) => e.id));
    for (const g of GAMES) {
      for (const e of stored(g.lb)) {
        if (!e || !e.id || queued.has(e.id)) continue;
        q.push({ game: g.id, ...e, at: e.at || parseInt(e.id, 10) || undefined });
      }
    }
    write(QUEUE, q);
    done[api.url] = Date.now();
    write(MIGRATED, done);
  }

  async function flush() {
    // bounded, so a queue that can't be rewritten (storage full) can't loop forever
    for (let round = 0; round < 20; round++) {
      const batch = read(QUEUE, []).slice(0, BATCH);
      if (!batch.length) return;
      try {
        await request('/scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scores: batch }),
        });
      } catch (err) {
        // A 4xx other than rate limiting means the server will never take this batch: drop it.
        if (!(err.status >= 400 && err.status < 500 && err.status !== 429)) throw err;
      }
      const sent = new Set(batch.map((e) => e.id));
      write(QUEUE, read(QUEUE, []).filter((e) => !sent.has(e.id)));
    }
  }

  // Replace each game's local board with the shared top scores, plus anything still waiting to upload.
  async function refresh() {
    const res = await request(`/scores?day=${today()}&limit=${FETCH_LIMIT}`);
    if (typeof res.now === 'number') clockOffset = res.now - Date.now();
    const cleared = read(CLEARED, {});
    const pending = read(QUEUE, []);
    const shared = Array.isArray(res.scores) ? res.scores : [];
    let changed = false;
    // which boards staff have paused (the API leaves their scores out)
    const hidden = Array.isArray(res.hidden) ? res.hidden.filter((id) => typeof id === 'string') : [];
    if (JSON.stringify(hidden) !== JSON.stringify(read(HIDDEN, []))) { write(HIDDEN, hidden); changed = true; }
    const full = res.fullNames === true;
    if (full !== fullNames()) { write(FULL, full); changed = true; }
    const ex = { day: today(), list: (Array.isArray(res.experts) ? res.experts : []).filter((e) => e && typeof e.name === 'string').slice(0, 200),
      players: Number.isFinite(res.players) ? res.players : null };
    if (JSON.stringify(ex) !== JSON.stringify(read(EXPERTS, null))) { write(EXPERTS, ex); changed = true; }
    for (const g of GAMES) {
      const since = cleared[g.lb] || 0;
      const keep = (e) => e && e.game === g.id && (e.at || 0) >= since;
      const fromServer = shared.filter(keep);
      const ids = new Set(fromServer.map((e) => e.id));
      const next = fromServer.concat(pending.filter((e) => keep(e) && !ids.has(e.id)))
        .map(withoutGame).sort(byScore).slice(0, KEEP);
      if (JSON.stringify(next) !== JSON.stringify(stored(g.lb))) { write(g.lb, next); changed = true; }
    }
    if (changed) window.dispatchEvent(new Event('arcade:scores'));
  }

  let busy = false;
  let again = false;
  async function sync() {
    if (disabled) return;
    if (busy) { again = true; return; }
    busy = true;
    try {
      if (!reachable) { await request('/health'); reachable = true; }
      migrateOnce();
      await flush();
      await refresh();
    } catch (err) {
      // 'auto' mode on a host that serves the games but has no API: stop asking.
      if (api.auto && !reachable && err.status) disabled = true;
    } finally {
      busy = false;
      if (again) { again = false; sync(); }
    }
  }

  function status() {
    return { api: api && api.url, shared: !disabled && reachable, pending: read(QUEUE, []).length };
  }
  function onChange(fn) { window.addEventListener('arcade:scores', fn); }

  window.Leaderboard = { load, add, clear, sync, status, onChange, isHidden, fullNames, experts, playersToday };

  if (!disabled) {
    sync();
    setInterval(sync, SYNC_MS);
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  }
})();
