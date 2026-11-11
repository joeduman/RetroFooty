/* BUILD 15 — START HERE FOR PERSONALIZATION.
 * Browser-only edits: save, then refresh each browser. No rebuild is needed.
 * Rules used by the server (timing / scoring): save, then restart Node too.
 * Static page/button text is directly editable in index.html / local.html.
 * Layout, CSS fonts and popup colors: park.css and styles.css.
 */
export const LOOK={
  font:'system-ui, sans-serif', // Canvas font; CSS fonts are documented in park.css.
  ownOutline:'#c8ddcc66', ownOutlineWidth:1.3,
  kickOutline:'#ffffff', kickOutlineWidth:1.5, // Held kick button, even during cooldown.
  parkZoom:1, // Pixels per world unit while walking: 1 = full-size players.
  spectatorMargin:150, // Space outside a field visible to its participants.
  toastMs:4500,
  // Match zoom multiplier: 1 = current automatic field framing.
  fieldZoom:1.12,
  fieldZoomMin:.85,
  fieldZoomMax:1.5,
};
export const RULES={
  kickoffTakerGap:48, // Empty space between taker and ball edges.
  botCelebrationChance:.65, // Winning bots sometimes pulse their kick ring.
  botCelebrationPulse:.15, // Seconds per on/off cycle.
  kickFlashSeconds:.12, // Minimum visible flash for a quick tap (including bot kicks).
  celebrationSeconds:5, kickoffSeconds:3, intermissionSeconds:8,
  halftimeWhistleGapsSeconds:[.15], // Silence after the first completed whistle.
  fulltimeWhistleGapsSeconds:[.15,.25], // Silence before the second and final whistles.
  periodWhistlePlaybackRates:[.98,1.03,.96], // Small pitch changes, one per whistle.
  assistSeconds:5, deflectionSeconds:5,
  controlSeconds:.3, controlRelativeSpeed:55, // Sustained control ends deflection credit.
  kickoffProtectionSeconds:3, // Opponents cannot enter the center circle until first touch or timeout.
};
// Put files in public/audio/. Use browser paths below, NOT disk paths.
// Set a path to null for synthesized impacts (or silence for goals).
// Supported file types: mp3, ogg, wav. Gain multiplies the player's volume setting.
export const SOUNDS={
  goal:{src:'/audio/goal.mp3',gain:1},
  fireGoal:{src:'/audio/goal-explosion.mp3',gain:.55}, // Short boom layered onto fiery goals.
  kick:{src:'/audio/kick.mp3',gain:1}, touch:{src:'/audio/touch.mp3',gain:1}, post:{src:'/audio/post.mp3',gain:1},
  wall:{src:'/audio/wall.mp3',gain:1}, kickoff:{src:'/audio/kickoff.mp3',gain:1,durationSeconds:.911},
};
// These are plain strings or small formatting functions. Keep argument names intact.
export const TEXT={
  goalTitle:team=>`${team.toUpperCase()} GOOOAL!`,
  goalDetail:info=>info?.scorerName?`${info.scorerName}${info.assistName?' · Assist: '+info.assistName:''}`:info?.ownGoalName?`Own goal: ${info.ownGoalName}`:'Goal',
  kickoff:(team,name)=>`${team?.toUpperCase()||''} KICKOFF${name?' · '+name:''}`,
  celebrationHint:'Goal',
  fullTime:'Full time', matchMenu:'Match menu',
  matchEnded:seconds=>{const n=Number.isFinite(seconds)?Math.max(0,Math.ceil(seconds)):0;return `Next match in ${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;},
  matchMenuHelp:'',
  ready:'Match starting',
  returned:'Returned to park',
  walkHelp:'WASD / arrows to walk · Shift to sprint · M for park map · Click a field to join',
  parkWaiting:'Connection interrupted — waiting for the park…',
  matchWaiting:'Connection interrupted — waiting for server…',
  controls:movement=>'',
  saving:'Saving replay and stats…', saved:'Replay and stats saved on this browser.',
  saveFailed:'Could not save: browser storage is unavailable or full.',
  entering:'Entering the park…', disconnected:'Disconnected. Press Play to return; your field slot is now a bot.',
  connectionFailed:'Could not reach the park server.', timeout:'Connection timed out. Check the server address and port.',
  signedOut:'You left the park. Enter again whenever you like.',
  chooseSide:'Choose your side', pickUp:'',
  liveScore:score=>`Red ${score.red} — ${score.blue} Blue`,
  population:(total,active)=>`${total} in the park · ${active} on the fields`,
  slots:n=>`${n} open slot${n===1?'':'s'}`,
  invalidField:'Choose a field and team.', leaveFirst:'Return to the park before changing fields or teams.',
  fullTeam:'That team is full. Choose the other side or another field.',
};
