export function chatLines(text,measure,maxWidth=180,maxLines=3){
 const lines=[];let line='';
 for(const char of Array.from(text)){if(line&&measure(line+char)>maxWidth){lines.push(line.trim());line='';if(lines.length===maxLines){lines[maxLines-1]=lines[maxLines-1].slice(0,-1)+'…';return lines;}}line+=char;}
 if(line)lines.push(line.trim());return lines;
}
export function drawChatBubbles(renderer,players,now=performance.now()){
 if(!renderer.chat||renderer.scale<.28)return;
 const c=renderer.ctx,factor=1/Math.max(.5,renderer.scale||1);
 for(const p of players){if(!p.chatId)continue;const visual=renderer.chat.visual(p.chatId,now);if(!visual.text&&!visual.typing)continue;
  c.save();c.translate(p.x,p.y-p.radius-34);c.scale(factor,factor);c.font='11px Arial, sans-serif';c.textAlign='center';c.textBaseline='middle';
  const lines=visual.text?chatLines(visual.text,s=>c.measureText(s).width):[];
  const width=lines.length?Math.max(32,...lines.map(s=>c.measureText(s).width))+16:34,height=lines.length*14+12;
  if(lines.length){c.fillStyle='#18221ce8';c.strokeStyle='#c6ccb080';c.lineWidth=1;c.beginPath();c.roundRect(-width/2,-height,width,height,4);c.fill();c.stroke();
   c.beginPath();c.moveTo(-4,0);c.lineTo(0,5);c.lineTo(4,0);c.fill();c.fillStyle='#f5f2de';lines.forEach((line,i)=>c.fillText(line,0,-height+13+i*14));}
  if(visual.typing){const y=lines.length?-height-12:-10;c.fillStyle='#202d24ed';c.beginPath();c.roundRect(-17,y-9,34,18,7);c.fill();for(let i=0;i<3;i++){c.fillStyle=i===Math.floor(now/350)%3?'#f2db92':'#aebba7';c.beginPath();c.arc((i-1)*7,y,2,0,Math.PI*2);c.fill();}}
  c.restore();
 }
}
