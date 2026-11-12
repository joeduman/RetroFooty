import {SHOP_ITEMS,SHOP_CATEGORIES} from './shop-config.mjs';
export function mountShop(host,{buy,equip}){
 let wallet=null;
 function refresh(value){wallet=value||null;host.replaceChildren();
  const card=document.createElement('div');card.className='shop-card';
  const header=document.createElement('div');header.className='shop-header';
  const title=document.createElement('h2');title.textContent='Club shop';
  const balance=document.createElement('span');balance.className='gold-balance';balance.textContent=wallet?`${wallet.balance} Gold`:'Join a match to earn Gold';
  const close=document.createElement('button');close.textContent='Close';close.onclick=()=>host.hidden=true;header.append(title,balance,close);card.append(header);
  for(const category of SHOP_CATEGORIES){const heading=document.createElement('h3');heading.textContent=category;card.append(heading);const items=SHOP_ITEMS.filter(i=>i.category===category);
   if(!items.length){const p=document.createElement('p');p.className='shop-empty';p.textContent='Coming later';card.append(p);continue;}
   const grid=document.createElement('div');grid.className='shop-items';
   for(const item of items){const row=document.createElement('div');row.className='shop-item';if(item.image){const img=document.createElement('img');img.src=item.image;img.alt='';row.append(img);}
    const label=document.createElement('strong');label.textContent=item.name;const price=document.createElement('span');price.textContent=item.price?`${item.price} Gold`:'Free';
    const owned=wallet?.owned.includes(item.id),equipped=wallet?.equipped[item.kind]===item.value;
    const button=document.createElement('button');button.textContent=equipped?'Equipped':owned?'Equip':`Buy · ${item.price} Gold`;button.disabled=!wallet||equipped||(!owned&&wallet.balance<item.price);button.onclick=()=>owned?equip(item):buy(item.id);row.append(label,price,button);grid.append(row);
   }card.append(grid);
  }host.append(card);
 }
 refresh(null);return {refresh,open(){host.hidden=false;},owns(kind,id){return !wallet||wallet.owned.includes(`${kind}:${id}`);}};
}
