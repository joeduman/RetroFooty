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
const playerState=players=>players.map(p=>({...p,isBot:!p.human}));
export function attachOnline(server,{duration,goldenGoal=true,learning=null,accounts=null,activeMemory=null}={}){
 const wss=new WebSocketServer({noServer:true,maxPayload:2048,perMessageDeflate:false});
 let room=null;const clients=new Set();
 const send=(c,m)=>{if(c.ws.readyState===1&&c.ws.bufferedAmount<128000){c.ws.send(JSON.stringify(m));return true;}return false;};
 const error=(c,message)=>send(c,{type:'error',message});
 const lobby=()=>{if(room)for(const c of room.members)send(c,{type:'lobby',code:room.code,host:c===room.host,team:room.team,size:room.size,running:room.running,members:room.members.map(x=>({name:x.name,id:x.id,team:x.team,host:x===room.host}))});};
 function setup(){
  if(room.matchId)activeMemory?.complete(room.matchId,room.game,{reason:room.game.state==='ended'?'complete':'interrupted'});
  room.game=new Match({size:room.size,team:room.team,spectator:true,loop:false,goldenGoal,duration,aiPolicy:learning?.policy(),aiContexts:learning?.memory.contexts});
  room.game.spectator=false;activeMemory?.attach(room.game);
  room.matchId=randomUUID();room.reportAt=0;room.finalReport=false;room.trained=false;
  for(const c of room.members)assign(c); 
 }
 function assign(c){
  const p=room.game.players.find(p=>p.team===c.team&&!p.human);
  if(!p)return false;
  c.id=p.id;p.human=true;p.name=c.name;p.shirtId=c.shirtId;p.goalEffectId=c.goalEffectId;p.input=neutral();c.input=neutral();c.lastInput=performance.now();c.seq=-1;c.applied=-1;
  Object.assign(room.game.tracker.rows.get(p.id),{name:c.name,human:true});return true;
 }
 function report(c){return send(c,{type:'report',matchId:room.matchId,ended:room.game.state==='ended',report:room.game.report()});}
 function snapshot(){if(!room)return;const g=room.game;
  const state={duration:g.duration,pitch:g.pitch,size:g.size,state:room.running?g.state:'lobby',wait:g.wait,score:g.score,remaining:g.remaining,half:g.half,sidesSwapped:g.sidesSwapped,halftimePending:g.halftimePending,fulltimePending:g.fulltimePending,fulltimeAttackSide:g.fulltimeAttackSide,fulltimeAttackTeam:g.fulltimeAttackTeam,overtime:g.overtime,extraElapsed:g.extraElapsed,goalTeam:g.goalTeam,goalInfo:g.goalInfo,kickoffTeam:g.kickoffTeam,kickoffPlayer:g.kickoffPlayer,round:g.round,players:playerState(g.players),engine:{ball:g.engine.ball,kickoff:g.engine.kickoff,},tracker:{elapsed:g.tracker.elapsed},stats:g.stats,practice:false,spectator:false};
  for(const c of room.members)send(c,{type:'state',tick:room.tick,matchId:room.matchId,id:c.id,ack:c.applied,state,events:room.events});room.events=[];
 }
 function leave(c){clients.delete(c);if(!room||!room.members.includes(c))return;
  activeMemory?.releasePlayer(room.matchId,c.id);
  const p=room.game.players.find(p=>p.id===c.id);if(p){p.human=false;p.name='Bot '+p.number;p.goalEffectId='classic';p.input=neutral();Object.assign(room.game.tracker.rows.get(p.id),{name:p.name,human:false});}
  room.members=room.members.filter(x=>x!==c);
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
    if(room?.members.includes(c)){error(c,'Already in this room');return;}
    c.name=account?.name||(typeof m.name==='string'?m.name.replace(/[\x00-\x1f]/g,'').trim().slice(0,16)||'Player':'Player');
    c.trainingConsent=m.trainingConsent===true;
    c.shirtId=shirtOf(m.shirtId);
    c.goalEffectId=normalizeGoalEffect(m.goalEffectId);
    if(m.type==='create'){
     if(room){error(c,'A room already exists on this server. Join it using its code.');return;}
     c.team=m.team==='blue'?'blue':'red';
     room={code:randomBytes(4).toString('hex').toUpperCase(),team:m.team==='blue'?'blue':'red',size:Math.max(1,Math.min(5,Number.isInteger(m.size)?m.size:2)),host:c,members:[c],running:false,tick:0,events:[]};setup();
    }else{
     if(!room||typeof m.code!=='string'||m.code.toUpperCase().trim()!==room.code){error(c,'Room code not found');return;}
     c.team=m.team==='red'||m.team==='blue'?m.team:room.team;
     if(!assign(c)){error(c,'That team is full. Choose the other team.');return;}
     room.members.push(c);
    }
    lobby();snapshot();report(c);return;
   }
   if(!room?.members.includes(c))return;
   if(m.type==='goal-effect'){
    c.goalEffectId=normalizeGoalEffect(m.goalEffectId);
    const p=room.game.players.find(p=>p.id===c.id);if(p)p.goalEffectId=c.goalEffectId;
    snapshot();return;
   }
   if(m.type==='shirt'){
    c.shirtId=shirtOf(m.shirtId);
    const p=room.game.players.find(p=>p.id===c.id);
    if(p)p.shirtId=c.shirtId;
    return;
   }
   if(m.type==='team'){
    if(room.running&&room.game.state!=='ended'){error(c,'Change teams in the lobby or after full time.');return;}
    if(!['red','blue'].includes(m.team)||m.team===c.team)return;
    if(!room.game.players.some(p=>p.team===m.team&&!p.human)){error(c,'That team is full.');return;}
    const old=room.game.players.find(p=>p.id===c.id);old.human=false;old.name='Bot '+old.number;old.goalEffectId='classic';old.input=neutral();
    Object.assign(room.game.tracker.rows.get(old.id),{name:old.name,human:false});c.team=m.team;assign(c);lobby();snapshot();return;
   }
   if(m.type==='start'){
    if(c!==room.host){error(c,'Only the room host can start a match');return;}
    if(room.running&&room.game.state!=='ended')return;
    setup();room.running=true;room.events=[];lobby();snapshot();return;
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
  const now=performance.now();acc+=Math.min((now-last)/1000,.1);last=now;
  while(acc>=STEP){acc-=STEP;if(room?.running){
   for(const c of room.members){const p=room.game.players.find(p=>p.id===c.id);p.input=now-c.lastInput>250?neutral():{...c.input};c.applied=c.seq;}
   room.game.update(STEP);room.events.push(...room.game.events);room.tick++;
   if(activeMemory){
    activeMemory.capture(room.matchId,room.game,{eligibleIds:room.members.filter(c=>c.trainingConsent).map(c=>c.id),participantKeys:Object.fromEntries(room.members.map(c=>[c.id,c.participantKey]))});
    if(room.game.state==='ended')activeMemory.complete(room.matchId,room.game);
   }
   // Private-room human demonstrations use the same opt-in recorder as park games.
   if(learning){
    const eligibleIds=room.members.filter(c=>c.trainingConsent).map(c=>c.id);
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
