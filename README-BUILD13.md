# Teamball 13.0 — Build and learning notes

## Starting point and preservation

Based on the user-provided complete Build 12.5 source. Existing `public/` rendering, browser replay, practice, local controls, shared park, private co-op, physical contact solver, and 120 Hz engine remain in place. No replacement engine was substituted.

## Implemented game changes

- AI selects temporary chaser, front-post covering defender and supports; all bot players can rotate. More conservative back-half option scoring and defensive clearances. Per-team bounded tactical policy and four difficulties. Advanced/Expert decision periods are smaller and positional/prediction errors lower than Beginner/Intermediate. Bots still obey the same motor and shot contact rules.
- Physics: only `spinCurve` from 0.095 to 0.106. All other physics parameters kept at their 12.5 values.
- `MatchStats` records actual shot origins, sampled flight paths and outcomes and an estimated pass completion figure. A teammate within five seconds can be credited with an assist; passive opponent deflections preserve a recorded shot's scorer/assist, whereas a deliberate defender kick or sustained control clears it. Earlier fixtures retained.
- New report shot-map rendering and explicitly labeled final red/blue score. Career heatmap, pass map, shot map and game-size comparisons in account dashboard.

## Persistent learning: how it really works

- `bot-memory/teamball-bot-memory.v1.json` contains a versioned JSON tactical policy, scored evaluation history, aggregate opted-in human-action context statistics and counts. Save schema is independent of the release number; it is importable by code that understands schema v1.
- Each opted-in human game on the shared park or private co-op is sampled server-side at approximately 10 Hz into a compressed, capped-per-file training replay. Player email/password are not included. Replay files are not automatically deleted. The server stores them on the host, not in the browser.
- Human context samples are weighted toward scored possessions and some defensive moments. They influence bounded tactical decisions for subsequent games, without full neural-network imitation or instantaneous invention of new moves.
- An idle background worker performs candidate-vs-champion bot matches at multiple sizes with matched-side controls. It reexamines archived high-signal human moments as an additional small influence on candidate scoring. New candidates are rejected if evaluation/regression gates fail. The game server polls active connections every second and suspends new worker evaluations when humans arrive; the worker yields and stops at pauses.
- Human playstyles influence the shared policy; all bots draw from it, with skill levels limiting decision speed and accuracy. In-match AI observes opponent aggression and sprint behavior, adjusting near-post urgency.
- No true general reinforcement-learning convergence proof, infinite improvement, learned visual play from YouTube videos or machine-learning model trained from player video is claimed. That requires explicit training datasets, better reward functions and a substantial offline benchmark campaign.

## Transferring training state

Keep a backup copy of `bot-memory/` between version upgrades. JSON only carries aggregate learning; compressed files in `bot-memory/replays/` allow repeated practice from original matches. Use `bot-memory-tool.mjs` from the game folder to inspect, export policy, import it, reset to defaults, or pause/resume. Existing file is backed up to `.bak` for import/reset.

**Never extract a future update over the previous folder without backing up the memory and account directory.** Account history is in `server-data/` and is *not* part of the portable AI model.

## Accounts and security

The new local account service uses email/password, Node's `scrypt` with per-user random salt, and random cookie session tokens. A guest may still enter the park. Profile stats track signed-in field participants at match completion. Accounts do **not** perform email address verification or password-reset mail, so the current implementation should be considered a local prototype rather than public production authentication. Remote plain HTTP account creation/login is intentionally forbidden. To enable behind a real HTTPS reverse proxy on localhost, restrict forwarding and explicitly configure `TEAMBALL_HTTPS_PROXY=1`.

## Tests and known limitations

- 105 original tests remained valid and passed. 7 new tests cover schema portability, human consent capture, front-post placement, shot flight paths, five-second assists, human contexts and account endpoints. **112/112 Node tests pass.**
- Node full-match simulations for 1v1, 2v2, 3v3 and 5v5 completed with zero own goals in this particular short seeded sample. This is not a statistical performance guarantee.
- Real browser visual validation could not be completed in this environment because its Chromium browser blocked local navigation. Run Windows and internet latency tests on your own setup. Live server, HTTP account service and WebSocket modules have Node tests.
- Guest/local game replays remain in browser IndexedDB. Only consented server-authoritative park/private matches contribute to the portable human training archive. Guest matches with no consent do not train bots from human input. This honors the privacy control. Local singleplayer fetches the current shared bot policy upon page load but does not yet upload offline human replay inputs for server learning.
- The first release uses strategy parameter adaptation plus self-play comparisons, not a neural-policy network. No public leaderboard, email verification, SMTP, account recovery or separate player Elo ranking is included.

## Future 13.x priorities

1. Benchmark defensive post coverage, own-goal prevention, attacker-interception accuracy, and shots-vs-saves across thousands of seeded and live matches; improve specific tactical failures rather than overfitting simple reward functions.
2. Add a stronger offline replay-trainer pipeline (supervised imitation + opponent-conditioned strategy + proper policy search), using server-authoritative high-frequency demonstrations and competitive benchmark gatekeeping.
3. Add secure external HTTPS account hosting, verification/password reset via configured email provider, and appropriate deployment hardening.
4. Optional voluntary local-play replay uploads, user-facing replay consent deletion/export, improved authenticated history across reconnects, advanced shot and pass probability metrics.
