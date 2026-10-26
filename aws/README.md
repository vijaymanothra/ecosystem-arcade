# Hosting the Ecosystem Arcade on AWS

This folder deploys the arcade to an AWS account: the five games, plus a shared leaderboard that every kiosk, laptop and phone sees. Everything is created by one command and removed by another, and there are no servers to look after.

- [What gets created](#what-gets-created)
- [One-time setup](#one-time-setup)
- [Deploy](#deploy)
- [Check it works](#check-it-works)
- [Everyday tasks](#everyday-tasks)
- [Before the event](#before-the-event)
- [Remove everything](#remove-everything)
- [Troubleshooting](#troubleshooting)
- [How it works](#how-it-works)

## What gets created

There are two setups. Both use the same code, and you can switch between them at any time; the scores are kept.

**Full setup (recommended):**

```
Players ─► CloudFront ─┬─ /*      ─► S3 bucket (the games)
                       └─ /api/*  ─► API Gateway ─► Lambda ─► DynamoDB (scores)
```

**Without CloudFront** (for new AWS accounts that AWS hasn't yet approved for CloudFront):

```
Players ─► API Gateway ─► Lambda ─┬─ the games (bundled with the function)
                                  └─ /api/* ─► DynamoDB (scores)
```

| Resource | What it's for | Full | Without CloudFront |
|---|---|:-:|:-:|
| DynamoDB table | The scores. Point-in-time recovery lets you restore it to any second in the last 35 days. | ✅ | ✅ |
| Lambda function (Node.js 22) | The scores API, which uses the same rules as the local server | ✅ | ✅ (also serves the games) |
| API Gateway (HTTP API) | The API's address, capped at 100 requests/second | ✅ | ✅ (this becomes the arcade's address) |
| IAM role, CloudWatch log group (14 days) | The function's permissions and logs | ✅ | ✅ |
| S3 bucket (private) | The game files | ✅ | — |
| CloudFront distribution and small helpers | HTTPS from servers worldwide; caches the score lists for 5 seconds | ✅ | — |
| S3 bucket `arcade-deploy-<account>-<region>` (private) | Holds the packaged code during deploys | ✅ | ✅ |

**Cost:** everything is pay-per-use, typically cents to a few dollars a month at event traffic. Nothing costs much while idle.

## One-time setup

### 1. Install the tools
- **Node.js 22.13 or newer**, from https://nodejs.org (LTS). Check with `node --version`.
- **AWS CLI v2**, from https://aws.amazon.com/cli/, or on Windows `winget install Amazon.AWSCLI`. Check with `aws --version`.

Nothing else is needed: no `npm install`, SAM or CDK.

### 2. Create a login for deploying
Don't use the account's root user. In the AWS Console:

1. **IAM → Users → Create user**, for example `arcade-deployer`. It doesn't need console access.
2. **Permissions:** attach `AdministratorAccess`. The deploy creates resources in about eight services (CloudFormation, S3, CloudFront, Lambda, API Gateway, DynamoDB, IAM roles, CloudWatch Logs). In a shared company account, ask the admin for a role with those permissions instead.
3. Open the user → **Security credentials → Create access key → Command Line Interface (CLI)**. Copy both keys, and don't paste them anywhere else.

### 3. Save the login on your computer
```
aws configure --profile arcade
```
Enter the two keys, a **region** (see below), and `json` as the output format. Then check it works:
```
aws sts get-caller-identity --profile arcade
```
It should show your account number and `user/arcade-deployer`.

**Choosing a region:** pick the one closest to most players, for example `ap-south-1` (Mumbai), `ap-southeast-2` (Sydney) or `us-east-1` (N. Virginia). CloudFront serves the games worldwide whatever you pick; the region only affects the scores API.

> **Accounts inside an AWS Organization** may only be allowed certain regions. If commands fail with *"explicit deny in a service control policy"*, the region isn't allowed. Ask the account owner which regions are, or try them. One way to check a region is `aws lambda list-functions --profile arcade --region <region>`. Then set it with `aws configure set region <region> --profile arcade`.

### 4. Check whether CloudFront is enabled for the account
New AWS accounts often can't create CloudFront distributions until AWS verifies them. You find out on the first deploy (see [Troubleshooting](#troubleshooting)). If it's blocked:

1. Open a case in **AWS Support → Create case → Account and billing**. This is free on every plan. Ask them to *"verify the account for CloudFront"*, and include the error message and the account ID.
2. Meanwhile, deploy **without CloudFront** (next section). It's fully usable.

## Deploy

From the project folder:

| Situation | Command | Time |
|---|---|---|
| Full setup | `npm run aws:deploy` | 5–10 min the first time (mostly CloudFront), about 1 min after |
| Account not yet approved for CloudFront | `npm run aws:deploy -- --no-cloudfront` | 1–2 min |

At the end it prints the arcade's address:
```
✅ The arcade is live at:  https://xxxxxxxx.cloudfront.net/
```
or, without CloudFront, `https://xxxxxxxx.execute-api.<region>.amazonaws.com/`.

What the deploy does:
1. Reads your AWS login and region (profile `arcade`).
2. The first time, creates `aws/.deploy.local.json` with two random secrets: the **admin token** for wiping scores, and a secret CloudFront uses to talk to the API.
3. Packages the API (and, without CloudFront, the games), then creates or updates everything through CloudFormation, as a stack named `ecosystem-arcade`.
4. With CloudFront, uploads the games to S3 and refreshes CloudFront's cache.

It remembers whether you chose CloudFront, so later runs of `npm run aws:deploy` keep the same setup.

**Other options** (add them after `--`): `--profile <name>`, `--region <code>`, `--stack <name>` (to run a second copy, e.g. for testing).

> **Keep `aws/.deploy.local.json` safe.** It isn't committed to git, because it contains the admin token. If it's lost, the next deploy creates new secrets and everything keeps working, but you'd need the new admin token to wipe scores.

## Check it works
1. Open the printed address. The arcade home screen loads.
2. Open `<address>/api/health`. It should show `{"ok":true}`.
3. Play a round, tap **Save** at the end, and confirm your name. Open the address in a second browser or on your phone: within about 20 seconds your name appears in **Today's Champions**.

## Everyday tasks

| Task | How |
|---|---|
| Publish changes to the games | `npm run aws:deploy`. With CloudFront, `npm run aws:deploy -- --site-only` uploads just the game files, in seconds. |
| Switch to CloudFront once AWS approves it | `npm run aws:deploy -- --cloudfront`. **The address changes** to a `cloudfront.net` one; scores are kept. |
| See the top scores | Open `<address>/api/scores?limit=50`, or in the Console: **DynamoDB → Tables → ecosystem-arcade-ScoresTable-… → Explore items**. |
| Wipe test scores | `curl -X DELETE "<address>/api/scores?game=route-rush" -H "Authorization: Bearer <adminToken>"`. Leave out `?game=` to wipe every game. The `adminToken` is in `aws/.deploy.local.json`. Game ids: `master-the-map`, `route-rush`, `health-journey`, `evernorth-city`, `case-files`. |
| Restore scores after a mistake | **DynamoDB → the table → Backups → Restore to point in time**. This creates a new table with the scores as they were. |
| See errors | **CloudWatch → Log groups → /aws/lambda/ecosystem-arcade-ScoresFunction-…** |
| Point kiosks at the hosted arcade | Open the hosted address in the kiosk browser, or edit `start-kiosk.bat` to use it instead of the local file. |

## Before the event
- [ ] **Raise the Lambda limit.** New accounts can run only 10 copies of the function at once. That's fine with CloudFront, but tight without it, since then every page load reaches Lambda. Go to **Service Quotas → AWS Lambda → Concurrent executions** and request 1,000. It's free and usually approved quickly.
- [ ] **Set a budget alert:** **Billing → Budgets → Create budget** (e.g. $10/month), so any surprise cost emails you.
- [ ] **Check the account plan.** AWS *Free plan* accounts are closed when their credits or time run out, unless upgraded under **Billing → Upgrade plan**. Make sure the account outlives the event.
- [ ] **Wipe test scores** (see above).
- [ ] **Open the arcade on a phone and on a kiosk**, and save a score on one to check it appears on the other.
- [ ] **Optional:** lower each game's `maxScore` in `server/scores-core.js` to just above a realistic top score, and add words to `server/blocked-words.txt`. Then deploy again.

## Remove everything
```
npm run aws:remove
```
This deletes the website, CloudFront, the API and the function. CloudFront takes several minutes to switch off. **The scores table is kept** so nothing is lost by accident; the command prints how to delete it:
```
aws dynamodb delete-table --table-name <name> --profile arcade --region <region>
```
The small `arcade-deploy-…` bucket also stays. Delete it in the S3 console if you no longer need it.

## Troubleshooting

| Message | What it means | Fix |
|---|---|---|
| `InvalidClientTokenId` / `security token included in the request is invalid` | The access key is wrong, deleted, or the wrong profile is in use | Create a new access key and run `aws configure --profile arcade` again |
| `explicit deny in a service control policy` | The AWS Organization blocks that region or service | Use an allowed region (see [step 3](#3-save-the-login-on-your-computer)), or ask the organization's admin |
| `Your account must be verified before you can add new CloudFront resources` | A new account, not yet approved for CloudFront | Open a support case ([step 4](#4-check-whether-cloudfront-is-enabled-for-the-account)) and use `--no-cloudfront` until then. The deploy cleans up the failed attempt automatically next time. |
| `No region for profile "arcade"` | No region was set | `aws configure set region <region> --profile arcade` |
| The arcade loads but scores don't show on other devices | Scores only count after **Save** is tapped and the name confirmed. Or the page was opened as a local file. | Play through to **Save**. Open the hosted address, not `file:///…`. |
| `{"error":"use the arcade address"}` | Something called API Gateway directly while CloudFront is in front | Use the CloudFront address |
| Brief errors when many people open the arcade at once | The 10-copy Lambda limit was reached | Raise the limit ([Before the event](#before-the-event)) and, ideally, switch to CloudFront |

## How it works
- **`template.yaml`**: every AWS resource, as a CloudFormation/SAM template. The `UseCloudFront` parameter switches between the two setups.
- **`lambda/handler.js`**: the scores API (and, without CloudFront, the game files). The score rules (validation, limits, name filter) come from `server/scores-core.js`, shared with the local server, so both behave the same. `npm test` checks both.
- **`deploy.mjs` / `remove.mjs`**: plain Node scripts that call the AWS CLI.
- **`site-files.mjs`**: picks which files are published. Only the game files are published, never `server/`, `aws/`, tests or hidden files.
- **The games** save each score in the browser first and send it to `/api/scores`. Offline scores wait and upload when the network returns. Every screen refreshes the shared top scores every 20 seconds. On CloudFront, those lists are cached for 5 seconds, so a crowd of screens costs only a few database reads.
- **Protection:** scores are validated (known game, name of up to 20 characters, score within the game's maximum); uploads are limited per address; and API Gateway has an overall cap. With CloudFront, the API refuses requests that don't come through CloudFront.
