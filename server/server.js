// ============================================================
//  ECOSYSTEM ARCADE — scores API + web server for the games.
//  One process, no dependencies: Node's built-in http and SQLite (Node 22.13 or newer).
//  The endpoints come from scores-api.js and the score rules from scores-core.js, both shared
//  with the Azure version (azure/api), so every host answers alike.
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
const core = require('./scores-core');
const { createApi } = require('./scores-api');

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
const ALLOWED_ORIGINS = core.parseOrigins(process.env.ALLOWED_ORIGIN);
const SERVE_STATIC = process.env.SERVE_STATIC !== '0';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const nameFilter = core.loadNameFilter(__dirname);

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
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);
const q = {
  topDay: db.prepare('SELECT * FROM scores WHERE game = ? AND day = ? ORDER BY score DESC, at LIMIT ?'),
  topAll: db.prepare('SELECT * FROM scores WHERE game = ? ORDER BY score DESC, at LIMIT ?'),
  listGame: db.prepare('SELECT * FROM scores WHERE game = ? ORDER BY score DESC, at'),
  insert: db.prepare('INSERT OR IGNORE INTO scores (id, game, name, score, day, at, details) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  removeOne: db.prepare('DELETE FROM scores WHERE game = ? AND id = ?'),
  clearGame: db.prepare('DELETE FROM scores WHERE game = ?'),
  getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
  setSetting: db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
};
const fromRow = (row) => ({ ...row, details: JSON.parse(row.details) });

// SQLite as the store for the shared API (server/scores-api.js)
const sqliteStore = {
  async put(s) {
    return Number(q.insert.run(s.id, s.game, s.name, s.score, s.day, s.at, JSON.stringify(s.details)).changes) > 0;
  },
  async top(game, day, limit) {
    return (day ? q.topDay.all(game, day, limit) : q.topAll.all(game, limit)).map(fromRow);
  },
  async list(game) {
    return q.listGame.all(game).map(fromRow);
  },
  async remove(game, id) {
    return Number(q.removeOne.run(game, id).changes);
  },
  async clear(game) {
    return Number(q.clearGame.run(game).changes);
  },
  async getSettings() {
    const row = q.getSetting.get('admin');
    return row ? JSON.parse(row.value) : {};
  },
  async setSettings(settings) {
    q.setSetting.run('admin', JSON.stringify(settings));
  },
};

const api = createApi({
  store: sqliteStore,
  adminToken: ADMIN_TOKEN,
  allowedOrigins: ALLOWED_ORIGINS,
  isBlocked: nameFilter.isBlocked,
});

// ---------------------------------------------------------------- API over HTTP
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size <= core.MAX_BODY) chunks.push(c); });
    req.on('end', () => resolve(size > core.MAX_BODY ? null : Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function clientIp(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

async function handleApi(req, res, url) {
  const body = req.method === 'POST' || req.method === 'PUT' ? await readBody(req) : '';
  const out = body === null
    ? { status: 413, headers: { 'Content-Type': 'application/json; charset=utf-8', ...core.corsHeaders(req.headers.origin, ALLOWED_ORIGINS) }, body: JSON.stringify({ error: 'request too large' }) }
    : await api({
      method: req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: req.headers,
      body,
      ip: clientIp(req),
    });
  res.writeHead(out.status, out.headers);
  res.end(out.body);
}

// ---------------------------------------------------------------- the games themselves
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
    const type = core.CONTENT_TYPES[path.extname(file).toLowerCase()];
    if (err || !st.isFile() || !type) return notFound();
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
      return res.end();
    }
    // The game files are small: read the whole file first, so a failed read (e.g. a virus scanner briefly
    // holding it) is retried once and otherwise answered with an error, never a response that hangs forever.
    const send = (attempt) => fs.readFile(file, (readErr, data) => {
      if (readErr && attempt === 0) return setTimeout(() => send(1), 150);
      if (readErr) { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '1' }); return res.end('Busy, try again'); }
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length, 'Cache-Control': 'no-cache' });
      res.end(data);
    });
    send(0);
  });
}

// ---------------------------------------------------------------- server
function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); return res.end(); }
  try {
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (SERVE_STATIC && (req.method === 'GET' || req.method === 'HEAD')) return serveStatic(req, res, url.pathname);
    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Ecosystem Arcade server on http://localhost:${PORT}`);
  console.log(`  scores database: ${DB_PATH}`);
  if (!SERVE_STATIC) console.log('  API only (SERVE_STATIC=0)');
  if (nameFilter.words.length) console.log(`  name filter: ${nameFilter.words.length} blocked words`);
});

function shutdown() {
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
