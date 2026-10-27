// The scores API contract: the checks every host must pass (local server, Azure Functions).
// start() returns { base, stop } for a running API that uses ADMIN as its admin token.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';

export const ADMIN = 'test-admin-token-123456';
export const today = new Date().toISOString().slice(0, 10);

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
