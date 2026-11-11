# Expert runtime performance

Measured 2026-11-11T07:58:49.100Z. v26.13.0; Intel(R) Core(TM) i7-10750H CPU @ 2.60GHz. Fixed tick budget: 8.33333 ms. 30 simulated seconds per case after 8 seconds of excluded warmup.

| Whole tick | Controller | p50 ms | p95 ms | p99 ms | Ticks over budget |
|---|---|---:|---:|---:|---:|
| single-5v5 | frozen-previous-Expert | 0.1163 | 0.2966 | 0.4597 | 0/3600 |
| single-5v5 | predictive-Expert | 0.1257 | 3.0278 | 4.4377 | 0/3600 |
| park-all-five-courts | frozen-previous-Expert | 0.393 | 0.8036 | 1.0546 | 0/3600 |
| park-all-five-courts | predictive-Expert | 0.5215 | 6.7116 | 9.6539 | 68/3600 |

| Controller calls | Planning p50 | Planning p95 | Planning p99 | Ordinary p50 | Ordinary p95 | Ordinary p99 |
|---|---:|---:|---:|---:|---:|---:|
| single-5v5 frozen-previous-Expert 5v5 | 0.0569 | 0.1556 | 0.3336 | 0.0386 | 0.1216 | 0.2063 |
| single-5v5 predictive-Expert 5v5 | 3.3411 | 5.004 | 5.6541 | 0.0569 | 0.2802 | 0.4563 |
| park-all-five-courts frozen-previous-Expert 1v1 | 0.0101 | 0.0309 | 0.045 | 0.005 | 0.0189 | 0.0328 |
| park-all-five-courts frozen-previous-Expert 2v2 | 0.0167 | 0.0482 | 0.0769 | 0.0113 | 0.0341 | 0.0516 |
| park-all-five-courts frozen-previous-Expert 3v3 | 0.0283 | 0.0639 | 0.0884 | 0.0169 | 0.0492 | 0.0858 |
| park-all-five-courts frozen-previous-Expert 4v4 | 0.0365 | 0.0783 | 0.1369 | 0.0244 | 0.0659 | 0.1027 |
| park-all-five-courts frozen-previous-Expert 5v5 | 0.0506 | 0.1214 | 0.1816 | 0.0366 | 0.0911 | 0.1629 |
| park-all-five-courts predictive-Expert 1v1 | 3.1335 | 5.2889 | 5.5798 | 0.0076 | 0.0729 | 0.1301 |
| park-all-five-courts predictive-Expert 2v2 | 3.4573 | 5.224 | 5.8861 | 0.0148 | 0.1234 | 0.2198 |
| park-all-five-courts predictive-Expert 3v3 | 3.5466 | 5.5546 | 6.0158 | 0.0233 | 0.1525 | 0.2714 |
| park-all-five-courts predictive-Expert 4v4 | 3.5825 | 5.2885 | 6.1722 | 0.0321 | 0.1882 | 0.3088 |
| park-all-five-courts predictive-Expert 5v5 | 3.6317 | 5.5346 | 6.2595 | 0.0462 | 0.2214 | 0.3857 |

Forced synchronized five-field planning burst (120 samples): p50 12.9316 ms, p95 17.7998 ms, p99 18.8779 ms; 120 exceeded the fixed tick budget. This case forces all five planners to refresh every sampled tick to expose worst-case scheduling cost.

The profile measures actual Match.update and ParkWorld.tick with no sockets, rendering, snapshot serialization or persistence service. It includes 30 Park bots. Independent deterministic baseline/candidate runs use identical seeds; match states diverge as policies act differently. Wall tails include scheduler/GC pauses and may include concurrent host load. CPU timings, source hashes, per-field planning/ordinary sample counts and concurrency buckets are in performance.json.
