// Separate from bot-learning and every offline training dataset/configuration.
// Consent permits recording a candidate. Approval is an explicit, evidence-gated action.
import fs from 'node:fs';
import path from 'node:path';
import {ActiveOpponentMemory,ACTIVE_PATTERN_KEYS,ACTIVE_CANDIDATE_SCHEMA} from './public/js/ai-active-memory.mjs';

export const ACTIVE_MEMORY_SCHEMA='teamball.active-match-memory.v1';
const fresh=()=>({schema:ACTIVE_MEMORY_SCHEMA,version:1,policyVersion:0,references:{},candidates:[],rejected:[],history:[],evaluations:[]});
const clone=value=>JSON.parse(JSON.stringify(value));
const idOf=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value)?value:null;
const modeOf=value=>Number.isInteger(value)&&value>=1&&value<=5;
const validReference=row=>row&&Number.isSafeInteger(row.samples)&&row.samples>=1&&row.samples<=1000000&&ACTIVE_PATTERN_KEYS.every(k=>Number.isFinite(row[k])&&row[k]>=(k==='lateralBias'?-1:0)&&row[k]<=1);
const cleanPattern=row=>({samples:row.samples,...Object.fromEntries(ACTIVE_PATTERN_KEYS.map(key=>[key,row[key]]))});
const validScore=score=>score&&['red','blue'].every(key=>Number.isSafeInteger(score[key])&&score[key]>=0&&score[key]<=1000000);
function cleanCandidate(candidate,policyVersion){
  if(!candidate||!idOf(candidate.id)||!modeOf(candidate.size)||candidate.completed!==true||candidate.human!==true||!validReference(candidate.pattern)||
    !Number.isInteger(candidate.participants)||candidate.participants<1||candidate.participants>candidate.size*2||!validScore(candidate.score)||
    !['candidate','approved','rejected'].includes(candidate.status))throw Error('Invalid active match candidate');
  const source=candidate.source||'authoritative-server';
  if(!['authoritative-server','local-browser'].includes(source))throw Error('Invalid active match source');
  const result={id:candidate.id,size:candidate.size,completed:true,human:true,participants:candidate.participants,
    pattern:cleanPattern(candidate.pattern),score:{red:candidate.score.red,blue:candidate.score.blue},status:candidate.status,source};
  if(candidate.status==='approved'){
    if(!Number.isSafeInteger(candidate.policyVersion)||candidate.policyVersion<1||candidate.policyVersion>policyVersion||typeof candidate.review!=='string'||candidate.review.length<8)throw Error('Invalid active match approval');
    result.policyVersion=candidate.policyVersion;result.review=candidate.review.slice(0,500);
  }
  return result;
}
function cleanReferences(references){
  if(!references||typeof references!=='object'||Array.isArray(references))throw Error('Invalid active match references');
  return Object.fromEntries(Object.entries(references).map(([mode,row])=>{
    if(!/^[1-5]$/.test(mode)||!validReference(row)||row.samples<60)throw Error('Invalid active match reference');
    return [mode,cleanPattern(row)];
  }));
}
function validate(data){
  if(data?.schema!==ACTIVE_MEMORY_SCHEMA||data.version!==1||!Number.isSafeInteger(data.policyVersion)||data.policyVersion<0)throw Error('Incompatible active match memory');
  const result=fresh();result.policyVersion=data.policyVersion;
  result.references=cleanReferences(data.references||{});
  if(!data.policyVersion&&Object.keys(result.references).length)throw Error('Active references require an approved policy version');
  result.candidates=(Array.isArray(data.candidates)?data.candidates:[]).slice(-100).map(candidate=>cleanCandidate(candidate,data.policyVersion));
  if(new Set(result.candidates.map(c=>c.id)).size!==result.candidates.length)throw Error('Duplicate active match candidates');
  result.rejected=(Array.isArray(data.rejected)?data.rejected:[]).slice(-50).map(row=>{
    if(!idOf(row?.id)||typeof row.reason!=='string')throw Error('Invalid rejected active match');return {id:row.id,reason:row.reason.slice(0,500)};
  });
  result.history=(Array.isArray(data.history)?data.history:[]).slice(-10).map(row=>{
    if(!Number.isSafeInteger(row?.policyVersion)||row.policyVersion<0||row.policyVersion>=data.policyVersion)throw Error('Invalid active match policy history');
    return {policyVersion:row.policyVersion,references:cleanReferences(row.references)};
  });
  if(new Set(result.history.map(row=>row.policyVersion)).size!==result.history.length)throw Error('Duplicate active match policy versions');
  result.evaluations=(Array.isArray(data.evaluations)?data.evaluations:[]).slice(-40).map(row=>{
    if(!idOf(row?.id)||!modeOf(row.size)||!Number.isFinite(row.score)||Math.abs(row.score)>1000000||typeof row.version!=='string'||!row.version.length)throw Error('Invalid active match evaluation');
    return {id:row.id,size:row.size,score:row.score,version:row.version.slice(0,80)};
  });
  return result;
}
function aggregate(rows){
  const samples=rows.reduce((sum,row)=>sum+row.samples,0),result={samples};
  for(const key of ACTIVE_PATTERN_KEYS)result[key]=samples?rows.reduce((sum,row)=>sum+row[key]*row.samples,0)/samples:0;
  result.samples=Math.min(1000000,samples);return result;
}
export class ActiveMatchStore {
  constructor({directory=path.join(process.cwd(),'bot-memory')}={}){
    this.directory=directory;this.file=path.join(directory,'active-match-memory.v1.json');this.memory=fresh();this.sessions=new Map();
    try{if(fs.statSync(this.file).size>512000)throw Error('Active match memory exceeds its size limit');this.memory=validate(JSON.parse(fs.readFileSync(this.file,'utf8')));}catch(error){if(error.code!=='ENOENT')this.error=error.message;}
  }
  reference(size){return clone(this.memory.references[String(size)]||null);}
  attach(game){game.ai?.activeMemory?.setReference(this.reference(game.size));}
  importCandidate(data){
    if(data?.schema!==ACTIVE_CANDIDATE_SCHEMA||data.source!=='local-browser'||data.status!=='candidate'||data.participants!==1)throw Error('Invalid local human candidate export');
    const candidate=cleanCandidate(data,this.memory.policyVersion);
    if(this.memory.candidates.some(row=>row.id===candidate.id))throw Error('This match candidate was already imported');
    this.memory.candidates.push(candidate);this.memory.candidates=this.memory.candidates.slice(-100);this.save();return this.status();
  }
  discard(matchId){this.sessions.delete(matchId);}
  releasePlayer(matchId,playerId){
    const session=this.sessions.get(matchId);if(!session)return;
    session.eligible.delete(playerId);session.identities.delete(playerId);session.model.players.delete(playerId);session.model.motion.delete(playerId);
    if(!session.eligible.size)this.sessions.delete(matchId);
  }
  capture(matchId,game,{eligibleIds=[],participantKeys={}}={}){
    if(!idOf(matchId)||!game||!modeOf(game.size)||!Array.isArray(eligibleIds))return;
    const humans=eligibleIds.filter(id=>game.players.some(player=>player.id===id&&player.human));
    let session=this.sessions.get(matchId);
    // Permission is checked on every capture, including completion ticks. Removed
    // permission discards that participant's earlier observations in this match.
    if(session)for(const id of [...session.eligible])if(!humans.includes(id))this.releasePlayer(matchId,id);
    session=this.sessions.get(matchId);
    if(game.state!=='playing'||game.practice)return;
    if(!humans.length)return;
    if(!session){
      if(this.sessions.size>=16)this.sessions.delete(this.sessions.keys().next().value);
      session={size:game.size,model:new ActiveOpponentMemory(),eligible:new Set(),identities:new Map()};this.sessions.set(matchId,session);
    }
    for(const id of humans){
      const identity=typeof participantKeys[id]==='string'?participantKeys[id]:String(id);
      if(session.identities.has(id)&&session.identities.get(id)!==identity){session.model.players.delete(id);session.model.motion.delete(id);}
      session.identities.set(id,identity);session.eligible.add(id);
    }
    session.model.observe(game.engine,{eligibleIds:humans});
  }
  complete(matchId,game,{reason='complete'}={}){
    const session=this.sessions.get(matchId);this.sessions.delete(matchId);
    if(!session||reason!=='complete'||game.state!=='ended'||game.practice)return null;
    if(this.memory.candidates.some(candidate=>candidate.id===matchId))return null;
    const rows=session.model.snapshot({eligibleIds:[...session.eligible]}),pattern=aggregate(rows);
    if(pattern.samples<1)return null;
    const candidate={id:matchId,size:session.size,completed:true,human:true,participants:rows.length,pattern,
      score:{red:game.score.red,blue:game.score.blue},status:'candidate',source:'authoritative-server'};
    this.memory.candidates.push(candidate);this.memory.candidates=this.memory.candidates.slice(-100);this.save();return clone(candidate);
  }
  // Offline benchmarks can record outcomes here, but cannot become human references.
  evaluate({id,size,score,version}={}){
    if(!idOf(id)||!modeOf(size)||!Number.isFinite(score)||Math.abs(score)>1000000||typeof version!=='string'||!version.length)throw Error('Invalid evaluation');
    this.memory.evaluations.push({id,size,score,version:version.slice(0,80)});this.memory.evaluations=this.memory.evaluations.slice(-40);this.save();
  }
  approve(ids,{reviewed=false,notes=''}={}){
    if(reviewed!==true||typeof notes!=='string'||notes.trim().length<8)throw Error('Explicit reviewed approval and review notes are required');
    if(!Array.isArray(ids)||ids.some(id=>!idOf(id)))throw Error('Invalid candidate IDs');
    const selected=this.memory.candidates.filter(c=>ids.includes(c.id)&&c.status==='candidate');
    if(selected.length!==new Set(ids).size)throw Error('Every candidate must exist and await approval');
    if(selected.length<3||selected.reduce((sum,c)=>sum+c.pattern.samples,0)<60)throw Error('Approval requires at least three completed human matches and 60 observations');
    if(selected.some(candidate=>candidate.pattern.samples<20))throw Error('Each approved match requires at least 20 observations');
    for(const mode of new Set(selected.map(c=>c.size))){
      const evidence=selected.filter(c=>c.size===mode);
      if(evidence.length<3||evidence.reduce((sum,c)=>sum+c.pattern.samples,0)<60)throw Error('Each promoted mode requires three completed human matches and 60 observations');
    }
    // An action that succeeds once never becomes policy. Approvals promote only measured
    // movement priors; they cannot change physics, neural weights, or tactical parameters.
    this.memory.history.push({policyVersion:this.memory.policyVersion,references:clone(this.memory.references)});
    this.memory.history=this.memory.history.slice(-10);
    for(const mode of new Set(selected.map(c=>c.size))){
      const rows=selected.filter(c=>c.size===mode).map(c=>c.pattern),old=this.memory.references[String(mode)];
      if(old)rows.unshift(old);
      this.memory.references[String(mode)]=aggregate(rows);
    }
    this.memory.policyVersion++;
    for(const candidate of selected){candidate.status='approved';candidate.policyVersion=this.memory.policyVersion;candidate.review=notes.trim().slice(0,500);}
    this.save();return this.status();
  }
  reject(ids,reason='Rejected on review'){
    if(!Array.isArray(ids)||ids.some(id=>!idOf(id)))throw Error('Invalid candidate IDs');
    for(const candidate of this.memory.candidates)if(ids.includes(candidate.id)&&candidate.status==='candidate'){
      candidate.status='rejected';this.memory.rejected.push({id:candidate.id,reason:String(reason).slice(0,500)});
    }
    this.memory.rejected=this.memory.rejected.slice(-50);this.save();
  }
  rollback(version){
    const previous=this.memory.history.findLast(row=>row.policyVersion===version);
    if(!previous)throw Error('Active policy version is not available for rollback');
    this.memory.references=clone(previous.references);this.memory.policyVersion=previous.policyVersion;
    this.memory.history=this.memory.history.filter(row=>row.policyVersion<version);
    for(const row of this.memory.candidates)if(row.status==='approved'&&row.policyVersion>version){row.status='candidate';delete row.policyVersion;delete row.review;}
    this.save();return this.status();
  }
  save(){
    try{fs.mkdirSync(this.directory,{recursive:true});const temporary=this.file+'.tmp';fs.writeFileSync(temporary,JSON.stringify(this.memory,null,2),{mode:0o600});fs.renameSync(temporary,this.file);delete this.error;}
    catch(error){this.error=error.message;console.error('Active match memory could not be saved:',error.message);return false;}
  }
  status(){return {schema:ACTIVE_MEMORY_SCHEMA,policyVersion:this.memory.policyVersion,candidates:this.memory.candidates.filter(c=>c.status==='candidate').length,
    approved:this.memory.candidates.filter(c=>c.status==='approved').length,modes:Object.keys(this.memory.references),sessions:this.sessions.size,error:this.error||null};}
}
