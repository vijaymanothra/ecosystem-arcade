// The scores API contract: the checks every host must pass (local server, Azure Functions).
// start() returns { base, stop } for a running API that uses ADMIN as its admin token.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { POSTS_PER_MINUTE } = createRequire(import.meta.url)('../server/scores-core.js');

export const ADMIN = 'test-admin-token-123456';
export const today = new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function apiContract(name, start) {
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
      assert.equal((await fetch(`${base}/api/scores?game=route-rush`, { method: 'DELETE', headers: { 'X-Admin-Token': 'wrong' } })).status, 401);
      assert.equal((await fetch(`${base}/api/scores?game=route-rush`, { method: 'DELETE', headers: { Authorization: 'Bearer wrong' } })).status, 401);
      const r = await fetch(`${base}/api/scores?game=route-rush`, { method: 'DELETE', headers: { 'X-Admin-Token': ADMIN } });
      assert.equal(r.status, 200);
      assert.equal((await r.json()).deleted, 3);
      const j = await list();
      assert.deepEqual(j.scores.map((e) => e.game), ['case-files']);
    });

    // ---------------------------------------------------------------- admin (scores only)
    const admin = (method, path, body) => fetch(`${base}/api${path}`, {
      method, headers: { 'X-Admin-Token': ADMIN, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
    });

    test('admin: every admin action needs the password', async () => {
      // no password at all (a wrong one is covered by the wipe test above and the lockout unit test)
      for (const [m, p] of [['GET', '/admin/scores'], ['GET', '/admin/scores?game=case-files'], ['DELETE', '/admin/scores?game=case-files&id=a3'], ['GET', '/admin/settings'], ['PUT', '/admin/settings'], ['DELETE', '/scores']]) {
        const r = await fetch(`${base}/api${p}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: m === 'PUT' ? '{"hiddenGames":["case-files"]}' : undefined });
        assert.equal(r.status, 401, `${m} ${p}`);
      }
    });

    test('admin: list every score of a game, and remove just one entry', async () => {
      await post([S('k1', { game: 'case-files', name: 'Keep', score: 300 }), S('k2', { game: 'case-files', name: 'Spam', score: 400 })]);
      let j = await (await admin('GET', '/admin/scores?game=case-files')).json();
      assert.deepEqual(j.scores.map((s) => s.name), ['Spam', 'Keep', 'Cy']);
      j = await (await admin('GET', '/admin/scores')).json();
      assert.equal(j.games['case-files'], 3);
      const r = await admin('DELETE', '/admin/scores?game=case-files&id=k2');
      assert.equal((await r.json()).deleted, 1);
      assert.equal((await (await admin('DELETE', '/admin/scores?game=case-files&id=k2')).json()).deleted, 0, 'already gone');
      j = await (await admin('GET', '/admin/scores?game=case-files')).json();
      assert.deepEqual(j.scores.map((s) => s.name), ['Keep', 'Cy']);
    });

    test('admin: hiding a leaderboard keeps its scores but shows no names to players', async () => {
      let r = await admin('PUT', '/admin/settings', { hiddenGames: ['case-files', 'not-a-game'] });
      assert.deepEqual((await r.json()).hiddenGames, ['case-files']);
      await sleep(3100); // lists are cached for 3 s
      let j = await list();
      assert.deepEqual(j.hidden, ['case-files']);
      assert.ok(!j.scores.some((s) => s.game === 'case-files'), 'no names of a hidden game leave the API');
      const saved = await (await post([S('h1', { game: 'case-files', name: 'Hidden', score: 10 })])).json();
      assert.deepEqual(saved.accepted, ['h1'], 'players can still save while it is hidden');
      assert.equal((await (await admin('GET', '/admin/scores?game=case-files')).json()).scores.length, 3, 'scores kept');
      r = await admin('PUT', '/admin/settings', { hiddenGames: [] });
      await sleep(3100);
      j = await list();
      assert.deepEqual(j.hidden, []);
      assert.ok(j.scores.some((s) => s.game === 'case-files'), 'shown again');
    });

    test('CORS preflight works for kiosks opening local files', async () => {
      const r = await fetch(`${base}/api/scores`, { method: 'OPTIONS', headers: { Origin: 'null', 'Access-Control-Request-Method': 'POST' } });
      assert.equal(r.status, 204);
      assert.equal(r.headers.get('access-control-allow-origin'), '*');
    });

    test(`uploads are rate limited (${POSTS_PER_MINUTE} a minute per address)`, async () => {
      let allowed = 0;
      let limited = false;
      for (let i = 0; i < POSTS_PER_MINUTE + 20 && !limited; i++) {
        if ((await post([])).status === 429) limited = true; else allowed++;
      }
      assert.ok(limited);
      assert.ok(allowed >= POSTS_PER_MINUTE - 10, `only ${allowed} allowed before limiting`); // earlier tests in this suite also posted
    });
  });
}
