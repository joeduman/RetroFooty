// Live Match/Physics comparison. This never imports, trains, or promotes a model.
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {Match} from '../public/js/match.mjs';
import {AIController} from '../public/js/ai.mjs';
import {AIController as BaselineAI} from './fixtures/expert-baseline/ai.mjs';
import {AIController as PredictiveV1AI} from './fixtures/expert-v1/expert-ai.mjs';
import {STEP,TUNING as C,distance} from '../public/js/config.mjs';

const other=team=>team==='red'?'blue':'red';
const round=n=>Number(n.toFixed(5));
const opponentController=opponent=>{
  if(opponent==='legacy')return BaselineAI;
  if(opponent==='predictive-v1')return PredictiveV1AI;
  throw new Error(`Unknown benchmark opponent: ${opponent}`);
};
export class ComparisonController {
  constructor(engine,seed,candidateTeam='red',control=false,opponent='legacy'){
    this.engine=engine;this.candidateTeam=candidateTeam;
    const Opponent=opponentController(opponent);
    this.baseline=new Opponent(engine,seed);
    this.candidate=new (control?Opponent:AIController)(engine,seed);
    this.memory=new Map(engine.players.map(p=>[p.id,this.owner(p.team).memory.get(p.id)]));
  }
  owner(team){return team===this.candidateTeam?this.candidate:this.baseline;}
  reset(){this.baseline.reset();this.candidate.reset();}
  onKick(id){const player=this.engine.players.find(p=>p.id===id);if(player)this.owner(player.team).onKick(id);}
  update(){
    // Both policies observe the previous frame's authoritative inputs. The
    // second policy must not inspect its opponent's just-chosen future input.
    const previous=this.engine.players.map(p=>[p,{...p.input}]);
    this.baseline.update();
    const saved=this.engine.players.filter(p=>p.team!==this.candidateTeam).map(p=>[p,{...p.input}]);
    for(const [player,input] of previous)player.input=input;
    this.candidate.update();
    for(const [player,input] of saved)player.input=input;
  }
}

function teamTelemetry(){return {boostSpent:0,kickoffBoostSpent:0,spacingSamples:0,nearestSpacing:0,clustered:0,
  supportSamples:0,supportAvailable:0,roleChanges:0,roles:new Map(),dangerSamples:0,dangerBoost:0,
  ownDirectedContacts:0,loopEpisodes:0,loopWindow:null,loopActive:false};}

export function runComparison({size=1,seed=42000,duration=60,candidateTeam='red',control=false,initialSwapped=false,opponent='legacy'}={}){
  const game=new Match({size,spectator:true,seed,duration,goldenGoal:false,loop:false});
  game.ai=new ComparisonController(game.engine,seed,candidateTeam,control,opponent);
  if(initialSwapped){game.sidesSwapped=true;game.engine.setSidesSwapped(true);game.tracker.sidesSwapped=true;game.spawn();}
  const rows={red:teamTelemetry(),blue:teamTelemetry()},start=performance.now();
  let frames=0,nonFinite=0,maxLiveUpdateMs=0,nextSample=0,nextLoop=0;
  // An unresolved final attack can extend regulation. Censor explicitly instead
  // of changing the engine's existing half/fulltime rules.
  const maximumFrames=Math.ceil((duration+180)*120);
  while(game.state!=='ended'&&frames++<maximumFrames){
    const oldStamina=new Map(game.players.map(p=>[p.id,p.stamina]));
    const wasPlaying=game.state==='playing',wasKickoff=Boolean(game.engine.kickoff),before=performance.now();
    game.update(STEP);
    if(wasPlaying)maxLiveUpdateMs=Math.max(maxLiveUpdateMs,performance.now()-before);
    for(const player of game.players){
      const spent=Math.max(0,oldStamina.get(player.id)-player.stamina);
      rows[player.team].boostSpent+=spent;
      if(wasKickoff)rows[player.team].kickoffBoostSpent+=spent;
      if(!Number.isFinite(player.x+player.y+player.vx+player.vy+player.stamina))nonFinite++;
    }
    if(!Number.isFinite(game.engine.ball.x+game.engine.ball.y+game.engine.ball.vx+game.engine.ball.vy))nonFinite++;
    for(const event of game.events){
      if(event.type!=='contact')continue;
      const player=game.players.find(p=>p.id===event.player),b=game.engine.ball;
      if(player&&b.lastPlayer===player.id&&b.vx*game.engine.attackDir(player.team)<-55&&distance(player,b)<45)
        rows[player.team].ownDirectedContacts++;
    }
    if(wasPlaying&&game.engine.time>=nextSample){
      nextSample=game.engine.time+.2;
      const b=game.engine.ball;
      for(const team of ['red','blue']){
        const r=rows[team],mates=game.players.filter(p=>p.team===team),rivals=game.players.filter(p=>p.team!==team);
        for(const player of mates){
          if(size>1){const nearest=Math.min(...mates.filter(p=>p!==player).map(p=>distance(p,player)));r.nearestSpacing+=nearest;r.spacingSamples++;if(nearest<80)r.clustered++;}
          const controller=game.ai.owner(team),plan=controller.plans?.[team];
          const role=plan?.chaser===player?'chaser':plan?.cover===player?'cover':plan?.anchor===player?'anchor':'support';
          if(r.roles.has(player.id)&&r.roles.get(player.id)!==role)r.roleChanges++;
          r.roles.set(player.id,role);
        }
        const carrier=mates.find(p=>distance(p,b)<50&&b.lastTeam===team);
        if(carrier&&size>1){
          r.supportSamples++;
          if(mates.some(p=>p!==carrier&&distance(p,b)>85&&distance(p,b)<450&&Math.min(...rivals.map(q=>distance(q,p)))>70))r.supportAvailable++;
        }
        const own=game.engine.attackDir(team)===1?game.pitch.left:game.pitch.right;
        if(Math.abs(b.x-own)<230&&Math.abs(b.y-game.pitch.height/2)<game.pitch.goalWidth){
          r.dangerSamples++;r.dangerBoost+=mates.reduce((sum,p)=>sum+p.stamina,0)/size;
        }
      }
    }
    if(wasPlaying&&game.engine.time>=nextLoop){
      nextLoop=game.engine.time+.5;
      const b=game.engine.ball;
      for(const team of ['red','blue']){
        const r=rows[team],near=game.players.some(p=>p.team===team&&distance(p,b)<100);
        if(!near){r.loopWindow=null;r.loopActive=false;continue;}
        r.loopWindow??={x:b.x,y:b.y,at:game.engine.time};
        if(distance(r.loopWindow,b)>45){r.loopWindow={x:b.x,y:b.y,at:game.engine.time};r.loopActive=false;}
        else if(game.engine.time-r.loopWindow.at>3&&!r.loopActive){r.loopEpisodes++;r.loopActive=true;}
      }
    }
  }
  const report=game.report(),teams={};
  for(const team of ['red','blue']){
    const r=rows[team],players=report.players.filter(p=>p.team===team),sum=key=>players.reduce((s,p)=>s+p[key],0);
    teams[team]={goals:game.score[team],goalsConceded:game.score[other(team)],shots:sum('shots'),onTarget:sum('onTarget'),kicks:sum('kicks'),
      completedPasses:sum('passes'),passAttempts:sum('passAttempts'),interceptions:sum('interceptions'),ownGoals:sum('ownGoals'),
      sprintSeconds:round(sum('sprintSeconds')),boostSpent:round(r.boostSpent),kickoffBoostSpent:round(r.kickoffBoostSpent),
      nearestTeammateSpacing:r.spacingSamples?round(r.nearestSpacing/r.spacingSamples):null,
      clusteredFraction:r.spacingSamples?round(r.clustered/r.spacingSamples):null,
      supportAvailability:r.supportSamples?round(r.supportAvailable/r.supportSamples):null,
      roleChanges:r.roleChanges,meanBoostDuringDanger:r.dangerSamples?round(r.dangerBoost/r.dangerSamples):null,
      ownDirectedContacts:r.ownDirectedContacts,stationaryPossessionLoops:r.loopEpisodes};
  }
  return {size,seed,duration,candidateTeam,initialSwapped,control,opponent,score:{...game.score},finished:game.state==='ended',
    censored:game.state!=='ended',liveSeconds:round(game.tracker.elapsed),frames,nonFinite,
    wallMilliseconds:round(performance.now()-start),maxLiveUpdateMs:round(maxLiveUpdateMs),teams,
    candidate:teams[candidateTeam],baseline:teams[other(candidateTeam)]};
}

function interval(mean,sem){return [round(mean-1.96*sem),round(mean+1.96*sem)];}
export function summarize(matches){
  return [1,2,3,4,5].map(size=>{
    const games=matches.filter(m=>m.size===size),n=games.length;if(!n)return {size,games:0};
    const wins=games.filter(m=>m.candidate.goals>m.baseline.goals).length,losses=games.filter(m=>m.candidate.goals<m.baseline.goals).length,draws=n-wins-losses;
    const pairs=[];for(let i=0;i<games.length;i+=2){const pair=games.slice(i,i+2);pairs.push(pair.reduce((s,m)=>s+m.candidate.goals-m.baseline.goals,0)/pair.length);}
    const mean=pairs.reduce((s,v)=>s+v,0)/pairs.length,variance=pairs.length>1?pairs.reduce((s,v)=>s+(v-mean)**2,0)/(pairs.length-1):0;
    const sum=(side,key)=>games.reduce((s,m)=>s+(m[side][key]??0),0),avg=(side,key)=>{const values=games.map(m=>m[side][key]).filter(v=>v!==null);return values.length?round(values.reduce((s,v)=>s+v,0)/values.length):null;};
    const comparison={};
    for(const side of ['candidate','baseline'])comparison[side]={goalsPerGame:round(sum(side,'goals')/n),goalsConcededPerGame:round(sum(side,'goalsConceded')/n),
      shots:sum(side,'shots'),shotAccuracy:sum(side,'shots')?round(sum(side,'onTarget')/sum(side,'shots')):null,
      goalsPerShot:sum(side,'shots')?round(sum(side,'goals')/sum(side,'shots')):null,
      completedPasses:sum(side,'completedPasses'),passAttempts:sum(side,'passAttempts'),interceptions:sum(side,'interceptions'),ownGoals:sum(side,'ownGoals'),
      boostSpentPerGame:round(sum(side,'boostSpent')/n),kickoffBoostSpent:round(sum(side,'kickoffBoostSpent')),
      nearestTeammateSpacing:avg(side,'nearestTeammateSpacing'),clusteredFraction:avg(side,'clusteredFraction'),supportAvailability:avg(side,'supportAvailability'),
      roleChangesPerGame:round(sum(side,'roleChanges')/n),meanBoostDuringDanger:avg(side,'meanBoostDuringDanger'),
      ownDirectedContacts:sum(side,'ownDirectedContacts'),stationaryPossessionLoops:sum(side,'stationaryPossessionLoops')};
    // Wilson interval applies to decisive outcomes only; draws stay explicit.
    const decisive=wins+losses,z=1.96,p=decisive?wins/decisive:0,denom=1+z*z/(decisive||1),center=(p+z*z/(2*(decisive||1)))/denom,
      half=z*Math.sqrt(p*(1-p)/(decisive||1)+z*z/(4*(decisive||1)**2))/denom;
    return {size,games:n,pairedSeeds:pairs.length,wins,draws,losses,winRate:round(wins/n),drawAdjustedScore:round((wins+.5*draws)/n),
      decisiveWin95Wilson:decisive?[round(center-half),round(center+half)]:null,
      goalDifferentialPerGame:round(mean),pairedGoalDifferential95Approx:pairs.length>1?interval(mean,Math.sqrt(variance/pairs.length)):null,
      unfinished:games.filter(m=>m.censored).length,nonFinite:games.reduce((s,m)=>s+m.nonFinite,0),...comparison};
  });
}

function sources(){
  const root=new URL('../public/js/',import.meta.url),names=['ai.mjs','match.mjs','physics.mjs','config.mjs','ai-policy.mjs','neural-policy.mjs','stats.mjs','customize.mjs',
    ...readdirSync(root).filter(n=>/^(ai-(prediction|active-memory|expert|legacy)|expert-ai)\.mjs$/.test(n))];
  const entries=names.map(name=>['public/js/'+name,createHash('sha256').update(readFileSync(new URL(name,root))).digest('hex')]);
  entries.push(['tests/fixtures/expert-baseline/ai.mjs',createHash('sha256').update(readFileSync(new URL('./fixtures/expert-baseline/ai.mjs',import.meta.url))).digest('hex')]);
  for(const name of ['expert-ai.mjs','ai-prediction.mjs','ai-active-memory.mjs','manifest.json'])
    entries.push(['tests/fixtures/expert-v1/'+name,createHash('sha256').update(readFileSync(new URL('./fixtures/expert-v1/'+name,import.meta.url))).digest('hex')]);
  entries.push(['tests/expert-benchmark.mjs',createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex')]);
  return Object.fromEntries(entries);
}

export async function benchmark(options={}){
  const {games=12,duration=60,seed=42000,control=false,sizes=[1,2,3,4,5],opponent='legacy'}=options,matches=[],sourceHashes=sources();
  opponentController(opponent);
  for(const size of sizes){
    for(let run=0;run<games;run++)for(const candidateTeam of ['red','blue'])
      matches.push(runComparison({size,seed:seed+run*7919,duration,candidateTeam,control,initialSwapped:Boolean(run%2),opponent}));
    const group=summarize(matches).find(r=>r.size===size);
    console.log(`${size}v${size}: ${group.wins}W ${group.draws}D ${group.losses}L; goal difference/game ${group.goalDifferentialPerGame}`);
  }
  const finalSources=sources(),sourcesChanged=JSON.stringify(sourceHashes)!==JSON.stringify(finalSources);
  return {schema:'teamball.expert-benchmark.v1',testedAt:new Date().toISOString(),engineStep:STEP,control,
    candidateVersion:control?(opponent==='predictive-v1'?'frozen predictive Expert v1':'frozen previous Expert'):'working tree Expert',baselineVersion:JSON.parse(readFileSync(new URL(opponent==='predictive-v1'?'./fixtures/expert-v1/manifest.json':'./fixtures/expert-baseline/manifest.json',import.meta.url),'utf8').replace(/^\uFEFF/,'')),
    sources:sourceHashes,sourcesChanged,...(sourcesChanged?{sourcesAtCompletion:finalSources}:{}),configuration:{pairedSeedsPerMode:games,duration,firstSeed:seed,seedStride:7919,sizes,opponent,maps:'createPitch(size), unchanged build 15 geometry',
      models:'none; default policy for both',colors:'paired each seed red and blue',sides:'alternate initial orientation; normal halftime rules retained',goldenGoal:false},
    limitations:['No human opponents evaluated.','Short fixtures measure runtime policy under these maps and seeds, not elite-human strength.',
      'Own-directed contacts include intentional defensive/backward touches; not equivalent to unintended own-goal mistakes.',
      'Stationary possession loops mean a nearby bot and ball remaining within 45 pixels for >3 seconds; tactical necessity is not classified.',
      'Support availability measures receiver distance and space, not interception-safe passing lanes.',
      'Shot labels come from the existing MatchStats trajectory heuristic; bank shots may be undercounted.',
      'Peak update time includes runtime/OS pauses and is not a stable latency percentile.',
      'Wall and update time include both controllers plus shared Match/Physics; they are not production candidate-only CPU measurements.',
      '95% paired goal intervals use a normal approximation; interpret cautiously at small sample sizes.'],
    summary:summarize(matches),totalWallMilliseconds:round(matches.reduce((s,m)=>s+m.wallMilliseconds,0)),matches};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
  const games=Math.max(1,Number(args.games)||12),duration=Math.max(5,Number(args.duration)||60),seed=Number(args.seed)||42000,
    control=Object.hasOwn(args,'control'),sizes=args.sizes?args.sizes.split(',').map(Number).filter(n=>n>=1&&n<=5):[1,2,3,4,5];
  const opponent=args.opponent||'legacy';
  const result=await benchmark({games,duration,seed,control,sizes,opponent});
  const output=args.output||'reports/benchmark-results.json';mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  console.log(`Saved ${result.matches.length} matches to ${output}; CPU/wall ${round(result.totalWallMilliseconds/1000)} seconds.`);
  if(result.matches.some(m=>m.nonFinite||m.censored))process.exitCode=1;
}
