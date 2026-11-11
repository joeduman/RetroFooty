// Native Teamball simulator used by the Python trainer. Never changes game physics.
// Usage: node train/rollout.mjs --mode expert|selfplay|benchmark --matches 8 --candidate file --out file
import fs from 'node:fs';
import path from 'node:path';
import {Match} from '../public/js/match.mjs';
import {STEP} from '../public/js/config.mjs';
import {trainingAssignment} from './mode-schedule.mjs';
import {validateNeuralModel} from '../public/js/neural-policy.mjs';
const arg=(name,def=null)=>{const i=process.argv.indexOf('--'+name);return i<0?def:process.argv[i+1];};
const mode=arg('mode','benchmark'),out=arg('out',null),rounds=Math.max(1,Math.min(128,Number(arg('matches','8')))),seed=Number(arg('seed','701'));
if(!['expert','selfplay','benchmark'].includes(mode))throw Error('Unknown rollout mode');
const readModel=filename=>{if(!filename)return null;const m=JSON.parse(fs.readFileSync(filename,'utf8'));if(!validateNeuralModel(m))throw Error('Invalid model: '+filename);return m;};
const candidate=readModel(arg('candidate'));const opponent=readModel(arg('opponent'));
const poolDir=arg('opponent-pool');
const humanStyles=poolDir&&fs.existsSync(poolDir)?fs.readdirSync(poolDir).filter(n=>n.endsWith('.v1.json')).sort().flatMap(n=>{
 try{return [readModel(path.join(poolDir,n))];}catch{return [];}
}):[];
const videoDir=arg('video-profiles');
const videoStyles=videoDir&&fs.existsSync(videoDir)?fs.readdirSync(videoDir).filter(n=>n.endsWith('.approved.json')).sort().flatMap(n=>{
 try{const profile=JSON.parse(fs.readFileSync(path.join(videoDir,n),'utf8'));return profile.schema==='teamball.video-style.v1'&&profile.approvedForTraining&&profile.confidence>=.25&&profile.policy?[profile.policy]:[];}catch{return [];}
}):[];
if(mode!=='expert'&&!candidate)throw Error('Candidate neural model required');
const result={schema:'teamball.simulation-rollout.v1',mode,matches:[],samples:[]};
const activityPath=path.join(process.cwd(),'bot-memory','server-activity.json');
const usersActive=()=>{try{const a=JSON.parse(fs.readFileSync(activityPath,'utf8'));return Date.now()-a.at<10000&&a.clients>0;}catch{return false;}};
const stopRequested=()=>process.env.TEAMBALL_OVERNIGHT==='1'&&fs.existsSync(path.join(process.cwd(),'bot-memory','overnight-stop.flag'));
const shouldStop=()=>usersActive()||stopRequested();
const total=(arr,key)=>arr.reduce((s,p)=>s+(p[key]||0),0);
for(let round=0;round<rounds;round++){
 if(shouldStop())throw Error('Training stopped: player connected or overnight stop requested');
 const {side,size}=trainingAssignment(round,seed);const team=mode==='expert'?null:side;
 const game=new Match({size,seed:seed+Math.floor(round/2)*43,duration:45,goldenGoal:false,spectator:true,loop:false,
   aiNeural:mode==='expert'?null:candidate,aiNeuralTeam:team,neuralTraining:mode==='selfplay'});
 if(mode!=='expert'&&opponent)game.ai.setNeuralPolicy(opponent,side==='red'?'blue':'red');
 // Play against learned human behavior, but preserve the standard champion
 // as half of opponents. Every adversary obeys the same game physics.
 let opponentSource=opponent?'champion':'expert';
 if(mode==='selfplay'&&humanStyles.length&&round%2===1){
  const pick=humanStyles[Math.floor(round/2)%humanStyles.length];
  game.ai.setNeuralPolicy(pick,side==='red'?'blue':'red');opponentSource='human-style';
 }
 if(mode==='selfplay'&&videoStyles.length&&round%4===2){
  game.ai.setPolicy(videoStyles[Math.floor(round/4)%videoStyles.length],side==='red'?'blue':'red');
  opponentSource+=' + reviewed-video-tactics';
 }
 if(mode==='benchmark')game.ai.neuralTraining=false;
 const rows=[];
 game.ai.trainingObserver=e=>{if(mode==='expert'||e.team===side){
  if(rows.length<12000)rows.push({features:e.features,action:e.action,expert:e.expert,team:e.team,time:e.time,playerId:e.id});
 }};
 let steps=0;
 while(game.state!=='ended'&&steps++<14400){game.update(STEP);
  if(steps%2000===0&&shouldStop())throw Error('Training stopped: player connected or overnight stop requested');}
 const rep=game.report(),theirSide=side==='red'?'blue':'red';
 const own=rep.players.filter(p=>p.team===side),foe=rep.players.filter(p=>p.team===theirSide);
 const gd=rep.score[side]-rep.score[theirSide];
 const rating=gd+0.012*(total(own,'passes')-total(foe,'passes'))+
  0.008*(total(own,'interceptions')-total(foe,'interceptions'))-0.3*(total(own,'ownGoals')-total(foe,'ownGoals'));
 result.matches.push({seed:game.seed,side,size,completed:game.state==='ended',opponentSource,goalsFor:rep.score[side],goalsAgainst:rep.score[theirSide],goalDifference:gd,
  rating,passes:total(own,'passes'),interceptions:total(own,'interceptions'),ownGoals:total(own,'ownGoals'),steps});
 if(mode!=='benchmark'){
  const normalized=Math.max(-3,Math.min(3,rating));
  for(const row of rows){if(mode==='expert'||row.team===side){
    // The real match outcome provides a trajectory-level policy-gradient signal.
    // Weak event/position shaping reduces zero-reward episodes.
    const reward=mode==='expert'?0:normalized+.2*(row.features[8]??0)+.1*(1-(row.features[13]??0));
    result.samples.push({x:row.features,y:row.action,expert:row.expert,advantage:reward,source:mode,match:round});
  }}
 }
}
if(mode==='benchmark'){
 const m=result.matches,games=m.length,wins=m.filter(x=>x.goalDifference>0).length,draws=m.filter(x=>x.goalDifference===0).length;
 const rate=(wins+draws*.5)/games,diff=m.reduce((s,x)=>s+x.goalDifference,0),score=m.reduce((s,x)=>s+x.rating,0)/games;
 // Balanced opponents and mirrored sides. Prefer retaining the reigning champion
 // over admitting noise; small tournament wins cannot prove professional skill.
 result.benchmark={games,wins,draws,losses:games-wins-draws,winRate:rate,goalDifference:diff,averageRating:score,
  passed:rate>=.625&&diff>=3&&score>.24&&m.every(x=>x.completed&&x.ownGoals<=2)};
}
const json=JSON.stringify(result);
if(out){fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,json);}else process.stdout.write(json+'\n');
