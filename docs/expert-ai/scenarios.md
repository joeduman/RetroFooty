# Saved-situation outcomes

The final frozen candidate was evaluated with `node tests/expert-scenario-evaluate.mjs --seeds=2 --horizon=8`. Raw events, state orientation, controller hashes, and success definitions are in [scenario-results.json](scenario-results.json). The source-hash comparison stayed unchanged during this run. It ran **160 trials**: 20 scenarios, two controller seed variants, two orientations, and previous/candidate policy. Each policy therefore has four trials per scenario.

These are short diagnostic situations, with explicit fixed positions and mirrored orientations. Several seed variants produce the same deterministic actions; they are not independent competitive samples. Both teams use the evaluated policy, so this screen tests physical outcomes rather than measuring candidate-versus-baseline win rate. [The separate match benchmark](benchmark-method.md) provides that competitive comparison.

| Situation | Concrete success condition, within eight seconds | Previous Expert | Candidate Expert |
| --- | --- | --- | --- |
| 1v1 open goal | Red scores before conceding | 4/4 | 4/4 |
| 1v1 low-boost defender | Red scores against the defender starting with four stamina points | 0/4 | 0/4 |
| 1v1 wall shielding | Red touches, advances ≥70px, retains final ball touch, and does not concede | 0/4 | 4/4 |
| Ball trapped at wall | Ball leaves the initial wall by ≥55px and red owns the final touch, or red scores | 1/4 | 0/4 |
| Defensive near-post coverage | No goal conceded; red touches or clears beyond its defensive third | 4/4 | 4/4 |
| Goal-line attacker | No goal conceded; red touches or clears beyond its defensive third | 0/4 | 2/4 |
| Direct shot from space | Red scores before conceding | 4/4 | 4/4 |
| Bank-shot opportunity | Red scores after an actual deliberate kick followed by an actual wall event | 0/4 | 0/4 |
| Two-player give-and-go | Completed uninterrupted passes A→B→A, within 3.5s of the first receipt | 0/4 | 1/4 |
| Three-player sequence | Completed uninterrupted passes A→B→C, all distinct, within 4.5s | 0/4 | 0/4 |
| Predictable-pass interception | Red makes the first registered contact with the initially blue-directed ball | 2/4 | 0/4 |
| Sudden attacker reversal | No goal conceded; red touches or clears beyond its defensive third | 4/4 | 4/4 |
| High-speed counterattack | Red scores, or advances ≥160px into the attacking third with red final touch | 1/4 | 0/4 |
| Loose ball near own goal | Red touches and clears beyond the 200px danger band at some point without conceding | 0/4 | 0/4 |
| Protected kickoff | Zero red stamina expenditure while authoritative kickoff protection is active | 4/4 | 4/4 |
| Missed-challenge recovery | No goal conceded; red touches or clears beyond its defensive third | 0/4 | 0/4 |
| Advanced team spacing | Under 10% clustered red-player samples plus a completed pass, without conceding | 0/4 | 0/4 |
| Sweeper attacking rotation | Cover advances >60px while another player remains ≥60px goal-side of the ball, without conceding | 4/4 | 4/4 |
| Half/side switching | Red scores after the side swap before conceding | 0/4 | 0/4 |
| Repeated opponent technique | ≥18 observed opponent samples and tendency confidence >0.45 | 0/4 | 4/4 |

An actual give-and-go completed in one candidate trial. A diagnostic `give-and-go` action label alone does not count. No completed three-player sequence or bank goal was observed in these original fixtures. A separate physically viable fixture in `tests/expert-controller.test.mjs` selects and scores a bank shot through a real wall rebound for both teams and both halves. That establishes the bank capability; reliable competitive bank finishing and three-player combinations remain unproven.

The wall and goal-line results show useful progress in these particular states, while the predictable-pass and high-speed counterattack criteria regressed. The latter are concrete next refinement targets. The goal-line defender did not succeed in every orientation/seed, so these measurements do not support a blanket statement that corner play is solved.

The own-goal loose-ball trace distinguishes initial danger handling from later match outcome: in an unmirrored candidate trial the bot contacted the ball at 1.146s and safely kicked it outward at 1.425s. A later counterattack scored at 5.038s, so the trial failed the full eight-second no-concede criterion. This is not evidence that the initial clearance dribbled into its own goal. The failed-challenge fixture is harder: the attacker scored around 1.446s before the defender registered a touch.

Some zeroes require narrower interpretation. A low-boost defender regenerates stamina under the unchanged engine, so its initial advantage is temporary. The bank setup is an opportunity, not proof that a bank is the uniquely best choice. The advanced-spacing success condition also requires a completed pass, so failure alone does not prove poor separation. The side-switch condition requires scoring; separate regression checks verify the attacking direction itself. No new movement or physics advantage was used to force those conditions to pass.

The repeated-technique row confirms live observations accumulate and become confident. It does **not** establish better defense or win rate against repeated patterns; that needs paired encounters with adaptation enabled/disabled and matched opponent inputs. Persistent approval and rollback tests are separate from this scenario screen.

No 90% own-goal/loop-reduction target or elite-human performance target can be established by four trials per policy. The complete raw outcomes are retained so later improvements can be compared against the same states and strict definitions.
