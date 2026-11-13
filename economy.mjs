import fs from 'node:fs';
import path from 'node:path';
import {canonicalName} from './public/js/ranked-config.mjs';
import {SHOP_ITEMS,COIN_RULES} from './public/js/shop-config.mjs';
import {COSMETIC_ITEMS} from './public/js/cosmetics.mjs';
import {RANK_SHIRTS,earnedRankShirts} from './public/js/rank-rewards.mjs';
export function coinReward({outcome,stats={},seconds,duration},rules=COIN_RULES){
 const played=Math.max(0,Number(seconds)||0);
 if(played+1e-6<Math.min(rules.minimumSeconds,duration))return 0;
 const participation=Math.min(1,played/Math.max(1e-6,duration));
 const stat=k=>Math.max(0,Number.isFinite(stats[k])?stats[k]:0);
 return Math.max(0,Math.min(rules.cap,Math.round((rules[outcome]||0)*participation+stat('goals')*rules.goal+stat('shots')*rules.shot+stat('onTarget')*rules.onTarget+stat('passes')*rules.pass)));
}
export class EconomyStore{
 constructor({file=path.join(process.cwd(),'server-data','economy.json'),ranked=null}={}){
  this.file=file;this.db={version:1,wallets:{},settlements:{}};
  if(fs.existsSync(file)){this.db=JSON.parse(fs.readFileSync(file,'utf8'));if(this.db.version!==1)throw Error('Unsupported economy database');}
  if(ranked)this.bindRanked(ranked);
 }
 bindRanked(ranked){if(this.ranked===ranked)return;this.unsubscribeSeason?.();this.ranked=ranked;if(ranked)this.unsubscribeSeason=ranked.onSeasonChange(()=>{for(const w of Object.values(this.db.wallets))this.wallet(w.name);});}
 syncRankRewards(w){
  if(!this.ranked)return false;
  const record=this.ranked.player(w.name),season=this.ranked.db.season;let changed=false;
  if(!Array.isArray(w.rankRewards)){w.rankRewards=[];changed=true;}
  const snapshots=[...(record.history||[]).map(r=>({season:r.season,peak:r.peak})),{season,peak:Math.max(record.elo,record.seasonPeak??record.elo)}];
  for(const source of snapshots){if(typeof source.season!=='string'||!Number.isFinite(source.peak))continue;
   let entry=w.rankRewards.find(r=>r.season===source.season);
   if(!entry){entry={season:source.season,peak:source.peak,items:[]};w.rankRewards.push(entry);changed=true;}
   if(source.peak>entry.peak){entry.peak=source.peak;changed=true;}
   for(const item of earnedRankShirts(entry.peak))if(!entry.items.includes(item.id)){entry.items.push(item.id);changed=true;}
  }
  const active=w.rankRewards.find(r=>r.season===season),rewardIds=new Set(RANK_SHIRTS.filter(i=>i.reward).map(i=>i.id));
  const owned=[...w.owned.filter(id=>!rewardIds.has(id)),...(active?.items||[]).filter(id=>rewardIds.has(id))];
  if(JSON.stringify(owned)!==JSON.stringify(w.owned)){w.owned=owned;changed=true;}
  if(w.rewardSeason!==season){w.rewardSeason=season;changed=true;}
  if(rewardIds.has('shirt:'+w.equipped.shirt)&&!w.owned.includes('shirt:'+w.equipped.shirt)){w.equipped.shirt='rookie';changed=true;}
  return changed;
 }
 save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});const fd=fs.openSync(this.file+'.tmp','w',0o600);try{fs.writeFileSync(fd,JSON.stringify(this.db));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(this.file+'.tmp',this.file);}
 wallet(name){const key=canonicalName(name);if(!key||['__proto__','constructor','prototype'].includes(key))throw Error('Invalid username');let changed=false;if(!Object.hasOwn(this.db.wallets,key)){this.db.wallets[key]={name:String(name).trim(),balance:0,earned:0,owned:['shirt:rookie',...SHOP_ITEMS.filter(i=>!i.price).map(i=>i.id)],equipped:{shirt:'rookie',effect:'classic'}};changed=true;}const w=this.db.wallets[key];
  if(w.owned.includes('shirt:plain')){w.owned=w.owned.filter(id=>id!=='shirt:plain');changed=true;}
  if(!w.owned.includes('shirt:rookie')){w.owned.push('shirt:rookie');changed=true;}
  if(w.equipped.shirt==='plain'){w.equipped.shirt='rookie';changed=true;}
  if(this.syncRankRewards(w)||changed)this.save();return w;}
 view(name){return structuredClone(this.wallet(name));}
 owns(name,kind,value){if(kind==='shirt'&&value==='plain')value='rookie';return this.wallet(name).owned.includes(`${kind}:${value}`);}
 equip(name,kind,value){if(kind==='shirt'&&value==='plain')value='rookie';const item=COSMETIC_ITEMS.find(i=>i.kind===kind&&i.value===value);if(!item)throw Error('Item is unavailable');if(!this.owns(name,kind,value))throw Error(item.reward?'Earn this shirt by reaching its Ranked Elo requirement this season':'Buy this item in the shop first');this.wallet(name).equipped[kind]=value;this.save();return this.view(name);}
 buy(name,id){const item=SHOP_ITEMS.find(i=>i.id===id);if(!item)throw Error('Item is unavailable');const w=this.wallet(name);if(w.owned.includes(id))return this.view(name);if(w.balance<item.price)throw Error('Not enough Gold');w.balance-=item.price;w.owned.push(id);this.save();return this.view(name);}
 settle(id,participants,score,duration){if(Object.hasOwn(this.db.settlements,id))return this.db.settlements[id];const rewards={};
  // Create every wallet before changing balances, so an intervening wallet
  // creation write cannot persist a reward without its settlement ledger.
  for(const p of participants)if(!p.bot)this.wallet(p.name);
  for(const p of participants){const key=canonicalName(p.name);if(p.bot||Object.hasOwn(rewards,key))continue;const outcome=score.red===score.blue?'draw':score[p.team]>score[p.team==='red'?'blue':'red']?'win':'loss';const amount=coinReward({outcome,stats:p.stats,seconds:p.seconds,duration});const wallet=this.wallet(p.name);wallet.balance+=amount;wallet.earned+=amount;rewards[key]=amount;}
  this.db.settlements[id]=rewards;this.save();return rewards;
 }
}
