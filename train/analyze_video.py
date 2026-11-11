#!/usr/bin/env python3
"""Heuristic offline analysis of user-supplied Teamball gameplay MP4 files.

NOT imitation learning: video has no exact game coordinates, player identity, controls,
boost or collision events. Optional approved tactical profiles influence *opponent*
parameters in self-play only, and never overwrite a champion neural model.
"""
from __future__ import annotations
import argparse, hashlib, json, math, pathlib, statistics, sys, time

ROOT = pathlib.Path(__file__).resolve().parent.parent

def main():
    parser=argparse.ArgumentParser(description='Inspect locally saved Teamball footage; optional supervised approval for heuristic tactics')
    parser.add_argument('video',type=pathlib.Path,help='Local MP4 gameplay file')
    parser.add_argument('--approve-for-training',action='store_true',help='Approve reliable video-derived tactics for opponent-only self-play')
    parser.add_argument('--seconds',type=int,default=180,help='Maximum analyzed seconds')
    parser.add_argument('--samples-per-second',type=float,default=2)
    args=parser.parse_args()
    if not args.video.is_file():parser.error('Video not found: '+str(args.video))
    if args.video.stat().st_size>1_500_000_000:parser.error('Video exceeds 1.5 GB import cap')
    try:
        import cv2
        import numpy as np
    except ImportError:
        parser.error('OpenCV missing: python -m pip install opencv-python-headless')
    video=cv2.VideoCapture(str(args.video))
    if not video.isOpened():parser.error('Cannot decode MP4: '+str(args.video))
    fps=video.get(cv2.CAP_PROP_FPS) or 25
    stride=max(1,round(fps/max(.3,min(5,args.samples_per_second))))
    limit=round(max(10,min(900,args.seconds))*fps)
    tracked=[];sampled=0;seen=0;index=0
    team_spread=[];ball_wall=[];close_press=[];team_visible=0
    while index<limit:
        ok,frame=video.read()
        if not ok:break
        if index%stride:
            index+=1;continue
        index+=1;sampled+=1
        # Downscale to put screenshots of different capture resolutions in a similar range.
        h,w=frame.shape[:2];scale=min(1.,640/max(h,w));frame=cv2.resize(frame,None,fx=scale,fy=scale) if scale<1 else frame
        hsv=cv2.cvtColor(frame,cv2.COLOR_BGR2HSV)
        # Locate a turf rectangle through green pixels; UI or montage transitions are excluded.
        green=cv2.inRange(hsv,np.array([34,24,20]),np.array([101,255,240]))
        ys,xs=np.nonzero(green)
        if len(xs)<.12*green.size:continue
        L,R=int(np.quantile(xs,.02)),int(np.quantile(xs,.98))
        T,B=int(np.quantile(ys,.02)),int(np.quantile(ys,.98))
        if R-L<.42*frame.shape[1] or B-T<.35*frame.shape[0]:continue
        roi=hsv[T:B+1,L:R+1];hh,ww=roi.shape[:2]
        red=(cv2.inRange(roi,np.array([0,95,75]),np.array([14,255,255]))|
             cv2.inRange(roi,np.array([169,95,75]),np.array([179,255,255])))
        blue=cv2.inRange(roi,np.array([90,75,65]),np.array([132,255,255]))
        # This only finds colored shapes. It cannot identify human vs bot from pixels.
        def centers(mask):
            contours,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
            result=[]
            for c in contours:
                area=cv2.contourArea(c)
                if area<5 or area>min(900,ww*hh*.016):continue
                x,y,cw,ch=cv2.boundingRect(c)
                if cw>max(55,ww*.12) or ch>max(55,hh*.15):continue
                result.append(((x+cw/2)/ww,(y+ch/2)/hh))
            return sorted(result)[:18]
        redpts=centers(red);bluepts=centers(blue)
        if redpts and bluepts:team_visible+=1
        if len(redpts)+len(bluepts)<2:continue
        seen+=1
        ys_norm=[y for _,y in redpts+bluepts]
        if len(ys_norm)>1:team_spread.append(statistics.pstdev(ys_norm))
        # Crude bright, low-saturation ball candidates; not a trustworthy ball tracker.
        whites=cv2.inRange(roi,np.array([0,0,165]),np.array([179,65,255]))
        contours,_=cv2.findContours(whites,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        balls=[]
        for c in contours:
            area=cv2.contourArea(c)
            if area<3 or area>min(160,ww*hh*.002):continue
            x,y,cw,ch=cv2.boundingRect(c)
            if abs(cw-ch)>max(9,max(cw,ch)*.7):continue
            balls.append(((x+cw/2)/ww,(y+ch/2)/hh))
        if len(balls)==1:
            bx,by=balls[0];ball_wall.append(float(min(bx,1-bx,by,1-by)<.11))
            close_press.append(float(any(math.hypot(x-bx,y-by)<.14 for x,y in redpts+bluepts)))
        tracked.append({'t':round((index-1)/fps,2),'red':len(redpts),'blue':len(bluepts),
                        'spread':round(team_spread[-1],3) if team_spread else None})
    video.release()
    # Conservative: never trust a montage with too few valid gameplay frames.
    coverage=seen/max(1,sampled)
    confidence=round(min(1,coverage*.65+min(1,team_visible/max(1,sampled))*.35),3)
    if len(team_spread)<12:confidence=min(confidence,.2)
    wide=statistics.median(team_spread) if team_spread else .22
    side=statistics.mean(ball_wall) if ball_wall else 0
    pressure=statistics.mean(close_press) if close_press else .4
    # Avoid inferring boost, passes, shot inputs or goals from unreliable 2D pixels.
    policy={
        'supportWidth':round(max(.9,min(1.1,.98+(wide-.2)*.3)),3),
        'press':round(max(.92,min(1.08,1+(pressure-.4)*.12)),3),
        'bankPreference':round(max(.95,min(1.10,1+(side-.25)*.10)),3)
    }
    approved=bool(args.approve_for_training and confidence>=.25 and seen>=15 and team_visible>=max(5,int(sampled*.12)))
    with args.video.open('rb') as source: digest=hashlib.sha256(source.read(2_000_000)).hexdigest()[:16]
    outdir=ROOT/'bot-memory'/'video-profiles';outdir.mkdir(parents=True,exist_ok=True)
    dest=outdir/(digest+('.approved.json' if approved else '.analysis.json'))
    record={
        'schema':'teamball.video-style.v1','source':'local-gameplay-mp4','filename':args.video.name,
        'analyzedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),
        'sampledFrames':sampled,'trackedFrames':seen,'teamsVisibleFrames':team_visible,
        'ballCandidateFrames':len(ball_wall),'coverage':round(coverage,3),
        'confidence':confidence,'approvedForTraining':approved,'policy':policy,
        'limitations':['Heuristic color-based observations only','Camera moves and edits bias results',
                       'No reliable input/shot/boost labels','No player identities or neural imitation targets'],
        'sampleTimeline':tracked[:300]}
    dest.write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
    print('Analyzed',sampled,'sampled frames;',seen,'plausible turf frames; confidence',confidence)
    print('Output:',dest)
    if approved:print('Approved for weak tactical opponent variation in self-play only.')
    else:print('NOT added to AI training. Re-run with --approve-for-training after review (minimum confidence required).')
    return 0

if __name__=='__main__':sys.exit(main())
