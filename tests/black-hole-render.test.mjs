import test from 'node:test';
import assert from 'node:assert/strict';
import {Renderer} from '../public/js/renderer.mjs';
import {createPitch} from '../public/js/config.mjs';
import {BLACK_HOLE_TIMING} from '../public/js/goal-effects.mjs';

function fixture({team='red',swapped=false,size=1,effect='black-hole'}={}){
 const calls=[],balls=[];let path=null;
 const context=new Proxy({
  beginPath(){path=null;},arc(x,y,radius){path={x,y,radius};},ellipse(){path=null;},
  fill(){calls.push({type:'fill',color:this.fillStyle,path});},stroke(){calls.push({type:'stroke',color:this.strokeStyle,path});},
  createRadialGradient(){return {addColorStop(){}};}
 },{get:(object,key)=>key in object?object[key]:()=>{}});
 const renderer=new Renderer({getContext:()=>context});renderer.ball=ball=>balls.push({...ball});
 const pitch=createPitch(size),right=(team==='red')!==swapped;
 const match={state:'goal',round:1,score:{red:1,blue:0},goalTeam:team,sidesSwapped:swapped,pitch,goalInfo:{goalEffectId:effect},
  engine:{ball:{x:right?pitch.right+9:pitch.left-9,y:pitch.height/2,radius:8,angle:.4,vx:95,vy:10}}};
 return {renderer,match,calls,balls};
}

test('singularity swallows a frozen visual ball in either goal without changing physics',()=>{
 for(const team of ['red','blue'])for(const swapped of [false,true]){
  const {renderer,match,balls}=fixture({team,swapped});const original=structuredClone(match);
  renderer.drawMatchBall(match,match.engine.ball,0);assert.equal(balls.length,0,'the ordinary ball must not leak through the effect');
  renderer.goalConfetti(match,0);assert.equal(balls.length,1);assert.equal(balls[0].x,match.engine.ball.x);assert.equal(balls[0].radius,8);
  balls.length=0;renderer.goalConfetti(structuredClone(match),450);
  assert.equal(balls.length,1);assert.ok(balls[0].radius>0&&balls[0].radius<8,'the scored ball visibly shrinks into the hole');
  const burst=[...renderer.goalBursts.values()][0];
  assert.ok(Math.hypot(balls[0].x-burst.holeX,balls[0].y-burst.holeY)<Math.hypot(original.engine.ball.x-burst.holeX,original.engine.ball.y-burst.holeY));
  assert.deepEqual(match,original,'rendering must preserve the ball, velocities, score and snapshots');
  balls.length=0;match.engine.ball.x+=200;renderer.drawMatchBall(match,match.engine.ball,1100);renderer.goalConfetti(match,1100);
  assert.equal(balls.length,0,'a ball rolling elsewhere during celebration stays visually swallowed');
 }
});

test('the dark core contracts and disappears, with the swallowed ball hidden until normal play',()=>{
 const {renderer,match,calls,balls}=fixture();renderer.drawMatchBall(match,match.engine.ball,0);
 renderer.goalConfetti(match,1200);
 const radius=calls.find(call=>call.type==='fill'&&call.color==='#02030a').path.radius;
 calls.length=0;renderer.goalConfetti(match,1950);
 const collapsed=calls.find(call=>call.type==='fill'&&call.color==='#02030a').path.radius;
 assert.ok(collapsed>0&&collapsed<radius,'the black core must visibly implode');
 calls.length=balls.length=0;
 renderer.goalConfetti(match,BLACK_HOLE_TIMING.duration*1000+100);renderer.drawMatchBall(match,match.engine.ball,2700);
 assert.equal(calls.length,0);assert.equal(balls.length,0,'the real ball must not reappear after the hole has vanished');
 match.state='ended';renderer.drawMatchBall(match,match.engine.ball,2900);
 assert.equal(balls.length,0,'a final-goal ball stays swallowed during the result screen');
 match.state='playing';renderer.drawMatchBall(match,match.engine.ball,3000);
 assert.equal(balls.length,1);assert.equal(balls[0].x,match.engine.ball.x);assert.equal(renderer.goalBursts.size,0);
});

test('repeated snapshots preserve one swallowing animation and a later goal starts fresh',()=>{
 const {renderer,match,balls}=fixture();renderer.drawMatchBall(match,match.engine.ball,100);
 const burst=[...renderer.goalBursts.values()][0];match.goalInfo.goalEffectId='classic';
 renderer.drawMatchBall(structuredClone(match),match.engine.ball,350);
 assert.equal([...renderer.goalBursts.values()][0],burst);assert.equal(balls.length,0);
 renderer.goalConfetti(match,2600);assert.equal(balls.length,0);
 match.score.red++;match.goalInfo.goalEffectId='black-hole';renderer.drawMatchBall(match,match.engine.ball,3000);
 assert.notEqual([...renderer.goalBursts.values()][0],burst);renderer.goalConfetti(match,3000);
 assert.equal(balls.length,1);assert.equal(balls[0].radius,8);
});

test('other park pitches and reduced-motion viewers keep their ordinary balls',()=>{
 const {renderer,match,balls}=fixture();renderer.drawMatchBall(match,match.engine.ball,0);
 const other=fixture({size:5,effect:'classic'}).match;
 renderer.drawMatchBall(other,other.engine.ball,100);assert.equal(balls.length,1);
 renderer.drawMatchBall(match,match.engine.ball,200);assert.equal(balls.length,1,'another field must not reset the hole');
 renderer.motionQuery={matches:true};renderer.drawMatchBall(match,match.engine.ball,300);
 assert.equal(balls.length,2);const count=balls.length;renderer.goalConfetti(match,400);assert.equal(balls.length,count);
 renderer.motionQuery={matches:false};match.reducedMotion=true;renderer.drawMatchBall(match,match.engine.ball,500);
 assert.equal(balls.length,3);
});
