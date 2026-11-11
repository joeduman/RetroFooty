import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsEngine,Player} from '../public/js/physics.mjs';
import {createPitch,TUNING as C,distance,unit} from '../public/js/config.mjs';
import {forecastBall,BallForecast,reachTime,interceptBall,bankTarget,evaluateKick} from '../public/js/ai-prediction.mjs';

test('free-ball forecast matches 240Hz game physics through curved wall and post rebounds without mutating the match',()=>{
  const engine=new PhysicsEngine(createPitch(1),[]);
  Object.assign(engine.ball,{x:420,y:130,vx:340,vy:-230,spin:5});
  const before=JSON.stringify({ball:engine.ball,time:engine.time,events:engine.events});
  const path=forecastBall(engine,{horizon:1.5,interval:.075});
  assert.equal(JSON.stringify({ball:engine.ball,time:engine.time,events:engine.events}),before);
  let elapsed=0,maxError=0;
  for(const sample of path.slice(1)){
    while(elapsed<sample.t-1e-9){engine.step(1/240);elapsed+=1/240;}
    maxError=Math.max(maxError,distance(engine.ball,sample));
    assert.ok(Math.abs(engine.ball.vx-sample.vx)<1e-7);
    assert.ok(Math.abs(engine.ball.vy-sample.vy)<1e-7);
  }
  assert.ok(maxError<1e-7,`forecast error ${maxError}`);
  assert.ok(path.some(q=>q.vy>0),'the forecast includes the real wall reflection');
});

test('ball forecast respects obstacles and correct scoring side in both halves',()=>{
  const engine=new PhysicsEngine(createPitch(1),[]);
  engine.obstacles=[{x:600,y:330,radius:25}];
  Object.assign(engine.ball,{x:550,y:330,vx:400,vy:0});
  assert.ok(forecastBall(engine,{horizon:.4}).some(q=>q.vx<0),'cone rebound should be predicted');
  engine.obstacles=[];
  for(const swapped of [false,true]){
    engine.setSidesSwapped(swapped);
    Object.assign(engine.ball,{x:engine.pitch.right-20,y:330,vx:400,vy:0});
    const path=forecastBall(engine);
    assert.equal(path.at(-1).goal,swapped?'blue':'red');
    assert.ok(path.at(-1).t<.2);
  }
});

test('shadow broadphase preserves exact corner, post and custom interior geometry collisions',()=>{
  const fixtures=[
    {ball:{x:115,y:108,vx:-240,vy:-180,spin:4}},
    {ball:{x:120,y:244,vx:-300,vy:90,spin:-2}},
    {ball:{x:980,y:230,vx:260,vy:190,spin:3}},
    {ball:{x:540,y:330,vx:-250,vy:80,spin:1},wall:[500,100,500,550,1,0]},
    {ball:{x:450,y:330,vx:300,vy:20,spin:2},post:{x:500,y:335,radius:22}},
    {ball:{x:500,y:330,vx:100,vy:100,spin:0},wall:[88,88,992,88,0,-1]}
  ];
  for(const fixture of fixtures){
    const engine=new PhysicsEngine(createPitch(1),[]);
    Object.assign(engine.ball,fixture.ball);
    if(fixture.wall)engine.walls.push(fixture.wall);
    if(fixture.post)engine.posts.push(fixture.post);
    const prediction=forecastBall(engine,{horizon:.9,interval:.075});
    let elapsed=0;
    for(const sample of prediction.slice(1)){
      while(elapsed<sample.t-1e-9){engine.step(1/240);elapsed+=1/240;}
      assert.ok(distance(engine.ball,sample)<1e-7,`collision parity for ${JSON.stringify(fixture)}`);
      assert.ok(Math.abs(engine.ball.vx-sample.vx)<1e-7);
      assert.ok(Math.abs(engine.ball.vy-sample.vy)<1e-7);
    }
  }
});

test('shared forecast keeps relative times and invalidates on a new kick',()=>{
  const engine=new PhysicsEngine(createPitch(1),[]),cache=new BallForecast();
  Object.assign(engine.ball,{x:400,y:330,vx:650,vy:0});
  const first=cache.get(engine),at=cache.at;
  engine.step(.025);
  const reused=cache.get(engine);
  assert.equal(cache.at,at);
  assert.equal(reused[0].t,0);assert.equal(reused[0].x,engine.ball.x);
  assert.ok(Math.abs(reused[1].t-(first[1].t-.025))<1e-8);
  Object.assign(engine.ball,{vx:-300,lastPlayer:42,lastTeam:'blue'});
  cache.get(engine);
  assert.equal(cache.at,engine.time);
});

test('a forecast timestamps a goal at its actual scoring substep rather than the sample boundary',()=>{
  const engine=new PhysicsEngine(createPitch(1),[]);
  Object.assign(engine.ball,{x:engine.pitch.right-20,y:engine.pitch.height/2,vx:400,vy:0});
  const prediction=forecastBall(engine,{horizon:.4,interval:.15}),goal=prediction.at(-1);
  let scored=null;
  while(!scored&&engine.time<.4)scored=engine.step(1/240);
  assert.equal(scored,'red');assert.equal(goal.goal,scored);
  assert.ok(Math.abs(goal.t-engine.time)<1e-9);
  assert.ok(distance(goal,engine.ball)<1e-7);
  assert.ok(goal.t<.15,'a goal between samples must retain its earlier physical time');
});

function actualArrival({vx=0,stamina=100,boost=true,targetDistance=360}={}){
  const engine=new PhysicsEngine(createPitch(1),[]),player=new Player(1,'red',1,'runner');
  Object.assign(player,{x:200,y:330,vx,stamina});
  const target={x:player.x+targetDistance,y:player.y},estimate=reachTime(player,target,{boost});
  player.input={x:1,y:0,aimX:1,aimY:0,sprint:boost,shoot:false};
  let elapsed=0;
  while(target.x-player.x>player.radius+C.ballRadius&&elapsed<5){
    engine.motor(player,1/240);player.x+=player.vx/240;elapsed+=1/240;
  }
  return {estimate,elapsed};
}

test('reach estimates stay close to actual acceleration, reversal, braking and boost exhaustion',()=>{
  for(const options of [{},{vx:-170},{vx:330,boost:false},{stamina:5},{stamina:0},{boost:false}]){
    const {estimate,elapsed}=actualArrival(options);
    assert.ok(Math.abs(estimate-elapsed)<.025,`${JSON.stringify(options)}: estimated ${estimate}, actual ${elapsed}`);
  }
  const player=new Player(1,'red',1,'runner'),target={x:400,y:0};
  player.stamina=100;const full=reachTime(player,target);
  player.stamina=5;const tired=reachTime(player,target);
  assert.ok(tired>full+.4,'tired defenders must not be assigned unlimited sprint range');
});

test('interception selects a physically reachable future point and identifies hopeless chases',()=>{
  const engine=new PhysicsEngine(createPitch(1),[]),player=new Player(1,'red',1,'runner');
  Object.assign(engine.ball,{x:420,y:330,vx:300,vy:0});
  Object.assign(player,{x:650,y:330});
  const path=forecastBall(engine,{horizon:1.5}),intercept=interceptBall(player,path);
  assert.equal(intercept.reachable,true);
  assert.ok(intercept.t>.1&&intercept.t<.8);
  Object.assign(player,{x:engine.pitch.left,y:engine.pitch.top,stamina:0});
  assert.equal(interceptBall(player,path.slice(0,4)).reachable,false);
});

test('restitution-aware bank geometry reaches the intended receiver rather than using a mirror angle',()=>{
  const engine=new PhysicsEngine(createPitch(1),[]),b=engine.ball;
  Object.assign(b,{x:420,y:180});
  const destination={x:690,y:205},bank=bankTarget(b,destination,engine.pitch.top+b.radius);
  assert.ok(bank);
  const direction=unit(bank.point.x-b.x,bank.point.y-b.y);
  Object.assign(b,{vx:direction.x*550,vy:direction.y*550});
  let closest=Infinity;
  for(let i=0;i<500;i++){
    engine.step(1/240);closest=Math.min(closest,distance(b,destination));
  }
  assert.ok(closest<2,`bank misses by ${closest} pixels`);
  assert.equal(bankTarget(b,{x:700,y:50},engine.pitch.top+b.radius),null);
});

test('candidate shot prediction includes the engine contact angle and moving defender response',()=>{
  const engine=new PhysicsEngine(createPitch(1),[]),player=new Player(1,'red',1,'shooter');
  Object.assign(engine.ball,{x:650,y:330});Object.assign(player,{x:623,y:330});
  const target={x:engine.pitch.right+20,y:330};
  const clean=evaluateKick(engine,player,target);
  assert.equal(clean.goal,'red');assert.equal(clean.interceptionRisk,0);
  const defender=new Player(2,'blue',1,'defender');
  Object.assign(defender,{x:840,y:390,vx:0,vy:-170,stamina:100});
  const covered=evaluateKick(engine,player,target,{opponents:[defender]});
  assert.ok(covered.interceptionRisk>.5);
  Object.assign(player,{x:650,y:303});
  const misaligned=evaluateKick(engine,player,target);
  assert.equal(misaligned.goal,null);
  assert.ok(misaligned.alignment<.01,'aim cannot override a physically incorrect contact face');
  const afterShaping=evaluateKick(engine,player,target,{assumeAligned:true});
  assert.equal(afterShaping.goal,'red','future candidate evaluation may explicitly assume a completed approach');
  assert.equal(afterShaping.alignment,1);
  assert.notEqual(afterShaping.path[0].vx,misaligned.path[0].vx,'future setup must remain distinct from a kick at the current contact face');
});

test('candidate straight-shot approximation stays within two pixels of the actual impulse and drag',()=>{
  const engine=new PhysicsEngine(createPitch(1),[]),player=new Player(1,'red',1,'shooter');
  Object.assign(engine.ball,{x:500,y:330,vx:120,vy:30,spin:0});
  Object.assign(player,{x:473,y:330,vx:160,vy:0});
  const target={x:engine.pitch.right+20,y:330},prediction=evaluateKick(engine,player,target,{horizon:1});
  player.input={x:1,y:0,aimX:1,aimY:0,sprint:false,shoot:true};
  assert.equal(engine.shoot(player),true);
  let elapsed=0;
  for(const sample of prediction.path.slice(1)){
    while(elapsed<sample.t-1e-9){engine.step(1/240);elapsed+=1/240;}
    assert.ok(distance(engine.ball,sample)<2,`error at ${sample.t}: ${distance(engine.ball,sample)}`);
  }
});
