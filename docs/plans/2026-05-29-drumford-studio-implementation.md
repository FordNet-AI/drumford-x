# DrumFord Studio Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build "DrumFord Studio" — a browser-first companion app (in a new `studio/` folder of the DrumFord X repo) that converts a drum MIDI + backing track into a `.rlrr` chart, lets the user edit it on a piano-roll grid, preview it on the real DrumFord highway, and export a ParaDB-compatible song folder.

**Architecture:** A second Vite app under `studio/`, sharing the player's pure `.rlrr` core by importing from `../src` (alias `@`). An editable Zustand chart model with undo/redo feeds two views: a Preview that reuses the player's `renderHighway` + `audio-engine`, and a new piano-roll Editor. Output is a studio-local IndexedDB draft (re-open) + an exported ParaDB-compatible zip (the canonical handoff to the player).

**Tech Stack:** React 19 + Vite 7 + TypeScript + Tailwind v4 + Zustand 5 (shared with player) · `@tonejs/midi` (MIDI parse) · `fflate` (browser zip) · `zundo` (undo/redo) · `idb-keyval` (drafts, already a dep) · Vitest (new, tests).

**Branch:** `studio` (already cut off `main`). `studio/` is additive only — never touch `src/`, `electron/`, or the player's build. Design ref: `docs/plans/2026-05-29-drumford-studio-design.md`. Converter source of truth to port: `scripts/spike-midi-to-rlrr.cjs` (on branch `spike/midi-to-rlrr`, commit `520dc4e`).

**Reuse rules:** Import only PURE player modules — `@/types/song`, `@/types/kit`, `@/lib/rlrr-parser`, `@/lib/default-kit`, `@/components/highway/highway-renderer`, `@/lib/audio-engine`. NEVER import player components that read `usePlayerStore`/`useKitStore` (replicate their small logic instead).

---

## Phase 0 — Scaffold the studio app

### Task 1: Install dependencies

**Files:** Modify `package.json` (root).

**Step 1:** Run:
```
npm i @tonejs/midi fflate zundo
npm i -D vitest @vitest/ui jsdom
```
`@tonejs/midi` may already be absent on this branch (it was only added on the spike). Confirm all four land in `package.json`.

**Step 2:** Verify: `npm ls @tonejs/midi fflate zundo vitest` prints versions, no "missing".

**Step 3:** Commit:
```
git add package.json package-lock.json
git commit -m "chore(studio): add midi/zip/undo/test deps"
```

### Task 2: Studio Vite config + entry + tsconfig

**Files:**
- Create `studio/index.html`
- Create `studio/vite.config.ts`
- Create `studio/tsconfig.json`
- Create `studio/src/main.tsx`
- Create `studio/src/App.tsx`
- Create `studio/src/index.css`
- Modify `package.json` scripts

**Step 1:** `studio/vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),       // shared player core
      '@studio': path.resolve(__dirname, './src'),  // studio-local code
    },
  },
  server: { port: 5273, fs: { allow: ['..'] } },     // allow importing from ../src
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
```

**Step 2:** `studio/index.html` — standard Vite React root mounting `/src/main.tsx`; title "DrumFord Studio".

**Step 3:** `studio/src/index.css` — `@import "tailwindcss";` plus a dark base (reuse the player's `--color-bg-primary: #050508` look). Add the Google Fonts `<link>` (Orbitron / Share Tech Mono) to `index.html` (NOT via CSS `@import` — Tailwind v4 strips remote `@import`; this is a documented player lesson).

**Step 4:** `studio/src/main.tsx` renders `<App />`. `studio/src/App.tsx` returns a placeholder shell: header "DRUMFORD STUDIO" + an empty `<main>`.

**Step 5:** `studio/tsconfig.json`:
```json
{
  "extends": "../tsconfig.app.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["../src/*"], "@studio/*": ["./src/*"] }
  },
  "include": ["src", "../src"]
}
```

**Step 6:** Add scripts to root `package.json`:
```json
"dev:studio": "vite --config studio/vite.config.ts",
"build:studio": "vite build --config studio/vite.config.ts",
"test:studio": "vitest run --config studio/vite.config.ts",
"test:studio:watch": "vitest --config studio/vite.config.ts"
```

**Step 7:** Run `npm run dev:studio`, open `http://localhost:5273`, confirm the "DRUMFORD STUDIO" shell renders (dark bg, fonts loaded). This is the smoke test.

**Step 8:** Commit:
```
git add studio package.json
git commit -m "feat(studio): scaffold vite app, entry, config, shell"
```

---

## Phase 1 — Pure core: types, generator, IO (TDD)

### Task 3: Studio types

**Files:** Create `studio/src/types.ts`.

```ts
export interface StudioNote {
  id: string                // stable id (generateId) for selection/drag/undo
  time: number              // seconds
  instrumentClass: string   // BP_Kick_C … → lane+color via resolveInstrumentLane
  vel: number               // 1..127
  duration?: number         // reserved for a future piano profile (drums ignore)
}

export interface StudioMeta {
  title: string
  artist: string
  creator: string
  difficulty: string        // e.g. "Expert"
  complexity: number        // 1..5
  length: number            // seconds
}

import type { RlrrBpmEvent } from '@/types/song'

export interface StudioChart {
  meta: StudioMeta
  bpmEvents: RlrrBpmEvent[]
  notes: StudioNote[]
  audio?: { blob: Blob; name: string }
}
```
Commit: `feat(studio): chart model types`.

### Task 4: Port the MIDI→chart converter (TDD)

**Files:**
- Create `studio/src/lib/midi-to-chart.ts`
- Create `studio/src/lib/midi-to-chart.test.ts`
- Reference (read, do not import): `scripts/spike-midi-to-rlrr.cjs` @ commit `520dc4e` for `GM_TO_CLASS` and `CLASS_TO_NAME`.

**Step 1 — failing test.** Synthesize the same 4-bar rock beat the spike used, in the test, and assert the converter reproduces the verified counts. `studio/src/lib/midi-to-chart.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { Midi } from '@tonejs/midi'
import { midiToChart } from './midi-to-chart'

function demoBeat(): ArrayBuffer {
  const midi = new Midi(); midi.header.setTempo(120)
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] })
  const t = midi.addTrack(); t.channel = 9
  const SPB = 0.5, dur = 0.05
  const add = (n: number, beat: number, v = 0.8) => t.addNote({ midi: n, time: beat * SPB, duration: dur, velocity: v })
  for (let bar = 0; bar < 4; bar++) {
    const b = bar * 4
    add(36, b + 0, 0.95); add(36, b + 2, 0.9); add(38, b + 1, 0.9); add(38, b + 3, 0.9)
    for (let e = 0; e < 8; e++) add(42, b + e * 0.5, e % 2 ? 0.5 : 0.7)
    if (bar === 0) add(49, b + 0, 1.0)
  }
  const b4 = 12
  add(48, b4 + 3.0, 0.85); add(48, b4 + 3.25, 0.85); add(45, b4 + 3.5, 0.9); add(41, b4 + 3.75, 0.95)
  return midi.toArray().buffer
}

describe('midiToChart', () => {
  it('reproduces the verified demo-beat counts', () => {
    const { chart, unmapped } = midiToChart(demoBeat(), { title: 'X', artist: 'Y' })
    const count = (cls: string) => chart.notes.filter(n => n.instrumentClass === cls).length
    expect(chart.notes.length).toBe(53)
    expect(count('BP_Kick_C')).toBe(8)
    expect(count('BP_Snare_C')).toBe(8)
    expect(count('BP_HiHat_C')).toBe(32)
    expect(count('BP_Crash17_C')).toBe(1)
    expect(count('BP_Tom1_C')).toBe(2)
    expect(count('BP_Tom2_C')).toBe(1)
    expect(count('BP_FloorTom_C')).toBe(1)
    expect(Object.keys(unmapped)).toHaveLength(0)
    expect(chart.bpmEvents[0].bpm).toBe(120)
    // first hit cluster at t=0
    expect(chart.notes.filter(n => n.time === 0).length).toBe(3) // kick+hat+crash
  })
})
```

**Step 2 — run, expect FAIL:** `npm run test:studio` → fails ("midiToChart is not a function").

**Step 3 — implement `studio/src/lib/midi-to-chart.ts`:**
```ts
import { Midi } from '@tonejs/midi'
import { generateId } from '@/lib/rlrr-parser'
import type { StudioChart, StudioNote } from '@studio/types'
import type { RlrrBpmEvent } from '@/types/song'

const GM_TO_CLASS: Record<number, string> = {
  35: 'BP_Kick_C', 36: 'BP_Kick_C',
  37: 'BP_Snare_C', 38: 'BP_Snare_C', 40: 'BP_Snare_C',
  42: 'BP_HiHat_C', 46: 'BP_HiHat_C', 44: 'BP_HiHatFoot_C',
  41: 'BP_FloorTom_C', 43: 'BP_FloorTom_C',
  45: 'BP_Tom2_C', 47: 'BP_Tom2_C', 48: 'BP_Tom1_C', 50: 'BP_Tom1_C',
  49: 'BP_Crash17_C', 57: 'BP_Crash17_C', 55: 'BP_Splash_C', 52: 'BP_ChinaCrash_C',
  51: 'BP_Ride_C', 59: 'BP_Ride_C', 53: 'BP_RideBell_C',
}

export function midiToChart(
  buf: ArrayBuffer,
  opts: { title: string; artist: string; creator?: string; difficulty?: string },
): { chart: StudioChart; unmapped: Record<number, number> } {
  const midi = new Midi(buf)
  const notes: StudioNote[] = []
  const unmapped: Record<number, number> = {}
  for (const track of midi.tracks) {
    for (const n of track.notes) {
      const cls = GM_TO_CLASS[n.midi]
      if (!cls) { unmapped[n.midi] = (unmapped[n.midi] || 0) + 1; continue }
      notes.push({ id: generateId(), time: +n.time.toFixed(4), instrumentClass: cls, vel: Math.max(1, Math.round(n.velocity * 127)) })
    }
  }
  notes.sort((a, b) => a.time - b.time)
  const ts0 = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4]
  const bpmEvents: RlrrBpmEvent[] = (midi.header.tempos.length ? midi.header.tempos : [{ ticks: 0, bpm: 120 }])
    .map(t => ({ bpm: +t.bpm.toFixed(3), time: +midi.header.ticksToSeconds(t.ticks).toFixed(4), timeSignature: ts0 as [number, number] }))
  if (!bpmEvents.length || bpmEvents[0].time > 0) bpmEvents.unshift({ bpm: 120, time: 0, timeSignature: ts0 as [number, number] })
  const length = +(midi.duration + 1).toFixed(2)
  return {
    chart: {
      meta: { title: opts.title, artist: opts.artist, creator: opts.creator ?? 'DrumFord Studio', difficulty: opts.difficulty ?? 'Expert', complexity: 3, length },
      bpmEvents, notes,
    },
    unmapped,
  }
}
```

**Step 4 — run, expect PASS.** **Step 5 — commit:** `git add studio/src/lib/midi-to-chart.ts studio/src/lib/midi-to-chart.test.ts studio/src/types.ts && git commit -m "feat(studio): MIDI→chart converter (ported from spike) + tests"`.

### Task 5: chart ↔ .rlrr IO (TDD round-trip)

**Files:** Create `studio/src/lib/chart-io.ts`, `studio/src/lib/chart-io.test.ts`.

**Step 1 — failing test:** build a small `StudioChart`, `chartToRlrr` → JSON string, `rlrrToChart(json)` → assert notes (time/vel/instrumentClass), bpmEvents, and meta survive losslessly; assert the JSON `JSON.parse`s and has `instruments`, `events`, `bpmEvents`, `recordingMetadata`.

**Step 2 — run, expect FAIL.**

**Step 3 — implement.** `chartToRlrr(chart)`:
- Build `instruments[]` = one per used `instrumentClass` (name from a `CLASS_TO_NAME` map; reuse the spike's), shape per `RlrrInstrument` (zeros for location/rotation, scale [1,1,1], `midiNotes: []`).
- Build `events[]` = `{ name: classToName(n.instrumentClass), time: n.time, vel: n.vel, loc: 0 }`.
- Assemble `RlrrFile` (version 1, recordingMetadata from meta, audioFileData with `songTracks: [audioFileName]`, highwaySettings defaults, bpmEvents, bookmarks [], editorData `{mappingTime:0, editorVersion:'drumford-studio'}`).
- Return `JSON.stringify(rlrr, null, 2)`.
`rlrrToChart(json)`: `JSON.parse` → map `events[]` to `StudioNote` (resolve `event.name`→class via the file's `instruments[]` name→class lookup; `generateId()` for ids), copy `bpmEvents`, build `meta` from `recordingMetadata`.

**Step 4 — run, expect PASS. Step 5 — commit:** `feat(studio): chart↔.rlrr IO with lossless round-trip`.

---

## Phase 2 — Editable store + undo/redo (TDD)

### Task 6: studio-store with note edits + undo/redo

**Files:** Create `studio/src/stores/studio-store.ts`, `studio/src/stores/studio-store.test.ts`.

**Step 1 — failing tests** (pure action behavior, no React):
```ts
// loadChart sets notes; addNote appends; moveNotes shifts time + can change class;
// setVelocity clamps 1..127; deleteNotes removes; remapClass rewrites instrumentClass;
// undo() reverts the last mutation; redo() reapplies.
```
Concretely test: `useStudioStore.getState().loadChart(chart)`, then `addNote({time:1,instrumentClass:'BP_Snare_C',vel:90})` → notes length +1; `moveNotes([id], {dt:0.25, dLaneClass:'BP_Tom1_C'})` → that note's time +0.25 and class changed; `deleteNotes([id])`; `setVelocity([id], 200)` → clamped 127; `useStudioStore.temporal.getState().undo()` → previous state restored.

**Step 2 — run, expect FAIL.**

**Step 3 — implement** with `zustand` + `zundo` temporal middleware. State: `chart: StudioChart | null`, `selection: Set<string>`, `snap: '1/4'|'1/8'|'1/16'|'1/8T'`. Actions mutate `chart.notes` immutably (map/filter, new arrays). Track only `chart` in temporal history (zundo `partialize`). Provide selectors. Use `generateId` from `@/lib/rlrr-parser` for new note ids.

**Step 4 — run, expect PASS. Step 5 — commit:** `feat(studio): editable chart store with undo/redo`.

### Task 7: Grid geometry helpers (TDD)

**Files:** Create `studio/src/lib/grid.ts`, `studio/src/lib/grid.test.ts`.

Pure functions the editor canvas will use (unit-testable in isolation):
- `snapTime(time, snap, bpmEvents): number` — quantize to the nearest subdivision boundary using the bpm/timeSig map.
- `subdivisionSeconds(snap, bpm, timeSig): number`.
- `timeToY(time, currentTime, pxPerSec, height): number` and `yToTime(...)` (inverse).
- `laneOrder(): string[]` — the editor's column order of instrument classes (kick rendered as a full-width band, not a column).

**Step 1 — failing tests:** e.g. `snapTime(0.62, '1/8', [{bpm:120,time:0,timeSignature:[4,4]}])` → `0.5` (eighth = 0.25s at 120? NO: quarter=0.5s, eighth=0.25s → nearest eighth to 0.62 is 0.5). Add a triplet case. Test `yToTime(timeToY(t)) ≈ t`.

**Steps 2–5:** implement, pass, commit `feat(studio): grid snap/geometry helpers + tests`.

---

## Phase 3 — Preview mode (reuse player renderer)

### Task 8: Chart→HighwayNote resolution helper

**Files:** Create `studio/src/lib/resolve-notes.ts`, `studio/src/lib/resolve-notes.test.ts`.

Replicate (don't import) the resolution from `src/components/highway/highway-canvas.tsx` against `DEFAULT_KIT`: produce `{ resolvedNotes: HighwayNote[], columnLanes, laneIndexToColumnPos, laneIndexToFullWidth }` from `StudioNote[]`. Compute `noteType` from `vel` vs the chart's ghost/accent thresholds. Use `resolveInstrumentLane` + `DEFAULT_KIT.lanes` from `@/lib/default-kit`.

**Test:** a kick→full-width map entry exists; a snare→column lane; velocity 20 → `'ghost'`, 100 → `'accent'`. Implement, pass, commit.

### Task 9: PreviewCanvas + transport (manual verify)

**Files:** Create `studio/src/components/preview/preview-canvas.tsx`, `preview-panel.tsx`.

- `PreviewCanvas`: mirror `highway-canvas.tsx`'s canvas lifecycle (ResizeObserver + a **synchronous size seed on mount** — carry over the spike's hidden-page fix so headless/screenshot works), call `renderHighway` with the resolved notes + `DEFAULT_KIT` multipliers + a `currentTime` from the studio playback store. rAF loop while playing.
- Audio: instantiate `AudioEngine` from `@/lib/audio-engine`; `loadSongTrack(chart.audio.blob)` if present, else play the generated click (reuse the spike's WAV writer ported to TS, or just scrub silently). Wire play/pause/seek/speed to a small playback slice in the studio store.
- `preview-panel.tsx`: the canvas + a transport bar (play/pause, scrub, speed, time/bpm readout).

**Verify (manual):** load a chart (temporarily via a dev button calling `midiToChart` on the bundled demo), switch to Preview, press play → notes scroll in sync; scrub works. Commit `feat(studio): highway preview (reuses renderHighway + audio-engine)`.

---

## Phase 4 — Editor mode (piano-roll)

> Canvas interaction isn't cleanly unit-testable; geometry/snap live in Task 7 (tested). These tasks are build + **manual acceptance criteria**. Keep each task to one interaction.

### Task 10: Editor grid rendering (read-only)
**Files:** `studio/src/components/editor/editor-grid.tsx`, `editor-canvas.tsx`.
Render: time ruler (bars/beats from `bpmEvents`), lane columns (colors from `DEFAULT_KIT`), kick as a full-width row band, existing notes as blocks (color by lane, height by `vel`). Zoom (px/sec) + vertical scroll. **Accept:** the demo chart's notes appear in correct lanes/colors/positions; zoom + scroll work.

### Task 11: Add notes (click)
Click an empty cell → `addNote` snapped via `snapTime`. **Accept:** clicking places a note in that lane at the snapped time; undo removes it.

### Task 12: Select (click + marquee)
Click selects; drag-rectangle multi-selects; selection highlighted. **Accept:** marquee selects a region; Esc/empty-click clears.

### Task 13: Move (drag) — time + lane
Drag selection → `moveNotes({dt, dLaneClass})` (snap dt; lane change rewrites `instrumentClass`). **Accept:** dragging moves notes in time and across lanes; undo restores.

### Task 14: Delete + copy/paste
Del/Backspace → `deleteNotes(selection)`; Ctrl+C/Ctrl+V duplicates selection at playhead. **Accept:** delete + paste behave; undo/redo each step.

### Task 15: Velocity strip
Bottom strip shows a bar per note; drag a bar to set `vel`; reflects ghost/accent shading. **Accept:** dragging changes velocity + note shading in both Editor and Preview.

### Task 16: Shared playhead + snap selector
Playhead line synced to the shared `currentTime`; click ruler to seek; snap dropdown (¼/⅛/16th/triplet) drives `addNote`/`moveNotes`. **Accept:** seeking in Editor moves Preview's position and vice-versa; changing snap changes placement granularity.

Commit after each task: `feat(studio): editor <interaction>`.

---

## Phase 5 — Import, metadata, output

### Task 17: Import panel
**Files:** `studio/src/components/import-panel.tsx`.
Drop/pick a `.mid` → `FileReader` → `midiToChart` → `loadChart`. Optional backing-audio drop → `chart.audio`. Show the **unmapped-GM-note report** with a per-note "map to lane" control (writes a remap applied via `remapClass`). Also "Open .rlrr" → `rlrrToChart`. **Accept:** importing the demo MIDI builds the chart; an intentionally-unmapped note (e.g. GM 39) shows in the report and can be mapped.

### Task 18: Metadata panel
**Files:** `studio/src/components/metadata-panel.tsx`.
Edit title/artist/creator/difficulty/complexity; show length/bpm/time-sig (read-only). Writes `chart.meta`. **Accept:** edits persist into export.

### Task 19: Export ParaDB-compatible zip (TDD)
**Files:** `studio/src/lib/export-zip.ts`, `studio/src/lib/export-zip.test.ts`.
**Step 1 — failing test:** `buildSongZip(chart, audioBytes)` → `fflate.unzipSync` → assert entries `Title/Title_Difficulty.rlrr` and `Title/<audioName>` exist, and the `.rlrr` entry `JSON.parse`s with the right `events.length`. Sanitize names (strip non `\w.\-`).
**Steps 2–4:** implement with `fflate.zipSync` returning a `Blob`; pass.
**Step 5:** `export-panel.tsx` — "Export" downloads the zip (anchor + object URL). Commit `feat(studio): ParaDB-compatible zip export + test`.

### Task 20: Studio-local drafts (IndexedDB)
**Files:** `studio/src/lib/drafts.ts`.
`saveDraft(chart)` / `listDrafts()` / `loadDraft(id)` / `deleteDraft(id)` via `idb-keyval` under a `drumford-studio-draft-` prefix (audio blob stored inline). Wire a "Save draft"/"Open draft" control in the shell. **Accept:** save a WIP, reload the page, re-open it — notes + audio intact. Commit.

### Task 21: App shell wiring
**Files:** `studio/src/App.tsx`, `studio/src/stores/ui-store.ts`.
Tie it together: Import → (Preview | Editor tabs) → Metadata → Export, with a top bar (title, snap, undo/redo, save/open draft). Remove any temporary dev buttons. **Accept:** full flow navigable without dev hacks. Commit `feat(studio): app shell + view wiring`.

---

## Phase 6 — End-to-end verification

### Task 22: Full manual E2E + player handoff
1. `npm run dev:studio` → import the demo drum MIDI + an audio file.
2. Edit: add/move/delete a few notes, remap one, set a velocity, undo/redo.
3. Preview: play → scrolls in sync with audio; scrub.
4. Export zip.
5. In the **player** (`npm run dev:electron` on `main`), drag the exported zip into the library → it imports and plays correctly (notes match the editor).
6. Confirm `git status` shows **zero** changes under `src/`, `electron/`, or player build files — `studio/` additive only.

### Task 23: Run full test suite + typecheck
`npm run test:studio` (all green) and `npx tsc -p studio/tsconfig.json --noEmit` (no errors). Commit any fixes. **Do not** mark complete unless both pass (see @superpowers:verification-before-completion).

---

## Out of scope (v1) — do not build
Demucs/stem isolation · paradb.net upload · Electron packaging of Studio · piano/keyboard profile (the `StudioNote.duration` seam is reserved but unused). Player release pipelines (Windows/APK/Play) must remain byte-identical.

## Notes for the implementer
- **Tailwind v4:** fonts via `<link>` in `index.html`, never CSS `@import` (player lesson).
- **Canvas sizing:** seed size synchronously on mount in addition to `ResizeObserver` (hidden/headless pages don't fire RO's initial callback — spike lesson).
- **Origin separation:** Studio's IndexedDB is NOT the player's (different origin). The zip export is the handoff; "drafts" are studio-only.
- **Frequent commits:** one per task minimum; tests green before each commit.
