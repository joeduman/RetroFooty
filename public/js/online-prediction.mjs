import {PhysicsEngine} from './physics.mjs';
import {STEP} from './config.mjs';

// All visible bodies share one simulation time and the same collision solver.
// Prediction never decides the authoritative score, stats, or match state.

export class OnlinePrediction {
  constructor(){
    this.pending=[];
    this.state=null;
    this.rtt=0;
  }

  input(seq,input,at){
    this.pending.push({
      seq,
      input:{...input},
      at
    });

    if(this.pending.length>120){
      this.pending.shift();
    }
  }

  receive(message,at,rtt=0){
    if(
      this.matchId!==message.matchId ||
      this.id!==message.id ||
      this.state?.state!==message.state.state
    ){
      this.pending=[];
    }

    this.matchId=message.matchId;
    this.id=message.id;
    this.state=message.state;
    this.at=at;
    this.rtt=rtt;

    this.pending=this.pending.filter(p=>p.seq>message.ack);
  }

  project(now){
    if(!this.state)return null;

    const state=this.state;
    const players=state.players.map(p=>({
      ...p,
      input:{...p.input}
    }));

    const engine=new PhysicsEngine(state.pitch,players);
    engine.setSidesSwapped(state.sidesSwapped===true);
    engine.obstacles=(state.engine.obstacles||[]).map(o=>({...o}));

    Object.assign(engine.ball,state.engine.ball);
    if(state.state==='goal'&&state.goalInfo?.effectMotion==='physics-v1')engine.restoreCelebration(state.engine);

    // Copy the lock so prediction cannot mutate the received server state.
    engine.kickoff=state.engine.kickoff
      ? {...state.engine.kickoff}
      : null;

    const human=players.find(p=>p.id===this.id);

    const view={
      ...state,
      players,
      engine,
      human
    };

    if(
      !['playing','goal'].includes(state.state) ||
      now-this.at>250
    ){
      return view;
    }

    const base=this.at-Math.min(100,this.rtt/2);
    const seconds=Math.min(.15,Math.max(0,(now-base)/1000));

    let index=0;

    for(let t=0;t<seconds-1e-9;t+=STEP){
      while(
        index<this.pending.length &&
        this.pending[index].at<=base+t*1000
      ){
        human.input={
          ...this.pending[index++].input
        };
      }

      // Updated goal-celebration prediction.
      if(state.state==='goal'){
        engine.celebrate(Math.min(STEP,seconds-t),true);
      }
      else if(engine.step(Math.min(STEP,seconds-t))){
        break;
      }
    }

    return view;
  }
}
