// The scores API contract, checked against the local server (server/server.js + SQLite),
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

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const core = require('../server/scores-core.js');
const ADMIN = 'test-admin-token-123456';
const today = new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- the checks both must pass
function apiContract(name, start) {
  describe(name, () => {
    let base, stop;
    before(async () => ({ base, stop } = await start()));
    after(() => stop());

    const post = (scores, headers = {}) => fetch(`${base}/api/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ scores }) });
    const S = (id, x = {}) => ({ id, game: 'route-rush', name: 'Ana', score: 100, day: today, at: Date.now(), ...x });
    const list = async () => (await fetch(`${base}/api/scores?day=${today}&limit=10`)).json();

    test('health answers', async () => {
      const r = await fetch(`${base}/api/health`);
      assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), { ok: true });
    });

    test('valid scores are accepted, and sending one again is harmless', async () => {
      let j = await (await post([S('a1', { accuracy: 90 }), S('a2', { name: 'Bo', score: 300 }), S('a3', { name: 'Cy', score: 200, game: 'case-files', rank: 'Detective' })])).json();
      assert.deepEqual(j.accepted.sort(), ['a1', 'a2', 'a3']);
      assert.deepEqual(j.rejected, []);
      j = await (await post([S('a1')])).json();
      assert.deepEqual(j.accepted, ['a1']);
    });

    test('invalid scores are rejected', async () => {
      const j = await (await post([
        S('bad1', { game: 'pacman' }), S('bad2', { name: '   ' }), S('bad3', { score: 99999999 }), S('bad4', { score: -5 }),
        S('bad5', { day: '2099-01-01' }), S('bad 6'), S('bad7', { score: 'lots' }),
      ])).json();
      assert.deepEqual(j.accepted, []);
      assert.equal(j.rejected.length, 7);
    });

    test('lists are sorted, keep per-game details, trim names, include server time', async () => {
      await post([S('long', { name: 'A'.repeat(50) + '\u0007', score: 50 })]);
      const j = await list();
      assert.equal(typeof j.now, 'number');
      const rr = j.scores.filter((e) => e.game === 'route-rush');
      assert.equal(rr[0].name, 'Bo');
      assert.ok(rr.every((e, i) => i === 0 || rr[i - 1].score >= e.score));
      assert.equal(j.scores.find((e) => e.id === 'a3').rank, 'Detective');
      assert.equal(j.scores.find((e) => e.id === 'a1').accuracy, 90);
      assert.equal(j.scores.find((e) => e.id === 'long').name, 'A'.repeat(20));
    });

    test('bad requests are refused', async () => {
      let r = await fetch(`${base}/api/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nope' });
      assert.equal(r.status, 400);
      r = await post(Array(51).fill(S('x')));
      assert.equal(r.status, 400);
      r = await fetch(`${base}/api/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(70000) });
      assert.equal(r.status, 413);
    });

    test('wiping needs the admin token and only touches the chosen game', async () => {
      assert.equal((await fetch(`${base}/api/scores?game=route-rush`, { method: 'DELETE' })).status, 401);
      assert.equal((await fetch(`${base}/api/scores?game=route-rush`, { method: 'DELETE', headers: { Authorization: 'Bearer wrong' } })).status, 401);
      const r = await fetch(`${base}/api/scores?game=route-rush`, { method: 'DELETE', headers: { Authorization: `Bearer ${ADMIN}` } });
      assert.equal(r.status, 200);
      assert.equal((await r.json()).deleted, 3);
      const j = await list();
      assert.deepEqual(j.scores.map((e) => e.game), ['case-files']);
    });

    test('CORS preflight works for kiosks opening local files', async () => {
      const r = await fetch(`${base}/api/scores`, { method: 'OPTIONS', headers: { Origin: 'null', 'Access-Control-Request-Method': 'POST' } });
      assert.equal(r.status, 204);
      assert.equal(r.headers.get('access-control-allow-origin'), '*');
    });

    test('uploads are rate limited (60 a minute per address)', async () => {
      let limited = false;
      for (let i = 0; i < 70 && !limited; i++) if ((await post([])).status === 429) limited = true;
      assert.ok(limited);
    });
  });
}

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

