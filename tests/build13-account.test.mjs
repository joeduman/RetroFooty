import test from 'node:test';import assert from 'node:assert/strict';import {WebSocket} from 'ws';
import {spawn} from 'node:child_process';import {mkdtemp,cp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
test('Build 13 account HTTP auth, stats endpoint and downloadable bot memory',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'tb13-account-'));let child;
 try{
  for(const f of ['chat.mjs','economy.mjs','match-coins.mjs','ranked.mjs','ranked-session.mjs','server.js','stop.js','public','online.mjs','park.mjs','bot-learning.mjs','active-match-store.mjs','bot-model-store.mjs','neural-training-manager.mjs','train','bot-trainer.mjs','bot-trainer-worker.mjs','accounts.mjs','node_modules'])await cp(path.join(root,f),path.join(dir,f),{recursive:true});
  child=spawn(process.execPath,['server.js'],{cwd:dir,env:{...process.env,PORT:'3158',TEAMBALL_TRAINING:'off'},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('start timeout')),7000);child.stdout.on('data',b=>{if(b.toString().includes('BUILD 15')){clearTimeout(t);resolve();}});child.once('exit',c=>reject(Error('exit '+c)));});
  const url='http://127.0.0.1:3158';
  const register=await fetch(url+'/api/account/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'test@example.org',password:'security-test-password-2026',name:'TestBot'})});
  assert.equal(register.status,200);const cookie=register.headers.get('set-cookie').split(';')[0];assert.match(cookie,/teamball_session=/);
  const me=await(await fetch(url+'/api/account/me',{headers:{cookie}})).json();assert.equal(me.account.name,'TestBot');assert.equal(me.account.stats.games,0);
  // Regression: Build 13 used to omit req when emitting the park WebSocket connection,
  // crashing Accounts.get(req) and dropping the entire game server.
  async function parkClient(name,sessionCookie){
   const ws=new WebSocket(`ws://127.0.0.1:3158/park`,sessionCookie?{headers:{Cookie:sessionCookie}}:undefined);
   const messages=[];ws.on('message',data=>messages.push(JSON.parse(String(data))));
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Park open timeout')),4000);
    ws.once('open',()=>{clearTimeout(timer);resolve();});ws.once('error',error=>{clearTimeout(timer);reject(error);});});
   ws.send(JSON.stringify({type:'login',name}));
   const until=Date.now()+4000;while(Date.now()<until){
    const welcome=messages.find(m=>m.type==='welcome'),park=messages.find(m=>m.type==='park'&&welcome&&m.players?.some(p=>p.id===welcome.id));
    if(park){ws.close();return park.players.find(p=>p.id===welcome.id)?.name;}
    await new Promise(r=>setTimeout(r,10));
   }
   ws.terminate();throw new Error('Park login timeout');
  }
  assert.equal(await parkClient('Imposter',cookie),'TestBot','Authenticated park profile must use account identity');
  assert.equal(await parkClient('Guest',null),'Guest','Park must also allow guest connection');
  assert.equal((await fetch(url+'/_teamball/health')).status,200,'Server must survive WebSocket connections');

  assert.equal(Object.hasOwn(me.account,'passwordHash'),false);
  const stats=await(await fetch(url+'/api/account/stats',{headers:{cookie}})).json();assert.equal(stats.account.stats.ownGoals,0);
  const loginBad=await fetch(url+'/api/account/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'test@example.org',password:'incorrect-password-2026'})});assert.equal(loginBad.status,401);
  const memory=await(await fetch(url+'/_teamball/ai/export')).json();assert.equal(memory.schema,'teamball.bot-memory.v1');
  const policy=await(await fetch(url+'/api/bots/policy')).json();assert.ok(policy.policy.frontPost>0);assert.ok(policy.contexts);
  const stop=JSON.parse(await (await import('node:fs/promises')).readFile(path.join(dir,'.teamball-server.json'),'utf8'));
  const response=await fetch(url+'/_teamball/stop',{method:'POST',headers:{authorization:'Bearer '+stop.token}});assert.equal(response.status,200);
  await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));
 }finally{child?.kill('SIGTERM');await rm(dir,{recursive:true,force:true});}
});
