// Optional, bounded neural controller. No imports, dependencies, file I/O or hidden physics privileges.
// Input/output schema is shared with train/train.py. Expert scripted AI always remains the fallback.
export const NEURAL_SCHEMA='teamball.neural-controller.v1';
export const INPUT_SIZE=24, HIDDEN_SIZE=24, OUTPUT_SIZE=6;
const clamp=(v,lo=-1,hi=1)=>Math.max(lo,Math.min(hi,v));
const sigmoid=x=>1/(1+Math.exp(-Math.max(-25,Math.min(25,x))));
const verifiedModels=new WeakSet();
const norm=(n,base)=>clamp(n/base);
export function neuralFeatures(engine,player,size){
 const p=engine.pitch,b=engine.ball,dir=engine.attackDir(player.team);
 const w=p.right-p.left,h=p.bottom-p.top,diag=Math.hypot(w,h);
 const opponents=engine.players.filter(q=>q.team!==player.team);
 const teammates=engine.players.filter(q=>q.team===player.team&&q!==player);
 const near=(others)=>others.length?others.reduce((a,v)=>Math.hypot(v.x-player.x,v.y-player.y)<Math.hypot(a.x-player.x,a.y-player.y)?v:a):null;
 const rival=near(opponents),mate=near(teammates);
 const nearestDistance=rival?Math.hypot(rival.x-player.x,rival.y-player.y):diag;
 const mateDistance=mate?Math.hypot(mate.x-player.x,mate.y-player.y):diag;
 const bx=dir===1?(b.x-p.left)/w:(p.right-b.x)/w;
 const px=dir===1?(player.x-p.left)/w:(p.right-player.x)/w;
 return [
  norm((b.x-player.x)*dir,w),norm(b.y-player.y,h),norm(b.vx*dir,550),norm(b.vy,550),
  norm(player.vx*dir,330),norm(player.vy,330),clamp(px*2-1),norm(player.y-p.height/2,h/2),
  clamp(bx*2-1),norm(b.y-p.height/2,h/2),clamp(player.stamina/100,0,1),
  rival?norm((rival.x-player.x)*dir,w):0,rival?norm(rival.y-player.y,h):0,clamp(nearestDistance/diag,0,1),
  mate?norm((mate.x-player.x)*dir,w):0,mate?norm(mate.y-player.y,h):0,clamp(mateDistance/diag,0,1),
  clamp((player.shotCooldown||0)/.5,0,1),norm(b.spin||0,6),b.lastTeam===player.team?1:0,
  clamp(size/5,0,1),clamp(Math.hypot(b.x-player.x,b.y-player.y)/diag,0,1),
  clamp(-(b.vx*dir)/550),clamp((1-bx)*(1-nearestDistance/(diag*1.2)),0,1)
 ];
}
export function validateNeuralModel(m){
 if(!m||m.schema!==NEURAL_SCHEMA||m.inputSize!==INPUT_SIZE||m.hiddenSize!==HIDDEN_SIZE||m.outputSize!==OUTPUT_SIZE)return false;
 const matrices=[[m.w1,HIDDEN_SIZE,INPUT_SIZE],[m.w2,OUTPUT_SIZE,HIDDEN_SIZE]];
 for(const [a,rows,cols] of matrices)if(!Array.isArray(a)||a.length!==rows||a.some(row=>!Array.isArray(row)||row.length!==cols||row.some(x=>!Number.isFinite(x)||Math.abs(x)>100)))return false;
 for(const [a,len] of [[m.b1,HIDDEN_SIZE],[m.b2,OUTPUT_SIZE]])if(!Array.isArray(a)||a.length!==len||a.some(x=>!Number.isFinite(x)||Math.abs(x)>100))return false;
 return true;
}
export function inferNeural(m,features){
 if(!verifiedModels.has(m)){if(!validateNeuralModel(m))return null;verifiedModels.add(m);}
 if(features?.length!==INPUT_SIZE||features.some(x=>!Number.isFinite(x)))return null;
 const hidden=new Float64Array(HIDDEN_SIZE),out=new Float64Array(OUTPUT_SIZE);
 for(let i=0;i<HIDDEN_SIZE;i++){let z=m.b1[i];const row=m.w1[i];for(let j=0;j<INPUT_SIZE;j++)z+=row[j]*features[j];hidden[i]=Math.tanh(z);}
 for(let i=0;i<OUTPUT_SIZE;i++){let z=m.b2[i];const row=m.w2[i];for(let j=0;j<HIDDEN_SIZE;j++)z+=row[j]*hidden[j];out[i]=i<4?Math.tanh(z):sigmoid(z);}
 return Array.from(out);
}
export function humanAction(input,team,attackDir=team==='red'?1:-1){const d=attackDir;return [clamp(input.x*d),clamp(input.y),clamp(input.aimX*d),clamp(input.aimY),Number(!!input.sprint),Number(!!input.shoot)];}
// Preserve scripted shooting/clearance safety. The neural head can refine aim,
// movement and boost choice; it cannot create a kick through a player or own-goal.
export function blendNeural(base,prediction,team,{strength=.30,training=false,random=Math.random,ownGoalRisk=null,canLearnedShoot=false,preserveSprint=false,attackDir=team==='red'?1:-1}={}){
 if(!prediction)return {...base};
 const d=attackDir,w=clamp(strength,0,.5),r=prediction;
 const gaussian=()=>Math.sqrt(-2*Math.log(Math.max(1e-9,random())))*Math.cos(2*Math.PI*random())*.23;
 const action=training?[...r.slice(0,4).map(v=>clamp(v+gaussian())),Number(random()<r[4]),Number(random()<r[5])]:
  [r[0],r[1],r[2],r[3],Number(r[4]>.63),Number(r[5]>.63)];
 const nx=base.x*(1-w)+action[0]*d*w,ny=base.y*(1-w)+action[1]*w;
 const mag=Math.hypot(nx,ny),move=mag>1?{x:nx/mag,y:ny/mag}:{x:nx,y:ny};
 const ax=base.aimX*(1-w*.5)+action[2]*d*w*.5,ay=base.aimY*(1-w*.5)+action[3]*w*.5;
 const am=Math.hypot(ax,ay)||1;
 const aimX=ax/am,aimY=ay/am;
 const result={...base,...move,aimX,aimY,
   sprint:preserveSprint||((base.sprint&&!(w>.25&&action[4]===0))||(action[4]===1&&w>.15&&mag>.15)),
   shoot:base.shoot||(canLearnedShoot&&action[5]===1)};
 // Never fabricate an unsafe shot. A learned bot can express shooting intent
 // only after the scripted kick/contact rules have already allowed a shot.
 if(typeof ownGoalRisk==='function'&&ownGoalRisk(result)){
  result.aimX=base.aimX;result.aimY=base.aimY;result.shoot=base.shoot;
 }
 return {input:result,action};
}
