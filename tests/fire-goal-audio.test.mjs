import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GameAudio} from '../public/js/audio.mjs';
import {SOUNDS} from '../public/js/customize.mjs';

async function withAudio(run,{reject=false,throwFire=false}={}){
  const previous=globalThis.Audio,played=[],instances=[];
  globalThis.Audio=class {
    constructor(src){this.src=src;this.pauses=0;instances.push(this);}
    play(){
      played.push({src:this.src,volume:this.volume,rate:this.playbackRate});
      if(throwFire&&this.src===SOUNDS.fireGoal.src)throw Error('Device unavailable');
      return reject?Promise.reject(Error('Autoplay blocked')):Promise.resolve();
    }
    pause(){this.pauses++;}
  };
  try{await run({played,instances});await Promise.resolve();}
  finally{if(previous===undefined)delete globalThis.Audio;else globalThis.Audio=previous;}
}

test('a fiery goal adds a volume-scaled explosion alongside the goal cheer despite impact limits',async()=>{
  await withAudio(({played})=>{
    const audio=new GameAudio();audio.voices=9;audio.last=performance.now();
    audio.play([{type:'touch'},{type:'goal',goalEffectId:'fire'}],.4);
    assert.deepEqual(played,[
      {src:SOUNDS.goal.src,volume:.4*(SOUNDS.goal.gain??1),rate:1},
      {src:SOUNDS.fireGoal.src,volume:.4*SOUNDS.fireGoal.gain,rate:1}
    ]);
  });
});

test('classic, unknown and older goal events keep the existing cheer; muted goals play neither sound',async()=>{
  await withAudio(({played})=>{
    const audio=new GameAudio();
    for(const goalEffectId of ['classic','unknown',undefined])audio.play([{type:'goal',goalEffectId}],.3);
    assert.equal(played.length,3);assert.ok(played.every(sound=>sound.src===SOUNDS.goal.src));
    for(const volume of [0,-1,NaN])audio.play([{type:'goal',goalEffectId:'fire'}],volume);
    assert.equal(played.length,3,'the explosion must respect the same mute rule as goal audio');
  });
});

test('a field reset stops the added explosion as well as the cheer',async()=>{
  await withAudio(({instances})=>{
    const audio=new GameAudio();audio.play([{type:'goal',goalEffectId:'fire'}],.5);
    assert.equal(instances.length,2);
    for(const sound of instances)sound.currentTime=.2;
    audio.reset();
    assert.ok(instances.every(sound=>sound.pauses===1&&sound.currentTime===0));
  });
});

test('blocked or failing explosion playback never prevents the normal cheer or later goals',async()=>{
  await withAudio(({played})=>{
    const audio=new GameAudio();assert.doesNotThrow(()=>audio.play([{type:'goal',goalEffectId:'fire'}],.5));
    assert.deepEqual(played.map(sound=>sound.src),[SOUNDS.goal.src,SOUNDS.fireGoal.src]);
  },{reject:true});
  await withAudio(({played})=>{
    const audio=new GameAudio();assert.doesNotThrow(()=>audio.play([{type:'goal',goalEffectId:'fire'}],.5));
    assert.equal(played[0].src,SOUNDS.goal.src,'the cheer starts even if the additional effect fails');
    assert.doesNotThrow(()=>audio.play([{type:'goal',goalEffectId:'classic'}],.5));
    assert.equal(played.at(-1).src,SOUNDS.goal.src);
  },{throwFire:true});
});

test('the configured fire explosion asset is present and has valid audio data',async()=>{
  const bytes=await readFile(new URL('../public'+SOUNDS.fireGoal.src,import.meta.url));
  if(!SOUNDS.fireGoal.src.endsWith('.wav')){
    assert.ok(bytes.length>1000);
    assert.ok(bytes.toString('ascii',0,3)==='ID3'||bytes.some((value,index)=>value===255&&(bytes[index+1]&224)===224),'MP3 must contain an ID3 tag or MPEG audio frames');
    return;
  }
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');
  let format,data;
  for(let offset=12;offset+8<=bytes.length;){
    const name=bytes.toString('ascii',offset,offset+4),length=bytes.readUInt32LE(offset+4),start=offset+8;
    assert.ok(start+length<=bytes.length,'WAV chunks must be complete');
    if(name==='fmt ')format={encoding:bytes.readUInt16LE(start),channels:bytes.readUInt16LE(start+2),rate:bytes.readUInt32LE(start+4),bits:bytes.readUInt16LE(start+14)};
    if(name==='data')data=bytes.subarray(start,start+length);
    offset=start+length+(length%2);
  }
  assert.ok(format&&data);assert.equal(format.encoding,1);assert.equal(format.bits,16);
  assert.ok([1,2].includes(format.channels));assert.ok(format.rate>=22050);
  const duration=data.length/(format.rate*format.channels*2);assert.ok(duration>.15&&duration<1,'the goal sound should be a short accent');
  let peak=0,energy=0;
  for(let offset=0;offset<data.length;offset+=2){const value=data.readInt16LE(offset);peak=Math.max(peak,Math.abs(value));energy+=value*value;}
  assert.ok(peak>2000&&peak<32767,'the effect should be audible and unclipped');
  assert.ok(Math.sqrt(energy/(data.length/2))>500,'the asset must contain meaningful sound');
  assert.ok(Math.abs(data.readInt16LE(0))<100&&Math.abs(data.readInt16LE(data.length-2))<100,'the clip should begin and end quietly to avoid clicks');
});
