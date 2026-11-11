// Server-only, versioned human replay recorder and portable reinforcement telemetry.
// Captures at 5 Hz, keeps private match data on the host, and limits disk/CPU use.
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import {DEFAULT_POLICY,clampPolicy,tacticalContext} from './public/js/ai-policy.mjs';
import {createPitch} from './public/js/config.mjs';
import {NeuralModelStore} from './bot-model-store.mjs';
export const SAVE_SCHEMA='teamball.bot-memory.v1';
const folder=path.join(process.cwd(),'bot-memory');
const file=path.join(folder,'teamball-bot-memory.v1.json');
const replayDir=path.join(folder,'replays');
const MAX_BYTES=8000000;
const fresh=()=>({schema:SAVE_SCHEMA,version:1,model:'14.0',updatedAt:new Date().toISOString(),games:0,humanGames:0,
  humanSamples:0,selfPlayGames:0,replayReviews:0,policy:{...DEFAULT_POLICY},champion:{...DEFAULT_POLICY},
  contexts:{},opponentPatterns:{},quality:{evaluations:0,accepted:0,rejected:0},history:[]});
const safeWrite=(name,data)=>{const temp=name+'.tmp';fs.writeFileSync(temp,data,{mode:0o600});fs.renameSync(temp,name);};
function validate(save){if(save?.schema!==SAVE_SCHEMA||save.version!==1)throw Error('Incompatible bot memory schema');
 const p=clampPolicy(save.policy);return {...fresh(),...save,policy:p,champion:clampPolicy(save.champion||p),contexts:save.contexts&&typeof save.contexts==='object'?save.contexts:{},history:Array.isArray(save.history)?save.history.slice(-100):[]};}
const q=(n,base)=>Math.round(n/base)*base;
const ctx=(game,p)=>{const b=game.engine.ball,pi=game.pitch,dir=game.engine.attackDir(p.team),
 progress=((b.x-(dir===1?pi.left:pi.right))*dir)/(pi.right-pi.left),
 rivals=game.players.filter(v=>v.team!==p.team),pressure=Math.min(999,...rivals.map(v=>Math.hypot(v.x-b.x,v.y-b.y)));
 return `${game.size}v${game.size}:${progress<.33?'def':progress>.67?'att':'mid'}:${pressure<90?'press':'free'}:${b.y<pi.top+65||b.y>pi.bottom-65?'wall':'open'}`;};
export class BotMemoryStore{
 constructor({directory=folder}={}){this.folder=directory;this.file=path.join(directory,'teamball-bot-memory.v1.json');this.replayDir=path.join(directory,'replays');
  fs.mkdirSync(this.replayDir,{recursive:true});this.memory=fresh();try{this.memory=validate(JSON.parse(fs.readFileSync(this.file,'utf8')));}catch(e){if(e.code!=='ENOENT'){this.error=e.message;}}
  this.neural=new NeuralModelStore(directory);this.sessions=new Map();this.recentSave=0;this.paused=false;this.imported=false;}
 policy(){return this.memory.policy;}
 neuralModel(){return this.neural.model();}
 // Keep a bounded compact server-authoritative replay: no usernames, emails, or passwords.
 capture(matchId,match,{eligibleIds=[]}={}){
  if(!matchId||!match||match.state==='ended')return;
  let session=this.sessions.get(matchId);if(!session){session={id:matchId,started:Date.now(),size:match.size,frames:[],lastAt:-1,eligible:new Set(),events:[],goalCount:0};this.sessions.set(matchId,session);}
  eligibleIds.forEach(id=>session.eligible.add(id));
  if(match.engine.time-session.lastAt<.1)return;session.lastAt=match.engine.time;
  const b=match.engine.ball;
  session.frames.push({t:q(match.engine.time,.01),phase:match.state,sidesSwapped:match.sidesSwapped===true,b:[q(b.x,1),q(b.y,1),q(b.vx,1),q(b.vy,1),q(b.spin,.01),b.lastTeam==='red'?0:b.lastTeam==='blue'?1:-1],
   p:match.players.map(p=>[p.id,p.team==='red'?0:1,q(p.x,1),q(p.y,1),q(p.vx,1),q(p.vy,1),q(p.stamina,1),p.human?1:0,...(session.eligible.has(p.id)&&p.human?[q(p.input.x,.1),q(p.input.y,.1),q(p.input.aimX,.1),q(p.input.aimY,.1),p.input.sprint?1:0,p.input.shoot?1:0,q(p.shotCooldown||0,.01)]:[])])});
  if(session.frames.length>11000)session.frames.shift();
 }
 eventsFor(matchId,events){const s=this.sessions.get(matchId);if(!s)return;
  for(const e of events){if(['kick','goal','contact'].includes(e.type)){s.events.push({t:q(e.time??0,.01),type:e.type,team:e.team,player:e.player,x:q(e.x||0,1),y:q(e.y||0,1)});if(e.type==='goal')s.goalCount++;}}
  if(s.events.length>1200)s.events.splice(0,s.events.length-1200);
 }
 complete(matchId,match,{reason='complete'}={}){
  const session=this.sessions.get(matchId);if(!session)return null;this.sessions.delete(matchId);
  const eligible=session.eligible.size>0,report=match.report(),
  replay={schema:'teamball-training-replay.v1',id:session.id,started:session.started,size:session.size,
    status:reason,score:report.score,eligiblePlayerIds:[...session.eligible],frames:session.frames,events:session.events};
  try{
   const packed=gzipSync(JSON.stringify(replay));if(packed.byteLength<MAX_BYTES){safeWrite(path.join(this.replayDir,session.id+'.json.gz'),packed);}
  }catch(e){this.error=e.message;}
  this.memory.games++;if(eligible){this.memory.humanGames++;this.learnReplay(replay,report);}
  this.save();return replay;
 }
 learnReplay(replay,report){
  if(!replay?.frames?.length||!replay.eligiblePlayerIds?.length)return;
  const ids=new Set(replay.eligiblePlayerIds),rows=new Map((report.players||[]).map(p=>[p.id,p]));
  // Reward high-signal human play; constrain every update to prevent runaway copying.
  const evidence=new Map();const goalWindows=(replay.events||[]).filter(e=>e.type==='goal'&&Number.isFinite(e.t));
  for(const f of replay.frames){const b=f.b;
   for(const p of f.p){if(!ids.has(p[0])||p.length<14)continue;
    const player={x:p[2],y:p[3],team:p[1]===0?'red':'blue'};const dir=(p[1]===0?1:-1)*(f.sidesSwapped?-1:1);
    const enemies=f.p.filter(q=>q[1]!==p[1]).map(q=>({x:q[2],y:q[3]}));
    const key=tacticalContext({size:replay.size,pitch:createPitch(replay.size),ball:{x:b[0],y:b[1]},player,opponents:enemies,attackDir:dir});
    const inScoringMove=goalWindows.some(g=>g.team===player.team&&g.t>=f.t&&g.t-f.t<=4);
    const row=rows.get(p[0]),quality=inScoringMove?2.5:row?.ownGoals?0.4:row?.goals||row?.interceptions?1.2:0.7;
    const x=evidence.get(key)||{samples:0,boost:0,kick:0,forward:0,movement:0};x.samples+=quality;x.boost+=p[12]*quality;x.kick+=p[13]*quality;x.forward+=p[8]*dir*quality;x.movement+=Math.hypot(p[8],p[9])*quality;evidence.set(key,x);
   }
  }
  let added=0;for(const [key,x] of evidence){if(x.samples<3)continue;
   const old=this.memory.contexts[key]||{samples:0,boost:0,kick:0,forward:0,movement:0};const w=Math.min(x.samples,500);
   for(const k of ['boost','kick','forward','movement'])old[k]=(old[k]*old.samples+x[k]/x.samples*w)/(old.samples+w);
   old.samples=Math.min(100000,old.samples+w);this.memory.contexts[key]=old;added+=x.samples;
  }
  this.memory.humanSamples+=added;
  // Adjust bounded tactics based on successful human play patterns; benchmarked selfplay is separate.
  const selected=report.players.filter(p=>ids.has(p.id));if(!selected.length)return;
  const passes=selected.reduce((a,p)=>a+p.passes,0),shots=selected.reduce((a,p)=>a+p.shots,0),own=selected.reduce((a,p)=>a+p.ownGoals,0);
  const good=(selected.reduce((a,p)=>a+p.goals*2+p.interceptions*.2,0)+passes*.1-own*2);
  if(good>0){const t=this.memory.policy;const adjustment=Math.min(.002,good*.00002);
   if(passes>shots)t.passPreference=Math.min(1.35,t.passPreference+adjustment);
   if(shots>passes)t.shotPreference=Math.min(1.3,t.shotPreference+adjustment*.5);
   if(own===0)t.frontPost=Math.min(1.5,t.frontPost+adjustment*.4);
  }
  this.memory.policy=clampPolicy(this.memory.policy);
 }
 applySelfPlay(result){if(!result||!Number.isFinite(result.score))return false;this.memory.selfPlayGames+=result.games||0;if(result.reviewedReplay)this.memory.replayReviews=(this.memory.replayReviews||0)+1;
  this.memory.quality.evaluations++;const accepted=result.score>0.35&&result.goalsAgainst<=result.baselineGoalsAgainst+2;
  if(accepted){this.memory.policy=clampPolicy(result.candidate);this.memory.champion={...this.memory.policy};this.memory.quality.accepted++;}else this.memory.quality.rejected++;
  this.memory.history.push({at:Date.now(),type:'evaluation',accepted,score:Math.round(result.score*100)/100});this.memory.history=this.memory.history.slice(-100);this.save();return accepted;
 }
 save(){this.memory.updatedAt=new Date().toISOString();try{safeWrite(this.file,JSON.stringify(this.memory,null,2));this.recentSave=Date.now();}catch(e){this.error=e.message;}}
 import(json){const parsed=validate(typeof json==='string'?JSON.parse(json):json);
  if(fs.existsSync(this.file))fs.copyFileSync(this.file,this.file+'.bak');this.memory=parsed;this.save();return this.memory;}
 reset(){if(fs.existsSync(this.file))fs.copyFileSync(this.file,this.file+'.bak');this.memory=fresh();this.save();}
 status(){return {schema:this.memory.schema,model:this.memory.model,games:this.memory.games,humanGames:this.memory.humanGames,humanSamples:this.memory.humanSamples,selfPlayGames:this.memory.selfPlayGames,replayReviews:this.memory.replayReviews||0,contexts:Object.keys(this.memory.contexts).length,quality:this.memory.quality,updatedAt:this.memory.updatedAt,error:this.error||null,paused:this.paused,neural:this.neural.status(),neuralTraining:this.neuralTrainingStatus||null};}
}
export function loadReplay(name,store){const target=path.resolve(store.replayDir,name);if(!target.startsWith(store.replayDir+path.sep)||!target.endsWith('.json.gz'))throw Error('Invalid replay file');return JSON.parse(gunzipSync(fs.readFileSync(target)));}
