import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { editorYToTime, snapTime } from '@studio/lib/grid'
import {
  columnIndexAtX,
  isInKickGutter,
  isInRibbon,
  ribbonXToVel,
  type EditorLayout,
} from '@studio/lib/editor-layout'
import {
  isKickClass,
  columnClassFor,
  topNoteAt,
  ribbonNoteAt,
  noteInRect,
  type PixelRect,
} from '@studio/lib/editor-geometry'
import { useStudioStore } from '@studio/stores/studio-store'
import { useEditorView } from '@studio/stores/editor-view-store'
import { usePlaybackStore } from '@studio/stores/playback-store'

/** Live marquee rectangle, in canvas CSS pixels. */
export interface Marquee {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * Live drag preview, applied VISUALLY by the canvas during a move drag. The
 * store is left untouched until drop, so the whole drag commits as a single
 * `moveNotes` call → exactly one undo step (Task 13).
 */
export interface DragPreview {
  ids: Set<string>
  dt: number
  dLaneClass: string | null
}

/**
 * Live velocity-edit preview, applied VISUALLY by the ribbon while dragging.
 * The store is only written on drop → one `setVelocity` = one undo step.
 */
export interface VelPreview {
  id: string
  vel: number
}

const DRAG_THRESHOLD = 4 // px before a press becomes a drag

/* Note hit-testing / marquee geometry lives in @studio/lib/editor-geometry so
 * the canvas draws and this hook hit-tests with the SAME math. */

/* ── gesture state ───────────────────────────────────────────────────── */

type Gesture =
  | { kind: 'idle' }
  | {
      kind: 'press-note'
      anchorId: string
      anchorTime0: number
      anchorClass0: string
      startX: number
      startY: number
      moved: boolean
    }
  | { kind: 'marquee'; startX: number; startY: number }
  | { kind: 'vel-drag'; noteId: string }

export interface UseEditorInteractionsArgs {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  getLayout: () => EditorLayout
}

/**
 * All pointer interactions for the editor canvas: add (Task 11), select +
 * marquee (Task 12), move (Task 13).
 *
 * Move strategy: the store is NOT mutated during a drag. The canvas renders the
 * selection shifted by `dragPreview`; on drop we issue ONE `moveNotes` with the
 * net delta → a single undo step. Add/select are immediate single store calls.
 */
export function useEditorInteractions({ canvasRef, getLayout }: UseEditorInteractionsArgs) {
  const gestureRef = useRef<Gesture>({ kind: 'idle' })
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
  const [velPreview, setVelPreview] = useState<VelPreview | null>(null)

  const localXY = useCallback(
    (e: ReactPointerEvent): { x: number; y: number } => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    },
    [canvasRef],
  )

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const { x, y } = localXY(e)
      const layout = getLayout()
      const store = useStudioStore.getState()
      const chart = store.chart
      if (!chart) return
      const { viewStartTime, pxPerSec } = useEditorView.getState()
      if (y < layout.headerH) return // header band: ignore

      // Time ruler (left strip): click to seek the shared playback clock. This
      // moves Preview's transport too (same playback-store). Unsnapped — a seek
      // doesn't need to land on the grid. No gesture starts.
      if (x < layout.rulerW) {
        const t = editorYToTime(y - layout.headerH, viewStartTime, pxPerSec)
        usePlaybackStore.getState().seek(Math.max(0, t))
        gestureRef.current = { kind: 'idle' }
        return
      }

      canvas.setPointerCapture(e.pointerId)

      // Velocity ribbon (right strip): grab the note at this y and start a
      // velocity drag. Editing is previewed live; committed once on drop.
      if (isInRibbon(layout, x)) {
        const note = ribbonNoteAt(y, chart.notes, new Set(store.selection), layout, viewStartTime, pxPerSec)
        if (note) {
          gestureRef.current = { kind: 'vel-drag', noteId: note.id }
          setVelPreview({ id: note.id, vel: ribbonXToVel(layout, x) })
        } else {
          gestureRef.current = { kind: 'idle' }
        }
        return
      }

      const hit = topNoteAt(x, y, chart.notes, layout, viewStartTime, pxPerSec)
      const additive = e.shiftKey

      if (hit) {
        const sel = store.selection
        if (additive) {
          const next = sel.includes(hit.id) ? sel.filter((id) => id !== hit.id) : [...sel, hit.id]
          store.setSelection(next)
        } else if (!sel.includes(hit.id)) {
          store.setSelection([hit.id])
        }
        gestureRef.current = {
          kind: 'press-note',
          anchorId: hit.id,
          anchorTime0: hit.time,
          anchorClass0: hit.instrumentClass,
          startX: x,
          startY: y,
          moved: false,
        }
      } else {
        gestureRef.current = { kind: 'marquee', startX: x, startY: y }
        setMarquee({ x0: x, y0: y, x1: x, y1: y })
      }
    },
    [canvasRef, localXY, getLayout],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const g = gestureRef.current
      const { x, y } = localXY(e)
      const layout = getLayout()
      const store = useStudioStore.getState()
      const chart = store.chart

      // Idle hover: hint the ribbon (resize) and the ruler (seek pointer).
      if (g.kind === 'idle') {
        const canvas = canvasRef.current
        if (canvas) {
          let cursor = 'crosshair'
          if (chart && y >= layout.headerH) {
            if (x < layout.rulerW) cursor = 'pointer' // ruler → click to seek
            else if (isInRibbon(layout, x)) cursor = 'ew-resize' // ribbon → drag vel
          }
          canvas.style.cursor = cursor
        }
        return
      }
      if (!chart) return
      const { pxPerSec } = useEditorView.getState()

      if (g.kind === 'marquee') {
        setMarquee({ x0: g.startX, y0: g.startY, x1: x, y1: y })
        return
      }

      if (g.kind === 'vel-drag') {
        setVelPreview({ id: g.noteId, vel: ribbonXToVel(layout, x) })
        return
      }

      // press-note → drag?
      const dx = x - g.startX
      const dy = y - g.startY
      if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      g.moved = true

      // Net time delta from the anchor's ORIGINAL time, snapped.
      const targetTimeRaw = Math.max(0, g.anchorTime0 + dy / pxPerSec)
      const snappedTarget = snapTime(targetTimeRaw, store.snap, chart.bpmEvents)
      const dt = snappedTarget - g.anchorTime0

      // Cross-column class change (non-kick anchors only).
      let dLaneClass: string | null = null
      if (!isKickClass(g.anchorClass0)) {
        const colIdx = columnIndexAtX(layout, x)
        if (colIdx >= 0) {
          const colClass = layout.columns[colIdx]!.instrumentClass
          if (colClass !== columnClassFor(g.anchorClass0)) dLaneClass = colClass
        }
      }

      const ids = store.selection.length ? store.selection : [g.anchorId]
      setDragPreview({ ids: new Set(ids), dt, dLaneClass })
    },
    [canvasRef, localXY, getLayout],
  )

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      const g = gestureRef.current
      const canvas = canvasRef.current
      if (canvas?.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
      gestureRef.current = { kind: 'idle' }

      const { x, y } = localXY(e)
      const layout = getLayout()
      const store = useStudioStore.getState()
      const chart = store.chart
      if (!chart) {
        setMarquee(null)
        setDragPreview(null)
        setVelPreview(null)
        return
      }
      const { viewStartTime, pxPerSec } = useEditorView.getState()

      if (g.kind === 'vel-drag') {
        // Commit the final velocity as ONE setVelocity → a single undo step.
        const preview = velPreviewRef.current
        if (preview) store.setVelocity([preview.id], preview.vel)
        setVelPreview(null)
        return
      }

      if (g.kind === 'marquee') {
        const dragged = Math.hypot(x - g.startX, y - g.startY) >= DRAG_THRESHOLD
        if (dragged) {
          const m: PixelRect = { x0: g.startX, y0: g.startY, x1: x, y1: y }
          const ids = chart.notes
            .filter((n) => noteInRect(n, m, layout, viewStartTime, pxPerSec))
            .map((n) => n.id)
          store.setSelection(ids)
        } else {
          // plain empty-space click → clear selection + add a note
          store.clearSelection()
          addNoteAt(x, y, layout, viewStartTime, pxPerSec)
        }
        setMarquee(null)
        return
      }

      if (g.kind === 'press-note' && g.moved) {
        // Commit the whole drag as ONE moveNotes → a single undo step.
        const preview = dragPreviewRef.current
        if (preview && (preview.dt !== 0 || preview.dLaneClass)) {
          store.moveNotes([...preview.ids], {
            dt: preview.dt,
            ...(preview.dLaneClass ? { dLaneClass: preview.dLaneClass } : {}),
          })
        }
      }
      setDragPreview(null)
      setMarquee(null)
    },
    [canvasRef, localXY, getLayout],
  )

  const onPointerCancel = useCallback(
    (e: ReactPointerEvent) => {
      const canvas = canvasRef.current
      if (canvas?.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
      gestureRef.current = { kind: 'idle' }
      setMarquee(null)
      setDragPreview(null)
      setVelPreview(null)
    },
    [canvasRef],
  )

  // Double-click a note to delete it (one undo step). Hit-tests the same way as
  // pointer-down; if a note is under the cursor it's removed and dropped from the
  // selection. Double-clicking empty space does nothing here (the two single
  // clicks add/select, and addNoteAt dedupes so no duplicate can stack).
  const onDoubleClick = useCallback(
    (e: ReactMouseEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const layout = getLayout()
      const store = useStudioStore.getState()
      const chart = store.chart
      if (!chart || y < layout.headerH) return
      const { viewStartTime, pxPerSec } = useEditorView.getState()
      const hit = topNoteAt(x, y, chart.notes, layout, viewStartTime, pxPerSec)
      if (!hit) return
      store.deleteNotes([hit.id])
      const sel = store.selection
      if (sel.includes(hit.id)) store.setSelection(sel.filter((id) => id !== hit.id))
    },
    [canvasRef, getLayout],
  )

  // Keep ref mirrors so pointerup reads the latest values synchronously.
  const dragPreviewRef = useRef<DragPreview | null>(null)
  dragPreviewRef.current = dragPreview
  const velPreviewRef = useRef<VelPreview | null>(null)
  velPreviewRef.current = velPreview

  const handlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onDoubleClick,
  }

  return { marquee, dragPreview, velPreview, handlers }
}

/* ── add-note helper (single store call) ─────────────────────────────── */

function addNoteAt(
  x: number,
  y: number,
  layout: EditorLayout,
  viewStartTime: number,
  pxPerSec: number,
): void {
  const store = useStudioStore.getState()
  const chart = store.chart
  if (!chart) return
  if (y < layout.headerH) return
  const t = editorYToTime(y - layout.headerH, viewStartTime, pxPerSec)
  if (t < 0) return
  const snapped = snapTime(t, store.snap, chart.bpmEvents)

  let instrumentClass: string
  if (isInKickGutter(layout, x)) {
    instrumentClass = 'BP_Kick_C'
  } else {
    const colIdx = columnIndexAtX(layout, x)
    if (colIdx < 0) return
    instrumentClass = layout.columns[colIdx]!.instrumentClass
  }

  // Dedupe: never stack a second identical hit (same lane + same snapped time).
  // If one already exists there, select it instead of adding a duplicate. This
  // also makes a stray double-click on empty space a no-op rather than two
  // overlapping notes.
  const existing = chart.notes.find(
    (n) => n.instrumentClass === instrumentClass && Math.abs(n.time - snapped) < 1e-3,
  )
  if (existing) {
    store.setSelection([existing.id])
    return
  }
  store.addNote({ time: snapped, instrumentClass, vel: 100 })
}
