// CLI: node bot-memory-tool.mjs status | export [path] | import <path> | reset | neural-rollback | pause | resume
import fs from 'node:fs';import {BotMemoryStore} from './bot-learning.mjs';
const store=new BotMemoryStore(),cmd=process.argv[2],file=process.argv[3];
if(cmd==='status')console.log(JSON.stringify(store.status(),null,2));
else if(cmd==='export'){const path=file||'teamball-bot-memory-export.json';fs.writeFileSync(path,JSON.stringify(store.memory,null,2));console.log('Memory exported:',path);}
else if(cmd==='import'){if(!file)throw Error('Pass a memory JSON file');store.import(fs.readFileSync(file,'utf8'));console.log('Memory imported. Restart the server to load it.');}
else if(cmd==='neural-rollback'){store.neural.rollback();console.log('Restored previous neural champion. New matches pick it up automatically.');}
else if(cmd==='reset'){store.reset();console.log('Fresh memory installed. Earlier memory backed up if present. Restart server to reload it.');}
else if(cmd==='pause'||cmd==='resume'){
 // Training is controlled through a local config file read at startup.
 let settings={};try{settings=JSON.parse(fs.readFileSync('bot-memory/training-settings.json','utf8'));}catch{}
 fs.writeFileSync('bot-memory/training-settings.json',JSON.stringify({...settings,enabled:cmd==='resume'}));console.log('Selfplay',cmd==='pause'?'paused':'enabled','— the running server picks this up automatically');
}
else console.log('Usage: node bot-memory-tool.mjs status | export [file] | import <file> | reset | neural-rollback | pause | resume');
