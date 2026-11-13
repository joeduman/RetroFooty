import {SHOP_ITEMS,SHOP_CATEGORIES} from './shop-config.mjs';
import {node as el,icon,preview,balance,closeButton,dialog} from './club-ui.mjs';
export function mountShop(host,{buy,equip}){
 let wallet=null,canEquip=true,category='Shirts',modal,opener;
 const close=()=>{modal.close();opener?.focus?.();};
 function refresh(value){wallet=value||null;const focused=document.activeElement?.getAttribute?.('data-shop-item');host.replaceChildren();
  const card=el('div',undefined,'shop-card');
  const header=el('div',undefined,'shop-header'),heading=el('div');heading.append(el('p','RETROFOOTY','eyebrow'),el('h2','Club shop'));
  header.append(heading,wallet?balance(wallet.balance):el('span','Earn Gold by playing','shop-empty'),closeButton(close));card.append(header);
  const nav=el('div',undefined,'shop-tabs');nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Shop category');
  const collection=el('section',undefined,'shop-collection');collection.id='shop-collection';collection.setAttribute('role','tabpanel');
  const active=SHOP_CATEGORIES.filter(c=>SHOP_ITEMS.some(i=>i.category===c));
  for(const name of active){const button=el('button',undefined,'shop-tab');button.type='button';button.id='shop-tab-'+(name==='Shirts'?'shirts':'effects');button.append(icon(name==='Shirts'?'shirt':'effect'),el('span',name),el('small',String(SHOP_ITEMS.filter(i=>i.category===name).length)));button.setAttribute('role','tab');button.setAttribute('aria-controls',collection.id);button.onclick=()=>{category=name;select();};button.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const index=active.indexOf(category);category=active[e.key==='Home'?0:e.key==='End'?active.length-1:(index+(e.key==='ArrowRight'?1:active.length-1))%active.length];select();[...nav.children].find(b=>b.getAttribute('aria-selected')==='true')?.focus();}};nav.append(button);}
  card.append(nav,collection);
  function select(){for(let i=0;i<active.length;i++){const b=nav.children[i],selected=active[i]===category;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;if(selected)collection.setAttribute('aria-labelledby',b.id);}collection.replaceChildren();
   const grid=el('div',undefined,'shop-items');for(const item of SHOP_ITEMS.filter(i=>i.category===category)){
    const owned=wallet?.owned.includes(item.id),equipped=wallet?.equipped[item.kind]===item.value,row=el('article',undefined,'shop-item'+(equipped?' is-equipped':''));
    const visual=preview(item);if(owned)visual.append(el('span',equipped?'Equipped':'Owned','item-badge'));row.append(visual);
    const info=el('div',undefined,'item-info');info.append(el('small',item.kind==='shirt'?'MATCH KIT':'GOAL EXPLOSION','item-kicker'),el('strong',item.name));
    const button=el('button',equipped?'Equipped':owned?'Equip':item.price?`Buy · ${item.price} Gold`:'Get free','item-action');button.type='button';button.setAttribute('data-shop-item',item.id);button.setAttribute('aria-label',`${button.textContent}: ${item.name}`);button.disabled=!wallet||equipped||(owned&&!canEquip)||(!owned&&wallet.balance<item.price);button.onclick=()=>owned?canEquip&&equip(item):buy(item.id);
    info.append(button);if(owned&&!canEquip&&!equipped)info.append(el('span','Equip after full time','item-hint'));else if(!owned&&wallet&&wallet.balance<item.price)info.append(el('span',`${item.price-wallet.balance} more Gold needed`,'item-hint'));row.append(info);grid.append(row);
   }collection.append(grid);
  }select();
  const future=el('div',undefined,'shop-future');future.append(el('span','NEXT IN THE LOCKER','item-kicker'));for(const [name,symbol] of [['Goal music','music'],['Soccer balls','ball'],['Boost trails','trail']]){const slot=el('div',undefined,'future-slot');slot.append(icon(symbol),el('span',name),el('small','Coming later'));future.append(slot);}card.append(future);host.append(card);
  modal=dialog(host,card,'Club shop',close);if(focused&&!host.hidden)card.querySelector(`[data-shop-item="${focused}"]`)?.focus();
 }
 // Refreshed cards keep their own keyboard handling.
 refresh(null);return {refresh,setCanEquip(value){canEquip=value;refresh(wallet);},open(){opener=document.activeElement;modal.open();},owns(kind,id){return !wallet||wallet.owned.includes(`${kind}:${id}`);}};
}
