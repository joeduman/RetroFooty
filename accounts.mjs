// Build 13 local account service. External password login requires HTTPS termination.
import fs from 'node:fs';import path from 'node:path';
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
const base=path.join(process.cwd(),'server-data'),file=path.join(base,'accounts.json');
const token=()=>randomBytes(32).toString('base64url'),emailPattern=/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const blank=()=>({games:0,wins:0,losses:0,draws:0,goals:0,assists:0,ownGoals:0,shots:0,onTarget:0,passes:0,
  passAttempts:0,kicks:0,interceptions:0,touches:0,distance:0,sprintSeconds:0,heat:Array(24*14).fill(0),shotMap:[],passMap:[],bySize:{}});
export class Accounts{
 constructor(){fs.mkdirSync(base,{recursive:true});this.db={version:1,users:[]};this.sessions=new Map();this.rate=new Map();
  try{const d=JSON.parse(fs.readFileSync(file,'utf8'));if(d.version===1&&Array.isArray(d.users))this.db=d;}catch{}
 }
 persist(){const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(this.db,null,2),{mode:0o600});fs.renameSync(temp,file);}
 hash(password,salt){return scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString('hex');}
 secureRequest(req){return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||
  (process.env.TEAMBALL_HTTPS_PROXY==='1'&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&req.headers['x-forwarded-proto']==='https');}
 get(req){const cookie=req.headers.cookie||'',hit=cookie.match(/(?:^|;\s*)teamball_session=([A-Za-z0-9_-]+)/);
  if(!hit)return null;const session=this.sessions.get(hit[1]);if(!session)return null;if(session.expires<Date.now()){this.sessions.delete(hit[1]);return null;}
  return this.db.users.find(x=>x.id===session.id)||null;
 }
 session(res,req,user){const t=token(),secure=req.headers['x-forwarded-proto']==='https'||Boolean(req.socket.encrypted);
  this.sessions.set(t,{id:user.id,expires:Date.now()+7*86400000});
  res.setHeader('Set-Cookie',`teamball_session=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure?'; Secure':''}`);
 }
 respond(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
 getBody(req,cb){let total=0,chunks=[];req.on('data',buf=>{total+=buf.length;if(total>4096){req.destroy();return;}chunks.push(buf);});
  req.on('end',()=>{try{cb(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{cb(null);}});}
 rateOK(req){const ip=req.socket.remoteAddress,now=Date.now(),r=this.rate.get(ip)||{start:now,count:0};if(now-r.start>60000){r.start=now;r.count=0;}r.count++;this.rate.set(ip,r);return r.count<=15;}
 stats(user){const {passwordHash,salt,...safe}=user;return safe;}
 handle(req,res){const pathname=new URL(req.url,'http://localhost').pathname;if(!pathname.startsWith('/api/account/'))return false;
  if(!this.secureRequest(req)){this.respond(res,403,{error:'Account passwords require HTTPS. Guest play is still available.'});return true;}
  const action=pathname.split('/').at(-1);
  if(req.method==='GET'&&action==='me'){const user=this.get(req);this.respond(res,200,user?{account:this.stats(user)}:{account:null});return true;}
  if(req.method==='GET'&&action==='stats'){const user=this.get(req);this.respond(res,user?200:401,user?{account:this.stats(user)}:{error:'Sign in first'});return true;}
  if(req.method==='POST'&&action==='logout'){const t=(req.headers.cookie||'').match(/teamball_session=([A-Za-z0-9_-]+)/)?.[1];if(t)this.sessions.delete(t);res.setHeader('Set-Cookie','teamball_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');this.respond(res,200,{ok:true});return true;}
  if(req.method==='POST'&&(action==='register'||action==='login')){
   if(!this.rateOK(req)){this.respond(res,429,{error:'Too many attempts; try again later'});return true;}
   this.getBody(req,d=>{
    if(!d){this.respond(res,400,{error:'Invalid JSON'});return;}
    const email=String(d.email||'').trim().toLowerCase(),password=String(d.password||''),name=String(d.name||'').trim().slice(0,16);
    if(!emailPattern.test(email)||password.length<12||password.length>128){this.respond(res,400,{error:'Provide a valid email and a password of at least 12 characters.'});return;}
    let user=this.db.users.find(u=>u.email===email);
    if(action==='register'){
     if(user){this.respond(res,409,{error:'Account already exists'});return;}
     if(!name){this.respond(res,400,{error:'Choose a player name'});return;}
     const salt=randomBytes(16).toString('hex');user={id:token(),email,name,salt,passwordHash:this.hash(password,salt),created:Date.now(),stats:blank()};this.db.users.push(user);this.persist();
    }else{
     const calculated=this.hash(password,user?.salt||'0'.repeat(32)),stored=Buffer.from(user?.passwordHash||'0'.repeat(128),'hex'),provided=Buffer.from(calculated,'hex');
     if(!user||!timingSafeEqual(stored,provided)){this.respond(res,401,{error:'Invalid email or password'});return;}
    }
    this.session(res,req,user);this.respond(res,200,{account:this.stats(user)});
   });return true;
  }
  this.respond(res,404,{error:'Unknown account endpoint'});return true;
 }
 record(f){const game=f.game,score=game.score,report=game.report();let changed=false;
  for(const c of f.members){if(!c.accountId)continue;const user=this.db.users.find(u=>u.id===c.accountId);if(!user)continue;
   const p=report.players.find(v=>v.id===c.slot);if(!p)continue;const s=user.stats??=blank();s.games++;
   if(score[c.team]===score[c.team==='red'?'blue':'red'])s.draws++;else if(score[c.team]>score[c.team==='red'?'blue':'red'])s.wins++;else s.losses++;
   for(const key of ['goals','assists','ownGoals','shots','onTarget','passes','passAttempts','kicks','interceptions','touches','distance','sprintSeconds'])s[key]=(s[key]||0)+(p[key]||0);
   for(let i=0;i<s.heat.length;i++)s.heat[i]+=(p.heat||[])[i]||0;
   s.shotMap.push(...(p.shotMap||[]).map(o=>({...o,size:f.size})));s.shotMap=s.shotMap.slice(-300);
   s.passMap.push(...(p.passMap||[]).map(o=>({...o,size:f.size})));s.passMap=s.passMap.slice(-300);
   s.bySize[f.size]??={games:0,wins:0,goals:0};s.bySize[f.size].games++;s.bySize[f.size].goals+=p.goals;if(score[c.team]>score[c.team==='red'?'blue':'red'])s.bySize[f.size].wins++;
   changed=true;
  }
  if(changed)this.persist();
 }
}
