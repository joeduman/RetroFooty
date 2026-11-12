import {canonicalName,division} from './ranked-config.mjs';
export function renderLeaderboard(host,players,title='Online players'){
 if(!host)return;
 const heading=document.createElement('summary');heading.textContent=`${title} (${players.length})`;
 const table=document.createElement('table'),head=document.createElement('tr');
 for(const label of ['#','Username','Elo / rank','W / L / D']){const cell=document.createElement('th');cell.textContent=label;head.append(cell);}table.append(head);
 players.forEach((p,i)=>{const row=document.createElement('tr');for(const [index,value] of [i+1,p.name,`${p.elo} · ${p.rank.name}`,`${p.wins} / ${p.losses} / ${p.draws}`].entries()){const cell=document.createElement('td');cell.textContent=String(value);if(index===2)cell.setAttribute('style',`color:${p.rank.color}`);row.append(cell);}table.append(row);});
 host.replaceChildren(heading,table);
}
export function renderRanked(host,details,name){
 if(!host)return;host.hidden=details?.mode!=='ranked';if(host.hidden)return;
 const lines=['Ranked'];
 if(details.averages)lines.push(`Team Elo · Red ${details.averages.red??'—'} / Blue ${details.averages.blue??'—'}`);
 if(details.vote?.deadline)lines.push(`Overtime vote: ${details.vote.yes}/${details.vote.required} required · ${Math.max(0,Math.ceil((details.vote.deadline-Date.now())/1000))}s`);
 for(const p of details.members||[])lines.push(`${p.name}${p.bot?' (AI)':''} · ${p.elo} · ${p.rank.name}${p.disconnected?' · Disconnected (reconnect shield)':''}`);
 const me=details.members?.find(p=>p.key===canonicalName(name));
 if(me)lines.push(me.rank.next?`${me.elo} / ${me.rank.next} Elo toward next rank (${Math.round(me.rank.progress*100)}%)`:'Legend · Highest division');
 const result=details.result?.players.find(p=>p.key===canonicalName(name));
 if(result?.settled){const rank=division(result.after);lines.push(`Elo ${result.before} → ${result.after} (${result.delta>=0?'+':''}${result.delta})${result.abandoned?' · Abandoned':''}`);
  if(result.rankBefore!==result.rankAfter)lines.push(`${result.after>result.before?'Rank up':'Rank down'}: ${result.rankAfter}`);
  lines.push(rank.next?`${result.after} / ${rank.next} Elo toward next rank (${Math.round(rank.progress*100)}%)`:'Legend · Highest division');
 }else if(result&&details.result.players.some(p=>p.disconnected))lines.push('Result pending reconnect deadline');
 host.textContent=lines.join('\n');
}
