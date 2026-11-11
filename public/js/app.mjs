import {BUILD,STEP,MATCH_SECONDS} from './config.mjs';
import {Match} from './match.mjs';
import {Renderer} from './renderer.mjs';
import {InputController,DEFAULTS,loadPreferences,savePreferences,bindingName} from './input.mjs';
import {GameAudio} from './audio.mjs';
import {renderReport} from './report.mjs';
import {ReplayRecorder,replayFrame,historyStore} from './replay.mjs';
// Keep metadata for older saved practice replays; new games are matches only.
import {DRILLS} from './practice.mjs';
import {mountGoalEffectPicker} from './goal-effect-picker.mjs';
import {exportCompletedHumanCandidate} from './ai-active-memory.mjs';

const $=id=>document.getElementById(id),prefs=loadPreferences();
const renderer=new Renderer($('field'));
let serverBotPolicy=null,serverBotContexts={},serverBotActiveReferences={};fetch('/api/bots/policy').then(r=>r.json()).then(j=>{serverBotPolicy=j.policy;serverBotContexts=j.contexts||{};serverBotActiveReferences=j.activeReferences||{};match?.ai?.setPolicy(serverBotPolicy);match?.ai?.setLearningContexts(serverBotContexts);}).catch(()=>{});
let match=new Match({size:prefs.size,spectator:true,seed:5}),started=false,paused=true,accumulator=0,lastFrame=0,settingsFrom='menu';
let recorder=null,replay=null,saveQueue=Promise.resolve(),nextCheckpoint=15;
const gameAudio=new GameAudio();
const goalEffectPicker=mountGoalEffectPicker($('goal-effect-picker-local'),prefs.goalEffectId,goalEffectId=>{
  prefs.goalEffectId=goalEffectId;savePreferences(prefs);goalEffectPicker.refresh(goalEffectId);
  if(match.human)match.human.goalEffectId=goalEffectId;
});
const sound=events=>gameAudio.play(events,prefs.volume,{team:match.human?.team??null});
const input=new InputController($('field'),renderer,prefs,{pause:togglePause,changed:()=>savePreferences(prefs),isActive:()=>started&&!paused&&!replay,onBound:refreshBindings});
const clockText=seconds=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
function saveRecording(data){
  $('save-status').textContent='Saving replay…';
  saveQueue=saveQueue.then(()=>historyStore.save(data)).then(()=>{$('save-status').textContent='Replay and stats saved';$('storage-notice').hidden=true;}).catch(()=>{
    $('save-status').textContent='Replay could not be saved';$('storage-notice').hidden=false;
    $('storage-notice').textContent='Replay could not be saved. Browser storage may be unavailable or full.';
  });return saveQueue;
}
function archive(status='ended early'){
  if(!recorder||recorder.finalized)return;
  if(recorder.time<.05){recorder.finalized=true;return;}
  saveRecording(recorder.finish(status));
}
async function showHistory(){
  gameAudio.reset();
  archive();replay=null;started=false;paused=true;input.reset();
  for(const id of ['menu','settings','result','local-summary','replay-tools'])$(id).hidden=true;
  $('options').hidden=false;$('toggle-guide').hidden=false;$('hint').hidden=false;$('history').hidden=false;
  $('history-list').replaceChildren();$('history-status').textContent='Loading saved games…';
  await saveQueue;
  try{
    const games=await historyStore.list();$('history-status').textContent=games.length?`${games.length} saved game${games.length===1?'':'s'}`:'Play a match to save your first replay.';
    for(const game of games){
      const row=document.createElement('article');row.className='history-entry';const info=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('p'),buttons=document.createElement('div');buttons.className='buttons';
      title.textContent=game.practice&&game.drill!=='free'?`${DRILLS[game.drill].title} · ${game.report.training.score} ${DRILLS[game.drill].unit}`:(game.practice?'Free pitch':`${game.size}v${game.size}${game.online?' · Online':''}${game.spectator?' · Bots':''}`)+` · ${game.score.red}–${game.score.blue}`;
      detail.textContent=`${new Date(game.startedAt).toLocaleString()} · ${clockText(game.elapsed)} played · ${game.status==='complete'?'Finished':game.status==='interrupted'?'Interrupted / checkpoint':game.status==='joined late'?'Finished · recording from join':game.status==='warmup'?'Pick-up / warmup':'Ended early'}`;
      const watch=document.createElement('button');watch.className='quiet';watch.textContent='Replay';watch.onclick=()=>openReplay(game);
      const stats=document.createElement('button');stats.className='quiet';stats.textContent='Stats & heatmap';stats.onclick=()=>showSavedReport(game);
      info.append(title,detail);buttons.append(watch,stats);row.append(info,buttons);$('history-list').append(row);
    }
  }catch{$('history-status').textContent='Saved games are unavailable in this browser.';}
}
function showSavedReport(game){
  $('history').hidden=true;$('local-summary').hidden=true;$('result').hidden=false;$('again').hidden=true;$('local-details-close').hidden=true;$('save-status').textContent='Saved replay and stats';
  $('result-title').textContent=game.practice?DRILLS[game.drill].title:`${game.size}v${game.size} match`;
  $('result-eyebrow').textContent=game.status==='complete'?'FINISHED':game.status==='warmup'?'PICK-UP / WARMUP':game.status==='interrupted'?'INTERRUPTED · LAST CHECKPOINT':'ENDED EARLY';
  $('final-red').textContent=game.score.red;$('final-blue').textContent=game.score.blue;
  $('result-text').textContent=(game.practice&&game.drill!=='free'?`${game.report.training.score} ${DRILLS[game.drill].unit} · `:'')+`${clockText(game.elapsed)} played · ${new Date(game.startedAt).toLocaleString()}`;
  renderReport($('stats-table'),$('heatmap'),$('heatmap-player'),game.report,game.players.find(p=>p.human)?.id);
}
async function openReplay(game){
  try{
    const record=await historyStore.get(game.id);if(!record)throw Error('missing');
    replay={record,game,time:0,playing:true,rate:1};paused=true;started=false;input.reset();
    $('history').hidden=true;$('replay-tools').hidden=false;$('hint').hidden=true;$('options').hidden=true;$('toggle-guide').hidden=true;
    $('replay-title').textContent=(game.practice?DRILLS[game.drill].title:`${game.size}v${game.size}`)+' · '+(game.status==='complete'?'Finished':'Ended early / interrupted');
    $('replay-seek').max=record.duration;$('replay-seek').value=0;$('replay-speed').value='1';$('replay-play').textContent='Pause';
  }catch{$('history-status').textContent='This replay could not be opened. Its stats may still be available.';}
}
$('history-open').onclick=showHistory;$('result-history').onclick=showHistory;$('history-back').onclick=menu;$('replay-exit').onclick=showHistory;
$('replay-play').onclick=()=>{if(!replay)return;if(replay.time>=replay.record.duration)replay.time=0;replay.playing=!replay.playing;$('replay-play').textContent=replay.playing?'Pause':'Play';};
$('replay-seek').oninput=()=>{if(replay)replay.time=Number($('replay-seek').value);};
$('replay-speed').onchange=()=>{if(replay)replay.rate=Number($('replay-speed').value);};
window.addEventListener('pagehide',()=>{if(recorder&&!recorder.finalized)saveRecording(recorder.snapshot('interrupted'));});
function refreshBindings(){
  document.querySelectorAll('[data-bind]').forEach(button=>{
    const action=button.dataset.bind;button.classList.toggle('awaiting',input.rebinding===action);
    const prefix=['up','down','left','right'].includes(action)?action[0].toUpperCase()+action.slice(1)+' · ':'';
    button.textContent=input.rebinding===action?'Press a key…':prefix+bindingName(prefs.bindings[action]);
  });
  $('binding-help').textContent=input.rebinding?'Press a key or mouse button. Escape cancels.':'Tap or hold shoot to kick on contact. Holding never charges extra power; sprint adds momentum.';
  refreshHint();
}
function refreshHint(){
  $('hint').textContent=started&&match.spectator?`${match.size}v${match.size} bots · Match ${match.round} · Esc to pause`:
    `${prefs.movement==='mouse'?'Mouse only':'Keyboard / arrows'} to move · Hold ${bindingName(prefs.bindings.shoot)} / ${bindingName(prefs.bindings.alternate)} to shoot · ${bindingName(prefs.bindings.sprint)} sprint`;
}
function refreshGuide(){
  $('aim-guide').checked=prefs.aimGuide;$('toggle-guide').setAttribute('aria-pressed',String(prefs.aimGuide));
  $('toggle-guide').textContent='Aim line: '+(prefs.aimGuide?'ON':'OFF');
}
function setMovement(value){
  prefs.movement=value;input.reset();savePreferences(prefs);
  $('movement').value=value;$('menu-movement').value=value;refreshHint();
}
const difficultyKey='teamball-bot-difficulty';
if($('bot-difficulty')){$('bot-difficulty').value=localStorage.getItem(difficultyKey)||'expert';$('bot-difficulty').onchange=()=>localStorage.setItem(difficultyKey,$('bot-difficulty').value);}
function syncMenu(){
  $('player-name').value=prefs.name;
  document.querySelectorAll('[data-team]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.team===prefs.team)));
  document.querySelectorAll('[data-size]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.size)===prefs.size)));
  $('movement').value=prefs.movement;$('menu-movement').value=prefs.movement;$('volume').value=prefs.volume;$('show-names').checked=prefs.showNames;
  $('golden-goal').checked=prefs.goldenGoal;$('match-length').textContent=`${MATCH_SECONDS[prefs.size]/60}-minute match · Local play`;refreshGuide();refreshBindings();
}
function begin(spectator=false){
  gameAudio.reset();
  archive();replay=null;
  prefs.name=$('player-name').value.trim().slice(0,16)||'Player';savePreferences(prefs);
  match=new Match({size:prefs.size,team:prefs.team,name:prefs.name,spectator,loop:false,goldenGoal:prefs.goldenGoal,
    aiPolicy:serverBotPolicy,aiContexts:serverBotContexts,aiDifficulty:$('bot-difficulty')?.value||'expert'});
  match.ai.activeMemory?.setReference(serverBotActiveReferences[match.size]);
  if(match.human)match.human.goalEffectId=prefs.goalEffectId;
  recorder=new ReplayRecorder(match);nextCheckpoint=15;
  started=true;paused=false;accumulator=0;input.reset();
  for(const id of ['menu','settings','result','local-summary','history','replay-tools'])$(id).hidden=true;
  $('options').hidden=false;$('toggle-guide').hidden=false;$('hint').hidden=false;
  $('field').focus({preventScroll:true});refreshHint();hud();
}
function openSettings(){
  settingsFrom=started?'match':'menu';paused=true;accumulator=0;input.reset();input.rebinding=null;
  $('menu').hidden=true;$('settings').hidden=false;
  $('settings-context').textContent=started?'MATCH PAUSED':'YOUR PREFERENCES';
  $('resume').textContent=started?'RESUME MATCH':'DONE';$('back').hidden=!started;refreshBindings();$('resume').focus();
}
function closeSettings(){
  input.rebinding=null;input.reset();$('settings').hidden=true;accumulator=0;
  if(settingsFrom==='menu'){$('menu').hidden=false;paused=true;$('play').focus();}
  else {paused=false;$('field').focus({preventScroll:true});}
}
function togglePause(force){
  if(replay){if(force!==true){replay.playing=!replay.playing;$('replay-play').textContent=replay.playing?'Pause':'Play';}return;}
  if(!$('history').hidden){if(force!==true)menu();return;}
  if(!started){if(force!==true&&!$('settings').hidden)closeSettings();return;}
  if(match.state==='ended')return;
  if(force===true){if(!paused)openSettings();return;}
  if(paused)closeSettings();else openSettings();
}
function menu(){
  gameAudio.reset();
  archive();replay=null;$('options').hidden=false;$('toggle-guide').hidden=false;$('hint').hidden=false;
  started=false;paused=true;input.reset();input.rebinding=null;accumulator=0;
  for(const id of ['settings','result','local-summary','history','replay-tools'])$(id).hidden=true;
  $('menu').hidden=false;syncMenu();$('play').focus();
}
function hud(){
  $('red-score').textContent=match.score.red;$('blue-score').textContent=match.score.blue;
  const sec=match.overtime?Math.floor(match.extraElapsed):Math.ceil(match.remaining);
  $('clock').textContent=(match.overtime?'+':'')+String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
  $('match-label').textContent=match.overtime?'GOLDEN GOAL':`${match.size}v${match.size} · ${match.halftimePending||match.fulltimePending?'LAST ATTACK':`HALF ${match.half||1}`} · ${match.spectator&&started?'BOTS':started?(match.engine.attackDir(match.human.team)===1?'ATTACK →':'← ATTACK'):'LOCAL'}`;
}
function showResult(){
  archive('complete');paused=true;input.reset();
  $('result').hidden=true;$('local-summary').hidden=false;$('options').hidden=true;$('toggle-guide').hidden=true;$('hint').hidden=true;
  const team=match.human?.team??prefs.team,own=match.score[team],other=match.score[team==='red'?'blue':'red'];
  $('local-summary-title').textContent=match.spectator?`Full time ${match.score.red}-${match.score.blue}`:`${own===other?'Draw':own>other?'Win':'Loss'} ${own}-${other}`;
  $('local-summary-again').textContent=match.spectator?'WATCH AGAIN':'PLAY AGAIN';
  $('local-summary-details').focus();
}
function showMatchDetails(){
  $('local-summary').hidden=true;$('result').hidden=false;$('again').hidden=false;$('local-details-close').hidden=false;
  $('final-red').textContent=match.score.red;$('final-blue').textContent=match.score.blue;
  $('result-title').textContent=$('local-summary-title').textContent;
  $('result-eyebrow').textContent=match.overtime?'GOLDEN GOAL · FULL TIME':'FULL TIME';
  const elapsed=Math.round(match.tracker.elapsed),time=`${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}`;
  $('result-text').textContent=`${match.size}v${match.size} · ${time} played · ${match.stats.shots} kicks`;
  $('again').textContent=match.spectator?'WATCH AGAIN':'PLAY AGAIN';
  renderReport($('stats-table'),$('heatmap'),$('heatmap-player'),match.report(),match.human?.id);
  $('local-details-close').focus();
}
$('play').onclick=()=>begin(false);$('watch').onclick=()=>begin(true);$('again').onclick=()=>begin(match.spectator);
$('local-summary-details').onclick=showMatchDetails;$('local-summary-again').onclick=()=>begin(match.spectator);$('local-summary-menu').onclick=menu;
$('local-details-close').onclick=()=>{$('result').hidden=true;$('local-summary').hidden=false;$('local-summary-details').focus();};
$('golden-goal').onchange=()=>{prefs.goldenGoal=$('golden-goal').checked;savePreferences(prefs);};
$('options').onclick=()=>$('settings').hidden?openSettings():closeSettings();$('menu-settings').onclick=openSettings;
$('resume').onclick=closeSettings;$('back').onclick=menu;$('result-menu').onclick=menu;
$('player-name').onchange=()=>{prefs.name=$('player-name').value.slice(0,16);savePreferences(prefs);};
for(const button of document.querySelectorAll('[data-team]'))button.onclick=()=>{prefs.team=button.dataset.team;savePreferences(prefs);syncMenu();};
for(const button of document.querySelectorAll('[data-size]'))button.onclick=()=>{prefs.size=Number(button.dataset.size);savePreferences(prefs);syncMenu();if(!started){match=new Match({size:prefs.size,spectator:true,seed:5});}};
for(const button of document.querySelectorAll('[data-tab]'))button.onclick=()=>{
  for(const other of document.querySelectorAll('[data-tab]'))other.setAttribute('aria-selected',String(other===button));
  $('controls-panel').hidden=button.dataset.tab!=='controls';$('view-panel').hidden=button.dataset.tab!=='view';
};
for(const button of document.querySelectorAll('[data-bind]'))button.onclick=()=>{input.rebinding=button.dataset.bind;input.reset();refreshBindings();};
$('reset-controls').onclick=()=>{prefs.bindings={...DEFAULTS.bindings};input.rebinding=null;input.reset();savePreferences(prefs);refreshBindings();};
$('movement').onchange=()=>setMovement($('movement').value);
$('menu-movement').onchange=()=>setMovement($('menu-movement').value);
$('volume').oninput=()=>{prefs.volume=Number($('volume').value);savePreferences(prefs);};
$('show-names').onchange=()=>{prefs.showNames=$('show-names').checked;savePreferences(prefs);};
$('aim-guide').onchange=()=>{prefs.aimGuide=$('aim-guide').checked;savePreferences(prefs);refreshGuide();};
$('toggle-guide').onclick=()=>{prefs.aimGuide=!prefs.aimGuide;savePreferences(prefs);refreshGuide();if(started&&!paused)$('field').focus({preventScroll:true});};
function frame(now){
  const dt=lastFrame?Math.min((now-lastFrame)/1000,.1):0;lastFrame=now;
  if(replay){
    if(replay.playing){replay.time=Math.min(replay.record.duration,replay.time+dt*replay.rate);if(replay.time>=replay.record.duration){replay.playing=false;$('replay-play').textContent='Play';}}
    const view=replayFrame(replay.record,replay.time);renderer.draw(view,prefs,null,false);document.querySelector('.hud').classList.toggle('training',view.practice&&view.drill!=='free');
    $('red-score').textContent=view.score.red;$('blue-score').textContent=view.score.blue;$('clock').textContent=clockText(view.practice?view.tracker.elapsed:view.remaining);$('match-label').textContent='REPLAY';
    $('replay-time').textContent=clockText(replay.time)+' / '+clockText(replay.record.duration);$('replay-seek').value=replay.time;
    requestAnimationFrame(frame);return;
  }
  if(started&&!paused){
    accumulator+=dt;
    while(accumulator>=STEP){
      match.update(STEP,match.human?input.read(match.human):undefined);sound(match.events);accumulator-=STEP;
      if(recorder?.round!==match.round){recorder=new ReplayRecorder(match);nextCheckpoint=15;}
      recorder?.step(STEP);
      if(match.state==='intermission')archive('complete');
      if(recorder&&!recorder.finalized&&recorder.time>=nextCheckpoint){saveRecording(recorder.snapshot('interrupted'));nextCheckpoint=recorder.time+15;}
      if(match.state==='ended'){showResult();break;}
    }
  }
  hud();renderer.draw(match,prefs,input.pointer,paused);if(match.spectator&&started)refreshHint();requestAnimationFrame(frame);
}
syncMenu();$('build').textContent='BUILD '+BUILD;requestAnimationFrame(frame);
// Read-only diagnostics keep bug reports concrete without altering gameplay.
Object.defineProperty(window,'teamball',{value:Object.freeze({learningCandidate:()=>exportCompletedHumanCandidate(match),ai:()=>[...(match.ai.diagnostics?.entries()||[])].map(([id,decision])=>({id,...JSON.parse(JSON.stringify(decision))})),snapshot:()=>({build:BUILD,replay:replay?{time:replay.time,duration:replay.record.duration,playing:replay.playing,rate:replay.rate}:null,state:match.state,countdown:['kickoff','practice-ready'].includes(match.state)?Math.ceil(match.wait-1e-9):0,paused,round:match.round,half:match.half,sidesSwapped:match.sidesSwapped,halftimePending:match.halftimePending,size:match.size,remaining:match.remaining,practice:match.practice,drill:match.drill,unlimitedStamina:match.unlimitedStamina,overtime:match.overtime,elapsed:match.tracker.elapsed,duration:match.duration,movement:prefs.movement,aimGuide:prefs.aimGuide,score:{...match.score},ball:{x:match.engine.ball.x,y:match.engine.ball.y,vx:match.engine.ball.vx,vy:match.engine.ball.vy,radius:match.engine.ball.radius,spin:match.engine.ball.spin,lastPlayer:match.engine.ball.lastPlayer},players:match.players.map(p=>({id:p.id,name:p.name,human:p.human,team:p.team,x:p.x,y:p.y,vx:p.vx,vy:p.vy,stamina:p.stamina,recovery:p.recovery,sprinting:p.sprinting})),stats:{...match.stats},training:match.training?.snapshot()??null}),report:()=>match.report()})});

if(new URLSearchParams(location.search).has('history'))showHistory();
