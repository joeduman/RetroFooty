import fs from 'node:fs';
import path from 'node:path';
const dir=path.join(process.cwd(),'bot-memory');
const get=name=>{try{return JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));}catch{return null;}};
const s=get('overnight-status.json'),a=get('server-activity.json'),t=get('models/trainer-state.json');
console.log('\nRETROFOOTY OVERNIGHT AI TRAINING\n');
console.log('Overnight:',s?.status||'Not started');
if(s){console.log(`Session PID ${s.pid}; started ${s.startedAt}`);
 console.log(`Completed ${s.completedCycles} successful cycles, ${s.failedCycles} interrupted/failed cycles`);
 console.log(`Curriculum: 1v1, 2v2, 3v3, 4v4, 5v5 (both colors)`);
 console.log(`Per cycle: ${s.teacherMatches} Expert, ${s.selfplayMatches} self-play, ${s.benchmarkMatches} benchmark matches`);
 if(s.stoppedReason)console.log(`Stopped: ${s.stoppedReason}`);
}
if(a&&Date.now()-a.at<15000)console.log('Connected humans:',a.clients);
if(t)console.log('Total neural training attempts:',t.attempts||0);
console.log('Full log:',path.join(dir,'overnight-training.log'));
console.log('Memory & champion:',path.join(dir,'models'));
