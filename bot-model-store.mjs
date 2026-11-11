// Filesystem-only neural champion registry; portable with the bot-memory directory.
import fs from 'node:fs';
import path from 'node:path';
import {validateNeuralModel} from './public/js/neural-policy.mjs';
const atomic=(p,data)=>{const temp=p+'.tmp';fs.writeFileSync(temp,data,{mode:0o600});fs.renameSync(temp,p);};
const safeRead=p=>{try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return null;}};
export class NeuralModelStore{
 constructor(directory){this.folder=path.join(directory,'models');fs.mkdirSync(this.folder,{recursive:true});this.path=path.join(this.folder,'champion.v1.json');this.metaPath=path.join(this.folder,'training-history.json');this.cached=null;this.stamp=-1;this.lastError=null;}
 model(){let stat;try{stat=fs.statSync(this.path);}catch{return null;}
  if(this.stamp===stat.mtimeMs)return this.cached;
  const raw=safeRead(this.path);if(!validateNeuralModel(raw)){this.lastError='Champion file is invalid; scripted expert fallback is active';return null;}
  this.stamp=stat.mtimeMs;this.cached=raw;this.lastError=null;return raw;
 }
 record(result){const history=safeRead(this.metaPath)||{schema:'teamball.neural-history.v1',evaluations:[],promotions:0};
  history.evaluations.push({...result,at:new Date().toISOString()});history.evaluations=history.evaluations.slice(-200);if(result.promoted)history.promotions++;
  atomic(this.metaPath,JSON.stringify(history,null,2));return history;
 }
 promote(candidate,benchmark){if(!validateNeuralModel(candidate))throw Error('Invalid neural candidate');
  if(!benchmark?.passed||!Number.isFinite(benchmark.winRate)||!Number.isFinite(benchmark.goalDifference))throw Error('Candidate failed promotion gate');
  if(fs.existsSync(this.path))fs.copyFileSync(this.path,path.join(this.folder,'champion-previous.v1.json'));
  const safe={...candidate,installedAt:new Date().toISOString(),benchmark:{winRate:benchmark.winRate,goalDifference:benchmark.goalDifference,games:benchmark.games}};
  atomic(this.path,JSON.stringify(safe));this.stamp=-1;
  this.record({promoted:true,benchmark,source:safe.training?.source||'training'});return safe;
 }
 rollback(){
  const previous=path.join(this.folder,'champion-previous.v1.json');
  const archived=safeRead(previous);
  if(!validateNeuralModel(archived))throw Error('No valid previous neural champion to restore');
  const current=safeRead(this.path);
  atomic(this.path,JSON.stringify(archived));
  if(validateNeuralModel(current))atomic(previous,JSON.stringify(current));
  this.stamp=-1;this.record({promoted:false,rollback:true,reason:'manual rollback to previous tested champion'});
  return archived;
 }
 status(){const history=safeRead(this.metaPath)||{promotions:0,evaluations:[]},champion=this.model();return {active:!!champion,championVersion:champion?.training?.version||null,trainedOnHuman:champion?.training?.humanSamples||0,
  trainedOnExpert:champion?.training?.expertSamples||0,trainedOnSelfPlay:champion?.training?.rlSamples||0,benchmark:champion?.benchmark||null,promotions:history.promotions||0,
  evaluations:(history.evaluations||[]).length,lastError:this.lastError};}
}
