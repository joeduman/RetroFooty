import {SHIRT_OPTIONS} from './input.mjs';

// A small reusable selector for the login, park, and match menus.
// The callback saves the selection and broadcasts it to the multiplayer server.
export function mountShirtPicker(host,selected,onSelect){
  if(!host)return {refresh:()=>{}};
  const title=document.createElement('div');
  title.className='shirt-picker-title';
  title.innerHTML='<strong>Your shirt</strong><span>Choose what other players see</span>';
  const row=document.createElement('div');row.className='shirt-picker-choices';
  const buttons=new Map();
  for(const shirt of SHIRT_OPTIONS){
    const button=document.createElement('button');button.type='button';
    button.className='shirt-picker-option';
    button.setAttribute('aria-label',`Equip ${shirt.name} shirt`);
    const img=document.createElement('img');img.src=shirt.src;img.alt='';img.width=58;img.height=58;
    const name=document.createElement('span');name.textContent=shirt.name;
    button.append(img,name);row.append(button);buttons.set(shirt.id,button);
    button.addEventListener('click',()=>onSelect(shirt.id));
  }
  host.classList.add('shirt-picker');host.append(title,row);
  const refresh=id=>{
    for(const [shirtId,button] of buttons){
      const active=id===shirtId;
      button.setAttribute('aria-pressed',String(active));
      button.setAttribute('aria-label',`${active?'Equipped':'Equip'} ${SHIRT_OPTIONS.find(s=>s.id===shirtId).name} shirt`);
    }
  };
  refresh(selected);
  return {refresh};
}
