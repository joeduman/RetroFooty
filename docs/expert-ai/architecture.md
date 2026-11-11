# Implemented Expert AI architecture

The runtime policy is `expert-predictive-1`, implemented in `public/js/expert-ai.mjs`. It extends the preserved build-15 controller and writes ordinary movement, aim, sprint, and shoot inputs. `PhysicsEngine` remains authoritative for acceleration, braking, stamina, collisions, kick impulses, spin, rebounds, and scoring. The AI does not change player or ball positions, velocities, physical tuning, or network authority.

## Entry points and preservation

| File | Responsibility |
| --- | --- |
| `public/js/ai.mjs` | Stable public export of the runtime controller. |
| `public/js/expert-ai.mjs` | Expert planning, physical approach control, team intentions, progress monitoring, and diagnostics. |
| `public/js/ai-legacy.mjs` | Exact original controller, retained for inheritance and existing offline training entry points. |
| `public/js/ai-prediction.mjs` | Ball forecasts, player reachability, interception estimates, kick evaluation, and restitution-aware bank geometry. |
| `public/js/ai-active-memory.mjs` | Bounded match-local movement tendencies and explicit local-human candidate export. |
| `active-match-store.mjs` | Independent persistent candidates, reviewed mode priors, rejection history, and rollback. |
| `public/js/match.mjs` | Existing match lifecycle; chooses the preserved controller for the two existing offline executables. |

`Match` detects the executable paths ending in `bot-trainer-worker.mjs` or `train/rollout.mjs` and constructs `TrainerAIController` from `ai-legacy.mjs` for those paths. Browser games and the normal server construct the runtime Expert controller. This preserves the actual existing offline entry points without changing their source, configurations, teacher actions, or model formats. A future offline executable must explicitly preserve this selection; the detector does not infer every possible custom wrapper.

The SHA-256 of `ai-legacy.mjs` is `BC2F9D87E218C2D934B9A27EEB5FCDD3E5E844C5EAC391D1C146FD5BDD7A0EEA`, equal to the captured original controller. The frozen benchmark fixture has only relative import paths adjusted. All 22 entries in [protected-hashes.json](protected-hashes.json) were rechecked unchanged, including trainers, existing learning/model stores, training scripts/configuration, physics, tuning, and human input controls. Offline-controller regression tests compare actual player, ball, and score states against the frozen controller for 1,200 updates through both protected executable paths.

## Runtime decision pipeline

1. **Observe movement.** The inherited observer retains its previous human-style measurements. The independent active model samples current player movement at most every 150 ms. It uses visible authoritative state, actual sprinting, and cooldown changes; no new hidden-input or network channel is introduced.
2. **Forecast the ball.** Team planning runs every 100 ms. A shadow `PhysicsEngine` with no players forecasts 1.6 seconds in 80 ms output intervals using the engine's normal substeps. It copies ball state and uses the actual walls, posts, side orientation, and obstacles. A proven collision-free interior skips unnecessary shadow boundary checks. Forecasts exclude uncertain future player contacts.
3. **Estimate races.** Each player gets walking and boosted interception estimates along the shared trajectory. Reachability includes incoming momentum, acceleration, turning, and the sprint time affordable with current stamina. An unreachable trajectory endpoint retains its estimated arrival time rather than masquerading as a completed interception. Player collisions and deliberate opponent decisions remain uncertain.
4. **Coordinate roles.** The inherited chaser, cover, anchor, and support structure remains. Expert can replace the chaser using arrival estimates, goalside approach cost, and continuity/control bonuses. Immediate goal and near-post threats preserve defensive priorities. Attacking direction comes from `engine.attackDir(team)`, including halftime switching.
5. **Generate actions.** Expert considers five goal segments, leading passes, wall passes, bank shots when range permits, three advancing touch directions, and contextual clearances/escapes. Scores use field progress, lane clearance, receiving space, likely next shooting lane, range, contact alignment, and existing bounded policy parameters. Detected own-goal rays are rejected.
6. **Evaluate consequences.** The ten highest initial candidates plus the best available candidate in each tactical family receive bounded kick forecasts. These approximate spin, drag, rebounds, and goal crossing. Opponent continuation and boosted reaction-limited interception are separate plausible responses. Passing also accounts for receiver arrival and target miss. The values are ranking utilities, not calibrated scoring or win probabilities. Candidate setup assumes the planned contact can be aligned; actual execution checks the real contact normal separately.
7. **Commit and execute.** Aim decisions last 120 ms near the ball or 240 ms farther away, with a small switching margin for an equivalent prior choice. The chaser intercepts, contains, shapes a contact through an arc around the ball, or drives through a controlled touch. Braking-distance control converts the target into movement input. In a contested duel, safe shoot input can remain armed through approach and cooldown; the engine alone decides when a kick is legal. A final check rejects detected unsafe own-goal impulses.
8. **Monitor progress.** Every 800 ms, a nearby chaser checks signed ball progress. Three stalled checks trigger 1.2 seconds of escape-oriented reevaluation and cancel stale kick-follow intent. This is a bounded heuristic: stationary shielding or safe recycling can also trigger reconsideration.

The inherited motor-input layer still supplies stamina reserve thresholds, burst/rest windows, collision avoidance, neural blending, and exact front-post safeguards. Runtime Expert adds arrival-based boost usefulness and suppresses ordinary chase boost when it cannot help; immediate defensive emergencies retain permission to spend the available reserve. The actual `engine.kickoff` state prevents protected-kickoff boost. That safeguard already produced zero expenditure in the baseline, so it is preserved behavior rather than a new measured gain.

## Difficulties, neural models, and team play

Beginner, Intermediate, and Advanced use the preserved tactical/mechanical methods. Expert overrides are selected per team through the existing `setDifficulty` interface. No additional Extreme difficulty is created. `setPolicy`, `setNeuralPolicy`, `setLearningContexts`, `trainingObserver`, `reset`, and `onKick` remain available.

Runtime Expert retains neural inference/blending through the inherited update. Its close-ball mechanical controller subsequently corrects movement and enforces kick/boost safety; a saved neural model cannot override these runtime constraints. Existing offline teacher/candidate rollouts use the preserved controller and are unaffected. The `setLearningContexts` API remains compatible, but the new Expert `chooseAim` currently does **not** score candidates from the legacy persisted context statistics. Independent approved active priors are a separate mechanism.

| Mode | Implemented coordination |
| --- | --- |
| 1v1 | Arrival-based challenge/contain choice, independent finishing and clearance candidates; no teammate assumptions. |
| 2v2 | Rotating cover; the sweeper can prepare a selected reception beyond midfield when there is no immediate goal or near-post threat. |
| 3v3 | Carrier, cover, and supporting outlet; the single support uses the weak side when not receiving. |
| 4v4–5v5 | Existing anchor and multiple support lanes, updated chaser races, receiving intentions, and retained defensive cover. |

A selected receiver gets a short shared intention with a target and expiry. Actual kick callbacks retain delivery and pass-and-move behavior, and a receiver can immediately select a new shot or pass when it gains control. These mechanisms permit combinations; they are not a multi-touch search or proof of reliable give-and-go, triangle, or three-player completion. Sweeper behavior remains deliberately bounded by immediate threat coverage and does not constitute a fully optimized goalkeeper policy.

## Actual adaptation and persistent data

The active model tracks boost, turn/reversal frequency, lateral preference, straight runs, wall usage, challenges, and observed kicks. Recent observations receive more weight. Current Expert decisions use a narrower subset: confidence-weighted reversal/straight-boost tendencies slightly adjust the containment gap, and lateral preference shifts the coverage target by at most 16 pixels. This is movement-tendency adaptation. The implementation does not automatically discover, validate, or promote new tactical sequences, neural weights, or tactical policy weights.

The server stores candidates separately in `bot-memory/active-match-memory.v1.json`. Only completed, opted-in human observations enter the authoritative candidate path. Revocation/disconnection discards the participant's observations in the unfinished match; a reused slot starts fresh evidence. Bot-only evaluations cannot enter human references. Reviewed approval requires three completed matches per promoted mode, at least 20 observations in each, and at least 60 in that mode. The reviewer must still assess quality and opponent diversity. Approved priors load deterministically, contribute at most 30% before this opponent is observed, and fade with direct evidence.

From the project directory:

```powershell
node active-memory-tool.mjs status
node active-memory-tool.mjs list
node active-memory-tool.mjs import .\local-match-candidate.json
node active-memory-tool.mjs approve MATCH_ID_1 MATCH_ID_2 MATCH_ID_3 --review "Reviewed independent opponents and useful movement tendencies"
node active-memory-tool.mjs reject MATCH_ID_4
node active-memory-tool.mjs rollback 0
```

After a completed local human match, `window.teamball.learningCandidate()` explicitly returns a portable JSON candidate containing only that local human's aggregate observations. Saving that object and importing it using the command above does not approve it. Its origin remains `local-browser`, and repeated exports keep the same match ID. Existing saved replay/history UI is unchanged. Approved priors are fetched on local-page load and snapshotted at match creation; reload after an approval change to use it locally. Server matches snapshot the latest approved priors when created. Running matches retain their original snapshots. See [active-learning.md](active-learning.md) for consent, bounds, storage validation, administration, and legacy-learner distinctions.

## Diagnostics, evaluation, and practical limits

On the local page, `window.teamball.ai()` returns copied decision records: controller version, action, role, tactical target, selected aim/receiver, considered alternatives and interception utilities, forecast destination, boost decision, arrival estimate, and loop counter. `window.teamball.snapshot()` and `.report()` retain existing gameplay/report access. These are diagnostics; action names never count as successful tactical outcomes.

The benchmark drives actual matches through legal inputs against the frozen previous controller. Its paired seeds, color/orientation controls, metric definitions, and reproducible commands are in [benchmark-method.md](benchmark-method.md). The twenty saved-state scenarios test concrete outcomes separately. [performance.md](performance.md) describes measured runtime costs; gameplay results and the final regression totals belong to the final benchmark/regression reports.

Important limits remain: kick candidate forecasts approximate post/collision outcomes; reachability excludes future collisions; opponent branches are limited; the planner evaluates one kick plus simple receiver continuation value, rather than searching coordinated multi-touch futures. Some recorded tendencies are diagnostic only. Persistent identities across different human matches are intentionally not stored, and reviewed references are mode priors rather than durable per-person profiles. There is no demonstrated elite-human win rate, theoretical optimality, guaranteed automatic strategy discovery, or guarantee that every requested combination is reliable. Competitive and scenario failures must remain visible in the measured reports.
