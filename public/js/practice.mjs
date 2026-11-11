import {clamp,distance,unit} from './config.mjs';

export const DRILLS=Object.freeze({
  free:{title:'Free pitch',seconds:0,unit:'goals',help:'Explore touches, rolling turns and curved shots. Reset whenever you want.'},
  dribble:{title:'Dribble gates',seconds:45,unit:'gates',help:'Carry the ball through each lit gate. Keep up with the ball and weave around the cones. Shots through a gate do not count.'},
  wall:{title:'Bank & receive',seconds:60,unit:'returns',help:'Hit the highlighted wall, then receive the rebound inside the green circle.'},
  corner:{title:'Corner escape',seconds:60,unit:'escapes',help:'Beat the pressing defender and carry the ball into the exit circle.'},
  shield:{title:'Shield the circle',seconds:60,unit:'seconds',help:'Keep the ball inside the circle and away from the active challenger. One steal ends the attempt.'},
  sparring:{title:'1v1 finishing',seconds:60,unit:'goals / 5',help:'Five attacks, 12 seconds each. Beat the defender and finish. A turnover across halfway ends the attack.'}
});
export const practiceKey=m=>`${m.drill}:${m.size}:${m.unlimitedStamina?'unlimited':'normal'}`;
export function loadPracticeBests(){
  try{
    const data=JSON.parse(localStorage.getItem('teamball-practice09')||'{}');
    return Object.fromEntries(Object.entries(data).filter(([key,value])=>/^(dribble|wall|corner|shield|sparring):[1-5]:(normal|unlimited)$/.test(key)&&Number.isFinite(value)&&value>=0&&value<100000));
  }catch{return {};}
}
export function savePracticeBest(key,score){
  const bests=loadPracticeBests(),previous=bests[key]??0;
  if(!/^(dribble|wall|corner|shield|sparring):[1-5]:(normal|unlimited)$/.test(key)||!Number.isFinite(score)||score<0)return {best:previous,improved:false};
  const best=Math.max(previous,score);bests[key]=best;
  try{localStorage.setItem('teamball-practice09',JSON.stringify(bests));}catch{}
  return {best,improved:score>previous};
}

export class PracticeSession {
  constructor(match){
    this.match=match;this.kind=match.drill;this.meta=DRILLS[this.kind];this.elapsed=0;this.trialElapsed=0;
    this.score=0;this.attempts=0;this.completed=false;this.reason='';this.target=null;this.circle=null;this.gates=[];
    this.banked=false;this.sinceShot=10;this.message=this.meta.help;
  }
  setup(){
    const m=this.match,p=m.pitch,b=m.engine.ball,h=m.human;if(!h)return;
    const dir=h.team==='red'?1:-1,own=dir===1?p.left:p.right,attack=dir===1?p.right:p.left,W=p.right-p.left,H=p.bottom-p.top,cy=p.height/2;
    this.trialElapsed=0;this.banked=false;this.target=null;this.circle=null;this.gates=[];m.engine.obstacles=[];this.sinceShot=10;
    h.x=b.x-dir*90;h.y=b.y;
    const defender=m.players.find(q=>q!==h);
    if(this.kind==='wall'){
      b.x=p.width/2-dir*150;b.y=p.top+145;h.x=b.x-dir*28;h.y=b.y+10;
      this.wallX=p.width/2;this.target={x:p.width/2+dir*150,y:p.top+165,radius:70};
    }
    if(this.kind==='corner'){
      const top=this.attempts%2===0,sy=top?1:-1;
      b.x=attack-dir*(b.radius+1);b.y=(top?p.top:p.bottom)+sy*(b.radius+1);
      h.x=b.x-dir*78;h.y=b.y+sy*78;
      defender.x=h.x-dir*100;defender.y=h.y+sy*45;
      this.target={x:attack-dir*260,y:(top?p.top:p.bottom)+sy*150,radius:70};
    }
    if(this.kind==='shield'){
      this.circle={x:p.width/2,y:cy,radius:Math.min(155,H*.24)};
      h.x=b.x-dir*(h.radius+b.radius+1);h.y=cy;defender.x=h.x-dir*95;defender.y=cy+30;
    }
    if(this.kind==='dribble'){
      h.x=own+dir*W*.13;h.y=cy;b.x=h.x+dir*(h.radius+b.radius+.5);b.y=cy;
      this.gates=[.25,.375,.5,.625,.75,.625,.5,.375].map((x,i)=>({x:own+dir*W*x,y:cy+(i%2?1:-1)*H*.14,radius:44}));
      this.target=this.gates[this.score%this.gates.length];
      m.engine.obstacles=[.3125,.4375,.5625,.6875].map(x=>({x:own+dir*W*x,y:cy,radius:10}));
    }
    if(this.kind==='sparring'){
      h.x=attack-dir*Math.min(W*.34,430);h.y=cy+(this.attempts%3-1)*H*.12;
      b.x=h.x+dir*(h.radius+b.radius+.5);b.y=h.y;
      defender.x=attack-dir*110;defender.y=cy;
    }
  }
  defenderInput(){
    if(this.kind!=='shield')return;
    const m=this.match,b=m.engine.ball,h=m.human,p=m.players.find(q=>q!==h);if(!p)return;
    const aim=unit(b.x-p.x,b.y-p.y,0,0),d=distance(p,b);
    const projection=(h.x-p.x)*aim.x+(h.y-p.y)*aim.y;
    const obstruction=Math.abs((h.x-p.x)*-aim.y+(h.y-p.y)*aim.x);
    let move=aim;
    if(projection>0&&projection<d&&obstruction<h.radius+p.radius+6){
      const n=unit(b.x-h.x,b.y-h.y),side=(p.y-h.y)*n.x-(p.x-h.x)*n.y>=0?1:-1;
      const target={x:b.x-n.y*side*58,y:b.y+n.x*side*58};move=unit(target.x-p.x,target.y-p.y);
    }
    // Active pressure follows the same movement and stamina physics as everyone.
    p.input={x:move.x*clamp(d/22,0,1),y:move.y*clamp(d/22,0,1),aimX:aim.x,aimY:aim.y,
      shoot:false,sprint:d>55&&p.stamina>18&&(this.elapsed%1.35)<.5};
  }
  complete(reason){
    this.completed=true;this.reason=reason;
    if(this.kind==='shield')this.score=+Math.min(this.elapsed,this.meta.seconds).toFixed(1);
    this.match.finish();
  }
  nextAttempt(message){
    this.attempts++;this.message=message;
    if(this.kind==='sparring'&&this.attempts>=5){this.complete('Five attacks complete');return;}
    this.match.resetPractice();
  }
  update(dt,events,scored){
    if(this.completed)return;
    this.elapsed+=dt;this.trialElapsed+=dt;
    const m=this.match,b=m.engine.ball,h=m.human;if(!h)return;
    const opponentTouch=events.some(e=>(e.type==='kick'||e.type==='contact')&&e.player!==h.id);
    this.sinceShot=events.some(e=>e.type==='kick'&&e.player===h.id)?0:this.sinceShot+dt;
    const nearDribble=b.lastPlayer===h.id&&distance(h,b)<h.radius+b.radius+26&&Math.hypot(b.vx-h.vx,b.vy-h.vy)<190&&this.sinceShot>.5;
    const humanTouch=events.some(e=>(e.type==='kick'||e.type==='contact')&&e.player===h.id);
    if(this.kind==='free'){this.score=m.score[h.team];return;}
    if(this.kind==='shield'){
      this.score=+Math.min(this.elapsed,this.meta.seconds).toFixed(1);
      if(opponentTouch){this.complete('The challenger reached the ball');return;}
      if(distance(b,this.circle)>this.circle.radius-b.radius){this.complete('The ball left the circle');return;}
    }
    if(this.kind==='dribble'&&distance(b,this.target)<this.target.radius&&nearDribble){
      this.score++;this.target=this.gates[this.score%this.gates.length];this.message=`Gate ${this.score} cleared. Find the next lit gate.`;
    }
    if(this.kind==='wall'){
      if(events.some(e=>e.type==='wall'&&e.ny===1&&Math.abs(e.x-this.wallX)<75)&&b.lastTeam===h.team){this.banked=true;this.message='Good bank. Receive it in the circle.';}
      if(this.banked&&humanTouch&&distance(b,this.target)<this.target.radius){this.score++;this.nextAttempt('Return received. Bank another.');}
      else if(scored)this.nextAttempt('That left the drill. Try the marked wall.');
    }
    if(this.kind==='corner'){
      if(opponentTouch)this.nextAttempt('Defender got a touch. Try the other corner.');
      else if(nearDribble&&distance(b,this.target)<this.target.radius){this.score++;this.nextAttempt('Escape complete. Switch corners.');}
      else if(scored)this.nextAttempt('Carry it through the exit circle.');
    }
    if(this.kind==='sparring'){
      const dir=h.team==='red'?1:-1,turnover=b.lastTeam!==null&&b.lastTeam!==h.team&&(b.x-m.pitch.width/2)*dir<0;
      if(scored){if(scored===h.team)this.score++;this.nextAttempt(scored===h.team?'Goal. Next attack.':'Attack lost. Try again.');}
      else if(turnover||this.trialElapsed>=12)this.nextAttempt(turnover?'Turnover. Next attack.':'Time up for that attack.');
    }
    if(!this.completed&&this.elapsed>=this.meta.seconds)this.complete('Time complete');
  }
  snapshot(){
    return {kind:this.kind,title:this.meta.title,unit:this.meta.unit,elapsed:this.elapsed,
      remaining:this.meta.seconds?Math.max(0,this.meta.seconds-this.elapsed):null,score:this.score,attempts:this.attempts,
      completed:this.completed,reason:this.reason,message:this.message,banked:this.banked,
      target:this.target?{...this.target}:null,circle:this.circle?{...this.circle}:null,gates:this.gates.map(g=>({...g}))};
  }
}
