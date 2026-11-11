# Final Expert comparison

The frozen predictive candidate won **147, drew 37 and lost 16** against the previous Expert across **200 completed matches**: **73.5% win rate**, 82.75% draw-adjusted score, and **365–70 goals**. Every mode had a positive paired mean goal difference with its approximate 95% interval above zero. This demonstrates a substantial improvement against this previous controller on the tested maps and seeds. Elite-human strength remains unmeasured.

Raw evidence: [all 200 match records and source hashes](benchmark-results.json), [independent frozen-versus-frozen control](baseline-results.json), [benchmark protocol and metric definitions](benchmark-method.md), [160 saved-situation trials](scenario-results.json), [scenario interpretation](scenarios.md), and [reviewed gameplay references](gameplay-analysis.md).

The run used 20 paired seeds per mode, `42000 + 7919*i` for `i=0..19`; each seed assigned the candidate red and blue in separate matches. Starting sides alternated, and ordinary halftime side changes remained enabled. Maps were the unchanged build-15 `createPitch(size)` layouts. Both policies used default parameters with no neural model. Regulation was 60 seconds; existing finish-the-attack rules extended some periods. Total measured live play was **237.945 minutes**, with **zero unfinished matches and zero non-finite states**. Candidate and engine source hashes stayed unchanged throughout (`sourcesChanged: false`).

The exact final candidate SHA-256 is `5dd46185eeeec8f4da9c1b7f907744e27fb0683ee5efe6eafabd11e6d944861c`. The original Expert source hash is recorded in the frozen-fixture manifest. Earlier `iteration-*.json` files are diagnostic development screens, not final-version evidence.

| Mode | Matches | Candidate W / D / L | Win rate | Candidate goals for / conceded per match | Mean goal difference | Approx. 95% interval, paired by seed |
| --- | --- | --- | --- | --- | --- | --- |
| 1v1 | 40 | 32 / 4 / 4 | 80.0% | 3.000 / 0.900 | +2.100 | +1.387 to +2.813 |
| 2v2 | 40 | 25 / 12 / 3 | 62.5% | 1.075 / 0.200 | +0.875 | +0.493 to +1.257 |
| 3v3 | 40 | 24 / 11 / 5 | 60.0% | 1.200 / 0.350 | +0.850 | +0.417 to +1.283 |
| 4v4 | 40 | 31 / 6 / 3 | 77.5% | 1.675 / 0.175 | +1.500 | +1.073 to +1.927 |
| 5v5 | 40 | 35 / 4 / 1 | 87.5% | 2.175 / 0.125 | +2.050 | +1.674 to +2.426 |

The intervals use 20 seed-pair averages per mode and a normal approximation. They describe variability across these deterministic fixtures, not uncertainty over all possible human opponents. Wins, draws and losses remain separate; decisive-game Wilson intervals are also retained in the raw JSON but are not a substitute for the paired analysis.

| Mode | Nearest-teammate spacing, candidate / previous (px) | Clustered samples, candidate / previous | Completed passes, candidate / previous | Role changes per match, candidate / previous |
| --- | --- | --- | --- | --- |
| 1v1 | — | — | 0 / 0 | — |
| 2v2 | 219.3 / 176.9 | 3.36% / 15.08% | 71 / 104 | 36.35 / 43.25 |
| 3v3 | 279.9 / 191.7 | 5.14% / 11.53% | 182 / 139 | 56.13 / 66.35 |
| 4v4 | 220.6 / 147.9 | 10.00% / 22.98% | 249 / 245 | 83.43 / 98.35 |
| 5v5 | 168.3 / 146.3 | 18.79% / 22.36% | 269 / 296 | 96.05 / 111.13 |

Spacing improved and role changes decreased in every team mode under these proxies. Completed passes increased in 3v3 and slightly in 4v4, but decreased in 2v2 and 5v5; overall counts were **771 versus 784**. The support-availability proxy also decreased in 3v3–5v5 despite greater separation. Wider spacing therefore does not establish universally better passing support. Dangerous-pass creation and reliable multi-player combinations still need more precise outcome labels and refinement.

| Mode | Boost points spent per team per match, candidate / previous | Change | Mean boost during sampled danger, candidate / previous | Protected-kickoff boost spent |
| --- | --- | --- | --- | --- |
| 1v1 | 671.14 / 595.80 | +12.6% | 48.83 / 46.31 | 0 / 0 |
| 2v2 | 773.60 / 868.86 | −11.0% | 72.16 / 78.23 | 0 / 0 |
| 3v3 | 933.86 / 1065.21 | −12.3% | 81.26 / 85.59 | 0 / 0 |
| 4v4 | 1067.16 / 1017.09 | +4.9% | 83.12 / 92.38 | 0 / 0 |
| 5v5 | 1117.90 / 1125.39 | −0.7% | 89.69 / 93.97 | 0 / 0 |

Total boost expenditure was **182,546.43 versus 186,894.15 points**, 2.33% lower overall. The 1v1 candidate spent more boost while scoring and winning more; lower total expenditure is not the sole objective. Mean reserve at dangerous moments fell in most team modes, so the data do not support claiming universally better stamina reserves. Protected-kickoff expenditure was already zero in the baseline and remained zero in the candidate.

| Mode | Classified shot attempts, candidate / previous | Classified on-target fraction, candidate / previous | Candidate goals per classified shot / previous |
| --- | --- | --- | --- |
| 1v1 | 731 / 262 | 51.03% / 76.72% | 0.164 / 0.137 |
| 2v2 | 776 / 167 | 54.51% / 68.26% | 0.055 / 0.048 |
| 3v3 | 594 / 76 | 47.98% / 69.74% | 0.081 / 0.184 |
| 4v4 | 757 / 30 | 61.56% / 60.00% | 0.089 / 0.233 |
| 5v5 | 937 / 25 | 63.50% / 76.00% | 0.093 / 0.200 |

The candidate generated far more classified shot attempts and more actual goals, while its classified on-target fraction decreased in four of five modes. Holding the kick input through contested contacts/cooldowns helps win duels but also generates pressure kicks that are not carefully selected finishes. This is a measurable accuracy tradeoff; “perfect shooting” has not been achieved. The existing straight-ray classifier can miss bank/contact goals and misclassify some pressure kicks, so goals per classified shot is **not a calibrated shot-conversion metric**. The benchmark does not fabricate a scoring-probability estimate from those labels.

Own-goal credits fell from **34 to 4**, **88.24% lower in this head-to-head sample**, short of the proposed 90% target. The mode counts were candidate/previous: 1v1 **0/1**, 2v2 **0/3**, 3v3 **3/4**, 4v4 **1/12**, 5v5 **0/14**. These counts are influenced by each policy facing a different-strength attack and do not independently isolate the own-goal safeguard's causal effect.

Own-directed contact samples fell from **3,584 to 1,503**, 58.06% lower. This proxy includes intentional recycling and defensive contacts, so it does not prove a 58% reduction in unintended own-goal mistakes. Stationary-control loop episodes remained **7 versus 7**; the proposed 90% loop reduction was **not demonstrated**.

The strict saved-situation screen found a completed give-and-go in one candidate trial, better wall shielding, and partial goal-line defense improvement. It did not establish a reliable three-player sequence or bank scoring; it also exposed weaker predictable-pass interception and high-speed counterattack outcomes in those particular fixtures. The full [scenario report](scenarios.md) includes those failures instead of inferring tactical completion from action names.

The 200-match run took 202.14 seconds of measured wall time on this machine, including both controllers and shared Match/Physics. This is a throughput observation, not a production frame-time budget. [The separate runtime profile](performance.md) measures controller latency; neither this benchmark nor the profile exercises a real multiplayer server under network load.

The highest-priority next evaluations are: strong-human 1v1/2v2 encounters; failed-challenge recovery and pass-interception fixtures; more selective pressure-kick finishing; receiver spacing that improves dangerous-pass completion; and demonstrated bank/three-player combinations across varied states. Live adaptation has evidence-collection tests, but a matched adaptation-on/off win-rate benefit remains unmeasured. These limits do not erase the measured controller-versus-controller gain, and that gain does not establish elite-human dominance.
