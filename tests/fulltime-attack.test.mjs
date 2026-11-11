import test from 'node:test';
import assert from 'node:assert/strict';
import {Match} from '../public/js/match.mjs';
import {STEP,TUNING as C} from '../public/js/config.mjs';

function fixture({team='red',swapped=false,goldenGoal=true}={}){
  const game=new Match({size:1,spectator:true,loop:false,duration:60,goldenGoal,seed:99});
  if(swapped)game.startSecondHalf();
  game.half=2;game.state='playing';game.remaining=STEP;game.engine.kickoff=null;
  for(const player of game.players){player.human=true;player.x=game.pitch.left+100+player.id*100;player.y=game.pitch.top+30;player.input={x:0,y:0,aimX:1,aimY:0,sprint:false,shoot:false};}
  const dir=game.engine.attackDir(team),mid=game.pitch.width/2;
  Object.assign(game.engine.ball,{x:mid+dir*140,y:game.pitch.height/2,vx:0,vy:0,lastTeam:team});
  return {game,ball:game.engine.ball,mid,dir};
}

for(const team of ['red','blue'])for(const swapped of [false,true]){
  test(`full time lets ${team} finish an attack in half ${swapped?2:1} direction`,()=>{
    const {game,ball,mid,dir}=fixture({team,swapped});game.score[team]=1;
    game.update(STEP);
    assert.equal(game.state,'playing');assert.equal(game.remaining,0);
    assert.equal(game.fulltimePending,true);assert.equal(game.fulltimeAttackTeam,team);
    assert.equal(game.fulltimeAttackSide,dir===1?'right':'left');
    assert.equal(game.report().fulltimePending,true);
    ball.lastTeam=team==='red'?'blue':'red';game.update(STEP);
    assert.equal(game.state,'playing','an opponent touch within this half does not abruptly end the attack');
    ball.x=mid-dir*10;game.update(STEP);
    assert.equal(game.state,'ended');assert.equal(game.fulltimePending,false);
    assert.equal(game.fulltimeAttackTeam,null);
  });
}

test('an opponent clearance in their own half does not earn an extension',()=>{
  for(const lastTeam of ['blue',null]){
    const {game,ball}=fixture();game.score.red=1;ball.lastTeam=lastTeam;
    game.update(STEP);assert.equal(game.state,'ended');assert.equal(game.fulltimePending,false);
  }
});

test('a ball at midfield does not delay full time',()=>{
  const {game,ball,mid}=fixture();game.score.red=1;ball.x=mid;
  game.update(STEP);assert.equal(game.state,'ended');
});

test('a tied game starts golden goal only when the final attack returns',()=>{
  const {game,ball,mid,dir}=fixture();
  game.update(STEP);assert.equal(game.fulltimePending,true);assert.equal(game.overtime,false);
  for(let n=0;n<30;n++)game.update(STEP);
  assert.equal(game.remaining,0);assert.equal(game.state,'playing');
  ball.x=mid-dir*10;game.update(STEP);
  assert.equal(game.overtime,true);assert.equal(game.state,'kickoff');assert.equal(game.wait,C.kickoffSeconds);
  assert.equal(game.fulltimePending,false);assert.equal(game.extraElapsed,0);
  assert.ok(game.engine.kickoff);
});

test('a goal during the final attack settles the result after the celebration',()=>{
  for(const initialBlueGoals of [0,1]){
    const {game,ball}=fixture();game.score.blue=initialBlueGoals;
    game.update(STEP);assert.equal(game.fulltimePending,true);
    ball.x=game.pitch.right+ball.radius+2;game.update(STEP);
    assert.equal(game.state,'goal');assert.equal(game.score.red,1);assert.equal(game.fulltimePending,false);
    for(let n=0;n<Math.round(C.celebrationSeconds/STEP);n++)game.update(STEP);
    assert.equal(game.state,initialBlueGoals?'kickoff':'ended');
    assert.equal(game.overtime,Boolean(initialBlueGoals));
  }
});

test('a tied game with golden goal disabled ends after the final attack',()=>{
  const {game,ball,mid,dir}=fixture({goldenGoal:false});
  game.update(STEP);assert.equal(game.fulltimePending,true);
  ball.x=mid-dir*10;game.update(STEP);
  assert.equal(game.state,'ended');assert.equal(game.overtime,false);
});
