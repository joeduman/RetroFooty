import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {RANKED,canonicalName,division,overtimeThreshold} from './public/js/ranked-config.mjs';
export const expected=(a,b)=>1/(1+10**((b-a)/400));
// Largest-remainder allocation, with canonical identity as a stable tie breaker.
function allocate(pool,players,weights){
 const total=weights.reduce((a,b)=>a+b,0),raw=weights.map(w=>pool*w/total),out=raw.map(Math.floor);
 const order=players.map((p,i)=>({i,key:p.key,fraction:raw[i]-out[i]})).sort((a,b)=>b.fraction-a.fraction||a.key.localeCompare(b.key,'en'));
 for(let n=Math.round(pool)-out.reduce((a,b)=>a+b,0),i=0;i<n;i++)out[order[i].i]++;
 return out;
}
export function calculateElo(roster,score,{drawBonus=RANKED.drawBonus}={}){
 const teams=['red','blue'].map(team=>roster.filter(p=>p.team===team)),n=teams[0].length;
 if(!RANKED.k[n]||teams[1].length!==n)throw Error('Ranked requires equal full teams');
 if(score.red===score.blue)return Object.fromEntries(roster.map(p=>[p.key,drawBonus]));
 const avg=teams.map(ps=>ps.reduce((s,p)=>s+p.elo,0)/n),win=score.red>score.blue?0:1,lose=1-win;
 const probability=expected(avg[win],avg[lose]),pool=n*RANKED.k[n]*(1-probability),changes={};
 for(const t of [win,lose]){
  const pTeam=expected(avg[t],avg[1-t]);
  const weights=teams[t].map(p=>.7*(t===win?1-expected(p.elo,avg[1-t]):expected(p.elo,avg[1-t]))+.3*(t===win?1-pTeam:pTeam));
  const deltas=allocate(pool*(t===win?1.25:1),teams[t],weights);
  teams[t].forEach((p,i)=>changes[p.key]=deltas[i]*(t===win?1:-1));
 }
 return changes;
}
export class RankedStore {
 constructor({file=path.join(process.cwd(),'server-data','ranked.json'),now=()=>Date.now(),config={}}={}){
  this.file=file;this.now=now;this.config={...RANKED,...config};this.online=new Map();
  this.db={version:1,season:'season-1',players:{},bots:{},matches:{},seasons:[],audit:[]};
  if(fs.existsSync(file)){this.db=JSON.parse(fs.readFileSync(file,'utf8'));if(this.db.version!==1)throw Error('Unsupported ranked database');}
  // Live physics is not persisted. Unfinished matches are voided on restart;
  // completed results and their pending reconnect decisions remain durable.
  this.db.bots??={};let changed=false;for(const m of Object.values(this.db.matches))if(!m.score&&!m.void){m.void='server restart';changed=true;}
  if(changed)this.save();this.sweep();
 }
 save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});const temp=this.file+'.tmp';const fd=fs.openSync(temp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(this.db));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,this.file);}
 player(name){const key=canonicalName(name);if(!key||['__proto__','constructor','prototype'].includes(key))throw Error('Choose another username');
  if(!Object.hasOwn(this.db.players,key)){this.db.players[key]={id:randomUUID(),accountId:null,key,name:String(name).trim(),elo:this.config.initialElo,peak:this.config.initialElo,seasonPeak:this.config.initialElo,wins:0,losses:0,draws:0,played:0,season:this.db.season,history:[]};this.save();}
  return this.db.players[key];
 }
 claim(name,owner){const p=this.player(name);if(this.online.has(p.key)&&this.online.get(p.key)!==owner)throw Error('That username is already online');this.online.set(p.key,owner);return p;}
 bot(id,name='Bot'){if(!Object.hasOwn(this.db.bots,id)){this.db.bots[id]={id,key:'bot:'+id,bot:true,name,elo:this.config.initialElo,peak:this.config.initialElo,seasonPeak:this.config.initialElo,wins:0,losses:0,draws:0,played:0,season:this.db.season,history:[]};this.save();}return this.db.bots[id];}
 record(p){return p.bot?this.db.bots[p.botId]:this.db.players[p.key];}
 rosterPlayer(p){const r=p.bot?this.bot(p.botId,p.name):this.player(p.name);return {...this.summaryRecord(r),bot:!!p.bot,botId:p.botId,team:p.team,slot:p.slot,token:p.token||randomBytes(24).toString('hex'),deadline:null,disconnected:false,settled:false};}
 summaryRecord(p){return {name:p.name,key:p.key,elo:p.elo,peak:p.peak,wins:p.wins,losses:p.losses,draws:p.draws,played:p.played,season:p.season,rank:division(p.elo)};}
 void(id,reason){const m=this.db.matches[id];if(m&&!m.score&&!m.void){
  // A full-roster reset cancels the unfinished score, but cannot erase an
  // abandonment whose shield already expired earlier in this round.
  for(const p of [...m.players,...(m.departures||[])])if(!p.bot&&!p.settled&&p.disconnected&&p.deadline<=this.now()){
   const delta=p.lossDelta??calculateElo(m.players,p.team==='red'?{red:0,blue:1}:{red:1,blue:0})[p.key];this.applyResult(p,delta,'losses',true);
  }
  m.void=reason;this.save();
 }}
 replaceSlot(id,participant){const m=this.db.matches[id];if(!m||m.void||m.score)return;const index=m.players.findIndex(p=>p.slot===participant.slot);if(index<0)throw Error('Unknown ranked slot');const old=m.players[index];
  if(old.bot===!!participant.bot&&(old.bot?old.botId===participant.botId:old.key===canonicalName(participant.name)))return;
  if(!old.bot){if(!old.disconnected&&m.startedPlay)throw Error('Human slot is still occupied');if(old.disconnected){old.lossDelta=calculateElo(m.players,old.team==='red'?{red:0,blue:1}:{red:1,blue:0})[old.key];(m.departures??=[]).push(old);}}
  m.players[index]=this.rosterPlayer(participant);this.save();
 }
 release(name,owner){const key=canonicalName(name);if(this.online.get(key)===owner)this.online.delete(key);}
 hasPending(name){const key=canonicalName(name);return Object.values(this.db.matches).some(m=>!m.void&&[...m.players,...(m.departures||[])].some(p=>p.key===key&&!p.settled));}
 summary(name){const p=this.player(name);return {name:p.name,key:p.key,elo:p.elo,peak:p.peak,wins:p.wins,losses:p.losses,draws:p.draws,played:p.played,season:p.season,rank:division(p.elo)};}
 leaderboard(onlineOnly=false){return Object.values(this.db.players).filter(p=>!onlineOnly||this.online.has(p.key)).sort((a,b)=>b.elo-a.elo||a.key.localeCompare(b.key,'en')).map(p=>({...this.summary(p.name),online:this.online.has(p.key)}));}
 begin(id,roster,duration){
  if(this.db.matches[id])throw Error('Match already exists');
  const n=roster.length/2;
  if(!RANKED.k[n]||!Number.isFinite(duration)||duration<=0||roster.some(p=>p.bot&&(!p.botId||typeof p.botId!=='string'))||new Set(roster.map(p=>p.bot?'bot:'+p.botId:canonicalName(p.name))).size!==roster.length||['red','blue'].some(t=>roster.filter(p=>p.team===t).length!==n))throw Error('Ranked requires a complete valid roster');
  const players=roster.map(p=>this.rosterPlayer(p));
  // Prevent entering a second ranked match while an earlier result is pending.
  if(players.some(p=>!p.bot&&this.hasPending(p.name)))throw Error('A previous ranked result is still pending');
  this.db.matches[id]={id,season:this.db.season,started:this.now(),duration,players,score:null,changes:null};this.save();return this.db.matches[id];
 }
 voteAllowed(size,votes){return votes>=overtimeThreshold(size);}
 disconnect(id,name){const m=this.db.matches[id],p=m&&[...m.players,...(m.departures||[])].find(p=>p.key===canonicalName(name));if(!p||p.settled||m.void)return;p.disconnected=true;p.deadline??=this.now()+m.duration*500;this.save();}
 reconnect(id,name,token){const m=this.db.matches[id],p=m&&[...m.players,...(m.departures||[])].find(p=>p.key===canonicalName(name));if(!p||m.void||p.token!==token||!p.disconnected||p.deadline<=this.now())return false;p.disconnected=false;this.settle(m);this.save();return true;}
 recoverPending(name,token){const key=canonicalName(name);for(const m of Object.values(this.db.matches)){const p=m.players.find(p=>p.key===key&&!p.settled);if(m.void||!p)continue;if(!m.score)continue;if(!this.reconnect(m.id,name,token))throw Error('A valid reconnect token is required for the pending result');}}
 finish(id,score){const m=this.db.matches[id];if(!m||m.void)return null;if(!m.score){
   m.score={red:score.red,blue:score.blue};m.finished=this.now();
   const group=JSON.stringify(m.players.map(p=>p.key).sort());
   const recent=Object.values(this.db.matches).filter(x=>x.id!==id&&x.finished>this.now()-this.config.drawWindowMs&&JSON.stringify(x.players.map(p=>p.key).sort())===group);
   const draws=recent.filter(x=>x.score?.red===x.score?.blue).length;
   m.drawReward=draws>=this.config.maxRewardedDraws?0:this.config.drawBonus;
   if(recent.length>=3||draws>=this.config.maxRewardedDraws)this.db.audit.push({id,at:this.now(),reason:'repeated matchup',draws,group});
   m.changes=calculateElo(m.players,m.score,{drawBonus:m.drawReward});
   // A departed winner or drawing player gets their expected loss against the
   // same frozen opposition. A normal loser already has the correct loss.
   m.losses={};for(const team of ['red','blue']){const simulated=team==='red'?{red:0,blue:1}:{red:1,blue:0};Object.assign(m.losses,Object.fromEntries(m.players.filter(p=>p.team===team).map(p=>[p.key,calculateElo(m.players,simulated)[p.key]])));}
  }
  this.settle(m);this.save();return this.result(id);
 }
 settle(m){if(!m.score||m.void)return;for(const p of [...m.players,...(m.departures||[])]){if(p.settled)continue;const abandoned=p.disconnected&&p.deadline<=this.now();if(p.disconnected&&!abandoned)continue;
   const delta=abandoned?(p.lossDelta??m.losses[p.key]):m.changes[p.key];
   const outcome=abandoned?'losses':m.score.red===m.score.blue?'draws':m.score[p.team]>m.score[p.team==='red'?'blue':'red']?'wins':'losses';this.applyResult(p,delta,outcome,abandoned);
  }}
 applyResult(p,delta,outcome,abandoned){const record=this.record(p),before=record.elo;record.elo=Math.max(0,before+delta);record.peak=Math.max(record.peak,record.elo);record.seasonPeak=Math.max(record.seasonPeak,record.elo);record[outcome]++;record.played++;Object.assign(p,{settled:true,abandoned,before,after:record.elo,delta:record.elo-before,outcome,rankBefore:division(before).name,rankAfter:division(record.elo).name});}
 sweep(){let dirty=false;for(const m of Object.values(this.db.matches)){if(m.void)continue;
  for(const p of [...m.players,...(m.departures||[])])if(!p.settled&&p.disconnected&&p.deadline<=this.now()&&!p.abandoned){p.abandoned=true;dirty=true;}
  if(m.score&&[...m.players,...(m.departures||[])].some(p=>!p.settled&&(!p.disconnected||p.deadline<=this.now()))){this.settle(m);dirty=true;}
 }if(dirty)this.save();}
 result(id){const m=this.db.matches[id];return m&&!m.void?{id,season:m.season,players:[...m.players,...(m.departures||[])].map(({token,...p})=>p)}:null;}
 rollover(next){this.sweep();if(typeof next!=='string'||!next.trim()||next===this.db.season||this.db.seasons.includes(next))throw Error('Season already processed or invalid');if(Object.values(this.db.matches).some(m=>!m.void&&[...m.players,...(m.departures||[])].some(p=>!p.settled)))throw Error('Finish ranked matches and pending results first');
  this.db.seasons.push(this.db.season);for(const p of [...Object.values(this.db.players),...Object.values(this.db.bots)]){p.history.push({season:p.season,elo:p.elo,peak:p.seasonPeak,wins:p.wins,losses:p.losses,draws:p.draws,played:p.played});if(p.elo>=1000)p.elo=division(p.elo).min;Object.assign(p,{season:next,seasonPeak:p.elo,wins:0,losses:0,draws:0,played:0});}this.db.season=next;this.save();return {season:next};
 }
}
