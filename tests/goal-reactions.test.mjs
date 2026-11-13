import test from 'node:test';
import assert from 'node:assert/strict';
import {Renderer} from '../public/js/renderer.mjs';
import {createPitch} from '../public/js/config.mjs';
import {goalPlayerPose,BLACK_HOLE_TIMING} from '../public/js/goal-effects.mjs';
const context=()=>new Proxy({createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>k in o?o[k]:()=>{}});
function fixture(effect='black-hole',key='court-a'){
 const pitch=createPitch(1),x=pitch.right+8,y=pitch.height/2;
 const players=[{id:1,x:x-65,y:y+15,radius:18},{id:2,x:x-400,y,radius:18}];
 const match={visualKey:key,pitch,players,state:'goal',round:1,score:{red:1,blue:0},goalTeam:'red',goalInfo:{goalEffectId:effect},engine:{ball:{x,y,radius:8,angle:0}}};
 const renderer=new Renderer({getContext:context});return {renderer,match,players};
}
test('legacy replay fire poses retain a smooth outward offset without changing physics',()=>{
 const {renderer,match,players}=fixture('fire'),burst=renderer.goalBurst(match,0),before=structuredClone(match);
 const near=players[0],start=goalPlayerPose(burst,near,0),pushed=goalPlayerPose(burst,near,.8);
 assert.equal(start.x,near.x);assert.ok(pushed.x<near.x);assert.ok(pushed.y>near.y);
 assert.ok(Math.hypot(pushed.x-near.x,pushed.y-near.y)<115);
 assert.deepEqual(goalPlayerPose(burst,near,4),pushed,'legacy replay poses must not snap back when the flash fades');
 assert.equal(goalPlayerPose(burst,players[1],1),players[1]);assert.deepEqual(match,before);
});
test('nearby players spiral into the singularity and remain hidden through the explosion and final result',()=>{
 const {renderer,match,players}=fixture(),burst=renderer.goalBurst(match,0),p=players[0];
 const midway=goalPlayerPose(burst,p,.06+(BLACK_HOLE_TIMING.swallowEnd+.3-.06)*.65);assert.ok(midway.radius<p.radius);
 assert.ok(Math.hypot(midway.x-burst.holeX,midway.y-burst.holeY)<Math.hypot(p.x-burst.holeX,p.y-burst.holeY));
 for(const age of [1.3,2.2,3.5,8])assert.equal(goalPlayerPose(burst,p,age),null);
 assert.equal(goalPlayerPose(burst,players[1],2),players[1]);
 match.state='ended';assert.equal(goalPlayerPose(renderer.goalBurst(match,4000),p,4),null);
 match.state='kickoff';assert.equal(goalPlayerPose(renderer.goalBurst(match,4500),p,4.5),p);
});
test('rendered players and chat anchors disappear together without mutating snapshots',()=>{
 const {renderer,match,players}=fixture(),drawn=[];renderer.player=p=>drawn.push(p);const before=structuredClone(match);
 renderer.drawMatchPlayers(match,players,{},0);drawn.length=0;
 const shown=renderer.drawMatchPlayers(match,players,{},1500);assert.deepEqual(drawn.map(p=>p.id),[2]);assert.deepEqual(shown.map(p=>p.id),[2]);
 assert.deepEqual(match,before);match.state='kickoff';drawn.length=0;renderer.drawMatchPlayers(match,players,{},1600);assert.equal(drawn.length,2);
});
test('same-sized park courts maintain independent effects, and reduced motion bypasses reactions',()=>{
 const {renderer,match,players}=fixture(),other=fixture('fire','court-b').match;
 const a=renderer.goalBurst(match,0),b=renderer.goalBurst(other,40);assert.equal(renderer.goalBursts.size,2);assert.notEqual(a,b);
 assert.equal(renderer.goalBurst(match,90),a);
 renderer.motionQuery={matches:true};assert.equal(renderer.goalBurst(match,100),null);
 assert.equal(goalPlayerPose(null,players[0],1),players[0]);
});
test('late snapshots use the authoritative scoring origin, initial roster and celebration time',()=>{
 const {renderer,match,players}=fixture();match.goalInfo.effectOrigin={...match.engine.ball};match.goalInfo.effectPlayers=players.map(p=>({...p}));match.wait=3.5;
 players[0].x-=300;match.engine.ball.x+=80;
 const burst=renderer.goalBurst(match,2000);assert.equal(burst.at,500);assert.equal(burst.ball.x,match.goalInfo.effectOrigin.x);
 assert.equal(goalPlayerPose(burst,players[0],1.5),null,'an already-swallowed player stays hidden when a viewer joins late');
});
test('both effects have fixed allocation budgets and finish drawing after their lifetime',()=>{
 for(const effect of ['fire','black-hole']){
  const {renderer,match}=fixture(effect),burst=renderer.goalBurst(match,0),debris=burst.debris;
  for(let i=0;i<180;i++)renderer.goalConfetti(structuredClone(match),i*20);
  assert.equal(burst.debris,debris);assert.equal(debris.length,16);assert.ok((burst.stars?.length??burst.embers.length)<=38);
  if(effect==='black-hole')assert.equal(burst.infall.length,12);
  let count=0;renderer.ctx=new Proxy({},{get:()=>()=>count++});renderer.goalConfetti(match,(BLACK_HOLE_TIMING.duration+1)*1000);assert.equal(count,0);
 }
});

test('singularity turf fragments visibly spiral inward while the glow changes colour',()=>{
 const {renderer,match}=fixture(),burst=renderer.goalBurst(match,0),positions=[],colours=[];
 for(const shard of burst.infall){shard.phase=0;shard.speed=.6;}
 renderer.ball=()=>{};
 renderer.ctx=new Proxy({translate(x,y){positions.push({x,y});},createRadialGradient(){return {addColorStop(at,colour){colours.push(colour);}};}},{get:(o,k)=>k in o?o[k]:()=>{}});
 renderer.blackHoleBurst(burst,.4);const first=positions[1],firstColours=[...colours];positions.length=colours.length=0;
 renderer.blackHoleBurst(burst,.8);const later=positions[1];
 assert.ok(Math.hypot(later.x,later.y)<Math.hypot(first.x,first.y));
 assert.notEqual(Math.atan2(first.y,first.x),Math.atan2(later.y,later.x));assert.notDeepEqual(colours,firstColours);
 let explosions=0;renderer.singularityExplosion=()=>explosions++;renderer.blackHoleBurst(burst,BLACK_HOLE_TIMING.collapseEnd+.1);assert.equal(explosions,1);
});
