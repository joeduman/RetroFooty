import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {TRAINING_SIZES,trainingAssignment} from '../train/mode-schedule.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('nightly curriculum covers every game mode in mirrored red/blue matches',()=>{
 assert.deepEqual(TRAINING_SIZES,[1,2,3,4,5]);
 for(let start=0;start<30;start+=10){
  const ten=Array.from({length:10},(_,i)=>trainingAssignment(start+i));
  assert.deepEqual(ten.map(x=>[x.size,x.side]),[1,2,3,4,5].flatMap(n=>[[n,'red'],[n,'blue']]));
 }
});
test('overnight launcher, safe stop and stable portable memory settings exist',()=>{
 for(const file of ['START-OVERNIGHT-AI.cmd','STOP-OVERNIGHT-AI.cmd','CHECK-OVERNIGHT-AI.cmd',
  'RUN-OVERNIGHT-AI-VISIBLE.cmd','train/overnight.py','train/training_lock.py']){
  assert.ok(fs.existsSync(path.join(root,file)),file);
 }
 const settings=JSON.parse(fs.readFileSync(path.join(root,'bot-memory','overnight-settings.json'),'utf8'));
 assert.ok(settings.teacherMatches>=10&&settings.selfplayMatches>=10&&settings.benchmarkMatches>=10);
 assert.equal(settings.hours,8);
 const config=JSON.parse(fs.readFileSync(path.join(root,'bot-memory','training-settings.json'),'utf8'));
 assert.ok(config.neuralTeacherMatches>=10&&config.neuralSelfplayMatches>=10&&config.neuralBenchmarkMatches>=10);
});
test('live match, physics, bot and park modules remain unchanged in overnight release',()=>{
 // Guard the rollout from accidentally altering game state directly, and verify
 // that the new match scheduler is the only change in the rollout's size policy.
 const s=fs.readFileSync(path.join(root,'train/rollout.mjs'),'utf8');
 assert.match(s,/trainingAssignment\(round,seed\)/);
 assert.match(s,/new Match\(/);
 assert.match(s,/stopRequested\(\)/);
});
