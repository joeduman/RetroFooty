import {mountChat} from './chat-client.mjs';
import {mountShop} from './shop-ui.mjs';
import {renderLeaderboard,renderRanked} from './ranked-ui.mjs';
import {LOOK,TEXT} from './customize.mjs';
import {PARK,COURTS,courtAt} from './park-layout.mjs';
import {ParkRenderer} from './park-renderer.mjs';
import {Renderer} from './renderer.mjs';
import {InputController,loadPreferences,savePreferences,bindingName} from './input.mjs';
import {mountShirtPicker} from './shirt-picker.mjs';
import {mountGoalEffectPicker} from './goal-effect-picker.mjs';
import {OnlinePrediction} from './online-prediction.mjs';
import {GameAudio} from './audio.mjs';
import {renderReport} from './report.mjs';
import {ReplayRecorder,historyStore} from './replay.mjs';
// Store screen coordinates so walking remains correct as the camera moves.
let parkPointer=null;
let mapOpen=false;
const $=id=>document.getElementById(id),prefs=loadPreferences(),parkRenderer=new ParkRenderer($('park-canvas')),renderer=new ParkRenderer($('field')),audio=new GameAudio();
let leaderboardSignature='';
let reconnectToken='';try{reconnectToken=sessionStorage.getItem('teamball-park-reconnect')||'';}catch{}
let ws=null,id=null,park=null,selected=null,destination=null,latest=null,view=null,phase=null,field=null,matchId=null,report=null,finalReport=false;
let predictor=new OnlinePrediction(),seq=0,rtt=0,pingAt=0,lastStateAt=0,lastParkAt=0,last=0,sendAt=0,recorder=null,recordTick=0,nextSave=15,saveQueue=Promise.resolve(),toastUntil=0;
const keys=new Set(),idle=()=>({x:0,y:0,aimX:1,aimY:0,shoot:false,sprint:false});
const chat=mountChat($('chat-widget'),{send,active:()=>Boolean(id)&&$('settings-panel').hidden&&$('shop-panel').hidden&&$('court-dialog').hidden&&$('park-options').hidden&&(!latest||$('match-panel').hidden),resetControls:()=>{resetWalk();input.reset();if(latest)inputSend(idle());},focusGame:()=>$(latest?'field':'park-canvas').focus()});
parkRenderer.art.chat=renderer.art.chat=chat;
const settingsOpen=()=>!$('settings-panel').hidden||!$('shop-panel').hidden||chat.editing;
const playing=()=>latest&&['playing','goal'].includes(latest.state);
const input=new InputController($('field'),renderer,prefs,{pause:()=>menu(),changed:()=>savePreferences(prefs),onBound:()=>refreshBindings(),isActive:()=>Boolean(playing()&&$('match-panel').hidden&&!settingsOpen())});
$('username').value=prefs.name;$('movement').value=prefs.movement;$('volume').value=prefs.volume;
function refreshBindings(){
 $('settings-bindings').replaceChildren();$('binding-status').textContent='';
 for(const [action,code] of Object.entries(prefs.bindings)){
  const b=document.createElement('button');b.type='button';b.className='quiet';b.textContent=`${action}: ${bindingName(code)}`;
  b.onclick=()=>{input.rebinding=action;$('binding-status').textContent='Press a key or mouse button. Esc cancels.';};$('settings-bindings').append(b);
 }
}
function openSettings(){resetWalk();input.reset();if(latest)inputSend(idle());
 setMapOpen(false);
 $('settings-movement').value=prefs.movement;$('settings-volume').value=prefs.volume;
 $('settings-names').checked=prefs.showNames;$('settings-aim').checked=prefs.aimGuide;
 refreshBindings();$('settings-panel').hidden=false;
}
function closeSettings(){input.rebinding=null;input.reset();$('settings-panel').hidden=true;}
for(const id of ['login-settings','park-settings','match-settings'])$(id).onclick=openSettings;
$('settings-close').onclick=closeSettings;
$('settings-movement').onchange=()=>{prefs.movement=$('settings-movement').value;$('movement').value=prefs.movement;savePreferences(prefs);resetWalk();input.reset();};
$('settings-volume').oninput=()=>{prefs.volume=Number($('settings-volume').value);$('volume').value=prefs.volume;savePreferences(prefs);};
$('settings-names').onchange=()=>{prefs.showNames=$('settings-names').checked;savePreferences(prefs);};
$('settings-aim').onchange=()=>{prefs.aimGuide=$('settings-aim').checked;savePreferences(prefs);};
let wallet=null;
const shop=mountShop($('shop-panel'),{buy:item=>send({type:'buy',item}),equip:item=>send(item.kind==='shirt'?{type:'shirt',shirtId:item.value}:{type:'goal-effect',goalEffectId:item.value})});
$('shop-open').onclick=()=>{resetWalk();shop.open();};
function updateWallet(value,gold=null){if(!value)return;wallet=value;shop.refresh(value);$('gold-balance').textContent=value.balance+' Gold';prefs.shirtId=value.equipped.shirt;prefs.goalEffectId=value.equipped.effect;savePreferences(prefs);for(const p of shirtPickers)p.refresh(prefs.shirtId);for(const p of goalEffectPickers)p.refresh(prefs.goalEffectId);if(gold!==null)$('coin-summary').textContent='+'+gold+' Gold';}
function send(m){if(ws?.readyState===1&&ws.bufferedAmount<16000)ws.send(JSON.stringify(m));}
// Choosing a shirt immediately changes the park avatar and any active match
// player. The saved preference is also sent on the next login/reconnect.
const shirtPickers=['shirt-picker-login','shirt-picker-park','shirt-picker-match']
 .map(name=>mountShirtPicker($(name),prefs.shirtId,shirtId=>{
   if(!shop.owns('shirt',shirtId)){shop.open();return;}prefs.shirtId=shirtId;savePreferences(prefs);
   send({type:'shirt',shirtId});
   for(const picker of shirtPickers)picker.refresh(shirtId);
 }));
const goalEffectPickers=['goal-effect-picker-login','goal-effect-picker-park','goal-effect-picker-match']
 .map(name=>mountGoalEffectPicker($(name),prefs.goalEffectId,goalEffectId=>{
   if(!shop.owns('effect',goalEffectId)){shop.open();return;}prefs.goalEffectId=goalEffectId;savePreferences(prefs);
   send({type:'goal-effect',goalEffectId});
   for(const picker of goalEffectPickers)picker.refresh(goalEffectId);
 }));
function inputSend(value,at=performance.now()){const n=seq++;send({type:'input',seq:n,input:value});predictor.input(n,value,at);}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;toastUntil=performance.now()+LOOK.toastMs;}
function store(data){
 $('save-status').textContent=TEXT.saving;
 saveQueue=saveQueue.then(()=>historyStore.save(data)).then(()=>{$('save-status').textContent=TEXT.saved;}).catch(()=>{$('save-status').textContent=TEXT.saveFailed;});
}
function archive(status='interrupted'){if(recorder&&!recorder.finalized&&report){store(recorder.finish(status));}}
function complete(){if(finalReport&&latest?.state==='ended')archive(phase==='warmup'?'warmup':recorder?.meta.joinedLate?'joined late':'complete');}
function showReport(){
 if(!report||!latest)return;
 const preferred=Number($('heatmap-player').value)||latest.human.id;
 renderReport($('stats-table'),$('heatmap'),$('heatmap-player'),{...report,players:report.players.map(p=>({...p,human:p.id===latest.human.id}))},preferred);
 $('match-report').hidden=false;
}
function setMapOpen(open){
 mapOpen=Boolean(open&&id&&!latest);
 $('park-map-toggle').setAttribute('aria-pressed',String(mapOpen));
 $('court-list').hidden=!id||mapOpen;
 $('map-status').textContent=mapOpen?'Park overview open. Press M or Escape to close.':'';
}
function showSummary(){
 if(!latest||latest.state!=='ended')return;
 const own=latest.score[latest.human.team],other=latest.score[latest.human.team==='red'?'blue':'red'];
 $('park-summary-title').textContent=`${own===other?'Draw':own>other?'Win':'Loss'} ${own}-${other}`;
 $('park-summary').hidden=false;
 updateNextMatch(performance.now());
}
function updateNextMatch(now){
 if(latest?.state!=='ended')return null;
 const stale=now-lastStateAt>1500,known=Number.isFinite(latest.nextMatchIn);
 const seconds=known?Math.ceil(Math.max(0,latest.nextMatchIn-Math.max(0,now-lastStateAt)/1000)):null;
 const timer=seconds===null?'--:--':Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
 const text=stale?TEXT.matchWaiting:known?TEXT.matchEnded(seconds):'Waiting for the next match';
 $('park-summary-caption').textContent=text;$('match-status').textContent=text;
 return stale?'--:--':timer;
}
function clearField(){
 parkPointer=null;
 audio.reset();
 archive();latest=view=field=phase=matchId=report=recorder=null;finalReport=false;predictor=new OnlinePrediction();input.reset();keys.clear();destination=null;
 $('match-screen').hidden=true;$('match-panel').hidden=true;$('park-app').hidden=false;$('match-report').hidden=true;$('park-summary').hidden=true;setMapOpen(false);$('park-canvas').focus();
}
function menu(){
 if(settingsOpen()){closeSettings();return;}
 if(mapOpen){setMapOpen(false);return;}
 parkPointer=null;
 if(latest){$('match-panel').hidden=!$('match-panel').hidden;input.reset();inputSend(idle());showReport();}
 else if(id){$('court-dialog').hidden=true;$('park-options').hidden=!$('park-options').hidden;keys.clear();destination=null;send({type:'walk',x:0,y:0});}
}
function disconnect(message){
 chat.setConnected(false);
 clearField();$('park-leaderboards').hidden=true;$('ranked-vote').hidden=true;id=null;park=null;$('login').hidden=false;$('park-options').hidden=true;$('court-dialog').hidden=true;
 $('park-menu').hidden=$('park-map-toggle').hidden=$('court-list').hidden=$('park-guide').hidden=true;$('play').disabled=false;$('login-status').textContent=message;
}
function updateCourts(){
 if(!park)return;
 if(park.leaderboard){const signature=JSON.stringify([park.leaderboard,park.seasonLeaderboard]);if(signature!==leaderboardSignature){leaderboardSignature=signature;renderLeaderboard($('online-leaderboard'),park.leaderboard);renderLeaderboard($('season-leaderboard'),park.seasonLeaderboard||[],'Season leaderboard');}}
 $('population').textContent=TEXT.population(park.players.length,park.fields.reduce((n,f)=>n+f.members.length,0));
 for(const f of park.fields){const button=$('court-'+f.id);if(button)button.querySelector('span').textContent=`${f.members.length}/${f.size*2} players`;}
 if(selected)describeCourt();
}
function describeCourt(){
 const f=park?.fields.find(f=>f.id===selected),layout=COURTS.find(f=>f.id===selected);if(!f)return;
 $('court-eyebrow').textContent=layout.name;$('court-title').textContent=TEXT.chooseSide;
 $('join-blue').hidden=false;
 $('join-red-label').textContent='RED';
 $('ranked-mode').disabled=true;$('ranked-mode').value=f.mode||'casual';
 $('court-status').textContent=(f.mode==='ranked'?'Ranked · ':'Casual · ')+(f.phase==='match'?TEXT.liveScore(f.score):TEXT.pickUp);
 for(const team of ['red','blue']){const members=f.members.filter(p=>p.team===team);$(team+'-slots').textContent=members.map(p=>{const rating=f.ranked?.members.find(r=>r.key===p.name.toLowerCase());return p.name+(rating?' · '+rating.elo+' '+rating.rank.name:'');}).join('\n')+(members.length?'\n':'')+TEXT.slots(f.size-members.length);$('join-'+team).disabled=members.length>=f.size;}
}
function choose(size){parkPointer=null;if(!id||latest)return;setMapOpen(false);selected=size;destination=null;keys.clear();send({type:'walk',x:0,y:0});describeCourt();$('court-dialog').hidden=false;}
for(const f of COURTS){const button=document.createElement('button');button.id='court-'+f.id;const strong=document.createElement('strong'),span=document.createElement('span');strong.textContent=f.name;button.append(strong,span);button.onclick=()=>choose(f.id);$('court-list').append(button);}
$('vote-yes').onclick=()=>send({type:'vote',yes:true});$('vote-no').onclick=()=>send({type:'vote',yes:false});
$('park-map-toggle').onclick=()=>setMapOpen(!mapOpen);
$('court-back').onclick=()=>{$('court-dialog').hidden=true;selected=null;$('park-canvas').focus();};
for(const team of ['red','blue'])$('join-'+team).onclick=()=>{send({type:'join',field:selected,team});};
$('park-menu').onclick=menu;$('match-menu').onclick=menu;$('park-resume').onclick=()=>{$('park-options').hidden=true;$('park-canvas').focus();};
$('resume-match').onclick=()=>{$('match-panel').hidden=true;input.reset();$('field').focus();};
$('return-park').onclick=()=>{input.reset();inputSend(idle());send({type:'leave'});};
$('park-summary-details').onclick=()=>{$('match-panel').hidden=false;input.reset();inputSend(idle());showReport();};
$('park-summary-leave').onclick=$('return-park').onclick;
$('volume').oninput=()=>{prefs.volume=Number($('volume').value);savePreferences(prefs);};
$('sign-out').onclick=()=>{const old=ws;ws=null;old?.close();disconnect(TEXT.signedOut);};
$('login-form').onsubmit=event=>{
 event.preventDefault();prefs.name=$('username').value.trim().slice(0,16);if(!prefs.name){$('login-status').textContent='Enter your username';return;}prefs.movement=$('movement').value;savePreferences(prefs);
 if(ws)ws.close();$('play').disabled=true;$('login-status').textContent=TEXT.entering;
 const socket=ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/park`);
 const timeout=setTimeout(()=>{if(socket===ws&&socket.readyState!==1){socket.close();disconnect(TEXT.timeout);}},8000);
 socket.onopen=()=>{clearTimeout(timeout);seq=0;rtt=0;pingAt=0;send({type:'login',reconnectToken,name:prefs.name,shirtId:prefs.shirtId,goalEffectId:prefs.goalEffectId,trainingConsent:$('training-consent').checked});};
 socket.onclose=()=>{clearTimeout(timeout);if(socket===ws){ws=null;disconnect(TEXT.disconnected);}};
 socket.onerror=()=>{if(socket===ws)$('login-status').textContent=TEXT.connectionFailed;};
 socket.onmessage=event=>{
  if(socket!==ws)return;const m=JSON.parse(event.data),now=performance.now();
  if(m.type==='wallet'){updateWallet(m.wallet);return;}
  if(chat.receive(m))return;
  if(m.type==='welcome'){chat.setConnected(true);updateWallet(m.wallet);reconnectToken=m.reconnectToken||'';try{sessionStorage.setItem('teamball-park-reconnect',reconnectToken);}catch{}$('park-leaderboards').hidden=false;id=m.id;$('login').hidden=true;$('park-menu').hidden=$('park-map-toggle').hidden=$('court-list').hidden=$('park-guide').hidden=false;$('park-canvas').focus();return;}
  if(m.type==='park'){park=m;lastParkAt=now;updateCourts();return;}
  if(m.type==='error'){toast(m.message);$('login-status').textContent=m.message;$('play').disabled=false;return;}
  if(m.type==='pong'){const measured=now-m.at;if(Number.isFinite(measured)&&measured>=0&&measured<10000)rtt=rtt?rtt*.7+measured*.3:measured;return;}
  if(m.type==='joined'){$('court-dialog').hidden=true;selected=null;keys.clear();destination=null;return;}
  if(m.type==='returned'){clearField();toast(TEXT.returned);return;}
  if(m.type==='report'&&m.matchId===matchId){updateWallet(m.wallet,m.gold);renderRanked($('ranked-summary'),m.ranked,prefs.name);report=m.report;finalReport=m.ended;if(!$('match-panel').hidden)showReport();complete();if(recorder&&!recorder.finalized&&recorder.time>=nextSave){nextSave=recorder.time+15;store(recorder.snapshot('interrupted'));}return;}
  if(m.type==='state'){renderRanked($('ranked-match'),m.ranked,prefs.name);renderRanked($('ranked-live'),m.ranked,prefs.name);renderRanked($('ranked-summary'),m.ranked,prefs.name);$('ranked-vote').hidden=!m.ranked?.vote?.deadline;
   const previous=latest,changed=matchId!==m.matchId;
   if(changed){$('coin-summary').textContent='';audio.reset();archive(phase==='warmup'?'warmup':'interrupted');recorder=null;report=null;finalReport=false;nextSave=15;matchId=m.matchId;view=null;input.reset();$('match-report').hidden=true;$('match-panel').hidden=true;$('park-summary').hidden=true;
    if(m.phase==='match')toast(TEXT.ready);}
   latest=m.state;latest.human=latest.players.find(p=>p.id===m.id);phase=m.phase;field=m.field;lastStateAt=now;
   setMapOpen(false);
   predictor.receive(m,now,rtt);$('park-app').hidden=true;$('match-screen').hidden=false;
   const recorded={...latest,online:true,joinedLate:latest.tracker.elapsed>0,players:latest.players.map(p=>({...p,human:p.id===m.id})),report:()=>({...report,players:(report?.players||[]).map(p=>({...p,human:p.id===m.id}))})};
   if(!recorder){recorder=new ReplayRecorder(recorded,{id:`park-${matchId}-${m.id}-${Date.now()}`});recordTick=m.tick;$('field').focus();}
   else if(!recorder.finalized){recorder.match=recorded;recorder.step(Math.max(0,m.tick-recordTick)/120);recordTick=m.tick;}
   $('match-eyebrow').textContent=COURTS.find(f=>f.id===field)?.name||'';
   $('match-heading').textContent=latest.state==='ended'?TEXT.fullTime:TEXT.matchMenu;
   $('park-final-score').hidden=latest.state!=='ended';if(latest.state==='ended'){$('park-final-score').replaceChildren();
    const red=document.createElement('span'),blue=document.createElement('span');red.className='red-score-label';blue.className='blue-score-label';
    red.textContent='RED '+latest.score.red;blue.textContent='BLUE '+latest.score.blue;const dash=document.createElement('span');dash.textContent=' — ';$('park-final-score').append(red,dash,blue);}
   $('match-status').textContent=latest.state==='ended'?'':TEXT.matchMenuHelp;
   updateNextMatch(now);
   if(latest.state==='ended'&&(changed||previous?.state!=='ended')){$('match-panel').hidden=true;input.reset();inputSend(idle());showSummary();}
   complete();audio.play(m.events,prefs.volume,{team:latest.human?.team??null});
  }
 };
};
$('park-canvas').addEventListener('pointermove',e=>{
  if(!id || latest || settingsOpen() ||
     !$('court-dialog').hidden ||
     !$('park-options').hidden)return;

  parkPointer={x:e.clientX,y:e.clientY};
});

$('park-canvas').addEventListener('pointerleave',()=>{
  parkPointer=null;
});

$('park-canvas').addEventListener('pointerdown',e=>{
  if(!id || latest || settingsOpen() ||
     !$('court-dialog').hidden ||
     !$('park-options').hidden)return;

  keys.add('Mouse'+e.button);
  if(e.button!==0)return;
  const p=parkRenderer.point(e.clientX,e.clientY);
  const court=courtAt(p.x,p.y);

  if(court){
    parkPointer=null;
    choose(court.id);
    return;
  }

  parkPointer={x:e.clientX,y:e.clientY};

  // Keep click-to-walk available when keyboard movement is selected.
  destination=prefs.movement==='keys'
    ? {
        x:Math.max(30,Math.min(PARK.width-30,p.x)),
        y:Math.max(30,Math.min(PARK.height-30,p.y)),
      }
    : null;

  $('park-canvas').focus();
});
window.addEventListener('keydown',e=>{
 if(!id||latest||settingsOpen()||!$('court-dialog').hidden||!$('park-options').hidden||e.target instanceof Element&&e.target.closest('input,select,textarea'))return;
 const code=e.code.startsWith('Shift')?'Shift':e.code;
 if(code==='KeyM'){e.preventDefault();if(!e.repeat)setMapOpen(!mapOpen);return;}
 if(Object.values(prefs.bindings).includes(code)||code.startsWith('Arrow')){e.preventDefault();keys.add(code);destination=null;}
});
window.addEventListener('pointerup',e=>keys.delete('Mouse'+e.button));
window.addEventListener('pointercancel',resetWalk);
$('park-canvas').addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keyup',e=>keys.delete(e.code.startsWith('Shift')?'Shift':e.code));
// Mouse wheel changes walking/spectating zoom; field framing stays automatic.
$('park-canvas').addEventListener('wheel',e=>{if(id&&!latest){e.preventDefault();parkRenderer.setZoom(e.deltaY);}},{passive:false});
// Scroll while on a field to change the match camera zoom.
$('field').addEventListener('wheel',e=>{
  if(!latest || !$('match-panel').hidden)return;

  e.preventDefault();
  const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?300:1);
  renderer.setZoom(delta,true);

  // Recalculate the mouse target as the camera zoom changes.
  input.pointer=renderer.worldPoint(e.clientX,e.clientY);
},{passive:false});
function resetWalk(){
  keys.clear();
  destination=null;
  parkPointer=null;
  send({type:'walk',x:0,y:0});
}
window.addEventListener('blur',resetWalk);document.addEventListener('visibilitychange',()=>{if(document.hidden)resetWalk();});
window.addEventListener('pagehide',()=>{archive();ws?.close();});
function frame(now){
 chat.tick(now);
 const dt=Math.min(.05,(now-(last||now))/1000);last=now;
 if(!latest)parkRenderer.draw(park,id,destination,now,{prefs,overview:mapOpen});
 if(toastUntil&&now>toastUntil){$('toast').hidden=true;toastUntil=0;}
 if(ws?.readyState===1&&now-pingAt>1000){pingAt=now;send({type:'ping',at:now});}
 if(id&&!latest){
  if(now-sendAt>1000/30){
   sendAt=now;
   let x=0,y=0;

   const active=$('court-dialog').hidden&&$('park-options').hidden&&!settingsOpen();
   const me=park?.players.find(p=>p.id===id);

   if(active&&me){
    if(prefs.movement==='mouse'){
     if(parkPointer){
      const target=parkRenderer.point(parkPointer.x,parkPointer.y);
      const dx=target.x-me.x,dy=target.y-me.y;
      const distance=Math.hypot(dx,dy);

      // Same slowdown near the pointer as normal match movement.
      const amount=Math.max(0,Math.min(1,(distance-3)/18));
      if(distance>0){
       x=dx/distance*amount;
       y=dy/distance*amount;
      }
     }
    }else{
     x=Number(keys.has(prefs.bindings.right)||keys.has('ArrowRight'))
       -Number(keys.has(prefs.bindings.left)||keys.has('ArrowLeft'));
     y=Number(keys.has(prefs.bindings.down)||keys.has('ArrowDown'))
       -Number(keys.has(prefs.bindings.up)||keys.has('ArrowUp'));

     if(destination){
      const dx=destination.x-me.x,dy=destination.y-me.y;
      const distance=Math.hypot(dx,dy);
      if(distance<16)destination=null;
      else{
       x=dx/distance;
       y=dy/distance;
      }
     }
    }
   }

   send({
    type:'walk',
    x,y,
    sprint:active&&(keys.has(prefs.bindings.sprint)),
    shoot:active&&keys.has(prefs.bindings.alternate),
   });
  }

  $('park-guide').hidden=mapOpen;
  $('park-help').textContent=
    now-lastParkAt>1500?TEXT.parkWaiting:TEXT.walkHelp;
 }
 if(latest){
  const controls=playing()&&$('match-panel').hidden&&!settingsOpen()?input.read(view?.human||latest.human,dt):idle();
  if(now-sendAt>=1000/60){sendAt=now;inputSend(controls,now);}
  view=predictor.project(now);for(const p of view.players)p.human=p.id===latest.human.id;renderer.draw(park,id,null,now,{field,view,prefs,pointer:input.pointer});
  $('red-score').textContent=latest.score.red;$('blue-score').textContent=latest.score.blue;
  const seconds=Math.ceil(latest.overtime?latest.extraElapsed:latest.remaining),nextMatch=updateNextMatch(now);$('clock').textContent=nextMatch??((latest.overtime?'+':'')+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'));
  $('match-label').textContent=latest.state==='ended'?'NEXT MATCH':`${latest.size}v${latest.size} · ${latest.halftimePending||latest.fulltimePending?'LAST ATTACK':latest.overtime?'GOLDEN GOAL':`HALF ${latest.half||1}`} · ${Math.round(rtt)} ms`;
  $('match-hint').textContent=now-lastStateAt>1000?TEXT.matchWaiting:latest.state==='goal'?TEXT.celebrationHint:TEXT.controls(prefs.movement);
 }
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
Object.defineProperty(window,'teamballPark',{value:{snapshot:()=>structuredClone({id,park,field,phase,matchId,state:latest,report,rtt,mapOpen})}});
