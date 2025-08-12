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
import re
from pathlib import Path
import importlib
import json
try:
    import winreg  # type: ignore
except Exception:
    winreg = None  # type: ignore

import tkinter as tk
from tkinter import ttk
from tkinter import filedialog

# Prefer CustomTkinter for modern UI
try:
    import customtkinter as ctk  # type: ignore
except Exception:
    ctk = None

# Optional PIL for high-quality icon scaling / CTkImage
try:
    from PIL import Image, ImageTk  # type: ignore
except Exception:  # pragma: no cover
    Image = None  # type: ignore
    ImageTk = None  # type: ignore


class InfoScreen:
    """Pre-install screen to choose install location and options, styled like GLinstaller v2."""

    def __init__(self, root: tk.Tk, on_continue, on_cancel):
        self.root = root
        self.on_continue = on_continue
        self.on_cancel = on_cancel

        BaseFrame = ctk.CTkFrame if ctk else ttk.Frame
        Label = ctk.CTkLabel if ctk else ttk.Label
        Button = ctk.CTkButton if ctk else ttk.Button
        Entry = ctk.CTkEntry if ctk else ttk.Entry

        # Window basics
        self.root.title('Game Librarian Installer')
        self.root.geometry('820x560')
        self.root.minsize(680, 420)
        if ctk:
            try:
                ctk.set_appearance_mode('dark')
                ctk.set_default_color_theme('dark-blue')
            except Exception:
                pass
        else:
            _apply_styles(self.root)

        # (Logo removed) Do not set a window icon

        self.frame = BaseFrame(root)
        if ctk:
            try:
                self.frame.configure(corner_radius=10)
            except Exception:
                pass
        self.frame.pack(fill='both', expand=True, padx=20, pady=20)

        header = BaseFrame(self.frame)
        if ctk:
            try:
                header.configure(fg_color='transparent')
            except Exception:
                pass
        header.pack(fill='x', pady=(0, 16))
        # (Logo removed) No header image
        title_col = BaseFrame(header)
        if ctk:
            try:
                title_col.configure(fg_color='transparent')
            except Exception:
                pass
        title_col.pack(side='left')
        if ctk:
            Label(title_col, text='Game Librarian', font=('Segoe UI', 16, 'bold'), bg_color='transparent').pack(anchor='w')
            Label(title_col, text='Install or update the app with one click', bg_color='transparent').pack(anchor='w')
        else:
            Label(title_col, text='Game Librarian', font=('Segoe UI', 16, 'bold')).pack(anchor='w')
            Label(title_col, text='Install or update the app with one click').pack(anchor='w')

        Label(
            self.frame,
            text=(
                'This installer will download the latest version of Game Librarian and synchronize files\n'
                'with your selected install directory. Your existing user content will be preserved.'
            ),
            wraplength=560, justify='left'
        ).pack(pady=(0, 16), anchor='w')

        opts = BaseFrame(self.frame)
        opts.pack(fill='x', pady=(0, 12))
        self.opt_desktop = tk.BooleanVar(value=True)
        self.opt_startup = tk.BooleanVar(value=False)
        self.opt_search = tk.BooleanVar(value=True)
        self.opt_autorun = tk.BooleanVar(value=True)
        if ctk:
            self._add_ctk_switch(opts, 'Add shortcut to Desktop', self.opt_desktop)
            self._add_ctk_switch(opts, 'Add to Startup (launch on sign-in)', self.opt_startup)
            self._add_ctk_switch(opts, 'Add to Windows Search (Start Menu entry)', self.opt_search)
            self._add_ctk_switch(opts, 'Auto-run when installation completes', self.opt_autorun)
        else:
            ttk.Checkbutton(opts, text='Add shortcut to Desktop', variable=self.opt_desktop).pack(anchor='w', pady=2)
            ttk.Checkbutton(opts, text='Add to Startup (launch on sign-in)', variable=self.opt_startup).pack(anchor='w', pady=2)
            ttk.Checkbutton(opts, text='Add to Windows Search (Start Menu entry)', variable=self.opt_search).pack(anchor='w', pady=2)
            ttk.Checkbutton(opts, text='Auto-run when installation completes', variable=self.opt_autorun).pack(anchor='w', pady=2)

        loc_frame = BaseFrame(self.frame)
        loc_frame.pack(fill='x', pady=(8, 16))

        Label(loc_frame, text='Install Location:', width=16).pack(side='left', anchor='w')
        self.location_var = tk.StringVar()

        # Detect existing installation via registry; fallback to default
        existing_dir = self._detect_existing_installation()
        self.existing_detected = existing_dir is not None and Path(existing_dir).exists()
        if self.existing_detected:
            self.location_var.set(str(existing_dir))
        else:
            # Default to current script directory's parent (existing behavior)
            script_dir = Path(__file__).resolve().parent
            default_dir = (script_dir / '..').resolve()
            self.location_var.set(str(default_dir))

        if ctk:
            self.entry = Entry(loc_frame, textvariable=self.location_var, width=380)
            self.entry.pack(side='left', fill='x', expand=True, padx=(0, 6))
            self.browse_btn = Button(
                loc_frame, text='Browse…', command=self._browse_location, width=110,
                fg_color='transparent', hover_color='#2a3344', border_width=1,
                border_color='#3a3f46', text_color='#e5e7eb'
            )
            self.browse_btn.pack(side='left')
        else:
            self.entry = Entry(loc_frame, textvariable=self.location_var, width=54)
            self.entry.pack(side='left', fill='x', expand=True, padx=(0, 5))
            self.browse_btn = ttk.Button(loc_frame, text='Browse…', command=self._browse_location)
            self.browse_btn.pack(side='left')

        # If existing install detected, lock the location field and show a note
        if self.existing_detected:
            try:
                self.entry.configure(state='disabled')
            except Exception:
                pass
            try:
                self.browse_btn.configure(state='disabled')
            except Exception:
                pass
            note = Label(self.frame, text='Existing installation detected. The installer will update it in place.',
                         font=('Segoe UI', 10),
                         **({'bg_color': 'transparent'} if ctk else {}))
            note.pack(anchor='w', pady=(6, 0))

        btn_frame = BaseFrame(self.frame)
        btn_frame.pack(fill='x', pady=(12, 0))
        if ctk:
            Button(
                btn_frame, text='Continue', command=self._continue,
                fg_color='transparent', hover_color='#2a3344', border_width=1,
                border_color='#3a3f46', text_color='#e5e7eb', width=120
            ).pack(side='right', padx=(0, 6))
            Button(
                btn_frame, text='Cancel', command=self.on_cancel,
                fg_color='transparent', hover_color='#2a3344', border_width=1,
                border_color='#3a3f46', text_color='#e5e7eb', width=110
            ).pack(side='right', padx=(0, 8))
        else:
            ttk.Button(btn_frame, text='Continue', command=self._continue).pack(side='right', padx=(0, 6))
            ttk.Button(btn_frame, text='Cancel', command=self.on_cancel).pack(side='right', padx=(0, 8))

    def _browse_location(self):
        folder = filedialog.askdirectory(initialdir=self.location_var.get(), title='Select Install Location')
        if folder:
            self.location_var.set(folder)

    def _continue(self):
        self.frame.destroy()
        target = Path(self.location_var.get())
        opts = {
            'desktop': bool(self.opt_desktop.get()),
            'startup': bool(self.opt_startup.get()),
            'search': bool(self.opt_search.get()),
            'autorun': bool(self.opt_autorun.get()),
        }
        # If existing install detected, always overwrite that location
        if getattr(self, 'existing_detected', False):
            detected = self._detect_existing_installation()
            if detected:
                target = Path(detected)
        self.on_continue(target, opts)

    def _detect_existing_installation(self) -> str | None:
        # Use Windows uninstall registry entry if available
        try:
            if sys.platform == 'win32' and winreg:
                for root in (winreg.HKEY_CURRENT_USER,):
                    try:
                        path = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\GameLibrarian"
                        access = winreg.KEY_READ | getattr(winreg, 'KEY_WOW64_64KEY', 0)
                        with winreg.OpenKey(root, path, 0, access) as k:
                            val, _ = winreg.QueryValueEx(k, 'InstallLocation')
                            if val and Path(val).exists():
                                return val
                    except FileNotFoundError:
                        pass
        except Exception:
            pass
        return None

    # ---- CTk switch helpers ----
    def _add_ctk_switch(self, parent, text: str, var: tk.BooleanVar):
        sw = ctk.CTkSwitch(
            parent, text=text, variable=var, width=62, height=28,
            fg_color='#3a3f46', progress_color='#22c55e',
            button_color='#e2e8f0', button_hover_color='#f8fafc'
        )
        def _on_toggle():
            try:
                self._animate_switch(sw, bool(var.get()))
            except Exception:
                pass
        sw.configure(command=_on_toggle)
        sw.pack(anchor='w', pady=4)
        return sw

    def _hex_to_rgb(self, hx: str):
        hx = hx.lstrip('#')
        return tuple(int(hx[i:i+2], 16) for i in (0, 2, 4))

    def _rgb_to_hex(self, rgb):
        return '#%02x%02x%02x' % rgb

    def _lerp(self, a, b, t: float):
        return int(a + (b - a) * t)

    def _animate_switch(self, sw, on: bool):
        try:
            off_col = self._hex_to_rgb('3a3f46')
            on_col = self._hex_to_rgb('22c55e')
            steps = 8
            interval = 14
            for i in range(steps + 1):
                t = i / float(steps)
                if on:
                    r = self._lerp(off_col[0], on_col[0], t)
                    g = self._lerp(off_col[1], on_col[1], t)
                    b = self._lerp(off_col[2], on_col[2], t)
                    sw.configure(progress_color=self._rgb_to_hex((r, g, b)))
                else:
                    r = self._lerp(on_col[0], off_col[0], t)
                    g = self._lerp(on_col[1], off_col[1], t)
                    b = self._lerp(on_col[2], off_col[2], t)
                    sw.configure(fg_color=self._rgb_to_hex((r, g, b)))
                sw.update_idletasks()
                sw.after(interval)
            sw.configure(progress_color='#22c55e', fg_color='#3a3f46')
        except Exception:
            pass


class InstallerGUI:
    """Update installer screen (not first-time). Uses v2 layout while preserving update logic."""

    def __init__(self, root: tk.Tk, target_dir: Path, options: dict | None = None):
        self.root = root
        self.target_dir = target_dir
        self.options = options or {'desktop': True, 'startup': False, 'search': True, 'autorun': True}

        self.output_queue: 'queue.Queue[str]' = queue.Queue()
        self.proc: subprocess.Popen | None = None
        self.success: bool = False
        self.cancel_requested: bool = False
        self.target_exe: Path | None = None

        # Header with logo and titles
        if not ctk:
            _apply_styles(self.root)
        BaseFrame = ctk.CTkFrame if ctk else ttk.Frame
        HeaderLabel = ctk.CTkLabel if ctk else ttk.Label
        header = BaseFrame(self.root, **({'fg_color': 'transparent'} if ctk else {'style': 'GL.Header.TFrame'}))
        header.pack(fill='x', padx=12, pady=(12, 8))
        # (Logo removed) No header image
        title_col = BaseFrame(header, **({'fg_color': 'transparent'} if ctk else {'style': 'GL.Header.TFrame'}))
        title_col.pack(side='left')
        if ctk:
            HeaderLabel(title_col, text='Game Librarian', font=('Segoe UI', 14, 'bold'), bg_color='transparent').pack(anchor='w')
            HeaderLabel(title_col, text='Syncing files and installing dependencies…', bg_color='transparent').pack(anchor='w')
        else:
            ttk.Label(title_col, text='Game Librarian', style='GL.Title.TLabel').pack(anchor='w')
            ttk.Label(title_col, text='Syncing files and installing dependencies…', style='GL.Subtitle.TLabel').pack(anchor='w')

        # Log area
        try:
            from tkinter.scrolledtext import ScrolledText
        except Exception:
            ScrolledText = tk.Text  # type: ignore
        self.text = ScrolledText(self.root, wrap='word', height=20)
        if not ctk:
            try:
                self.text.configure(background='#101418', foreground='#e5e7eb', insertbackground='#e5e7eb')
            except Exception:
                pass
        self.text.configure(state='disabled')
        self.text.pack(fill='both', expand=True, padx=12)

        bottom = ttk.Frame(self.root, style='GL.Body.TFrame' if not ctk else None)

        self.status_var = tk.StringVar(value='Running installer…')
        self.status = ttk.Label(bottom, textvariable=self.status_var, style='GL.Body.TLabel' if not ctk else None)

        if ctk:
            self.progress = ctk.CTkProgressBar(bottom, width=180, mode='indeterminate')
        else:
            self.progress = ttk.Progressbar(bottom, mode='indeterminate', length=180, style='GL.Horizontal.TProgressbar')

        self.cancel_btn = ttk.Button(bottom, text='Cancel', command=self.on_cancel, style='GL.Outlined.TButton' if not ctk else None)
        self.finish_btn = ttk.Button(bottom, text='Finish', command=self.on_finish, state='disabled', style='GL.Primary.TButton' if not ctk else None)

        # Show bottom bar and start
        self.append_line('[INFO] Starting installer…')
        try:
            if ctk:
                self.progress.start()
            else:
                self.progress.start(60)
        except Exception:
            try:
                self.progress.start()
            except Exception:
                pass
        bottom.pack(fill='x', padx=12, pady=10)
        self.status.pack(side='left')
        self.progress.pack(side='left', padx=(8, 0))
        self.finish_btn.pack(side='right', padx=(0, 8))
        self.cancel_btn.pack(side='right')

        self.start_installer_thread()
        self.root.after(80, self.drain_output_queue)

    def append_line(self, line: str):
        try:
            self.text.configure(state='normal')
            self.text.insert('end', line.rstrip() + '\n')
            self.text.see('end')
        finally:
            try:
                self.text.configure(state='disabled')
            except Exception:
                pass

    def start_installer_thread(self):
        t = threading.Thread(target=self.run_installer, daemon=True)
        t.start()

    def _emit(self, line: str):
        try:
            print(line, flush=True)
        except Exception:
            pass
        self.output_queue.put(line)

    # ---------------- Core installer (update behavior) ----------------
    def run_installer(self):
        REPO_URL = os.environ.get('REPO_URL', 'https://github.com/Maxibon13/Game-Librarian.git')
        BRANCH = os.environ.get('BRANCH', 'main')

        target_dir = self.target_dir
        try:
            target_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            self._fail(f'Failed to create/access target directory: "{target_dir}": {e}')
            return

        self._emit(f'[INFO] Target directory: "{target_dir}"')

        if not self._is_online():
            self._fail('Aborting installation - User is offline')
            return

        # Ensure Python (for any helper scripts)
        self.status_var.set('Checking Python runtime …')
        if not self._ensure_python_available((3, 10)):
            self._fail('Python 3.10+ is required and could not be installed automatically.')
            return

        # Ensure optional/required Python modules
        self.status_var.set('Checking required Python modules …')
        try:
            self._ensure_python_modules({'customtkinter': 'customtkinter'})
        except Exception:
            pass

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
            base_excludes = {'.git', 'node_modules'}
            keep_excludes = {'TESTING', 'MOD'}
            extra = os.environ.get('INSTALLER_CLEAN_EXCLUDE', '')
            if extra:
                for tok in re.split(r'[;,]', extra):
                    tok = tok.strip()
                    if tok:
                        keep_excludes.add(tok)
            all_excludes = base_excludes | keep_excludes
            self._emit(f"[INFO] Excluding folders: {sorted(all_excludes)}")
            self._copy_tree(src=repo_root, dst=target_dir, exclude_dirs=all_excludes)
            self._emit('[INFO] Cleaning old files not present in the repository ...')
            self._clean_extraneous(src=repo_root, dst=target_dir, exclude_dirs=all_excludes)
            self._emit('[DEBUG] File sync + cleanup completed.')

            # Shortcuts (autorun deferred until Finish pressed)
            self._emit('[INFO] Applying selected options …')
            try:
                target_exe = self._resolve_app_exe(target_dir)
                if target_exe and target_exe.exists():
                    self._emit(f'[INFO] Detected application binary: {target_exe}')
                else:
                    self._emit('[WARN] Could not locate application binary to shortcut/autorun.')
                # Remember detected exe for Finish autorun
                self.target_exe = target_exe if target_exe and target_exe.exists() else None
                # Prefer icon from install dir; fall back to repo-relative icon
                icon_ico = (target_dir / 'src' / 'Icon.ico')
                if not icon_ico.exists():
                    alt = Path(__file__).resolve().parent.parent / 'src' / 'Icon.ico'
                    if alt.exists():
                        icon_ico = alt
                # Create shortcuts only if executable found
                if target_exe and target_exe.exists():
                    if self.options.get('desktop'):
                        self._create_shortcut(target_exe, self._desktop_dir() / 'Game Librarian.lnk', icon_ico)
                    if self.options.get('search'):
                        self._create_shortcut(target_exe, self._start_menu_dir() / 'Game Librarian.lnk', icon_ico)
                    if self.options.get('startup'):
                        self._create_shortcut(target_exe, self._startup_dir() / 'Game Librarian.lnk', icon_ico)
                # Register in Windows Apps list (Add/Remove Programs)
                try:
                    self._register_uninstall_entry(target_dir, self.target_exe or target_exe, icon_ico if icon_ico.exists() else None)
                except Exception as e:
                    self._emit(f'[WARN] Failed to register in Apps list: {e}')
            except Exception as e:
                self._emit(f'[WARN] Failed to apply options: {e}')

            # Ensure Node/npm and install deps
            self.status_var.set('Checking Node.js/npm …')
            npm_cmd = self._ensure_npm_available()
            if not npm_cmd:
                self._cleanup_tmp(tmp_dir)
                self._fail('npm not available. Please install Node.js from https://nodejs.org/ and try again.')
                return
            self._emit('[INFO] Node/npm detected. Printing versions …')
            self._run_and_stream([npm_cmd, '--version'], cwd=target_dir, env=os.environ.copy())
            node_exe = shutil.which('node') or 'node'
            self._run_and_stream([node_exe, '--version'], cwd=target_dir, env=os.environ.copy())

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

    # ---------------- Helpers (ported from original installer) ----------------
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
                        if not chunk:
                            break
                        f.write(chunk)
                        downloaded += len(chunk)
                        if self.cancel_requested:
                            return False
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
            if len(parts) >= 2:
                return f'{parts[0]}/{parts[1]}'
        except Exception:
            pass
        return 'Maxibon13/Game-Librarian'

    def _ensure_npm_available(self) -> str | None:
        if npm_path := shutil.which('npm'):
            return npm_path

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
            cmd = [
                winget, 'install', '--id', 'OpenJS.NodeJS.LTS', '-s', 'winget', '--silent', '-e',
                '--accept-package-agreements', '--accept-source-agreements'
            ]
            if self._run_and_stream(cmd, cwd=None, env=os.environ.copy()):
                if npm_path := shutil.which('npm'):
                    return npm_path
        return None

    def _ensure_python_available(self, min_version: tuple[int, int] = (3, 10)) -> bool:
        try:
            if sys.version_info >= (min_version[0], min_version[1]):
                self._emit(f"[INFO] Python runtime OK: {sys.version.split()[0]}")
                return True
        except Exception:
            pass

        def _check_cmd(cmd: list[str]) -> bool:
            try:
                return self._run_and_stream(cmd, cwd=None, env=os.environ.copy())
            except Exception:
                return False

        if shutil.which('py'):
            if _check_cmd(['py', f'-{min_version[0]}.{min_version[1]}', '--version']):
                self._emit('[INFO] Python launcher detected and meets version requirement.')
                return True
            if _check_cmd(['py', '--version']):
                self._emit('[INFO] Python launcher present (version printed above).')
                return True

        if shutil.which('python') and _check_cmd(['python', '--version']):
            self._emit('[INFO] python command available (version printed above).')
            return True

        winget = shutil.which('winget')
        if winget and sys.platform == 'win32':
            self._emit('[INFO] Python not found. Attempting installation via winget (Python.Python.3) …')
            cmd = [
                winget, 'install', '--id', 'Python.Python.3', '--source', 'winget', '--silent', '--exact',
                '--accept-package-agreements', '--accept-source-agreements'
            ]
            self._run_and_stream(cmd, cwd=None, env=os.environ.copy())
            if shutil.which('py') and _check_cmd(['py', '--version']):
                return True
            if shutil.which('python') and _check_cmd(['python', '--version']):
                return True

        return False

    def _ensure_python_modules(self, module_to_pip: dict[str, str]):
        """Ensure specified Python modules are importable; attempt pip installation if missing.

        module_to_pip maps import name -> pip package name.
        This is best-effort and non-fatal; logs progress to the UI.
        """
        for mod, pkg in module_to_pip.items():
            try:
                importlib.import_module(mod)
                self._emit(f"[INFO] Python module available: {mod}")
                continue
            except Exception:
                self._emit(f"[INFO] Python module missing: {mod}. Attempting installation via pip …")
            # Try py -m pip first on Windows; fall back to python -m pip
            cmds: list[list[str]] = []
            if shutil.which('py'):
                cmds.append(['py', '-m', 'pip', 'install', '--upgrade', pkg])
            if shutil.which('python'):
                cmds.append(['python', '-m', 'pip', 'install', '--upgrade', pkg])
            # Last resort plain pip
            if shutil.which('pip'):
                cmds.append(['pip', 'install', '--upgrade', pkg])
            for cmd in cmds:
                if self._run_and_stream(cmd, cwd=None, env=os.environ.copy()):
                    try:
                        importlib.import_module(mod)
                        self._emit(f"[INFO] Installed Python module: {mod}")
                        break
                    except Exception:
                        continue
            else:
                self._emit(f"[WARN] Could not install Python module: {mod}. Proceeding without it.")

    def _run_and_stream(self, args, cwd=None, env=None) -> bool:
        try:
            self._emit('[CMD] ' + ' '.join([str(a) for a in args]))
            popen_kwargs = {
                'cwd': str(cwd) if cwd else None,
                'stdout': subprocess.PIPE,
                'stderr': subprocess.STDOUT,
                'stdin': subprocess.DEVNULL,
                'text': True,
                'encoding': 'utf-8',
                'errors': 'replace',
                'bufsize': 1,
                'env': env,
            }
            if sys.platform == 'win32':
                popen_kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW

            p = subprocess.Popen(args, **popen_kwargs)
            assert p.stdout is not None
            self.proc = p
            for line in p.stdout:
                if self.cancel_requested:
                    try:
                        p.terminate()
                    except Exception:
                        pass
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

    def _clean_extraneous(self, src: Path, dst: Path, exclude_dirs: set[str]):
        try:
            for entry in dst.iterdir():
                name = entry.name
                if name in exclude_dirs:
                    continue
                src_candidate = src / name
                if not src_candidate.exists():
                    try:
                        if entry.is_dir():
                            shutil.rmtree(entry, ignore_errors=True)
                        else:
                            entry.unlink(missing_ok=True)
                        self._emit(f'[INFO] Removed stale item: {entry}')
                    except Exception as e:
                        self._emit(f'[WARN] Failed to remove {entry}: {e}')
                    continue
                if entry.is_dir() and src_candidate.is_dir():
                    self._clean_extraneous(src_candidate, entry, exclude_dirs)
        except Exception as e:
            self._emit(f'[WARN] Cleanup error under {dst}: {e}')

    def _cleanup_tmp(self, tmp_dir: Path):
        self._emit('[INFO] Removing temporary directory ...')
        shutil.rmtree(tmp_dir, ignore_errors=True)

    # Locations and shortcuts
    def _desktop_dir(self) -> Path:
        return Path(os.environ.get('USERPROFILE', '')) / 'Desktop'

    def _start_menu_dir(self) -> Path:
        return Path(os.environ.get('APPDATA', '')) / 'Microsoft' / 'Windows' / 'Start Menu' / 'Programs'

    def _startup_dir(self) -> Path:
        return self._start_menu_dir() / 'Startup'

    def _resolve_app_exe(self, target_dir: Path) -> Path | None:
        """Detect the primary launcher, preferring the packaged EXE or the provided Librarian_Launcher.exe.

        Order of preference:
        1) target_dir / 'Librarian_Launcher.exe'
        2) target_dir / 'Game Librarian Launcher.exe'
        3) target_dir / 'Game Librarian.exe' (packaged electron)
        4) target_dir / 'dist' / 'win-unpacked' / 'Game Librarian.exe'
        5) target_dir / 'Librarian.pyw' (fallback to python script)
        """
        candidates: list[Path] = [
            target_dir / 'Librarian_Launcher.exe',
            target_dir / 'Game Librarian Launcher.exe',
            target_dir / 'Game Librarian.exe',
            target_dir / 'dist' / 'win-unpacked' / 'Game Librarian.exe',
            target_dir / 'Librarian.pyw',
        ]
        for c in candidates:
            if c.exists():
                return c
        return None

    def _create_shortcut(self, target: Path, lnk_path: Path, icon: Path | None = None):
        try:
            target = target.resolve()
            lnk_path.parent.mkdir(parents=True, exist_ok=True)
            # Proper PowerShell script with .Arguments support and explicit WindowStyle
            ps = (
                "$W=New-Object -ComObject WScript.Shell;"
                f"$S=$W.CreateShortcut('{str(lnk_path)}');"
                f"$S.TargetPath='{str(target)}';"
                f"$S.WorkingDirectory='{str(target.parent)}';"
                + (f"$S.IconLocation='{str(icon)}';" if icon and icon.exists() else '') +
                "$S.WindowStyle=1;"
                "$S.Save();"
            )
            subprocess.run(['powershell', '-NoProfile', '-Command', ps], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self._emit(f'[INFO] Created shortcut: {lnk_path}')
        except Exception as e:
            self._emit(f'[WARN] Shortcut creation failed: {e}')

    def _register_uninstall_entry(self, target_dir: Path, target_exe: Path | None, icon: Path | None):
        if sys.platform != 'win32' or not winreg:
            return
        app_key = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\GameLibrarian"
        try:
            access = winreg.KEY_WRITE | getattr(winreg, 'KEY_WOW64_64KEY', 0)
            with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, app_key, 0, access) as k:
                # Basic properties
                winreg.SetValueEx(k, 'DisplayName', 0, winreg.REG_SZ, 'Game Librarian')
                winreg.SetValueEx(k, 'Publisher', 0, winreg.REG_SZ, 'Game Librarian')
                version = self._read_version(target_dir) or '1.0.0'
                winreg.SetValueEx(k, 'DisplayVersion', 0, winreg.REG_SZ, version)
                winreg.SetValueEx(k, 'InstallLocation', 0, winreg.REG_SZ, str(target_dir))
                if icon and Path(icon).exists():
                    winreg.SetValueEx(k, 'DisplayIcon', 0, winreg.REG_SZ, str(icon))
                # Uninstall command: use pyw to launch our uninstaller GUI
                uninstaller = target_dir / 'scripts' / 'uninstaller_gui.pyw'
                pyw = shutil.which('pyw') or 'pyw'
                uninstall_cmd = f"{pyw} \"{uninstaller}\""
                winreg.SetValueEx(k, 'UninstallString', 0, winreg.REG_SZ, uninstall_cmd)
                winreg.SetValueEx(k, 'QuietUninstallString', 0, winreg.REG_SZ, uninstall_cmd)
                # ARP options
                winreg.SetValueEx(k, 'NoModify', 0, winreg.REG_DWORD, 1)
                winreg.SetValueEx(k, 'NoRepair', 0, winreg.REG_DWORD, 1)
            self._emit('[INFO] Registered app in Windows Apps & features.')
        except Exception as e:
            self._emit(f'[WARN] Failed to write uninstall registry entry: {e}')

    def _read_version(self, target_dir: Path) -> str | None:
        try:
            vfile = target_dir / 'Version.Json'
            if vfile.exists():
                data = json.loads(vfile.read_text(encoding='utf-8', errors='ignore'))
                return str(data.get('version') or data.get('Version') or '') or None
        except Exception:
            return None
        return None

    # -------------- UI loop helpers --------------
    def drain_output_queue(self):
        try:
            while True:
                line = self.output_queue.get_nowait()
                if line == '__COMPLETE__':
                    self.on_complete()
                    continue
                self.append_line(line)
        except queue.Empty:
            pass
        finally:
            self.root.after(120, self.drain_output_queue)

    def on_complete(self):
        self.status_var.set('Completed.' if self.success else 'Completed with errors.')
        self.finish_btn.configure(state='normal')
        self.cancel_btn.configure(state='disabled')
        try:
            self.progress.stop()
            if not ctk:
                self.progress.configure(mode='determinate', maximum=100, value=100)
        except Exception:
            pass

    def on_cancel(self):
        self.cancel_requested = True
        if self.proc and self.proc.poll() is None:
            try:
                self.proc.terminate()
            except Exception:
                pass
        self.status_var.set('Cancelling …')
        self.append_line('[INFO] Cancel requested by user.')
        try:
            self.progress.stop()
        except Exception:
            pass

    def on_finish(self):
        # Autorun on Finish if enabled and target exe was detected
        try:
            if self.success and self.options.get('autorun') and getattr(self, 'target_exe', None):
                target_exe: Path = self.target_exe  # type: ignore
                if target_exe.exists():
                    if target_exe.suffix.lower() in ('.py', '.pyw'):
                        subprocess.Popen(['py', str(target_exe)], cwd=str(target_exe.parent), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    else:
                        subprocess.Popen([str(target_exe)], cwd=str(target_exe.parent), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass
        self.root.destroy()


def _apply_styles(root: tk.Tk):
    try:
        style = ttk.Style(root)
        available = set(style.theme_names())
        theme = 'clam' if 'clam' in available else ('vista' if 'vista' in available else style.theme_use())
        style.theme_use(theme)

        is_dark = os.environ.get('GL_DARK', '1') == '1'
        if is_dark:
            bg = '#0b1116'
            surface = '#0f1720'
            text = '#e5e7eb'
            subtext = '#9aa4b2'
            border = '#1f2937'
            accent = '#2563eb'
        else:
            bg = '#f7f8fa'
            surface = '#ffffff'
            text = '#0b1116'
            subtext = '#5b6470'
            border = '#e5e7eb'
            accent = '#2563eb'

        try:
            root.configure(background=bg)
        except Exception:
            pass

        style.configure('GL.Body.TFrame', background=surface, borderwidth=0)
        style.configure('GL.Header.TFrame', background=surface)
        style.configure('GL.Title.TLabel', background=surface, foreground=text, font=('Segoe UI', 14, 'bold'))
        style.configure('GL.Subtitle.TLabel', background=surface, foreground=subtext, font=('Segoe UI', 10))
        style.configure('GL.Body.TLabel', background=surface, foreground=text, font=('Segoe UI', 10))

        style.configure('GL.TEntry', fieldbackground=surface, foreground=text, bordercolor=border, lightcolor=border, darkcolor=border, padding=6)

        style.configure('GL.Primary.TButton', foreground='#ffffff', background=accent, bordercolor=accent, focusthickness=0, padding=(12, 7))
        style.map('GL.Primary.TButton', background=[('active', '#1e4fd6')])
        style.configure('GL.Outlined.TButton', foreground=text, background=surface, bordercolor=border, focusthickness=0, padding=(12, 7))
        style.map('GL.Outlined.TButton', background=[('active', '#eef2f7' if not is_dark else '#111821')])

        style.configure('GL.Horizontal.TProgressbar', troughcolor=surface, background=accent, bordercolor=border, lightcolor=accent, darkcolor=accent)
    except Exception:
        pass


def main():
    if sys.platform == 'win32' and os.environ.get('GL_SHOW_CONSOLE') != '1':
        try:
            import ctypes
            hwnd = ctypes.windll.kernel32.GetConsoleWindow()
            if hwnd:
                ctypes.windll.user32.ShowWindow(hwnd, 0)
        except Exception:
            pass

    if ctk:
        root = ctk.CTk()
    else:
        root = tk.Tk()
        _apply_styles(root)

    def start_install(target_dir: Path, options: dict | None = None):
        InstallerGUI(root, target_dir, options)

    def cancel_install():
        root.destroy()

    InfoScreen(root, start_install, cancel_install)
    root.mainloop()


if __name__ == '__main__':
    main()