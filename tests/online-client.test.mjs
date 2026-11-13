// Controller integration with a minimal DOM adapter and real WebSockets.
// This does not replace visual browser/layout verification.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import http from 'node:http';import {WebSocket} from 'ws';
import {attachOnline} from '../online.mjs';import {historyStore,replayFrame} from '../public/js/replay.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){const end=Date.now()+7000;while(Date.now()<end){if(fn())return;await sleep(10);}throw Error('Controller timed out');}
class ElementMock extends EventTarget {
 constructor(tag='div'){super();this.tagName=tag;this.hidden=false;this.value='';this.children=[];this.width=720;this.height=440;this.classList={toggle(){},add(){}};}
 append(...nodes){this.children.push(...nodes);if(this.tagName==='select'&&!this.value&&nodes[0])this.value=String(nodes[0].value);}
 prepend(...nodes){this.children.unshift(...nodes);}
 replaceChildren(...nodes){this.children=[];this.value='';this.append(...nodes);}
 setAttribute(){} focus(){} closest(){return null;}
 getBoundingClientRect(){return {width:1366,height:900,left:0,top:0};}
 getContext(){return new Proxy({createRadialGradient:()=>({addColorStop(){}}),measureText:()=>({width:20})},{get:(o,k)=>k in o?o[k]:()=>{}});}
}
test('online controller renders final stats and heatmap, saves replay and starts a clean rematch',async()=>{
 const html=await readFile(new URL('../public/online.html',import.meta.url),'utf8'),elements=new Map();
 for(const m of html.matchAll(/<(\w+)\b[^>]*\bid="([^"]+)"[^>]*>/g)){const e=new ElementMock(m[1]);e.hidden=/\bhidden\b/.test(m[0]);elements.set(m[2],e);}
 const $=id=>{assert.ok(elements.has(id),`Element ${id} exists in online.html`);return elements.get(id);};
 globalThis.Element=ElementMock;globalThis.window=new EventTarget();globalThis.document=Object.assign(new EventTarget(),{getElementById:$,createElement:tag=>new ElementMock(tag)});
 globalThis.localStorage={getItem:()=>null,setItem(){}};globalThis.WebSocket=WebSocket;
 let running=true;globalThis.requestAnimationFrame=fn=>{if(running)setTimeout(()=>{if(running)fn(performance.now());},16);};
 const server=http.createServer(),stop=attachOnline(server,{duration:.3,goldenGoal:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));globalThis.location={protocol:'http:',host:`127.0.0.1:${server.address().port}`};
 const saves=[];historyStore.save=async data=>saves.push(structuredClone(data));let friend;
 try{
 await import('../public/js/online-client.mjs');$('online-panel').children[0].children[1].children[3].dispatchEvent(new Event('click'));$('size').value='1';$('team').value='red';$('name').value='Joey';$('create').onclick();await until(()=>window.teamballOnline.snapshot()?.room);
 friend=new WebSocket(`ws://${location.host}/online`);await new Promise(r=>friend.on('open',r));friend.send(JSON.stringify({type:'join',name:'Rival',team:'blue',code:$('room-code').textContent}));
 await until(()=>window.teamballOnline.snapshot().state.players.filter(p=>p.human).length===2);assert.match($('roster').textContent,/BLUE: Rival/);assert.equal(window.teamballOnline.snapshot().state.players.find(p=>p.name==='Joey').shirtId,'psg');
 $('start').onclick();await until(()=>window.teamballOnline.snapshot().state.state==='ended'&&saves.length);
 assert.equal($('online-summary').hidden,false);assert.match($('online-summary-title').textContent,/^(Victory|Defeat|Draw) — \d+–\d+$/);assert.equal($('online-panel').hidden,true);assert.equal($('match-report').hidden,true);
 $('online-summary-details').onclick();assert.equal($('online-panel').hidden,false);assert.equal($('match-report').hidden,false);assert.equal($('heatmap-player').children.length,2);assert.ok($('stats-table').children.length);assert.match($('save-status').textContent,/saved/);
 assert.equal(saves[0].summary.status,'complete');assert.equal(saves[0].summary.online,true);assert.equal(saves[0].summary.report.players.filter(p=>p.human).length,1);assert.equal(saves[0].summary.report.players[0].name,'Joey');assert.ok(saves[0].replay.count>10);
 const final=replayFrame(saves[0].replay,saves[0].replay.duration);assert.equal(final.state,'ended');assert.ok(final.players.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
 const first=window.teamballOnline.snapshot().report.elapsed;$('start').onclick();await until(()=>window.teamballOnline.snapshot().state.state==='kickoff');assert.equal($('match-report').hidden,true);assert.equal(window.teamballOnline.snapshot().state.tracker.elapsed,0);assert.ok(first>.29);
 $('leave').onclick();assert.equal($('entry').hidden,false);
 }finally{running=false;friend?.terminate();stop();await new Promise(r=>server.close(r));}
});
