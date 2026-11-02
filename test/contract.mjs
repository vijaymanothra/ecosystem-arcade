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
      assert.equal(rr[0].name, 'B*'); // "Bo", masked
      assert.ok(rr.every((e, i) => i === 0 || rr[i - 1].score >= e.score));
      assert.equal(j.scores.find((e) => e.id === 'a3').rank, 'Detective');
      assert.equal(j.scores.find((e) => e.id === 'a1').accuracy, 90);
      assert.equal(j.scores.find((e) => e.id === 'long').name, 'AA***A'); // trimmed to 20 letters, then masked
    });

    test('names: first name + last initial accepted; players only ever see them masked, with the passport tag', async () => {
      const j = await (await post([
        S('n1', { name: 'Priya S.', score: 120, tag: 'qw7' }), S('n2', { name: 'Priya S.', score: 110, tag: 'k4m' }), S('n3', { name: 'Mohammed K.', score: 105 }),
        S('n4', { name: 'Priya S.2' }), S('n5', { name: 'Priya SS.' }), S('n6', { name: 'Priya S. 2' }), S('n7', { name: '12' }),
        S('n8', { name: 'Ana B.', tag: 'QW7' }), S('n9', { name: 'Ana B.', tag: 'l1o' }),
      ])).json();
      assert.deepEqual(j.accepted.sort(), ['n1', 'n2', 'n3', 'n8', 'n9']);
      assert.deepEqual(j.rejected.sort(), ['n4', 'n5', 'n6', 'n7']);
      const shown = Object.fromEntries((await list()).scores.map((e) => [e.id, e]));
      assert.equal(shown.n1.name, 'Pr***a S.');
      assert.equal(shown.n1.tag, 'qw7', 'the tag goes out unmasked');
      assert.equal(shown.n2.tag, 'k4m', 'two people with the same name keep their own tags');
      assert.equal(shown.n3.name, 'Mo***d K.');
      assert.equal(shown.n3.tag, undefined, 'a score without a tag has none');
      assert.equal(shown.n8.tag, undefined, 'a malformed tag (capitals) is left off, the score kept');
      assert.equal(shown.n9.tag, undefined, 'a malformed tag (look-alike characters) is left off, the score kept');
      assert.ok(Object.values(shown).every((e) => e.name.includes('*') || e.name.length <= 1), 'no full name leaves the public list');
      const full = (await (await admin('GET', '/admin/scores?game=route-rush')).json()).scores;
      assert.ok(full.some((s) => s.name === 'Priya S.' && s.tag === 'qw7'), 'the admin page sees full names and tags');
      for (const id of ['n1', 'n2', 'n3', 'n8', 'n9']) await admin('DELETE', `/admin/scores?game=route-rush&id=${id}`); // leave the data as the later tests expect
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

    test('Ecosystem Experts: a score in every game today (same name + tag) — shared, masked, full on the admin page', async () => {
      const GAMES5 = ['master-the-map', 'route-rush', 'health-journey', 'evernorth-city', 'case-files'];
      const t0 = Date.now() - 60000;
      await post([
        // Zoe X. #zz2 plays all five (on any devices); her namesake #zz3 plays four; Yan Y. (no tag) plays all five
        ...GAMES5.map((g, i) => S(`ex-z${i}`, { game: g, name: 'Zoe X.', tag: 'zz2', score: 10, at: t0 + i * 1000 })),
        ...GAMES5.slice(0, 4).map((g, i) => S(`ex-w${i}`, { game: g, name: 'Zoe X.', tag: 'zz3', score: 10, at: t0 + i * 1000 })),
        ...GAMES5.map((g, i) => S(`ex-y${i}`, { game: g, name: 'Yan Y.', score: 10, at: t0 + 10000 + i })),
        S('ex-old', { game: 'route-rush', name: 'Zoe X.', tag: 'zz3', day: '2020-01-01', score: 10 }), // another day doesn't count
      ]);
      await sleep(3100);
      let j = await list();
      assert.deepEqual(j.experts.map((e) => `${e.name}#${e.tag || ''}`), ['Z*e X.#zz2', 'Y*n Y.#'], 'two experts, in the order they finished, masked');
      const before = j.players;
      assert.ok(Number.isFinite(before) && before >= 3, `players who played today counted (${before})`);
      await post([S('ex-p1', { game: 'route-rush', name: 'New P.', tag: 'np2', score: 5 }), S('ex-p2', { game: 'case-files', name: 'New P.', tag: 'np2', score: 5 })]);
      await sleep(3100);
      j = await list();
      assert.equal(j.players, before + 1, 'one more player, however many games they played');
      assert.equal((await (await admin('GET', `/admin/scores?day=${today}`)).json()).players, before + 1, 'the admin page has the same count');
      const adminView = await (await admin('GET', `/admin/scores?day=${today}`)).json();
      assert.deepEqual(adminView.experts.map((e) => `${e.name}#${e.tag || ''}`), ['Zoe X.#zz2', 'Yan Y.#'], 'the admin page sees full names');
      // hiding every leaderboard hides the experts too
      await admin('PUT', '/admin/settings', { hiddenGames: GAMES5 });
      await sleep(3100);
      assert.deepEqual((await list()).experts, [], 'no names while every board is hidden');
      await admin('PUT', '/admin/settings', { hiddenGames: [] });
      for (const [g, ids] of Object.entries({ 'master-the-map': ['ex-z0', 'ex-w0', 'ex-y0'], 'route-rush': ['ex-z1', 'ex-w1', 'ex-y1', 'ex-old', 'ex-p1'], 'health-journey': ['ex-z2', 'ex-w2', 'ex-y2'], 'evernorth-city': ['ex-z3', 'ex-w3', 'ex-y3'], 'case-files': ['ex-z4', 'ex-y4', 'ex-p2'] })) {
        for (const id of ids) await admin('DELETE', `/admin/scores?game=${g}&id=${id}`); // leave the data as the later tests expect
      }
    });

    test('admin: "show full names" unmasks every leaderboard until switched off; hidden boards stay hidden', async () => {
      await post([S('f1', { game: 'case-files', name: 'Priya S.', score: 900, tag: 'qw7' })]);
      let j = await list();
      assert.equal(j.fullNames, false, 'off by default');
      assert.equal(j.scores.find((s) => s.id === 'f1').name, 'Pr***a S.');
      // switching it on doesn't touch which boards are hidden, and the other way round
      await admin('PUT', '/admin/settings', { hiddenGames: ['route-rush'] });
      let r = await admin('PUT', '/admin/settings', { showFullNames: true });
      assert.deepEqual(await r.json(), { hiddenGames: ['route-rush'], showFullNames: true });
      r = await admin('PUT', '/admin/settings', { hiddenGames: [] });
      assert.deepEqual(await r.json(), { hiddenGames: [], showFullNames: true }, 'hiding/showing boards keeps full names on');
      await admin('PUT', '/admin/settings', { hiddenGames: ['route-rush'] });
      await sleep(3100);
      j = await list();
      assert.equal(j.fullNames, true);
      assert.equal(j.scores.find((s) => s.id === 'f1').name, 'Priya S.', 'full name while switched on');
      assert.equal(j.scores.find((s) => s.id === 'f1').tag, 'qw7');
      assert.ok(!j.scores.some((s) => s.game === 'route-rush'), 'a hidden board still shows no names');
      // only staff can switch it
      assert.equal((await fetch(`${base}/api/admin/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"showFullNames":false}' })).status, 401);
      // switched off: masked again
      r = await admin('PUT', '/admin/settings', { showFullNames: false, hiddenGames: [] });
      assert.deepEqual(await r.json(), { hiddenGames: [], showFullNames: false });
      await sleep(3100);
      j = await list();
      assert.equal(j.fullNames, false);
      assert.equal(j.scores.find((s) => s.id === 'f1').name, 'Pr***a S.', 'masked again');
      await admin('DELETE', '/admin/scores?game=case-files&id=f1'); // leave the data as the later tests expect
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
      assert.ok(allowed >= POSTS_PER_MINUTE - 20, `only ${allowed} allowed before limiting`); // earlier tests in this suite also posted (about a dozen)
    });
  });
}
