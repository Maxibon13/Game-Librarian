#!/usr/bin/env python3
import os
import sys
import subprocess
import threading
import queue
import shutil
import tempfile
from pathlib import Path

try:
    import tkinter as tk
    from tkinter import ttk
    from tkinter.scrolledtext import ScrolledText
except Exception:
    # Fallback for very old Python where ScrolledText may not be present
    import tkinter as tk
    from tkinter import ttk
    ScrolledText = tk.Text  # type: ignore


class InstallerGUI:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title('Game Librarian Installer')
        self.root.geometry('800x520')
        self.root.minsize(640, 400)

        self.output_queue: 'queue.Queue[str]' = queue.Queue()
        self.proc: subprocess.Popen | None = None
        self.success: bool = False

        # UI
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

        self.finish_btn = ttk.Button(bottom, text='Finish', command=self.on_finish, state='disabled')
        self.finish_btn.pack(side='right')

        self.append_line('[INFO] Starting installer…')
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

    def run_installer(self):
        # Port of WinInstaller.bat to Python with streamed output
        REPO_URL = os.environ.get('REPO_URL', 'https://github.com/Maxibon13/Game-Librarian.git')
        BRANCH = os.environ.get('BRANCH', 'main')

        script_dir = Path(__file__).resolve().parent
        # Resolve target dir
        target_dir_env = os.environ.get('INSTALL_DIR', '')
        if target_dir_env:
            target_dir = Path(target_dir_env).resolve()
        else:
            target_dir = (script_dir / '..').resolve()

        try:
            target_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            self.output_queue.put(f'[ERROR] Failed to create/access target directory: "{target_dir}": {e}')
            self.success = False
            self.output_queue.put('__COMPLETE__')
            return

        self.output_queue.put(f'[INFO] Target directory: "{target_dir}"')

        # Ensure git exists
        if not self._command_exists('git'):
            self.output_queue.put('[ERROR] Git is required but was not found in PATH. Install https://git-scm.com/download/win')
            self.success = False
            self.output_queue.put('__COMPLETE__')
            return

        # Avoid interactive prompts
        env = os.environ.copy()
        env['GIT_TERMINAL_PROMPT'] = '0'

        # Create temp dir
        tmp_base = Path(tempfile.gettempdir()) / 'GameLibrarian_update'
        tmp_base.mkdir(parents=True, exist_ok=True)
        tmp_dir = Path(tempfile.mkdtemp(prefix='GameLibrarian_', dir=str(tmp_base)))
        self.output_queue.put(f'[INFO] Creating temporary directory: "{tmp_dir}"')

        # Clone repository
        clone_cmd = ['git', 'clone', '--depth', '1', '-b', BRANCH, '--recurse-submodules', '--shallow-submodules', REPO_URL, str(tmp_dir)]
        if not self._run_and_stream(clone_cmd, cwd=None, env=env):
            self._cleanup_tmp(tmp_dir)
            self.success = False
            self.output_queue.put('__COMPLETE__')
            return

        # Sync files (exclude .git and node_modules)
        self.output_queue.put('[INFO] Syncing files from temp clone (including new files) ...')
        try:
            self._copy_tree(src=tmp_dir, dst=target_dir, exclude_dirs={'.git', 'node_modules'})
        except Exception as e:
            self.output_queue.put(f'[ERROR] File update failed: {e}')
            self._cleanup_tmp(tmp_dir)
            self.success = False
            self.output_queue.put('__COMPLETE__')
            return

        # Ensure Node and npm
        self.output_queue.put('[INFO] Ensuring Node.js is available and installing dependencies ...')
        node_exe = shutil.which('node')
        if not node_exe:
            # Try common locations
            pf = os.environ.get('ProgramFiles')
            pfx86 = os.environ.get('ProgramFiles(x86)')
            nvm_sym = os.environ.get('NVM_SYMLINK')
            candidates = []
            if pf:
                candidates.append(str(Path(pf) / 'nodejs' / 'node.exe'))
            if pfx86:
                candidates.append(str(Path(pfx86) / 'nodejs' / 'node.exe'))
            if nvm_sym:
                candidates.append(str(Path(nvm_sym) / 'node.exe'))
            for c in candidates:
                if Path(c).exists():
                    node_exe = c
                    break
        if not node_exe:
            self.output_queue.put('[ERROR] Node.js not found. Please install Node.js: https://nodejs.org/')
            self._cleanup_tmp(tmp_dir)
            self.success = False
            self.output_queue.put('__COMPLETE__')
            return

        node_dir = str(Path(node_exe).parent)
        npm_cmd = str(Path(node_dir) / 'npm.cmd')
        if not Path(npm_cmd).exists():
            w = shutil.which('npm')
            if w:
                npm_cmd = w
        if not npm_cmd or not Path(npm_cmd).exists() and not shutil.which('npm'):
            self.output_queue.put('[ERROR] npm not found next to Node or in PATH.')
            self._cleanup_tmp(tmp_dir)
            self.success = False
            self.output_queue.put('__COMPLETE__')
            return

        # Run npm install/build/package
        if not self._run_and_stream([npm_cmd, 'ci'], cwd=target_dir, env=env):
            if not self._run_and_stream([npm_cmd, 'install'], cwd=target_dir, env=env):
                self._cleanup_tmp(tmp_dir)
                self.success = False
                self.output_queue.put('__COMPLETE__')
                return

        if not self._run_and_stream([npm_cmd, 'run', 'build'], cwd=target_dir, env=env):
            self._cleanup_tmp(tmp_dir)
            self.success = False
            self.output_queue.put('__COMPLETE__')
            return

        # Skip packaging per requirements: do NOT run electron-builder (dist:win or dist:dir)
        self.output_queue.put('[INFO] Skipping packaging step (no electron-builder).')

        # Success and cleanup
        self._cleanup_tmp(tmp_dir)
        self.output_queue.put(f'[INFO] Repository synchronized to branch: {BRANCH}')
        self.success = True
        self.output_queue.put('[INFO] Installer finished successfully.')
        self.output_queue.put('__COMPLETE__')

    def _command_exists(self, cmd: str) -> bool:
        return shutil.which(cmd) is not None

    def _run_and_stream(self, args, cwd=None, env=None) -> bool:
        try:
            self.output_queue.put('[CMD] ' + ' '.join([str(a) for a in args]))
            p = subprocess.Popen(args, cwd=str(cwd) if cwd else None, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, universal_newlines=True, bufsize=1, env=env)
            assert p.stdout is not None
            for line in p.stdout:
                self.output_queue.put(line.rstrip())
            code = p.wait()
            if code != 0:
                self.output_queue.put(f'[ERROR] Command exited with code {code}')
                return False
            return True
        except FileNotFoundError:
            self.output_queue.put(f'[ERROR] Command not found: {args[0]}')
            return False
        except Exception as e:
            self.output_queue.put(f'[ERROR] Failed to run command: {e}')
            return False

    def _copy_tree(self, src: Path, dst: Path, exclude_dirs: set[str]):
        src = src.resolve()
        dst = dst.resolve()
        for root, dirs, files in os.walk(src):
            rel = Path(root).relative_to(src)
            # filter dirs in-place
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            # ensure directory exists
            (dst / rel).mkdir(parents=True, exist_ok=True)
            for f in files:
                s = Path(root) / f
                d = dst / rel / f
                # Skip .git artifacts
                parts = set(Path(root).parts)
                if any(part in exclude_dirs for part in parts):
                    continue
                shutil.copy2(s, d)

    def _cleanup_tmp(self, tmp_dir: Path):
        self.output_queue.put('[INFO] Removing temporary directory ...')
        try:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass

    def drain_output_queue(self):
        try:
            while True:
                line = self.output_queue.get_nowait()
                if line == '__COMPLETE__':
                    self.on_complete()
                    break
                self.append_line(line)
        except queue.Empty:
            pass
        finally:
            # continue polling until completion
            if self.finish_btn['state'] == 'disabled':
                self.root.after(120, self.drain_output_queue)

    def on_complete(self):
        self.status_var.set('Completed.' if self.success else 'Completed with errors.')
        self.finish_btn.configure(state='normal')

    def on_finish(self):
        try:
            target_dir = os.environ.get('INSTALL_DIR')
            if not target_dir:
                # default to parent of scripts directory (same logic as batch)
                target_dir = str(Path(__file__).resolve().parent.parent)
            run_bat = Path(target_dir) / 'run.bat'
            if run_bat.exists() and self.success:
                # Launch the app and detach
                subprocess.Popen(['cmd.exe', '/c', 'start', '""', 'run.bat'], cwd=str(Path(target_dir)))
        except Exception:
            pass
        finally:
            self.root.destroy()


def main():
    root = tk.Tk()
    # Use themed widgets if available
    try:
        style = ttk.Style()
        if 'vista' in style.theme_names():
            style.theme_use('vista')
        elif 'xpnative' in style.theme_names():
            style.theme_use('xpnative')
    except Exception:
        pass
    InstallerGUI(root)
    root.mainloop()


if __name__ == '__main__':
    main()


