import {createPitch} from './config.mjs';
const $=s=>document.getElementById(s);let mode='login',account=null,tab='overview';
const fmt=n=>Number(n||0).toLocaleString(undefined,{maximumFractionDigits:1});
const percent=(a,b)=>b?`${(a/b*100).toFixed(1)}%`:'—';
async function api(route,body){const res=await fetch('/api/account/'+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,credentials:'same-origin'});const value=await res.json();if(!res.ok)throw Error(value.error||'Request failed');return value;}
function toggle(){mode=mode==='login'?'register':'login';$('name-row').hidden=mode!=='register';$('submit').textContent=mode==='register'?'Create account':'Sign in';$('toggle').textContent=mode==='register'?'I have an account':'Create account';$('auth-message').textContent='';$('password').autocomplete=mode==='register'?'new-password':'current-password';}
$('toggle').onclick=toggle;
$('auth-form').onsubmit=async e=>{e.preventDefault();$('submit').disabled=true;try{
 const data=await api(mode,{email:$('email').value,password:$('password').value,name:$('name').value});account=data.account;render();
 }catch(error){$('auth-message').textContent=error.message;}finally{$('submit').disabled=false;}};
$('logout').onclick=async()=>{await api('logout',{});account=null;render();};
const metric=(name,value)=>{const d=document.createElement('div');d.className='metric';const strong=document.createElement('strong'),span=document.createElement('span');strong.textContent=value;span.textContent=name;d.append(strong,span);return d;};
function overview(s){const table=document.createElement('table'),head=document.createElement('tr');for(const h of ['Mode','Games','Wins','Win rate','Goals']){const th=document.createElement('th');th.textContent=h;head.append(th);}table.append(head);
 for(const [k,v] of Object.entries(s.bySize||{}).sort((a,b)=>Number(a[0])-Number(b[0]))){const row=document.createElement('tr');for(const item of [`${k}v${k}`,v.games,v.wins,percent(v.wins,v.games),v.goals]){const td=document.createElement('td');td.textContent=item;row.append(td);}table.append(row);}if(!Object.keys(s.bySize||{}).length){const p=document.createElement('p');p.textContent='Finish a park match while signed in to begin collecting statistics.';$('mode-breakdown').replaceChildren(p);}else $('mode-breakdown').replaceChildren(table);
}
function pitchDraw(canvas,ctx,p){const W=canvas.width,H=canvas.height,pad=45,ww=W-2*pad,hh=H-2*pad;
 ctx.fillStyle='#153a28';ctx.fillRect(0,0,W,H);ctx.fillStyle='#24543a';ctx.fillRect(pad,pad,ww,hh);
 ctx.strokeStyle='#c8e6cc77';ctx.lineWidth=3;ctx.strokeRect(pad,pad,ww,hh);ctx.beginPath();ctx.moveTo(W/2,pad);ctx.lineTo(W/2,H-pad);ctx.stroke();ctx.beginPath();ctx.arc(W/2,H/2,H*.14,0,2*Math.PI);ctx.stroke();
 const gh=hh*p.goalWidth/(p.bottom-p.top);ctx.fillStyle='#dd6467';ctx.fillRect(pad-9,(H-gh)/2,9,gh);ctx.fillStyle='#6dbeee';ctx.fillRect(W-pad,(H-gh)/2,9,gh);
 return {x:x=>pad+(x-p.left)/(p.right-p.left)*ww,y:y=>pad+(y-p.top)/(p.bottom-p.top)*hh};}
function drawMap(){const c=$('stat-map'),ctx=c.getContext('2d'),s=account.stats||{},filter=$('field-filter').value;
 const p=createPitch(filter==='all'?3:Number(filter)),map=pitchDraw(c,ctx,p),list=(tab==='shots'?s.shotMap:tab==='passes'?s.passMap:[]).filter(x=>filter==='all'||String(x.size)===filter);
 $('map-heading').textContent=tab==='shots'?'Shot trajectories':tab==='passes'?'Completed passes':'Movement heatmap';
 if(tab==='heat'){
  const heat=s.heat||[];const peak=Math.max(.001,...heat);const ww=c.width-90,hh=c.height-90;
  heat.forEach((a,i)=>{if(!a)return;const value=a/peak;ctx.fillStyle=`rgba(255,${Math.round(220-100*value)},50,${.14+.69*Math.sqrt(value)})`;ctx.fillRect(45+(i%24)/24*ww,45+Math.floor(i/24)/14*hh,ww/24+.4,hh/14+.4);});
  $('map-help').textContent='Aggregate career movement heatmap. Matches all field sizes.';return;
 }
 for(const shot of list){const actualPitch=createPitch(shot.size||3),project=(pt)=>[45+(pt[0]-actualPitch.left)/(actualPitch.right-actualPitch.left)*(c.width-90),45+(pt[1]-actualPitch.top)/(actualPitch.bottom-actualPitch.top)*(c.height-90)];
  const points=tab==='shots'?(shot.path||[shot.from,shot.to]):[shot.from,shot.to];if(!points?.length)continue;
  ctx.beginPath();points.forEach((point,i)=>{const [x,y]=project(point);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.strokeStyle=tab==='shots'?(shot.goal?'#fff0a0':shot.onTarget?'#89d4ed':'#f6a7a0'):'#c7ecbe';ctx.lineWidth=tab==='shots'&&shot.goal?3.7:2;ctx.stroke();const [x,y]=project(points[0]);ctx.fillStyle=tab==='shots'?(shot.goal?'#ffee70':'#f7f7f1'):'#c7ecbe';ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();
 }
 $('map-help').textContent=tab==='shots'?`${list.length} recent attempts · Gold = goals, blue = on target, red = off target. Lines show recorded flight paths.`:`${list.length} recent completed passes · Lines indicate the origin and reception.`;
}
function render(){const logged=!!account;$('auth-panel').hidden=logged;$('profile').hidden=!logged;if(!logged)return;
 $('player-title').textContent=`${account.name}'s statistics`;const s=account.stats||{},d=$('summary');d.replaceChildren();for(const [label,value] of [
 ['Games',fmt(s.games)],['Win rate',percent(s.wins,s.games)],['Wins',fmt(s.wins)],['Goals',fmt(s.goals)],['Assists',fmt(s.assists)],['Own goals',fmt(s.ownGoals)],
 ['Shot accuracy',percent(s.onTarget,s.shots)],['Passes',fmt(s.passes)],['Pass attempts',fmt(s.passAttempts)],['Estimated pass %',percent(s.passes,Math.max(s.passes||0,s.passAttempts||0))],['Interceptions',fmt(s.interceptions)],['Touches',fmt(s.touches)],['Sprinting (s)',fmt(s.sprintSeconds)]])d.append(metric(label,value));
 $('overview-view').hidden=tab!=='overview';$('map-view').hidden=tab==='overview';document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));overview(s);if(tab!=='overview')drawMap();
}
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>{tab=b.dataset.tab;render();};
$('field-filter').onchange=()=>{if(tab!=='overview')drawMap();};
try{const a=await api('me');account=a.account;render();}catch(e){$('auth-message').textContent=e.message;}
try{const r=await fetch('/api/bots/status');const j=await r.json();$('training-status').textContent=`Bot memory v1 · ${fmt(j.humanGames)} human matches · ${fmt(j.humanSamples)} observed human decisions · ${fmt(j.selfPlayGames)} self-play evaluations · ${j.paused?'training paused for active players':'self-play enabled when idle'}`;}catch{$('training-status').textContent='Learning status unavailable';}
