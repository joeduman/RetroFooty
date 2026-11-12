import {ChatChannel} from './chat.mjs';
import {RULES} from './public/js/customize.mjs';
import {beforeCoins,afterCoins,trackCoins} from './match-coins.mjs';
import {canonicalName} from './public/js/ranked-config.mjs';
import {startRanked,openVote,rankedDetails,syncRanked} from './ranked-session.mjs';
import {WebSocketServer} from 'ws';
import {randomBytes,randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {Match} from './public/js/match.mjs';
import {STEP} from './public/js/config.mjs';
import {normalizeGoalEffect} from './public/js/goal-effects.mjs';
const neutral=()=>({x:0,y:0,aimX:1,aimY:0,sprint:false,shoot:false});
const shirtOf=id=>['plain','inferno','barcelona','psg'].includes(id)?id:'plain';
// Player.human marks an occupied human slot on the server. Send a separate
// isBot flag so every client renders remote humans and AI distinctly.
const playerState=(players,members=[])=>players.map(p=>({...p,isBot:!p.human,chatId:p.human?members.find(c=>c.id===p.id&&!c.disconnected)?.participantKey:null}));
export function attachOnline(server,{duration,goldenGoal=true,learning=null,accounts=null,activeMemory=null,ranked=null,economy=null}={}){
 const wss=new WebSocketServer({noServer:true,maxPayload:2048,perMessageDeflate:false});
 let room=null;const clients=new Set();
 const send=(c,m)=>{if(c.ws.readyState===1&&c.ws.bufferedAmount<128000){c.ws.send(JSON.stringify(m));return true;}return false;};
 const error=(c,message)=>send(c,{type:'error',message});
 const lobby=()=>{if(room)for(const c of room.members)send(c,{type:'lobby',ranked:ranked?rankedDetails(room,ranked):null,code:room.code,host:c===room.host,team:room.team,size:room.size,running:room.running,members:room.members.map(x=>({name:x.name,id:x.id,team:x.team,host:x===room.host}))});};
 function setup(){
  if(room.rankedStarted)ranked.void(room.matchId,'roster restart');room.coinParticipants=new Map();room.rewards={};
  room.coinsFinished=false;room.rankedFinished=false;room.rankedStarted=false;room.voteDeadline=null;for(const c of room.members)c.vote=false;
  if(room.matchId)activeMemory?.complete(room.matchId,room.game,{reason:room.game.state==='ended'?'complete':'interrupted'});
  room.game=new Match({size:room.size,team:room.team,spectator:true,loop:false,goldenGoal,duration,aiPolicy:learning?.policy(),aiContexts:learning?.memory.contexts});
  room.game.spectator=false;activeMemory?.attach(room.game);
  room.matchId=randomUUID();room.reportAt=0;room.finalReport=false;room.trained=false;
  for(const c of room.members){assign(c);trackCoins(room,c);}
 }
 function assign(c){
  const p=room.game.players.find(p=>p.team===c.team&&!p.human&&!room.members.some(x=>x!==c&&x.id===p.id));
  if(!p)return false;
  c.id=p.id;p.human=true;p.name=c.name;p.shirtId=c.shirtId;p.goalEffectId=c.goalEffectId;p.input=neutral();c.input=neutral();c.lastInput=performance.now();c.seq=-1;c.applied=-1;
  Object.assign(room.game.tracker.rows.get(p.id),{name:c.name,human:true});return true;
 }
 function report(c){return send(c,{type:'report',wallet:economy?.view(c.name),gold:room.rewards?.[canonicalName(c.name)]??null,ranked:ranked?rankedDetails(room,ranked):null,matchId:room.matchId,ended:room.game.state==='ended',report:room.game.report()});}
 function snapshot(){if(!room)return;const g=room.game;
  const state={duration:g.duration,pitch:g.pitch,size:g.size,state:room.running?g.state:'lobby',wait:g.wait,score:g.score,remaining:g.remaining,half:g.half,sidesSwapped:g.sidesSwapped,halftimePending:g.halftimePending,fulltimePending:g.fulltimePending,fulltimeAttackSide:g.fulltimeAttackSide,fulltimeAttackTeam:g.fulltimeAttackTeam,overtime:g.overtime,extraElapsed:g.extraElapsed,goalTeam:g.goalTeam,goalInfo:g.goalInfo,kickoffTeam:g.kickoffTeam,kickoffPlayer:g.kickoffPlayer,round:g.round,players:playerState(g.players,room.members),engine:{ball:g.engine.ball,kickoff:g.engine.kickoff,},tracker:{elapsed:g.tracker.elapsed},stats:g.stats,practice:false,spectator:false};
  for(const c of room.members)send(c,{type:'state',ranked:ranked?rankedDetails(room,ranked):null,tick:room.tick,matchId:room.matchId,id:c.id,ack:c.applied,state,events:room.events});room.events=[];
 }
 function leave(c){room?.chat?.leave(c.participantKey);clients.delete(c);ranked?.release(c.name,c.participantKey);
  if(room?.mode==='ranked'&&room.rankedStarted&&room.members.includes(c)&&room.game.tracker.elapsed>0&&room.game.state!=='ended'){ranked.disconnect(room.matchId,c.name);c.disconnected=true;c.input=neutral();const p=room.game.players.find(p=>p.id===c.id);if(p){p.input=neutral();p.human=false;}lobby();return;}if(!room||!room.members.includes(c))return;
  activeMemory?.releasePlayer(room.matchId,c.id);
  const p=room.game.players.find(p=>p.id===c.id);if(p){p.human=false;p.name='Bot '+p.number;p.goalEffectId='classic';p.input=neutral();Object.assign(room.game.tracker.rows.get(p.id),{name:p.name,human:false});}
  room.members=room.members.filter(x=>x!==c);if(room.rankedStarted&&room.game.state!=='ended')syncRanked(room,ranked,'id');
  if(!room.members.length){activeMemory?.complete(room.matchId,room.game,{reason:room.game.state==='ended'?'complete':'interrupted'});if(learning)learning.complete(room.matchId,room.game,{reason:room.game.state==='ended'?'complete':'interrupted'});room=null;return;}
  if(room.host===c)room.host=room.members[0];lobby();snapshot();
 }
 server.on('upgrade',(req,socket,head)=>{
  if(req.url!=='/online')return;
  if(clients.size>=32){socket.destroy();return;}
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host){socket.destroy();return;}}catch{socket.destroy();return;}}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
 });
 wss.on('connection',(ws,req)=>{
  const account=accounts?.get(req)||null;
  const c={ws,participantKey:randomUUID(),name:account?.name||'Player',accountId:account?.id||null,shirtId:'plain',goalEffectId:'classic',trainingConsent:false,input:neutral(),seq:-1,lastInput:0,alive:true,window:performance.now(),count:0};clients.add(c);
  ws.on('pong',()=>c.alive=true);ws.on('error',()=>{});ws.on('close',()=>leave(c));
  ws.on('message',bytes=>{
   const now=performance.now();if(now-c.window>1000){c.window=now;c.count=0;}if(++c.count>160){ws.close(1008,'Too many messages');return;}
   let m;try{m=JSON.parse(bytes.toString());}catch{error(c,'Invalid message');return;}
   if(!m||typeof m!=='object')return;
   if(m.type==='ping'){send(c,{type:'pong',at:m.at});return;}
   if(m.type==='create'||m.type==='join'){
    const requested=account?.name||(typeof m.name==='string'?m.name.replace(/[\x00-\x1f]/g,'').trim().slice(0,16)||'Player':'Player');
    const reserved=room?.mode==='ranked'&&room.members.find(x=>canonicalName(x.name)===canonicalName(requested)&&x.disconnected);
    if(reserved){if(!ranked.reconnect(room.matchId,requested,m.reconnectToken)){error(c,'A valid reconnect token is required before the deadline');return;}try{ranked.claim(requested,reserved.participantKey);}catch(e){error(c,e.message);return;}Object.assign(c,{...reserved,ws:c.ws,disconnected:false,alive:true,seq:-1,applied:-1,input:neutral(),lastInput:performance.now()});room.members=room.members.map(x=>x===reserved?c:x);const restored=room.game.players.find(p=>p.id===c.id);restored.human=true;restored.name=c.name;if(room.host===reserved)room.host=c;send(c,{type:'identity',reconnectToken:c.reconnectToken});room.chat.join(c.participantKey,c.name);send(c,room.chat.snapshot());lobby();snapshot();report(c);return;}
    if(room?.members.includes(c)){error(c,'Already in this room');return;}
    if(!String(account?.name||m.name||'').trim()){error(c,'Enter your username');return;}
    if((m.mode==='ranked'||room?.mode==='ranked')&&ranked?.hasPending(requested)){error(c,'A previous ranked result is still pending');return;}
    c.name=account?.name||(typeof m.name==='string'?m.name.replace(/[\x00-\x1f]/g,'').trim().slice(0,16)||'Player':'Player');
    if(room?.voteDeadline){error(c,'Wait for the overtime vote');return;}
    if(m.type==='create'&&room){error(c,'A room already exists on this server. Join it using its code.');return;}
    if(m.type==='join'&&(!room||typeof m.code!=='string'||m.code.toUpperCase().trim()!==room.code)){error(c,'Room code not found');return;}
    try{if(ranked){ranked.recoverPending(c.name,m.reconnectToken);ranked.claim(c.name,c.participantKey);c.name=ranked.player(c.name).name;}}catch(e){error(c,e.message);return;}
    c.reconnectToken=randomBytes(24).toString('hex');send(c,{type:'identity',reconnectToken:c.reconnectToken});
    c.trainingConsent=m.trainingConsent===true;
    c.shirtId=shirtOf(m.shirtId);
    c.goalEffectId=normalizeGoalEffect(m.goalEffectId);if(economy){const w=economy.wallet(c.name);c.shirtId=w.equipped.shirt;c.goalEffectId=w.equipped.effect;send(c,{type:'wallet',wallet:economy.view(c.name)});}
    if(m.type==='create'){
     if(room){error(c,'A room already exists on this server. Join it using its code.');return;}
     c.team=m.team==='blue'?'blue':'red';
     room={chat:new ChatChannel(m=>{if(room)for(const member of room.members)send(member,m);}),mode:m.mode==='ranked'&&ranked?'ranked':'casual',code:randomBytes(4).toString('hex').toUpperCase(),team:m.team==='blue'?'blue':'red',size:Math.max(1,Math.min(5,Number.isInteger(m.size)?m.size:2)),host:c,members:[c],running:false,tick:0,events:[]};setup();
    }else{
     if(!room||typeof m.code!=='string'||m.code.toUpperCase().trim()!==room.code){error(c,'Room code not found');return;}
     c.team=m.team==='red'||m.team==='blue'?m.team:room.team;
     if(!assign(c)){ranked?.release(c.name,c.participantKey);error(c,'That team is full. Choose the other team.');return;}
     room.members.push(c);trackCoins(room,c);if(room.rankedStarted)syncRanked(room,ranked,'id');
     if(room.running&&!room.fullReset&&room.members.length===room.size*2&&!room.members.some(x=>x.disconnected)){setup();room.game.wait=RULES.fullRosterCountdownSeconds;room.fullReset=true;room.running=true;if(room.mode==='ranked'){if(room.size>=4){openVote(room,ranked);room.running=false;}else startRanked(room,ranked,'id');}}
    }
    room.chat.join(c.participantKey,c.name);send(c,room.chat.snapshot());lobby();snapshot();report(c);return;
   }
   if(!room?.members.includes(c))return;
   if(m.type==='chat-send'||m.type==='chat-typing'){const message=room.chat.handle(c.participantKey,m);if(message)send(c,{type:'chat-error',message});return;}
   if(m.type==='vote'){if(room.voteDeadline>ranked?.now()&&room.size>=4)c.vote=m.yes===true;lobby();return;}
   if(m.type==='buy'){try{send(c,{type:'wallet',wallet:economy?.buy(c.name,m.item)});}catch(e){error(c,e.message);}return;}
   if(m.type==='goal-effect'){
    try{if(economy)economy.equip(c.name,'effect',m.goalEffectId);}catch(e){error(c,e.message);return;}
    c.goalEffectId=normalizeGoalEffect(m.goalEffectId);if(economy)send(c,{type:'wallet',wallet:economy.view(c.name)});
    const p=room.game.players.find(p=>p.id===c.id);if(p)p.goalEffectId=c.goalEffectId;
    snapshot();return;
   }
   if(m.type==='shirt'){
    try{if(economy)send(c,{type:'wallet',wallet:economy.equip(c.name,'shirt',m.shirtId)});}catch(e){error(c,e.message);return;}
    c.shirtId=shirtOf(m.shirtId);
    const p=room.game.players.find(p=>p.id===c.id);
    if(p)p.shirtId=c.shirtId;
    return;
   }
   if(m.type==='team'){
    if(room.voteDeadline||room.running&&room.game.state!=='ended'){error(c,'Change teams in the lobby or after full time.');return;}
    if(!['red','blue'].includes(m.team)||m.team===c.team)return;
    if(!room.game.players.some(p=>p.team===m.team&&!p.human)){error(c,'That team is full.');return;}
    const old=room.game.players.find(p=>p.id===c.id);old.human=false;old.name='Bot '+old.number;old.goalEffectId='classic';old.input=neutral();
    Object.assign(room.game.tracker.rows.get(old.id),{name:old.name,human:false});c.team=m.team;assign(c);lobby();snapshot();return;
   }
   if(m.type==='start'){
    if(c!==room.host){error(c,'Only the room host can start a match');return;}
    if(room.voteDeadline||room.running&&room.game.state!=='ended')return;
    if(room.mode==='ranked'&&room.members.some(c=>c.disconnected)){error(c,'Wait for reconnect shields to finish');return;}setup();room.fullReset=room.members.length===room.size*2;if(room.fullReset)room.game.wait=RULES.fullRosterCountdownSeconds;room.events=[];
    if(room.mode==='ranked'){try{if(room.size>=4&&room.fullReset){openVote(room,ranked);room.running=false;}else{startRanked(room,ranked,'id');room.running=true;}}catch(e){error(c,e.message);return;}}else room.running=true;
    lobby();snapshot();return;
   }
   if(m.type==='input'){
    if(!Number.isSafeInteger(m.seq)||m.seq<=c.seq||!m.input||typeof m.input!=='object')return;
    const i=m.input;if(!['x','y','aimX','aimY'].every(k=>typeof i[k]==='number'&&Number.isFinite(i[k])))return;
    const len=Math.max(1,Math.hypot(i.x,i.y)),aim=Math.hypot(i.aimX,i.aimY)||1;
    c.input={x:i.x/len,y:i.y/len,aimX:i.aimX/aim,aimY:i.aimY/aim,sprint:i.sprint===true,shoot:i.shoot===true};c.seq=m.seq;c.lastInput=now;
   }
  });
 });
 let last=performance.now(),acc=0,broadcast=0;
 const timer=setInterval(()=>{
  ranked?.sweep();
  if(room?.rankedStarted&&room.game.state!=='ended'){for(const c of [...room.members])if(c.disconnected&&ranked.db.matches[room.matchId]?.players.find(p=>p.key===canonicalName(c.name))?.deadline<=ranked.now()){room.members=room.members.filter(x=>x!==c);syncRanked(room,ranked,'id');}if(!room.members.includes(room.host)&&room.members.length)room.host=room.members[0];}
  if(room?.mode==='ranked'&&room.game.state==='ended'){
   const result=ranked.result(room.matchId);
   for(const c of [...room.members])if(c.disconnected&&result?.players.find(p=>p.key===canonicalName(c.name))?.settled){const p=room.game.players.find(p=>p.id===c.id);p.human=false;p.name='Bot '+p.number;p.input=neutral();room.members=room.members.filter(x=>x!==c);}
   if(!room.members.length)room=null;
   else if(!room.members.includes(room.host)){room.host=room.members[0];lobby();}
  }
  if(room?.voteDeadline&&ranked.now()>=room.voteDeadline){if(room.members.length&&!room.members.some(c=>c.disconnected)){try{startRanked(room,ranked,'id');room.running=true;}catch(e){for(const c of room.members)error(c,e.message);room.voteDeadline=null;}}else room.voteDeadline=null;lobby();}
  const now=performance.now();acc+=Math.min((now-last)/1000,.1);last=now;
  while(acc>=STEP){acc-=STEP;if(room?.running){
   for(const c of room.members.filter(c=>!c.disconnected)){const p=room.game.players.find(p=>p.id===c.id);p.input=now-c.lastInput>250?neutral():{...c.input};c.applied=c.seq;}
   const coinBefore=beforeCoins(room);room.game.update(STEP);afterCoins(room,coinBefore);if(room.rankedStarted&&room.game.tracker.elapsed>0)ranked.db.matches[room.matchId].startedPlay=true;if(room.rankedStarted&&room.game.state==='ended')(room.rankedFinished||(ranked.finish(room.matchId,room.game.score),room.rankedFinished=true));if(room.game.state==='ended'&&economy&&!room.coinsFinished){room.rewards=economy.settle(room.matchId,[...room.coinParticipants.values()],room.game.score,room.game.duration);room.coinsFinished=true;}room.events.push(...room.game.events);room.tick++;
   if(activeMemory){
    activeMemory.capture(room.matchId,room.game,{eligibleIds:room.members.filter(c=>c.trainingConsent&&!c.disconnected).map(c=>c.id),participantKeys:Object.fromEntries(room.members.map(c=>[c.id,c.participantKey]))});
    if(room.game.state==='ended')activeMemory.complete(room.matchId,room.game);
   }
   // Private-room human demonstrations use the same opt-in recorder as park games.
   if(learning){
    const eligibleIds=room.members.filter(c=>c.trainingConsent&&!c.disconnected).map(c=>c.id);
    if(eligibleIds.length)learning.capture(room.matchId,room.game,{eligibleIds});
    learning.eventsFor(room.matchId,room.game.events);
    if(room.game.state==='ended'&&!room.trained){
     learning.complete(room.matchId,room.game);room.trained=true;
    }
   }
  }}
  if(now-broadcast>=1000/60){broadcast=now-(now-broadcast)%(1000/60);snapshot();}
  if(room?.running&&(!room.finalReport)&&(now-room.reportAt>=1000||room.game.state==='ended')){room.reportAt=now;if(room.game.state==='ended')snapshot();const delivered=room.members.map(c=>report(c));room.finalReport=room.game.state==='ended'&&delivered.every(Boolean);}
 },4);
 const heartbeat=setInterval(()=>{for(const c of clients){if(!c.alive){c.ws.terminate();continue;}c.alive=false;c.ws.ping();}},5000);
 return ()=>{if(room)activeMemory?.discard(room.matchId);clearInterval(timer);clearInterval(heartbeat);for(const c of clients)c.ws.terminate();wss.close();};
}
