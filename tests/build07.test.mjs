import test from 'node:test';
import assert from 'node:assert/strict';
import {Match} from '../public/js/match.mjs';
import {MatchStats} from '../public/js/stats.mjs';
import {Player,PhysicsEngine} from '../public/js/physics.mjs';
import {STEP,createPitch,MATCH_SECONDS,TUNING as C} from '../public/js/config.mjs';
const advance=(m,seconds,input)=>{for(let i=0;i<Math.round(seconds/STEP);i++)m.update(STEP,input);};
const idle={x:0,y:0,aimX:1,aimY:0,shoot:false,sprint:false};
const sprint={...idle,x:1,sprint:true};
function fixture(){const pitch=createPitch(2),players=[new Player(1,'red',1,'A'),new Player(2,'red',2,'B'),new Player(3,'blue',1,'C')];return {pitch,players,s:new MatchStats(players,pitch)};}
function kick(id,time,x,y,vx=450,vy=0){return {type:'kick',player:id,time,x,y,vx,vy};}

test('match lengths, pitches and goals grow with team size',()=>{
 assert.deepEqual(Object.values(MATCH_SECONDS),[180,240,300,360,480]);
 let previous=null;for(let size=1;size<=5;size++){const m=new Match({size});assert.equal(m.duration,MATCH_SECONDS[size]);if(previous){assert.ok(m.pitch.width>previous.width);assert.ok(m.pitch.height>previous.height);assert.ok(m.pitch.goalWidth>previous.goalWidth);}previous=m.pitch;}
});
test('a tie enters protected golden goal and the next goal ends the match',()=>{
 const m=new Match({duration:STEP,size:1,loop:false,seed:22});m.state='playing';m.update(STEP,idle);
 assert.equal(m.overtime,true);assert.equal(m.state,'kickoff');assert.equal(m.wait,3);advance(m,3,idle);assert.equal(m.state,'playing');
 m.engine.ball.x=m.pitch.right+C.ballRadius+1;m.engine.ball.y=m.pitch.height/2;m.engine.ball.vx=m.engine.ball.vy=0;
 m.update(STEP,idle);assert.equal(m.score.red,1);assert.equal(m.state,'goal');advance(m,C.celebrationSeconds,idle);assert.equal(m.state,'ended');
});
test('golden goal can be disabled and regulation winners finish normally',()=>{
 const draw=new Match({duration:STEP,goldenGoal:false});draw.state='playing';draw.update(STEP,idle);assert.equal(draw.state,'ended');assert.equal(draw.overtime,false);
 const win=new Match({duration:STEP});win.state='playing';win.score.blue=1;win.update(STEP,idle);assert.equal(win.state,'ended');assert.equal(win.overtime,false);
});
test('practice drills use the selected side and pitch independently of regulation time',()=>{
 for(const drill of ['free','wall','corner','shield','sparring']){
  const m=new Match({size:5,team:'blue',practice:true,drill,duration:STEP,seed:8});assert.equal(m.human.team,'blue');assert.equal(m.pitch.width,createPitch(5).width);assert.equal(m.state,drill==='free'?'playing':'practice-ready');assert.equal(m.players.length,['corner','shield','sparring'].includes(drill)?2:1);
  advance(m,drill==='free'?.3:3.3,idle);assert.equal(m.remaining,STEP);assert.ok(m.training.elapsed>0);
  if(drill==='shield'){const dummy=m.players.find(p=>!p.human);assert.ok(Math.hypot(dummy.vx,dummy.vy)>0);}
 }
});
test('unlimited stamina is opt-in for practice only',()=>{
 const training=new Match({practice:true,unlimitedStamina:true});advance(training,1,sprint);assert.equal(training.human.stamina,100);
 const normal=new Match({unlimitedStamina:true});normal.state='playing';advance(normal,1,sprint);assert.equal(normal.unlimitedStamina,false);assert.ok(normal.human.stamina<60);
});
test('resetting a drill does not count the respawn as movement or heatmap time',()=>{
 const m=new Match({practice:true});advance(m,.4,sprint);const before=m.report();m.resetPractice();const after=m.report();
 assert.equal(after.elapsed,before.elapsed);assert.equal(after.players[0].distance,before.players[0].distance);assert.deepEqual(after.players[0].heat,before.players[0].heat);
 m.update(STEP,idle);assert.equal(m.report().players[0].distance,before.players[0].distance);
});
test('sprint can start while an opposing player is blocking the path',()=>{
 const a=new Player(1,'red',1,'A',true),b=new Player(2,'blue',1,'B');a.x=400;b.x=436;a.y=b.y=300;a.input={...sprint};b.input={...idle,x:-1};
 const e=new PhysicsEngine(createPitch(4),[a,b]);e.ball.x=1000;e.ball.y=700;for(let i=0;i<36;i++)e.step(STEP);
 assert.ok(b.x>446,`blocker x=${b.x}`);assert.ok(a.sprinting);assert.ok(a.stamina<100);
});
test('a glancing body contact transfers rolling spin while reducing kinetic energy',()=>{
 const p=new Player(1,'red',1,'A');p.x=400;p.y=300;const e=new PhysicsEngine(createPitch(4),[p]),b=e.ball;
 b.x=p.x+p.radius+b.radius-.1;b.y=p.y;b.vx=-200;b.vy=150;
 const energy=()=>.5*C.playerMass*(p.vx*p.vx+p.vy*p.vy)+.5*C.ballMass*(b.vx*b.vx+b.vy*b.vy)+.25*C.ballMass*b.radius*b.radius*b.rollSpin*b.rollSpin;
 const before=energy();e.discs(p,b);assert.ok(Math.abs(b.rollSpin)>.5);assert.ok(energy()<before);assert.ok(Math.abs((b.vy-p.vy)-b.rollSpin*b.radius)<150);
});
test('an emergency defender spends available stamina below the normal reserve',()=>{
 const m=new Match({size:3,spectator:true,seed:7}),p=m.pitch,b=m.engine.ball;m.engine.kickoff=null;b.x=p.left+240;b.y=p.height/2;b.vx=-400;
 m.ai.planTeams();const defender=m.ai.plans.red.cover;assert.ok(defender);defender.x=p.left+150;defender.y=p.height/2+100;defender.stamina=25;defender.exhausted=false;
 m.ai.memory.get(defender.id).sprint=false;m.ai.nextPlan=Infinity;m.ai.update();assert.equal(defender.input.sprint,true);assert.equal(defender.stamina,25);
});
test('completed passes, assists and on-target shots follow actual touches',()=>{
 const {s,pitch:p}=fixture();s.record(kick(1,1,p.right-400,p.height/2));s.record({type:'contact',player:2,time:2});s.record(kick(2,2.1,p.right-200,p.height/2));s.goal('red',2.6);
 const a=s.rows.get(1),b=s.rows.get(2);assert.equal(a.passes,1);assert.equal(a.assists,1);assert.equal(b.goals,1);assert.equal(b.shots,1);assert.equal(b.onTarget,1);
});
test('interceptions cancel an attempted pass and the original assist',()=>{
 const {s,pitch:p}=fixture();s.record(kick(1,1,p.right-400,p.height/2));s.record({type:'contact',player:3,time:1.5});s.record({type:'contact',player:2,time:2});s.goal('red',2.3);
 assert.equal(s.rows.get(1).passes,0);assert.equal(s.rows.get(1).assists,0);assert.equal(s.rows.get(3).interceptions,1);
});
test('wide, backward and unreachable kicks are not counted as on target',()=>{
 const {s,pitch:p}=fixture();s.record(kick(1,1,p.right-200,p.top+30,400,0));s.record(kick(1,2,p.right-200,p.height/2,-400,0));s.record(kick(1,3,p.left+30,p.height/2,50,0));
 assert.equal(s.rows.get(1).onTarget,0);assert.equal(s.rows.get(1).shots,0);assert.equal(s.rows.get(1).kicks,3);
});
test('an opponent kick clears stale shot attribution before an own goal',()=>{
 const {s,pitch:p}=fixture();s.record(kick(1,1,p.right-300,p.height/2));s.record({type:'contact',player:3,time:1.5});s.record(kick(3,1.6,p.right-100,p.height/2));s.goal('red',1.9);
 assert.equal(s.rows.get(1).goals,0);assert.equal(s.rows.get(3).ownGoals,1);
});
test('heatmaps contain live time only and reports are independent copies',()=>{
 const m=new Match({size:2,seed:3});advance(m,2,idle);assert.equal(m.report().elapsed,0);assert.ok(m.report().players.every(p=>p.heat.every(v=>v===0)));
 advance(m,2,idle);const report=m.report();for(const row of report.players)assert.ok(Math.abs(row.heat.reduce((a,b)=>a+b,0)-report.elapsed)<1e-8);
 report.players[0].heat[0]=10000;report.players[0].goals=999;assert.notEqual(m.report().players[0].heat[0],10000);assert.notEqual(m.report().players[0].goals,999);
});
