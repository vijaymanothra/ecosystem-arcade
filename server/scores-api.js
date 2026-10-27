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
//    clear(game)             → how many scores were removed
//
//  Endpoints:
//    GET    /api/health                           → { ok: true }
//    GET    /api/scores?day=YYYY-MM-DD&limit=50   → { now, scores: [...] }
//           the top `limit` per game for that day, plus the top `limit` per game of all time
//    POST   /api/scores  { scores: [{ id, game, name, score, day, at, ...details }] }
//           → { accepted: [ids], rejected: [ids] }   (sending the same id twice stores it once)
//    DELETE /api/scores?game=<id>   with header  X-Admin-Token: <admin token>
//           (or Authorization: Bearer <admin token>, except on Azure, which keeps that header)
//           → { deleted }   clears one game's scores, or every game's without ?game
// ============================================================
'use strict';

const core = require('./scores-core');

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
  const adminFailures = core.createRateLimiter(core.ADMIN_FAILS_PER_MINUTE);
  const listCache = new Map();

  async function topScores(day, limit) {
    const key = `${day}|${limit}`;
    const hit = listCache.get(key);
    if (hit && Date.now() - hit.at < listCacheMs) return hit.scores;
    const games = Object.keys(core.GAMES);
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
    if (listCache.size > 50) listCache.clear();
    listCache.set(key, { at: Date.now(), scores });
    return scores;
  }

  return async function handle(req) {
    const headers = req.headers || {};
    const query = req.query || {};
    const cors = core.corsHeaders(headers.origin, allowedOrigins);
    const json = (status, body, cache = 'no-store') => ({
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff', ...cors },
      body: JSON.stringify(body),
    });

    if (req.method === 'OPTIONS') return { status: 204, headers: cors, body: '' };
    if (req.path === '/api/health' && req.method === 'GET') return json(200, { ok: true });
    if (req.path !== '/api/scores') return json(404, { error: 'not found' });

    try {
      if (req.method === 'GET') {
        const scores = await topScores(core.parseDay(query.day), core.parseLimit(query.limit));
        return json(200, { now: Date.now(), scores }, listCacheControl);
      }

      if (req.method === 'POST' || req.method === 'DELETE') {
        // pages on other websites may not send scores or wipe them
        if (!core.originAllowed(headers.origin, allowedOrigins)) return json(403, { error: 'this site may not send scores' });
      }

      if (req.method === 'POST') {
        if (rateLimited(req.ip || '')) return json(429, { error: 'too many uploads, slow down' });
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

      if (req.method === 'DELETE') {
        // too many wrong tokens from this address: pause it (guessing a 32-character token is hopeless anyway)
        if (adminFailures.over(req.ip || '')) return json(429, { error: 'too many wrong admin tokens, wait a minute' });
        // X-Admin-Token works everywhere; Azure Static Web Apps keeps the Authorization header for itself
        const given = headers['x-admin-token'] ? `Bearer ${headers['x-admin-token']}` : headers.authorization;
        if (!core.tokenMatches(given, adminToken)) {
          adminFailures(req.ip || '');
          return json(adminToken ? 401 : 403, { error: adminToken ? 'wrong admin token' : 'set ADMIN_TOKEN to enable this' });
        }
        const game = query.game;
        if (game && !Object.hasOwn(core.GAMES, game)) return json(400, { error: 'unknown game' });
        let deleted = 0;
        for (const g of game ? [game] : Object.keys(core.GAMES)) deleted += await store.clear(g);
        listCache.clear();
        return json(200, { deleted });
      }

      return json(405, { error: 'method not allowed' });
    } catch (err) {
      log.error(err);
      return json(500, { error: 'server error' });
    }
  };
}

module.exports = { createApi };
