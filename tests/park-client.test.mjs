// Runtime/controller integration with real WebSockets and a small DOM adapter.
// Canvas calls and persistence are adapters; this is not a visual browser test.
import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {readFile} from 'node:fs/promises';
import {WebSocket} from 'ws';import {attachPark} from '../park.mjs';import {historyStore,replayFrame} from '../public/js/replay.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){const end=Date.now()+8000;while(Date.now()<end){if(fn())return;await sleep(10);}throw Error('Park controller timeout');}
const elements=new Map();
class ElementMock extends EventTarget {
 constructor(tag='div'){super();this.tagName=tag;this.hidden=false;this.value='';this.children=[];this.attributes={};this.width=720;this.height=440;this.classList={toggle(){},add(){}};}
 set id(value){this._id=value;elements.set(value,this);}get id(){return this._id;}
 append(...nodes){this.children.push(...nodes);if(this.tagName==='select'&&!this.value&&nodes[0])this.value=String(nodes[0].value);}
 prepend(...nodes){this.children.unshift(...nodes);}
 replaceChildren(...nodes){this.children=[];this.value='';this.append(...nodes);}
 querySelector(tag){return this.children.find(n=>n.tagName===tag);}
 setAttribute(name,value){this.attributes[name]=String(value);}getAttribute(name){return this.attributes[name]??null;}focus(){}closest(){return null;}
 getBoundingClientRect(){return {width:1366,height:900,left:0,top:0};}
 getContext(){return new Proxy({createRadialGradient:()=>({addColorStop(){}}),measureText:()=>({width:20})},{get:(o,k)=>k in o?o[k]:()=>{}});}
}
test('park client walks, joins a live field, gets full-roster kickoff and final report, saves replay, switches fields and signs out',async()=>{
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');for(const m of html.matchAll(/<(\w+)\b[^>]*\bid="([^"]+)"[^>]*>/g)){const e=new ElementMock(m[1]);e.id=m[2];e.hidden=/\bhidden\b/.test(m[0]);}
 const $=id=>{assert.ok(elements.has(id),`Element ${id} is in page`);return elements.get(id);};
 globalThis.Element=ElementMock;globalThis.window=new EventTarget();globalThis.document=Object.assign(new EventTarget(),{getElementById:$,createElement:tag=>new ElementMock(tag)});globalThis.localStorage={getItem:()=>null,setItem(){}};globalThis.WebSocket=WebSocket;
 let running=true;globalThis.requestAnimationFrame=fn=>{if(running)setTimeout(()=>{if(running)fn(performance.now());},16);};
 const server=http.createServer(),stop=attachPark(server,{duration:.35,goldenGoal:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));globalThis.location={protocol:'http:',host:`127.0.0.1:${server.address().port}`};
 const saves=[];historyStore.save=async data=>saves.push(structuredClone(data));let friend;
 try{
 await import('../public/js/park-client.mjs');$('shirt-picker-login').children[1].children[2].dispatchEvent(new Event('click'));
 const effectButton=(host,id)=>$(host).children[1].children.find(button=>button.getAttribute('data-goal-effect')===id);
 effectButton('goal-effect-picker-login','fire').dispatchEvent(new Event('click'));
 for(const host of ['goal-effect-picker-login','goal-effect-picker-park','goal-effect-picker-match'])assert.equal(effectButton(host,'fire').getAttribute('aria-pressed'),'true');
 $('login-settings').onclick();assert.equal($('settings-panel').hidden,false);$('settings-names').checked=false;$('settings-names').onchange();$('settings-close').onclick();assert.equal($('settings-panel').hidden,true);$('username').value='Park tester';$('movement').value='keys';$('login-form').onsubmit({preventDefault(){}});await until(()=>window.teamballPark.snapshot().park);
 const me=()=>window.teamballPark.snapshot().park.players.find(p=>p.id===window.teamballPark.snapshot().id),before=me().x;assert.equal(me().shirtId,'barcelona');assert.equal(me().goalEffectId,'fire');
 assert.equal($('court-list').children.length,13);
 window.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyM'}));assert.equal(window.teamballPark.snapshot().mapOpen,true);assert.equal($('court-list').hidden,true);
 window.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyM',repeat:true}));assert.equal(window.teamballPark.snapshot().mapOpen,true);
 window.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyM'}));assert.equal(window.teamballPark.snapshot().mapOpen,false);
 window.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyD'}));await sleep(220);window.dispatchEvent(Object.assign(new Event('keyup'),{code:'KeyD'}));await until(()=>me().x>before+15);
 $('court-1').onclick();assert.equal($('court-dialog').hidden,false);$('join-red').onclick();await until(()=>window.teamballPark.snapshot().field===1);assert.equal(window.teamballPark.snapshot().phase,'warmup');assert.equal($('park-app').hidden,true);
 window.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyM'}));assert.equal(window.teamballPark.snapshot().mapOpen,false);
 friend=new WebSocket(`ws://${location.host}/park`);await new Promise(r=>friend.on('open',r));friend.send(JSON.stringify({type:'login',name:'Opponent'}));friend.send(JSON.stringify({type:'join',size:1,team:'blue'}));
 await until(()=>window.teamballPark.snapshot().phase==='match');assert.equal(window.teamballPark.snapshot().state.state,'kickoff');assert.equal(window.teamballPark.snapshot().state.score.red,0);
 assert.equal(window.teamballPark.snapshot().state.human.goalEffectId,'fire');
 effectButton('goal-effect-picker-match','classic').dispatchEvent(new Event('click'));await until(()=>window.teamballPark.snapshot().state.human.goalEffectId==='classic');
 effectButton('goal-effect-picker-match','fire').dispatchEvent(new Event('click'));await until(()=>window.teamballPark.snapshot().state.human.goalEffectId==='fire');
 await until(()=>saves.some(s=>s.summary.status==='complete'));
 const saved=saves.find(s=>s.summary.status==='complete');assert.equal($('park-summary').hidden,false);assert.match($('park-summary-title').textContent,/^(Win|Loss|Draw) \d+-\d+$/);assert.equal($('match-panel').hidden,true);assert.equal($('match-report').hidden,true);
 assert.match($('park-summary-caption').textContent,/^Next match in 0:0[78]$/);const firstCountdown=$('park-summary-caption').textContent;
 $('park-summary-details').onclick();assert.equal($('match-panel').hidden,false);assert.equal($('match-report').hidden,false);assert.equal($('heatmap-player').children.length,2);assert.equal(saved.summary.report.players.filter(p=>p.human).length,1);assert.equal(replayFrame(saved.replay,saved.replay.duration).state,'ended');assert.match($('save-status').textContent,/saved/);
 await until(()=>$('park-summary-caption').textContent!==firstCountdown);assert.equal($('match-status').textContent,$('park-summary-caption').textContent);assert.equal($('match-label').textContent,'NEXT MATCH');assert.match($('clock').textContent,/^0:0\d$/);
 $('resume-match').onclick();assert.equal($('match-panel').hidden,true);assert.equal($('park-summary').hidden,false);
 $('return-park').onclick();await until(()=>window.teamballPark.snapshot().field===null);assert.equal($('park-app').hidden,false);assert.equal($('match-screen').hidden,true);
 $('court-3').onclick();$('join-blue').onclick();await until(()=>window.teamballPark.snapshot().field===3);assert.equal(window.teamballPark.snapshot().state.players.length,6);assert.equal(window.teamballPark.snapshot().state.human.team,'blue');
 $('return-park').onclick();await until(()=>window.teamballPark.snapshot().field===null);assert.equal(elements.has('court-102'),false);assert.equal(elements.has('reset-practice'),false);$('park-menu').onclick();$('sign-out').onclick();assert.equal(window.teamballPark.snapshot().id,null);assert.equal($('login').hidden,false);
 }finally{running=false;friend?.terminate();stop();await new Promise(r=>server.close(r));}
});
