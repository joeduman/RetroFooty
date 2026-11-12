# Ranked Elo v1 and park leaderboards

**Updated rules:** Ranked now supports rated bots, the park has 13 dedicated
Ranked / Unranked courts, and multiplayer matches award cosmetic Gold. See
[the current RetroFooty guide](RETROFOOTY-UPDATE.md), which supersedes the
human-only eligibility and no-currency descriptions in this original v1 guide.

The park now displays all currently online named players, including people on
fields and in private online rooms, sorted by Elo. The online list updates with
joins, departures, and rating changes. A separate expandable season leaderboard
also includes offline players. Both lists show username, rank, Elo, and W/L/D.

## Running and playing

Run `npm.cmd start` on Windows (`npm start` in other shells). Restart an existing
server to load this update, then refresh clients. Existing launch scripts work.

In the park, choose a court, choose Casual or Ranked, then a team. The first
player sets an empty court's mode; others join that mode until it empties.
All five existing court sizes support Ranked. Casual retains bots, existing
match options, and its original behavior, and never changes Elo. Ranked waits
for equal, complete human teams and locks the roster before kickoff. Empty
Ranked warmups wait without running AI; disconnected Ranked positions remain
neutral human slots throughout the match.

Private rooms at `/online.html` offer the same mode choice on room creation.
The host starts Ranked only with full human teams. There is still one private
room per server, as before this update.

Ranked 4v4 and 5v5 hold a 10-second vote before kickoff. At least 6/8 or 8/10
players must approve golden-goal overtime. Missing votes count as no. All
smaller sizes finish regulation ties as draws. Voting never waits indefinitely.
The park displays vote controls over the pitch; private rooms show them in the
lobby. Team Elo, player ranks, division progress, reconnect status, and personal
rating results appear in the match menu / summary. A division change produces
a rank-up or rank-down message in the summary.

Reconnect by entering the same username from the same tab. The server-issued
token is retained in sessionStorage (ratings are never stored there). Private
rooms also use the room join screen. The first disconnect's fixed deadline is
regulation duration / 2; the match keeps running. Later disconnects cannot
renew it. Leaving a park field voluntarily reserves a disconnected slot while
letting you walk around; choosing that court again within the deadline restores
your slot. Disconnected winners and drawing players receive a frozen expected
loss if they abandon. Losing players receive one loss, never two.

## Ratings and persistence

`server-data/ranked.json` is separate from accounts, bot memory, replays and
public assets. New trimmed, case-insensitive usernames start at 1,000. The first
display capitalization is retained. Records include stable migration IDs, a
future account-link field, current / peak Elo, seasonal W/L/D, historical seasons,
frozen rosters, per-match predicted and applied deltas, and pending reconnect
decisions. Writes use fsync and atomic replacement; an unreadable existing
database fails startup instead of silently replacing ratings.

The modified Elo calculation uses the specified 70/30 individual/team weights,
match-size K factors, and 25% winning-pool bonus. Largest-remainder integer
allocation breaks ties by canonical username, independently of roster order.
Ratings have a zero floor. Draws give +2 to each eligible player. At most three
draws among an identical participant group are rewarded in a rolling 24 hours;
later draws still count in records but give zero. Repeated matchups and draws
are audited. Goals, assists, other statistics and goal difference never affect
ratings. Results come only from the existing server Match simulation.

Completed-match pending decisions survive restart, including original tokens
and deadlines. They settle once on an authorized reconnect or deadline expiry.
Live physics is not persisted: unfinished matches are explicitly voided after a
process restart, with no Elo changes. This policy is recorded on the match.
Run one server process per ranked data file; storage is a local JSON store,
not a multi-process transactional database.

Rules and colors: `public/js/ranked-config.mjs`. `RankedStore` also accepts a
`config` override for vote duration, draw bonus, draw cap and draw window.

## Controlled season rollover

No automatic schedule is installed. From the server machine, read the current
administration token and port from `.teamball-server.json`, then send a POST to
`http://127.0.0.1:<port>/_teamball/ranked/season` with
`Authorization: Bearer <token>`, `Content-Type: application/json`, and body
`{"season":"season-2"}` (use a new unique season ID).

Only loopback requests with the administration token are accepted. Active
matches and pending results must finish first. Rollover archives each season,
floors ratings to their division minimum, preserves sub-1000 ratings and
lifetime peaks, and resets seasonal counters. Reusing any previous season ID
is rejected. The public read-only current-season leaderboard is available at
`/api/ranked/leaderboard`.

## Verification

- `node --test tests/ranked.test.mjs`: calculation, persistence, reconnect,
  abandonment, season, park and real WebSocket coverage.
- `npm.cmd test`: full project suite, including existing physics, AI, cosmetics,
  prediction, stats, reports, replay, account and multiplayer tests.
- `node tests/ranked-browser.mjs`: optional real headless Chrome smoke check;
  set `TEAMBALL_BROWSER` if Chrome is installed elsewhere. Uses an isolated
  ephemeral server / store, saves desktop and mobile leaderboard screenshots,
  and checks for runtime errors. Chrome must be permitted to start its renderer.

The full run is saved in `tests/ranked-full-results.txt`. One existing Build 12
test expects smaller pitches and conflicts with the later pitch enlargement;
pitch dimensions and physics were not modified for Ranked.

## Identity limitation

Usernames are temporary identifiers, not proof of ownership. Duplicate active
names are rejected across the park and private rooms. A reconnect token protects
an ongoing match slot, but it does not secure long-term username ownership.
Someone can impersonate an offline username outside a protected ongoing match.
Stable record IDs, account-link fields and preserved histories support a later
migration to authenticated accounts. No coins, purchases, OAuth, or new login
system were added; the existing account service continues to work.

## Files

Created:

- `ranked.mjs`: pure Elo calculator, durable records, reconnect settlement,
  anti-farming audit, identity registry and season rollover.
- `ranked-session.mjs`: shared server voting, kickoff and rating-view helpers.
- `public/js/ranked-config.mjs`: centralized ratings, ranks, colors and thresholds.
- `public/js/ranked-ui.mjs`, `public/ranked.css`: rating / leaderboard displays.
- `tests/ranked.test.mjs`, `tests/ranked-browser.mjs`: automated checks.
- `tests/ranked-full-results.txt` and `tests/screenshots/ranked-online-leaderboard-*.png`:
  validation artifacts.
- `docs/RANKED.md`: this guide.

Modified:

- `server.js`: shared store initialization, leaderboard and protected season API.
- `park.mjs`, `online.mjs`: Ranked eligibility, votes, reserved reconnect slots,
  authoritative settlement and online presence; Casual paths remain available.
- `public/index.html`, `public/online.html`, `public/js/park-client.mjs`,
  `public/js/online-client.mjs`: mode selection, token handling and interface wiring.
- `tests/server.test.mjs`, `tests/build13-account.test.mjs`,
  `tests/browser-smoke.mjs`: include new server modules in isolated test copies.

The Match, physics, AI, prediction, renderer, cosmetics, statistics and replay
implementations are unchanged. Existing bot-learning files and server state
were already modified by the running game and were not edited by this work.
