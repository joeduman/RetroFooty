// Build 13 portable tactical policy. JSON-only parameters; no executable training data.
export const POLICY_SCHEMA='teamball.ai-policy.v1';
export const DEFAULT_POLICY=Object.freeze({
  press:1,frontPost:1,coverDepth:1,shotPreference:1,passPreference:1,
  boostReserve:1,interceptLookahead:1,bankPreference:1,supportWidth:1,
  defensiveClearance:1
});
export const POLICY_BOUNDS={
  press:[.7,1.3],frontPost:[.8,1.5],coverDepth:[.75,1.3],shotPreference:[.7,1.3],
  passPreference:[.75,1.35],boostReserve:[.7,1.4],interceptLookahead:[.75,1.3],
  bankPreference:[.65,1.3],supportWidth:[.8,1.25],defensiveClearance:[.8,1.4]
};
export const DIFFICULTIES=Object.freeze({
  beginner:{reaction:.42,prediction:.38,aimError:.17,positionError:45,boostSense:.65},
  intermediate:{reaction:.25,prediction:.65,aimError:.09,positionError:24,boostSense:.85},
  advanced:{reaction:.14,prediction:.86,aimError:.035,positionError:9,boostSense:1},
  expert:{reaction:.085,prediction:1,aimError:0,positionError:0,boostSense:1.12}
});
export const clampPolicy=policy=>Object.fromEntries(Object.entries(DEFAULT_POLICY).map(([k,base])=>{
 const [lo,hi]=POLICY_BOUNDS[k],v=Number(policy?.[k]);return [k,Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):base];
}));

// Stable, build-independent context key used by replay learning and live bot decisions.
export function tacticalContext({size,pitch,ball,player,opponents=[],attackDir=null}){
 const dir=attackDir??(player.team==='red'?1:-1),own=dir===1?pitch.left:pitch.right;
 const progress=(ball.x-own)*dir/(pitch.right-pitch.left),pressure=Math.min(999,...opponents.map(q=>Math.hypot(q.x-ball.x,q.y-ball.y)));
 return `${size}v${size}:${progress<.33?'def':progress>.67?'att':'mid'}:${pressure<90?'press':'free'}:${ball.y<pitch.top+65||ball.y>pitch.bottom-65?'wall':'open'}`;
}
