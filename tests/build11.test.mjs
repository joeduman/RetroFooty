import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {WebSocket} from 'ws';
import {attachOnline} from '../online.mjs';
import {Match} from '../public/js/match.mjs';
import {OnlinePrediction} from '../public/js/online-prediction.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fixture(options){
 const server=http.createServer(),stop=attachOnline(server,options),clients=[];
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {async client(){const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/online`),messages=[];ws.on('message',b=>messages.push(JSON.parse(b)));await new Promise(r=>ws.on('open',r));clients.push(ws);return {ws,messages,send:m=>ws.send(JSON.stringify(m)),async wait(fn){const deadline=Date.now()+6000;while(Date.now()<deadline){const i=messages.findIndex(fn);if(i>=0)return messages.splice(i,1)[0];await sleep(5);}throw Error('Message timeout');}};},async close(){clients.forEach(c=>c.terminate());stop();await new Promise(r=>server.close(r));}};
}
for(const size of [1,2,3,4,5])test(`${size}v${size}: selectable teams, capacity and bot fill`,async()=>{
 const f=await fixture();try{
 const host=await f.client();host.send({type:'create',name:'Host',size,team:'red'});const lobby=await host.wait(m=>m.type==='lobby');
 const initial=await host.wait(m=>m.type==='state');assert.equal(initial.state.players.length,2*size);assert.equal(initial.state.players.filter(p=>!p.human).length,2*size-1);
 for(let i=1;i<2*size;i++){const c=await f.client();const team=i<size?'red':'blue';c.send({type:'join',name:'Player'+i,code:lobby.code,team});const state=await c.wait(m=>m.type==='state');assert.equal(state.state.players.find(p=>p.id===state.id).team,team);assert.equal(state.state.players.filter(p=>p.human).length,i+1);}
 const extra=await f.client();extra.send({type:'join',code:lobby.code,team:'blue'});assert.match((await extra.wait(m=>m.type==='error')).message,/full/);
 host.send({type:'team',team:'blue'});assert.match((await host.wait(m=>m.type==='error')).message,/full/);
 }finally{await f.close();}
});
test('team switching, host-only start, reports, rematch reset and ping',async()=>{
 const f=await fixture({duration:.25,goldenGoal:false});try{
 const h=await f.client(),friend=await f.client();h.send({type:'create',name:'Joey',size:2,team:'red'});const lobby=await h.wait(m=>m.type==='lobby');
 h.send({type:'team',team:'blue'});await h.wait(m=>m.type==='state'&&m.state.players.find(p=>p.id===m.id).team==='blue');
 friend.send({type:'join',name:'Rival',team:'red',code:lobby.code});await friend.wait(m=>m.type==='state');
 friend.send({type:'start'});await friend.wait(m=>m.type==='error'&&/host/.test(m.message));
 h.send({type:'ping',at:42});assert.equal((await h.wait(m=>m.type==='pong')).at,42);
 h.send({type:'start'});const start=await h.wait(m=>m.type==='state'&&m.state.state==='kickoff');
 h.send({type:'team',team:'red'});await h.wait(m=>m.type==='error'&&/Change teams/.test(m.message));
 const ended=await h.wait(m=>m.type==='state'&&m.state.state==='ended');assert.equal(ended.matchId,start.matchId);
 const report=await h.wait(m=>m.type==='report'&&m.report.elapsed>=.25-1e-8);
 const other=await friend.wait(m=>m.type==='report'&&m.report.elapsed>=.25-1e-8);assert.deepEqual(report.report,other.report);
 assert.equal(report.report.players.find(p=>p.name==='Joey').human,true);
 for(const p of report.report.players)assert.ok(Math.abs(p.heat.reduce((a,b)=>a+b,0)-report.report.elapsed)<1e-6);
 h.send({type:'start'});const rematch=await h.wait(m=>m.type==='state'&&m.matchId!==start.matchId&&m.state.state==='kickoff');assert.equal(rematch.state.tracker.elapsed,0);assert.equal(rematch.state.players.filter(p=>p.human).length,2);
 }finally{await f.close();}
});
function predictionFixture(){const m=new Match({size:1,team:'red'});m.state='playing';const state=structuredClone({pitch:m.pitch,players:m.players,engine:{ball:m.engine.ball},state:'playing',score:m.score});const p=state.players[0];p.x=500;p.y=350;state.players[1].x=1000;state.players[1].y=500;state.engine.ball.x=800;state.engine.ball.y=500;return {state,p};}
test('prediction immediately kicks and collides without changing authoritative state',()=>{
 const {state,p}=predictionFixture();state.engine.ball.x=p.x+28;state.engine.ball.y=p.y;
 const original=structuredClone(state),prediction=new OnlinePrediction();prediction.receive({matchId:'a',id:p.id,ack:-1,state},1000,100);
 prediction.input(0,{x:1,y:0,aimX:1,aimY:0,sprint:true,shoot:true},950);
 const v=prediction.project(1016);assert.ok(v.engine.ball.vx>400);assert.ok(v.engine.ball.x>state.engine.ball.x);assert.deepEqual(state,original);
 assert.ok(Math.hypot(v.human.x-v.engine.ball.x,v.human.y-v.engine.ball.y)>=p.radius+v.engine.ball.radius-.1);
});
test('prediction respects player collisions, walls and posts at 0–200 ms RTT',()=>{
 for(const rtt of [0,40,100,200])for(const kind of ['player','wall','post']){
 const {state,p}=predictionFixture();p.vx=330;p.input={x:1,y:0,aimX:1,aimY:0,sprint:true,shoot:false};
 if(kind==='player'){state.players[1].x=p.x+37;state.players[1].y=p.y;}
 if(kind==='wall'){p.y=150;p.x=state.pitch.right+state.pitch.runoff-p.radius-1;}
 if(kind==='post'){p.y=state.pitch.goalTop;p.x=state.pitch.right-p.radius-state.pitch.postRadius-1;}
 const prediction=new OnlinePrediction();prediction.receive({matchId:'a',id:p.id,ack:-1,state},1000,rtt);const v=prediction.project(1050);
 if(kind==='player')assert.ok(Math.hypot(v.players[1].x-v.human.x,v.players[1].y-v.human.y)>=2*p.radius-.1);
 if(kind==='wall')assert.ok(v.human.x<=state.pitch.right+state.pitch.runoff-p.radius+.01);
 if(kind==='post')assert.ok(Math.hypot(v.human.x-state.pitch.right,v.human.y-state.pitch.goalTop)>=p.radius+state.pitch.postRadius-.01);
 }
});
test('acks remove applied inputs, reset clears prediction, stalls stop extrapolation',()=>{
 const {state,p}=predictionFixture(),prediction=new OnlinePrediction();const msg={matchId:'a',id:p.id,ack:-1,state};prediction.receive(msg,1000,100);prediction.input(4,{...p.input,x:1},1001);prediction.receive({...msg,ack:4},1020,100);assert.equal(prediction.pending.length,0);
 prediction.input(5,{...p.input,x:1},1021);prediction.receive({...msg,matchId:'b'},1030);assert.equal(prediction.pending.length,0);assert.equal(prediction.project(1400).human.x,p.x);
});
