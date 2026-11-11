import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GameAudio} from '../public/js/audio.mjs';
import {SOUNDS} from '../public/js/customize.mjs';

test('only the conceding team hears scored_on, with effect sounds and volume preserved',async()=>{
 const previous=globalThis.Audio,played=[],instances=[];
 globalThis.Audio=class{
  constructor(src){this.src=src;instances.push(this);}
  play(){played.push({src:this.src,volume:this.volume});return Promise.resolve();}
  pause(){this.paused=true;}
 };
 try{
  const audio=new GameAudio();audio.voices=9;audio.last=performance.now();
  for(const team of ['red','blue']){
   const other=team==='red'?'blue':'red';played.length=0;
   audio.play([{type:'goal',team:other,goalEffectId:'classic'}],.4,{team});
   assert.deepEqual(played,[{src:'/audio/scored_on.mp3',volume:.4}]);
   played.length=0;audio.play([{type:'goal',team,goalEffectId:'classic'}],.4,{team});
   assert.deepEqual(played,[{src:SOUNDS.goal.src,volume:.4}]);
   played.length=0;audio.play([{type:'goal',team:other,goalEffectId:'black-hole'}],.2,{team});
   assert.deepEqual(played.map(sound=>sound.src),[SOUNDS.scoredOn.src,SOUNDS.blackHoleGoal.src]);
   assert.equal(played[1].volume,Math.min(1,.2*SOUNDS.blackHoleGoal.gain));
  }
  played.length=0;audio.play([{type:'goal',team:'red'}],.4);
  assert.equal(played[0].src,SOUNDS.goal.src,'neutral spectators keep the ordinary goal sound');
  played.length=0;audio.play([{type:'goal',team:'red'}],0,{team:'blue'});assert.equal(played.length,0);
  audio.reset();assert.ok(instances.every(sound=>sound.paused&&sound.currentTime===0));
  await Promise.resolve();
 }finally{if(previous===undefined)delete globalThis.Audio;else globalThis.Audio=previous;}
 assert.ok((await readFile(new URL('../public/audio/scored_on.mp3',import.meta.url))).length>1000);
});
