import {PhysicsEngine, kickDirection} from '../../../public/js/physics.mjs';
import {TUNING as C, clamp, distance, unit} from '../../../public/js/config.mjs';

function installShadowBroadphase(simulation) {
  const p=simulation.pitch,r=simulation.ball.radius,postRadius=p.postRadius??0;
  const core={left:p.left+r+postRadius,right:p.right-r-postRadius,top:p.top+r,bottom:p.bottom-r};
  if(core.left>=core.right||core.top>=core.bottom||simulation.obstacles.length)return;
  const corners=[{x:core.left,y:core.top},{x:core.right,y:core.top},
    {x:core.left,y:core.bottom},{x:core.right,y:core.bottom}];
  // Prove the rectangle collision-free for these actual wall segments and
  // normals, rather than assuming a particular map. Wall resolution uses signed
  // half-planes, so a distance-to-segment bounding box alone would be unsafe.
  const safeWalls=simulation.walls.every(([ax,ay,bx,by,nx,ny])=>{
    const sx=bx-ax,sy=by-ay,length=sx*sx+sy*sy;
    if(length===0)return false;
    const signed=corners.map(q=>(q.x-ax)*nx+(q.y-ay)*ny);
    if(Math.min(...signed)>=r)return true;
    const projections=corners.map(q=>((q.x-ax)*sx+(q.y-ay)*sy)/length);
    return Math.max(...projections)<0||Math.min(...projections)>1;
  });
  const safePosts=simulation.posts.every(post=>{
    const dx=post.x-clamp(post.x,core.left,core.right),dy=post.y-clamp(post.y,core.top,core.bottom);
    return dx*dx+dy*dy>=(r+(post.radius??p.postRadius))**2;
  });
  if(!safeWalls||!safePosts)return;
  const boundaries=simulation.boundaries.bind(simulation);
  simulation.boundaries=body=>{
    if(body.x>=core.left&&body.x<=core.right&&body.y>=core.top&&body.y<=core.bottom)return;
    boundaries(body);
  };
}

// Forecasts deliberately exclude future player contacts: these are alternatives
// to evaluate, not knowledge of the opponent's next input. The free ball uses
// the authoritative engine, including spin, posts, netting and map obstacles.
export function forecastBall(engine, {horizon=1.8, interval=.075, ball=engine.ball}={}) {
  const simulation=new PhysicsEngine(engine.pitch, []);
  simulation.setSidesSwapped(engine.sidesSwapped);
  simulation.walls=engine.walls;simulation.posts=engine.posts;
  simulation.obstacles=engine.obstacles||[];
  Object.assign(simulation.ball, ball);
  installShadowBroadphase(simulation);
  const duration=clamp(horizon, 0, 2.4),step=clamp(interval, 1/120, .15);
  const snapshot=(t,goal=null)=>({t,x:simulation.ball.x,y:simulation.ball.y,
    vx:simulation.ball.vx,vy:simulation.ball.vy,spin:simulation.ball.spin,goal});
  const path=[snapshot(0)];
  for(let elapsed=0;elapsed<duration-1e-9;) {
    const dt=Math.min(step,duration-elapsed),goal=simulation.step(dt);
    elapsed+=dt;path.push(snapshot(elapsed,goal));
    if(goal)break;
  }
  return path;
}

// One bounded shared forecast per controller, refreshed at most every .09s in
// normal flight. A collision or kick invalidates it early. Times are relative
// to the current authoritative state, even when reusing an older trajectory.
export class BallForecast {
  constructor(){this.at=-Infinity;this.path=[];this.team=null;this.lastPlayer=null;this.swapped=false;}
  get(engine,options={}) {
    const age=engine.time-this.at,b=engine.ball;
    const index=this.path.findIndex(q=>q.t>=age),next=index>=0?this.path[index]:this.path.at(-1);
    const previous=index>0?this.path[index-1]:next;
    const fraction=next&&previous?clamp((age-previous.t)/((next.t-previous.t)||1),0,1):0;
    const estimate=next&&previous?{x:previous.x+(next.x-previous.x)*fraction,y:previous.y+(next.y-previous.y)*fraction,
      vx:previous.vx+(next.vx-previous.vx)*fraction,vy:previous.vy+(next.vy-previous.vy)*fraction}:null;
    const disrupted=!estimate||distance(estimate,b)>38||
      Math.hypot(estimate.vx-b.vx,estimate.vy-b.vy)>95||
      b.lastPlayer!==this.lastPlayer||b.lastTeam!==this.team||engine.sidesSwapped!==this.swapped;
    if(age<0||age>=.09||disrupted) {
      this.path=forecastBall(engine,options);this.at=engine.time;
      this.team=b.lastTeam;this.lastPlayer=b.lastPlayer;this.swapped=engine.sidesSwapped;
      return this.path;
    }
    return [{t:0,x:b.x,y:b.y,vx:b.vx,vy:b.vy,spin:b.spin,goal:null},
      ...this.path.filter(q=>q.t>age+1e-8).map(q=>({...q,t:q.t-age}))];
  }
  reset(){this.at=-Infinity;this.path=[];}
}

function motionSegment(distanceLeft,velocity,target,acceleration,duration=Infinity) {
  const sign=target>=velocity?1:-1,a=acceleration*sign;
  const ramp=Math.min(Math.abs(target-velocity)/acceleration,duration);
  const traveled=velocity*ramp+.5*a*ramp*ramp;
  if(traveled>=distanceLeft&&ramp>0) {
    const disc=Math.max(0,velocity*velocity+2*a*distanceLeft);
    return {time:(-velocity+Math.sqrt(disc))/a,velocity,remaining:0};
  }
  const end=velocity+a*ramp,cruise=Math.max(0,duration-ramp);
  if(end>0&&distanceLeft<=traveled+end*cruise)
    return {time:ramp+(distanceLeft-traveled)/end,velocity:end,remaining:0};
  return {time:duration,velocity:end,remaining:distanceLeft-traveled-end*cruise};
}

// Analytic acceleration-limited arrival estimate. Unlike distance / sprintSpeed,
// this includes incoming momentum, turning and the actual remaining boost time.
// Collisions en route are uncertain, so this is a reachable-area approximation.
export function reachTime(player,point,{boost=true,margin=(player.radius??C.playerRadius)+C.ballRadius}={}) {
  const dx=point.x-player.x,dy=point.y-player.y,length=Math.hypot(dx,dy),remaining=Math.max(0,length-margin);
  if(remaining<=0)return 0;
  const normal=unit(dx,dy),velocity=(player.vx||0)*normal.x+(player.vy||0)*normal.y;
  const sideways=Math.abs((player.vy||0)*normal.x-(player.vx||0)*normal.y);
  const boosting=boost&&player.stamina>0,drive=boosting?C.sprintDrive:1;
  const turnDelay=sideways/(C.turning*drive)*.5;
  let left=remaining,v=velocity,time=turnDelay;
  if(boosting) {
    const segment=motionSegment(left,v,C.sprintSpeed,(v<0?C.turning:C.acceleration)*drive,
      clamp(player.stamina,0,100)/C.staminaDrain);
    time+=segment.time;if(!segment.remaining)return time;
    left=segment.remaining;v=segment.velocity;
  }
  const accel=v<0?C.turning:v>C.walkSpeed?C.braking:C.acceleration;
  return time+motionSegment(left,v,C.walkSpeed,accel).time;
}

export function interceptBall(player,path,{boost=true,delay=0}={}) {
  for(const point of path) {
    const arrival=reachTime(player,point,{boost})+delay;
    if(arrival<=point.t+.015)return {...point,arrival,reachable:true};
  }
  const point=path.at(-1)||player;
  return {...point,t:point.t??0,arrival:reachTime(player,point,{boost})+delay,reachable:false};
}

// Wall restitution changes the outgoing ANGLE, not just the available range.
// A simple geometric mirror is wrong because only normal velocity is reduced.
export function bankTarget(ball,destination,wallY) {
  const first=Math.abs(wallY-ball.y),second=Math.abs(destination.y-wallY);
  if(first<1||second<1||Math.sign(ball.y-wallY)!==Math.sign(destination.y-wallY))return null;
  const total=first+second/C.wallRestitution;
  const point={x:destination.x,y:wallY+Math.sign(wallY-ball.y)*second/C.wallRestitution};
  const hit={x:ball.x+(destination.x-ball.x)*first/total,y:wallY};
  const direction=unit(hit.x-ball.x,hit.y-ball.y);
  const retained=Math.hypot(direction.x,C.wallRestitution*direction.y);
  return {point,hit,destination:{...destination},pathLength:distance(ball,hit)+distance(hit,destination)/retained};
}

function shotState(engine,player,point,assumeAligned=false) {
  const b=engine.ball,aim=unit(point.x-b.x,point.y-b.y),near=distance(player,b)<player.radius+b.radius+C.shotReach;
  const normal=near&&!assumeAligned?unit(b.x-player.x,b.y-player.y):aim;
  const direction=kickDirection(normal,aim),approach=Math.max(0,player.vx*direction.x+player.vy*direction.y);
  const target=C.shotSpeed+C.shotMomentum*approach,current=b.vx*direction.x+b.vy*direction.y;
  const forward=Math.max(target,current),tangent=clamp((-direction.y*b.vx+direction.x*b.vy)*.08,-35,35);
  let vx=direction.x*forward-direction.y*tangent,vy=direction.y*forward+direction.x*tangent;
  const speed=Math.hypot(vx,vy);if(speed>C.ballMaxSpeed){vx*=C.ballMaxSpeed/speed;vy*=C.ballMaxSpeed/speed;}
  // Recoil parallel to the normal has zero cross product when aligned.
  const spin=clamp(b.spin+(player.vx*normal.y-player.vy*normal.x)*.007,-6,6);
  return {x:b.x,y:b.y,vx,vy,spin,direction,alignment:normal.x*aim.x+normal.y*aim.y};
}

// Cheap candidate forecast: 18 samples, continuous drag between samples and
// restitution-aware wall reflection. Free-flight prediction above remains the
// precise source for ball interception. These values are utilities, never
// calibrated scoring/interception probabilities.
export function evaluateKick(engine,player,point,{opponents=engine.players.filter(q=>q.team!==player.team),receiver=null,destination=point,horizon=1.8,assumeAligned=false}={}) {
  const p=engine.pitch,b=engine.ball,s=shotState(engine,player,point,assumeAligned),path=[{...s,t:0}],speed=Math.hypot(s.vx,s.vy);
  let goal=null,margin=Infinity,continueRisk=0,closest=Infinity,arrival=Infinity,landing={x:b.x,y:b.y},previous=b;
  const low=p.top+b.radius,high=p.bottom-b.radius;
  for(let t=.1;t<=Math.min(2.4,horizon)+1e-8;t+=.1) {
    const dt=.1,angle=s.spin*C.spinCurve*dt*.5,cs=Math.cos(angle),sn=Math.sin(angle);
    const drag=Math.exp(-C.ballDrag*dt),scale=(1-drag)/C.ballDrag;
    const vx=s.vx*cs-s.vy*sn,vy=s.vx*sn+s.vy*cs;
    s.x+=vx*scale;s.y+=vy*scale;s.vx=(vx*cs-vy*sn)*drag;s.vy=(vx*sn+vy*cs)*drag;s.spin*=Math.exp(-C.spinDecay*dt);
    // Reflect overshoot as well as velocity, so coarse sampling does not lose
    // the post-bounce travel time. Tangential velocity stays unchanged.
    if(s.y<low){s.y=low+(low-s.y)*C.wallRestitution;s.vy=Math.abs(s.vy)*C.wallRestitution;s.spin*=.82;}
    if(s.y>high){s.y=high-(s.y-high)*C.wallRestitution;s.vy=-Math.abs(s.vy)*C.wallRestitution;s.spin*=.82;}
    const crosses=s.x<p.left-b.radius||s.x>p.right+b.radius;
    const line=s.x<p.left?p.left:p.right;
    const crossingY=crosses?previous.y+(s.y-previous.y)*(line-previous.x)/((s.x-previous.x)||1):s.y;
    if(crosses&&crossingY>p.goalTop+b.radius+p.postRadius&&crossingY<p.goalBottom-b.radius-p.postRadius)
      goal=s.x<p.left?(engine.sidesSwapped?'red':'blue'):(engine.sidesSwapped?'blue':'red');
    else if((s.x<p.left+b.radius||s.x>p.right-b.radius)&&
      (s.y<p.goalTop+b.radius+p.postRadius||s.y>p.goalBottom-b.radius-p.postRadius)){
      const wall=s.x<p.left?p.left+b.radius:p.right-b.radius;
      s.x=wall+(wall-s.x)*C.wallRestitution;s.vx=-s.vx*C.wallRestitution;
    }
    const sample={t,x:s.x,y:s.y,vx:s.vx,vy:s.vy,spin:s.spin,goal};path.push(sample);
    const targetDistance=distance(sample,destination);
    if(targetDistance<closest){closest=targetDistance;arrival=t;landing={x:s.x,y:s.y};}
    for(const opponent of opponents) {
      // Immediate continuation and a reaction-limited best interception are
      // separate plausible responses. Boost availability constrains the latter.
      const eta=reachTime(opponent,sample,{boost:true});
      margin=Math.min(margin,eta+.075-t);
      const predicted={x:opponent.x+(opponent.vx||0)*Math.min(t,.5),y:opponent.y+(opponent.vy||0)*Math.min(t,.5)};
      const separation=distance(predicted,sample)-(opponent.radius+b.radius);
      continueRisk=Math.max(continueRisk,clamp(1-separation/48,0,1));
    }
    previous=sample;
    if(goal||(targetDistance<28&&destination.x>=p.left&&destination.x<=p.right)||targetDistance>closest+35)break;
  }
  const interceptRisk=Math.max(continueRisk*.7,Number.isFinite(margin)?clamp(.5-margin/.6,0,1):0);
  const receiverArrival=receiver?reachTime(receiver,landing,{boost:true}):null;
  return {path,goal,arrival,interceptionRisk:interceptRisk,margin,landing,speed,
    receiverArrival,receiveMargin:receiver?arrival-receiverArrival:null,alignment:s.alignment,
    targetMiss:closest,approximate:true};
}
