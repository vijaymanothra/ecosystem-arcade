// The scores API contract, checked against both implementations:
//   • the local server (server/server.js + SQLite)
//   • the AWS Lambda handler (aws/lambda/handler.js), with an in-memory stand-in for DynamoDB
// Run: npm test
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
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
    for (const p of ['/server/server.js', '/server/scores-core.js', '/server/data/scores.db', '/aws/deploy.mjs', '/.git/config', '/package.json',
      '/README.md', '/start-kiosk.bat', '/%2e%2e/%2e%2e/Windows/win.ini', '/..%5c..%5cWindows%5cwin.ini']) {
      assert.equal((await fetch(base + p)).status, 404, p);
    }
  });
});

// ---------------------------------------------------------------- 2. AWS Lambda handler
function memoryStore() {
  const rows = new Map();
  return {
    async put(s) { if (rows.has(s.id)) return false; rows.set(s.id, structuredClone(s)); return true; },
    async top(game, day, limit) {
      return [...rows.values()].filter((r) => r.game === game && (!day || r.day === day)).sort((a, b) => b.score - a.score).slice(0, limit);
    },
    async clear(game) { let n = 0; for (const [id, r] of rows) if (r.game === game) { rows.delete(id); n++; } return n; },
  };
}

// Serves the Lambda handler over HTTP the way API Gateway would, adding the header CloudFront sends.
// siteDir set = the no-CloudFront mode: no origin secret, and the handler serves the games too.
async function serveLambda({ originHeader = true, siteDir = null } = {}) {
  const { createApi } = require('../aws/lambda/handler.js');
  const handle = createApi({ store: memoryStore(), adminToken: ADMIN, originSecret: siteDir ? '' : 'origin-secret-123456', allowedOrigins: ['*'], siteDir });
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const url = new URL(req.url, 'http://x');
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v]));
    if (originHeader) headers['x-origin-verify'] = 'origin-secret-123456';
    headers['cloudfront-viewer-address'] = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
    const out = await handle({
      rawPath: url.pathname,
      queryStringParameters: Object.fromEntries(url.searchParams),
      headers,
      requestContext: { http: { method: req.method, sourceIp: req.socket.remoteAddress } },
      body: chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined,
      isBase64Encoded: false,
    });
    res.writeHead(out.statusCode, out.headers);
    res.end(out.body && out.isBase64Encoded ? Buffer.from(out.body, 'base64') : out.body);
  });
  await new Promise((r) => server.listen(0, r));
  return { base: `http://localhost:${server.address().port}`, stop: () => server.close() };
}

apiContract('AWS Lambda handler (DynamoDB stand-in)', () => serveLambda());

describe('AWS Lambda handler: serving the games without CloudFront', () => {
  let base, stop, siteDir;
  before(async () => {
    const { stageSite } = await import('../aws/site-files.mjs');
    siteDir = mkdtempSync(join(tmpdir(), 'arcade-site-'));
    const copied = stageSite(ROOT, siteDir);
    assert.ok(copied.includes('index.html') && copied.some((f) => f.endsWith('leaderboard.js')));
    assert.ok(!copied.some((f) => /^(server|aws|test)[\\/]|\.(bat|command|md|json)$/.test(f)), 'only game files are published');
    ({ base, stop } = await serveLambda({ siteDir }));
  });
  after(() => { stop(); rmSync(siteDir, { recursive: true, force: true }); });

  test('serves the arcade and its files with the right types', async () => {
    let r = await fetch(`${base}/`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.match(await r.text(), /Ecosystem Arcade/);
    r = await fetch(`${base}/shared/leaderboard.js`);
    assert.match(r.headers.get('content-type'), /text\/javascript/);
    assert.match(await r.text(), /SHARED LEADERBOARD/);
  });

  test('folders work with and without the trailing slash', async () => {
    const r = await fetch(`${base}/route-rush`);
    assert.ok(r.url.endsWith('/route-rush/'));
    assert.match(await r.text(), /<html/i);
  });

  test('files are compressed and browsers only re-download changed ones', async () => {
    const r = await fetch(`${base}/home.html`, { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(r.headers.get('content-encoding'), 'gzip');
    const etag = r.headers.get('etag');
    assert.ok(etag);
    assert.equal((await fetch(`${base}/home.html`, { headers: { 'If-None-Match': etag } })).status, 304);
  });

  test('never serves the server, secrets, hidden or outside files', async () => {
    for (const p of ['/server/server.js', '/aws/.deploy.local.json', '/aws/deploy.mjs', '/handler.js', '/scores-core.js', '/package.json',
      '/README.md', '/start-kiosk.bat', '/.git/config', '/%2e%2e/handler.js', '/..%5chandler.js', '/%2e%2e/%2e%2e/Windows/win.ini']) {
      assert.equal((await fetch(base + p)).status, 404, p);
    }
  });

  test('the scores API still works alongside', async () => {
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    const r = await fetch(`${base}/api/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scores: [{ id: 's1', game: 'case-files', name: 'Ana', score: 5, day: today }] }) });
    assert.deepEqual((await r.json()).accepted, ['s1']);
  });
});

describe('AWS Lambda handler: CloudFront rules', () => {
  test('refuses requests that skip CloudFront', async () => {
    const { base, stop } = await serveLambda({ originHeader: false });
    try { assert.equal((await fetch(`${base}/api/health`)).status, 403); } finally { stop(); }
  });
  test('score lists may be cached by CloudFront for a few seconds; uploads never', async () => {
    const { base, stop } = await serveLambda();
    try {
      assert.match((await fetch(`${base}/api/scores`)).headers.get('cache-control'), /s-maxage=5/);
      const r = await fetch(`${base}/api/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"scores":[]}' });
      assert.equal(r.headers.get('cache-control'), 'no-store');
    } finally { stop(); }
  });
});
