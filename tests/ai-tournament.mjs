import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {comparisonMatch} from '../public/js/ai-comparison.mjs';
import {STEP,BUILD,distance} from '../public/js/config.mjs';
import {ReplayRecorder} from '../public/js/replay.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const pairs=Number(args.pairs||50),selfPairs=Number(args.selfPairs||5),duration=Number(args.duration||60),seedBase=Number(args.seed||191107);
if(!Number.isInteger(pairs)||pairs<1||!Number.isInteger(selfPairs)||selfPairs<0||!Number.isFinite(duration)||duration<5)throw Error('Invalid tournament settings');
const id=new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex');
const dir=path.resolve('public/ai-results',id);fs.mkdirSync(path.join(dir,'replays'),{recursive:true});
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const sources=Object.fromEntries(['public/js/expert-ai.mjs','public/js/dev-ai-old.mjs','public/js/ai-legacy.mjs','public/js/ai-comparison.mjs','public/js/ai-prediction.mjs','public/js/config.mjs','public/js/physics.mjs','tests/ai-tournament.mjs'].map(f=>[f,hash(f)]));
let commit='unknown';try{commit=execFileSync('C:/Program Files/Git/cmd/git.exe',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{}
const result={schema:'teamball.tournament.v1',id,startedAt:new Date().toISOString(),build:BUILD,commit,sources,settings:{pairs,selfPairs,duration,seedBase,step:STEP,sizes:[1,2,3,4,5],opponent:args.opponent||'original',sides:'Normal initial orientation and normal halftime side switching; candidate paired red/blue for every seed',rules:'Normal kickoff, halftime and final attack; golden goal disabled to retain draws; regulation shortened to configured duration'},metricDefinitions:{
 shotConversion:'Goals attached to classified shotMap entries / classified shots. Contact and bank goals may be unclassified.',passing:'Pass accuracy uses actual completed receipts / classified non-shot kicks; not all passes are classified correctly.',throughBalls:'Completed kick-to-teammate receipt advancing at least 100px and releasing ahead of receiver.',dribbles:'Continuous last-touch control near ball advancing 60px without a kick; episodes, not probabilities.',blocks:'Opponent-shot contact by defender within 1s, followed by ball goalward-speed reduction; proxy, not verified save.',mistakes:'Own-directed contacts in own defensive quarter over 55px/s; includes intentional backward touches.',combinations:'Two uninterrupted completed passes involving at least two teammates within 4s.',boost:'Drain points / (goals + completed passes + interceptions); mixed-action efficiency proxy.'},matches:[]};
const other=t=>t==='red'?'blue':'red';
function play(size,seed,newSide,swapped,opponent,index){
 const game=comparisonMatch({size,seed,duration,newSide,swapped,opponent}),times=[],events=[],tactical=[];
 const metrics=Object.fromEntries(['red','blue'].map(t=>[t,{boost:0,kickoffBoost:0,throughBalls:0,dribbles:0,blocks:0,mistakes:0,combinations:0}]));
 const record=new ReplayRecorder(game,{id:String(index),startedAt:Date.now()});
 let lastKick=null,lastPass=null,dribble=null,lastShot=null,frames=0,nextDiagnostic=0;
 const start=performance.now();
 while(game.state!=='ended'&&frames++<(duration+180)/STEP){
  const before=game.players.map(p=>p.stamina),protectedKickoff=Boolean(game.engine.kickoff),t=performance.now();game.update(STEP);times.push(performance.now()-t);record.step(STEP);
  for(const [i,p] of game.players.entries()){const drain=Math.max(0,before[i]-p.stamina);metrics[p.team].boost+=drain;if(protectedKickoff)metrics[p.team].kickoffBoost+=drain;}
  const b=game.engine.ball;
  if(!Number.isFinite(b.x+b.y+b.vx+b.vy)||game.players.some(p=>!Number.isFinite(p.x+p.y+p.vx+p.vy+p.stamina)))throw Error('Non-finite physical state');
  for(const e of game.events){
   if(['goal','kick','wall','halftime','second-half'].includes(e.type)&&events.length<500)events.push({...e});
   if(e.type==='kick'){const p=game.players.find(p=>p.id===e.player);lastKick={...e,team:p.team,receiverPositions:game.players.filter(q=>q.team===p.team&&q!==p).map(q=>({id:q.id,x:q.x}))};dribble=null;const goal=game.engine.attackDir(p.team)===1?game.pitch.right:game.pitch.left;if((goal-e.x)*e.vx>0)lastShot={...e,team:p.team};}
   if(e.type==='contact'){
    const p=game.players.find(p=>p.id===e.player),dir=game.engine.attackDir(p.team),own=dir===1?game.pitch.left:game.pitch.right;
    if((b.x-own)*dir<(game.pitch.right-game.pitch.left)*.25&&b.vx*dir< -55)metrics[p.team].mistakes++;
    if(lastShot&&lastShot.team!==p.team&&e.time-lastShot.time<1&&Math.abs(b.vx)<Math.abs(lastShot.vx)*.8)metrics[p.team].blocks++;
    if(lastKick&&lastKick.player!==p.id){
      if(lastKick.team===p.team&&e.time-lastKick.time<4){
       const forward=(b.x-lastKick.x)*dir;
       const receiver=lastKick.receiverPositions.find(q=>q.id===p.id);
       if(forward>=100&&receiver&&(b.x-receiver.x)*dir>25)metrics[p.team].throughBalls++;
       if(lastPass?.team===p.team&&e.time-lastPass.time<4)metrics[p.team].combinations++;
       lastPass={team:p.team,time:e.time};
      }else lastPass=null;lastKick=null;
    }
   }
  }
  if(game.state==='playing'&&b.lastPlayer&&distance(game.players.find(p=>p.id===b.lastPlayer),b)<55){
    const p=game.players.find(p=>p.id===b.lastPlayer);if(!dribble||dribble.id!==p.id)dribble={id:p.id,x:b.x};
    if((b.x-dribble.x)*game.engine.attackDir(p.team)>60){metrics[p.team].dribbles++;dribble.x=b.x;}
  }else dribble=null;
  if(game.engine.time>=nextDiagnostic&&tactical.length<24){nextDiagnostic=game.engine.time+3;for(const p of game.players){const d=game.ai.controllers[p.team].diagnostics?.get(p.id);if(d)tactical.push({time:game.engine.time,id:p.id,team:p.team,...d});if(tactical.length>=24)break;}}
 }
 const report=game.report(),teams={};for(const team of ['red','blue']){
  const players=report.players.filter(p=>p.team===team),sum=k=>players.reduce((s,p)=>s+(p[k]||0),0),shots=sum('shots'),passes=sum('passes'),attempts=passes+Math.max(0,sum('passAttempts')-passes);
  teams[team]={...metrics[team],goals:game.score[team],conceded:game.score[other(team)],shots,onTarget:sum('onTarget'),scoringShots:players.reduce((s,p)=>s+p.shotMap.filter(q=>q.goal).length,0),passes,passAttempts:attempts,interceptions:sum('interceptions'),ownGoals:sum('ownGoals')};
 }
 times.sort((a,b)=>a-b);const replay=record.finish('complete');replay.replay.frames=Array.from(replay.replay.frames);
 const replayFile='replays/'+String(index).padStart(4,'0')+'.json';fs.writeFileSync(path.join(dir,replayFile),JSON.stringify(replay));
 return {id:index,size,seed,newSide,swapped,opponent,finished:game.state==='ended',nonFinite:0,score:game.score,liveSeconds:report.elapsed,wallMs:performance.now()-start,p95Ms:times[Math.floor(times.length*.95)],p99Ms:times[Math.floor(times.length*.99)],maxMs:times.at(-1),teams,players:report.players.map(({heat,shotMap,passMap,...p})=>p),tactical,events,replay:replayFile};
}
function save(){fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(result));}
let index=0;
for(const opponent of [args.opponent||'original','new'])for(const size of [1,2,3,4,5]){
 for(let pair=0;pair<(opponent==='new'?selfPairs:pairs);pair++)for(const newSide of ['red','blue']){
  const match=play(size,seedBase+pair*7919,newSide,false,opponent,++index);result.matches.push(match);
  fs.appendFileSync(path.join(dir,'matches.ndjson'),JSON.stringify(match)+'\n');
 }
 save();console.log(`${opponent} ${size}v${size}: ${result.matches.filter(m=>m.opponent===opponent&&m.size===size).length} matches saved`);
 await new Promise(r=>setImmediate(r));
}
result.finishedAt=new Date().toISOString();result.sourcesChanged=Object.entries(sources).some(([f,h])=>hash(f)!==h);save();
const rows=result.matches.map(m=>({id:m.id,size:m.size,opponent:m.opponent,seed:m.seed,newSide:m.newSide,swapped:m.swapped,newGoals:m.teams[m.newSide].goals,otherGoals:m.teams[other(m.newSide)].goals,finished:m.finished,p99Ms:m.p99Ms,replay:m.replay}));
fs.writeFileSync(path.join(dir,'matches.csv'),Object.keys(rows[0]).join(',')+'\n'+rows.map(r=>Object.values(r).join(',')).join('\n'));
const lines=['# AI tournament '+id,'','Commit: '+commit,'','100 matches per mode when pairs=50. Same authoritative physics for both policies.','', '|Opponent|Mode|W|D|L|Goals for|Against|','|---|---|---:|---:|---:|---:|---:|'];
for(const opponent of new Set(rows.map(r=>r.opponent)))for(const size of [1,2,3,4,5]){const a=rows.filter(r=>r.opponent===opponent&&r.size===size);lines.push(`|${opponent}|${size}v${size}|${a.filter(r=>r.newGoals>r.otherGoals).length}|${a.filter(r=>r.newGoals===r.otherGoals).length}|${a.filter(r=>r.newGoals<r.otherGoals).length}|${a.reduce((s,r)=>s+r.newGoals,0)}|${a.reduce((s,r)=>s+r.otherGoals,0)}|`);}
lines.push('','See results.json metricDefinitions for proxy limitations. No human strength claim. Replay files record actual visible simulation states. Unfinished matches are censored, never represented as wins.');fs.writeFileSync(path.join(dir,'summary.md'),lines.join('\n'));
const template=fs.readFileSync('public/dev-ai.html','utf8');fs.writeFileSync(path.join(dir,'dashboard.html'),template.replace('data-default-results=""',`data-default-results="results.json"`));
fs.writeFileSync('public/ai-results/latest.json',JSON.stringify({id,url:'/ai-results/'+id+'/results.json'}));
console.log('TOURNAMENT '+dir);if(result.sourcesChanged||result.matches.some(m=>!m.finished))process.exitCode=1;
