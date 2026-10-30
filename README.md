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

The arcade is built for a landscape kiosk, but it also works on phones, for example when it's hosted online. Phone-only adjustments apply below 640px wide, or under 500px tall in landscape. Kiosk, laptop and desktop screens never match, so they look exactly the same as before.

- **Home screen:** a normal scrolling page with each game as a full-width row (picture, description, time, today's champion and ▶ PLAY).
- **The 🏠 button** in games shrinks to a small icon in the corner, so it doesn't cover scores or timers.
- **The Health Journey and Case Files** need a wide screen. On a phone held upright, they show *"Turn your phone sideways"* until it's rotated.
- **Master the Map, Route Rush and Evernorth City** play in either orientation.

To preview on a laptop: open the arcade in Chrome or Edge, press `F12`, then `Ctrl+Shift+M`, pick a phone, and reload.

## Evernorth Passport

1. A player taps a game on the home screen and types their first name. **A name is required to play.** There's no guest mode: if a game is opened without a name (e.g. from a direct link), the player is taken to the home screen's name prompt first, then straight into that game.
2. Finishing any game stamps their passport for that game.
3. Collecting all 5 stamps makes them an **Ecosystem Expert** on the home-screen wall. This works well for a daily prize.
4. **I'm done — next player** signs them out. The home screen also signs them out after 90 seconds of inactivity.

Passports reset each day. Two people with the same first name share a passport, so suggest adding an initial (e.g. "AlexK").

**Getting on the leaderboard is a separate step.** When a game ends with a score good enough for today's top 10, the player taps **Save** and confirms their name. Signing in on the home screen fills the name in, but the score is only recorded after that tap. Route Rush Duel scores are never saved.

## For event staff: the admin page

Open **`<arcade address>/admin/`** on any phone or laptop and enter the admin password. You don't need any Azure or server login. The page isn't linked from the games, and search engines are told not to list it.

| Button | What it does | Undo |
|---|---|---|
| **Hide / Show** (one game, or all) | Pauses a leaderboard: players see *"🔒 Leaderboard paused by staff"*, and no names are sent to any screen. Scores are kept, and players can still play and save. | Press **Show** |
| **Remove** (next to an entry) | Deletes that one score (e.g. a fake score or a rude name) | Within 30 days, from the score file's earlier versions (see [azure/README.md](azure/README.md)) |
| **Wipe scores** (one game, or all) | Deletes that game's scores; you must type the game's name to confirm | Within 30 days, same as above |
| **CSV** / **Download all (CSV)** | Downloads the scores as a spreadsheet | — |
| **Lock** | Forgets the password on this device | — |

**The admin page can only affect scores.** It can't change, delete or switch off the games or the website. Those can only change through a new deploy by whoever manages the hosting.

**The password** is set by whoever deploys the arcade: `npm run azure:deploy -- --admin-password <password>`, at least 8 characters. Running that again with a new password changes it straight away. On the local server, set the `ADMIN_TOKEN` environment variable. The page never stores the password, and **5 wrong passwords lock that network address out of the admin page for 15 minutes**. Use something less guessable than a demo password for a real event, and share it only with staff.

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

`server/server.js` is a small web server that hosts the games **and** keeps every score (name, score, game, date) in a SQLite database, so all players see the same boards. It needs [Node.js](https://nodejs.org) 22.13 or newer and nothing else: no `npm install`. The score rules (validation, limits, name filter) live in `server/scores-core.js`, so any future hosting setup can reuse them. `npm test` checks the scores API and those rules.

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

**On Azure, use the Azure setup instead:** see [Hosting on Azure](#hosting-on-azure). It runs the same games and the same scores API without a server to manage.

**Hosting the local server elsewhere:** `server/server.js` needs **one** long-running Node.js process and a disk that keeps its files across restarts, because the database is a single file (`server/data/scores.db`, or `DB_PATH`). Run `npm start` (or `node server/server.js`) and set the settings below as environment variables.

| Host | Works as is? |
|---|---|
| A virtual machine or company server (e.g. an Azure VM) | ✅ Yes, the best fit |
| Platforms with a persistent disk | ✅ Yes |
| Azure App Service | ⚠️ Risky: its storage is a network share, and SQLite isn't safe on network drives |
| Hosts with no permanent disk (containers without a volume) | ❌ Scores are wiped on every restart or redeploy |
| Several copies of the server behind a load balancer | ❌ Each copy would have its own leaderboard |

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

**Protection built in** (all in `server/scores-core.js` and `server/scores-api.js`, shared by every host):
- **Impossible scores are refused.** Each game's limit (`GAMES`) is set just above the highest score it can actually produce; `npm test` recomputes this from the game settings.
- **Names** are letters (any language), spaces, hyphens and apostrophes only, up to 20 characters.
- **Blocked words** in `server/blocked-words.txt` (a starter list; add your own) are refused in names and in the rank/token text shown beside them.
- **Volume limits:** at most 25 scores per upload, and each address can upload at most 300 times a minute. Offices often share one address, so this is sized for about 1,000 people on one network (`POSTS_PER_MINUTE`).
- **Website restriction:** with `ALLOWED_ORIGIN` set, only those sites' pages can send scores; uploads must be JSON.
- **Admin password:** every admin action (wipe, remove, hide) needs it, sent in the `X-Admin-Token` header. The [admin page](#for-event-staff-the-admin-page) does this for you. 5 wrong passwords pause that address for 15 minutes.

Players can still fake a score up to a game's limit from the browser's developer tools, so check the top entries before handing out valuable prizes.

**Clearing scores:** `Ctrl+Shift+X` twice in a game only clears that kiosk's view of the board. To wipe the shared board, start the server with an `ADMIN_TOKEN` and run:

```
curl -X DELETE "https://your-server/api/scores?game=route-rush" -H "X-Admin-Token: YOUR_TOKEN"
```

Leave out `?game=…` to wipe every game. Game ids: `master-the-map`, `route-rush`, `health-journey`, `evernorth-city`, `case-files`.

**Who scored the most:** open http://localhost:3000/api/scores?limit=50 for the current top 50 per game. The database is a normal SQLite file, so any SQLite tool (for example [DB Browser for SQLite](https://sqlitebrowser.org/)) can open it. For example:

```sql
SELECT game, name, MAX(score) AS best FROM scores GROUP BY game, name ORDER BY game, best DESC;
```

**Backups:** don't copy `scores.db` on its own while the server is running. Recent scores may still be in `scores.db-wal`, and the copy can come out incomplete. Either stop the server and copy all the `scores.db*` files, use the `sqlite3` tool (`sqlite3 server/data/scores.db ".backup backup.db"`), or turn on your cloud's disk snapshots.

**Checking the server:** http://localhost:3000/api/health answers `{"ok":true}` when the server is up.

## Hosting on Azure

To host the arcade in an Azure subscription, use `azure/`. It deploys a Static Web App (the games, plus the scores API on Azure Functions) and a private Storage Account that keeps one score file per game. It costs cents a month and needs no servers.

```
npm run azure:preview    # what would be created — changes nothing
npm run azure:deploy     # create / update everything
npm run azure:export     # save all scores to this computer (JSON + CSV)
npm run azure:remove     # delete everything (saves the scores first)
```

The full guide covers setup, security, everyday tasks, a **company hosting checklist** and troubleshooting: **[azure/README.md](azure/README.md)**.

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
├── package.json             `npm start` runs the scores server, `npm test` runs the tests,
│                            `npm run azure:*` hosts it on Azure
├── azure/                   Azure hosting: main.bicep, api/ (Azure Function), deploy/export/
│                            remove scripts, security headers, README.md (setup guide)
├── server/                  server.js (web server), scores-api.js (the API endpoints, shared
│                            with Azure), scores-core.js (the score rules: validation,
│                            limits, name filter), blocked-words.txt
├── test/                    automated tests: API contract (local + Azure), score rules,
│                            Azure score files
├── admin/                   staff page for leaderboard scores (/admin/, password-protected)
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
- [ ] If you changed a game's scoring settings, run `npm test`. It checks each game's `maxScore` is still above what the game can produce.
- [ ] Review `server/blocked-words.txt` and add words your event needs.
- [ ] Point every kiosk at the server, save a test score on one and check it appears on another.
- [ ] Set up backups of the database.
