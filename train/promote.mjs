import fs from 'node:fs';
import {NeuralModelStore} from '../bot-model-store.mjs';
const arg=n=>{const i=process.argv.indexOf('--'+n);return i<0?null:process.argv[i+1];};
const store=new NeuralModelStore('bot-memory');
const model=JSON.parse(fs.readFileSync(arg('candidate'),'utf8'));
const benchmark=JSON.parse(fs.readFileSync(arg('benchmark'),'utf8'))?.benchmark;
if(!benchmark||benchmark.games<8)throw Error('At least eight independent match results are required');
if(process.argv.includes('--record-only')||!benchmark.passed){store.record({promoted:false,benchmark,source:'rejected-tournament'});console.log('Candidate not promoted');}
else {store.promote(model,benchmark);console.log('Champion promoted');}
