import sys
import os
import json
import time
import subprocess


CRITICAL_IMAGES = {
    'explorer.exe','csrss.exe','wininit.exe','winlogon.exe','services.exe','lsass.exe',
    'dwm.exe','smss.exe','fontdrvhost.exe','system','registry'
}

# Common non-game executables we should ignore for "matches"
IGNORE_IMAGES = {
    'steam.exe','steamwebhelper.exe','epicgameslauncher.exe','crashreporter.exe',
    'eaclauncher.exe','easyeanticheat_launcher.exe','easyeanticheat.exe','epicwebhelper.exe'
}


def get_processes():
    try:
        cmd = [
            'powershell',
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-Command',
            'Get-CimInstance Win32_Process | Select-Object ProcessId,ExecutablePath,CommandLine,ParentProcessId,Name | ConvertTo-Json -Depth 2 -Compress'
        ]
        completed = subprocess.run(cmd, capture_output=True, text=True, timeout=12)
        if completed.returncode == 0 and completed.stdout:
            data = json.loads(completed.stdout)
            if isinstance(data, dict):
                return [data]
            return data or []
    except Exception:
        pass
    return []


def normalize_filters(filters):
    exec_path = (filters.get('executablePath') or '').strip()
    image_name = (filters.get('imageName') or '').strip()
    if not image_name and exec_path:
        try:
            image_name = os.path.basename(exec_path)
        except Exception:
            image_name = ''
    install_dir = (filters.get('installDir') or '').replace('/', '\\').lower().rstrip('\\')
    install_dir_variants = []
    if install_dir:
        install_dir = install_dir + '\\'
        install_dir_variants.append(install_dir)
        # Heuristic: add steamapps variant if missing
        try:
            needle = '\\steamlibrary\\'
            if (needle in install_dir) and ('\\steamapps\\' not in install_dir):
                before, after = install_dir.split(needle, 1)
                alt = before + needle + 'steamapps\\' + after
                install_dir_variants.append(alt)
        except Exception:
            pass
    pids = []
    for pid in (filters.get('pids') or []):
        try:
            pids.append(int(pid))
        except Exception:
            pass
    return {
        'executablePath': exec_path.lower(),
        'imageName': image_name.lower(),
        'installDir': install_dir,
        'installDirVariants': install_dir_variants,
        'pids': pids,
        'preferImage': bool(filters.get('preferImage')),
        'strict': bool(filters.get('strict')),
        'title': (filters.get('title') or '').strip(),
    }


def evaluate_process(p, f):
    def extract_path_from_cmdline(cmdline):
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

    pid = p.get('ProcessId') or p.get('Id') or p.get('pid')
    name = (p.get('Name') or '').lower()
    exe_path = (p.get('ExecutablePath') or '').strip()
    cmd = (p.get('CommandLine') or '').strip()
    parsed_from_cmd = extract_path_from_cmdline(cmd)
    path_val = (exe_path or parsed_from_cmd or '').replace('/', '\\').lower()
    if not name and path_val:
        try:
            name = os.path.basename(path_val).lower()
        except Exception:
            pass

    exact_exec = bool(f['executablePath'] and path_val == f['executablePath'])
    image_match = bool(f['imageName'] and name == f['imageName'])
    under_install = bool(
        (f.get('installDir') and path_val.startswith(f['installDir'])) or
        any(path_val.startswith(v) for v in (f.get('installDirVariants') or []))
    )
    pid_alive = bool(isinstance(pid, int) and pid in f['pids'])
    title_match = False
    if f.get('title'):
        t = f['title'].lower()
        title_match = (t in (cmd or '').lower()) or (t in name)

    strong = exact_exec or image_match or title_match
    any_match = strong or under_install

    return {
        'pid': pid,
        'name': name,
        'path': path_val,
        'cmd': cmd,
        'exact_exec': exact_exec,
        'image_match': image_match,
        'under_install': under_install,
        'pid_alive': pid_alive,
        'title_match': title_match,
        'strong': strong,
        'any': any_match,
    }


def action_check(filters):
    if os.name != 'nt':
        return { 'running': False, 'matches': [], 'alivePids': [], 'debug': { 'note': 'non-windows' } }

    f = normalize_filters(filters)
    procs = get_processes()
    results = [evaluate_process(p, f) for p in procs]

    # Alive = provided PID list that still exists
    provided = set(f.get('pids') or [])
    observed = { r['pid'] for r in results if isinstance(r['pid'], int) }
    alive = sorted(list(provided.intersection(observed)))
    matched = [
        {
            'pid': r['pid'], 'path': r['path'], 'name': r['name'],
            'reasons': [k for k in ['exact-executablePath','image-name-match','exec-under-installDir','title-match']
                       if (k == 'exact-executablePath' and r['exact_exec'])
                       or (k == 'image-name-match' and r['image_match'])
                       or (k == 'exec-under-installDir' and r['under_install'])
                       or (k == 'title-match' and r['title_match'])]
        }
        for r in results if r['any'] and r['name'] not in CRITICAL_IMAGES and r['name'] not in IGNORE_IMAGES
    ]

    if f['pids']:
        # Consider running only if an alive provided PID exists, otherwise rely on strong match AND under_install to reduce noise
        running = bool(alive) or any((r['strong'] and r['under_install']) for r in results)
    else:
        if f['executablePath'] or f['imageName'] or f.get('title'):
            running = any(r['strong'] for r in results)
        else:
            running = any(r['any'] for r in results)

    sample = [
        { 'pid': r['pid'], 'name': r['name'], 'path': r['path'], 'exact': r['exact_exec'], 'img': r['image_match'], 'dir': r['under_install'], 'alive': r['pid_alive'], 'title': r['title_match'] }
        for r in results[:15]
    ]

    return {
        'running': running,
        'matches': matched,
        'alivePids': alive,
        'counts': { 'total': len(results), 'matched': len(matched) },
        'debug': {
            'inputFilters': f,
            'procSample': sample,
            'alive': alive,
            'ts': time.time(),
            'source': 'cim'
        }
    }


def taskkill_pids(pids):
    if not pids:
        return []
    try:
        args = ' /PID '.join(str(pid) for pid in pids)
        subprocess.run(f'taskkill /PID {args} /F', shell=True, capture_output=True, text=True, timeout=10)
    except Exception:
        pass
    return pids


def taskkill_image(image_name):
    try:
        subprocess.run(f'taskkill /IM "{image_name}" /F', shell=True, capture_output=True, text=True, timeout=10)
        return True
    except Exception:
        return False


def action_kill(filters):
    if os.name != 'nt':
        return { 'ok': False, 'error': 'windows only' }

    f = normalize_filters(filters)
    procs = get_processes()
    results = [evaluate_process(p, f) for p in procs]

    candidates = sorted({ r['pid'] for r in results if (r['pid_alive'] or r['strong']) and isinstance(r['pid'], int) and r['name'] not in CRITICAL_IMAGES })
    killed = []
    used_image = False
    if f['preferImage'] and f['imageName'] and f['imageName'].endswith('.exe') and f['imageName'] not in CRITICAL_IMAGES:
        used_image = taskkill_image(f['imageName'])
    if not used_image:
        if len(candidates) > 8:
            return { 'ok': False, 'error': 'too_many_pids', 'capped': len(candidates) }
        killed = taskkill_pids(candidates)

    sample = [ { 'pid': r['pid'], 'name': r['name'], 'path': r['path'], 'strong': r['strong'], 'alive': r['pid_alive'] } for r in results[:12] ]
    return { 'ok': True, 'usedImage': bool(used_image), 'killedPids': killed, 'debug': { 'procSample': sample, 'inputs': f } }


def action_trace(filters, duration=3.0, interval=0.5):
    if os.name != 'nt':
        return { 'ok': False, 'error': 'windows only' }
    f = normalize_filters(filters)
    end = time.time() + max(0.5, float(duration))
    snapshots = []
    while time.time() < end:
        r = action_check(f)
        snapshots.append({ 'ts': r['debug']['ts'], 'running': r['running'], 'alivePids': r['alivePids'], 'matches': r['matches'] })
        time.sleep(max(0.1, float(interval)))
    return { 'ok': True, 'snapshots': snapshots, 'inputs': f }


def main():
    try:
        action = (sys.argv[1] if len(sys.argv) > 1 else '').strip().lower()
        raw = sys.argv[2] if len(sys.argv) > 2 else '{}'
        try:
            filters = json.loads(raw)
        except Exception:
            filters = {}

        if action == 'check':
            print(json.dumps(action_check(filters)))
        elif action == 'kill':
            print(json.dumps(action_kill(filters)))
        elif action == 'trace':
            dur = float(sys.argv[3]) if len(sys.argv) > 3 else 3.0
            print(json.dumps(action_trace(filters, dur)))
        else:
            print(json.dumps({ 'ok': False, 'error': 'unknown_action', 'hint': 'use check|kill|trace' }))
    except Exception as e:
        print(json.dumps({ 'ok': False, 'error': str(e) }))
        sys.exit(1)


if __name__ == '__main__':
    main()


