// Runtime profiler only: no model training, memory promotion, or network server.
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {cpus,platform,release} from 'node:os';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {Match} from '../public/js/match.mjs';
import {ParkWorld} from '../park.mjs';
import {AIController as Baseline} from './fixtures/expert-baseline/ai.mjs';
import {STEP} from '../public/js/config.mjs';

const round=n=>Number(n.toFixed(5));
const budget=STEP*1000;
export function distribution(values){
  const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;
  const at=f=>n?round(sorted[Math.min(n-1,Math.floor((n-1)*f))]):null;
  return {samples:n,meanMs:n?round(values.reduce((s,v)=>s+v,0)/n):null,
    p50Ms:at(.50),p95Ms:at(.95),p99Ms:at(.99),maxMs:n?round(sorted[n-1]):null,
    overTickBudget:n?values.filter(v=>v>budget).length:0};
}

function instrument(game,baseline,seed,context){
  if(baseline){game.ai=new Baseline(game.engine,seed);game.ai.reset();}
  const controller=game.ai,update=controller.update.bind(controller);
  const samples={all:[],planning:[],ordinary:[]};
  controller.update=()=>{
    if(!context.collect)return update();
    const planning=game.engine.time>=controller.nextPlan,start=performance.now();
    update();const elapsed=performance.now()-start;
    context.planning+=Number(planning);samples.all.push(elapsed);
    samples[planning?'planning':'ordinary'].push(elapsed);
  };
  return {size:game.size,samples};
}

function makeCase({park,baseline,seed,seconds,warmup}){
  const context={collect:false,planning:0},controllers=[];
  let advance,games;
  if(park){
    const world=new ParkWorld({duration:3600,goldenGoal:false});
    games=world.fields.map(field=>{
      const gameSeed=seed+field.size*1297;
      field.game=new Match({size:field.size,spectator:true,seed:gameSeed,duration:3600,goldenGoal:false,loop:false});
      controllers.push(instrument(field.game,baseline,gameSeed,context));return field.game;
    });
    advance=()=>world.tick(STEP);
  }else{
    const game=new Match({size:5,spectator:true,seed,duration:3600,goldenGoal:false,loop:false});
    controllers.push(instrument(game,baseline,seed,context));games=[game];advance=()=>game.update(STEP);
  }
  for(let tick=0;tick<Math.round(warmup/STEP);tick++)advance();
  const ticks=[],liveTicks=[],byConcurrentPlanning=Array.from({length:6},()=>[]);
  context.collect=true;const start=performance.now(),cpu=process.cpuUsage();
  for(let tick=0;tick<Math.round(seconds/STEP);tick++){
    context.planning=0;const playing=games.some(game=>game.state==='playing'),before=performance.now();
    advance();const elapsed=performance.now()-before;
    ticks.push(elapsed);if(playing)liveTicks.push(elapsed);
    byConcurrentPlanning[context.planning].push(elapsed);
  }
  const cpuUsed=process.cpuUsage(cpu),wallMilliseconds=performance.now()-start;
  return {case:park?'park-all-five-courts':'single-5v5',version:baseline?'frozen-previous-Expert':'predictive-Expert',
    simulatedSeconds:seconds,warmupSeconds:warmup,wallMilliseconds:round(wallMilliseconds),
    processCpuMilliseconds:round((cpuUsed.user+cpuUsed.system)/1000),
    totalTick:distribution(ticks),liveTick:distribution(liveTicks),
    ticksByConcurrentPlannerCount:byConcurrentPlanning.map((samples,count)=>({count,...distribution(samples)})),
    controllers:controllers.map(({size,samples})=>({size,all:distribution(samples.all),planning:distribution(samples.planning),ordinary:distribution(samples.ordinary)})),
    finalState:games.map(game=>({size:game.size,state:game.state,score:game.score,liveSeconds:round(game.engine.time)}))};
}

function synchronizedBurst({seed,warmup,count}){
  const world=new ParkWorld({duration:3600,goldenGoal:false});
  for(const field of world.fields)field.game=new Match({size:field.size,spectator:true,seed:seed+field.size*1297,duration:3600,goldenGoal:false,loop:false});
  for(let i=0;i<Math.round(warmup/STEP);i++)world.tick(STEP);
  const samples=[];
  for(let i=0;i<count;i++){
    // Explicit worst-case workload: all controllers perform a fresh decision on
    // the same tick, as can occur after field restart. This is not normal cadence.
    for(const field of world.fields){field.game.state='playing';field.game.wait=0;field.game.ai.nextPlan=field.game.engine.time;}
    const before=performance.now();world.tick(STEP);samples.push(performance.now()-before);
  }
  return {case:'forced-simultaneous-five-planner-refresh',description:'Each sampled tick forces all five actual field controllers to replan; ordinary cadence is measured separately.',...distribution(samples)};
}

export function profileExpert({seconds=30,warmup=8,seed=117731,burstSamples=120}={}){
  const results=[];
  for(const park of [false,true])for(const baseline of [true,false]){
    const result=makeCase({park,baseline,seed,seconds,warmup});results.push(result);
    console.log(`${result.case} ${result.version}: total p50/p95/p99 ${result.totalTick.p50Ms}/${result.totalTick.p95Ms}/${result.totalTick.p99Ms}ms; ${result.totalTick.overTickBudget} ticks > ${budget.toFixed(2)}ms`);
  }
  const burst=synchronizedBurst({seed,warmup,count:burstSamples});
  console.log(`Five synchronized planners: ${burst.p50Ms}/${burst.p95Ms}/${burst.p99Ms}ms`);
  const sources=Object.fromEntries(['expert-ai.mjs','ai-prediction.mjs','ai-legacy.mjs'].map(name=>[name,createHash('sha256').update(readFileSync(new URL(`../public/js/${name}`,import.meta.url))).digest('hex')]));
  return {schema:'teamball.expert-performance.v1',measuredAt:new Date().toISOString(),sources,
    environment:{node:process.version,platform:platform(),release:release(),processor:cpus()[0]?.model,logicalProcessors:cpus().length},
    configuration:{seconds,warmup,seed,burstSamples,tickMilliseconds:budget,models:'none',parkHumans:0,parkBots:30,activeMemoryService:false,networkSerialization:false},
    methodology:['Deterministic seed and fixed 120Hz engine inputs; each baseline/candidate case starts independently.',
      'Warmup is excluded. Controller distributions include actual calls made by Match.update, separated by whether a team plan is due.',
      'Whole-tick measurements include physics and match state handling. Park uses the real ParkWorld.tick across all five courts.',
      'No live server sockets, rendering, snapshot serialization, persistence service or human input is included.',
      'Wall timings include scheduler and garbage-collection pauses; concurrent host load can affect tails.',
      'The synchronized planner case forces refreshes for a worst-case burst; it does not represent normal planning frequency.'],
    results,synchronizedBurst:burst};
}

function markdown(report){
  const rows=report.results.map(r=>`| ${r.case} | ${r.version} | ${r.totalTick.p50Ms} | ${r.totalTick.p95Ms} | ${r.totalTick.p99Ms} | ${r.totalTick.overTickBudget}/${r.totalTick.samples} |`).join('\n');
  const controllerRows=report.results.flatMap(r=>r.controllers.map(c=>`| ${r.case} ${r.version} ${c.size}v${c.size} | ${c.planning.p50Ms} | ${c.planning.p95Ms} | ${c.planning.p99Ms} | ${c.ordinary.p50Ms} | ${c.ordinary.p95Ms} | ${c.ordinary.p99Ms} |`)).join('\n');
  const burst=report.synchronizedBurst;
  return `# Expert runtime performance\n\nMeasured ${report.measuredAt}. ${report.environment.node}; ${report.environment.processor}. Fixed tick budget: ${round(budget)} ms. ${report.configuration.seconds} simulated seconds per case after ${report.configuration.warmup} seconds of excluded warmup.\n\n| Whole tick | Controller | p50 ms | p95 ms | p99 ms | Ticks over budget |\n|---|---|---:|---:|---:|---:|\n${rows}\n\n| Controller calls | Planning p50 | Planning p95 | Planning p99 | Ordinary p50 | Ordinary p95 | Ordinary p99 |\n|---|---:|---:|---:|---:|---:|---:|\n${controllerRows}\n\nForced synchronized five-field planning burst (${burst.samples} samples): p50 ${burst.p50Ms} ms, p95 ${burst.p95Ms} ms, p99 ${burst.p99Ms} ms; ${burst.overTickBudget} exceeded the fixed tick budget. This case forces all five planners to refresh every sampled tick to expose worst-case scheduling cost.\n\nThe profile measures actual Match.update and ParkWorld.tick with no sockets, rendering, snapshot serialization or persistence service. It includes 30 Park bots. Independent deterministic baseline/candidate runs use identical seeds; match states diverge as policies act differently. Wall tails include scheduler/GC pauses and may include concurrent host load. CPU timings, source hashes, per-field planning/ordinary sample counts and concurrency buckets are in performance.json.\n`;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=Object.fromEntries(process.argv.slice(2).map(value=>value.replace(/^--/,'').split('=')));
  const result=profileExpert({seconds:Number(args.seconds)||30,warmup:Number(args.warmup)||8,seed:Number(args.seed)||117731,burstSamples:Number(args.burst)||120});
  const output=args.output||'docs/expert-ai/performance.json';writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  writeFileSync(output.replace(/\.json$/,'.md'),markdown(result));
}
