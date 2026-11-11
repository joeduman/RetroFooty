import {RULES} from './customize.mjs';
import { TUNING as C, clamp, unit } from './config.mjs';

// Aim supplies a small correction; the contact face determines the shot.
export function kickDirection(normal,aim){
  const w=C.shotAimWeight;
  return unit(normal.x*(1-w)+aim.x*w,normal.y*(1-w)+aim.y*w);
}

export class Player {
  constructor(id, team, number, name, human = false) {
    Object.assign(this, { id, team, number, name, human, x: 0, y: 0, vx: 0, vy: 0,
      radius: C.playerRadius, invMass: 1 / C.playerMass, stamina: 100, sprinting: false, goalEffectId:'classic',
      exhausted: false, recovery: 0, shotCooldown: 0, kickFlash:0, kickWasDown:false, faceX: team === 'red' ? 1 : -1, faceY: 0,
      input: { x: 0, y: 0, aimX: team === 'red' ? 1 : -1, aimY: 0, sprint: false, shoot: false } });
  }
}
export class Ball {
  constructor(x, y) { Object.assign(this, { id: 0, x, y, vx: 0, vy: 0, radius: C.ballRadius,
    invMass: 1 / C.ballMass, spin: 0, rollSpin: 0, angle: 0, lastTeam: null, lastPlayer: null }); }
}

export class PhysicsEngine {
  constructor(pitch, players) {
    this.pitch = pitch; this.players = players;
    this.sidesSwapped=false;
    this.attackDir=team=>(team==='red'?1:-1)*(this.sidesSwapped?-1:1);
    this.setSidesSwapped=value=>{this.sidesSwapped=Boolean(value);};
    this.ball = new Ball(pitch.width / 2, pitch.height / 2);
    this.obstacles=[];
    this.kickoff=null;
    this.time = 0; this.events = []; this.contacts = new Map(); this.touchTimes = new Map();
    const p = pitch, L = p.left, R = p.right, T = p.top, B = p.bottom;
    const GT = p.goalTop, GB = p.goalBottom, D = p.goalDepth;
    // Normals point toward playable space. Goal mouths are genuinely open.
    this.walls = [
      [L,T,R,T,0,1], [L,B,R,B,0,-1],
      [L,T,L,GT,1,0], [L,GB,L,B,1,0], [R,T,R,GT,-1,0], [R,GB,R,B,-1,0],
      [L-D,GT,L-D,GB,1,0,.2], [L-D,GT,L,GT,0,1,.3], [L-D,GB,L,GB,0,-1,.3],
      [R+D,GT,R+D,GB,-1,0,.2], [R,GT,R+D,GT,0,1,.3], [R,GB,R+D,GB,0,-1,.3]
    ];
    const run=p.runoff??0;
    // Existing outside-arena bounds stay unchanged. Players ignore netting,
    // but still collide with the four solid goalposts.
    this.playerWalls=[[L-run,T-run,R+run,T-run,0,1],[L-run,B+run,R+run,B+run,0,-1],
      [L-run,T-run,L-run,B+run,1,0],[R+run,T-run,R+run,B+run,-1,0]];
    this.posts = [{x:L,y:GT},{x:L,y:GB},{x:R,y:GT},{x:R,y:GB}];
  }
  // Only the kickoff team may enter the center circle.
  protectKickoff(player){
    const lock=this.kickoff;
    if(!lock || player===this.ball || player.team===lock.team)return;

    const pitch=this.pitch;
    const cx=pitch.width/2,cy=pitch.height/2;

    // Matches the center circle drawn by renderer.mjs.
    const circleRadius=Math.min(78,(pitch.bottom-pitch.top)*.15);
    const minimum=circleRadius+player.radius;

    const dx=player.x-cx,dy=player.y-cy;
    const distance=Math.hypot(dx,dy);
    if(distance>=minimum)return;

    const nx=distance>1e-6?dx/distance:
      -this.attackDir(player.team);
    const ny=distance>1e-6?dy/distance:0;

    // Keep the entire player disc outside the circle.
    player.x=cx+nx*minimum;
    player.y=cy+ny*minimum;

    // Remove inward velocity while allowing movement around the circle.
    const inward=player.vx*nx+player.vy*ny;
    if(inward<0){
      player.vx-=inward*nx;
      player.vy-=inward*ny;
    }
  }

  releaseKickoff(player){
    if(this.kickoff?.team===player.team)this.kickoff=null;
  }

  clearMotion() {
    this.kickoff=null;
    this.contacts.clear();this.touchTimes.clear();
    for (const p of this.players) { p.vx = p.vy = 0; p.sprinting = false;
      p.stamina = 100; p.exhausted = false; p.recovery = 0; p.shotCooldown = 0;p.kickFlash=0;p.kickWasDown=false;
      p.input = { x:0,y:0,aimX:this.attackDir(p.team),aimY:0,sprint:false,shoot:false }; }
    Object.assign(this.ball, {x:this.pitch.width/2,y:this.pitch.height/2,vx:0,vy:0,spin:0,rollSpin:0,angle:0,lastTeam:null,lastPlayer:null});
  }

  motor(p, dt) {
    const i = p.input;
    p.kickFlash=i.shoot&&!p.kickWasDown?RULES.kickFlashSeconds:Math.max(0,(p.kickFlash||0)-dt);p.kickWasDown=Boolean(i.shoot);
    const length = Math.hypot(i.x, i.y), amount = Math.min(1, length);
    // Any positive amount is usable. There is no hidden 20-point unlock gate.
    p.exhausted = p.stamina <= 0;
    p.sprinting = Boolean(i.sprint && amount > .05 && p.stamina > 0);
    const boostFraction=p.sprinting?Math.min(1,p.stamina/(C.staminaDrain*dt)):0;
    if (p.sprinting) {
      p.stamina = Math.max(0, p.stamina - C.staminaDrain * dt); p.recovery = C.recoveryDelay;
      if (p.stamina === 0) p.exhausted = true;
    } else {
      p.recovery = Math.max(0, p.recovery - dt);
      if (p.recovery === 0) p.stamina = Math.min(100, p.stamina + C.staminaRecovery * dt);
    }
    const speed = C.walkSpeed+(C.sprintSpeed-C.walkSpeed)*boostFraction;
    const targetX = length > 0 ? i.x / length * amount * speed : 0;
    const targetY = length > 0 ? i.y / length * amount * speed : 0;
    const dx = targetX - p.vx, dy = targetY - p.vy, difference = Math.hypot(dx, dy);
    const reversing = targetX*p.vx+targetY*p.vy < 0;
    const slowing = Math.hypot(targetX,targetY) < Math.hypot(p.vx,p.vy)-1;
    const maxChange = (reversing ? C.turning : amount < .05 || slowing ? C.braking : C.acceleration) * (p.sprinting?C.sprintDrive:1) * dt;
    if (difference > maxChange) { p.vx += dx / difference * maxChange; p.vy += dy / difference * maxChange; }
    else { p.vx = targetX; p.vy = targetY; }
    if (amount > .04) { p.faceX = i.x / length; p.faceY = i.y / length; }
    p.shotCooldown = Math.max(0, p.shotCooldown - dt);
  }

  // A tap or held button applies the same impulse at the actual contact point.
  // Holding retries after cooldown; it never charges power or relocates the ball.
  shoot(p) {
    if (p.shotCooldown > 0) return false;
    const b = this.ball, dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
    if (d > p.radius + b.radius + C.shotReach || d < 1e-6) return false;
    const n = {x:dx/d,y:dy/d}, aim = unit(p.input.aimX,p.input.aimY,p.faceX,p.faceY);
    const alignment = aim.x * n.x + aim.y * n.y;
    if (alignment < .25) return false;
    const direction = kickDirection(n,aim);
    const approach = Math.max(0, p.vx * direction.x + p.vy * direction.y);
    const target = C.shotSpeed + C.shotMomentum * approach;
    const current = b.vx * direction.x + b.vy * direction.y;
    const change = Math.max(0, target - current);
    // A deliberate kick redirects incoming momentum; an old sideways velocity
    // must not turn a correctly aimed shot into a 30-degree misfire.
    const tangent=clamp((-direction.y*b.vx+direction.x*b.vy)*.08,-35,35);
    const forward=Math.max(target,current);
    b.vx=direction.x*forward-direction.y*tangent;b.vy=direction.y*forward+direction.x*tangent;
    p.vx -= direction.x * change * C.ballMass / C.playerMass * .22;
    p.vy -= direction.y * change * C.ballMass / C.playerMass * .22;
    b.spin = clamp(b.spin+(p.vx*n.y-p.vy*n.x)*.007,-6,6);
    b.lastTeam = p.team; b.lastPlayer = p.id; p.shotCooldown = C.shotCooldown;
    this.limitBall(); this.events.push({type:'kick',strength:Math.min(1,change/650),player:p.id,time:this.time,x:b.x,y:b.y,vx:b.vx,vy:b.vy});
    this.releaseKickoff(p);
    return true;
  }

  limitBall() {
    const b = this.ball, speed = Math.hypot(b.vx, b.vy);
    if (speed > C.ballMaxSpeed) { b.vx *= C.ballMaxSpeed / speed; b.vy *= C.ballMaxSpeed / speed; }
  }

  discs(a, b) {
    const dx = b.x-a.x, dy = b.y-a.y, range = a.radius+b.radius;
    const squared = dx*dx+dy*dy;
    if (squared > range*range) return;
    const d = Math.sqrt(squared);
    const fallback = unit(a.vx-b.vx,a.vy-b.vy,a.id % 2 ? 1 : -1,0);
    const nx = d > 1e-7 ? dx/d : fallback.x, ny = d > 1e-7 ? dy/d : fallback.y;
    const total = a.invMass+b.invMass;
    const correction = Math.max(0,range-d-.005) * .86 / total;
    a.x -= nx*correction*a.invMass; a.y -= ny*correction*a.invMass;
    b.x += nx*correction*b.invMass; b.y += ny*correction*b.invMass;
    const relative = (b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
    const withBall = b === this.ball || a === this.ball;
    if(withBall){
      const player=a===this.ball?b:a,previous=this.touchTimes.get(player.id)??-10;
      this.releaseKickoff(player);
      // Sample sustained contact too, so the scorer tracker can detect control.
      if(this.time-previous>.075){
        this.events.push({type:'contact',player:player.id,time:this.time,relativeSpeed:Math.hypot(this.ball.vx-player.vx,this.ball.vy-player.vy)});
        this.touchTimes.set(player.id,this.time);
      }
    }
    if (relative >= 0) return;
    // Contact only: the ball is never attached, pulled toward a player or carried
    // by a possession motor. Gentle contacts settle; hard impacts still separate.
    const player=withBall?(a===this.ball?b:a):null;
    const passive=player&&!player.input.shoot&&Math.hypot(player.vx,player.vy)<45;
    const restitution = withBall && relative < -30 ? (passive?C.passiveRestitution:C.ballRestitution) : .02;
    const impulse = -(1+restitution)*relative/total;
    a.vx -= impulse*nx*a.invMass; a.vy -= impulse*ny*a.invMass;
    b.vx += impulse*nx*b.invMass; b.vy += impulse*ny*b.invMass;
    if (withBall) {
      const player = a === this.ball ? b : a;
      const ball=this.ball,sign=b===ball?1:-1,tx=-ny*sign,ty=nx*sign;
      // Tangential contact transfers motion into rotation, without attraction.
      const slip=(ball.vx-player.vx)*tx+(ball.vy-player.vy)*ty-ball.rollSpin*ball.radius;
      const friction=clamp(-slip/(player.invMass+3*ball.invMass),-C.contactFriction*impulse,C.contactFriction*impulse);
      ball.vx+=tx*friction*ball.invMass;ball.vy+=ty*friction*ball.invMass;
      player.vx-=tx*friction*player.invMass;player.vy-=ty*friction*player.invMass;
      ball.rollSpin-=2*ball.invMass*friction/ball.radius;
      this.ball.lastTeam = player.team;this.ball.lastPlayer=player.id;
      const key = player.id, previous = this.contacts.get(key) ?? -10;
      if (this.time - previous > .1) {
        const tangent = (b.vx-a.vx)*(-ny)+(b.vy-a.vy)*nx;
        // Surface rolling sets the curve sign. Opposite contacts can reverse it;
        // merely steering near the ball does not create any force or spin.
        this.ball.spin=clamp(this.ball.spin*.3+tangent*.019,-6,6);
        if (relative < -65) this.events.push({type:'touch',strength:Math.min(1,-relative/600)});
        this.contacts.set(key,this.time);
      }
    }
  }

  wall(body, wall) {
    const [ax,ay,bx,by,nx,ny,e=C.wallRestitution] = wall;
    const sx=bx-ax,sy=by-ay,denom=sx*sx+sy*sy;
    const projection=((body.x-ax)*sx+(body.y-ay)*sy)/denom;
    if(projection < 0 || projection > 1) return; // Endpoints are covered by posts / adjoining walls.
    const signed=(body.x-ax)*nx+(body.y-ay)*ny;
    if(signed>=body.radius) return;
    body.x+=nx*(body.radius-signed); body.y+=ny*(body.radius-signed);
    const into=body.vx*nx+body.vy*ny;
    if(into<0){const bounce=body===this.ball&&into < -25?e:0;
      body.vx-=(1+bounce)*into*nx;body.vy-=(1+bounce)*into*ny;
      if(body===this.ball){body.spin*=.82;if(into < -100){this.events.push({type:'wall',strength:Math.min(1,-into/700),x:body.x,y:body.y,nx,ny,time:this.time});}}}
  }

  post(body, post) {
    const dx=body.x-post.x,dy=body.y-post.y,d=Math.hypot(dx,dy),range=body.radius+(post.radius??this.pitch.postRadius);
    if(d>=range)return;
    const n=d>1e-7?{x:dx/d,y:dy/d}:unit(-body.vx,-body.vy);
    body.x=post.x+n.x*range;body.y=post.y+n.y*range;
    const into=body.vx*n.x+body.vy*n.y;
    if(into<0){const bounce=body===this.ball?.8:0;body.vx-=(1+bounce)*into*n.x;body.vy-=(1+bounce)*into*n.y;
      if(body===this.ball&&into < -90)this.events.push({type:'post',strength:.45});}
  }

  boundaries(body){
    if(body===this.ball){for(const wall of this.walls)this.wall(body,wall);}
    else {for(const wall of this.playerWalls)this.wall(body,wall);}
    // Front posts are solid for both balls and players, unlike the net itself.
    for(const post of this.posts)this.post(body,post);
    for(const cone of this.obstacles)this.post(body,cone);
    this.protectKickoff(body);
  }
  celebrate(dt,animateBall=false){
    this.events=[];
    const count=Math.max(1,Math.ceil(dt/(1/240))),h=dt/count;
    for(let s=0;s<count;s++){
      this.time+=h;
      for(const p of this.players){this.motor(p,h);p.x+=p.vx*h;p.y+=p.vy*h;}
      // A scored ball still rolls, curves and bounces in the net during the GOAL display.
      // This does not check for another score or start a second kickoff.
      if(animateBall){
        const b=this.ball,angle=b.spin*C.spinCurve*h,cs=Math.cos(angle),sn=Math.sin(angle);
        const vx=b.vx*cs-b.vy*sn,vy=b.vx*sn+b.vy*cs,drag=Math.exp(-C.ballDrag*h);
        b.vx=vx*drag;b.vy=vy*drag;b.spin*=Math.exp(-C.spinDecay*h);b.rollSpin*=Math.exp(-1.8*h);
        this.limitBall();b.x+=b.vx*h;b.y+=b.vy*h;
        b.angle+=((Math.hypot(b.vx,b.vy)/b.radius+b.spin)*.35+b.rollSpin)*h;
      }
      for(let iteration=0;iteration<5;iteration++){
        for(let i=0;i<this.players.length;i++)for(let j=i+1;j<this.players.length;j++)this.discs(this.players[i],this.players[j]);
        if(animateBall)for(const p of this.players)this.discs(p,this.ball);
        for(const p of this.players)this.boundaries(p);
        if(animateBall)this.boundaries(this.ball);
      }
      if(animateBall)this.limitBall();
    }
  }

  step(dt) {
    this.events=[];
    // At the maximum ball speed each substep moves less than half its radius.
    const count=Math.max(1,Math.ceil(dt/(1/240))),h=dt/count;
    for(let s=0;s<count;s++){
      this.time+=h;
      for(const p of this.players)this.protectKickoff(p);
      for(const p of this.players)this.motor(p,h);
      for(const p of this.players)if(p.input.shoot)this.shoot(p);
      const b=this.ball,angle=b.spin*C.spinCurve*h,cs=Math.cos(angle),sn=Math.sin(angle);
      const vx=b.vx*cs-b.vy*sn,vy=b.vx*sn+b.vy*cs,drag=Math.exp(-C.ballDrag*h);
      b.vx=vx*drag;b.vy=vy*drag;b.spin*=Math.exp(-C.spinDecay*h);b.rollSpin*=Math.exp(-1.8*h);
      this.limitBall();
      const bodies=[...this.players,b];
      for(const body of bodies){body.x+=body.vx*h;body.y+=body.vy*h;}
      b.angle+=((Math.hypot(b.vx,b.vy)/b.radius+b.spin)*.35+b.rollSpin)*h;
      for(let iteration=0;iteration<5;iteration++){
        for(const p of this.players)this.protectKickoff(p);
        for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++)this.discs(bodies[i],bodies[j]);
        for(const body of bodies)this.boundaries(body);
      }
      this.limitBall();

      // This timer advances during live play, not during the kickoff countdown.
      if(this.kickoff){
        this.kickoff.remaining=Math.max(0,this.kickoff.remaining-h);
        if(this.kickoff.remaining<=1e-9)this.kickoff=null;
      }

      const p=this.pitch;
      if(b.y-b.radius>p.goalTop&&b.y+b.radius<p.goalBottom){
        if(b.x+b.radius<p.left)return this.sidesSwapped?'red':'blue';
        if(b.x-b.radius>p.right)return this.sidesSwapped?'blue':'red';
      }
    }
    return null;
  }
}
