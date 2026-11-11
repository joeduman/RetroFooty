# Expert runtime performance

Measured 2026-11-11T08:08:21.223Z. v26.13.0; Intel(R) Core(TM) i7-10750H CPU @ 2.60GHz. Fixed tick budget: 8.33333 ms. 30 simulated seconds per case after 8 seconds of excluded warmup.

| Whole tick | Controller | p50 ms | p95 ms | p99 ms | Ticks over budget |
|---|---|---:|---:|---:|---:|
| single-5v5 | frozen-previous-Expert | 0.0956 | 0.2515 | 0.3986 | 0/3600 |
| single-5v5 | predictive-Expert | 0.1122 | 0.3967 | 0.7437 | 0/3600 |
| park-all-five-courts | frozen-previous-Expert | 0.286 | 0.5146 | 0.6916 | 0/3600 |
| park-all-five-courts | predictive-Expert | 0.3633 | 0.7764 | 1.1246 | 0/3600 |

| Controller calls | Planning p50 | Planning p95 | Planning p99 | Ordinary p50 | Ordinary p95 | Ordinary p99 |
|---|---:|---:|---:|---:|---:|---:|
| single-5v5 frozen-previous-Expert 5v5 | 0.044 | 0.1158 | 0.1875 | 0.0308 | 0.1001 | 0.2161 |
| single-5v5 predictive-Expert 5v5 | 0.2594 | 1.0207 | 2.1994 | 0.0368 | 0.1868 | 0.3589 |
| park-all-five-courts frozen-previous-Expert 1v1 | 0.0059 | 0.0141 | 0.0309 | 0.0033 | 0.0096 | 0.0277 |
| park-all-five-courts frozen-previous-Expert 2v2 | 0.0102 | 0.0235 | 0.0433 | 0.0069 | 0.0159 | 0.034 |
| park-all-five-courts frozen-previous-Expert 3v3 | 0.0171 | 0.0387 | 0.0505 | 0.0113 | 0.028 | 0.0502 |
| park-all-five-courts frozen-previous-Expert 4v4 | 0.0227 | 0.0526 | 0.0867 | 0.0166 | 0.042 | 0.0682 |
| park-all-five-courts frozen-previous-Expert 5v5 | 0.0329 | 0.0704 | 0.1003 | 0.0243 | 0.0545 | 0.0827 |
| park-all-five-courts predictive-Expert 1v1 | 0.1658 | 0.4971 | 0.5786 | 0.0046 | 0.0494 | 0.0889 |
| park-all-five-courts predictive-Expert 2v2 | 0.1328 | 0.6971 | 0.9173 | 0.0085 | 0.0746 | 0.1289 |
| park-all-five-courts predictive-Expert 3v3 | 0.1498 | 0.3571 | 0.4629 | 0.0134 | 0.0936 | 0.1699 |
| park-all-five-courts predictive-Expert 4v4 | 0.1515 | 0.3552 | 0.5509 | 0.0198 | 0.1241 | 0.2036 |
| park-all-five-courts predictive-Expert 5v5 | 0.1761 | 0.3971 | 0.6234 | 0.0288 | 0.1456 | 0.2363 |

Forced synchronized five-field planning burst (120 samples): p50 1.0105 ms, p95 1.7044 ms, p99 2.0332 ms; 0 exceeded the fixed tick budget. This case forces all five planners to refresh every sampled tick to expose worst-case scheduling cost.

The profile measures actual Match.update and ParkWorld.tick with no sockets, rendering, snapshot serialization or persistence service. It includes 30 Park bots. Independent deterministic baseline/candidate runs use identical seeds; match states diverge as policies act differently. Wall tails include scheduler/GC pauses and may include concurrent host load. CPU timings, source hashes, per-field planning/ordinary sample counts and concurrency buckets are in performance.json.
