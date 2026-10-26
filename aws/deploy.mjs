// ============================================================
//  Deploys the arcade to AWS.
//
//    npm run aws:deploy                         deploy / update (uses the AWS profile "arcade")
//    npm run aws:deploy -- --no-cloudfront      without CloudFront: Lambda serves the games at the
//                                               API Gateway address (for accounts not yet verified
//                                               for CloudFront)
//    npm run aws:deploy -- --cloudfront         switch to the full CloudFront + S3 setup
//    npm run aws:deploy -- --site-only          just upload changed game files (CloudFront setup)
//    add  --profile name  --region code  --stack name  to change the defaults
//
//  The chosen mode is remembered, so a plain `npm run aws:deploy` keeps it.
//  Needs only the AWS CLI v2, signed in (aws configure --profile arcade).
//  Secrets live in aws/.deploy.local.json (git-ignored): keep that file.
// ============================================================
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageSite, CONTENT_TYPES } from './site-files.mjs';

const AWS_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(AWS_DIR);

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const PROFILE = opt('profile', process.env.AWS_PROFILE || 'arcade');
const STACK = opt('stack', 'ecosystem-arcade');
let REGION = opt('region', '');
if (!REGION) {
  try { REGION = execFileSync('aws', ['configure', 'get', 'region', '--profile', PROFILE], { encoding: 'utf8' }).trim(); } catch { /* none set */ }
}
if (!REGION) throw new Error(`No region for profile "${PROFILE}". Run: aws configure --profile ${PROFILE}`);

function aws(list, { json = false, quiet = false } = {}) {
  const out = execFileSync('aws', [...list, '--profile', PROFILE, '--region', REGION],
    { encoding: 'utf8', stdio: quiet || json ? ['ignore', 'pipe', 'pipe'] : 'inherit', maxBuffer: 64 * 1024 * 1024 });
  return json ? JSON.parse(out || 'null') : out;
}
const step = (msg) => console.log(`\n▸ ${msg}`);

// ---------------------------------------------------------------- who, where, and settings kept between deploys
const who = aws(['sts', 'get-caller-identity', '--output', 'json'], { json: true });
const SETTINGS_FILE = join(AWS_DIR, '.deploy.local.json');
const all = existsSync(SETTINGS_FILE) ? JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')) : {};
const key = `${who.Account}/${REGION}/${STACK}`;
const settings = all[key] || (all[key] = {
  adminToken: randomBytes(24).toString('base64url'),
  originSecret: randomBytes(24).toString('base64url'),
});
if (args.includes('--no-cloudfront')) settings.useCloudFront = false;
if (args.includes('--cloudfront')) settings.useCloudFront = true;
if (settings.useCloudFront === undefined) settings.useCloudFront = true;
writeFileSync(SETTINGS_FILE, JSON.stringify(all, null, 2));
const CLOUDFRONT = settings.useCloudFront;
// without CloudFront the games ship inside the Lambda package, so every update is a full deploy
const SITE_ONLY = args.includes('--site-only') && CLOUDFRONT;

console.log(`AWS account ${who.Account} · ${who.Arn} · region ${REGION} · stack ${STACK} · ${CLOUDFRONT ? 'with CloudFront' : 'without CloudFront'}`);

if (!SITE_ONLY) {
  // ---------------------------------------------------------------- package the API (and, without CloudFront, the games)
  step(CLOUDFRONT ? 'Packaging the scores API' : 'Packaging the scores API and the games');
  const build = join(AWS_DIR, '.build');
  rmSync(build, { recursive: true, force: true });
  mkdirSync(build, { recursive: true });
  cpSync(join(AWS_DIR, 'lambda', 'handler.js'), join(build, 'handler.js'));
  cpSync(join(ROOT, 'server', 'scores-core.js'), join(build, 'scores-core.js'));
  cpSync(join(ROOT, 'server', 'blocked-words.txt'), join(build, 'blocked-words.txt'));
  if (!CLOUDFRONT) stageSite(ROOT, join(build, 'site'));

  // a private bucket CloudFormation reads the packaged code from
  const artifacts = `arcade-deploy-${who.Account}-${REGION}`;
  try {
    aws(['s3api', 'head-bucket', '--bucket', artifacts], { quiet: true });
  } catch {
    step(`Creating deployment bucket ${artifacts}`);
    aws(['s3api', 'create-bucket', '--bucket', artifacts, ...(REGION === 'us-east-1' ? [] : ['--create-bucket-configuration', `LocationConstraint=${REGION}`])], { quiet: true });
    aws(['s3api', 'put-public-access-block', '--bucket', artifacts, '--public-access-block-configuration',
      'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'], { quiet: true });
  }
  const packaged = join(AWS_DIR, '.build-packaged.yaml');
  aws(['cloudformation', 'package', '--template-file', join(AWS_DIR, 'template.yaml'), '--s3-bucket', artifacts, '--s3-prefix', STACK, '--output-template-file', packaged], { quiet: true });

  // ---------------------------------------------------------------- create or update everything
  // a first deploy that failed leaves the stack in ROLLBACK_COMPLETE, which can't be updated: clear it first
  let status = null;
  try { status = aws(['cloudformation', 'describe-stacks', '--stack-name', STACK, '--output', 'json'], { json: true }).Stacks[0].StackStatus; } catch { /* new stack */ }
  if (status === 'ROLLBACK_COMPLETE') {
    step('Clearing a previous failed first deploy');
    aws(['cloudformation', 'delete-stack', '--stack-name', STACK], { quiet: true });
    aws(['cloudformation', 'wait', 'stack-delete-complete', '--stack-name', STACK], { quiet: true });
  }
  step(`Creating / updating AWS resources (${CLOUDFRONT ? 'the first run takes about 5–10 minutes, mostly CloudFront' : 'about 1–2 minutes'})`);
  try {
    aws(['cloudformation', 'deploy', '--stack-name', STACK, '--template-file', packaged,
      '--capabilities', 'CAPABILITY_IAM', 'CAPABILITY_AUTO_EXPAND', '--no-fail-on-empty-changeset',
      '--parameter-overrides', `AdminToken=${settings.adminToken}`, `OriginSecret=${settings.originSecret}`, `UseCloudFront=${CLOUDFRONT}`,
      '--tags', 'app=ecosystem-arcade']);
  } catch {
    // say why, in AWS's words
    try {
      const events = aws(['cloudformation', 'describe-stack-events', '--stack-name', STACK, '--max-items', '40', '--output', 'json'], { json: true }).StackEvents;
      const failed = events.filter((e) => /FAILED/.test(e.ResourceStatus) && e.ResourceStatusReason && !/cancelled/i.test(e.ResourceStatusReason));
      console.error('\n✖ Deploy failed:');
      for (const e of failed.slice(0, 5)) console.error(`  ${e.LogicalResourceId}: ${e.ResourceStatusReason}`);
      if (failed.some((e) => /must be verified/.test(e.ResourceStatusReason))) {
        console.error('\n  This AWS account isn\'t verified for CloudFront yet. Ask AWS Support to verify it, or deploy without CloudFront for now:\n    npm run aws:deploy -- --no-cloudfront');
      }
    } catch { /* no events */ }
    process.exit(1);
  }
}

const stack = aws(['cloudformation', 'describe-stacks', '--stack-name', STACK, '--output', 'json'], { json: true }).Stacks[0];
const out = Object.fromEntries((stack.Outputs || []).map((o) => [o.OutputKey, o.OutputValue]));

if (CLOUDFRONT) {
  // ---------------------------------------------------------------- upload the games to S3
  step('Uploading the games');
  const site = join(AWS_DIR, '.site');
  stageSite(ROOT, site);
  const bucket = `s3://${out.SiteBucketName}`;
  // browsers re-check files on every visit (cheap 304s from CloudFront); CloudFront keeps them until the next deploy
  const cache = 'public, max-age=0, s-maxage=31536000';
  const exts = [...new Set(readdirSync(site, { recursive: true }).map((f) => extname(String(f)).toLowerCase()).filter((e) => CONTENT_TYPES[e]))];
  for (const ext of exts) {
    // set each type explicitly: the AWS CLI's guess on Windows can label .js as text/plain, which browsers refuse to run
    aws(['s3', 'sync', site, bucket, '--exclude', '*', '--include', `*${ext}`, '--content-type', CONTENT_TYPES[ext], '--cache-control', cache, '--only-show-errors']);
  }
  aws(['s3', 'sync', site, bucket, '--delete', '--cache-control', cache, '--only-show-errors']); // removes files that no longer exist

  step('Refreshing CloudFront');
  aws(['cloudfront', 'create-invalidation', '--distribution-id', out.DistributionId, '--paths', '/*', '--output', 'json'], { json: true });
}

console.log(`
✅ The arcade is live at:  ${out.SiteUrl}/
${CLOUDFRONT ? '   (a brand-new CloudFront address can take a few more minutes before it answers everywhere)\n' : '   Running without CloudFront. Once AWS verifies the account: npm run aws:deploy -- --cloudfront\n   (the address changes to a cloudfront.net one; scores are kept)\n'}
   Scores table:     ${out.ScoresTableName}
   Admin token:      in ${relative(ROOT, SETTINGS_FILE)}  (for wiping scores: see README)
   Update later:     npm run aws:deploy${CLOUDFRONT ? '   ·   just the games: npm run aws:deploy -- --site-only' : ''}
   Remove it all:    npm run aws:remove
`);
