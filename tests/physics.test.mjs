import test from 'node:test';
import assert from 'node:assert/strict';
import {Player,PhysicsEngine} from '../public/js/physics.mjs';
import {Match} from '../public/js/match.mjs';
import {TUNING as C,createPitch,STEP} from '../public/js/config.mjs';
function setup(){const p=new Player(1,'red',1,'Sam',true);p.x=350;p.y=350;const engine=new PhysicsEngine(createPitch(4),[p]);engine.ball.x=380;engine.ball.y=350;return {p,e:engine,b:engine.ball};}
function advance(e,seconds){for(let n=0;n<Math.round(seconds/STEP);n++)e.step(STEP);}

test('shooting keeps the ball at its real contact position',()=>{
 const {p,e,b}=setup();const original={x:b.x,y:b.y};p.input.aimX=.8;p.input.aimY=.6;
 assert.equal(e.shoot(p),true);assert.equal(b.x,original.x);assert.equal(b.y,original.y);assert.ok(b.vx>250&&b.vy>0);
});
test('a shot cannot pull a ball through the back of the player',()=>{
 const {p,e,b}=setup();b.x=p.x-30;assert.equal(e.shoot(p),false);assert.equal(b.vx,0);assert.equal(b.x,p.x-30);
});
test('holding shoot before contact kicks an arriving ball without another press',()=>{
 const {p,e,b}=setup();b.x=p.x+130;b.vx=-180;p.input.shoot=true;let kicks=0;
 for(let n=0;n<120;n++){e.step(STEP);kicks+=e.events.filter(e=>e.type==='kick').length;}
 assert.equal(kicks,1);assert.ok(b.vx>200);assert.equal(p.input.shoot,true);
});
test('holding shoot never charges power and respects the same cooldown',()=>{
 const a=setup(),b=setup();b.b.x=800;b.p.input.shoot=true;advance(b.e,1);
 b.b.x=b.p.x+30;b.b.y=b.p.y;a.p.input.shoot=true;
 a.e.step(STEP);b.e.step(STEP);assert.ok(Math.abs(a.b.vx-b.b.vx)<1e-8);
 b.b.x=b.p.x+30;b.b.vx=0;b.b.vy=0;b.e.step(STEP);
 assert.equal(b.e.events.filter(e=>e.type==='kick').length,0);
 b.b.x=800;advance(b.e,C.shotCooldown);b.b.x=b.p.x+30;b.b.y=b.p.y;b.b.vx=b.b.vy=0;b.e.step(STEP);
 assert.equal(b.e.events.filter(e=>e.type==='kick').length,1);
});
test('shoot power follows approach momentum, not the sprint flag alone',()=>{
 const speeds=[];for(const v of [0,C.walkSpeed,C.sprintSpeed]){const {p,e,b}=setup();p.vx=v;p.input.sprint=true;e.shoot(p);speeds.push(Math.hypot(b.vx,b.vy));}
 assert.ok(speeds[0]<speeds[1]&&speeds[1]<speeds[2]);assert.ok(speeds[2]>speeds[0]*1.4);
 const {p,e,b}=setup();e.shoot(p);assert.equal(b.vx,speeds[0]);
});
test('light touches are softer than running and sprinting impacts',()=>{
 const speeds=[];for(const [amount,sprint] of [[.1,false],[1,false],[1,true]]){
  const {p,e,b}=setup();p.x=280;p.input.x=amount;p.input.sprint=sprint;let max=0;
  for(let n=0;n<900;n++){e.step(STEP);max=Math.max(max,Math.hypot(b.vx,b.vy));if(b.x>420)break;}speeds.push(max);
 }
 assert.ok(speeds[0]<speeds[1]*.35,JSON.stringify(speeds));assert.ok(speeds[2]>speeds[1]*1.4,JSON.stringify(speeds));
});
test('sprint is substantially faster and drains in roughly 2.4 seconds',()=>{
 const {p,e}=setup();e.ball.x=1000;e.ball.y=150;p.input.x=1;advance(e,.4);assert.ok(Math.abs(p.vx-C.walkSpeed)<1);
 p.input.sprint=true;advance(e,.3);assert.ok(p.vx>C.walkSpeed*1.7);advance(e,2.2);assert.equal(p.stamina,0);assert.equal(p.exhausted,true);
 p.input.sprint=false;advance(e,1.5);assert.ok(p.stamina>20);p.input.sprint=true;advance(e,.1);assert.equal(p.sprinting,true);
});
test('a fast ball rebounds from a player instead of crossing through them',()=>{
 const {p,e,b}=setup();p.x=600;b.x=450;b.vx=720;let crossed=false,bounced=false;
 for(let n=0;n<50;n++){e.step(STEP);if(b.x>p.x+p.radius)crossed=true;if(b.vx<0)bounced=true;}
 assert.equal(crossed,false);assert.equal(bounced,true);
});
test('wall rebound changes the normal direction and loses energy',()=>{
 const {e,b}=setup();e.players=[];b.x=500;b.y=e.pitch.top+b.radius+1;b.vx=200;b.vy=-400;
 e.step(STEP);assert.ok(b.vy>0);assert.ok(b.vx>190);assert.ok(Math.hypot(b.vx,b.vy)<Math.hypot(200,400));
});
test('spin curves free flight without generating extra speed',()=>{
 const {e,b}=setup();e.players=[];b.x=350;b.y=400;b.vx=420;b.spin=4;advance(e,.5);
 assert.ok(b.y>400);assert.ok(Math.hypot(b.vx,b.vy)<420);assert.ok(b.spin<4);
});
test('a goal requires the whole ball to cross inside the mouth',()=>{
 const {e,b}=setup();e.players=[];b.x=e.pitch.right+4;b.y=e.pitch.height/2;b.vx=0;assert.equal(e.step(STEP),null);
 b.x=e.pitch.right+b.radius+1;assert.equal(e.step(STEP),'red');
 b.x=e.pitch.left-b.radius-1;assert.equal(e.step(STEP),'blue');
});
test('the solid post deflects a shot instead of counting a goal',()=>{
 const {e,b}=setup();e.players=[];b.x=e.pitch.right-50;b.y=e.pitch.goalTop;b.vx=600;
 let goal=null;for(let i=0;i<25;i++)goal=e.step(STEP)||goal;assert.equal(goal,null);assert.ok(b.vx<0);
});
test('the same simulation at 30 and 120 calls per second agrees',()=>{
 const a=setup(),b=setup();for(const s of [a,b]){s.p.input={x:.8,y:.6,sprint:true,shoot:false,aimX:1,aimY:0};s.b.x=900;s.b.vx=-450;s.b.vy=60;s.b.spin=2;}
 for(let i=0;i<60;i++)a.e.step(1/30);for(let i=0;i<240;i++)b.e.step(1/120);
 for(const key of ['x','y','vx','vy'])assert.ok(Math.abs(a.b[key]-b.b[key])<1e-6,key);
});
test('five opposing bodies do not launch the ball through a corner',()=>{
 const pitch=createPitch(5),players=[];for(let i=0;i<5;i++){const p=new Player(i+1,i%2?'red':'blue',i+1,'Bot');p.x=pitch.left+32+i*40;p.y=pitch.top+30+i*15;p.input={x:-1,y:-1,aimX:-1,aimY:-1,sprint:true,shoot:false};players.push(p);}
 const e=new PhysicsEngine(pitch,players);e.ball.x=pitch.left+9;e.ball.y=pitch.top+9;
 for(let i=0;i<1200;i++){const before={x:e.ball.x,y:e.ball.y};e.step(STEP);assert.ok(e.ball.x>=pitch.left+C.ballRadius-.2);assert.ok(e.ball.y>=pitch.top+C.ballRadius-.2);assert.ok(Math.hypot(e.ball.x-before.x,e.ball.y-before.y)<9);for(const body of [...players,e.ball])assert.ok(Number.isFinite(body.x+body.y+body.vx+body.vy));}
});
test('all team sizes contain the selected name and exactly one human',()=>{
 for(let size=1;size<=5;size++){const m=new Match({size,name:'Sam',team:'blue'});assert.equal(m.players.length,size*2);assert.equal(m.players.filter(p=>p.human).length,1);assert.equal(m.human.name,'Sam');assert.equal(m.human.team,'blue');assert.equal(m.players.filter(p=>p.team==='red').length,size);}
});
test('the cover player moves toward midfield when the ball advances',()=>{
 const m=new Match({size:4,spectator:true,seed:42});m.engine.ball.x=m.pitch.right-100;m.engine.ball.y=m.pitch.height/2;m.engine.ball.lastTeam='red';m.ai.planTeams();
 const plan=m.ai.plans.red,target=m.ai.cover(plan.cover,plan);assert.ok(target.x>m.pitch.width*.35);assert.ok(target.x<m.pitch.left+(m.pitch.right-m.pitch.left)*.56);
 m.engine.ball.x=m.pitch.left+350;m.engine.ball.vx=-500;m.ai.planTeams();const defending=m.ai.cover(m.ai.plans.red.cover,m.ai.plans.red);assert.ok(defending.x<m.pitch.left+65);
});
test('bots recover a deliberately pinned corner without moving the ball artificially',()=>{
 for(const side of ['topLeft','bottomRight']){
  const m=new Match({size:2,spectator:true,seed:42,duration:20,loop:false});m.state='playing';const p=m.pitch,b=m.engine.ball;
  b.x=side==='topLeft'?p.left+9:p.right-9;b.y=side==='topLeft'?p.top+9:p.bottom-9;
  const start={x:b.x,y:b.y};let escaped=false;
  for(let n=0;n<1200;n++){m.update(STEP);if(Math.hypot(b.x-start.x,b.y-start.y)>100){escaped=true;break;}}
  assert.ok(escaped,side);
 }
});
test('short rounds end and spectator series reset cleanly',()=>{
 const m=new Match({spectator:true,size:1,duration:.2,loop:true,goldenGoal:false});for(let i=0;i<900;i++)m.update(STEP);
 assert.ok(m.round>=2);assert.ok(m.remaining>=0&&m.remaining<=.2);assert.ok(m.players.every(p=>Number.isFinite(p.x)));
});

test('sprinting reverses fully within 150 ms and stops within 75 ms',()=>{
 const {p,e,b}=setup();b.x=1100;b.y=100;p.vx=C.sprintSpeed;p.input.x=-1;p.input.sprint=true;
 advance(e,.15);assert.ok(p.vx<-C.sprintSpeed+1);p.input.x=0;advance(e,.075);assert.equal(p.vx,0);
});
test('human and bot stamina match on every tick, including the recovery delay',()=>{
 const human=setup(),bot=setup();bot.p.human=false;
 for(let n=0;n<960;n++){
  const sprint=n<240||(n>=660&&n<750);
  for(const s of [human,bot]){s.p.input.x=1;s.p.input.sprint=sprint;s.e.motor(s.p,STEP);}
  for(const key of ['stamina','recovery','sprinting','exhausted'])assert.equal(human.p[key],bot.p[key],key+' tick '+n);
  if(n===239)assert.ok(Math.abs(human.p.stamina-16)<1e-6);
  if(n===287)assert.ok(Math.abs(human.p.stamina-16)<1e-6,'no recovery before 0.45 seconds');
  if(n===300)assert.ok(human.p.stamina>16,'recovery begins after delay');
 }
});
test('all modes have more room, slimmer players and the same ball size',()=>{
 const oldSizes=[[860,520],[1020,620],[1140,700],[1200,750],[1320,790]];
 for(let size=1;size<=5;size++){const m=new Match({size});assert.ok(m.pitch.width>oldSizes[size-1][0]);assert.ok(m.pitch.height>oldSizes[size-1][1]);assert.equal(m.human.radius,18);assert.equal(m.engine.ball.radius,8);}
});
test('both sides start the same distance from the ball and attack opposite goals',()=>{
 const m=new Match({size:5,team:'blue',seed:123});const red=m.players.find(p=>p.team==='red'),blue=m.human,b=m.engine.ball;
 assert.ok(blue.x>b.x&&red.x<b.x);assert.equal(blue.faceX,-1);assert.equal(red.faceX,1);
 assert.ok(Math.abs(Math.hypot(red.x-b.x,red.y-b.y)-Math.hypot(blue.x-b.x,blue.y-b.y))<1e-8);
});
test('the three-second kickoff freezes players, ball, stamina and match clock',()=>{
 const m=new Match({size:5,team:'blue',seed:42}),start=m.players.map(p=>[p.x,p.y,p.stamina]);
 const input={x:-1,y:0,sprint:true,shoot:true,aimX:-1,aimY:0},seen=new Set();
 for(let n=0;n<359;n++){seen.add(Math.ceil(m.wait-1e-9));m.update(STEP,input);assert.equal(m.state,'kickoff');assert.deepEqual(m.players.map(p=>[p.x,p.y,p.stamina]),start);assert.equal(m.remaining,m.duration);assert.equal(m.engine.ball.vx,0);assert.equal(m.stats.shots,0);}
 assert.deepEqual([...seen],[3,2,1]);m.update(STEP,input);assert.equal(m.state,'playing');assert.equal(m.stats.goals,0);
});
test('a scored goal always starts a fresh three-second protected kickoff',()=>{
 const m=new Match({size:2,seed:9});m.state='playing';m.engine.ball.x=m.pitch.right+C.ballRadius+1;
 m.update(STEP);assert.equal(m.state,'goal');assert.equal(m.score.red,1);
 for(let n=0;n<Math.round(C.celebrationSeconds/STEP);n++)m.update(STEP);assert.equal(m.state,'kickoff');assert.equal(m.wait,3);
 const clock=m.remaining;
 for(let n=0;n<359;n++)m.update(STEP,{x:1,y:0,shoot:true,sprint:true,aimX:1,aimY:0});
 assert.equal(m.state,'kickoff');assert.equal(m.remaining,clock);assert.equal(m.score.red,1);assert.equal(m.stats.shots,0);
 m.update(STEP);assert.equal(m.state,'playing');
});
test('an attacker with a clear close-range goal chooses a finish over a sideways pass',()=>{
 const m=new Match({size:3,spectator:true,seed:7}),b=m.engine.ball,p=m.pitch;
 b.x=p.right-180;b.y=p.height/2;b.lastTeam='red';
 const reds=m.players.filter(q=>q.team==='red'),blues=m.players.filter(q=>q.team==='blue');
 reds[0].x=b.x-30;reds[0].y=b.y;reds[1].x=b.x-50;reds[1].y=b.y-180;reds[2].x=b.x-100;reds[2].y=b.y+180;
 blues.forEach((q,i)=>{q.x=p.left+100+i*50;q.y=p.top+100;});m.ai.planTeams();
 assert.equal(m.ai.chooseAim(reds[0],m.ai.memory.get(reds[0].id)).type,'shot');
});
test('an attacker passes around a blocked shooting lane to an open teammate',()=>{
 const m=new Match({size:3,spectator:true,seed:7}),b=m.engine.ball,p=m.pitch;
 b.x=p.width/2;b.y=p.height/2;b.lastTeam='red';
 const reds=m.players.filter(q=>q.team==='red'),blues=m.players.filter(q=>q.team==='blue');
 reds[0].x=b.x-30;reds[0].y=b.y;reds[1].x=b.x+100;reds[1].y=b.y-200;reds[2].x=b.x-200;reds[2].y=b.y+140;
 blues.forEach((q,i)=>{q.x=b.x+90;q.y=b.y+(i-1)*25;});m.ai.planTeams();
 const aim=m.ai.chooseAim(reds[0],m.ai.memory.get(reds[0].id));assert.equal(aim.type,'pass');assert.equal(aim.receiver,reds[1].id);
});
