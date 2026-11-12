import {CHAT} from './chat-config.mjs';
export function mountChat(host,{send,active,resetControls,focusGame}){
 let connected=false,editing=false,hidden=false,lastHeartbeat=0;
 const messages=[],bubbles=new Map(),typing=new Map();
 try{hidden=localStorage.getItem('retrofooty-chat-hidden')==='1';}catch{}
 host.className='chat-widget';
 const header=document.createElement('div');header.className='chat-header';
 const title=document.createElement('button');title.type='button';title.textContent='Chat · Enter';title.setAttribute('aria-label','Write a chat message');title.onclick=()=>open();
 const toggle=document.createElement('button');toggle.type='button';toggle.id='chat-toggle';header.append(title,toggle);
 const log=document.createElement('div');log.id='chat-log';log.className='chat-log';log.setAttribute('role','log');log.setAttribute('aria-live','polite');log.setAttribute('aria-label','Player chat');
 const status=document.createElement('div');status.className='chat-typing-status';status.setAttribute('aria-live','polite');
 const form=document.createElement('form');form.id='chat-form';form.hidden=true;
 const input=document.createElement('input');input.id='chat-input';input.maxLength=CHAT.maxLength;input.placeholder='Message… Enter to send · Esc to cancel';input.autocomplete='off';input.setAttribute('aria-label','Chat message');
 const button=document.createElement('button');button.type='submit';button.textContent='Send';
 const error=document.createElement('div');error.className='chat-error';error.setAttribute('role','status');
 form.append(input,button);host.append(header,log,status,form,error);
 function visibility(){log.hidden=status.hidden=hidden;toggle.textContent=hidden?'Show chat':'Hide chat';toggle.setAttribute('aria-expanded',String(!hidden));host.setAttribute('data-collapsed',String(hidden));}
 function endTyping(){if(editing)send({type:'chat-typing',typing:false});editing=false;form.hidden=true;input.value='';error.textContent='';}
 function close(){endTyping();resetControls();focusGame();}
 function open(){if(!connected||!active())return;resetControls();editing=true;form.hidden=false;error.textContent='';lastHeartbeat=performance.now();send({type:'chat-typing',typing:true});input.focus();}
 function post(){if(!editing)return;const text=input.value.trim();if(!text){close();return;}send({type:'chat-send',text});close();}
 function renderLog(){log.replaceChildren();for(const m of messages){const row=document.createElement('div');const name=document.createElement('strong');name.textContent=m.name+': ';const text=document.createElement('span');text.textContent=m.text;row.append(name,text);log.append(row);}log.scrollTop=log.scrollHeight;}
 toggle.onclick=()=>{if(editing)close();hidden=!hidden;try{localStorage.setItem('retrofooty-chat-hidden',hidden?'1':'0');}catch{}visibility();focusGame();};
 form.onsubmit=e=>{e.preventDefault();post();};
 form.addEventListener('focusout',e=>{if(editing&&e.relatedTarget!==input&&e.relatedTarget!==button)endTyping();});
 window.addEventListener('keydown',e=>{
  if(editing){e.stopImmediatePropagation();if(e.isComposing||e.keyCode===229)return;if(e.code==='Escape'){e.preventDefault();close();}else if((e.code==='Enter'||e.code==='NumpadEnter')&&!e.repeat){e.preventDefault();post();}return;}
  if((e.code==='Enter'||e.code==='NumpadEnter')&&!e.repeat&&!e.isComposing&&connected&&active()&&!(e.target instanceof Element&&e.target.closest('input,select,textarea,button'))){e.preventDefault();e.stopImmediatePropagation();open();}
 },true);
 window.addEventListener('blur',endTyping);document.addEventListener('visibilitychange',()=>{if(document.hidden)endTyping();});
 visibility();
 return {
  get editing(){return editing;},
  setConnected(value){if(value===connected)return;connected=value;host.hidden=!value;if(!value){endTyping();messages.length=0;bubbles.clear();typing.clear();renderLog();status.textContent='';}},
  close,
  receive(m){const now=performance.now();
   if(m.type==='chat-history'){messages.length=0;messages.push(...m.messages.slice(-CHAT.historyLimit));typing.clear();for(const p of m.typing||[])typing.set(p.sender,{name:p.name,until:now+p.remaining});renderLog();return true;}
   if(m.type==='chat-line'){const line=m.message;if(!messages.some(x=>x.id===line.id)){messages.push(line);if(messages.length>CHAT.historyLimit)messages.shift();renderLog();}bubbles.set(line.sender,{text:line.text,until:now+CHAT.bubbleMs});typing.delete(line.sender);return true;}
   if(m.type==='chat-typing'){if(m.typing)typing.set(m.sender,{name:m.name,until:now+CHAT.typingMs});else typing.delete(m.sender);return true;}
   if(m.type==='chat-error'){error.textContent=m.message;return true;}return false;
  },
  visual(id,now=performance.now()){const bubble=bubbles.get(id),indicator=typing.get(id);return {text:bubble?.until>now?bubble.text:'',typing:indicator?.until>now};},
  tick(now){if(editing&&now-lastHeartbeat>=CHAT.typingHeartbeatMs){lastHeartbeat=now;send({type:'chat-typing',typing:true});}
   for(const [id,p] of typing)if(p.until<=now)typing.delete(id);for(const [id,p] of bubbles)if(p.until<=now)bubbles.delete(id);
   const names=[...typing.values()].map(p=>p.name);status.textContent=names.length?`${names.slice(0,3).join(', ')} ${names.length===1?'is':'are'} typing…`:'';
  }
 };
}
