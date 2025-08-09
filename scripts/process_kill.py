import sys
import os
import json
import subprocess


def get_processes():
    try:
        cmd = [
            'powershell',
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-Command',
            'Get-CimInstance Win32_Process | Select-Object ProcessId,ExecutablePath,CommandLine,Name | ConvertTo-Json -Depth 2 -Compress'
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


def safe_match_pid_records(p, filters, strict=False):
    pid = p.get('ProcessId') or p.get('Id')
    name = (p.get('Name') or '').lower()
    path_val = (p.get('ExecutablePath') or '').lower()
    cmd = (p.get('CommandLine') or '').lower()
    exec_path = (filters.get('executablePath') or '').lower()
    image = os.path.basename(exec_path) if exec_path else ''

    critical = {
        'explorer.exe','csrss.exe','wininit.exe','winlogon.exe','services.exe','lsass.exe',
        'dwm.exe','smss.exe','fontdrvhost.exe','system','registry'
    }
    if name in critical:
        return pid, 'critical-skip', False

    if strict:
        if exec_path:
            if path_val == exec_path:
                return pid, 'exact-executablePath', True
            if image and name == image.lower():
                return pid, 'image-name-match', True
            if image and (f' {image.lower()} ' in f' {cmd} '):
                return pid, 'cmd-contains-image', True
        return pid, 'no-strict-match', False

    if exec_path and path_val == exec_path:
        return pid, 'exact-executablePath', True
    return pid, 'no-match', False


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


def main():
    try:
        if os.name != 'nt':
            print(json.dumps({"killedPids": [], "ok": False, "error": "windows only"}))
            return

        filters = {}
        if len(sys.argv) > 1 and sys.argv[1]:
            try:
                filters = json.loads(sys.argv[1])
            except Exception:
                filters = {}

        provided_pids = []
        for pid in (filters.get('pids') or []):
            try:
                provided_pids.append(int(pid))
            except Exception:
                pass
        strict = bool(filters.get('strict'))
        prefer_image = bool(filters.get('preferImage'))
        forced_image_name = (filters.get('imageName') or '').strip()

        procs = get_processes()
        hits = []
        details = []
        for p in procs:
            pid, reason, ok = safe_match_pid_records(p, filters, strict=strict)
            details.append({'pid': pid, 'name': p.get('Name'), 'path': p.get('ExecutablePath'), 'reason': reason, 'ok': ok})
            if ok and isinstance(pid, int):
                hits.append(pid)

        used_image = False
        killed = []
        image_to_kill = ''
        if prefer_image:
            if forced_image_name:
                image_to_kill = forced_image_name
            elif filters.get('executablePath'):
                image_to_kill = os.path.basename(filters.get('executablePath'))
            if image_to_kill:
                # Safety: restrict to .exe and non-critical
                safe_images = {
                    'explorer.exe','csrss.exe','wininit.exe','winlogon.exe','services.exe','lsass.exe',
                    'dwm.exe','smss.exe','fontdrvhost.exe','system','registry'
                }
                if image_to_kill.lower().endswith('.exe') and image_to_kill.lower() not in safe_images:
                    used_image = taskkill_image(image_to_kill)
        if not used_image:
            all_pids = sorted(set(provided_pids + hits))
            if len(all_pids) > 5:
                print(json.dumps({"ok": False, "error": "too_many_pids", "capped": len(all_pids), "details": details[:10]}))
                return
            killed = taskkill_pids(all_pids)

        print(json.dumps({
            "killedPids": killed,
            "usedImage": bool(used_image),
            "ok": True,
            "details": details[:10]
        }))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    main()


