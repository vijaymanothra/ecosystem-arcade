// ============================================================
//  Saves every score from Azure to this computer:
//    azure-scores-backup/<date-time>/<game>.json   the score files exactly as stored
//    azure-scores-backup/<date-time>/scores.csv    all games in one table (opens in Excel)
//
//    npm run azure:export        (same --subscription / --resource-group options as deploy)
//
//  Uses your Azure sign-in to fetch the storage key for this one download; the key isn't saved.
// ============================================================
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, readOptions, defaults, az, account, step } from './azure-cli.mjs';

const GAMES = ['master-the-map', 'route-rush', 'health-journey', 'evernorth-city', 'case-files'];

export function exportScores(cfg) {
  account(cfg.subscription);
  const storage = az(['resource', 'list', '--resource-group', cfg.group, '--resource-type', 'Microsoft.Storage/storageAccounts', '--query', '[0].name'], { json: true });
  if (!storage) throw new Error(`No storage account found in resource group ${cfg.group}.`);
  const key = az(['storage', 'account', 'keys', 'list', '--resource-group', cfg.group, '--account-name', storage, '--query', '[0].value'], { json: true });
  const env = { AZURE_STORAGE_ACCOUNT: storage, AZURE_STORAGE_KEY: key }; // passed privately, never on the command line

  const dir = join(ROOT, 'azure-scores-backup', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
  mkdirSync(dir, { recursive: true });
  step(`Downloading score files from ${storage} to ${relative(ROOT, dir)}`);
  const rows = [];
  for (const game of GAMES) {
    const file = join(dir, `${game}.json`);
    try {
      az(['storage', 'blob', 'download', '--container-name', 'scores', '--name', `${game}.json`, '--file', file, '--no-progress'], { quiet: true, env });
    } catch (err) {
      if (/BlobNotFound|does not exist/i.test(err.stderr)) { console.log(`  ${game}: no scores yet`); continue; }
      throw err;
    }
    const list = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
    console.log(`  ${game}: ${list.length} scores`);
    for (const s of list) rows.push([game, s.name, s.score, s.day, new Date(s.at).toISOString(), s.id]);
  }
  const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  rows.sort((a, b) => a[0].localeCompare(b[0]) || b[2] - a[2]);
  writeFileSync(join(dir, 'scores.csv'), [['game', 'name', 'score', 'day', 'saved_at_utc', 'id'], ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n');
  console.log(`\n✅ ${rows.length} scores saved in ${relative(ROOT, dir)} (scores.csv opens in Excel)`);
  return dir;
}

if (process.argv[1] && process.argv[1].endsWith('export.mjs')) {
  try { exportScores(defaults(readOptions())); } catch (err) { console.error(`\n✖ ${err.message}`); process.exit(1); }
}
