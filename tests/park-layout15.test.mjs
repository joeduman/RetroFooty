import test from 'node:test';
import assert from 'node:assert/strict';
import {PARK,COURTS} from '../public/js/park-layout.mjs';
import {createPitch} from '../public/js/config.mjs';
import {ParkPhysics} from '../public/js/park-physics.mjs';
import {ParkRenderer} from '../public/js/park-renderer.mjs';

test('the smaller park contains exactly five full-size match courts with open walking lanes',()=>{
 assert.deepEqual(COURTS.map(f=>f.size),[1,2,3,4,5]);
 assert.ok(PARK.width*PARK.height<8800*4000*.5);
 for(const f of COURTS){
  const p=createPitch(f.size);assert.equal(f.w,p.width);assert.equal(f.h,p.height);
  assert.ok(!f.practice&&!f.drill);
  assert.ok(f.x>100&&f.y>100&&f.x+f.w<PARK.width-100&&f.y+f.h<PARK.height-100);
 }
 for(let i=0;i<COURTS.length;i++)for(const b of COURTS.slice(i+1)){
  const a=COURTS[i],horizontal=Math.max(a.x-b.x-b.w,b.x-a.x-a.w),vertical=Math.max(a.y-b.y-b.h,b.y-a.y-a.h);
  assert.ok(Math.max(horizontal,vertical)>=140,`${a.name} and ${b.name} need a walking lane`);
 }
 const physics=new ParkPhysics();
 for(const point of [PARK.spawn,{x:1825,y:1500},{x:1825,y:2600},{x:2930,y:1350},{x:3800,y:1800}]){
  const player={...point,radius:18,vx:0,vy:0};physics.boundaries(player);assert.equal(player.x,point.x);assert.equal(player.y,point.y);
 }
});

test('the overview draws all court labels and player counts inside desktop and mobile canvases',()=>{
 for(const [width,height] of [[1366,900],[390,844],[844,390]]){
  const labels=[],panels=[];
  const context=new Proxy({fillText:(label)=>labels.push(label),roundRect:(x,y,w,h)=>panels.push({x,y,w,h})},{get:(o,k)=>k in o?o[k]:()=>{}});
  const renderer=Object.assign(Object.create(ParkRenderer.prototype),{c:context,canvas:{width:width*2,height:height*2}});
  const park={fields:COURTS.map(f=>({size:f.size,members:[]})),players:[{id:'me',field:null,...PARK.spawn}]};
  renderer.drawOverview(park,'me',width,height,1000);
  assert.ok(COURTS.every(f=>labels.includes(f.name)));
  assert.ok(labels.includes('0/10'));assert.ok(labels.includes('PARK OVERVIEW'));
  assert.equal(panels.length,1);const panel=panels[0];assert.ok(panel.x>=0&&panel.y>=0&&panel.x+panel.w<=width&&panel.y+panel.h<=height);
 }
});
