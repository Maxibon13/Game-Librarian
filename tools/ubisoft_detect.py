#!/usr/bin/env python3
# Windows-only: Ubisoft Connect game detector

import os
import sys
import json
import re
from pathlib import Path

try:
    import winreg  # type: ignore
except Exception:
    winreg = None  # type: ignore

def read_registry_installs():
    installs = []
    if sys.platform != 'win32' or not winreg:
        return installs
    root_path = r"SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs"
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, root_path) as root:
            i = 0
            while True:
                try:
                    subname = winreg.EnumKey(root, i)
                except OSError:
                    break
                i += 1
                try:
                    with winreg.OpenKey(root, subname) as sub:
                        title = None
                        install_dir = None
                        j = 0
                        while True:
                            try:
                                name, val, _ = winreg.EnumValue(sub, j)
                            except OSError:
                                break
                            j += 1
                            k = name.lower()
                            if k == 'displayname':
                                title = str(val)
                            elif k == 'installdir' or k == 'installldir' or k == 'path':
                                install_dir = str(val)
                        if install_dir:
                            installs.append({
                                'id': subname,
                                'title': clean_title(title or subname),
                                'installDir': os.path.normpath(install_dir)
                            })
                except OSError:
                    pass
    except OSError:
        pass
    return installs

def powershell_query_fileinfo(exe: str) -> str | None:
    try:
        import subprocess
        cmd = [
            'powershell', '-NoProfile', '-Command',
            f"(Get-Item '{exe.replace("'", "''")}').VersionInfo.FileDescription"
        ]
        out = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=4)
        val = (out.stdout or '').strip()
        if val:
            return clean_title(val)
        cmd = [
            'powershell', '-NoProfile', '-Command',
            f"(Get-Item '{exe.replace("'", "''")}').VersionInfo.ProductName"
        ]
        out = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=4)
        val = (out.stdout or '').strip()
        return clean_title(val) if val else None
    except Exception:
        return None

def find_likely_exe(folder: Path) -> Path | None:
    try:
        bad = re.compile(r"(vcredist|dxsetup|directx|redist|depots|unins|crash|helper|support|_commonredist|eac|easyanticheat|installer|uplay|ubisoft)", re.I)
        exes = list(folder.rglob('*.exe'))
        exes = [p for p in exes if not bad.search(p.name)]
        if not exes:
            return None
        base = folder.name.lower()
        for p in exes:
            if base and base in p.name.lower():
                return p
        return exes[0]
    except Exception:
        return None

def any_icon_nearby(folder: Path) -> str | None:
    try:
        ico = next(folder.rglob('*.ico'), None)
        if ico:
            return ico.resolve().as_uri()
    except Exception:
        pass
    return None

def clean_title(s: str) -> str:
    if not s:
        return s
    out = s
    # Strip platform suffixes
    out = re.sub(r"\s*(?:Uplay|UPlay|Ubisoft\s*Connect)\s*$", "", out, flags=re.I)
    # Common bracketed platform tags
    out = re.sub(r"\s*\((?:Uplay|UPlay|Ubisoft\s*Connect)\)\s*$", "", out, flags=re.I)
    return out.strip()

def main():
    if sys.platform != 'win32':
        print(json.dumps({'games': []}))
        return
    # Optional custom libraries passed as JSON list arg
    custom_libs = []
    if len(sys.argv) >= 2:
        try:
            custom_libs = json.loads(sys.argv[1]) or []
        except Exception:
            custom_libs = []

    installs = read_registry_installs()
    by_dir = { i['installDir'].lower(): i for i in installs }
    by_id = { i['id']: i for i in installs }

    game_dirs: list[Path] = []
    # Default Ubisoft games directory
    base = os.environ.get('ProgramFiles(x86)', '')
    if base:
        game_dirs.append(Path(base, 'Ubisoft', 'Ubisoft Game Launcher', 'games'))
    for lib in custom_libs:
        try:
            game_dirs.append(Path(lib))
        except Exception:
            pass

    seen = set()
    games = []
    for root in game_dirs:
        try:
            for entry in root.iterdir():
                if not entry.is_dir():
                    continue
                dir_lower = str(entry.resolve()).lower()
                rid = None
                title = entry.name
                # Match registry by dir or id
                if dir_lower in by_dir:
                    title = by_dir[dir_lower]['title'] or title
                    rid = by_dir[dir_lower]['id']
                elif re.match(r'^\d+$', entry.name):
                    rid = entry.name
                    if rid in by_id:
                        title = by_id[rid]['title'] or title
                exe = find_likely_exe(entry)
                if (not title or title.isdigit()) and exe:
                    desc = powershell_query_fileinfo(str(exe))
                    if desc:
                        title = desc
                title = clean_title(title)
                image = any_icon_nearby(entry)
                gid = rid or entry.name
                sig = f"{dir_lower}|{gid}"
                if sig in seen:
                    continue
                seen.add(sig)
                games.append({
                    'id': gid,
                    'title': title,
                    'launcher': 'ubisoft',
                    'installDir': str(entry.resolve()),
                    'executablePath': str(exe) if exe else None,
                    'image': image
                })
        except Exception:
            continue

    # Registry-only entries (e.g., games in non-default dirs)
    for inst in installs:
        try:
            dir_lower = inst['installDir'].lower()
            if any(dir_lower in s for s in seen):
                continue
            exe = None
            try:
                exe = find_likely_exe(Path(inst['installDir']))
            except Exception:
                pass
            title = inst['title'] or Path(inst['installDir']).name
            if (not title or title.isdigit()) and exe:
                desc = powershell_query_fileinfo(str(exe))
                if desc:
                    title = desc
            title = clean_title(title)
            image = any_icon_nearby(Path(inst['installDir']))
            games.append({
                'id': inst['id'],
                'title': title,
                'launcher': 'ubisoft',
                'installDir': inst['installDir'],
                'executablePath': str(exe) if exe else None,
                'image': image
            })
        except Exception:
            continue

    print(json.dumps({'games': games}, ensure_ascii=False))

if __name__ == '__main__':
    main()


