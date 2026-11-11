import {Match} from '../../public/js/match.mjs';
import {STEP} from '../../public/js/config.mjs';

const idle={x:0,y:0,aimX:1,aimY:0,sprint:false,shoot:false};
const scenarios=[
  ['open-goal',1,'1v1 attacking an open goal',[[.76,.5],[.3,.85]],{x:.8,y:.5}],
  ['low-boost-defender',1,'1v1 attacking a defender with low boost',[[.56,.5],[.78,.53,4]],{x:.6,y:.5}],
  ['wall-shield',1,'1v1 shielding along a touchline',[[.52,.08],[.56,.16]],{x:.55,y:.035}],
  ['trapped-wall',2,'Ball trapped against a wall',[[.35,.06],[.3,.4],[.46,.12],[.7,.6]],{x:.38,y:.016}],
  ['near-post',3,'Defensive near-post coverage',[[.2,.1],[.08,.35],[.4,.6],[.1,.13],[.5,.5],[.7,.7]],{x:.05,y:.08}],
  ['goal-line-run',2,'Opponent carrying along own goal line',[[.12,.45],[.08,.6],[.06,.75],[.3,.65]],{x:.055,y:.69,vy:-130,lastTeam:'blue'}],
  ['direct-shot',2,'Direct shot from open space',[[.71,.5],[.5,.2],[.4,.85],[.6,.85]],{x:.75,y:.5}],
  ['bank-shot',1,'Bank-shot opportunity around a central defender',[[.64,.28],[.8,.47]],{x:.68,y:.28}],
  ['give-and-go',2,'Two-player give-and-go starting shape',[[.48,.4],[.67,.65],[.6,.4],[.8,.55]],{x:.52,y:.4}],
  ['three-player-sequence',3,'Three-player passing combination starting shape',[[.35,.35],[.55,.65],[.75,.35],[.5,.4],[.7,.5],[.8,.7]],{x:.39,y:.35}],
  ['predictable-pass',2,'Intercept a predictable cross-field pass',[[.45,.5],[.3,.3],[.6,.2],[.6,.8]],{x:.6,y:.29,vy:310,lastTeam:'blue'}],
  ['direction-change',1,'Defend against a sudden attacker reversal',[[.22,.5],[.38,.5]],{x:.34,y:.5,vx:-110,lastTeam:'blue'}],
  ['counterattack',3,'High-speed counterattack',[[.45,.35],[.35,.6],[.6,.7],[.55,.6],[.7,.5],[.85,.3]],{x:.55,y:.35,vx:380,lastTeam:'red'}],
  ['own-goal-loose',1,'Loose ball near own goal',[[.2,.5],[.4,.5]],{x:.09,y:.5,vx:-80}],
  ['kickoff-conservation',5,'Protected kickoff boost conservation',null,null],
  ['missed-challenge-recovery',1,'Recover after an unsuccessful challenge',[[.48,.7],[.38,.5]],{x:.3,y:.5,vx:-240,lastTeam:'blue'}],
  ['advanced-spacing',5,'Five-player attacking spacing and rotations',[[.65,.5],[.25,.5],[.5,.25],[.5,.75],[.4,.5],[.75,.5],[.6,.4],[.6,.6],[.8,.25],[.8,.75]],{x:.69,y:.5,lastTeam:'red'}],
  ['sweeper-rotation',4,'Sweeper-keeper attacking rotation with cover',[[.65,.4],[.28,.5],[.5,.2],[.5,.8],[.7,.5],[.8,.25],[.8,.75],[.75,.8]],{x:.69,y:.4,lastTeam:'red'}],
  ['side-switch',3,'Second-half attacking direction and defensive coverage',[[.7,.5],[.9,.5],[.6,.3],[.5,.5],[.2,.5],[.4,.75]],{x:.66,y:.5,lastTeam:'red'}],
  ['repeated-technique',1,'Repeated observed attacker direction/boost pattern',[[.2,.5],[.4,.6]],{x:.36,y:.6,vx:-70,lastTeam:'blue'}]
];

export const EXPERT_SCENARIOS=Object.freeze(scenarios.map(([id,size,purpose,players,ball])=>Object.freeze({
  schema:'teamball.saved-scenario.v1',id,size,purpose,seed:7100+scenarios.findIndex(s=>s[0]===id),duration:20,
  players,ball,swapped:id==='side-switch',protectedKickoff:id==='kickoff-conservation',
  // This schedule is an observed, legal input pattern; no simulated teleport.
  inputSchedule:id==='direction-change'?[{at:.35,team:'blue',number:1,input:{...idle,x:0,y:-1,sprint:true}}]:
    id==='repeated-technique'?[{at:0,team:'blue',number:1,input:{...idle,x:-1,y:-.4,sprint:true}},
      {at:.5,team:'blue',number:1,input:{...idle,x:-1,y:.4,sprint:false}}]:[]
})));

export function loadScenario(recordOrId,{baselineController=null}={}){
  const record=typeof recordOrId==='string'?EXPERT_SCENARIOS.find(s=>s.id===recordOrId):recordOrId;
  if(!record||record.schema!=='teamball.saved-scenario.v1')throw new Error('Unknown saved Expert scenario');
  const game=new Match({size:record.size,spectator:true,seed:record.seed,duration:record.duration,goldenGoal:false,loop:false});
  if(baselineController)game.ai=new baselineController(game.engine,record.seed);
  if(record.swapped){game.sidesSwapped=true;game.half=2;game.engine.setSidesSwapped(true);game.tracker.sidesSwapped=true;game.spawn();}
  game.state='playing';game.wait=0;
  if(record.players){
    game.engine.kickoff=null;const p=game.pitch,w=p.right-p.left,h=p.bottom-p.top;
    game.players.forEach((player,i)=>{
      const [x,y,stamina=100]=record.players[i];
      Object.assign(player,{x:p.left+x*w,y:p.top+y*h,vx:0,vy:0,stamina,input:{...idle}});
    });
    Object.assign(game.engine.ball,record.ball,{x:p.left+record.ball.x*w,y:p.top+record.ball.y*h,vx:record.ball.vx||0,vy:record.ball.vy||0});
    // The open-goal fixture evaluates finishing with the defender too far away
    // to close the lane. Other scenarios keep both teams actively controlled.
    if(record.id==='open-goal')for(const player of game.players.filter(p=>p.team==='blue'))player.human=true;
  }
  for(const entry of record.inputSchedule){
    const player=game.players.find(p=>p.team===entry.team&&p.number===entry.number);if(player)player.human=true;
  }
  game.ai.reset();game.tracker.resetPlay();
  return {game,record};
}

export function advanceScenario(fixture,seconds=.75){
  const {game,record}=fixture;let elapsed=0,index=0;
  while(elapsed<seconds&&game.state!=='ended'){
    while(index<record.inputSchedule.length&&record.inputSchedule[index].at<=elapsed){
      const entry=record.inputSchedule[index++],player=game.players.find(p=>p.team===entry.team&&p.number===entry.number);
      if(player)player.input={...entry.input};
    }
    game.update(STEP);elapsed+=STEP;
  }
  return fixture;
}

export function captureScenarioState(game){
  return {state:game.state,half:game.half,sidesSwapped:game.engine.sidesSwapped,score:{...game.score},
    ball:Object.fromEntries(['x','y','vx','vy','spin','lastTeam','lastPlayer'].map(k=>[k,game.engine.ball[k]])),
    players:game.players.map(p=>Object.fromEntries(['id','team','x','y','vx','vy','stamina'].map(k=>[k,p[k]])))};
}
