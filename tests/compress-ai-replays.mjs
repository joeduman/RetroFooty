import fs from 'node:fs';import path from 'node:path';import {gzipSync,gunzipSync} from 'node:zlib';import assert from 'node:assert/strict';
for(const directory of process.argv.slice(2)){
 const root=path.resolve(directory),allowed=path.resolve('public/ai-results')+path.sep;
 if(!root.startsWith(allowed))throw Error('Expected a generated tournament directory');
 const result=JSON.parse(fs.readFileSync(path.join(root,'results.json'),'utf8'));
 if(!result.finishedAt)throw Error('Do not compress an active tournament');
 for(const m of result.matches){
  if(m.replay.endsWith('.gz'))continue;
  const file=path.resolve(root,m.replay);if(!file.startsWith(root+path.sep))throw Error('Replay outside this run');
  const original=fs.readFileSync(file),compressed=gzipSync(original);assert.deepEqual(gunzipSync(compressed),original);
  fs.writeFileSync(file+'.gz',compressed);m.replay+='.gz';fs.unlinkSync(file);
 }
 result.replayEncoding='gzip-json, lossless verified';fs.writeFileSync(path.join(root,'results.json'),JSON.stringify(result));
 fs.writeFileSync(path.join(root,'matches.ndjson'),result.matches.map(m=>JSON.stringify(m)).join('\n')+'\n');
 const csv=path.join(root,'matches.csv');if(fs.existsSync(csv))fs.writeFileSync(csv,fs.readFileSync(csv,'utf8').replace(/(replays\/\d+\.json)(?=,|\r?$)/gm,'$1.gz'));
 console.log('Losslessly compressed '+result.matches.length+' replays in '+directory);
}
