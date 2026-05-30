/**
 * Pure geometry for the piano-roll editor canvas.
 *
 * The renderer (`editor-canvas.tsx`) AND the pointer interaction handlers
 * (add/select/move) must agree pixel-for-pixel on where each column lives and
 * which class a given x maps to — so that logic lives here, side-effect free
 * and unit-testable, rather than being duplicated in the component.
 *
 * Horizontal layout (left → right), all in CSS pixels:
 *   [ ruler | kick gutter | lane columns … | velocity ribbon ]
 * Vertical: a fixed header band at the top (column labels), then the scrollable
 * lane area below it. Time runs vertically in the lane area via the editor
 * scroll model (see grid.ts editorTimeToY/editorYToTime), measured from the top
 * of the lane area (NOT the top of the canvas — subtract HEADER_H first).
 *
 * The velocity ribbon (Task 15) is a fixed-width strip on the RIGHT edge: each
 * visible note draws a short horizontal bar there whose length ∝ vel, and a
 * horizontal drag in the strip edits that note's velocity.
 */
import { laneOrder } from './grid'

export const RULER_W = 46
export const KICK_W = 22
export const HEADER_H = 24
/** Width (px) of the right-edge velocity ribbon strip. */
export const RIBBON_W = 70

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
  /** Total width of the lane columns area (excludes the ribbon strip). */
  laneWidth: number
  /** Per-column geometry, left→right, in laneOrder() order. */
  columns: EditorColumn[]
  /** Left edge x of the velocity ribbon strip. */
  ribbonX: number
  /** Width (px) of the velocity ribbon strip. */
  ribbonW: number
}

/**
 * Compute the editor layout for a given canvas width. `classes` defaults to
 * `laneOrder()`; pass an explicit list only for testing.
 *
 * The right-edge velocity ribbon claims `RIBBON_W` px (when the canvas is wide
 * enough); the lane columns fill what's left between the kick gutter and the
 * ribbon. On very narrow canvases the ribbon collapses so the lanes never go
 * negative.
 */
export function computeLayout(width: number, classes: string[] = laneOrder()): EditorLayout {
  const laneLeft = RULER_W + KICK_W
  // Reserve the ribbon strip only if there's room for at least a sliver of lane.
  const ribbonW = width - laneLeft > RIBBON_W + 40 ? RIBBON_W : 0
  const laneWidth = Math.max(0, width - laneLeft - ribbonW)
  const ribbonX = laneLeft + laneWidth
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
    ribbonX,
    ribbonW,
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

/** Inner horizontal padding (px) of the ribbon bars within the strip. */
export const RIBBON_PAD = 6

/** True if pixel `x` is inside the velocity ribbon strip (and the strip exists). */
export function isInRibbon(layout: EditorLayout, x: number): boolean {
  return layout.ribbonW > 0 && x >= layout.ribbonX && x <= layout.ribbonX + layout.ribbonW
}

/**
 * Pixel length of a ribbon bar for `vel` (1..127): 0 → empty, 127 → full inner
 * width. Used by the renderer to draw the bar. Returns 0 when there's no ribbon.
 */
export function ribbonBarLength(layout: EditorLayout, vel: number): number {
  const inner = Math.max(0, layout.ribbonW - RIBBON_PAD * 2)
  const v = Math.min(127, Math.max(0, vel))
  return (v / 127) * inner
}

/**
 * Inverse of {@link ribbonBarLength}: map a pixel `x` inside the ribbon to a
 * velocity in 1..127 (clamped). The bar starts at `ribbonX + RIBBON_PAD`.
 */
export function ribbonXToVel(layout: EditorLayout, x: number): number {
  const inner = Math.max(1, layout.ribbonW - RIBBON_PAD * 2)
  const frac = (x - (layout.ribbonX + RIBBON_PAD)) / inner
  const vel = Math.round(frac * 127)
  return Math.min(127, Math.max(1, vel))
}

/** Look up the column for a given instrument class, or undefined. */
export function columnForClass(
  layout: EditorLayout,
  instrumentClass: string,
): EditorColumn | undefined {
  return layout.columns.find((c) => c.instrumentClass === instrumentClass)
}
