# TEAMBALL BUILD 14.0 — Expert + Neural Training

## Important

This is a careful extension of corrected Build 13.0. The ball physics engine,
visual renderer, park layout, and match rules are retained. No trained neural
model ships as a default: the game begins with exactly the existing Expert AI.
The first candidate must beat that baseline to become the champion.

## Windows installation

1. BACK UP your previous Teamball folder and especially `bot-memory` and `server-data`.
2. Extract this ZIP to a NEW folder. Do not overwrite your running Build 13.0.
3. If you have existing learned experience, copy the ENTIRE old `bot-memory`
   folder into the new directory. The `teamball-bot-memory.v1.json` save format
   is still supported. This carries existing human replay files and contexts.
4. Copy `server-data` as well ONLY if you want to preserve old local account
   data. Do not share this folder: it may include private account details.
5. Double-click `START-TEAMBALL.cmd`; game address: http://localhost:25568/ .
   The old server must be stopped first.
6. To activate Python training, install Python 3 (with the Windows `py`
   launcher), then run `INSTALL-AI-TRAINING.cmd`. It creates an isolated
   `.ai-venv` and installs NumPy. **Python is not required to PLAY.**
7. With Python installed, the running server trains during idle periods.
   You can also use `RUN-AI-TRAINING.cmd` when no users are connected.

## What is actually learned

1. *Human imitation.* Consenting human inputs from server-authoritative
   replay archives are labeled and weighted. Successful moves and winning
   games have higher training weight. No YouTube video is directly converted
   into invisible movement inputs, and no unconsented accounts are copied.
2. *Expert bootstrapping.* Native 13.0 Expert bots generate high-frequency
   state/action demonstrations for a safe training starting point.
3. *On-policy reinforcement learning.* A Python/NumPy policy-gradient learner
   trains from its own stochastic control samples during simulated matches
   through the actual Teamball physics and gameplay engine.
4. *League-style self-play.* Candidates face the current champion; the next
   accepted champion replaces it. The previous champion is backed up.
5. *Mirrored tournament benchmark.* Candidate must achieve at least a 62.5%
   win-equivalent rate, +3 total goal differential, positive weighted performance
   and no excessive own goals in at least eight matches (12 by default).
   Results with only 12 games are provisional, not proof of professional skill.
6. *Protected deployment.* Invalid neural files fall back to scripted Expert.
   Live matches use a bounded blended controller. The neural policy operates
   through normal move/aim/sprint/shoot inputs; it cannot modify physics.

## Model save files — transferable to future versions

- `bot-memory/teamball-bot-memory.v1.json`: original v13 strategic memory.
- `bot-memory/replays/*.json.gz`: server-side human input demonstrations.
- `bot-memory/models/champion.v1.json`: promoted neural champion (once earned).
- `bot-memory/models/champion-previous.v1.json`: previous champion for rollback.
- `bot-memory/models/challenger.v1.json`: unpromoted ongoing learner.
- `bot-memory/models/trainer-state.json`: training attempts and progress.
- `bot-memory/models/training-history.json`: accepted/rejected evaluation audit.

Copy the WHOLE `bot-memory` folder whenever upgrading; do not copy only
`champion.v1.json`. Avoid running two game versions against the same live
memory folder.

## Training timing and performance

- Auto training begins after **30 consecutive seconds without any connected
  human player** in park or online rooms, and at most once every 15 minutes.
- Python and the native rollout runner repeatedly check an activity marker.
  They halt if a player connects; all training is in a separate process.
- Live gameplay is always prioritized. If no compatible Python/NumPy is
  installed, the game still works; the training status will show an error.
- Self-play parameter tuning from Build 13 continues, using its own worker,
  and is also paused whenever anyone is connected in park or online rooms.
- Edit `bot-memory/training-settings.json` to change idle time, frequency and
  simulation budget. Use `PAUSE-AI-TRAINING.cmd` to stop new cycles.
- This package does not ship pretrained superhuman bots or guarantee that any
  neural candidate will win its benchmark. If all models fail, the reliable
  scripted Expert AI remains the champion.

## Useful controls

- `CHECK-AI-STATUS.cmd`: prints human samples, accepted policy updates, and
  neural champion/training state.
- `RUN-AI-TRAINING.cmd`: runs one offline imitation + RL + benchmark cycle.
- `BACKUP-BOT-MEMORY.cmd`: archives the portable memory folder.
- `node bot-memory-tool.mjs status`: machine-readable status.
- `node bot-memory-tool.mjs neural-rollback`: restore the previous neural
  champion without deleting the old Build 13 tactical memory.
- `npm test`: baseline + neural-system regression tests.
- `node train/rollout.mjs --mode benchmark --matches 12 --candidate bot-memory/models/candidate.v1.json`
  can inspect candidate performance after training.

## Limitations / future research

This is a functional small-network imitation and policy-gradient learning
pipeline. It cannot guarantee a challenge to the original Teamball.io pros.
That would require many real high-skill player demonstrations, stronger policy
architectures, more compute, larger held-out tournaments against top humans,
and iterative tuning. A recorded video alone cannot supply authoritative
controller inputs. Model promotion thresholds need calibration against match
variance and humans before competitive deployment.

The game is intentionally compatible with the previous physics and graphics.
See BUILD14-CHANGES.txt and TEST-RESULTS-BUILD14.txt for reproducible checks.
