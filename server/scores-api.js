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
//
//  Player endpoints:
//    GET    /api/health                           → { ok: true }
//    GET    /api/scores?day=YYYY-MM-DD&limit=50   → { now, scores: [...], hidden: [game ids] }
//           the top `limit` per game for that day, plus the top `limit` per game of all time;
//           games whose leaderboard staff have hidden are left out and listed in `hidden`
//    POST   /api/scores  { scores: [{ id, game, name, score, day, at, ...details }] }
//           → { accepted: [ids], rejected: [ids] }   (sending the same id twice stores it once)
//
//  Admin endpoints — scores only, never the games themselves. Each needs the admin password in
//  the header  X-Admin-Token: <password>  (or Authorization: Bearer <password>, except on Azure,
//  which keeps that header for itself). Pages on other websites are refused.
//    GET    /api/admin/scores                     → { games: { <id>: count }, hiddenGames }
//    GET    /api/admin/scores?game=<id>           → { game, hidden, scores: [every score, best first] }
//    DELETE /api/admin/scores?game=<id>&id=<sid>  → { deleted: 0|1 }   one entry
//    DELETE /api/scores?game=<id>                 → { deleted }        one game's scores, or all without ?game
//    GET    /api/admin/settings                   → { hiddenGames }
//    PUT    /api/admin/settings  { hiddenGames }  → { hiddenGames }    hide / show leaderboards
// ============================================================
'use strict';

const core = require('./scores-core');

const GAME_IDS = Object.keys(core.GAMES);
const cleanSettings = (s) => ({
  hiddenGames: Array.isArray(s && s.hiddenGames) ? GAME_IDS.filter((g) => s.hiddenGames.includes(g)) : [],
});

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
  const listCache = new Map();
  let settingsCache = null;

  async function settings() {
    if (settingsCache && Date.now() - settingsCache.at < listCacheMs) return settingsCache.value;
    const value = cleanSettings(await store.getSettings());
    settingsCache = { at: Date.now(), value };
    return value;
  }

  async function topScores(day, limit) {
    const key = `${day}|${limit}`;
    const hit = listCache.get(key);
    if (hit && Date.now() - hit.at < listCacheMs) return hit.value;
    const { hiddenGames } = await settings();
    const games = GAME_IDS.filter((g) => !hiddenGames.includes(g)); // hidden boards: no names leave the API
    const lists = await Promise.all(games.flatMap((g) => [store.top(g, day, limit), store.top(g, null, limit)]));
    const seen = new Set();
    const scores = [];
    for (const list of lists) {
      for (const s of [...list].sort(core.byRank)) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        scores.push(core.toPublic(s));
      }
    }
    const value = { scores, hidden: hiddenGames };
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
        const { scores, hidden } = await topScores(core.parseDay(query.day), core.parseLimit(query.limit));
        return json(200, { now: Date.now(), scores, hidden }, listCacheControl);
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
        forget();
        return json(200, { deleted });
      }

      if (req.path === '/api/admin/scores' && req.method === 'GET') {
        const refused = refuseAdmin(); if (refused) return refused;
        const { hiddenGames } = await settings();
        if (!query.game) {
          const games = {};
          for (const g of GAME_IDS) games[g] = (await store.list(g)).length;
          return json(200, { games, hiddenGames });
        }
        if (!knownGame(query.game)) return json(400, { error: 'unknown game' });
        const scores = (await store.list(query.game)).sort(core.byRank).map(core.toPublic);
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

      if (req.path === '/api/admin/settings' && (req.method === 'GET' || req.method === 'PUT')) {
        const refused = refuseAdmin(); if (refused) return refused;
        if (req.method === 'GET') return json(200, await settings());
        if (!/^application\/json\b/i.test(headers['content-type'] || '')) return json(415, { error: 'send JSON (Content-Type: application/json)' });
        let body;
        try { body = JSON.parse(req.body || ''); } catch { return json(400, { error: 'invalid JSON' }); }
        const next = cleanSettings(body);
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
