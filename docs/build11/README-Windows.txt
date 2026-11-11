TEAMBALL BUILD 11 - ONLINE MULTIPLAYER

QUICK START
1. Stop Build 10 with its STOP-TEAMBALL.cmd.
2. Extract ALL of Teamball-11.zip into a new folder.
3. Double-click START-TEAMBALL.cmd. Node.js 20+ is required on the host.
   The included ws dependency is portable JavaScript; no npm install needed.
4. Open http://localhost:6969 and select ONLINE MULTIPLAYER.
5. Enter your name, movement mode, preferred team and match size (1v1 to 5v5).
6. CREATE ROOM, then share the server address and eight-character room code.
7. Friends open http://HOST-IP:6969/online.html, choose their own team,
   enter the code and JOIN ROOM. Friends only need a browser.
8. The room host clicks START MATCH. Vacant slots are bots.

TEAMS AND MATCHES
1v1 has one slot per team; 5v5 has five per team (ten humans maximum).
Choose RED or BLUE when creating/joining. Use JOIN RED / JOIN BLUE in the
lobby or after full time to change sides, provided there is a vacant slot.
Team changes are locked during play. A full team rejects additional joins;
select the other side and try again. Joining an available bot slot during
play is supported. The host may start alone. Only the host starts/rematches.
Choose the match size when creating the room; leave/create to change size.
Regulation durations: 1v1 3 minutes, 2v2 4, 3v3 5, 4v4 6, 5v5 8.
Tied games continue to golden goal.
Escape opens the menu and clears your input; the shared match continues.

STATS, HEATMAPS AND REPLAYS
The online menu shows server-calculated stats and movement heatmaps.
Full time opens the menu automatically. Select a player to see their heatmap.
Stats include goals, assists, estimated shots/on-target shots, passes, touches,
ball wins, distance and sprint time. Stats cover each slot throughout the
match, including time controlled by a bot or a replacement human.
Reports update about once per second and once more at full time.
Online recordings use authoritative server snapshots, not predicted frames.
Replay/history is saved in your browser, with periodic checkpoints and a
final save. Use Saved replays & match history to open the existing viewer.
Joining late records from your join onward; the report still covers the match.
Storage failure is shown in the menu. Browser history is tied to the exact
site address/port and browser profile, and is not uploaded to the host.

PHYSICS AND NETWORK
Build 10 predicted only movement, omitted local collisions, and displayed
remote bodies/ball with a 65 ms delay. Build 11 predicts the whole collision
scene using the shared physics solver, including kicks, walls and posts.
Server physics remains 120 Hz; snapshots target 60 Hz instead of 30 Hz.
Applied-input acknowledgments and ping estimates anchor client correction.
The HUD displays round-trip latency in ms. Prediction is capped at 150 ms;
prolonged stalls freeze prediction rather than extrapolating indefinitely.
The server always decides the score and stats. High/variable latency can
still cause corrections; this cannot remove physical internet latency.

DISCONNECTS
Disconnected slots become bots. Rejoin using the same room code and team
if a slot is free. The next connected member inherits room-host controls.
The room disappears when all humans leave. Keep the Node server running.
Input goes neutral after 250 ms without updates; an abrupt connection loss
can take about ten seconds for heartbeat-based bot takeover.

HOSTING
Default: 0.0.0.0:6969. Existing Build 10 port forwarding is reusable.
Forward external TCP 6969 to the host PC's LAN address, internal TCP 6969.
Allow Node.js / TCP 6969 through Windows Firewall.
Host PC: http://localhost:6969/online.html
Same network: http://HOST-LAN-IP:6969/online.html
Internet: http://HOST-PUBLIC-IP:6969/online.html
Some routers cannot loop their public address back into the local network.
HTTPS/WSS requires separate TLS hosting; use HTTP for direct-IP hosting.
Set PORT before launch if using another port.

CONTROLS
Mouse or keyboard movement; Click / Space shoots; Shift sprints.
Saved local Settings supply custom bindings, volume, names and aim guide.
Local play, practice and previous saved history remain on the home page.

STOP AND TEST
STOP-TEAMBALL.cmd stops only the server launched from this folder.
npm test runs automated physics, multiplayer and controller tests.
See TEST-RESULTS.txt for coverage and limits. Older results are in docs/.
One room per server; no accounts, public matchmaking or persistent rooms.
