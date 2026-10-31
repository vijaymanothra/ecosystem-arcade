// The Azure version (azure/api), tested without Azure: the score files run on an in-memory
// stand-in for Blob Storage that behaves like it (ETags, refused writes when a file changed).
// Run: npm test
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { apiContract, ADMIN, today } from './contract.mjs';

const require = createRequire(import.meta.url);
const { createScoreFiles } = require('../azure/api/src/score-files.js');
const { createHandler, clientIp, createApi } = require('../azure/api/src/handler.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Blob Storage stand-in: each write gets a new ETag; a write with a stale ETag (or a create
// when the file exists) is refused. delayMs adds random latency so saves really overlap.
function memoryBackend({ delayMs = 0 } = {}) {
  const files = new Map();
  const stats = { writes: 0, refused: 0 };
  let version = 0;
  const pause = () => (delayMs ? sleep(Math.random() * delayMs) : Promise.resolve());
  return {
    files,
    stats,
    async read(name) {
      await pause();
      const f = files.get(name);
      return f ? { text: f.text, etag: f.etag } : null;
    },
    async write(name, text, etag) {
      await pause();
      const f = files.get(name);
      if (etag === null ? Boolean(f) : !f || f.etag !== etag) { stats.refused++; return false; }
      files.set(name, { text, etag: `"v${++version}"` });
      stats.writes++;
      return true;
    },
  };
}
const S = (id, x = {}) => ({ id, game: 'route-rush', name: 'Ana', score: 100, day: today, at: Date.now(), details: {}, ...x });
const fast = { wait: () => Promise.resolve(), readCacheMs: 0 };

// ---------------------------------------------------------------- the score files
describe('Azure score files (one JSON file per game)', () => {
  test('saves, lists best first (today or all time) and clears', async () => {
    const backend = memoryBackend();
    const store = createScoreFiles(backend, fast);
    await store.put(S('a', { score: 10 }));
    await store.put(S('b', { score: 30 }));
    await store.put(S('c', { score: 20, day: '2026-01-01' }));
    assert.deepEqual((await store.top('route-rush', today, 10)).map((e) => e.id), ['b', 'a']);
    assert.deepEqual((await store.top('route-rush', null, 10)).map((e) => e.id), ['b', 'c', 'a']);
    assert.deepEqual((await store.top('route-rush', null, 2)).map((e) => e.id), ['b', 'c']);
    assert.ok(backend.files.has('route-rush.json'));
    assert.equal(await store.clear('route-rush'), 3);
    assert.deepEqual(await store.top('route-rush', null, 10), []);
    assert.equal(backend.files.get('route-rush.json').text, '[]');
  });

  test('the same score sent twice is stored once', async () => {
    const store = createScoreFiles(memoryBackend(), fast);
    assert.equal(await store.put(S('dup')), true);
    assert.equal(await store.put(S('dup')), false);
    assert.equal((await store.top('route-rush', null, 10)).length, 1);
  });

  test('games are kept in separate files', async () => {
    const backend = memoryBackend();
    const store = createScoreFiles(backend, fast);
    await store.put(S('r1'));
    await store.put(S('c1', { game: 'case-files' }));
    assert.deepEqual([...backend.files.keys()].sort(), ['case-files.json', 'route-rush.json']);
    assert.equal((await store.top('case-files', null, 10)).length, 1);
  });

  test('40 saves at the same moment: every one is kept (retries after refused writes)', async () => {
    const backend = memoryBackend({ delayMs: 5 });
    const store = createScoreFiles(backend, { maxTries: 60, readCacheMs: 0 });
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => store.put(S(`p${i}`, { score: i }))));
    assert.ok(results.every(Boolean));
    const all = JSON.parse(backend.files.get('route-rush.json').text);
    assert.equal(all.length, 40);
    assert.equal(new Set(all.map((e) => e.id)).size, 40);
    assert.ok(backend.stats.refused > 0, 'the overlap really happened, so the retry path was exercised');
  });

  test('when the file keeps changing, a save gives up cleanly instead of overwriting', async () => {
    const backend = memoryBackend();
    backend.write = async () => false; // someone else always wins
    const store = createScoreFiles(backend, { ...fast, maxTries: 3 });
    await assert.rejects(store.put(S('x')), { code: 'TOO_BUSY' });
  });

  test('an unreadable file is never overwritten', async () => {
    const backend = memoryBackend();
    backend.files.set('route-rush.json', { text: '{ this is not a list', etag: '"v0"' });
    const store = createScoreFiles(backend, fast);
    await assert.rejects(store.put(S('x')), { code: 'BAD_SCORE_FILE' });
    await assert.rejects(store.clear('route-rush'), { code: 'BAD_SCORE_FILE' });
    assert.equal(backend.files.get('route-rush.json').text, '{ this is not a list');
  });

  test('a leaderboard refresh reads each file only once', async () => {
    const backend = memoryBackend();
    let reads = 0;
    const read = backend.read;
    backend.read = async (name) => { reads++; return read(name); };
    const store = createScoreFiles(backend, { wait: fast.wait, readCacheMs: 1000 });
    await store.top('route-rush', today, 10);
    await store.top('route-rush', null, 10);
    assert.equal(reads, 1);
  });

  test('a full score file stops taking scores (flood protection) without losing what it has', async () => {
    const backend = memoryBackend();
    const store = createScoreFiles(backend, { ...fast, maxScoresPerFile: 3 });
    for (const id of ['f1', 'f2', 'f3']) await store.put(S(id));
    await assert.rejects(store.put(S('f4')), { code: 'SCORES_FULL' });
    assert.equal(JSON.parse(backend.files.get('route-rush.json').text).length, 3);
    assert.equal(await store.put(S('f1')), false, 'a retry of a saved score is still recognised');
  });

  test('the API answers "full, try later" (503) so the games keep the scores and retry', async () => {
    const store = createScoreFiles(memoryBackend(), { ...fast, maxScoresPerFile: 1 });
    const api = createApi({ store, adminToken: ADMIN, log: { error() {} } });
    const r = await api({ method: 'POST', path: '/api/scores', query: {}, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scores: [S('g1', { details: undefined }), S('g2', { details: undefined })] }), ip: '1.1.1.1' });
    assert.equal(r.status, 503);
    assert.deepEqual(JSON.parse(r.body).accepted, ['g1']);
  });

  test('export reads every game', async () => {
    const store = createScoreFiles(memoryBackend(), fast);
    await store.put(S('r1'));
    const all = await store.readAll(['route-rush', 'case-files']);
    assert.equal(all['route-rush'].length, 1);
    assert.deepEqual(all['case-files'], []);
  });
});

// ---------------------------------------------------------------- the player's address
describe('Azure request details', () => {
  test('player address is read from Azure headers, without the port', () => {
    assert.equal(clientIp({ 'x-azure-clientip': '203.0.113.7' }), '203.0.113.7');
    assert.equal(clientIp({ 'x-forwarded-for': '203.0.113.7:51234, 10.0.0.1' }), '203.0.113.7');
    assert.equal(clientIp({ 'x-forwarded-for': '[2001:db8::1]:443' }), '2001:db8::1');
    assert.equal(clientIp({}), '');
  });
});

// ---------------------------------------------------------------- the full API contract
// Serves the Azure handler over HTTP the way Azure Functions would: as web Requests.
async function serveAzure() {
  const backend = memoryBackend({ delayMs: 2 });
  const handle = createHandler(createApi({ store: createScoreFiles(backend), adminToken: ADMIN, allowedOrigins: ['*'] }));
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (!['host', 'connection', 'content-length', 'transfer-encoding'].includes(k)) headers.set(k, Array.isArray(v) ? v.join(',') : v);
    const addr = req.socket.remoteAddress; // Azure sends "ip:port", with IPv6 addresses in brackets
    headers.set('x-forwarded-for', addr.includes(':') ? `[${addr}]:${req.socket.remotePort}` : `${addr}:${req.socket.remotePort}`);
    const request = new Request(`http://localhost${req.url}`, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
    const out = await handle(request);
    res.writeHead(out.status, out.headers);
    res.end(out.body);
  });
  await new Promise((r) => server.listen(0, r));
  return { base: `http://localhost:${server.address().port}`, stop: () => server.close(), backend };
}

apiContract('Azure Functions handler (score files in a Blob Storage stand-in)', serveAzure);

describe('Azure handler: busy moments', () => {
  test('20 players saving at once through the API: all 20 scores kept', async () => {
    const { base, stop, backend } = await serveAzure();
    try {
      const posts = Array.from({ length: 20 }, (_, i) => fetch(`${base}/api/scores`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores: [{ id: `busy${i}`, game: 'master-the-map', name: `Player ${String.fromCharCode(65 + i)}`, score: 100 + i, day: today }] }),
      }));
      const replies = await Promise.all(posts.map(async (p) => (await p).json()));
      assert.ok(replies.every((r) => r.accepted && r.accepted.length === 1));
      const saved = JSON.parse(backend.files.get('master-the-map.json').text);
      assert.equal(saved.length, 20);
    } finally { stop(); }
  });
});
