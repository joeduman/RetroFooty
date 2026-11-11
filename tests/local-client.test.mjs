// Run the actual local controller with DOM/canvas adapters and short real matches.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {historyStore} from '../public/js/replay.mjs';

class ElementMock extends EventTarget {
  constructor(tag='div'){super();this.tagName=tag;this.hidden=false;this.value='';this.children=[];this.width=720;this.height=440;this.classList={toggle(){},add(){}};}
  append(...nodes){this.children.push(...nodes);if(this.tagName==='select'&&!this.value&&nodes[0])this.value=String(nodes[0].value);}
  replaceChildren(...nodes){this.children=[];this.value='';this.append(...nodes);}
  setAttribute(){}focus(){}closest(){return null;}
  getBoundingClientRect(){return {width:1366,height:900,left:0,top:0};}
  getContext(){return new Proxy({createRadialGradient:()=>({addColorStop(){}}),measureText:()=>({width:20})},{get:(o,k)=>k in o?o[k]:()=>{}});}
}

test('local matches show a compact perspective summary before details and retain replay saves',async()=>{
  const html=await readFile(new URL('../public/local.html',import.meta.url),'utf8'),elements=new Map();
  for(const m of html.matchAll(/<(\w+)\b[^>]*\bid="([^"]+)"[^>]*>/g)){
    const element=new ElementMock(m[1]);element.hidden=/\bhidden\b/.test(m[0]);elements.set(m[2],element);
  }
  const $=id=>{assert.ok(elements.has(id),`${id} exists in local.html`);return elements.get(id);};
  assert.equal(elements.has('practice'),false);assert.equal(elements.has('practice-setup'),false);
  let nextFrame,now=0;
  const stored=new Map([['teamball05',JSON.stringify({team:'blue',size:1,volume:0})]]),saves=[];
  globalThis.Element=ElementMock;globalThis.window=Object.assign(new EventTarget(),{devicePixelRatio:1});
  globalThis.document=Object.assign(new EventTarget(),{getElementById:$,createElement:tag=>new ElementMock(tag),querySelector:()=>new ElementMock(),querySelectorAll:()=>[]});
  globalThis.localStorage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)};
  globalThis.fetch=async()=>({json:async()=>({policy:null,contexts:{}})});
  globalThis.location={search:''};globalThis.requestAnimationFrame=callback=>{nextFrame=callback;};
  historyStore.save=async recording=>saves.push(structuredClone(recording));
  let source=await readFile(new URL('../public/js/app.mjs',import.meta.url),'utf8');
  // Keep production gameplay intact; shorten only the clock in this fixture.
  source=source.replace("import {Match} from './match.mjs';",`import {Match as BaseMatch} from './match.mjs';
    class Match extends BaseMatch {constructor(options){super({...options,duration:.15,goldenGoal:false});globalThis.localFixtureMatch=this;}}`);
  source=source.replace(/from '(\.\/[^']+)'/g,(_,relative)=>`from '${new URL(relative,new URL('../public/js/app.mjs',import.meta.url)).href}'`);
  await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const finish=()=>{for(let n=0;n<80&&localFixtureMatch.state!=='ended';n++){now+=100;nextFrame(now);}assert.equal(localFixtureMatch.state,'ended');};

  $('play').onclick();assert.equal(localFixtureMatch.practice,false);localFixtureMatch.score={red:0,blue:2};finish();
  assert.equal($('local-summary').hidden,false);assert.equal($('result').hidden,true);
  assert.equal($('local-summary-title').textContent,'Win 2-0');assert.equal($('stats-table').children.length,0,'details are rendered only when requested');
  $('local-summary-details').onclick();assert.equal($('result').hidden,false);assert.equal($('local-summary').hidden,true);
  assert.ok($('stats-table').children.length);assert.equal($('heatmap-player').children.length,2);
  $('local-details-close').onclick();assert.equal($('local-summary').hidden,false);assert.equal($('result').hidden,true);
  $('local-summary-again').onclick();assert.equal($('local-summary').hidden,true);localFixtureMatch.score={red:3,blue:1};finish();
  assert.equal($('local-summary-title').textContent,'Loss 1-3');
  $('local-summary-menu').onclick();assert.equal($('menu').hidden,false);
  $('watch').onclick();assert.equal(localFixtureMatch.spectator,true);localFixtureMatch.score={red:1,blue:3};finish();
  assert.equal($('local-summary-title').textContent,'Full time 1-3');
  await new Promise(resolve=>setImmediate(resolve));assert.equal(saves.length,3);assert.ok(saves.every(save=>save.summary.status==='complete'));
});
