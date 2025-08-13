Game Librarian (v2.x)
==============

<div align="center">

<img src="src/Icon.png" alt="Game Librarian" width="96" />

Open‑source, unified game library for Windows — discover, launch, and track playtime across multiple launchers with a beautiful, modern UI.

</div>

Features
--------

- Unified library: Steam, Epic, Ubisoft, GOG, Xbox (MS Store) + Roblox
- Playtime & sessions: one‑click play, live session overlay, recent games row
- Polished UI: grid/list/small card views, A→Z and playtime sorting, search
- Theming: Dark/Light + vivid presets (Neon Blue/Red/Green, Orange Sunrise, Purple Galaxy, Sea Breeze)
- Smart updater: decimal versioning (e.g. 2.31) with in‑app checks
- High‑res artwork: Steam header images as fallback for Epic/Ubisoft where available
- In‑app Debug Console: live logs, clear buffer, export bundle to `Logs/` *WIP

Install
-------

- Download the latest release and run the installer (`scripts/Installer.exe`).
- The app checks for updates on launch.
- To uninstall, use `scripts/Uninstaller.exe` (or Windows Apps & Features).

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
  electron/              # main process
  src/
    main/                # node/electron services (detection, playtime, settings)
    renderer/            # React UI (App, components, styles)
    sounds/              # UI SFX
  scripts/               # Installer/Uninstaller/Updater tools and helpers
  Version.Json           # App version (decimal number, used by updater)
```

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
npm run dist:Dir    # Produce distributable folder
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


