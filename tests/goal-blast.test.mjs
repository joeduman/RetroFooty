import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsEngine,Player} from '../public/js/physics.mjs';
import {Match} from '../public/js/match.mjs';
import {createPitch,STEP} from '../public/js/config.mjs';
import {GOAL_REACTION,goalPlayerPose} from '../public/js/goal-effects.mjs';
import {ReplayRecorder,replayFrame} from '../public/js/replay.mjs';
import {OnlinePrediction} from '../public/js/online-prediction.mjs';
import {ParkWorld} from '../park.mjs';
const idle={x:0,y:0,sprint:false,shoot:false,aimX:1,aimY:0};
function fixture(){
 const pitch=createPitch(3),x=pitch.width/2,y=pitch.height/2;
 const players=[new Player(1,'red',1,'Human',true),new Player(2,'blue',1,'Bot'),new Player(3,'red',2,'Distant',true)];
 Object.assign(players[0],{x:x-60,y:y-45,input:{...idle,x:1,sprint:true,shoot:true}});
 Object.assign(players[1],{x:x+65,y:y+45,input:{...idle,x:-1,sprint:true,shoot:true}});
 Object.assign(players[2],{x:x-350,y:y-150,input:{...idle,x:1}});
 const engine=new PhysicsEngine(pitch,players);Object.assign(engine.ball,{x:x+350,y:y+200});
 return {engine,players,origin:{x,y}};
}
const advance=(engine,seconds,dt=STEP)=>{for(let i=0;i<Math.round(seconds/dt);i++)engine.celebrate(dt,true);};
test('fire impulse beats held movement and sprint for every affected human and bot',()=>{
 const {engine,players,origin}=fixture(),before=players.map(p=>p.x);engine.startGoalBlast(origin,1);
 advance(engine,.35);
 assert.ok(players[0].x<before[0]-15);assert.ok(players[0].vx<0);
 assert.ok(players[1].x>before[1]+15);assert.ok(players[1].vx>0);
 assert.equal(players[0].sprinting,false);assert.equal(players[1].sprinting,false);
 assert.ok(players[2].x>before[2],'out-of-range players retain movement');
 const pushed=players[0].x;advance(engine,.1);assert.ok(players[0].x<pushed,'positions do not snap back when the lock ends');
 advance(engine,.65);assert.ok(players[0].vx>0,'held input regains control after the impulse');
 assert.equal(engine.goalBlast,null);
});
test('the ball is blasted back onto the pitch from either goal and held kicks cannot cancel it',()=>{
 for(const dir of [-1,1]){
  const pitch=createPitch(1),player=new Player(1,'red',1,'Held shoot',true),engine=new PhysicsEngine(pitch,[player]);
  const origin={x:(dir===1?pitch.right:pitch.left)+dir*9,y:pitch.height/2};
  Object.assign(engine.ball,origin,{vx:dir*500});Object.assign(player,{x:origin.x-dir*65,y:origin.y+65,input:{...idle,x:dir,shoot:true,sprint:true}});
  engine.startGoalBlast(origin,dir);assert.ok(engine.ball.vx*dir<0);
  advance(engine,.2);assert.ok((engine.ball.x-origin.x)*dir< -25);assert.ok(engine.ball.vx*dir<0);
  assert.equal(engine.events.some(e=>e.type==='kick'),false);
 }
});
test('the wave hits once, results are independent of update rate, and kickoff clears locks',()=>{
 const a=fixture(),b=fixture();a.engine.startGoalBlast(a.origin,1);b.engine.startGoalBlast(b.origin,1);
 advance(a.engine,.5,1/30);advance(b.engine,.5,1/120);
 for(let i=0;i<2;i++)assert.ok(Math.abs(a.players[i].x-b.players[i].x)<1);
 assert.ok(a.players[0].goalBlastUntil>a.engine.time);
 a.engine.clearMotion();assert.equal(a.engine.goalBlast,null);assert.equal(a.engine.ballBlastUntil,0);
 for(const p of a.players){assert.equal(p.goalBlastUntil,0);assert.equal(p.vx,0);}
});
test('a real fire goal starts one physical reaction and records it without a second visual push',()=>{
 const game=new Match({size:1,team:'red',loop:false,seed:56});game.state='playing';game.engine.kickoff=null;
 const scorer=game.human,other=game.players[1],p=game.pitch;
 Object.assign(scorer,{x:p.right-90,y:p.height/2,goalEffectId:'fire',input:{...idle,shoot:true}});
 Object.assign(other,{x:p.width/2,y:p.top+30,human:true,input:{...idle}});
 Object.assign(game.engine.ball,{x:scorer.x+scorer.radius+game.engine.ball.radius+1,y:scorer.y,vx:0,vy:0});
 const recorder=new ReplayRecorder(game);
 for(let i=0;i<120&&game.state!=='goal';i++){game.update(STEP,i===0?{...idle,shoot:true}:idle);recorder.step(STEP);}
 assert.equal(game.state,'goal');assert.equal(game.goalInfo.goalEffectId,'fire');assert.equal(game.goalInfo.effectMotion,'physics-v1');
 const start=scorer.x;
 for(let i=0;i<42;i++){game.update(STEP,{...idle,x:1,sprint:true,shoot:true});recorder.step(STEP);}
 assert.ok(scorer.x<start-15);assert.deepEqual(game.score,{red:1,blue:0});
 const record=recorder.snapshot('complete').replay,frame=replayFrame(record,record.duration);
 assert.equal(frame.goalInfo.effectMotion,'physics-v1');
 assert.equal(goalPlayerPose({effectId:'fire',authoritativeFire:true},frame.players[0],.35),frame.players[0]);
 game.spawn();assert.equal(game.engine.goalBlast,null);assert.equal(scorer.goalBlastUntil,0);
});
test('multiplayer prediction restores pending waves and locks instead of letting held input cancel them',()=>{
 for(const elapsed of [.05,.25,.8]){
  const {engine,players,origin}=fixture();engine.startGoalBlast(origin,1);advance(engine,elapsed);
  const state=JSON.parse(JSON.stringify({state:'goal',pitch:engine.pitch,players,goalInfo:{effectMotion:'physics-v1'},engine:{ball:engine.ball,...engine.celebrationSnapshot()}}));
  const saved=structuredClone(state),prediction=new OnlinePrediction();prediction.receive({state,id:1,ack:-1,matchId:'blast'},1000,0);
  prediction.input(1,players[0].input,1000);const view=prediction.project(1100);advance(engine,.1);
  for(let i=0;i<2;i++)assert.ok(Math.abs(view.players[i].x-players[i].x)<.01,'client and server must agree before, during and after knockback');
  assert.ok(Math.abs(view.engine.ball.x-engine.ball.x)<.01);assert.deepEqual(state,saved);
 }
});
test('park snapshots carry serializable impulse timing for prediction and the actual moving ball',()=>{
 const world=new ParkWorld(),client=world.connect('Blast tester');world.join(client,1,'red');
 const game=world.field(1).game,origin={x:game.pitch.right+9,y:game.pitch.height/2};
 game.state='goal';game.wait=5;game.goalInfo={goalEffectId:'fire',effectMotion:'physics-v1',effectOrigin:origin};
 Object.assign(game.engine.ball,origin);game.engine.startGoalBlast(origin,1);
 const packet=JSON.parse(JSON.stringify(world.state(client)));
 assert.equal(packet.state.engine.time,game.engine.time);assert.ok(packet.state.engine.ball.vx<0);
 assert.ok(packet.state.engine.ballBlastUntil>packet.state.engine.time);
 assert.equal(packet.state.engine.goalBlast.targets.length,game.players.length);
 assert.equal(packet.state.engine.goalBlast.targets[0].player,undefined);
 const prediction=new OnlinePrediction();prediction.receive(packet,1000,0);assert.doesNotThrow(()=>prediction.project(1080));
 assert.equal(world.overview().fields.find(f=>f.id===1).ball.vx,game.engine.ball.vx);
});
