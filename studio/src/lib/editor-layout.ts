/**
 * Pure geometry for the piano-roll editor canvas.
 *
 * The renderer (`editor-canvas.tsx`) AND the pointer interaction handlers
 * (add/select/move) must agree pixel-for-pixel on where each column lives and
 * which class a given x maps to — so that logic lives here, side-effect free
 * and unit-testable, rather than being duplicated in the component.
 *
 * Horizontal layout (left → right), all in CSS pixels:
 *   [ ruler | kick gutter | lane columns … ]
 * Vertical: a fixed header band at the top (column labels), then the scrollable
 * lane area below it. Time runs vertically in the lane area via the editor
 * scroll model (see grid.ts editorTimeToY/editorYToTime), measured from the top
 * of the lane area (NOT the top of the canvas — subtract HEADER_H first).
 */
import { laneOrder } from './grid'

export const RULER_W = 46
export const KICK_W = 22
export const HEADER_H = 24

/** A laid-out column: its instrument class + horizontal extent (CSS px). */
export interface EditorColumn {
  /** Representative instrument class for this column (from laneOrder()). */
  instrumentClass: string
  /** Left edge x (px). */
  x: number
  /** Column width (px). */
  width: number
  /** Center x (px) — where notes/labels are centered. */
  cx: number
}

export interface EditorLayout {
  rulerW: number
  kickX: number
  kickW: number
  headerH: number
  /** Left edge of the lane area (= rulerW + kickW). */
  laneLeft: number
  /** Total width of the lane columns area. */
  laneWidth: number
  /** Per-column geometry, left→right, in laneOrder() order. */
  columns: EditorColumn[]
}

/**
 * Compute the editor layout for a given canvas width. `classes` defaults to
 * `laneOrder()`; pass an explicit list only for testing.
 */
export function computeLayout(width: number, classes: string[] = laneOrder()): EditorLayout {
  const laneLeft = RULER_W + KICK_W
  const laneWidth = Math.max(0, width - laneLeft)
  const n = Math.max(1, classes.length)
  const colW = laneWidth / n
  const columns: EditorColumn[] = classes.map((instrumentClass, i) => {
    const x = laneLeft + i * colW
    return { instrumentClass, x, width: colW, cx: x + colW / 2 }
  })
  return {
    rulerW: RULER_W,
    kickX: RULER_W,
    kickW: KICK_W,
    headerH: HEADER_H,
    laneLeft,
    laneWidth,
    columns,
  }
}

/**
 * Which column index contains pixel `x`, or -1 if `x` is outside the lane area
 * (e.g. over the ruler or kick gutter).
 */
export function columnIndexAtX(layout: EditorLayout, x: number): number {
  if (x < layout.laneLeft) return -1
  if (layout.columns.length === 0) return -1
  const idx = Math.floor((x - layout.laneLeft) / (layout.laneWidth / layout.columns.length))
  if (idx < 0 || idx >= layout.columns.length) return -1
  return idx
}

/** True if pixel `x` is inside the kick gutter strip. */
export function isInKickGutter(layout: EditorLayout, x: number): boolean {
  return x >= layout.kickX && x < layout.kickX + layout.kickW
}

/** Look up the column for a given instrument class, or undefined. */
export function columnForClass(
  layout: EditorLayout,
  instrumentClass: string,
): EditorColumn | undefined {
  return layout.columns.find((c) => c.instrumentClass === instrumentClass)
}
