import test from 'node:test';
import assert from 'node:assert/strict';
import {Player,PhysicsEngine} from '../public/js/physics.mjs';
import {Match} from '../public/js/match.mjs';
import {OnlinePrediction} from '../public/js/online-prediction.mjs';
import {createPitch,STEP,TUNING as C} from '../public/js/config.mjs';

const idle={x:0,y:0,aimX:1,aimY:0,sprint:false,shoot:false};
function fixture(){
 const pitch=createPitch(1),player=new Player(1,'red',1,'Player',true),engine=new PhysicsEngine(pitch,[player]);
 Object.assign(player,{x:pitch.width/2,y:pitch.height/2,input:{...idle}});
 Object.assign(engine.ball,{x:player.x+28,y:player.y,vx:0,vy:0});
 return {pitch,player,engine,ball:engine.ball};
}

test('players can kick a scored ball out of either net using ordinary contact rules',()=>{
 for(const right of [false,true]){
  const {pitch,player,engine,ball}=fixture(),goalX=right?pitch.right:pitch.left,into=right?1:-1;
  Object.assign(player,{x:goalX+into*45,y:pitch.height/2,input:{...idle,aimX:-into,shoot:true}});
  Object.assign(ball,{x:player.x-into*28,y:player.y});
  const originalX=ball.x;
  engine.celebrate(STEP,true);
  assert.equal(engine.events.filter(event=>event.type==='kick').length,1);
  assert.ok(ball.vx*into< -300,'the kick must send the ball back toward the field');
  assert.ok(Math.abs(ball.x-originalX)<C.ballMaxSpeed*STEP+1,'the kick must not relocate the ball');
  engine.celebrate(.1,true);assert.ok((ball.x-goalX)*into<0,'the ball can pass back out through the mouth');
 }
});

test('held shooting kicks an arriving celebration ball once and respects the live cooldown',()=>{
 const {player,engine,ball}=fixture();ball.x=player.x+120;ball.vx=-200;player.input.shoot=true;
 const kicks=[];
 for(let n=0;n<120;n++){engine.celebrate(STEP,true);kicks.push(...engine.events.filter(event=>event.type==='kick'));}
 assert.equal(kicks.length,1,'a held button should kick only when the arriving ball is in contact range');
 assert.ok(ball.vx>150);
 Object.assign(ball,{x:player.x+28,y:player.y,vx:0,vy:0});player.vx=player.vy=0;player.shotCooldown=.1;
 engine.celebrate(STEP,true);assert.equal(engine.events.some(event=>event.type==='kick'),false);
 player.shotCooldown=0;engine.celebrate(STEP,true);assert.equal(engine.events.some(event=>event.type==='kick'),true);
});

test('celebration kicks cannot reach distant balls, and park walking leaves its hidden ball inactive',()=>{
 const {player,engine,ball}=fixture();ball.x=player.x+100;player.input.shoot=true;
 const original={...ball};engine.celebrate(.05,true);
 assert.equal(engine.events.some(event=>event.type==='kick'),false);assert.equal(ball.x,original.x);assert.equal(ball.vx,0);
 ball.x=player.x+28;engine.celebrate(.05,false);
 assert.equal(engine.events.some(event=>event.type==='kick'),false);assert.equal(ball.vx,0);
});

test('celebration preserves solid net walls, posts and player-ball collisions',()=>{
 const {pitch,engine,ball}=fixture();engine.players=[];
 Object.assign(ball,{x:pitch.right+pitch.goalDepth-ball.radius-2,y:pitch.height/2,vx:400,vy:0});
 engine.celebrate(.04,true);assert.ok(ball.vx<0,'a ball still rebounds off the net back');
 assert.ok(ball.x<=pitch.right+pitch.goalDepth-ball.radius+.01);
 Object.assign(ball,{x:pitch.right-45,y:pitch.goalTop,vx:500,vy:0});
 engine.celebrate(.1,true);assert.ok(ball.vx<0,'the scored ball still collides with the front post');
 const body=fixture(),initialPlayerX=body.player.x;Object.assign(body.ball,{x:body.player.x+65,y:body.player.y,vx:-180});
 body.engine.celebrate(.3,true);
 assert.ok(Math.hypot(body.ball.x-body.player.x,body.ball.y-body.player.y)>=body.ball.radius+body.player.radius-.1,'players remain solid to the ball');
 assert.ok(body.player.x<initialPlayerX,'physical contact transfers momentum before normal idle braking stops the player');
});

test('post-goal kicks preserve the score, credited goal, clock, final stats and learning events',()=>{
 const match=new Match({size:1,team:'red',seed:8,loop:false,duration:20,goldenGoal:false});
 match.state='playing';match.engine.kickoff=null;
 Object.assign(match.engine.ball,{x:match.pitch.right+9,y:match.pitch.height/2,vx:0,vy:0});
 match.update(STEP,idle);assert.equal(match.state,'goal');assert.equal(match.score.red,1);
 const player=match.human;for(const p of match.players)p.human=true;
 Object.assign(player,{x:match.pitch.right+45,y:match.pitch.height/2,vx:0,vy:0});
 Object.assign(match.engine.ball,{x:player.x-28,y:player.y,vx:0,vy:0});
 const saved={score:{...match.score},goalInfo:structuredClone(match.goalInfo),report:structuredClone(match.report()),stats:{...match.stats},remaining:match.remaining};
 match.update(.05,{...idle,aimX:-1,shoot:true});
 assert.ok(match.engine.ball.vx< -300);assert.equal(match.state,'goal');
 assert.deepEqual(match.score,saved.score);assert.deepEqual(match.goalInfo,saved.goalInfo);
 assert.deepEqual(match.report(),saved.report);assert.deepEqual(match.stats,saved.stats);assert.equal(match.remaining,saved.remaining);
 assert.equal(match.events.some(event=>['goal','kick','contact'].includes(event.type)),false,'celebration physics must not enter live learning or stat event streams');
});

test('goal prediction immediately applies a pending human kick without mutating server snapshots',()=>{
 const {pitch,player,engine,ball}=fixture();player.x=pitch.right+45;player.y=pitch.height/2;
 Object.assign(ball,{x:player.x-28,y:player.y,vx:0,vy:0});
 const state=structuredClone({pitch,players:[player],engine:{ball},state:'goal',score:{red:1,blue:0},wait:2,sidesSwapped:false});
 const original=structuredClone(state),prediction=new OnlinePrediction();
 prediction.receive({matchId:'goal',id:player.id,ack:-1,state},1000,100);
 prediction.input(0,{...idle,aimX:-1,shoot:true},950);
 const view=prediction.project(1060);
 assert.ok(view.engine.ball.vx< -300,'post-goal kick prediction should respond to the current input');
 assert.equal(view.state,'goal');assert.deepEqual(view.score,{red:1,blue:0});assert.deepEqual(state,original);
});
