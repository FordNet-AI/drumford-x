import { useEffect, useRef } from 'react'
import { ZoomIn, ZoomOut, ChevronUp, ChevronDown } from 'lucide-react'
import type { SnapValue } from '@studio/types'
import { editorYToTime, snapTime } from '@studio/lib/grid'
import { computeLayout } from '@studio/lib/editor-layout'
import { useStudioStore } from '@studio/stores/studio-store'
import { useEditorView } from '@studio/stores/editor-view-store'
import { usePlaybackStore } from '@studio/stores/playback-store'
import { copyNotesToClipboard, getClipboard, hasClipboard } from '@studio/lib/editor-clipboard'
import { EditorCanvas } from './editor-canvas'

const SNAP_OPTIONS: SnapValue[] = ['1/4', '1/8', '1/16', '1/8T']
const ZOOM_STEP = 1.25
const WHEEL_ZOOM_STEP = 1.1

/** Snapshot the current selection into the editor clipboard (no undo entry). */
function copySelection(): void {
  const store = useStudioStore.getState()
  const chart = store.chart
  if (!chart) return
  const selected = chart.notes.filter((n) => store.selection.includes(n.id))
  copyNotesToClipboard(selected)
}

/**
 * Paste the clipboard anchored at the current playhead time. Each note's
 * relative offset is added to the anchor and snapped via the active `snap`, then
 * the whole batch is inserted with `addNotes` (ONE undo step) and selected.
 */
function pasteAtPlayhead(): void {
  const store = useStudioStore.getState()
  const chart = store.chart
  if (!chart || !hasClipboard()) return
  const anchor = usePlaybackStore.getState().currentTime
  const toAdd = getClipboard().map((c) => ({
    time: snapTime(Math.max(0, anchor + c.dt), store.snap, chart.bpmEvents),
    instrumentClass: c.instrumentClass,
    vel: c.vel,
    ...(c.duration !== undefined ? { duration: c.duration } : {}),
  }))
  const ids = store.addNotes(toAdd)
  store.setSelection(ids)
}

/**
 * Editor wrapper: a thin toolbar (snap, zoom, scroll) above the piano-roll
 * canvas. Owns the wheel handler (non-passive so it can preventDefault) and the
 * editor keyboard shortcuts (undo/redo, Esc, Delete).
 *
 * Zoom/scroll live in the editor-view store (NOT the undo-tracked studio
 * store). Wheel scrolls by default and zooms with Ctrl/Cmd held, anchored at
 * the cursor.
 */
export function EditorGrid() {
  const wrapperRef = useRef<HTMLDivElement>(null)

  const snap = useStudioStore((s) => s.snap)
  const setSnap = useStudioStore((s) => s.setSnap)
  const pxPerSec = useEditorView((s) => s.pxPerSec)
  const zoomBy = useEditorView((s) => s.zoomBy)
  const scrollBy = useEditorView((s) => s.scrollBy)

  /* wheel: scroll, or ctrl/meta-zoom anchored at cursor (non-passive) */
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      // Only act when the pointer is over the canvas region of the wrapper.
      e.preventDefault()
      const view = useEditorView.getState()
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect()
        const layout = computeLayout(rect.width)
        const yInCanvas = e.clientY - rect.top
        const anchorY = yInCanvas - layout.headerH
        const anchorTime = editorYToTime(anchorY, view.viewStartTime, view.pxPerSec)
        const factor = e.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP
        view.zoomBy(factor, anchorTime, anchorY)
      } else {
        // scroll: one notch ≈ deltaY pixels worth of time
        view.scrollBy(e.deltaY / view.pxPerSec)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  /* keyboard: undo/redo, clear selection, delete */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in a form control.
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
        return
      }
      const mod = e.ctrlKey || e.metaKey
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        if (e.shiftKey) useStudioStore.temporal.getState().redo()
        else useStudioStore.temporal.getState().undo()
        return
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault()
        useStudioStore.temporal.getState().redo()
        return
      }
      // Copy / Cut / Paste (Ctrl or Cmd).
      if (mod && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault()
        copySelection()
        return
      }
      if (mod && (e.key === 'x' || e.key === 'X')) {
        // Cut = copy + delete the originals (one delete = one undo step).
        const sel = useStudioStore.getState().selection
        if (sel.length) {
          e.preventDefault()
          copySelection()
          useStudioStore.getState().deleteNotes(sel)
          useStudioStore.getState().clearSelection()
        }
        return
      }
      if (mod && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault()
        pasteAtPlayhead()
        return
      }
      if (e.key === 'Escape') {
        useStudioStore.getState().clearSelection()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = useStudioStore.getState().selection
        if (sel.length) {
          e.preventDefault()
          useStudioStore.getState().deleteNotes(sel)
          useStudioStore.getState().clearSelection()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full flex-col">
      {/* toolbar */}
      <div className="flex items-center gap-3 border-b border-[#1a1a2e] bg-[#0d1424] px-4 py-2">
        <label className="flex items-center gap-1.5 text-xs text-[#8a93a8]">
          Snap
          <select
            value={snap}
            onChange={(e) => setSnap(e.target.value as SnapValue)}
            className="rounded border border-[#1a1a2e] bg-[#050508] px-2 py-1 text-xs text-[#ffffffcc]"
            aria-label="Snap resolution"
          >
            {SNAP_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <div className="mx-1 h-5 w-px bg-[#1a1a2e]" />

        <div className="flex items-center gap-1">
          <button
            onClick={() => zoomBy(1 / ZOOM_STEP)}
            className="flex h-7 w-7 items-center justify-center rounded border border-[#1a1a2e] bg-[#050508] text-[#aab] transition-colors hover:bg-[#11192c]"
            aria-label="Zoom out"
            title="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          <span className="w-16 text-center font-mono text-[11px] tabular-nums text-[#8a93a8]">
            {Math.round(pxPerSec)} px/s
          </span>
          <button
            onClick={() => zoomBy(ZOOM_STEP)}
            className="flex h-7 w-7 items-center justify-center rounded border border-[#1a1a2e] bg-[#050508] text-[#aab] transition-colors hover:bg-[#11192c]"
            aria-label="Zoom in"
            title="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
        </div>

        <div className="mx-1 h-5 w-px bg-[#1a1a2e]" />

        <div className="flex items-center gap-1">
          <button
            onClick={() => scrollBy(-1)}
            className="flex h-7 w-7 items-center justify-center rounded border border-[#1a1a2e] bg-[#050508] text-[#aab] transition-colors hover:bg-[#11192c]"
            aria-label="Scroll up (earlier)"
            title="Scroll earlier"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={() => scrollBy(1)}
            className="flex h-7 w-7 items-center justify-center rounded border border-[#1a1a2e] bg-[#050508] text-[#aab] transition-colors hover:bg-[#11192c]"
            aria-label="Scroll down (later)"
            title="Scroll later"
          >
            <ChevronDown size={14} />
          </button>
        </div>

        <span className="ml-auto text-[11px] text-[#5a6173]">
          click empty: add &middot; note: select &middot; dbl-click: delete &middot; shift: multi &middot; drag: move &middot; ruler: seek &middot; ribbon: velocity &middot; ⌘C/⌘V &middot; ⌘Z
        </span>
      </div>

      {/* canvas region (wheel target) */}
      <div ref={wrapperRef} className="relative min-h-0 flex-1">
        <EditorCanvas />
      </div>
    </div>
  )
}
