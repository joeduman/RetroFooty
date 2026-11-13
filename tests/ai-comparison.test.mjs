import test from 'node:test';import assert from 'node:assert/strict';
import {comparisonMatch} from '../public/js/ai-comparison.mjs';
import {AIController as Original} from '../public/js/ai-legacy.mjs';
import {AIController as New} from '../public/js/ai.mjs';
import {AIController as Previous} from '../public/js/dev-ai-old.mjs';
import {STEP} from '../public/js/config.mjs';
import {ReplayRecorder,replayFrame} from '../public/js/replay.mjs';
test('development matches assign independent original/new controllers and preserve legal controls',()=>{
 for(const size of [1,2,3,4,5])for(const newSide of ['red','blue']){
  const game=comparisonMatch({size,newSide,seed:41});
  assert.ok(game.ai.controllers[newSide] instanceof New);assert.equal(game.ai.controllers[newSide==='red'?'blue':'red'].constructor,Original);
  for(let i=0;i<400;i++)game.update(STEP);
  for(const p of game.players){assert.ok(Math.hypot(p.vx,p.vy)<=331);assert.ok(p.stamina>=0&&p.stamina<=100);assert.equal(game.ai.memory.get(p.id),game.ai.controllers[p.team].memory.get(p.id));}
 }
});
test('recorded comparison state survives JSON and reproduces actual final score',()=>{
 const game=comparisonMatch({size:2,duration:5,seed:111}),record=new ReplayRecorder(game);
 for(let i=0;i<5000&&game.state!=='ended';i++){game.update(STEP);record.step(STEP);}
 assert.equal(game.state,'ended');const saved=record.finish('complete');saved.replay.frames=Array.from(saved.replay.frames);
 const copy=JSON.parse(JSON.stringify(saved)),view=replayFrame(copy.replay,copy.replay.duration);
 assert.deepEqual(view.score,game.score);assert.equal(view.players.length,4);assert.equal(view.state,'ended');
});
test('new-vs-new selection runs both current policies under the same engine',()=>{
 const game=comparisonMatch({opponent:'new'});assert.ok(game.ai.controllers.red instanceof New);assert.ok(game.ai.controllers.blue instanceof New);
});
test('useful uncontested breakaway boost reaches the motor on both teams and halves',()=>{
 for(const team of ['red','blue'])for(const swapped of [false,true])for(const Controller of [Previous,New]){
  const game=comparisonMatch({size:1,swapped});game.ai=new Controller(game.engine,71);game.state='playing';game.engine.kickoff=null;
  const bot=game.players.find(p=>p.team===team),rival=game.players.find(p=>p!==bot),dir=game.engine.attackDir(team),mirror=x=>dir===1?x:game.pitch.width-x;
  Object.assign(bot,{x:mirror(450),y:330,vx:dir*170,vy:0,stamina:100});Object.assign(rival,{human:true,x:mirror(150),y:100,vx:0,vy:0});
  Object.assign(game.engine.ball,{x:mirror(650),y:330,vx:dir*200,vy:0,lastPlayer:bot.id,lastTeam:team});game.ai.reset();game.ai.update();
  assert.equal(game.ai.memory.get(bot.id).lastTarget.boostUseful,true);
  assert.equal(bot.input.sprint,Controller===New,'previous integration denied this useful open run');
  game.engine.step(STEP);assert.equal(bot.stamina<100,Controller===New);
 }
});
