import {normalizeShirt} from './cosmetics.mjs';
import { clamp, unit, STEP, TUNING as C } from './config.mjs';
import {normalizeGoalEffect} from './goal-effects.mjs';

// Shirt IDs are shared by the client menus and the multiplayer servers.
// Add new designs to both this list and the server allowlist before exposing them.
export const SHIRT_OPTIONS=[{id:'rookie',name:'Rookie',src:'/images/shirts/shirt_rookie.png'},
  {id:'inferno',name:'Inferno',src:'/images/shirts/shirt_inferno.png'},{id:'barcelona',name:'Barcelona',src:'/images/shirts/barcelona.png'},{id:'psg',name:'Psg',src:'/images/shirts/psg.png'}];
export const DEFAULTS={movement:'mouse',volume:.2,showNames:true,aimGuide:true,shirtId:'rookie',goalEffectId:'classic',
  bindings:{shoot:'Mouse0',alternate:'Space',sprint:'Shift',up:'KeyW',down:'KeyS',left:'KeyA',right:'KeyD'}};
export function loadPreferences(){
  let data={};try{data=JSON.parse(localStorage.getItem('teamball05')||'{}');}catch{}
  return {name:typeof data.name==='string'?data.name.slice(0,16):'',team:data.team==='blue'?'blue':'red',
    size:clamp(Number(data.size)||4,1,5),movement:data.movement==='keys'?'keys':'mouse',
    volume:clamp(Number.isFinite(data.volume)?data.volume:.2,0,1),showNames:data.showNames!==false,
    aimGuide:data.aimGuide!==false,goldenGoal:data.goldenGoal!==false,
    shirtId:normalizeShirt(data.shirtId),
    goalEffectId:normalizeGoalEffect(data.goalEffectId),
    bindings:{...DEFAULTS.bindings,...data.bindings}};
}
export function savePreferences(value){try{localStorage.setItem('teamball05',JSON.stringify(value));}catch{}}
export function bindingName(code){
  return ({Mouse0:'Left click',Mouse1:'Middle click',Mouse2:'Right click',Space:'Space',Shift:'Shift',
    ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→'})[code]||code.replace(/^Key|^Digit/,'');
}
const normalize=code=>code.startsWith('Shift')?'Shift':code;

export class InputController {
  constructor(canvas,renderer,preferences,{pause,changed,isActive,onBound}){
    this.canvas=canvas;this.renderer=renderer;this.preferences=preferences;this.keys=new Set();
    this.pointer=null;this.shot=false;this.shotBuffer=0;this.rebinding=null;this.active=isActive;this.onBound=onBound;this.changed=changed;
    const bind=code=>{
      if(!this.rebinding)return false;
      const action=this.rebinding;this.rebinding=null;
      if(code!=='Escape'){
        const old=preferences.bindings[action];
        // Swap duplicate binds so one press cannot accidentally do two actions.
        for(const [key,value] of Object.entries(preferences.bindings))if(key!==action&&value===code)preferences.bindings[key]=old;
        preferences.bindings[action]=code;changed();
      }
      this.reset();onBound();return true;
    };
    window.addEventListener('keydown',event=>{
      const code=normalize(event.code);
      if(this.rebinding){event.preventDefault();bind(code);return;}
      if(code==='Escape'){if(!event.repeat)pause();return;}
      if(event.target instanceof Element&&event.target.closest('input,select,textarea'))return;
      if(!this.active())return;
      if(Object.values(preferences.bindings).includes(code)||code.startsWith('Arrow'))event.preventDefault();
      this.keys.add(code);
      if(!event.repeat&&(code===preferences.bindings.shoot||code===preferences.bindings.alternate))this.shot=true;
    });
    window.addEventListener('keyup',event=>this.keys.delete(normalize(event.code)));
    canvas.addEventListener('pointermove',event=>{if(this.active())this.pointer=renderer.worldPoint(event.clientX,event.clientY);});
    canvas.addEventListener('pointerleave',()=>{this.pointer=null;});
    window.addEventListener('pointerdown',event=>{
      const code='Mouse'+event.button;
      if(this.rebinding){event.preventDefault();event.stopPropagation();bind(code);return;}
      if(event.target!==canvas||!this.active())return;
      event.preventDefault();canvas.focus({preventScroll:true});
      this.pointer=renderer.worldPoint(event.clientX,event.clientY);this.keys.add(code);
      if(code===preferences.bindings.shoot||code===preferences.bindings.alternate)this.shot=true;
    },true);
    window.addEventListener('pointerup',event=>this.keys.delete('Mouse'+event.button));
    canvas.addEventListener('contextmenu',event=>event.preventDefault());
    window.addEventListener('blur',()=>{this.reset();if(this.active())pause(true);});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.reset();if(this.active())pause(true);}});
  }
  reset(){this.keys.clear();this.shot=false;this.shotBuffer=0;this.pointer=null;}
  read(player,dt=STEP){
    const prefs=this.preferences,b=prefs.bindings,keys=this.keys;
    let x=0,y=0;
    if(prefs.movement==='keys'){
      x=(keys.has(b.right)||keys.has('ArrowRight')?1:0)-(keys.has(b.left)||keys.has('ArrowLeft')?1:0);
      y=(keys.has(b.down)||keys.has('ArrowDown')?1:0)-(keys.has(b.up)||keys.has('ArrowUp')?1:0);
    }else if(this.pointer){
      const dx=this.pointer.x-player.x,dy=this.pointer.y-player.y,d=Math.hypot(dx,dy);
      const amount=clamp((d-3)/18,0,1);const n=unit(dx,dy,0,0);x=n.x*amount;y=n.y*amount;
    }
    let aim=this.pointer?unit(this.pointer.x-player.x,this.pointer.y-player.y,player.faceX,player.faceY):unit(x,y,player.faceX,player.faceY);
    // A held button stays armed, including before contact. Brief taps get a
    // 120 ms buffer so contact need not fall on the keydown frame. No charge.
    if(this.shot)this.shotBuffer=C.shotBuffer;
    const shoot=keys.has(b.shoot)||keys.has(b.alternate)||this.shotBuffer>0;
    this.shot=false;this.shotBuffer=Math.max(0,this.shotBuffer-dt);
    return {x,y,aimX:aim.x,aimY:aim.y,sprint:keys.has(b.sprint),shoot};
  }
}
