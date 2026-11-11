TEAMBALL BUILD 12.5 - LIVE SIDELINES

START HERE
1. Stop the previous build using its STOP-TEAMBALL.cmd.
2. Extract the entire Teamball-12.5.zip into a new folder.
3. Double-click START-TEAMBALL.cmd (Node.js 20+ on the host).
   The portable ws dependency is included; npm install is not required.
4. Open http://localhost:25568 on the host. Friends use the host's LAN/public
   address on port 25568. Everyone on that server enters the same park.
5. Enter a username, choose on-field movement, and press PLAY.
   These are display names, not password-protected accounts. Names/settings
   are remembered on that browser; sessions and park state live in memory.

PORT
The default is 25568, matching your more recent hosting setup.
PORT overrides the default. If retaining a 6969 forwarding rule, set PORT=6969.
Windows PowerShell: $env:PORT=25568; node server.js
Windows CMD: set PORT=25568 (then run node server.js)
Linux/macOS: PORT=25568 node server.js
Forward external TCP to the same internal host port and allow it in the firewall.
The host must remain running. Browser clients need no installation.
This package does not change or verify your router/firewall configuration.

THE PARK
- Walk using WASD/arrows, or click a path to walk to that spot. Shift sprints.
- Fields and avatars use full-size world coordinates and match movement physics.
  Mouse wheel adjusts the walking zoom. Joining frames the field and sidelines.
- Click a field or its matching field-list button, then select RED or BLUE.
- Five independent live fields: 1v1, 2v2, 3v3, 4v4 and 5v5.
- Bots play immediately and fill every vacant slot. Joining takes a bot slot.
- Until both sides are all human, the field is a pick-up/warmup game.
- When the final human joins, the score and clock reset for a fresh match.
  The standard protected 3-2-1 countdown runs before play begins.
- If someone leaves during that INITIAL countdown, it returns to pick-up.
  Once the match is underway, a bot substitutes without resetting score/time.
- A newly arriving human can take an available bot slot in an active match.
- Full time shows stats for eight seconds, then the next round begins.
  A full roster begins another match; an incomplete roster begins pick-up.
- Escape opens your menu; the field continues. LEAVE FIELD returns you to
  the park. You can then choose a different field or team.
- At most 64 connected park sessions; 30 human field slots in total.
  Full teams cannot be joined. Walk along the sidelines to watch live matches.
  Spectators cannot interfere with the ball; there is no join queue.

ON THE BALL
- Kick direction is 88% physical contact normal / 12% aim direction before
  normalization. Mouse aim can adjust a valid contact by about eight degrees;
  get around the ball to set up the shot. Back-side aim still cannot kick it
  through the player's body. A close-contact gold guide shows the kick ray.
- Base kick speed 480 -> 410; sprint/approach contribution .66 -> .50;
  ball speed cap 760 -> 650. Drag and player movement speeds are unchanged.
- Ball/player restitution .55 -> .32, or .20 for a stationary passive receiver.
  Wall restitution .75 -> .68. Receiving is softer; the ball stays free.
- Playable widths are about 13-15% smaller, heights about 14-16% smaller.
- Players and bots have a 64-unit runoff area beyond the pitch lines.
  The ball still rebounds from the field boundary: there are no throw-ins.
  Goal posts/nets and the outer runoff boundary remain solid for players.
- Bots use the same contact rules and can approach an edge ball from outside.
- Goals allow 2.8 seconds of celebration movement. The ball, clock and match
  statistics freeze, then players reset into the protected 3-second kickoff.
- Your custom goal.mp3 follows the saved sound-volume setting.
- Initial kickoff randomly selects a team and taker; after a goal the conceding
  team gets the next kickoff. The taker starts within reach of the ball.
- Deflections preserve shooter/assist credit; celebration text names them.
- Kick input lights a white ring on humans and bots; your resting ring is dim.

CUSTOMIZATION
Read CUSTOMIZE.md. public/js/customize.mjs contains commented text, sound,
font, outline, camera and timing settings. Your goal audio is included.

REPORTS, REPLAYS AND LOCAL PLAY
Online stats and heatmaps remain in the field menu and appear at full time.
Server reports cover each slot including any time controlled by bots.
Replays use authoritative received snapshots, not predicted collisions.
Recordings save to this browser with checkpoints; late joins record only
from the join onward. Pick-up recordings are labelled separately in history.
Browser storage failures appear in the report. A new address/port is a
separate browser storage origin; old history stays at the old origin.
Local play, practice, settings and history: http://localhost:25568/local.html
Private room-code multiplayer remains at /online.html for optional use.
Local settings provide remapped keys, name/guide visibility and sound volume.

STOP
STOP-TEAMBALL.cmd stops only this server copy. On Linux/macOS use node stop.js
from the extracted folder. Ctrl+C also shuts down cleanly.

VALIDATION
npm test
See TEST-RESULTS.txt for results and limits; tests include physics, bots,
park lifecycle, real WebSockets, controller flows, and extracted server use.
No real WAN/multi-PC playtest or full browser visual pass is claimed here.
