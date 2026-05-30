import { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import { renderHighway } from '@/components/highway/highway-renderer'
import { DEFAULT_KIT } from '@/lib/default-kit'
import { resolveChart } from '@studio/lib/resolve-notes'
import { useStudioStore } from '@studio/stores/studio-store'
import { usePlaybackStore } from '@studio/stores/playback-store'

/**
 * Studio Preview highway canvas.
 *
 * Mirrors the player's `src/components/highway/highway-canvas.tsx` lifecycle,
 * but reads the studio's editable chart + studio playback store and resolves
 * notes against DEFAULT_KIT via resolveChart(). It reuses the player's pure
 * `renderHighway` for pixel-identical output.
 *
 * Two carry-over lessons from the Phase-3 spike (vs. the player canvas):
 *  1. Synchronous size seed on mount (getBoundingClientRect) in addition to the
 *     ResizeObserver — RO's initial callback isn't reliably delivered on hidden
 *     / headless pages, leaving the canvas 0×0 and blank.
 *  2. Direct draw() on the initial paint and on seek-while-paused, not only via
 *     requestAnimationFrame — hidden pages throttle/suspend rAF, so a direct
 *     draw guarantees the frame lands. The rAF loop is kept for live playback.
 */
export function PreviewCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const sizeRef = useRef({ width: 0, height: 0 })
  const rafRef = useRef<number>(0)
  const [ready, setReady] = useState(false)

  const chart = useStudioStore((s) => s.chart)
  const isPlaying = usePlaybackStore((s) => s.isPlaying)

  // Resolve notes + build lane lookups against DEFAULT_KIT. Recomputed only
  // when the notes array reference changes (immutable store edits).
  const notes = chart?.notes
  const { resolvedNotes, columnLanes, laneIndexToColumnPos, laneIndexToFullWidth, pulseTriggerLanes } =
    useMemo(() => {
      const resolved = resolveChart(notes ?? [])
      // Derive pulse-trigger lane indices exactly like highway-canvas: enabled
      // lanes flagged pulseTrigger fire the hit-line pulse.
      const pulseTriggerLanes = new Set<number>()
      DEFAULT_KIT.lanes.forEach((lane, idx) => {
        if (lane.enabled && lane.pulseTrigger) pulseTriggerLanes.add(idx)
      })
      return { ...resolved, pulseTriggerLanes }
    }, [notes])

  // Size the canvas: synchronous seed on mount + ResizeObserver for resizes.
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const applySize = (width: number, height: number) => {
      if (width === 0 || height === 0) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      sizeRef.current = { width, height }
      setReady(true)
    }

    // Lesson 1: synchronous seed — RO's first callback may never fire on a
    // hidden page, so measure immediately.
    const rect = container.getBoundingClientRect()
    applySize(rect.width, rect.height)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      applySize(width, height)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { width, height } = sizeRef.current
    if (width === 0 || height === 0) return

    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    renderHighway({
      ctx,
      width,
      height,
      currentTime: usePlaybackStore.getState().currentTime,
      notes: resolvedNotes,
      bpmEvents: chart?.bpmEvents ?? [],
      columnLanes,
      laneIndexToColumnPos,
      laneIndexToFullWidth,
      thickness: DEFAULT_KIT.noteThickness,
      glow: DEFAULT_KIT.glowIntensity,
      gridBrightness: DEFAULT_KIT.gridBrightness,
      pulseStrength: DEFAULT_KIT.pulseStrength,
      pulseTriggerLanes,
      lookaheadSeconds: DEFAULT_KIT.lookaheadSeconds,
    })
  }, [resolvedNotes, columnLanes, laneIndexToColumnPos, laneIndexToFullWidth, pulseTriggerLanes, chart?.bpmEvents])

  // Animation loop during playback — ticks the audio clock then draws.
  useEffect(() => {
    if (!isPlaying) return
    const loop = () => {
      usePlaybackStore.getState().tick()
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying, draw])

  // Lesson 2: direct initial paint (not only rAF) once the canvas is sized or
  // the resolved notes change, while paused.
  useEffect(() => {
    if (ready && !isPlaying) draw()
  }, [ready, isPlaying, draw])

  // Lesson 2: redraw on seek-while-paused via a direct draw(). Subscribe to the
  // store directly so scrubbing repaints without React re-renders.
  useEffect(() => {
    if (isPlaying) return
    const unsub = usePlaybackStore.subscribe((state, prev) => {
      if (state.currentTime !== prev.currentTime) draw()
    })
    return unsub
  }, [isPlaying, draw])

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  )
}
