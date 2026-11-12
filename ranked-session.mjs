import {overtimeThreshold} from './public/js/ranked-config.mjs';
export function sessionRoster(session,slotKey='slot'){
 return session.game.players.map(p=>{const c=session.members.find(c=>c[slotKey]===p.id);return c?{name:c.name,team:p.team,slot:p.id,token:c.reconnectToken}:{name:`Bot ${p.team==='red'?'R':'B'}${p.number}`,team:p.team,slot:p.id,bot:true,botId:`${session.botPrefix||'room-'+session.size}:${p.id}`};});
}
export function voteState(session){const yes=session.members.filter(c=>c.vote===true&&!c.disconnected).length;return {yes,required:Number.isFinite(overtimeThreshold(session.size))?overtimeThreshold(session.size):null,deadline:session.voteDeadline??null,approved:yes>=overtimeThreshold(session.size)};}
export function startRanked(session,store,slotKey='slot'){
 const m=store.begin(session.matchId,sessionRoster(session,slotKey),session.game.duration);
 session.game.goldenGoal=voteState(session).approved;
 session.rankedStarted=true;session.voteDeadline=null;if('phase' in session)session.phase='match';return m;
}
export function openVote(session,store){session.voteDeadline=store.now()+store.config.voteWindowMs;}
export function syncRanked(session,store,slotKey='slot'){if(session.rankedStarted)for(const p of sessionRoster(session,slotKey))store.replaceSlot(session.matchId,p);}

export function rankedDetails(session,store){
 if(session.mode!=='ranked')return {mode:'casual'};
 const match=store.db.matches[session.matchId];
 const members=match&&!match.void?match.players.map(p=>({...store.summaryRecord(store.record(p)),team:p.team,bot:p.bot,disconnected:p.disconnected,abandoned:p.abandoned,deadline:p.deadline})):session.members.map(c=>({...store.summary(c.name),team:c.team}));
 return {mode:'ranked',vote:voteState(session),result:store.result(session.matchId),members,
  averages:Object.fromEntries(['red','blue'].map(team=>{const ps=members.filter(p=>p.team===team);return [team,ps.length?Math.round(ps.reduce((sum,p)=>sum+p.elo,0)/ps.length):null];}))};
}
