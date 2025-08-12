#!/usr/bin/env python3
# Windows-only Xbox/Microsoft Store game detector

import os
import sys
import json
import re
from pathlib import Path

try:
    import winreg  # type: ignore
except Exception:
    winreg = None  # type: ignore


def read_gaming_services_games():
    games = []
    if sys.platform != 'win32' or not winreg:
        return games
    roots = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\GamingServices\Games"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\GamingServices\Games"),
    ]
    for hive, base in roots:
        try:
            with winreg.OpenKey(hive, base) as root:
                i = 0
                while True:
                    try:
                        key_name = winreg.EnumKey(root, i)
                    except OSError:
                        break
                    i += 1
                    try:
                        with winreg.OpenKey(root, key_name) as sub:
                            data = { 'id': key_name }
                            j = 0
                            while True:
                                try:
                                    name, val, _ = winreg.EnumValue(sub, j)
                                except OSError:
                                    break
                                j += 1
                                k = name.lower()
                                if k == 'displayname':
                                    data['display'] = str(val)
                                elif k == 'packagefamilyname':
                                    data['pfn'] = str(val)
                                elif k in ('installfullpath', 'installlocation', 'installpath'):
                                    data['installDir'] = str(val)
                            games.append(data)
                    except OSError:
                        pass
        except OSError:
            pass
    return games


def ps_get_startapps():
    try:
        import subprocess
        cmd = [
            'powershell', '-NoProfile', '-Command',
            "Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Depth 2"
        ]
        out = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=8)
        txt = out.stdout.strip()
        if not txt:
            return []
        data = json.loads(txt)
        if isinstance(data, dict):
            data = [data]
        return data
    except Exception:
        return []


def prettify_title(raw: str) -> str:
    s = raw or ''
    s = re.sub(r"\s*\(Windows\s*Mixed\s*Reality\)\s*$", "", s, flags=re.I)
    s = re.sub(r"\s*PC\s*Gaming\s*Services\s*$", "", s, flags=re.I)
    s = re.sub(r"\s*Microsoft\s*Store\s*$", "", s, flags=re.I)
    return s.strip()


def find_store_logo(base_dir: Path) -> str | None:
    try:
        content = base_dir / 'Content'
        if content.exists():
            cand = content / 'StoreLogo.png'
            if cand.exists():
                return cand.resolve().as_uri()
            # Fall back to any StoreLogo*.png in Content
            for p in content.glob('StoreLogo*.png'):
                try:
                    if p.exists():
                        return p.resolve().as_uri()
                except Exception:
                    continue
    except Exception:
        pass
    return None


def main():
    if sys.platform != 'win32':
        print(json.dumps({'games': []}))
        return

    # Read registry games and Start menu apps
    reg_games = read_gaming_services_games()
    apps = ps_get_startapps()
    # Build lookups for AUMID by PFN and by fuzzy name
    aumid_by_pfn = {}
    for a in apps:
        name = str(a.get('Name') or '')
        appid = str(a.get('AppID') or '')
        # PFN is prefix of AUMID in most cases
        p = appid.split('!')[0] if '!' in appid else ''
        if p:
            aumid_by_pfn.setdefault(p.lower(), appid)

    results = []
    # Include games installed under C:\XboxGames (excluding GameSave)
    try:
        xbox_root = Path('C:/XboxGames')
        if xbox_root.exists():
            for entry in xbox_root.iterdir():
                if not entry.is_dir():
                    continue
                if entry.name.lower() == 'gamesave':
                    continue
                title = entry.name
                # try to map to AUMID using PFN guess from folder name fragment
                aumid = None
                # Prefer matching by registry PFN that contains folder name
                for g in reg_games:
                    pfn = str(g.get('pfn') or '')
                    if pfn and entry.name.lower() in pfn.lower():
                        aumid = aumid_by_pfn.get(pfn.lower())
                        if aumid:
                            break
                image = find_store_logo(entry) or None
                results.append({
                    'id': title,
                    'title': prettify_title(title),
                    'launcher': 'xbox',
                    'installDir': str(entry.resolve()),
                    'executablePath': None,
                    'image': image,
                    'aumid': aumid
                })
    except Exception:
        pass
    for g in reg_games:
        pfn = str(g.get('pfn') or '')
        aumid = aumid_by_pfn.get(pfn.lower()) if pfn else None
        title = prettify_title(str(g.get('display') or ''))
        if not title:
            # fallback from PFN last segment
            if pfn:
                title = pfn.split('.')[-1]
        install_dir = str(g.get('installDir') or '')
        # Heuristic: include only likely games
        norm = (title + ' ' + pfn).lower()
        include = any(tok in norm for tok in [
            'xbox', 'game', 'forza', 'halo', 'gears', 'flight', 'minecraft', 'mojang', 'seaofthieves', 'ageofempires', 'ori', 'grounded', 'starfield'
        ])
        if not include:
            # still include if aumid exists and path seems like XboxGames
            include = ('xboxgames' in install_dir.lower()) or bool(aumid)
        if not include:
            continue
        img = find_store_logo(Path(install_dir)) or None
        results.append({
            'id': pfn or g.get('id') or title,
            'title': title,
            'launcher': 'xbox',
            'installDir': install_dir,
            'executablePath': None,
            'image': img,
            'aumid': aumid
        })

    print(json.dumps({'games': results}, ensure_ascii=False))


if __name__ == '__main__':
    main()


