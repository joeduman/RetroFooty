import {createPitch} from './config.mjs';
// Original commons and courts remain; dedicated Ranked courts extend the park.
export const PARK={width:10400,height:4800,spawn:{x:2010,y:1590}};
const casual=[{id:1,size:1,x:220,y:230},{id:2,size:2,x:1590,y:230},
 {id:3,size:3,x:220,y:1830},{id:4,size:4,x:2130,y:1830},{id:5,size:5,x:3180,y:230}].map(f=>({...f,mode:'casual',number:1}));
const ranked=[{id:'r1a',size:1,x:5500,y:230,number:1},{id:'r1b',size:1,x:7000,y:230,number:2},
 {id:'r2a',size:2,x:5500,y:1830,number:1},{id:'r2b',size:2,x:7200,y:1830,number:2},
 {id:'r3a',size:3,x:220,y:3420,number:1},{id:'r3b',size:3,x:2130,y:3420,number:2},
 {id:'r4',size:4,x:4200,y:3420,number:1},{id:'r5',size:5,x:6400,y:3420,number:1}].map(f=>({...f,mode:'ranked'}));
export const COURTS=[...casual,...ranked].map(f=>({...f,
 name:`${f.size}v${f.size} · ${f.mode==='ranked'?'Ranked':'Unranked'}${f.mode==='ranked'&&f.size<=3?' '+f.number:''}`,
 color:f.mode==='ranked'?'#d8b56a':'#b5c5ad',w:createPitch(f.size).width,h:createPitch(f.size).height}));
export const courtById=id=>COURTS.find(f=>f.id===id);
export const courtAt=(x,y)=>COURTS.find(f=>x>=f.x-20&&x<=f.x+f.w+20&&y>=f.y-110&&y<=f.y+f.h+55);
