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
import math
from pathlib import Path

import tkinter as tk
from tkinter import ttk

# Prefer CustomTkinter for modern UI
try:
    import customtkinter as ctk  # type: ignore
except Exception:
    ctk = None

# Optional PIL for high-quality icon scaling and CTkImage
try:
    from PIL import Image, ImageTk  # type: ignore
except Exception:  # pragma: no cover
    Image = None  # type: ignore
    ImageTk = None  # type: ignore

class InstallerGUI:
    def __init__(self, root: tk.Tk):
        # Prefer CTk root if available
        self.root = root
        self.root.title('Game Librarian Installer')
        self.root.geometry('820x560')
        self.root.minsize(680, 420)
        # If customtkinter available, use its dark theme
        if ctk:
            try:
                ctk.set_appearance_mode('dark')
                ctk.set_default_color_theme('dark-blue')
            except Exception:
                pass
        else:
            # Slightly nicer ttk fallback styling
            try:
                style = ttk.Style()
                # Use a theme that honors style colors
                if 'clam' in style.theme_names():
                    style.theme_use('clam')
                style.configure('GL.TButton', padding=6)
                style.configure('GLPrimary.TButton', padding=6, foreground='white', background='#1f6aa5')
                style.map('GLPrimary.TButton', background=[('active', '#195a85')])
            except Exception:
                pass
        # Try to set window icon
        try:
            icon_candidates = [
                Path(__file__).resolve().parent.parent / 'src' / 'Icon128x128.ico',
                Path(__file__).resolve().parent.parent / 'src' / 'Icon.ico',
                Path(__file__).resolve().parent / 'Icon128x128.ico',
                Path(__file__).resolve().parent / 'Icon.ico',
            ]
            for ico in icon_candidates:
                if ico.exists():
                    try:
                        self.root.iconbitmap(default=str(ico))
                        break
                    except Exception:
                        pass
        except Exception:
            pass

        self.output_queue: 'queue.Queue[str]' = queue.Queue()
        self.proc: subprocess.Popen | None = None
        self.success: bool = False
        self.cancel_requested: bool = False
        self.install_started: bool = False

        HeaderFrame = ctk.CTkFrame if ctk else ttk.Frame
        HeaderLabel = ctk.CTkLabel if ctk else ttk.Label
        Button = ctk.CTkButton if ctk else ttk.Button
        Progressbar = ttk.Progressbar  # ctk has its own, but ttk works fine
        Frame = ctk.CTkFrame if ctk else ttk.Frame
        Checkbutton = ttk.Checkbutton

        # Transparent header background when using CTk
        header_kwargs = {}
        if ctk:
            header_kwargs['fg_color'] = 'transparent'
        header = HeaderFrame(self.root, **header_kwargs)
        header.pack(fill='x', padx=12, pady=(12, 6))
        # Icon image in header (PNG fallback)
        self._header_img = None
        try:
            png_candidates = [
                Path(__file__).resolve().parent.parent / 'src' / 'Icon.png',
                Path(__file__).resolve().parent / 'Icon.png',
            ]
            for p in png_candidates:
                if not p.exists():
                    continue
                if ctk and Image is not None:
                    img = Image.open(p)
                    self._header_img = ctk.CTkImage(light_image=img, dark_image=img, size=(56, 56))
                    break
                elif Image is not None and ImageTk is not None:
                    img = Image.open(p).resize((56, 56))
                    self._header_img = ImageTk.PhotoImage(img)
                    break
                else:
                    _img = tk.PhotoImage(file=str(p))
                    target = 48
                    w, h = _img.width(), _img.height()
                    factor = max(1, int(math.ceil(max(w, h) / target)))
                    if factor > 1:
                        _img = _img.subsample(factor, factor)
                    self._header_img = _img
                    break
        except Exception:
            self._header_img = None
        if self._header_img is not None:
            # Ensure transparent background for CTk label if available
            lbl_kwargs = {'text': ''}
            if ctk:
                lbl_kwargs['bg_color'] = 'transparent'
            HeaderLabel(header, image=self._header_img, **lbl_kwargs).pack(side='left', padx=(0, 10))
        title_col = Frame(header, **({'fg_color': 'transparent'} if ctk else {}))
        title_col.pack(side='left')
        title_kwargs = {'text': 'Game Librarian Installer', 'font': ('Segoe UI', 14, 'bold')}
        sub_kwargs = {'text': 'Install or update the app with one click'}
        if ctk:
            title_kwargs['bg_color'] = 'transparent'
            sub_kwargs['bg_color'] = 'transparent'
        HeaderLabel(title_col, **title_kwargs).pack(anchor='w')
        HeaderLabel(title_col, **sub_kwargs).pack(anchor='w')

        # Options panel (pre-install)
        if ctk:
            self.options = HeaderFrame(self.root)
            HeaderLabel(self.options, text='Setup Options', font=('Segoe UI', 12, 'bold')).pack(anchor='w', padx=6, pady=(4, 2))
            self.options.pack(fill='x', padx=14, pady=(0, 10))
        else:
            self.options = ttk.LabelFrame(self.root, text='Setup Options')
            self.options.pack(fill='x', padx=14, pady=(0, 10))
        self.opt_desktop = tk.BooleanVar(value=True)
        self.opt_startup = tk.BooleanVar(value=False)
        self.opt_search = tk.BooleanVar(value=True)
        self.opt_autorun = tk.BooleanVar(value=True)
        row = Frame(self.options)
        row.pack(fill='x', padx=12, pady=8)
        self._add_option(row, 'Add shortcut to Desktop', self.opt_desktop)
        self._add_option(row, 'Add to Startup (launch on sign-in)', self.opt_startup)
        self._add_option(row, 'Add to Windows Search (Start Menu entry)', self.opt_search)
        self._add_option(row, 'Auto-run when installation completes', self.opt_autorun)

        start_row = Frame(self.options)
        start_row.pack(fill='x', padx=12, pady=(2, 10))
        self._make_button(start_row, 'Start Installation', self.on_start_install, primary=True).pack(side='left')

        # Log area (hidden until install starts)
        if ctk:
            self.text = ctk.CTkTextbox(self.root, height=220, width=760)
        else:
            from tkinter.scrolledtext import ScrolledText
            self.text = ScrolledText(self.root, wrap='word', height=18)
        self.text.configure(state='disabled')
        # self.text.pack(fill='both', expand=True, padx=12)

        bottom = Frame(self.root)
        # don't pack yet; will be shown after Start Installation

        self.status_var = tk.StringVar(value='Running installer…')
        self.status = HeaderLabel(bottom, textvariable=self.status_var)
        # packed later

        if ctk:
            self.progress = ctk.CTkProgressBar(bottom, width=180, mode='indeterminate')
        else:
            self.progress = Progressbar(bottom, mode='indeterminate', length=180)

        self.cancel_btn = self._make_button(bottom, 'Cancel', self.on_cancel)
        self.finish_btn = self._make_button(bottom, 'Finish', self.on_finish)
        self.finish_btn.configure(state='disabled')

        self.root.after(80, self.drain_output_queue)
        self._bottom = bottom

    def append_line(self, line: str):
        try:
            if ctk and isinstance(self.text, (ctk.CTkTextbox,)):
                self.text.configure(state='normal')
                self.text.insert('end', line.rstrip() + '\n')
                self.text.see('end')
                self.text.configure(state='disabled')
            else:
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

    def on_start_install(self):
        # Hide options and show log+progress
        try:
            self.options.pack_forget()
        except Exception:
            pass
        try:
            self.text.pack(fill='both', expand=True, padx=12)
            # Show bottom bar now
            self._bottom.pack(fill='x', padx=14, pady=10)
            self.status.pack(side='left')
            self.progress.pack(side='left', padx=(8, 0))
            self.finish_btn.pack(side='right', padx=(0, 8))
            self.cancel_btn.pack(side='right')
        except Exception:
            pass
        self.append_line('[INFO] Starting installer…')
        self.progress.start(60)
        self.install_started = True
        self.start_installer_thread()

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

        # Preflight: ensure a usable Python is available for auxiliary scripts
        self.status_var.set('Checking Python runtime …')
        if not self._ensure_python_available((3, 10)):
            self._fail('Python 3.10+ is required and could not be installed automatically.')
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
            # Base excludes that should never be copied or deleted
            base_excludes = {'.git', 'node_modules'}
            # User/content folders to preserve on disk even if not present in repo
            keep_excludes = {'TESTING', 'MOD'}
            # Allow extra excludes via env var (comma/semicolon separated)
            extra = os.environ.get('INSTALLER_CLEAN_EXCLUDE', '')
            if extra:
                for tok in re.split(r'[;,]', extra):
                    tok = tok.strip()
                    if tok:
                        keep_excludes.add(tok)
            all_excludes = base_excludes | keep_excludes
            self._emit(f"[INFO] Excluding folders: {sorted(all_excludes)}")
            self._copy_tree(src=repo_root, dst=target_dir, exclude_dirs=all_excludes)
            # After copying new files, remove any stale files not in repo, but keep excluded folders intact
            self._emit('[INFO] Cleaning old files not present in the repository ...')
            self._clean_extraneous(src=repo_root, dst=target_dir, exclude_dirs=all_excludes)
            self._emit('[DEBUG] File sync + cleanup completed.')

            # Apply optional shortcuts/entries
            self._emit('[INFO] Applying selected options …')
            try:
                target_exe = self._resolve_app_exe(target_dir)
                icon_ico = (Path(__file__).resolve().parent.parent / 'src' / 'Icon.ico')
                if self.opt_desktop.get():
                    self._create_shortcut(target_exe, self._desktop_dir() / 'Game Librarian.lnk', icon_ico)
                if self.opt_search.get():
                    self._create_shortcut(target_exe, self._start_menu_dir() / 'Game Librarian.lnk', icon_ico)
                if self.opt_startup.get():
                    self._create_shortcut(target_exe, self._startup_dir() / 'Game Librarian.lnk', icon_ico)
                # Optional auto-run
                if self.opt_autorun.get():
                    try:
                        if target_exe.suffix.lower() == '.pyw' or target_exe.suffix.lower() == '.py':
                            subprocess.Popen(['py', str(target_exe)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        else:
                            subprocess.Popen([str(target_exe)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        self._emit('[INFO] Launched application (auto-run).')
                    except Exception as e:
                        self._emit(f'[WARN] Failed to auto-run app: {e}')
            except Exception as e:
                self._emit(f'[WARN] Failed to apply options: {e}')

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

    def _ensure_python_available(self, min_version: tuple[int, int] = (3, 10)) -> bool:
        try:
            if sys.version_info >= (min_version[0], min_version[1]):
                self._emit(f"[INFO] Python runtime OK: {sys.version.split()[0]}")
                return True
        except Exception:
            pass

        # Try external python/py launchers
        def _check_cmd(cmd: list[str]) -> bool:
            try:
                return self._run_and_stream(cmd, cwd=None, env=os.environ.copy())
            except Exception:
                return False

        # Prefer py launcher where available
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

        # Attempt to install Python via winget
        winget = shutil.which('winget')
        if winget and sys.platform == 'win32':
            self._emit('[INFO] Python not found. Attempting installation via winget (Python.Python.3) …')
            cmd = [winget, 'install', '--id', 'Python.Python.3', '--source', 'winget', '--silent', '--exact', '--accept-package-agreements', '--accept-source-agreements']
            self._run_and_stream(cmd, cwd=None, env=os.environ.copy())
            # Re-check
            if shutil.which('py') and _check_cmd(['py', '--version']):
                return True
            if shutil.which('python') and _check_cmd(['python', '--version']):
                return True

        return False

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

    def _clean_extraneous(self, src: Path, dst: Path, exclude_dirs: set[str]):
        """Delete any files/dirs in dst that are not present in src, preserving exclude_dirs."""
        try:
            for entry in dst.iterdir():
                name = entry.name
                if name in exclude_dirs:
                    # Preserve explicitly excluded directories
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
                # Recurse into subdirectories
                if entry.is_dir() and src_candidate.is_dir():
                    self._clean_extraneous(src_candidate, entry, exclude_dirs)
        except Exception as e:
            self._emit(f'[WARN] Cleanup error under {dst}: {e}')

    def _cleanup_tmp(self, tmp_dir: Path):
        self._emit('[INFO] Removing temporary directory ...')
        shutil.rmtree(tmp_dir, ignore_errors=True)

    # Utilities for shortcuts/locations
    def _desktop_dir(self) -> Path:
        return Path(os.environ.get('USERPROFILE', '')) / 'Desktop'

    def _start_menu_dir(self) -> Path:
        return Path(os.environ.get('APPDATA', '')) / 'Microsoft' / 'Windows' / 'Start Menu' / 'Programs'

    def _startup_dir(self) -> Path:
        return self._start_menu_dir() / 'Startup'

    def _resolve_app_exe(self, target_dir: Path) -> Path:
        # Prefer packaged EXE if present
        cand = target_dir / 'dist' / 'win-unpacked' / 'Game Librarian.exe'
        if cand.exists():
            return cand
        # Fallback to launching the repo runner script
        pyw = target_dir / 'Librarian.pyw'
        if pyw.exists():
            return pyw
        # As a last resort, point to electron start (will rely on file associations/Node availability)
        return pyw

    def _create_shortcut(self, target: Path, lnk_path: Path, icon: Path | None = None):
        try:
            target = target.resolve()
            lnk_path.parent.mkdir(parents=True, exist_ok=True)
            icon_arg = f";$'{str(icon.resolve())}'" if icon and icon.exists() else ''
            # PowerShell WScript.Shell shortcut creation
            ps = (
                "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('" + str(lnk_path) + "');" +
                "$s.TargetPath='" + str(target) + "';" +
                (f"$s.IconLocation='{str(icon)}';" if icon and icon.exists() else '') +
                "$s.WorkingDirectory='" + str(target.parent) + "';" +
                "$s.Save();"
            )
            subprocess.run(['powershell', '-NoProfile', '-Command', ps], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self._emit(f'[INFO] Created shortcut: {lnk_path}')
        except Exception as e:
            self._emit(f'[WARN] Shortcut creation failed: {e}')

    def _make_button(self, parent, text: str, command, primary: bool = False):
        """Create a nicer-looking button for CTk or ttk fallback."""
        if ctk:
            return ctk.CTkButton(
                parent,
                text=text,
                command=command,
                width=140 if primary else 110,
                height=34,
                corner_radius=8,
                fg_color=('#1f6aa5' if primary else '#344055'),
                hover_color=('#195a85' if primary else '#2a3344'),
                text_color='white'
            )
        else:
            style = 'GLPrimary.TButton' if primary else 'GL.TButton'
            return ttk.Button(parent, text=text, command=command, style=style)

    # ---------- Toggle widgets ----------
    def _add_option(self, parent: ttk.Frame, text: str, var: tk.BooleanVar):
        if ctk:
            sw = ctk.CTkSwitch(
                parent,
                text=text,
                variable=var,
                width=62,
                height=28,
                border_width=2,
                fg_color='#3a3f46',          # track when off
                progress_color='#22c55e',    # track when on
                button_color='#e2e8f0',
                button_hover_color='#f8fafc'
            )
            # simple color tween on toggle for a subtle animation
            def _on_toggle():
                self._animate_switch(sw, bool(var.get()))
            sw.configure(command=_on_toggle)
            sw.pack(anchor='w', pady=6, padx=2)
        else:
            wrap = ttk.Frame(parent)
            wrap.pack(fill='x', pady=2)
            ttk.Checkbutton(wrap, text=text, variable=var).pack(anchor='w', pady=2)

    # ---------- CTk switch animation helpers ----------
    def _hex_to_rgb(self, hx: str):
        hx = hx.lstrip('#')
        return tuple(int(hx[i:i+2], 16) for i in (0, 2, 4))

    def _rgb_to_hex(self, rgb):
        return '#%02x%02x%02x' % rgb

    def _lerp(self, a, b, t: float):
        return int(a + (b - a) * t)

    def _animate_switch(self, sw, on: bool):
        if not ctk:
            return
        try:
            off_col = self._hex_to_rgb('3a3f46')
            on_col = self._hex_to_rgb('22c55e')
            steps = 8
            interval = 14
            # During animation, adjust progress_color (on) or fg_color (off)
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
            # Restore final colors
            if on:
                sw.configure(progress_color='#22c55e', fg_color='#3a3f46')
            else:
                sw.configure(progress_color='#22c55e', fg_color='#3a3f46')
        except Exception:
            pass

    # removed custom toggle class; using standard/CTk checkboxes instead

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
        # If installation hasn't started yet, close immediately
        if not getattr(self, 'install_started', False):
            try:
                self.root.destroy()
            except Exception:
                pass
            return
        # Otherwise signal cancellation and stop current process
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
    # Prefer CTk root entirely, without creating a Tk root first
    if ctk:
        try:
            app = ctk.CTk()
            InstallerGUI(app)
            app.mainloop()
            return
        except Exception:
            # Fallback to Tk if CTk fails for any reason
            pass
    root = tk.Tk()
    InstallerGUI(root)
    root.mainloop()

if __name__ == '__main__':
    main()