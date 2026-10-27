// ============================================================
//  Turns an Azure Functions HTTP request into the shared API's request and back.
//  The endpoints and score rules themselves live in server/scores-api.js and
//  server/scores-core.js (copied into src/lib/ when deploying).
// ============================================================
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// The shared code (and blocked-words.txt): packaged in src/lib/; in the repo (tests): server/
const SHARED_DIR = fs.existsSync(path.join(__dirname, 'lib', 'scores-core.js'))
  ? path.join(__dirname, 'lib')
  : path.join(__dirname, '..', '..', '..', 'server');
const shared = (name) => require(path.join(SHARED_DIR, name));
const core = shared('scores-core.js');
const { createApi } = shared('scores-api.js');
const { createScoreFiles, blobBackend } = require('./score-files');

// Azure puts the player's address in these headers (port included for IPv4)
function clientIp(headers) {
  const raw = String(headers['x-azure-clientip'] || headers['x-client-ip'] || (headers['x-forwarded-for'] || '').split(',')[0]).trim();
  const v4 = raw.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (v4) return v4[1];
  const v6 = raw.match(/^\[([^\]]+)\](?::\d+)?$/);
  return v6 ? v6[1] : raw;
}

// request: anything shaped like a web Request (method, url, headers, text())
function createHandler(api) {
  return async function handle(request) {
    const url = new URL(request.url);
    const headers = {};
    for (const [k, v] of request.headers) headers[k.toLowerCase()] = v;
    const body = request.method === 'POST' ? await request.text() : '';
    const out = await api({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers,
      body,
      ip: clientIp(headers),
    });
    return { status: out.status, headers: out.headers, body: out.body };
  };
}

// The live handler, configured from the app settings the Bicep template sets.
let live;
function liveHandler() {
  if (!live) {
    const containerUrl = process.env.SCORES_CONTAINER_URL;
    if (!containerUrl) throw new Error('SCORES_CONTAINER_URL is not set');
    const nameFilter = core.loadNameFilter(SHARED_DIR);
    live = createHandler(createApi({
      store: createScoreFiles(blobBackend(containerUrl)),
      adminToken: process.env.ADMIN_TOKEN || '',
      allowedOrigins: core.parseOrigins(process.env.ALLOWED_ORIGIN),
      isBlocked: nameFilter.isBlocked,
    }));
  }
  return live;
}

module.exports = { createHandler, clientIp, liveHandler, core, createApi };
