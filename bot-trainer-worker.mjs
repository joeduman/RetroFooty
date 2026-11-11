// Separate thread: never run self-play calculations inside the 120 Hz game loop.
import {parentPort} from 'node:worker_threads';
import fs from 'node:fs';import path from 'node:path';import {gunzipSync} from 'node:zlib';
import {Match} from './public/js/match.mjs';
import {STEP,clamp} from './public/js/config.mjs';
import {DEFAULT_POLICY,clampPolicy,POLICY_BOUNDS} from './public/js/ai-policy.mjs';
let champion={...DEFAULT_POLICY},paused=true,stopped=false,interval=15000,attempt=0;
const replayDir=path.join(process.cwd(),'bot-memory','replays');
parentPort.on('message',message=>{
 if(message.type==='configure'){champion=clampPolicy(message.policy);paused=Boolean(message.paused);interval=clamp(message.interval||15000,3000,120000);}
 if(message.type==='stop')stopped=true;
});
async function play(seed,size,candidate,side){
 const m=new Match({size,seed,duration:50,goldenGoal:false,spectator:true,loop:false});
 m.ai.setPolicy(candidate,side);m.ai.setPolicy(champion,side==='red'?'blue':'red');
 // Avoid spending CPU on kickoff countdown and victory animations.
 let steps=0;while(m.state!=='ended'&&steps++<7000){m.update(STEP);if(steps%240===0){await new Promise(r=>setImmediate(r));if(paused||stopped)return null;}}
 const own=m.score[side],theirs=m.score[side==='red'?'blue':'red'];
 const report=m.report(),ownRows=report.players.filter(p=>p.team===side),rival=report.players.filter(p=>p.team!==side);
 const sum=(arr,key)=>arr.reduce((v,p)=>v+(p[key]||0),0);
 const rating=(own-theirs)*2 + (sum(ownRows,'passes')-sum(rival,'passes'))*.08+
  (sum(ownRows,'interceptions')-sum(rival,'interceptions'))*.045-(sum(ownRows,'ownGoals')-sum(rival,'ownGoals'))*1.5;
 return {score:rating,goalsAgainst:theirs};
}
// Review archived matches repeatedly while idle. Only opted-in human inputs are
// available; no account/email data is present in these compressed recordings.
function replayReview(){
 let files;try{files=fs.readdirSync(replayDir).filter(x=>x.endsWith('.json.gz'));}catch{return null;}
 if(!files.length)return null;
 const filename=files[attempt%files.length];let rec;
 try{const compressed=fs.readFileSync(path.join(replayDir,filename));if(compressed.length>8000000)return null;
   rec=JSON.parse(gunzipSync(compressed).toString('utf8'));}catch{return null;}
 if(rec.schema!=='teamball-training-replay.v1'||!Array.isArray(rec.frames))return null;
 const valid=new Set(rec.eligiblePlayerIds||[]),goalMoments=(rec.events||[]).filter(x=>x.type==='goal');
 const observed={shotPreference:0,passPreference:0,frontPost:0,boostReserve:0,press:0},count={};let best=0;
 for(const f of rec.frames){if(!Array.isArray(f.p)||!Array.isArray(f.b))continue;
   for(const p of f.p){if(!valid.has(p[0])||p.length<14)continue;
    const forward=p[1]===0?1:-1,progress=((f.b[0]-(p[1]===0?88:900))*forward),
      close=Math.hypot(p[2]-f.b[0],p[3]-f.b[1])<115;
    const highSignal=goalMoments.some(g=>g.team===(p[1]===0?'red':'blue')&&g.t>=f.t&&g.t-f.t<=4);
    if(!highSignal)continue;best++;
    observed.shotPreference+=Number(close&&progress>350&&p[13]===1);
    observed.passPreference+=Number(close&&progress<440&&p[13]===1);
    observed.frontPost+=Number(progress<180&&Math.abs(p[3]-f.b[1])<100);
    observed.boostReserve+=Number(p[12]===1&&p[6]<30);
    observed.press+=Number(close&&Math.hypot(p[8],p[9])>.7);
   }
 }
 if(best<6)return {file:filename,count:0,target:null};
 const target={...champion};
 target.shotPreference=clamp(.9+observed.shotPreference/best*.55,.7,1.3);
 target.passPreference=clamp(.95+observed.passPreference/best*.6,.75,1.35);
 target.frontPost=clamp(1+observed.frontPost/best*.55,.8,1.5);
 target.boostReserve=clamp(1.2-observed.boostReserve/best*.5,.7,1.4);
 target.press=clamp(.9+observed.press/best*.35,.7,1.3);
 return {file:filename,count:best,target};
}
async function evaluate(){
 const key=Object.keys(DEFAULT_POLICY)[attempt%Object.keys(DEFAULT_POLICY).length],candidate={...champion},[lo,hi]=POLICY_BOUNDS[key],step=(attempt%2===0?1:-1)*.045;
 candidate[key]=clamp(candidate[key]+step,lo,hi);
 if(candidate[key]===champion[key])return null;
 const size=[2,3,5][Math.floor(attempt/2)%3],seed=947+Math.floor(attempt/10)*23;
 // Symmetric two-sided pair controls for team advantage and kickoff luck.
 const a=await play(seed,size,candidate,'red');if(!a)return null;
 const b=await play(seed,size,candidate,'blue');if(!b)return null;
 const baselineA=await play(seed,size,champion,'red');if(!baselineA)return null;
 const baselineB=await play(seed,size,champion,'blue');if(!baselineB)return null;
 const review=replayReview();let improvement=((a.score-baselineA.score)+(b.score-baselineB.score))/2;
 if(review?.target){for(const k of ['shotPreference','passPreference','frontPost','boostReserve','press']){
  const target=review.target[k];improvement+=((champion[k]-target)**2-(candidate[k]-target)**2)*.35;}}
 return {candidate,games:4,reviewedReplay:Boolean(review),highQualityMoments:review?.count||0,score:improvement,
 goalsAgainst:a.goalsAgainst+b.goalsAgainst,baselineGoalsAgainst:baselineA.goalsAgainst+baselineB.goalsAgainst,size,key};
}
async function loop(){while(!stopped){await new Promise(r=>setTimeout(r,interval));if(paused||stopped)continue;
  try{const result=await evaluate();attempt++;if(result)parentPort.postMessage({type:'result',...result});}
  catch(error){parentPort.postMessage({type:'error',message:error.message});}
}}
loop();
