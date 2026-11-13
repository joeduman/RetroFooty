// Static development viewer only. No trainers, game server or accounts started.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';
const root=fileURLToPath(new URL('../public/',import.meta.url)),port=Number(process.env.AI_VIEWER_PORT||3168);
const url=`http://127.0.0.1:${port}/dev-ai.html`;
function ready(alreadyRunning=false){
 console.log(`${alreadyRunning?'AI viewer already running':'AI viewer'}: ${url}`);
 if(process.argv.includes('--open')){
  const command=process.platform==='win32'?'cmd.exe':process.platform==='darwin'?'open':'xdg-open';
  const args=process.platform==='win32'?['/d','/c','start','',url]:[url];
  const browser=spawn(command,args,{windowsHide:true,stdio:'ignore'});browser.on('error',()=>console.log('Open the viewer URL above in your browser.'));browser.unref();
 }
}
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.csv':'text/csv','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8'};
const server=http.createServer((req,res)=>{let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
 if(pathname==='/__ai-viewer-health'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({app:'teamball-ai-viewer',root}));return;}
 const target=path.resolve(root,'.'+(pathname==='/'?'/dev-ai.html':pathname));if(!target.startsWith(root)){res.writeHead(403).end();return;}
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
 fs.stat(target,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end('File not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});if(req.method==='HEAD')res.end();else fs.createReadStream(target).pipe(res);});
});
server.on('error',async error=>{
 if(error.code==='EADDRINUSE'){
  try{
   const response=await fetch(`http://127.0.0.1:${port}/__ai-viewer-health`,{signal:AbortSignal.timeout(2000)});
   if(response.ok){const health=await response.json();if(health.app==='teamball-ai-viewer'&&health.root===root){ready(true);return;}}
   // Compatibility with a viewer started before the health endpoint existed.
   const expected=JSON.parse(fs.readFileSync(path.join(root,'ai-results/latest.json'),'utf8'));
   const latest=await(await fetch(`http://127.0.0.1:${port}/ai-results/latest.json`,{signal:AbortSignal.timeout(2000)})).json();
   const page=await(await fetch(url,{signal:AbortSignal.timeout(2000)})).text();
   if(latest.id===expected.id&&page.includes('<title>RetroFooty AI laboratory</title>')){ready(true);return;}
  }catch{}
  console.error(`Port ${port} is occupied by another service. Set AI_VIEWER_PORT to an unused port.`);
 }else console.error(error.message);
 process.exitCode=1;
});
server.listen(port,'127.0.0.1',()=>ready());
