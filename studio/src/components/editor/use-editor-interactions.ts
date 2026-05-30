import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { editorYToTime, snapTime } from '@studio/lib/grid'
import {
  columnIndexAtX,
  isInKickGutter,
  type EditorLayout,
} from '@studio/lib/editor-layout'
import {
  isKickClass,
  columnClassFor,
  topNoteAt,
  noteInRect,
  type PixelRect,
} from '@studio/lib/editor-geometry'
import { useStudioStore } from '@studio/stores/studio-store'
import { useEditorView } from '@studio/stores/editor-view-store'

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

      canvas.setPointerCapture(e.pointerId)
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
      if (g.kind === 'idle') return
      const { x, y } = localXY(e)
      const layout = getLayout()
      const store = useStudioStore.getState()
      const chart = store.chart
      if (!chart) return
      const { pxPerSec } = useEditorView.getState()

      if (g.kind === 'marquee') {
        setMarquee({ x0: g.startX, y0: g.startY, x1: x, y1: y })
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
    [localXY, getLayout],
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
        return
      }
      const { viewStartTime, pxPerSec } = useEditorView.getState()

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
    },
    [canvasRef],
  )

  // Keep a ref mirror of dragPreview so pointerup reads the latest synchronously.
  const dragPreviewRef = useRef<DragPreview | null>(null)
  dragPreviewRef.current = dragPreview

  const handlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  }

  return { marquee, dragPreview, handlers }
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

  if (isInKickGutter(layout, x)) {
    store.addNote({ time: snapped, instrumentClass: 'BP_Kick_C', vel: 100 })
    return
  }
  const colIdx = columnIndexAtX(layout, x)
  if (colIdx < 0) return
  store.addNote({ time: snapped, instrumentClass: layout.columns[colIdx]!.instrumentClass, vel: 100 })
}
