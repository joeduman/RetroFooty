import {Player} from './public/js/physics.mjs';
import {ParkPhysics} from './public/js/park-physics.mjs';
import {RULES,TEXT} from './public/js/customize.mjs';
import {WebSocketServer} from 'ws';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {Match} from './public/js/match.mjs';
import {STEP,clamp} from './public/js/config.mjs';
import {PARK,COURTS} from './public/js/park-layout.mjs';
import {normalizeGoalEffect} from './public/js/goal-effects.mjs';
const neutral=()=>({x:0,y:0,aimX:1,aimY:0,sprint:false,shoot:false});
const nameOf=name=>typeof name==='string'?name.replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,16)||'Player':'Player';
// Never trust an arbitrary client-supplied sprite URL or design name.
const ALLOWED_SHIRTS = [
    'plain',
    'inferno',
    'barcelona',
    'psg'
];

const shirtOf = id =>
    ALLOWED_SHIRTS.includes(id) ? id : 'plain';
// Keep bot identity explicit in every network snapshot. The client may treat
// `human` as the locally controlled player, but `isBot` describes the entity.
const playerState=players=>players.map(p=>({...p,isBot:!p.human}));
export function normalizeInput(i){
 if(!i||!['x','y','aimX','aimY'].every(k=>typeof i[k]==='number'&&Number.isFinite(i[k])&&Math.abs(i[k])<1e6))return null;
 const len=Math.max(1,Math.hypot(i.x,i.y)),aim=Math.hypot(i.aimX,i.aimY)||1;
 return {x:i.x/len,y:i.y/len,aimX:i.aimX/aim,aimY:i.aimY/aim,sprint:i.sprint===true,shoot:i.shoot===true};
}
export class ParkWorld {
 constructor({duration,goldenGoal=true,learning=null,accounts=null,aiDifficulty='expert',activeMemory=null}={}){
  this.options={duration,goldenGoal};this.learning=learning;this.activeMemory=activeMemory;this.accounts=accounts;this.aiDifficulty=aiDifficulty;this.clients=new Map();this.time=0;this.nextAvatar=0;this.walkEngine=new ParkPhysics();
  this.fields=COURTS.map(c=>({...c,members:[],round:0,phase:'warmup',endedFor:0,events:[],tick:0}));
  for(const f of this.fields)this.restart(f,'warmup');
 }
 restart(f,phase){
  if(f.matchId)this.activeMemory?.complete(f.matchId,f.game,{reason:f.game?.state==='ended'?'complete':'interrupted'});
  if(f.matchId&&this.learning)this.learning.complete(f.matchId,f.game,{reason:f.game?.state==='ended'?'complete':'interrupted'});
  f.phase=phase;f.matchId=randomUUID();f.round++;f.tick=0;f.events=[];f.endedFor=0;f.finalProcessed=false;
  f.game=new Match({size:f.size,team:'red',spectator:true,loop:false,aiPolicy:this.learning?.policy(),aiContexts:this.learning?.memory.contexts,aiDifficulty:this.aiDifficulty,...this.options});f.game.spectator=false;f.game.round=f.round;this.activeMemory?.attach(f.game);
  for(const c of f.members){this.assign(f,c);c.finalSent=null;}
 }
 connect(name,account=null,trainingConsent=false,shirtId='plain',goalEffectId='classic'){
  const c={id:randomUUID(),accountId:account?.id||null,trainingConsent:Boolean(trainingConsent),name:nameOf(account?.name||name),shirtId:shirtOf(shirtId),goalEffectId:normalizeGoalEffect(goalEffectId),x:PARK.spawn.x,y:PARK.spawn.y,field:null,team:null,slot:null,input:neutral(),seq:-1,applied:-1,lastInput:this.time,walk:{x:0,y:0},walkAt:this.time};
  c.avatar=new Player(++this.nextAvatar,'red',0,c.name,true);Object.assign(c.avatar,{x:c.x,y:c.y,faceX:0,faceY:1,shirtId:c.shirtId,goalEffectId:c.goalEffectId});
  this.clients.set(c.id,c);return c;
 }
 assign(f,c){
  const p=f.game.players.find(p=>p.id===c.slot);p.human=true;p.name=c.name;p.shirtId=c.shirtId;p.goalEffectId=c.goalEffectId;p.input=neutral();
  Object.assign(f.game.tracker.rows.get(p.id),{name:c.name,human:true});c.input=neutral();c.lastInput=this.time;c.applied=-1;c.seq=-1;
 }
 join(c,size,team){
  const f=this.fields.find(f=>f.size===size);if(!f||!['red','blue'].includes(team))return TEXT.invalidField;
  if(c.field===size&&c.team===team)return null;
  if(c.field!==null)return TEXT.leaveFirst;
  const p=f.game.players.find(p=>p.team===team&&!p.human);if(!p)return TEXT.fullTeam;
  c.field=size;c.team=team;c.slot=p.id;c.walk={x:0,y:0};f.members.push(c);this.assign(f,c);
  if(f.phase==='warmup'&&f.members.length===size*2)this.restart(f,'match');
  return null;
 }
 leave(c){
  if(c.field===null)return;
  const f=this.fields.find(f=>f.size===c.field),p=f.game.players.find(p=>p.id===c.slot);
  this.activeMemory?.releasePlayer(f.matchId,c.slot);
  p.human=false;p.name='Bot '+p.number;p.goalEffectId='classic';p.input=neutral();Object.assign(f.game.tracker.rows.get(p.id),{name:p.name,human:false});
  f.members=f.members.filter(m=>m!==c);c.field=null;c.team=null;c.slot=null;c.input=neutral();c.walk={x:0,y:0};c.x=f.x+f.w/2;c.y=f.y+f.h+65;Object.assign(c.avatar,{x:c.x,y:c.y,vx:0,vy:0,input:neutral()});
  // A missing player cancels only the initial full-roster countdown. Once
  // play begins, bots substitute without resetting the score or match clock.
  if(f.phase==='match'&&f.game.state==='kickoff'&&f.game.tracker.elapsed===0)this.restart(f,'warmup');
  else if(!f.members.length)this.restart(f,'warmup');
 }
 disconnect(c){this.leave(c);this.clients.delete(c.id);}
 setShirt(c,id){
  c.shirtId=shirtOf(id);
  c.avatar.shirtId=c.shirtId;
  if(c.field!==null){
   const f=this.fields.find(f=>f.size===c.field);
   const p=f?.game.players.find(p=>p.id===c.slot);
   if(p)p.shirtId=c.shirtId;
  }
 }
 setGoalEffect(c,id){
  c.goalEffectId=normalizeGoalEffect(id);c.avatar.goalEffectId=c.goalEffectId;
  if(c.field!==null){
   const f=this.fields.find(f=>f.size===c.field),p=f?.game.players.find(p=>p.id===c.slot);
   if(p)p.goalEffectId=c.goalEffectId;
  }
 }
 tick(dt){
  this.time+=dt;
  this.walkEngine.players=[];
  for(const c of this.clients.values())if(c.field===null){
   if(this.time-c.walkAt>.25)c.walk={x:0,y:0};
   c.avatar.input={...neutral(),...c.walk};this.walkEngine.players.push(c.avatar);
  }
  this.walkEngine.celebrate(dt);
  for(const c of this.clients.values())if(c.field===null){c.x=c.avatar.x;c.y=c.avatar.y;}
  for(const f of this.fields){
   if(f.game.state==='ended'){
    if(!f.finalProcessed){f.finalProcessed=true;this.activeMemory?.complete(f.matchId,f.game);this.learning?.complete(f.matchId,f.game);this.accounts?.record(f);}
    f.endedFor+=dt;
    if(f.endedFor>=RULES.intermissionSeconds)this.restart(f,f.members.length===2*f.size?'match':'warmup');
    continue;
   }
   for(const c of f.members){const p=f.game.players.find(p=>p.id===c.slot);p.input=this.time-c.lastInput>.25?neutral():{...c.input};c.applied=c.seq;}
   f.game.update(dt);
   this.activeMemory?.capture(f.matchId,f.game,{eligibleIds:f.members.filter(c=>c.trainingConsent).map(c=>c.slot),participantKeys:Object.fromEntries(f.members.map(c=>[c.slot,c.id]))});
   if(this.learning){
     const eligibleIds=f.members.filter(c=>c.trainingConsent).map(c=>c.slot);
     if(eligibleIds.length)this.learning.capture(f.matchId,f.game,{eligibleIds});
     this.learning.eventsFor(f.matchId,f.game.events);
   }
   f.events.push(...f.game.events);if(f.events.length>100)f.events=f.events.slice(-100);f.tick++;
  }
 }
 state(c){
  if(c.field===null)return null;
  const f=this.fields.find(f=>f.size===c.field),g=f.game;
  return {type:'state',field:f.size,phase:f.phase,full:f.members.length===f.size*2,matchId:f.matchId,tick:f.tick,id:c.slot,ack:c.applied,events:f.events,
   state:{pitch:g.pitch,size:g.size,duration:g.duration,state:g.state,wait:g.wait,nextMatchIn:g.state==='ended'?Math.max(0,RULES.intermissionSeconds-f.endedFor):null,score:g.score,remaining:g.remaining,half:g.half,sidesSwapped:g.sidesSwapped,halftimePending:g.halftimePending,fulltimePending:g.fulltimePending,fulltimeAttackSide:g.fulltimeAttackSide,fulltimeAttackTeam:g.fulltimeAttackTeam,overtime:g.overtime,extraElapsed:g.extraElapsed,goalTeam:g.goalTeam,goalInfo:g.goalInfo,kickoffTeam:g.kickoffTeam,kickoffPlayer:g.kickoffPlayer,round:g.round,players:playerState(g.players),engine:{ball:g.engine.ball,kickoff:g.engine.kickoff,obstacles:g.engine.obstacles},tracker:{elapsed:g.tracker.elapsed},stats:g.stats,practice:false,spectator:false}};
 }
 report(c){const f=this.fields.find(f=>f.size===c.field);return f?{type:'report',matchId:f.matchId,phase:f.phase,ended:f.game.state==='ended',report:f.game.report()}:null;}
 overview(){return {type:'park',players:[...this.clients.values()].map(c=>({...c.avatar,id:c.id,name:c.name,x:c.x,y:c.y,field:c.field,isBot:false})),fields:this.fields.map(f=>({size:f.size,name:f.name,phase:f.phase,matchId:f.matchId,state:f.game.state,wait:f.game.wait,endedFor:f.endedFor,nextMatchIn:f.game.state==='ended'?Math.max(0,RULES.intermissionSeconds-f.endedFor):null,remaining:f.game.remaining,half:f.game.half,sidesSwapped:f.game.sidesSwapped,halftimePending:f.game.halftimePending,fulltimePending:f.game.fulltimePending,overtime:f.game.overtime,extraElapsed:f.game.extraElapsed,score:f.game.score,
   members:f.members.map(c=>({name:c.name,team:c.team,id:c.id})),pitch:f.game.pitch,ball:f.game.engine.ball,obstacles:f.game.engine.obstacles,goalTeam:f.game.goalTeam,goalInfo:f.game.goalInfo,kickoffTeam:f.game.kickoffTeam,kickoffPlayer:f.game.kickoffPlayer,players:playerState(f.game.players)}))};}
}
export function attachPark(server,options={}){
 const world=new ParkWorld(options),wss=new WebSocketServer({noServer:true,maxPayload:2048,perMessageDeflate:false}),sockets=new Set();
 function send(ws,message){if(message&&ws.readyState===1&&ws.bufferedAmount<128000){ws.send(JSON.stringify(message));return true;}return false;}
 server.on('upgrade',(req,socket,head)=>{
  if(req.url!=='/park')return;
  if(sockets.size>=64){socket.destroy();return;}
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host){socket.destroy();return;}}catch{socket.destroy();return;}}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
 });
 wss.on('connection',(ws,req)=>{
  const account=options.accounts?.get(req)||null;
  sockets.add(ws);ws.alive=true;let count=0,windowAt=performance.now();
  ws.on('pong',()=>ws.alive=true);ws.on('error',()=>{});
  ws.on('close',()=>{sockets.delete(ws);if(ws.client)world.disconnect(ws.client);});
  ws.on('message',bytes=>{
   const now=performance.now();if(now-windowAt>=1000){windowAt=now;count=0;}if(++count>160){ws.close(1008,'Too many messages');return;}
   let m;try{m=JSON.parse(bytes.toString());}catch{return;}if(!m||typeof m!=='object')return;
   if(m.type==='ping'){send(ws,{type:'pong',at:m.at});return;}
   if(m.type==='login'&&!ws.client){ws.client=world.connect(m.name,account,m.trainingConsent===true,m.shirtId,m.goalEffectId);send(ws,{type:'welcome',id:ws.client.id});send(ws,world.overview());return;}
   const c=ws.client;if(!c)return;
   if(m.type==='shirt'){world.setShirt(c,m.shirtId);return;}
   if(m.type==='goal-effect'){world.setGoalEffect(c,m.goalEffectId);return;}
   if(m.type==='join'){
    const target=world.fields.find(f=>f.size===m.size);
    if(c.field===null&&target?.phase==='warmup'&&target.members.length===target.size*2-1&&target.game.players.some(p=>p.team===m.team&&!p.human)){
      for(const memberSocket of sockets)if(memberSocket.client?.field===target.size){send(memberSocket,world.state(memberSocket.client));send(memberSocket,world.report(memberSocket.client));}
    }
    const error=world.join(c,m.size,m.team);if(error){send(ws,{type:'error',message:error});return;}
    send(ws,{type:'joined',field:c.field,team:c.team});send(ws,world.state(c));send(ws,world.report(c));return;
   }
   if(m.type==='leave'){send(ws,world.report(c));world.leave(c);send(ws,{type:'returned'});send(ws,world.overview());return;}
   if(m.type==='walk'&&c.field===null&&Number.isFinite(m.x)&&Number.isFinite(m.y)&&Math.abs(m.x)<1e6&&Math.abs(m.y)<1e6){const l=Math.max(1,Math.hypot(m.x,m.y));c.walk={x:m.x/l,y:m.y/l,sprint:m.sprint===true,shoot:m.shoot===true};c.walkAt=world.time;return;}
   if(m.type==='input'&&c.field!==null&&Number.isSafeInteger(m.seq)&&m.seq>c.seq){const value=normalizeInput(m.input);if(value){c.input=value;c.seq=m.seq;c.lastInput=world.time;}}
  });
 });
 let last=performance.now(),acc=0,broadcast=0,parkAt=0,reportAt=0;
 const timer=setInterval(()=>{
  const now=performance.now();acc+=Math.min(.1,(now-last)/1000);last=now;
  while(acc>=STEP){world.tick(STEP);acc-=STEP;}
  if(now-broadcast>=1000/60){
   broadcast=now-(now-broadcast)%(1000/60);
   for(const ws of sockets)if(ws.client?.field!==null&&ws.client){
    send(ws,world.state(ws.client));const f=world.fields.find(f=>f.size===ws.client.field);
    if(f.game.state==='ended'&&ws.client.finalSent!==f.matchId&&send(ws,world.report(ws.client)))ws.client.finalSent=f.matchId;
   }
   for(const f of world.fields)f.events=[];
  }
  if(now-parkAt>=50){parkAt=now;const overview=world.overview();for(const ws of sockets)if(ws.client)send(ws,overview);}
  if(now-reportAt>=1000){reportAt=now;for(const ws of sockets)if(ws.client?.field!==null&&ws.client)send(ws,world.report(ws.client));}
 },4);
 const heartbeat=setInterval(()=>{for(const ws of sockets){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},5000);
 const close=()=>{for(const f of world.fields)world.activeMemory?.discard(f.matchId);clearInterval(timer);clearInterval(heartbeat);for(const ws of sockets)ws.terminate();wss.close();};close.world=world;return close;
}
