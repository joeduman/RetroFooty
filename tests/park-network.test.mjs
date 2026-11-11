import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {WebSocket} from 'ws';import {attachPark} from '../park.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('park WebSockets enforce slot capacity, input identity, state isolation, stale-input timeout and bot takeover',async()=>{
 const server=http.createServer(),stop=attachPark(server),clients=[];await new Promise(r=>server.listen(0,'127.0.0.1',r));
 async function client(name){const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/park`),messages=[];ws.on('message',b=>messages.push(JSON.parse(b)));await new Promise(r=>ws.on('open',r));const c={ws,messages,send:m=>ws.send(JSON.stringify(m)),async wait(fn){const deadline=Date.now()+7000;while(Date.now()<deadline){const i=messages.findIndex(fn);if(i>=0)return messages.splice(i,1)[0];await sleep(5);}throw Error('Network timeout');}};clients.push(c);c.send({type:'login',name});c.id=(await c.wait(m=>m.type==='welcome')).id;return c;}
 try{
 const a=await client('A'),b=await client('B'),other=await client('Other'),extra=await client('Extra');
 a.send({type:'join',size:1,team:'red'});await a.wait(m=>m.type==='joined');b.send({type:'join',size:1,team:'blue'});await b.wait(m=>m.type==='joined');other.send({type:'join',size:5,team:'red'});await other.wait(m=>m.type==='joined');
 extra.send({type:'join',size:1,team:'red'});assert.match((await extra.wait(m=>m.type==='error')).message,/full/);
 const start=await a.wait(m=>m.type==='state'&&m.phase==='match'&&m.state.state==='playing');assert.equal(start.state.players.filter(p=>p.human).length,2);
 const initialY=start.state.players.find(p=>p.id===start.id).y;
 a.send({type:'input',seq:1,input:{x:0,y:-1,aimX:1,aimY:0,sprint:true,shoot:false},playerId:2});
 await a.wait(m=>m.type==='state'&&m.ack===1&&m.state.players.find(p=>p.id===m.id).y<initialY-15);
 a.send({type:'input',seq:0,input:{x:0,y:1,aimX:1,aimY:0,sprint:false,shoot:false}});
 const stalled=await a.wait(m=>m.type==='state'&&m.ack===1&&m.state.players.find(p=>p.id===m.id).input.y===0);assert.equal(stalled.state.players.find(p=>p.id!==mId(start)).input.y,0);
 function mId(m){return m.id;}
 assert.ok(other.messages.filter(m=>m.type==='state').every(m=>m.field===5&&m.state.players.length===10));
 const matchId=stalled.matchId;b.ws.close();const replacement=await a.wait(m=>m.type==='state'&&m.matchId===matchId&&m.state.players.filter(p=>p.human).length===1);assert.equal(replacement.matchId,matchId);
 extra.send({type:'join',size:1,team:'blue'});const rejoin=await extra.wait(m=>m.type==='state');assert.equal(rejoin.matchId,matchId);assert.equal(rejoin.state.players.find(p=>p.id===rejoin.id).team,'blue');
 a.send({type:'leave'});await a.wait(m=>m.type==='returned');a.send({type:'join',size:2,team:'blue'});assert.equal((await a.wait(m=>m.type==='state'&&m.field===2)).state.players.length,4);
 }finally{for(const c of clients)c.ws.terminate();stop();await new Promise(r=>server.close(r));}
});
