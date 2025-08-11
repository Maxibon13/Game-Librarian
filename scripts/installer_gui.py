#!/usr/bin/env python3
import os
import sys
import subprocess
import threading
import queue
import shutil
import tempfile
import zipfile
import urllib.request
import socket
from pathlib import Path

try:
    import tkinter as tk
    from tkinter import ttk
    from tkinter.scrolledtext import ScrolledText
except Exception:
    import tkinter as tk
    from tkinter import ttk
    ScrolledText = tk.Text  # type: ignore

class InstallerGUI:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title('Game Librarian Installer')
        self.root.geometry('820x540')
        self.root.minsize(680, 420)

        self.output_queue: 'queue.Queue[str]' = queue.Queue()
        self.proc: subprocess.Popen | None = None
        self.success: bool = False
        self.cancel_requested: bool = False

        title = ttk.Label(self.root, text='Game Librarian Installer', font=('Segoe UI', 14, 'bold'))
        subtitle = ttk.Label(self.root, text='Installing or updating the application. Please wait…', foreground='#555')
        title.pack(anchor='w', padx=12, pady=(12, 2))
        subtitle.pack(anchor='w', padx=12, pady=(0, 8))

        self.text = ScrolledText(self.root, wrap='word', height=20)
        self.text.configure(state='disabled')
        self.text.pack(fill='both', expand=True, padx=12)

        bottom = ttk.Frame(self.root)
        bottom.pack(fill='x', padx=12, pady=10)

        self.status_var = tk.StringVar(value='Running installer…')
        self.status = ttk.Label(bottom, textvariable=self.status_var)
        self.status.pack(side='left')

        self.progress = ttk.Progressbar(bottom, mode='indeterminate', length=180)
        self.progress.pack(side='left', padx=(8, 0))

        self.cancel_btn = ttk.Button(bottom, text='Cancel', command=self.on_cancel)
        self.cancel_btn.pack(side='right')

        self.finish_btn = ttk.Button(bottom, text='Finish', command=self.on_finish, state='disabled')
        self.finish_btn.pack(side='right', padx=(0, 8))

        self.append_line('[INFO] Starting installer…')
        self.progress.start(60)
        self.start_installer_thread()
        self.root.after(80, self.drain_output_queue)

    def append_line(self, line: str):
        try:
            self.text.configure(state='normal')
            self.text.insert('end', line.rstrip() + '\n')
            self.text.see('end')
        finally:
            self.text.configure(state='disabled')

    def start_installer_thread(self):
        t = threading.Thread(target=self.run_installer, daemon=True)
        t.start()

    # Unified logger: print to console and stream into GUI
    def _emit(self, line: str):
        try:
            print(line, flush=True)
        except Exception:
            pass
        self.output_queue.put(line)

    def run_installer(self):
        REPO_URL = os.environ.get('REPO_URL', 'https://github.com/Maxibon13/Game-Librarian.git')
        BRANCH = os.environ.get('BRANCH', 'main')
        script_dir = Path(__file__).resolve().parent
        target_dir_env = os.environ.get('INSTALL_DIR', '')
        target_dir = Path(target_dir_env).resolve() if target_dir_env else (script_dir / '..').resolve()

        try:
            target_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            self._fail(f'Failed to create/access target directory: "{target_dir}": {e}')
            return

        self._emit(f'[INFO] Target directory: "{target_dir}"')

        if not self._is_online():
            self._fail('Aborting installation - User is offline')
            return

        tmp_base = Path(tempfile.gettempdir()) / 'GameLibrarian_update'
        tmp_base.mkdir(parents=True, exist_ok=True)
        tmp_dir = Path(tempfile.mkdtemp(prefix='GameLibrarian_', dir=str(tmp_base)))
        self._emit(f'[INFO] Using temporary directory: "{tmp_dir}"')

        try:
            owner_repo = self._owner_repo_from_url(REPO_URL)
            zip_url = f'https://codeload.github.com/{owner_repo}/zip/refs/heads/{BRANCH}'
            zip_path = tmp_dir / 'repo.zip'
            self.status_var.set('Downloading latest version …')
            self._emit(f'[INFO] Downloading latest source ZIP from {zip_url}')
            if not self._download_file(zip_url, zip_path):
                self._cleanup_tmp(tmp_dir)
                self._fail('Download failed')
                return

            if self.cancel_requested:
                self._cleanup_tmp(tmp_dir)
                self._fail('Cancelled')
                return

            self.status_var.set('Extracting files …')
            self._emit('[INFO] Extracting ZIP ...')
            extract_dir = tmp_dir / 'repo'
            extract_dir.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(zip_path, 'r') as zf:
                zf.extractall(extract_dir)

            entries = [p for p in extract_dir.iterdir() if p.is_dir()]
            if not entries:
                self._cleanup_tmp(tmp_dir)
                self._fail('ZIP file structure unexpected: no folder found')
                return
            repo_root = entries[0]

            self.status_var.set('Syncing files …')
            self._emit('[INFO] Syncing files to application directory ...')
            self._copy_tree(src=repo_root, dst=target_dir, exclude_dirs={'.git', 'node_modules'})
            self._emit('[DEBUG] File sync completed.')

            # Re-enable npm install
            self.status_var.set('Checking Node.js/npm …')
            npm_cmd = self._ensure_npm_available()
            if not npm_cmd:
                self._cleanup_tmp(tmp_dir)
                self._fail('npm not available. Please install Node.js from https://nodejs.org/ and try again.')
                return
            # log versions for debugging
            self._emit('[INFO] Node/npm detected. Printing versions …')
            self._run_and_stream([npm_cmd, '--version'], cwd=target_dir, env=os.environ.copy())
            node_exe = shutil.which('node') or 'node'
            self._run_and_stream([node_exe, '--version'], cwd=target_dir, env=os.environ.copy())

            # Install dependencies
            self.status_var.set('Installing dependencies (npm) …')
            env = os.environ.copy()
            if not self._run_and_stream([npm_cmd, 'ci'], cwd=target_dir, env=env):
                self._emit('[WARN] npm ci failed, falling back to npm install …')
                if not self._run_and_stream([npm_cmd, 'install'], cwd=target_dir, env=env):
                    self._cleanup_tmp(tmp_dir)
                    self._fail('npm install failed')
                    return
            self._emit('[INFO] Dependency installation completed.')
            self.status_var.set('Finalizing installation …')

            self._emit(f'[DEBUG] Starting cleanup of temp directory: {tmp_dir}')
            self._cleanup_tmp(tmp_dir)
            self._emit('[DEBUG] Cleanup complete.')
            self.success = True
            self._emit('[INFO] Installer finished successfully.')
            self._emit('__COMPLETE__')
        except Exception as e:
            self._cleanup_tmp(tmp_dir)
            self._fail(f'Unexpected error: {e}')

    def _fail(self, message: str):
        self.success = False
        self._emit(f'[ERROR] {message}')
        self._emit('__COMPLETE__')

    def _is_online(self, host: str = 'github.com', port: int = 443, timeout: float = 3.5) -> bool:
        try:
            socket.create_connection((host, port), timeout=timeout).close()
            return True
        except Exception:
            return False

    def _download_file(self, url: str, dest: Path) -> bool:
        try:
            self._emit('[CMD] DOWNLOAD ' + url)
            req = urllib.request.Request(url, headers={'User-Agent': 'GameLibrarianInstaller/1.0'})
            with urllib.request.urlopen(req, timeout=60) as response:
                total = int(response.headers.get('Content-Length') or '0')
                chunk_size = 8192
                downloaded = 0
                with open(dest, 'wb') as f:
                    while True:
                        chunk = response.read(chunk_size)
                        if not chunk: break
                        f.write(chunk)
                        downloaded += len(chunk)
                        if self.cancel_requested: return False
                        if total and ((downloaded % (512 * 1024) < chunk_size) or downloaded == total):
                            self._emit(f'[INFO] Downloaded {downloaded // 1024} / {total // 1024} KiB')
            return True
        except Exception as e:
            self._emit(f'[ERROR] Download error: {e}')
            return False

    def _owner_repo_from_url(self, url: str) -> str:
        try:
            path = url.split('github.com/', 1)[1].replace('.git', '')
            parts = path.strip('/').split('/')
            if len(parts) >= 2: return f'{parts[0]}/{parts[1]}'
        except Exception: pass
        return 'Maxibon13/Game-Librarian'

    def _ensure_npm_available(self) -> str | None:
        if npm_path := shutil.which('npm'): return npm_path
        
        node_exe = shutil.which('node')
        if not node_exe:
            for pf_env in ['ProgramFiles', 'ProgramFiles(x86)']:
                if pf := os.environ.get(pf_env):
                    if Path(pf, 'nodejs', 'node.exe').exists():
                        node_exe = str(Path(pf, 'nodejs', 'node.exe'))
                        break
        if node_exe:
            if (candidate := Path(node_exe).parent / 'npm.cmd').exists():
                return str(candidate)

        if winget := shutil.which('winget'):
            self.output_queue.put('[INFO] npm not found. Attempting to install Node.js via winget ...')
            cmd = [winget, 'install', '--id', 'OpenJS.NodeJS.LTS', '-s', 'winget', '--silent', '-e', '--accept-package-agreements', '--accept-source-agreements']
            if self._run_and_stream(cmd, cwd=None, env=os.environ.copy()):
                if npm_path := shutil.which('npm'): return npm_path
        return None

    def _run_and_stream(self, args, cwd=None, env=None) -> bool:
        try:
            self._emit('[CMD] ' + ' '.join([str(a) for a in args]))
            popen_kwargs = {
                'cwd': str(cwd) if cwd else None, 'stdout': subprocess.PIPE,
                'stderr': subprocess.STDOUT, 'stdin': subprocess.DEVNULL,
                'text': True, 'encoding': 'utf-8', 'errors': 'replace',
                'bufsize': 1, 'env': env,
            }
            if sys.platform == "win32":
                popen_kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
            
            p = subprocess.Popen(args, **popen_kwargs)
            assert p.stdout is not None
            self.proc = p
            for line in p.stdout:
                if self.cancel_requested:
                    try: p.terminate()
                    except Exception: pass
                    return False
                self._emit(line.rstrip())

            code = p.wait()
            self.proc = None
            if code != 0:
                self._emit(f'[ERROR] Command exited with code {code}')
                return False
            return True
        except FileNotFoundError:
            self._emit(f'[ERROR] Command not found: {args[0]}')
            return False
        except Exception as e:
            self._emit(f'[ERROR] Failed to run command: {e}')
            return False

    def _copy_tree(self, src: Path, dst: Path, exclude_dirs: set[str]):
        for root, dirs, files in os.walk(src):
            rel = Path(root).relative_to(src)
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            (dst / rel).mkdir(parents=True, exist_ok=True)
            for f in files:
                if any(part in exclude_dirs for part in Path(root).parts):
                    continue
                src_path = Path(root) / f
                dst_path = dst / rel / f
                try:
                    shutil.copy2(src_path, dst_path)
                except Exception as e:
                    self._emit(f'[WARN] Failed to copy {src_path} -> {dst_path}: {e}')

    def _cleanup_tmp(self, tmp_dir: Path):
        self._emit('[INFO] Removing temporary directory ...')
        shutil.rmtree(tmp_dir, ignore_errors=True)

    def drain_output_queue(self):
        try:
            while True:
                line = self.output_queue.get_nowait()
                if line == '__COMPLETE__':
                    self.on_complete()
                    # keep draining any remaining lines (in case multiple markers or late logs)
                    continue
                self.append_line(line)
        except queue.Empty:
            pass
        finally:
            # Always continue polling; harmless after completion and ensures UI stays updated
            self.root.after(120, self.drain_output_queue)

    def on_complete(self):
        self.status_var.set('Completed.' if self.success else 'Completed with errors.')
        self.finish_btn.configure(state='normal')
        self.cancel_btn.configure(state='disabled')
        try:
            self.progress.stop()
            # Fill the bar and switch to determinate to visually indicate finish
            self.progress.configure(mode='determinate', maximum=100, value=100)
        except Exception: pass

    def on_cancel(self):
        self.cancel_requested = True
        if self.proc and self.proc.poll() is None:
            try: self.proc.terminate()
            except Exception: pass
        self.status_var.set('Cancelling …')
        self.append_line('[INFO] Cancel requested by user.')
        try: self.progress.stop()
        except Exception: pass

    def on_finish(self):
        self.root.destroy()

def main():
    # Hide the Windows console so only the GUI is visible
    if sys.platform == 'win32' and os.environ.get('GL_SHOW_CONSOLE') != '1':
        try:
            import ctypes  # standard library
            hwnd = ctypes.windll.kernel32.GetConsoleWindow()
            if hwnd:
                ctypes.windll.user32.ShowWindow(hwnd, 0)  # SW_HIDE = 0
        except Exception:
            pass
    root = tk.Tk()
    try:
        style = ttk.Style()
        if 'vista' in style.theme_names(): style.theme_use('vista')
        elif 'xpnative' in style.theme_names(): style.theme_use('xpnative')
    except Exception: pass
    InstallerGUI(root)
    root.mainloop()

if __name__ == '__main__':
    main()