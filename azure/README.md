# Hosting the Ecosystem Arcade on Azure

This folder deploys the arcade to an Azure subscription: the five games, plus a shared leaderboard that every kiosk, laptop and phone sees. One command creates or updates everything, and another removes it. There are no servers to look after.

- [What gets created](#what-gets-created)
- [How it's secured](#how-its-secured)
- [One-time setup](#one-time-setup)
- [Deploy](#deploy)
- [Check it works](#check-it-works)
- [Everyday tasks](#everyday-tasks)
- [Company hosting checklist](#company-hosting-checklist)
- [Remove everything](#remove-everything)
- [Troubleshooting](#troubleshooting)
- [How it works](#how-it-works)

## What gets created

```
Players ─► Static Web App ─┬─ /*      ─► the games (Azure's global network, HTTPS)
                           └─ /api/*  ─► Azure Functions ─► Storage Account
                                                            └─ scores/<game>.json
```

Everything lives in **one resource group** (default `rg-ecosystem-arcade`):

| Resource | Name | Settings | Cost |
|---|---|---|---|
| Static Web App | `swa-<app name>` | **Free** plan (or Standard, see [checklist](#company-hosting-checklist)); hosts the games and the scores API | Free plan: $0. Standard: about $9/month. |
| Storage Account | `st<app name><random>` | Standard, LRS, private | Cents a month |
| ↳ container `scores` | | One JSON file per game (`master-the-map.json`, `route-rush.json`, …), created on the first save | (included) |

Nothing else is created: no database, no virtual machines, no always-on servers.

**Cost at event scale is cents a month.** The only thing that grows with use is file reads: each leaderboard refresh reads the score files. The API caches them for a few seconds, so even hundreds of screens open for hours add only cents.

## How it's secured
- **The API never has the storage account key.** It gets a **limited pass** (a service SAS) that only allows *read, create and write* inside the `scores` container, over HTTPS only, and that **expires** after 180 days (set with `--access-days`). Every deploy issues a fresh one. It can't list or delete anything, or touch anything else in the account.
- **Storage:** anonymous public access is off; HTTPS and TLS 1.2+ only; the portal uses your Azure sign-in rather than the account key.
- **Nothing is lost by accident:**
  - **Versioning** keeps every earlier version of each score file for 30 days.
  - **Soft delete** lets deleted files be undeleted for 7 days.
- **Saves can't damage the files:**
  - Each write checks the file hasn't changed since it was read (ETag), and retries if it has, so two saves never overwrite each other.
  - The same score sent twice is stored once.
  - A file that can't be read is **never overwritten**; the save fails instead.
- **Strict security headers on every page:**
  - a Content Security Policy that allows only the site's own files, plus the one inline script, by its fingerprint
  - no framing by other sites, HSTS, `nosniff`, and a strict referrer policy
- **Only game files are published,** never `server/`, `azure/`, `test/`, scripts, docs or hidden files.
- **Only the arcade's own pages can send scores.** Pages on other websites are refused, so a stranger's site can't make its visitors post scores. Uploads must be JSON. Add a custom domain with `--allow-origin`, or kiosks that open local files with `--allow-local-kiosks`.
- **API rules** (shared with the local server, in `server/scores-core.js`):
  - **impossible scores are refused:** each game's limit is set just above the highest score it can actually produce, and `npm test` recomputes that from the game settings
  - **names** are letters (any language), spaces, hyphens and apostrophes only, up to 20 characters; no digits, emojis or symbols
  - a **blocked-words list** (`server/blocked-words.txt`), which also covers the rank and token text shown next to names
  - at most 25 scores per upload, and each score file holds at most 20,000 scores, so a spam flood can't keep growing it (wipe the spam to continue; the games keep unsaved scores and retry)
  - 5 wrong admin passwords pause that address for 15 minutes
  - at most 300 uploads a minute per address (`POSTS_PER_MINUTE` in `server/scores-core.js`). Offices usually share one public address, so this is sized for about 1,000 people on one network finishing within a few minutes.
  - every admin action (wipe, remove one entry, hide or show a leaderboard) needs the admin password, and can only touch **scores**, never the games or the website
- **Secrets stay out of git:** the admin password lives in `azure/.deploy.local.json` (git-ignored, value `adminToken`) and in the Static Web App's encrypted app settings (`ADMIN_TOKEN`).

## One-time setup

1. **Install the tools:**
   - **Node.js 22.13+**, from https://nodejs.org (LTS). Check with `node --version`.
   - **Azure CLI**, with `winget install Microsoft.AzureCLI` on Windows, or from https://aka.ms/installazurecli. Then **open a new terminal**.
2. **Sign in:** `az login`. Pick the subscription you'll deploy to, and check it with `az account show`.
3. **Permissions:** you need **Contributor** (or Owner) on the subscription or on the resource group. The first deploy in a new subscription also *registers* two services (`Microsoft.Web`, `Microsoft.Storage`), which needs permission at subscription level. Ask an admin to run this once if you can't:
   ```
   az provider register --namespace Microsoft.Web
   az provider register --namespace Microsoft.Storage
   ```
4. **Pick a region.** Static Web Apps is offered in `centralus`, `eastus2`, `westus2`, `westeurope` and `eastasia`. The games are served worldwide whichever you pick; the region only affects where the scores API runs. The storage can go elsewhere with `--storage-location` (e.g. `centralindia`).

## Deploy

From the project folder:

```
npm run azure:preview     # shows what would be created or changed — changes nothing
npm run azure:deploy      # creates / updates everything and publishes the games (2–4 minutes)
```

Common options (put them after `--`, e.g. `npm run azure:deploy -- --location westeurope --tag owner=jane`):

| Option | Default | |
|---|---|---|
| `--subscription <id or name>` | the current one | |
| `--resource-group <name>` | `rg-ecosystem-arcade` | |
| `--location <region>` | `eastasia` | Static Web App region |
| `--storage-location <region>` | same as `--location` | where the score files are stored |
| `--name <app name>` | `ecosystem-arcade` | used in resource names |
| `--sku Free\|Standard` | `Free` | |
| `--tag key=value` | `app=ecosystem-arcade` | repeatable, e.g. owner, costCenter, event, deleteAfter |
| `--access-days <n>` | `180` | lifetime of the API's pass to the score files |
| `--admin-password <password>` | generated | password for the admin page; 8+ characters; run again to change it |
| `--lock` | off | adds a *do not delete* lock to the resource group (needs Owner); see the checklist |
| `--allow-origin <url,url>` | none | other sites allowed to send scores, e.g. a custom domain `https://arcade.company.com` |
| `--allow-local-kiosks` | off | also accept scores from kiosks that open the games as local files (with `scoresApi` in `shared/config.js` pointing at this arcade) |

At the end it prints the address, e.g. `https://<random-words>.azurestaticapps.net/`. The first run creates `azure/.deploy.local.json` with the **admin password** (`adminToken`), unless you set one with `--admin-password`. Keep that file; it's git-ignored. **Run the deploy again at least every 180 days** (or whatever `--access-days` you set) to renew the API's pass to the score files.

## Check it works
1. Open the address. The home screen loads.
2. Open `<address>/api/health`. It should show `{"ok":true}`.
3. Play a round, tap **Save**, and confirm your name. On another device, the name appears under **Today's Champions** within about 20 seconds.

## Everyday tasks

| Task | How |
|---|---|
| Publish changes to the games | `npm run azure:deploy` |
| **Save all scores to this computer** | `npm run azure:export` saves `azure-scores-backup/<date-time>/` with each game's JSON file and **`scores.csv`** (opens in Excel). This folder is git-ignored, because it contains names. |
| Look at the score files | Azure portal → the storage account → **Storage browser → Blob containers → scores** → download a file |
| **Undo a bad change** to a score file | Same place → the file → **Versions** → pick an earlier version → **Make current version** |
| **Manage scores (staff)** | Open **`<address>/admin/`** and enter the admin password: hide or show leaderboards, remove one entry, wipe a game or all games, download CSVs. No Azure login needed. Details: [README, "For event staff"](../README.md#for-event-staff-the-admin-page). |
| Wipe test scores from the command line | `curl -X DELETE "<address>/api/scores?game=route-rush" -H "X-Admin-Token: <adminToken>"`. Leave out `?game=` for all games. The `adminToken` is in `azure/.deploy.local.json`. Use the `X-Admin-Token` header: Static Web Apps doesn't pass `Authorization` headers to the API. Game ids: `master-the-map`, `route-rush`, `health-journey`, `evernorth-city`, `case-files`. In PowerShell, use `curl.exe` instead of `curl`. |
| Change the admin password | `npm run azure:deploy -- --admin-password <new password>` |
| See API errors | Azure portal → the Static Web App → **APIs** / **Log stream**, or add Application Insights (see checklist) |

## Company hosting checklist

Hand this to IT and security before hosting in a company subscription.

**Approvals and ownership**
- [ ] The app is registered and reviewed by IT and security, per company process.
- [ ] Comms and Compliance have reviewed the game content (it describes The Cigna Group's businesses).
- [ ] A **company subscription and resource group**, never a personal account.
- [ ] **Tags** for ownership, for example `--tag owner=… --tag costCenter=… --tag event=… --tag deleteAfter=YYYY-MM-DD`.
- [ ] A **budget alert** on the resource group: Cost Management → Budgets.

**Data (first names and scores)**
- [ ] Players are told what's stored: a line on the sign-in screen such as *"Your first name and score appear on the leaderboard."* **Play as guest** is always available.
- [ ] First names only; never surnames, emails or employee IDs.
- [ ] A **retention period**, e.g. 30 days after the event. Then `npm run azure:export` (if needed) and wipe or remove.
- [ ] **Data location:** choose `--storage-location` to meet residency rules (e.g. `centralindia`).

**Who can reach it**
- [ ] **Public link** (default): anyone with the address can play and post scores. Validation and rate limits help, but a public leaderboard can't be fully protected from fake scores.
- [ ] **Company sign-in only:** use `--sku Standard`, then set up Static Web Apps custom authentication with your Microsoft Entra ID tenant (an app registration) and a route rule requiring sign-in. *(Not automated here; IT usually owns the app registration.)*
- [ ] **Company network only:** Standard plan plus a private endpoint (IT network team).
- [ ] Kiosk networks allow-list the arcade's address (and the custom domain, if one is used).

**Secrets and access**
- [ ] Deploy through a **pipeline** (GitHub Actions or Azure DevOps) with a service principal or federated identity that has **Contributor on the resource group only**, rather than from a personal laptop.
- [ ] The admin password is strong (not a demo password), shared only with event staff through the password manager, and changed after testing.
- [ ] Add the delete lock: `npm run azure:deploy -- --lock`. Nobody, not even subscription owners, can then delete the arcade or its scores by mistake; `npm run azure:remove` refuses until an Owner removes the lock.
- [ ] If policy forbids SAS tokens: switch to Standard + a linked Azure Functions app with a **managed identity** and the *Storage Blob Data Contributor* role on the container, then disable shared-key access on the storage account. *(A further step, not automated here.)*

**Running it**
- [ ] **Monitoring:** add Application Insights if the company requires it.
- [ ] **Custom domain** (optional), e.g. `arcade.company.com`: Static Web App → Custom domains (HTTPS certificates are free).
- [ ] Redeploy at least every 180 days (`--access-days`) to renew the storage pass.

## Remove everything
```
npm run azure:remove
```
It lists what's in the resource group, asks you to type the group's name to confirm, **saves all scores to `azure-scores-backup/` first**, then deletes the resource group and everything in it. After that, nothing for the arcade is left in the subscription. Options: `--yes` (no question), `--no-export`.

## Troubleshooting

| Message | What it means | Fix |
|---|---|---|
| `az` is not recognized | The terminal was opened before the Azure CLI was installed | Open a new terminal, or VS Code |
| `Not signed in to Azure` | No `az login` yet, or it expired | `az login` |
| `AuthorizationFailed` … `register` | No permission to register the services | An admin runs the two `az provider register` commands in [setup](#one-time-setup) |
| `RequestDisallowedByPolicy` | A company Azure Policy blocks a region, a service or a setting | Ask IT which regions and settings are allowed; deploy with matching `--location` / `--tag` |
| `LocationNotAvailableForResourceType` | Static Web Apps isn't offered in that region | Use one of the five regions above |
| Scores stop saving after months | The API's storage pass expired | `npm run azure:deploy` |
| The site loads but scores don't appear elsewhere | A score only saves after **Save → OK**; or the page was opened as a local file | Play through to Save. Open the hosted address. |

## How it works
- **`main.bicep`:** every Azure resource (Azure's equivalent of a CloudFormation template), including the storage pass and the app settings.
- **`api/`:** the Azure Function. `src/functions/scores.js` sends every `/api/*` request to the **shared API** (`server/scores-api.js` + `server/scores-core.js`, copied in at deploy), so Azure and the local server answer identically. `src/score-files.js` keeps one JSON file per game, with version-checked writes and retries.
- **`staticwebapp.config.template.json`:** the security headers. The deploy fills in the inline-script fingerprints and publishes the result as the site's `staticwebapp.config.json`.
- **`deploy.mjs`, `export.mjs`, `remove.mjs`:** plain Node scripts that drive the Azure CLI. `site-files.mjs` picks the files to publish.
- **Tests:** `npm test` runs the API contract against the Azure handler and stress-tests the score files (saves at the same moment, retries, duplicates, unreadable files), all with an in-memory stand-in for Blob Storage.
