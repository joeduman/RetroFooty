// Outcome evaluation of saved runtime situations. No trainer/model writes.
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {performance} from 'node:perf_hooks';
import {AIController as BaselineAI} from './fixtures/expert-baseline/ai.mjs';
import {EXPERT_SCENARIOS,loadScenario} from './fixtures/expert-scenarios.mjs';
import {STEP,distance} from '../public/js/config.mjs';

const definitions={
  'open-goal':'Red scores within the horizon before conceding.',
  'low-boost-defender':'Red scores against the initially four-point-stamina defender before conceding.',
  'wall-shield':'Red touches the ball, advances it >=70px and retains the final touch without conceding.',
  'trapped-wall':'Ball leaves the initial touchline by >=55px with red final possession, or red scores.',
  'near-post':'No goal conceded; red touches or clears the ball beyond its defensive third.',
  'goal-line-run':'No goal conceded; red touches or clears the ball beyond its defensive third.',
  'direct-shot':'Red scores within the horizon before conceding.',
  'bank-shot':'Red scores after a red deliberate kick and a wall event before any later deliberate kick.',
  'give-and-go':'Two consecutive uninterrupted completed passes A->B->A within 3.5 seconds.',
  'three-player-sequence':'Two consecutive uninterrupted completed passes A->B->C with three distinct red players within 4.5 seconds.',
  'predictable-pass':'Red makes the first registered contact with the initially blue-directed moving ball.',
  'direction-change':'No goal conceded; red touches or clears the ball beyond its defensive third.',
  'counterattack':'Red scores or advances the ball >=160px into the attacking third with red final touch.',
  'own-goal-loose':'Red touches the ball and clears beyond the own-goal danger band (200px) at any point without conceding, or red scores.',
  'kickoff-conservation':'Zero red stamina expenditure while the authoritative kickoff protection is active.',
  'missed-challenge-recovery':'No goal conceded; red touches or clears the ball beyond its defensive third.',
  'advanced-spacing':'Red clustered-player fraction below 10% and at least one completed red pass, without conceding.',
  'sweeper-rotation':'A red cover player advances >60px while another red player stays >=60px goal-side of the ball, without conceding.',
  'side-switch':'Red scores after second-half side switching before conceding.',
  'repeated-technique':'At least 18 opponent observations and confidence >0.45; this measures learned evidence, not win-rate benefit.'
};

function variant(record,seedIndex,mirror){
  const copy=JSON.parse(JSON.stringify(record));copy.seed+=seedIndex*971;copy.swapped=mirror?!record.swapped:record.swapped;
  if(mirror){
    if(copy.players)copy.players=copy.players.map(([x,...rest])=>[1-x,...rest]);
    if(copy.ball){copy.ball.x=1-copy.ball.x;copy.ball.vx=-(copy.ball.vx||0);}
    for(const entry of copy.inputSchedule){entry.input.x=-entry.input.x;entry.input.aimX=-entry.input.aimX;}
  }
  return copy;
}

export function evaluateSituation(record,{baseline=false,horizon=8}={}){
  const {game}=loadScenario(record,{baselineController:baseline?BaselineAI:null}),b=game.engine.ball,p=game.pitch;
  const start={x:b.x,y:b.y},startTime=game.engine.time,dir=game.engine.attackDir('red'),own=dir===1?p.left:p.right;
  const redIds=new Set(game.players.filter(q=>q.team==='red').map(q=>q.id));
  const touches=new Set(),passes=[],events=[],coverStarts=new Map();
  let scheduleIndex=0,elapsed=0,lastKick=null,firstContactTeam=null,wallSinceKick=0,bankGoal=false,giveAndGo=0,triangles=0,
    kickoffBoostSpent=0,clustered=0,spacingSamples=0,nextSample=0,sweeperAdvances=0,nonFinite=0,maxAdvance=0;
  while(elapsed<horizon&&game.state!=='ended'&&game.score.red+game.score.blue===0){
    while(scheduleIndex<record.inputSchedule.length&&record.inputSchedule[scheduleIndex].at<=elapsed){
      const entry=record.inputSchedule[scheduleIndex++],player=game.players.find(q=>q.team===entry.team&&q.number===entry.number);
      if(player)player.input={...entry.input};
    }
    const stamina=new Map(game.players.map(q=>[q.id,q.stamina])),kickoff=Boolean(game.engine.kickoff);
    game.update(STEP);elapsed=game.engine.time-startTime;
    maxAdvance=Math.max(maxAdvance,(b.x-start.x)*dir);
    for(const q of game.players){
      if(!Number.isFinite(q.x+q.y+q.vx+q.vy+q.stamina))nonFinite++;
      if(kickoff&&q.team==='red')kickoffBoostSpent+=Math.max(0,stamina.get(q.id)-q.stamina);
    }
    for(const event of game.events){
      if(['kick','contact','wall','goal'].includes(event.type)&&events.length<180)events.push({...event});
      if(event.type==='wall'&&lastKick)wallSinceKick++;
      if(event.type==='goal'){bankGoal=event.team==='red'&&lastKick?.team==='red'&&wallSinceKick>0;continue;}
      if(event.type!=='kick'&&event.type!=='contact')continue;
      const player=game.players.find(q=>q.id===event.player);if(!player)continue;
      firstContactTeam??=player.team;
      if(player.team==='red')touches.add(player.id);
      if(lastKick&&event.player!==lastKick.id){
        if(player.team===lastKick.team&&event.time-lastKick.time<4){
          const completed={from:lastKick.id,to:player.id,team:player.team,time:event.time,progress:(b.x-own)*dir};
          const previous=passes.at(-1);passes.push(completed);
          if(player.team==='red'&&previous?.team==='red'&&previous.to===completed.from){
            if(completed.to===previous.from&&completed.time-previous.time<=3.5)giveAndGo++;
            if(completed.to!==previous.from&&completed.time-previous.time<=4.5)triangles++;
          }
        }else if(player.team!==lastKick.team)passes.push({team:player.team,interrupted:true,time:event.time});
        lastKick=null;
      }
      if(event.type==='kick'){lastKick={id:player.id,team:player.team,time:event.time};wallSinceKick=0;}
    }
    if(elapsed>=nextSample){
      nextSample=elapsed+.15;const mates=game.players.filter(q=>q.team==='red');
      for(const q of mates){
        if(mates.length>1){spacingSamples++;if(Math.min(...mates.filter(r=>r!==q).map(r=>distance(q,r)))<80)clustered++;}
      }
      const cover=game.ai.plans?.red?.cover;
      if(cover){
        if(!coverStarts.has(cover.id))coverStarts.set(cover.id,cover.x);
        if((cover.x-coverStarts.get(cover.id))*dir>60&&mates.some(q=>q!==cover&&(b.x-q.x)*dir>=60))sweeperAdvances++;
      }
    }
  }
  const goal=game.score.red>0,conceded=game.score.blue>0,progress=(b.x-own)*dir,field=p.right-p.left,redTouches=touches.size,
    redPasses=passes.filter(q=>q.team==='red'&&!q.interrupted).length,clusterFraction=spacingSamples?clustered/spacingSamples:0;
  const opponent=game.players.find(q=>q.team==='blue'),tendency=game.ai.activeMemory?.tendency(opponent)??null;
  const defense=!conceded&&(redTouches>0||progress>field/3),outcomes={
    'open-goal':goal,'low-boost-defender':goal,'wall-shield':!conceded&&redTouches>0&&maxAdvance>=70&&b.lastTeam==='red',
    'trapped-wall':goal||((Math.min(b.y-p.top,p.bottom-b.y)-Math.min(start.y-p.top,p.bottom-start.y))>=55&&b.lastTeam==='red'),
    'near-post':defense,'goal-line-run':defense,'direct-shot':goal,'bank-shot':bankGoal,'give-and-go':giveAndGo>0,
    'three-player-sequence':triangles>0,'predictable-pass':firstContactTeam==='red','direction-change':defense,
    'counterattack':goal||(maxAdvance>=160&&progress>field*.67&&b.lastTeam==='red'),
    'own-goal-loose':goal||(!conceded&&redTouches>0&&(start.x-own)*dir+maxAdvance>200),'kickoff-conservation':kickoffBoostSpent<1e-8,
    'missed-challenge-recovery':defense,'advanced-spacing':!conceded&&clusterFraction<.1&&redPasses>0,
    'sweeper-rotation':!conceded&&sweeperAdvances>0,'side-switch':goal,
    'repeated-technique':Boolean(tendency&&tendency.samples>=18&&tendency.confidence>.45)
  };
  return {scenario:record.id,seed:record.seed,swapped:record.swapped,policy:baseline?'frozen Expert':'predictive Expert',
    success:Boolean(outcomes[record.id]),successDefinition:definitions[record.id],elapsed,score:{...game.score},redTouches,
    completedRedPasses:redPasses,giveAndGo,threePlayerSequences:triangles,bankGoal,firstContactTeam,
    kickoffBoostSpent,clusteredFraction:clusterFraction,sweeperAdvanceSamples:sweeperAdvances,maximumForwardBallProgress:maxAdvance,
    finalBallTeam:b.lastTeam,opponentTendency:tendency,nonFinite,events};
}

export function evaluateScenarios({seeds=2,horizon=8}={}){
  const started=performance.now(),hashPaths=['../public/js/expert-ai.mjs','../public/js/ai-prediction.mjs','../public/js/physics.mjs','./fixtures/expert-baseline/ai.mjs'],hashes=()=>Object.fromEntries(hashPaths.map(path=>[path,createHash('sha256').update(readFileSync(new URL(path,import.meta.url))).digest('hex')])),
    sourceHashes=hashes(),trials=[];
  for(const record of EXPERT_SCENARIOS){
    for(let i=0;i<seeds;i++)for(const mirror of [false,true])for(const baseline of [true,false])trials.push(evaluateSituation(variant(record,i,mirror),{baseline,horizon}));
    const group=trials.filter(t=>t.scenario===record.id),base=group.filter(t=>t.policy==='frozen Expert'),current=group.filter(t=>t.policy==='predictive Expert');
    console.log(`${record.id}: ${base.filter(t=>t.success).length}/${base.length} baseline; ${current.filter(t=>t.success).length}/${current.length} candidate`);
  }
  const finalHashes=hashes();return {schema:'teamball.expert-scenario-evaluation.v1',testedAt:new Date().toISOString(),sourceHashes,
    sourcesChanged:JSON.stringify(sourceHashes)!==JSON.stringify(finalHashes),sourcesAtCompletion:finalHashes,horizon,seedsPerOrientation:seeds,
    wallMilliseconds:performance.now()-started,
    limitations:['Four trials per policy/scenario at the default settings are a diagnostic screen, not a well-powered effectiveness estimate.',
      'Seed variants change controller commitments; explicit initial player positions are otherwise fixed and mirrored.',
      'Both teams use the same evaluated policy; this scenario screen is distinct from mixed-policy competitive matches.',
      'Completed passes require an actual deliberate kick followed by another teammate contact before opponent contact.',
      'Goal scoring stops the trial, so behavior after a first goal is not evaluated.',
      'Success means the stated physical condition only; names or action labels do not establish combination completion.',
      'Repeated-technique success measures learned observations, not proven improvement in defensive outcome.'],
    summary:EXPERT_SCENARIOS.map(record=>{
      const group=trials.filter(t=>t.scenario===record.id),summarize=policy=>{const selected=group.filter(t=>t.policy===policy);return {trials:selected.length,successes:selected.filter(t=>t.success).length,
        goals:selected.reduce((s,t)=>s+t.score.red,0),conceded:selected.reduce((s,t)=>s+t.score.blue,0),passes:selected.reduce((s,t)=>s+t.completedRedPasses,0),
        giveAndGo:selected.reduce((s,t)=>s+t.giveAndGo,0),threePlayerSequences:selected.reduce((s,t)=>s+t.threePlayerSequences,0),bankGoals:selected.filter(t=>t.bankGoal).length,
        nonFinite:selected.reduce((s,t)=>s+t.nonFinite,0)};};
      return {id:record.id,purpose:record.purpose,successDefinition:definitions[record.id],baseline:summarize('frozen Expert'),candidate:summarize('predictive Expert')};
    }),trials};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('='))),seeds=Math.max(1,Number(args.seeds)||2),horizon=Math.max(1,Number(args.horizon)||8);
  const result=evaluateScenarios({seeds,horizon});const output=args.output||'reports/scenario-results.json';mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  console.log(`Saved ${result.trials.length} physical scenario trials; ${(result.wallMilliseconds/1000).toFixed(2)}s wall.`);
}
