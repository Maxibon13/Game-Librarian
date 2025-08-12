#!/usr/bin/env python3
import os
import sys
import subprocess
import threading
import queue
import shutil
from pathlib import Path

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


class UninstallInfoScreen:
    def __init__(self, root: tk.Tk, on_continue, on_cancel):
        self.root = root
        self.on_continue = on_continue
        self.on_cancel = on_cancel

        BaseFrame = ctk.CTkFrame if ctk else ttk.Frame
        Label = ctk.CTkLabel if ctk else ttk.Label
        Button = ctk.CTkButton if ctk else ttk.Button
        Entry = ctk.CTkEntry if ctk else ttk.Entry

        # Window basics
        self.root.title('Game Librarian Uninstaller')
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

        # Icon
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

        # Logo 64x64 next to title
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
                    self._header_img = ctk.CTkImage(light_image=img, dark_image=img, size=(64, 64))
                    break
                elif Image is not None and ImageTk is not None:
                    img = Image.open(p).resize((64, 64))
                    self._header_img = ImageTk.PhotoImage(img)
                    break
                else:
                    _img = tk.PhotoImage(file=str(p))
                    self._header_img = _img
                    break
        except Exception:
            self._header_img = None
        if self._header_img is not None:
            if ctk:
                Label(header, image=self._header_img, text='', bg_color='transparent').pack(side='left', padx=(0, 10))
            else:
                ttk.Label(header, image=self._header_img, text='').pack(side='left', padx=(0, 10))
        title_col = BaseFrame(header)
        if ctk:
            try:
                title_col.configure(fg_color='transparent')
            except Exception:
                pass
        title_col.pack(side='left')
        if ctk:
            Label(title_col, text='Game Librarian', font=('Segoe UI', 16, 'bold'), bg_color='transparent').pack(anchor='w')
            Label(title_col, text='Remove the app and optional data', bg_color='transparent').pack(anchor='w')
        else:
            Label(title_col, text='Game Librarian', font=('Segoe UI', 16, 'bold')).pack(anchor='w')
            Label(title_col, text='Remove the app and optional data').pack(anchor='w')

        Label(
            self.frame,
            text=(
                'This uninstaller will remove Game Librarian from the selected directory.\n'
                'You can choose whether to remove shortcuts and user content.'
            ),
            wraplength=560, justify='left'
        ).pack(pady=(0, 16), anchor='w')

        opts = BaseFrame(self.frame)
        opts.pack(fill='x', pady=(0, 12))
        self.opt_rm_desktop = tk.BooleanVar(value=True)
        self.opt_rm_startup = tk.BooleanVar(value=True)
        self.opt_rm_search = tk.BooleanVar(value=True)
        self.opt_kill = tk.BooleanVar(value=True)
        self.opt_rm_app = tk.BooleanVar(value=True)
        self.opt_rm_user = tk.BooleanVar(value=False)
        if ctk:
            self._add_ctk_switch(opts, 'Remove Desktop shortcut', self.opt_rm_desktop)
            self._add_ctk_switch(opts, 'Remove Startup entry', self.opt_rm_startup)
            self._add_ctk_switch(opts, 'Remove Start Menu entry', self.opt_rm_search)
            self._add_ctk_switch(opts, 'Terminate running processes', self.opt_kill)
            self._add_ctk_switch(opts, 'Remove application files', self.opt_rm_app)
            self._add_ctk_switch(opts, 'Also remove user content (TESTING, MOD)', self.opt_rm_user)
        else:
            ttk.Checkbutton(opts, text='Remove Desktop shortcut', variable=self.opt_rm_desktop).pack(anchor='w', pady=2)
            ttk.Checkbutton(opts, text='Remove Startup entry', variable=self.opt_rm_startup).pack(anchor='w', pady=2)
            ttk.Checkbutton(opts, text='Remove Start Menu entry', variable=self.opt_rm_search).pack(anchor='w', pady=2)
            ttk.Checkbutton(opts, text='Terminate running processes', variable=self.opt_kill).pack(anchor='w', pady=2)
            ttk.Checkbutton(opts, text='Remove application files', variable=self.opt_rm_app).pack(anchor='w', pady=2)
            ttk.Checkbutton(opts, text='Also remove user content (TESTING, MOD)', variable=self.opt_rm_user).pack(anchor='w', pady=2)

        loc_frame = BaseFrame(self.frame)
        loc_frame.pack(fill='x', pady=(8, 16))
        Label(loc_frame, text='Install Location:', width=16).pack(side='left', anchor='w')
        self.location_var = tk.StringVar()

        # Default to typical install folder or script parent
        default_dir = (Path(__file__).resolve().parent / '..').resolve()
        if sys.platform == 'win32':
            default_dir = Path(os.environ.get('LOCALAPPDATA', str(default_dir))) / 'Game Librarian'
        self.location_var.set(str(default_dir))

        if ctk:
            entry = Entry(loc_frame, textvariable=self.location_var, width=380)
            entry.pack(side='left', fill='x', expand=True, padx=(0, 6))
            Button(
                loc_frame, text='Browse…', command=self._browse_location, width=110,
                fg_color='transparent', hover_color='#2a3344', border_width=1,
                border_color='#3a3f46', text_color='#e5e7eb'
            ).pack(side='left')
        else:
            entry = Entry(loc_frame, textvariable=self.location_var, width=54)
            entry.pack(side='left', fill='x', expand=True, padx=(0, 5))
            ttk.Button(loc_frame, text='Browse…', command=self._browse_location).pack(side='left')

        btn_frame = BaseFrame(self.frame)
        btn_frame.pack(fill='x', pady=(12, 0))
        if ctk:
            Button(
                btn_frame, text='Uninstall', command=self._continue,
                fg_color='transparent', hover_color='#2a3344', border_width=1,
                border_color='#3a3f46', text_color='#e5e7eb', width=120
            ).pack(side='right', padx=(0, 6))
            Button(
                btn_frame, text='Cancel', command=self.on_cancel,
                fg_color='transparent', hover_color='#2a3344', border_width=1,
                border_color='#3a3f46', text_color='#e5e7eb', width=110
            ).pack(side='right', padx=(0, 8))
        else:
            ttk.Button(btn_frame, text='Uninstall', command=self._continue).pack(side='right', padx=(0, 6))
            ttk.Button(btn_frame, text='Cancel', command=self.on_cancel).pack(side='right', padx=(0, 8))

    def _browse_location(self):
        folder = filedialog.askdirectory(initialdir=self.location_var.get(), title='Select Install Location')
        if folder:
            self.location_var.set(folder)

    def _continue(self):
        self.frame.destroy()
        target = Path(self.location_var.get())
        opts = {
            'rm_desktop': bool(self.opt_rm_desktop.get()),
            'rm_startup': bool(self.opt_rm_startup.get()),
            'rm_search': bool(self.opt_rm_search.get()),
            'kill': bool(self.opt_kill.get()),
            'rm_app': bool(self.opt_rm_app.get()),
            'rm_user': bool(self.opt_rm_user.get()),
        }
        self.on_continue(target, opts)

    # ---- CTk switch helper ----
    def _add_ctk_switch(self, parent, text: str, var: tk.BooleanVar):
        sw = ctk.CTkSwitch(
            parent, text=text, variable=var, width=62, height=28,
            fg_color='#3a3f46', progress_color='#22c55e',
            button_color='#e2e8f0', button_hover_color='#f8fafc'
        )
        sw.pack(anchor='w', pady=4)
        return sw


class UninstallerGUI:
    def __init__(self, root: tk.Tk, target_dir: Path, options: dict):
        self.root = root
        self.target_dir = target_dir
        self.options = options

        self.output_queue: 'queue.Queue[str]' = queue.Queue()
        self.proc: subprocess.Popen | None = None
        self.success: bool = False
        self.cancel_requested: bool = False

        # Header
        if not ctk:
            _apply_styles(self.root)
        BaseFrame = ctk.CTkFrame if ctk else ttk.Frame
        HeaderLabel = ctk.CTkLabel if ctk else ttk.Label
        header = BaseFrame(self.root, **({'fg_color': 'transparent'} if ctk else {'style': 'GL.Header.TFrame'}))
        header.pack(fill='x', padx=12, pady=(12, 8))
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
                    self._header_img = ctk.CTkImage(light_image=img, dark_image=img, size=(64, 64))
                    break
                elif Image is not None and ImageTk is not None:
                    img = Image.open(p).resize((64, 64))
                    self._header_img = ImageTk.PhotoImage(img)
                    break
                else:
                    _img = tk.PhotoImage(file=str(p))
                    self._header_img = _img
                    break
        except Exception:
            self._header_img = None
        if self._header_img is not None:
            if ctk:
                HeaderLabel(header, image=self._header_img, text='', bg_color='transparent').pack(side='left', padx=(0, 10))
            else:
                ttk.Label(header, image=self._header_img, text='').pack(side='left', padx=(0, 10))
        title_col = BaseFrame(header, **({'fg_color': 'transparent'} if ctk else {'style': 'GL.Header.TFrame'}))
        title_col.pack(side='left')
        if ctk:
            HeaderLabel(title_col, text='Game Librarian - Uninstaller', font=('Segoe UI', 14, 'bold'), bg_color='transparent').pack(anchor='w')
            HeaderLabel(title_col, text='Removing files and shortcuts…', bg_color='transparent').pack(anchor='w')
        else:
            ttk.Label(title_col, text='Game Librarian - Uninstaller', style='GL.Title.TLabel').pack(anchor='w')
            ttk.Label(title_col, text='Removing files and shortcuts…', style='GL.Subtitle.TLabel').pack(anchor='w')

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
        self.status_var = tk.StringVar(value='Running uninstaller…')
        self.status = ttk.Label(bottom, textvariable=self.status_var, style='GL.Body.TLabel' if not ctk else None)
        if ctk:
            self.progress = ctk.CTkProgressBar(bottom, width=180, mode='indeterminate')
        else:
            self.progress = ttk.Progressbar(bottom, mode='indeterminate', length=180, style='GL.Horizontal.TProgressbar')

        self.cancel_btn = ttk.Button(bottom, text='Cancel', command=self.on_cancel, style='GL.Outlined.TButton' if not ctk else None)
        self.finish_btn = ttk.Button(bottom, text='Finish', command=self.on_finish, state='disabled', style='GL.Primary.TButton' if not ctk else None)

        # Start
        self.append_line('[INFO] Starting uninstaller…')
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

        self.start_uninstaller_thread()
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

    def start_uninstaller_thread(self):
        t = threading.Thread(target=self.run_uninstaller, daemon=True)
        t.start()

    def _emit(self, line: str):
        try:
            print(line, flush=True)
        except Exception:
            pass
        self.output_queue.put(line)

    # ---------------- Core uninstaller ----------------
    def run_uninstaller(self):
        target_dir = self.target_dir
        try:
            if not target_dir.exists():
                self._fail(f'Target directory does not exist: "{target_dir}"')
                return
        except Exception as e:
            self._fail(f'Cannot access target directory: {e}')
            return

        self._emit(f'[INFO] Target directory: "{target_dir}"')

        try:
            # 1) Kill running processes if requested
            if self.options.get('kill') and sys.platform == 'win32':
                self.status_var.set('Terminating running processes …')
                for name in [
                    'Librarian_Launcher.exe',
                    'Game Librarian Launcher.exe',
                    'Game Librarian.exe',
                    'electron.exe',
                    'node.exe',
                ]:
                    self._taskkill_image(name)

            # 2) Remove shortcuts
            self.status_var.set('Removing shortcuts …')
            exe_guess = self._resolve_app_exe(target_dir)
            if self.options.get('rm_desktop'):
                self._delete_shortcut(self._desktop_dir() / 'Game Librarian.lnk')
            if self.options.get('rm_search'):
                self._delete_shortcut(self._start_menu_dir() / 'Game Librarian.lnk')
            if self.options.get('rm_startup'):
                self._delete_shortcut(self._startup_dir() / 'Game Librarian.lnk')

            # 3) Remove files
            if self.options.get('rm_app'):
                self.status_var.set('Removing application files …')
                preserve = set()
                if not self.options.get('rm_user'):
                    preserve |= {'TESTING', 'MOD'}
                self._remove_tree_preserve(target_dir, preserve_dirs=preserve)

            # 4) Remove ARP uninstall entry
            try:
                self._remove_uninstall_entry()
            except Exception:
                pass

            self.success = True
            self._emit('[INFO] Uninstall completed successfully.')
            self._emit('__COMPLETE__')
        except Exception as e:
            self._fail(f'Unexpected error: {e}')

    # ---------------- Helpers ----------------
    def _fail(self, message: str):
        self.success = False
        self._emit(f'[ERROR] {message}')
        self._emit('__COMPLETE__')

    def _taskkill_image(self, image_name: str):
        try:
            subprocess.run(
                ['taskkill', '/F', '/IM', image_name],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0), check=False
            )
            self._emit(f'[INFO] Attempted to terminate {image_name}')
        except Exception:
            pass

    def _remove_tree_preserve(self, root: Path, preserve_dirs: set[str]):
        try:
            for entry in list(root.iterdir()):
                if entry.name in preserve_dirs:
                    self._emit(f'[INFO] Preserved: {entry}')
                    continue
                try:
                    if entry.is_dir():
                        shutil.rmtree(entry, ignore_errors=True)
                    else:
                        entry.unlink(missing_ok=True)
                    self._emit(f'[INFO] Removed: {entry}')
                except Exception as e:
                    self._emit(f'[WARN] Failed to remove {entry}: {e}')
            # If directory now empty, remove it
            try:
                if not any(root.iterdir()):
                    root.rmdir()
                    self._emit(f'[INFO] Removed empty directory: {root}')
            except Exception:
                pass
        except Exception as e:
            self._emit(f'[WARN] Removal error under {root}: {e}')

    def _delete_shortcut(self, lnk_path: Path):
        try:
            if lnk_path.exists():
                lnk_path.unlink(missing_ok=True)
                self._emit(f'[INFO] Deleted shortcut: {lnk_path}')
        except Exception as e:
            self._emit(f'[WARN] Failed to delete shortcut {lnk_path}: {e}')

    def _desktop_dir(self) -> Path:
        return Path(os.environ.get('USERPROFILE', '')) / 'Desktop'

    def _start_menu_dir(self) -> Path:
        return Path(os.environ.get('APPDATA', '')) / 'Microsoft' / 'Windows' / 'Start Menu' / 'Programs'

    def _startup_dir(self) -> Path:
        return self._start_menu_dir() / 'Startup'

    def _resolve_app_exe(self, target_dir: Path) -> Path | None:
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

    def _remove_uninstall_entry(self):
        try:
            import winreg  # type: ignore
        except Exception:
            return
        if sys.platform != 'win32':
            return
        app_key = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\GameLibrarian"
        try:
            access = winreg.KEY_WRITE | getattr(winreg, 'KEY_WOW64_64KEY', 0)
            winreg.DeleteKeyEx(winreg.HKEY_CURRENT_USER, app_key, access, 0)
            self._emit('[INFO] Removed Apps & features entry.')
        except FileNotFoundError:
            pass
        except Exception as e:
            self._emit(f'[WARN] Failed to remove Apps entry: {e}')

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
        try:
            self.progress.stop()
        except Exception:
            pass
        self.root.destroy()

    def on_finish(self):
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

    def start_uninstall(target_dir: Path, options: dict | None = None):
        UninstallerGUI(root, target_dir, options or {})

    def cancel_uninstall():
        root.destroy()

    UninstallInfoScreen(root, start_uninstall, cancel_uninstall)
    root.mainloop()


if __name__ == '__main__':
    main()


