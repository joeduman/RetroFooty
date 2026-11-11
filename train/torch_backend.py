"""Optional CUDA trainer. Exports the unchanged v1 JSON model for Node inference.
Only training tensors use CUDA; match rollouts still run in the Node simulator.
"""
import math
import numpy as np

class TorchNetwork:
    def __init__(self,weights,device='cuda',seed=20261110,idle_check=lambda:None):
        import torch
        self.t=torch;self.device=device;self.idle_check=idle_check
        self.rng=np.random.default_rng(seed)
        self.weights={k:torch.as_tensor(v,dtype=torch.float32,device=device).clone() for k,v in weights.items()}
        self.m={k:torch.zeros_like(v) for k,v in self.weights.items()}
        self.v={k:torch.zeros_like(v) for k,v in self.weights.items()};self.step=0
    @property
    def w(self):return {k:v.detach().cpu().numpy().astype(np.float64) for k,v in self.weights.items()}
    def forward(self,x):
        t=self.t;w=self.weights
        h=t.tanh(x@w['w1'].T+w['b1']);z=(h@w['w2'].T+w['b2']).clamp(-18,18)
        return h,t.cat((t.tanh(z[:,:4]),t.sigmoid(z[:,4:])),dim=1)
    def backward(self,x,h,out,dz,lr):
        t=self.t;dz=t.nan_to_num(dz.clamp(-2,2))
        dz1=(dz@self.weights['w2'])*(1-h*h)
        grads={'w1':dz1.T@x,'b1':dz1.sum(0),'w2':dz.T@h,'b2':dz.sum(0)}
        norm=t.sqrt(sum((g*g).sum() for g in grads.values()))
        factor=(4/(norm+1e-9)).clamp(max=1);self.step+=1
        for k,g in grads.items():
            g=g*factor;self.m[k]=.9*self.m[k]+.1*g;self.v[k]=.999*self.v[k]+.001*g*g
            self.weights[k]-=lr*(self.m[k]/(1-.9**self.step))/(t.sqrt(self.v[k]/(1-.999**self.step))+1e-8)
    def train(self,data,epochs,batch,rl=False):
        if not data:return
        t=self.t
        tensor=lambda x:t.as_tensor(x,dtype=t.float32,device=self.device)
        # Transfer the complete sample set once, not once per optimization step.
        xs=tensor(np.asarray([r['x'] for r in data]));ys=tensor(np.asarray([r['y'] for r in data]))
        aux=tensor([r['advantage'] if rl else r.get('weight',1) for r in data])
        if rl:
            aux=((aux-aux.mean())/(aux.std(unbiased=False)+.3)).clamp(-3,3)
            if aux.std(unbiased=False).item()<.01:return
        for epoch in range(epochs):
            self.idle_check()
            order=t.as_tensor(self.rng.permutation(len(data)),device=self.device)
            for indices in order.split(batch):
                x=xs[indices];y=ys[indices];a=aux[indices];h,out=self.forward(x);dz=t.empty_like(out)
                if rl:
                    dz[:,:4]=-(a[:,None]*(y[:,:4]-out[:,:4])/(.23**2))*(1-out[:,:4]**2)/len(x)*.08
                    dz[:,4:]=-(a[:,None]*(y[:,4:]-out[:,4:]))/len(x)*.11
                    lr=.0003
                else:
                    a=a/(a.mean()+1e-9)
                    dz[:,:4]=(out[:,:4]-y[:,:4])*(1-out[:,:4]**2)*a[:,None]/len(x)
                    dz[:,4:]=(out[:,4:]-y[:,4:])*a[:,None]/len(x)*.7
                    lr=.003 if epoch<3 else .0015
                self.backward(x,h,out,dz,lr)
    def supervised(self,data,epochs=8,batch=1024):self.train(data,epochs,batch)
    def reinforce(self,data,epochs=2,batch=1024):self.train(data,epochs,batch,True)

def select_device(request='auto'):
    if request=='cpu':return 'cpu','NumPy CPU'
    try:
        import torch
        if torch.cuda.is_available():
            # Verify an actual kernel, not just driver detection.
            torch.ones(1,device='cuda').add_(1).cpu()
            return 'cuda',torch.cuda.get_device_name(0)
        reason='CUDA unavailable'
    except (ImportError,RuntimeError,OSError) as error:reason=str(error)
    if request=='cuda':raise RuntimeError('CUDA requested but unavailable: '+reason)
    return 'cpu','NumPy CPU fallback: '+reason
