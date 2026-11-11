import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {EXPERT_SCENARIOS,loadScenario,advanceScenario,captureScenarioState} from './fixtures/expert-scenarios.mjs';
import {AIController as BaselineAI} from './fixtures/expert-baseline/ai.mjs';
import {ComparisonController,runComparison} from './expert-benchmark.mjs';
import {STEP} from '../public/js/config.mjs';

test('the previous Expert fixture differs from its snapshot only in import paths',()=>{
  const manifest=JSON.parse(readFileSync(new URL('./fixtures/expert-baseline/manifest.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
  const source=readFileSync(new URL('./fixtures/expert-baseline/ai.mjs',import.meta.url),'utf8').replaceAll("from '../../../public/js/","from './");
  assert.equal(createHash('sha256').update(source).digest('hex'),manifest.originalSha256.toLowerCase());
});

test('all twenty requested situations have JSON-portable reproducible saved states',()=>{
  assert.equal(EXPERT_SCENARIOS.length,20);assert.equal(new Set(EXPERT_SCENARIOS.map(s=>s.id)).size,20);
  for(const scenario of EXPERT_SCENARIOS){
    const first=loadScenario(scenario),second=loadScenario(JSON.parse(JSON.stringify(scenario)));
    advanceScenario(first,.25);advanceScenario(second,.25);
    assert.deepEqual(captureScenarioState(first.game),captureScenarioState(second.game),scenario.id);
  }
});

for(const record of EXPERT_SCENARIOS)test(`saved situation runs through legal controls: ${record.id}`,()=>{
  const {game}=advanceScenario(loadScenario(record),.75);
  for(const player of game.players){
    assert.ok(Number.isFinite(player.x+player.y+player.vx+player.vy+player.stamina));
    assert.ok(player.stamina>=0&&player.stamina<=100);
    assert.ok(Math.hypot(player.vx,player.vy)<=331,'runtime controller must use the unchanged speed limit');
    if(!player.human){assert.ok(Number.isFinite(player.input.x+player.input.y+player.input.aimX+player.input.aimY));assert.equal(typeof player.input.sprint,'boolean');}
  }
  assert.ok(Number.isFinite(game.engine.ball.x+game.engine.ball.y+game.engine.ball.vx+game.engine.ball.vy));
});

test('mixed evaluation preserves the selected baseline team inputs',()=>{
  const {game}=loadScenario('advanced-spacing'),comparison=new ComparisonController(game.engine,14,'red');
  comparison.baseline.update();const expected=game.players.filter(p=>p.team==='blue').map(p=>({...p.input}));
  // Repeat from fresh state: do not compare an extra observation/steering tick.
  const fresh=loadScenario('advanced-spacing').game,controller=new ComparisonController(fresh.engine,14,'red');controller.update();
  assert.deepEqual(fresh.players.filter(p=>p.team==='blue').map(p=>p.input),expected);
  for(const player of fresh.players)assert.equal(controller.memory.get(player.id),controller.owner(player.team).memory.get(player.id));
});

test('protected-kickoff scenario never spends baseline or upgraded boost',()=>{
  for(const Controller of [null,BaselineAI]){
    const {game}=loadScenario('kickoff-conservation',{baselineController:Controller});
    for(let frame=0;frame<50&&game.engine.kickoff;frame++){
      game.ai.update();assert.ok(game.players.every(p=>!p.input.sprint));game.engine.step(STEP);
      assert.ok(game.players.every(p=>p.stamina===100));
    }
  }
});

test('paired frozen-vs-frozen benchmark reverses outcomes when labels change',()=>{
  const red=runComparison({size:1,seed:300,duration:5,control:true,candidateTeam:'red'});
  const blue=runComparison({size:1,seed:300,duration:5,control:true,candidateTeam:'blue'});
  assert.deepEqual(red.score,blue.score);assert.deepEqual(red.candidate,blue.baseline);
  assert.equal(red.nonFinite+blue.nonFinite,0);assert.ok(red.finished&&blue.finished);
});
