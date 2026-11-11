# Teamball 15

## Upgrade from 14.1

1. Stop the old server and keep its folder as a backup.
2. Extract this ZIP into a new folder. Install Node.js 20+ if needed.
3. Copy your latest `bot-memory/` and, if present, `server-data/` from your old installation into this folder. These preserve training progress and accounts. The included memory is only the supplied build snapshot.
4. Preserve any newer custom files in `public/audio/` and your jersey assets. This build retains the supplied audio, shirts, CSS, scoreboard styling and halftime goal-color changes. If you edited source code since 14.1, compare those edits rather than replacing entire new modules.
5. Run `START-TEAMBALL.cmd`, then open http://localhost:25568/. Refresh existing browser tabs.

## Changes

- Kickoff takers start with 48 units of empty space between their circle and the ball.
- Scoring bots sometimes celebrate by pulsing their kick ring.
- Field labels are 1v1 through 5v5. Removed redundant slogans and help text.
- Settings are available before entering the park and during matches.
- Practice fields and local drill menus have been removed. The park now contains only the five match fields, 1v1 through 5v5. Previously saved practice replays remain readable.
- The park is now 5000 × 2800, with full-size pitches, connecting promenades, a central plaza, gardens, trees, benches and lights. Press M while roaming to toggle an overview with your location and live field occupancy; the header also has a Park map button.
- At 0:00, a team can finish its attack when its last touch has put the ball in the opposing half. Play continues until a goal or return across midfield, then settles full time or starts golden-goal overtime if tied. The HUD shows LAST ATTACK while the clock stays at 0:00.
- Finished matches show a transparent Win/Loss/Draw summary from your team's perspective. Match details opens the full report, heatmap and replay information on request. Local spectators receive a neutral score summary.
- Between park matches, the summary, HUD and match menu show the server's eight-second countdown to the next match. The timer clears when the next kickoff begins; a lost connection shows a waiting message.
- Halftime plays the configured kickoff whistle twice with 0.5 seconds of silence between them. Full time plays it three times with 0.5 seconds before the second and 0.75 seconds before the final whistle. Subtle pitch differences vary each blow, and timing accounts for each shifted clip's full duration. Muting or leaving the field cancels pending sounds. The gaps and pitch rates are adjustable in `public/js/customize.mjs`.
- Choose Classic confetti or Fiery burst under Goal explosion in the main menu, park/match settings or private-room menu. The browser saves your selection and multiplayer shares it with everyone. Each credited goal uses its scorer's selected effect; replays keep that effect even if the player changes their choice later. Uncredited/own goals use classic confetti. Reduced-motion preferences disable both effects.
- Fiery goals layer a short explosion sound over the goal cheer, following the game volume. Replace `public/audio/goal-fire.wav` or adjust `SOUNDS.fireGoal` in `public/js/customize.mjs` to customize it.
- Bots smooth their steering, anticipate nearby players, maintain post coverage, conserve stamina and consider opponents' stamina. They can hold kick during challenges, use wall self-passes, shoot from range and push the ball forward to chase it.
- During nearby corner pressure, near-post defenders target a position tangent to the field side of the post, directly left/right of it. Central pressure keeps normal goal coverage. Own-goal-area decisions penalize dangerous lateral passes.
- Bots walk during protected kickoff and small defensive adjustments. Corner rotations use reserve-limited bursts; actual incoming goal threats can still use emergency sprint. These limits also apply to saved neural models, and learned movement cannot pull a post guard into the net.
- Stamina recovery is 20 per second (reduced from 22); the recovery delay remains 0.45 seconds. This applies equally to humans and bots in matches.

## Training after these adjustments

Reinforcement cycles may improve movement and sprint choices, but improvement is not guaranteed. Each cycle first imitates the current Expert, then trains with self-play and benchmarks the candidate before promotion. The current reward has no explicit stamina-conservation or kickoff reward, so training alone is not a reliable fix for those issues. The corrected post target and sprint limits apply immediately after restarting the server and refreshing browser clients; later training cycles use the corrected Expert and stamina rules. Training is optional for these fixes, and existing bot memory/models remain compatible.

## Optional CUDA training

Run `INSTALL-CUDA-TRAINING.cmd` on a Windows host with a compatible NVIDIA GPU. It installs optional PyTorch into the training virtual environment and tests an actual CUDA operation. CPU-only play and training remain available without it.

Automatic server training reads `neuralDevice` in `bot-memory/training-settings.json`: `auto` (default, including when the key is absent), `cpu`, or `cuda`. Manual training also supports `--device auto|cpu|cuda`; the `TEAMBALL_TRAIN_DEVICE` environment variable supplies the manual default. Explicit `cuda` fails clearly when unavailable; `auto` falls back to NumPy CPU.

CUDA accelerates neural-network optimization. Node match rollouts and benchmark matches still run on the CPU, and idle-time scheduling still applies. Consequently, overall training-cycle speedup is not guaranteed. Existing model JSON files remain compatible. No newly trained model is claimed or shipped as a result of these checks.

The installer defaults to the official CUDA 12.6 wheel index. For a different supported GPU/driver/Python combination, select the appropriate PyTorch package at https://pytorch.org/get-started/locally/ and set `TEAMBALL_TORCH_INDEX` before running the installer.

## Easy adjustments

| File | What to adjust |
| --- | --- |
| `public/js/customize.mjs` | Kickoff gap, celebration chance/timing, text, sound paths/gains, canvas font, outlines and zoom |
| `public/js/ai.mjs` | Steering response, shot/pass choices, stamina reserves, wall runs and post positioning; comments explain the new sections |
| `public/js/park-layout.mjs` | Park bounds, spawn, field names and placement |
| `public/js/park-renderer.mjs` | Paths, gardens, scenery and overview rendering |
| `public/js/match.mjs` | Halftime and final-attack continuation rules |
| `public/js/config.mjs` | Stamina recovery and shared movement tuning |
| `public/js/goal-effects.mjs` | Goal-effect IDs, names and descriptions |
| `public/js/renderer.mjs` | Classic and fiery goal-burst appearance |
| `public/js/audio.mjs` | Whistle sequencing; gap and sound path are in customize.mjs |
| `public/index.html` | Main-menu labels, settings and dialog text |
| `public/park.css` and `public/styles.css` | Layout, fonts, colors and popup styling |
| `public/audio/` | Custom sound files referenced by `SOUNDS` |
| `bot-memory/training-settings.json` | Training settings, including optional `neuralDevice` |

Server-side rules require a Node restart. Browser appearance changes require a refresh. Keep valid JavaScript/JSON syntax when editing.

## Verification and limits

The current build passes 197 automated Node tests and 29 real Chrome browser checks, with no browser runtime errors. Tests cover whistle counts and spacing, goal-effect preferences and scorer attribution, replay preservation, multiplayer synchronization and intermission timing. Browser checks cover desktop/mobile pickers, saved selections, classic/fire effects, countdown ticking and automatic restart, M-key overview, networked LAST ATTACK at 0:00, transparent summary and details on demand. Captures and browser results are under `tests/screenshots/`; the optional browser harness is `tests/park-browser15.mjs` (requires a separately installed playwright-core package and Chrome, configurable with TEAMBALL_PLAYWRIGHT_MODULE and TEAMBALL_BROWSER). The previous park/results update also completed ten seeded matches with 60-second regulation (two per size), with finite physics and extended final attacks.

The earlier corner/stamina update passed 168 automated Node tests, including 21 defensive-positioning and stamina regressions. These exercise both teams, both halves, both posts and a neural model biased toward inward movement and excessive sprint. The original Build 15 release passed 147 tests and ten full-duration simulations totaling 54.141 live minutes; its historical results remain under `tests/`.

A fixed-seed sample against 14.1 showed about 59% lower average per-tick movement-input change. This measures input smoothness, not player satisfaction or guaranteed stronger play. Human multiplayer playtesting is still needed.

CPU fallback was smoke-tested; CUDA execution and Windows installation were not hardware-tested here. Human multiplayer playtesting remains useful for judging feel and match balance.
