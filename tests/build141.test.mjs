import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';
import {Match} from '../public/js/match.mjs';
import {MatchStats} from '../public/js/stats.mjs';
import {ReplayRecorder,replayFrame} from '../public/js/replay.mjs';
import {createPitch,STEP} from '../public/js/config.mjs';
import {Renderer} from '../public/js/renderer.mjs';
const idle={x:0,y:0,aimX:1,aimY:0,sprint:false,shoot:false};
const advance=(m,seconds)=>{for(let i=0;i<Math.round(seconds/STEP);i++)m.update(STEP,idle);};

test('halftime waits for live attack to return over midfield, then switches direction with same score',()=>{
 const m=new Match({size:1,spectator:true,duration:60,goldenGoal:false,seed:7}),b=m.engine.ball,mid=m.pitch.width/2;
 m.state='playing';m.remaining=30+STEP;b.x=mid+100;b.y=m.pitch.height/2;b.vx=0;
 m.update(STEP);assert.equal(m.halftimePending,true);assert.equal(m.state,'playing');assert.equal(m.halftimeAttackSide,'right');
 b.x=mid+35;b.vx=0;m.update(STEP);assert.equal(m.state,'playing');assert.equal(m.remaining,30);
 b.x=mid-8;b.vx=-50;m.update(STEP);assert.equal(m.state,'halftime');assert.equal(m.half,1);
 m.score.red=2;m.score.blue=1;advance(m,3);
 assert.equal(m.half,2);assert.equal(m.sidesSwapped,true);assert.equal(m.engine.attackDir('red'),-1);assert.equal(m.engine.attackDir('blue'),1);
 assert.deepEqual(m.score,{red:2,blue:1});assert.equal(m.state,'kickoff');
 assert.ok(m.players.find(p=>p.team==='red').faceX<0);
});
test('a goal on the expired half ends the attack and starts halftime after celebration',()=>{
 const m=new Match({size:1,spectator:true,duration:60,goldenGoal:false,seed:7});m.state='playing';m.remaining=30+STEP;m.engine.ball.x=m.pitch.right+12;m.engine.ball.y=m.pitch.height/2;
 m.update(STEP);assert.equal(m.state,'goal');assert.equal(m.halftimeAfterGoal,true);
 advance(m,3);assert.equal(m.state,'halftime');
});
test('both teams can score through the correct goal after swapping sides',()=>{
 const m=new Match({size:1,spectator:true,duration:60});m.startSecondHalf();m.state='playing';m.engine.kickoff=null;
 const p=m.pitch,b=m.engine.ball;
 b.x=p.left-b.radius-2;b.y=p.height/2;b.vx=0;b.vy=0;
 assert.equal(m.engine.step(STEP),'red');
 b.x=p.right+b.radius+2;b.y=p.height/2;b.vx=0;b.vy=0;
 assert.equal(m.engine.step(STEP),'blue');
});
test('second-half AI, shots and neural features use flipped attack direction',async()=>{
 const m=new Match({size:3,spectator:true,duration:120,seed:1});m.startSecondHalf();m.ai.planTeams();
 assert.equal(m.ai.plans.red.dir,-1);assert.equal(m.ai.plans.blue.dir,1);
 const tracker=new MatchStats(m.players,m.pitch);tracker.sidesSwapped=true;
 const id=m.players.find(p=>p.team==='red').id;
 tracker.record({type:'kick',player:id,time:2,x:m.pitch.left+180,y:m.pitch.height/2,vx:-410,vy:0});
 assert.equal(tracker.rows.get(id).shots,1);
 const ball={x:m.pitch.left-12,y:m.pitch.height/2};tracker.goal('red',2.5,ball);
 assert.equal(tracker.rows.get(id).shotMap.at(-1).to[0],m.pitch.left);
 const {neuralFeatures}=await import('../public/js/neural-policy.mjs');
 assert.equal(neuralFeatures(m.engine,m.players.find(p=>p.team==='red'),3).length,24);
});
test('colored player names retain red/blue affiliation independent of human status',()=>{
 const r=Object.create(Renderer.prototype),used=[];r.ctx=new Proxy({createRadialGradient:()=>({addColorStop(){}}),fillText(_,x,y){used.push(this.fillStyle);}},
 {get:(obj,key)=>key in obj?obj[key]:()=>{}});r.playerShirt=()=>null;r.circle=()=>{};
 const make=(team,human)=>({team,human,radius:18,x:100,y:100,name:'Name',faceX:1,faceY:0,stamina:100,input:{shoot:false}});
 r.player(make('red',true),{showNames:true});r.player(make('blue',false),{showNames:true});
 assert.deepEqual(used,['#ff9199','#94c7ff']);
});
test('new replay stores swapped side while historic replay header stays compatible',()=>{
 const m=new Match({size:1,seed:5,spectator:true});m.startSecondHalf();
 const r=new ReplayRecorder(m,{id:'test'});const record=r.finish('complete').replay;
 assert.equal(replayFrame(record,0).sidesSwapped,true);
 // Mimic old 13-header layout with same player data and no orientation field.
 const legacy=structuredClone(record);legacy.meta.headerStride=undefined;legacy.width=13+legacy.meta.players.length*7;
 legacy.frames=Array.from(record.frames).filter((_,i)=>i!==13); // single captured frame
 assert.equal(replayFrame(legacy,0).sidesSwapped,false);
});
test('human-style training and video profile directories are optional, never overwrite fallback models',()=>{
 const training=readFileSync(new URL('../train/train.py',import.meta.url),'utf8');
 const sim=readFileSync(new URL('../train/rollout.mjs',import.meta.url),'utf8');
 assert.match(training,/human-style|human-styles/);assert.match(training,/style_summary/);
 assert.match(sim,/opponentSource='human-style'/);assert.match(sim,/mode==='selfplay'/);
 assert.match(sim,/approvedForTraining/);
 const model=readFileSync(new URL('../public/js/neural-policy.mjs',import.meta.url),'utf8');
 assert.match(model,/ownGoalRisk/);
});

test('consenting private-room player input is archived for human-style training', {timeout:12000},async()=>{
 const {createServer}=await import('node:http');
 const {WebSocket}=await import('ws');
 const {attachOnline}=await import('../online.mjs');
 const {BotMemoryStore}=await import('../bot-learning.mjs');
 const folder=mkdtempSync(path.join(os.tmpdir(),'teamball-room-'));
 const memory=new BotMemoryStore({directory:folder});
 const server=createServer(),close=attachOnline(server,{duration:.25,goldenGoal:false,learning:memory});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/online`);
 try{
  await new Promise((resolve,reject)=>{ws.on('open',resolve);ws.on('error',reject);});
  ws.send(JSON.stringify({type:'create',name:'ConsentingPlayer',size:1,team:'red',trainingConsent:true}));
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('No room ready')),2000);ws.on('message',function seen(buf){if(JSON.parse(buf).type==='lobby'){clearTimeout(timer);ws.off('message',seen);resolve();}});});
  ws.send(JSON.stringify({type:'start'}));
  const begin=Date.now();
  while(memory.memory.humanGames<1&&Date.now()-begin<6000)await new Promise(r=>setTimeout(r,35));
  assert.ok(memory.memory.humanGames>=1,'private room recording must reach learning store');
  assert.ok(existsSync(path.join(folder,'replays')));
  const {readdirSync}=await import('node:fs');
  assert.ok(readdirSync(path.join(folder,'replays')).some(n=>n.endsWith('.json.gz')));
 }finally{ws.terminate();close();await new Promise(r=>server.close(r));rmSync(folder,{recursive:true,force:true});}
});
