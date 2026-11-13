# Active opponent memory

`public/js/ai-active-memory.mjs` samples authoritative player movement at most every 150 ms. It tracks current-match boost usage, reversals, direction changes, lateral preference, straight runs, wall positioning, challenges, and observed kicks. Recent observations carry more weight. Confidence increases with supporting observations and stays below one. The predictor can use these tendencies; they are descriptive evidence, not calibrated action probabilities. Kickoff resets short motion history while retaining match observations.

`active-match-store.mjs` keeps persistent data in `bot-memory/active-match-memory.v1.json`. It does not read or write offline trainer memory, neural models, or training configuration. Online rooms and the park capture only opted-in human participants. Interrupted games and bot-only games cannot become candidates. Completed opted-in human matches produce candidates, without activating their patterns. Bot evaluations have a separate bounded collection.

Consent is checked at every capture, including the completion tick. Revocation or departure discards that participant's earlier observations from the unfinished match. A replacement occupying the same player slot starts fresh evidence; connection identifiers are used only in memory and never persisted. Restart and server-close hooks release sessions.

Inspect and review from the project directory:

```powershell
node active-memory-tool.mjs status
node active-memory-tool.mjs list
node active-memory-tool.mjs import .\local-match-candidate.json
node active-memory-tool.mjs approve MATCH_ID_1 MATCH_ID_2 MATCH_ID_3 --review "Reviewed independent opponents and situations; useful movement tendencies"
node active-memory-tool.mjs reject MATCH_ID_4
node active-memory-tool.mjs rollback 0
```

Approval requires explicit review notes, at least three completed human matches per promoted mode, at least 20 observations in each selected match, and at least 60 observations per mode. This is a minimum evidence gate; the reviewer must check opponent diversity and quality. Approval promotes measured mode-specific movement priors. It cannot tune tactical weights, physics, or neural models. A prior contributes at most 30% to a previously unseen opponent and fades as that opponent is observed. Successful strategies are not automatically promoted from one match.

The store retains at most 100 candidate records, 50 rejection records, 40 bot evaluations, 16 concurrent observation sessions, and ten prior policy versions. Each session has at most ten player summaries, with no replay frames or player names. Loading limits the file to 512 KB, validates modes, status, scores, participant and sample counts, numeric ranges, approval versions, and duplicate IDs, and strips unknown fields. Invalid storage is reported by the status command. Writes use an atomic replacement; save errors appear in server output and status.

The live server owns writes while running. The CLI uses its loopback administration endpoint and existing private server token. Approval and rollback affect reference snapshots attached to the next match; an ongoing match keeps its original reference. With the server stopped, the same commands edit the independent active-memory file directly. The local endpoint is `/_teamball/ai/active`; it is read-only without the administration token.

After completing a local human match, the existing browser diagnostics expose `window.teamball.learningCandidate()`. Calling it explicitly exports only the local human's aggregate observations and completed result. It includes no opponent data, names, or inputs. Save its returned JSON to a file and import it using the command above. The import remains an unapproved candidate, identifies its origin as `local-browser`, and uses the same multi-match review gate. Repeated exports of one match keep the same ID and cannot count as independent evidence. Spectator, practice, interrupted, and unfinished games cannot export. The reviewer must assess locally supplied evidence; it is labelled separately from server-authoritative records. Approved priors are fetched when the local page loads and snapshotted when starting a match; reload the page after changing approvals to use the new version locally.

This module adds independent active memory. Existing opt-in replay recording and legacy trainer-consumed learning retain their previous behavior. There is no claim that these descriptive priors alone improve win rate: repeated-pattern tests verify adaptation, and match benchmarks must establish tactical value.
