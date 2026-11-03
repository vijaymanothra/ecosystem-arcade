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

    describe('passports and goodies', () => {
      const GAMES = ['case-files', 'evernorth-city', 'master-the-map', 'route-rush', 'health-journey'];
      const adm = (method, p, body) => fetch(`${base}/api${p}`, { method, headers: { 'X-Admin-Token': ADMIN, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      // one score per game for the first `games` games, at the given share of right answers
      const play = (id, name, tag, games, pct = 80) => post(GAMES.slice(0, games).map((game) => S(`${id}-${game}`, { game, name, tag, score: 500, pct })));
      const give = (name, tag, via = 'games', game) => adm('POST', '/admin/goodies', { day: today, name, tag, via, game });
      const wipe = () => adm('DELETE', '/scores');
      const lookup = async (name) => (await (await fetch(`${base}/api/passports?day=${today}&name=${encodeURIComponent(name)}`)).json()).passports;
      const board = async () => (await adm('GET', `/admin/goodies?day=${today}`)).json();
      const setStock = (goodieStock) => adm('PUT', '/admin/settings', { goodieStock });
      after(async () => { await wipe(); await setStock({ chocolate: 30, keychain: 30, 'phone-holder': 20, 'top-phone-holder': 10 }); });

      test('the lookup finds only that exact name, with its stamps, for welcome back', async () => {
        await wipe();
        await play('w1', 'Priya S.', 'qw7', 3);
        await play('w2', 'Priya S.', 'k4m', 1, 20);
        await play('w3', 'Priya R.', 'abc', 1);
        const found = await lookup('priya s.');
        assert.deepEqual(found.map((p) => p.tag).sort(), ['k4m', 'qw7']);
        const qw7 = found.find((p) => p.tag === 'qw7');
        assert.equal(Object.keys(qw7.games).length, 3);
        assert.equal(qw7.games['case-files'].pct, 80);
        assert.deepEqual(await lookup('Nobody H.'), []);
        assert.equal((await fetch(`${base}/api/passports?day=${today}`)).status, 400);
      });

      test('the best attempt counts, and below 40% does not pass', async () => {
        await wipe();
        await post([S('b1', { game: 'case-files', name: 'Bo T.', tag: 'bbb', pct: 39 }), S('b2', { game: 'evernorth-city', name: 'Bo T.', tag: 'bbb', pct: 39 }), S('b3', { game: 'route-rush', name: 'Bo T.', tag: 'bbb', pct: 39 })]);
        assert.deepEqual((await board()).players, [], '39% in three games earns nothing');
        await post([S('b4', { game: 'case-files', name: 'Bo T.', tag: 'bbb', pct: 40 }), S('b5', { game: 'evernorth-city', name: 'Bo T.', tag: 'bbb', pct: 90 }), S('b6', { game: 'route-rush', name: 'Bo T.', tag: 'bbb', pct: 41, score: 1 })]);
        const [p] = (await board()).players;
        assert.equal(p.passed, 3);
        assert.equal(p.earned, 'chocolate');
      });

      test('a multiplayer score, with no share of right answers, never passes', async () => {
        await wipe();
        await post(GAMES.map((game) => S(`mp-${game}`, { game, name: 'Mo Z.', tag: 'mmm' })));
        assert.deepEqual((await board()).players, []);
      });

      test('3, 4 and 5 passed games earn chocolate, keychain and phone holder, one per person', async () => {
        await wipe();
        await play('l2', 'Two A.', 'aaa', 2);
        await play('l3', 'Three A.', 'bbb', 3);
        await play('l4', 'Four A.', 'ccc', 4);
        await play('l5', 'Five A.', 'ddd', 5);
        const b = await board();
        assert.deepEqual(Object.fromEntries(b.players.map((p) => [p.name, p.earned])), { 'Three A.': 'chocolate', 'Four A.': 'keychain', 'Five A.': 'phone-holder' });
        assert.equal((await give('Two A.', 'aaa')).status, 409, 'two games is not enough');
        assert.equal((await (await give('Four A.', 'ccc')).json()).claim.goodie, 'keychain');
        const again = await give('Four A.', 'ccc');
        assert.equal(again.status, 409, 'nobody collects twice');
        assert.match((await again.json()).error, /already collected/);
        assert.equal((await lookup('Four A.'))[0].claims[0].goodie, 'keychain', 'the player can see it was collected');
        assert.equal((await board()).stock.keychain.left, 29);
      });

      test('two desks at the same moment hand over one goodie, and the last one only once', async () => {
        await wipe();
        await play('r1', 'Race A.', 'aaa', 3);
        await play('r2', 'Race B.', 'bbb', 3);
        const same = await Promise.all([give('Race A.', 'aaa'), give('Race A.', 'aaa'), give('Race A.', 'aaa')]);
        assert.equal(same.filter((r) => r.status === 200).length, 1);
        await wipe();
        await setStock({ chocolate: 1 });
        await play('r3', 'Race A.', 'aaa', 3);
        await play('r4', 'Race B.', 'bbb', 3);
        const both = await Promise.all([give('Race A.', 'aaa'), give('Race B.', 'bbb')]);
        assert.equal(both.filter((r) => r.status === 200).length, 1);
        await setStock({ chocolate: 30 });
      });

      test('when a goodie runs out, the next one down is offered; with nothing left, ask staff', async () => {
        await wipe();
        await setStock({ 'phone-holder': 0, keychain: 1, chocolate: 0 });
        await play('o1', 'Out A.', 'aaa', 5);
        await play('o2', 'Out B.', 'bbb', 5);
        assert.equal((await (await give('Out A.', 'aaa')).json()).claim.goodie, 'keychain');
        const none = await give('Out B.', 'bbb');
        assert.equal(none.status, 409);
        assert.match((await none.json()).error, /nothing left/);
        await setStock({ 'phone-holder': 20, keychain: 30, chocolate: 30 });
      });

      test('top scorers: 2 per game, and someone with a phone holder passes it to the next person', async () => {
        await wipe();
        await post([
          S('t1', { game: 'case-files', name: 'Top A.', tag: 'aaa', score: 900 }),
          S('t2', { game: 'case-files', name: 'Top B.', tag: 'bbb', score: 800 }),
          S('t3', { game: 'case-files', name: 'Top C.', tag: 'ccc', score: 700 }),
        ]);
        let top = (await board()).top;
        assert.deepEqual(top.map((t) => t.name), ['Top A.', 'Top B.']);
        assert.equal((await give('Top A.', 'aaa', 'top', 'case-files')).status, 200);
        assert.equal((await give('Top A.', 'aaa', 'top', 'case-files')).status, 409);
        top = (await board()).top;
        assert.deepEqual(top.map((t) => t.name), ['Top B.'], 'one place on this board is given, one is left');
        assert.equal((await board()).stock['top-phone-holder'].left, 9);
      });

      test('a top scorer may take a reserved phone holder after a smaller goodie', async () => {
        await wipe();
        await play('s1', 'Star A.', 'aaa', 3);
        assert.equal((await (await give('Star A.', 'aaa')).json()).claim.goodie, 'chocolate');
        assert.equal((await give('Star A.', 'aaa', 'top', 'case-files')).status, 200);
      });

      test('staff can undo a mistake; a full wipe starts goodies over; all of it needs the password', async () => {
        await wipe();
        await play('u1', 'Undo A.', 'aaa', 3);
        const { claim } = await (await give('Undo A.', 'aaa')).json();
        assert.equal((await board()).stock.chocolate.left, 29);
        assert.deepEqual(await (await adm('DELETE', `/admin/goodies?id=${encodeURIComponent(claim.id)}`)).json(), { deleted: 1 });
        assert.equal((await board()).stock.chocolate.left, 30);
        assert.equal((await give('Undo A.', 'aaa')).status, 200, 'and it can be given again');
        assert.equal((await fetch(`${base}/api/admin/goodies?day=${today}`)).status, 401);
        assert.equal((await fetch(`${base}/api/admin/goodies`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
        await wipe();
        assert.deepEqual((await board()).claims, []);
      });
    });

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
      assert.deepEqual(await r.json(), { hiddenGames: ['route-rush'], showFullNames: true, goodieStock: { chocolate: 30, keychain: 30, 'phone-holder': 20, 'top-phone-holder': 10 } });
      r = await admin('PUT', '/admin/settings', { hiddenGames: [] });
      assert.deepEqual(await r.json(), { hiddenGames: [], showFullNames: true, goodieStock: { chocolate: 30, keychain: 30, 'phone-holder': 20, 'top-phone-holder': 10 } }, 'hiding/showing boards keeps full names on');
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
      assert.deepEqual(await r.json(), { hiddenGames: [], showFullNames: false, goodieStock: { chocolate: 30, keychain: 30, 'phone-holder': 20, 'top-phone-holder': 10 } });
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
      assert.ok(allowed >= POSTS_PER_MINUTE - 60, `only ${allowed} allowed before limiting`); // earlier tests in this suite also posted (about 40)
    });
  });
}
