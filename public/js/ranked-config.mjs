export const RANKED = Object.freeze({initialElo:1000,drawBonus:2,k:[0,32,30,28,26,24],voteWindowMs:10000,drawWindowMs:86400000,maxRewardedDraws:3});
export const DIVISIONS = [
 [0,'Newbie','#a6adb4'],[1000,'Rookie','#97cb93'],[1500,'Prospect','#65c3bb'],
 [2000,'Rising Star','#71b9ee'],[2500,'All-Star','#a59aff'],[3000,'Superstar','#db8ee8'],
 [3500,'World Class','#f1a66d'],[4000,'Elite','#edce72'],[4500,'Legend','#ffd545']
].map(([min,name,color])=>({min,name,color}));
export const canonicalName = name => String(name).trim().toLowerCase();
export function division(elo){const index=DIVISIONS.findLastIndex(d=>elo>=d.min),rank=DIVISIONS[Math.max(0,index)],next=DIVISIONS[index+1];return {...rank,next:next?.min??null,progress:next?(elo-rank.min)/(next.min-rank.min):1};}
export const overtimeThreshold = size => size===4?6:size===5?8:Infinity;
