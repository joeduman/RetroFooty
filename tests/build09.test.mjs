import test from 'node:test';import assert from 'node:assert/strict';
import {Match} from '../public/js/match.mjs';import {STEP,distance} from '../public/js/config.mjs';
import {ReplayRecorder,replayFrame} from '../public/js/replay.mjs';
const idle={x:0,y:0,sprint:false,shoot:false,aimX:1,aimY:0};
test('every timed drill freezes movement, touches, stamina and timer during a three-second start',()=>{
 for(const drill of ['dribble','wall','corner','shield','sparring']){
  const m=new Match({practice:true,drill}),positions=m.players.map(p=>({x:p.x,y:p.y}));assert.equal(m.state,'practice-ready');
  for(let i=0;i<359;i++)m.update(STEP,{...idle,x:1,sprint:true,shoot:true});
  assert.equal(m.state,'practice-ready');assert.equal(m.training.elapsed,0);assert.equal(m.tracker.elapsed,0);assert.equal(m.stats.shots,0);
  for(let i=0;i<m.players.length;i++){assert.equal(distance(m.players[i],positions[i]),0);assert.equal(m.players[i].stamina,100);}
  m.update(STEP,idle);assert.equal(m.state,'playing');
 }
});
test('corner and finishing attempts reset into another protected countdown',()=>{
 for(const drill of ['corner','sparring']){const m=new Match({practice:true,drill});m.state='playing';m.training.elapsed=10;m.training.nextAttempt('Next');assert.equal(m.state,'practice-ready');assert.equal(m.wait,3);assert.equal(m.training.elapsed,10);m.update(1,idle);assert.equal(m.training.elapsed,10);}
});
test('cones obstruct both players and ball without changing normal-match geometry',()=>{
 const m=new Match({practice:true,drill:'dribble'}),cone=m.engine.obstacles[0];assert.equal(m.engine.obstacles.length,4);const b=m.engine.ball;b.x=cone.x-5;b.y=cone.y;b.vx=100;m.engine.step(STEP);assert.ok(distance(b,cone)>=b.radius+cone.radius-.01);assert.ok(b.vx<0);assert.equal(new Match().engine.obstacles.length,0);
});
test('a shot through a dribble gate cannot count as a carried touch',()=>{
 const m=new Match({practice:true,drill:'dribble'}),b=m.engine.ball,h=m.human,t=m.training;b.x=t.target.x;b.y=t.target.y;h.x=b.x-27;h.y=b.y;b.lastPlayer=h.id;
 t.update(STEP,[{type:'kick',player:h.id}],null);assert.equal(t.score,0);t.update(.6,[],null);assert.equal(t.score,1);
});
test('close opponent possession no longer disables a bot sprint challenge',()=>{
 const m=new Match({size:1,team:'red',seed:6}),h=m.human,bot=m.players.find(p=>!p.human),b=m.engine.ball;
 m.engine.kickoff=null;
 h.x=550;h.y=350;b.x=577;b.y=350;b.lastTeam='red';b.lastPlayer=h.id;bot.x=660;bot.y=350;
 m.ai.update();assert.equal(bot.input.sprint,true);assert.ok(Math.hypot(bot.input.x,bot.input.y)>.9);
});
test('shielding challenger can boost while the human is standing still',()=>{
 const m=new Match({practice:true,drill:'shield'});m.training.elapsed=.1;m.training.defenderInput();assert.equal(m.players.find(p=>!p.human).input.sprint,true);
});
test('replays preserve frame endpoints, stats and early-exit status without rerunning physics',()=>{
 const m=new Match({size:2,team:'blue',seed:9}),r=new ReplayRecorder(m,{id:'test-game',startedAt:123});
 for(let i=0;i<600;i++){m.update(STEP,{...idle,x:-1});r.step(STEP);}
 const saved=r.finish('ended early');assert.equal(saved.summary.status,'ended early');assert.equal(saved.summary.report.players.length,4);assert.ok(saved.summary.elapsed>1.9);assert.ok(saved.replay.count>95);
 const first=replayFrame(saved.replay,0),last=replayFrame(saved.replay,saved.replay.duration);assert.equal(first.state,'kickoff');assert.equal(last.state,m.state);assert.ok(distance(last.players.find(p=>p.human),m.human)<.001);
 const frozen=saved.summary.score.red;m.score.red=99;assert.equal(saved.summary.score.red,frozen);
});
test('replay sampling interpolates motion but never blends across a respawn',()=>{
 const m=new Match({practice:true,drill:'free'}),r=new ReplayRecorder(m,{id:'sample'});m.human.x+=10;r.time=1;r.capture();
 let saved=r.snapshot(),middle=replayFrame(saved.replay,.5);assert.ok(Math.abs(middle.human.x-(m.human.x-5))<.001);
 m.human.x+=400;r.time=2;r.capture();saved=r.snapshot();middle=replayFrame(saved.replay,1.5);assert.ok(Math.abs(middle.human.x-(m.human.x-400))<.001);
});
test('practice replays retain countdowns, targets and cones',()=>{
 const m=new Match({practice:true,drill:'dribble'}),r=new ReplayRecorder(m,{id:'drill'}),saved=r.snapshot(),frame=replayFrame(saved.replay,0);
 assert.equal(frame.state,'practice-ready');assert.equal(frame.wait,3);assert.equal(frame.training.gates.length,8);assert.ok(frame.training.gates.includes(frame.training.target));assert.equal(frame.engine.obstacles.length,4);
});

test('a replay preserves the return-leg gate instead of highlighting its earlier duplicate',()=>{
 const m=new Match({practice:true,drill:'dribble'});m.training.score=6;m.training.target=m.training.gates[6];
 const frame=replayFrame(new ReplayRecorder(m,{id:'return-gate'}).snapshot().replay,0);
 assert.equal(frame.training.target,frame.training.gates[6]);
});
