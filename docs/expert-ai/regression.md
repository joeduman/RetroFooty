# Regression and preservation report

Before editing the runtime controller, the existing suite ran 202 tests: 197 passed and five failed. The same five unrelated failures remain in the final suite; they were not hidden, skipped, or changed to manufacture a clean run.

| Existing failure | Baseline and final status |
| --- | --- |
| `audio-sequences.test.mjs`: halftime whistle timing | Fails before and after |
| `audio-sequences.test.mjs`: full-time whistle gaps | Fails before and after |
| `audio-sequences.test.mjs`: loaded custom clip duration | Fails before and after |
| `build141.test.mjs`: expired-half goal celebration reaches halftime | Fails before and after |
| `fire-goal-audio.test.mjs`: explosion PCM asset | Missing `public/audio/goal-fire.wav` before and after |

The final run executed **258 tests: 253 passed and the same five failed**. The final raw test run is [regression-final.txt](regression-final.txt). It includes the original gameplay, physics, stamina, neural compatibility, kickoff, halftime/full-time, goal customization, local client, accounts, private online rooms, park networking, and extracted-server tests, plus new controller/prediction/memory/scenario regressions. The test command exits with failure because the five original failures remain. The optional Playwright browser smoke script was syntax-checked but not executed; Playwright is not installed in this project.

## Concrete defects corrected and verified

- **Approach deadlock:** a fixed lateral waypoint could satisfy its movement target without reaching a usable contact angle. Collision-disc arc routing now produces a safe forward touch in actual five-second simulations on both teams and both halves.
- **False reachable races:** an unreachable trajectory endpoint previously looked like an arrival at the forecast horizon. Ranking and boost usefulness now retain the actual arrival estimate, and an impossible-chase test confirms no boost request.
- **Lost close challenges:** waiting for cooldown and exact last-frame contact let an already-armed opponent kick first. Safe contested kick input remains armed through approach and cooldown; the unchanged engine enforces actual legality.
- **Future-pass misvaluation:** evaluating every prospective pass as an immediate unaligned kick wrongly penalized angles the bot could create. Setup candidates use intended alignment; execution separately checks actual contact direction and detected own-goal risk.
- **Candidate-family starvation:** similar goal samples could exclude all safe outlets before interception costs were applied. The forward evaluator reserves a candidate from each available tactical family.
- **Interior forecast CPU spikes:** shadow forecasts repeated collision checks where no collision was possible. A geometrically proven collision-free region avoids those checks, preserving exact wall/post/custom-map parity. Final all-court p99 tick time is about 1.125 ms on the measured machine, below the 8.33 ms simulation tick budget.
- **Persistence boundaries:** candidates remain separate from approved references; consent revocation, disconnection, final-tick changes, slot reuse, corrupted records, duplicate IDs, and bounded evidence are tested. Approval/rollback cannot overwrite active-match snapshots.
- **Extracted-server dependencies:** test fixtures now include the new server-only active-memory module so copied installations continue starting correctly.

No claim is made that all ball loops, defensive errors, or unsafe passive contacts are eliminated. Saved-situation outcome failures and secondary metric regressions are retained in [scenarios.md](scenarios.md) and [benchmark.md](benchmark.md).

## Protection evidence

[protected-hashes.json](protected-hashes.json) records the original SHA-256 values. [preservation-results.json](preservation-results.json) verifies all 22 remain unchanged, including authoritative physics, tuning, human controls, the original learner/model store, all offline trainer executables and configuration/scripts. It also verifies current controller/engine/harness files match the 200-match benchmark sources.

`ai-legacy.mjs` is byte-identical to the original AI controller. Existing worker and rollout executable paths select it, and tests compare player, ball, and score state for 1,200 frames per path against the separately frozen baseline. The new runtime does not run inside those trainer evaluations. The only additional Match event classification counts the new `bank-shot` type; the legacy controller never emits it.

The new AI issues movement, aim, sprint, and shoot only. Tests verify it does not directly alter positions, velocities, or stamina. Forecasts operate on shadow state. Human/bot motor parity, kick contact geometry, collision behavior, boost exhaustion/recovery, legal speed, kickoff freezes, corner post coverage with adversarial neural bias, and side switching continue passing.

The final UI diff only adds approved-reference loading, explicit local-candidate export, and read-only AI diagnostics. Existing interface text and rendering were preserved. Graphics, camera, colors, menus, goal/audio behavior, networking authority, and human movement physics were not retuned.
