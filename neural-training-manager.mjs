// Optional low-priority Python learner. It never runs in the 120 Hz game loop.
// Training is strictly idle-only; users entering either park or rooms interrupt it.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {performance} from 'node:perf_hooks';
const statusPath=path.join(process.cwd(),'bot-memory','neural-training-status.json');
const activityPath=path.join(process.cwd(),'bot-memory','server-activity.json');
const settingsPath=path.join(process.cwd(),'bot-memory','training-settings.json');
const overnightLease=path.join(process.cwd(),'bot-memory','overnight-runner.lock');
const trainLock=path.join(process.cwd(),'bot-memory','models','training.lock');
const atomic=(name,value)=>{try{fs.writeFileSync(name+'.tmp',JSON.stringify(value));fs.renameSync(name+'.tmp',name);}catch{}};
export function startNeuralTrainer(store,park,rooms){
 let child=null,stopped=false,activeSince=performance.now(),lastCycle=performance.now()-12*60*1000,lastTick=performance.now(),lag=0;
 const state={enabled:true,running:false,updates:0,lastCycle:null,lastExit:null,lastError:null,activePlayers:0,lagMs:0};
 const getSettings=()=>{try{return JSON.parse(fs.readFileSync(settingsPath,'utf8'));}catch{return {};}};
 const configNum=(v,defaultValue,lo,hi)=>Number.isFinite(Number(v))?Math.min(hi,Math.max(lo,Number(v))):defaultValue;
 const persist=()=>{atomic(statusPath,state);store.neuralTrainingStatus={...state};};
 const count=()=> (park.world?.clients?.size||0)+(rooms.clients?.size||0);
 const tick=()=>{
  const now=performance.now(),delta=now-lastTick;lastTick=now;lag=.85*lag+.15*Math.max(0,delta-5000);state.lagMs=Math.round(lag);state.activePlayers=count();
  atomic(activityPath,{at:Date.now(),clients:state.activePlayers});
  const settings=getSettings();state.enabled=settings.enabled!==false&&settings.neuralEnabled!==false&&process.env.TEAMBALL_TRAINING!=='off';
  if(state.activePlayers>0){activeSince=now;if(child){ // Python/Node trainer checks the same activity marker at match intervals.
    state.lastExit='Stopping at next safe checkpoint because a player connected';
  }}
  const idleFor=now-activeSince,minimum=configNum(settings.neuralIdleSeconds,30,10,900)*1000;
  const cooldown=configNum(settings.neuralCycleMinutes,15,1,360)*60000;
  // Separate overnight trainer owns the training slot; never start another neural cycle.
  const externalBusy=[trainLock,overnightLease].some(file=>{try{return Date.now()-fs.statSync(file).mtimeMs<12*3600*1000;}catch{return false;}});
  if(!state.enabled||state.activePlayers>0||child||externalBusy||idleFor<minimum||now-lastCycle<cooldown||lag>20){persist();return;}
  lastCycle=now;
  const pythonVenv=path.join(process.cwd(),'.ai-venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const installed=fs.existsSync(pythonVenv);
  const launcher=installed?pythonVenv:(process.platform==='win32'?'py':'python3'),prefix=installed?[]:process.platform==='win32'?['-3']:[];
  const args=[...prefix,'train/train.py','--cycles','1','--device',['auto','cpu','cuda'].includes(settings.neuralDevice)?settings.neuralDevice:'auto',
   '--teacher-matches',String(configNum(settings.neuralTeacherMatches,4,2,32)),
   '--selfplay-matches',String(configNum(settings.neuralSelfplayMatches,8,2,64)),
   '--benchmark-matches',String(configNum(settings.neuralBenchmarkMatches,12,8,64))];
  state.running=true;state.lastCycle=new Date().toISOString();state.lastError=null;
  let output='';
  child=spawn(launcher,args,{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe']});
  const saveChunk=c=>{output=(output+c.toString()).slice(-4000);};
  child.stdout.on('data',saveChunk);child.stderr.on('data',saveChunk);
  child.on('error',error=>{state.lastError=error.message;});
  child.on('close',code=>{child=null;state.running=false;state.updates++;state.lastExit=`exit ${code}: ${output.slice(-950)}`;
   if(code!==0)state.lastError=state.lastError||state.lastExit;persist();});
  persist();
 };
 // Only writes files and starts low-priority child on a 5-second cadence.
 const timer=setInterval(tick,5000);tick();
 const close=()=>{stopped=true;clearInterval(timer);if(child){child.kill();child=null;}};
 close.status=()=>({...state});return close;
}
