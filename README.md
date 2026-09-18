# <img src="assets/icons/Icon.png" alt="" width="40" valign="middle"> Game Librarian (1.0) - Pre

Windows library for games installed through Steam, Epic, GOG, Ubisoft Connect, Xbox (Microsoft Store), and Roblox. One process scans those sources, launches titles through the same paths the launchers use, and records session length locally. No account, no cloud sync.

Current stamp: `(1.0) 180926 - Pre` in `Version.Json`.

## Runtime layout

Electron 31 hosts the app. The main process (`electron/`, `src/main/`) owns windowing, IPC, detection, playtime, and Windows shell hooks. The renderer (`src/renderer/`) is React, built by Vite. Python is not a user install: `npm run release` drops an embeddable CPython into `runtime/python`, which ships as `resources/python`. Helpers under `tools/*.py` are stdlib-only; `src/main/services/pythonRuntime.js` prefers that binary and falls back to `python` / `py` on PATH in a checkout.

Detection is per-launcher in `src/main/services/detection/`. Results are keyed `launcher:id` so the same title from two stores is not merged. Cover art comes from local launcher caches first; Steam CDN / store images fill gaps for Epic and Ubisoft when a title match exists. Executable icons are the last resort (Roblox, delisted Xbox packages).

Playtime lives in `playtime.json` under the Electron user-data directory. A session starts when a PID matching the launched title appears and ends when that process tree is gone. Windows toast, jump list, tray, and the `gamelibrarian://play/<launcher>/<id>` protocol are wired in `electron/windows.js`. Mica is used on Windows 11 22H2+ (build 22621).

On launch the app reads local `Version.Json` (install root and `resources/`, then the asar copy) and compares it to `Version.Json` on GitHub `main`. If remote is newer, **Install and restart** copies `resources/installer/Installer.exe` to `%TEMP%\GameLibrarian_update`, quits, and that process downloads `GameLibrarian-win.zip` from the latest GitHub release, writes files over the existing install, then overwrites `Version.Json` in both the install root and `resources/`.

## Install

Download `GameLibrarian-Setup.exe` from [Releases](https://github.com/Maxibon13/Game-Librarian/releases). It is a PyInstaller GUI with `GameLibrarian-win.zip` embedded: Electron build, Python runtime, installer and uninstaller. No Node, Git, or system Python on the target machine. Default path is `%LOCALAPPDATA%\Programs\Game Librarian` (current user, no elevation).

Uninstall from Apps & features, or run `resources\installer\Uninstaller.exe`. Unattended:

```text
GameLibrarian-Setup.exe --silent [--dir <path>] [--no-shortcuts]
Uninstaller.exe --silent [--remove-userdata]
```

Installer log: `%TEMP%\GameLibrarian_install.log`.

Existing installs that still ship an old in-place updater should run the new Setup once. Later in-app updates run the updater from temp so `Installer.exe` is not overwritten while it is running.

## Development

Node 18+ and npm. Python 3.10+ with tkinter is only needed to rebuild the installer binaries.

```bash
git clone https://github.com/Maxibon13/Game-Librarian.git
cd Game-Librarian
npm install
npm run dev
```

`npm run dev` runs Vite on port 5173 and opens Electron against that origin. `npm start` loads a previously built `dist/` without the Vite watcher.

```text
npm test        detector / artwork fixture tests (node --test)
npm run test:ui hidden Electron window: empty scan, search, image fallbacks
                writes artifacts to dev/ui-smoke/ (gitignored)
```

## Release build

```powershell
npm run release
```

That is `installer/build_release.ps1`. It pip-installs PyInstaller and Pillow, builds icons, runs `vite build`, fetches embeddable Python 3.12.10 into `runtime/python`, compiles lean `installer/Installer.exe` and `Uninstaller.exe`, then `electron-builder --win --dir` into `release/win-unpacked`. That folder is zipped to `release/GameLibrarian-win.zip`. Setup.exe is a second PyInstaller pass with the zip as `--add-data`.

Upload **both** assets to the GitHub release: Setup.exe for first install, the zip for in-app update. `npm run dist:win` (NSIS) is unused.

Installer Python sources are in `installer/src/` and are gitignored; only the compiled exes are committed/shipped. Rebuild them alone with:

```powershell
powershell -ExecutionPolicy Bypass -File installer/src/build_installers.ps1
```

## Tree

```text
electron/            Main process: BrowserWindow, IPC, updater spawn, Windows shell
src/main/            Detection, playtime, settings, Python runner
src/renderer/        React UI (library, home, settings, gamepad nav)
src/types/
assets/icons/        App and installer icons
assets/sounds/       UI samples
tools/               Shipped helpers: steam_detect.py, xbox_detect.py, proc.py, updater.bat, …
installer/           build_release.ps1, Installer.exe, Uninstaller.exe
installer/src/       Installer GUI (local-only)
runtime/python/      Embeddable CPython (gitignored; becomes resources/python)
release/             win-unpacked, GameLibrarian-win.zip, GameLibrarian-Setup.exe
Version.Json         Stamp compared to GitHub main, e.g. "(1.0) 180926 - Pre"
```

## Launchers

| Source | How it is found | How it launches |
| --- | --- | --- |
| Steam | Registry install path, libraryfolders.vdf, extra folders, other drives (depth-limited) | `steam://` or installed exe |
| Epic | EGS manifests from registry data dirs, ProgramData, configured folders | Epic URI on Windows |
| GOG | Registry plus extra library roots | Installed exe |
| Ubisoft | Registry and default Connect folders | Installed exe; Steam header used when local art is missing |
| Xbox | Registry and Start menu app IDs | `shell:AppsFolder\<id>` |
| Roblox | Protocol / launcher presence | Installed Roblox exe; uses that file's icon |

Library roots can be overridden in Settings. An empty scan surfaces a link to that page; saving paths triggers a rescan.

Themes are CSS variables from `src/renderer/lib/theme.ts` (Xbox Dark, Fluent Blue, Light, and a few accent presets). Header dropdown switches them. Changelog is `CHANGELOG.md`, also opened from the header.

## License

MIT.

