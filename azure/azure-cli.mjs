// Small helpers shared by the Azure scripts: find and run the Azure CLI, read options,
// and keep per-deployment settings (the admin token) in a git-ignored file.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const AZURE_DIR = dirname(fileURLToPath(import.meta.url));
export const ROOT = dirname(AZURE_DIR);
const isWin = process.platform === 'win32';

// command-line options: --name value, repeated --tag k=v, bare --flags
export function readOptions(argv = process.argv.slice(2)) {
  const opts = { tag: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    const value = next !== undefined && !next.startsWith('--') ? (i++, next) : true;
    if (key === 'tag') opts.tag.push(value); else opts[key] = value;
  }
  return opts;
}

// Windows needs the Azure CLI's full path in terminals opened before it was installed
function findAz() {
  if (!isWin) return 'az';
  const probe = spawnSync('where', ['az.cmd'], { encoding: 'utf8' });
  if (probe.status === 0 && probe.stdout.trim()) return probe.stdout.trim().split(/\r?\n/)[0];
  for (const p of [`${process.env.ProgramFiles}\\Microsoft SDKs\\Azure\\CLI2\\wbin\\az.cmd`, `${process.env['ProgramFiles(x86)']}\\Microsoft SDKs\\Azure\\CLI2\\wbin\\az.cmd`]) {
    if (existsSync(p)) return p;
  }
  throw new Error('Azure CLI not found. Install it (winget install Microsoft.AzureCLI), open a new terminal, and run: az login');
}
const AZ = findAz();

// .cmd files on Windows must run through the shell, so quote each argument for cmd.exe
const quote = (a) => (isWin && /[\s"&|<>^()%!,;=]/.test(a) ? `"${String(a).replace(/"/g, '""')}"` : a);
function run(cmd, args, { json = false, quiet = false, env } = {}) {
  const r = isWin
    ? spawnSync([quote(cmd), ...args.map(quote)].join(' '), { encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...env }, stdio: quiet || json ? ['ignore', 'pipe', 'pipe'] : 'inherit' })
    : spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...env }, stdio: quiet || json ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
  if (r.status !== 0) {
    const err = new Error(`${cmd.split(/[\\/]/).pop()} ${args.slice(0, 3).join(' ')} … failed${r.stderr ? `:\n${r.stderr.trim()}` : ''}`);
    err.stderr = r.stderr || '';
    throw err;
  }
  if (!json) return r.stdout;
  try { return JSON.parse(r.stdout || 'null'); } catch { return r.stdout.trim(); }
}

export const az = (args, opts = {}) => run(AZ, [...args, '--only-show-errors', ...(opts.json ? ['-o', 'json'] : [])], opts);
export const npm = (args, opts) => run(isWin ? 'npm.cmd' : 'npm', args, opts);
export const npx = (args, opts) => run(isWin ? 'npx.cmd' : 'npx', args, opts);

// signed in? optionally switch subscription; returns the active one
export function account(subscription) {
  if (subscription) az(['account', 'set', '--subscription', subscription], { quiet: true });
  try { return az(['account', 'show'], { json: true }); } catch {
    throw new Error('Not signed in to Azure. Run: az login');
  }
}

// settings kept between deploys (admin token), keyed by subscription/resource group/app
const SETTINGS_FILE = join(AZURE_DIR, '.deploy.local.json');
export function settingsFor(key, create) {
  const all = existsSync(SETTINGS_FILE) ? JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')) : {};
  if (!all[key] && create) { all[key] = create(); writeFileSync(SETTINGS_FILE, JSON.stringify(all, null, 2)); }
  return all[key];
}
export function saveSettings(key, value) {
  const all = existsSync(SETTINGS_FILE) ? JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')) : {};
  all[key] = value;
  writeFileSync(SETTINGS_FILE, JSON.stringify(all, null, 2));
}
export const SETTINGS_PATH = SETTINGS_FILE;

export const step = (msg) => console.log(`\n▸ ${msg}`);
export function defaults(opts) {
  return {
    subscription: opts.subscription,
    group: opts['resource-group'] || 'rg-ecosystem-arcade',
    location: opts.location || 'eastasia',
    name: opts.name || 'ecosystem-arcade',
  };
}
