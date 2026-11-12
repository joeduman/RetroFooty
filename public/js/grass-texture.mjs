// Small, static canvas tile. No image downloads or per-frame random noise.
const patterns=new WeakMap();
export function grassPattern(context){
 if(patterns.has(context))return patterns.get(context);
 if(typeof document==='undefined'||!context.createPattern)return null;
 const tile=document.createElement('canvas');tile.width=64;tile.height=64;const c=tile.getContext('2d');
 c.fillStyle='#527443';c.fillRect(0,0,64,64);let seed=613;
 const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<220;i++){c.fillStyle=i%2?'#ffffff09':'#10290b12';c.fillRect(Math.floor(random()*64),Math.floor(random()*64),1,1+Math.floor(random()*2));}
 const pattern=context.createPattern(tile,'repeat');patterns.set(context,pattern);return pattern;
}
