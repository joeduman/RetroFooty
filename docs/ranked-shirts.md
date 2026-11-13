# Seasonal Ranked shirts

The white **Rookie** shirt is the default kit, permanently available to everyone.
There is no separate Plain White cosmetic. Prospect through Legend
unlock from the player's **highest Elo in the current season**. Reaching
a threshold grants that shirt and every lower rank shirt. Losing Elo does not
remove an earned shirt during that season. Current saved season peaks are used
automatically, including progress earned before this feature was installed.

| Rank | Required Elo | Asset |
| --- | ---: | --- |
| Rookie | Default for everyone | `shirt_rookie.png` |
| Prospect | 1,500 | `shirt_prospect.png` |
| Rising Star | 2,000 | `shirt_risingstar.png` |
| All-Star | 2,500 | `shirt_allstar.png` |
| Superstar | 3,000 | `shirt_superstar.png` |
| World Class | 3,500 | `shirt_worldclass.png` |
| Elite | 4,000 | `shirt_elite.png` |
| Legend | 4,500 | `shirt_legend.png` |

Rookie appears in Inventory under Match kits. The seven higher-rank shirts appear
under Ranked season rewards. They cost no Gold and cannot be bought,
even using a modified purchase request. Equipping still follows ownership and
active-match equipment locks.

The host's normal season rollover archives old unlocks and rebuilds active
ownership from the new season peak. An equipped shirt that is no longer earned
returns to Rookie, including connected players. Purchased shirts, effects
and Gold are retained, and Rookie remains available below 1,000 Elo and across
seasons. A starting rating already above a seasonal threshold qualifies
under the same rule; the existing Elo rollover formula is unchanged.

`server-data/economy.json` stores each wallet's `rewardSeason` and `rankRewards`
history, alongside the existing inventory. `server-data/ranked.json` remains
the authority for season and peak Elo. Back up both files together. No account
reset or database replacement is needed.

Definitions are in `public/js/rank-rewards.mjs`; thresholds follow
`ranked-config.mjs`. `cosmetics.mjs` combines purchasable and reward cosmetics
for inventory/equipment validation; the shop uses only `SHOP_ITEMS`.
