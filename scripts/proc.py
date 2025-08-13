import sys
import os
import json
import subprocess
import time


def _ps_list_windows():
    try:
        cmd = [
            'powershell',
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-Command',
            'Get-CimInstance Win32_Process | Select-Object ProcessId,ExecutablePath,CommandLine,ParentProcessId,Name | ConvertTo-Json -Depth 2 -Compress'
        ]
        completed = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if completed.returncode == 0 and completed.stdout:
            data = json.loads(completed.stdout)
            if isinstance(data, dict):
                return [data]
            return data or []
    except Exception:
        pass
    return []


def _norm_path(p):
    if not p:
        return ''
    return str(p).replace('/', '\\').strip().lower()


def _image_from_path(p):
    try:
        return os.path.basename(p).lower()
    except Exception:
        return ''


def _extract_cmd_exe(cmdline):
    try:
        c = (cmdline or '').strip()
        if not c:
            return ''
        if c.startswith('"'):
            end = c.find('"', 1)
            if end > 1:
                return c[1:end]
        token = c.split()[0]
        return token if token.lower().endswith('.exe') else ''
    except Exception:
        return ''


LAUNCHER_IMAGES = {
    'steam.exe','steamwebhelper.exe','epicgameslauncher.exe','epicwebhelper.exe','eaclauncher.exe','easyeanticheat_launcher.exe','easyeanticheat.exe'
}

IGNORE_IMAGES = {
    'python.exe','python3.exe','python3.11.exe','python3.12.exe','python3.13.exe','py.exe',
    'cmd.exe','conhost.exe','powershell.exe','pwsh.exe','wscript.exe','cscript.exe','reg.exe',
    'node.exe','electron.exe','werfault.exe','crashreportclient.exe','steamwebhelper.exe'
}

IGNORE_PREFIXES = (
    'unitycrashhandler',
)

STOPWORDS = {'a','an','the','of','and','or'}

def _sanitize_tokens(title):
    t = (title or '').lower()
    out = []
    token = ''
    for ch in t:
        if ch.isalnum():
            token += ch
        else:
            if len(token) >= 3 and token not in STOPWORDS:
                out.append(token)
            token = ''
    if len(token) >= 3 and token not in STOPWORDS:
        out.append(token)
    return out


def _evaluate_match(proc, f):
    pid = proc.get('ProcessId') or proc.get('Id') or proc.get('pid')
    ppid = proc.get('ParentProcessId') or proc.get('ppid')
    name = (proc.get('Name') or '').lower()
    exe_path = (proc.get('ExecutablePath') or '').strip()
    cmd = (proc.get('CommandLine') or '').strip()
    parsed = _extract_cmd_exe(cmd)
    path_val = _norm_path(exe_path or parsed)
    if not name and path_val:
        name = _image_from_path(path_val)
    base_name = os.path.splitext(os.path.basename(path_val or name))[0].lower()

    exact_exec = bool(f['executablePath'] and path_val == f['executablePath'])
    image_match = bool(f['imageName'] and name == f['imageName'])
    title_match = False
    if f['titleTokens']:
        matches = [tok for tok in f['titleTokens'] if tok in base_name]
        title_match = (len(matches) >= 2) or (''.join(f['titleTokens']) == base_name)

    install_dir = f['installDir']
    under_install = bool(install_dir and path_val.startswith(install_dir))
    # Check alternate install variants (e.g., with steamapps/common injected)
    if not under_install and f.get('installDirVariants'):
        for v in f['installDirVariants']:
            if v and path_val.startswith(v):
                under_install = True
                break

    reasons = []
    if exact_exec:
        reasons.append('exact-executablePath')
    if image_match:
        reasons.append('image-name-match')
    if under_install:
        reasons.append('exec-under-installDir')
    if title_match:
        reasons.append('title-match')
    if f.get('parentPid') and isinstance(ppid, int) and int(f['parentPid']) == int(ppid):
        reasons.append('parent-match')

    strong = exact_exec or image_match or title_match
    any_match = strong or under_install

    # Scoring to rank most likely game processes
    score = 0
    if exact_exec:
        score += 100
    if image_match:
        score += 80
    if title_match:
        score += 20
    if under_install:
        score += 50
    if 'parent-match' in reasons:
        score += 30
    if name in LAUNCHER_IMAGES:
        score -= 40

    return any_match, strong, pid, name, path_val, reasons, score


def action_find(filters):
    if os.name != 'nt':
        return { 'ok': True, 'pids': [], 'matches': [], 'note': 'windows-only finder' }

    exec_path = _norm_path((filters.get('executablePath') or ''))
    image_name = (filters.get('imageName') or '').strip().lower()
    if not image_name and exec_path:
        image_name = _image_from_path(exec_path)
    install_dir = _norm_path((filters.get('installDir') or '')).rstrip('\\')
    if install_dir:
        install_dir = install_dir + '\\'
    title = (filters.get('title') or '').strip().lower()
    title_tokens = _sanitize_tokens(title)
    parent_pid = None
    try:
        parent_pid = int(filters.get('parentPid')) if filters.get('parentPid') is not None else None
    except Exception:
        parent_pid = None

    # Install dir variants: inject steamapps/common if user provided SteamLibrary/common path
    variants = []
    try:
        needle = '\\steamlibrary\\'
        if install_dir and (needle in install_dir) and ('\\steamapps\\' not in install_dir):
            before, after = install_dir.split(needle, 1)
            alt = before + needle + 'steamapps\\' + after
            variants.append(alt)
    except Exception:
        pass

    f = {
        'executablePath': exec_path,
        'imageName': image_name,
        'installDir': install_dir,
        'installDirVariants': variants,
        'title': title,
        'titleTokens': title_tokens,
        'parentPid': parent_pid
    }

    procs = _ps_list_windows()
    candidates = []
    for p in procs:
        any_match, strong, pid, name, path_val, reasons, score = _evaluate_match(p, f)
        if not any_match or not isinstance(pid, int):
            continue
        # Skip known irrelevant images
        if name in IGNORE_IMAGES:
            continue
        if any(name.startswith(pref) for pref in IGNORE_PREFIXES):
            continue
        if name in LAUNCHER_IMAGES:
            continue
        candidates.append({ 'pid': pid, 'name': name, 'path': path_val, 'reasons': reasons, 'score': score })

    # Sort by score descending and return top set (cap to avoid noise)
    candidates.sort(key=lambda x: x['score'], reverse=True)
    top = candidates[:12]
    # For UWP/Xbox titles often the executable is a UWP host; relax threshold slightly
    out_pids = [c['pid'] for c in top if c['score'] >= 10]
    return { 'ok': True, 'pids': out_pids, 'matches': top, 'ts': time.time() }


def action_alive(filters):
    pids = []
    for pid in (filters.get('pids') or []):
        try:
            pids.append(int(pid))
        except Exception:
            pass

    if not pids:
        return { 'ok': True, 'pids': [] }

    if os.name == 'nt':
        procs = _ps_list_windows()
        # Map existing processes by PID for quick lookup
        proc_map = { p.get('ProcessId'): p for p in procs if isinstance(p.get('ProcessId'), int) }

        # Determine whether caller provided match-filters
        exec_path = _norm_path((filters.get('executablePath') or ''))
        image_name = (filters.get('imageName') or '').strip().lower()
        if not image_name and exec_path:
            image_name = _image_from_path(exec_path)
        install_dir = _norm_path((filters.get('installDir') or '')).rstrip('\\')
        if install_dir:
            install_dir = install_dir + '\\'
        title = (filters.get('title') or '').strip().lower()
        has_match_filters = bool(exec_path or image_name or install_dir or title)

        alive = []
        if has_match_filters:
            # Only keep PID if still matches filters
            f = {
                'executablePath': exec_path,
                'imageName': image_name,
                'installDir': install_dir,
                'title': title
            }
            for pid in pids:
                p = proc_map.get(pid)
                if not p:
                    continue
                any_match, _, _, _, _, _ = _evaluate_match(p, f)
                if any_match:
                    alive.append(pid)
        else:
            # No filters: just check existence
            alive = [pid for pid in pids if pid in proc_map]

        return { 'ok': True, 'pids': alive }
    else:
        alive = []
        for pid in pids:
            try:
                os.kill(pid, 0)
                alive.append(pid)
            except Exception:
                pass
        return { 'ok': True, 'pids': alive }


def action_kill(filters):
    pids = []
    for pid in (filters.get('pids') or []):
        try:
            pids.append(int(pid))
        except Exception:
            pass
    image = (filters.get('imageName') or '').strip()

    if os.name != 'nt':
        # Try to kill by pid on non-windows
        killed = []
        for pid in pids:
            try:
                os.kill(pid, 9)
                killed.append(pid)
            except Exception:
                pass
        return { 'ok': True, 'killedPids': killed }

    try:
        killed = []
        if pids:
            args = ' /PID '.join(str(pid) for pid in pids)
            subprocess.run(f'taskkill /PID {args} /F', shell=True, capture_output=True, text=True, timeout=10)
            killed = pids
        elif image:
            subprocess.run(f'taskkill /IM "{image}" /F', shell=True, capture_output=True, text=True, timeout=10)
        return { 'ok': True, 'killedPids': killed }
    except Exception as e:
        return { 'ok': False, 'error': str(e) }


def main():
    try:
        action = (sys.argv[1] if len(sys.argv) > 1 else '').strip().lower()
        raw = sys.argv[2] if len(sys.argv) > 2 else '{}'
        try:
            filters = json.loads(raw)
        except Exception:
            filters = {}

        if action == 'find':
            print(json.dumps(action_find(filters)))
        elif action == 'alive':
            print(json.dumps(action_alive(filters)))
        elif action == 'kill':
            print(json.dumps(action_kill(filters)))
        else:
            print(json.dumps({ 'ok': False, 'error': 'unknown_action', 'hint': 'use find|alive|kill' }))
    except Exception as e:
        print(json.dumps({ 'ok': False, 'error': str(e) }))
        sys.exit(1)


if __name__ == '__main__':
    main()