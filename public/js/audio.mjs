import {SOUNDS,RULES} from './customize.mjs';
const soundRate=value=>Number.isFinite(value)&&value>0?Math.max(.5,Math.min(2,value)):1;
// Synthesized impacts with a custom MP3 goal sound.
export class GameAudio {
  constructor({schedule=globalThis.setTimeout.bind(globalThis),cancel=globalThis.clearTimeout.bind(globalThis)}={}) {
    this.context = null;
    this.last = -1000;
    this.voices = 0;
    this.noise = null;

    this.customSounds = new Map(); // Lazily created: safe before browser audio is unlocked.
    this.whistleTimers=new Set();this.periodSignal=null;this.volume=0;
    this.schedule=schedule;this.cancel=cancel;
  }
  cancelWhistles(){
    for(const timer of this.whistleTimers)this.cancel(timer);
    this.whistleTimers.clear();
  }
  // Clear delayed whistles when leaving a field or starting another match.
  reset(){
    this.cancelWhistles();this.periodSignal=null;
    for(const sound of this.customSounds.values())try{sound.pause?.();sound.currentTime=0;}catch{}
  }
  whistleSequence(type){
    if(this.periodSignal===type)return;
    this.cancelWhistles();this.periodSignal=type;
    const count=type==='end'?3:2;
    const rates=Array.from({length:count},(_,n)=>soundRate(RULES.periodWhistlePlaybackRates?.[n]));
    const gaps=type==='end'?RULES.fulltimeWhistleGapsSeconds:RULES.halftimeWhistleGapsSeconds;
    const blow=n=>{
      if(this.volume<=0)return;
      try{this.customSound('kickoff',this.volume,rates[n]);this.last=performance.now();}catch{}
    };
    blow(0);
    // Measure silence from the end of each complete, pitch-shifted clip.
    // Metadata may not be loaded on the first play.
    const loaded=this.customSounds.get('kickoff')?.duration,configured=SOUNDS.kickoff?.durationSeconds;
    const duration=Number.isFinite(loaded)&&loaded>0?loaded:Number.isFinite(configured)&&configured>0?configured:.911;
    let elapsed=0;
    for(let n=1;n<count;n++){
      const configuredGap=gaps?.[n-1],gap=Number.isFinite(configuredGap)&&configuredGap>=0?configuredGap:n===2?.75:.5;
      elapsed+=duration/rates[n-1]+gap;
      const timer=this.schedule(()=>{this.whistleTimers.delete(timer);blow(n);},Math.round(elapsed*1000));
      this.whistleTimers.add(timer);
    }
  }

  // Your uploaded goal MP3 is the default. Add other sound paths in customize.mjs.
  // Playback failure never blocks a game. Refresh after changing a sound file.
  customSound(type,volume,playbackRate=1){
    const settings=SOUNDS[type];if(!settings?.src)return false;
    if(typeof Audio==='undefined')return true;
    let sound=this.customSounds.get(type);
    if(!sound){sound=new Audio(settings.src);sound.preload='auto';this.customSounds.set(type,sound);}
    sound.playbackRate=soundRate(playbackRate);
    if(type==='kickoff'){
      // Browsers normally preserve pitch when changing speed. Turn that off
      // for whistles so the small rate differences also change their pitch.
      sound.preservesPitch=false;
      if('mozPreservesPitch' in sound)sound.mozPreservesPitch=false;
      if('webkitPreservesPitch' in sound)sound.webkitPreservesPitch=false;
    }
    sound.volume=Math.max(0,Math.min(1,volume*(settings.gain??1)));sound.currentTime=0;
    sound.play().catch(()=>{});return true;
  }
  goalCheer(volume){this.customSound('goal',volume);}
  play(events, volume) {
    this.volume=Number.isFinite(volume)?Math.max(0,Math.min(1,volume)):0;
    if(!Array.isArray(events))return;
    // Period whistles are independent of impact throttling and goal cheering.
    // Network clients may see the same terminal batch more than once.
    if(events.some(e=>['kickoff','second-half','overtime'].includes(e.type))){
      this.cancelWhistles();this.periodSignal=null;
    }
    const period=events.some(e=>e.type==='end')?'end':events.some(e=>e.type==='halftime')?'halftime':null;
    if(this.volume<=0){this.cancelWhistles();if(period)this.periodSignal=period;return;}
    volume=this.volume;
    if(period)this.whistleSequence(period);

    const event =
      events.find(e => e.type === 'goal') ||
      events.find(e => e.type === 'kickoff') ||
      (!period&&events.find(e => ['kick', 'post', 'touch'].includes(e.type)||SOUNDS[e.type]?.src));

    if (!event) return;

    // Goals bypass the impact sound cooldown and voice limit.
    if (
      !['goal','kickoff'].includes(event.type) &&
      (this.voices >= 3 || performance.now() - this.last < 65)
    ) {
      return;
    }

    try {
      if (event.type === 'goal') {
        this.goalCheer(volume);
        if(event.goalEffectId==='fire')this.customSound('fireGoal',volume);
        this.last = performance.now();
        return;
      }

      if(this.customSound(event.type,volume)){this.last=performance.now();return;}
      this.context ??= new AudioContext();
      const c = this.context;

      if (c.state === 'suspended') {
        c.resume().catch(() => {});
      }

      const t = c.currentTime;
      const duration = 0.15;
      const strength = Math.max(
        0.3,
        Math.min(1, event.strength ?? 1)
      );

      // Low, percussive impact tone.
      const oscillator = c.createOscillator();
      const impactGain = c.createGain();

      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(145, t);
      oscillator.frequency.exponentialRampToValueAtTime(
        48,
        t + duration
      );

      impactGain.gain.setValueAtTime(0.0001, t);
      impactGain.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, volume * 0.19 * strength),
        t + 0.004
      );
      impactGain.gain.exponentialRampToValueAtTime(
        0.0001,
        t + duration
      );

      oscillator.connect(impactGain);
      impactGain.connect(c.destination);

      this.voices++;

      oscillator.onended = () => {
        this.voices--;
        oscillator.disconnect();
        impactGain.disconnect();
      };

      oscillator.start(t);
      oscillator.stop(t + duration);

      // Short noise layer adds texture to the impact.
      if (!this.noise) {
        this.noise = c.createBuffer(
          1,
          Math.ceil(c.sampleRate * 0.07),
          c.sampleRate
        );

        const data = this.noise.getChannelData(0);

        for (let i = 0; i < data.length; i++) {
          data[i] = Math.random() * 2 - 1;
        }
      }

      const source = c.createBufferSource();
      const filter = c.createBiquadFilter();
      const noiseGain = c.createGain();

      source.buffer = this.noise;
      filter.type = 'lowpass';
      filter.frequency.value = event.type === 'post' ? 2600 : 1500;

      noiseGain.gain.setValueAtTime(
        Math.max(0.0001, volume * 0.12 * strength),
        t
      );
      noiseGain.gain.exponentialRampToValueAtTime(
        0.0001,
        t + 0.055
      );

      source.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(c.destination);

      source.onended = () => {
        source.disconnect();
        filter.disconnect();
        noiseGain.disconnect();
      };

      source.start(t);
      source.stop(t + 0.07);

      this.last = performance.now();
    } catch {
      // Audio availability must never block gameplay.
    }
  }
}
