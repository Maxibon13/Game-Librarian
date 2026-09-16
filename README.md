Game Librarian ((1.0) 160926 - Pre)
==============

<div align="center">

<img src="assets/icons/Icon.png" alt="Game Librarian" width="96" />

Open‑source, unified game library for Windows — discover, launch, and track playtime across multiple launchers with a beautiful, modern UI.

</div>

Features
--------

- Unified library: Steam, Epic, Ubisoft, GOG, Xbox (MS Store) + Roblox
- Playtime & sessions: one‑click play, live session overlay, recent games row
- Polished UI: grid/list/small card views, A→Z and playtime sorting, search
- Theming: Dark/Light + vivid presets (Neon Blue/Red/Green, Orange Sunrise, Purple Galaxy, Sea Breeze)
- Smart updater: reads `Version.Json` locally and from GitHub (`(1.0) 160926 - Pre`)
- High‑res artwork: Steam header images as fallback for Epic/Ubisoft where available
- In‑app Debug Console: live logs, clear buffer, export bundle to `Logs/` *WIP

Install
-------

- Download `GameLibrarian-Setup.exe` from the latest release and run it. Everything is bundled (Electron app + embedded Python runtime); nothing else needs to be installed, and it works offline on a fresh Windows install.
- Default location: `%LOCALAPPDATA%\Programs\Game Librarian` (per-user, no admin).
- The app checks for updates on launch and re-runs the bundled installer, which downloads `GameLibrarian-win.zip` from the latest GitHub release and updates in place.
- To uninstall, use Windows Apps & Features (or `resources\installer\Uninstaller.exe` in the install folder).

Unattended: `GameLibrarian-Setup.exe --silent [--dir <path>] [--no-shortcuts]`, `Uninstaller.exe --silent [--remove-userdata]`. Logs: `%TEMP%\GameLibrarian_install.log`.

Building a release (Node 18+, Python 3.10+ with tkinter; PyInstaller/Pillow are pip-installed by the script):

```powershell
npm run release        # = powershell -ExecutionPolicy Bypass -File installer/build_release.ps1
```

This runs `vite build`, fetches the Python embeddable runtime into `runtime/python`, packages the app with electron-builder into `release/win-unpacked`, zips it to `release/GameLibrarian-win.zip`, and builds `release/GameLibrarian-Setup.exe` with that zip embedded. It also refreshes `installer/Installer.exe` / `Uninstaller.exe` (lean, no payload) which ship inside the app under `resources/installer`. Upload both `GameLibrarian-Setup.exe` and `GameLibrarian-win.zip` to the GitHub release. Installer sources live in `installer/src/` (gitignored).

Quick Start (Dev)
-----------------

Prereqs: Node 18+, npm, Git

```bash
git clone https://github.com/Maxibon13/Game-Librarian.git
cd Game-Librarian
npm install
npm run dev
```

This starts Vite and Electron together. The main process lives in `electron/`, and the renderer is powered by React + Vite in `src/renderer/`.

Project Structure
-----------------

```
GameLibrarian/
  electron/              # main process (window, IPC, Windows shell integration)
  src/
    main/                # node/electron services (detection, playtime, settings)
    renderer/            # React UI (views, components, lib, nav)
    types/
  assets/
    icons/               # app + installer icons
    sounds/              # UI SFX
  tools/                 # runtime helpers shipped with the app (python detectors, proc.py, updater.bat)
  installer/             # build_release.ps1 + Installer.exe / Uninstaller.exe (shipped in resources/installer)
    src/                 # installer sources (gitignored, local only)
  runtime/python/        # Python embeddable runtime, fetched by build_release.ps1 (gitignored; shipped as resources/python)
  release/               # build output: win-unpacked, GameLibrarian-win.zip, GameLibrarian-Setup.exe (gitignored)
  dev/                   # scratch scripts and notes (gitignored, local only)
  Librarian_Launcher.exe # dev entry point: runs release/win-unpacked or `npm run dev`
  Version.Json           # App version string, compared against GitHub main
```

Python tools (`tools/*.py`) are stdlib-only and run on the embedded runtime (`src/main/services/pythonRuntime.js` picks `resources/python/python.exe`, falling back to `python`/`py` on PATH in dev).

Detectors
---------

- Steam: libraries & manifests (with image cache/CDN fallbacks)
- Epic: EGS manifests in ProgramData; launch via protocol (Windows)
- Ubisoft: registry + default folders, Steam header image fallback
- GOG: registry + custom libraries
- Xbox (MS Store): registry + StartApps AUMID mapping; launched via AppsFolder
- Roblox: protocol/launcher detection

Theming
-------

Switch themes from the header dropdown. Light/Dark plus vivid presets with subtle gradients. Custom themes were previously supported; presets are now streamlined and consistent.

Build / Package
-----

```bash
npm run release     # Full release: app + embedded Python + payload zip + Setup.exe (see Install)
npm run dist:dir    # Just the packaged app folder (release/win-unpacked); needs runtime/python + build/icon.ico from a prior release build
```

Artifacts are created via electron‑builder. See `package.json` → `build` for config.

Changelog
---------

See CHANGELOG.md. You can also open it from within the app (header → Changelog).

Contributing
------------

Issues and PRs are welcome! For larger changes, open an issue first to discuss direction. Please keep code readable and align with the existing style guidelines.

License
-------

MIT © Game Librarian contributors


