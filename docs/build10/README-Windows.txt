TEAMBALL BUILD 10 - TWO-PLAYER ONLINE CO-OP

QUICK START
1. Extract the entire Teamball-Coop-10.zip into a NEW folder.
2. Stop any old Teamball process using port 6969.
3. Double-click START-TEAMBALL.cmd. Node.js 20 or later is required.
   The included node_modules/ws is portable JavaScript; no npm install needed.
4. Your browser opens http://localhost:6969/ . Select ONLINE CO-OP.
5. Enter your name and movement mode. Choose a team and size (minimum 2v2).
6. Click CREATE ROOM. Share the eight-character room code with your friend.
7. Your friend opens http://YOUR-PUBLIC-IP:6969/online.html in their browser,
   enters their name and the room code, then clicks JOIN ROOM.
8. After both names appear, the room host clicks START MATCH.

PORT FORWARDING
This build listens on 0.0.0.0:6969 by default.
Your router rule must forward external TCP 6969 to this PC's LAN IP, TCP 6969.
If your existing rule forwards external 6969 to a DIFFERENT internal port,
change its internal port to 6969, or set PORT to that internal port before launch.
Allow Node.js through Windows Firewall, or add an inbound TCP 6969 rule.
For same-network testing, use http://HOST-LAN-IP:6969/online.html.
For the hosting PC, use http://localhost:6969/online.html.
The friend needs no Node.js installation or port-forwarding rule.
Use http:// for this direct-IP setup. HTTPS/WSS requires separate TLS hosting.
Some routers cannot use the public IP from inside the same home network;
test external access from another connection. An existing forwarding rule
cannot be verified from this build environment.

OPTIONAL WINDOWS FIREWALL RULE (PowerShell as Administrator)
New-NetFirewallRule -DisplayName "Teamball TCP 6969" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 6969

CO-OP RULES
One room per server, maximum two connected humans, always on the same team.
2v2 = the two humans versus two bots. Larger sizes fill all unused slots
with bots. The host can start alone and the friend can join during the match.
Only the room host can start or rematch. Escape opens your menu; it does
NOT pause the shared match. Opening the menu clears your movement/shoot inputs.
At full time, use PLAY AGAIN. Local play and practice remain on the home page.

DISCONNECTS
A disconnected human becomes a bot. Rejoin with the same code to reclaim an
available slot. If the host leaves, the remaining friend becomes room host.
When both humans leave, the room is deleted; create a new room next time.
The Node server must stay running even if the room host's browser closes.
Lost input stops affecting movement within 250 ms. Abrupt connection loss
may take up to about 10 seconds to trigger bot takeover.

CONTROLS
Mouse or keyboard movement as selected before joining; Click/Space shoots;
Shift sprints. Online uses your saved key bindings, sound volume, names and
aim-guide preferences from local Settings. Change those before joining.

LIMITS OF THIS FIRST CO-OP BUILD
Online replay/history and full match reports are not yet implemented.
Local movement is predicted; the ball and other players are interpolated.
Internet latency can cause visible collision corrections. Internet play
needs testing with you and your friend; this release is not a latency benchmark.
No accounts, public matchmaking, spectators, or persistent rooms yet.

STOP
Double-click STOP-TEAMBALL.cmd in this folder. Only this server copy is stopped.

TESTS
npm test
Optional browser checks require Playwright and a Chromium installation.
See TEST-RESULTS.txt for the checks actually run for this release.
Earlier build documentation and results are archived in docs/build09.
