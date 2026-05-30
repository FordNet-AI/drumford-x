/**
 * Note ↔ pixel geometry shared by the editor canvas (drawing) and the pointer
 * interaction hook (hit-testing / marquee). Keeping ONE copy here means the
 * thing you click is exactly the thing that was drawn — and the math is
 * unit-testable without a DOM.
 *
 * Depends only on the pure layout + grid helpers and the kit resolver.
 */
import { DEFAULT_KIT, resolveInstrumentLane } from '@/lib/default-kit'
import type { StudioNote } from '@studio/types'
import { editorTimeToY, laneOrder } from './grid'
import { columnForClass, isInKickGutter, type EditorLayout } from './editor-layout'

/** Default vertical hit tolerance for a note, in CSS px. */
export const NOTE_HIT_H = 14

/** Resolve a note's lane id once (kept tiny; callers are hot). */
function laneIdOf(instrumentClass: string): string | null {
  return resolveInstrumentLane(instrumentClass, DEFAULT_KIT.instrumentOverrides)
}

export function isKickClass(instrumentClass: string): boolean {
  return laneIdOf(instrumentClass) === 'kick'
}

/**
 * The representative `laneOrder()` column class a note belongs to. Notes whose
 * class resolves to the same lane as a column (e.g. BP_Crash18_C → crash) land
 * in that column. Falls back to the note's own class if nothing matches.
 */
const columnClassCache = new Map<string, string>()
export function columnClassFor(instrumentClass: string): string {
  const cached = columnClassCache.get(instrumentClass)
  if (cached !== undefined) return cached
  const laneId = laneIdOf(instrumentClass)
  let result = instrumentClass
  if (laneId) {
    for (const colClass of laneOrder()) {
      if (laneIdOf(colClass) === laneId) {
        result = colClass
        break
      }
    }
  }
  columnClassCache.set(instrumentClass, result)
  return result
}

/** Canvas y (CSS px) for an absolute note time, accounting for the header band. */
export function noteY(
  time: number,
  layout: EditorLayout,
  viewStartTime: number,
  pxPerSec: number,
): number {
  return layout.headerH + editorTimeToY(time, viewStartTime, pxPerSec)
}

/**
 * Center x (CSS px) where a note of `instrumentClass` is drawn: kick notes span
 * the full lane area (center = lane mid), others center on their column. Returns
 * -1 if the class has no column (shouldn't happen for resolved notes).
 */
export function noteCenterX(instrumentClass: string, layout: EditorLayout): number {
  if (isKickClass(instrumentClass)) return layout.laneLeft + layout.laneWidth / 2
  return columnForClass(layout, columnClassFor(instrumentClass))?.cx ?? -1
}

/**
 * Hit-test: is canvas pixel (px, py) on `note`? Kick = full-width bar (or its
 * gutter marker); others = within their column. `py` must already be in canvas
 * space (header included).
 */
export function hitNote(
  note: StudioNote,
  px: number,
  py: number,
  layout: EditorLayout,
  viewStartTime: number,
  pxPerSec: number,
  tol: number = NOTE_HIT_H,
): boolean {
  const y = noteY(note.time, layout, viewStartTime, pxPerSec)
  if (Math.abs(py - y) > tol / 2) return false
  if (isKickClass(note.instrumentClass)) {
    if (px >= layout.laneLeft && px <= layout.laneLeft + layout.laneWidth) return true
    return isInKickGutter(layout, px)
  }
  const col = columnForClass(layout, columnClassFor(note.instrumentClass))
  return !!col && px >= col.x && px <= col.x + col.width
}

/** Topmost note (last in array wins) under (px, py), or null. */
export function topNoteAt(
  px: number,
  py: number,
  notes: StudioNote[],
  layout: EditorLayout,
  viewStartTime: number,
  pxPerSec: number,
): StudioNote | null {
  if (py < layout.headerH) return null
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i]!
    if (hitNote(n, px, py, layout, viewStartTime, pxPerSec)) return n
  }
  return null
}

/**
 * The note to edit when the velocity ribbon is grabbed at canvas y `py`.
 *
 * The ribbon is a single column, so we pick purely by vertical proximity. When
 * several notes share a y, prefer a SELECTED one (so the user edits the note
 * they just clicked), else the topmost (last in array). Returns null if no note
 * is within `tol`/2 of `py`.
 */
export function ribbonNoteAt(
  py: number,
  notes: StudioNote[],
  selection: ReadonlySet<string>,
  layout: EditorLayout,
  viewStartTime: number,
  pxPerSec: number,
  tol: number = NOTE_HIT_H,
): StudioNote | null {
  if (py < layout.headerH) return null
  let best: StudioNote | null = null
  let bestSelected = false
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i]!
    const y = noteY(n.time, layout, viewStartTime, pxPerSec)
    if (Math.abs(py - y) > tol / 2) continue
    const sel = selection.has(n.id)
    // First match wins (topmost); a selected match upgrades over a non-selected.
    if (best === null) {
      best = n
      bestSelected = sel
    } else if (sel && !bestSelected) {
      best = n
      bestSelected = true
    }
  }
  return best
}

/** Rectangle in canvas px (corners in any order). */
export interface PixelRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * Is `note` inside the marquee `rect`? Non-kick notes test their drawn center;
 * kick notes (full-width) test horizontal overlap with the lane area + their y.
 */
export function noteInRect(
  note: StudioNote,
  rect: PixelRect,
  layout: EditorLayout,
  viewStartTime: number,
  pxPerSec: number,
): boolean {
  const y = noteY(note.time, layout, viewStartTime, pxPerSec)
  const xMin = Math.min(rect.x0, rect.x1)
  const xMax = Math.max(rect.x0, rect.x1)
  const yMin = Math.min(rect.y0, rect.y1)
  const yMax = Math.max(rect.y0, rect.y1)
  if (y < yMin || y > yMax) return false
  if (isKickClass(note.instrumentClass)) {
    return xMax >= layout.laneLeft && xMin <= layout.laneLeft + layout.laneWidth
  }
  const cx = columnForClass(layout, columnClassFor(note.instrumentClass))?.cx ?? -1
  return cx >= xMin && cx <= xMax
}
