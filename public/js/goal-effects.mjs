// Portable cosmetic IDs shared by preferences, menus and multiplayer servers.
// Never accept executable effects or asset URLs from a client.
export const GOAL_EFFECT_OPTIONS=Object.freeze([
  Object.freeze({id:'classic',name:'Classic confetti',description:'A burst of black and white paper.'}),
  Object.freeze({id:'fire',name:'Fiery burst',description:'Golden sparks and a glowing orange fireball.'})
]);

export const normalizeGoalEffect=id=>GOAL_EFFECT_OPTIONS.some(effect=>effect.id===id)?id:'classic';
