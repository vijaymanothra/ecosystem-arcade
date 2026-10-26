// The files that make up the website: the same ones the local server would serve.
// Game files only — nothing hidden, never server/, aws/ or test/, only known web file types.
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, relative, sep } from 'node:path';

const { CONTENT_TYPES } = createRequire(import.meta.url)('../server/scores-core.js');
const SKIP_TOP = new Set(['server', 'aws', 'test', 'node_modules']);

// Copies the website from `root` into a fresh `dest` folder; returns the copied paths (relative).
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
      else if (CONTENT_TYPES[extname(name).toLowerCase()]) { cpSync(full, join(dest, rel)); copied.push(rel); }
    }
  })(root);
  return copied;
}

export { CONTENT_TYPES };
