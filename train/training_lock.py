"""Small crash-recovering, exclusive process lease for offline trainers.

No network or game files are modified. One training writer at a time prevents
concurrent champion/model writes between overnight and server auto-training.
"""
from __future__ import annotations
from contextlib import contextmanager
import json, os, pathlib, time, uuid


def pid_is_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name == 'nt':
        import ctypes
        k32 = ctypes.windll.kernel32
        handle = k32.OpenProcess(0x1000, False, pid)
        if not handle:
            return False
        try:
            code = ctypes.c_ulong()
            return bool(k32.GetExitCodeProcess(handle, ctypes.byref(code))) and code.value == 259
        finally:
            k32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


@contextmanager
def exclusive_training_lock(filename):
    filename = pathlib.Path(filename)
    filename.parent.mkdir(parents=True, exist_ok=True)
    token = uuid.uuid4().hex
    payload = {'pid': os.getpid(), 'at': time.time(), 'token': token}
    for _ in range(4):
        try:
            fd = os.open(str(filename), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            try:
                with os.fdopen(fd, 'w', encoding='utf-8') as out:
                    json.dump(payload, out)
            except BaseException:
                filename.unlink(missing_ok=True)
                raise
            break
        except FileExistsError:
            try:
                old = json.loads(filename.read_text(encoding='utf-8'))
                pid = int(old.get('pid', -1))
                modified = filename.stat().st_mtime
            except (OSError, ValueError, TypeError):
                pid, modified = -1, 0
            if pid_is_alive(pid):
                raise RuntimeError(f'Another trainer is already running (PID {pid}); did not alter models')
            # Only delete if the file has not changed since inspection.
            try:
                if filename.stat().st_mtime == modified:
                    filename.unlink()
            except FileNotFoundError:
                pass
    else:
        raise RuntimeError(f'Could not acquire trainer lock: {filename}')
    try:
        yield
    finally:
        try:
            if json.loads(filename.read_text(encoding='utf-8')).get('token') == token:
                filename.unlink()
        except (OSError, ValueError):
            pass
