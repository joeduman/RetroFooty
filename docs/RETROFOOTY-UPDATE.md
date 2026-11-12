# RetroFooty: park, bots and Gold

## Run

Restart the server and refresh all browsers after this update. Use
`START-RETROFOOTY.cmd` / `STOP-RETROFOOTY.cmd`, or `npm.cmd start` on Windows.
The old launcher names still work. Existing usernames, settings, replays,
accounts and bot memory keep their original storage keys for compatibility.
New players see an empty username input instead of Sam.

## Park and matches

The original commons, paths, five pitches and garden remain. Eight dedicated
Ranked courts extend the park, for 13 total:

| Size | Ranked | Unranked |
|---|---:|---:|
| 1v1 | 2 | 1 |
| 2v2 | 2 | 1 |
| 3v3 | 2 | 1 |
| 4v4 | 1 | 1 |
| 5v5 | 1 | 1 |

Every court has its own ID, match, players and scoreboard. Court buttons and
the park map identify Ranked and Unranked pitches. The first five numeric IDs
remain compatible with older Unranked clients. New Ranked IDs are `r1a`, `r1b`,
`r2a`, `r2b`, `r3a`, `r3b`, `r4`, and `r5`.

Bots play in empty positions, including Ranked. Joining humans replace bots.
The first complete human roster in a round triggers a fresh match with a
five-second countdown. The interrupted match is recorded as a roster reset and
does not award normal Elo or Gold. If someone leaves during that countdown,
a bot replaces them and the same countdown continues; another arrival does not
restart it. After the round ends, the cycle starts again.

Private rooms also accept bots in Ranked and restart once when a running,
partially human room first fills. Full 4v4 / 5v5 rosters retain the overtime
vote before the countdown. With fewer humans, regulation ties are draws.

The park now tracks held mouse buttons using the same configurable bindings as
keyboard input. Left-click sprint works with keyboard or mouse movement, and
releases on pointer-up, pointer-cancel, window blur or an opened menu.

The visual update uses flatter olive grass, neutral dark menus, muted gold
accents, smaller corner radii and a cached 64px grass tile made in Canvas.
No texture downloads or per-frame random noise are required.

## Ranked bots

Humans use their existing username records. Bots have separate persistent
records in the `bots` section of `server-data/ranked.json`. A bot identity is
stable per park court / slot, or private-room format / slot. All begin at 1000,
use the same Elo calculation and receive wins, losses and draws. Bot records
never appear in the human leaderboard.

Each participant's rating is captured when they enter the rated roster. A human
replacing a bot receives their own starting rating. Already captured players
keep their rating snapshots. Departed participants and replacements are recorded
separately; expired abandonment penalties are not erased by a later roster reset.

After play begins, disconnected human slots get bot control during the existing
reconnect shield. The slot stays reserved until its fixed deadline so a valid
token can restore it. On expiry, the slot becomes available to another human,
while the departed player's loss stays attached to that match. Countdown
departures do not receive an abandonment penalty.

The current bot rule is intentional temporary population support. It means
humans can gain Elo from bots. Unranked matches never change Elo.

## Gold and shop

Gold is cosmetic currency, independent of Elo. Server-completed Ranked and
Unranked multiplayer matches award it; local practice and spectator-only bot
matches do not. The server counts only each human's participation and stat
increments, excluding a replaced bot's earlier statistics.

Initial rewards are configurable in `public/js/shop-config.mjs`:

| Component | Gold |
|---|---:|
| Win | 12 |
| Draw | 8 |
| Loss | 6 |
| Goal | 3 |
| Shot | 0.5 |
| Shot on target | 1 |
| Completed pass | 0.1 |

The outcome portion is prorated for time played. A minimum of 15 playing seconds
is required, and total rewards are rounded and capped at 40 per match. A win
with one goal, six shots and two on target pays **20 Gold**. The same performance
in a loss pays **14 Gold**. These are starting balance settings, not an Elo rule.

| Item | Price |
|---|---:|
| Plain White shirt | Free |
| Inferno shirt | 100 Gold |
| Barcelona shirt | 250 Gold |
| PSG shirt | 250 Gold |
| Classic confetti | Free |
| Fiery burst | 100 Gold |
| Singularity | 200 Gold |

Use **Shop** in the park header or private-room menu. Buy an item, then equip it.
Clicking an unowned item in an existing multiplayer picker opens the shop.
The shop includes reserved categories for goal music, soccer balls and boost
trails; these have no purchasable items yet. Free local-play previews remain
available; ownership is enforced when joining multiplayer.

`server-data/economy.json` stores balances, earned totals, inventory, equipment
and reward settlements. Atomic writes and unique match IDs prevent duplicate
match rewards. Purchases are idempotent, cannot overdraw a balance, and use only
the connected player's server identity. Clients cannot grant Gold, submit
prices or statistics, or equip multiplayer items they do not own. Existing
players start with zero Gold and the two free cosmetics; old browser preferences
do not grant paid ownership.

Usernames remain temporary identity, with the same offline impersonation
limitation as Elo. Gold and inventory are consequently not secure account
property until authenticated identities are linked. Preserve `server-data`
along with bot memory when backing up the game.

## Verification and files

Run `npm.cmd test` for the full suite, or
`node --test tests/retro-update.test.mjs tests/ranked.test.mjs` for the economy,
bot-rating, countdown and reconnect checks. `node tests/retro-browser.mjs` runs
isolated headless Chrome checks for an empty username, branding, all 13 courts,
mouse-bound sprint / release, shop purchases / equipment, and Ranked UI. Set
`TEAMBALL_BROWSER` to an installed Chrome path when needed.

Browser screenshots are in `tests/screenshots/retro-*.png`. The full test log is
`tests/retro-full-results.txt` (308 passing out of 309). The pre-existing Build 12 pitch-shrink assertion
still conflicts with the later enlarged-pitch dimensions; this update does not
change pitch dimensions or movement physics.

Main additions: `economy.mjs`, `match-coins.mjs`, `public/js/shop-config.mjs`,
`public/js/shop-ui.mjs`, `public/js/grass-texture.mjs`, `public/retro.css`, the two
RetroFooty launcher aliases, and economy / browser tests. Main integrations:
`park.mjs`, `online.mjs`, `ranked.mjs`, `ranked-session.mjs`, `server.js`, the park
layout / renderer / client, shared renderer / preferences, multiplayer HTML and
client menus. Existing tests were updated where they explicitly assumed five
courts, three-second full-roster starts, or human-only Ranked matches.
