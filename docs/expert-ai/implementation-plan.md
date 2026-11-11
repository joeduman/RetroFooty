# Expert AI implementation plan

The authoritative project is build 15. Audit completed before editing the live controller. `Match` owns `AIController`; it writes only legal player inputs. `PhysicsEngine.motor`, `shoot`, `discs`, and `boundaries` own all movement, stamina, contact, spin, rebounds, and scoring. Match owns countdowns, live kickoff protection, halftime direction changes, networking snapshots, and reports.

1. Freeze the original controller for reproducible comparisons and offline-trainer compatibility. Record SHA-256 hashes of physics, controls, trainers, training configuration, and existing model/learning stores. Run existing tests before changes.
2. Add bounded ball forecasts using authoritative physics, acceleration/stamina-aware reachability, moving-defender lane evaluation, and legal bank geometry.
3. Extend Expert decisions with ball races, purposeful containment, candidate shots/passes/escapes, controlled approach, useful boost evaluation, progress monitoring, and stable team intentions. Preserve difficulty and learned-model interfaces.
4. Add live opponent tendencies and a separate candidate/approved persistent store with explicit approval and reversible versions. Do not write trainer data.
5. Compare actual matches against the frozen controller using paired seeds, colors, and all five modes. Exercise twenty reproducible saved-state scenarios, prediction parity, existing regressions, and CPU cost. Report measured results, including failures and unavailable human/video evidence.

Initial regression baseline: 202 tests, 197 pass, five pre-existing failures: three whistle-sequence duration tests, expired-half goal celebration timing, and absent `public/audio/goal-fire.wav`. These unrelated systems are outside this change.

Video URLs initially failed in the web fetcher. Any later extraction must distinguish actual observed frames from uninspected references. No empirical gameplay claims may be made without footage.
