import {mountChat} from './chat-client.mjs';
import {mountShop} from './shop-ui.mjs';
import {renderRanked} from './ranked-ui.mjs';
let reconnectToken='';try{reconnectToken=sessionStorage.getItem('teamball-online-reconnect')||'';}catch{}
import {Renderer} from './renderer.mjs';
import {InputController,loadPreferences,savePreferences} from './input.mjs';
import {mountShirtPicker} from './shirt-picker.mjs';
import {mountGoalEffectPicker} from './goal-effect-picker.mjs';
import {GameAudio} from './audio.mjs';
import {OnlinePrediction} from './online-prediction.mjs';
import {renderReport} from './report.mjs';
import {ReplayRecorder,historyStore} from './replay.mjs';
const $=id=>document.getElementById(id),prefs=loadPreferences(),renderer=new Renderer($('field')),audio=new GameAudio();
let ws=null,latest=null,view=null,member=null,seq=0,last=0,sendClock=0,lastStateAt=0,rtt=0,pingAt=0;
let prediction=new OnlinePrediction(),matchId=null,report=null,finalReport=false,recorder=null,recordTick=0,nextSave=15,saveQueue=Promise.resolve();
const neutral=()=>({x:0,y:0,aimX:1,aimY:0,sprint:false,shoot:false});
let controls=neutral();
const chat=mountChat($('chat-widget'),{send,active:()=>Boolean(member)&&$('shop-panel').hidden&&($('online-panel').hidden||!latest||latest.state==='lobby'),resetControls:()=>{input.reset();controls=neutral();if(latest)sendInput(controls);},focusGame:()=>$('field').focus()});renderer.chat=chat;
const input=new InputController($('field'),renderer,prefs,{pause:()=>openMenu(),changed:()=>savePreferences(prefs),onBound:()=>{},isActive:()=>!!latest&&['playing','goal'].includes(latest.state)&&$('online-panel').hidden&&!chat.editing});
$('name').value=prefs.name;$('movement').value=prefs.movement;$('team').value=prefs.team;
$('movement').onchange=()=>{prefs.movement=$('movement').value;savePreferences(prefs);input.reset();};
let wallet=null;
const shop=mountShop($('shop-panel'),{buy:item=>send({type:'buy',item}),equip:item=>send(item.kind==='shirt'?{type:'shirt',shirtId:item.value}:{type:'goal-effect',goalEffectId:item.value})});
$('shop-open').onclick=()=>shop.open();
function updateWallet(value,gold=null){if(!value)return;wallet=value;shop.refresh(value);$('gold-balance').textContent=value.balance+' Gold';prefs.shirtId=value.equipped.shirt;prefs.goalEffectId=value.equipped.effect;savePreferences(prefs);onlineShirtPicker.refresh(prefs.shirtId);onlineGoalEffectPicker.refresh(prefs.goalEffectId);if(gold!==null)$('coin-summary').textContent='+'+gold+' Gold';}
function send(m){if(ws?.readyState===1&&ws.bufferedAmount<16000)ws.send(JSON.stringify(m));}
// The online-room HTML has no dedicated customization slot yet, so insert
// the shared picker into its menu without changing that page's markup.
const onlineShirtHost=document.createElement('div');
const onlineShirtContainer=$('online-panel');
onlineShirtContainer?.prepend(onlineShirtHost);
const onlineShirtPicker=mountShirtPicker(onlineShirtHost,prefs.shirtId,shirtId=>{
 if(!shop.owns('shirt',shirtId)){shop.open();return;}prefs.shirtId=shirtId;savePreferences(prefs);
 send({type:'shirt',shirtId});onlineShirtPicker.refresh(shirtId);
});
const onlineGoalEffectPicker=mountGoalEffectPicker($('goal-effect-picker-online'),prefs.goalEffectId,goalEffectId=>{
 if(!shop.owns('effect',goalEffectId)){shop.open();return;}prefs.goalEffectId=goalEffectId;savePreferences(prefs);onlineGoalEffectPicker.refresh(goalEffectId);
 send({type:'goal-effect',goalEffectId});
});
function sendInput(value,at=performance.now()) {const n=seq++;send({type:'input',seq:n,input:value});prediction.input(n,value,at);}
function save(data){
 $('save-status').textContent='Saving replay and stats…';
 saveQueue=saveQueue.then(()=>historyStore.save(data)).then(()=>{$('save-status').textContent='Replay and stats saved on this browser.';}).catch(()=>{$('save-status').textContent='Could not save replay: browser storage is unavailable or full.';});
}
function archive(status='interrupted'){if(recorder&&!recorder.finalized&&report){save(recorder.finish(status));}}
function updateReport(){
 if(!report||!latest)return;
 const personal={...report,players:report.players.map(p=>({...p,human:p.id===latest.human.id}))};
 $('match-report').hidden=false;renderReport($('stats-table'),$('heatmap'),$('heatmap-player'),personal,Number($('heatmap-player').value)||latest.human.id);
}
function openMenu(){if(!member)return;$('online-panel').hidden=false;input.reset();controls=neutral();sendInput(controls);updateReport();$('status').textContent=latest?.state==='ended'?'Full time. Choose teams or let the host start a rematch.':'The match continues while this menu is open.';}
function showSummary(){
 const own=latest.score[latest.human.team],other=latest.score[latest.human.team==='red'?'blue':'red'];
 $('online-summary-title').textContent=`${own===other?'Draw':own>other?'Win':'Loss'} ${own}-${other}`;
 $('online-summary').hidden=false;$('online-panel').hidden=true;input.reset();controls=neutral();sendInput(controls);
}
$('online-summary-details').onclick=openMenu;
$('online-menu').onclick=openMenu;
$('resume').onclick=()=>{$('online-panel').hidden=true;input.reset();$('field').focus();};
function reset(message){chat.setConnected(false);audio.reset();archive();latest=view=member=report=recorder=null;matchId=null;finalReport=false;prediction=new OnlinePrediction();rtt=0;pingAt=0;$('online-summary').hidden=true;$('match-report').hidden=true;$('entry').hidden=false;$('room').hidden=true;$('online-panel').hidden=false;$('status').textContent=message;$('create').disabled=$('join').disabled=false;input.reset();}
$('leave').onclick=()=>{const old=ws;ws=null;old?.close();reset('You left the room.');};
$('online-summary-leave').onclick=$('leave').onclick;
function refreshRoom(){
 if(!member)return;
 const own=member.members.find(p=>p.id===latest?.human?.id);
 $('roster').textContent=`${member.size}v${member.size}\n`+['red','blue'].map(team=>`${team.toUpperCase()}: `+member.members.filter(p=>p.team===team).map(p=>p.name+(p.host?' (host)':'')).join(', ')+` · ${member.size-member.members.filter(p=>p.team===team).length} ${member.ranked?.mode==='ranked'?'bots':'bots'}`).join('\n');
 const locked=member.running&&latest?.state!=='ended';
 for(const team of ['red','blue'])$('choose-'+team).disabled=locked||own?.team===team||member.members.filter(p=>p.team===team).length>=member.size;
 $('start').hidden=!member.host||locked;$('resume').hidden=!member.running;
}
function connect(type){
 if(ws)ws.close();reset('Connecting…');$('create').disabled=$('join').disabled=true;
 prefs.name=$('name').value.trim();if(!prefs.name){$('status').textContent='Enter your username';$('create').disabled=$('join').disabled=false;return;}prefs.team=$('team').value;savePreferences(prefs);
 const socket=ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/online`);
 const timeout=setTimeout(()=>{if(ws===socket&&socket.readyState!==1){socket.close();reset('Connection timed out. Check the server address and port.');}},8000);
 socket.onopen=()=>{clearTimeout(timeout);seq=0;send({type,name:prefs.name,team:$('team').value,mode:$('ranked-mode').value,reconnectToken,size:Number($('size').value),code:$('code').value,shirtId:prefs.shirtId,goalEffectId:prefs.goalEffectId,trainingConsent:!!$('training-consent')?.checked});};
 socket.onclose=()=>{clearTimeout(timeout);if(ws===socket){ws=null;reset('Disconnected. Rejoin with the room code; use the same username and tab to restore a protected Ranked slot.');}};
 socket.onerror=()=>{$('status').textContent='Could not connect to the server.';};
 socket.onmessage=e=>{
  if(ws!==socket)return;const m=JSON.parse(e.data);
  if(chat.receive(m))return;
  if(m.type==='pong'){const measured=performance.now()-m.at;if(Number.isFinite(measured)&&measured>=0&&measured<10000)rtt=rtt?rtt*.7+measured*.3:measured;return;}
  if(m.type==='wallet'){updateWallet(m.wallet);return;}
  if(m.type==='identity'){reconnectToken=m.reconnectToken;try{sessionStorage.setItem('teamball-online-reconnect',reconnectToken);}catch{}return;}
  if(m.type==='error'){$('status').textContent=m.message;$('create').disabled=$('join').disabled=false;return;}
  if(m.type==='lobby'){
   member=m;chat.setConnected(true);renderRanked($('ranked-lobby'),m.ranked,prefs.name);$('vote-controls').hidden=!m.ranked?.vote?.deadline;$('entry').hidden=true;$('room').hidden=false;$('room-code').textContent=m.code;refreshRoom();
   $('status').textContent='Share the room code and server address. Each player chooses a team.';
  }
  if(m.type==='report'&&m.matchId===matchId){updateWallet(m.wallet,m.gold);renderRanked($('ranked-summary'),m.ranked,prefs.name);
   report=m.report;finalReport=m.ended;
   if(!$('online-panel').hidden)updateReport();
   if(recorder&&finalReport&&latest.state==='ended')archive(recorder.meta.joinedLate?'joined late':'complete');
   else if(recorder&&recorder.time>=nextSave){nextSave=recorder.time+15;save(recorder.snapshot('interrupted'));}
  }
  if(m.type==='state'){renderRanked($('ranked-lobby'),m.ranked,prefs.name);$('vote-controls').hidden=!m.ranked?.vote?.deadline;renderRanked($('ranked-summary'),m.ranked,prefs.name);
   const old=latest;
   if(matchId!==m.matchId){$('coin-summary').textContent='';audio.reset();archive();report=null;finalReport=false;recorder=null;nextSave=15;matchId=m.matchId;$('match-report').hidden=true;$('online-summary').hidden=true;}
   latest=m.state;latest.human=latest.players.find(p=>p.id===m.id);
   lastStateAt=performance.now();prediction.receive(m,lastStateAt,rtt);
   // Record authoritative snapshots, not speculative client collisions.
   if(latest.state!=='lobby'){
    const recorded={...latest,online:true,joinedLate:latest.tracker.elapsed>0,players:latest.players.map(p=>({...p,human:p.id===m.id})),report:()=>({...report,players:(report?.players||[]).map(p=>({...p,human:p.id===m.id}))})};
    if(!recorder){recorder=new ReplayRecorder(recorded,{id:`online-${matchId}-${m.id}-${Date.now()}`});recordTick=m.tick;}
    else if(!recorder.finalized){recorder.match=recorded;recorder.step(Math.max(0,m.tick-recordTick)/120);recordTick=m.tick;}
   }
   if(latest.state!=='lobby'&&(!old||old.state==='lobby'||old.state==='ended'&&latest.state==='kickoff')){$('online-panel').hidden=true;$('field').focus();}
   refreshRoom();$('resume').hidden=latest.state==='lobby';$('start').textContent=latest.state==='ended'?'PLAY AGAIN':'START MATCH';
   if(latest.state==='ended'&&old?.state!=='ended')showSummary();
   if(recorder&&finalReport&&latest.state==='ended')archive(recorder.meta.joinedLate?'joined late':'complete');
   audio.play(m.events,prefs.volume,{team:latest.human?.team??null});
  }
 };
}
$('vote-yes').onclick=()=>send({type:'vote',yes:true});$('vote-no').onclick=()=>send({type:'vote',yes:false});
$('create').onclick=()=>connect('create');$('join').onclick=()=>connect('join');$('start').onclick=()=>send({type:'start'});
for(const team of ['red','blue'])$('choose-'+team).onclick=()=>send({type:'team',team});
window.addEventListener('pagehide',()=>{archive();ws?.close();});
function frame(now){
 chat.tick(now);
 const dt=Math.min((now-(last||now))/1000,.05);last=now;
 if(ws?.readyState===1&&now-pingAt>1000){pingAt=now;send({type:'ping',at:now});}
 if(latest){
  controls=!chat.editing&&$('online-panel').hidden&&['playing','goal'].includes(latest.state)?input.read(view?.human||latest.human,dt):neutral();
  sendClock+=dt;if(sendClock>=1/60){sendClock%=1/60;sendInput(controls,now);}
  view=prediction.project(now);
  // YOU indicator is personal; the roster retains all human assignments.
  for(const p of view.players)p.human=p.id===latest.human.id;
  renderer.draw(view,prefs,input.pointer,false);
  $('red-score').textContent=latest.score.red;$('blue-score').textContent=latest.score.blue;
  const sec=Math.ceil(latest.overtime?latest.extraElapsed:latest.remaining);$('clock').textContent=(latest.overtime?'+':'')+Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');
  $('match-label').textContent=`${latest.size}v${latest.size} · ONLINE · ${latest.human.team.toUpperCase()} · ${latest.halftimePending||latest.fulltimePending?'LAST ATTACK':latest.overtime?'GOLDEN GOAL':`HALF ${latest.half||1}`} · ${Math.round(rtt)} ms`;
  $('online-hint').textContent=now-lastStateAt>1000?'Connection interrupted — waiting for server…':`${prefs.movement==='keys'?'WASD / arrows':'Mouse'} to move · Click / Space to shoot · Shift to sprint · Esc for menu`;
 }
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
Object.defineProperty(window,'teamballOnline',{value:{snapshot:()=>latest?structuredClone({state:latest,room:member,id:latest.human.id,rtt,report,view:view?{players:view.players,ball:view.engine.ball}:null}):null}});
