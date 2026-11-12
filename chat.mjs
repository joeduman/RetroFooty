import {randomUUID} from 'node:crypto';
import {CHAT} from './public/js/chat-config.mjs';
export function cleanChatText(value){return typeof value==='string'?Array.from(value.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/gu,' ').trim()).slice(0,CHAT.maxLength).join(''):'';}
// One transient channel per park or private room. Identity comes from the
// connected session, never from a name or player ID in a client's payload.
export class ChatChannel{
 constructor(emit,{now=()=>Date.now()}={}){this.emit=emit;this.now=now;this.members=new Map();this.history=[];}
 join(id,name){if(!this.members.has(id))this.members.set(id,{name,typingUntil:0,lastTyping:-Infinity,sent:[]});}
 leave(id){const p=this.members.get(id);if(!p)return;if(p.typingUntil)this.emit({type:'chat-typing',sender:id,name:p.name,typing:false});this.members.delete(id);}
 snapshot(){const now=this.now();return {type:'chat-history',messages:this.history,typing:[...this.members].filter(([,p])=>p.typingUntil>now).map(([sender,p])=>({sender,name:p.name,remaining:p.typingUntil-now}))};}
 handle(id,message){const p=this.members.get(id);if(!p)return null;const now=this.now();
  if(message.type==='chat-typing'){
   if(typeof message.typing!=='boolean')return null;
   if(message.typing&&p.typingUntil>now&&now-p.lastTyping<1000)return null;
   if(!message.typing&&!p.typingUntil)return null;
   p.lastTyping=now;p.typingUntil=message.typing?now+CHAT.typingMs:0;
   this.emit({type:'chat-typing',sender:id,name:p.name,typing:message.typing});return null;
  }
  if(message.type!=='chat-send')return null;
  const text=cleanChatText(message.text);if(!text)return 'Enter a message';
  p.sent=p.sent.filter(at=>now-at<CHAT.messageWindowMs);if(p.sent.length>=CHAT.messagesPerWindow)return 'Please wait a moment before sending more messages';
  p.sent.push(now);p.typingUntil=0;
  const line={id:randomUUID(),sender:id,name:p.name,text,at:now};this.history.push(line);if(this.history.length>CHAT.historyLimit)this.history.shift();
  this.emit({type:'chat-line',message:line});return null;
 }
}
