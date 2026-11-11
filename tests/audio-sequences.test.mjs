import test from 'node:test';
import assert from 'node:assert/strict';
import {GameAudio} from '../public/js/audio.mjs';
import {SOUNDS,RULES} from '../public/js/customize.mjs';

const rates=RULES.periodWhistlePlaybackRates;
const gaps=RULES.fulltimeWhistleGapsSeconds;
const halfStart=duration=>Math.round((duration/rates[0]+RULES.halftimeWhistleGapsSeconds[0])*1000);
const starts=duration=>[0,Math.round((duration/rates[0]+gaps[0])*1000),Math.round((duration/rates[0]+gaps[0]+duration/rates[1]+gaps[1])*1000)];

function fixture(){
  let now=0,next=0;const timers=new Map(),played=[];
  const audio=new GameAudio({schedule:(fn,delay)=>{const id=++next;timers.set(id,{fn,at:now+delay});return id;},cancel:id=>timers.delete(id)});
  audio.customSound=(type,volume,playbackRate=1)=>{played.push({type,volume,playbackRate,at:now});return true;};
  const advance=ms=>{
    const until=now+ms;
    for(;;){const due=[...timers].filter(([,value])=>value.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;
      timers.delete(due[0]);now=due[1].at;due[1].fn();}
    now=until;
  };
  return {audio,played,advance,timers};
}

test('halftime varies pitch and leaves the configured silence after the completed first whistle',()=>{
  const {audio,played,advance}=fixture();audio.voices=9;audio.last=performance.now();
  audio.play([{type:'halftime'}],.4);
  assert.deepEqual(played,[{type:'kickoff',volume:.4,playbackRate:rates[0],at:0}]);
  advance(halfStart(.911)-1);assert.equal(played.length,1);advance(1);advance(3000);
  assert.deepEqual(played.map(p=>p.at),[0,halfStart(.911)]);
  assert.deepEqual(played.map(p=>p.playbackRate),rates.slice(0,2));
  assert.ok(Math.abs((played[1].at-played[0].at)/1000-.911/rates[0]-RULES.halftimeWhistleGapsSeconds[0])<.001);
});

test('full time uses distinct pitches and configured silence gaps while preserving a goal cheer',()=>{
  const {audio,played,advance}=fixture();audio.voices=9;audio.last=performance.now();
  audio.play([{type:'kick'},{type:'goal'},{type:'end'}],.6);advance(4000);
  const whistles=played.filter(p=>p.type==='kickoff');
  assert.deepEqual(whistles.map(p=>p.at),starts(.911));
  assert.deepEqual(whistles.map(p=>p.playbackRate),rates);
  for(const [index,gap] of gaps.entries()){
    assert.ok(Math.abs((whistles[index+1].at-whistles[index].at)/1000-.911/rates[index]-gap)<.001);
  }
  assert.equal(played.filter(p=>p.type==='goal').length,1);assert.equal(played.filter(p=>p.type==='kick').length,0);
});

test('repeated terminal snapshots do not restart or duplicate a whistle sequence',()=>{
  const {audio,played,advance}=fixture();
  audio.play([{type:'halftime'}],.3);advance(400);audio.play([{type:'halftime'}],.3);advance(3000);
  audio.play([{type:'halftime'}],.3);assert.equal(played.length,2);
  audio.play([{type:'kickoff'}],.3);audio.play([{type:'end'}],.3);advance(4000);
  assert.equal(played.length,6,'the next period can end with its own three whistles');
});

test('new kickoff and context reset cancel queued terminal whistles',()=>{
  const {audio,played,advance,timers}=fixture();audio.play([{type:'end'}],.5);advance(500);
  audio.play([{type:'kickoff'}],.5);advance(2500);assert.equal(played.length,2);assert.equal(timers.size,0);
  audio.play([{type:'halftime'}],.5);audio.reset();advance(2000);assert.equal(played.length,3);
  audio.play([{type:'halftime'}],.5);advance(halfStart(.911));assert.equal(played.length,5,'reset also permits the same signal in another match');
});

test('queued whistles follow current volume and stop when muted',()=>{
  const {audio,played,advance}=fixture();audio.play([{type:'end'}],.5);audio.play([],.2);advance(halfStart(.911));
  assert.equal(played[1].volume,.2);audio.play([],0);advance(3000);assert.equal(played.length,2);
  audio.reset();audio.play([{type:'halftime'}],0);advance(2000);assert.equal(played.length,2);
});

test('period whistles reuse the kickoff asset, shift real audio pitch and tolerate rejected playback',async()=>{
  const previous=globalThis.Audio,played=[];
  globalThis.Audio=class{
    constructor(src){this.src=src;this.preservesPitch=this.mozPreservesPitch=this.webkitPreservesPitch=true;}
    play(){played.push({src:this.src,rate:this.playbackRate,preservesPitch:this.preservesPitch,moz:this.mozPreservesPitch,webkit:this.webkitPreservesPitch});return Promise.reject(Error('blocked'));}
    pause(){}
  };
  try{
    const {audio,advance}=fixture();delete audio.customSound;
    assert.doesNotThrow(()=>audio.play([{type:'end'}],.5));assert.doesNotThrow(()=>advance(4000));
    assert.deepEqual(played.map(sound=>sound.src),[SOUNDS.kickoff.src,SOUNDS.kickoff.src,SOUNDS.kickoff.src]);
    assert.deepEqual(played.map(sound=>sound.rate),rates);
    assert.ok(played.every(sound=>sound.preservesPitch===false&&sound.moz===false&&sound.webkit===false),'speed variation must actually shift pitch');
    audio.reset();await Promise.resolve();
  }finally{globalThis.Audio=previous;}
});

test('loaded custom clip duration and pitch changes preserve the requested silence gaps',()=>{
  const {audio,played,advance}=fixture();audio.customSounds.set('kickoff',{duration:2});
  audio.play([{type:'end'}],.5);advance(starts(2)[1]-1);assert.equal(played.length,1);
  advance(1);advance(3000);assert.deepEqual(played.map(sound=>sound.at),starts(2));
  assert.ok(Math.abs((played[2].at-played[1].at)/1000-2/rates[1]-gaps[1])<.001);
});

test('a normal kickoff restores the cached whistle playback rate after a period sequence',async()=>{
  const previous=globalThis.Audio,played=[];
  globalThis.Audio=class{
    constructor(){this.duration=.911;this.preservesPitch=true;}
    play(){played.push({rate:this.playbackRate,preservesPitch:this.preservesPitch});return Promise.resolve();}
    pause(){}
  };
  try{
    const {audio,advance}=fixture();delete audio.customSound;
    audio.play([{type:'halftime'}],.5);advance(halfStart(.911));audio.play([{type:'kickoff'}],.5);
    assert.deepEqual(played.map(sound=>sound.rate),[rates[0],rates[1],1]);
    assert.ok(played.every(sound=>sound.preservesPitch===false));
    await Promise.resolve();
  }finally{globalThis.Audio=previous;}
});
