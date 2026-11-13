// Ranked keeps its fixed roster separately from active physics bodies. Removing
// a disconnected body also removes collisions, AI, touches and heatmap samples.
export function prepareRanked(session){
 session.slots=new Map(session.game.players.map(p=>[p.id,p]));
 if(session.mode==='ranked'){session.game.ai.update=()=>{};setActive(session,[]);}
}
function setActive(session,players){session.game.players=players;session.game.engine.players=players;session.game.tracker.players=players;}
export function restoreRankedPlayer(session,id){const p=session.slots.get(id);if(!p)return null;if(!session.game.players.some(x=>x.id===id)){setActive(session,[...session.game.players,p].sort((a,b)=>a.id-b.id));session.game.tracker.positions.set(id,{x:p.x,y:p.y});}return p;}
export function removeRankedPlayer(session,id){const p=session.slots.get(id);if(p){p.vx=p.vy=0;p.sprinting=false;p.input={x:0,y:0,aimX:p.faceX||1,aimY:0,sprint:false,shoot:false};}setActive(session,session.game.players.filter(p=>p.id!==id));}
export const activeMatch=session=>Boolean(session&&session.game.state!=='ended'&&('running' in session?session.running||session.voteDeadline:session.mode==='ranked'?session.rankedStarted||session.voteDeadline:session.members.length));
