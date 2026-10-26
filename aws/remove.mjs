// ============================================================
//  Removes the arcade from AWS: the website, CloudFront, API and function.
//  The scores table is KEPT so no scores are lost by accident; the script prints
//  the command that deletes it if you really want it gone.
//
//    npm run aws:remove                       uses the AWS profile "arcade"
//    npm run aws:remove -- --profile other
// ============================================================
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const PROFILE = opt('profile', process.env.AWS_PROFILE || 'arcade');
const STACK = opt('stack', 'ecosystem-arcade');
let REGION = opt('region', '');
if (!REGION) REGION = execFileSync('aws', ['configure', 'get', 'region', '--profile', PROFILE], { encoding: 'utf8' }).trim();
const aws = (list, inherit) => execFileSync('aws', [...list, '--profile', PROFILE, '--region', REGION],
  { encoding: 'utf8', stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'] });

let stack;
try {
  stack = JSON.parse(aws(['cloudformation', 'describe-stacks', '--stack-name', STACK, '--output', 'json'])).Stacks[0];
} catch {
  console.log(`Nothing to remove: stack "${STACK}" doesn't exist in ${REGION}.`);
  process.exit(0);
}
const out = Object.fromEntries((stack.Outputs || []).map((o) => [o.OutputKey, o.OutputValue]));

if (out.SiteBucketName) {
  console.log(`▸ Emptying ${out.SiteBucketName}`);
  aws(['s3', 'rm', `s3://${out.SiteBucketName}`, '--recursive', '--only-show-errors'], true);
}
console.log('▸ Deleting the stack (CloudFront takes several minutes to switch off)…');
aws(['cloudformation', 'delete-stack', '--stack-name', STACK], true);
aws(['cloudformation', 'wait', 'stack-delete-complete', '--stack-name', STACK], true);

console.log(`
✅ Removed. The scores table was kept: ${out.ScoresTableName || '(unknown)'}
   To delete the scores too (cannot be undone):
     aws dynamodb delete-table --table-name ${out.ScoresTableName} --profile ${PROFILE} --region ${REGION}
`);
