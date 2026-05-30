# DrumFord Studio — companion authoring app (design)

**Status:** approved (brainstorm 2026-05-29) — working name "DrumFord Studio"

**Goal:** A standalone desktop/web app that turns a drum MIDI + a backing
track into a playable `.rlrr` chart, then lets the user edit that chart
note-by-note on a piano-roll grid, preview it on the real DrumFord highway,
and export a ParaDB-compatible song folder. Built as its own surface now;
designed to fold into the DrumFord X player later.

**Non-goal (v1):** drum stem separation (Demucs), uploading to paradb.net,
Electron packaging, a piano/keyboard instrument profile. All deliberately
deferred — see "Out of scope".

---

## Decisions locked (from brainstorming)

| Decision | Choice |
|---|---|
| Editor depth | **Full note editor** — metadata + offset + MIDI→lane remap + lane mute/delete **and** add/move/delete/re-velocity individual notes on a grid, with undo/redo |
| Where it lives | **Same repo** (`DrumFord X`), new `studio/` folder, on a `studio` branch off `main`; imports the shared `.rlrr` core directly from `../src` |
| Edit UX | **Two modes** — Highway Preview (reuse existing renderer) + Piano-roll Editor (new) |
| Audio | Bring-your-own backing track (mp3/ogg/wav); generated click as fallback. Demucs deferred |
| Output | Save to a studio-local library (re-openable) **+** export a ParaDB-compatible song-folder zip |
| paradb upload | Deferred |
| Runtime | **Browser-first** (Vite dev), Electron wrapper later |

---

## Architecture

DrumFord Studio is a second Vite app inside the DrumFord X repo. It shares the
player's pure, framework-agnostic `.rlrr` core by importing from `../src`, so
the two stay compatible and folding Studio into the player later is mechanical.

```
DrumFord X/
  src/                      # player renderer (UNCHANGED by Studio)
    types/song.ts           #  ← shared: .rlrr / Song / HighwayNote types
    lib/rlrr-parser.ts      #  ← shared: parseRlrr, decodeRlrr, generateId, sortDifficulties…
    lib/default-kit.ts      #  ← shared: DEFAULT_KIT, resolveInstrumentLane, CLASS↔lane
    components/highway/      #  ← shared: highway-renderer.ts (Preview mode)
    lib/audio-engine.ts      #  ← shared: Web Audio playback/scrub
  studio/                   # NEW — the companion app
    index.html
    vite.config.ts          # own entry/port; alias @ → ../src, @studio → ./src
    src/
      main.tsx, App.tsx
      lib/midi-to-chart.ts  # PORT of scripts/spike-midi-to-rlrr.cjs → TS (canonical)
      lib/chart-io.ts       # model → .rlrr JSON; .rlrr → model (reuse parseRlrr)
      lib/export-zip.ts     # ParaDB-compatible folder zip (fflate)
      stores/studio-store.ts# editable chart model + selection + undo/redo
      components/
        import-panel.tsx     # drop MIDI + audio → build chart; unmapped-note report
        preview/             # wraps the shared highway renderer + transport
        editor/              # piano-roll grid (the full note editor)
        metadata-panel.tsx
        export-panel.tsx
```

`★ Why browser-first:` the v1 flow (read MIDI, decode audio, edit, zip-export)
is all doable with Web APIs (`FileReader`, `@tonejs/midi`, Web Audio
`decodeAudioData`, `fflate`). Electron only earned its place in the player for
ParaDB CORS + zip extraction + a frameless window — none of which v1 Studio
needs. Defer it.

### New runtime dependencies
- `@tonejs/midi` — MIDI parsing (already proven in the spike).
- `fflate` — tiny browser zip for export (player uses `adm-zip`, which is
  node-only; Studio runs in-browser, so a browser zip lib is required).

---

## Note model & state

Studio owns an **editable chart model** in a Zustand store, distinct from the
player's read-only `Song`. It is a thin superset of the `.rlrr` event model:

```ts
interface StudioNote {
  id: string            // stable id for selection/drag/undo
  time: number          // seconds
  instrumentClass: string // BP_Kick_C … (drives lane + color via resolveInstrumentLane)
  vel: number           // 1..127
  duration?: number     // OPTIONAL — unused for drums; reserved so a piano
                         //   profile can render sustain bars without a fork
}
interface StudioChart {
  meta: { title; artist; creator; difficulty; complexity; length }
  bpmEvents: RlrrBpmEvent[]   // tempo + time-signature map (from MIDI)
  notes: StudioNote[]
  audio?: { blob: Blob; name: string } // BYO backing track
}
```

- **Undo/redo:** `zundo` (Zustand temporal middleware) or a snapshot stack.
  Charts are small (≤ a few thousand notes), so whole-state snapshots are
  cheap and simplest. History captures `notes`, `bpmEvents`, `meta`.
- **Serialization:** `chart-io.ts` maps the model → a valid `.rlrr` (port the
  spike builder), and parses an incoming `.rlrr` → model (reuse `parseRlrr`),
  so Studio can **open an existing chart to edit**, not just build new ones.

`★ The duration seam:` `duration?` is the single forward-looking hook for the
piano profile discussed separately. Drums ignore it; a future keyboard renderer
reads it for sustain bars. Costs nothing now, avoids a fork later.

---

## The generator (port of the spike)

`studio/src/lib/midi-to-chart.ts` ports `scripts/spike-midi-to-rlrr.cjs` to
browser TS: the GM-drum→`BP_*_C` map, `@tonejs/midi` parse, per-note
time/velocity, and `bpmEvents` from the tempo/time-signature map. Output is a
`StudioChart`, not a file. **Unmapped GM notes are collected and surfaced**
(not silently dropped) so the user can remap them in the editor.

This becomes the canonical converter; the player inherits it on fold-in.

---

## Two modes

### Preview (reuse)
Wraps the existing `highway-renderer.ts` + `audio-engine.ts`: the chart scrolls
down the real DrumFord highway, synced to the backing track (or the click
fallback), with play/pause/scrub/speed. Read-only "see it like the game".

### Editor (new) — piano-roll grid
A static, zoomable grid: **time on the vertical axis** (scrollable/zoomable),
**lanes as columns** (kick as a full-width row band, matching the player's
model), driven by `resolveInstrumentLane` so colors/lanes match Preview exactly.

Interactions:
- **Add** — click an empty grid cell (snapped) to place a note in that lane.
- **Select** — click a note; marquee-drag to multi-select.
- **Move** — drag selected notes in time (and across lanes → changes
  `instrumentClass`).
- **Delete** — Del/Backspace on selection.
- **Velocity** — a bottom velocity strip (bars per note) or drag-vertical;
  drives ghost/accent thresholds already in the model.
- **Snap** — subdivision selector (¼ / ⅛ / 1⁄16 / triplet), computed from
  `bpmEvents` + time signature; snap toggle (hold a modifier for free placement).
- **Undo/redo** — Ctrl+Z / Ctrl+Shift+Z; **copy/paste** (Ctrl+C/V) of selections.
- **Playhead** — shared transport; click the time ruler to seek; Preview and
  Editor share one `currentTime`.

`★ Why a separate grid, not an editable highway:` the highway is a moving,
foreshortened, lookahead view — great to watch, hopeless to click precisely.
A static piano-roll is the proven authoring surface (DAWs, paredit). Both are
just **views of the same `notes` model**, so they never drift.

---

## Input / Output

**Input:** drop or pick (1) a drum `.mid`, (2) optionally a backing audio file;
or open an existing `.rlrr`/song folder to edit.

**Output (two targets):**
1. **Studio-local library** (IndexedDB via a Studio store) — so you can close
   and re-open a work-in-progress chart. NOTE: Studio is a different web origin
   than the player, so this IndexedDB is **not** shared with the player — it's
   for Studio's own re-open, not a handoff.
2. **Export ParaDB-compatible zip** — `fflate` builds
   `SongName/SongName_Difficulty.rlrr` + the audio file (+ optional cover),
   matching the layout the **player already imports**. This zip is the canonical
   handoff: export from Studio → drag into the DrumFord X player → it plays.

---

## Reuse map (imported from `../src`, unchanged)

| Module | Used for |
|---|---|
| `types/song.ts` | `.rlrr`, `RlrrBpmEvent`, `HighwayNote` shapes |
| `lib/rlrr-parser.ts` | `parseRlrr` (open existing), `generateId`, `sortDifficulties`, `formatDuration` |
| `lib/default-kit.ts` | `resolveInstrumentLane`, `DEFAULT_CLASS_TO_LANE`, kit colors |
| `components/highway/highway-renderer.ts` | Preview rendering |
| `lib/audio-engine.ts` | Preview/scrub playback |

---

## Errors & edge cases

- **Unmapped MIDI notes** → listed in the import report with a one-click "map to
  lane" control (writes a per-chart override); never silently dropped.
- **Audio decode failure** → fall back to the generated click; show a warning.
- **No backing track** → editor + click-track preview still fully work.
- **Empty / drumless MIDI** → friendly "no GM-drum notes found" message.
- **Export naming** → sanitize title/artist into a safe folder + filename.

---

## Testing

- **Unit (Vitest):** `midi-to-chart` reproduces the spike's verified counts for
  the synthesized demo beat (kick 8 / snare 8 / hat 32 / crash 1 / toms 4, correct
  times); `chart-io` round-trips (model → `.rlrr` → `parseRlrr` → model) without
  loss.
- **Manual:** import the demo MIDI + an audio file → edit a few notes + remap one
  → Preview scrolls in sync → export zip → import the zip into the DrumFord X
  player → it plays correctly.

---

## Build / branch

- Branch **`studio`** off `main`. Player release builds (Windows/APK/Play) ignore
  `studio/`, so nothing ships until we choose to.
- Scripts: `dev:studio` (vite, separate port), `build:studio`. Player scripts
  untouched.
- `studio/vite.config.ts`: `@ → ../src`, `@studio → ./src`, `base: './'` (same
  Electron-friendly relative-path lesson the player learned).

---

## Out of scope (v1) — deferred, with the seam left open

- **Demucs / drum-stem isolation** — not needed to author; the backing track plays.
- **paradb.net upload** — needs their write API + auth; export-zip is the bridge.
- **Electron packaging** — browser-first; wrap later (or fold into the player's shell).
- **Piano/keyboard profile** — enabled later by `StudioNote.duration` + a generic
  pitch→position mapper; not built now.

## Fold-into-player path (later)

Because Studio imports the same core and emits the same `.rlrr`, integration is:
move `midi-to-chart.ts` + the editor components into the player, add an "Author"
screen, and share one IndexedDB library (same origin) — at which point Studio's
local-save and the player's library converge automatically.
