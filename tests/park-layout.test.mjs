import test from 'node:test';
import assert from 'node:assert/strict';
import {PARK,COURTS,courtAt} from '../public/js/park-layout.mjs';
import {createPitch} from '../public/js/config.mjs';
import {ParkPhysics} from '../public/js/park-physics.mjs';
import {ParkRenderer} from '../public/js/park-renderer.mjs';

test('joining by click accepts only the marked pitch, excluding runoff, nets and signs',()=>{
 for(const f of COURTS){
  const p=createPitch(f.size),cx=f.x+p.width/2,cy=f.y+p.height/2;
  for(const [x,y] of [[cx,cy],[f.x+p.left+1,cy],[f.x+p.right-1,cy],[cx,f.y+p.top+1],[cx,f.y+p.bottom-1]])assert.equal(courtAt(x,y)?.id,f.id);
  for(const [x,y] of [[f.x+p.left-1,cy],[f.x+p.right+1,cy],[cx,f.y+p.top-1],[cx,f.y+p.bottom+1],[cx,f.y-50],[cx,f.y+f.h+40]])assert.equal(courtAt(x,y),undefined);
 }
});

test('the park contains thirteen dedicated match courts with open walking lanes',()=>{
 assert.deepEqual(COURTS.map(f=>f.size),[1,2,3,4,5,1,1,2,2,3,3,4,5]);
 assert.equal(new Set(COURTS.map(f=>f.id)).size,13);
 for(const f of COURTS){
  const p=createPitch(f.size);assert.equal(f.w,p.width);assert.equal(f.h,p.height);
  assert.ok(!f.practice&&!f.drill);
  assert.ok(f.x>100&&f.y>100&&f.x+f.w<PARK.width-100&&f.y+f.h<PARK.height-100);
 }
 for(let i=0;i<COURTS.length;i++)for(const b of COURTS.slice(i+1)){
  const a=COURTS[i],horizontal=Math.max(a.x-b.x-b.w,b.x-a.x-a.w),vertical=Math.max(a.y-b.y-b.h,b.y-a.y-a.h);
  assert.ok(Math.max(horizontal,vertical)-56>=140,`${a.name} and ${b.name} need a walking lane after arena runoff and player radii`);
 }
 const physics=new ParkPhysics();
 for(const point of [PARK.spawn,{x:2010,y:1800},{x:2010,y:3070},{x:3060,y:1600},{x:4100,y:2000}]){
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
  assert.ok(COURTS.every(f=>labels.includes(`${f.size}v${f.size} ${f.mode==='ranked'?'R':'U'}${f.mode==='ranked'?f.number:''}`)));
  assert.ok(labels.includes('0/10'));assert.ok(labels.includes('PARK OVERVIEW'));
  assert.equal(panels.length,1);const panel=panels[0];assert.ok(panel.x>=0&&panel.y>=0&&panel.x+panel.w<=width&&panel.y+panel.h<=height);
 }
});
