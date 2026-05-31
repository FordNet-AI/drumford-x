# DrumFord Coach — Drill Mode (design + plan)

> **Build target:** DrumFord X **player** (`src/`), branch **`feat/coach-mode`** (local only; no push without a green light). Reuses the existing playback / transport / metronome seams — Drill Mode is orchestration, not new low-level audio work.

## Concept
A practice looper for the trouble spot. Bracket a region (**Set A** / **Set B** at the playhead), **Loop** it, and optionally let the **tempo ramp** up pass-by-pass (70% → 100%, +5%/clean pass) until you're at speed. "Woodshedding," built into the player. Differentiates DrumFord further as a *practice coach*, not a game.

## Locked decisions (from brainstorming)
- **Loop region:** **Set A / Set B** buttons capture the playhead; the region highlights on the seek bar. No drag handles in v1.
- **Tempo ramp default:** **70% → 100%, +5% per pass** (auto-ramp; every value adjustable in the popover).
- **Count-in:** optional 1-bar count-in before each loop pass (reuses `metro.playCountIn`); default **off** for a seamless loop.
- **Persistence:** **session-only** — loop + ramp reset on song change / leaving the player. Per-song save is a later option.
- **Availability:** always-on practice utility (NOT gated by `coachEnabled`), like Rewind.

## Architecture (reuse the seams)
- **`src/stores/drill-store.ts`** (NEW, Zustand, NOT persisted): `loopStart|loopEnd: number|null`, `loopEnabled`, `rampEnabled`, `rampStartPct/rampStepPct/rampTargetPct` (70/5/100), `liveRampPct`, `countInEachLoop`. Setters (`setLoopStart`/`setLoopEnd` snap to the playhead, `clearLoop`, `toggleLoop`, `toggleRamp`, ramp setters, `resetDrill`). Pure helpers exported for tests: `nextRampPct()`, `normalizedBounds()`.
- **`src/lib/coach/use-drill-loop.ts`** (NEW hook, wired in HighwayView): subscribes to `currentTime` + drill state; when `loopEnabled && isPlaying && currentTime >= loopEnd` → **wrap**: if ramping and below target, bump `liveRampPct` and `setSpeed`, then seek to `loopStart` (via the seek fn passed from HighwayView, which restarts audio + metronome). Arming Loop with Ramp on sets speed to `rampStart`. A re-entry guard prevents a double-wrap before the clock updates.
- **`src/components/controls/drill-control.tsx`** (NEW transport popover, mirrors `coach-popover.tsx`): Set A / Set B / Clear, Loop toggle, Ramp toggle + start/step/target, count-in-each-loop toggle, live A/B readout.
- **`src/components/controls/transport-bar.tsx`** (MODIFY): render A/B markers + a region band over the seek bar; mount `<DrillControl onSeek={onSeek} />` in the controls cluster.
- **`src/components/highway/highway-view.tsx`** (MODIFY): call `useDrillLoop(handleSeek)`; reset drill state on song change.
- **Reuse:** `handleSeek` (B→A wrap), `usePlayerStore.setSpeed` (ramp; engine accepts arbitrary floats, finer than the dropdown presets), `metro.playCountIn` (optional per-loop count-in), the coach-popover UI pattern, the rewind-control `onSeek` pattern.

## Loop-wrap logic (the core, pure + testable)
```
shouldWrap(currentTime, loopStart, loopEnd, loopEnabled, isPlaying):
  return loopEnabled && isPlaying && loopStart != null && loopEnd != null
         && loopEnd > loopStart && currentTime >= loopEnd

nextRampPct(current, step, target): min(target, current + step)   // never overshoots
```
On wrap: `if (rampEnabled && live < target) { live = nextRampPct(live, step, target); setSpeed(live/100) }` then `seek(loopStart); onSeek(loopStart)`. Guards: validate `B > A` on set (ignore/skip otherwise); clamp A/B to `[0, duration]`.

## Phases (commit locally per phase)
- **D1 — Drill store + pure logic (TDD):** `drill-store.ts` + `nextRampPct`/`normalizedBounds`/`shouldWrap` + unit tests.
- **D2 — Loop hook:** `use-drill-loop.ts` (wrap + ramp, re-entry guard) wired into HighwayView; tests for the pure wrap/ramp decisions.
- **D3 — Drill UI:** `drill-control.tsx` popover + seek-bar A/B markers + region band; wire into transport-bar.
- **D4 — Verify + commit:** vitest, tsc, vite build, interactive shakedown in the preview, commit.

## Verification
- **Unit (Vitest):** `nextRampPct` walks start→target by step and clamps (no overshoot); `shouldWrap` fires at/after B, never before, and only when armed + playing; bounds validation (B>A, clamp).
- **Interactive (preview):** load a song, Set A / Set B, Loop → the playhead wraps A↔B; Ramp → speed steps up each pass (watch the speed/BPM readout); Clear removes the region; markers sit at the right spots on the seek bar.
- **Safety:** all on `feat/coach-mode`; `main` untouched; session-only state.

## Staged (NOT v1)
Drag-to-set loop on the seek bar; per-song saved loops; "loop the current section" from chart markers; count-in-each-loop polish; ramp-down-on-miss (no input detection in DrumFord).
