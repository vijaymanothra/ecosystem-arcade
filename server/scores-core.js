// ============================================================
//  SCORE RULES — shared by every host (the local server, the Azure Functions API), so all of
//  them accept, clean and return scores the same way.
// ============================================================
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// The highest score each game can actually produce (worked out from its own settings), with a
// small margin. Anything above is impossible, so it's refused. test/api.test.mjs recomputes the
// real maximum from each game's settings, so editing a game can't silently make these too low.
//   master-the-map  13,200  (10 questions ≤200 × combo ≤4, 6 journey steps ≤300 × 4, +1,000 mastery)
//   route-rush      ~200,000 only if every request scored ≤800 × double points × rush event
//   health-journey  a few thousand realistically (challenges ≤300, events, finish + stamp bonuses)
//   evernorth-city  34,500  (10 builds ≤3,000 + 3 news rewards of 1,500)
//   case-files      3,300   (2 cases, clues ≤300 each, +300 per perfect case)
const GAMES = {
  'master-the-map': { maxScore: 15000 },
  'route-rush': { maxScore: 200000 },
  'health-journey': { maxScore: 20000 },
  'evernorth-city': { maxScore: 40000 },
  'case-files': { maxScore: 5000 },
};
const NAME_MAX = 20;
const DETAIL_TEXT_MAX = 20;     // per-game extras shown next to names (rank, token …)
const MAX_BODY = 64 * 1024;     // bytes per request
const MAX_PER_POST = 25;        // scores per upload (the games send at most 25 at a time)
const ADMIN_FAILS_PER_MINUTE = 10; // wrong admin-token attempts per address before a pause
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

// Name filter: one word or phrase per line in blocked-words.txt (lines starting with # are notes).
// Words of 5+ letters are caught anywhere in a name, even split up ("b a d w o r d").
// Shorter words only match a whole word of the name, so real names that merely contain
// them (Cassandra, Dickens …) aren't refused.
function loadNameFilter(dir) {
  let words = [];
  try {
    words = fs.readFileSync(path.join(dir, 'blocked-words.txt'), 'utf8').split(/\r?\n/)
      .map((w) => w.trim().toLowerCase()).filter((w) => w && !w.startsWith('#'));
  } catch { /* no list */ }
  const flatten = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const long = words.map(flatten).filter((w) => w.length >= 5);
  const short = new Set(words.map(flatten).filter((w) => w.length > 0 && w.length < 5));
  const isBlocked = (text) => {
    const flat = flatten(text);
    if (long.some((w) => flat.includes(w))) return true;
    return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).some((t) => short.has(t)) || short.has(flat);
  };
  return { words, isBlocked };
}

// Names: letters (any language), spaces, hyphens and apostrophes only — what the on-screen keyboard
// can type, plus real names like "Anne-Marie" or "O'Neil". No digits, emojis or symbols.
const NAME_RE = /^[\p{L}\p{M}](?:[\p{L}\p{M}' -]*[\p{L}\p{M}])?$/u;

// Returns a clean score ready to store, or null if it isn't acceptable.
function cleanScore(e, now, isBlocked) {
  if (!e || typeof e !== 'object') return null;
  const id = typeof e.id === 'string' && /^[\w-]{1,40}$/.test(e.id) ? e.id : null;
  const game = Object.hasOwn(GAMES, e.game) ? e.game : null;
  const name = typeof e.name === 'string'
    ? e.name.normalize('NFC').replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim() : '';
  const score = Math.round(Number(e.score));
  const day = typeof e.day === 'string' && DAY_RE.test(e.day) ? e.day : null;
  if (!id || !game || !name || !day || !Number.isFinite(score) || score < 0 || score > GAMES[game].maxScore) return null;
  if (!NAME_RE.test(name)) return null;
  if (isBlocked && isBlocked(name)) return null;
  // `day` is the player's local date; refuse dates that haven't started anywhere yet
  const dayStart = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(dayStart) || dayStart > now + DAY_MS) return null;
  const at = Number.isFinite(e.at) && e.at > 0 && e.at <= now + DAY_MS ? Math.round(e.at) : now;
  // per-game extras (accuracy, rank, token …) are shown next to names, so text gets the same filter
  const details = {};
  for (const [k, v] of Object.entries(e)) {
    if (CORE.has(k) || !/^\w{1,20}$/.test(k) || Object.keys(details).length >= DETAILS_MAX) continue;
    if (typeof v === 'number' && Number.isFinite(v)) details[k] = v;
    else if (typeof v === 'boolean') details[k] = v;
    else if (typeof v === 'string') {
      const text = v.normalize('NFC').replace(/\p{C}/gu, '').trim().slice(0, DETAIL_TEXT_MAX);
      if (isBlocked && isBlocked(text)) return null;
      details[k] = text;
    }
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

// Counts events per client address per minute; old entries are swept as it goes.
// limited(key) counts one and says whether the address is over the limit;
// limited.over(key) only checks, without counting.
function createRateLimiter(perMinute = POSTS_PER_MINUTE) {
  const seen = new Map();
  let swept = Date.now();
  const current = (key, t) => {
    if (t - swept > 60000) {
      for (const [k, u] of seen) if (t - u.start > 60000) seen.delete(k);
      swept = t;
    }
    let u = seen.get(key);
    if (!u || t - u.start > 60000) { u = { start: t, count: 0 }; seen.set(key, u); }
    return u;
  };
  const limited = (key) => ++current(key, Date.now()).count > perMinute;
  limited.over = (key) => current(key, Date.now()).count >= perMinute;
  return limited;
}

// Which browser pages may send scores. Requests without an Origin header (not from a browser
// page) are allowed and rate-limited like everyone else; pages on other sites are refused,
// so a stranger's website can't make its visitors' browsers post scores.
function originAllowed(origin, allowedOrigins) {
  return !origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin);
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
  GAMES, NAME_MAX, MAX_BODY, MAX_PER_POST, MAX_LIMIT, POSTS_PER_MINUTE, ADMIN_FAILS_PER_MINUTE, CONTENT_TYPES,
  loadNameFilter, cleanScore, toPublic, byRank, localToday, parseDay, parseLimit,
  createRateLimiter, originAllowed, tokenMatches, corsHeaders, parseOrigins,
};
