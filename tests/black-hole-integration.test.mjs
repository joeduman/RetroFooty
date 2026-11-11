import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {WebSocket} from 'ws';
import {loadPreferences,savePreferences} from '../public/js/input.mjs';
import {ParkWorld} from '../park.mjs';
import {Match} from '../public/js/match.mjs';
import {ReplayRecorder,replayFrame} from '../public/js/replay.mjs';
import {STEP} from '../public/js/config.mjs';
import {attachOnline} from '../online.mjs';

const idle={x:0,y:0,aimX:1,aimY:0,sprint:false,shoot:false};
const sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));

test('Singularity saves as a preference and reaches park players across field replacements',()=>{
  const previous=globalThis.localStorage,stored=new Map();
  globalThis.localStorage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)};
  try{
    const prefs=loadPreferences();prefs.goalEffectId='black-hole';savePreferences(prefs);
    assert.equal(loadPreferences().goalEffectId,'black-hole');
  }finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
  const world=new ParkWorld(),client=world.connect('Singularity scorer',null,false,'plain','black-hole');
  assert.equal(client.avatar.goalEffectId,'black-hole');
  assert.equal(world.join(client,2,'blue'),null);
  const field=world.fields.find(item=>item.size===2);
  assert.equal(world.state(client).state.players.find(player=>player.id===client.slot).goalEffectId,'black-hole');
  world.restart(field,'warmup');
  assert.equal(world.state(client).state.players.find(player=>player.id===client.slot).goalEffectId,'black-hole');
  world.setGoalEffect(client,'fire');world.setGoalEffect(client,'black-hole');
  assert.equal(world.state(client).state.players.find(player=>player.id===client.slot).goalEffectId,'black-hole');
});

test('physical Singularity goals keep scorer attribution and their frozen effect in mirrored replays',()=>{
  for(const swapped of [false,true]){
    const game=new Match({size:1,spectator:true,loop:false,seed:56});
    if(swapped)game.startSecondHalf();
    game.state='playing';game.engine.kickoff=null;
    for(const [index,player] of game.players.entries())Object.assign(player,{human:true,input:{...idle},x:game.pitch.width/2+index*80,y:game.pitch.top+30,vx:0,vy:0});
    const scorer=game.players.find(player=>player.team==='red'),dir=game.engine.attackDir('red'),goal=dir===1?game.pitch.right:game.pitch.left;
    Object.assign(scorer,{x:goal-dir*90,y:game.pitch.height/2,goalEffectId:'black-hole',input:{...idle,aimX:dir,shoot:true}});
    Object.assign(game.engine.ball,{x:scorer.x+dir*(scorer.radius+game.engine.ball.radius+1),y:scorer.y,vx:0,vy:0});
    const recorder=new ReplayRecorder(game);
    game.update(STEP);recorder.step(STEP);scorer.input={...idle};
    for(let tick=0;tick<120&&game.state!=='goal';tick++){game.update(STEP);recorder.step(STEP);}
    assert.equal(game.state,'goal');assert.equal(game.goalInfo.scorerId,scorer.id);
    assert.equal(game.goalInfo.goalEffectId,'black-hole');
    assert.equal(game.events.find(event=>event.type==='goal').goalEffectId,'black-hole');
    scorer.goalEffectId='classic';
    assert.equal(game.goalInfo.goalEffectId,'black-hole','changing equipment leaves the scored goal intact');
    const record=recorder.snapshot('complete').replay,frame=replayFrame(record,record.duration);
    assert.equal(frame.goalInfo.goalEffectId,'black-hole');assert.equal(frame.goalInfo.scorerId,scorer.id);
  }
});

test('private room peers share Singularity and retain it for the next match',async()=>{
  const server=http.createServer(),stop=attachOnline(server,{duration:.15,goldenGoal:false}),clients=[];
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  async function connect(){
    const socket=new WebSocket(`ws://127.0.0.1:${server.address().port}/online`),messages=[];
    socket.on('message',buffer=>messages.push(JSON.parse(buffer)));
    await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
    const client={socket,send:message=>socket.send(JSON.stringify(message)),async wait(predicate){
      const deadline=Date.now()+6500;
      while(Date.now()<deadline){const message=messages.findLast(predicate);if(message)return message;await sleep(10);}
      throw Error('Singularity private-room synchronization timed out');
    }};clients.push(client);return client;
  }
  try{
    const host=await connect(),peer=await connect();
    host.send({type:'create',name:'Vortex host',team:'red',size:1,goalEffectId:'black-hole'});
    const lobby=await host.wait(message=>message.type==='lobby');
    const initial=await host.wait(message=>message.type==='state');
    assert.equal(initial.state.players.find(player=>player.id===initial.id).goalEffectId,'black-hole');
    peer.send({type:'join',name:'Vortex peer',team:'blue',code:lobby.code,goalEffectId:'classic'});
    await peer.wait(message=>message.type==='state');
    peer.send({type:'goal-effect',goalEffectId:'black-hole'});
    const equipped=await host.wait(message=>message.type==='state'&&message.state.players.filter(player=>player.human).length===2&&message.state.players.filter(player=>player.human).every(player=>player.goalEffectId==='black-hole'));
    host.send({type:'start'});
    const first=await peer.wait(message=>message.type==='state'&&message.matchId!==equipped.matchId&&message.state.state==='kickoff');
    assert.ok(first.state.players.filter(player=>player.human).every(player=>player.goalEffectId==='black-hole'));
    await host.wait(message=>message.type==='state'&&message.matchId===first.matchId&&message.state.state==='ended');
    host.send({type:'start'});
    const rematch=await peer.wait(message=>message.type==='state'&&message.matchId!==first.matchId&&message.matchId!==equipped.matchId&&message.state.state==='kickoff');
    assert.ok(rematch.state.players.filter(player=>player.human).every(player=>player.goalEffectId==='black-hole'));
  }finally{for(const client of clients)client.socket.terminate();stop();await new Promise(resolve=>server.close(resolve));}
});
