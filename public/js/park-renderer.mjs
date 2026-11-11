import {PARK,COURTS} from './park-layout.mjs';
import {Renderer} from './renderer.mjs';
import {LOOK,TEXT} from './customize.mjs';
const WALKS=[
 [[120,120],[PARK.width-120,120],[PARK.width-120,PARK.height-130],[120,PARK.height-130],[120,120]],
 [[120,1600],[PARK.width-120,1600]],
 [[1472,120],[1472,1200],[PARK.spawn.x,PARK.spawn.y],[PARK.spawn.x,PARK.height-130]],
 [[3060,120],[3060,1600],[4100,1600],[4100,PARK.height-130]]
];
const clock=seconds=>{const value=Number.isFinite(seconds)?Math.max(0,Math.ceil(seconds)):0;return `${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`;};
// Spectators read the same authoritative match time as field participants.
export function spectatorClock(field,compact=false){
 if(!field)return '';
 if(field.state==='ended'||field.state==='intermission')return Number.isFinite(field.nextMatchIn)?compact?`NEXT ${clock(field.nextMatchIn)}`:TEXT.matchEnded(field.nextMatchIn):'FULL TIME';
 if(compact)return `${field.overtime?'+':''}${clock(field.overtime?field.extraElapsed:field.remaining)}`;
 if(field.state==='halftime')return `${clock(field.remaining)} · HALF TIME`;
 if(field.state==='kickoff')return `${clock(field.remaining)} · KICKOFF ${Math.max(1,Math.ceil(field.wait||0))}`;
 if(field.state==='goal')return `${field.overtime?'+':''}${clock(field.overtime?field.extraElapsed:field.remaining)} · GOAL`;
 if(field.overtime)return `+${clock(field.extraElapsed)} · GOLDEN GOAL`;
 const phase=field.halftimePending||field.fulltimePending?'LAST ATTACK':`HALF ${field.half||1}`;
 return `${clock(field.remaining)} · ${phase}`;
}
// One world coordinate system for fields, balls, players and spectators.
// Walking follows the avatar; joining changes only the camera framing.
export class ParkRenderer {
 constructor(canvas){this.canvas=canvas;this.c=canvas.getContext('2d');this.art=new Renderer(canvas);this.scale=LOOK.parkZoom;this.zoom=LOOK.parkZoom;this.fieldZoom=LOOK.fieldZoom;this.camera=null;this.ox=0;this.oy=0;this.focus=null;this.shown=new Map();this.last=0;}
 point(x,y){const r=this.canvas.getBoundingClientRect();return {x:(x-r.left-this.ox)/this.scale,y:(y-r.top-this.oy)/this.scale};}
 worldPoint(x,y){const p=this.point(x,y);return this.focus?{x:p.x-this.focus.x,y:p.y-this.focus.y}:p;}
 setZoom(delta,inField=false){
  const factor=Math.exp(-delta*.001);

  if(inField){
   this.fieldZoom=Math.max(
    LOOK.fieldZoomMin,
    Math.min(LOOK.fieldZoomMax,this.fieldZoom*factor),
   );
  }else{
   this.zoom=Math.max(.55,Math.min(1.5,this.zoom*factor));
  }
 }
 text(text,x,y,size=18,color='#e5ecd5',weight=700){const c=this.c;c.font=`${weight} ${size}px ${LOOK.font}`;c.fillStyle=color;c.textAlign='center';c.fillText(text,x,y);}
 pose(key,p,dt){
  let q=this.shown.get(key);if(!q||Math.hypot(q.x-p.x,q.y-p.y)>180)q={x:p.x,y:p.y};
  const a=1-Math.exp(-dt*25);q.x+=(p.x-q.x)*a;q.y+=(p.y-q.y)*a;this.shown.set(key,q);return {...p,x:q.x,y:q.y};
 }
 paths(width,color){
  const c=this.c;c.strokeStyle=color;c.lineWidth=width;c.lineJoin='round';c.lineCap='round';c.beginPath();
  for(const points of WALKS){c.moveTo(...points[0]);for(const point of points.slice(1))c.lineTo(...point);}c.stroke();
 }
 tree(x,y,r=36){
  const c=this.c;c.fillStyle='#102e2438';c.beginPath();c.ellipse(x+12,y+15,r*1.12,r*.78,0,0,Math.PI*2);c.fill();
  for(const [dx,dy,scale,color] of [[0,2,1,'#244c36'],[-r*.28,-r*.2,.74,'#396344'],[r*.27,-r*.12,.67,'#456e49'],[0,-r*.38,.57,'#527d50']]){
   c.fillStyle=color;c.beginPath();c.arc(x+dx,y+dy,r*scale,0,Math.PI*2);c.fill();
  }
 }
 bench(x,y,vertical=false){
  const c=this.c;c.save();c.translate(x,y);if(vertical)c.rotate(Math.PI/2);
  c.fillStyle='#142c2440';c.fillRect(-54,4,112,25);c.fillStyle='#344337';c.fillRect(-43,-2,7,28);c.fillRect(36,-2,7,28);
  for(const sy of [-8,0,8]){c.fillStyle=sy===-8?'#c49d6d':'#a98359';c.fillRect(-52,sy,104,6);}c.restore();
 }
 lamp(x,y){
  const c=this.c;c.fillStyle='#213a30';c.beginPath();c.arc(x,y,9,0,Math.PI*2);c.fill();
  c.fillStyle='#e9d5a0';c.beginPath();c.arc(x,y,4.5,0,Math.PI*2);c.fill();
 }
 landscape(){
  const c=this.c;
  c.fillStyle='#345740';c.fillRect(0,0,PARK.width,PARK.height);
  // Restrained lawn texture keeps the moving players and field lines clear.
  for(let x=0;x<PARK.width;x+=240){c.fillStyle='#a2c68c06';c.fillRect(x,0,120,PARK.height);}
  c.fillStyle='#b5d69c19';for(let x=55;x<PARK.width;x+=120)for(let y=45;y<PARK.height;y+=120){c.fillRect(x+(y%7)*4,y,2,5);}
  this.paths(156,'#1f3c2e');this.paths(142,'#a69d7d');this.paths(128,'#c4bea2');this.paths(2,'#ded6b569');
  c.fillStyle='#a69d7d';c.beginPath();c.arc(PARK.spawn.x,PARK.spawn.y,184,0,Math.PI*2);c.fill();
  c.fillStyle='#d0c9ad';c.beginPath();c.arc(PARK.spawn.x,PARK.spawn.y,170,0,Math.PI*2);c.fill();
  c.strokeStyle='#aaa488';c.lineWidth=2;
  for(const radius of [92,150]){c.beginPath();c.arc(PARK.spawn.x,PARK.spawn.y,radius,0,Math.PI*2);c.stroke();}
  this.text('THE COMMONS',PARK.spawn.x,PARK.spawn.y-95,16,'#536653',800);this.text('TEAMBALL',PARK.spawn.x,PARK.spawn.y-70,25,'#50634e',850);
  // A garden loop and seating give the eastern end a destination without
  // introducing another play area or blocking the walking promenade.
  c.save();c.translate(320,340);
  c.strokeStyle='#a59f7e';c.lineWidth=58;c.beginPath();c.ellipse(4310,2110,385,360,0,0,Math.PI*2);c.stroke();
  c.strokeStyle='#c5bea0';c.lineWidth=46;c.stroke();
  for(const [x,y] of [[4130,1940],[4470,2240],[4380,1900],[4150,2280]]){
   c.fillStyle='#4b6846';c.beginPath();c.ellipse(x,y,72,45,-.4,0,Math.PI*2);c.fill();
   for(let i=0;i<11;i++){c.fillStyle=i%3?'#cfbc87':'#d1a18c';c.beginPath();c.arc(x+Math.sin(i*2.4)*50,y+Math.cos(i*1.8)*26,3,0,Math.PI*2);c.fill();}
  }
  this.text('GARDEN WALK',4310,2116,18,'#a5bc8e',750);this.bench(4090,2450);this.bench(4500,1770);this.bench(4690,2110,true);
  c.restore();
  for(let x=100;x<PARK.width;x+=185){this.tree(x,38,27+(x%3)*3);this.tree(x,PARK.height-37,29+(x%4)*2);}
  for(let y=260;y<PARK.height-100;y+=190){this.tree(39,y,29);this.tree(PARK.width-39,y,30);}
  for(const [x,y,r] of [[1470,1100,32],[1530,1260,27],[1770,1420,30],[2240,1420,32],[2420,1500,25],[3020,1400,31],[3310,1740,32],[4050,1790,31],[4070,2080,35],[4070,2820,37],[5260,1710,34],[5260,2870,37],[2020,1770,28]])this.tree(x,y,r);
  for(const [x,y] of [[1260,1500],[1570,1535],[2250,1600],[2630,1600],[3490,1600],[4110,1790],[4100,2790],[1770,3070],[3010,3070]])this.lamp(x,y);
  c.strokeStyle='#193d2a';c.lineWidth=16;c.strokeRect(8,8,PARK.width-16,PARK.height-16);
 }
 drawOverview(park,id,width,height,now){
  const c=this.c,availableH=Math.max(140,height-184),panelW=Math.min(440,width-32,(availableH-86)*PARK.width/PARK.height+32),panelH=(panelW-32)*PARK.height/PARK.width+86;
  const x=width-panelW-16,y=Math.max(12,height-panelH-86),mapX=x+16,mapY=y+48,mapW=panelW-32,scale=mapW/PARK.width;
  c.save();c.setTransform(this.canvas.width/width,0,0,this.canvas.height/height,0,0);
  c.shadowColor='#071b1566';c.shadowBlur=24;c.shadowOffsetY=8;c.fillStyle='#10271ff2';c.beginPath();c.roundRect(x,y,panelW,panelH,15);c.fill();
  c.shadowBlur=0;c.shadowOffsetY=0;c.strokeStyle='#8ca68766';c.lineWidth=1;c.stroke();
  c.textAlign='left';c.fillStyle='#dce6cc';c.font=`800 11px ${LOOK.font}`;c.fillText('PARK OVERVIEW',x+17,y+26);
  c.textAlign='right';c.fillStyle='#afc29d';c.font=`500 10px ${LOOK.font}`;c.fillText('M  CLOSE',x+panelW-17,y+26);
  c.save();c.translate(mapX,mapY);c.scale(scale,scale);
  c.fillStyle='#34533b';c.fillRect(0,0,PARK.width,PARK.height);this.paths(110,'#a39d7d');
  c.fillStyle='#c9c2a0';c.beginPath();c.arc(PARK.spawn.x,PARK.spawn.y,150,0,Math.PI*2);c.fill();
  for(const f of COURTS){
   const live=park?.fields.find(q=>q.size===f.size);c.fillStyle='#203d2b';c.fillRect(f.x,f.y,f.w,f.h);c.strokeStyle=f.color;c.lineWidth=12;c.strokeRect(f.x,f.y,f.w,f.h);
   c.strokeStyle='#b8cf9a88';c.lineWidth=7;c.beginPath();c.moveTo(f.x+f.w/2,f.y+25);c.lineTo(f.x+f.w/2,f.y+f.h-25);c.stroke();
   c.beginPath();c.arc(f.x+f.w/2,f.y+f.h/2,85,0,Math.PI*2);c.stroke();
   this.text(f.name,f.x+f.w/2,f.y+f.h/2-10/scale,13/scale,'#eef1d9',800);
   this.text(`${live?.members.length??0}/${f.size*2}`,f.x+f.w/2,f.y+f.h/2+4/scale,9/scale,'#b4c9a8',600);
   this.text(live?spectatorClock(live,true):'--:--',f.x+f.w/2,f.y+f.h/2+16/scale,8/scale,'#e4dbac',600);
  }
  for(const player of park?.players||[]){if(player.field!==null||player.id===id)continue;c.fillStyle='#c8d3bd';c.beginPath();c.arc(player.x,player.y,2.6/scale,0,Math.PI*2);c.fill();}
  const me=park?.players.find(p=>p.id===id);
  if(me){c.strokeStyle='#ecd69a88';c.lineWidth=1.5/scale;c.beginPath();c.arc(me.x,me.y,(8+Math.sin(now/300))/scale,0,Math.PI*2);c.stroke();c.fillStyle='#f1d692';c.beginPath();c.arc(me.x,me.y,4/scale,0,Math.PI*2);c.fill();}
  c.restore();c.textAlign='left';c.font=`500 10px ${LOOK.font}`;c.fillStyle='#ead298';c.fillText('\u25cf  You',x+18,y+panelH-14);c.fillStyle='#b4c7aa';c.fillText('Five pitches \u00b7 live player counts',x+83,y+panelH-14);c.restore();
 }
 draw(park,id,destination,now,{field=null,view=null,pointer=null,overview=false,prefs={showNames:true,aimGuide:true}}={}){
  const c=this.c,r=this.canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1),dt=Math.min(.05,(now-(this.last||now-16))/1000);this.last=now;
  if(this.canvas.width!==Math.round(r.width*dpr)||this.canvas.height!==Math.round(r.height*dpr)){this.canvas.width=Math.round(r.width*dpr);this.canvas.height=Math.round(r.height*dpr);}
  this.focus=COURTS.find(f=>f.size===field)||null;
  const me=park?.players.find(p=>p.id===id);
  // Near a sideline, frame the live court and watcher together. Walking away
  // returns to the following camera; the avatar remains under your control.
  const nearby=!this.focus&&me?COURTS.find(f=>Math.hypot(Math.max(f.x-me.x,0,me.x-f.x-f.w),Math.max(f.y-me.y,0,me.y-f.y-f.h))<150):null;
  const framed=this.focus||nearby;
  const target=framed?{x:framed.x+framed.w/2,y:framed.y+framed.h/2}:me||PARK.spawn;
  const fit=framed?Math.min((r.width-30)/(framed.w+LOOK.spectatorMargin*2),(r.height-100)/(framed.h+LOOK.spectatorMargin*2)):1;
const zoom=framed
  ? fit*(this.focus?this.fieldZoom:this.zoom)
  : Math.min(this.zoom,r.height/650);
  if(!this.camera)this.camera={x:target.x,y:target.y};
  const ease=1-Math.exp(-dt*12);this.camera.x+=(target.x-this.camera.x)*ease;this.camera.y+=(target.y-this.camera.y)*ease;this.scale+=(zoom-this.scale)*ease;
  this.ox=r.width/2-this.camera.x*this.scale;this.oy=r.height/2+25-this.camera.y*this.scale;
  c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#172d23';c.fillRect(0,0,r.width,r.height);c.translate(this.ox,this.oy);c.scale(this.scale,this.scale);
  this.landscape();
  for(const f of COURTS){
   const left=(f.x-this.camera.x)*this.scale+r.width/2,top=(f.y-this.camera.y)*this.scale+r.height/2;
   if(left>r.width+250||left+f.w*this.scale< -250||top>r.height+200||top+f.h*this.scale< -200)continue;
   const live=park?.fields.find(q=>q.size===f.size);if(!live)continue;
   const focused=field===f.size&&view;
   const match=focused?view:{pitch:live.pitch,round:live.matchId,sidesSwapped:live.sidesSwapped,players:live.players,engine:{ball:live.ball,obstacles:live.obstacles||[]},training:live.training,score:live.score,state:live.practice&&!live.members.length?'idle':live.state,wait:live.wait,goalTeam:live.goalTeam,goalInfo:live.goalInfo,kickoffTeam:live.kickoffTeam,kickoffPlayer:live.kickoffPlayer};
   c.save();c.translate(f.x,f.y);this.art.pitchArt(match.pitch,match.sidesSwapped);if(focused)this.art.aimGuide(match,prefs,pointer);
   for(const player of match.players){const p=focused?player:this.pose(`f${f.size}-${player.id}`,player,dt);this.art.player({...p,human:Boolean(focused&&p.id===view.human.id)},prefs);}
   this.art.drawMatchBall(match,focused?match.engine.ball:this.pose(`ball${f.size}`,match.engine.ball,dt),now);
   // A nearby watcher sees the same goal scorer and countdown as participants.
   this.art.overlay(match,false);
   c.restore();
   c.fillStyle='#18372bf2';c.beginPath();c.roundRect(f.x+f.w/2-150,f.y-108,300,102,12);c.fill();c.strokeStyle=f.color+'77';c.lineWidth=1;c.stroke();
   this.text(f.name,f.x+f.w/2,f.y-77,25,f.color,850);
   this.text(`${live.score.red} \u2014 ${live.score.blue}   \u00b7   ${live.members.length}/${2*f.size} players`,f.x+f.w/2,f.y-48,16,'#d6e0c5',600);
   this.text(spectatorClock(live),f.x+f.w/2,f.y-22,16,'#eee0b3',700);
   // Benches are visual sideline landmarks. Watchers remain controllable avatars.
   for(const x of [f.x+f.w*.25,f.x+f.w*.75])this.bench(x,f.y+f.h+70);
  }
  for(const p of park?.players||[]){if(p.field!==null)continue;const shown=this.pose('roam'+p.id,p,dt);
   this.art.player({...shown,number:p.name.slice(0,1).toUpperCase(),human:p.id===id},prefs);
  }
  if(destination){c.strokeStyle='#f1d590';c.lineWidth=2;c.beginPath();c.arc(destination.x,destination.y,12+Math.sin(now/180)*2,0,Math.PI*2);c.stroke();}
  const active=new Set((park?.players||[]).map(p=>'roam'+p.id));for(const k of this.shown.keys())if(k.startsWith('roam')&&!active.has(k))this.shown.delete(k);
  if(overview&&!this.focus)this.drawOverview(park,id,r.width,r.height,now);
 }
}
