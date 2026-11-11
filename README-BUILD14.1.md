# TEAMBALL BUILD 14.1 — Halftime + Human-Style AI + Video Review

This release is based on Build 14.0.2 *plus your five latest uploaded
renderer, CSS, networking, park and prediction files*. It modifies the actual
existing game rather than replacing the engine or online park.

## Changes

1. Team-colored names: red team names coral/red; blue team names light blue.
   This applies to both bots and players on the field, regardless of shirt style.
2. Regulation halftime: after half the clock has elapsed, the ball is allowed
   to finish its ongoing attack in the attacking half. The half ends when it
   returns over the midfield line (or a goal ends the attack). The game pauses
   3 seconds, then red and blue swap goals and restart, retaining score/stats.
   The top HUD displays `LAST ATTACK` during the extra possession.
   Practice sessions, overtime and sub-30-second diagnostic simulations are
   unchanged. **This is an attacking-possession extension, not a wall at midfield.**
3. All five game modes use the same halftime rule in full-length matches.
   The bots adapt their attack and defense direction accordingly. Goal scoring,
   shot maps, neural policy input features, network prediction, spectator
   playback and server-side human training samples also use the new direction.
4. Human playstyle opponents: with players' explicit training consent, the
   server saves human behavior from park fields **and private rooms**. Python
   groups recorded actions into rough pressing / technical / patient types and
   trains separate neural opponent policies when sufficient data exists. These
   play against future candidates in roughly half of self-play simulations.
   A successful benchmark is still required before replacing the live champion.
5. Video review: the optional OpenCV importer can inspect *locally stored* MP4
   footage, including user-supplied YouTube recordings. It estimates field/team
   spacing and simple ball/wall tendencies, exports a JSON review file, and
   can—only when explicitly approved—use weak tactical variations for a share
   of self-play opponents. Video pixels **do not provide authentic player
   controls**, so this is not direct neural behavior cloning from YouTube.
6. Existing ball physics, post/net collisions, seven-percent larger 3v3–5v5
   fields, replays, custom shirts, park, accounts and overnight control scripts
   remain available.

## Install on Windows

**Recommended: extract the complete Build 14.1 ZIP into a new folder.**
- Stop Build 14.0.2 before launching the new folder on the same port.
- Copy your previous `bot-memory` folder into the new folder to retain all
  learning history, neural champions, human recordings and overnight settings.
  Do not overwrite an existing `bot-memory` folder with the empty starter data.
- To retain account data, privately copy `server-data` as well.
- Double-click `START-TEAMBALL.cmd` to start the game and use your usual URL.
- Python is optional for gameplay. For AI learning, use `INSTALL-AI-TRAINING.cmd`
  once and `START-OVERNIGHT-AI.cmd` as before.
- To analyze an MP4 locally, run `INSTALL-VIDEO-ANALYSIS.cmd`, then drag your
  MP4 onto `ANALYZE-VIDEO.cmd`. The importer requires a local video file, not
  just a YouTube watch URL.

If you prefer a patch, stop your old server and unzip the Build 14.1 PATCH
into the Build 14.0.2 **game root**, overwriting only listed source files.
Back up the old folder first. The patch excludes `bot-memory` and `server-data`.

## Training safeguards

- Existing Expert AI remains the fallback; candidates must pass the configured
  champion benchmark. Human-style opponents are training opponents, NOT an
  unbenchmarked replacement for your live bots.
- Human sample collection requires the established consent checkbox.
- The video import tool intentionally does not grab entire YouTube links,
  identify players, or infer invisible inputs, boost state, or exact motion
  from camera-changing footage.
- `bot-memory/models/human-styles/` and `bot-memory/video-profiles/` are both
  portable: copy the entire `bot-memory` folder between releases.
- Idle-only training, controls and memory reset/backup options remain intact.

## Verification

The existing 127 regression checks plus eight new Build 14.1 tests passed in
Linux/Node, including a live opt-in private-room capture test. A ten-match
simulation covered all five sizes on both sides; all ten finished. A Python
smoke test trained a synthetic human-style opponent and simulated an actual
match against it. The synthetic data/models are not included in the ZIP.

**Not yet verified:** full graphical Windows multiplayer playtesting, remote
Internet latency, and long-run competitive strength against expert humans.
Those need real matches and continued evaluation. No top-player capability is
claimed simply from adding this training architecture.
