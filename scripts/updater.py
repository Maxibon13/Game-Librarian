import requests
import os
import sys
import subprocess
import json
from pathlib import Path

# === CONFIG ===
REPO_OWNER = "Maxibon13"
REPO_NAME = "Game-Librarian"
LOCAL_APP_PATH = Path("C:/Program Files/Game Librarian")  # Change if different
LOCAL_VERSION_JSON = LOCAL_APP_PATH / "Version.Json"
INSTALLER_BAT_NAME = "InstallerLite.bat"

def get_local_version():
    """Return the local app version read from Version.Json if available.

    Tries Version.Json in the current working directory first (useful for dev),
    then falls back to the installed app directory.
    """
    candidate_paths = [Path.cwd() / "Version.Json", LOCAL_VERSION_JSON]
    for path in candidate_paths:
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                version_value = data.get("version")
                if version_value is not None:
                    return str(version_value).strip()
            except Exception:
                # Ignore malformed JSON and continue to next candidate
                continue
    return None


def set_local_version(version: str) -> None:
    """Persist the provided version into the installed Version.Json file."""
    LOCAL_APP_PATH.mkdir(parents=True, exist_ok=True)
    payload = {"version": str(version)}
    LOCAL_VERSION_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")

def get_latest_release():
    url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/releases/latest"
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    version = data["tag_name"]
    return version

def run_installer_batch():
    """Execute the lightweight installer batch to fetch files via git.

    The batch installs/updates the app in the parent directory of the script itself.
    """
    scripts_dir = Path(__file__).resolve().parent
    installer_path = scripts_dir / INSTALLER_BAT_NAME
    if not installer_path.exists():
        raise FileNotFoundError(f"Installer script not found: {installer_path}")
    subprocess.run(["cmd", "/c", str(installer_path)], check=True)

def update_app():
    local_version = get_local_version()
    print(f"[INFO] Local version: {local_version or 'None'}")

    latest_version = get_latest_release()
    print(f"[INFO] Latest version: {latest_version}")

    if local_version == latest_version:
        print("[INFO] App is already up to date.")
        return

    print("[INFO] Running lightweight installer to fetch updates via git...")
    run_installer_batch()
    print("[INFO] Update complete.")

if __name__ == "__main__":
    try:
        update_app()
    except Exception as e:
        print(f"[ERROR] {e}")
        sys.exit(1)