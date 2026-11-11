import {writeFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url)),baseline=process.argv[2];
if(!baseline)throw new Error('Pass the extracted Build 08 folder: node tests/compare-builds.mjs PATH');
const output={testedAt:new Date().toISOString(),secondsPerMatch:120,gamesPerBuild:15,results:[]};
for(const [build,dir] of [['08',path.resolve(baseline)],['09',root]]){
 const {Match}=await import(pathToFileURL(path.join(dir,'public/js/match.mjs')));const {STEP}=await import(pathToFileURL(path.join(dir,'public/js/config.mjs')));
 let goals=0,completedPasses=0,ownGoals=0,dangerousKicks=0,sprintSeconds=0,playerSeconds=0;
 for(let size=1;size<=5;size++)for(let run=0;run<3;run++){
  const m=new Match({size,spectator:true,duration:120,goldenGoal:false,loop:false,seed:42+run*7919});let steps=0;
  while(m.state!=='ended'&&steps++<120*300){
   m.update(STEP);
   for(const e of m.events)if(e.type==='kick'){
    const player=m.players.find(p=>p.id===e.player),p=m.pitch,own=player.team==='red'?p.left:p.right,t=(own-e.x)/e.vx;
    const y=e.y+e.vy*t;if(t>0&&t<1.2&&Math.abs(e.vx)/.72>Math.abs(own-e.x)&&y>p.goalTop+8&&y<p.goalBottom-8)dangerousKicks++;
   }
  }
  const r=m.report();goals+=r.score.red+r.score.blue;completedPasses+=r.players.reduce((n,p)=>n+p.passes,0);ownGoals+=r.players.reduce((n,p)=>n+p.ownGoals,0);
  sprintSeconds+=r.players.reduce((n,p)=>n+p.sprintSeconds,0);playerSeconds+=r.elapsed*r.players.length;
 }
 const row={build,goals,completedPasses,ownGoals,dangerousKicks,sprintDutyPercent:+(100*sprintSeconds/playerSeconds).toFixed(2)};
 output.results.push(row);console.log(JSON.stringify(row));
}
writeFileSync(root+'/tests/build-comparison.json',JSON.stringify(output,null,2));
