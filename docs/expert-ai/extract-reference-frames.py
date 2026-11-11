"""Optional reference review utility; reads footage, never training data or policies.

Requires yt-dlp and ffmpeg (or their wheel files in the system temp directory).
Downloads bounded excerpts into a chosen scratch directory and saves contact sheets.
"""
import concurrent.futures, json, os, pathlib, shutil, subprocess, sys, tempfile, zipfile

scratch=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else pathlib.Path(tempfile.gettempdir())/'teamball-reference-review')
scratch.mkdir(parents=True,exist_ok=True)
try:
    import yt_dlp
except ImportError:
    wheel=next(pathlib.Path(tempfile.gettempdir()).glob('yt_dlp-*.whl'))
    sys.path.insert(0,str(wheel));import yt_dlp
ffmpeg=next(scratch.glob('**/ffmpeg*.exe'),None)
if not ffmpeg:
    wheel=next(pathlib.Path(tempfile.gettempdir()).glob('imageio_ffmpeg-*win_amd64.whl'))
    with zipfile.ZipFile(wheel) as archive:
        member=next(n for n in archive.namelist() if n.endswith('.exe'))
        ffmpeg=pathlib.Path(archive.extract(member,scratch))
# yt-dlp's partial-download availability probe also searches PATH, even when
# ffmpeg_location is passed to its library API. Give that probe a standard name.
named_ffmpeg=scratch/'ffmpeg.exe'
if ffmpeg.resolve()!=named_ffmpeg.resolve():shutil.copyfile(ffmpeg,named_ffmpeg)
ffmpeg=named_ffmpeg
os.environ['PATH']=str(scratch)+os.pathsep+os.environ.get('PATH','')

references=[('FGfyWWfo4Rc',6),('0aIWqZnLzj0',6),('VOQDnU5cyMo',6),('tLRU10-dyAU',6),('AmAiUsvpYq4',1088),('UhTUQWtwXfY',6)]
class Quiet:
    def debug(self,*a):pass
    def warning(self,*a):pass
    def error(self,*a):pass

def review(reference):
    video_id,start=reference
    clip_stem=f'{video_id}-{start}-{start+24}'
    options={'quiet':True,'no_warnings':True,'logger':Quiet(),'socket_timeout':20,'retries':0,'extractor_retries':0,
             'noplaylist':True,'ffmpeg_location':str(ffmpeg),'format':'bestvideo[height<=480]/best[height<=480]',
             'outtmpl':str(scratch/(clip_stem+'.%(ext)s')),'download_ranges':lambda info,ydl:[{'start_time':start,'end_time':start+24}]}
    record={'id':video_id,'url':'https://www.youtube.com/watch?v='+video_id,'start':start,'end':start+24}
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            info=ydl.extract_info(record['url'],download=True)
            record.update({k:info.get(k) for k in ['title','duration','fps','upload_date','channel']})
            (scratch/(video_id+'.metadata.json')).write_text(json.dumps(record,indent=2),encoding='utf8')
        clip=next(p for p in scratch.glob(clip_stem+'.*') if p.suffix in ['.mp4','.webm','.mkv'])
        sheet=scratch/(video_id+'.jpg')
        result=subprocess.run([str(ffmpeg),'-hide_banner','-loglevel','error','-i',str(clip),'-vf','fps=1/2,scale=640:-1,tile=4x3',
                               '-frames:v','1','-y',str(sheet)],capture_output=True,text=True,timeout=45)
        record.update({'clip':str(clip),'sheet':str(sheet),'frameExtractionExit':result.returncode,'frameExtractionError':result.stderr[-500:]})
    except Exception as error:record['error']=str(error)[-700:]
    print(json.dumps(record),flush=True)
    return record

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(review,references))
(scratch/'references.json').write_text(json.dumps(results,indent=2),encoding='utf8')
