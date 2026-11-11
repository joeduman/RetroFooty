import {AIController as LegacyController} from './ai-legacy.mjs';
import {TUNING as C, clamp, distance, unit} from './config.mjs';
import {kickDirection} from './physics.mjs';
import {forecastBall, reachTime, interceptBall, evaluateKick, bankTarget} from './ai-prediction.mjs';
import {ActiveOpponentMemory} from './ai-active-memory.mjs';

export const EXPERT_VERSION='expert-predictive-1';
const arrival=race=>race.reachable?race.t:race.arrival;

// The frozen controller retains difficulty/model/trainer contracts. Expert
// planning writes legal inputs only; all forward physics is read-only.
export class AIController extends LegacyController {
  constructor(engine,seed=1){
    super(engine,seed);this.version=EXPERT_VERSION;this.activeMemory=new ActiveOpponentMemory();
    this.forecast=[];this.races=new Map();this.diagnostics=new Map();this.intentions={};
  }
  reset(){
    super.reset();this.forecast=[];this.races?.clear();this.diagnostics?.clear();this.intentions={};this.activeMemory?.resetMotion();
    for(const m of this.memory.values())Object.assign(m,{progressAt:0,progressX:null,loops:0,escapeUntil:0,lastTarget:null});
  }
  observe(){super.observe();this.activeMemory.observe(this.engine);}
  expert(player){return this.teamDifficulty[player.team]==='expert';}
  planTeams(){
    super.planTeams();if(!Object.values(this.teamDifficulty).includes('expert'))return;
    const {players,ball:b,time}=this.engine;
    this.forecast=forecastBall(this.engine,{horizon:1.6,interval:.08});this.races.clear();
    for(const q of players)this.races.set(q.id,{walk:interceptBall(q,this.forecast,{boost:false}),boost:interceptBall(q,this.forecast,{boost:true})});
    for(const team of ['red','blue']){
      if(this.teamDifficulty[team]!=='expert')continue;
      const plan=this.plans[team],mates=players.filter(q=>q.team===team),opponents=players.filter(q=>q.team!==team);
      plan.enemyArrival=Math.min(...opponents.map(q=>arrival(this.races.get(q.id).boost)));plan.solo=mates.length===1;plan.ballDestination=this.forecast.at(-1);
      if(!plan.frontPostThreat&&!plan.goalThreat&&!this.engine.kickoff){
        const previous=plan.chaser;
        const score=q=>arrival(this.races.get(q.id).boost)+Math.max(0,(q.x-b.x)*plan.dir)/C.walkSpeed*.28-
          (q===previous ? .12:0)-(b.lastPlayer===q.id&&distance(q,b)<65 ? .18:0);
        const chaser=mates.reduce((best,q)=>score(q)<score(best)?q:best,mates[0]);
        if(chaser!==plan.chaser){
          const oldCover=plan.cover;plan.chaser=chaser;
          if(oldCover===chaser)plan.cover=mates.filter(q=>q!==chaser&&!q.human).sort((a,c)=>(a.x-plan.own)*plan.dir-(c.x-plan.own)*plan.dir)[0]||null;
          const supports=mates.filter(q=>q!==chaser&&q!==plan.cover&&!q.human).sort((a,c)=>a.number-c.number);
          plan.anchor=mates.length>=4?supports[0]:null;plan.finisher=null;
        }
      }
      const controller=mates.reduce((best,q)=>distance(q,b)<distance(best,b)?q:best,mates[0]);
      plan.possession=distance(controller,b)<85&&distance(controller,b)<plan.opponentNear+35&&(b.lastTeam===team||plan.opponentNear>110);
      const goal=this.forecast.find(q=>q.goal&&q.goal!==team);if(goal){plan.goalThreat=true;plan.goalArrival=goal.t;}
    }
    this.nextPlan=time+.10;
  }
  lane(a,b,obstacles){
    const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;let clear=200;
    for(const q of obstacles){const t=clamp(((q.x-a.x)*dx+(q.y-a.y)*dy)/(length||1),0,1);
      clear=Math.min(clear,Math.hypot(q.x-a.x-t*dx,q.y-a.y-t*dy)-q.radius-C.ballRadius);}
    return clear;
  }
  chooseAim(player,m){
    if(!this.expert(player))return super.chooseAim(player,m);
    const {pitch:p,ball:b,players,time}=this.engine,plan=this.plans[player.team],dir=plan.dir;
    const opponents=players.filter(q=>q.team!==player.team),mates=players.filter(q=>q.team===player.team&&q!==player);
    const goalX=dir===1?p.right+12:p.left-12,range=Math.abs(goalX-b.x),progress=(b.x-plan.own)*dir;
    const nearOwn=progress<(p.right-p.left)*.27,policy=this.teamPolicy[player.team],options=[];
    const add=(point,type,score,extra={})=>options.push({point,type,score,...extra});
    for(const f of [.16,.33,.5,.67,.84]){
      const point={x:goalX,y:p.goalTop+(p.goalBottom-p.goalTop)*f},lane=this.lane(b,point,opponents);
      const stopping=(C.shotSpeed+C.shotMomentum*Math.hypot(player.vx,player.vy))/C.ballDrag;
      add(point,'shot',(145-range*.12+clamp(lane,-70,100)*.70+(range<350?35:0)-(range>stopping*.93?100:0)-(nearOwn?55:0))*policy.shotPreference);
    }
    for(const mate of mates){
      const d=distance(mate,b);if(d<80||d>650)continue;
      const flight=clamp(-Math.log(Math.max(.08,1-d*C.ballDrag/(C.shotSpeed+50)))/C.ballDrag,.1,.9);
      const point={x:clamp(mate.x+mate.vx*flight*.75+dir*16,p.left+40,p.right-40),y:clamp(mate.y+mate.vy*flight*.75,p.top+40,p.bottom-40)};
      const lane=this.lane(b,point,opponents),forward=(point.x-b.x)*dir,space=Math.min(200,...opponents.map(q=>distance(q,point)));
      const nextLane=this.lane(point,{x:goalX,y:p.height/2},opponents),nextRange=Math.abs(goalX-point.x);
      const nextAction=nextRange<400?clamp(nextLane,-30,80)*.18+15:0;
      add(point,'pass',(65+forward*.18+clamp(lane,-70,100)*.8+space*.13+nextAction+(nearOwn?30:0))*policy.passPreference,{receiver:mate.id});
      if(lane<30&&d>160)for(const wallY of [p.top+b.radius,p.bottom-b.radius]){
        const bank=bankTarget(b,point,wallY);if(!bank)continue;
        const clear=Math.min(this.lane(b,bank.hit,opponents),this.lane(bank.hit,point,opponents));
        add(bank.point,'bank',(55+forward*.13+clamp(clear,-60,90)*.65-bank.pathLength*.035)*policy.bankPreference,{receiver:mate.id,landing:point});
      }
    }
    if(range<480)for(const wallY of [p.top+b.radius,p.bottom-b.radius]){
      const destination={x:goalX,y:p.height/2},bank=bankTarget(b,destination,wallY);
      if(bank&&bank.pathLength<(C.shotSpeed+120)/C.ballDrag*.85){
        const lane=Math.min(this.lane(b,bank.hit,opponents),this.lane(bank.hit,destination,opponents));
        add(bank.point,'bank-shot',(110-range*.07+clamp(lane,-60,100)*.6)*policy.bankPreference,{landing:destination});
      }
    }
    const pressure=Math.min(999,...opponents.map(q=>distance(q,b))),stale=(m.loops||0)>1||m.escapeUntil>time;
    for(const side of [-1,0,1]){
      const point={x:clamp(b.x+dir*(pressure>220?230:140),p.left+35,p.right-35),y:clamp(b.y+side*(pressure<130?125:90),p.top+40,p.bottom-40)};
      const lane=this.lane(b,point,opponents),space=Math.min(180,...opponents.map(q=>distance(q,point)));
      add(point,'advance',70+clamp(lane,-60,100)*.5+space*.15+(range>400?20:0)+(stale&&side!==0?25:0),{controlled:true});
    }
    if(nearOwn||stale||b.y<p.top+35||b.y>p.bottom-35){
      const side=b.y<p.height/2?-1:1;
      for(const offset of [side*140,-side*140]){
        const point={x:clamp(b.x+dir*280,p.left+40,p.right-40),y:clamp(b.y+offset,p.top+45,p.bottom-45)};
        add(point,nearOwn?'clear':'escape',95+clamp(this.lane(b,point,opponents),-60,100)*.6+(nearOwn?45:0)+(stale?35:0));
      }
    }
    for(const o of options){
      if(this.ownGoalRisk(b,o.point,plan)){o.score=-10000;continue;}
      if(nearOwn&&((o.landing||o.point).x-b.x)*dir<40)o.score-=130;
      const normal=unit(b.x-player.x,b.y-player.y),aim=unit(o.point.x-b.x,o.point.y-b.y),alignment=normal.x*aim.x+normal.y*aim.y;
      o.score-=Math.max(0,.7-alignment)*(pressure<100?38:14);
    }
    options.sort((a,c)=>c.score-a.score);
    // Retain each tactical family so five similar goal samples cannot crowd
    // out a safe outlet before dynamic interception costs are considered.
    const evaluated=options.slice(0,10);
    for(const type of ['shot','pass','bank','bank-shot','advance','clear','escape']){
      const option=options.find(o=>o.type===type);if(option&&!evaluated.includes(option))evaluated.push(option);
    }
    for(const o of evaluated){
      if(o.score<-1000)continue;
      const receiver=players.find(q=>q.id===o.receiver);
      const result=evaluateKick(this.engine,player,o.point,{opponents,receiver,bank:['bank','bank-shot'].includes(o.type),destination:o.landing,assumeAligned:true});
      o.forecast=result;o.score-=result.interceptionRisk*65;
      if(result.goal&&result.goal!==player.team){o.score=-10000;continue;}
      if(o.type==='shot'||o.type==='bank-shot')o.score+=result.goal===player.team?35:-30;
      if(receiver&&result.arrival>1.7)o.score-=30;
      if(receiver){
        o.score-=clamp(-(result.receiveMargin??0),0,1)*65;
        o.score-=clamp(result.targetMiss-40,0,160)*.25;
      }
    }
    evaluated.sort((a,c)=>c.score-a.score);let best=evaluated[0];
    const prior=evaluated.find(o=>o.type===m.aim?.type&&o.receiver===m.aim?.receiver&&distance(o.point,m.aim.point)<65);
    if(prior&&prior.score>best.score-7&&!stale)best=prior;
    m.aim=best;m.nextAim=time+(distance(player,b)<130?.12:.24);
    m.candidates=evaluated.map(o=>({type:o.type,score:+o.score.toFixed(2),receiver:o.receiver,risk:o.forecast?.interceptionRisk}));
    if(best.receiver)this.intentions[player.team]={sender:player.id,receiver:best.receiver,point:best.landing||best.point,until:time+.5};
    return best;
  }
  chase(player,m){
    if(!this.expert(player))return super.chase(player,m);
    const {ball:b,pitch:p,time,players}=this.engine,plan=this.plans[player.team],dir=plan.dir;
    if(!m.aim||time>=m.nextAim)this.chooseAim(player,m);
    const d=distance(player,b),race=this.races.get(player.id),opponents=players.filter(q=>q.team!==player.team);
    const rival=opponents.reduce((best,q)=>!best||distance(q,b)<distance(best,b)?q:best,null),pressure=rival?distance(rival,b):999;
    const eta=race?arrival(race.boost):reachTime(player,b),aim=unit(m.aim.point.x-b.x,m.aim.point.y-b.y),normal=unit(b.x-player.x,b.y-player.y);
    const aligned=normal.x*aim.x+normal.y*aim.y,contact=player.radius+b.radius,targetBall=d>95&&race?.boost.reachable?race.boost:b;
    let x=targetBall.x-aim.x*(contact+4),y=targetBall.y-aim.y*(contact+4),action='intercept',waypoint=null;
    const goalSide=(player.x-b.x)*dir< -12,enemyControls=pressure<52&&b.lastTeam!==player.team,enemyArrival=plan.enemyArrival??Infinity;
    if(enemyControls&&goalSide&&!plan.goalThreat&&enemyArrival+.16<eta&&d>85&&(plan.solo||!plan.cover||plan.cover===player)){
      const toward=unit(plan.own-b.x,p.height/2-b.y),tendency=this.activeMemory.tendency(rival);
      const adaptation=tendency.confidence>.45?12*tendency.reverse-8*tendency.straight*tendency.boost:0;
      const gap=clamp(d*.6+adaptation,70,145);
      x=b.x+toward.x*gap;y=b.y+toward.y*gap+(tendency.confidence>.3?tendency.lateralBias*16:0);action='contain';
    }else if(d<150&&aligned<.93){
      // Follow an arc around the collision disc toward the rear contact face.
      // A fixed lateral waypoint deadlocks before the required contact angle.
      const angle=Math.atan2(player.y-b.y,player.x-b.x),rear=Math.atan2(-aim.y,-aim.x);
      let turn=Math.atan2(Math.sin(rear-angle),Math.cos(rear-angle));
      if(Math.abs(turn)>3.05)turn=m.side*Math.abs(turn);
      const next=angle+clamp(turn,-.65,.65),radius=clamp(d,contact+18,75);
      waypoint={x:b.x+Math.cos(next)*radius,y:b.y+Math.sin(next)*radius};
      x=b.x-aim.x*(contact+18);y=b.y-aim.y*(contact+18);action='shape-touch';
    }else if(d<65&&aligned>.7){x=b.x+aim.x*42;y=b.y+aim.y*42;action='control';}
    const actual=kickDirection(normal,aim),safe=!this.ownGoalRisk(b,{x:b.x+actual.x*1000,y:b.y+actual.y*1000},plan);
    const goalX=dir===1?p.right:p.left,t=(goalX-b.x)/(actual.x||1e-9),shotY=b.y+actual.y*t;
    const onTarget=t>0&&shotY>p.goalTop+b.radius+4&&shotY<p.goalBottom-b.radius-4;
    const isShot=['shot','bank-shot'].includes(m.aim.type),bank=m.aim.type==='bank-shot';
    const legal=d<contact+C.shotReach,accurate=aligned>(isShot?.985:.95);
    // Arm through a duel and cooldown: the engine alone decides when contact
    // and cooldown permit an impulse. Waiting for last-frame contact loses
    // otherwise winnable challenges to the opponent's already held button.
    const contested=pressure<105&&d<115&&aligned>.70;
    const shoot=safe&&((legal&&accurate&&(!isShot||onTarget||bank))||contested);
    const emergency=plan.goalThreat&&d>55,walkArrival=race?arrival(race.walk):reachTime(player,targetBall,{boost:false});
    const duel=pressure<70&&d>45&&d<115&&goalSide&&player.stamina>35;
    const useful=duel||(Boolean(race?.boost.reachable)&&action!=='contain'&&walkArrival-eta>.08&&
      ((eta<enemyArrival+.08&&walkArrival>enemyArrival-.05)||(pressure>100&&d>75&&goalSide&&b.vx*dir>50)||emergency));
    const target={x,y,waypoint,aimX:aim.x,aimY:aim.y,shoot,close:true,emergency,urgent:useful,burst:useful,
      commit:pressure<70&&d<100,action,boostUseful:useful,raceArrival:eta};m.lastTarget=target;return target;
  }
  cover(player,plan){
    const target=super.cover(player,plan);if(!this.expert(player))return target;
    const m=this.memory.get(player.id);
    const intent=this.intentions[player.team],{time,ball:b,pitch:p}=this.engine;
    // In a partnership the sweeper is also the only passing outlet. Prepare a
    // selected reception without relinquishing cover of an immediate threat.
    if(plan.solo!==true&&!plan.frontPostThreat&&!plan.goalThreat&&intent?.receiver===player.id&&intent.until>time&&
      b.lastTeam===player.team&&(b.x-plan.own)*plan.dir>(p.right-p.left)*.4){
      target.x=intent.point.x;target.y=intent.point.y;target.action='receive';target.urgent=false;
      m.lastTarget=target;return target;
    }
    target.action=plan.frontPostThreat?'near-post':plan.goalThreat?'deny-shot':'cover';m.lastTarget=target;return target;
  }
  support(player,plan){
    const target=super.support(player,plan);if(!this.expert(player))return target;
    const intent=this.intentions[player.team],m=this.memory.get(player.id);
    if(intent?.receiver===player.id&&intent.until>this.engine.time&&player!==plan.anchor){target.x=intent.point.x;target.y=intent.point.y;target.action='receive';}
    else target.action=m.runUntil>this.engine.time?'give-and-go':player===plan.anchor?'anchor':'passing-support';
    const supports=this.engine.players.filter(q=>q.team===player.team&&q!==plan.chaser&&q!==plan.cover&&q!==plan.anchor);
    if(supports.length===1&&player!==plan.anchor&&target.action!=='receive'){
      const p=this.engine.pitch,b=this.engine.ball;
      const weakSide=b.y<p.height/2?.73:.27;
      target.y=p.top+(p.bottom-p.top)*weakSide;
    }
    m.lastTarget=target;return target;
  }
  update(){
    super.update();const {players,ball:b,time}=this.engine;
    for(const player of players){
      if(player.human||!this.expert(player))continue;
      const m=this.memory.get(player.id),target=m.lastTarget,plan=this.plans[player.team];if(!target)continue;
      if(time>=m.progressAt){
        const fieldProgress=(b.x-(m.progressX??b.x))*plan.dir,controlling=distance(player,b)<110&&plan.chaser===player;
        m.loops=controlling&&fieldProgress<14?(m.loops||0)+1:Math.max(0,(m.loops||0)-1);
        if(m.loops>=3){m.escapeUntil=time+1.2;m.nextAim=0;m.followUntil=0;}
        m.progressX=b.x;m.progressAt=time+.8;
      }
      if(target.close&&!target.frontPost){
        const destination=target.waypoint||target,dx=destination.x-player.x,dy=destination.y-player.y,d=Math.hypot(dx,dy),toward=unit(dx,dy,0,0);
        const speed=player.vx*toward.x+player.vy*toward.y,braking=speed>0?speed*speed/(2*C.braking):0,amount=clamp((d-braking)/18,0,1);
        player.input.x=toward.x*amount;player.input.y=toward.y*amount;m.steerX=player.input.x;m.steerY=player.input.y;
        if(!target.boostUseful&&!target.emergency){player.input.sprint=false;m.sprint=false;}
      }
      if(player.input.shoot){
        const normal=unit(b.x-player.x,b.y-player.y),aim=unit(player.input.aimX,player.input.aimY),actual=kickDirection(normal,aim);
        if(this.ownGoalRisk(b,{x:b.x+actual.x*1000,y:b.y+actual.y*1000},plan))player.input.shoot=false;
        else if(distance(player,b)<player.radius+b.radius+C.shotReach){
          const outcome=evaluateKick(this.engine,player,{x:b.x+aim.x*1000,y:b.y+aim.y*1000});
          if(outcome.goal&&outcome.goal!==player.team)player.input.shoot=false;
        }
      }
      this.diagnostics.set(player.id,{version:this.version,action:target.action,role:plan.chaser===player?'chaser':plan.cover===player?'sweeper':'support',
        target:{x:target.x,y:target.y},aim:m.aim?.type,receiver:m.aim?.receiver,alternatives:m.candidates,
        ballDestination:plan.ballDestination,boost:player.input.sprint,boostUseful:target.boostUseful??target.emergency??false,arrival:target.raceArrival,loops:m.loops});
    }
  }
}
