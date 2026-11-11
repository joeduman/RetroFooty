import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Match} from '../public/js/match.mjs';
import {STEP,TUNING as C,seededRandom,unit,distance} from '../public/js/config.mjs';
import {kickDirection} from '../public/js/physics.mjs';
import {bankTarget} from '../public/js/ai-prediction.mjs';

function solo({team='red',swapped=false,seed=71}={}){
  const game=new Match({size:1,spectator:true,seed,goldenGoal:false,loop:false});
  game.engine.setSidesSwapped(swapped);game.sidesSwapped=swapped;
  game.state='playing';game.wait=0;game.engine.kickoff=null;
  const bot=game.players.find(q=>q.team===team),rival=game.players.find(q=>q!==bot),dir=game.engine.attackDir(team);
  rival.human=true;rival.input={x:0,y:0,aimX:-dir,aimY:0,sprint:false,shoot:false};
  return {game,bot,rival,dir,own:dir===1?game.pitch.left:game.pitch.right,goal:dir===1?game.pitch.right:game.pitch.left};
}

test('Expert finishes actual open-goal opportunities on both sides in either half',()=>{
  for(const team of ['red','blue'])for(const swapped of [false,true]){
    const {game,bot,rival,dir,goal}=solo({team,swapped}),b=game.engine.ball;
    Object.assign(b,{x:goal-dir*180,y:game.pitch.height/2,vx:0,vy:0,lastTeam:team});
    Object.assign(bot,{x:b.x-dir*28,y:b.y,vx:0,vy:0});
    Object.assign(rival,{x:game.pitch.width/2,y:game.pitch.top+40});
    game.ai.reset();
    for(let i=0;i<600&&game.score[team]===0;i++)game.update(STEP);
    assert.equal(game.score[team],1,`${team}, swapped=${swapped} should score rather than orbit an open finish`);
    assert.equal(game.score[team==='red'?'blue':'red'],0);
  }
});

test('Expert selects a legal bank finish and scores through a real wall rebound in both halves',()=>{
  for(const team of ['red','blue'])for(const swapped of [false,true]){
    const {game,bot,rival,dir,goal}=solo({team,swapped}),b=game.engine.ball,p=game.pitch;
    Object.assign(b,{x:dir===1?650:p.width-650,y:105,vx:0,vy:0,spin:0,lastTeam:team});
    const bank=bankTarget(b,{x:goal+dir*12,y:p.height/2},p.top+b.radius),approach=unit(bank.point.x-b.x,bank.point.y-b.y);
    Object.assign(bot,{x:b.x-approach.x*28,y:b.y-approach.y*28,vx:approach.x*C.sprintSpeed,vy:approach.y*C.sprintSpeed,stamina:100,shotCooldown:0});
    Object.assign(rival,{x:b.x+dir*30,y:165,vx:0,vy:0,stamina:0});
    game.ai.reset();game.ai.update();
    assert.equal(game.ai.memory.get(bot.id).aim.type,'bank-shot','normal Expert selection should find the bounce rather than a blocked direct finish');
    let kicked=false,rebounded=false;
    for(let i=0;i<600&&game.score[team]===0;i++){
      game.update(STEP);
      kicked||=game.events.some(e=>e.type==='kick'&&e.player===bot.id);
      rebounded||=game.events.some(e=>e.type==='wall');
    }
    assert.equal(kicked,true);assert.equal(rebounded,true);
    assert.equal(game.score[team],1,`${team}, swapped=${swapped}: legal impulse and actual wall geometry must score`);
  }
});

test('wrong-side own-goal recovery produces a safe forward touch instead of settling at a shaping waypoint',()=>{
  for(const team of ['red','blue'])for(const swapped of [false,true]){
    const {game,bot,rival,dir,own}=solo({team,swapped}),b=game.engine.ball;
    Object.assign(b,{x:own+dir*70,y:game.pitch.height/2,vx:0,vy:0,lastTeam:team});
    Object.assign(bot,{x:b.x+dir*29,y:b.y,vx:0,vy:0});
    Object.assign(rival,{x:own+dir*650,y:game.pitch.top+40});
    game.ai.reset();const initial=b.x;
    for(let i=0;i<600;i++)game.update(STEP);
    assert.equal(game.score[team==='red'?'blue':'red'],0,'getting behind the ball must not create an own goal');
    assert.ok((b.x-initial)*dir>60,`${team}, swapped=${swapped}: must make useful progress in five seconds`);
  }
});

test('requested Expert kicks never send the actual contact impulse through its own goal',()=>{
  for(const team of ['red','blue'])for(const swapped of [false,true]){
    const {game,bot,rival,dir,own}=solo({team,swapped}),b=game.engine.ball;
    Object.assign(b,{x:own+dir*85,y:game.pitch.height/2,vx:0,vy:0,lastTeam:team});
    Object.assign(rival,{x:own+dir*650,y:game.pitch.top+40});
    for(let angle=0;angle<Math.PI*2;angle+=Math.PI/8){
      Object.assign(bot,{x:b.x+Math.cos(angle)*29,y:b.y+Math.sin(angle)*29,vx:0,vy:0,shotCooldown:0});
      game.ai.reset();game.ai.update();
      if(!bot.input.shoot)continue;
      const normal=unit(b.x-bot.x,b.y-bot.y),aim=unit(bot.input.aimX,bot.input.aimY),actual=kickDirection(normal,aim);
      assert.equal(game.ai.ownGoalRisk(b,{x:b.x+actual.x*1000,y:b.y+actual.y*1000},game.ai.plans[team]),false);
    }
  }
});

test('a ball outside the forecast reachable region does not consume boost on a hopeless chase',()=>{
  const game=new Match({size:5,spectator:true,seed:91});game.engine.kickoff=null;
  const b=game.engine.ball,bot=game.players[0];
  for(const [index,q] of game.players.entries())Object.assign(q,{human:q!==bot,x:game.pitch.left+35,y:game.pitch.top+35+index*65,vx:0,vy:0});
  Object.assign(bot,{x:game.pitch.left+35,y:game.pitch.height/2,stamina:100});
  Object.assign(b,{x:game.pitch.width/2,y:game.pitch.height/2,vx:650,vy:0,lastTeam:null,lastPlayer:null});
  game.ai.reset();game.ai.update();
  assert.equal(game.ai.races.get(bot.id).boost.reachable,false);
  assert.equal(bot.input.sprint,false);
});

test('containment closes the dangerous lane and changes to interception when possession becomes loose',()=>{
  const {game,bot,rival,dir,own}=solo(),b=game.engine.ball;
  Object.assign(b,{x:own+dir*400,y:game.pitch.height/2,vx:0,vy:0,lastTeam:rival.team});
  Object.assign(bot,{x:b.x-dir*150,y:b.y,vx:0,vy:0});
  Object.assign(rival,{x:b.x+dir*27,y:b.y,vx:0,vy:0});
  game.ai.reset();game.ai.update();
  const defended=game.ai.diagnostics.get(bot.id);
  assert.equal(defended.action,'contain');
  assert.ok((defended.target.x-own)*dir<(b.x-own)*dir,'contain between the ball and the goal');
  assert.ok(distance(defended.target,{x:own,y:b.y})>180,'do not abandon midfield to sit at the goal line');
  Object.assign(rival,{x:b.x+dir*330,y:b.y+150});b.lastTeam=null;game.engine.time+=.3;
  game.ai.update();
  assert.notEqual(game.ai.diagnostics.get(bot.id).action,'contain','a loose ball is an opportunity to challenge');
});

test('observed repeated human reversals change the actual containment target under the same game state',()=>{
  const {game,bot,rival,dir,own}=solo(),b=game.engine.ball;
  const restore=()=>{
    Object.assign(b,{x:own+dir*400,y:game.pitch.height/2,vx:0,vy:0,spin:0,lastTeam:rival.team});
    Object.assign(bot,{x:b.x-dir*150,y:b.y,vx:0,vy:0});
    Object.assign(rival,{x:b.x+dir*27,y:b.y,vx:0,vy:0});
    game.ai.reset();game.ai.update();return game.ai.diagnostics.get(bot.id);
  };
  const before=restore();assert.equal(before.action,'contain');
  // Run legitimate human movement through the authoritative motor and observer.
  // A distant demonstration keeps contact outcomes from changing the repeated
  // movement itself; no tendency values or policy parameters are injected.
  rival.x=game.pitch.right-150;rival.y=game.pitch.height/2;
  bot.input={x:0,y:0,aimX:dir,aimY:0,sprint:false,shoot:false};
  for(let repetition=0;repetition<40;repetition++){
    rival.input={x:0,y:repetition%2?1:-1,aimX:-dir,aimY:0,sprint:false,shoot:false};
    for(let frame=0;frame<20;frame++){game.engine.step(STEP);game.ai.observe();}
  }
  const learned=game.ai.activeMemory.tendency(rival);
  assert.ok(learned.confidence>.45);assert.ok(learned.reverse>.35);
  const after=restore();assert.equal(after.action,'contain');
  assert.ok(distance(before.target,after.target)>3,'observations must affect a real defensive decision');
  assert.ok((after.target.x-before.target.x)*dir<0,'repeated reversals retain a larger recoverable containment gap');
});

test('progress detector triggers tactical reevaluation on frozen possession without random movement',()=>{
  const {game,bot,rival,dir,own}=solo(),b=game.engine.ball;
  Object.assign(b,{x:own+dir*350,y:game.pitch.height/2,vx:0,vy:0,lastTeam:bot.team});
  Object.assign(bot,{x:b.x-dir*28,y:b.y,vx:0,vy:0});
  Object.assign(rival,{x:game.pitch.right-40,y:game.pitch.top+40});
  game.ai.reset();
  for(let sample=0;sample<5;sample++){game.engine.time=sample*.81;game.ai.update();}
  const m=game.ai.memory.get(bot.id);
  assert.ok(m.loops>=3);
  assert.ok(m.escapeUntil>game.engine.time);
  assert.ok(m.candidates.some(q=>q.type==='escape'),'replanning must offer an explicit safe escape');
});

test('Expert produces finite legal controls without directly mutating physical state in every mode and half',()=>{
  const random=seededRandom(441);
  for(const size of [1,2,3,4,5])for(const swapped of [false,true]){
    const game=new Match({size,spectator:true,seed:441});game.engine.kickoff=null;game.engine.setSidesSwapped(swapped);
    const {pitch:p}=game;
    for(const q of game.players)Object.assign(q,{x:p.left+50+random()*(p.right-p.left-100),y:p.top+50+random()*(p.bottom-p.top-100),vx:(random()-.5)*660,vy:(random()-.5)*660,stamina:random()*100});
    Object.assign(game.engine.ball,{x:p.left+70+random()*(p.right-p.left-140),y:p.top+70+random()*(p.bottom-p.top-140),vx:(random()-.5)*600,vy:(random()-.5)*600});
    game.ai.reset();
    const before=JSON.stringify({ball:game.engine.ball,players:game.players.map(({x,y,vx,vy,stamina})=>({x,y,vx,vy,stamina}))});
    game.ai.update();
    assert.equal(JSON.stringify({ball:game.engine.ball,players:game.players.map(({x,y,vx,vy,stamina})=>({x,y,vx,vy,stamina}))}),before,'AI must issue inputs only');
    for(const q of game.players){
      for(const key of ['x','y','aimX','aimY'])assert.ok(Number.isFinite(q.input[key]));
      assert.ok(Math.hypot(q.input.x,q.input.y)<=1.000000001);
      assert.ok(Math.hypot(q.input.aimX,q.input.aimY)<=1.000000001);
      assert.equal(typeof q.input.sprint,'boolean');assert.equal(typeof q.input.shoot,'boolean');
    }
  }
});

test('offline worker and rollout entry points retain frozen Expert behavior exactly',()=>{
  const cwd=fileURLToPath(new URL('../',import.meta.url));
  for(const entry of ['C:/compat/bot-trainer-worker.mjs','C:/compat/train/rollout.mjs']){
    const source=`import assert from 'node:assert/strict';
      process.argv[1]=${JSON.stringify(entry)};
      const {Match}=await import('./public/js/match.mjs');
      const {AIController:Legacy}=await import('./public/js/ai-legacy.mjs');
      const {AIController:Frozen}=await import('./tests/fixtures/expert-baseline/ai.mjs');
      const options={size:3,spectator:true,seed:177,duration:20,goldenGoal:false,loop:false};
      const actual=new Match(options),expected=new Match(options);
      assert.ok(actual.ai instanceof Legacy);assert.equal(actual.ai.version,undefined);
      expected.ai=new Frozen(expected.engine,177);expected.ai.reset();
      for(let i=0;i<1200;i++){
        actual.update(1/120);expected.update(1/120);
        assert.deepEqual(actual.players,expected.players);
        assert.deepEqual(actual.engine.ball,expected.engine.ball);
        assert.deepEqual(actual.score,expected.score);
      }
      process.stdout.write('exact parity');`;
    const result=spawnSync(process.execPath,['--input-type=module','-e',source],{cwd,encoding:'utf8',timeout:60000});
    assert.equal(result.status,0,`${entry}: ${result.stderr}`);
    assert.equal(result.stdout,'exact parity');
  }
});
