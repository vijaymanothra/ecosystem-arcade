// ============================================================
//  ECOSYSTEM ARCADE — scores API on AWS Lambda (behind API Gateway and CloudFront).
//  Same endpoints and rules as server/server.js; scores live in DynamoDB.
//  The deploy script copies server/scores-core.js and blocked-words.txt next to this file.
//
//  Environment:
//    TABLE_NAME      DynamoDB table (indexes: byDay = gameDay + score, byGame = game + score)
//    ADMIN_TOKEN     token for DELETE /api/scores
//    ORIGIN_SECRET   CloudFront sends it in X-Origin-Verify; requests without it are refused,
//                    so nobody can skip CloudFront's caching by calling API Gateway directly
//    ALLOWED_ORIGIN  sites allowed to call the API from a browser (default *)
//    SERVE_SITE      1 = also serve the games from the bundled site/ folder (used while there's
//                    no CloudFront in front: API Gateway's address then hosts everything)
// ============================================================
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

// packaged: copied next to this file; in the repo (tests): server/scores-core.js
const core = (() => {
  try { return require('./scores-core.js'); } catch { return require('../../server/scores-core.js'); }
})();

const LIST_CACHE_MS = 3000; // CloudFront caches lists too; this covers requests that reach this copy of the function

// ---------------------------------------------------------------- storage
function dynamoStore(tableName) {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, PutCommand, QueryCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const fromItem = (it) => ({ id: it.id, game: it.game, name: it.name, score: it.score, day: it.day, at: it.at, details: JSON.parse(it.details || '{}') });

  return {
    // false when a score with this id is already stored (a retry)
    async put(s) {
      try {
        await doc.send(new PutCommand({
          TableName: tableName,
          Item: { ...s, gameDay: `${s.game}#${s.day}`, details: JSON.stringify(s.details) },
          ConditionExpression: 'attribute_not_exists(id)',
        }));
        return true;
      } catch (err) {
        if (err.name === 'ConditionalCheckFailedException') return false;
        throw err;
      }
    },
    async top(game, day, limit) {
      const res = await doc.send(new QueryCommand(day
        ? { TableName: tableName, IndexName: 'byDay', KeyConditionExpression: '#k = :k', ExpressionAttributeNames: { '#k': 'gameDay' }, ExpressionAttributeValues: { ':k': `${game}#${day}` }, ScanIndexForward: false, Limit: limit }
        : { TableName: tableName, IndexName: 'byGame', KeyConditionExpression: '#k = :k', ExpressionAttributeNames: { '#k': 'game' }, ExpressionAttributeValues: { ':k': game }, ScanIndexForward: false, Limit: limit }));
      return (res.Items || []).map(fromItem);
    },
    async clear(game) {
      let deleted = 0;
      let start;
      do {
        const page = await doc.send(new QueryCommand({
          TableName: tableName, IndexName: 'byGame', KeyConditionExpression: '#k = :k',
          ExpressionAttributeNames: { '#k': 'game' }, ExpressionAttributeValues: { ':k': game },
          ProjectionExpression: 'id', ExclusiveStartKey: start,
        }));
        const ids = (page.Items || []).map((it) => it.id);
        for (let i = 0; i < ids.length; i += 25) {
          let req = { [tableName]: ids.slice(i, i + 25).map((id) => ({ DeleteRequest: { Key: { id } } })) };
          for (let tries = 0; req && Object.keys(req).length && tries < 5; tries++) {
            const out = await doc.send(new BatchWriteCommand({ RequestItems: req }));
            req = out.UnprocessedItems;
          }
        }
        deleted += ids.length;
        start = page.LastEvaluatedKey;
      } while (start);
      return deleted;
    },
  };
}

// ---------------------------------------------------------------- the games (only when there's no CloudFront)
// Files are read once per function copy and kept in memory, compressed; browsers re-check them
// on each visit and get a tiny "not modified" answer unless a deploy changed them.
function siteServer(siteDir) {
  const files = new Map();
  const TEXT = /^(text\/|image\/svg)/;

  function load(file) {
    if (files.has(file)) return files.get(file);
    let entry = null;
    try {
      const type = core.CONTENT_TYPES[path.extname(file).toLowerCase()];
      if (type && fs.statSync(file).isFile()) {
        const raw = fs.readFileSync(file);
        entry = { type, raw, gz: TEXT.test(type) ? zlib.gzipSync(raw, { level: 9 }) : null, etag: `"${crypto.createHash('sha1').update(raw).digest('base64url')}"` };
      }
    } catch { /* missing */ }
    files.set(file, entry);
    return entry;
  }

  return function serve(pathName, method, headers) {
    const notFound = { statusCode: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: 'Not found' };
    if (method !== 'GET' && method !== 'HEAD') return { statusCode: 405, headers: { Allow: 'GET, HEAD' }, body: '' };
    let rel;
    try { rel = decodeURIComponent(pathName); } catch { return notFound; }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(siteDir, path.normalize(rel));
    const inside = path.relative(siteDir, file);
    if (!inside || inside.startsWith('..') || path.isAbsolute(inside) || inside.split(path.sep).some((p) => p.startsWith('.'))) return notFound;
    const f = load(file);
    if (!f) {
      // a folder without the trailing slash: /route-rush → /route-rush/
      if (!path.extname(file) && load(path.join(file, 'index.html'))) return { statusCode: 301, headers: { Location: `${pathName}/` }, body: '' };
      return notFound;
    }
    const base = { 'Content-Type': f.type, 'Cache-Control': 'no-cache', ETag: f.etag, Vary: 'Accept-Encoding' };
    if (headers['if-none-match'] === f.etag) return { statusCode: 304, headers: base, body: '' };
    const gzip = f.gz && /\bgzip\b/.test(headers['accept-encoding'] || '');
    const body = gzip ? f.gz : f.raw;
    return {
      statusCode: 200,
      headers: gzip ? { ...base, 'Content-Encoding': 'gzip' } : base,
      body: method === 'HEAD' ? '' : body.toString('base64'),
      isBase64Encoded: method !== 'HEAD',
    };
  };
}

// ---------------------------------------------------------------- the API
function createApi({ store, adminToken = '', originSecret = '', allowedOrigins = ['*'], isBlocked = null, siteDir = null }) {
  const serveSite = siteDir ? siteServer(siteDir) : null;
  const rateLimited = core.createRateLimiter();
  const listCache = new Map();

  async function topScores(day, limit) {
    const key = `${day}|${limit}`;
    const hit = listCache.get(key);
    if (hit && Date.now() - hit.at < LIST_CACHE_MS) return hit.scores;
    const games = Object.keys(core.GAMES);
    const lists = await Promise.all(games.flatMap((g) => [store.top(g, day, limit), store.top(g, null, limit)]));
    const seen = new Set();
    const scores = [];
    for (const list of lists) {
      for (const s of list.sort(core.byRank)) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        scores.push(core.toPublic(s));
      }
    }
    if (listCache.size > 50) listCache.clear();
    listCache.set(key, { at: Date.now(), scores });
    return scores;
  }

  return async function handle(event) {
    const headers = event.headers || {};
    const method = event.requestContext.http.method;
    const pathName = event.rawPath || '/';
    const params = event.queryStringParameters || {};
    const cors = core.corsHeaders(headers.origin, allowedOrigins);
    const json = (status, body, cache = 'no-store') => ({
      statusCode: status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache, ...cors },
      body: JSON.stringify(body),
    });

    if (originSecret && !core.tokenMatches(headers['x-origin-verify'], originSecret)) return json(403, { error: 'use the arcade address' });
    if (pathName !== '/api' && !pathName.startsWith('/api/')) return serveSite ? serveSite(pathName, method, headers) : json(404, { error: 'not found' });
    if (method === 'OPTIONS') return { statusCode: 204, headers: cors };
    if (pathName === '/api/health' && method === 'GET') return json(200, { ok: true });
    if (pathName !== '/api/scores') return json(404, { error: 'not found' });

    try {
      if (method === 'GET') {
        const scores = await topScores(core.parseDay(params.day), core.parseLimit(params.limit));
        // CloudFront keeps this for a few seconds, so hundreds of screens cost one lookup
        return json(200, { now: Date.now(), scores }, 'public, max-age=0, s-maxage=5');
      }

      if (method === 'POST') {
        // CloudFront tells us the player's real address; API Gateway only sees CloudFront's
        const viewer = String(headers['cloudfront-viewer-address'] || '');
        const ip = viewer ? viewer.slice(0, viewer.lastIndexOf(':')) : event.requestContext.http.sourceIp;
        if (rateLimited(ip)) return json(429, { error: 'too many uploads, slow down' });
        const raw = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body) : '';
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
        await Promise.all(valid.map(async (s) => { await store.put(s); accepted.push(s.id); }));
        if (accepted.length) listCache.clear();
        return json(200, { accepted, rejected });
      }

      if (method === 'DELETE') {
        if (!core.tokenMatches(headers.authorization, adminToken)) {
          return json(adminToken ? 401 : 403, { error: adminToken ? 'wrong admin token' : 'set ADMIN_TOKEN to enable this' });
        }
        const game = params.game;
        if (game && !Object.hasOwn(core.GAMES, game)) return json(400, { error: 'unknown game' });
        let deleted = 0;
        for (const g of game ? [game] : Object.keys(core.GAMES)) deleted += await store.clear(g);
        listCache.clear();
        return json(200, { deleted });
      }

      return json(405, { error: 'method not allowed' });
    } catch (err) {
      console.error(err);
      return json(500, { error: 'server error' });
    }
  };
}

let api;
exports.handler = async (event) => {
  if (!api) {
    api = createApi({
      store: dynamoStore(process.env.TABLE_NAME),
      adminToken: process.env.ADMIN_TOKEN || '',
      originSecret: process.env.ORIGIN_SECRET || '',
      allowedOrigins: core.parseOrigins(process.env.ALLOWED_ORIGIN),
      isBlocked: core.loadNameFilter(__dirname).isBlocked,
      siteDir: process.env.SERVE_SITE === '1' ? path.join(__dirname, 'site') : null,
    });
  }
  return api(event);
};
exports.createApi = createApi;
