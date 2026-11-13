import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {WebSocket} from 'ws';
import {RankedStore} from '../ranked.mjs';
import {EconomyStore} from '../economy.mjs';
import {PlayerProfiles} from '../player-profiles.mjs';
import {ParkWorld,attachPark} from '../park.mjs';
import {attachOnline} from '../online.mjs';
import {SHOP_ITEMS} from '../public/js/shop-config.mjs';
import {RANK_SHIRTS} from '../public/js/rank-rewards.mjs';
import {Renderer} from '../public/js/renderer.mjs';
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'retro-rank-shirts-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const ranked=new RankedStore({file:path.join(dir,'ranked.json')}),economy=new EconomyStore({file:path.join(dir,'economy.json'),ranked});return {dir,ranked,economy};}
function peak(ranked,name,elo,high=elo){const p=ranked.player(name);Object.assign(p,{elo,seasonPeak:high,peak:high});ranked.save();return p;}
test('Rookie is the default for everyone, even below Rookie Elo and after season rollover',t=>{
 const {ranked,economy}=fixture(t);peak(ranked,'Starter',500);let w=economy.view('Starter');assert.equal(w.equipped.shirt,'rookie');assert.ok(w.owned.includes('shirt:rookie'));assert.ok(!w.owned.includes('shirt:plain'));
 ranked.rollover('next-season');w=economy.view('Starter');assert.equal(w.equipped.shirt,'rookie');assert.equal(w.owned.filter(id=>id==='shirt:rookie').length,1);assert.ok(!w.owned.includes('shirt:prospect'));
});
test('legacy Plain White inventory migrates to Rookie without charging Gold or removing purchases',t=>{
 const {economy}=fixture(t),old=economy.wallet('Legacy');old.balance=123;old.owned=['shirt:plain','shirt:inferno','effect:classic'];old.equipped.shirt='plain';economy.save();
 const reload=new EconomyStore({file:economy.file}),w=reload.view('Legacy');assert.equal(w.equipped.shirt,'rookie');assert.equal(w.balance,123);assert.ok(w.owned.includes('shirt:inferno'));assert.ok(!w.owned.includes('shirt:plain'));assert.equal(w.owned.filter(id=>id==='shirt:rookie').length,1);assert.equal(reload.equip('Legacy','shirt','plain').equipped.shirt,'rookie');
});
test('all eight rank shirts use the actual Elo thresholds, have assets, and are absent from the shop',()=>{
 assert.deepEqual(RANK_SHIRTS.map(i=>i.elo),[1000,1500,2000,2500,3000,3500,4000,4500]);
 for(const item of RANK_SHIRTS){assert.ok(fs.existsSync(new URL('../public'+item.image,import.meta.url)));assert.ok(!SHOP_ITEMS.some(i=>i.id===item.id));}
});
test('season peak grants every earned shirt once without charging Gold or allowing purchases',t=>{
 const {ranked,economy}=fixture(t);peak(ranked,'High Rank',1200,4500);const w=economy.wallet('High Rank');w.balance=750;economy.save();
 for(const item of RANK_SHIRTS){assert.ok(w.owned.includes(item.id));assert.throws(()=>economy.buy('High Rank',item.id),/unavailable/);}
 assert.equal(economy.view('High Rank').balance,750);assert.equal(economy.view('HIGH RANK').owned.filter(id=>id==='shirt:legend').length,1);
 assert.equal(economy.view('High Rank').rankRewards[0].peak,4500);
});
test('real Ranked promotion grants a shirt and a subsequent loss cannot remove it',t=>{
 const {ranked,economy}=fixture(t);peak(ranked,'Promoted',1490);peak(ranked,'Opponent',1490);
 assert.ok(!economy.view('Promoted').owned.includes('shirt:prospect'));
 const roster=[{name:'Promoted',team:'red',slot:1},{name:'Opponent',team:'blue',slot:2}];ranked.begin('win',roster,180);ranked.finish('win',{red:1,blue:0});
 assert.ok(ranked.player('Promoted').elo>=1500);assert.ok(economy.view('Promoted').owned.includes('shirt:prospect'));
 ranked.begin('loss',roster,180);ranked.finish('loss',{red:0,blue:1});assert.ok(ranked.player('Promoted').elo<1500);
 assert.ok(economy.equip('Promoted','shirt','prospect').owned.includes('shirt:prospect'));
 const reloadRanked=new RankedStore({file:ranked.file}),reloadEconomy=new EconomyStore({file:economy.file,ranked:reloadRanked});
 assert.equal(reloadEconomy.view('Promoted').equipped.shirt,'prospect');assert.ok(reloadEconomy.view('Promoted').owned.includes('shirt:prospect'));
});
test('season rollover archives old rewards, removes unearned new-season shirts and resets live park equipment',t=>{
 const {ranked,economy}=fixture(t);peak(ranked,'Veteran',1200,4500);const w=economy.wallet('Veteran');w.balance=500;economy.save();economy.buy('Veteran','shirt:inferno');economy.equip('Veteran','shirt','legend');
 const world=new ParkWorld({ranked,economy}),c=world.connect('Veteran');assert.equal(c.avatar.shirtId,'legend');
 ranked.rollover('season-2');const next=economy.view('Veteran');assert.equal(next.rewardSeason,'season-2');assert.ok(!next.owned.includes('shirt:legend'));assert.ok(next.owned.includes('shirt:rookie'));assert.ok(next.owned.includes('shirt:inferno'));assert.equal(next.balance,400);
 assert.equal(next.equipped.shirt,'rookie');assert.equal(c.avatar.shirtId,'rookie');assert.equal(c.shirtId,'rookie');
 assert.ok(next.rankRewards.find(r=>r.season==='season-1').items.includes('shirt:legend'));assert.equal(next.rankRewards.find(r=>r.season==='season-1').peak,4500);
 assert.throws(()=>economy.equip('Veteran','shirt','legend'),/Earn/);world.unsubscribeSeason();
});
test('unearned shirts and forged cosmetic kinds cannot be equipped',t=>{
 const {economy}=fixture(t);assert.throws(()=>economy.equip('New player','shirt','legend'),/Earn/);
 assert.throws(()=>economy.equip('New player','__proto__','legend'),/unavailable/);assert.throws(()=>economy.buy('New player','shirt:rookie'),/unavailable/);
});
test('rank sprites load only when used and resolve the matching uploaded asset',()=>{
 const previous=globalThis.Image;globalThis.Image=class {};
 try{const r=new Renderer({getContext:()=>({})});assert.ok(!r.shirtSprites.has('legend'));for(const item of RANK_SHIRTS)assert.equal(r.playerShirt({human:true,shirtId:item.value}).src,item.image);}
 finally{if(previous===undefined)delete globalThis.Image;else globalThis.Image=previous;}
});
for(const mode of ['park','private'])test(`${mode}: earned shirts equip over WebSocket, forged purchases fail and rollover updates equipment`,async t=>{
 const {ranked,economy}=fixture(t);peak(ranked,'Reward Player',1200,4500);const profiles=new PlayerProfiles({ranked,economy}),server=http.createServer();
 const close=mode==='park'?attachPark(server,{ranked,economy,profiles}):attachOnline(server,{ranked,economy,profiles});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const ws=new WebSocket('ws://127.0.0.1:'+server.address().port+(mode==='park'?'/park':'/online')),messages=[];ws.on('message',b=>messages.push(JSON.parse(b)));
 t.after(async()=>{ws.terminate();close();await new Promise(r=>server.close(r));});
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 const send=m=>{const from=messages.length;ws.send(JSON.stringify(m));return from;};
 const wait=async(predicate,from=0)=>{const until=Date.now()+4000;while(Date.now()<until){const m=messages.slice(from).find(predicate);if(m)return m;await new Promise(r=>setTimeout(r,10));}throw Error('Reward socket timeout');};
 send({type:mode==='park'?'login':'create',name:'Reward Player',size:1,team:'red'});await wait(m=>mode==='park'?m.type==='welcome':m.type==='lobby');
 let from=send({type:'buy',item:'shirt:legend'});await wait(m=>m.type==='error'&&/unavailable/.test(m.message),from);
 from=send({type:'shirt',shirtId:'legend'});await wait(m=>m.type==='wallet'&&m.wallet.equipped.shirt==='legend',from);
 if(mode==='park')await wait(m=>m.type==='park'&&m.players.some(p=>p.name==='Reward Player'&&p.shirtId==='legend'));else await wait(m=>m.type==='state'&&m.state.players.some(p=>p.name==='Reward Player'&&p.shirtId==='legend'));
 from=messages.length;ranked.rollover('season-2');await wait(m=>m.type==='wallet'&&m.wallet.rewardSeason==='season-2'&&m.wallet.equipped.shirt==='rookie',from);
 from=send({type:'shirt',shirtId:'legend'});await wait(m=>m.type==='error'&&/Earn/.test(m.message),from);
});
