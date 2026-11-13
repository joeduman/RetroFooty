import {canonicalName} from './public/js/ranked-config.mjs';
const zero=()=>({wins:0,losses:0,draws:0,played:0,goals:0,assists:0});
export class PlayerProfiles{
 constructor({ranked,economy,accounts=null}){this.ranked=ranked;this.economy=economy;this.accounts=accounts;economy.bindRanked(ranked);
  economy.db.profiles??={};economy.db.reports??={};economy.db.playerMatches??={};
  for(const p of Object.values(ranked.db.players))this.ensure(p.name);
 }
 ensure(name){const key=canonicalName(name);if(!Object.hasOwn(this.economy.db.profiles,key)){
  const account=this.accounts?.db.users.find(a=>canonicalName(a.name)===key),r=this.ranked.player(name),stats=zero();
  if(account?.stats)Object.assign(stats,{wins:account.stats.wins||0,losses:account.stats.losses||0,draws:account.stats.draws||0,played:account.stats.games||0,goals:account.stats.goals||0,assists:account.stats.assists||0});
  else for(const season of [r,...(r.history||[])]){stats.wins+=season.wins||0;stats.losses+=season.losses||0;stats.draws+=season.draws||0;stats.played+=season.played||0;}
  const legacyStatsIncomplete=!account&&(stats.played>0||Object.values(this.economy.db.settlements).some(rewards=>Object.hasOwn(rewards,key)));
  this.economy.db.profiles[key]={...stats,legacyStatsIncomplete};this.economy.save();
 }return this.economy.db.profiles[key];}
 public(name){if(typeof name!=='string'||name.length>16||!Object.hasOwn(this.ranked.db.players,canonicalName(name)))throw Error('Player profile not found');const key=canonicalName(name),p=this.ranked.db.players[key];const s=this.ensure(p.name);this.syncOutcomes(key,s);const rating=this.ranked.summary(p.name),total=s.wins+s.losses+s.draws;
  return {name:p.name,rank:{name:rating.rank.name,color:rating.rank.color},elo:p.elo,wins:s.wins,losses:s.losses,draws:s.draws,played:total,winRate:total?s.wins/total*100:0,goals:s.goals,assists:s.assists,partialStats:s.legacyStatsIncomplete};
 }
 syncOutcomes(key,stats){let changed=false;const counters={Victory:'wins',Defeat:'losses',Draw:'draws'};for(const entry of this.economy.db.playerMatches[key]||[]){if(entry.mode!=='ranked')continue;const result=this.ranked.db.matches[entry.id]?.players.find(p=>p.key===key);if(!result?.settled)continue;const desired=result.outcome==='wins'?'Victory':result.outcome==='losses'?'Defeat':'Draw';if(entry.result!==desired){stats[counters[entry.result]]--;stats[counters[desired]]++;entry.result=desired;changed=true;}}if(changed)this.economy.save();}
 private(name,canEquip){return {...this.public(name),wallet:this.economy.view(name),canEquip,pending:this.ranked.pending(name)};}
 record(session,participants){const db=this.economy.db,id=session.matchId;if(session.game.state!=='ended'||Object.hasOwn(db.reports,id))return;
  const report=structuredClone(session.game.report()),score={...session.game.score};
  for(const p of participants)this.ensure(p.name);
  for(const p of participants){const key=canonicalName(p.name),s=this.ensure(p.name),outcome=score.red===score.blue?'draws':score[p.team]>score[p.team==='red'?'blue':'red']?'wins':'losses';
   s[outcome]++;s.played++;s.goals+=Math.max(0,p.stats?.goals||0);s.assists+=Math.max(0,p.stats?.assists||0);
   const row={id,at:Date.now(),mode:session.mode||'casual',size:session.size,team:p.team,result:outcome==='wins'?'Victory':outcome==='losses'?'Defeat':'Draw',score};(db.playerMatches[key]??=[]).push(row);
  }
  db.reports[id]={report,mode:session.mode||'casual',size:session.size};this.economy.save();
 }
 recent(name){const key=canonicalName(name);this.syncOutcomes(key,this.ensure(name));return [...(this.economy.db.playerMatches[key]||[])].slice(-5).reverse();}
 report(name,id){if(typeof id!=='string'||!this.economy.db.playerMatches[canonicalName(name)]?.some(m=>m.id===id))throw Error('Completed report not found');return this.economy.db.reports[id];}
}
