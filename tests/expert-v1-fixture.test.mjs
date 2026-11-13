import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Match} from '../public/js/match.mjs';
import {AIController as PredictiveV1AI} from './fixtures/expert-v1/expert-ai.mjs';
import {ComparisonController,runComparison} from './expert-benchmark.mjs';

const hash=source=>createHash('sha256').update(source).digest('hex');

test('predictive v1 controller and helper snapshots differ only in shared import paths',()=>{
  const manifest=JSON.parse(readFileSync(new URL('./fixtures/expert-v1/manifest.json',import.meta.url),'utf8'));
  for(const [name,entry] of Object.entries(manifest.files)){
    const snapshot=readFileSync(new URL('./fixtures/expert-v1/'+name,import.meta.url),'utf8');
    assert.equal(hash(snapshot),entry.snapshotSha256,name+' snapshot integrity');
    assert.equal(hash(snapshot.replaceAll("from '../../../public/js/","from './")),entry.originalSha256,name+' original integrity');
  }
  // These hashes describe historical dependencies, not a requirement to undo
  // later user changes to physics or field geometry. Both compared policies
  // run against the current single engine; snapshot byte integrity is above.
  for(const expected of Object.values(manifest.sharedSources))
    assert.match(expected,/^[a-f0-9]{64}$/);
});

test('predictive v1 is selectable while the original benchmark opponent remains the default',()=>{
  const game=new Match({size:2,spectator:true,seed:124});
  const legacy=new ComparisonController(game.engine,124);
  const selected=new ComparisonController(game.engine,124,'red',false,'predictive-v1');
  assert.equal(legacy.baseline.version,undefined);
  assert.ok(selected.baseline instanceof PredictiveV1AI);
  assert.equal(selected.baseline.version,'expert-predictive-1');
  assert.throws(()=>new ComparisonController(game.engine,124,'red',false,'invalid'),/Unknown benchmark opponent/);
});

test('predictive-v1 self-comparison produces identical physical results when color labels reverse',()=>{
  const options={size:2,seed:4122,duration:6,control:true,opponent:'predictive-v1'};
  const red=runComparison({...options,candidateTeam:'red'}),blue=runComparison({...options,candidateTeam:'blue'});
  assert.deepEqual(red.score,blue.score);
  assert.deepEqual(red.candidate,blue.baseline);
  assert.deepEqual(red.baseline,blue.candidate);
  assert.equal(red.nonFinite+blue.nonFinite,0);
  assert.ok(red.finished&&blue.finished);
});
