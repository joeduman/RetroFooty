import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import path from 'node:path';import os from 'node:os';
import {Match} from '../public/js/match.mjs';
import {STEP} from '../public/js/config.mjs';
import {BotMemoryStore} from '../bot-learning.mjs';
import {NeuralModelStore} from '../bot-model-store.mjs';
import {INPUT_SIZE,OUTPUT_SIZE,HIDDEN_SIZE,NEURAL_SCHEMA,inferNeural,neuralFeatures,humanAction,blendNeural,validateNeuralModel} from '../public/js/neural-policy.mjs';
const scratch=()=>mkdtempSync(path.join(os.tmpdir(),'teamball-neural-'));
const fixture=()=>({schema:NEURAL_SCHEMA,inputSize:INPUT_SIZE,hiddenSize:HIDDEN_SIZE,outputSize:OUTPUT_SIZE,strength:.27,
 w1:Array.from({length:HIDDEN_SIZE},()=>Array(INPUT_SIZE).fill(0)),b1:Array(HIDDEN_SIZE).fill(0),
 w2:Array.from({length:OUTPUT_SIZE},()=>Array(HIDDEN_SIZE).fill(0)),b2:[2,0,4,0,2,-2],training:{version:'test',humanSamples:9}});

test('neural observation has stable 24-element shape on both teams and in 1v1 through 5v5',()=>{
 for(const size of [1,2,3,4,5]){const game=new Match({size,spectator:true,seed:7});for(const p of game.players){const f=neuralFeatures(game.engine,p,size);assert.equal(f.length,24);assert.ok(f.every(Number.isFinite));}}
});
test('neural model rejects invalid or dangerous weights and returns bounded controls',()=>{
 const m=fixture();assert.ok(validateNeuralModel(m));const p=inferNeural(m,Array(INPUT_SIZE).fill(0));assert.equal(p.length,6);
 assert.ok(p.every((v,i)=>Number.isFinite(v)&&v>= (i>3?0:-1)&&v<=1));
 assert.ok(!validateNeuralModel({...m,w1:[[Infinity]]}));assert.equal(inferNeural({...m,w1:[]},Array(INPUT_SIZE).fill(0)),null);
});
test('learned controller retains expert clearance and does not bypass contact-based shot permissions',()=>{
 const base={x:1,y:0,aimX:1,aimY:0,sprint:true,shoot:true};
 const blended=blendNeural(base,[-1,1,-1,0,0,1],'red',{strength:.3,ownGoalRisk:()=>true,preserveSprint:true});
 assert.ok(blended.input.sprint);assert.ok(blended.input.shoot);assert.equal(blended.input.aimX,1);
 assert.deepEqual(humanAction(base,'blue'),[-1,0,-1,0,1,1]);
 const model=fixture(),g=new Match({size:2,seed:3,spectator:true,aiNeural:model,aiNeuralTeam:'red'});
 assert.equal(g.ai.neuralPolicies.red,model);assert.equal(g.ai.neuralPolicies.blue,null);
 for(let i=0;i<530;i++)g.update(STEP);
 for(const p of g.players)assert.ok([p.input.x,p.input.y,p.input.aimX,p.input.aimY].every(Number.isFinite));
});
test('a rejected trained model never changes the installed champion, and promotion retains rollback',()=>{
 const dir=scratch();try{const store=new NeuralModelStore(dir),model=fixture();
 assert.equal(store.model(),null);assert.throws(()=>store.promote(model,{passed:false}),/failed promotion/);
 assert.equal(store.model(),null);
 const first=store.promote(model,{passed:true,games:12,winRate:.7,goalDifference:5});assert.equal(first.schema,NEURAL_SCHEMA);
 assert.equal(store.model().training.version,'test');
 store.promote({...model,b2:[1,0,2,0,0,0]},{passed:true,games:12,winRate:.67,goalDifference:3});
 const previous=JSON.parse(readFileSync(path.join(dir,'models/champion-previous.v1.json'),'utf8'));
 assert.deepEqual(previous.b2,model.b2);assert.equal(store.status().promotions,2);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Build 13 portable memory survives Build 14 migration and stores neural replay fields',()=>{
 const dir=scratch();try{const store=new BotMemoryStore({directory:dir});store.memory.humanGames=10;store.memory.policy.frontPost=1.33;store.save();
 const reread=new BotMemoryStore({directory:dir});assert.equal(reread.memory.humanGames,10);assert.equal(reread.policy().frontPost,1.33);
 const m=new Match({size:1,spectator:true,seed:3});const p=m.players[0];p.human=true;p.input={x:.8,y:0,aimX:1,aimY:0,sprint:false,shoot:true};
 m.state='playing';store.capture('safe-training-replay',m,{eligibleIds:[p.id]});m.state='ended';store.complete('safe-training-replay',m);
 const output=readFileSync(path.join(dir,'teamball-bot-memory.v1.json'),'utf8');assert.doesNotMatch(output,/password|email/i);
 const list=store.status();assert.equal(list.neural.active,false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('champion rollback returns to previous model without touching older tactical memory',()=>{
 const dir=scratch();try{const tactical=new BotMemoryStore({directory:dir});tactical.memory.policy.frontPost=1.27;tactical.save();
 const a=fixture(),b={...fixture(),b2:[1,2,0,0,-2,2]};tactical.neural.promote(a,{passed:true,games:12,winRate:.7,goalDifference:5});
 tactical.neural.promote(b,{passed:true,games:12,winRate:.7,goalDifference:6});
 const back=tactical.neural.rollback();assert.deepEqual(back.b2,a.b2);
 assert.equal(tactical.neural.model().b2[0],2);assert.equal(tactical.policy().frontPost,1.27);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
