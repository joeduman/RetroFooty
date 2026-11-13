import test from 'node:test';
import assert from 'node:assert/strict';
import {createPitch,STEP,TUNING as C} from '../public/js/config.mjs';
import {Player,PhysicsEngine} from '../public/js/physics.mjs';
import {Match} from '../public/js/match.mjs';
import {Renderer} from '../public/js/renderer.mjs';
import {COURTS,PARK} from '../public/js/park-layout.mjs';
const idle={x:0,y:0,aimX:1,aimY:0,sprint:false,shoot:false};

test('RetroFooty pitches grow from their current dimensions by 5%, 10% and 15%',()=>{
 const prior={1:[1080,660],2:[1230,740],3:[1455,877],4:[1594,974],5:[1744,1049]};
 for(let n=1;n<=5;n++){
  const p=createPitch(n),scale=n===1?1.05:n===2?1.10:1.15;
  assert.equal(p.width,Math.round(prior[n][0]*scale),String(n));
  assert.equal(p.height,Math.round(prior[n][1]*scale),String(n));
  const court=COURTS.find(c=>c.size===n);
  assert.equal(court.w,p.width);assert.equal(court.h,p.height);
  assert.ok(court.x+court.w<PARK.width);assert.ok(court.y+court.h<PARK.height);
 }
});

test('players pass through the side and back of the goal net, but not its posts',()=>{
 const pitch=createPitch(3),p=new Player(1,'red',1,'Runner',true);
 const e=new PhysicsEngine(pitch,[p]);e.ball.x=pitch.width/2;e.ball.y=pitch.height/2;
 p.x=pitch.left-35;p.y=pitch.goalTop-65;p.input={...idle,y:1};
 for(let i=0;i<120;i++)e.step(STEP);
 assert.ok(p.y>pitch.goalTop+p.radius,`side net failed: ${p.y} <= ${pitch.goalTop+p.radius}`);
 p.x=pitch.left-20;p.y=pitch.height/2;p.vx=p.vy=0;p.input={...idle,x:-1};
 for(let i=0;i<120;i++)e.step(STEP);
 assert.ok(p.x<pitch.left-pitch.goalDepth-p.radius,`back net failed: x=${p.x}`);
 // The left front post still stops a body from crossing its solid metal disc.
 p.x=pitch.left+pitch.postRadius+p.radius+2;p.y=pitch.goalTop;p.vx=p.vy=0;p.input={...idle,x:-1};
 for(let i=0;i<50;i++)e.step(STEP);
 const distance=Math.hypot(p.x-pitch.left,p.y-pitch.goalTop);
 assert.ok(distance>=p.radius+pitch.postRadius-.05,`post penetration: ${distance}`);
});

test('ball remains physical after scoring and cannot score again during celebration',()=>{
 const m=new Match({size:3,seed:34,spectator:true,loop:false});m.state='playing';
 m.engine.ball.x=m.pitch.right+C.ballRadius+1;m.engine.ball.y=m.pitch.height/2;
 m.engine.ball.vx=290;m.engine.ball.vy=14;
 m.update(STEP);
 assert.equal(m.state,'goal');assert.equal(m.score.red,1);
 const b={...m.engine.ball},elapsed=m.tracker.elapsed,clock=m.remaining;
 for(let i=0;i<36;i++)m.update(STEP);
 assert.ok(Math.hypot(m.engine.ball.x-b.x,m.engine.ball.y-b.y)>1,'ball must continue to move');
 assert.equal(m.score.red,1,'never repeat scored goal');
 assert.equal(m.tracker.elapsed,elapsed,'celebration not counted as match time');
 assert.equal(m.remaining,clock);
});

test('successful shot line ends at actual goal entrance rather than a net bounce',()=>{
 const m=new Match({size:2,seed:7});const p=m.pitch,player=m.players.find(x=>x.team==='red'),tracker=m.tracker;
 tracker.record({type:'kick',player:player.id,time:1,x:p.right-140,y:p.height/2,vx:390,vy:14});
 const shot=tracker.rows.get(player.id).shotMap.at(-1);
 assert.ok(shot,'registered shot');
 shot.path.push([p.right+3,p.height/2]); // emulate sample beyond line
 tracker.goal('red',1.5,{x:p.right+9,y:p.height/2+4});
 assert.equal(shot.goal,true);
 assert.equal(shot.path.at(-1)[0],p.right);
 assert.ok(shot.path.every(x=>x[0]<=p.right),'no behind-net segment is drawn');
 assert.equal(tracker.activeTrajectory,null);
});

test('goal, countdown and intermission overlays use text without dark rectangles',()=>{
 for(const state of ['goal','kickoff','intermission','practice-ready']){
  const calls=[];
  const fake={ctx:{save(){},restore(){},strokeText(){},fillRect(){calls.push('fillRect');},fillText(){calls.push('fillText');}}};
  const m={state,pitch:createPitch(3),wait:2.3,goalTeam:'red',score:{red:2,blue:1},goalInfo:{scorerName:'Tester'},players:[],training:{meta:{title:'Practice'}},kickoffTeam:'red'};
  Renderer.prototype.overlay.call(fake,m,false);
  assert.deepEqual(calls,['fillText','fillText'],`unexpected popup fill in ${state}`);
 }
});

test('non-goal park locomotion keeps the hidden physics ball inactive',async()=>{
 const {ParkWorld}=await import('../park.mjs');
 const w=new ParkWorld(),c=w.connect('Runner');
 const e=w.walkEngine;
 e.ball.x=300;e.ball.y=1500;
 c.avatar.x=287;c.avatar.y=1500;c.x=287;c.y=1500;
 c.walk={...idle};c.walkAt=w.time;
 const before={x:c.avatar.x,y:c.avatar.y};
 w.tick(STEP);
 assert.deepEqual({x:c.avatar.x,y:c.avatar.y},before);
 assert.equal(e.ball.x,300);assert.equal(e.ball.y,1500);
});
