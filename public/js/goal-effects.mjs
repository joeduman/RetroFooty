// Portable cosmetic IDs shared by preferences, menus and multiplayer servers.
// Never accept executable effects or asset URLs from a client.
export const GOAL_EFFECT_OPTIONS=Object.freeze([
  Object.freeze({id:'classic',name:'Classic confetti',description:'A burst of black and white paper.'}),
  Object.freeze({id:'fire',name:'Fiery burst',description:'Golden sparks and a glowing orange fireball.'}),
  Object.freeze({id:'black-hole',name:'Singularity',description:'A black hole swallows the ball, then implodes.'})
]);

export const BLACK_HOLE_TIMING=Object.freeze({swallowEnd:.95,collapseStart:1.55,duration:2.25});

export const normalizeGoalEffect=id=>GOAL_EFFECT_OPTIONS.some(effect=>effect.id===id)?id:'classic';
