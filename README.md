# RetroFooty

Current build: **16**. A browser football game with a shared park, private
rooms, local play, Ranked, Casual bots, chat, player profiles,
Gold and cosmetic inventory.

Install Node.js 20 or later, then run `npm.cmd ci` once to install dependencies.
Double-click `START-RETROFOOTY.cmd` to start the server and open the game, or use
`npm.cmd start` and visit <http://localhost:25568>. Use `STOP-RETROFOOTY.cmd` or
`npm.cmd stop` to shut it down. Set `PORT` to choose another port. Restart after
backend changes and refresh browsers after client changes. No bundling is needed.

- [Current gameplay, reconnect and UI behavior](docs/current-build.md)
- [Chat controls](docs/CHAT.md)
- [Customization and shop configuration](docs/customization.md)
- [AI training and backups](docs/training.md)
- [Expert AI comparison dashboard and tournaments](docs/ai-comparison.md)
- [Reviewed active opponent memory](docs/active-learning.md)

Run `npm.cmd test` for regression tests and `node tests/browser.mjs` for the
current desktop/mobile browser checks. The browser check uses an isolated
temporary server and installed Chrome. `node tests/chat-browser.mjs` checks chat
separately. Set `TEAMBALL_BROWSER` to another Chrome executable when needed.
Generated reports and screenshots go into the ignored `reports/` directory.

`public/` contains the browser game; root modules implement the server and
persistence; `train/` contains offline training tools; `tests/` contains current
regression tests and required fixtures. Tests are named by feature.

Keep and back up **both `server-data/` and `bot-memory/`**: these contain accounts,
ratings, wallets, reports, learned models and replays. They are local data.
Stop the server and offline trainers before copying or restoring data.
Their contents, dependencies and generated reports are ignored for new Git
additions; previously tracked files remain tracked.

The active bot save is `bot-memory/retrofooty-bot-memory.v1.json`; an older
Teamball save is migrated on first load if the new file is absent. Existing
save-schema names, network routes, browser storage keys and environment
variables retain their legacy identifiers so existing saves and tools work.
