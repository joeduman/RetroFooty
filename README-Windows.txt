TEAMBALL — BUILD 15
===================

Start with README-BUILD15.md for upgrade instructions, CUDA setup, changes and editable settings.
Extract into a new folder; keep your old installation and latest bot-memory/server-data.
Run START-TEAMBALL.cmd, then open http://localhost:25568/.
Requires Node.js 20+.

The following notes are retained as historical Build 13 documentation:

TEAMBALL — BUILD 13.0 (UPGRADE FROM 12.5)
======================================

START PLAYING
1. Keep your entire Build 12.5 folder as a backup. DO NOT replace it.
2. Extract Teamball-13.0.zip to a new folder (not inside the old folder).
3. Install Node.js 20 or newer, if not already installed.
4. Double-click START-TEAMBALL.cmd in the new folder.
5. Open http://localhost:25568/ if the launcher does not open a browser.
6. Park: choose display name, optionally consent to input recording, and enter any field.
7. Local: /local.html to play matches, review saved browser replays, and select bot difficulty. Practice drills have been removed. In the park, press M to toggle the overview while off a field.
8. Accounts/stats: /account.html (local HTTPS-safe account setup, details below).

STOP
Double-click STOP-TEAMBALL.cmd in this folder, or run: node stop.js
Only this copy should be stopped by the stop script. Stop Build 12.5 before
running Build 13.0 if both use the same 25568 listening port.

BOT MEMORY THAT SURVIVES FUTURE BUILDS
Bot memory starts in bot-memory/teamball-bot-memory.v1.json.
Eligible opt-in online matches produce compressed archive files in bot-memory/replays/.
This whole bot-memory/ folder is your portable training state. BACK IT UP.
Never put it into an online public folder or share private raw recordings casually.

To migrate to Build 14.0 later:
1. Stop both game servers.
2. Copy the complete bot-memory folder to the future build folder.
3. Restart the new build. The v1 save format is versioned separately from the game.
4. If a future build changes the format, it must offer a migration converter.

Convenient host commands, run in a PowerShell or Command Prompt opened IN this folder:
 node bot-memory-tool.mjs status
 node bot-memory-tool.mjs export learned-policy-backup.json
 node bot-memory-tool.mjs import learned-policy-backup.json
 node bot-memory-tool.mjs pause
 node bot-memory-tool.mjs resume
 node bot-memory-tool.mjs reset

The export JSON preserves aggregate learned policy and human-action contexts;
copy the WHOLE bot-memory folder to preserve the raw replay library as well.
Import/reset create a .bak backup of the existing memory file.

BACKGROUND TRAINING
- Enabled by default when nobody is connected. Pauses when any player connects.
- Separate worker thread runs short competitive bot-vs-bot benchmark matches.
- Eligible human match recordings are analyzed, replayed, and compared as
  additional training signal. Training is bounded and does not promise endless
  improvement or exact video-derived tactics.
- Pause/resume using the CLI above. Server polls settings once per second.
- When a candidate becomes measurably worse, it is rejected in favor of the
  incumbent champion policy. Stronger candidates can be promoted.
- The live physics engine and 60 Hz park snapshot cadence remain unchanged.
- Default park bots use EXPERT difficulty. Local play has Beginner, Intermediate,
  Advanced and Expert. Levels change reaction/positioning/boost judgment.

ACCOUNT LOGIN & PRIVACY
- Guest play remains available. Email/password accounts can be created at
  /account.html on localhost, with persistent stats in server-data/accounts.json.
- Passwords are stored as salted, scrypt-hashed values; sessions are cookies.
- IMPORTANT: Email verification, password reset and email delivery are NOT yet
  implemented. Production public accounts require an HTTPS reverse proxy,
  verified login, backup/recovery and an SMTP/email provider.
- Remote public HTTP password login is blocked. With a properly restricted
  localhost HTTPS reverse proxy set TEAMBALL_HTTPS_PROXY=1. Do not set that
  variable for a directly exposed HTTP server.
- Training consent is optional and off by default. Only opted-in human match
  inputs are included in the server training replays. Portable bot policy JSON
  has no email addresses or password hashes.
- Account statistics include win rate, shot accuracy, passes, own goals,
  match-size splits and heat/shot/pass maps.

NEW GAMEPLAY
- More aggressive front-post positioning and sweeper-style defensive rotation.
- Strategic defensive clearances and safer passing in the defensive half.
- Four bot difficulties, with expert using faster decisions and prediction.
- Ball spin curve increased slightly: 0.095 -> 0.106; all other physics
  numbers were kept at 12.5 defaults.
- Five-second teammate assists and opponent passive-deflection goal credit.
- New actual flight paths and locations for shots in post-game report.
- Explicit red/blue full-time scoreboard labels.

NOTES
- Port 25568 is preserved from Build 12.5, NOT changed to 6969.
- Local browser replay history stays in each browser's IndexedDB. Do not delete
  your browser's storage expecting this ZIP to restore it.
- The original Teamball 1/2 clips were used as qualitative reference.
  This release has NOT trained a neural network from YouTube frames or inputs.
- Do not publicly expose the server over plaintext HTTP when accounts matter.
- Developer checklist, actual tests and feature limits: README-BUILD13.md.
