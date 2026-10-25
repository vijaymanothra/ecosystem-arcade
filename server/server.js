// ============================================================
//  ECOSYSTEM ARCADE — scores API + web server for the games.
//  One process, no dependencies: Node's built-in http and SQLite (Node 22.13 or newer).
//
//    npm start          → games at http://localhost:3000, API at http://localhost:3000/api
//
//  API (JSON):
//    GET    /api/health                           → { ok: true }
//    GET    /api/scores?day=YYYY-MM-DD&limit=50   → { now, scores: [...] }
//           the top `limit` scores per game for that day, plus the top `limit` per game of all time
//    POST   /api/scores  { scores: [{ id, game, name, score, day, at, ...details }] }
//           → { accepted: [ids], rejected: [ids] }   (sending the same id twice stores it once)
//    DELETE /api/scores?game=<id>   with header  Authorization: Bearer <ADMIN_TOKEN>
//           → { deleted }   clears one game's scores, or every game's without ?game
//
//  Settings (environment variables):
//    PORT            3000
//    DB_PATH         server/data/scores.db
//    ADMIN_TOKEN     (unset)  DELETE stays switched off until this is set
//    ALLOWED_ORIGIN  *        sites allowed to call the API from a browser, comma separated
//                             (pages opened as local files send the origin "null")
//    SERVE_STATIC    1        0 = API only, when the games are hosted somewhere else
//    TRUST_PROXY     0        1 = take the client address from X-Forwarded-For (behind a proxy)
// ============================================================
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  console.error(`This server needs Node.js 22.13 or newer (found ${process.version}). Get it from https://nodejs.org`);
  process.exit(1);
}

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname, 'data', 'scores.db'));
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || '*').split(',').map((s) => s.trim()).filter(Boolean);
const SERVE_STATIC = process.env.SERVE_STATIC !== '0';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

// Highest believable score per game; anything above is rejected.
// Tighten these once you know what real top scores look like.
const GAMES = {
  'master-the-map': { maxScore: 1000000 },
  'route-rush': { maxScore: 1000000 },
  'health-journey': { maxScore: 1000000 },
  'evernorth-city': { maxScore: 10000000 },
  'case-files': { maxScore: 1000000 },
};
const NAME_MAX = 20;
const MAX_BODY = 64 * 1024;     // bytes per request
const MAX_PER_POST = 50;        // scores per upload
const MAX_LIMIT = 100;          // scores per game per list
const POSTS_PER_MINUTE = 60;    // uploads per client address
const DETAILS_MAX = 8;          // extra per-game fields kept with a score (accuracy, rank, …)
const DAY_MS = 24 * 60 * 60 * 1000;
const CORE = new Set(['id', 'game', 'name', 'score', 'day', 'at']);

// Optional name filter: one word per line in server/blocked-words.txt.
const BLOCKED = (() => {
  try {
    return fs.readFileSync(path.join(__dirname, 'blocked-words.txt'), 'utf8').split(/\r?\n/)
      .map((w) => w.trim().toLowerCase()).filter((w) => w && !w.startsWith('#'));
  } catch { return []; }
})();
const isBlocked = (name) => {
  const flat = name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return BLOCKED.some((w) => flat.includes(w));
};

// ---------------------------------------------------------------- database
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS scores (
    id      TEXT PRIMARY KEY,
    game    TEXT NOT NULL,
    name    TEXT NOT NULL,
    score   INTEGER NOT NULL,
    day     TEXT NOT NULL,
    at      INTEGER NOT NULL,
    details TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX IF NOT EXISTS scores_by_day ON scores (game, day, score DESC, at);
  CREATE INDEX IF NOT EXISTS scores_by_game ON scores (game, score DESC, at);
`);
const q = {
  topDay: db.prepare('SELECT * FROM scores WHERE game = ? AND day = ? ORDER BY score DESC, at LIMIT ?'),
  topAll: db.prepare('SELECT * FROM scores WHERE game = ? ORDER BY score DESC, at LIMIT ?'),
  insert: db.prepare('INSERT OR IGNORE INTO scores (id, game, name, score, day, at, details) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  clearGame: db.prepare('DELETE FROM scores WHERE game = ?'),
  clearAll: db.prepare('DELETE FROM scores'),
};

// Every kiosk asks for the same lists every few seconds; answer from memory until a score changes them.
const listCache = new Map();

function topScores(day, limit) {
  const key = `${day}|${limit}`;
  if (listCache.has(key)) return listCache.get(key);
  const seen = new Set();
  const out = [];
  for (const game of Object.keys(GAMES)) {
    for (const row of [...q.topDay.all(game, day, limit), ...q.topAll.all(game, limit)]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push({ ...JSON.parse(row.details), id: row.id, game: row.game, name: row.name, score: row.score, day: row.day, at: row.at });
    }
  }
  if (listCache.size > 50) listCache.clear();
  listCache.set(key, out);
  return out;
}

// Returns a row ready to insert, or null if the score isn't acceptable.
function cleanScore(e, now) {
  if (!e || typeof e !== 'object') return null;
  const id = typeof e.id === 'string' && /^[\w-]{1,40}$/.test(e.id) ? e.id : null;
  const game = Object.hasOwn(GAMES, e.game) ? e.game : null;
  const name = typeof e.name === 'string'
    ? e.name.normalize('NFC').replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';
  const score = Math.round(Number(e.score));
  const day = typeof e.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.day) ? e.day : null;
  if (!id || !game || !name || !day || !Number.isFinite(score) || score < 0 || score > GAMES[game].maxScore) return null;
  if (isBlocked(name)) return null;
  // `day` is the player's local date; refuse dates that haven't started anywhere yet
  const dayStart = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(dayStart) || dayStart > now + DAY_MS) return null;
  const at = Number.isFinite(e.at) && e.at > 0 && e.at <= now + DAY_MS ? Math.round(e.at) : now;
  const details = {};
  for (const [k, v] of Object.entries(e)) {
    if (CORE.has(k) || !/^\w{1,20}$/.test(k) || Object.keys(details).length >= DETAILS_MAX) continue;
    if (typeof v === 'number' && Number.isFinite(v)) details[k] = v;
    else if (typeof v === 'string') details[k] = v.slice(0, 40);
    else if (typeof v === 'boolean') details[k] = v;
  }
  return [id, game, name, score, day, at, JSON.stringify(details)];
}

function saveScores(list) {
  const now = Date.now();
  const accepted = [];
  const rejected = [];
  db.exec('BEGIN');
  try {
    for (const e of list) {
      const row = cleanScore(e, now);
      if (row) { q.insert.run(...row); accepted.push(row[0]); }
      else if (e && typeof e.id === 'string') rejected.push(e.id.slice(0, 40));
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  if (accepted.length) listCache.clear();
  return { accepted, rejected };
}

// ---------------------------------------------------------------- http helpers
function corsHeaders(req) {
  const origin = req.headers.origin;
  const allow = ALLOWED_ORIGINS.includes('*') ? '*' : (origin && ALLOWED_ORIGINS.includes(origin) ? origin : null);
  if (!allow) return {};
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function sendJson(req, res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(req) });
  res.end(JSON.stringify(body));
}

const httpError = (status, message) => Object.assign(new Error(message), { status });

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size <= MAX_BODY) chunks.push(c); });
    req.on('end', () => {
      if (size > MAX_BODY) return reject(httpError(413, 'request too large'));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(httpError(400, 'invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function clientIp(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

const uploads = new Map(); // client address → { start, count } for the current minute
function rateLimited(ip) {
  const t = Date.now();
  let u = uploads.get(ip);
  if (!u || t - u.start > 60000) { u = { start: t, count: 0 }; uploads.set(ip, u); }
  return ++u.count > POSTS_PER_MINUTE;
}
setInterval(() => {
  const t = Date.now();
  for (const [ip, u] of uploads) if (t - u.start > 60000) uploads.delete(ip);
}, 60000).unref();

function isAdmin(req) {
  if (!ADMIN_TOKEN) return false;
  const given = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(ADMIN_TOKEN);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- API
async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    return res.end();
  }
  if (url.pathname === '/api/health' && req.method === 'GET') return sendJson(req, res, 200, { ok: true });
  if (url.pathname !== '/api/scores') return sendJson(req, res, 404, { error: 'not found' });

  if (req.method === 'GET') {
    const dayParam = url.searchParams.get('day');
    const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : localToday();
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 10));
    return sendJson(req, res, 200, { now: Date.now(), scores: topScores(day, limit) });
  }

  if (req.method === 'POST') {
    if (rateLimited(clientIp(req))) return sendJson(req, res, 429, { error: 'too many uploads, slow down' });
    const body = await readJson(req);
    const list = body && body.scores;
    if (!Array.isArray(list) || list.length > MAX_PER_POST) {
      return sendJson(req, res, 400, { error: `send { scores: [...] } with at most ${MAX_PER_POST} scores` });
    }
    return sendJson(req, res, 200, saveScores(list));
  }

  if (req.method === 'DELETE') {
    if (!isAdmin(req)) return sendJson(req, res, ADMIN_TOKEN ? 401 : 403, { error: ADMIN_TOKEN ? 'wrong admin token' : 'set ADMIN_TOKEN to enable this' });
    const game = url.searchParams.get('game');
    if (game && !Object.hasOwn(GAMES, game)) return sendJson(req, res, 400, { error: 'unknown game' });
    const result = game ? q.clearGame.run(game) : q.clearAll.run();
    listCache.clear();
    return sendJson(req, res, 200, { deleted: Number(result.changes) });
  }

  return sendJson(req, res, 405, { error: 'method not allowed' });
}

// ---------------------------------------------------------------- the games themselves
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res, pathname) {
  const notFound = () => { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); };
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return notFound(); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(ROOT, path.normalize(rel));
  const inside = path.relative(ROOT, file);
  const parts = inside.split(path.sep);
  // only game files: nothing outside the project, nothing hidden, never this server folder (it holds the database)
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside) || parts[0] === 'server' || parts.some((p) => p.startsWith('.'))) return notFound();
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) { res.writeHead(301, { Location: `${pathname}/` }); return res.end(); }
    const type = TYPES[path.extname(file).toLowerCase()];
    if (err || !st.isFile() || !type) return notFound();
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

// ---------------------------------------------------------------- server
const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); return res.end(); }
  try {
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (SERVE_STATIC && (req.method === 'GET' || req.method === 'HEAD')) return serveStatic(req, res, url.pathname);
    sendJson(req, res, 404, { error: 'not found' });
  } catch (err) {
    if (err.status) return sendJson(req, res, err.status, { error: err.message });
    console.error(err);
    sendJson(req, res, 500, { error: 'server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Ecosystem Arcade server on http://localhost:${PORT}`);
  console.log(`  scores database: ${DB_PATH}`);
  if (!SERVE_STATIC) console.log('  API only (SERVE_STATIC=0)');
  if (BLOCKED.length) console.log(`  name filter: ${BLOCKED.length} blocked words`);
});

function shutdown() {
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
