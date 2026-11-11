import test from 'node:test';
import assert from 'node:assert/strict';
import {Player,PhysicsEngine} from '../public/js/physics.mjs';
import {Match} from '../public/js/match.mjs';
import {DRILLS,loadPracticeBests,savePracticeBest,practiceKey} from '../public/js/practice.mjs';
import {STEP,TUNING as C,createPitch,distance} from '../public/js/config.mjs';
const idle={x:0,y:0,sprint:false,shoot:false,aimX:1,aimY:0};
const advance=(engine,seconds)=>{for(let i=0;i<Math.round(seconds/STEP);i++)engine.step(STEP);};
function controlFixture(){const p=new Player(1,'red',1,'Sam',true);p.x=400;p.y=400;p.input={...idle,x:1};const e=new PhysicsEngine(createPitch(5),[p]),b=e.ball;b.x=427;b.y=400;return {p,e,b};}

test('any positive boost is usable after exhaustion, including a fraction of one tick',()=>{
 for(const amount of [.01,.2,1,7,19]){const {p,e}=controlFixture();p.stamina=amount;p.exhausted=true;p.input.sprint=true;e.motor(p,1/240);assert.equal(p.sprinting,true);assert.ok(p.stamina<amount);assert.ok(p.vx>0);assert.ok(Number.isFinite(p.vx));}
});
test('a deliberate shot redirects sideways incoming momentum without relocating the ball',()=>{
 for(const side of [-1,1]){const {p,e,b}=controlFixture();b.x=p.x+side*26;b.y=p.y;b.vx=0;b.vy=300;p.input.aimX=side;p.input.aimY=0;
  const at={x:b.x,y:b.y};assert.ok(e.shoot(p));assert.deepEqual({x:b.x,y:b.y},at);assert.ok(Math.abs(Math.atan2(b.vy,Math.abs(b.vx)))<4*Math.PI/180);assert.ok(b.vx*side>=C.shotSpeed);
 }
});
test('a touched ball stays free and separates when the player stops',()=>{
 const {p,e,b}=controlFixture();advance(e,.5);p.input={...idle};advance(e,.35);
 assert.equal(b.controlId,undefined);assert.ok(distance(p,b)>40);assert.ok(b.vx>0);
});
test('steering near a ball cannot pull it into an orbit',()=>{
 const {p,e,b}=controlFixture();p.input={...idle,y:-1};b.x=p.x+29;b.vx=100;
 const y=b.y;advance(e,.3);assert.equal(b.y,y);assert.equal(b.spin,0);assert.ok(b.x>450);assert.equal(b.controlId,undefined);
});
test('sprinting into a loose ball still creates a hard touch rather than an automatic catch',()=>{
 const {p,e,b}=controlFixture();p.x=300;b.x=400;p.input.sprint=true;let touched=false;
 for(let i=0;i<60;i++){e.step(STEP);if(e.events.some(e=>e.type==='contact')){touched=true;assert.equal(b.controlId,undefined);assert.ok(Math.hypot(b.vx,b.vy)>350);break;}}
 assert.ok(touched);
});
test('opposite physical glancing touches can generate opposite curve signs',()=>{
 const signs=[];for(const direction of [-1,1]){const {p,e,b}=controlFixture();b.x=p.x+25;p.vx=90;p.vy=direction*170;e.discs(p,b);signs.push(b.spin);assert.ok(Math.abs(b.spin)>.1);}
 assert.ok(signs[0]*signs[1]<0);
});
test('spin curves free flight visibly while drag continues to reduce speed',()=>{
 const e=new PhysicsEngine(createPitch(5),[]),b=e.ball;b.x=400;b.y=500;b.vx=480;b.vy=0;b.spin=5;
 advance(e,.7);assert.ok(b.y>520);assert.ok(Math.hypot(b.vx,b.vy)<480);assert.ok(b.spin<5);
});
test('a 2v2 cover teammate advances within a useful passing distance',()=>{
 const m=new Match({size:2,team:'red'}),b=m.engine.ball;b.x=m.pitch.width*.66;b.y=m.pitch.height/2;b.lastTeam='red';b.lastPlayer=m.human.id;m.human.x=b.x-27;m.human.y=b.y;
 m.ai.planTeams();const plan=m.ai.plans.red,target=m.ai.cover(plan.cover,plan);assert.ok(target.x>m.pitch.width*.4);assert.ok(distance(target,b)<270);assert.ok(target.x<b.x);
});
test('5v5 support keeps a central anchor and separate wings across seeded openings',()=>{
 // Support offsets are intentionally varied. Check useful lanes across 100 seeds,
 // not a wall-clock-random opening against an unstated 180-unit target distance.
 for(let seed=0;seed<100;seed++){
  const m=new Match({size:5,team:'red',seed}),b=m.engine.ball;b.x=m.pitch.width*.56;b.y=m.pitch.height/2;b.lastTeam='red';b.lastPlayer=m.human.id;m.human.x=b.x-27;m.human.y=b.y;m.ai.planTeams();
  const plan=m.ai.plans.red;assert.ok(plan.anchor&&plan.cover);const anchor=m.ai.support(plan.anchor,plan);assert.ok(anchor.x<b.x);
  const wings=m.players.filter(p=>p.team==='red'&&p!==plan.chaser&&p!==plan.cover&&p!==plan.anchor).map(p=>m.ai.support(p,plan));
  assert.equal(wings.length,2);assert.ok(wings[0].y<m.pitch.height/2&&wings[1].y>m.pitch.height/2);assert.ok(Math.abs(wings[0].y-wings[1].y)>C.playerRadius*6);assert.ok(wings.every(t=>t.x>b.x));
 }
});
test('a central own-goal clearance is rejected but an outward sideline clearance is allowed',()=>{
 for(const team of ['red','blue']){const m=new Match({size:2,team}),p=m.pitch,b=m.engine.ball,dir=team==='red'?1:-1,own=dir===1?p.left:p.right;
  b.x=own+dir*70;b.y=p.height/2;m.ai.planTeams();const plan=m.ai.plans[team];
  assert.equal(m.ai.ownGoalRisk(b,{x:own-dir*100,y:b.y},plan),true);
  assert.equal(m.ai.ownGoalRisk(b,{x:own+dir*300,y:p.top+60},plan),false);
  const aim=m.ai.chooseAim(m.human,m.ai.memory.get(m.human.id));assert.equal(m.ai.ownGoalRisk(b,aim.point,plan),false);
 }
});
test('the bot does not burn sprint on small supporting adjustments',()=>{
 const m=new Match({size:5,spectator:true,seed:4});m.engine.ball.x=m.pitch.width*.65;m.engine.ball.lastTeam='red';m.ai.planTeams();
 const plan=m.ai.plans.red,p=plan.cover,target=m.ai.cover(p,plan);p.x=target.x;p.y=target.y;p.stamina=80;m.ai.nextPlan=Infinity;m.ai.update();assert.equal(p.input.sprint,false);
});
test('practice exposes six distinct setups and pitch size changes their geometry',()=>{
 assert.equal(Object.keys(DRILLS).length,6);for(const drill of Object.keys(DRILLS))for(const size of [1,5]){
  const m=new Match({practice:true,drill,size,team:'blue'});assert.equal(m.pitch.width,createPitch(size).width);assert.equal(m.human.team,'blue');assert.equal(m.players.length,['corner','shield','sparring'].includes(drill)?2:1);
  if(drill==='dribble')assert.equal(m.training.gates.length,8);if(drill==='shield')assert.ok(m.training.circle);if(['corner','wall'].includes(drill))assert.ok(m.training.target);
 }
});
test('dribble gates require a nearby last touch, not an unattended shot or stationary repeat',()=>{
 const m=new Match({practice:true,drill:'dribble'}),t=m.training,b=m.engine.ball,h=m.human,g=t.target;
 b.x=g.x;b.y=g.y;h.x=g.x-27;h.y=g.y;t.update(STEP,[],null);assert.equal(t.score,0);
 b.lastPlayer=h.id;t.update(STEP,[],null);assert.equal(t.score,1);t.update(STEP,[],null);assert.equal(t.score,1);
});
test('bank practice requires the marked wall and an actual reception in the target',()=>{
 const m=new Match({practice:true,drill:'wall'}),t=m.training,b=m.engine.ball,h=m.human;b.lastTeam=h.team;
 t.update(STEP,[{type:'wall',ny:1,x:t.wallX+150}],null);assert.equal(t.banked,false);
 t.update(STEP,[{type:'wall',ny:1,x:t.wallX}],null);assert.equal(t.banked,true);
 t.update(STEP,[{type:'contact',player:h.id}],null);assert.equal(t.score,0);
 b.x=t.target.x;b.y=t.target.y;t.update(STEP,[{type:'contact',player:h.id}],null);assert.equal(t.score,1);assert.equal(t.banked,false);
});
test('corner practice has an active defender and rewards a close physical escape',()=>{
 const m=new Match({practice:true,drill:'corner'}),t=m.training,b=m.engine.ball,h=m.human,q=m.players.find(p=>!p.human),before={x:q.x,y:q.y};
 for(let i=0;i<390;i++)m.update(STEP,idle);assert.ok(distance(before,q)>5);
 const oldY=b.y;b.x=t.target.x;b.y=t.target.y;h.x=b.x-27;h.y=b.y;b.lastPlayer=h.id;t.update(STEP,[],null);assert.equal(t.score,1);assert.ok(Math.abs(b.y-oldY)>200);
});
test('shielding challenger goes around an idle player and ends the timed attempt on a touch',()=>{
 const m=new Match({practice:true,drill:'shield',size:2});for(let i=0;i<1200&&m.state!=='ended';i++)m.update(STEP,idle);
 assert.equal(m.state,'ended');assert.equal(m.training.reason,'The challenger reached the ball');assert.ok(m.training.score>0&&m.training.score<10);
});
test('shielding ends when the ball leaves the circle',()=>{
 const m=new Match({practice:true,drill:'shield'});m.engine.ball.x=m.training.circle.x+m.training.circle.radius+5;m.training.update(STEP,[],null);
 assert.equal(m.training.completed,true);assert.equal(m.training.reason,'The ball left the circle');
});
test('finishing practice is five attacks, then a final score',()=>{
 const m=new Match({practice:true,drill:'sparring'}),t=m.training;
 for(let i=0;i<5;i++)t.update(1,[],i<3?m.human.team:(m.human.team==='red'?'blue':'red'));
 assert.equal(t.score,3);assert.equal(t.attempts,5);assert.equal(m.state,'ended');assert.equal(t.completed,true);
});
test('timed challenges finish at their limit while free play stays open',()=>{
 for(const drill of ['dribble','wall','corner']){const m=new Match({practice:true,drill});m.training.update(DRILLS[drill].seconds,[],null);assert.equal(m.state,'ended',drill);}
 const free=new Match({practice:true,drill:'free'});free.training.update(1000,[],null);assert.equal(free.state,'playing');
});
test('personal bests persist separately by drill, pitch and unlimited stamina',()=>{
 const previous=globalThis.localStorage;const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 try{
  const m=new Match({practice:true,drill:'dribble',size:2}),key=practiceKey(m);assert.deepEqual(savePracticeBest(key,7),{best:7,improved:true});assert.deepEqual(savePracticeBest(key,4),{best:7,improved:false});
  const boosted=new Match({practice:true,drill:'dribble',size:2,unlimitedStamina:true});savePracticeBest(practiceKey(boosted),12);assert.equal(loadPracticeBests()[key],7);assert.equal(loadPracticeBests()[practiceKey(boosted)],12);
  savePracticeBest(key,NaN);assert.equal(loadPracticeBests()[key],7);
 }finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});
test('a bot behind the wrong contact face repositions without an artificial carry',()=>{
 const m=new Match({size:2,spectator:true,seed:9}),p=m.players[0],b=m.engine.ball;p.x=m.pitch.width/2;p.y=m.pitch.height/2;b.x=p.x-27;b.y=p.y;b.lastPlayer=p.id;b.lastTeam=p.team;
 m.ai.planTeams();const memory=m.ai.memory.get(p.id);memory.aim={point:{x:m.pitch.right,y:b.y},type:'shot'};memory.nextAim=Infinity;
 const target=m.ai.chase(p,memory);assert.ok(target.x<b.x);assert.equal(target.shoot,false);
});
