import test from 'node:test';
import assert from 'node:assert/strict';
import {nearbySpectateCourt} from '../public/js/park-spectating.mjs';
import {ParkRenderer} from '../public/js/park-renderer.mjs';
import {COURTS} from '../public/js/park-layout.mjs';
import {createPitch} from '../public/js/config.mjs';
function fixture(){const c=COURTS[0],player={id:'watcher',name:'Watcher',field:null,x:c.x+c.w/2,y:c.y+c.h+80};return {c,player,park:{players:[player],fields:[{id:c.id,mode:'casual',state:'playing',pitch:createPitch(1),players:[],members:[],remaining:120,score:{red:0,blue:0},ball:{x:500,y:350}}]}};}
test('only live fields within sideline range offer spectating',()=>{
 const {c,player,park}=fixture();assert.equal(nearbySpectateCourt(park,player),c);
 for(const state of ['goal','halftime','kickoff']){park.fields[0].state=state;assert.equal(nearbySpectateCourt(park,player),c);}
 for(const state of ['ended','intermission','lobby','voting','idle']){park.fields[0].state=state;assert.equal(nearbySpectateCourt(park,player),null);}
 park.fields[0].state='playing';player.y+=100;assert.equal(nearbySpectateCourt(park,player),null);
 player.y=c.y+c.h/2;assert.equal(nearbySpectateCourt(park,player),null,'the pitch centre is not a sideline');
 player.y=c.y+c.h+80;player.field=c.id;assert.equal(nearbySpectateCourt(park,player),null);
 assert.equal(nearbySpectateCourt(park,null),null);
});
test('waiting Ranked courts never offer an ongoing match to spectate',()=>{
 const {player,park}=fixture(),c=COURTS.find(f=>f.id==='r1a');Object.assign(player,{x:c.x+c.w/2,y:c.y+c.h+60});
 Object.assign(park.fields[0],{id:c.id,mode:'ranked',phase:'warmup',state:'kickoff'});assert.equal(nearbySpectateCourt(park,player),null);
 park.fields[0].phase='match';assert.equal(nearbySpectateCourt(park,player),c);
});
test('the camera follows walkers at the border and frames a field only when explicitly spectating',()=>{
 const previous=globalThis.window;globalThis.window={devicePixelRatio:1};
 try{
  const ctx=new Proxy({},{get:()=>()=>{}}),canvas={width:1366,height:900,getBoundingClientRect:()=>({width:1366,height:900,left:0,top:0}),getContext:()=>ctx};
  const r=new ParkRenderer(canvas),{park,c,player}=fixture();r.landscape=()=>{};r.bench=()=>{};
  for(const method of ['pitchArt','player','drawMatchBall','overlay'])r.art[method]=()=>{};
  const before=structuredClone(park);r.draw(park,player.id,null,1000);assert.equal(r.camera.x,player.x);assert.equal(r.camera.y,player.y);
  for(let i=1;i<=60;i++)r.draw(park,player.id,null,1000+i*16,{spectating:c.id});
  assert.ok(Math.abs(r.camera.y-(c.y+c.h/2))<1);assert.equal(r.focus,null,'watching does not join a team or change input coordinates');
  for(let i=1;i<=60;i++)r.draw(park,player.id,null,2000+i*16);
  assert.ok(Math.abs(r.camera.y-player.y)<1);assert.deepEqual(park,before);
 }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
