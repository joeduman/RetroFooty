import {PhysicsEngine} from './physics.mjs';
import {createPitch} from './config.mjs';
import {PARK,COURTS} from './park-layout.mjs';
// Same acceleration, sprint stamina, braking, disc contacts and substeps as a
// match. Spectators collide with each other and the outer edge of each arena;
// they can watch from the sidelines but cannot disrupt a live ball.
export class ParkPhysics extends PhysicsEngine {
 constructor(players=[]){
  super({...createPitch(5),width:PARK.width,height:PARK.height},players);
  this.blocked=COURTS.map(f=>{const p=createPitch(f.modeSize??f.size);return {
    left:f.x+p.left-p.runoff-2,right:f.x+p.right+p.runoff+2,
    top:f.y+p.top-p.runoff-2,bottom:f.y+p.bottom+p.runoff+2};});
 }
   // Park avatars use normal movement physics with unlimited sprint.
  // Match players use PhysicsEngine directly and retain normal stamina.
  motor(player,dt){
    player.stamina=100;
    player.exhausted=false;
    player.recovery=0;

    super.motor(player,dt);

    player.stamina=100;
    player.exhausted=false;
    player.recovery=0;
  }
 boundaries(p){
  p.x=Math.max(p.radius,Math.min(PARK.width-p.radius,p.x));
  p.y=Math.max(p.radius,Math.min(PARK.height-p.radius,p.y));
  if(p.x===p.radius&&p.vx<0||p.x===PARK.width-p.radius&&p.vx>0)p.vx=0;
  if(p.y===p.radius&&p.vy<0||p.y===PARK.height-p.radius&&p.vy>0)p.vy=0;
  for(const box of this.blocked){
   const L=box.left-p.radius,R=box.right+p.radius,T=box.top-p.radius,B=box.bottom+p.radius;
   if(p.x<=L||p.x>=R||p.y<=T||p.y>=B)continue;
   const distances=[p.x-L,R-p.x,p.y-T,B-p.y],side=distances.indexOf(Math.min(...distances));
   if(side===0){p.x=L;p.vx=Math.min(0,p.vx);}if(side===1){p.x=R;p.vx=Math.max(0,p.vx);}
   if(side===2){p.y=T;p.vy=Math.min(0,p.vy);}if(side===3){p.y=B;p.vy=Math.max(0,p.vy);}
  }
 }
}
