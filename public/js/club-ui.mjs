// Shared presentation only. Prices, ownership and match rules remain server-owned.
export const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
const paths={
 player:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
 shirt:'<path d="m8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4a4 4 0 0 1-8 0Z"/>',
 effect:'<path d="m12 2 2.2 6.8L21 7l-4 5 4 5-6.8-1.8L12 22l-2.2-6.8L3 17l4-5-4-5 6.8 1.8Z"/>',
 settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
 coin:'<circle cx="12" cy="12" r="9"/><path d="M14 7h-4v10h4M10 12h3"/>',
 trophy:'<path d="M7 3h10v6a5 5 0 0 1-10 0V3ZM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 14v6m-4 1h8"/>',
 history:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
 music:'<path d="M9 18V5l11-2v13M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="17" cy="16" rx="3" ry="3"/>',
 ball:'<circle cx="12" cy="12" r="9"/><path d="m12 7 5 4-2 6H9l-2-6 5-4Zm0 0V3m5 8 4-2m-6 8 3 3m-9-3-3 3m1-9L3 9"/>',
 trail:'<path d="M3 6h10M2 12h6m-5 6h10m1-10 7 4-7 4V8Z"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>'
};
export function icon(name){const e=node('img',undefined,'club-icon');e.alt='';e.width=20;e.height=20;e.setAttribute('aria-hidden','true');e.src='data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#d5dfd9" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]||paths.ball}</svg>`);return e;}
export function preview(item){const stage=node('div',undefined,`item-stage item-stage-${item.kind} item-tone-${item.value}`);stage.setAttribute('aria-hidden','true');if(item.image){const img=node('img');img.src=item.image;img.alt='';img.width=100;img.height=100;stage.append(img);}else stage.append(node('span','',`goal-effect-preview effect-${item.value}`));return stage;}
export function balance(amount){const e=node('span',undefined,'gold-balance');e.append(icon('coin'),node('span',`${amount.toLocaleString()} Gold`));return e;}
export function closeButton(close){const b=node('button','Close','club-close');b.type='button';b.append(icon('close'));b.onclick=close;return b;}
export function dialog(host,card,label,close){card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-label',label);let previous;
 card.addEventListener('keydown',event=>{if(host.hidden)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}if(event.key==='Tab'){const controls=[...card.querySelectorAll('button,input,select,a[href],[tabindex="0"]')].filter(e=>!e.disabled&&e.getClientRects().length);if(!controls.length)return;const first=controls[0],last=controls.at(-1);if(event.shiftKey&&(document.activeElement===first||!card.contains(document.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||!card.contains(document.activeElement))){event.preventDefault();first.focus();}}});
 return {open(){previous=document.activeElement;host.hidden=false;card.querySelector('button')?.focus();},close(){host.hidden=true;previous?.focus?.();}};
}
