# run_game_librarian.pyw
import os
import subprocess
import sys
import traceback

# Path setup
base = os.path.dirname(os.path.abspath(__file__))
os.chdir(base)  # ensure npm runs in the same folder

unpacked = os.path.join(base, "dist", "win-unpacked")
exe_path = os.path.join(unpacked, "Game Librarian.exe")
log_path = os.path.join(base, "run_log.txt")

try:
    if os.path.exists(exe_path):
        subprocess.Popen([exe_path], shell=True)
    else:
        subprocess.Popen(
            ["npm", "run", "dev"],
            shell=True,
            creationflags=subprocess.CREATE_NO_WINDOW
        )
except Exception:
    with open(log_path, "w", encoding="utf-8") as log:
        log.write(traceback.format_exc())
