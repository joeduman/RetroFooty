import {ActiveMatchStore} from './active-match-store.mjs';
import fs from 'node:fs';
import path from 'node:path';
const [command='status',...args]=process.argv.slice(2);
// The live server remains the only writer while running. Approval changes are
// applied to future matches, so a CLI cannot overwrite newly completed evidence.
let live=null;
try{
  const state=JSON.parse(fs.readFileSync(path.join(process.cwd(),'.retrofooty-server.json'),'utf8'));
  if(state.app==='teamball'&&state.root===process.cwd()&&Number.isInteger(state.port)&&state.port>0&&state.port<65536&&typeof state.token==='string')live=state;
}catch{}
const store=live?null:new ActiveMatchStore();
async function change(action){
  if(live){
    const response=await fetch(`http://127.0.0.1:${live.port}/_teamball/ai/active`,{method:'POST',headers:{Authorization:'Bearer '+live.token,'Content-Type':'application/json'},body:JSON.stringify(action),signal:AbortSignal.timeout(3000)});
    const result=await response.json();if(!response.ok||result.error)throw Error(result.error||'Active memory update failed');return result;
  }
  if(action.action==='approve')return store.approve(action.ids,{reviewed:action.reviewed,notes:action.notes});
  if(action.action==='import')return store.importCandidate(action.candidate);
  if(action.action==='reject'){store.reject(action.ids,action.reason);return store.status();}
  return store.rollback(action.version);
}
try{
  if(command==='status'||command==='list'){
    const data=live?await (await fetch(`http://127.0.0.1:${live.port}/_teamball/ai/active`,{signal:AbortSignal.timeout(3000)})).json():{status:store.status(),memory:store.memory};
    console.log(JSON.stringify(command==='status'?data.status:data.memory.candidates,null,2));
  }
  else if(command==='approve'){
    const separator=args.indexOf('--review');
    if(separator<0)throw Error('Usage: node active-memory-tool.mjs approve MATCH_ID MATCH_ID MATCH_ID --review "Review findings"');
    console.log(JSON.stringify(await change({action:'approve',ids:args.slice(0,separator),reviewed:true,notes:args.slice(separator+1).join(' ')}),null,2));
  }else if(command==='import'){
    if(!args[0]||fs.statSync(args[0]).size>16000)throw Error('A local candidate JSON file under 16 KB is required');
    console.log(JSON.stringify(await change({action:'import',candidate:JSON.parse(fs.readFileSync(args[0],'utf8'))}),null,2));
  }else if(command==='reject')console.log(JSON.stringify(await change({action:'reject',ids:args}),null,2));
  else if(command==='rollback')console.log(JSON.stringify(await change({action:'rollback',version:Number(args[0])}),null,2));
  else throw Error('Commands: status, list, import, approve, reject, rollback');
}catch(error){console.error(error.message);process.exitCode=1;}
