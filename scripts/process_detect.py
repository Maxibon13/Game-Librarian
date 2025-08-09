import sys
import os
import json
import subprocess


def get_process_list_via_powershell():
    try:
        # Prefer WMI (CIM) for richer fields including ExecutablePath and CommandLine
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


def score_match(p, filters):
    """Return an integer score and reason list for how well a process matches filters."""
    exec_path_val = (p.get('ExecutablePath') or '').lower()
    cmd_val = (p.get('CommandLine') or '').lower()
    name_val = (p.get('Name') or '').lower()
    parent_pid = p.get('ParentProcessId')
    exec_path = (filters.get('executablePath') or '').lower()
    install_dir = (filters.get('installDir') or '').lower().rstrip('\\/')
    if install_dir:
        # normalize to ensure prefix matches are stable
        if not install_dir.endswith(('\\','/')):
            install_dir = install_dir + ('\\' if '\\' in install_dir else '/')

    score = 0
    reasons = []

    # Exact executable path match
    if exec_path and exec_path_val:
        if exec_path_val == exec_path:
            score += 100
            reasons.append('exact-executablePath')
        elif exec_path in cmd_val:
            score += 40
            reasons.append('cmd-contains-executablePath')

    # Image name match
    if exec_path and name_val:
        try:
            if os.path.basename(exec_path) == name_val:
                score += 30
                reasons.append('image-name-match')
        except Exception:
            pass

    # Install dir match
    if install_dir:
        if exec_path_val and exec_path_val.startswith(install_dir):
            score += 60
            reasons.append('exec-under-installDir')
        elif install_dir in cmd_val:
            score += 20
            reasons.append('cmd-contains-installDir')

    # Parent relationship heuristic: prefer non-system parents
    if isinstance(parent_pid, int) and parent_pid not in (0,4):
        score += 5
        reasons.append('has-parent')

    return score, reasons


def main():
    try:
        filters = {}
        if len(sys.argv) > 1 and sys.argv[1]:
            try:
                filters = json.loads(sys.argv[1])
            except Exception:
                filters = {}

        if os.name != 'nt':
            # For non-Windows, return empty result for now
            print(json.dumps({"matches": [], "running": False}))
            return

        procs = get_process_list_via_powershell()
        hits = []
        alive_pids = []
        pid_set = set()
        for pid in (filters.get('pids') or []):
            try:
                pid_set.add(int(pid))
            except Exception:
                pass
        top = []
        for p in procs:
            # Track liveness for any provided PIDs regardless of match
            # Track liveness for any provided PIDs regardless of match
            try:
                pid = p.get('ProcessId') or p.get('Id') or p.get('pid')
                if isinstance(pid, int) and pid in pid_set:
                    alive_pids.append(pid)
            except Exception:
                pass
            # Score this process
            score, reasons = score_match(p, filters)
            if score > 0:
                d = {
                    'pid': p.get('ProcessId') or p.get('Id') or p.get('pid') or None,
                    'path': p.get('ExecutablePath') or '',
                    'name': p.get('Name') or '',
                    'cmd': p.get('CommandLine') or '',
                    'parent': p.get('ParentProcessId'),
                    'score': score,
                    'reasons': reasons,
                }
                hits.append(d)
                top.append(d)
            else:
                # keep a few top non-matching processes for debugging by heuristic (e.g., with cmd contains game name)
                d = {
                    'pid': p.get('ProcessId') or p.get('Id') or p.get('pid') or None,
                    'path': p.get('ExecutablePath') or '',
                    'name': p.get('Name') or '',
                    'cmd': p.get('CommandLine') or '',
                    'parent': p.get('ParentProcessId'),
                    'score': score,
                    'reasons': [],
                }
                top.append(d)

        # Sort top by score desc for debugging, include only first 10
        top_sorted = sorted(top, key=lambda x: x.get('score', 0), reverse=True)[:10]

        print(json.dumps({
            "matches": hits,
            "alivePids": sorted(set(alive_pids)),
            "running": len(hits) > 0 or len(alive_pids) > 0,
            "debug": {
                "inputFilters": filters,
                "procSample": top_sorted,
                "counts": {"total": len(procs), "matches": len(hits), "alive": len(alive_pids)}
            }
        }))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    main()


