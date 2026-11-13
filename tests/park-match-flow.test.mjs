import test from 'node:test';import assert from 'node:assert/strict';
import {ParkWorld,normalizeInput} from '../park.mjs';
import {Match} from '../public/js/match.mjs';
import {Player,PhysicsEngine} from '../public/js/physics.mjs';
import {createPitch,STEP,TUNING as C,distance} from '../public/js/config.mjs';
const idle={x:0,y:0,aimX:1,aimY:0,shoot:false,sprint:false};
const advance=(world,seconds)=>{for(let i=0;i<Math.round(seconds/STEP);i++)world.tick(STEP);};
for(const size of [1,2,3,4,5])test(`park ${size}v${size}: bots run, humans replace slots, full roster gets a fresh 5-second start`,()=>{
 const w=new ParkWorld({duration:30,goldenGoal:false}),f=w.fields[size-1];advance(w,3.3);assert.equal(f.game.state,'playing');assert.ok(f.game.tracker.elapsed>0);const untouched=w.fields.find(g=>g!==f),otherId=untouched.matchId;
 for(let i=0;i<size*2;i++){
  const c=w.connect('Human'+i),prior=f.matchId;assert.equal(w.join(c,size,i<size?'red':'blue'),null);assert.equal(f.game.players.filter(p=>p.human).length,i+1);
  if(i<size*2-1){assert.equal(f.phase,'warmup');assert.equal(f.matchId,prior);}else assert.notEqual(f.matchId,prior);
 }
 assert.equal(f.phase,'match');assert.equal(f.game.state,'kickoff');assert.equal(f.game.wait,5);assert.deepEqual(f.game.score,{red:0,blue:0});assert.equal(f.game.tracker.elapsed,0);assert.equal(untouched.matchId,otherId);
 const starts=f.game.players.map(p=>({x:p.x,y:p.y}));advance(w,4.9);assert.equal(f.game.state,'kickoff');assert.deepEqual(f.game.players.map(p=>({x:p.x,y:p.y})),starts);advance(w,.1);assert.equal(f.game.state,'playing');
 const extra=w.connect('Extra');assert.match(w.join(extra,size,'red'),/full/);assert.equal(extra.field,null);
});
test('park countdown continues after departure, with temporary bot replacement',()=>{
 const w=new ParkWorld(),a=w.connect('A'),b=w.connect('B');w.join(a,1,'red');w.join(b,1,'blue');const f=w.fields[0],match=f.matchId;advance(w,1);
 const remaining=f.game.wait;w.leave(b);assert.equal(f.phase,'match');assert.equal(f.matchId,match);assert.equal(f.game.wait,remaining);assert.equal(f.game.players.filter(p=>p.human).length,1);
 w.join(b,1,'blue');assert.equal(f.matchId,match);advance(w,4.1);f.game.score.red=2;w.disconnect(b);assert.equal(f.matchId,match);assert.equal(f.game.score.red,2);
 const substitute=w.connect('Sub');w.join(substitute,1,'blue');assert.equal(f.matchId,match);assert.equal(f.game.players.find(p=>p.id===substitute.slot).name,'Sub');
 w.leave(a);w.leave(substitute);assert.equal(f.matchId,match);assert.equal(f.game.players.filter(p=>p.human).length,0);
});
test('park full time retains report then restarts independently; returning allows another field',()=>{
 const w=new ParkWorld({duration:.2,goldenGoal:false}),a=w.connect('A'),b=w.connect('B');w.join(a,1,'red');w.join(b,1,'blue');advance(w,5.3);
 const f=w.fields[0],id=f.matchId;assert.equal(f.game.state,'ended');const report=w.report(a);assert.equal(report.ended,true);assert.ok(report.report.elapsed>=.2-1e-8);
 advance(w,7.7);assert.equal(f.matchId,id);advance(w,.4);assert.notEqual(f.matchId,id);assert.equal(f.game.state,'kickoff');assert.equal(f.phase,'match');
 assert.match(w.join(a,2,'red'),/Return/);w.leave(a);assert.equal(w.join(a,2,'blue'),null);assert.equal(w.fields[1].members[0],a);assert.equal(w.fields[0].members.length,1);
});
test('park walking times out, stays bounded, and malicious input is rejected',()=>{
 const w=new ParkWorld(),c=w.connect('<test>');const x=c.x;c.walk={x:1,y:0};c.walkAt=w.time;advance(w,1);assert.ok(c.x>x&&c.x<x+80);const stopped=c.x;advance(w,.5);assert.equal(c.x,stopped);
 for(const bad of [null,{}, {x:Infinity,y:0,aimX:1,aimY:0},{x:1e300,y:0,aimX:1,aimY:0},{x:0,y:NaN,aimX:1,aimY:0}])assert.equal(normalizeInput(bad),null);
 const i=normalizeInput({...idle,x:100,y:100});assert.ok(Math.hypot(i.x,i.y)<=1+1e-12);
 w.join(c,5,'red');const before=c.x;c.walk={x:1,y:0};c.walkAt=w.time;advance(w,.1);assert.equal(c.x,before);
});
test('contact position dominates kick angle, mouse only makes a small correction',()=>{
 for(const normalAngle of [-60,-30,0,30,60]){
  const p=new Player(1,'red',1,'Human',true);p.x=400;p.y=350;p.input={...idle,shoot:true};const e=new PhysicsEngine(createPitch(2),[p]),b=e.ball,a=normalAngle*Math.PI/180;b.x=p.x+28*Math.cos(a);b.y=p.y+28*Math.sin(a);
  assert.equal(e.shoot(p),true);const actual=Math.atan2(b.vy,b.vx)*180/Math.PI;assert.ok(Math.abs(actual-normalAngle)<8);if(Math.abs(normalAngle)>=30)assert.ok(Math.abs(actual)>20);
  assert.ok(Math.hypot(b.vx,b.vy)<=411);assert.equal(b.x,p.x+28*Math.cos(a));
 }
});
test('passive receivers soften rebounds and kick speeds are moderately reduced',()=>{
 const speeds=[];
 for(const shoot of [false,true]){const p=new Player(1,'red',1,'Receiver',true);p.x=600;p.y=350;p.input={...idle,shoot};const e=new PhysicsEngine(createPitch(2),[p]),b=e.ball;b.x=575;b.y=350;b.vx=600;e.discs(p,b);speeds.push(Math.abs(b.vx));assert.ok(b.vx<0);}
 assert.ok(speeds[0]<speeds[1]*.4);assert.ok(C.shotSpeed<480&&C.shotSpeed>=400);assert.ok(C.ballMaxSpeed<760);
});
test('current pitches preserve usable runoff on every side',()=>{
 for(let i=0;i<5;i++){const p=createPitch(i+1);assert.ok(p.runoff>=60);
  const player=new Player(1,'red',1,'Runner',true);player.x=p.left+20;player.y=p.top+150;player.input={...idle,x:-1};const e=new PhysicsEngine(p,[player]);for(let k=0;k<120;k++)e.step(STEP);assert.ok(player.x<p.left-20);assert.ok(player.x>=p.left-p.runoff+player.radius-.01);
 }
});
test('a player can get behind an edge ball and kick it back into the pitch',()=>{
 const pitch=createPitch(2),p=new Player(1,'red',1,'Runner',true);p.x=500;p.y=pitch.top-20;p.input={...idle,aimX:0,aimY:1,shoot:true};const e=new PhysicsEngine(pitch,[p]);e.ball.x=500;e.ball.y=pitch.top+8;
 e.step(STEP);assert.ok(e.ball.vy>350);assert.ok(p.y<pitch.top);assert.ok(e.ball.y>=pitch.top+e.ball.radius);
});
test('goal celebration keeps humans and bots moving, freezes ball and stats, then protects kickoff',()=>{
 const m=new Match({size:2,team:'red',seed:8});m.state='playing';m.engine.ball.x=m.pitch.right+9;m.engine.ball.y=m.pitch.height/2;m.update(STEP,idle);assert.equal(m.state,'goal');
 const ball={...m.engine.ball},positions=m.players.map(p=>({x:p.x,y:p.y})),elapsed=m.tracker.elapsed,clock=m.remaining,score={...m.score};
 for(let i=0;i<120;i++)m.update(STEP,{...idle,y:-1,sprint:true,shoot:true});
 assert.ok(distance(m.human,positions[0])>80);assert.ok(m.players.filter(p=>!p.human).some(p=>distance(p,positions[p.id-1])>10));assert.deepEqual({...m.engine.ball},ball);assert.equal(m.tracker.elapsed,elapsed);assert.equal(m.remaining,clock);assert.deepEqual(m.score,score);
 for(let i=0;i<Math.round((C.celebrationSeconds-1)/STEP);i++)m.update(STEP,idle);assert.equal(m.state,'kickoff');assert.equal(m.wait,3);
 const spawn={x:m.human.x,y:m.human.y};m.update(.5,{...idle,x:1});assert.equal(distance(m.human,spawn),0);
});
