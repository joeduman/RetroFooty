#!/usr/bin/env python3
"""Run Teamball neural training unattended, cycling until duration/STOP.

All training happens outside the live server and stays idle-only. Existing
memory and champion updates use the training lock in train.py. No dependencies
beyond standard Python are required by this supervisor; train.py needs NumPy.
"""
from __future__ import annotations
import argparse, json, os, pathlib, subprocess, sys, time
from training_lock import exclusive_training_lock

ROOT = pathlib.Path(__file__).resolve().parent.parent
MEMORY = ROOT / 'bot-memory'
STOP = MEMORY / 'overnight-stop.flag'
STATUS = MEMORY / 'overnight-status.json'
LOG = MEMORY / 'overnight-training.log'
SETTINGS = MEMORY / 'overnight-settings.json'


def config():
    try:
        x = json.loads(SETTINGS.read_text(encoding='utf-8'))
        return x if isinstance(x, dict) else {}
    except (OSError, ValueError):
        return {}


def bounded(value, default, low, high, integer=False):
    try:
        n = float(value)
        if not float('-inf') < n < float('inf'):
            raise ValueError('not finite')
        n = max(low, min(high, n))
        return int(n) if integer else n
    except (TypeError, ValueError):
        return default


def human_connected():
    try:
        a = json.loads((MEMORY / 'server-activity.json').read_text(encoding='utf-8'))
        return int(a.get('clients', 0)) > 0 and time.time()*1000-float(a.get('at', 0)) < 12000
    except (OSError, ValueError, TypeError):
        return False


def atomic_json(file, data):
    tmp = file.with_name(file.name + '.tmp')
    tmp.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
    os.replace(tmp, file)


def log(line):
    # Avoid unbounded log files after many nights of learning.
    if LOG.exists() and LOG.stat().st_size > 20_000_000:
        os.replace(LOG, LOG.with_suffix('.previous.log'))
    with LOG.open('a', encoding='utf-8') as out:
        out.write(time.strftime('%Y-%m-%d %H:%M:%S') + ' ' + str(line) + '\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--hours', type=float, default=None)
    parser.add_argument('--max-cycles', type=int, default=0, help='For controlled testing; zero means unlimited')
    parser.add_argument('--teacher-matches', type=int, default=None)
    parser.add_argument('--selfplay-matches', type=int, default=None)
    parser.add_argument('--benchmark-matches', type=int, default=None)
    parser.add_argument('--idle-seconds', type=float, default=None)
    parser.add_argument('--cooldown-seconds', type=float, default=None)
    args = parser.parse_args()
    MEMORY.mkdir(exist_ok=True)
    settings = config()
    hours = bounded(args.hours if args.hours is not None else settings.get('hours'), 8, .02, 72)
    idle = bounded(args.idle_seconds if args.idle_seconds is not None else settings.get('idleSeconds'), 30, 0, 900)
    cooldown = bounded(args.cooldown_seconds if args.cooldown_seconds is not None else settings.get('cooldownSeconds'), 30, 0, 3600)
    teacher = bounded(args.teacher_matches if args.teacher_matches is not None else settings.get('teacherMatches'), 10, 1, 128, True)
    selfplay = bounded(args.selfplay_matches if args.selfplay_matches is not None else settings.get('selfplayMatches'), 10, 0, 128, True)
    benchmark = bounded(args.benchmark_matches if args.benchmark_matches is not None else settings.get('benchmarkMatches'), 20, 8, 128, True)
    # A full five-size, color-mirrored curriculum requires 10 matches per phase.
    if teacher < 10 or selfplay < 10 or benchmark < 10:
        log('WARNING: fewer than 10 matches in a phase will not cover all five sizes within that phase.')
    state = dict(schema='teamball.overnight-training.v1',pid=os.getpid(),status='initializing',
                 startedAt=time.strftime('%Y-%m-%dT%H:%M:%S%z'),hours=hours,
                 completedCycles=0,failedCycles=0,teacherMatches=teacher,
                 selfplayMatches=selfplay,benchmarkMatches=benchmark,modes=[1,2,3,4,5],
                 lastCycle=None,lastExit=None)
    with exclusive_training_lock(MEMORY / 'overnight-runner.lock'):
        # Clear a stale stop request only after exclusive ownership is confirmed.
        STOP.unlink(missing_ok=True)
        deadline = time.monotonic() + hours * 3600
        log(f'Overnight run started: {hours:g} hours, matches={teacher}/{selfplay}/{benchmark}, modes=1v1-5v5')
        idle_started = None
        exit_reason = 'duration completed'
        try:
            while time.monotonic() < deadline:
                if STOP.exists():
                    exit_reason = 'requested stop'
                    break
                if args.max_cycles and state['completedCycles'] >= args.max_cycles:
                    exit_reason = 'cycle limit reached'
                    break
                if human_connected():
                    state['status'] = 'paused: human connected'
                    idle_started = None
                    atomic_json(STATUS, state)
                    time.sleep(2)
                    continue
                if idle_started is None:
                    idle_started = time.monotonic()
                if time.monotonic()-idle_started < idle:
                    state['status'] = 'waiting for server idle period'
                    atomic_json(STATUS, state)
                    time.sleep(min(2, max(.05, idle-(time.monotonic()-idle_started))))
                    continue
                state['status'] = 'training'
                state['lastCycle'] = time.strftime('%Y-%m-%dT%H:%M:%S%z')
                atomic_json(STATUS, state)
                cmd = [sys.executable, str(ROOT/'train/train.py'), '--cycles', '1',
                       '--teacher-matches', str(teacher), '--selfplay-matches', str(selfplay),
                       '--benchmark-matches', str(benchmark)]
                env = dict(os.environ, TEAMBALL_OVERNIGHT='1')
                log('Training cycle started')
                with LOG.open('a', encoding='utf-8') as out:
                    process = subprocess.Popen(cmd,cwd=ROOT,env=env,stdout=out,stderr=subprocess.STDOUT)
                    # Child trainer and each rollout check for players and stop flag.
                    while process.poll() is None:
                        time.sleep(1)
                        state['status'] = 'stopping at safe checkpoint' if STOP.exists() else ('pausing for players' if human_connected() else 'training')
                        atomic_json(STATUS,state)
                    code = process.returncode
                state['lastExit'] = code
                if code == 0:
                    state['completedCycles'] += 1
                    log(f'Training cycle completed. Total successful cycles={state["completedCycles"]}')
                else:
                    state['failedCycles'] += 1
                    log(f'Training cycle exited {code}; if a player joined, retry after they leave.')
                idle_started = None
                atomic_json(STATUS, state)
                end = time.monotonic() + cooldown
                while time.monotonic() < end and time.monotonic() < deadline and not STOP.exists():
                    state['status'] = 'cooldown'
                    atomic_json(STATUS,state)
                    time.sleep(min(2, max(.05,end-time.monotonic())))
        except KeyboardInterrupt:
            exit_reason = 'keyboard interrupt'
            log('Keyboard interrupt: stopping after safe checkpoint')
        finally:
            state['status'] = 'stopped'
            state['stoppedReason'] = exit_reason
            state['stoppedAt'] = time.strftime('%Y-%m-%dT%H:%M:%S%z')
            atomic_json(STATUS, state)
            STOP.unlink(missing_ok=True)
            log('Overnight run stopped: '+exit_reason)
    return 0

if __name__=='__main__':
    try:
        raise SystemExit(main())
    except Exception as e:
        print('Could not start overnight training:',e,file=sys.stderr)
        log('FAILED TO START: '+str(e))
        raise SystemExit(1)
