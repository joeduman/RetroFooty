# Expert AI comparison

The merged runtime is **expert-predictive-3**. Useful uncontested breakaway runs
can pass the final sprint gate, subject to the existing stamina reserve, travel
distance and protected-kickoff checks. Other difficulties, the offline teacher,
training models and player data retain their existing behavior.

Double-click `AI-COMPARISON.cmd` or run `npm.cmd run ai:compare`, then open
<http://127.0.0.1:3168/dev-ai.html>. This loopback-only development viewer runs
separately from the multiplayer server. Set `AI_VIEWER_PORT` if the port is busy.
The normal server can also serve `/dev-ai.html`.

The dashboard can load saved tournaments, inspect individual statistics and
decisions, play compressed recorded replays, and run live or automatic matches.
Original Expert uses `ai-legacy.mjs`; Previous v2 uses the frozen
`dev-ai-old.mjs`; New Expert uses the current runtime. Both teams always use the
same current engine. The frozen v1 fixture supports additional benchmark checks.

Run a tournament against the current merged build:

```powershell
node tests/ai-tournament.mjs --pairs=52 --selfPairs=5 --duration=60 --seed=291107
```

Runs get unique directories under `public/ai-results/`, including source hashes,
settings, per-match results and replays. These generated files are ignored by
Git. Keep that directory separately if you want to preserve evaluation history.

```powershell
node tests/compress-ai-replays.mjs public/ai-results/RUN_ID
node tests/ai-tournament-report.mjs public/ai-results/RUN_ID
node tests/expert-benchmark.mjs --opponent=predictive-v1
node tests/ai-dashboard-browser.mjs
```

The benchmark writes to `reports/`; the dashboard browser check writes its
screenshot to `reports/screenshots/ai-dashboard.png`. Neither tool promotes a
trained model or writes player accounts, ratings or wallets.

The imported latest review contains **570 historical matches**, including its
570 compressed replays and original runtime source snapshots. Its original
settings, hashes and measured outcomes are retained. Those results describe the
incoming package's evaluation environment; they are not a fresh measurement of
this merged build. Older exploratory runs and video-review images remain in the
original update directory.

Win rate counts draws separately. Passing, through-ball, blocking and coordinated
play counters have limits described in each result's metric definitions and
clarifications. These shortened bot matches do not establish performance against
human players or under standard-duration matches.
