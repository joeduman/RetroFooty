TEAMBALL - BUILD 09 / VERSION 0.9.0

START
1. Extract the entire Teamball-Build-09.zip. Do not run files from inside the ZIP.
2. Open the extracted folder that contains START-TEAMBALL.cmd and server.js.
3. Double-click START-TEAMBALL.cmd. It opens http://localhost:3000/?build=09.
4. Check that the main menu and top-right corner say BUILD 09.

Node.js 20 or later is required. There are no game dependencies to install.
Leave the server window open while playing. The game runs locally on your PC.

STOP
Double-click STOP-TEAMBALL.cmd in the same extracted folder.
You can also open PowerShell in that folder and run: node stop.js
The stop command identifies this copy's own server; it does not kill every Node process.
For an older build still using port 3000, read Teamball-PowerShell-Commands.txt.

CONTROLS
Move: choose Mouse only or Keyboard only before playing (or in Settings).
Mouse mode ignores WASD/arrows; keyboard mode ignores mouse movement.
Shoot: tap or HOLD left click / Space. Held shots fire when the ball reaches you.
There is no charging; a 0.22-second cooldown prevents repeated instant impulses.
Quick taps have a 0.12-second input buffer. Shooting still needs a valid contact angle.
Sprint: hold Shift. Release to recover. Every positive amount of stamina can be used.
There is no minimum refill threshold; a tiny reserve gives a proportionally short boost.
A slow body touch is gentle; running/sprinting into a first hit adds momentum.
The ball is always free: it does not attach to your player or automatically follow turns.
Use repeated physical touches to dribble. Glancing contacts add rolling spin; opposite
contacts can reverse it. Slow down to receive, or sprint into a harder first touch.
Aim: mouse cursor; without a pointer, your current movement/facing direction.
Pause/settings: Escape.
Customize buttons and movement in Controls & settings. Preferences save in this browser.

PLAY
Choose your name, side, movement mode and 1v1 / 2v2 / 3v3 / 4v4 / 5v5.
Left = red, attacking right. Right = blue, attacking left.
Aim line: ON/OFF is on the match screen and in Audio & view.
A visible 3-2-1 countdown freezes everyone before each kickoff. The ball appears at GO.
Bots and humans have identical stamina drain, recovery delay and recovery rate.
You can move freely. There is no position selection.
Match lengths: 1v1 = 3 min, 2v2 = 4 min, 3v3 = 5 min, 4v4 = 6 min, 5v5 = 8 min.
Watch bots repeats matches with the same lengths. Escape pauses it.
Golden goal is on by default: tied matches get another 3-2-1 kickoff, then next goal wins.
Uncheck Golden goal if tied on the main menu to allow draws.
The pitch and players appear immediately. The ball appears when the kickoff countdown ends.

PRACTICE
Choose PRACTICE on the main menu. Choose the practice pitch separately, from 1v1 to 5v5.
Your selected side and controls apply. Unlimited stamina is optional in practice only.
Free pitch: unlimited time for touches, rolling contact and curved shots.
Dribble gates: 45 seconds. Carry the ball through each lit gate; shooting through it does
not count. Weave around the four solid cones and follow each lit target.
Bank & receive: 60 seconds. Hit the marked wall segment, then receive inside the circle.
Corner escape: 60 seconds. Beat the active defender and carry the ball into the exit.
Shield the circle: protect the ball for up to 60 seconds against an active challenger.
An opponent touch or the ball leaving the circle ends the challenge.
1v1 finishing: five attacks, up to 12 seconds each. Beat the defender and score.
Timed drills show their score, remaining time, instructions and best score on the pitch.
Every timed drill starts with a protected 3-2-1. Corner/bank/finishing resets get another
countdown: players, ball, stamina and challenge time all wait for GO.
Build 09 uses fresh personal bests because the sticky-ball mechanic was removed.
Personal bests save in this browser, separately for each drill, pitch and stamina setting.
Restart challenge resets its timer and score. Free pitch has a Reset ball button instead.
Change drill opens the practice menu. Finish & stats ends early and opens your report;
an early exit does not save a personal best. Practice again restarts that drill.
The practice bar shows whether shooting is armed and sprint is active/recovering.

MATCH REPORT
After full time, view goals, assists, shots, shots on target, completed passes,
touches and ball wins for each player. Select a player to inspect their movement heatmap,
distance in pitch lengths and sprint time. Warmer areas mean more time spent there.
Shots/on-target are estimates from the initial trajectory, not guaranteed final outcomes.
Passes require a teammate reception; ball wins count taking over an opponent's last touch.
OG marks an own goal. Kickoffs, pauses and respawn jumps do not add heatmap time/distance.
Reports and replays are saved from Build 09 onward; see REPLAYS & STATS below.

BUILD 09 FEEL
The Build 08 automatic carry/orbit mechanic is removed. No ball ownership or attraction.
Retains the previous walk, sprint and shot speeds, pitch sizes, players and ball radius.
Glancing contact generates spin; curve strength increases modestly (0.08 -> 0.095).
Bots make short committed boost challenges even when an opponent is close to the ball.
A blocked attacker can use a feasible bank off the side wall to run onto the rebound.
Teamball 2 footage guides the movement target; the classic visual style is retained.
Bots still make mistakes. This correction does not claim exact original-game coefficients.

REPLAYS & STATS
Open REPLAYS & STATS from the main menu or a result screen.
New matches, bot spectator rounds and practice sessions are recorded automatically.
Finishing normally saves the result. Leaving through MAIN MENU, changing drill or restarting
saves an Ended early entry with the play and stats collected up to that point.
Choose Replay for playback, or Stats & heatmap to review the stored report.
Replay controls: play/pause, timeline seek, and 0.25x / 0.5x / 1x / 2x speed. Escape pauses.
Playing a replay does not run a new simulation, change results, or control a player.
Records stay in this browser on this site address. Use the same browser, localhost name
and port to keep accessing them. Clearing site data removes them; private browsing may
not retain them. Browser storage limits still apply; a failed save is shown in the game.
An unfinished game is checkpointed every 15 seconds. A browser crash may lose the last
few seconds; the saved entry is labeled Interrupted / checkpoint, not a finished match.
Earlier builds did not record matches, so their old games cannot be reconstructed.

UPDATE AN EXISTING COPY
Stop the old server first. Extract all files together, preserving the public/js folder.
Either run the newly extracted folder directly, or copy its entire contents into your
existing teamball-engine2 folder and accept file replacement. Keep an old ZIP as backup.
Start the copy you updated. Open http://localhost:3000/?build=09 and press Ctrl+F5.
No custom pack, npm install, or Phaser setup is required for this build.

FILES
server.js / stop.js                 Local start and stop
public/index.html / styles.css      Interface
public/js/physics.mjs               Movement, collisions, shots, sprint and spin
public/js/ai.mjs                    Bot decisions, passing, support and cover
public/js/match.mjs                 Teams, goals, clock and rounds
public/js/practice.mjs              Timed drills, targets, challengers and personal bests
public/js/input.mjs                 Mouse, keyboard and saved controls
public/js/renderer.mjs              Pitch, players, names, ball and overlays
public/js/config.mjs                Physics tuning constants and pitch sizes
public/js/app.mjs                   Connects the interface and match loop
public/js/stats.mjs / report.mjs     Actual-play stats, heatmaps and report rendering
public/js/audio.mjs                 Synthesized boot impacts and goal sound
public/js/replay.mjs                Saved history, recordings and replay playback
TEST-RESULTS.txt                    Checks performed and limits
REFERENCE-NOTES.txt                 Video references and access status
FEEDBACK-09.txt                     Changes mapped to your latest recorded feedback

DEVELOPMENT TESTS
npm.cmd test
npm.cmd run test:simulation
These tests need only Node.js. Browser tests are optional and documented in tests/browser-smoke.mjs.

SCOPE
Local single-player with bot teammates/opponents, plus bot spectator matches.
This release does not implement online multiplayer or a walk-around online lobby.
The physics and match modules run independently of the browser UI, but an online
server, networking, prediction and latency testing are not implemented.
Keyboard rollover limits on some keyboards cannot be fixed by this game.
Physics tuning uses your feedback and the uploaded Teamball 2 reference. Camera movement,
montage cuts and unknown inputs limit exact measurement; original coefficients are unverified.
