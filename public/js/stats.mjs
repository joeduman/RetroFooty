import {RULES} from './customize.mjs';
import {clamp,TUNING as C} from './config.mjs';
export const HEAT_COLS=24,HEAT_ROWS=14;
export class MatchStats {
  constructor(players,pitch){
    this.players=players;this.pitch=pitch;this.elapsed=0;this.sidesSwapped=false;
    this.rows=new Map(players.map(p=>[p.id,{id:p.id,name:p.name,team:p.team,human:p.human,
      goals:0,ownGoals:0,assists:0,kicks:0,shots:0,onTarget:0,passes:0,passAttempts:0,interceptions:0,touches:0,shotMap:[],passMap:[],
      distance:0,sprintSeconds:0,heat:Array(HEAT_COLS*HEAT_ROWS).fill(0)}]));
    this.resetPlay();
  }
  resetPlay(){
    this.lastTouch=null;this.lastKick=null;this.lastShot=null;this.assist=null;this.defenderControl=null;
    this.positions=new Map(this.players.map(p=>[p.id,{x:p.x,y:p.y}]));
    this.recentTeamTouches={red:[],blue:[]};this.activeTrajectory=null;this.sampleAccumulator=0;
  }
  sample(dt,ball){
    this.elapsed+=dt;const p=this.pitch;
    if(ball&&this.activeTrajectory){this.sampleAccumulator+=dt;
      if(this.sampleAccumulator>=.11){this.sampleAccumulator=0;const s=this.activeTrajectory;
        if(this.elapsed-s.startedElapsed<5&&s.path.length<58)s.path.push([Math.round(ball.x),Math.round(ball.y)]);else this.activeTrajectory=null;}
    }
    for(const player of this.players){
      const row=this.rows.get(player.id),old=this.positions.get(player.id);
      row.distance+=Math.hypot(player.x-old.x,player.y-old.y);
      if(player.sprinting)row.sprintSeconds+=dt;
      const x=clamp(Math.floor((player.x-p.left)/(p.right-p.left)*HEAT_COLS),0,HEAT_COLS-1);
      const y=clamp(Math.floor((player.y-p.top)/(p.bottom-p.top)*HEAT_ROWS),0,HEAT_ROWS-1);
      row.heat[y*HEAT_COLS+x]+=dt;this.positions.set(player.id,{x:player.x,y:player.y});
    }
  }
  touch(id,time){
    const row=this.rows.get(id);if(!row)return;
    if(this.lastTouch?.id===id&&time-this.lastTouch.time<.12){this.lastTouch.time=time;return;}
    row.touches++;
    if(this.lastTouch&&this.lastTouch.id!==id){
      if(this.lastTouch.team!==row.team){row.interceptions++;this.assist=null;this.recentTeamTouches[this.lastTouch.team]=[];}
      if(this.lastKick&&this.lastKick.id!==id){
        if(this.lastKick.team===row.team&&time-this.lastKick.time<4){
          this.rows.get(this.lastKick.id).passes++;this.assist={id:this.lastKick.id,receiver:id,time};
          const prev=this.rows.get(this.lastKick.id);if(prev)prev.passMap.push({from:[this.lastKick.x||0,this.lastKick.y||0],to:[this.positions.get(id)?.x||0,this.positions.get(id)?.y||0],at:time});
        }
        this.lastKick=null;
      }
    }
    const pos=this.positions.get(id)||{x:0,y:0};this.lastTouch={id,team:row.team,time,x:pos.x,y:pos.y};
    this.recentTeamTouches[row.team].push({id,time});this.recentTeamTouches[row.team]=this.recentTeamTouches[row.team].filter(v=>time-v.time<=5.1).slice(-30);
  }
  record(event){
    if(event.type!=='kick'&&event.type!=='contact')return;
    const row=this.rows.get(event.player);if(!row)return;
    // An incidental defender contact must not erase the shot's saved assist.
    // A deliberate defender kick, or sustained close control, ends that shot.
    if(event.type==='contact'&&this.lastShot&&row.team!==this.lastShot.team){
      if(this.defenderControl?.id!==row.id)this.defenderControl={id:row.id,since:event.time};
      if(Number.isFinite(event.relativeSpeed)&&event.relativeSpeed<RULES.controlRelativeSpeed){
        if(event.time-this.defenderControl.since>=RULES.controlSeconds)this.lastShot=null;
      }else this.defenderControl.since=event.time;
    }else this.defenderControl=null;
    this.touch(event.player,event.time);if(event.type!=='kick')return;
    row.kicks++;this.lastKick={id:row.id,team:row.team,time:event.time,x:event.x,y:event.y};this.lastShot=null;
    if(this.activeTrajectory)this.activeTrajectory=null;
    const p=this.pitch,goal=((row.team==='red')!==this.sidesSwapped)?p.right:p.left,t=(goal-event.x)/event.vx;
    if(!Number.isFinite(t)||t<=0)return;
    const y=event.y+event.vy*t,d=Math.hypot(goal-event.x,y-event.y),range=Math.hypot(event.vx,event.vy)/C.ballDrag;
    if(d>range||y<p.goalTop-80||y>p.goalBottom+80){row.passAttempts++;return;}
    row.shots++;const onTarget=y>p.goalTop+C.ballRadius&&y<p.goalBottom-C.ballRadius;
    if(onTarget)row.onTarget++;
    const detail={at:event.time,from:[event.x,event.y],to:[goal,y],path:[[event.x,event.y]],onTarget,goal:false,team:row.team,player:row.id,startedElapsed:this.elapsed};
    row.shotMap.push(detail);if(row.shotMap.length>250)row.shotMap.shift();
    this.activeTrajectory=detail;this.sampleAccumulator=0;
    const lastMate=this.recentTeamTouches[row.team].filter(v=>v.id!==row.id&&event.time-v.time<=5).at(-1);
    this.lastShot={id:row.id,team:row.team,time:event.time,onTarget,assist:this.assist?{...this.assist}:lastMate?{id:lastMate.id,receiver:row.id,time:event.time}:null};
  }
  goal(team,time,ball=null){
    const shot=this.lastShot?.team===team&&time-this.lastShot.time<RULES.deflectionSeconds?this.lastShot:null;
    const scorer=this.lastTouch?.team===team?this.lastTouch.id:shot?.id;
    let assistId=null,ownGoalId=null;
    if(scorer){
      this.rows.get(scorer).goals++;
      // Build 13 rule: the last teammate who touched the ball up to 5 seconds
      // before the scorer receives an assist even if an opponent deflects it.
      const prior=(this.recentTeamTouches[team]||[]).filter(v=>v.id!==scorer&&time-v.time<=5);
      const latestScorer=(this.recentTeamTouches[team]||[]).filter(v=>v.id===scorer).at(-1)?.time??time;
      const before=prior.filter(v=>v.time<=latestScorer+.001).at(-1);
      const assist=(before?.id?{id:before.id}:null)??(shot?.id===scorer?shot.assist:this.assist);
      if(assist?.id&&assist.id!==scorer&&this.rows.has(assist.id)){
        assistId=assist.id;this.rows.get(assistId).assists++;
      }
      const scoringShot=this.rows.get(scorer)?.shotMap.at(-1);
      if(scoringShot&&time-scoringShot.at<=RULES.deflectionSeconds){
        scoringShot.goal=true;
        // The line ends where the ball entered the mouth (not at a later bounce
        // behind the net). Exact crossing is interpolated from the last sample.
        if(ball){
          const x=((team==='red')!==this.sidesSwapped)?this.pitch.right:this.pitch.left;
          // Sampling can land just behind the goal line; discard those extra
          // points so the visible scored path always ends at the goalmouth.
          while(scoringShot.path.length>1&&
            (((team==='red')!==this.sidesSwapped)?scoringShot.path.at(-1)[0]>=x:scoringShot.path.at(-1)[0]<=x))scoringShot.path.pop();
          const last=scoringShot.path.at(-1)??scoringShot.from;
          const deltaX=ball.x-last[0];
          const t=Math.abs(deltaX)>1e-9?clamp((x-last[0])/deltaX,0,1):1;
          const y=last[1]+(ball.y-last[1])*t;
          const point=[x,clamp(y,this.pitch.goalTop,this.pitch.goalBottom)];
          scoringShot.path.push(point);scoringShot.to=point;
        }
        if(this.activeTrajectory===scoringShot)this.activeTrajectory=null;
      }
    }else if(this.lastTouch){ownGoalId=this.lastTouch.id;this.rows.get(ownGoalId).ownGoals++;}
    return {team,scorerId:scorer??null,scorerName:this.rows.get(scorer)?.name??null,
      assistId,assistName:this.rows.get(assistId)?.name??null,ownGoalId,ownGoalName:this.rows.get(ownGoalId)?.name??null};
  }
  report(){
    return {elapsed:this.elapsed,cols:HEAT_COLS,rows:HEAT_ROWS,
      pitch:{width:this.pitch.right-this.pitch.left,height:this.pitch.bottom-this.pitch.top,goalWidth:this.pitch.goalWidth},
      players:[...this.rows.values()].map(row=>({...row,heat:[...row.heat],shotMap:row.shotMap.map(({startedElapsed,...v})=>v),passMap:row.passMap.slice(-250)}))};
  }
}
