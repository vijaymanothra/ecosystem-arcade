// What gets published to the website: the game files only — nothing hidden, never server/,
// azure/, aws/ or test/, and only known web file types (no .md, .bat, .json, .txt …).
// Also builds the security headers file with fingerprints (hashes) of the inline scripts.
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const { CONTENT_TYPES } = createRequire(import.meta.url)('../server/scores-core.js');
const AZURE_DIR = dirname(fileURLToPath(import.meta.url));
const SKIP_TOP = new Set(['server', 'azure', 'aws', 'test', 'node_modules']);

// Copies the website from `root` into a fresh `dest`; returns the copied paths (relative).
export function stageSite(root, dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const copied = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = relative(root, full);
      if (name.startsWith('.') || SKIP_TOP.has(rel.split(sep)[0])) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (CONTENT_TYPES[extname(name).toLowerCase()]) { mkdirSync(dirname(join(dest, rel)), { recursive: true }); cpSync(full, join(dest, rel)); copied.push(rel); }
    }
  })(root);
  return copied;
}

// sha256 fingerprints of every inline <script> in the staged HTML files, for the CSP
export function inlineScriptHashes(siteDir, files) {
  const hashes = new Set();
  for (const f of files.filter((x) => x.endsWith('.html'))) {
    const html = readFileSync(join(siteDir, f), 'utf8');
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
      hashes.add(`'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
    }
  }
  return [...hashes];
}

// Writes staticwebapp.config.json into the staged site from staticwebapp.config.template.json,
// filling in the inline-script hashes. (The template has a different name so the upload tool
// can never mistake it for the real file.)
export function writeSiteConfig(siteDir, files) {
  const template = readFileSync(join(AZURE_DIR, 'staticwebapp.config.template.json'), 'utf8');
  const config = template.replace('{{INLINE_SCRIPT_HASHES}}', inlineScriptHashes(siteDir, files).join(' '));
  writeFileSync(join(siteDir, 'staticwebapp.config.json'), config);
  return JSON.parse(config);
}
