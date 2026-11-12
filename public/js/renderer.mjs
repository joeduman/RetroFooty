import {drawChatBubbles} from './chat-bubbles.mjs';
import {grassPattern} from './grass-texture.mjs';
import {LOOK,TEXT} from './customize.mjs';
import {normalizeGoalEffect,BLACK_HOLE_TIMING} from './goal-effects.mjs';
import {kickDirection} from './physics.mjs';
import { clamp,unit,seededRandom,TUNING as C } from './config.mjs';

export class Renderer {
  constructor(canvas){
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.scale=1;this.offsetX=0;this.offsetY=0;
    this.width=0;this.height=0;this.dpr=1;this.pitch=null;
    this.goalBursts=new Map();
    this.motionQuery=typeof globalThis.matchMedia==='function'?globalThis.matchMedia('(prefers-reduced-motion: reduce)'):null;
    // Shirt assets live in public/images/shirts/. Keep these paths together for easy swaps.
    this.shirtSprites=new Map();
    this.registerShirt('plain','/images/shirts/shirt1.png');
    this.registerShirt('bot','/images/shirts/shirt_bot.png');
    this.registerShirt('inferno','/images/shirts/shirt_inferno.png');

    this.registerShirt('bot-red','/images/shirts/shirt_bot_red.png');
    this.registerShirt('bot-blue','/images/shirts/shirt_bot_blue.png');


    this.registerShirt('barcelona','/images/shirts/barcelona.png');
    this.registerShirt('psg','/images/shirts/psg.png');
  }
  // Add future player-customization options with registerShirt('design-id','/images/shirts/design.png').
  registerShirt(id,src){
    if(typeof Image==='undefined')return;
    const img=new Image();img.src=src;this.shirtSprites.set(id,img);
  }
  playerShirt(p,prefs={}){

    // Identify AI-controlled players.
    const isBot = p.isBot === true ||
        (p.isBot === undefined && p.human === false);

    // ============================================
    // BOT SHIRTS — Automatically assigned by team
    // ============================================

    if(isBot){

        if(p.team === 'red'){
            return this.shirtSprites.get('bot-red');
        }

        if(p.team === 'blue'){
            return this.shirtSprites.get('bot-blue');
        }
    }

    // ============================================
    // HUMAN SHIRTS — Player customization
    // ============================================

    const requested = p.shirtId ||
        (p.human === true ? prefs.shirtId : 'plain');

    const choice = this.shirtSprites.has(requested)
        ? requested
        : 'plain';

    return this.shirtSprites.get(choice);
}
  resize(pitch){
    this.pitch=pitch;const rect=this.canvas.getBoundingClientRect();
    const dpr=Math.min(window.devicePixelRatio||1,2);
    if(rect.width!==this.width||rect.height!==this.height||dpr!==this.dpr){
      this.width=rect.width;this.height=rect.height;this.dpr=dpr;
      this.canvas.width=Math.round(rect.width*dpr);this.canvas.height=Math.round(rect.height*dpr);
    }
    const usableHeight=Math.max(200,rect.height-100);
    this.scale=Math.min(rect.width/pitch.width,usableHeight/pitch.height);
    this.offsetX=(rect.width-pitch.width*this.scale)/2;this.offsetY=62+(usableHeight-pitch.height*this.scale)/2;
  }
  worldPoint(clientX,clientY){
    const r=this.canvas.getBoundingClientRect();return {x:(clientX-r.left-this.offsetX)/this.scale,y:(clientY-r.top-this.offsetY)/this.scale};
  }
  circle(x,y,r,fill,stroke,width=1){const c=this.ctx;c.beginPath();c.arc(x,y,r,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
  pitchArt(p,sidesSwapped=false){
    const c=this.ctx,L=p.left,R=p.right,T=p.top,B=p.bottom,W=R-L,H=B-T,cy=p.height/2;
    // New grass-colored background behind the pitch.
    c.fillStyle='#425c38';c.fillRect(0,0,p.width,p.height);
    c.fillStyle=grassPattern(c)||'#527443';c.fillRect(L,T,W,H);
    for(let i=0;i<10;i++){c.fillStyle=i%2?'#ffffff03':'#132a0b05';c.fillRect(L+W*i/10,T,W/10,H);}
    // Subtle mowing grain stays still; no moving texture behind the ball.
    c.strokeStyle='#ffffff03';c.lineWidth=1;
    for(let y=T+4;y<B;y+=8){c.beginPath();c.moveTo(L,y);c.lineTo(R,y);c.stroke();}
    for(const side of ['red','blue']){
      // A goal wears the color of the team defending it.
      const onLeft=(side==='red')!==Boolean(sidesSwapped);
      const x=onLeft?L-p.goalDepth:R;
      c.fillStyle=side==='red'?'#dd526316':'#4a9cfa16';c.fillRect(x,p.goalTop,p.goalDepth,p.goalWidth);
      c.strokeStyle='#d1e4d33b';c.lineWidth=1;c.beginPath();
      for(let nx=x;nx<=x+p.goalDepth;nx+=8){c.moveTo(nx,p.goalTop);c.lineTo(nx,p.goalBottom);}
      for(let ny=p.goalTop;ny<=p.goalBottom;ny+=8){c.moveTo(x,ny);c.lineTo(x+p.goalDepth,ny);}c.stroke();
      c.strokeStyle=side==='red'?'#dd7280':'#70a8ed';c.lineWidth=3;
      c.strokeRect(x,p.goalTop,p.goalDepth,p.goalWidth);
    }
    c.strokeStyle='#d8eddf80';c.lineWidth=2.3;c.strokeRect(L,T,W,H);
    c.beginPath();c.moveTo(p.width/2,T);c.lineTo(p.width/2,B);c.stroke();
    this.circle(p.width/2,cy,Math.min(78,H*.15),null,'#d8eddf80',2.3);this.circle(p.width/2,cy,3,'#d8eddfb0');
    const boxW=Math.min(130,W*.14),boxH=p.goalWidth+110;
    c.strokeRect(L,cy-boxH/2,boxW,boxH);c.strokeRect(R-boxW,cy-boxH/2,boxW,boxH);
    c.strokeRect(L,cy-(p.goalWidth+35)/2,40,p.goalWidth+35);
    c.strokeRect(R-40,cy-(p.goalWidth+35)/2,40,p.goalWidth+35);
    for(const x of [L,R])for(const y of [p.goalTop,p.goalBottom]){
      this.circle(x+1,y+3,p.postRadius+1,'#06150c6b');this.circle(x,y,p.postRadius,'#f2f6e9','#b0bcaf',1.4);
    }
  }
  player(p,prefs){
    const c=this.ctx,r=p.radius,red=p.team==='red';
    this.circle(p.x+2,p.y+4,r+1,'#05130b65');

    const gradient=c.createRadialGradient(p.x-6,p.y-8,2,p.x,p.y,r);
    gradient.addColorStop(0,red?'#ff9293':'#9bc8ff');gradient.addColorStop(.5,red?'#e94d65':'#448bd9');gradient.addColorStop(1,red?'#a72c46':'#2460a3');
    this.circle(p.x,p.y,r,gradient,p.human?LOOK.ownOutline:red?'#ffbdc2':'#b9dbff',p.human?LOOK.ownOutlineWidth:1.4);
    // Jerseys replace the old player numbers. The team-colored circle stays visible
    // around each shirt, so red and blue players remain easy to distinguish.
    const shirt=this.playerShirt(p,prefs);
    if(shirt?.complete&&shirt.naturalWidth>0){
      const size=r*1.85;
      c.drawImage(shirt,p.x-size/2,p.y-size/2,size,size);
    }
    // The ring shows button state, not just a successful kick / ball contact.
    if(p.input?.shoot||p.kickFlash>0)this.circle(p.x,p.y,r+3,null,LOOK.kickOutline,LOOK.kickOutlineWidth);
    if(p.human){c.fillStyle='#d5ffd9';c.beginPath();c.moveTo(p.x,p.y-r-5);c.lineTo(p.x-4,p.y-r-11);c.lineTo(p.x+4,p.y-r-11);c.closePath();c.fill();}
    c.save();c.translate(p.x,p.y);c.rotate(Math.atan2(p.faceY,p.faceX));
    c.fillStyle='#ffffff35';c.beginPath();c.moveTo(r-3,0);c.lineTo(r-8,-5);c.lineTo(r-8,5);c.fill();c.restore();
    c.textAlign='center';c.textBaseline='middle';
    if(prefs.showNames){
      c.font=`${p.human?'700':'600'} 12px ${LOOK.font}`;c.textBaseline='bottom';
      c.lineWidth=3.5;c.strokeStyle='#102519f0';c.strokeText(p.name,p.x,p.y-r-14);c.fillStyle=red?'#ff9199':'#94c7ff';c.fillText(p.name,p.x,p.y-r-14);
    }
    if(p.human||p.stamina<97){
      c.fillStyle='#07140bc4';c.fillRect(p.x-17,p.y+r+7,34,4);
      c.fillStyle=p.exhausted?'#ff9b72':p.sprinting?'#f9df85':'#a7f0bd';c.fillRect(p.x-17,p.y+r+7,34*p.stamina/100,4);
    }
  }
  chatBubbles(players){drawChatBubbles(this,players);}
  trainingArt(match){
    const t=match.training;if(!t)return;const c=this.ctx,p=match.pitch;c.save();
    for(const cone of match.engine.obstacles??[]){this.circle(cone.x,cone.y,cone.radius+3,'#09130f70');this.circle(cone.x,cone.y,cone.radius,'#f9a04b','#ffe0b1',1.5);this.circle(cone.x,cone.y,cone.radius*.43,'#ffe3b7');}
    if(t.circle){
      this.circle(t.circle.x,t.circle.y,t.circle.radius,'#d9c4730b','#e1d497b0',2.5);
      c.font=`700 12px ${LOOK.font}`;c.textAlign='center';c.fillStyle='#e1d497';c.fillText('KEEP THE BALL INSIDE',t.circle.x,t.circle.y-t.circle.radius-12);
    }
    if(t.kind==='wall'){c.strokeStyle=t.banked?'#ecc771':'#b1f0bd';c.lineWidth=7;c.beginPath();c.moveTo(t.wallX-75,p.top+1);c.lineTo(t.wallX+75,p.top+1);c.stroke();}
    const zones=t.gates.length?t.gates:t.target?[t.target]:[],groups=new Map();
    zones.forEach((zone,i)=>{const key=`${zone.x}:${zone.y}`,group=groups.get(key)||{zone,labels:[],active:false};group.labels.push(i+1);group.active ||= zone===t.target;groups.set(key,group);});
    groups.forEach(({zone,labels,active})=>{
      c.setLineDash(active?[]:[5,7]);
      this.circle(zone.x,zone.y,zone.radius,active?'#b1f0bd16':null,active?'#b1f0bd':'#93b6a044',active?3:1.5);c.setLineDash([]);
      c.fillStyle=active?'#d5ffcf':'#9db9a860';c.font=`800 13px ${LOOK.font}`;c.textAlign='center';c.textBaseline='middle';
      c.fillText(t.kind==='dribble'?(active?String(t.gates.indexOf(t.target)+1):labels.join(' / ')):t.kind==='wall'?'RECEIVE':'EXIT',zone.x,zone.y);
    });c.restore();
  }
  draw(match,prefs,pointer,paused=false){
    this.resize(match.pitch);const c=this.ctx,p=match.pitch,b=match.engine.ball;
    c.setTransform(this.dpr,0,0,this.dpr,0,0);c.fillStyle='#1b6341';c.fillRect(0,0,this.width,this.height);
    c.translate(this.offsetX,this.offsetY);c.scale(this.scale,this.scale);this.pitchArt(p,match.sidesSwapped);this.trainingArt(match);
    this.aimGuide(match,prefs,pointer,paused);
    for(const q of match.players)this.player(q,prefs);
    if(match.state!=='kickoff')this.drawMatchBall(match,b);
    this.chatBubbles(match.players);
    this.overlay(match,paused);
  }
  aimGuide(match,prefs,pointer,paused=false){
    const c=this.ctx,p=match.pitch,b=match.engine.ball;
    if(match.human&&prefs.aimGuide&&pointer&&!paused){
      const h=match.human,dx=pointer.x-h.x,dy=pointer.y-h.y,d=Math.hypot(dx,dy)||1;
      c.setLineDash([4,6]);c.strokeStyle='#d9ffda40';c.lineWidth=1.5;c.beginPath();
      c.moveTo(h.x+dx/d*29,h.y+dy/d*29);c.lineTo(h.x+dx/d*70,h.y+dy/d*70);c.stroke();c.setLineDash([]);
      this.circle(clamp(pointer.x,p.left-(p.runoff??0),p.right+(p.runoff??0)),clamp(pointer.y,p.top-(p.runoff??0),p.bottom+(p.runoff??0)),4,null,'#edffdf50');
      const bd=Math.hypot(b.x-h.x,b.y-h.y);
      if(bd<h.radius+b.radius+C.shotReach+12&&bd>0){
        const normal=unit(b.x-h.x,b.y-h.y),aim=unit(dx,dy),direction=kickDirection(normal,aim);
        if(normal.x*aim.x+normal.y*aim.y>=.25){c.strokeStyle='#efdb8cb0';c.lineWidth=2;c.beginPath();c.moveTo(b.x,b.y);c.lineTo(b.x+direction.x*90,b.y+direction.y*90);c.stroke();}
      }
    }
  }
  ball(b){const c=this.ctx;
    this.circle(b.x+1.5,b.y+3,b.radius+1,'#07100b80');
    this.circle(b.x,b.y,b.radius,'#fffbea','#d7e6da',1.1);
    c.save();c.translate(b.x,b.y);c.rotate(b.angle);c.fillStyle='#314437';
    c.beginPath();for(let i=0;i<5;i++){const a=i*Math.PI*2/5;c.lineTo(Math.cos(a)*b.radius*.35,Math.sin(a)*b.radius*.35);}c.closePath();c.fill();
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5;this.circle(Math.cos(a)*b.radius*.82,Math.sin(a)*b.radius*.82,b.radius*.17,'#314437');}c.restore();
  }
  drawMatchBall(match,ball=match.engine?.ball,now=globalThis.performance?.now?.()??Date.now()){
    const burst=this.goalBurst(match,now);
    // The swallowed ball remains hidden until the next play state, even after
    // the vortex disappears. The authoritative ball continues its normal motion.
    if(burst?.effectId==='black-hole')return;
    if(ball)this.ball(ball);
  }
  goalBurst(match,now=globalThis.performance?.now?.()??Date.now()){
    const p=match.pitch,b=match.engine?.ball;
    if(!p)return null;
    // The park shares one Renderer across its five differently sized pitches.
    // Keep a separate burst per pitch and never restart it on a network update.
    const key=match.visualKey??`${p.width}:${p.height}`;
    this.goalBursts??=new Map();
    if(match.state!=='goal'){
      const previous=this.goalBursts.get(key);
      const token=`${match.round??''}:${match.score?.red??0}:${match.score?.blue??0}:${match.goalTeam}`;
      if(previous?.effectId==='black-hole'&&previous.token===token&&['ended','intermission','halftime'].includes(match.state)&&
         !this.motionQuery?.matches&&!match.reducedMotion)return previous;
      this.goalBursts.delete(key);return null;
    }
    if(!b||this.motionQuery?.matches||match.reducedMotion)return null;
    const token=`${match.round??''}:${match.score?.red??0}:${match.score?.blue??0}:${match.goalTeam}`;
    let burst=this.goalBursts.get(key);
    if(!burst||burst.token!==token){
      const right=(match.goalTeam==='red')!==Boolean(match.sidesSwapped),dir=right?1:-1;
      const goalX=right?p.right:p.left;
      const random=seededRandom((match.score?.red??0)*193+(match.score?.blue??0)*977+p.width+(right?1:0));
      const effectId=normalizeGoalEffect(match.goalInfo?.goalEffectId);
      burst={token,at:now,effectId,dir,x:clamp(b.x,Math.min(goalX,goalX+dir*p.goalDepth),Math.max(goalX,goalX+dir*p.goalDepth)),
        y:clamp(b.y,p.goalTop,p.goalBottom),pieces:Array.from({length:22},(_,i)=>({
          vx:dir*(25+random()*70)+(random()-.5)*55,vy:(random()-.62)*145,
          rotation:random()*Math.PI,spin:(random()-.5)*12,width:2.5+random()*2,height:3+random()*3,
          color:i%2?'#101614':'#fffdf3'
        }))};
      if(effectId==='fire')burst.embers=Array.from({length:34},(_,i)=>{
        const angle=random()*Math.PI*2,speed=35+random()*105;
        return {vx:Math.cos(angle)*speed+dir*18,vy:Math.sin(angle)*speed-24,
          radius:6+random()*9,spin:random()*Math.PI,life:.8+random()*.5,
          color:i%3?'#ffc75a':'#fff1b0',smoke:i<7};
      });
      if(effectId==='black-hole'){
        burst.ball={x:b.x,y:b.y,radius:b.radius??C.ballRadius,angle:b.angle??0};
        burst.holeX=goalX+dir*p.goalDepth*.62;burst.holeY=burst.y;
        burst.stars=Array.from({length:38},(_,i)=>({angle:random()*Math.PI*2,radius:42+random()*35,
          speed:.5+random()*.45,phase:random(),size:1+random()*1.3,color:i%3?'#c4b4ff':'#8be9ef'}));
      }
      this.goalBursts.set(key,burst);
    }
    return burst;
  }
  goalConfetti(match,now=globalThis.performance?.now?.()??Date.now()){
    const burst=this.goalBurst(match,now);if(!burst)return;
    const age=Math.max(0,(now-burst.at)/1000),life=burst.effectId==='black-hole'?BLACK_HOLE_TIMING.duration:burst.effectId==='fire'?1.35:1.2;
    if(age>=life)return;
    if(burst.effectId==='black-hole'){this.blackHoleBurst(burst,age);return;}
    if(burst.effectId==='fire'){this.fireBurst(burst,age);return;}
    const c=this.ctx;c.save();c.globalAlpha=Math.pow(1-age/life,.7);
    for(const piece of burst.pieces){
      c.save();c.translate(burst.x+piece.vx*age,burst.y+piece.vy*age+48*age*age);
      c.rotate(piece.rotation+piece.spin*age);c.fillStyle=piece.color;
      c.fillRect(-piece.width/2,-piece.height/2,piece.width,piece.height);c.restore();
    }
    c.restore();
  }
  blackHoleBurst(burst,age){
    const c=this.ctx,{swallowEnd,collapseStart,duration}=BLACK_HOLE_TIMING;
    const collapse=clamp((age-collapseStart)/(duration-collapseStart),0,1);
    const opening=Math.sin(clamp(age/.22,0,1)*Math.PI/2);
    const scale=opening*Math.pow(1-collapse,2),radius=31*scale;
    const turn=age*(2.5+collapse*7);
    c.save();c.translate(burst.holeX,burst.holeY);
    // A bright accretion disc makes the dark center readable against the net.
    const halo=c.createRadialGradient(0,0,Math.max(.01,radius*.6),0,0,Math.max(.02,68*scale));
    halo.addColorStop(0,'#080316dd');halo.addColorStop(.5,'#8c55f66b');halo.addColorStop(.78,'#5b8be336');halo.addColorStop(1,'#2b104500');
    c.fillStyle=halo;c.beginPath();c.arc(0,0,68*scale,0,Math.PI*2);c.fill();
    c.save();c.rotate(-.28);
    for(let ring=0;ring<3;ring++){
      c.strokeStyle=['#7b50bfa0','#baa3fbd9','#8ce7eee8'][ring];c.lineWidth=(5-ring)*scale;
      c.beginPath();c.ellipse(0,0,(57-ring*5)*scale,(17-ring*2)*scale,0,0,Math.PI*2);c.stroke();
    }
    c.restore();
    for(const star of burst.stars){
      const travel=(age*star.speed+star.phase)%1,radial=(star.radius*(1-travel)+10)*scale;
      const angle=star.angle+turn+travel*2.8;
      c.globalAlpha=Math.sin(travel*Math.PI)*(1-collapse);c.fillStyle=star.color;
      c.beginPath();c.arc(Math.cos(angle)*radial,Math.sin(angle)*radial*.7,Math.max(.05,star.size*scale),0,Math.PI*2);c.fill();
    }
    c.globalAlpha=1;c.shadowColor='#9271ed';c.shadowBlur=12*scale;
    c.fillStyle='#02030a';c.strokeStyle='#cfbdff';c.lineWidth=1.5*scale;
    c.beginPath();c.arc(0,0,radius,0,Math.PI*2);c.fill();c.stroke();c.shadowBlur=0;
    // Sweeping front arcs suggest the disc wrapping around the event horizon.
    c.strokeStyle='#9edeeccc';c.lineWidth=2.5*scale;c.beginPath();c.ellipse(0,0,43*scale,13*scale,-.28,turn,turn+Math.PI*.85);c.stroke();
    c.restore();
    if(age<swallowEnd){
      const progress=clamp(age/swallowEnd,0,1),ease=progress*progress*(3-2*progress);
      const dx=burst.ball.x-burst.holeX,dy=burst.ball.y-burst.holeY;
      const angle=Math.atan2(dy,dx)+ease*Math.PI*1.5,dist=Math.hypot(dx,dy)*(1-ease);
      c.save();c.globalAlpha=1-ease*.65;
      this.ball({...burst.ball,x:burst.holeX+Math.cos(angle)*dist,y:burst.holeY+Math.sin(angle)*dist,
        radius:Math.max(.1,burst.ball.radius*(1-ease)),angle:burst.ball.angle+ease*6});
      c.restore();
    }
    if(collapse>0){
      // The disc folds inward, ending in a short pinprick rather than a flash.
      c.save();c.globalAlpha=(1-collapse)*.8;c.strokeStyle='#c6e9ff';c.lineWidth=1.5;
      c.beginPath();c.ellipse(burst.holeX,burst.holeY,Math.max(.1,60*scale),Math.max(.1,8*scale),-.28,0,Math.PI*2);c.stroke();c.restore();
    }
  }
  fireBurst(burst,age){
    const c=this.ctx;
    c.save();c.translate(burst.x,burst.y);
    // Slow charcoal puffs sit behind the warm flash rather than hiding the ball.
    for(const ember of burst.embers){
      if(!ember.smoke||age>=ember.life)continue;
      c.globalAlpha=.22*Math.sin(Math.PI*age/ember.life);c.fillStyle='#3a3832';
      c.beginPath();c.arc(ember.vx*age*.55,ember.vy*age*.55-age*15,ember.radius+age*15,0,Math.PI*2);c.fill();
    }
    // Keep orange flames opaque enough to read against green turf; additive
    // compositing alone washes them into faint yellow-green specks.
    c.globalCompositeOperation='source-over';
    const heat=Math.max(0,1-age/1.05),radius=10+64*(1-Math.exp(-age*12));
    if(heat>0){
      const glow=c.createRadialGradient(0,0,0,0,0,radius);
      glow.addColorStop(0,'#fff4ba');glow.addColorStop(.22,'#ffd05a');
      glow.addColorStop(.54,'#ff6b20');glow.addColorStop(1,'#d82e0900');
      c.globalAlpha=heat*.96;c.fillStyle=glow;c.beginPath();c.arc(0,0,radius,0,Math.PI*2);c.fill();
    }
    if(age<.65){
      c.globalAlpha=(1-age/.65)*.65;c.strokeStyle='#ffac48';c.lineWidth=2.5*(1-age/.65)+.5;
      c.beginPath();c.arc(0,0,8+age*105,0,Math.PI*2);c.stroke();
    }
    for(const [index,ember] of burst.embers.entries()){
      if(age>=ember.life)continue;
      const fade=1-age/ember.life,x=ember.vx*age,y=ember.vy*age+age*age*25;
      if(index<14){
        // A handful of elongated flame tongues expands with the burst.
        c.save();c.globalCompositeOperation='source-over';c.translate(x*.7,y*.7);c.rotate(ember.spin);
        c.globalAlpha=fade*.9;c.fillStyle=index%2?'#ff7128':'#ffba45';
        c.beginPath();c.ellipse(0,0,ember.radius*fade,ember.radius*fade*1.7,0,0,Math.PI*2);c.fill();c.restore();
      }
      c.globalCompositeOperation='lighter';c.globalAlpha=fade;c.strokeStyle=ember.color;c.lineWidth=1+fade;
      c.shadowColor='#ff7a22';c.shadowBlur=4*fade;c.lineCap='round';
      c.beginPath();c.moveTo(x-ember.vx*.035,y-ember.vy*.035);c.lineTo(x,y);c.stroke();
    }
    c.restore();
  }
  overlay(match,paused=false){
    const c=this.ctx,p=match.pitch;
    this.goalConfetti?.(match);
    let title='',subtitle='';
    if(match.state==='kickoff'){title=String(Math.max(1,Math.ceil(match.wait-1e-9)));subtitle=TEXT.kickoff(match.kickoffTeam,match.players.find(p=>p.id===match.kickoffPlayer)?.name);}
    if(match.state==='practice-ready'){title=String(Math.max(1,Math.ceil(match.wait-1e-9)));subtitle=match.training.meta.title.toUpperCase()+' · Get ready';}
    if(match.state==='goal'){title=TEXT.goalTitle(match.goalTeam);subtitle=TEXT.goalDetail(match.goalInfo); }
    if(match.state==='halftime'){title='HALF TIME';subtitle=`${match.score.red}  –  ${match.score.blue}   ·   Switching sides`; }
    if(match.state==='intermission'){
      const remaining=match.nextMatchIn??match.wait,seconds=Number.isFinite(remaining)?Math.max(0,Math.ceil(remaining)):0;
      const countdown=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
      title='FULL TIME';subtitle=`${match.score.red}  –  ${match.score.blue}   ·   Next match in ${countdown}`;
    }
    if(title&&!paused){
      // OUTLINED TEXT: Draw a dark stroke around each glyph, then fill it white.
      // Adjust lineWidth to change outline thickness. No background rectangle.
      c.save();
      c.textAlign='center';c.textBaseline='alphabetic';c.lineJoin='round';
      c.strokeStyle='#0b0d0c';c.fillStyle='#f6fff1';
      c.font=match.state==='kickoff'?`900 42px ${LOOK.font}`:`900 30px ${LOOK.font}`;
      c.lineWidth=6;
      c.strokeText(title,p.width/2,p.height/2-4,365);
      c.fillText(title,p.width/2,p.height/2-4,365);
      // Include the scorer name and kickoff instructions in the outlined style.
      c.font=`700 16px ${LOOK.font}`;c.lineWidth=4;
      c.strokeText(subtitle,p.width/2,p.height/2+26,365);
      c.fillText(subtitle,p.width/2,p.height/2+26,365);
      c.restore();
    }
  }
}
