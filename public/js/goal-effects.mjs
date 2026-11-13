// Portable cosmetic IDs shared by preferences, menus and multiplayer servers.
// Never accept executable effects or asset URLs from a client.
export const GOAL_EFFECT_OPTIONS=Object.freeze([
  Object.freeze({id:'classic',name:'Classic confetti',description:'A burst of black and white paper.'}),
  Object.freeze({id:'fire',name:'Fiery burst',description:'A fiery shockwave sends nearby players and debris flying.'}),
  Object.freeze({id:'black-hole',name:'Singularity',description:'Pulls in the ball and nearby players, then erupts.'})
]);

export const BLACK_HOLE_TIMING=Object.freeze({swallowEnd:.15,collapseStart:.75,collapseEnd:1.40,duration:2.15});
export const GOAL_REACTION=Object.freeze({fireRadius:220,fireSpeed:900,firePush:115,holeRadius:200,fireInputLock:.45});

// Singularity and legacy replay poses remain cosmetic. New fire goals use
// authoritative celebration physics and must never receive a second visual push.
// Work is bounded by the roster (at most ten players), never by particle count.
export function goalPlayerPose(burst,player,age){
 if(!burst||!['fire','black-hole'].includes(burst.effectId))return player;
 if(burst.effectId==='fire'&&burst.authoritativeFire)return player;
 const origin=burst.players?.get(player.id);if(!origin)return player;
 const hole=burst.effectId==='black-hole',x=hole?burst.holeX:burst.x,y=hole?burst.holeY:burst.y;
 const dx=origin.x-x,dy=origin.y-y,distance=Math.hypot(dx,dy),reach=hole?GOAL_REACTION.holeRadius:GOAL_REACTION.fireRadius;
 if(distance>reach)return player;
 if(hole){
  const start=.06+distance/reach*.18,end=BLACK_HOLE_TIMING.swallowEnd+.3;
  const t=Math.max(0,Math.min(1,(age-start)/(end-start))),ease=t*t*(3-2*t);
  if(t>=1)return null;
  const angle=Math.atan2(dy,dx)+ease*Math.PI*.55,r=distance*(1-ease);
  return {...player,x:x+Math.cos(angle)*r,y:y+Math.sin(angle)*r,radius:Math.max(.1,(player.radius||18)*(1-ease)),effectAlpha:1-ease};
 }
 const t=Math.max(0,Math.min(1,(age-distance/GOAL_REACTION.fireSpeed)/.32));
 const push=GOAL_REACTION.firePush*(1-distance/reach)*(1-(1-t)**3),length=distance||1;
 return {...player,x:player.x+(distance?dx/length:burst.dir)*push,y:player.y+dy/length*push};
}

export const normalizeGoalEffect=id=>GOAL_EFFECT_OPTIONS.some(effect=>effect.id===id)?id:'classic';
