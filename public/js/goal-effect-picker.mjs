import {GOAL_EFFECT_OPTIONS,normalizeGoalEffect} from './goal-effects.mjs';

// Shared by the main menu, park settings and private-room menu.
export function mountGoalEffectPicker(host,selected,onSelect){
  if(!host)return {refresh:()=>{}};
  const title=document.createElement('div');title.className='goal-effect-picker-title';
  title.innerHTML='<strong>Goal explosion</strong><span>Celebrate your goals</span>';
  const row=document.createElement('div');row.className='goal-effect-choices';
  const buttons=new Map();
  for(const effect of GOAL_EFFECT_OPTIONS){
    const button=document.createElement('button');button.type='button';button.className='goal-effect-option';
    button.setAttribute('data-goal-effect',effect.id);
    const preview=document.createElement('span');preview.className=`goal-effect-preview effect-${effect.id}`;preview.setAttribute('aria-hidden','true');
    const copy=document.createElement('span');copy.className='goal-effect-copy';
    const name=document.createElement('strong');name.textContent=effect.name;
    const description=document.createElement('small');description.textContent=effect.description;
    copy.append(name,description);button.append(preview,copy);row.append(button);buttons.set(effect.id,button);
    button.addEventListener('click',()=>onSelect(effect.id));
  }
  host.classList.add('goal-effect-picker');host.append(title,row);
  const refresh=value=>{
    const selectedId=normalizeGoalEffect(value);
    for(const effect of GOAL_EFFECT_OPTIONS){
      const active=selectedId===effect.id,button=buttons.get(effect.id);
      button.setAttribute('aria-pressed',String(active));
      button.setAttribute('aria-label',`${active?'Equipped':'Equip'} ${effect.name} goal effect`);
    }
  };
  refresh(selected);return {refresh};
}
