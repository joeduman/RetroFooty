import {Worker} from 'node:worker_threads';
import fs from 'node:fs';
export function startTrainer(store,park,rooms=null){
 const worker=new Worker(new URL('./bot-trainer-worker.mjs',import.meta.url));let stopped=false;
 const update=()=>{const active=(park?.world?.clients?.size||0)+(rooms?.clients?.size||0);
   // Maximum priority is online smoothness. Suspend CPU-heavy self-play
   // whenever anyone is on the server; replay learning is lightweight.
   let enabled=true;try{enabled=JSON.parse(fs.readFileSync('bot-memory/training-settings.json','utf8')).enabled!==false;}catch{}
   store.paused=active>0||!enabled||process.env.TEAMBALL_TRAINING==='off';
   worker.postMessage({type:'configure',policy:store.policy(),paused:store.paused,interval:15000});};
 worker.on('message',r=>{if(r.type==='result'){store.applySelfPlay(r);update();}else if(r.type==='error')store.error=r.message;});
 worker.on('error',e=>{store.error=e.message;});
 const timer=setInterval(()=>{if(!stopped)update();},1000);update();
 return ()=>{stopped=true;clearInterval(timer);worker.postMessage({type:'stop'});worker.terminate();};
}
