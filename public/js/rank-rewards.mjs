import {DIVISIONS} from './ranked-config.mjs';
const designs=['rookie','prospect','risingstar','allstar','superstar','worldclass','elite','legend'];
export const RANK_SHIRTS=Object.freeze(DIVISIONS.slice(1).map((rank,i)=>Object.freeze({
 id:'shirt:'+designs[i],value:designs[i],kind:'shirt',name:rank.name,category:'Ranked rewards',
 rank:rank.name,elo:rank.min,starter:i===0,reward:i!==0,image:'/images/shirts/shirt_'+designs[i]+'.png'
})));
export const earnedRankShirts=peak=>RANK_SHIRTS.filter(item=>item.reward&&Number.isFinite(peak)&&peak>=item.elo);
