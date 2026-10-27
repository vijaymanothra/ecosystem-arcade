// ============================================================
//  SCORE RULES — shared by the local server (server/server.js) and the AWS API
//  (aws/lambda/handler.js), so both accept, clean and return scores the same way.
// ============================================================
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

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
// Uploads per client address per minute. Offices usually share one public address, so this is
// sized for ~1,000 people on one network finishing games within a few minutes, while still
// stopping floods (each upload is also capped at MAX_PER_POST scores, all validated).
const POSTS_PER_MINUTE = 300;
const DETAILS_MAX = 8;          // extra per-game fields kept with a score (accuracy, rank, …)
const DAY_MS = 24 * 60 * 60 * 1000;
const CORE = new Set(['id', 'game', 'name', 'score', 'day', 'at']);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// File types served to browsers (local server and the AWS upload).
const CONTENT_TYPES = {
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

// Optional name filter: one word per line in blocked-words.txt.
function loadNameFilter(dir) {
  let words = [];
  try {
    words = fs.readFileSync(path.join(dir, 'blocked-words.txt'), 'utf8').split(/\r?\n/)
      .map((w) => w.trim().toLowerCase()).filter((w) => w && !w.startsWith('#'));
  } catch { /* no list */ }
  const isBlocked = (name) => {
    const flat = name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    return words.some((w) => flat.includes(w));
  };
  return { words, isBlocked };
}

// Returns a clean score ready to store, or null if it isn't acceptable.
function cleanScore(e, now, isBlocked) {
  if (!e || typeof e !== 'object') return null;
  const id = typeof e.id === 'string' && /^[\w-]{1,40}$/.test(e.id) ? e.id : null;
  const game = Object.hasOwn(GAMES, e.game) ? e.game : null;
  const name = typeof e.name === 'string'
    ? e.name.normalize('NFC').replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';
  const score = Math.round(Number(e.score));
  const day = typeof e.day === 'string' && DAY_RE.test(e.day) ? e.day : null;
  if (!id || !game || !name || !day || !Number.isFinite(score) || score < 0 || score > GAMES[game].maxScore) return null;
  if (isBlocked && isBlocked(name)) return null;
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
  return { id, game, name, score, day, at, details };
}

// The shape every client receives.
const toPublic = (s) => ({ ...s.details, id: s.id, game: s.game, name: s.name, score: s.score, day: s.day, at: s.at });

// Highest score first; on a tie, whoever got there first.
const byRank = (a, b) => (b.score - a.score) || (a.at - b.at);

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const parseDay = (v) => (v && DAY_RE.test(v) ? v : localToday());
const parseLimit = (v) => Math.min(MAX_LIMIT, Math.max(1, parseInt(v, 10) || 10));

// Uploads allowed per client address per minute; old entries are swept as it goes.
function createRateLimiter(perMinute = POSTS_PER_MINUTE) {
  const seen = new Map();
  let swept = Date.now();
  return (key) => {
    const t = Date.now();
    if (t - swept > 60000) {
      for (const [k, u] of seen) if (t - u.start > 60000) seen.delete(k);
      swept = t;
    }
    let u = seen.get(key);
    if (!u || t - u.start > 60000) { u = { start: t, count: 0 }; seen.set(key, u); }
    return ++u.count > perMinute;
  };
}

function tokenMatches(authorizationHeader, adminToken) {
  if (!adminToken) return false;
  const given = Buffer.from(String(authorizationHeader || '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(adminToken);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

function corsHeaders(origin, allowedOrigins) {
  const allow = allowedOrigins.includes('*') ? '*' : (origin && allowedOrigins.includes(origin) ? origin : null);
  if (!allow) return {};
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
const parseOrigins = (v) => String(v || '*').split(',').map((s) => s.trim()).filter(Boolean);

module.exports = {
  GAMES, NAME_MAX, MAX_BODY, MAX_PER_POST, MAX_LIMIT, POSTS_PER_MINUTE, CONTENT_TYPES,
  loadNameFilter, cleanScore, toPublic, byRank, localToday, parseDay, parseLimit,
  createRateLimiter, tokenMatches, corsHeaders, parseOrigins,
};
