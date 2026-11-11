# Runtime benchmark protocol

The benchmark runs the actual `Match.update()` and authoritative `PhysicsEngine.step()` at 1/120 second. It imports neither offline trainer and never changes policy weights, training configurations, or memory files. The previous Expert controller is frozen in `tests/fixtures/expert-baseline/ai.mjs`; its only modification is relative import paths. The fixture manifest records the original SHA-256 and a regression check verifies that restoring those import paths reconstructs the exact original file.

Each seed plays twice, with the candidate assigned red and blue in turn. Alternate seed pairs begin with mirrored team sides; normal kickoff, halftime, final-attack and goal-celebration rules remain active. Both controllers receive the same previous-frame authoritative inputs. Each controller selects legal inputs, after which only its assigned team's inputs are retained. Kick callbacks and diagnostic memory are routed to the controller owning the corresponding player. No physical states are altered by the comparison controller.

Default policy parameters and no neural model are used on both sides. This isolates the runtime controller change. The benchmark does not establish compatibility with every possible trained model; separate tests cover the existing neural and trainer interfaces.

Reproduce a competitive sample from the project directory:

```powershell
node tests/expert-benchmark.mjs --games=20 --duration=60 --seed=42000 --output=docs/expert-ai/benchmark-results.json
```

`--games` counts paired seeds per mode: the command above runs 40 matches per mode, 200 total. `--sizes=1,3,5` restricts modes. `--control` evaluates frozen previous Expert against itself. Raw match records include size, seed, starting orientation, candidate color, score, duration, finish status, telemetry and wall time. Hashes capture controller and engine sources at run start and check them again at completion; `sourcesChanged: true` identifies a run that cannot be presented as a reproducible final-source evaluation.

The initial frozen-versus-frozen control ran six paired seeds per mode, 60-second regulation, seeds `42000 + 7919*i` (`i=0..5`). It produced **60 completed matches, no non-finite states**, and exactly symmetric outcomes when the candidate label was reversed. Raw data: [baseline-results.json](baseline-results.json).

| Mode | Paired seeds; matches | Label W/D/L | Goals per team per match | Boost points spent per team per match | Own goals credited to label | Stationary-control loop episodes |
| --- | --- | --- | --- | --- | --- | --- |
| 1v1 | 6; 12 | 4/4/4 | 1.08333 | 545.16806 | 0 | 0 |
| 2v2 | 6; 12 | 3/6/3 | 0.25000 | 731.36875 | 0 | 0 |
| 3v3 | 6; 12 | 4/4/4 | 0.50000 | 1066.22639 | 1 | 2 |
| 4v4 | 6; 12 | 2/8/2 | 0.41667 | 1065.74375 | 2 | 0 |
| 5v5 | 6; 12 | 0/12/0 | 0.33333 | 1148.32083 | 0 | 0 |

Protected-kickoff boost expenditure was already zero in every baseline mode. Therefore this existing safeguard is a regression requirement, not a newly measured gain. Baseline own-goal and loop counts are too sparse to establish the proposed 90% reduction targets in this sample.

The important statistical unit is the seed pair. The report retains wins, draws and losses separately and supplies a paired mean goal-difference interval. A Wilson interval is also reported for decisive games only. Both intervals have practical limits: the paired goal interval uses a normal approximation, small decisive samples produce broad Wilson intervals, and bot-versus-bot seeds do not represent a population of elite humans. Draw-adjusted score is `(wins + 0.5*draws)/matches`; it is explicitly separate from win rate.

Metrics need careful interpretation:

- Shots, on-target attempts, passes, interceptions and own-goal credits come from the existing `MatchStats`. Its shot classifier projects a straight ray; bank goals and contact goals may not be labeled shots. Consequently `goalsPerShot` can exceed 1 and is **not a reliable shot-conversion rate**. No calibrated scoring probability is claimed.
- Spacing averages each player's nearest teammate distance at 0.2-second intervals. Clustering means a nearest teammate within 80 pixels. This measures separation, not whether the formation is tactically optimal.
- Support availability means a teammate 85–450 pixels from the carrier and over 70 pixels from the nearest rival. This proxy does not prove a pass is interception-safe.
- Own-directed contacts count controlled-nearby ball motion toward the team's own goal at over 55 px/s. Intentional recycling and defensive touches can be included; these are not labeled unintended mistakes.
- A stationary-control loop means the ball stays within 45 pixels for over three seconds while a teammate remains within 100 pixels. Legitimate shielding may satisfy that definition.
- Wall time and peak update time include both controllers plus Match/Physics. They are not candidate-only production CPU measurements; peak time can include GC or OS scheduling pauses.

All twenty requested situations are JSON-portable fixtures in `tests/fixtures/expert-scenarios.mjs`. The smoke suite checks deterministic restore, finite legal controls, kickoff conservation, frozen-fixture integrity, comparison routing, and baseline color-label symmetry. It does not claim to prove tactical success merely because a fixture runs.

The separate physical outcome screen is reproducible with:

```powershell
node tests/expert-scenario-evaluate.mjs --seeds=2 --horizon=8 --output=docs/expert-ai/scenario-results.json
```

That command runs 160 trials (20 scenarios × two seed variants × two orientations × two policies), stopping on a goal or the eight-second horizon. Each scenario states its concrete success condition. A give-and-go requires actual uninterrupted kick-to-teammate receipts `A→B→A`; a three-player sequence requires `A→B→C`. Action names in diagnostics never count as completed plays. Bank scoring requires a real wall event between a deliberate kick and goal. The small scenario sample diagnoses weaknesses; it does not supply well-powered competitive claims. Both teams use the same policy in that screen, so results differ in purpose from mixed-policy match win rates.

No experienced human matches were available for this implementation session. Human win rate, elite-player strength, and whether two experienced players can still exploit simple dribbling remain unmeasured.

Baseline full regression suite before AI edits: 202 tests, 197 passed, five pre-existing failures reported by the main audit (three audio-sequence cases, one build141 expired-half celebration case, missing `public/audio/goal-fire.wav`). The final regression report must distinguish those failures from new failures.
