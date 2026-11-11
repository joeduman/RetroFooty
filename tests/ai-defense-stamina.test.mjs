import test from 'node:test';
import assert from 'node:assert/strict';
import {Match} from '../public/js/match.mjs';
import {STEP,distance} from '../public/js/config.mjs';
import {INPUT_SIZE,HIDDEN_SIZE,OUTPUT_SIZE,NEURAL_SCHEMA} from '../public/js/neural-policy.mjs';

const idle={x:0,y:0,aimX:1,aimY:0,sprint:false,shoot:false};
// Deliberately favors running into our goal and holding boost. Runtime defensive
// positioning and stamina safeguards must also hold with an older learned model.
const wastefulModel=()=>({schema:NEURAL_SCHEMA,inputSize:INPUT_SIZE,hiddenSize:HIDDEN_SIZE,outputSize:OUTPUT_SIZE,strength:.5,
  w1:Array.from({length:HIDDEN_SIZE},()=>Array(INPUT_SIZE).fill(0)),b1:Array(HIDDEN_SIZE).fill(0),
  w2:Array.from({length:OUTPUT_SIZE},()=>Array(HIDDEN_SIZE).fill(0)),b2:[-6,0,-6,0,6,-6]});

function cornerFixture({team='red',swapped=false,bottom=false,neural=false}={}){
  const game=new Match({size:3,spectator:true,seed:71});
  if(swapped)game.startSecondHalf();
  const {pitch,engine,ai,players}=game,dir=engine.attackDir(team),own=dir===1?pitch.left:pitch.right;
  const postY=bottom?pitch.goalBottom:pitch.goalTop;
  engine.kickoff=null;
  // Keep the ball contested but stationary, so only the defender acts during
  // simulations and a changing chase role cannot hide a positioning failure.
  for(const [index,player] of players.entries()){
    player.human=true;player.input={...idle};player.x=pitch.width/2+(index-2)*60;player.y=pitch.height/2+150;
    player.vx=player.vy=0;
  }
  const [cover,chaser]=players.filter(player=>player.team===team);
  const rival=players.find(player=>player.team!==team);
  Object.assign(engine.ball,{x:own+dir*40,y:bottom?pitch.bottom-35:pitch.top+35,vx:0,vy:0});
  Object.assign(chaser,{x:engine.ball.x+dir*55,y:engine.ball.y});
  Object.assign(rival,{x:engine.ball.x+dir*110,y:engine.ball.y});
  Object.assign(cover,{human:false,x:own+dir*110,y:postY});
  if(neural)ai.setNeuralPolicy(wastefulModel(),team);
  ai.planTeams();
  assert.equal(ai.plans[team].cover,cover,'fixture should assign the intended defender');
  return {game,pitch,engine,ai,team,dir,own,postY,cover,chaser,rival};
}

for(const team of ['red','blue'])for(const swapped of [false,true])for(const bottom of [false,true]){
  const label=`${team}, half ${swapped?2:1}, ${bottom?'bottom':'top'} post`;
  test(`corner coverage stands tangent on the field side: ${label}`,()=>{
    const {ai,pitch,own,dir,postY,cover}=cornerFixture({team,swapped,bottom});
    const plan=ai.plans[team],target=ai.cover(cover,plan);
    assert.equal(plan.frontPostThreat,true);
    assert.ok((target.x-own)*dir>=cover.radius,'the entire defender should be outside the goal');
    assert.equal(target.y,postY,'defender should stand beside the post rather than inside the goalmouth');
    assert.ok(Math.abs(distance(target,{x:own,y:postY})-(cover.radius+pitch.postRadius))<1e-8);
    assert.equal(Boolean(target.emergency),false,'stationary corner pressure alone is not an emergency');
  });

  test(`settled corner coverage stays outside with a learned inward bias: ${label}`,()=>{
    const {ai,engine,cover,own,dir,postY}=cornerFixture({team,swapped,bottom,neural:true});
    for(let step=0;step<480;step++){
      ai.update();engine.step(STEP);
      assert.ok((cover.x-own)*dir>=cover.radius-0.01,'the defender must not enter the goal while covering the post');
    }
    assert.ok(distance(cover,{x:own+dir*(cover.radius+engine.pitch.postRadius),y:postY})<3,'defender should settle beside the post');
    assert.equal(cover.input.sprint,false,'holding a settled position must not drain stamina');
  });
}

test('central pressure retains central coverage instead of assigning a corner post',()=>{
  for(const team of ['red','blue'])for(const swapped of [false,true]){
    const {ai,engine,pitch,chaser,rival,cover}=cornerFixture({team,swapped});
    engine.ball.y=pitch.height/2;chaser.y=rival.y=engine.ball.y;
    ai.planTeams();const plan=ai.plans[team],target=ai.cover(cover,plan);
    assert.equal(plan.frontPostThreat,false);
    assert.equal(Boolean(target.frontPost),false);
    assert.equal(target.y,pitch.height/2);
  }
});

test('protected kickoff conserves every bot stamina even when a learned model requests boost',()=>{
  for(const size of [1,3,5])for(const swapped of [false,true])for(const neural of [false,true]){
    const game=new Match({size,spectator:true,seed:79,aiNeural:neural?wastefulModel():null});
    if(swapped)game.startSecondHalf();
    for(let step=0;step<60&&game.engine.kickoff;step++){
      game.ai.update();
      assert.ok(game.players.every(player=>!player.input.sprint),'kickoff protection must disable scripted and learned sprint');
      game.engine.step(STEP);
      assert.ok(game.players.every(player=>player.stamina===100),'bots should approach kickoff without wasting stamina');
    }
  }
});

test('short defensive corrections cancel a previous sprint and reject learned boost',()=>{
  for(const team of ['red','blue'])for(const neural of [false,true]){
    const {ai,dir,cover}=cornerFixture({team,neural});
    const target=ai.cover(cover,ai.plans[team]);
    cover.x=target.x+dir*35;cover.y=target.y;
    const memory=ai.memory.get(cover.id);memory.sprint=true;memory.sprintUntil=10;
    ai.update();assert.equal(cover.input.sprint,false);
  }
});

test('long corner repositioning preserves a tired defender reserve',()=>{
  for(const neural of [false,true]){
    const {ai,cover,own,dir,postY}=cornerFixture({neural});
    Object.assign(cover,{x:own+dir*340,y:postY,stamina:5});
    ai.update();assert.equal(cover.input.sprint,false,'corner positioning should not force an exhausted defender to sprint');
  }
});

test('a real incoming shot still permits tired defenders to sprint for an interception',()=>{
  for(const team of ['red','blue'])for(const swapped of [false,true]){
    const {ai,engine,pitch,cover,chaser,rival,own,dir}=cornerFixture({team,swapped,neural:true});
    Object.assign(engine.ball,{x:own+dir*260,y:pitch.height/2,vx:-dir*300,vy:0});
    Object.assign(chaser,{human:false,x:engine.ball.x-dir*200,y:engine.ball.y,stamina:5});
    Object.assign(rival,{x:engine.ball.x+dir*150,y:engine.ball.y});
    Object.assign(cover,{x:own+dir*80,y:engine.ball.y+140,stamina:5});
    ai.planTeams();assert.equal(ai.plans[team].goalThreat,true);
    assert.equal(ai.plans[team].chaser,chaser);
    assert.equal(Boolean(ai.chase(chaser,ai.memory.get(chaser.id)).emergency),true);
    ai.update();
    assert.equal(chaser.input.sprint,true,'challenger should be allowed to sprint to stop a shot');
    assert.equal(cover.input.sprint,true,'cover should be allowed to sprint back into the shot path');
  }
});
