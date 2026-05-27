# DrumFord X

Flatscreen [Paradiddle](https://paradiddleapp.com) — a one-way drum chart visualizer wrapped in Electron. Notes scroll down a canvas highway synced to audio. No scoring, no input detection — just a clean way to read drum charts on a regular monitor instead of in VR.

Built by **Fordnet**.

## Features

- Drag-and-drop import of Paradiddle song folders (`.rlrr` charts + audio stems + album art)
- Integrated **ParaDB.net browser** with a fully local catalog (~6,000 songs), instant client-side search, and sort by Most Popular / Trending (7d / 30d) / Newest / Complexity / A→Z
- One-click download from ParaDB straight into the library
- **Kit Setup** — reorderable lanes, custom colors, drum/cymbal/full-width shapes, optional CHINA / SPLASH / HH-FT presets, per-class instrument remapping, custom user-defined lanes
- Live tuning sliders for note thickness, glow intensity, beat-grid brightness, hit-line pulse strength, and highway speed
- **Quick Tuner** palette icon on the gameplay screen for mid-song tweaks
- Hollow cymbal silhouettes, hit-line pulse on triggering notes, audio-output-latency-compensated timing
- Metronome with full BPM-event awareness (handles tempo changes correctly)
- Per-song speed control (0.5×–1.5×) and per-user sync offset (±2000ms with click-to-type input)
- Compact list view + grid view for the ParaDB browser
- Difficulty sorting in canonical order (Easy → Medium → Hard → Expert)
- Forward-compatible kit-config migrations so settings survive updates
- Custom frameless window with Fordnet branding

## Stack

Electron · React 19 · Vite 7 · TypeScript · Tailwind v4 · Zustand 5 · Web Audio API · IndexedDB (idb-keyval) · adm-zip

## Running

### One-time setup
1. Install [Node.js 18+](https://nodejs.org)
2. Clone this repo
3. `npm install`

### Daily use
```
start.bat              # Windows — kills stale instances, builds main process, runs dev
npm run dev:electron   # equivalent cross-platform command
```

### Production build
```
npm run build              # build renderer + electron main
npx electron-builder --dir # bundles win-unpacked/ — runs without an installer
npm run dist               # builds NSIS installer (requires Windows Developer Mode for symlinks)
```

The unpacked production app lands in `release/win-unpacked/DrumFord X.exe` — that's a fully self-contained executable, no Node.js required on the target machine.

### Regenerating the app icon
The `.ico` is committed to the repo, but if you want to re-derive it from the SVG source:
```
npm run icon
```

## Project layout

```
electron/           Main process (window, IPC, ParaDB API, zip extraction)
src/
  components/      React UI
    highway/        Canvas renderer + lane logic
    library/        Song cards, ParaDB browser, import
    setup/          Kit Setup screen, Quick Tuner popover, Add-Lane modal
    controls/       Transport bar widgets (offset, speed, metronome, volume)
  stores/          Zustand stores (player, library, kit, ui)
  lib/             Pure modules (parser, default kit, song storage, catalog cache)
  types/           Shared type definitions
public/            Static assets (icon, Fordnet logo, demo song)
scripts/           Build helpers (rename-cjs, generate-icon)
```

## License

Personal project. Unlicensed for redistribution. See `package.json`.
