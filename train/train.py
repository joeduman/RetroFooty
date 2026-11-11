#!/usr/bin/env python3
"""Offline imitation + on-policy REINFORCE trainer for real Teamball simulations.

Requires only numpy and Node.js 20+. DOES NOT load or alter accounts or network passwords.
Workers check a park activity marker before executing expensive simulations.
Promotes nothing without beating the champion in a mirrored tournament.
"""
from __future__ import annotations
import argparse, gzip, json, math, os, pathlib, subprocess, sys, time
from training_lock import exclusive_training_lock
import numpy as np
from torch_backend import TorchNetwork,select_device

ROOT=pathlib.Path(__file__).resolve().parent.parent
SCHEMA='teamball.neural-controller.v1'
INPUT, HIDDEN, OUTPUT=24,24,6
RNG=np.random.default_rng(20261109)

def live_players():
    try:
        x=json.loads((ROOT/'bot-memory/server-activity.json').read_text())
        return int(x.get('clients',0))>0 and (time.time()*1000-x.get('at',0))<10000
    except (FileNotFoundError,ValueError,TypeError): return False

def require_idle():
    if live_players(): raise RuntimeError('Human player connected: training cancelled to protect gameplay')
    if os.environ.get('TEAMBALL_OVERNIGHT')=='1' and (ROOT/'bot-memory/overnight-stop.flag').exists():
        raise RuntimeError('Overnight stop requested')

def model_init():
    return dict(w1=RNG.normal(0,.12,(HIDDEN,INPUT)),b1=np.zeros(HIDDEN),w2=RNG.normal(0,.08,(OUTPUT,HIDDEN)),b2=np.zeros(OUTPUT))

def import_model(path):
    if not path.exists():return model_init(),False
    x=json.loads(path.read_text())
    if x.get('schema')!=SCHEMA:raise ValueError('Incompatible model schema; champion untouched')
    weights={k:np.array(x[k],dtype=np.float64) for k in ['w1','b1','w2','b2']}
    if weights['w1'].shape!=(HIDDEN,INPUT) or weights['w2'].shape!=(OUTPUT,HIDDEN) or weights['b1'].shape!=(HIDDEN,) or weights['b2'].shape!=(OUTPUT,):raise ValueError('Invalid champion dimensions')
    if any(not np.isfinite(a).all() for a in weights.values()): raise ValueError('Nonfinite champion weights')
    return weights,True

def serialize(weights,statistics):
    out={"schema":SCHEMA,"inputSize":INPUT,"hiddenSize":HIDDEN,"outputSize":OUTPUT,"strength":.30,"training":statistics}
    for k,v in weights.items():out[k]=np.round(v,7).tolist()
    return out

def run_sim(mode,matches,out,candidate=None,opponent=None,seed=701,opponent_pool=None,video_profiles=None):
    require_idle()
    cmd=['node','train/rollout.mjs','--mode',mode,'--matches',str(matches),'--seed',str(seed),'--out',str(out)]
    if candidate:cmd.extend(['--candidate',str(candidate)])
    if opponent:cmd.extend(['--opponent',str(opponent)])
    if opponent_pool:cmd.extend(['--opponent-pool',str(opponent_pool)])
    if video_profiles:cmd.extend(['--video-profiles',str(video_profiles)])
    started=time.perf_counter()
    subprocess.run(cmd,cwd=ROOT,check=True,stdout=subprocess.DEVNULL)
    print(f'{mode} simulation: {time.perf_counter()-started:.1f}s (CPU)',flush=True)
    require_idle()
    return json.loads(out.read_text())

def pitch(size):
    w,h={1:(1080,660),2:(1230,740),3:(1455,877),4:(1594,974),5:(1744,1049)}[int(size)]
    return dict(left=88,right=w-88,width=w,height=h,top=88,bottom=h-88)

def clip(x):return max(-1.,min(1.,float(x)))

def features_from_frame(frame,row,size):
    p=pitch(size);b=frame['b'];team=row[1];d=(1 if team==0 else -1)*(-1 if frame.get('sidesSwapped',False) else 1)
    w=p['right']-p['left'];h=p['bottom']-p['top'];diag=math.hypot(w,h)
    x,y,vx,vy,stam=row[2:7]
    foes=[q for q in frame['p'] if q[1]!=team];mates=[q for q in frame['p'] if q[1]==team and q[0]!=row[0]]
    foe=min(foes,key=lambda q:math.hypot(x-q[2],y-q[3])) if foes else None
    mate=min(mates,key=lambda q:math.hypot(x-q[2],y-q[3])) if mates else None
    fd=math.hypot(x-foe[2],y-foe[3]) if foe else diag;md=math.hypot(x-mate[2],y-mate[3]) if mate else diag
    bx=(b[0]-p['left'])/w if d==1 else (p['right']-b[0])/w
    px=(x-p['left'])/w if d==1 else (p['right']-x)/w
    def norm(a,base):return clip(a/base)
    return [norm((b[0]-x)*d,w),norm(b[1]-y,h),norm(b[2]*d,550),norm(b[3],550),
        norm(vx*d,330),norm(vy,330),clip(px*2-1),norm(y-p['height']/2,h/2),
        clip(bx*2-1),norm(b[1]-p['height']/2,h/2),max(0,min(1,stam/100)),
        norm((foe[2]-x)*d,w) if foe else 0,norm(foe[3]-y,h) if foe else 0,min(1,fd/diag),
        norm((mate[2]-x)*d,w) if mate else 0,norm(mate[3]-y,h) if mate else 0,min(1,md/diag),
        max(0,min(1,(row[14] if len(row)>14 else 0)/.5)),norm(b[4],6),
        int(b[5]==team) if len(b)>5 else 0,min(1,size/5),min(1,math.hypot(b[0]-x,b[1]-y)/diag),
        norm(-b[2]*d,550),max(0,min(1,(1-bx)*(1-fd/(diag*1.2))))]

def demos(directory,max_files=80,max_samples=28000):
    rows=[];files=sorted((directory/'replays').glob('*.json.gz'),key=lambda p:p.stat().st_mtime,reverse=True)[:max_files]
    for filename in files:
        try:
            if filename.stat().st_size>8_000_000:continue
            with gzip.open(filename,'rt') as f:replay=json.load(f)
            if replay.get('schema')!='teamball-training-replay.v1':continue
            eligible=set(replay.get('eligiblePlayerIds',[]));size=int(replay.get('size',2));goals=[ev for ev in replay.get('events',[]) if ev.get('type')=='goal']
            winner='red' if replay.get('score',{}).get('red',0)>replay.get('score',{}).get('blue',0) else 'blue' if replay.get('score',{}).get('blue',0)>replay.get('score',{}).get('red',0) else None
            # Style labels are derived ONLY from consented human inputs, grouped by player.
            behavior={}
            for fr in replay.get('frames',[]):
                if fr.get('phase')!='playing':continue
                for pr in fr.get('p',[]):
                    if pr[0] not in eligible or len(pr)<14 or pr[7]!=1:continue
                    b=behavior.setdefault(pr[0],{'n':0,'boost':0,'kick':0,'near':0})
                    b['n']+=1;b['boost']+=int(bool(pr[12]));b['kick']+=int(bool(pr[13]))
                    b['near']+=int(math.hypot(pr[2]-fr['b'][0],pr[3]-fr['b'][1])<175)
            styles={}
            for pid,b in behavior.items():
                n=max(1,b['n']);boost=b['boost']/n;near=b['near']/n;kick=b['kick']/n
                styles[pid]='pressing' if near>.28 and boost>.17 else 'technical' if kick>.025 or near>.36 else 'patient'
            for fr in replay.get('frames',[]):
                if fr.get('phase')!='playing':continue
                for p in fr.get('p',[]):
                    if p[0] not in eligible or len(p)<14 or p[7]!=1:continue
                    team='red' if p[1]==0 else 'blue';d=(1 if p[1]==0 else -1)*(-1 if fr.get('sidesSwapped',False) else 1)
                    in_goal_sequence=any(e.get('team')==team and 0<=float(e.get('t',0))-fr['t']<=4 for e in goals)
                    weight=2.6*(1.5 if team==winner else 1.0)*(1.65 if in_goal_sequence else 1.0)
                    rows.append(dict(x=features_from_frame(fr,p,size),y=[clip(p[8]*d),clip(p[9]),clip(p[10]*d),clip(p[11]),p[12],p[13]],weight=weight,source='human',style=styles.get(p[0],'patient')))
                    if len(rows)>=max_samples:return rows
        except (OSError,ValueError,KeyError,IndexError,TypeError):continue
    return rows

class Network:
    def __init__(self,weights):
        self.w={k:v.copy() for k,v in weights.items()};self.m={k:np.zeros_like(v) for k,v in self.w.items()};self.v={k:np.zeros_like(v) for k,v in self.w.items()};self.step=0
    def forward(self,x):
        h=np.tanh(x@self.w['w1'].T+self.w['b1']);z=h@self.w['w2'].T+self.w['b2'];z=np.clip(z,-18,18)
        out=np.concatenate((np.tanh(z[:,:4]),1/(1+np.exp(-z[:,4:]))),axis=1)
        return h,out
    def backward(self,x,h,out,dz,lr=.002):
        dz=np.nan_to_num(np.clip(dz,-2,2));dw2=dz.T@h;db2=np.sum(dz,axis=0)
        dz1=(dz@self.w['w2'])*(1-h*h);dw1=dz1.T@x;db1=dz1.sum(axis=0)
        gs={'w1':dw1,'b1':db1,'w2':dw2,'b2':db2}
        norm=math.sqrt(sum(float(np.sum(g*g)) for g in gs.values()));factor=min(1,4/(norm+1e-9));self.step+=1
        for k,g in gs.items():
            g=g*factor;self.m[k]=.9*self.m[k]+.1*g;self.v[k]=.999*self.v[k]+.001*g*g
            self.w[k]-=lr*(self.m[k]/(1-.9**self.step))/(np.sqrt(self.v[k]/(1-.999**self.step))+1e-8)
    def supervised(self,data,epochs=8,batch=256):
        if not data:return
        xs=np.asarray([r['x'] for r in data],dtype=np.float64);ys=np.asarray([r['y'] for r in data],dtype=np.float64)
        weights=np.asarray([r.get('weight',1) for r in data]);n=len(data)
        for epoch in range(epochs):
            require_idle()
            order=RNG.permutation(n)
            for indices in np.array_split(order,max(1,math.ceil(n/batch))):
                x=xs[indices];y=ys[indices];w=weights[indices];w=w/(np.mean(w)+1e-9)
                h,out=self.forward(x);dz=np.empty_like(out)
                dz[:,:4]=(out[:,:4]-y[:,:4])*(1-out[:,:4]**2)*w[:,None]/len(x)
                dz[:,4:]=(out[:,4:]-y[:,4:])*w[:,None]/len(x)*.7
                self.backward(x,h,out,dz,lr=.003 if epoch<3 else .0015)
    def reinforce(self,data,epochs=2,batch=512):
        if not data:return
        xs=np.asarray([r['x'] for r in data],dtype=np.float64);ys=np.asarray([r['y'] for r in data],dtype=np.float64)
        adv=np.asarray([r['advantage'] for r in data],dtype=np.float64);adv=np.clip((adv-adv.mean())/(adv.std()+.3),-3,3)
        if adv.std()<.01:return
        for _ in range(epochs):
            require_idle()
            for indices in np.array_split(RNG.permutation(len(data)),max(1,math.ceil(len(data)/batch))):
                x=xs[indices];y=ys[indices];a=adv[indices];h,out=self.forward(x)
                dz=np.zeros_like(out);std=.23
                dz[:,:4]=-(a[:,None]*(y[:,:4]-out[:,:4])/(std*std))*(1-out[:,:4]**2)/len(x)*.08
                dz[:,4:]=-(a[:,None]*(y[:,4:]-out[:,4:]))/len(x)*.11
                self.backward(x,h,out,dz,lr=.0003)

def main():
    p=argparse.ArgumentParser();p.add_argument('--cycles',type=int,default=1);p.add_argument('--teacher-matches',type=int,default=10)
    p.add_argument('--selfplay-matches',type=int,default=10);p.add_argument('--benchmark-matches',type=int,default=20)
    p.add_argument('--device',choices=['auto','cpu','cuda'],default=os.environ.get('TEAMBALL_TRAIN_DEVICE','auto'));p.add_argument('--imitation-epochs',type=int,default=12);p.add_argument('--dry-run',action='store_true');a=p.parse_args()
    device,device_name=select_device(a.device)
    print('Training device: '+device_name,flush=True)
    make_network=lambda weights:TorchNetwork(weights,device=device,idle_check=require_idle) if device=='cuda' else Network(weights)
    os.chdir(ROOT);directory=ROOT/'bot-memory';models=directory/'models';models.mkdir(parents=True,exist_ok=True)
    # Windows Below-Normal priority; Unix nice 10. Does not affect Node server.
    try:
        if sys.platform=='win32':
            import ctypes
            ctypes.windll.kernel32.SetPriorityClass(ctypes.windll.kernel32.GetCurrentProcess(),0x4000)
        else:os.nice(10)
    except (OSError,AttributeError):pass
    for cycle in range(max(1,min(100,a.cycles))):
        require_idle()
        champion=models/'champion.v1.json';challenger=models/'challenger.v1.json';state_file=models/'trainer-state.json'
        try:state=json.loads(state_file.read_text())
        except (FileNotFoundError,ValueError):state={'attempts':0,'bestRating':-1e9}
        attempt=state.get('attempts',0)+1;state['attempts']=attempt
        global RNG
        RNG=np.random.default_rng(20261109+attempt*7919)
        # Keep refining a rejected challenger instead of retraining the exact same
        # failed candidate every idle cycle. Every fifth cycle tries a fresh path.
        starting=challenger if challenger.exists() and attempt%5!=0 else champion
        weights,_=import_model(starting);has_champion=champion.exists()
        net=make_network(weights);human=demos(directory)
        print(f'Cycle {attempt}: {len(human)} human samples, champion={has_champion}, start={starting.name}',flush=True)
        teacher_file=models/'teacher-rollout.json';teacher=run_sim('expert',a.teacher_matches,teacher_file,seed=900+attempt*101)
        expert=[{**r,'weight':.85,'source':'expert'} for r in teacher['samples']]
        # Real consenting human games get greater learning priority than scripted examples.
        net.supervised((expert+human),epochs=max(1,min(40,a.imitation_epochs)))
        # Maintain an opt-in human playstyle opponent pool across versions.
        # Each model uses the exact six-button action output of the real game.
        style_dir=models/'human-styles';style_dir.mkdir(exist_ok=True)
        style_summary={}
        for style in ('pressing','technical','patient'):
            examples=[row for row in human if row.get('style')==style]
            if len(examples)<64:continue
            # Warm-start from previous style model, or an established champion.
            target=style_dir/(style+'.v1.json')
            start=target if target.exists() else champion
            sw,_=import_model(start)
            style_net=make_network(sw)
            style_net.supervised(expert[:min(320,len(expert))]+examples,epochs=7)
            target.write_text(json.dumps(serialize(style_net.w,{'source':'consented-human-replay','style':style,'samples':len(examples),'at':time.time()}),separators=(',',':')))
            style_summary[style]=len(examples)
        print('Human-style opponent models: '+json.dumps(style_summary),flush=True)
        candidate=models/'candidate.v1.json';statistics={'version':'15','device':device,'deviceName':device_name,'humanSamples':len(human),'expertSamples':len(expert),'rlSamples':0,'source':'imitation+real-match-policy-gradient','at':time.time()}
        candidate.write_text(json.dumps(serialize(net.w,statistics),separators=(',',':')))
        if a.selfplay_matches:
            rollfile=models/'selfplay-rollout.json';r=run_sim('selfplay',a.selfplay_matches,rollfile,candidate,champion if has_champion else None,seed=1200+attempt*101,opponent_pool=style_dir,video_profiles=directory/'video-profiles')
            episodes=r['samples'];net.reinforce(episodes,epochs=3);statistics['rlSamples']=len(episodes)
            candidate.write_text(json.dumps(serialize(net.w,statistics),separators=(',',':')))
        if a.dry_run:
            state_file.write_text(json.dumps(state,indent=2))
            print('Dry run: candidate saved but NOT promoted',flush=True);continue
        bfile=models/'candidate-benchmark.json';b=run_sim('benchmark',max(8,a.benchmark_matches),bfile,candidate,champion if has_champion else None,seed=9900+attempt*101)
        outcome=b['benchmark'];print('Benchmark: '+json.dumps(outcome),flush=True)
        if outcome['passed']:
            subprocess.run(['node','train/promote.mjs','--candidate',str(candidate),'--benchmark',str(bfile)],cwd=ROOT,check=True)
            state['bestRating']=-1e9
            if challenger.exists():challenger.unlink()
            print('Promoted new champion; effective in new park matches.',flush=True)
        else:
            # A candidate may be rejected repeatedly. The existing champion remains unchanged.
            subprocess.run(['node','train/promote.mjs','--candidate',str(candidate),'--benchmark',str(bfile),'--record-only'],cwd=ROOT,check=True)
            if outcome['averageRating']>state.get('bestRating',-1e9):
                challenger.write_bytes(candidate.read_bytes());state['bestRating']=outcome['averageRating']
            if attempt%12==0: # Escape local minima after repeated unsuccessful cycles.
                state['bestRating']=-1e9
                if challenger.exists():challenger.unlink()
            print('Rejected. Scripted/current champion preserved; best challenger retained for future cycles.',flush=True)
        state_file.write_text(json.dumps(state,indent=2))
        for temporary in [teacher_file,models/'selfplay-rollout.json']:
            try:temporary.unlink()
            except FileNotFoundError:pass
if __name__=='__main__':
    try:
        with exclusive_training_lock(ROOT/'bot-memory/models/training.lock'):
            main()
    except Exception as e:
        print('Trainer error:',e,file=sys.stderr);sys.exit(1)
