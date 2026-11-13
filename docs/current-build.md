# RetroFooty Build 15.1

## Running

Stop and restart the server with the existing launchers, then refresh browsers.
Use `START-RETROFOOTY.cmd` or `npm.cmd start`. No new dependencies are required.
The update keeps the existing usernames, purchased items, balances, Elo history,
account records, bot-learning data and replay database. Back up `server-data`
and bot memory as usual. Previously issued tokens from the current browser tab
are migrated into username-scoped session storage.

## Reconnect correction

The two reported errors had separate causes:

- A missing, overwritten or expired token could reject entry to the entire
  park, even when the player only wanted to walk around or play Casual.
- Expired disconnected players remained pending until their old match ended.
  A long match or overtime could consequently block another Ranked match.

Park entry now succeeds without a match token. Restoring the old Ranked slot
still requires its original server-issued token. A private shield status
explains the reservation; another browser cannot take over that slot just by
typing the username. Tokens are kept separately for each canonical username
and for park/private-room connections, preventing one login from overwriting
another player's recovery token.

The first disconnect sets the existing regulation-duration / 2 deadline.
Reconnecting and disconnecting again do not renew it. Expiry settles one
expected loss immediately, using the same frozen ratings and loss calculation.
The eventual match result cannot charge a second penalty. A completed result
can still be recovered with the valid token before expiry. Pending decisions
remain persisted across server restarts.

Ranked slots are human-only again, as requested in the 15.1 notes. This
supersedes Build 15's temporary rated-bot rule:

- Ranked waits for complete human teams; waiting courts contain no AI bodies.
- A disconnect removes that player from active physics, collisions, AI,
  rendering and heatmap sampling. Their roster/slot, team, stats and identity
  remain reserved until full time, even after the shield expires.
- A valid reconnect restores exactly one original entity in the same match,
  without resetting score, clock or countdown.
- The match continues shorthanded, including 1v1 and even an empty field.
  Kickoff/goal resets tolerate a team with nobody connected.
- Neither bots nor new players replace a disconnected Ranked participant.
- Casual retains its existing temporary bots and replacements.

Legacy bot Elo records remain stored, but cannot qualify new Ranked matches.
The Elo formula, rank milestones, Gold formula, regulation durations, movement
physics, Casual AI policy and goal effects have not been retuned.

## Interface

**Ranked shirts.** [Season reward shirts](ranked-shirts.md) unlock from the
current season's highest Elo and appear in Inventory. They cannot be purchased.
They survive Elo drops, are re-earned each season, and retain an unlock history.

**Spectating.** Walking near a field keeps the camera on your park character.
At the border of an ongoing match, an E prompt offers spectator framing. Press E
or tap the prompt to watch; press E or tap Return to park to leave that view.
Spectating pauses park movement without joining a team or relocating the avatar.
The field directory and leaderboard return when you stop watching. Chat and
menus take priority over the E shortcut; opening the park map also exits spectating.

**Countdown.** A large, legible counter reads the current server `state.wait`.
It appears only during an actual kickoff, disappears during play, and replaces
the duplicate small participant-side kickoff number. Spectators and local
play keep their existing overlays. Waiting Ranked lobbies do not run a fake
countdown or introduce an extra delay. Existing overtime voting is preserved.

**Chat.** A connection/reconnection starts with an empty display. Historical
server messages are no longer transmitted or replayed; newly received messages
still use the existing text format, server timestamps, sender validation,
typing indicators and anti-spam rules. Internal transient history may remain
for the channel, but is not a join feed or browser-local chat archive.

**Personal menu.** Menu / Escape opens a compact three-tab panel:

- Profile: username, current rank/Elo, W/L/D, matches, win rate, goals, assists
  and private Gold balance. Win rate is wins divided by W+L+D, with zero handled.
- Inventory: owned shirts and goal explosions only, small thumbnails,
  Equipped/Equip controls, and a compact balance. Purchased items are retained.
- Settings: existing movement mode, input bindings, audio volume, names and aim
  preferences. Settings does not open the live statistics report.

**Equipment.** Changes are allowed in the park, lobby or after full time, and
are disabled during active participation. Protected active Ranked participation
also stays locked while the player is temporarily back in the park. Both shirt
and explosion WebSocket paths check the lock before changing inventory or the
entity, so modified packets cannot bypass the UI. Ownership validation and
persistent equipment selections remain in place. Purchases/reward rules were
not changed.

**Public profiles.** Click a human avatar while walking or spectating. The
panel shows only username, rank/Elo, W/L/D, matches, win rate, goals and assists.
It never includes Gold, inventory, equipped-item lists, account details,
internal record keys or reconnect tokens. Active participants cannot inspect
avatars through this path. Avatar selection takes precedence over walking and
court selection; clicking outside the profile closes it.

**Results.** Completed matches first show Victory/Defeat/Draw and final score,
current rank, updated Elo with signed change for Ranked, and Gold earned from
that match. Casual shows no Elo update. Progress percentages, repeated Elo
totals, team averages and long reward explanations are absent. View Match Report
opens the full existing statistics, shot trajectories and movement heatmaps.
The report closes back to the result; opening the menu during play does not
open a live report.

**Recent Matches.** The personal menu offers the latest five completed reports,
with local date/time, mode, result and score. Reports generated from this build
are retained server-side. Completed older browser reports are also reused from
the existing replay history. Interrupted, foreign-user and missing reports are
excluded. Older stored reports are not deleted. Server report access is limited
to that match's recorded participants.

## Data and limitations

Profiles and completed reports extend the existing `server-data/economy.json`
store (`profiles`, `reports`, `playerMatches`), preserving wallet and settlement
data. Existing account totals are reused when available. Legacy guest Ranked
records supply known W/L/D history, but cannot supply goals/assists that were
never stored. Those profiles say Recorded goals/assists to distinguish partial
history. Recent Matches never fabricates an unrecorded historical report.
Future completed multiplayer games accumulate both goals and assists, and
Ranked profile results reconcile a later abandonment without adding another
match. Public profile fields use an explicit whitelist.

Username-only identity still does not authenticate account ownership. Tokens
protect active match slots, not permanent usernames or Gold ownership. A real
account-linking migration remains necessary before public release. Storage is
still a single-process local JSON store; large public deployments should use
transactional database storage. As before, live physics is not checkpointed:
an unfinished match is voided after a server restart. Already completed pending
rating decisions and saved completed reports survive.

## Verification

Run:

```powershell
node --test tests/multiplayer-ui.test.mjs
npm.cmd test
node tests/browser.mjs
```

The browser check starts an isolated temporary server/store and installed
headless Chrome, not the user's running server. Set `TEAMBALL_BROWSER` to a
different Chrome executable when needed. It verifies private/public profiles,
owned-only inventory, active equipment locks, settings, actual walking and
spectator avatar clicks, server countdown, Ranked disconnect/reconnect,
compact Elo/Gold results, completed reports, recent matches and mobile bounds.
Screenshots are `reports/screenshots/build151-*.png`.

Regression coverage includes the current pitch dimensions and usable runoff.
Generated logs and screenshots are not committed to the repository.

## Files

New modules:

- `ranked-players.mjs`: reserved roster vs active physics bodies and match lock.
- `player-profiles.mjs`: private/public profile projection, known totals and
  authorized completed reports using existing server storage.
- `public/js/personal-menu.mjs`: profile/inventory/settings and public panel.
- `public/js/result-ui.mjs`: authoritative countdown and compact results.
- `public/js/reconnect-client.mjs`: username/service-scoped recovery tokens.
- `public/js/recent-matches.mjs`: existing completed-history filtering.
- `public/build151.css`: compact responsive menus and result layout.
- `tests/multiplayer-ui.test.mjs`, `tests/browser.mjs`: regressions and browser
  verification, with test logs and screenshots.

Updated integrations:

- `park.mjs`, `online.mjs`, `ranked.mjs`, `ranked-session.mjs`: eligibility,
  shorthanded matches, recovery, single settlements, equipment guards and APIs.
- `chat.mjs`, `public/js/chat-client.mjs`: fresh connection chat behavior.
- `match-coins.mjs`: also observes assists for profiles; coin math is unchanged.
- `public/js/match.mjs`: safe kickoff when the conceding side is disconnected.
- `public/js/replay.mjs`: stable roster-width frames with absent bodies omitted.
- Multiplayer clients/HTML, park and shared renderers, shop/rank UI: connect the
  new menus and result controls while preserving existing gameplay visuals.
- `server.js`, version metadata and `public/js/config.mjs`: shared profile
  initialization, Build 15.1 labels; physics/duration constants unchanged.
- Existing regression fixtures/tests: include the new modules and assert the
  newly confirmed human-only, equipment-lock and empty-chat behavior.
