// ============================================================
//  SCORES API — the endpoints, the same on every host.
//  The local server (server/server.js) and the Azure Functions app (azure/api) both
//  hand requests to this, so they accept, refuse and answer exactly alike.
//
//  createApi({ store, ... }) returns handle(request) → response, where
//    request  = { method, path, query: {k: v}, headers: {lowercase: v}, body: string, ip }
//    response = { status, headers: {…}, body: string }
//  and the store is anything with:
//    put(score)              → true if saved, false if that id was already saved
//    top(game, day, limit)   → best scores first; day null = all time
//    list(game)              → every score of the game, best first
//    remove(game, id)        → 1 if removed, 0 if there was no such score
//    clear(game)             → how many scores were removed
//    getSettings()           → { hiddenGames: [...] }
//    setSettings(settings)
//    getClaims()             → the goodies handed over
//    updateClaims(change)    → runs change(list) → new list (or null) with nobody else changing it in between
//
//  Player endpoints:
//    GET    /api/health                           → { ok: true }
//    GET    /api/scores?day=YYYY-MM-DD&limit=50   → { now, scores: [...], hidden: [game ids], fullNames, experts: [...], players: <how many played today> }
//           the top `limit` per game for that day, plus the top `limit` per game of all time;
//           games whose leaderboard staff have hidden are left out and listed in `hidden`
//    GET    /api/passports?day=YYYY-MM-DD&name=Priya%20S.  → { passports: [{ tag, games: { <id>: { score, pct } }, claims }] }
//           the "welcome back" lookup: passports with exactly this name, rebuilt from that day's scores
//    POST   /api/passports  { fullName, day } → { passports: [{ tag, fullName, games, claims }] }   sign in: same first and last name only
//    POST   /api/scores  { scores: [{ id, game, name, score, day, at, ...details }] }
//           → { accepted: [ids], rejected: [ids] }   (sending the same id twice stores it once)
//
//  Admin endpoints — scores only, never the games themselves. Each needs the admin password in
//  the header  X-Admin-Token: <password>  (or Authorization: Bearer <password>, except on Azure,
//  which keeps that header for itself). Pages on other websites are refused.
//    GET    /api/admin/scores?day=YYYY-MM-DD      → { games: { <id>: count }, hiddenGames, experts: [that day's Ecosystem Experts, full names], players }
//    GET    /api/admin/scores?game=<id>           → { game, hidden, scores: [every score, best first] }
//    DELETE /api/admin/scores?game=<id>&id=<sid>  → { deleted: 0|1 }   one entry
//    DELETE /api/scores?game=<id>                 → { deleted }        one game's scores, or all without ?game
//    GET    /api/admin/settings                   → { hiddenGames, showFullNames, goodieStock }
//    PUT    /api/admin/settings  { hiddenGames?, showFullNames?, goodieStock? } → the settings   hide / show leaderboards,
//           show players' full names instead of masked ones ("Priya S." rather than "Pr***a S."), goodies in stock
//    GET    /api/admin/goodies?day=YYYY-MM-DD     → { stock, players: [who has earned what], top: [top scorers], claims }
//    POST   /api/admin/goodies  { day, name, tag, via: 'games' | 'top' } → { claim }   hand one over; the server
//           works out which goodie, and answers 409 if it was already collected or nothing is left
//    DELETE /api/admin/goodies?id=<claim id>      → { deleted: 0|1 }   undo a mistake
// ============================================================
'use strict';

const core = require('./scores-core');

const GAME_IDS = Object.keys(core.GAMES);
const EXPERT_SCAN_MAX = 20000; // a day's scores per game read to find Ecosystem Experts (score files hold at most 20,000)
const EXPERTS_MAX = 200;       // Ecosystem Experts sent per day
const cleanSettings = (s) => ({
  hiddenGames: Array.isArray(s && s.hiddenGames) ? GAME_IDS.filter((g) => s.hiddenGames.includes(g)) : [],
  // staff switched on "show full names" (e.g. to announce winners): leaderboards show names unmasked until switched off
  showFullNames: Boolean(s && s.showFullNames === true),
  // goodies in stock, changed by staff if more arrive
  goodieStock: Object.fromEntries([...core.GOODIES, core.TOP_PRIZE].map((g) => {
    const n = s && s.goodieStock && s.goodieStock[g.id];
    return [g.id, Number.isInteger(n) && n >= 0 && n <= 100000 ? n : g.stock];
  })),
});
const personKey = (name, tag) => `${String(name).toLowerCase()}#${tag || ''}`;
// the goodie a number of passed games earns; null below the first level
const earnedGoodie = (passed) => [...core.GOODIES].reverse().find((g) => passed >= g.games) || null;

function createApi({
  store,
  adminToken = '',
  allowedOrigins = ['*'],
  isBlocked = null,
  listCacheMs = 3000,          // screens all ask for the same lists; answer from memory this long
  listCacheControl = 'no-store',
  log = console,
}) {
  const rateLimited = core.createRateLimiter();
  const adminFailures = core.createRateLimiter(core.ADMIN_FAIL_LIMIT, core.ADMIN_FAIL_WINDOW_MS);
  const lookups = core.createRateLimiter(); // sized like uploads: offices share one public address
  const listCache = new Map();
  let settingsCache = null;

  async function settings() {
    if (settingsCache && Date.now() - settingsCache.at < listCacheMs) return settingsCache.value;
    const value = cleanSettings(await store.getSettings());
    settingsCache = { at: Date.now(), value };
    return value;
  }

  // Who played on a day, from the scores saved: everyone is one name + passport tag.
  //   players: how many played at least one game (the "passports issued" count; a number, no names)
  //   experts: everyone with a score in every game, in the order they finished their last game
  //            (names come back full; callers mask them for players)
  async function playersOn(day) {
    const perGame = await Promise.all(GAME_IDS.map((g) => store.top(g, day, EXPERT_SCAN_MAX)));
    const who = new Map(); // "priya s.#qw7" → { name, tag, firstAt: Map(game → when they first scored in it) }
    perGame.forEach((list, gi) => {
      for (const s of list) {
        const tag = (s.details && s.details.tag) || '';
        const key = `${String(s.name).toLowerCase()}#${tag}`;
        const p = who.get(key) || { name: s.name, tag, firstAt: new Map() };
        p.firstAt.set(gi, Math.min(p.firstAt.get(gi) ?? Infinity, s.at));
        who.set(key, p);
      }
    });
    const experts = [...who.values()]
      .filter((p) => p.firstAt.size === GAME_IDS.length)
      .map((p) => ({ name: p.name, tag: p.tag || undefined, at: Math.max(...p.firstAt.values()) }))
      .sort((a, b) => a.at - b.at)
      .slice(0, EXPERTS_MAX);
    return { players: who.size, experts };
  }

  // Everyone's passport on a day, from its scores: "priya s.#qw7" → { name, tag, games: { <id>: { score, pct } } }.
  // pct is the best share of answers right in a solo game; a score without one (multiplayer) never passes.
  async function passportsOn(day) {
    const key = `passports|${day}`;
    const hit = listCache.get(key);
    if (hit && Date.now() - hit.at < listCacheMs) return hit.value;
    const perGame = await Promise.all(GAME_IDS.map((g) => store.top(g, day, EXPERT_SCAN_MAX)));
    const book = new Map();
    perGame.forEach((list, gi) => {
      for (const s of list) {
        const tag = (s.details && s.details.tag) || '';
        const k = personKey(s.name, tag);
        const p = book.get(k) || { name: s.name, tag, games: {} };
        if (!p.fullName && s.details && s.details.fullName) p.fullName = s.details.fullName;
        const g = p.games[GAME_IDS[gi]] || (p.games[GAME_IDS[gi]] = { score: s.score, pct: 0 });
        g.score = Math.max(g.score, s.score);
        const pct = s.details && s.details.pct;
        if (Number.isFinite(pct)) g.pct = Math.max(g.pct, Math.min(100, Math.max(0, Math.round(pct))));
        book.set(k, p);
      }
    });
    listCache.set(key, { at: Date.now(), value: book });
    return book;
  }
  const passedGames = (p) => Object.values(p.games).filter((g) => g.pct >= core.PASS_PCT).length;

  // what's left of each goodie, from what has been handed over
  function stockLeft(claims, goodieStock) {
    const out = {};
    for (const g of [...core.GOODIES, core.TOP_PRIZE]) {
      const given = claims.filter((c) => (g === core.TOP_PRIZE ? c.via === 'top' : c.via === 'games' && c.goodie === g.id)).length;
      out[g.id] = { total: goodieStock[g.id], given, left: Math.max(0, goodieStock[g.id] - given) };
    }
    return out;
  }
  // the goodie to hand over: the one earned, or the next one down if that has run out
  function goodieToGive(passed, left) {
    for (const g of [...core.GOODIES].reverse()) if (passed >= g.games && left[g.id].left > 0) return g;
    return null;
  }
  // The top scorers still in line for a reserved phone holder: the best on each game's board that day, one place
  // per person. Someone who already has a phone holder passes it on to the next person on that board.
  async function topScorers(day, claims) {
    const holders = new Set(claims.filter((c) => c.goodie === core.TOP_PRIZE.goodie).map((c) => personKey(c.name, c.tag)));
    const picked = new Set();
    const out = [];
    for (const game of GAME_IDS) {
      let n = claims.filter((c) => c.via === 'top' && c.game === game).length; // places on this board already given
      for (const s of (await store.top(game, day, EXPERT_SCAN_MAX)).sort(core.byRank)) {
        if (n >= core.TOP_PRIZE.perGame) break;
        const tag = (s.details && s.details.tag) || '';
        const k = personKey(s.name, tag);
        if (holders.has(k) || picked.has(k)) continue;
        picked.add(k);
        out.push({ game, name: s.name, fullName: s.details && s.details.fullName, tag: tag || undefined, score: s.score });
        n++;
      }
    }
    return out;
  }

  async function topScores(day, limit) {
    const key = `${day}|${limit}`;
    const hit = listCache.get(key);
    if (hit && Date.now() - hit.at < listCacheMs) return hit.value;
    const { hiddenGames, showFullNames } = await settings();
    const games = GAME_IDS.filter((g) => !hiddenGames.includes(g)); // hidden boards: no names leave the API
    const lists = await Promise.all(games.flatMap((g) => [store.top(g, day, limit), store.top(g, null, limit)]));
    const seen = new Set();
    const scores = [];
    for (const list of lists) {
      for (const s of [...list].sort(core.byRank)) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        // players see names masked, unless staff have switched on "show full names"
        scores.push({ ...core.toPublic(s), name: showFullNames ? s.name : core.maskName(s.name) });
      }
    }
    // today's Ecosystem Experts, the same on every screen (hidden when staff have hidden every leaderboard)
    const today = await playersOn(day);
    const experts = hiddenGames.length === GAME_IDS.length ? []
      : today.experts.map((e) => ({ ...e, name: showFullNames ? e.name : core.maskName(e.name) }));
    const value = { scores, hidden: hiddenGames, fullNames: showFullNames, experts, players: today.players };
    if (listCache.size > 50) listCache.clear();
    listCache.set(key, { at: Date.now(), value });
    return value;
  }
  const forget = () => { listCache.clear(); settingsCache = null; };

  return async function handle(req) {
    const headers = req.headers || {};
    const query = req.query || {};
    const ip = req.ip || '';
    const cors = core.corsHeaders(headers.origin, allowedOrigins);
    const json = (status, body, cache = 'no-store') => ({
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff', ...cors },
      body: JSON.stringify(body),
    });

    // the admin password check, shared by every admin action
    function refuseAdmin() {
      if (!core.originAllowed(headers.origin, allowedOrigins)) return json(403, { error: 'this site may not change scores' });
      if (!adminToken) return json(403, { error: 'admin actions are switched off (no admin password set)' });
      if (adminFailures.over(ip)) return json(429, { error: 'too many wrong passwords from here; try again in 15 minutes' });
      // X-Admin-Token works everywhere; Azure Static Web Apps keeps the Authorization header for itself
      const given = headers['x-admin-token'] ? `Bearer ${headers['x-admin-token']}` : headers.authorization;
      if (!given) return json(401, { error: 'admin password needed' }); // no password sent: refused, but not a guess
      if (!core.tokenMatches(given, adminToken)) { adminFailures(ip); return json(401, { error: 'wrong admin password' }); }
      return null;
    }
    const knownGame = (g) => typeof g === 'string' && Object.hasOwn(core.GAMES, g);

    if (req.method === 'OPTIONS') return { status: 204, headers: cors, body: '' };
    if (req.path === '/api/health' && req.method === 'GET') return json(200, { ok: true });

    try {
      // ---------------------------------------------------------------- players
      if (req.path === '/api/scores' && req.method === 'GET') {
        const { scores, hidden, fullNames, experts, players } = await topScores(core.parseDay(query.day), core.parseLimit(query.limit));
        return json(200, { now: Date.now(), scores, hidden, fullNames, experts, players }, listCacheControl);
      }

      if (req.path === '/api/passports' && req.method === 'GET') {
        if (lookups(ip)) return json(429, { error: 'too many lookups, slow down' });
        const name = String(query.name || '').trim();
        if (!name || name.length > core.NAME_MAX) return json(400, { error: 'give the name to look up' });
        const day = core.parseDay(query.day);
        const claims = (await store.getClaims()).filter((c) => c.day === day);
        const wanted = name.toLowerCase();
        const passports = [...(await passportsOn(day)).values()]
          .filter((p) => p.tag && String(p.name).toLowerCase() === wanted)
          .map((p) => ({
            tag: p.tag,
            games: p.games,
            claims: claims.filter((c) => personKey(c.name, c.tag) === personKey(p.name, p.tag)).map((c) => ({ goodie: c.goodie, via: c.via })),
          }));
        return json(200, { passports });
      }

      // sign in: the passports of whoever typed this full name. Sent in the body so it stays out of web logs, and it
      // returns only the same first and last name, so typing a name never reveals someone else's.
      // A passport from before full names were kept has only "Priya S." to go on.
      if (req.path === '/api/passports' && req.method === 'POST') {
        if (!core.originAllowed(headers.origin, allowedOrigins)) return json(403, { error: 'this site may not look up passports' });
        if (lookups(ip)) return json(429, { error: 'too many lookups, slow down' });
        if (!/^application\/json\b/i.test(headers['content-type'] || '')) return json(415, { error: 'send JSON (Content-Type: application/json)' });
        let body;
        try { body = JSON.parse(req.body || ''); } catch { return json(400, { error: 'invalid JSON' }); }
        const wantedKey = core.fullNameKey(body && body.fullName);
        if (!wantedKey) return json(400, { error: 'give the full name to look up' });
        const short = core.shortOfFull(body.fullName).toLowerCase();
        const day = core.parseDay(body.day);
        const claims = (await store.getClaims()).filter((c) => c.day === day);
        const passports = [...(await passportsOn(day)).values()]
          .filter((p) => p.tag && (p.fullName ? core.fullNameKey(p.fullName) === wantedKey : String(p.name).toLowerCase() === short))
          .map((p) => ({
            tag: p.tag,
            fullName: p.fullName,
            games: p.games,
            claims: claims.filter((c) => personKey(c.name, c.tag) === personKey(p.name, p.tag)).map((c) => ({ goodie: c.goodie, via: c.via })),
          }));
        return json(200, { passports });
      }

      if (req.path === '/api/scores' && req.method === 'POST') {
        // pages on other websites may not send scores
        if (!core.originAllowed(headers.origin, allowedOrigins)) return json(403, { error: 'this site may not send scores' });
        if (rateLimited(ip)) return json(429, { error: 'too many uploads, slow down' });
        // JSON only: plain form posts from other pages (which skip the browser's cross-site check) are refused
        if (!/^application\/json\b/i.test(headers['content-type'] || '')) return json(415, { error: 'send JSON (Content-Type: application/json)' });
        const raw = req.body || '';
        if (Buffer.byteLength(raw) > core.MAX_BODY) return json(413, { error: 'request too large' });
        let body;
        try { body = JSON.parse(raw); } catch { return json(400, { error: 'invalid JSON' }); }
        const list = body && body.scores;
        if (!Array.isArray(list) || list.length > core.MAX_PER_POST) {
          return json(400, { error: `send { scores: [...] } with at most ${core.MAX_PER_POST} scores` });
        }
        const now = Date.now();
        const accepted = [];
        const rejected = [];
        const valid = [];
        for (const e of list) {
          const s = core.cleanScore(e, now, isBlocked);
          if (s) valid.push(s);
          else if (e && typeof e.id === 'string') rejected.push(e.id.slice(0, 40));
        }
        // one at a time: stores that rewrite a file per save shouldn't race themselves
        try {
          for (const s of valid) { await store.put(s); accepted.push(s.id); }
        } catch (err) {
          if (err.code !== 'SCORES_FULL') throw err;
          log.error(err);   // a flood filled a score file: keep what was saved, the rest retry later
          if (accepted.length) listCache.clear();
          return json(503, { error: 'the leaderboard is full right now, try again later', accepted, rejected });
        }
        if (accepted.length) listCache.clear();
        return json(200, { accepted, rejected });
      }

      // ---------------------------------------------------------------- admin (scores only)
      if (req.path === '/api/scores' && req.method === 'DELETE') {
        const refused = refuseAdmin(); if (refused) return refused;
        if (query.game && !knownGame(query.game)) return json(400, { error: 'unknown game' });
        let deleted = 0;
        for (const g of query.game ? [query.game] : GAME_IDS) deleted += await store.clear(g);
        if (!query.game) await store.updateClaims((list) => (list.length ? [] : null)); // a full wipe starts the goodies over too
        forget();
        return json(200, { deleted });
      }

      if (req.path === '/api/admin/scores' && req.method === 'GET') {
        const refused = refuseAdmin(); if (refused) return refused;
        const { hiddenGames } = await settings();
        if (!query.game) {
          const games = {};
          for (const g of GAME_IDS) games[g] = (await store.list(g)).length;
          // the day's Ecosystem Experts with full names and tags (e.g. for prizes)
          return json(200, { games, hiddenGames, ...(await playersOn(core.parseDay(query.day))) });
        }
        if (!knownGame(query.game)) return json(400, { error: 'unknown game' });
        const scores = (await store.list(query.game)).sort(core.byRank).map(core.toAdmin);
        return json(200, { game: query.game, hidden: hiddenGames.includes(query.game), scores });
      }

      if (req.path === '/api/admin/scores' && req.method === 'DELETE') {
        const refused = refuseAdmin(); if (refused) return refused;
        if (!knownGame(query.game)) return json(400, { error: 'unknown game' });
        if (!/^[\w-]{1,40}$/.test(query.id || '')) return json(400, { error: 'give the id of the score to remove' });
        const deleted = await store.remove(query.game, query.id);
        forget();
        return json(200, { deleted });
      }

      // ---------------------------------------------------------------- admin: goodies at the booth
      if (req.path === '/api/admin/goodies' && req.method === 'GET') {
        const refused = refuseAdmin(); if (refused) return refused;
        const day = core.parseDay(query.day);
        const { goodieStock } = await settings();
        const claims = (await store.getClaims()).filter((c) => c.day === day);
        const stock = stockLeft(claims, goodieStock);
        const players = [...(await passportsOn(day)).values()]
          .map((p) => {
            const passed = passedGames(p);
            const mine = claims.filter((c) => personKey(c.name, c.tag) === personKey(p.name, p.tag));
            const earned = earnedGoodie(passed);
            const give = mine.some((c) => c.via === 'games') ? null : goodieToGive(passed, stock);
            return { name: p.name, fullName: p.fullName, tag: p.tag || undefined, passed, games: p.games, earned: earned && earned.id, give: give && give.id, claims: mine };
          })
          .filter((p) => p.earned || p.claims.length)
          .sort((a, b) => b.passed - a.passed || String(a.name).localeCompare(String(b.name)));
        return json(200, { day, stock, passPct: core.PASS_PCT, goodies: core.GOODIES, players, top: await topScorers(day, claims), claims });
      }

      if (req.path === '/api/admin/goodies' && req.method === 'POST') {
        const refused = refuseAdmin(); if (refused) return refused;
        if (!/^application\/json\b/i.test(headers['content-type'] || '')) return json(415, { error: 'send JSON (Content-Type: application/json)' });
        let body;
        try { body = JSON.parse(req.body || ''); } catch { return json(400, { error: 'invalid JSON' }); }
        const b = body && typeof body === 'object' ? body : {};
        const day = core.parseDay(b.day);
        const via = b.via === 'top' ? 'top' : 'games';
        const k = personKey(b.name, b.tag);
        const p = (await passportsOn(day)).get(k);
        if (!p) return json(404, { error: 'no scores today under that name and tag' });
        const { goodieStock } = await settings();
        let claim = null;
        let problem = null;
        // inside updateClaims, so two staff desks can't hand over the same one, or the last one twice
        await store.updateClaims((list) => {
          claim = null;
          problem = null;
          const today = list.filter((c) => c.day === day);
          const mine = today.filter((c) => personKey(c.name, c.tag) === k);
          const left = stockLeft(today, goodieStock);
          const entry = { id: `${day}|${k}|${via}`, day, name: p.name, tag: p.tag || undefined, via, at: Date.now() };
          if (via === 'top') {
            // a top scorer can still take the reserved phone holder after a smaller goodie, but never a second phone holder
            if (mine.some((c) => c.goodie === core.TOP_PRIZE.goodie)) { problem = 'already has a phone holder'; return null; }
            if (left[core.TOP_PRIZE.id].left < 1) { problem = 'no reserved phone holders left'; return null; }
            entry.goodie = core.TOP_PRIZE.goodie;
            entry.game = typeof b.game === 'string' && GAME_IDS.includes(b.game) ? b.game : undefined;
          } else {
            if (mine.length) { problem = 'already collected a goodie'; return null; }
            const passed = passedGames(p);
            if (!earnedGoodie(passed)) { problem = `has passed only ${passed} game${passed === 1 ? '' : 's'}, not enough for a goodie`; return null; }
            const give = goodieToGive(passed, left);
            if (!give) { problem = 'nothing left at this level: ask the booth lead'; return null; }
            entry.goodie = give.id;
          }
          claim = entry;
          return [...list, entry];
        });
        if (problem) return json(409, { error: `${p.name}${p.tag ? ` #${p.tag}` : ''} ${problem}` });
        return json(200, { claim });
      }

      if (req.path === '/api/admin/goodies' && req.method === 'DELETE') {
        const refused = refuseAdmin(); if (refused) return refused;
        let deleted = 0;
        await store.updateClaims((list) => {
          const next = list.filter((c) => c.id !== query.id);
          deleted = list.length - next.length;
          return deleted ? next : null;
        });
        return json(200, { deleted });
      }

      if (req.path === '/api/admin/settings' && (req.method === 'GET' || req.method === 'PUT')) {
        const refused = refuseAdmin(); if (refused) return refused;
        if (req.method === 'GET') return json(200, await settings());
        if (!/^application\/json\b/i.test(headers['content-type'] || '')) return json(415, { error: 'send JSON (Content-Type: application/json)' });
        let body;
        try { body = JSON.parse(req.body || ''); } catch { return json(400, { error: 'invalid JSON' }); }
        // only the settings sent change (hiding a leaderboard doesn't reset "show full names", and the other way round)
        const next = cleanSettings({ ...(await store.getSettings()), ...(body && typeof body === 'object' ? body : {}) });
        await store.setSettings(next);
        forget();
        return json(200, next);
      }

      if (req.path === '/api/scores' || req.path.startsWith('/api/admin/')) return json(405, { error: 'method not allowed' });
      return json(404, { error: 'not found' });
    } catch (err) {
      log.error(err);
      return json(500, { error: 'server error' });
    }
  };
}

module.exports = { createApi };
