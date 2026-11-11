import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {mkdtemp,cp,readFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const run=(command,args,options)=>new Promise((resolve,reject)=>{const child=spawn(command,args,options);let out='';child.stdout?.on('data',b=>out+=b);child.stderr?.on('data',b=>out+=b);child.once('error',reject);child.once('exit',code=>resolve({code,out}));});
test('an extracted copy serves modules, refuses unauthorised stop and stops its own server',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'teamball-server-test-'));let child;
 try{
  for(const f of ['server.js','stop.js','public','online.mjs','park.mjs','bot-learning.mjs','bot-model-store.mjs','neural-training-manager.mjs','train','bot-trainer.mjs','bot-trainer-worker.mjs','accounts.mjs','node_modules'])await cp(path.join(root,f),path.join(dir,f),{recursive:true});
  child=spawn(process.execPath,['server.js'],{cwd:dir,env:{...process.env,PORT:'3157'},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Server startup timed out')),5000);child.stdout.on('data',b=>{if(b.toString().includes('BUILD 15')){clearTimeout(timeout);resolve();}});child.on('exit',code=>reject(new Error('Server exited '+code)));});
  const base='http://127.0.0.1:3157';const health=await (await fetch(base+'/_teamball/health')).json();assert.equal(health.build,'15');assert.equal(health.root,dir);
  const page=await fetch(base+'/');assert.equal(page.status,200);assert.match(await page.text(),/Build 15/);assert.equal(page.headers.get('cache-control'),'no-store');
  for(const file of ['app','config','physics','match','ai','input','renderer','stats','audio','report','practice','replay']){const response=await fetch(base+`/js/${file}.mjs`);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/javascript/);}
  assert.equal((await fetch(base+'/missing.js')).status,404);
  assert.equal((await fetch(base+'/_teamball/stop',{method:'POST'})).status,403);assert.equal((await fetch(base+'/_teamball/health')).status,200);
  const duplicate=await run(process.execPath,['server.js'],{cwd:dir,env:{...process.env,PORT:'3157'},stdio:['ignore','pipe','pipe']});assert.equal(duplicate.code,1);assert.match(duplicate.out,/already in use/);
  const before=JSON.parse(await readFile(path.join(dir,'.teamball-server.json'),'utf8'));assert.equal(before.pid,child.pid);
  const stopping=await run(process.execPath,['stop.js'],{cwd:dir,stdio:['ignore','pipe','pipe']});assert.equal(stopping.code,0);assert.match(stopping.out,/Teamball stopped/);
  await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));
  const again=await run(process.execPath,['stop.js'],{cwd:dir,stdio:['ignore','pipe','pipe']});assert.equal(again.code,0);assert.match(again.out,/No Build 15 session/);
 }finally{child?.kill('SIGTERM');await rm(dir,{recursive:true,force:true});}
});
