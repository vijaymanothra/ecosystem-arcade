// ============================================================
//  Deploys the arcade to Azure: Static Web App (games + scores API) + Storage Account (scores).
//
//    npm run azure:preview                   show what would be created or changed — changes nothing
//    npm run azure:deploy                    create / update everything and publish the games
//
//  Options (after --):
//    --subscription <id or name>   default: the one `az account show` reports
//    --resource-group <name>       default: rg-ecosystem-arcade
//    --location <region>           default: eastasia (Static Web Apps: centralus, eastus2, westus2, westeurope, eastasia)
//    --storage-location <region>   default: same as --location
//    --name <app name>             default: ecosystem-arcade   (resources: swa-<name>, st<name>…)
//    --sku Free|Standard           default: Free
//    --tag key=value               repeatable, e.g. --tag owner=vijay --tag deleteAfter=2027-01-31
//    --access-days <n>             how long the API's pass to the score files lasts (default 180;
//                                  every deploy issues a fresh one)
//
//  Needs: Azure CLI (az login), Node.js 22.13+. The admin token for wiping scores is generated
//  on the first deploy and kept in azure/.deploy.local.json (git-ignored).
// ============================================================
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, relative } from 'node:path';
import { AZURE_DIR, ROOT, readOptions, defaults, az, npm, npx, account, settingsFor, SETTINGS_PATH, step } from './azure-cli.mjs';
import { stageSite, writeSiteConfig } from './site-files.mjs';

const SWA_CLI = '@azure/static-web-apps-cli@2.1.0';
const opts = readOptions();
const cfg = defaults(opts);
const preview = Boolean(opts.preview);
const sku = opts.sku === 'Standard' ? 'Standard' : 'Free';
const accessDays = Math.min(365, Math.max(1, Number(opts['access-days']) || 180));
const tags = Object.fromEntries(opts.tag.filter((t) => typeof t === 'string' && t.includes('=')).map((t) => [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)]));
tags.app = tags.app || 'ecosystem-arcade';

try {
  // ---------------------------------------------------------------- who and where
  const acct = account(cfg.subscription);
  console.log(`Azure: ${acct.name} (${acct.id}) · signed in as ${acct.user && acct.user.name}`);
  console.log(`Resource group ${cfg.group} · region ${cfg.location} · app ${cfg.name} · plan ${sku}${preview ? ' · PREVIEW ONLY' : ''}`);
  const settings = settingsFor(`${acct.id}/${cfg.group}/${cfg.name}`, () => ({ adminToken: randomBytes(24).toString('base64url') }));

  // ---------------------------------------------------------------- services the subscription must have switched on
  const providers = ['Microsoft.Web', 'Microsoft.Storage'];
  const off = providers.filter((p) => az(['provider', 'show', '--namespace', p, '--query', 'registrationState'], { json: true }) !== 'Registered');
  if (off.length && preview) console.log(`\nWould switch on (register) for this subscription: ${off.join(', ')}`);
  for (const p of preview ? [] : off) {
    step(`Switching on ${p} for this subscription (one-time, a minute or two)`);
    az(['provider', 'register', '--namespace', p, '--wait'], { quiet: true });
  }

  // ---------------------------------------------------------------- the resource group
  const groupExists = az(['group', 'exists', '--name', cfg.group], { json: true }) === true;
  if (!groupExists) {
    if (preview) console.log(`Would create resource group ${cfg.group} in ${cfg.location} with tags ${JSON.stringify(tags)}`);
    else {
      step(`Creating resource group ${cfg.group}`);
      az(['group', 'create', '--name', cfg.group, '--location', cfg.location, '--tags', ...Object.entries(tags).map(([k, v]) => `${k}=${v}`)], { quiet: true });
    }
  }

  // ---------------------------------------------------------------- parameters (kept out of the command line; contains the admin token)
  const build = join(AZURE_DIR, '.build');
  rmSync(build, { recursive: true, force: true });
  mkdirSync(build, { recursive: true });
  const paramsFile = join(build, 'params.json');
  writeFileSync(paramsFile, JSON.stringify({
    $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#',
    contentVersion: '1.0.0.0',
    parameters: {
      appName: { value: cfg.name },
      staticSiteLocation: { value: cfg.location },
      storageLocation: { value: opts['storage-location'] || cfg.location },
      staticSiteSku: { value: sku },
      tags: { value: tags },
      adminToken: { value: settings.adminToken },
      scoresAccessExpiry: { value: new Date(Date.now() + accessDays * 86400000).toISOString().replace(/\.\d+Z$/, 'Z') },
    },
  }, null, 2));
  const template = join(AZURE_DIR, 'main.bicep');

  if (preview) {
    if (!groupExists) {
      console.log('\nThe resource group doesn\'t exist yet, so here is everything the template creates:');
      console.log('  • Static Web App  swa-' + cfg.name + `  (${sku} plan, ${cfg.location})  — the games + scores API`);
      console.log('  • Storage Account st' + cfg.name.replace(/-/g, '') + '…  (Standard LRS, private) with container "scores", versioning, soft delete, a 30-day version cleanup rule');
      console.log('  • App settings on the Static Web App: SCORES_CONTAINER_URL (limited pass to the scores container), ADMIN_TOKEN, ALLOWED_ORIGIN');
    } else {
      step('What would change (Azure what-if; nothing is changed)');
      az(['deployment', 'group', 'what-if', '--resource-group', cfg.group, '--template-file', template, '--parameters', `@${paramsFile}`]);
    }
    rmSync(build, { recursive: true, force: true });
    console.log('\nPreview only — nothing was created or changed. To deploy: npm run azure:deploy');
    process.exit(0);
  }

  // ---------------------------------------------------------------- create / update the resources
  step('Creating / updating the Azure resources (about 1–2 minutes)');
  const deployment = az(['deployment', 'group', 'create', '--resource-group', cfg.group, '--name', `arcade-${Date.now()}`,
    '--template-file', template, '--parameters', `@${paramsFile}`, '--query', 'properties.outputs'], { json: true });
  rmSync(paramsFile, { force: true });
  const out = Object.fromEntries(Object.entries(deployment).map(([k, v]) => [k, v.value]));

  // ---------------------------------------------------------------- build what gets uploaded
  step('Preparing the games and the API');
  const site = join(build, 'site');
  const files = stageSite(ROOT, site);
  writeSiteConfig(site, files);
  const api = join(build, 'api');
  for (const f of ['host.json', 'package.json', 'package-lock.json', 'src']) cpSync(join(AZURE_DIR, 'api', f), join(api, f), { recursive: true });
  for (const f of ['scores-core.js', 'scores-api.js', 'blocked-words.txt']) cpSync(join(ROOT, 'server', f), join(api, 'src', 'lib', f));
  npm(['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', api], { quiet: true });

  // ---------------------------------------------------------------- upload
  step('Uploading to the Static Web App');
  const token = az(['staticwebapp', 'secrets', 'list', '--name', out.staticSiteName, '--resource-group', cfg.group, '--query', 'properties.apiKey'], { json: true });
  npx(['--yes', SWA_CLI, 'deploy', site, '--api-location', api, '--api-language', 'node', '--api-version', '22', '--env', 'production', '--no-use-keychain'],
    { env: { SWA_CLI_DEPLOYMENT_TOKEN: token, SWA_CLI_APP_NAME: out.staticSiteName } });

  console.log(`
✅ The arcade is live at:  ${out.siteUrl}/
   (the very first deploy can take a minute or two before the address answers)

   Resource group:   ${cfg.group}
   Score files:      storage account ${out.storageAccountName}, container "scores"
   Admin token:      in ${relative(ROOT, SETTINGS_PATH)}  (for wiping scores: see azure/README.md)
   Update later:     npm run azure:deploy
   Save the scores:  npm run azure:export
   Remove it all:    npm run azure:remove
`);
} catch (err) {
  console.error(`\n✖ ${err.message}`);
  process.exit(1);
}
