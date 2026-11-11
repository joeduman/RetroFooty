import {kickDirection} from './physics.mjs';
import { TUNING as C, clamp, distance, unit, seededRandom } from './config.mjs';
import {DEFAULT_POLICY,clampPolicy,DIFFICULTIES,tacticalContext} from './ai-policy.mjs';
import {neuralFeatures,inferNeural,validateNeuralModel,blendNeural,humanAction} from './neural-policy.mjs';

function lineClearance(a, b, obstacles, ignore) {
  const dx=b.x-a.x,dy=b.y-a.y,denom=dx*dx+dy*dy;
  let clearance=250;
  for(const q of obstacles){
    if(q===ignore)continue;
    const t=clamp(((q.x-a.x)*dx+(q.y-a.y)*dy)/(denom||1),0,1);
    if(t<.08||t>.96)continue;
    clearance=Math.min(clearance,Math.hypot(q.x-a.x-t*dx,q.y-a.y-t*dy)-q.radius-C.ballRadius);
  }
  return clearance;
}

// Bots only choose movement and a shoot button. The human and every bot use
// exactly the same motor, stamina, contact solver and kick impulse.
export class AIController {
  constructor(engine, seed=1) {
    this.engine=engine;this.random=seededRandom(seed);this.nextPlan=0;this.plans={};this.deliveries={};this.memory=new Map();
    this.neuralPolicies={red:null,blue:null};this.neuralTraining=false;this.trainingObserver=null;
    this.teamPolicy={red:{...DEFAULT_POLICY},blue:{...DEFAULT_POLICY}};this.teamDifficulty={red:'expert',blue:'expert'};this.opponentStyle={red:{boost:0,aggressive:0,samples:0},blue:{boost:0,aggressive:0,samples:0}};this.nextObservation=0;this.learningContexts={};
    for(const p of engine.players)this.memory.set(p.id,{
      bias:this.random()*2-1,side:this.random()<.5?-1:1,nextAim:0,aim:null,
      lastX:p.x,lastY:p.y,checkAt:0,stuck:0,retreatUntil:0,sprint:false,
      steerReady:false,steerX:0,steerY:0,steerAt:engine.time,carrySince:engine.time,followUntil:0,followPoint:null,supportTarget:null,nextSupport:0,runUntil:0,sprintUntil:0,restUntil:0,circleUntil:0,circleSide:1,nextNeural:0,neuralPrediction:null,neuralAction:null
    });
  }

  setPolicy(policy,team=null){const clean=clampPolicy(policy);for(const t of team?[team]:['red','blue'])if(this.teamPolicy[t])this.teamPolicy[t]={...clean};}
  setNeuralPolicy(model,team=null){if(model!==null&&!validateNeuralModel(model))return false;for(const t of team?[team]:['red','blue'])if(t in this.neuralPolicies)this.neuralPolicies[t]=model;return true;}
  setLearningContexts(contexts){this.learningContexts=contexts&&typeof contexts==='object'?contexts:{};}
  setDifficulty(difficulty,team=null){if(!DIFFICULTIES[difficulty])return;for(const t of team?[team]:['red','blue'])if(this.teamDifficulty[t])this.teamDifficulty[t]=difficulty;}
  observe(){const {time,players,ball}=this.engine;if(time<this.nextObservation)return;this.nextObservation=time+.15;
    for(const p of players){if(!p.human)continue;const r=this.opponentStyle[p.team],near=distance(p,ball)<170;r.samples++;
      r.boost=r.boost*.97+Number(p.input.sprint)*.03;r.aggressive=r.aggressive*.97+Number(near&&Math.hypot(p.input.x,p.input.y)>.4)*.03;}
  }
  reset(){
    this.nextPlan=0;this.plans={};this.deliveries={};
    for(const player of this.engine.players){const m=this.memory.get(player.id);
      Object.assign(m,{steerReady:false,steerX:0,steerY:0,steerAt:this.engine.time,carrySince:this.engine.time,followUntil:0,followPoint:null,nextAim:0,aim:null,stuck:0,retreatUntil:0,sprint:false,
        supportTarget:null,nextSupport:0,runUntil:0,sprintUntil:0,restUntil:0,circleUntil:0,circleSide:m.side,nextNeural:0,neuralPrediction:null,neuralAction:null,lastX:player.x,lastY:player.y,checkAt:this.engine.time+.65});}
  }

  onKick(id){
    const player=this.engine.players.find(p=>p.id===id),m=this.memory.get(id);
    if(!player||player.human||!m?.aim)return;
    m.carrySince=this.engine.time;
    if(['advance','bank-run'].includes(m.aim.type)){
      m.followUntil=this.engine.time+.65;m.followPoint={...(m.aim.landing||m.aim.point)};
    }
    if(!m.aim.receiver)return;
    this.deliveries[player.team]={receiver:m.aim.receiver,until:this.engine.time+1.6};
    m.runUntil=this.engine.time+1.5;m.nextAim=0;this.nextPlan=0;
  }

  planTeams(){
    const {players,ball:b,pitch:p,time}=this.engine;
    for(const team of ['red','blue']){
      const dir=this.engine.attackDir(team),own=dir===1?p.left:p.right;
      const mates=players.filter(q=>q.team===team),old=this.plans[team];
      const predicted={x:clamp(b.x+b.vx*.22,p.left+20,p.right-20),y:clamp(b.y+b.vy*.22,p.top+20,p.bottom-20)};
      // Include the human in the race so teammates make space when you have it.
      let chaser=mates[0],best=Infinity;
      for(const q of mates){
        const wrongSide=Math.max(0,(q.x-b.x)*dir)*.5;
        const delivery=this.deliveries[team];
        const receiving=delivery?.until>time&&delivery.receiver===q.id&&b.lastTeam===team;
        const score=distance(q,predicted)+wrongSide-(old?.chaser===q?45:0)-(receiving?140:0)-(b.lastPlayer===q.id&&distance(q,b)<65?55:0);
        if(score<best){best=score;chaser=q;}
      }
      const remaining=mates.filter(q=>q!==chaser&&!q.human);
      // Cover rotates with play. It is not a fixed position or a human role.
      const cover=mates.length>1?remaining.sort((a,b)=>
        ((a.x-own)*dir-(old?.cover===a?65:0))-((b.x-own)*dir-(old?.cover===b?65:0)))[0]:null;
      const opponents=players.filter(q=>q.team!==team),opponentNear=Math.min(...opponents.map(q=>distance(q,b)));
      const goalDistance=(b.x-own)*dir;
      const opposingStyle=this.opponentStyle[team==='red'?'blue':'red'];
      const corner=b.y<p.goalTop||b.y>p.goalBottom;
      const frontPostThreat=corner&&goalDistance<Math.max(205,(p.right-p.left)*.2)*(1+Math.min(.25,opposingStyle.aggressive*.25))&&opponentNear<170;
      const possession=(distance(chaser,b)<Math.min(200,opponentNear+35)&&b.lastTeam===team);
      const crossing=(own-b.x)/(b.vx||1),goalY=b.y+b.vy*crossing;
      const goalThreat=b.vx*dir< -65&&crossing>0&&crossing<2.5&&Math.abs(b.vx)/C.ballDrag>Math.abs(own-b.x)&&goalY>p.goalTop-55&&goalY<p.goalBottom+55;
      const support=remaining.filter(q=>q!==cover).sort((a,b)=>a.number-b.number);
      const anchor=mates.length>=4?support[0]:null;
      // A second challenger is useful at the opponent's goal, but retain cover.
      const nearTheirGoal=(p.right-p.left)-goalDistance<145;
      const finisher=nearTheirGoal&&opponentNear<75?remaining.filter(q=>q!==cover).sort((a,c)=>distance(a,b)-distance(c,b))[0]:null;
      this.plans[team]={chaser,cover,anchor,finisher,dir,own,possession,goalThreat,frontPostThreat,opponentNear,at:time};
    }
    this.nextPlan=time+.065;
  }

  chooseAim(player, memory){
    const {players,ball:b,pitch:p}=this.engine,plan=this.plans[player.team],dir=plan.dir;
    const goalX=dir===1?p.right+20:p.left-20,opponents=players.filter(q=>q.team!==player.team);
    const toGoal=Math.abs(goalX-b.x),policy=this.teamPolicy[player.team],difficulty=DIFFICULTIES[this.teamDifficulty[player.team]];
    const ownHalf=(b.x-plan.own)*dir<(p.right-p.left)*.52,nearOwnGoal=(b.x-plan.own)*dir<(p.right-p.left)*.27;
    const humanTendency=this.learningContexts[tacticalContext({size:Math.max(1,players.length/2),pitch:p,ball:b,player,opponents,attackDir:this.engine.attackDir(player.team)})];
    const historyWeight=humanTendency?.samples>=12?Math.min(1,Math.log10(humanTendency.samples)/3):0;
    const options=[];
    for(const y of [p.goalTop+24,p.height/2,p.goalBottom-24]){
      const point={x:goalX,y};
      const clear=lineClearance(b,point,players,player),range=distance(b,point);
      // Commit to an open finish; avoid passing forever around the penalty area.
      const finish=clear>8&&range<C.shotSpeed/C.ballDrag*.88?32+(500-Math.min(500,range))*.045:0;
      options.push({point,type:'shot',score:(80-toGoal*.045+clamp(clear,-45,70)*.8+finish-(clear<0?45:0))*policy.shotPreference-(nearOwnGoal?100:ownHalf?45:0)+(historyWeight?(humanTendency.kick||0)*16*historyWeight:0)});
    }
    for(const mate of players){
      if(mate===player||mate.team!==player.team)continue;
      const d=distance(mate,b),power=C.shotSpeed+C.shotMomentum*Math.hypot(player.vx,player.vy);
      if(d<100||d>Math.min(720,power/C.ballDrag*.84))continue;
      const lead=clamp(-Math.log(1-d*C.ballDrag/power)/C.ballDrag,.18,.6);
      const point={x:clamp(mate.x+mate.vx*lead+dir*22,p.left+35,p.right-35),
        y:clamp(mate.y+mate.vy*lead,p.top+35,p.bottom-35)};
      const progress=(point.x-b.x)*dir,space=Math.min(...opponents.map(q=>distance(q,point)));
      const blockers=players.filter(q=>q!==player&&q!==mate),clear=lineClearance(b,point,blockers);
      options.push({point,type:'pass',receiver:mate.id,score:(45+progress*.1+Math.min(space,180)*.13+clamp(clear,-55,65)*.9-(clear<0?55:0))*policy.passPreference+(ownHalf?38:0)+(nearOwnGoal?28:0)+(historyWeight?(1-(humanTendency.kick||0))*6*historyWeight:0)});
      // Reflection across a side wall gives an actual bank pass, resolved by physics.
      if(clear<20&&d>190){
        const wallY=mate.y<p.height/2?p.top+C.ballRadius:p.bottom-C.ballRadius;
        const reflected={x:point.x,y:2*wallY-point.y};
        const t=(wallY-b.y)/(reflected.y-b.y),hit={x:b.x+(reflected.x-b.x)*t,y:wallY};
        if(t>0&&t<1&&hit.x>p.left+55&&hit.x<p.right-55){
          const open=Math.min(lineClearance(b,hit,blockers),lineClearance(hit,point,blockers));
          const pathLength=distance(b,hit)+distance(hit,point)/C.wallRestitution;
          if(pathLength<power/C.ballDrag*.84)options.push({point:reflected,type:'bank',receiver:mate.id,score:(30+progress*.06+clamp(open,-55,60)*.85)*policy.bankPreference});
        }
      }
    }
    const goal={x:goalX,y:p.height/2},directClear=lineClearance(b,goal,players,player);
    if((directClear<25||plan.opponentNear<180)&&toGoal>140){
      for(const wallY of [p.top+C.ballRadius,p.bottom-C.ballRadius]){
        const landing={x:clamp(b.x+dir*Math.min(300,toGoal*.65),p.left+55,p.right-55),y:clamp(b.y,p.top+100,p.bottom-100)};
        const reflected={x:landing.x,y:2*wallY-landing.y},t=(wallY-b.y)/(reflected.y-b.y);
        const hit={x:b.x+(reflected.x-b.x)*t,y:wallY};
        const power=C.shotSpeed+C.shotMomentum*Math.hypot(player.vx,player.vy);
        const length=distance(b,hit)+distance(hit,landing)/C.wallRestitution;
        const clear=Math.min(lineClearance(b,hit,players,player),lineClearance(hit,landing,opponents));
        if(t>0&&t<1&&clear>6&&length<power/C.ballDrag*.9)
          options.push({point:reflected,type:'bank-run',landing,score:(122+clamp(clear,0,60)*.4-toGoal*.025)*policy.bankPreference});
      }
    }
    // Escaping a goalmouth comes before dangerous low-quality attacking shots.
    if(nearOwnGoal){const center=p.height/2,sign=b.y<center?-1:1;
      const outlet={x:clamp(b.x+dir*330,p.left+60,p.right-60),y:clamp(b.y+sign*150,p.top+50,p.bottom-50)};
      const clear=lineClearance(b,outlet,players,player);
      options.push({point:outlet,type:'clear',score:(135+clamp(clear,-40,80)*.6)*policy.defensiveClearance});
    }
    // Take ground with a forward touch instead of carrying at walking pace.
    const tired=opponents.some(q=>q.stamina<28&&distance(q,b)<260);
    const outlet={x:clamp(b.x+dir*260,p.left+45,p.right-45),y:clamp(b.y+memory.side*25,p.top+35,p.bottom-35)};
    const lane=lineClearance(b,outlet,players,player);
    if(toGoal>290&&lane>16){
      const held=this.engine.time-memory.carrySince;
      options.push({point:outlet,type:'advance',score:85+Math.min(35,held*14)+(tired?22:0)+Math.min(20,lane*.25)});
    }
    // The runoff now lets a bot stand behind an edge ball and play it inward.
    const edgeX=b.x<p.left+26?1:b.x>p.right-26?-1:0;
    const edgeY=b.y<p.top+26?1:b.y>p.bottom-26?-1:0;
    const byGoal=b.y>p.goalTop-30&&b.y<p.goalBottom+30;
    if(edgeY||(edgeX&&!byGoal)){
      options.push({point:{x:b.x+(edgeX||dir*.7)*200,y:b.y+(edgeY||memory.side*.5)*200},type:'escape',score:180});
    }else if(memory.stuck>1.2){
      const contact=unit(b.x-player.x,b.y-player.y);
      options.push({point:{x:b.x+contact.x*200,y:b.y+contact.y*200},type:'escape',score:150});
    }
    // Reject a clearance/back-pass whose ray crosses our own goal mouth.
    for(const option of options){
      if(this.ownGoalRisk(b,option.point,plan))option.score=-10000;
      // Avoid a lateral giveaway across our own penalty area, even if its ray
      // misses the net. Prefer an outlet along the nearest touchline.
      const progress=(option.point.x-b.x)*dir;
      const crossesCenter=(b.y-p.height/2)*(option.point.y-p.height/2)<0;
      if(nearOwnGoal&&(progress<80||crossesCenter)&&option.type!=='escape')option.score-=110;
    }
    options.sort((a,b)=>b.score-a.score);
    const previous=options.find(o=>o.type===memory.aim?.type&&o.receiver===memory.aim?.receiver&&distance(o.point,memory.aim.point)<85);
    memory.aim=previous&&previous.score>=options[0].score-8?previous:options[0];
    memory.nextAim=this.engine.time+difficulty.reaction+(distance(player,b)>110?.05:0)+this.random()*.015;
    return memory.aim;
  }

  ownGoalRisk(from,point,plan){
    const p=this.engine.pitch,dx=point.x-from.x,dy=point.y-from.y;
    if(dx*plan.dir>=-.01)return false;
    const t=(plan.own-from.x)/dx,y=from.y+dy*t;
    return t>0&&y>p.goalTop-16&&y<p.goalBottom+16;
  }

  chase(player,m){
    const {ball:b,pitch:p,time}=this.engine,plan=this.plans[player.team];
    if(!m.aim||time>=m.nextAim)this.chooseAim(player,m);
    const aim=unit(m.aim.point.x-b.x,m.aim.point.y-b.y),d=distance(player,b);
    const skill=DIFFICULTIES[this.teamDifficulty[player.team]],policy=this.teamPolicy[player.team];
    const horizon=clamp(d/(C.sprintSpeed+Math.hypot(b.vx,b.vy)*.6),.02,.4)*skill.prediction*policy.interceptLookahead;
    const targetBall={x:clamp(b.x+b.vx*horizon*.7,p.left+b.radius,p.right-b.radius),
      y:clamp(b.y+b.vy*horizon*.7,p.top+b.radius,p.bottom-b.radius)};
    const contactDistance=player.radius+b.radius+2;
    let tx=targetBall.x-aim.x*contactDistance,ty=targetBall.y-aim.y*contactDistance;
    const relative={x:player.x-b.x,y:player.y-b.y};
    const behind=relative.x*aim.x+relative.y*aim.y;
    const cross=relative.x*(-aim.y)+relative.y*aim.x;
    // Go around the ball to get behind it; do not push an own-goal while lining up.
    if(behind>-15&&d<130){
      if(time>=m.circleUntil){m.circleSide=Math.abs(cross)>20?Math.sign(cross):m.side;m.circleUntil=time+.55;}
      const side=m.circleSide;
      tx=b.x-aim.x*42-aim.y*side*65;ty=b.y-aim.y*42+aim.x*side*65;
    }
    if(d<58&&behind< -17){tx=b.x+aim.x*45;ty=b.y+aim.y*45;}
    const normal=unit(b.x-player.x,b.y-player.y);
    const aligned=normal.x*aim.x+normal.y*aim.y;
    const canShoot=d<C.playerRadius+C.ballRadius+C.shotReach&&aligned>(this.teamDifficulty[player.team]==='expert'?.86:.92)&&player.shotCooldown<=0;
    const opponents=this.engine.players.filter(q=>q.team!==player.team);
    const pressure=Math.min(...opponents.map(q=>distance(q,b)));
    // Small touches while carrying; kick when passing, pressured, or in shooting range.
    const actual=kickDirection(normal,aim);
    const safe=!this.ownGoalRisk(b,{x:b.x+actual.x*1000,y:b.y+actual.y*1000},plan);
    const contested=pressure<105&&d<115&&aligned>.78;
    // Arm the button BEFORE contact and keep it armed through cooldown in duels.
    const shoot=safe&&((canShoot&&(m.aim.type!=='shot'||pressure<105||Math.abs(m.aim.point.x-b.x)<C.shotSpeed/C.ballDrag*.9||m.stuck>.4))||contested);
    // Follow the kick. Retreat only when physically stuck on an edge.
    if(shoot&&m.aim.type==='escape'&&m.stuck>.65)m.retreatUntil=time+.16;
    if(time<m.retreatUntil&&!shoot){tx=player.x-aim.x*25;ty=player.y-aim.y*25;}
    if(time<m.followUntil&&d>70&&m.followPoint){tx=m.followPoint.x;ty=m.followPoint.y;}
    const defensiveEmergency=plan.goalThreat&&d>55;
    // A short approach commitment lets the defender actually finish a challenge.
    // Close possession never disables boost. In 1v1, take more attacking risks.
    const opponentNear=opponents.some(q=>distance(q,b)<q.radius+b.radius+30);
    const solo=this.engine.players.filter(q=>q.team===player.team).length===1;
    return {x:tx,y:ty,aimX:aim.x,aimY:aim.y,shoot,urgent:d>230/policy.press,emergency:defensiveEmergency,close:true,
      burst:d>48&&d<230&&(opponentNear||solo||pressure<d+20)&&player.stamina>35,commit:opponentNear&&d<110};

  }

  cover(player,plan){
    const {pitch:p,ball:b,players}=this.engine,{dir,own}=plan,policy=this.teamPolicy[player.team];
    const progress=(b.x-own)*dir,field=p.right-p.left,cy=p.height/2;
    const incoming=plan.goalThreat||(b.vx*dir< -60&&progress<field*.45);
    const small=players.filter(q=>q.team===player.team).length===2;
    const advance=clamp(progress-(small?215:330)*policy.coverDepth,48,field*(small?.62:.53));
    let x=own+dir*advance,y=cy+(b.y-cy)*.42;
    if(incoming){
      x=own+dir*44;
      const t=Math.max(0,(x-b.x)/(b.vx||1)),dragged=Math.min(1.8,t);
      // Higher levels use trajectory anticipation, lower levels lag the ball.
      const skill=DIFFICULTIES[this.teamDifficulty[player.team]];
      y=clamp(b.y+b.vy*(1-Math.exp(-C.ballDrag*dragged))/C.ballDrag*skill.prediction,p.goalTop+18,p.goalBottom-18);
    }
    if(plan.frontPostThreat){
      // Corner protection: meet the near post on its FIELD side, directly
      // left/right of it. A goal-line target can carry the defender into the net.
      const nearTop=b.y<cy,postY=nearTop?p.goalTop:p.goalBottom;
      x=own+dir*(player.radius+p.postRadius);y=postY;

    }
    const d=distance(player,b),normal=unit(b.x-player.x,b.y-player.y);
    const sign=b.y<cy?-1:1;
    const outlet=unit(dir*1.3,sign*.85);
    const safe=!this.ownGoalRisk(b,{x:b.x+outlet.x*950,y:b.y+outlet.y*950},plan);
    const shoot=safe&&d<player.radius+b.radius+C.shotReach&&normal.x*outlet.x+normal.y*outlet.y>.8;
    return {x,y:clamp(y,p.top+35,p.bottom-35),aimX:outlet.x,aimY:outlet.y,shoot,
      urgent:distance(player,{x,y})>220,emergency:plan.goalThreat&&distance(player,{x,y})>55,frontPost:plan.frontPostThreat};
  }

  support(player,plan){
    const {pitch:p,ball:b,time,players}=this.engine,m=this.memory.get(player.id);
    const supports=players.filter(q=>q.team===player.team&&q!==plan.chaser&&q!==plan.cover&&q!==plan.anchor);
    const index=supports.indexOf(player),count=supports.length;
    const lane=(index+1)/(count+1),cy=p.top+50+lane*(p.bottom-p.top-100);
    const dir=plan.dir,policy=this.teamPolicy[player.team],forward=plan.possession?160:-80;
    const ownGoal=plan.own,progress=(b.x-ownGoal)*dir;
    let x=b.x+dir*(forward+(plan.possession?45:-75));
    if(progress<(p.right-p.left)*.35)x=b.x+dir*(index%2===0?125:-75);
    if(m.runUntil>time&&plan.possession)x=b.x+dir*190;
    let y=cy*.78+b.y*.22+m.bias*16;
    y=p.height/2+(y-p.height/2)*policy.supportWidth;
    if(player===plan.anchor){x=b.x-dir*155;y=p.height/2+(b.y-p.height/2)*.32;}
    // Find an open passing lane and hold it briefly, rather than jittering
    // around a fixed spot or standing directly behind a defender.
    if(!m.supportTarget||time>=m.nextSupport){
      const opponents=players.filter(q=>q.team!==player.team),candidates=[];
      for(const dy of [-45,0,45])for(const dx of [0,55]){
        let targetY=clamp(y+dy,p.top+50,p.bottom-50);
        if(count>=2&&player!==plan.anchor)targetY=index<count/2?Math.min(targetY,p.height/2-C.playerRadius*3.2):Math.max(targetY,p.height/2+C.playerRadius*3.2);
        const point={x:clamp(x+dir*dx,p.left+75,p.right-75),y:targetY};
        const space=Math.min(...opponents.map(q=>distance(q,point)));
        const clear=lineClearance(b,point,opponents);
        const teammateSpace=Math.min(160,...players.filter(q=>q.team===player.team&&q!==player).map(q=>distance(q,point)));
        candidates.push({...point,score:clamp(clear,-50,85)*.7+Math.min(space,180)*.22+teammateSpace*.18-Math.abs(dy)*.12-dx*.08-distance(player,point)*.04});
      }
      candidates.sort((a,b)=>b.score-a.score);m.supportTarget=candidates[0];m.nextSupport=time+.45;
    }
    return {...m.supportTarget,aimX:dir,aimY:0,urgent:distance(player,m.supportTarget)>290};
  }

  update(){
    const {players,pitch:p,time,ball:b}=this.engine;this.observe();
    if(time>=this.nextPlan)this.planTeams();
    for(const player of players){
      if(player.human)continue;
      const plan=this.plans[player.team],m=this.memory.get(player.id),policy=this.teamPolicy[player.team],skill=DIFFICULTIES[this.teamDifficulty[player.team]];
      if(time>m.checkAt){
        const moved=Math.hypot(player.x-m.lastX,player.y-m.lastY);
        m.stuck=distance(player,b)<125&&moved<23?m.stuck+.65:Math.max(0,m.stuck-.65);
        if(m.stuck>.65){m.side=-m.side;m.nextAim=0;}
        m.lastX=player.x;m.lastY=player.y;m.checkAt=time+.65;
      }
      let target=(player===plan.chaser||player===plan.finisher)?this.chase(player,m):player===plan.cover?this.cover(player,plan):this.support(player,plan);
      target.x=clamp(target.x,p.left-(p.runoff??0)+player.radius+1,p.right+(p.runoff??0)-player.radius-1);
      target.y=clamp(target.y,p.top-(p.runoff??0)+player.radius+1,p.bottom+(p.runoff??0)-player.radius-1);
      let dx=target.x-player.x,dy=target.y-player.y,d=Math.hypot(dx,dy);
      const desired=unit(dx,dy,0,0);
      // Anticipate crowding, while allowing a challenger to make physical contact.
      for(const other of players){
        if(other===player)continue;
        const ox=player.x-other.x,oy=player.y-other.y,od=Math.hypot(ox,oy);
        if(!target.frontPost&&od<65&&od>1&&(!target.close||distance(player,b)>85)){
          dx+=ox/od*(65-od)*1.3;dy+=oy/od*(65-od)*1.3;
        }
      }
      const move=unit(dx,dy,desired.x,desired.y),amount=clamp(d/27,0,1);
      const kickoff=Boolean(this.engine.kickoff);
      const emergency=!kickoff&&target.emergency&&d>55&&player.stamina>0;
      const rival=players.filter(q=>q.team!==player.team).sort((a,c)=>distance(a,b)-distance(c,b))[0];
      const race=rival&&distance(rival,b)<distance(player,b)+90;
      const reserve=(rival?.stamina<25?26:40)*policy.boostReserve/skill.boostSense;
      // Spend boost on a contested chase, a substantial defensive recovery,
      // or an attacking run. Walking handles routine defensive adjustments.
      // Kickoff protection makes an opponent's race to the center unwinnable.
      const challenge=target.close&&race&&(target.urgent||target.burst);
      const recover=player===plan.cover&&(plan.frontPostThreat||plan.goalThreat)&&d>120;
      const attackRun=!target.close&&player!==plan.cover&&plan.possession&&target.urgent;
      const sprintAllowed=!kickoff&&d>(target.commit?12:55)&&Boolean(emergency||challenge||recover||attackRun);
      const minimum=16*policy.boostReserve/skill.boostSense;
      if(!sprintAllowed||(!emergency&&(player.stamina<minimum||time>=m.sprintUntil))){
        if(m.sprint)m.restUntil=time+.5;
        m.sprint=false;
      }
      if(emergency)m.sprint=true;
      else if(sprintAllowed&&!m.sprint&&time>=m.restUntil&&player.stamina>reserve+(target.burst?0:10)){
        m.sprint=true;m.sprintUntil=time+(target.burst?.45:.65);
      }
      const baseline={x:move.x*amount,y:move.y*amount,aimX:target.aimX,aimY:target.aimY,
        sprint:m.sprint,shoot:Boolean(target.shoot)};
      player.input=baseline;
      const neural=this.neuralPolicies[player.team];
      if((neural||this.trainingObserver)&&time>=m.nextNeural){
        const features=neuralFeatures(this.engine,player,players.length/2);
        m.nextNeural=time+.15;
        if(neural){m.neuralPrediction=inferNeural(neural,features);}
        else m.neuralPrediction=null;
        if(this.trainingObserver){
          // Teacher samples are the unmodified expert action; candidate rollouts
          // record what the neural controller actually sampled.
          m.neuralFeatures=features;m.neuralTeacher=humanAction(baseline,player.team,this.engine.attackDir(player.team));
        }
        m.neuralSampleDue=true;
      }else m.neuralSampleDue=false;
      if(neural&&m.neuralPrediction){
        const blended=blendNeural(baseline,m.neuralPrediction,player.team,{
          strength:neural.strength??.30,training:this.neuralTraining,random:this.random,attackDir:this.engine.attackDir(player.team),
          preserveSprint:Boolean(emergency),
          canLearnedShoot:Boolean(player===plan.chaser&&distance(player,b)<player.radius+b.radius+C.shotReach&&player.shotCooldown<=0&&
             unit(b.x-player.x,b.y-player.y).x*baseline.aimX+unit(b.x-player.x,b.y-player.y).y*baseline.aimY>.8&&
             !this.ownGoalRisk(b,{x:b.x+baseline.aimX*1000,y:b.y+baseline.aimY*1000},plan)),
          ownGoalRisk:(input)=>Boolean(baseline.shoot&&this.ownGoalRisk(b,{x:b.x+input.aimX*900,y:b.y+input.aimY*900},plan))
        });
        player.input=blended.input;
        if(m.neuralSampleDue)m.neuralAction=blended.action;
      }
      // Learned boost requests use the same reserves, burst window and rest as
      // the Expert. A saved model cannot burn stamina during protected kickoff.
      player.input.sprint=Boolean(player.input.sprint&&sprintAllowed&&m.sprint);
      // Exact post coverage must also survive a learned inward movement bias.
      if(target.frontPost){player.input.x=baseline.x;player.input.y=baseline.y;}
      const dt=clamp(time-m.steerAt,0,.05);m.steerAt=time;
      // Avoid moving bodies' predicted paths instead of reacting only on overlap.
      if(!target.close&&!target.frontPost){
        for(const other of players){
          if(other===player)continue;
          const ox=player.x+player.vx*.18-other.x-other.vx*.18;
          const oy=player.y+player.vy*.18-other.y-other.vy*.18;
          const gap=Math.hypot(ox,oy);
          if(gap>1&&gap<60){player.input.x+=ox/gap*(60-gap)/90;player.input.y+=oy/gap*(60-gap)/90;}
        }
      }
      const blend=m.steerReady?1-Math.exp(-dt/(emergency?.035:.10)):1;m.steerReady=true;
      m.steerX+=(player.input.x-m.steerX)*blend;m.steerY+=(player.input.y-m.steerY)*blend;
      const length=Math.max(1,Math.hypot(m.steerX,m.steerY));
      player.input.x=m.steerX/length;player.input.y=m.steerY/length;
      // At a stationary defensive target, brake rather than orbiting it.
      if(target.frontPost&&d<2){player.input.x=0;player.input.y=0;m.steerX=m.steerY=0;}
      if(this.trainingObserver&&m.neuralSampleDue){
        this.trainingObserver({time,team:player.team,id:player.id,features:m.neuralFeatures,
          action:neural?m.neuralAction:m.neuralTeacher,expert:m.neuralTeacher});
      }
    }
  }
}
