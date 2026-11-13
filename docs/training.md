# AI training and data

The runtime Expert controller is `public/js/expert-ai.mjs`, exported through
`public/js/ai.mjs`. `ai-legacy.mjs` is still required: runtime controllers inherit
its mechanics, and offline training uses it as a teacher. Similarly,
`tests/fixtures/expert-baseline/` is an active benchmark fixture.

`bot-memory/` holds the portable bot save, consented replays, independent active
opponent memory, model champions and training state. Back up the entire directory
with `BACKUP-BOT-MEMORY.cmd` while the server and trainers are stopped. Also back
up `server-data/` for player accounts, Elo, Gold and completed reports.

## Host commands

Run from the repository directory:

```powershell
node bot-memory-tool.mjs status
node bot-memory-tool.mjs export
node bot-memory-tool.mjs import .\retrofooty-bot-memory-export.json
node bot-memory-tool.mjs pause
node bot-memory-tool.mjs resume
node bot-memory-tool.mjs neural-rollback
```

Stop the server before importing memory or restoring a backup; restart it to
load the result. `reset` explicitly replaces memory and makes a backup; use it
only when you intend to start fresh. `CHECK-AI-STATUS.cmd` shows trainer status.

`INSTALL-AI-TRAINING.cmd` installs the Python environment; then use
`RUN-AI-TRAINING.cmd` for one training cycle. `INSTALL-CUDA-TRAINING.cmd` sets up
the optional CUDA backend. `START-OVERNIGHT-AI.cmd`, `CHECK-OVERNIGHT-AI.cmd` and
`STOP-OVERNIGHT-AI.cmd` manage overnight training; the visible runner is available
for troubleshooting. Training yields while players are connected. The existing
curriculum covers 1v1 through 5v5, both colors, with benchmark-gated promotion.

`INSTALL-VIDEO-ANALYSIS.cmd` and `ANALYZE-VIDEO.cmd` provide optional video analysis.
Their Python implementations and requirements remain in `train/`.

## Runtime evaluation

These tools evaluate the current controller without promoting a model:

```powershell
node tests/expert-benchmark.mjs
node tests/expert-scenario-evaluate.mjs
node tests/profile-expert.mjs
```

Their default outputs go to `reports/`, created automatically. Keep the baseline
fixture and scenario fixtures when sharing a development copy. Independent
[active opponent memory](active-learning.md) has its own consent, review and
rollback workflow; it does not automatically promote observed matches.
