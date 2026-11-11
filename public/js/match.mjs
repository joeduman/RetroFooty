import {createPitch,clamp,seededRandom,MATCH_SECONDS,TUNING as C} from './config.mjs';
import {Player,PhysicsEngine} from './physics.mjs';
import {AIController} from './ai.mjs';
import {MatchStats} from './stats.mjs';
import {PracticeSession,DRILLS} from './practice.mjs';
import {RULES} from './customize.mjs';
import {normalizeGoalEffect} from './goal-effects.mjs';

const NAMES={red:['Rio','Jules','Milo','Ash','Remy'],blue:['Nico','Kai','Sage','Eli','Luca']};
export class Match {
  constructor({size=4,team='red',name='Sam',spectator=false,seed=Date.now(),duration,loop=true,
    goldenGoal=true,practice=false,drill='free',unlimitedStamina=false,aiPolicy=null,aiContexts=null,aiDifficulty='expert',aiNeural=null,aiNeuralTeam=null,neuralTraining=false}={}){
    this.size=clamp(Math.round(size),1,5);this.spectator=spectator;this.loop=loop;this.seed=seed;
    this.practice=practice;this.drill=Object.hasOwn(DRILLS,drill)?drill:'free';
    this.unlimitedStamina=practice&&unlimitedStamina;this.goldenGoal=goldenGoal;this.overtime=false;this.extraElapsed=0;
    this.pitch=createPitch(this.size);this.duration=duration??MATCH_SECONDS[this.size];this.remaining=this.duration;
    // Sub-30-second diagnostic fixtures retain their original single-period timing.
    this.halftimeEnabled=!practice&&this.duration>=30;
    this.fulltimePending=false;this.fulltimeAttackSide=null;this.fulltimeAttackTeam=null;
    this.score={red:0,blue:0};this.round=1;this.half=1;this.sidesSwapped=false;this.halftimePending=false;this.halftimeAttackSide=null;this.halftimeAfterGoal=false;this.state='kickoff';this.wait=C.kickoffSeconds;this.goalTeam=null;this.goalInfo=null;this.kickoffTeam=null;this.kickoffPlayer=null;
    this.players=[];
    for(const color of ['red','blue'])for(let n=0;n<(practice?1:this.size);n++){
      if(practice&&color!==team&&!['corner','shield','sparring'].includes(this.drill))continue;
      const human=!spectator&&color===team&&n===0;
      this.players.push(new Player(this.players.length+1,color,n+1,human?(name.trim().slice(0,16)||'Player'):NAMES[color][n],human));
    }
    this.engine=new PhysicsEngine(this.pitch,this.players);this.ai=new AIController(this.engine,seed);
    if(aiPolicy)this.ai.setPolicy(aiPolicy);if(aiContexts)this.ai.setLearningContexts(aiContexts);this.ai.setDifficulty(aiDifficulty);
    if(aiNeural)this.ai.setNeuralPolicy(aiNeural,aiNeuralTeam);this.ai.neuralTraining=neuralTraining;
    this.random=seededRandom(seed);this.human=this.players.find(p=>p.human);this.events=[];
    this.stats={shots:0,touches:0,passes:0,banks:0,goals:0};this.spawn();
    this.tracker=new MatchStats(this.players,this.pitch);this.training=practice?new PracticeSession(this):null;if(practice)this.resetPractice();
  }
  spawn(){
    this.clearFulltimeAttack();
    const p=this.pitch,cy=p.height/2,w=p.right-p.left,kickoffOffset=(this.random()-.5)*32;
    this.engine.clearMotion();
    for(const q of this.players){
      const dir=this.engine.attackDir(q.team),own=dir===1?p.left:p.right,n=q.number-1;
      if(n===0){q.x=p.width/2-dir*110;q.y=cy+dir*kickoffOffset;}
      else if(n===1){q.x=own+dir*w*.18;q.y=cy+(this.random()-.5)*45;}
      else {q.x=own+dir*w*(n===4?.28:.36);q.y=cy+(n%2===0?-1:1)*(p.bottom-p.top)*.27;}
      q.faceX=dir;q.faceY=0;
    }
    if(!this.practice){
      // The taker starts within kick reach; everyone else starts farther away.
      // A new match draws a team. After a goal the conceding side is assigned.
      this.kickoffTeam??=this.random()<.5?'red':'blue';
      const eligible=this.players.filter(q=>q.team===this.kickoffTeam);
      const taker=eligible[Math.floor(this.random()*eligible.length)];
      this.kickoffPlayer=taker.id;
      const dir=this.engine.attackDir(taker.team);
      taker.x=p.width/2-dir*(taker.radius+this.engine.ball.radius+RULES.kickoffTakerGap);taker.y=cy;
      this.engine.kickoff={
      team:this.kickoffTeam,
      remaining:RULES.kickoffProtectionSeconds,
      };

      for(const player of this.players){
        this.engine.protectKickoff(player);
      }
    }
    this.ai.reset();this.tracker?.resetPlay();
  }
  resetPractice(){
    if(!this.practice)return;
    this.spawn();this.state=this.drill==='free'?'playing':'practice-ready';this.wait=this.drill==='free'?0:3;this.training.setup();this.tracker.resetPlay();
  }
  report(){return {...this.tracker.report(),score:{...this.score},size:this.size,duration:this.duration,practice:this.practice,overtime:this.overtime,half:this.half,sidesSwapped:this.sidesSwapped,fulltimePending:this.fulltimePending,fulltimeAttackSide:this.fulltimeAttackSide,fulltimeAttackTeam:this.fulltimeAttackTeam,training:this.training?.snapshot()??null};}
  beginHalftime(){
    if(this.practice||this.half!==1)return;
    this.halftimePending=false;this.halftimeAttackSide=null;this.halftimeAfterGoal=false;
    this.state='halftime';this.wait=3;this.events.push({type:'halftime',score:{...this.score}});
    for(const p of this.players)p.input={x:0,y:0,aimX:p.faceX,aimY:p.faceY,sprint:false,shoot:false};
  }
  startSecondHalf(){
    this.half=2;this.sidesSwapped=true;this.engine.setSidesSwapped(true);this.tracker.sidesSwapped=true;
    this.kickoffTeam=this.random()<.5?'red':'blue';this.goalTeam=null;this.goalInfo=null;
    this.spawn();this.state='kickoff';this.wait=C.kickoffSeconds;
    this.events.push({type:'second-half'});
  }
  checkHalftimeAttack(){
    if(this.practice||!this.halftimeEnabled||this.half!==1||this.overtime)return;
    const halfway=this.duration/2;
    if(!this.halftimePending){
      if(this.remaining>halfway+1e-8)return;
      this.remaining=halfway;this.halftimePending=true;
      const x=this.engine.ball.x,mid=this.pitch.width/2;
      this.halftimeAttackSide=x>mid+this.engine.ball.radius?'right':x<mid-this.engine.ball.radius?'left':null;
      if(!this.halftimeAttackSide)this.beginHalftime();
      return;
    }
    const x=this.engine.ball.x,mid=this.pitch.width/2;
    // Finish the attack as the ball RETURNS over the center line, or on a goal.
    if((this.halftimeAttackSide==='right'&&x<=mid)||
       (this.halftimeAttackSide==='left'&&x>=mid))this.beginHalftime();
  }
  clearFulltimeAttack(){
    this.fulltimePending=false;this.fulltimeAttackSide=null;this.fulltimeAttackTeam=null;
  }
  checkFulltimeAttack(){
    if(this.practice||this.overtime||this.remaining>0)return;
    const b=this.engine.ball,mid=this.pitch.width/2;
    if(!this.fulltimePending){
      // A team earns one last attack by playing the ball into the opponent's
      // half. An untouched ball, or a defender's clearance still in their own
      // half, must not postpone the whistle just because it is off-center.
      const team=b.lastTeam,dir=team&&this.engine.attackDir(team);
      if(this.duration>=30&&dir&&(b.x-mid)*dir>b.radius){
        this.fulltimePending=true;this.fulltimeAttackSide=dir===1?'right':'left';this.fulltimeAttackTeam=team;
        this.events.push({type:'final-attack',team});
        return;
      }
    }else if((this.fulltimeAttackSide==='right'&&b.x>mid)||
             (this.fulltimeAttackSide==='left'&&b.x<mid)){
      // A defender may challenge in this half. Do not hand either team a new
      // extension once this attack comes back across midfield.
      return;
    }
    this.regulationEnd();
  }
  regulationEnd(){
    this.clearFulltimeAttack();
    if(this.goldenGoal&&this.score.red===this.score.blue){
      this.overtime=true;this.extraElapsed=0;this.kickoffTeam=null;this.spawn();this.state='kickoff';this.wait=C.kickoffSeconds;
      this.events.push({type:'overtime'});
    }else this.finish();
  }
  update(dt,input){
    this.events=[];if(this.state==='ended')return;
    if(this.state==='goal'&&!this.practice){
      if(this.human)this.human.input=input?{...input}:{x:0,y:0,sprint:false,shoot:false,aimX:1,aimY:0};
      for(const p of this.players)if(!p.human){
        const angle=this.engine.time*1.8+p.id;
        p.input={x:Math.cos(angle)*.6,y:Math.sin(angle)*.6,sprint:false,shoot:Boolean(p.celebrating&&Math.floor((this.engine.time+p.id*.09)/RULES.botCelebrationPulse)%2===0),aimX:p.faceX,aimY:p.faceY};
      }
      this.engine.celebrate(Math.min(dt,this.wait),true);
    }
    if(this.state!=='playing'){
      this.wait=Math.max(0,this.wait-dt);if(this.wait>1e-9)return;
      if(this.state==='goal'){
        if(this.practice){this.resetPractice();return;}
        if(this.overtime){this.finish();return;}
        if(this.halftimeAfterGoal){this.beginHalftime();return;}
        if(this.remaining<=0){this.regulationEnd();return;}
        this.spawn();this.state='kickoff';this.wait=C.kickoffSeconds;return;
      }
      if(this.state==='halftime'){this.startSecondHalf();return;}
      if(this.state==='intermission'){
        this.kickoffTeam=null;this.goalInfo=null;this.round++;this.score={red:0,blue:0};this.remaining=this.duration;this.overtime=false;this.extraElapsed=0;
        this.half=1;this.sidesSwapped=false;this.halftimePending=false;this.halftimeAttackSide=null;this.engine.setSidesSwapped(false);
        this.stats={shots:0,touches:0,passes:0,banks:0,goals:0};this.spawn();this.tracker=new MatchStats(this.players,this.pitch);
        this.state='kickoff';this.wait=C.kickoffSeconds;return;
      }
      this.state='playing';this.events.push({type:'kickoff'});
    }
    if(this.human)this.human.input=input?{...input}:{x:0,y:0,sprint:false,shoot:false,aimX:this.human.faceX,aimY:this.human.faceY};
    if(!this.practice||['corner','sparring'].includes(this.drill))this.ai.update();
    this.training?.defenderInput();
    if(this.unlimitedStamina)for(const p of this.players){p.stamina=100;p.exhausted=false;p.recovery=0;}
    const scored=this.engine.step(dt);this.events=[...this.events,...this.engine.events];this.tracker.sample(dt,this.engine.ball);
    if(this.unlimitedStamina)for(const p of this.players){p.stamina=100;p.exhausted=false;p.recovery=0;}
    for(const e of this.events){
      this.tracker.record(e);
      if(e.type==='kick'){
        this.stats.shots++;const type=this.ai.memory.get(e.player)?.aim?.type;
        if(type==='pass')this.stats.passes++;if(type==='bank'||type==='bank-run')this.stats.banks++;
        this.ai.onKick(e.player);
      }
      if(e.type==='touch')this.stats.touches++;
    }
    if(!this.practice){if(this.overtime)this.extraElapsed+=dt;else if(!this.halftimePending)this.remaining=Math.max(0,this.remaining-dt);}
    if(scored){
      this.clearFulltimeAttack();
      this.engine.kickoff=null;
      this.score[scored]++;this.stats.goals++;this.goalInfo=this.tracker.goal(scored,this.engine.time,this.engine.ball);
      // Freeze the credited scorer's choice for this goal, including replays.
      // Uncredited/own goals use the classic effect.
      this.goalInfo.goalEffectId=normalizeGoalEffect(this.players.find(p=>p.id===this.goalInfo.scorerId)?.goalEffectId);
      this.kickoffTeam=scored==='red'?'blue':'red';
      for(const player of this.players)player.celebrating=!player.human&&player.team===scored&&this.random()<RULES.botCelebrationChance;
      this.goalTeam=scored;this.events.push({type:'goal',team:scored,time:this.engine.time,...this.goalInfo});
      if(this.half===1&&this.halftimeEnabled&&(this.halftimePending||this.remaining<=this.duration/2+1e-8))this.halftimeAfterGoal=true;
      if(!this.practice||this.drill==='free'){this.state='goal';this.wait=this.practice?.7:C.celebrationSeconds;}
    }else if(!this.practice&&!this.overtime&&this.half===1&&this.halftimeEnabled){this.checkHalftimeAttack();}
    else if(!this.practice&&!this.overtime&&this.remaining<=0)this.checkFulltimeAttack();
    if(this.practice)this.training.update(dt,this.events,scored);
  }
  finish(){this.clearFulltimeAttack();this.state=this.spectator&&this.loop?'intermission':'ended';this.wait=3;this.events.push({type:'end'});}
}
