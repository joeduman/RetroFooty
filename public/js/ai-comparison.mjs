// Development-only orchestration; both policies write ordinary engine inputs.
import {Match} from './match.mjs';
import {AIController as NewAI} from './ai.mjs';
import {AIController as OriginalAI} from './ai-legacy.mjs';
import {AIController as PreviousAI} from './dev-ai-old.mjs';
export class ComparisonAI {
  constructor(engine,seed,{newSide='red',opponent='original'}={}){
    this.engine=engine;this.newSide=newSide;
    const Other=opponent==='new'?NewAI:opponent==='previous'?PreviousAI:OriginalAI;
    this.controllers={red:new (newSide==='red'?NewAI:Other)(engine,seed),blue:new (newSide==='blue'?NewAI:Other)(engine,seed)};
    this.memory=new Map(engine.players.map(p=>[p.id,this.controllers[p.team].memory.get(p.id)]));
  }
  reset(){for(const c of Object.values(this.controllers))c.reset();}
  onKick(id){const p=this.engine.players.find(p=>p.id===id);if(p)this.controllers[p.team].onKick(id);}
  update(){
    const prior=this.engine.players.map(p=>({...p.input})),chosen={};
    for(const team of ['red','blue']){
      this.engine.players.forEach((p,i)=>p.input={...prior[i]});
      this.controllers[team].update();
      for(const p of this.engine.players)if(p.team===team)chosen[p.id]={...p.input};
    }
    for(const p of this.engine.players)p.input=chosen[p.id];
  }
}
export function comparisonMatch({size=2,seed=1,duration=60,newSide='red',opponent='original',swapped=false}={}){
  const game=new Match({size,seed,duration,spectator:true,goldenGoal:false,loop:false});
  game.ai=new ComparisonAI(game.engine,seed,{newSide,opponent});
  if(swapped){game.sidesSwapped=true;game.engine.setSidesSwapped(true);game.tracker.sidesSwapped=true;game.spawn();}
  game.ai.reset();return game;
}
