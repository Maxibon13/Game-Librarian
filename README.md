Game Librarian (VERSION 2.31 BETA)
==============

<div align="center">

<img src="src/Icon.png" alt="Game Librarian" width="96" />

Open‑source, unified game library for Windows — discover, launch, and track playtime across multiple launchers with a beautiful, modern UI.

</div>

Features
--------

- Unified library: Steam and Epic detection out of the box, plus Roblox and Minecraft launchers
- Fast launcher: one‑click play with playtime tracking and session overlays
- Polished UI: grid/list views, sorting, searchable library, modern animations
- Themes: Dark, Light, Neon Blue/Red/Green, Orange Sunrise, Purple Galaxy, Sea Breeze
- Smart Updater: lightweight, decimal versioning (e.g. 1.2) with in‑app update prompts

Install
-------

- Download the latest release from the Releases page (or the packaged installer) and run it
- On first launch, the app checks for updates and shows a brief Welcome screen

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
  scripts/               # Python helpers and updater scripts
  Version.Json           # app version (decimal integer e.g. 6, 62)
```

Detectors
---------

- Steam: reads Steam libraries, manifests, and images
- Epic: parses EGS manifests in ProgramData
- Roblox & Minecraft: detects launchers and supports protocol fallbacks

Theming
-------

Switch themes from the header dropdown. Light/Dark plus vivid presets with subtle gradients. Custom themes were previously supported; presets are now streamlined and consistent.

Build
-----

```bash
npm run dist:Dir    # Windows installer (NSIS)
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


