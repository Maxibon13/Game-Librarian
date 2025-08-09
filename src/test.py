import os
import re
import string

def search_for_steamapps(drive):
    """Search for steamapps folders on a given drive."""
    print(f"[INFO] Scanning drive {drive}...")
    found_paths = []
    for root, dirs, files in os.walk(drive, topdown=True):
        # Skip system folders to speed up search
        dirs[:] = [d for d in dirs if not d.startswith('$') and not d.startswith('ProgramData') and not d.startswith('Windows')]
        
        if "steamapps" in dirs:
            steamapps_path = os.path.join(root, "steamapps")
            print(f"[FOUND] Steam library: {steamapps_path}")
            found_paths.append(steamapps_path)
            dirs.remove("steamapps")  # Don't go deeper inside steamapps
    return found_paths

def find_steam_games():
    """Find all Steam games from all steamapps folders."""
    libraries = set()
    games = []

    # Check all drives from A: to Z:
    for letter in string.ascii_uppercase:
        drive = f"{letter}:/"
        if os.path.exists(drive):
            try:
                libraries.update(search_for_steamapps(drive))
            except PermissionError:
                print(f"[SKIP] No permission to scan {drive}")
                continue

    # Parse each steamapps folder for installed games
    for lib in libraries:
        for file in os.listdir(lib):
            if file.startswith("appmanifest") and file.endswith(".acf"):
                path = os.path.join(lib, file)
                with open(path, "r", encoding="utf-8") as f:
                    data = f.read()
                match = re.search(r'"name"\s+"([^"]+)"', data)
                if match:
                    game_name = match.group(1)
                    games.append(game_name)
                    print(f"[GAME] {game_name} (from {lib})")

    return list(libraries), games

if __name__ == "__main__":
    libraries, games = find_steam_games()

    print("\n=== SUMMARY ===")
    print("Found Steam Libraries:")
    for lib in libraries:
        print(f" - {lib}")

    print("\nInstalled Steam Games:")
    for g in games:
        print(f" - {g}")
        
    p = input("\nPress Enter to exit...")