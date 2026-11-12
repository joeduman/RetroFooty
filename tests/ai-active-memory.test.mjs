import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {ActiveOpponentMemory,exportCompletedHumanCandidate} from '../public/js/ai-active-memory.mjs';
import {ActiveMatchStore} from '../active-match-store.mjs';
import {Match} from '../public/js/match.mjs';
import {ParkWorld} from '../park.mjs';
import {STEP} from '../public/js/config.mjs';

const temporary=()=>mkdtempSync(path.join(os.tmpdir(),'teamball-active-memory-'));
const sample=(model,game,steps=30,{boost=false,turn=false}={})=>{
  const player=game.players[0];
  for(let i=0;i<steps;i++){
    game.engine.time+=.16;player.vx=turn&&i%2?-170:170;player.vy=0;player.sprinting=boost;
    model.observe(game.engine);
  }
};
const record=(store,id,{size=1,boost=true}={})=>{
  const game=new Match({size,seed:41});game.state='playing';
  for(let i=0;i<24;i++){
    game.engine.time+=.16;game.players[0].vx=170;game.players[0].sprinting=boost;
    store.capture(id,game,{eligibleIds:[game.players[0].id]});
  }
  game.state='ended';return store.complete(id,game);
};

test('repeated opponent behavior adapts in match with finite evidence and reversals',()=>{
  const game=new Match({size:1,seed:33}),model=new ActiveOpponentMemory();
  sample(model,game,35);
  const straight=model.tendency(1);assert.ok(straight.straight>.9);assert.equal(straight.turn,0);assert.ok(straight.confidence>.6);
  sample(model,game,35,{boost:true,turn:true});
  const changed=model.tendency(game.players[0]);assert.ok(changed.reverse>.65);assert.ok(changed.turn>.65);assert.ok(changed.boost>.65);
  assert.ok(changed.straight<straight.straight*.4);assert.ok(changed.confidence<1);
  model.resetMotion();assert.equal(model.tendency(1).samples,changed.samples,'kickoff keeps match evidence');
  game.engine.time+=.2;model.observe(game.engine);assert.ok(model.tendency(1).reverse<changed.reverse,'a reset cannot count a teleport as reversal');
});

test('active reference priors are bounded and observations supersede priors',()=>{
  const game=new Match({size:1}),model=new ActiveOpponentMemory(),pattern={samples:80,boost:1,turn:0,reverse:0,lateralBias:0,straight:1,wall:0,challenge:0,kick:0};
  model.setReference(pattern);assert.equal(model.tendency(1).boost,.3);
  sample(model,game,80);assert.ok(model.tendency(1).boost<.06);
  model.setReference({...pattern,samples:2});assert.equal(model.tendency(1).boost,0);
});

test('recording requires opt-in humans and completion; bot and interrupted games cannot be references',()=>{
  const directory=temporary();try{
    const store=new ActiveMatchStore({directory}),bot=new Match({size:1,spectator:true});bot.state='playing';
    store.capture('bot-game',bot,{eligibleIds:[1]});assert.equal(store.sessions.size,0);
    const game=new Match({size:1});game.state='playing';store.capture('no-consent',game);assert.equal(store.sessions.size,0);
    store.capture('incomplete',game,{eligibleIds:[1]});assert.equal(store.complete('incomplete',game,{reason:'interrupted'}),null);
    assert.equal(store.memory.candidates.length,0);
    store.evaluate({id:'bot-evaluation',size:1,score:1,version:'expert-predictive'});
    assert.equal(store.memory.evaluations.length,1);assert.equal(store.memory.candidates.length,0);
    const candidate=record(store,'human-match');assert.equal(candidate.status,'candidate');assert.equal(candidate.pattern.samples,24);
    assert.equal(store.reference(1),null,'consent to record is separate from review approval');
    assert.throws(()=>store.approve(['human-match'],{reviewed:true,notes:'Reviewed repeated technique'}),/three completed/);
    assert.doesNotMatch(readFileSync(store.file,'utf8'),/Sam|email|password/);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('reviewed multi-match evidence promotes by mode, loads deterministically, and rolls back',()=>{
  const directory=temporary();try{
    const store=new ActiveMatchStore({directory});
    for(const id of ['human-a','human-b','human-c'])record(store,id);
    const ids=store.memory.candidates.map(c=>c.id);
    assert.throws(()=>store.approve(ids),/Explicit reviewed/);
    store.approve(ids,{reviewed:true,notes:'Reviewed three distinct situations and opponents'});
    assert.equal(store.memory.policyVersion,1);assert.equal(store.reference(1).boost,1);assert.equal(store.reference(2),null);
    const loaded=new ActiveMatchStore({directory});assert.deepEqual(loaded.memory,store.memory);
    const active=new Match({size:1});active.ai.activeMemory=new ActiveOpponentMemory();loaded.attach(active);
    assert.equal(active.ai.activeMemory.tendency(1).boost,.3);
    loaded.rollback(0);assert.equal(loaded.reference(1),null);assert.equal(loaded.status().candidates,3);
    assert.equal(active.ai.activeMemory.tendency(1).boost,.3,'approved policy snapshots cannot mutate a running match');
    assert.throws(()=>loaded.rollback(99),/not available/);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('approval evidence cannot be spread across unrelated modes or come from rejected games',()=>{
  const directory=temporary();try{
    const store=new ActiveMatchStore({directory});record(store,'one',{size:1});record(store,'two',{size:2});record(store,'three',{size:3});
    assert.throws(()=>store.approve(['one','two','three'],{reviewed:true,notes:'Three modes need their own evidence'}),/Each promoted mode/);
    store.reject(['one'],'Unsafe own-goal technique');
    assert.throws(()=>store.approve(['one','two','three'],{reviewed:true,notes:'Review notes attached'}),/await approval/);
    assert.equal(store.reference(1),null);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('active data has a separate schema and reports corrupt storage without adopting it',()=>{
  const directory=temporary();try{
    writeFileSync(path.join(directory,'active-match-memory.v1.json'),'{"schema":"teamball.bot-memory.v1","version":1}');
    const store=new ActiveMatchStore({directory});assert.match(store.status().error,/Incompatible/);assert.equal(store.reference(1),null);
    assert.equal(store.file.endsWith('active-match-memory.v1.json'),true);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('park captures consent-scoped active candidates independently of the offline learning store',()=>{
  const directory=temporary();try{
    const activeMemory=new ActiveMatchStore({directory}),world=new ParkWorld({duration:.06,goldenGoal:false,activeMemory});
    const red=world.connect('Consenting human',null,true),blue=world.connect('Unapproved human');
    world.join(red,1,'red');world.join(blue,1,'blue');
    for(let i=0;i<710;i++)world.tick(STEP);
    assert.equal(activeMemory.memory.candidates.length,1);assert.equal(activeMemory.memory.candidates[0].participants,1);
    assert.equal(activeMemory.reference(1),null);assert.equal(activeMemory.sessions.size,0);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('revoking consent discards earlier observations, including on the completion tick',()=>{
  const directory=temporary();try{
    const store=new ActiveMatchStore({directory}),game=new Match({size:1});game.state='playing';
    for(let i=0;i<8;i++){game.engine.time+=.16;store.capture('revoked',game,{eligibleIds:[1]});}
    assert.equal(store.sessions.get('revoked').model.tendency(1).samples,8);
    game.state='ended';store.capture('revoked',game,{eligibleIds:[]});
    assert.equal(store.sessions.size,0);assert.equal(store.complete('revoked',game),null);assert.equal(store.memory.candidates.length,0);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('slot reuse starts fresh evidence for the new participant',()=>{
  const directory=temporary();try{
    const store=new ActiveMatchStore({directory}),game=new Match({size:1});game.state='playing';
    for(let i=0;i<12;i++){game.engine.time+=.16;game.players[0].sprinting=true;store.capture('reused',game,{eligibleIds:[1],participantKeys:{1:'first-person'}});}
    assert.equal(store.sessions.get('reused').model.tendency(1).boost,1);
    game.engine.time+=.16;game.players[0].sprinting=false;store.capture('reused',game,{eligibleIds:[1],participantKeys:{1:'second-person'}});
    const fresh=store.sessions.get('reused').model.tendency(1);assert.equal(fresh.samples,1);assert.equal(fresh.boost,0);
    store.releasePlayer('reused',1);assert.equal(store.sessions.size,0);
    store.capture('discarded',game,{eligibleIds:[1]});store.discard('discarded');assert.equal(store.sessions.size,0);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('loading rejects invalid mode, status, sample bounds and duplicate candidates',()=>{
  const directory=temporary();try{
    const store=new ActiveMatchStore({directory});record(store,'valid');const original=structuredClone(store.memory);
    for(const mutate of [
      memory=>memory.candidates[0].size=6,
      memory=>memory.candidates[0].status='auto-approved',
      memory=>memory.candidates[0].pattern.samples=Infinity,
      memory=>memory.candidates[0].pattern.samples=1000001,
      memory=>memory.candidates[0].pattern.boost=1.1,
      memory=>memory.candidates[0].participants=3,
      memory=>memory.candidates.push({...memory.candidates[0]}),
    ]){
      const changed=structuredClone(original);mutate(changed);writeFileSync(store.file,JSON.stringify(changed));
      const loaded=new ActiveMatchStore({directory});assert.match(loaded.status().error,/Invalid|Duplicate/);assert.equal(loaded.memory.candidates.length,0);
    }
    writeFileSync(store.file,' '.repeat(512001));assert.match(new ActiveMatchStore({directory}).status().error,/size limit/);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('explicit local export includes only the local human and cannot duplicate one match',()=>{
  const directory=temporary();try{
    const game=new Match({size:1});game.ai.activeMemory=new ActiveOpponentMemory();game.state='playing';
    assert.throws(()=>exportCompletedHumanCandidate(game),/completed local human/);
    game.players[1].human=true;game.players[1].sprinting=true;
    sample(game.ai.activeMemory,game,24,{boost:false});game.state='ended';
    const exported=exportCompletedHumanCandidate(game);assert.equal(exported.participants,1);assert.equal(exported.pattern.samples,24);assert.equal(exported.pattern.boost,0);
    assert.equal(exportCompletedHumanCandidate(game).id,exported.id,'repeated exports identify the same match');
    assert.doesNotMatch(JSON.stringify(exported),/Sam|Nico|"playerId"|"team"|"name"/);
    const store=new ActiveMatchStore({directory});store.importCandidate(exported);
    assert.equal(store.memory.candidates[0].source,'local-browser');assert.equal(store.reference(1),null);
    assert.throws(()=>store.importCandidate(exported),/already imported/);
    assert.throws(()=>store.importCandidate({...exported,id:'other',status:'approved'}),/Invalid local/);
    assert.throws(()=>store.importCandidate({...exported,id:'other',participants:2}),/Invalid local/);
    game.spectator=true;assert.throws(()=>exportCompletedHumanCandidate(game),/completed local human/);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('park disconnect removes prior data before a replacement occupies the slot',()=>{
  const directory=temporary();try{
    const activeMemory=new ActiveMatchStore({directory}),world=new ParkWorld({duration:30,goldenGoal:false,activeMemory});
    const red=world.connect('First human',null,true),blue=world.connect('Other human');world.join(red,1,'red');world.join(blue,1,'blue');
    for(let i=0;i<640;i++)world.tick(STEP);
    assert.equal(activeMemory.sessions.size,1);world.disconnect(red);assert.equal(activeMemory.sessions.size,0);
    const replacement=world.connect('Second human',null,true);world.join(replacement,1,'red');world.tick(STEP);
    assert.equal(activeMemory.sessions.get(world.fields[0].matchId).model.tendency(replacement.slot).samples,1);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
