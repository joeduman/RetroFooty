// Optional browser smoke test using installed Chrome and the existing ws dependency.
// Runs an isolated server and temporary rating store; never touches the live game.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {attachPark} from '../park.mjs';
import {EconomyStore} from '../economy.mjs';
import {RankedStore} from '../ranked.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tb-ranked-browser-')),root=fileURLToPath(new URL('../public/',import.meta.url));
const store=new RankedStore({file:path.join(dir,'ranked.json')}),types={'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.mp3':'audio/mpeg'};
const server=http.createServer((req,res)=>{const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));if(!p.startsWith(root)){res.writeHead(403).end();return;}try{res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream'}).end(fs.readFileSync(p));}catch{res.writeHead(404).end();}});
const economy=new EconomyStore({file:path.join(dir,'economy.json')});economy.wallet('Browser Player').balance=300;economy.save();
const stop=attachPark(server,{ranked:store,economy});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const peerMessages=[],peer=new WebSocket(`ws://127.0.0.1:${server.address().port}/park`);peer.on('message',b=>peerMessages.push(JSON.parse(b)));await new Promise(r=>peer.once('open',r));peer.send(JSON.stringify({type:'login',name:'Online Friend'}));await new Promise(r=>setTimeout(r,60));const friend=[...stop.world.clients.values()].find(p=>p.name==='Online Friend');friend.x+=100;friend.avatar.x=friend.x;
const browser=spawn(process.env.TEAMBALL_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+path.join(dir,'chrome'),'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let socket;
try{
 const browserUrl=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Chrome startup timeout')),15000);browser.stderr.on('data',b=>{const match=String(b).match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});browser.once('error',reject);});
 socket=new WebSocket(browserUrl);await new Promise(r=>socket.once('open',r));let sequence=0;const pending=new Map(),errors=[];
 socket.on('message',b=>{const m=JSON.parse(b);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);});
 const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},10000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id,method,params,sessionId}));});
 const target=await call('Target.createTarget',{url:'about:blank'}),{sessionId}=await call('Target.attachToTarget',{targetId:target.targetId,flatten:true});
 const c=(m,p)=>call(m,p,sessionId),evaluate=async expression=>(await c('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value;
 await c('Page.addScriptToEvaluateOnNewDocument',{source:JSON.stringify('')+';localStorage.setItem("teamball05",JSON.stringify({movement:"keys",bindings:{sprint:"Mouse0",shoot:"Shift"}}));'});await c('Runtime.enable');await c('Page.enable');await c('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});await c('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
 const until=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,50));}throw Error('Browser condition timeout: '+expression);};
 await until('!!window.teamballPark');assert.equal(await evaluate("document.getElementById('username').value"),'');assert.match(await evaluate('document.title'),/RetroFooty/);await evaluate("document.getElementById('username').value='Browser Player';document.getElementById('login-form').requestSubmit()");
 await until("document.getElementById('online-leaderboard').innerText.includes('Browser Player')");

 const key=async(code,key,virtualKey,text)=>{await c('Input.dispatchKeyEvent',{type:'keyDown',code,key,windowsVirtualKeyCode:virtualKey,...(text?{text}:{})});await c('Input.dispatchKeyEvent',{type:'keyUp',code,key,windowsVirtualKeyCode:virtualKey});};
 const screenshot=async name=>{fs.mkdirSync(new URL('../reports/screenshots/',import.meta.url),{recursive:true});const {data}=await c('Page.captureScreenshot',{format:'png'});fs.writeFileSync(new URL('../reports/screenshots/'+name,import.meta.url),Buffer.from(data,'base64'));};
 const position=()=>evaluate("(()=>{const p=window.teamballPark.snapshot().park.players.find(p=>p.name==='Browser Player');return {x:p.x,y:p.y}})()");
 await key('Enter','Enter',13);await until("document.activeElement.id==='chat-input'");
 assert.ok(peerMessages.some(m=>m.type==='chat-typing'&&m.typing&&m.name==='Browser Player'));
 const before=await position();await key('KeyW','w',87,'w');await new Promise(r=>setTimeout(r,150));const after=await position();assert.ok(Math.hypot(before.x-after.x,before.y-after.y)<1,'Typing must not move the avatar');
 peer.send(JSON.stringify({type:'chat-typing',typing:true}));await until("document.querySelector('.chat-typing-status').textContent.includes('Online Friend')");await screenshot('chat-typing-desktop.png');
 await evaluate("document.getElementById('chat-input').value='Hello <b>park</b>!'");await key('Enter','Enter',13);
 await until("document.getElementById('chat-log').textContent.includes('Hello <b>park</b>!')");assert.equal(await evaluate("document.querySelector('#chat-log b')===null"),true);
 assert.ok(peerMessages.some(m=>m.type==='chat-line'&&m.message.text==='Hello <b>park</b>!'));
 await screenshot('chat-message-desktop.png');
 await evaluate("document.getElementById('chat-toggle').click()");assert.equal(await evaluate("document.getElementById('chat-log').hidden"),true);
 await key('Enter','Enter',13);assert.equal(await evaluate("document.getElementById('chat-form').hidden"),false);await c('Input.insertText',{text:'cancel me'});await key('Escape','Escape',27);assert.equal(await evaluate("document.getElementById('chat-form').hidden"),true);assert.ok(!peerMessages.some(m=>m.type==='chat-line'&&m.message.text==='cancel me'));
 await key('Enter','Enter',13);await c('Input.insertText',{text:'Send button works'});await evaluate("document.querySelector('#chat-form button').click()");await until("document.getElementById('chat-log').textContent.includes('Send button works')");
 await evaluate("document.getElementById('court-1').click();document.getElementById('join-red').click()");await until("window.teamballPark.snapshot().field===1");
 await key('Enter','Enter',13);await c('Input.insertText',{text:'Hello from the pitch'});await key('Enter','Enter',13);await until("document.getElementById('chat-log').textContent.includes('Hello from the pitch')");
 await screenshot('chat-match-desktop.png');assert.equal(await evaluate("document.getElementById('chat-log').hidden"),true);
 await c('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await evaluate("document.getElementById('chat-toggle').click()");await new Promise(r=>setTimeout(r,150));
 assert.equal(await evaluate("(()=>{const r=document.getElementById('chat-widget').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()"),true);await screenshot('chat-mobile.png');assert.deepEqual(errors,[]);
 console.log('PASS: Enter chat, remote typing indicator, movement suppressed, literal text rendering, Enter and button send, Escape cancel, hidden panel, on-field chat, mobile bounds; no runtime errors');
 await call('Browser.close');
}finally{peer.terminate();socket?.close();browser.kill();stop();server.close();await new Promise(r=>setTimeout(r,300));fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
