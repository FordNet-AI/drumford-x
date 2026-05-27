# Electron + ParaDB Integration Design

## Goal
Wrap DrumFord X as a standalone frameless Electron desktop app with an integrated ParaDB.net song browser for one-click search and download.

## Architecture

Electron main process handles two things the browser can't:
1. ParaDB API calls (no CORS)
2. Zip download + extraction from S3

Renderer stays as-is: React + Canvas + Web Audio loaded from Vite dev server (dev) or built dist/ (prod).

```
electron/
  main.ts          — Frameless BrowserWindow, IPC handlers
  preload.ts       — Exposes safe IPC bridge to renderer
  paradb.ts        — ParaDB API client (search, download, extract)
src/
  components/library/
    library-tabs.tsx    — "My Songs" / "Browse ParaDB" tab switcher
    paradb-browser.tsx  — Search bar + song grid
    paradb-card.tsx     — Card with download button + progress
```

## Frameless Window
- Custom title bar in app header with `-webkit-app-region: drag`
- Minimize/maximize/close buttons on the right
- Buttons hide gracefully when running in a plain browser

## ParaDB Browser
- Tab alongside "My Songs" in library screen
- Search: renderer IPC `paradb:search` → main POSTs `paradb.net/api/maps/search` → returns results
- Download: renderer IPC `paradb:download` → main GETs `/api/maps/[id]/download`, follows 307 to S3, downloads zip, extracts with adm-zip, sends file buffers back via IPC → renderer runs importCollected()

## Download Flow
Click download → button becomes progress bar → zip downloads + extracts → auto-imports to IndexedDB → checkmark → appears in My Songs

## New Dependencies
- electron, electron-builder (dev)
- adm-zip (main process)

## Unchanged
Everything in src/ stays the same. Only additions:
1. Library screen gains tab switcher
2. Import store gains importFromBuffers() for IPC-sourced files
