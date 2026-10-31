// ============================================================
//  SCORE FILES — scores kept as one JSON file per game in a private Azure Blob Storage
//  container:  scores/master-the-map.json, scores/route-rush.json, …
//
//  Saving reads the file, adds the score and writes it back only if nobody changed the file
//  in the meantime (an ETag check). If someone did, it reads again and retries, so two saves
//  at the same moment never overwrite each other. A file that can't be read as a list of
//  scores is never overwritten: the save fails instead, and the file stays as it is.
//
//  createScoreFiles(backend) returns the store the shared API expects (put / top / clear).
//  The backend does the actual file reads and writes:
//    read(name)               → { text, etag } or null when the file doesn't exist yet
//    write(name, text, etag)  → true, or false when the file changed since `etag` was read
//                               (etag null = create the file; false if it already exists)
// ============================================================
'use strict';

const byRank = (a, b) => (b.score - a.score) || (a.at - b.at);

function createScoreFiles(backend, {
  maxTries = 8,           // attempts per save when others keep saving at the same moment
  readCacheMs = 1000,     // a leaderboard asks for today's and all-time lists; read each file once
  maxScoresPerFile = 20000, // ~3 MB; a real event stays far below. A spam flood stops here instead of
                            // making every save rewrite an ever-bigger file. Wipe the spam to continue.
  wait = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  const fileName = (game) => `${game}.json`;
  const cache = new Map(); // game → { at, list }

  async function load(game) {
    const f = await backend.read(fileName(game));
    if (!f) return { list: [], etag: null };
    let list = null;
    try { list = JSON.parse(f.text); } catch { /* reported below */ }
    if (!Array.isArray(list)) {
      throw Object.assign(new Error(`${fileName(game)} isn't a valid list of scores; refusing to overwrite it`), { code: 'BAD_SCORE_FILE' });
    }
    return { list, etag: f.etag };
  }

  // change(list) returns the new list to write, or null when there's nothing to write
  async function update(game, change) {
    for (let attempt = 1; attempt <= maxTries; attempt++) {
      const { list, etag } = await load(game);
      const next = change(list);
      if (next === null) return { written: false, before: list };
      if (await backend.write(fileName(game), JSON.stringify(next), etag)) {
        cache.delete(game);
        return { written: true, before: list };
      }
      await wait(Math.round(15 + Math.random() * 60 * attempt)); // someone else saved first: back off, then retry
    }
    throw Object.assign(new Error(`couldn't save ${fileName(game)}: too many saves at once`), { code: 'TOO_BUSY' });
  }

  return {
    async put(score) {
      const { written } = await update(score.game, (list) => {
        if (list.some((e) => e.id === score.id)) return null;
        if (list.length >= maxScoresPerFile) {
          throw Object.assign(new Error(`${fileName(score.game)} holds ${list.length} scores, the most allowed; wipe test or spam scores to continue`), { code: 'SCORES_FULL' });
        }
        return [...list, score];
      });
      return written;
    },
    async top(game, day, limit) {
      const hit = cache.get(game);
      let list;
      if (hit && Date.now() - hit.at < readCacheMs) list = hit.list;
      else { list = (await load(game)).list; cache.set(game, { at: Date.now(), list }); }
      return list.filter((e) => !day || e.day === day).sort(byRank).slice(0, limit);
    },
    async list(game) {
      return (await load(game)).list.sort(byRank);
    },
    async remove(game, id) {
      const { written } = await update(game, (list) => (list.some((e) => e.id === id) ? list.filter((e) => e.id !== id) : null));
      return written ? 1 : 0;
    },
    async clear(game) {
      const { written, before } = await update(game, (list) => (list.length ? [] : null));
      return written ? before.length : 0;
    },
    // staff settings (which leaderboards are hidden) live next to the score files, in settings.json
    async getSettings() {
      const f = await backend.read('settings.json');
      if (!f) return {};
      try { return JSON.parse(f.text) || {}; } catch { return {}; }
    },
    async setSettings(settings) {
      for (let attempt = 1; attempt <= maxTries; attempt++) {
        const f = await backend.read('settings.json');
        if (await backend.write('settings.json', JSON.stringify(settings), f ? f.etag : null)) return;
        await wait(20 * attempt);
      }
      throw Object.assign(new Error("couldn't save settings.json"), { code: 'TOO_BUSY' });
    },
    async readAll(games) {           // for exports: every score, newest file contents
      const out = {};
      for (const g of games) out[g] = (await load(g)).list;
      return out;
    },
  };
}

// The real backend: a private blob container, reached with a container-scoped SAS URL
// (read / create / write only, HTTPS only, expiring), never the storage account key.
function blobBackend(containerUrl) {
  const { ContainerClient } = require('@azure/storage-blob');
  const container = new ContainerClient(containerUrl);
  const toText = async (stream) => {
    const chunks = [];
    for await (const c of stream) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
    return Buffer.concat(chunks).toString('utf8');
  };
  return {
    async read(name) {
      try {
        const res = await container.getBlockBlobClient(name).download();
        return { text: await toText(res.readableStreamBody), etag: res.etag };
      } catch (err) {
        if (err.statusCode === 404) return null;
        throw err;
      }
    },
    async write(name, text, etag) {
      try {
        await container.getBlockBlobClient(name).upload(text, Buffer.byteLength(text), {
          conditions: etag ? { ifMatch: etag } : { ifNoneMatch: '*' },
          blobHTTPHeaders: { blobContentType: 'application/json; charset=utf-8' },
        });
        return true;
      } catch (err) {
        if (err.statusCode === 412 || err.statusCode === 409) return false; // changed or created meanwhile
        throw err;
      }
    },
  };
}

module.exports = { createScoreFiles, blobBackend };
