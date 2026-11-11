import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';import path from 'node:path';import os from 'node:os';
import {Match} from '../public/js/match.mjs';import {MatchStats} from '../public/js/stats.mjs';
import {BotMemoryStore,SAVE_SCHEMA} from '../bot-learning.mjs';import {ParkWorld} from '../park.mjs';
import {DIFFICULTIES,DEFAULT_POLICY,tacticalContext} from '../public/js/ai-policy.mjs';import {STEP} from '../public/js/config.mjs';
const temp=()=>mkdtempSync(path.join(os.tmpdir(),'teamball-ai-test-'));
test('bot memory is portable across game versions and rejects incompatible files',()=>{
 const dir=temp();try{const store=new BotMemoryStore({directory:dir});assert.equal(store.memory.schema,SAVE_SCHEMA);
 store.memory.games=19;store.memory.humanSamples=220;store.memory.contexts['2v2:def:press:open']={samples:10,boost:.7,kick:.1,forward:.1,movement:.8};store.memory.policy.frontPost=1.25;store.save();
 const fresh=new BotMemoryStore({directory:dir});assert.equal(fresh.memory.games,19);assert.equal(fresh.policy().frontPost,1.25);
 assert.equal(fresh.memory.contexts['2v2:def:press:open'].samples,10);assert.throws(()=>store.import('{"schema":"invalid","version":1}'),/Incompatible/);
 const imported=new BotMemoryStore({directory:temp()});imported.import(JSON.stringify(store.memory));assert.equal(imported.memory.games,19);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('park authoritative human replay is recorded only when explicitly enabled',()=>{
 const dir=temp();try{const store=new BotMemoryStore({directory:dir}),w=new ParkWorld({duration:.06,goldenGoal:false,learning:store});
 const r=w.connect('R',null,true),b=w.connect('B',null,false);w.join(r,1,'red');w.join(b,1,'blue');const f=w.fields[0];
 for(let i=0;i<366;i++)w.tick(STEP);assert.equal(f.game.state,'playing');
 for(let i=0;i<100;i++)w.tick(STEP);w.tick(STEP);assert.ok(store.memory.games>=1);assert.ok(store.memory.humanGames>=1);
 const file=readFileSync(path.join(dir,'teamball-bot-memory.v1.json'),'utf8');assert.doesNotMatch(file,/"email"/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('front-post defender guards the field side of the near post during corner pressure',()=>{
 const m=new Match({size:3,spectator:true,seed:18});const p=m.pitch;
 m.engine.ball.x=p.left+90;m.engine.ball.y=p.goalTop-24;
 const threat=m.players.find(v=>v.team==='blue');threat.x=m.engine.ball.x+10;threat.y=m.engine.ball.y+10;
 m.ai.planTeams();const plan=m.ai.plans.red;assert.equal(plan.frontPostThreat,true);
 const cover=plan.cover;assert.ok(cover);const target=m.ai.cover(cover,plan);
 assert.ok(target.x-cover.radius>=p.left,'the whole defender must stay on the field side');assert.equal(target.y,p.goalTop,'defender should stand beside the near post');
 m.ai.setDifficulty('beginner');assert.ok(DIFFICULTIES.beginner.reaction>DIFFICULTIES.expert.reaction);
});
test('actual shot locations and flight paths survive match reporting',()=>{
 const m=new Match({size:2,spectator:true,seed:12}),s=new MatchStats(m.players,m.pitch),p=m.pitch;
 s.record({type:'kick',player:1,time:1,x:p.right-200,y:p.height/2,vx:370,vy:0});assert.equal(s.rows.get(1).shots,1);
 s.sample(.12,{x:p.right-170,y:p.height/2});assert.equal(s.rows.get(1).shotMap[0].path.length,2);
 const out=s.report();assert.equal(out.players[0].shotMap.length,1);assert.equal(out.players[0].shotMap[0].from[0],p.right-200);
});
test('five-second teammate assist allows opponent shot deflection but not deliberate control',()=>{
 const m=new Match({size:2,spectator:true}),s=new MatchStats(m.players,m.pitch),p=m.pitch;
 s.record({type:'contact',player:1,time:1.0});s.record({type:'contact',player:2,time:1.4});
 s.record({type:'kick',player:2,time:1.5,x:p.right-150,y:p.height/2,vx:410,vy:0});
 s.record({type:'contact',player:3,time:1.7,relativeSpeed:150});
 const g=s.goal('red',2);assert.equal(g.scorerId,2);assert.equal(g.assistId,1);
 assert.equal(s.rows.get(2).shotMap.at(-1).goal,true);
});
test('context classification is symmetric for red and blue and feeds a policy without changing physics',()=>{
 const m=new Match({size:2,spectator:true}),p=m.pitch,b={x:p.left+50,y:p.height/2};
 assert.match(tacticalContext({size:2,pitch:p,ball:b,player:{team:'red'},opponents:[]}),/def/);
 assert.match(tacticalContext({size:2,pitch:p,ball:b,player:{team:'blue'},opponents:[]}),/att/);
 m.ai.setPolicy({...DEFAULT_POLICY,frontPost:1.3});assert.equal(m.ai.teamPolicy.red.frontPost,1.3);m.ai.setLearningContexts({'2v2:def:press:open':{samples:50}});
 assert.equal(m.ai.learningContexts['2v2:def:press:open'].samples,50);
});
