import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {Match} from '../public/js/match.mjs';
import {STEP,distance} from '../public/js/config.mjs';
const gamesPerSize=Number(process.argv[2])||10,results=[],failures=[];
for(let size=1;size<=5;size++){
 for(let run=0;run<gamesPerSize;run++){
  const seed=42+run*7919,m=new Match({size,spectator:true,seed,loop:false});
  let stall=0,maxStall=0,maxJump=0,maxPenetration=0,nonFinite=0,bounds=0,frames=0,previous={...m.engine.ball},lastState=m.state;
  const p=m.pitch;
  // Regulation duration plus room for goal celebrations, kickoffs and golden goal.
  for(;frames<120*(m.duration+600)&&m.state!=='ended';frames++){
   m.update(STEP);const b=m.engine.ball,bodies=[...m.players,b];
   for(const body of bodies){
    if(!Number.isFinite(body.x+body.y+body.vx+body.vy))nonFinite++;
    const inGoal=body.y>p.goalTop&&body.y<p.goalBottom,run=body===b?0:p.runoff;
    if(body.x<p.left-Math.max(run,inGoal?p.goalDepth:0)-.1||body.x>p.right+Math.max(run,inGoal?p.goalDepth:0)+.1||body.y<p.top-run-.1||body.y>p.bottom+run+.1)bounds++;
   }
   if(m.state==='playing'&&lastState==='playing'){
    maxJump=Math.max(maxJump,distance(b,previous));
    for(let a=0;a<bodies.length;a++)for(let c=a+1;c<bodies.length;c++)maxPenetration=Math.max(maxPenetration,bodies[a].radius+bodies[c].radius-distance(bodies[a],bodies[c]));
   }
   if(m.state==='playing'&&Math.hypot(b.vx,b.vy)<8){stall+=STEP;maxStall=Math.max(maxStall,stall);}else stall=0;
   previous={...b};lastState=m.state;
  }
  const row={size,seed,liveSeconds:+m.tracker.elapsed.toFixed(3),overtime:m.overtime,score:m.score,shots:m.stats.shots,completedPasses:m.report().players.reduce((n,p)=>n+p.passes,0),ownGoals:m.report().players.reduce((n,p)=>n+p.ownGoals,0),sprintSeconds:m.report().players.reduce((n,p)=>n+p.sprintSeconds,0),passes:m.stats.passes,banks:m.stats.banks,maxStallSeconds:+maxStall.toFixed(3),maxBallStep:+maxJump.toFixed(3),maxPenetration:+maxPenetration.toFixed(3),bounds,nonFinite,finished:m.state==='ended'};
  results.push(row);
  if(!row.finished||row.bounds||row.nonFinite||row.maxStallSeconds>8||row.maxBallStep>9||row.maxPenetration>1)failures.push(row);
 }
 const group=results.filter(r=>r.size===size);console.log(`${size}v${size}: ${group.length} rounds, ${group.reduce((n,r)=>n+r.score.red+r.score.blue,0)} goals, longest stationary interval ${Math.max(...group.map(r=>r.maxStallSeconds))}s`);
}
const summary={build:'15.1',testedAt:new Date().toISOString(),games:results.length,simulatedMinutes:+(results.reduce((n,r)=>n+r.liveSeconds,0)/60).toFixed(3),
 goals:results.reduce((n,r)=>n+r.score.red+r.score.blue,0),completedPasses:results.reduce((n,r)=>n+r.completedPasses,0),ownGoals:results.reduce((n,r)=>n+r.ownGoals,0),passes:results.reduce((n,r)=>n+r.passes,0),banks:results.reduce((n,r)=>n+r.banks,0),
 worstStallSeconds:Math.max(...results.map(r=>r.maxStallSeconds)),maximumBallStep:Math.max(...results.map(r=>r.maxBallStep)),worstPenetration:Math.max(...results.map(r=>r.maxPenetration)),failures,results};
mkdirSync(new URL('../reports/',import.meta.url),{recursive:true});
writeFileSync(new URL('../reports/simulation-results.json',import.meta.url),JSON.stringify(summary,null,2));
console.log(JSON.stringify({...summary,results:undefined}));assert.equal(failures.length,0,'Simulation regressions; see reports/simulation-results.json');
