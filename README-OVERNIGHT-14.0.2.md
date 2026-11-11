# Teamball 14.0.2 — Overnight AI trainer (all five game modes)

This is Build 14.0.1 plus an unattended Python training supervisor and a balanced
five-mode curriculum. **Game physics, bot AI behaviors, renderer, park, match
rules, and online matchmaking are NOT rewritten.** The existing Expert AI stays
in place until a neural candidate passes its tournament benchmark.

## Windows: first-time installation

1. Extract the complete ZIP into a **new** `Teamball-14.0.2` folder. Keep the
   previous game installation as a backup.
2. Copy your entire existing `bot-memory` folder into the new version to bring
   your human demonstrations and trained champion. **When copying, keep the
   new `overnight-settings.json`; if it is overwritten or missing, the trainer
   automatically uses its default settings.** Existing `training-settings.json`
   can be retained if you've customized the server's own trainer.
3. If you want your existing account logins, copy `server-data` privately.
4. Run `INSTALL-AI-TRAINING.cmd` once to create `.ai-venv` and install NumPy.
   Python 3 and Node.js 20+ must be installed.
5. Double-click `START-OVERNIGHT-AI.cmd`. A **hidden, detached** Windows
   process starts an eight-hour training session. No game window must be
   open. The trainer saves progress between cycles and restarts from the saved
   challenger/champion next time. For a visible troubleshooting console, use
   `RUN-OVERNIGHT-AI-VISIBLE.cmd` *instead*, not simultaneously.
6. Use `CHECK-OVERNIGHT-AI.cmd` to read status; progress and errors are logged in
   `bot-memory/overnight-training.log`.
7. Double-click `STOP-OVERNIGHT-AI.cmd` to request a graceful stop. The current
   cycle checks this request and releases training locks at safe checkpoints.

**Keep the PC running and awake overnight.** Windows sleep/hibernation will
suspend training. You do not need to keep the game server online to train
against simulated bots. If the server is online and someone connects, the
trainer automatically interrupts and waits until users leave.

## Modes covered

Every complete block of 10 simulated matches trains/evaluates these pairs:

| Matches | Mode | Sides |
|---|---|---|
| 1–2 | 1v1 | Red, Blue |
| 3–4 | 2v2 | Red, Blue |
| 5–6 | 3v3 | Red, Blue |
| 7–8 | 4v4 | Red, Blue |
| 9–10 | 5v5 | Red, Blue |

Default per cycle: **10 Expert demonstrations + 10 candidate self-play matches +
20 benchmark matches**, so every phase includes every size, with side balancing.
Python replay normalization now uses the exact 14.0.1 enlarged field sizes.
The native game match engine is used for simulations, not simplified physics.

## Customize overnight runtime

Edit `bot-memory/overnight-settings.json`:

```json
{
  "hours": 8,
  "idleSeconds": 30,
  "cooldownSeconds": 30,
  "teacherMatches": 10,
  "selfplayMatches": 10,
  "benchmarkMatches": 20
}
```

The session runs until its specified number of hours elapses, or you request
stop. Longer sessions are not guaranteed to produce improvements. If CPU load
is too high, pause training or increase cooldown. Python's trainer runs at
below-normal scheduling priority; live multiplayer takes priority and training
halts when humans connect.

## Memory is permanent and transferable

Retain the **entire** `bot-memory` directory when upgrading again:

- `replays/` — consenting human demonstrations
- `models/champion.v1.json` — promoted neural champion, when one exists
- `models/challenger.v1.json` — current strongest rejected candidate to improve
- `models/trainer-state.json` — completed training attempts
- `models/training-history.json` — evaluation history
- `teamball-bot-memory.v1.json` — existing shared tactical memory
- `overnight-status.json` and `overnight-training.log` — run status and diagnostics

Models are only promoted after beating the current benchmark. A candidate that
loses can continue training, but there is no guarantee it will eventually beat
strong human players. More repetitions do not imply continuous improvement.

## Preventing concurrent training

The overnight supervisor and the server's built-in automatic neural trainer
coordinate with `bot-memory/models/training.lock`; only one model writer may
train at a time. An interrupted trainer removes its lock; a stale lock from a
crashed process is automatically cleared after checking the process ID. Do not
run two versions against the **same live** bot-memory folder simultaneously.

## Known limitations

- The Windows hidden-process launcher is reviewed but could not be executed in
  this Linux test environment. Use `RUN-OVERNIGHT-AI-VISIBLE.cmd` if the hidden
  launcher fails; inspect `overnight-training.log`.
- This is a 24-feature shallow neural policy and simulated policy gradient;
  it is **not** a guaranteed professional-level bot or a universal learner.
- The Python trainer uses the latest 80 eligible replay files / up to 28,000
  human samples each cycle; earlier data continues to contribute to the older
  shared tactical memory. Private room recordings still depend on recording
  support in the original build.
- A game server on another PC cannot be detected by this local trainer.
- Automatic training on an awake PC uses CPU; it does not run on the cloud or
  when the PC is shut down.

## Tests

Run `npm test` for the full suite, or
`node --test tests/overnight-142.test.mjs` for scheduler and file checks.
