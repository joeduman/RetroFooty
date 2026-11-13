import test from 'node:test';
import assert from 'node:assert/strict';
import {createPitch} from '../public/js/config.mjs';
import {PARK,COURTS} from '../public/js/park-layout.mjs';
import {ParkRenderer,spectatorClock} from '../public/js/park-renderer.mjs';

test('pitch enlargement preserves the prior goal mouths and shared body sizes',()=>{
 const expected={1:[1134,693,168],2:[1353,814,192],3:[1673,1009,216],4:[1833,1120,238],5:[2006,1206,260]};
 for(const [size,dimensions] of Object.entries(expected)){
  const pitch=createPitch(Number(size));
  assert.deepEqual([pitch.width,pitch.height,pitch.goalWidth],dimensions);
  assert.equal(pitch.goalBottom-pitch.goalTop,pitch.goalWidth);
  assert.equal(pitch.left,88);assert.equal(pitch.top,88);
 }
});

test('park clocks show authoritative time and phase for spectators',()=>{
 const field={state:'playing',remaining:125.2,half:1};
 assert.equal(spectatorClock(field),'2:06 · HALF 1');
 assert.equal(spectatorClock({...field,halftimePending:true}),'2:06 · LAST ATTACK');
 assert.equal(spectatorClock({...field,remaining:0,fulltimePending:true}),'0:00 · LAST ATTACK');
 assert.equal(spectatorClock({...field,state:'halftime'}),'2:06 · HALF TIME');
 assert.equal(spectatorClock({...field,state:'kickoff',wait:2.2}),'2:06 · KICKOFF 3');
 assert.equal(spectatorClock({...field,overtime:true,extraElapsed:34.4}),'+0:35 · GOLDEN GOAL');
 assert.equal(spectatorClock({...field,state:'ended',nextMatchIn:6.8}),'Next match in 0:07');
 assert.equal(spectatorClock({...field,state:'goal'}),'2:06 · GOAL');
 assert.equal(spectatorClock({...field,overtime:true,extraElapsed:34.4},true),'+0:35');
 assert.equal(spectatorClock({...field,state:'ended',nextMatchIn:6.8},true),'NEXT 0:07');
 assert.equal(spectatorClock({...field,remaining:NaN}),'0:00 · HALF 1');
});

test('roaming park spectators see a clock update without joining a field',()=>{
 const previous=globalThis.window,labels=[];
 globalThis.window={devicePixelRatio:1};
 try{
  const context=new Proxy({fillText:value=>labels.push(value)},{get:(object,key)=>key in object?object[key]:()=>{}});
  const canvas={width:1366,height:900,getBoundingClientRect:()=>({width:1366,height:900,left:0,top:0}),getContext:()=>context};
  const renderer=new ParkRenderer(canvas);
  renderer.landscape=()=>{};renderer.bench=()=>{};
  for(const method of ['pitchArt','player','drawMatchBall','overlay'])renderer.art[method]=()=>{};
  const court=COURTS[0],pitch=createPitch(1);
  const park={players:[{id:'watcher',field:null,name:'Watcher',x:court.x+court.w/2,y:court.y+court.h+80}],fields:[{
   size:1,pitch,members:[],players:[],ball:{x:pitch.width/2,y:pitch.height/2},score:{red:2,blue:1},state:'playing',remaining:135,half:2,matchId:'clock-test'
  }]};
  renderer.draw(park,'watcher',null,1000);
  assert.ok(labels.includes('2:15 · HALF 2'));
  labels.length=0;park.fields[0].remaining=134;renderer.draw(park,'watcher',null,1050);
  assert.ok(labels.includes('2:14 · HALF 2'));
  assert.equal(park.players[0].field,null);
  assert.equal(PARK.width,10400);assert.equal(PARK.height,4800);
 }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
