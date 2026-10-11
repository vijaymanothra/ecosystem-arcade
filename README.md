# The Ecosystem Arcade

Five touchscreen games that teach employees how the businesses of The Cigna Group fit together, plus a home screen and a shared "Evernorth Passport" that rewards playing all five.

Everything runs locally in a web browser. There is nothing to install, no server, and no internet connection needed.

## Quick start

| | Windows | Mac |
|---|---|---|
| Booth (fullscreen kiosk) | Double-click `start-kiosk.bat` | Double-click `start-kiosk.command` (see first-time note below) |
| Just try it | Open `index.html` in Edge or Chrome | Open `index.html` in Chrome or Edge |
| Exit kiosk mode | `Alt+F4` | `Cmd+Q` |

**Mac, first time only:** macOS needs permission to run the launcher. Open Terminal in this folder and run `chmod +x start-kiosk.command`. If macOS then blocks it as "from an unidentified developer", right-click the file → **Open** → **Open**.

**Use Chrome or Edge.** Safari also displays the games, but it keeps local-file storage separately per page. That means passports and leaderboards don't carry across games in Safari.

Each game folder also has its own `start-kiosk.bat` if you want one game on a dedicated screen.

## The games

| Game | Folder | Players | Time | What it teaches |
|---|---|---|---|---|
| 🗺️ Master the Map | `master-the-map/` | 1 | ~3 min | What each business does: one question per business, light up the map |
| 🚦 Route Rush | `route-rush/` | 1, or 2 in Duel | ~2–3 min | Which business handles which request: fast arcade routing |
| 🎲 The Health Journey | `health-journey/` | 1–4 | ~5–8 min | A patient's path: board game with dice, challenges and event cards |
| 🏙️ Evernorth City | `evernorth-city/` | 1 | ~4 min | Why each business matters: build a city, survive news events |
| 🕵️ Case Files | `case-files/` | 1 | ~3–4 min | How businesses connect end to end: solve cases with red string |

The home screen (`index.html`) shows all five games, today's champions and the Ecosystem Experts wall.

## Evernorth Passport

1. A player taps a game on the home screen and types their first name, or chooses **Play as guest**.
2. Finishing any game stamps their passport for that game.
3. Collecting all 5 stamps makes them an **Ecosystem Expert** on the home-screen wall. This works well for a daily prize.
4. **I'm done — next player** signs them out. The home screen also signs them out after 90 seconds of inactivity.

Passports reset each day. Two people with the same first name share a passport, so suggest adding an initial (e.g. "AlexK").

## Staff controls

Inside a game, the 🏠 button in the top-right corner must be **held** for about a second to return to the home screen. This prevents accidental exits. Games also return home on their own after 3 idle minutes.

With a keyboard attached:

| Key | Action |
|---|---|
| `Esc` | Back to that game's start screen |
| `Shift+Esc` | Back to the Arcade home screen |
| `M` | Mute or unmute sound |
| `Ctrl+Shift+X` twice | Clear that game's leaderboard |
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

- Scores and passports are saved in the kiosk browser's local storage. They survive restarts and stay on that machine.
- Leaderboards show **today's** scores by default. Set `leaderboardScope: 'all'` in a game's config to keep one board for the whole event.
- **Don't run the booth in a private or incognito window.** Everything is wiped when it closes.
- Keep the whole folder together. The games load shared files from `shared/`.

## Troubleshooting

| Problem | Fix |
|---|---|
| No sound | Browsers only allow sound after the first tap, so tap the screen once. Check `M` hasn't muted it. |
| Passport or leaderboards don't carry between games | Use Chrome or Edge (not Safari), and don't use a private window. |
| Duel mode taps get missed | The screen may not be multi-touch. Press `T` in Route Rush to test. |
| Layout looks cramped | The games are designed for a landscape 1080p screen. Make sure the browser is fullscreen (use the kiosk launcher). |
| Mac launcher won't open | Run `chmod +x start-kiosk.command`, then right-click → Open. |

## Folder structure

```
ecosystem-arcade/
├── index.html               Arcade home screen
├── start-kiosk.bat          Windows launcher
├── start-kiosk.command      Mac launcher
├── shared/                  passport.js, launcher.js, launcher.css
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
- [ ] Clear any test scores (`Ctrl+Shift+X` twice in each game).
