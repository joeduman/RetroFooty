import {BUILD,clamp} from './config.mjs';
const STATES=['kickoff','playing','goal','practice-ready','ended','intermission','halftime'];
const HEADER=14,PLAYER=7;
const copy=value=>structuredClone(value);

// Record visible state rather than rerunning AI: old replays survive tuning changes.
// Twenty samples/second are interpolated for playback; goal/reset jumps are not.
export class ReplayRecorder {
  constructor(match,{id=globalThis.crypto.randomUUID(),startedAt=Date.now()}={}){
    this.id=id;this.startedAt=startedAt;this.match=match;this.round=match.round;this.time=0;this.next=0;
    this.width=HEADER+PLAYER*match.players.length;this.data=new Float32Array(this.width*1200);this.count=0;
    this.moments=[];this.scenes=[];this.sceneKey='';this.sceneIndex=-1;this.lastState='';this.finalized=false;
    this.meta={build:BUILD,online:Boolean(match.online),joinedLate:Boolean(match.joinedLate),pitch:copy(match.pitch),size:match.size,practice:match.practice,drill:match.drill,
      ballRadius:match.engine.ball.radius,headerStride:HEADER,spectator:match.spectator,duration:match.duration,unlimitedStamina:match.unlimitedStamina,
      mode:match.mode,matchId:match.matchId,players:match.players.map(p=>({id:p.id,team:p.team,number:p.number,name:p.name,human:p.human,radius:p.radius,shirtId:p.shirtId}))};
    this.capture();
  }
  capture(){
    const m=this.match,b=m.engine.ball,t=m.training;
    if(this.lastState!==m.state)this.moments.push({time:this.time,goalInfo:copy(m.goalInfo??null),kickoffTeam:m.kickoffTeam,kickoffPlayer:m.kickoffPlayer});
    const scene=t?{kind:t.kind,meta:copy(t.meta),circle:t.circle?{...t.circle}:null,gates:t.gates.map(g=>({...g})),
      target:t.target?{...t.target}:null,wallX:t.wallX,banked:t.banked,score:t.score,attempts:t.attempts,message:t.message,
      obstacles:copy(m.engine.obstacles)}:null;
    // Shield score changes each tick; it is a clock, so do not duplicate scenes for it.
    const key=scene?JSON.stringify({...scene,score:scene.kind==='shield'?0:scene.score}):'';
    if(key!==this.sceneKey||!this.count){this.sceneKey=key;this.sceneIndex=this.scenes.length;this.scenes.push(scene);}
    const offset=this.count*this.width;if(offset+this.width>this.data.length){const next=new Float32Array(this.data.length*2);next.set(this.data);this.data=next;}
    const row=[this.time,STATES.indexOf(m.state),m.score.red,m.score.blue,m.remaining,m.wait,m.tracker.elapsed,m.overtime?1:0,b.x,b.y,b.angle,this.sceneIndex,m.goalTeam==='red'?1:m.goalTeam==='blue'?2:0,m.sidesSwapped?1:0];
    for(const original of this.meta.players){const p=m.players.find(p=>p.id===original.id);row.push(p?.x??-10000,p?.y??-10000,p?.stamina??0,p?.sprinting?1:0,p?.vx??0,p?.vy??0,p?.input?.shoot||p?.kickFlash>0?1:0);}
    this.data.set(row,offset);this.count++;this.lastState=m.state;
  }
  step(dt){
    if(this.finalized)return;this.time+=dt;
    if(this.time+1e-7>=this.next||this.match.state!==this.lastState){this.capture();this.next=this.time+.05;}
  }
  snapshot(status='interrupted'){
    this.capture();const report=this.match.report();
    const summary={id:this.id,startedAt:this.startedAt,build:BUILD,online:this.meta.online,joinedLate:this.meta.joinedLate,status,size:this.meta.size,practice:this.meta.practice,
      drill:this.meta.drill,spectator:this.meta.spectator,score:{...report.score},elapsed:report.elapsed,
      mode:this.meta.mode,matchId:this.meta.matchId,replaySeconds:this.time,report,players:this.meta.players};
    return {summary,replay:{id:this.id,meta:this.meta,playerStride:PLAYER,moments:copy(this.moments),width:this.width,count:this.count,duration:this.time,
      frames:this.data.slice(0,this.count*this.width),scenes:copy(this.scenes)}};
  }
  finish(status){const value=this.snapshot(status);this.finalized=true;return value;}
}

export function replayFrame(record,seconds){
  const {frames:f,width:w,count,meta}=record,time=seconds>=record.duration?f[(count-1)*w]:clamp(seconds,0,record.duration);
  let lo=0,hi=count-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(f[mid*w]<=time)lo=mid;else hi=mid-1;}
  const a=lo*w,b=Math.min(lo+1,count-1)*w,interval=f[b]-f[a],same=f[a+1]===f[b+1];
  const mix=same&&interval>0?clamp((time-f[a])/interval,0,1):0;
  const lerp=(i,limit=80)=>Math.abs(f[b+i]-f[a+i])>limit?f[a+i]:f[a+i]+(f[b+i]-f[a+i])*mix;
  const players=meta.players.map((p,i)=>{const k=(meta.headerStride||13)+(record.playerStride??6)*i;return {...p,x:lerp(k),y:lerp(k+1),stamina:lerp(k+2,100),
    sprinting:Boolean(f[a+k+3]),vx:f[a+k+4],vy:f[a+k+5],exhausted:f[a+k+2]<=0,input:{shoot:record.playerStride===7?Boolean(f[a+k+6]):false}};}).filter(p=>p.x> -9000);
  const scene=record.scenes[f[a+11]];let training=null;
  if(scene){training=copy(scene);if(training.gates.length&&training.target)training.target=training.gates[training.score%training.gates.length];}
  return {...(record.moments?.findLast(m=>m.time<=time+1e-6)||{}),pitch:meta.pitch,size:meta.size,players,human:players.find(p=>p.human),spectator:meta.spectator,
    state:STATES[f[a+1]],score:{red:f[a+2],blue:f[a+3]},remaining:f[a+4],wait:f[a+5],overtime:Boolean(f[a+7]),sidesSwapped:(meta.headerStride||13)>13&&Boolean(f[a+13]),half:(meta.headerStride||13)>13&&Boolean(f[a+13])?2:1,
    tracker:{elapsed:f[a+6]},extraElapsed:Math.max(0,f[a+6]-meta.duration),duration:meta.duration,practice:meta.practice,drill:meta.drill,training,
    goalTeam:f[a+12]===1?'red':'blue',engine:{ball:{x:lerp(8),y:lerp(9),angle:lerp(10,100),radius:meta.ballRadius},obstacles:scene?.obstacles??[]}};
}

let database;
function open(){
  if(!database)database=new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB){reject(Error('This browser does not support saved replays.'));return;}
    const request=indexedDB.open('teamball-history',1);
    request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('games',{keyPath:'id'});db.createObjectStore('replays',{keyPath:'id'});};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  }).catch(error=>{database=null;throw error;});return database;
}
export const historyStore={
  async save({summary,replay}){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(['games','replays'],'readwrite');tx.objectStore('games').put(summary);tx.objectStore('replays').put(replay);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Replay save interrupted.'));});},
  async list(){const db=await open();return new Promise((resolve,reject)=>{const r=db.transaction('games').objectStore('games').getAll();r.onsuccess=()=>resolve(r.result.sort((a,b)=>b.startedAt-a.startedAt));r.onerror=()=>reject(r.error);});},
  async get(id,kind='replays'){const db=await open();return new Promise((resolve,reject)=>{const r=db.transaction(kind).objectStore(kind).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
};
