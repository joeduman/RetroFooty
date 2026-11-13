import {COURTS} from './park-layout.mjs';
const liveStates=new Set(['playing','goal','kickoff','halftime']);
export function nearbySpectateCourt(park,player,range=150){
 if(!player||player.field!==null)return null;
 let nearest=null,best=range;
 for(const court of COURTS){
  const live=park?.fields.find(f=>f.id===court.id);
  if(!live||!liveStates.has(live.state)||(live.mode==='ranked'&&live.phase==='warmup'))continue;
  const dx=Math.max(court.x-player.x,0,player.x-court.x-court.w),dy=Math.max(court.y-player.y,0,player.y-court.y-court.h);
  const distance=dx||dy?Math.hypot(dx,dy):Math.min(player.x-court.x,court.x+court.w-player.x,player.y-court.y,court.y+court.h-player.y);
  if(distance<best){best=distance;nearest=court;}
 }return nearest;
}
