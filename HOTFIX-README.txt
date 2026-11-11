TEAMBALL BUILD 13.0 - PARK CONNECTION HOTFIX
November 9, 2026

THE CRASH
  TypeError: Cannot read properties of undefined (reading 'headers')
  in Accounts.get(req), triggered by WebSocket park connection.

THE FIX (exactly one line in game source)
  park.mjs, WebSocket upgrade handler:
  BEFORE: wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
  AFTER:  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));

WHAT CHANGED FROM THE PREVIOUS 13.0 ZIP
  - park.mjs: one-line WebSocket request forwarding fix.
  - tests/build13-account.test.mjs: new live signed-in and guest WebSocket
    regression checks, using the returned player ID to validate identity.
  - BUILD-MANIFEST.json and this HOTFIX-README.txt: documentation/metadata.
  No other code, including physics, AI, control, audio, rendering, replay,
  online co-op, bot memory, account system or training logic, was changed.

VALIDATION
  - Reproduced the connection error on the original Build 13 ZIP.
  - Confirmed authenticated and guest park connections after the fix.
  - All 112 Node tests passed in this environment (Node 22.16.0).
  - Windows desktop and internet play remain for the user to verify.

SAFEST INSTALL FOR EXISTING 13.0 USERS
  1. Run STOP-TEAMBALL.cmd in your existing Teamball-13.0 game folder,
     or close its command window if the server crashed.
  2. In that SAME folder, back up bot-memory/ and server-data/ if present.
  3. Replace only park.mjs with the corrected park.mjs file.
  4. Run START-TEAMBALL.cmd and refresh the browser (Ctrl+Shift+R).
  5. Keep the existing bot-memory/ and server-data/ folders untouched.

The full ZIP is for clean installs. It contains default bot-memory files.
DO NOT extract the full ZIP over a live game folder: doing so could
replace your learned bot memory or other local files.

This hotfix does not revert Build 13 features to Build 12.5; it preserves
all intentional Build 13 changes. The 12.5 physics.mjs, renderer.mjs,
replay.mjs and park-layout.mjs files are byte-identical in Build 13.
