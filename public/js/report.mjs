import {createPitch} from './config.mjs';
export function renderReport(container,canvas,select,report,preferredId){
  const table=document.createElement('table'),caption=document.createElement('caption');caption.textContent='Match report';table.append(caption);
  const head=document.createElement('thead'),tr=document.createElement('tr');
  for(const title of ['Player','Goals','Assists','Shots*','On target*','Shot %','Passes','Pass %*','Touches','Ball wins']){
    const th=document.createElement('th');th.scope='col';th.textContent=title;tr.append(th);
  }
  head.append(tr);table.append(head);const body=document.createElement('tbody');
  for(const row of report.players){
    const tr=document.createElement('tr');tr.className=row.human?'human-row':'';
    const values=[row.name+(row.human?' · YOU':''),row.goals+(row.ownGoals?` (+${row.ownGoals} OG)`:''),row.assists,row.shots,row.onTarget,row.shots?Math.round(100*row.onTarget/row.shots)+'%':'—',row.passes,(row.passes||row.passAttempts)?Math.round(100*row.passes/Math.max(row.passes,row.passAttempts))+'%':'—',row.touches,row.interceptions];
    values.forEach((value,i)=>{const td=document.createElement(i?'td':'th');if(!i){td.scope='row';td.className=row.team;}td.textContent=String(value);tr.append(td);});body.append(tr);
  }
  table.append(body);container.replaceChildren(table);
  const panel=document.createElement('section');panel.className='shotmap-panel';
  const title=document.createElement('strong');title.textContent='Shots taken · origin and ball path';
  const note=document.createElement('p');note.className='fine';note.textContent='Shot markers show where each attempt started. Gold paths finish where scoring shots entered the net; other paths show their recorded travel.';
  const plot=document.createElement('canvas');plot.width=720;plot.height=440;panel.append(title,note,plot);container.append(panel);
  drawShotMap(plot,report);select.replaceChildren();
  for(const row of report.players){const option=document.createElement('option');option.value=row.id;option.textContent=row.name+(row.human?' · YOU':'');select.append(option);}
  select.value=String(preferredId??report.players[0]?.id);
  select.onchange=()=>drawHeatmap(canvas,report,Number(select.value));select.onchange();
}
export function drawHeatmap(canvas,report,id){
  const row=report.players.find(p=>p.id===id);if(!row)return;
  canvas.height=Math.round((canvas.width-36)*report.pitch.height/report.pitch.width+53);
  const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,pad=18,bottom=35,W=w-36,H=h-pad-bottom;
  c.fillStyle='#0b1911';c.fillRect(0,0,w,h);c.fillStyle='#183b28';c.fillRect(pad,pad,W,H);
  const peak=Math.max(.001,...row.heat),cellW=W/report.cols,cellH=H/report.rows;
  row.heat.forEach((time,i)=>{if(!time)return;const amount=time/peak;c.fillStyle=`rgba(255,${Math.round(211-100*amount)},71,${.12+.76*Math.sqrt(amount)})`;c.fillRect(pad+i%report.cols*cellW,pad+Math.floor(i/report.cols)*cellH,cellW+.3,cellH+.3);});
  c.strokeStyle='#d7ebd274';c.lineWidth=2;c.strokeRect(pad,pad,W,H);c.beginPath();c.moveTo(w/2,pad);c.lineTo(w/2,pad+H);c.stroke();
  c.beginPath();c.arc(w/2,pad+H/2,H*.16,0,Math.PI*2);c.stroke();
  const gh=H*report.pitch.goalWidth/report.pitch.height;
  c.fillStyle='#ff7f87';c.fillRect(pad-5,pad+(H-gh)/2,5,gh);c.fillStyle='#8bbcff';c.fillRect(pad+W,pad+(H-gh)/2,5,gh);
  const description=`${(row.distance/report.pitch.width).toFixed(1)} pitch lengths run · ${row.sprintSeconds.toFixed(1)}s sprinting`;
  c.fillStyle='#c5d7ca';c.font='22px system-ui';c.textAlign='left';c.textBaseline='middle';c.fillText(description,pad,h-16);
  canvas.setAttribute('aria-label',`${row.name} movement heatmap. ${description}`);
}

export function drawShotMap(canvas,report){
 const ctx=canvas.getContext('2d'),p=createPitch(report.size||3),w=canvas.width,h=canvas.height,pad=27;
 const W=w-pad*2,H=h-pad*2;
 ctx.fillStyle='#102d20';ctx.fillRect(0,0,w,h);ctx.fillStyle='#1c5639';ctx.fillRect(pad,pad,W,H);
 ctx.strokeStyle='#d6e5d990';ctx.lineWidth=2;ctx.strokeRect(pad,pad,W,H);ctx.beginPath();ctx.moveTo(w/2,pad);ctx.lineTo(w/2,h-pad);ctx.stroke();
 const gh=H*p.goalWidth/(p.bottom-p.top);ctx.fillStyle='#de6e72';ctx.fillRect(pad-6,(h-gh)/2,6,gh);ctx.fillStyle='#72aeec';ctx.fillRect(w-pad,(h-gh)/2,6,gh);
 const coord=point=>[pad+(point[0]-p.left)/(p.right-p.left)*W,pad+(point[1]-p.top)/(p.bottom-p.top)*H];
 for(const row of report.players)for(const shot of row.shotMap||[]){const points=shot.path?.length?shot.path:[shot.from,shot.to];
  ctx.beginPath();points.forEach((point,i)=>{const [x,y]=coord(point);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});
  ctx.lineWidth=shot.goal?3.2:1.3;ctx.strokeStyle=shot.goal?'#ffe67a':row.team==='red'?'#ff8892':'#8bcaff';ctx.stroke();
  if(shot.goal){const end=points.at(-1);if(end){const [x,y]=coord(end);ctx.fillStyle='#ffe67a';ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();}}
  if(shot.from){const [x,y]=coord(shot.from);ctx.fillStyle=row.team==='red'?'#ff757c':'#7fb8ff';ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();}
 }
 canvas.setAttribute('aria-label',`Shot map: ${report.players.reduce((a,p)=>a+(p.shotMap?.length||0),0)} recorded trajectories. Red team markers are coral, blue team markers are blue.`);
}
