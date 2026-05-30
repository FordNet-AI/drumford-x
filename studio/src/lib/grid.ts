/**
 * Pure grid geometry + snap helpers for the DrumFord Studio editor.
 *
 * All functions here are side-effect free and unit-tested. They define how
 * editor times map to the snap grid and to vertical canvas pixels, and the
 * left→right column order of instrument lanes.
 */
import type { RlrrBpmEvent } from '@/types/song'
import { getCurrentBpm } from '@/components/highway/highway-renderer'
import { DEFAULT_LANES, DEFAULT_CLASS_TO_LANE } from '@/lib/default-kit'
import type { SnapValue } from '@studio/types'

// Re-export the single shared SnapValue definition so callers can import it
// from the grid module too (the union itself lives in studio/src/types.ts).
export type { SnapValue }

/**
 * Vertical fraction of the canvas where the playhead (= `currentTime`) sits.
 * Matches the player's hit line (`HIT_LINE_Y_RATIO`) so the editor and the
 * preview highway feel consistent.
 */
export const PLAYHEAD_Y_RATIO = 0.85

/**
 * Seconds spanned by one grid subdivision at a given tempo.
 *   '1/4'  → 60/bpm (quarter note)
 *   '1/8'  → 30/bpm (eighth)
 *   '1/16' → 15/bpm (sixteenth)
 *   '1/8T' → (60/bpm)/3 (eighth-note triplet: three per quarter note)
 */
export function subdivisionSeconds(snap: SnapValue, bpm: number): number {
  const quarter = 60 / bpm
  switch (snap) {
    case '1/4':
      return quarter
    case '1/8':
      return quarter / 2
    case '1/16':
      return quarter / 4
    case '1/8T':
      return quarter / 3
  }
}

/**
 * Snap `time` (seconds) to the nearest grid line for `snap`, using the tempo
 * in effect at that time (so snapping stays correct across tempo changes).
 */
export function snapTime(time: number, snap: SnapValue, bpmEvents: RlrrBpmEvent[]): number {
  const bpm = getCurrentBpm(time, bpmEvents)
  const sub = subdivisionSeconds(snap, bpm)
  return Math.round(time / sub) * sub
}

/**
 * Map an absolute `time` (seconds) to a vertical pixel position.
 *
 * Convention: `currentTime` sits at the fixed playhead line
 * (`PLAYHEAD_Y_RATIO * height`). FUTURE time (`time > currentTime`) is ABOVE
 * the playhead (smaller y); EARLIER time is BELOW (larger y). Notes therefore
 * scroll downward toward the playhead as `currentTime` advances — matching the
 * player's top-down highway. Exactly invertible by `yToTime`.
 */
export function timeToY(time: number, currentTime: number, pxPerSec: number, height: number): number {
  const playheadY = PLAYHEAD_Y_RATIO * height
  return playheadY - (time - currentTime) * pxPerSec
}

/** Exact inverse of {@link timeToY}: pixel `y` → absolute time (seconds). */
export function yToTime(y: number, currentTime: number, pxPerSec: number, height: number): number {
  const playheadY = PLAYHEAD_Y_RATIO * height
  return currentTime + (playheadY - y) / pxPerSec
}

/**
 * One representative instrument CLASS per non-kick lane, chosen by lane id.
 * Picks the natural "base" class so the column header reads sensibly; any
 * lane without an explicit pick falls back to the first class in
 * DEFAULT_CLASS_TO_LANE that routes to it.
 */
const LANE_REPRESENTATIVE_CLASS: Record<string, string> = {
  hihat: 'BP_HiHat_C',
  snare: 'BP_Snare_C',
  crash: 'BP_Crash17_C',
  tom1: 'BP_Tom1_C',
  tom2: 'BP_Tom2_C',
  ride: 'BP_Ride_C',
  floorTom: 'BP_FloorTom_C',
}

/**
 * The editor's left→right column order of instrument CLASSES.
 *
 * Ordering source: `DEFAULT_LANES` from `@/lib/default-kit` (the kit's
 * canonical display order). The kick is rendered as a full-width band rather
 * than a column, so `BP_Kick_C` / the 'kick' lane is EXCLUDED. Each remaining
 * lane is represented by one class (see LANE_REPRESENTATIVE_CLASS, with a
 * DEFAULT_CLASS_TO_LANE fallback), de-duplicated, preserving lane order.
 */
export function laneOrder(): string[] {
  const classes: string[] = []
  for (const lane of DEFAULT_LANES) {
    if (lane.id === 'kick') continue // full-width band, not a column
    const cls =
      LANE_REPRESENTATIVE_CLASS[lane.id] ??
      Object.keys(DEFAULT_CLASS_TO_LANE).find((c) => DEFAULT_CLASS_TO_LANE[c] === lane.id)
    if (cls && !classes.includes(cls)) classes.push(cls)
  }
  return classes
}
