import os
import sys
import json
import re


def parse_vdf_manifest(text: str):
    """Extracts minimal fields from a Steam appmanifest .acf file using regex."""
    appid = None
    name = None
    installdir = None

    m = re.search(r'"appid"\s*"(\d+)"', text, re.IGNORECASE)
    if m:
        appid = m.group(1)
    m = re.search(r'"name"\s*"([^"]+)"', text, re.IGNORECASE)
    if m:
        name = m.group(1)
    m = re.search(r'"installdir"\s*"([^"]+)"', text, re.IGNORECASE)
    if m:
        installdir = m.group(1)
    return appid, name, installdir


def find_steam_libraries(extra_roots=None):
    """Return a list of steamapps folders found across drives and provided roots."""
    libraries = []
    checked = set()

    # Known defaults
    defaults = [
        r"C:\\Program Files (x86)\\Steam\\steamapps",
        r"C:\\Program Files\\Steam\\steamapps",
    ]
    for p in defaults:
        if os.path.exists(p):
            libraries.append(p)
            checked.add(os.path.normcase(p))

    # Include any extra roots (either steam library roots or arbitrary folders)
    roots = []
    if extra_roots:
        for r in extra_roots:
            if not r:
                continue
            r = os.path.normpath(r)
            if r.lower().endswith("steamapps"):
                roots.append(r)
            else:
                roots.append(os.path.join(r, "steamapps"))

    # Windows drive scan A:..Z:
    drives = [f"{d}:\\" for d in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"]
    for d in drives:
        if os.path.exists(d):
            roots.append(d)

    # Search candidates
    for root in roots:
        if os.path.basename(root).lower() == "steamapps" and os.path.exists(root):
            key = os.path.normcase(root)
            if key not in checked:
                libraries.append(root)
                checked.add(key)
            continue

        # Walk shallowly to find steamapps folders
        max_depth = 4
        for current_root, dirs, _files in os.walk(root):
            depth = current_root.count(os.sep) - root.count(os.sep)
            if depth > max_depth:
                dirs[:] = []
                continue
            if "steamapps" in (name.lower() for name in dirs):
                steamapps_path = os.path.join(current_root, "steamapps")
                key = os.path.normcase(steamapps_path)
                if os.path.exists(steamapps_path) and key not in checked:
                    libraries.append(steamapps_path)
                    checked.add(key)

    return libraries


def list_steam_games(libraries):
    games = []
    for lib in libraries:
        try:
            for file in os.listdir(lib):
                if file.lower().startswith("appmanifest") and file.lower().endswith(".acf"):
                    path = os.path.join(lib, file)
                    with open(path, "r", encoding="utf-8", errors="ignore") as f:
                        data = f.read()
                    appid, name, installdir = parse_vdf_manifest(data)
                    if name and installdir:
                        install_path = os.path.join(os.path.dirname(lib), "common", installdir)
                        games.append({
                            "id": appid or f"unknown-{file}",
                            "title": name,
                            "installDir": install_path,
                            "library": lib,
                        })
        except Exception:
            continue
    return games


def main():
    try:
        # Accept JSON array of extra roots from argv[1] if provided
        extra_roots = []
        if len(sys.argv) > 1:
            try:
                extra_roots = json.loads(sys.argv[1])
            except Exception:
                extra_roots = []

        libraries = find_steam_libraries(extra_roots)
        games = list_steam_games(libraries)
        print(json.dumps({"libraries": libraries, "games": games}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()


