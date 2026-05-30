import { create } from 'zustand'

/**
 * Editor VIEW state — zoom + vertical scroll for the piano-roll editor.
 *
 * This is deliberately a separate, studio-local store and NOT part of
 * `useStudioStore`: zoom/scroll are view state, not chart data, so they must
 * never enter the undo/redo (zundo) history. The canvas subscribes to this
 * store directly for imperative redraws (mirroring the Preview's direct-draw
 * pattern) since headless/hidden pages suspend rAF.
 *
 * Coordinate model (see `studio/src/lib/grid.ts` editorTimeToY/editorYToTime):
 * EARLIER time at the TOP, LATER below. `viewStartTime` is the time at the top
 * edge of the lane area; `pxPerSec` is the vertical zoom.
 */
export interface EditorViewState {
  /** Vertical zoom: pixels per second. Default 120. */
  pxPerSec: number
  /** Time (seconds) at the top edge of the lane area — the scroll offset. */
  viewStartTime: number

  setZoom: (pxPerSec: number) => void
  setViewStartTime: (t: number) => void
  /**
   * Multiply zoom by `factor`, optionally keeping the time under `anchorTime`
   * pinned at the same pixel y (so wheel-zoom feels anchored at the cursor).
   * `anchorY` is the pixel offset of that anchor from the top of the lane area.
   */
  zoomBy: (factor: number, anchorTime?: number, anchorY?: number) => void
  /** Scroll by `dySeconds` seconds (positive scrolls toward later time). */
  scrollBy: (dySeconds: number) => void
  /** Reset to defaults (used when a new chart loads). */
  reset: () => void
}

const MIN_PX_PER_SEC = 20
const MAX_PX_PER_SEC = 1200
const DEFAULT_PX_PER_SEC = 120

const clampZoom = (v: number): number => Math.min(MAX_PX_PER_SEC, Math.max(MIN_PX_PER_SEC, v))

export const useEditorView = create<EditorViewState>()((set, get) => ({
  pxPerSec: DEFAULT_PX_PER_SEC,
  viewStartTime: 0,

  setZoom: (pxPerSec) => set({ pxPerSec: clampZoom(pxPerSec) }),
  setViewStartTime: (t) => set({ viewStartTime: Math.max(0, t) }),

  zoomBy: (factor, anchorTime, anchorY) => {
    const { pxPerSec } = get()
    const next = clampZoom(pxPerSec * factor)
    if (anchorTime === undefined || anchorY === undefined) {
      set({ pxPerSec: next })
      return
    }
    // Keep anchorTime fixed at anchorY: anchorY = (anchorTime - viewStart) * pps.
    // Solve for the new viewStart so the same pixel maps to the same time.
    const newViewStart = anchorTime - anchorY / next
    set({ pxPerSec: next, viewStartTime: Math.max(0, newViewStart) })
  },

  scrollBy: (dySeconds) =>
    set((s) => ({ viewStartTime: Math.max(0, s.viewStartTime + dySeconds) })),

  reset: () => set({ pxPerSec: DEFAULT_PX_PER_SEC, viewStartTime: 0 }),
}))
