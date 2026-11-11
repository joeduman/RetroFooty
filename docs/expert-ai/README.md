# Expert predictive AI overhaul

The implemented runtime Expert won **147, drew 37, and lost 16** of 200 matches against the frozen previous Expert. Each mode used 20 seeds, paired colors, alternating initial sides, unchanged build-15 pitches, and 60-second regulation with the existing half/final-attack rules. All matches completed, with no non-finite physical states. This establishes improvement against that opponent under the tested conditions. Elite-human strength and every requested acceptance target have not been established.

| Mode | Wins / draws / losses | Win rate | Goal differential per match |
| --- | --- | --- | --- |
| 1v1 | 32 / 4 / 4 | 80.0% | +2.100 |
| 2v2 | 25 / 12 / 3 | 62.5% | +0.875 |
| 3v3 | 24 / 11 / 5 | 60.0% | +0.850 |
| 4v4 | 31 / 6 / 3 | 77.5% | +1.500 |
| 5v5 | 35 / 4 / 1 | 87.5% | +2.050 |

The final source hashes stayed unchanged during the comparison. The 200 matches contained 237.945 minutes of simulated live play because existing attack-extension rules can extend regulation. Every mode's approximate paired 95% goal-difference interval was above zero. Results are specific to the frozen opponent, default policies, no neural models, maps, seeds, and shortened match duration.

## Changes delivered

- Shared, physically exact free-ball prediction through spin, drag, walls, posts, and obstacles; momentum- and stamina-aware player races.
- Future-touch candidate selection across goal segments, lead passes, restitution-aware banks, advancement, clearances, and escapes. Receiver continuation and moving-defender reach affect choices.
- A legal contact approach that moves around the collision disc, brakes using momentum, and avoids the discovered fixed-waypoint deadlock.
- Predictive containment, safe pre-armed close challenges, goal-ray/rebound rejection, and suppression of unreachable-chase boost.
- Dynamic chaser assignment, weak-side support, receiving intentions, rotating cover, and progress-triggered replanning.
- Match-local movement-tendency adaptation and an independent, bounded, reviewed candidate/approved persistent store with rollback.
- Frozen-controller comparisons, twenty saved-state fixtures, actual outcome evaluation, regression tests, source protection checks, and CPU profiling.

All movement and kicks use the existing engine inputs. The offline trainer, its settings and data interfaces, existing learner/model stores, human controls, and authoritative physics were preserved. The existing trainer entry points use the byte-identical original controller. All 22 protected file hashes match the original capture; [preservation-results.json](preservation-results.json) also verifies the current sources match the final benchmark.

## Reports and evidence

- [Implemented architecture and code entry points](architecture.md)
- [Bugs, regressions, and protected systems](regression.md)
- [Competitive benchmark results and mode analysis](benchmark.md), [raw 200 matches](benchmark-results.json), [method and baseline](benchmark-method.md)
- [Twenty scenario outcomes and failures](scenarios.md), [raw 160 scenario trials](scenario-results.json)
- [Actual sampled gameplay analysis of all six videos](gameplay-analysis.md), including timestamps, confidence, and inspectable frames
- [Learning, consent, approval, persistence, and rollback](active-learning.md)
- [Runtime profiling](performance.md), [raw timings](performance.json)
- [Original audit and implementation plan](implementation-plan.md)

Files named `iteration-*`, `scenario-iteration-*`, `regression-current.txt`, and `performance-before-broadphase.*` are historical development measurements. They do not replace the final results above. Some development runs changed sources during execution and are explicitly unsuitable for final-source claims.

## Acceptance limits and next priorities

1. **Strong-human validation remains the highest-value next step.** No experienced human opponents were available. Bot-versus-bot strength is not a human win-rate estimate; standard-length matches and diverse saved neural opponents also need evaluation.
2. **Interception and recovery need more work.** The strict predictable-pass and counterattack fixtures regressed. An initial safe clearance can still lead to conceding on a later counterattack. Improve contact-time planning and last-defender recovery without sacrificing the measured competitive gains.
3. **Combinations are possible but not consistently demonstrated.** One of four candidate give-and-go trials completed. The original three-player and bank-goal screen had zero successes. A separate physically viable bank fixture does select and score an actual wall rebound in all four team/half orientations; this proves a capability, not reliable competitive bank finishing.
4. **The proposed 90% safety/loop reductions were not reached.** Credited own goals were 4 versus 34 for the opponent (88.2% lower, with sparse mode counts and different match states). Stationary-control loop proxies were seven for each side. Intentional backward touches cannot be classified as unintended own-goal errors by this telemetry.
5. **Some secondary metrics regressed.** On-target fractions were lower in most modes as safe contested kicks became more aggressive. Total completed passes were 771 versus 784, with gains concentrated in 3v3/4v4. Spacing improved across team modes; support proxies and stamina retained during danger did not uniformly improve. The objective remained actual competitive results.
6. **Learning is bounded movement adaptation.** It does not yet discover and validate arbitrary new coordinated strategies or automatically promote tactical/neural policy changes. Reviewed priors do not establish strategic improvement by themselves. The existing legacy context API remains available, but new Expert candidate scoring does not consume its old context statistics.

Protected-kickoff boost use was zero for both versions; it was already fixed before this task. Overall boost spent was 2.3% lower, with increases in 1v1 and 4v4 accompanying higher goal production. The predictor's utility scores are not calibrated probabilities. The existing straight-ray shot classifier cannot supply a reliable conversion metric for all contact/bank goals; its `goalsPerShot` ratio must not be described as calibrated shot conversion.

Read-only local diagnostics are available as `window.teamball.ai()` alongside the existing `.snapshot()` and `.report()`. Changes are in the working tree and ready for local playtesting; no deployment or publication was performed.
