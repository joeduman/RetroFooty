import test from 'node:test';import assert from 'node:assert/strict';
import {ParkWorld} from '../park.mjs';import {Match} from '../public/js/match.mjs';import {STEP,distance,TUNING as C} from '../public/js/config.mjs';import {COURTS} from '../public/js/park-layout.mjs';
test('kickoff taker starts outside kick range even with button held at countdown end',()=>{const m=new Match({size:1,seed:7});const t=m.players.find(p=>p.id===m.kickoffPlayer);assert.ok(distance(t,m.engine.ball)>t.radius+m.engine.ball.radius+C.shotReach+20);assert.equal(m.engine.shoot(t),false);});
test('winning bots pulse their kick ring while conceding bots do not',()=>{const m=new Match({size:3,spectator:true,seed:7});m.state='playing';m.engine.ball.x=m.pitch.right+15;m.engine.ball.y=m.pitch.height/2;m.update(STEP);assert.equal(m.state,'goal');const winners=m.players.filter(p=>p.celebrating);assert.ok(winners.length);const observed=new Set();for(let i=0;i<100;i++){m.update(STEP);observed.add(winners[0].input.shoot);assert.ok(m.players.filter(p=>p.team==='blue').every(p=>!p.input.shoot));}assert.deepEqual(observed,new Set([true,false]));});
test('park exposes the thirteen dedicated match courts with normal team capacity',()=>{
 const w=new ParkWorld(),player=w.connect('Player');
 assert.deepEqual(COURTS.map(f=>f.size),[1,2,3,4,5,1,1,2,2,3,3,4,5]);
 assert.deepEqual(w.fields.map(f=>f.size),[1,2,3,4,5,1,1,2,2,3,3,4,5]);
 assert.deepEqual(w.overview().fields.map(f=>f.size),[1,2,3,4,5,1,1,2,2,3,3,4,5]);
 for(const field of w.fields){
  assert.equal(field.game.practice,false);assert.equal(field.game.training,null);
  assert.equal(field.game.players.length,field.mode==='ranked'?0:field.size*2);
  assert.equal(w.join(player,field.id,'red'),null);
  assert.equal(w.state(player).state.players.filter(p=>p.team==='red').length,field.mode==='ranked'?1:field.size);
  w.leave(player);assert.equal(player.field,null);
 }
});
test('corner defender targets exact post contact in both halves',()=>{for(const swapped of [false,true]){const m=new Match({size:3,spectator:true});if(swapped)m.startSecondHalf();const p=m.pitch,dir=m.engine.attackDir('red'),own=dir===1?p.left:p.right;m.engine.ball.x=own+dir*30;m.engine.ball.y=p.top+12;const blue=m.players.find(p=>p.team==='blue');blue.x=m.engine.ball.x+dir*30;blue.y=m.engine.ball.y;m.ai.planTeams();const plan=m.ai.plans.red;assert.ok(plan.frontPostThreat);const target=m.ai.cover(plan.cover,plan);assert.ok(Math.abs(Math.hypot(target.x-own,target.y-p.goalTop)-(plan.cover.radius+p.postRadius))<1e-8);}});
test('contested ball arms kick before contact and through cooldown',()=>{const m=new Match({size:1,spectator:true});m.engine.kickoff=null;const [a,b]=m.players,ball=m.engine.ball;a.x=ball.x-65;a.y=ball.y;b.x=ball.x+40;b.y=ball.y;m.ai.planTeams();a.shotCooldown=.2;const target=m.ai.chase(a,m.ai.memory.get(a.id));assert.equal(target.shoot,true);assert.ok(distance(a,ball)>a.radius+ball.radius+C.shotReach);});
test('free forward lane creates a kick-and-chase choice',()=>{const m=new Match({size:1,spectator:true}),[a,b]=m.players,ball=m.engine.ball;a.x=ball.x-28;a.y=ball.y;b.x=m.pitch.right-35;b.y=m.pitch.top+25;m.engine.time=3;m.ai.planTeams();const aim=m.ai.chooseAim(a,m.ai.memory.get(a.id));assert.equal(aim.type,'advance');assert.ok(aim.point.x>ball.x);});

test('removed practice court IDs cannot be joined or create hidden fields',()=>{
 const w=new ParkWorld(),player=w.connect('Player'),rounds=w.fields.map(f=>f.matchId);
 for(let size=101;size<=106;size++){
  assert.equal(typeof w.join(player,size,'red'),'string');
  assert.equal(player.field,null);assert.equal(w.state(player),null);
 }
 assert.deepEqual(w.fields.map(f=>f.matchId),rounds);
 assert.equal(w.fields.length,13);assert.ok(w.fields.every(f=>!f.members.length));
});
