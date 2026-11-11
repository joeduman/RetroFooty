import {createPitch} from './config.mjs';
// Full-size pitches around a central promenade. The space between courts is
// wide enough for the runoff, sideline spectators and a clear walking lane.
export const PARK={width:5000,height:2800,spawn:{x:1840,y:1280}};
export const COURTS=[
 {size:1,name:'1v1',x:220,y:230,color:'#e2c279'},
 {size:2,name:'2v2',x:1570,y:230,color:'#91c8e3'},
 {size:3,name:'3v3',x:220,y:1600,color:'#d4a3dd'},
 {size:4,name:'4v4',x:1980,y:1590,color:'#e6a08b'},
 {size:5,name:'5v5',x:3060,y:230,color:'#b1d59a'}
].map(f=>({...f,w:createPitch(f.size).width,h:createPitch(f.size).height}));
export const courtAt=(x,y)=>COURTS.find(f=>x>=f.x-20&&x<=f.x+f.w+20&&y>=f.y-65&&y<=f.y+f.h+55);
