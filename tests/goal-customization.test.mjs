import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {WebSocket} from 'ws';
import {Player} from '../public/js/physics.mjs';
import {loadPreferences,savePreferences} from '../public/js/input.mjs';
import {Match} from '../public/js/match.mjs';
import {ReplayRecorder,replayFrame} from '../public/js/replay.mjs';
import {STEP} from '../public/js/config.mjs';
import {attachOnline} from '../online.mjs';

const idle={x:0,y:0,aimX:1,aimY:0,sprint:false,shoot:false};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('goal customization has a compatible default and valid saved choices survive reload',()=>{
  assert.equal(new Player(1,'red',1,'Player').goalEffectId,'classic');
  const previous=globalThis.localStorage,stored=new Map();
  globalThis.localStorage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)};
  try{
    assert.equal(loadPreferences().goalEffectId,'classic');
    const preferences=loadPreferences();preferences.goalEffectId='fire';savePreferences(preferences);
    assert.equal(loadPreferences().goalEffectId,'fire');
    stored.set('teamball05',JSON.stringify({goalEffectId:'https://unknown.example/effect.js'}));
    assert.equal(loadPreferences().goalEffectId,'classic');
    stored.set('teamball05',JSON.stringify({shirtId:'psg'}));
    assert.equal(loadPreferences().goalEffectId,'classic','older preferences remain compatible');
  }finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});

function scoringFixture({team='red',effect='fire',swapped=false}={}){
  const game=new Match({size:1,spectator:true,loop:false,seed:37});
  if(swapped)game.startSecondHalf();
  game.state='playing';game.engine.kickoff=null;
  for(const [index,player] of game.players.entries()){
    player.human=true;player.input={...idle};player.x=game.pitch.width/2+index*70;player.y=game.pitch.top+30;player.vx=player.vy=0;
  }
  const player=game.players.find(p=>p.team===team),dir=game.engine.attackDir('red'),goal=dir===1?game.pitch.right:game.pitch.left;
  Object.assign(player,{x:goal-dir*90,y:game.pitch.height/2,goalEffectId:effect,input:{...idle,aimX:dir,shoot:true}});
  Object.assign(game.engine.ball,{x:player.x+dir*(player.radius+game.engine.ball.radius+1),y:player.y,vx:0,vy:0});
  const recorder=new ReplayRecorder(game);
  game.update(STEP);recorder.step(STEP);
  assert.ok(game.events.some(event=>event.type==='kick'&&event.player===player.id),'the fixture must create a physical kick');
  player.input={...idle};
  for(let n=0;n<120&&game.state!=='goal';n++){game.update(STEP);recorder.step(STEP);}
  assert.equal(game.state,'goal');assert.equal(game.goalTeam,'red');
  return {game,player,recorder};
}

test('a credited scorer chooses the goal effect in both attack directions and freezes it for replays',()=>{
  for(const swapped of [false,true]){
    const {game,player,recorder}=scoringFixture({swapped});
    assert.equal(game.goalInfo.scorerId,player.id);assert.equal(game.goalInfo.goalEffectId,'fire');
    assert.equal(game.events.find(event=>event.type==='goal').goalEffectId,'fire');
    player.goalEffectId='classic';
    assert.equal(game.goalInfo.goalEffectId,'fire','menu changes cannot alter a goal already scored');
    const replay=recorder.snapshot('complete').replay,frame=replayFrame(replay,replay.duration);
    assert.equal(frame.goalInfo.scorerId,player.id);assert.equal(frame.goalInfo.goalEffectId,'fire');
  }
});

test('own goals, uncredited goals and unknown effect IDs use classic confetti',()=>{
  const own=scoringFixture({team:'blue'});
  assert.equal(own.game.goalInfo.scorerId,null);assert.equal(own.game.goalInfo.ownGoalId,own.player.id);
  assert.equal(own.game.goalInfo.goalEffectId,'classic');
  const unknown=scoringFixture({effect:'unknown'});assert.equal(unknown.game.goalInfo.goalEffectId,'classic');
  const game=new Match({size:1,spectator:true,seed:9});game.state='playing';game.engine.kickoff=null;
  Object.assign(game.engine.ball,{x:game.pitch.right+9,y:game.pitch.height/2,vx:0,vy:0});game.update(STEP);
  assert.equal(game.goalInfo.scorerId,null);assert.equal(game.goalInfo.goalEffectId,'classic');
});

test('private rooms share, sanitize and preserve goal customization across rematches',async()=>{
  const server=http.createServer(),stop=attachOnline(server,{duration:.15,goldenGoal:false});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const clients=[],url=`ws://127.0.0.1:${server.address().port}/online`;
  async function connect(){
    const ws=new WebSocket(url),messages=[];ws.on('message',buffer=>messages.push(JSON.parse(buffer)));
    await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
    const client={ws,messages,send:value=>ws.send(JSON.stringify(value)),async wait(predicate){
      const deadline=Date.now()+6500;
      while(Date.now()<deadline){const found=messages.findLast(predicate);if(found)return found;await sleep(10);}
      throw Error('Private goal customization timed out');
    }};
    clients.push(client);return client;
  }
  try{
    const host=await connect(),friend=await connect();
    host.send({type:'create',name:'Fire scorer',size:1,team:'red',goalEffectId:'fire'});
    const lobby=await host.wait(message=>message.type==='lobby');
    let state=await host.wait(message=>message.type==='state');
    assert.equal(state.state.players.find(player=>player.id===state.id).goalEffectId,'fire');
    friend.send({type:'join',name:'Classic scorer',team:'blue',code:lobby.code,goalEffectId:'untrusted-effect'});
    const joined=await friend.wait(message=>message.type==='state');
    assert.equal(joined.state.players.find(player=>player.id===joined.id).goalEffectId,'classic');
    friend.send({type:'goal-effect',goalEffectId:'fire'});
    await host.wait(message=>message.type==='state'&&message.state.players.some(player=>player.name==='Classic scorer'&&player.goalEffectId==='fire'));
    host.send({type:'goal-effect',goalEffectId:{src:'untrusted'}});
    await host.wait(message=>message.type==='state'&&message.state.players.find(player=>player.name==='Fire scorer')?.goalEffectId==='classic');
    host.send({type:'goal-effect',goalEffectId:'fire'});
    state=await host.wait(message=>message.type==='state'&&message.state.players.filter(player=>player.human).every(player=>player.goalEffectId==='fire'));
    host.send({type:'start'});
    const first=await host.wait(message=>message.type==='state'&&message.matchId!==state.matchId&&message.state.state==='kickoff');
    assert.ok(first.state.players.filter(player=>player.human).every(player=>player.goalEffectId==='fire'));
    await host.wait(message=>message.type==='state'&&message.matchId===first.matchId&&message.state.state==='ended');
    host.send({type:'start'});
    const rematch=await friend.wait(message=>message.type==='state'&&message.matchId!==first.matchId&&message.matchId!==state.matchId&&message.state.state==='kickoff');
    assert.ok(rematch.state.players.filter(player=>player.human).every(player=>player.goalEffectId==='fire'));
  }finally{
    for(const client of clients)client.ws.terminate();stop();await new Promise(resolve=>server.close(resolve));
  }
});
