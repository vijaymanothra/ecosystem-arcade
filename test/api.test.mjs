// The scores API contract (test/contract.mjs) against the local server (server/server.js + SQLite),
// plus the shared score rules (server/scores-core.js) on their own.
// Run: npm test
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiContract, ADMIN, today } from './contract.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const core = require('../server/scores-core.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- 1. local server
apiContract('local server (SQLite)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'arcade-test-'));
  const port = 3200 + Math.floor(Math.random() * 500);
  const proc = spawn(process.execPath, [join(ROOT, 'server', 'server.js')], {
    env: { ...process.env, PORT: String(port), DB_PATH: join(dir, 'test.db'), ADMIN_TOKEN: ADMIN }, stdio: 'ignore',
  });
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 50; i++) { try { await fetch(`${base}/api/health`); break; } catch { await sleep(100); } }
  return { base, stop: async () => { proc.kill(); await sleep(200); rmSync(dir, { recursive: true, force: true }); } };
});

describe('local server: website', () => {
  let base, proc, dir;
  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'arcade-test-'));
    const port = 3800 + Math.floor(Math.random() * 100);
    proc = spawn(process.execPath, [join(ROOT, 'server', 'server.js')], { env: { ...process.env, PORT: String(port), DB_PATH: join(dir, 't.db') }, stdio: 'ignore' });
    base = `http://localhost:${port}`;
    for (let i = 0; i < 50; i++) { try { await fetch(`${base}/api/health`); break; } catch { await sleep(100); } }
  });
  after(async () => { proc.kill(); await sleep(200); rmSync(dir, { recursive: true, force: true }); });

  test('serves the arcade', async () => {
    const r = await fetch(`${base}/`);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /Ecosystem Arcade/);
    assert.ok((await fetch(`${base}/route-rush`)).url.endsWith('/route-rush/'));
  });

  test('never serves the server, the database, hidden or outside files', async () => {
    for (const p of ['/server/server.js', '/server/scores-core.js', '/server/data/scores.db', '/test/api.test.mjs', '/.git/config', '/package.json',
      '/README.md', '/start-kiosk.bat', '/%2e%2e/%2e%2e/Windows/win.ini', '/..%5c..%5cWindows%5cwin.ini']) {
      assert.equal((await fetch(base + p)).status, 404, p);
    }
  });
});

// ---------------------------------------------------------------- 2. the shared score rules
describe('score rules (scores-core.js)', () => {
  const now = Date.now();
  const ok = { id: 'x1', game: 'route-rush', name: '  Ana  ', score: 99.6, day: today, at: now, accuracy: 90 };

  test('a valid score is cleaned: name trimmed, score rounded, extras kept as details', () => {
    const s = core.cleanScore(ok, now);
    assert.equal(s.name, 'Ana');
    assert.equal(s.score, 100);
    assert.deepEqual(s.details, { accuracy: 90 });
  });

  test('every game id is known and has a maximum score', () => {
    for (const id of ['master-the-map', 'route-rush', 'health-journey', 'evernorth-city', 'case-files']) {
      assert.ok(core.GAMES[id] && core.GAMES[id].maxScore > 0, id);
    }
  });

  test('bad scores are refused', () => {
    for (const bad of [{ game: 'pacman' }, { name: '' }, { score: -1 }, { score: 1e12 }, { day: 'tomorrow' }, { id: 'has space' }, { id: 'x'.repeat(41) }]) {
      assert.equal(core.cleanScore({ ...ok, ...bad }, now), null, JSON.stringify(bad));
    }
  });

  test('details are limited: no nested objects, long strings cut, at most 8 extra fields', () => {
    const extra = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`f${i}`, i]));
    const s = core.cleanScore({ ...ok, nested: { a: 1 }, long: 'y'.repeat(100), ...extra }, now);
    assert.equal(s.details.nested, undefined);
    assert.ok(Object.keys(s.details).length <= 8);
  });

  test('the name filter catches blocked words even with spaces or symbols', () => {
    const blocked = (name) => /bad/.test(name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''));
    assert.equal(core.cleanScore({ ...ok, name: 'b.a d' }, now, blocked), null);
    assert.ok(core.cleanScore({ ...ok, name: 'Ana' }, now, blocked));
  });

  test('ranking: highest score first, and the earlier player wins a tie', () => {
    const list = [{ score: 5, at: 2 }, { score: 9, at: 5 }, { score: 9, at: 1 }].sort(core.byRank);
    assert.deepEqual(list.map((e) => [e.score, e.at]), [[9, 1], [9, 5], [5, 2]]);
  });

  test('list size and day are kept within limits', () => {
    assert.equal(core.parseLimit('5'), 5);
    assert.equal(core.parseLimit('100000'), core.MAX_LIMIT);
    assert.equal(core.parseLimit('nope'), 10);
    assert.equal(core.parseDay('2026-10-27'), '2026-10-27');
    assert.match(core.parseDay('not a day'), /^\d{4}-\d{2}-\d{2}$/);
  });

  test('names: letters (any language), spaces, hyphens and apostrophes only', () => {
    for (const name of ['Ana', 'Anne-Marie', "O'Neil", 'Ana Lucía', 'राहुल', 'Zoë']) {
      assert.ok(core.cleanScore({ ...ok, name }, now), name);
    }
    for (const name of ['Ana123', 'Ana😀', '<script>', 'a.b', '-Ana', 'Ana-', "'", 'x@y', '1337']) {
      assert.equal(core.cleanScore({ ...ok, name }, now), null, name);
    }
  });

  test('blocked words: refused even split up, but real names that contain short ones are fine', () => {
    const { isBlocked, words } = core.loadNameFilter(join(ROOT, 'server'));
    assert.ok(words.length > 40, 'the starter list is loaded');
    for (const name of ['Kshitij', 'Cassandra', 'Analia', 'Sexton', 'Dickens', 'Ana', 'Grape', 'Shitanshu']) {
      assert.ok(core.cleanScore({ ...ok, name }, now, isBlocked), `${name} should be allowed`);
    }
    for (const name of ['Fuck', 'Shit Head', 'Big Bitch', 'B i t c h', 'Chutiya', 'Mr Nazi']) {
      assert.equal(core.cleanScore({ ...ok, name }, now, isBlocked), null, `${name} should be refused`);
    }
  });

  test('per-game extras shown next to names (rank, token) get the same filter and a length cap', () => {
    const { isBlocked } = core.loadNameFilter(join(ROOT, 'server'));
    assert.equal(core.cleanScore({ ...ok, rank: 'Shit' }, now, isBlocked), null);
    assert.equal(core.cleanScore({ ...ok, rank: 'Chief Detective' }, now, isBlocked).details.rank, 'Chief Detective');
    assert.equal(core.cleanScore({ ...ok, token: '🦊'.repeat(30) }, now, isBlocked).details.token.length <= 20, true);
  });

  test('score limits are at or above what each game can really produce (recomputed from game settings)', () => {
    const vm = require('node:vm');
    const fs = require('node:fs');
    const load = (...files) => { const ctx = { window: {} }; vm.createContext(ctx); for (const f of files) vm.runInContext(fs.readFileSync(join(ROOT, f), 'utf8'), ctx); return ctx.window; };
    // Master the Map: one question per business (base 100 + speed ≤100) and journey steps (150 + ≤150),
    // combo multiplier min(4, 1 + floor(streak / 3)), plus the mastery bonus  (values from master-the-map/game.js)
    const mtm = load('master-the-map/questions.js');
    const steps = mtm.QUIZ_BUSINESSES.length + mtm.QUIZ_JOURNEY.steps.length;
    let mtmMax = mtm.QUIZ_CONFIG.masteryBonus;
    for (let streak = 1; streak <= steps; streak++) mtmMax += (streak <= mtm.QUIZ_BUSINESSES.length ? 200 : 300) * Math.min(4, 1 + Math.floor(streak / 3));
    assert.ok(core.GAMES['master-the-map'].maxScore >= mtmMax, `Master the Map can reach ${mtmMax}`);
    // Evernorth City: every day builds the top level with the full speed bonus, every news event is a reward
    const ec = load('evernorth-city/content.js').EC_CONFIG || load('evernorth-city/content.js').CITY_CONFIG;
    if (ec) {
      const ecMax = ec.turns * (Math.max(...ec.levelPop) + ec.speedBonusMax) + Math.floor(ec.turns / ec.newsEvery) * ec.newsReward;
      assert.ok(core.GAMES['evernorth-city'].maxScore >= ecMax, `Evernorth City can reach ${ecMax}`);
    }
    // Case Files: the longest cases, every clue first try and fast, every case perfect
    const cf = load('case-files/questions.js', 'case-files/content.js');
    const cfg = cf.CF_CONFIG;
    const longest = cf.CF_CASES.map((c) => c.steps.length).sort((a, b) => b - a).slice(0, cfg.casesPerGame);
    const cfMax = longest.reduce((sum, n) => sum + n * (cfg.stepPoints[0] + cfg.speedBonus[0][1]) + cfg.perfectCaseBonus, 0);
    assert.ok(core.GAMES['case-files'].maxScore >= cfMax, `Case Files can reach ${cfMax}`);
  });

  test('pages on other websites may not send or wipe scores; JSON only; 25 scores per upload', async () => {
    const { createApi } = require('../server/scores-api.js');
    const store = { put: async () => true, top: async () => [], clear: async () => 0 };
    const api = createApi({ store, adminToken: 'secret-token-1234567', allowedOrigins: ['https://arcade.example'], log: { error() {} } });
    const post = (headers, n = 1) => api({ method: 'POST', path: '/api/scores', query: {}, ip: '9.9.9.9',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ scores: Array.from({ length: n }, (_, i) => ({ ...ok, id: `o${i}` })) }) });
    assert.equal((await post({ origin: 'https://evil.example' })).status, 403);
    assert.equal((await post({ origin: 'https://arcade.example' })).status, 200);
    assert.equal((await post({})).status, 200, 'no Origin header (not a web page): allowed, rate-limited');
    assert.equal((await post({ 'content-type': 'text/plain' })).status, 415);
    assert.equal((await post({}, 25)).status, 200);
    assert.equal((await post({}, 26)).status, 400);
    const del = await api({ method: 'DELETE', path: '/api/scores', query: {}, ip: '9.9.9.9', headers: { origin: 'https://evil.example', 'x-admin-token': 'secret-token-1234567' } });
    assert.equal(del.status, 403);
  });

  test('wrong admin tokens: after 10 in a minute that address is paused; others are not', async () => {
    const { createApi } = require('../server/scores-api.js');
    const store = { put: async () => true, top: async () => [], clear: async () => 0 };
    const api = createApi({ store, adminToken: 'secret-token-1234567', log: { error() {} } });
    const del = (token, ip) => api({ method: 'DELETE', path: '/api/scores', query: {}, ip, headers: { 'x-admin-token': token } });
    for (let i = 0; i < 10; i++) assert.equal((await del('guess', '6.6.6.6')).status, 401);
    assert.equal((await del('guess', '6.6.6.6')).status, 429);
    assert.equal((await del('secret-token-1234567', '6.6.6.6')).status, 429, 'paused even with the right token');
    assert.equal((await del('secret-token-1234567', '7.7.7.7')).status, 200, 'other addresses unaffected');
  });

  test('admin token: X-Admin-Token or Authorization: Bearer, must match exactly', async () => {
    const { createApi } = require('../server/scores-api.js');
    const store = { put: async () => true, top: async () => [], clear: async () => 0 };
    const api = createApi({ store, adminToken: 'secret-token-1234567', log: { error() {} } });
    const del = (headers) => api({ method: 'DELETE', path: '/api/scores', query: {}, headers });
    assert.equal((await del({ 'x-admin-token': 'secret-token-1234567' })).status, 200);
    assert.equal((await del({ authorization: 'Bearer secret-token-1234567' })).status, 200);
    assert.equal((await del({ 'x-admin-token': 'nope' })).status, 401);
    assert.equal((await del({})).status, 401);
  });

  test('admin token must match exactly', () => {
    assert.equal(core.tokenMatches('Bearer secret-token', 'secret-token'), true);
    assert.equal(core.tokenMatches('Bearer secret-tokeN', 'secret-token'), false);
    assert.equal(core.tokenMatches('Bearer anything', ''), false);
  });

  test('rate limiter allows 60 uploads a minute per address, separately per address', () => {
    const limited = core.createRateLimiter(60);
    for (let i = 0; i < 60; i++) assert.equal(limited('1.1.1.1'), false);
    assert.equal(limited('1.1.1.1'), true);
    assert.equal(limited('2.2.2.2'), false);
  });
});
