import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {WebSocket} from 'ws';import {attachOnline} from '../online.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('two humans share a team and authoritative match; permissions, stale input, disconnect and rejoin',async()=>{
 const server=http.createServer();const stop=attachOnline(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`ws://127.0.0.1:${server.address().port}/online`;const clients=[];
 async function client(){const ws=new WebSocket(url);const messages=[];ws.on('message',b=>messages.push(JSON.parse(b)));await new Promise(r=>ws.on('open',r));const c={ws,messages,send:m=>ws.send(JSON.stringify(m)),async wait(fn){const until=Date.now()+6000;while(Date.now()<until){const m=messages.find(fn);if(m)return m;await sleep(10);}throw Error('Message timeout');}};clients.push(c);return c;}
 try{
 const h=await client(),f=await client(),third=await client();h.send({type:'create',name:'Host',size:2,team:'blue'});const lobby=await h.wait(m=>m.type==='lobby');
 f.send({type:'join',name:'Friend',code:'WRONG'});assert.match((await f.wait(m=>m.type==='error')).message,/not found/);
 f.send({type:'join',name:'Friend',code:lobby.code});const joined=await f.wait(m=>m.type==='state');assert.equal(joined.state.players.filter(p=>p.human).length,2);assert.ok(joined.state.players.filter(p=>p.human).every(p=>p.team==='blue'));assert.equal(joined.state.players.filter(p=>!p.human).length,2);
 third.send({type:'join',name:'Third',code:lobby.code});assert.match((await third.wait(m=>m.type==='error')).message,/team is full/);
 f.send({type:'start'});assert.match((await f.wait(m=>m.type==='error'&&/host/.test(m.message))).message,/host/);
 h.send({type:'start'});await h.wait(m=>m.type==='state'&&m.state.state==='playing');
 const before=await f.wait(m=>m.type==='state'&&m.state.state==='playing');const fp=before.state.players.find(p=>p.id===before.id);let seq=0;
 const timer=setInterval(()=>f.send({type:'input',seq:seq++,input:{x:0,y:-1,aimX:-1,aimY:0,sprint:true,shoot:false},playerId:1}),16);await sleep(450);clearInterval(timer);
 const moved=f.messages.filter(m=>m.type==='state').at(-1).state.players.find(p=>p.id===before.id);assert.ok(moved.y<fp.y-25);assert.ok(moved.stamina<100);
 await sleep(550);const stale=f.messages.filter(m=>m.type==='state').at(-1).state.players.find(p=>p.id===before.id);assert.equal(stale.input.y,0);assert.equal(stale.input.sprint,false);
 const hs=h.messages.filter(m=>m.type==='state');const fs=f.messages.filter(m=>m.type==='state');const common=hs.findLast(m=>fs.some(n=>n.tick===m.tick));const same=fs.find(n=>n.tick===common.tick);assert.deepEqual(common.state,same.state);
 f.ws.close();await sleep(120);const after=h.messages.filter(m=>m.type==='state').at(-1);assert.equal(after.state.players.find(p=>p.id===before.id).human,false);
 const re=await client();re.send({type:'join',name:'Returning',code:lobby.code});const again=await re.wait(m=>m.type==='state');assert.equal(again.id,before.id);assert.equal(again.state.players.filter(p=>p.human).length,2);
 h.ws.close();await re.wait(m=>m.type==='lobby'&&m.host);re.ws.close();await sleep(100);
 third.send({type:'create',name:'New host',team:'red',size:5});const fresh=await third.wait(m=>m.type==='state');assert.equal(fresh.state.players.length,10);assert.equal(fresh.state.players.find(p=>p.id===fresh.id).team,'red');
 }finally{for(const c of clients)c.ws.terminate();stop();await new Promise(r=>server.close(r));}
});
