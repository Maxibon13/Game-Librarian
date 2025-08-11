#!/usr/bin/env python3
import os
import sys
import subprocess
import threading
import queue
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
        script_dir = Path(__file__).resolve().parent
        win_installer = script_dir / 'WinInstaller.bat'
        if not win_installer.exists():
            self.output_queue.put('[ERROR] WinInstaller.bat not found at: ' + str(win_installer))
            self.success = False
            self.output_queue.put('__COMPLETE__')
            return

        # Launch batch and stream output
        env = os.environ.copy()
        try:
            # Use cmd.exe to execute the batch file
            self.proc = subprocess.Popen(
                ['cmd.exe', '/c', str(win_installer)],
                cwd=str(script_dir),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                universal_newlines=True,
                bufsize=1,
            )
        except Exception as e:
            self.output_queue.put('[ERROR] Failed to start installer: ' + str(e))
            self.success = False
            self.output_queue.put('__COMPLETE__')
            return

        assert self.proc.stdout is not None
        for line in self.proc.stdout:
            self.output_queue.put(line.rstrip())
        code = self.proc.wait()
        if code == 0:
            self.success = True
            self.output_queue.put('[INFO] Installer finished successfully.')
        else:
            self.success = False
            self.output_queue.put(f'[ERROR] Installer exited with code {code}.')
        self.output_queue.put('__COMPLETE__')

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


