import net from 'node:net';import {fileURLToPath} from 'node:url';
// Isolated real Chrome check; starts its own loopback-only AI viewer.
import {spawn} from 'node:child_process';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import WebSocket from 'ws';
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'retrofooty-ai-browser-')),port=9400+Math.floor(Math.random()*500);
const child=spawn(process.env.TEAMBALL_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const viewerPort=listener.address().port;await new Promise(r=>listener.close(r));
const viewerUrl='http://127.0.0.1:'+viewerPort+'/dev-ai.html';
const viewer=spawn(process.execPath,[fileURLToPath(new URL('./ai-dev-server.mjs',import.meta.url))],{env:{...process.env,AI_VIEWER_PORT:String(viewerPort)},windowsHide:true,stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let socket;
try{
 let ready=false;for(let i=0;i<60;i++){try{const response=await fetch('http://127.0.0.1:'+viewerPort+'/__ai-viewer-health');if(response.ok){ready=true;break;}}catch{}await sleep(100);}assert.ok(ready,'Isolated AI viewer must start');
 let pages;for(let i=0;i<60;i++){try{pages=await(await fetch(`http://127.0.0.1:${port}/json`)).json();break;}catch{await sleep(100);}}
 assert.ok(pages);socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.once('open',r));
 let id=0;const pending=new Map(),errors=[];socket.on('message',raw=>{const m=JSON.parse(raw);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);});
 const command=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;const timeout=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout '+method));},15000);pending.set(key,m=>{clearTimeout(timeout);resolve(m);});socket.send(JSON.stringify({id:key,method,params}));});
 const evaluate=async expression=>{const reply=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(reply.error||reply.result?.exceptionDetails)throw Error(reply.error?.message||reply.result.exceptionDetails.exception?.description||reply.result.exceptionDetails.text);return reply.result?.result?.value;};
 const until=async(expression,timeout=15000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await sleep(100);}throw Error('Browser condition timeout: '+expression+'; status: '+await evaluate('document.querySelector("#status")?.textContent'));};
 await command('Runtime.enable');await command('Page.enable');
 const runs=fs.readdirSync('public/ai-results').filter(n=>fs.existsSync(path.join('public/ai-results',n,'results.json'))).sort();const run=runs.at(-1);
 await command('Page.navigate',{url:viewerUrl+(run?'?results=/ai-results/'+run+'/results.json':'')});
 await until('document.title==="RetroFooty AI laboratory"');
 if(run){await until('document.querySelectorAll("#rows tr").length>0');await evaluate('document.querySelector("#rows button").click()');assert.ok(await evaluate('document.querySelector("#detail").textContent.includes("seed")'));}
 await evaluate('document.querySelector("#size").value="1";document.querySelector("#speed").value="32";document.querySelector("#launch").click()');await until('document.querySelector("#liveStatus")?.textContent.includes("1 completed")',25000);
 if(run){await command('Page.navigate',{url:viewerUrl+'?results=/ai-results/'+run+'/results.json'});await until('document.querySelectorAll("#rows tr").length>0');await evaluate('document.querySelector("#rows button").click();document.getElementById("recorded-replay").click()');await until('document.querySelector("#liveStatus")?.textContent.startsWith("Recorded match")');}
 const screen=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.mkdirSync('reports/screenshots',{recursive:true});fs.writeFileSync('reports/screenshots/ai-dashboard.png',Buffer.from(screen.result.data,'base64'));
 assert.deepEqual(errors,[]);console.log('PASS real browser: modules, saved results, details, live simulation and recorded replay; no page exceptions.');
}finally{socket?.close();child.kill();viewer.kill();await sleep(300);const target=path.resolve(profile),tempRoot=path.resolve(os.tmpdir());if(!target.startsWith(tempRoot+path.sep)||!path.basename(target).startsWith('retrofooty-ai-browser-'))throw Error('Unexpected test profile path');fs.rmSync(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
