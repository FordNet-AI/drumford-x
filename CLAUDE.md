# DrumFord X

Flatscreen Paradiddle — a one-way drum visualization/playback tool wrapped in Electron. Notes scroll down a canvas highway synced to audio. No scoring, no input detection.

## Stack
Electron + React 19 + Vite 7 + TypeScript + Tailwind v4 + Zustand 5

## Architecture
- **Electron main process** (`electron/`) handles window management, ParaDB API calls (bypasses CORS), and zip download/extraction
- **Preload bridge** (`electron/preload.ts`) exposes safe IPC to renderer via `window.electronAPI`
- **Renderer** (`src/`) is the React app — loaded from Vite dev server (dev) or built dist/ (prod)
- Frameless window with custom title bar (`src/components/title-bar.tsx`)

## Key Concepts
- `.rlrr` files are JSON — encoding varies: older songs use UTF-16LE with BOM (FF FE), newer community charts are plain UTF-8. `decodeRlrr()` auto-detects.
- Dual audio tracks: drums + backing (independent volume control), supports multiple stems per track
- Canvas 2D rendering at 60fps — React manages lifecycle, imperative code handles the hot path
- Kick notes render as full-width horizontal bars, not a lane column
- IndexedDB (idb-keyval) stores imported songs with audio blobs

## ParaDB Integration
- "Browse ParaDB" tab in library screen — search + one-click download
- Main process: `POST paradb.net/api/maps/search` for search, `GET /api/maps/[id]/download` follows 307 to S3 zip
- Downloads extracted with adm-zip in main process, sent to renderer via IPC, auto-imported to IndexedDB

## Launcher
- `start.bat` is the one-click launcher — kills previous Vite + Electron instances, compiles Electron TS, starts Vite, launches Electron
- **Always regenerate `start.bat`** when creating or modifying build/dev scripts

## TypeScript Configs
- `tsconfig.app.json` — renderer (React), ESNext modules, bundled by Vite
- `tsconfig.electron.json` — main process, CommonJS output to `electron-dist/`

## Skills
- @skill musical-maestro — DMA-level music theory, drumming, and Paradiddle expertise
