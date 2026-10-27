// ============================================================
//  Removes the arcade from Azure by deleting its resource group — the website, the API and the
//  storage account with every score in it. Saves all scores to this computer first.
//
//    npm run azure:remove                    asks you to type the resource group name to confirm
//    npm run azure:remove -- --yes           no question (for scripts)
//    npm run azure:remove -- --no-export     don't save the scores first
//  (same --subscription / --resource-group options as deploy)
// ============================================================
import { createInterface } from 'node:readline/promises';
import { ROOT, readOptions, defaults, az, account, step } from './azure-cli.mjs';
import { exportScores } from './export.mjs';

const opts = readOptions();
const cfg = defaults(opts);

try {
  const acct = account(cfg.subscription);
  if (az(['group', 'exists', '--name', cfg.group], { json: true }) !== true) {
    console.log(`Nothing to remove: resource group ${cfg.group} doesn't exist in ${acct.name}.`);
    process.exit(0);
  }
  const resources = az(['resource', 'list', '--resource-group', cfg.group, '--query', '[].{name:name, type:type}'], { json: true });
  console.log(`Subscription ${acct.name}\nResource group ${cfg.group} contains:`);
  for (const r of resources) console.log(`  • ${r.name}  (${r.type})`);

  if (!opts.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`\nThis deletes everything above, including all scores. Type the resource group name (${cfg.group}) to confirm: `);
    rl.close();
    if (answer.trim() !== cfg.group) { console.log('Not confirmed — nothing was removed.'); process.exit(0); }
  }

  if (!opts['no-export']) exportScores(cfg);

  step(`Deleting resource group ${cfg.group} (a few minutes)`);
  az(['group', 'delete', '--name', cfg.group, '--yes']);
  console.log(`\n✅ Removed. Nothing for the arcade is left in ${acct.name}.`);
  if (!opts['no-export']) console.log(`   Your scores were saved under ${ROOT}\\azure-scores-backup\\ first.`);
} catch (err) {
  console.error(`\n✖ ${err.message}`);
  process.exit(1);
}
