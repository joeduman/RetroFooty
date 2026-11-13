# RetroFooty customization

Start with `public/js/customize.mjs`. Comments beside each setting explain its purpose. No build command is needed. Save and refresh browsers; restart the Node server too when changing gameplay rules or shared world geometry.

| Change | Where |
| --- | --- |
| Goal sound | Replace `public/audio/goal.mp3`, or edit `SOUNDS.goal.src` |
| Other custom sounds | Put files in `public/audio/`, then set `SOUNDS.kick`, `touch`, `post`, `wall`, or `kickoff` paths |
| Individual sound volume | `SOUNDS.<event>.gain`; multiplied by the player's saved volume |
| Goal message and scorer/assist text | `TEXT.goalTitle` and `TEXT.goalDetail` |
| Kickoff message, menus, notifications | `TEXT` in `customize.mjs`; static labels in `public/index.html`, `local.html`, `online.html` |
| Canvas font, normal outline, kick highlight | `LOOK.font`, `ownOutline`, `kickOutline`, and their widths |
| Walking camera and sideline visibility | `LOOK.parkZoom`, `LOOK.spectatorMargin` |
| Notification duration | `LOOK.toastMs` |
| Celebration, kickoff, between-match delay | `RULES.celebrationSeconds`, `kickoffSeconds`, `intermissionSeconds` |
| Deflection and assist credit windows | `RULES.deflectionSeconds`, `assistSeconds`, `controlSeconds`, `controlRelativeSpeed` |
| Menus, popup styling, CSS fonts | `public/park.css`, `public/styles.css`, `public/retro.css`, `public/build151.css` and `public/club-ui.css` |
| Ball/player speeds and physics | Commented tuning constants in `public/js/config.mjs` |
| Park field positions | `public/js/park-layout.mjs`; dimensions come from `createPitch` |

Example: place `whistle.ogg` inside `public/audio/`, then change the kickoff entry to:

```js
kickoff: { src: '/audio/whistle.ogg', gain: 0.5 },
```

Use browser paths beginning `/audio/`, not Windows disk paths. MP3, OGG and WAV are served with audio MIME types. A `null` impact source keeps its synthesized default; a `null` goal source silences the goal. Audio playback failure never stops the game. Browser playback may require an initial click; press Play normally.

The supplied goal.mp3 is your uploaded file, unchanged. Its volume follows the existing sound-volume setting. Goals bypass the impact cooldown so a recent collision will not suppress the celebration.

Scoring preserves the shooter's saved assist through incidental defender contacts. A deliberate defending kick or sustained slow contact clears that shot credit. These are adjustable gameplay heuristics, with a default five-second deflection window and ten-second assist window.

Keep JavaScript commas, quotes and function argument names intact when editing. Longer goal labels are fitted inside the celebration panel. CSS and canvas fonts are independent settings. Save a copy of your custom settings/audio before upgrading to a later build.

Shop item availability and Gold prices live in `public/js/shop-config.mjs`.
Rank milestones and Elo presentation settings live in `public/js/ranked-config.mjs`.

The clubhouse menus use shared colour and typography variables at the top of
`public/club-ui.css`. Item previews and icons are shared by `public/js/club-ui.mjs`;
menu structure lives in `personal-menu.mjs` and `shop-ui.mjs`. No external fonts
or icon service are required.
