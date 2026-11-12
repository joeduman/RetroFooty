const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

if (Number(process.versions.node.split('.')[0]) < 20) {
  console.error('RetroFooty requires Node.js 20 or later. Install the current LTS from https://nodejs.org.');
  process.exit(1);
}
const token = crypto.randomBytes(24).toString('hex');
const statePath = path.join(__dirname, '.teamball-server.json');
const port = Number(process.env.PORT) || 25568;

const publicDir = path.join(__dirname, 'public');
let economy=null,ranked=null,accounts=null,learning=null,activeMemory=null,closeTrainer=()=>{},closeNeuralTrainer=()=>{};
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav'
};

const server = http.createServer((req, res) => {
  const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  if(accounts?.handle(req,res))return;
  if(req.url==='/api/ranked/leaderboard'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({season:ranked?.db.season,players:ranked?.leaderboard()||[]}));return;}
  if(req.url==='/_teamball/ranked/season'&&req.method==='POST'){
   if(!local||req.headers.authorization!=='Bearer '+token){res.writeHead(403).end('Local administration token required');return;}
   let body='';req.on('data',b=>{body+=b;if(body.length>1024)req.destroy();});req.on('end',()=>{try{const result=ranked.rollover(JSON.parse(body).season);res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(result));}catch(e){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:e.message}));}});return;
  }
  if(req.url.startsWith('/api/bots/policy')&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({policy:learning?.policy()||null,contexts:learning?.memory.contexts||{},activeReferences:activeMemory?.memory.references||{}}));return;}
  if(req.url==='/api/bots/status'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(learning?.status()||{}));return;}
  if (req.url.startsWith('/_teamball/') && !local) { res.writeHead(403).end('Local administration only'); return; }
  if(req.url === '/_teamball/ai/active'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({status:activeMemory?.status()||null,memory:activeMemory?.memory||null}));return;}
  if(req.url === '/_teamball/ai/active'&&req.method==='POST'){
    if(req.headers.authorization!=='Bearer '+token){res.writeHead(403).end('Invalid administration token');return;}
    let body='',oversized=false;
    req.on('data',chunk=>{body+=chunk;if(body.length>16000){oversized=true;req.destroy();}});
    req.on('end',()=>{
      if(oversized)return;
      try{
        if(!activeMemory)throw Error('Active match memory is starting');
        const change=JSON.parse(body);let result;
        if(change.action==='approve')result=activeMemory.approve(change.ids,{reviewed:change.reviewed,notes:change.notes});
        else if(change.action==='import')result=activeMemory.importCandidate(change.candidate);
        else if(change.action==='reject'){activeMemory.reject(change.ids,change.reason);result=activeMemory.status();}
        else if(change.action==='rollback')result=activeMemory.rollback(change.version);
        else throw Error('Unknown active memory action');
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(result));
      }catch(error){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message}));}
    });return;
  }
  if (req.url === '/_teamball/ai/export'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Content-Disposition':'attachment; filename=teamball-bot-memory.v1.json','Cache-Control':'no-store'}).end(JSON.stringify(learning?.memory||{}));return;}
  if (req.url === '/_teamball/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ app: 'teamball', build: '15', root: __dirname, pid: process.pid }));
    return;
  }
  if (req.url === '/_teamball/stop' && req.method === 'POST') {
    if (req.headers.authorization !== 'Bearer ' + token) { res.writeHead(403).end('Invalid stop token'); return; }
    res.writeHead(200).end('RetroFooty stopped.');
    setTimeout(shutdown, 30);
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end('Method not allowed'); return; }
  let requestPath;
  try {
    requestPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }

  const relativePath = requestPath === '/' ? 'index.html' : requestPath.slice(1);
  const filePath = path.resolve(publicDir, relativePath);
  if (!filePath.startsWith(publicDir + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500).end('File not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

function cleanState() {
  try { if (JSON.parse(fs.readFileSync(statePath, 'utf8')).pid === process.pid) fs.unlinkSync(statePath); } catch {}
}
function shutdown() {
  closeNeuralTrainer();closeTrainer();closeOnline();learning?.save();cleanState(); server.close(() => process.exit(0)); server.closeAllConnections();
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown); process.on('exit', cleanState);
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? `Port ${port} is already in use. Run STOP-TEAMBALL.cmd in the folder of the running copy.\nFor an older build, see Teamball-PowerShell-Commands.txt. Nothing was replaced or stopped.`
    : error.message);
  process.exit(1);
});
let closeOnline=()=>{};
Promise.all([import('./online.mjs'),import('./park.mjs'),import('./accounts.mjs'),import('./bot-learning.mjs'),import('./bot-trainer.mjs'),import('./neural-training-manager.mjs'),import('./active-match-store.mjs'),import('./ranked.mjs'),import('./economy.mjs')]).then(([{attachOnline},{attachPark},{Accounts},{BotMemoryStore},{startTrainer},{startNeuralTrainer},{ActiveMatchStore},{RankedStore},{EconomyStore}])=>{
economy=new EconomyStore();ranked=new RankedStore();accounts=new Accounts();learning=new BotMemoryStore();activeMemory=new ActiveMatchStore();
const opts={learning,accounts,activeMemory,ranked,economy};
const closeRooms=attachOnline(server,opts),closePark=attachPark(server,opts);
closeTrainer=startTrainer(learning,closePark,closeRooms);
closeNeuralTrainer=startNeuralTrainer(learning,closePark,closeRooms);
closeOnline=()=>{closeRooms();closePark();};
server.on('upgrade',(req,socket)=>{if(!['/park','/online'].includes(req.url))socket.destroy();});
server.listen(port, '0.0.0.0', () => {
  fs.writeFileSync(statePath, JSON.stringify({ app: 'teamball', build: '15', pid: process.pid, port, root: __dirname, token }), { mode: 0o600 });
  console.log(`\nRETROFOOTY - BUILD 15 OVERNIGHT TRAINING\nhttp://localhost:${port}\nServing: ${publicDir}\nStop: double-click STOP-TEAMBALL.cmd, or run node stop.js\n`);
  if (process.argv.includes('--open')) {
    const url = `http://localhost:${port}/?build=15`;
    if (process.platform === 'win32') spawn('cmd.exe', ['/d', '/c', 'start', '""', url], { stdio: 'ignore' });
    else if (process.platform === 'darwin') spawn('open', [url], { stdio: 'ignore' }).on('error', () => {});
  }
});

}).catch(error=>{console.error(error);process.exit(1);});
