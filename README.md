# The Ecosystem Arcade

Five touchscreen games that teach employees how the businesses of The Cigna Group fit together, plus a home screen and a shared "Evernorth Passport" that rewards playing all five.

Everything runs locally in a web browser. There is nothing to install, no server, and no internet connection needed. To share leaderboards across many kiosks or online players, see [Shared leaderboards](#shared-leaderboards).

## Quick start

| | Windows | Mac |
|---|---|---|
| Booth (fullscreen kiosk) | Double-click `start-kiosk.bat` | Double-click `start-kiosk.command` (see first-time note below) |
| Just try it | Open `index.html` in Edge or Chrome | Open `index.html` in Chrome or Edge |
| Fullscreen without the launcher | Tap the ⛶ icon in the bottom-right corner, or press `F` | Same |
| Exit kiosk mode | `Alt+F4` | `Cmd+Q` |

**Mac, first time only:** macOS needs permission to run the launcher. Open Terminal in this folder and run `chmod +x start-kiosk.command`. If macOS then blocks it as "from an unidentified developer", right-click the file → **Open** → **Open**.

**Use Chrome or Edge.** Safari also displays the games, but it keeps local-file storage separately per page. That means passports and leaderboards don't carry across games in Safari.

Each game folder also has its own `start-kiosk.bat` if you want one game on a dedicated screen.

The launchers open the games as local files, so each kiosk keeps its own scores. To share one leaderboard across kiosks, see [Shared leaderboards](#shared-leaderboards).

## The games

| Game | Folder | Players | Time | What it teaches |
|---|---|---|---|---|
| 🗺️ Master the Map | `master-the-map/` | 1 | ~3 min | What each business does: one question per business, light up the map |
| 🚦 Route Rush | `route-rush/` | 1, or 2 in Duel | ~2–3 min | Which business handles which request: fast arcade routing |
| 🎲 The Health Journey | `health-journey/` | 1–4 | ~5–8 min | A patient's path: board game with dice, challenges and event cards |
| 🏙️ Evernorth City | `evernorth-city/` | 1 | ~4 min | Why each business matters: build a city, survive news events |
| 🕵️ Case Files | `case-files/` | 1 | ~3–4 min | How businesses connect end to end: solve cases with red string |

The home screen (`home.html`, opened through `index.html`) shows all five games, today's champions and the Ecosystem Experts wall. **Today's Champions** shows one game's top 3 at a time and moves to the next game every 6 seconds. Tap a game icon in that panel to jump to it. Each player appears once per game, with their best score of the day.

## Playing on phones

The arcade is built for a landscape kiosk, but it also works on phones (for example from the hosted link). Phone-only adjustments apply below 640px wide, or under 500px tall in landscape. Kiosk, laptop and desktop screens never match, so they look exactly the same as before.

- **Home screen:** a normal scrolling page with each game as a full-width row (picture, description, time, today's champion and ▶ PLAY).
- **The 🏠 button** in games shrinks to a small icon in the corner, so it doesn't cover scores or timers.
- **The Health Journey and Case Files** need a wide screen. On a phone held upright, they show *"Turn your phone sideways"* until it's rotated.
- **Master the Map, Route Rush and Evernorth City** play in either orientation.

To preview on a laptop: open the arcade in Chrome or Edge, press `F12`, then `Ctrl+Shift+M`, pick a phone, and reload.

## Evernorth Passport

1. A player taps a game on the home screen and types their first name, or chooses **Play as guest**.
2. Finishing any game stamps their passport for that game.
3. Collecting all 5 stamps makes them an **Ecosystem Expert** on the home-screen wall. This works well for a daily prize.
4. **I'm done — next player** signs them out. The home screen also signs them out after 90 seconds of inactivity.

Passports reset each day. Two people with the same first name share a passport, so suggest adding an initial (e.g. "AlexK").

**Getting on the leaderboard is a separate step.** When a game ends with a score good enough for today's top 10, the player taps **Save** and confirms their name. Signing in on the home screen fills the name in, but the score is only recorded after that tap. Route Rush Duel scores are never saved.

## Staff controls

Inside a game, the 🏠 button in the top-right corner must be **held** for about a second to return to the home screen. This prevents accidental exits. If a round is in progress, or a finished score hasn't been saved yet, the player is warned first that the score will be lost and can choose **Keep playing** or **Leave anyway**. Games also return home on their own after 3 idle minutes, without asking.

With a keyboard attached:

| Key | Action |
|---|---|
| `Esc` | Back to that game's start screen |
| `Shift+Esc` | Back to the Arcade home screen |
| `F` | Enter or leave fullscreen (`Esc` also leaves) |
| `M` | Mute or unmute sound |
| `Ctrl+Shift+X` twice | Clear that game's leaderboard (with shared leaderboards: on this device only) |
| `T` (Route Rush only) | Multi-touch test: check before using Duel mode |

## Editing content

All text content lives in plain JavaScript files you can edit in any text editor. Keep the existing format: quotes, commas and brackets. Reload the page after saving.

| What | File |
|---|---|
| Business names, colors, icons + the 60 quiz questions | `questions.js` inside each game folder (Master the Map, Health Journey, Evernorth City and Case Files each have their own copy) |
| Route Rush requests, levels, rush events | `route-rush/content.js` |
| Board layout, event cards, round limits | `health-journey/content.js` |
| City layout, news events, timings | `evernorth-city/content.js` |
| Detective cases | `case-files/content.js` |
| Timers, scoring, leaderboard size | the `CONFIG` block at the top of each `content.js` or `questions.js` |

If you change a question or a business color, update every copy of `questions.js` you want it to apply to.

**Content review:** all facts came from the businesses' public websites in October 2026. Please have Comms/Compliance review the content files before the event.

## Leaderboards and data

- Out of the box, scores and passports are saved in the kiosk browser's local storage. They survive restarts and stay on that machine.
- To share leaderboards across every kiosk and browser, run the included scores server (see **Shared leaderboards** below).
- Leaderboards show **today's** scores by default. Set `leaderboardScope: 'all'` in a game's config to keep one board for the whole event.
- **Don't run the booth in a private or incognito window.** Everything is wiped when it closes.
- Keep the whole folder together. The games load shared files from `shared/`.

## Shared leaderboards

`server/server.js` is a small web server that hosts the games **and** keeps every score (name, score, game, date) in a SQLite database, so all players see the same boards. It needs [Node.js](https://nodejs.org) 22.13 or newer and nothing else: no `npm install`.

**Try it on your computer:**

1. Open a terminal in this folder and run `npm start`.
2. Open http://localhost:3000 in two different browsers. A score saved in one shows up in the other within about 20 seconds.

**How the games find the server** is set in `shared/config.js` (`scoresApi`):

| Setting | Use it when |
|---|---|
| `'auto'` (default) | The games are opened from the Node server. Scores go to the same address's `/api`. Opened as local files, the games keep scores on the device as before. |
| `'https://your-server/api'` | The games run somewhere else, such as kiosks opening local files or a separate static host, and the scores server lives at that address. |
| `''` | Never share scores. |

Games always save to the device first, so a kiosk that loses its network keeps working and sends its scores once it's back online. The first time a kiosk reaches the server, it also uploads the scores it already had.

**Kiosks with the server:** point the kiosk browser at the server instead of the local files. For example, change the address in `start-kiosk.bat` from `file:///%~dp0index.html` to `http://your-server:3000/`. Or keep the local files and set `scoresApi` to the server's `/api` address.

**Hosting it:** the server needs **one** long-running Node.js process and a disk that keeps its files across restarts, because the database is a single file (`server/data/scores.db`, or `DB_PATH`). Run `npm start` (or `node server/server.js`) and set the settings below as environment variables.

| Host | Works as is? |
|---|---|
| A virtual machine or company server: AWS EC2 or Lightsail, Azure VM, Google Compute Engine | ✅ Yes, the best fit |
| Platforms with a persistent volume (e.g. Fly.io, Render or Railway with a disk) | ✅ Yes |
| Azure App Service | ⚠️ Risky: its storage is a network share, and SQLite isn't safe on network drives |
| Hosts with no permanent disk (containers without a volume, AWS App Runner/Elastic Beanstalk, Render free tier) | ❌ Scores are wiped on every restart or redeploy |
| Serverless (AWS Lambda, Azure Functions, Vercel, Netlify) | ❌ Doesn't run there |
| Several copies of the server behind a load balancer | ❌ Each copy would have its own leaderboard |

For the ❌ and ⚠️ cases, the database part of `server/server.js` must move to a managed database such as PostgreSQL (AWS RDS, Azure Database for PostgreSQL). The games and the API don't change.

On a VM, also put HTTPS in front (Caddy, nginx or the cloud's load balancer, with `TRUST_PROXY=1`) and run the server with a process manager such as `pm2` or a system service, so it restarts after a crash or reboot.

If the host only serves static files and can't run Node, host the games there and run the scores server elsewhere, then point `scoresApi` at it.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `DB_PATH` | `server/data/scores.db` | Where the database file lives |
| `ADMIN_TOKEN` | not set | Password for wiping the shared boards (below). Not set = wiping is switched off. |
| `ALLOWED_ORIGIN` | `*` | Sites allowed to send scores from a browser, comma separated. Kiosks opening local files send `null`. |
| `SERVE_STATIC` | `1` | `0` = API only, when the games are hosted somewhere else |
| `TRUST_PROXY` | `0` | `1` when the server sits behind a proxy or load balancer, so rate limits see each real client |

**Protection built in:** names are trimmed to 20 characters, scores above each game's maximum (set in `GAMES` at the top of `server/server.js`) are refused, each address can upload at most 60 times a minute, and names containing a word listed in `server/blocked-words.txt` are refused. Add your own words to that file. Players can still fake a score from the browser's developer tools, so don't attach valuable prizes to the board without checking the top entries.

**Clearing scores:** `Ctrl+Shift+X` twice in a game only clears that kiosk's view of the board. To wipe the shared board, start the server with an `ADMIN_TOKEN` and run:

```
curl -X DELETE "https://your-server/api/scores?game=route-rush" -H "Authorization: Bearer YOUR_TOKEN"
```

Leave out `?game=…` to wipe every game. Game ids: `master-the-map`, `route-rush`, `health-journey`, `evernorth-city`, `case-files`.

**Who scored the most:** open http://localhost:3000/api/scores?limit=50 for the current top 50 per game. The database is a normal SQLite file, so any SQLite tool (for example [DB Browser for SQLite](https://sqlitebrowser.org/)) can open it. For example:

```sql
SELECT game, name, MAX(score) AS best FROM scores GROUP BY game, name ORDER BY game, best DESC;
```

**Backups:** don't copy `scores.db` on its own while the server is running. Recent scores may still be in `scores.db-wal`, and the copy can come out incomplete. Either stop the server and copy all the `scores.db*` files, use the `sqlite3` tool (`sqlite3 server/data/scores.db ".backup backup.db"`), or turn on your cloud's disk snapshots.

**Checking the server:** http://localhost:3000/api/health answers `{"ok":true}` when the server is up.

## Hosting on AWS

**Step-by-step guide: [aws/README.md](aws/README.md)**. It covers the one-time setup, deploying, everyday tasks, the pre-event checklist and troubleshooting. Summary:

`aws/` deploys the arcade as a serverless setup. There are no servers to manage, it scales on its own, and it typically costs cents to a few dollars a month at event traffic:

```
Players ─► CloudFront ─┬─ /*      ─► S3 bucket (the games)
                       └─ /api/*  ─► API Gateway ─► Lambda ─► DynamoDB (scores)
```

The games and `/api` share one address, so `scoresApi: 'auto'` works without changes. CloudFront keeps the score lists for 5 seconds, so hundreds of open screens cost about one database lookup every few seconds. The Lambda API follows the same rules as the local server, because both use `server/scores-core.js`, and `npm test` checks both.

**One-time setup:** install the AWS CLI v2, create an IAM user with an access key, then run `aws configure --profile arcade`. Your organization may limit which regions you can use. This account allows only `ap-southeast-2` (Sydney).

| Command | What it does |
|---|---|
| `npm run aws:deploy` | Creates or updates everything, uploads the games, prints the live address. The first run takes 5–10 minutes. |
| `npm run aws:deploy -- --no-cloudfront` | Deploys without CloudFront or S3: Lambda also serves the games, at the API Gateway address. Use it while the account isn't verified for CloudFront. |
| `npm run aws:deploy -- --cloudfront` | Switches to the full CloudFront setup. The address changes to a `cloudfront.net` one, and the scores are kept. |
| `npm run aws:deploy -- --site-only` | Uploads changed game files only (seconds, CloudFront setup only; without CloudFront every update is a full deploy of about 1 minute) |
| `npm run aws:remove` | Removes everything except the scores table, and prints the command to delete that too |

The deploy remembers whether you chose CloudFront, so a plain `npm run aws:deploy` keeps the same setup.

Add `-- --profile name` or `-- --region code` to use a different AWS profile or region.

- **Secrets:** the first deploy creates `aws/.deploy.local.json` with the admin token for wiping scores. It isn't committed, so keep it safe. Wiping works the same as above, using the live address: `curl -X DELETE "https://xxxx.cloudfront.net/api/scores?game=route-rush" -H "Authorization: Bearer <adminToken>"`.
- **Scores:** they live in a DynamoDB table with point-in-time recovery, so it can be restored to any second in the last 35 days. Removing the stack keeps the table.
- **New AWS accounts:** CloudFront may refuse with *"Your account must be verified before you can add new CloudFront resources"*. Open a case in AWS Support (Account and billing, which is free), include that message, and deploy with `--no-cloudfront` until AWS confirms. A failed first deploy is cleaned up automatically on the next run.
- **Without CloudFront** there's no worldwide caching: every page load and score refresh reaches Lambda. That's fine for an event, since files are kept in memory and compressed, and browsers only re-download changed files. New accounts can run only 10 copies of the function at once, though. Before a busy event, ask for more in **Service Quotas → AWS Lambda → Concurrent executions** (for example 1,000; it's free).

## Troubleshooting

| Problem | Fix |
|---|---|
| No sound | Browsers only allow sound after the first tap, so tap the screen once. Check `M` hasn't muted it. |
| Passport or leaderboards don't carry between games | Use Chrome or Edge (not Safari), and don't use a private window. |
| Duel mode taps get missed | The screen may not be multi-touch. Press `T` in Route Rush to test. |
| Layout looks cramped | The games are designed for a landscape 1080p screen. Make sure the browser is fullscreen (use the kiosk launcher). |
| Mac launcher won't open | Run `chmod +x start-kiosk.command`, then right-click → Open. |
| A score isn't on the leaderboard | The player must tap **Save** at the end of the game and confirm their name. Typing a name on the home screen only signs them in. |
| Scores don't appear on other kiosks | The games must be opened from the server (`http://…`), not as local files (`file:///…`), unless `scoresApi` points at the server. Check the server is up at `/api/health`. |
| `npm start` says it needs a newer Node.js | Install Node.js 22.13 or newer (the LTS version from https://nodejs.org), then open a new terminal. |

## Folder structure

```
ecosystem-arcade/
├── index.html               Start here: frame that keeps fullscreen on across games
├── home.html                Arcade home screen (loads inside index.html)
├── start-kiosk.bat          Windows launcher
├── start-kiosk.command      Mac launcher
├── package.json             `npm start`, `npm test`, `npm run aws:deploy` / `aws:remove`
├── server/                  server.js (scores API + web server), scores-core.js (score rules
│                            shared with AWS), blocked-words.txt
├── aws/                     template.yaml (AWS resources), lambda/handler.js, deploy + remove scripts,
│                            site-files.mjs (which files are published)
├── test/                    API tests for the local server and the AWS version
├── shared/                  config.js (scores server address), leaderboard.js,
│                            passport.js, launcher.js, launcher.css, fullscreen.js
├── master-the-map/
├── route-rush/
├── health-journey/
├── evernorth-city/
└── case-files/
```

Each game folder contains `index.html`, `styles.css`, `game.js` and its content file(s).

## Before the event

- [ ] Run the launcher on the actual booth monitor and play one round of every game by touch.
- [ ] If using Route Rush Duel, press `T` and confirm multi-touch works.
- [ ] Check the sound volume at the booth.
- [ ] Get the content reviewed, and swap in official brand colors if you have them.
- [ ] Clear any test scores (`Ctrl+Shift+X` twice in each game, or wipe the shared board on the server).

If you use shared leaderboards:

- [ ] Confirm the host keeps files across restarts (see the hosting table above).
- [ ] Set an `ADMIN_TOKEN` so you can wipe test scores, and keep it private.
- [ ] Lower each game's `maxScore` in `server/server.js` to just above a real top score.
- [ ] Add words to `server/blocked-words.txt`.
- [ ] Point every kiosk at the server, save a test score on one and check it appears on another.
- [ ] Set up backups of the database.
