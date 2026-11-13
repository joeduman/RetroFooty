import {normalizeShirt} from './public/js/cosmetics.mjs';
import {RANK_SHIRTS} from './public/js/rank-rewards.mjs';
import {prepareRanked,restoreRankedPlayer,removeRankedPlayer,activeMatch} from './ranked-players.mjs';
import {ChatChannel} from './chat.mjs';
import {randomBytes} from 'node:crypto';
import {canonicalName} from './public/js/ranked-config.mjs';
import {startRanked,openVote,rankedDetails,syncRanked} from './ranked-session.mjs';
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
const shirtOf=normalizeShirt;
// Keep bot identity explicit in every network snapshot. The client may treat
// `human` as the locally controlled player, but `isBot` describes the entity.
const playerState=(players,members=[])=>players.map(p=>({...p,isBot:!p.human,chatId:p.human?members.find(c=>c.slot===p.id&&!c.disconnected)?.id:null}));
export function normalizeInput(i){
 if(!i||!['x','y','aimX','aimY'].every(k=>typeof i[k]==='number'&&Number.isFinite(i[k])&&Math.abs(i[k])<1e6))return null;
 const len=Math.max(1,Math.hypot(i.x,i.y)),aim=Math.hypot(i.aimX,i.aimY)||1;
 return {x:i.x/len,y:i.y/len,aimX:i.aimX/aim,aimY:i.aimY/aim,sprint:i.sprint===true,shoot:i.shoot===true};
}
export class ParkWorld {
 constructor({duration,goldenGoal=true,learning=null,accounts=null,aiDifficulty='expert',activeMemory=null,ranked=null,economy=null,profiles=null}={}){
  this.profiles=profiles;this.economy=economy;economy?.bindRanked(ranked);this.unsubscribeSeason=ranked?.onSeasonChange(()=>this.refreshSeasonRewards());this.ranked=ranked;this.options={duration,goldenGoal};this.learning=learning;this.activeMemory=activeMemory;this.accounts=accounts;this.aiDifficulty=aiDifficulty;this.clients=new Map();this.time=0;this.nextAvatar=0;this.walkEngine=new ParkPhysics();
  this.fields=COURTS.map(c=>({...c,botPrefix:'park-'+c.id,members:[],round:0,phase:'warmup',endedFor:0,events:[],tick:0}));
  for(const f of this.fields)this.restart(f,'warmup');
 }
 field(id){return this.fields.find(f=>f.id===id);}
 restart(f,phase){
  if(f.rankedStarted)this.ranked.void(f.matchId,'full roster restart');
  if(f.matchId)this.activeMemory?.complete(f.matchId,f.game,{reason:f.game?.state==='ended'?'complete':'interrupted'});
  if(f.matchId&&this.learning)this.learning.complete(f.matchId,f.game,{reason:f.game?.state==='ended'?'complete':'interrupted'});
  f.participants=new Map();f.rewards={};f.fullReset=phase==='match';f.rankedStarted=false;f.voteDeadline=null;f.phase=phase;f.matchId=randomUUID();f.round++;f.tick=0;f.events=[];f.endedFor=0;f.finalProcessed=false;
  f.game=new Match({size:f.size,team:'red',spectator:true,loop:false,aiPolicy:this.learning?.policy(),aiContexts:this.learning?.memory.contexts,aiDifficulty:this.aiDifficulty,...this.options});f.game.spectator=false;f.game.round=f.round;this.activeMemory?.attach(f.game);
  prepareRanked(f);for(const c of f.members){c.vote=false;this.assign(f,c);c.finalSent=null;this.track(f,c);}
  if(f.fullReset)f.game.wait=RULES.fullRosterCountdownSeconds;
  if(f.mode==='ranked'&&this.ranked&&phase==='match'&&f.members.length===f.size*2){if(f.size>=4&&phase==='match'){f.phase='voting';openVote(f,this.ranked);}else startRanked(f,this.ranked);}
 }
 refreshSeasonRewards(){
  if(!this.economy)return;
  for(const c of this.clients.values()){const w=this.economy.wallet(c.name);c.shirtId=w.equipped.shirt;c.avatar.shirtId=c.shirtId;const p=this.field(c.field)?.game.players.find(p=>p.id===c.slot);if(p)p.shirtId=c.shirtId;}
  this.notifySeasonRewards?.();
 }
 track(f,c){const key=canonicalName(c.name);if(!f.participants.has(key))f.participants.set(key,{name:c.name,team:c.team,seconds:0,stats:{}});}
 award(f){if(this.economy&&f.participants.size)f.rewards=this.economy.settle(f.matchId,[...f.participants.values()],f.game.score,f.game.duration);}
 connect(name,account=null,trainingConsent=false,shirtId='plain',goalEffectId='classic'){
  const c={id:randomUUID(),accountId:account?.id||null,trainingConsent:Boolean(trainingConsent),name:nameOf(account?.name||name),shirtId:shirtOf(shirtId),goalEffectId:normalizeGoalEffect(goalEffectId),x:PARK.spawn.x,y:PARK.spawn.y,field:null,team:null,slot:null,input:neutral(),seq:-1,applied:-1,lastInput:this.time,walk:{x:0,y:0},walkAt:this.time};
  c.avatar=new Player(++this.nextAvatar,'red',0,c.name,true);Object.assign(c.avatar,{x:c.x,y:c.y,faceX:0,faceY:1,shirtId:c.shirtId,goalEffectId:c.goalEffectId});
  if(!c.name||c.name==='Player'&&!String(name||'').trim())throw Error('Enter your username');
  if(!this.economy&&RANK_SHIRTS.some(i=>i.reward&&i.value===c.shirtId)){c.shirtId='plain';c.avatar.shirtId='plain';}
  if(this.economy){const w=this.economy.wallet(c.name);c.shirtId=w.equipped.shirt;c.goalEffectId=w.equipped.effect;Object.assign(c.avatar,{shirtId:c.shirtId,goalEffectId:c.goalEffectId});}
  c.reconnectToken=randomBytes(24).toString('hex');if(this.ranked){this.ranked.claim(c.name,c.id);c.name=this.ranked.player(c.name).name;c.avatar.name=c.name;}this.profiles?.ensure(c.name);this.clients.set(c.id,c);return c;
 }
 assign(f,c){
  const p=f.mode==='ranked'?restoreRankedPlayer(f,c.slot):f.game.players.find(p=>p.id===c.slot);p.human=true;p.name=c.name;p.shirtId=c.shirtId;p.goalEffectId=c.goalEffectId;p.input=neutral();
  Object.assign(f.game.tracker.rows.get(p.id),{name:c.name,human:true});c.input=neutral();c.lastInput=this.time;c.applied=-1;c.seq=-1;
 }
 join(c,id,team){
  const f=this.field(id);if(!f||!['red','blue'].includes(team))return TEXT.invalidField;
  if(c.field===id&&c.team===team)return null;
  if(c.field!==null)return TEXT.leaveFirst;
  const reserved=f.members.find(p=>p.disconnected&&canonicalName(p.name)===canonicalName(c.name));
  if(reserved){if(!this.ranked.reconnect(f.matchId,c.name,c.reconnectToken))return this.ranked.pending(c.name).pending?'Use the original browser tab to restore this reserved slot, or wait for the shield to expire':'This slot stays reserved until full time. You can join another Ranked field';Object.assign(c,{field:id,team:reserved.team,slot:reserved.slot,disconnected:false});f.members=f.members.map(p=>p===reserved?c:p);this.assign(f,c);return null;}
  if(f.mode==='ranked'&&f.rankedStarted)return 'This Ranked roster is reserved until full time';
  if(f.mode==='ranked'&&this.ranked?.hasPending(c.name))return 'Reconnect to your reserved match, or wait for your reconnect shield to expire';
  const p=[...f.slots.values()].find(p=>p.team===team&&!f.members.some(m=>m.slot===p.id));if(!p)return TEXT.fullTeam;
  c.field=f.id;c.team=team;c.slot=p.id;c.walk={x:0,y:0};f.members.push(c);this.assign(f,c);this.track(f,c);
  const full=f.members.length===f.size*2&&!f.members.some(c=>c.disconnected);
  if(full&&!f.fullReset)this.restart(f,'match');
  return null;
 }
 leave(c){
  if(c.field===null)return;
  const f=this.field(c.field),p=f.game.players.find(p=>p.id===c.slot);
  this.activeMemory?.releasePlayer(f.matchId,c.slot);
  const shield=f.mode==='ranked'&&f.rankedStarted&&f.game.state!=='ended';
  if(shield){this.ranked.disconnect(f.matchId,c.name);f.members=f.members.map(m=>m===c?{...c,disconnected:true,input:neutral()}:m);}
  else f.members=f.members.filter(m=>m!==c);
  if(f.mode==='ranked'){removeRankedPlayer(f,c.slot);if(f.phase==='voting'&&!f.rankedStarted)this.restart(f,'warmup');}
  else{p.human=false;p.name='Bot '+p.number;p.shirtId='plain';p.goalEffectId='classic';p.input=neutral();Object.assign(f.game.tracker.rows.get(p.id),{name:p.name,human:false});}
  Object.assign(c,{field:null,team:null,slot:null,disconnected:false,input:neutral(),walk:{x:0,y:0},x:f.x+f.w/2,y:f.y+f.h+65});Object.assign(c.avatar,{x:c.x,y:c.y,vx:0,vy:0,input:neutral()});
  // Leaving during the five-second countdown never resets its clock.
 }
 disconnect(c){this.leave(c);this.clients.delete(c.id);this.ranked?.release(c.name,c.id);}
 reconnect(name,token){
  const key=canonicalName(name);for(const f of this.fields)if(f.mode==='ranked'){
   const c=f.members.find(c=>canonicalName(c.name)===key&&c.disconnected);
   if(c){if(this.ranked.online.has(key))throw Error('That username is already online');if(!this.ranked.reconnect(f.matchId,c.name,token))return null;this.ranked.claim(c.name,c.id);c.disconnected=false;c.lastInput=this.time;c.seq=-1;c.applied=-1;c.input=neutral();this.clients.set(c.id,c);this.assign(f,c);return c;}
  }this.ranked?.recoverPending(name,token);return null;
 }
 vote(c,yes){const f=this.field(c.field);if(f?.phase==='voting'&&f.size>=4&&f.voteDeadline>this.ranked.now())c.vote=yes===true;}

 setShirt(c,id){
  if((activeMatch(this.field(c.field))||this.ranked?.pending(c.name).active))throw Error('Equip cosmetics in the Park or after full time');
  if(RANK_SHIRTS.some(i=>i.reward&&i.value===id)&&!this.economy?.owns(c.name,'shirt',id))throw Error('Earn this Ranked shirt this season first');
  c.shirtId=shirtOf(id);
  c.avatar.shirtId=c.shirtId;
  if(c.field!==null){
   const f=this.field(c.field);
   const p=f?.game.players.find(p=>p.id===c.slot);
   if(p)p.shirtId=c.shirtId;
  }
 }
 setGoalEffect(c,id){
  if((activeMatch(this.field(c.field))||this.ranked?.pending(c.name).active))throw Error('Equip cosmetics in the Park or after full time');
  c.goalEffectId=normalizeGoalEffect(id);c.avatar.goalEffectId=c.goalEffectId;
  if(c.field!==null){
   const f=this.field(c.field),p=f?.game.players.find(p=>p.id===c.slot);
   if(p)p.goalEffectId=c.goalEffectId;
  }
 }
 tick(dt){
  this.time+=dt;this.ranked?.sweep();
  this.walkEngine.players=[];
  for(const c of this.clients.values())if(c.field===null){
   if(this.time-c.walkAt>.25)c.walk={x:0,y:0};
   c.avatar.input={...neutral(),...c.walk};this.walkEngine.players.push(c.avatar);
  }
  this.walkEngine.celebrate(dt);
  for(const c of this.clients.values())if(c.field===null){c.x=c.avatar.x;c.y=c.avatar.y;}
  for(const f of this.fields){
   if(f.mode==='ranked'&&!f.rankedStarted&&f.phase!=='voting')continue;
   if(f.phase==='voting'){
    if(this.ranked.now()>=f.voteDeadline){try{startRanked(f,this.ranked);f.phase='match';}catch{this.restart(f,'warmup');}}
    continue;
   }
   if(f.game.state==='ended'){
    if(!f.finalProcessed){f.finalProcessed=true;if(f.rankedStarted)this.ranked.finish(f.matchId,f.game.score);this.award(f);this.activeMemory?.complete(f.matchId,f.game);this.learning?.complete(f.matchId,f.game);this.accounts?.record(f);this.profiles?.record(f,[...f.participants.values()]);}
    f.endedFor+=dt;
    if(f.endedFor>=RULES.intermissionSeconds){if(f.mode==='ranked'){const pending=this.ranked?.result(f.matchId)?.players.some(p=>!p.settled);if(pending)continue;for(const c of [...f.members])if(c.disconnected){c.field=null;f.members=f.members.filter(x=>x!==c);} }this.restart(f,f.members.length===2*f.size?'match':'warmup');}
    continue;
   }
   for(const c of f.members.filter(c=>!c.disconnected)){const p=f.game.players.find(p=>p.id===c.slot);p.input=this.time-c.lastInput>.25?neutral():{...c.input};c.applied=c.seq;}
   const before=f.game.tracker.elapsed,stats=new Map(f.members.filter(c=>!c.disconnected).map(c=>[c.id,{...f.game.tracker.rows.get(c.slot)}]));
   f.game.update(dt);
   if(f.rankedStarted&&f.game.tracker.elapsed>0)this.ranked.db.matches[f.matchId].startedPlay=true;
   for(const c of f.members.filter(c=>!c.disconnected)){this.track(f,c);const part=f.participants.get(canonicalName(c.name));part.seconds+=Math.max(0,f.game.tracker.elapsed-before);const row=f.game.tracker.rows.get(c.slot),old=stats.get(c.id);for(const key of ['goals','assists','shots','onTarget','passes'])part.stats[key]=(part.stats[key]||0)+Math.max(0,(row?.[key]||0)-(old?.[key]||0));}
   this.activeMemory?.capture(f.matchId,f.game,{eligibleIds:f.members.filter(c=>c.trainingConsent&&!c.disconnected).map(c=>c.slot),participantKeys:Object.fromEntries(f.members.map(c=>[c.slot,c.id]))});
   if(this.learning){
     const eligibleIds=f.members.filter(c=>c.trainingConsent&&!c.disconnected).map(c=>c.slot);
     if(eligibleIds.length)this.learning.capture(f.matchId,f.game,{eligibleIds});
     this.learning.eventsFor(f.matchId,f.game.events);
   }
   f.events.push(...f.game.events);if(f.events.length>100)f.events=f.events.slice(-100);f.tick++;
  }
 }
 state(c){
  if(c.field===null)return null;
  const f=this.field(c.field),g=f.game;
  return {type:'state',ranked:this.ranked?rankedDetails(f,this.ranked):null,field:f.id,phase:f.phase,full:f.members.length===f.size*2,matchId:f.matchId,tick:f.tick,id:c.slot,ack:c.applied,events:f.events,
   state:{pitch:g.pitch,size:g.size,duration:g.duration,state:f.mode==='ranked'&&!f.rankedStarted?(f.phase==='voting'?'voting':'lobby'):g.state,wait:f.mode==='ranked'&&!f.rankedStarted?0:g.wait,nextMatchIn:g.state==='ended'?Math.max(0,RULES.intermissionSeconds-f.endedFor):null,score:g.score,remaining:g.remaining,half:g.half,sidesSwapped:g.sidesSwapped,halftimePending:g.halftimePending,fulltimePending:g.fulltimePending,fulltimeAttackSide:g.fulltimeAttackSide,fulltimeAttackTeam:g.fulltimeAttackTeam,overtime:g.overtime,extraElapsed:g.extraElapsed,goalTeam:g.goalTeam,goalInfo:g.goalInfo,kickoffTeam:g.kickoffTeam,kickoffPlayer:g.kickoffPlayer,round:g.round,players:playerState(g.players,f.members),engine:{...(g.state==='goal'&&g.goalInfo?.effectMotion==='physics-v1'?g.engine.celebrationSnapshot():{}),ball:g.engine.ball,kickoff:g.engine.kickoff,obstacles:g.engine.obstacles},tracker:{elapsed:g.tracker.elapsed},stats:g.stats,practice:false,spectator:false}};
 }
 report(c){const f=this.field(c.field);return f?{type:'report',wallet:this.economy?.view(c.name),gold:f?.rewards?.[canonicalName(c.name)]??null,ranked:this.ranked?rankedDetails(f,this.ranked):null,matchId:f.matchId,phase:f.phase,ended:f.game.state==='ended',report:f.game.report()}:null;}
 overview(){return {type:'park',leaderboard:this.ranked?.leaderboard(true)||[],seasonLeaderboard:this.ranked?.leaderboard()||[],players:[...this.clients.values()].map(c=>({...c.avatar,id:c.id,chatId:c.id,name:c.name,x:c.x,y:c.y,field:c.field,isBot:false})),fields:this.fields.map(f=>({id:f.id,size:f.size,name:f.name,mode:f.mode||'casual',ranked:this.ranked?rankedDetails(f,this.ranked):null,phase:f.phase,matchId:f.matchId,state:f.mode==='ranked'&&!f.rankedStarted?'lobby':f.game.state,wait:f.mode==='ranked'&&!f.rankedStarted?0:f.game.wait,endedFor:f.endedFor,nextMatchIn:f.game.state==='ended'?Math.max(0,RULES.intermissionSeconds-f.endedFor):null,remaining:f.game.remaining,half:f.game.half,sidesSwapped:f.game.sidesSwapped,halftimePending:f.game.halftimePending,fulltimePending:f.game.fulltimePending,overtime:f.game.overtime,extraElapsed:f.game.extraElapsed,score:f.game.score,
   members:f.members.map(c=>({name:c.name,team:c.team,id:c.id})),pitch:f.game.pitch,ball:f.game.engine.ball,obstacles:f.game.engine.obstacles,goalTeam:f.game.goalTeam,goalInfo:f.game.goalInfo,kickoffTeam:f.game.kickoffTeam,kickoffPlayer:f.game.kickoffPlayer,players:playerState(f.game.players,f.members)}))};}
}
export function attachPark(server,options={}){
 const world=new ParkWorld(options),wss=new WebSocketServer({noServer:true,maxPayload:2048,perMessageDeflate:false}),sockets=new Set();
 function send(ws,message){if(message&&ws.readyState===1&&ws.bufferedAmount<128000){ws.send(JSON.stringify(message));return true;}return false;}
 world.notifySeasonRewards=()=>{for(const ws of sockets)if(ws.client){const c=ws.client;send(ws,{type:'wallet',wallet:world.economy.view(c.name)});if(world.profiles)send(ws,{type:'profile-self',profile:world.profiles.private(c.name,!(activeMatch(world.field(c.field))||world.ranked?.pending(c.name).active))});}};
 const chat=new ChatChannel(m=>{for(const ws of sockets)if(ws.client)send(ws,m);});
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
  ws.on('close',()=>{sockets.delete(ws);if(ws.client){chat.leave(ws.client.id);world.disconnect(ws.client);}});
  ws.on('message',bytes=>{
   const now=performance.now();if(now-windowAt>=1000){windowAt=now;count=0;}if(++count>160){ws.close(1008,'Too many messages');return;}
   let m;try{m=JSON.parse(bytes.toString());}catch{return;}if(!m||typeof m!=='object')return;
   if(m.type==='ping'){send(ws,{type:'pong',at:m.at});return;}
   if(m.type==='login'&&!ws.client){try{ws.client=world.reconnect(account?.name||nameOf(m.name),m.reconnectToken)||world.connect(m.name,account,m.trainingConsent===true,m.shirtId,m.goalEffectId);}catch(error){send(ws,{type:'error',message:error.message});return;}chat.join(ws.client.id,ws.client.name);send(ws,chat.snapshot());send(ws,{type:'welcome',id:ws.client.id,wallet:world.economy?.view(ws.client.name),reconnectToken:ws.client.reconnectToken,pending:world.ranked?.pending(ws.client.name)});if(ws.client.field!==null)send(ws,world.state(ws.client));send(ws,world.overview());return;}
   const c=ws.client;if(!c)return;
   if(m.type==='chat-send'||m.type==='chat-typing'){const error=chat.handle(c.id,m);if(error)send(ws,{type:'chat-error',message:error});return;}
   if(m.type==='profile-self'){send(ws,{type:'profile-self',profile:world.profiles?.private(c.name,!(activeMatch(world.field(c.field))||world.ranked?.pending(c.name).active))});return;}
   if(m.type==='profile-public'){if(c.field!==null)return;try{send(ws,{type:'profile-public',profile:world.profiles?.public(m.name)});}catch(e){send(ws,{type:'error',message:e.message});}return;}
   if(m.type==='recent-matches'){send(ws,{type:'recent-matches',matches:world.profiles?.recent(c.name)||[]});return;}
   if(m.type==='match-report'){try{send(ws,{type:'match-report',id:m.id,...world.profiles?.report(c.name,m.id)});}catch(e){send(ws,{type:'error',message:e.message});}return;}
   if(m.type==='vote'){world.vote(c,m.yes);return;}
   if(m.type==='buy'){try{send(ws,{type:'wallet',wallet:world.economy?.buy(c.name,m.item)});}catch(e){send(ws,{type:'error',message:e.message});}return;}
   if(m.type==='shirt'){try{if((activeMatch(world.field(c.field))||world.ranked?.pending(c.name).active))throw Error('Equip cosmetics in the Park or after full time');if(world.economy)send(ws,{type:'wallet',wallet:world.economy.equip(c.name,'shirt',m.shirtId)});world.setShirt(c,m.shirtId);}catch(e){send(ws,{type:'error',message:e.message});}return;}
   if(m.type==='goal-effect'){try{if(activeMatch(world.field(c.field))||world.ranked?.pending(c.name).active)throw Error('Equip cosmetics in the Park or after full time');if(world.economy)send(ws,{type:'wallet',wallet:world.economy.equip(c.name,'effect',m.goalEffectId)});world.setGoalEffect(c,m.goalEffectId);}catch(e){send(ws,{type:'error',message:e.message});}return;}
   if(m.type==='join'){
    const target=world.field(m.field??m.size);
    if(c.field===null&&target?.phase==='warmup'&&target.members.length===target.size*2-1&&target.game.players.some(p=>p.team===m.team&&!p.human)){
      for(const memberSocket of sockets)if(memberSocket.client?.field===target.id){send(memberSocket,world.state(memberSocket.client));send(memberSocket,world.report(memberSocket.client));}
    }
    const error=world.join(c,m.field??m.size,m.team);if(error){send(ws,{type:'error',message:error});return;}
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
    send(ws,world.state(ws.client));const f=world.field(ws.client.field);
    if(f.game.state==='ended'&&ws.client.finalSent!==f.matchId&&send(ws,world.report(ws.client)))ws.client.finalSent=f.matchId;
   }
   for(const f of world.fields)f.events=[];
  }
  if(now-parkAt>=50){parkAt=now;const overview=world.overview();for(const ws of sockets)if(ws.client)send(ws,overview);}
  if(now-reportAt>=1000){reportAt=now;for(const ws of sockets)if(ws.client?.field!==null&&ws.client)send(ws,world.report(ws.client));}
 },4);
 const heartbeat=setInterval(()=>{for(const ws of sockets){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},5000);
 const close=()=>{world.unsubscribeSeason?.();for(const f of world.fields)world.activeMemory?.discard(f.matchId);clearInterval(timer);clearInterval(heartbeat);for(const ws of sockets)ws.terminate();wss.close();};close.world=world;return close;
}
