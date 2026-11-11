// Match-local observations. These describe tendencies, not calibrated probabilities.
// No storage or network access: persistent examples require the server approval store.
import {clamp,distance} from './config.mjs';

export const ACTIVE_PATTERN_KEYS=Object.freeze(['boost','turn','reverse','lateralBias','straight','wall','challenge','kick']);
export const ACTIVE_CANDIDATE_SCHEMA='teamball.active-candidate.v1';
const localMatchIds=new WeakMap();
const neutral=()=>({boost:0,turn:0,reverse:0,lateralBias:0,straight:0,wall:0,challenge:0,kick:0});
const finite=(value,lo=0,hi=1)=>clamp(Number.isFinite(value)?value:0,lo,hi);

export class ActiveOpponentMemory {
  constructor(){this.players=new Map();this.motion=new Map();this.nextAt=-Infinity;this.reference=null;}
  setReference(reference){
    this.reference=reference&&Number.isFinite(reference.samples)&&reference.samples>=60?
      {samples:reference.samples,...Object.fromEntries(ACTIVE_PATTERN_KEYS.map(k=>[k,finite(reference[k],k==='lateralBias'?-1:0)]))}:null;
  }
  resetMotion(){this.motion.clear();this.nextAt=-Infinity;}
  observe(engine,{eligibleIds=null}={}){
    if(!Number.isFinite(engine.time)||engine.time<this.nextAt)return;
    this.nextAt=engine.time+.15;
    const allowed=eligibleIds?new Set(eligibleIds):null;
    for(const player of engine.players){
      if(allowed&&(!allowed.has(player.id)||!player.human))continue;
      if(!this.players.has(player.id)&&this.players.size>=10)continue;
      const old=this.motion.get(player.id),speed=Math.hypot(player.vx,player.vy),dir=engine.attackDir(player.team);
      const shifted=old&&distance(old,player)>Math.max(100,(engine.time-old.t)*500);
      const continuous=old&&!shifted&&engine.time-old.t<.5;
      const moving=speed>45,oldSpeed=continuous?Math.hypot(old.vx,old.vy):0;
      const cosine=moving&&oldSpeed>45?clamp((old.vx*player.vx+old.vy*player.vy)/(oldSpeed*speed),-1,1):1;
      const near=distance(player,engine.ball)<150,pitch=engine.pitch;
      const toward=engine.ball.x-player.x,towardY=engine.ball.y-player.y;
      const values={boost:Number(Boolean(player.sprinting)),turn:Number(moving&&oldSpeed>45&&cosine<.65),
        reverse:Number(moving&&oldSpeed>45&&cosine<-.4),lateralBias:moving?player.vy/speed:0,
        straight:Number(moving&&cosine>.9),wall:Number(player.y<pitch.top+70||player.y>pitch.bottom-70),
        challenge:Number(near&&moving&&player.vx*toward+player.vy*towardY>0),
        kick:Number(Boolean(continuous&&near&&player.shotCooldown>old.cooldown+.06))};
      const row=this.players.get(player.id)||{id:player.id,team:player.team,human:player.human,samples:0,...neutral()};
      row.samples=Math.min(100000,row.samples+1);row.human=Boolean(player.human);row.team=player.team;
      const weight=1/Math.min(28,row.samples);
      for(const key of ACTIVE_PATTERN_KEYS)row[key]+=weight*(values[key]-row[key]);
      this.players.set(player.id,row);
      this.motion.set(player.id,{x:player.x,y:player.y,vx:player.vx,vy:player.vy,cooldown:player.shotCooldown||0,t:engine.time});
    }
  }
  tendency(playerOrId){
    const row=this.players.get(typeof playerOrId==='object'?playerOrId.id:playerOrId);
    const evidence=row?.samples||0,confidence=evidence/(evidence+18);
    // Approved mode priors only contribute until observations of this opponent accumulate.
    const priorWeight=this.reference?Math.max(0,.3-confidence*.3):0;
    return {samples:evidence,confidence,...Object.fromEntries(ACTIVE_PATTERN_KEYS.map(key=>[
      key,(row?.[key]||0)*(1-priorWeight)+(this.reference?.[key]||0)*priorWeight]))};
  }
  snapshot({eligibleIds=null}={}){
    const allowed=eligibleIds?new Set(eligibleIds):null;
    return [...this.players.values()].filter(row=>!allowed||(allowed.has(row.id)&&row.human))
      .sort((a,b)=>a.id-b.id).map(row=>({...row}));
  }
}

// Explicit diagnostic export is consent to export only the local human's own
// summary. It never includes opponent observations or automatically approves data.
export function exportCompletedHumanCandidate(game){
  if(!game||game.state!=='ended'||game.practice||game.spectator||!game.human?.human)throw Error('A completed local human match is required');
  const row=game.ai?.activeMemory?.snapshot({eligibleIds:[game.human.id]}).find(player=>player.id===game.human.id);
  if(!row?.samples)throw Error('This match has no local human observations');
  if(!localMatchIds.has(game))localMatchIds.set(game,globalThis.crypto?.randomUUID?.()||`local-${game.seed}-${game.duration}-${Math.round(game.tracker.elapsed*120)}`);
  return {schema:ACTIVE_CANDIDATE_SCHEMA,id:localMatchIds.get(game),size:game.size,completed:true,human:true,participants:1,
    pattern:{samples:row.samples,...Object.fromEntries(ACTIVE_PATTERN_KEYS.map(key=>[key,row[key]]))},
    score:{red:game.score.red,blue:game.score.blue},status:'candidate',source:'local-browser'};
}
