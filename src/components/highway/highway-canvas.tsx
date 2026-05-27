import { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import { usePlayerStore } from '@/stores/player-store'
import { useKitStore } from '@/stores/kit-store'
import { useAnimationFrame } from '@/hooks/use-animation-frame'
import { renderHighway } from './highway-renderer'
import { resolveInstrumentLane } from '@/lib/default-kit'
import type { KitLane } from '@/types/kit'
import type { HighwayNote } from '@/types/song'

export function HighwayCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const sizeRef = useRef({ width: 0, height: 0 })
  const [ready, setReady] = useState(false)

  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const activeSong = usePlayerStore((s) => s.activeSong)
  const tick = usePlayerStore((s) => s.tick)
  const kit = useKitStore((s) => s.kit)

  /**
   * Resolve the active song's notes against the current kit.
   *
   * Note.instrumentClass (stable Paradiddle id) → resolveInstrumentLane()
   * → lane id → laneIndex in current kit. Recomputed whenever kit or song
   * changes, so editing the kit in Setup updates the highway live.
   *
   * Also computes:
   * - columnLanes:   enabled, non-full-width lanes that actually have notes in this song
   * - laneIndexToColumnPos: lookup for column-lane notes
   * - laneIndexToFullWidth: lookup for full-width notes (kick etc.)
   * Lanes with zero notes in this song are hidden so the highway doesn't waste columns.
   */
  // Deps split for memo efficiency: only kit.lanes + kit.instrumentOverrides
  // affect note resolution. The four scalar tuning multipliers (thickness,
  // glow, gridBrightness, pulseStrength) flow straight into the draw callback,
  // so dragging a slider doesn't reshape the whole notes array.
  const kitLanes = kit.lanes
  const kitOverrides = kit.instrumentOverrides

  const { resolvedNotes, columnLanes, laneIndexToColumnPos, laneIndexToFullWidth, pulseTriggerLanes } = useMemo(() => {
    // Build lane-id → kit index for fast resolution
    const laneIdToIndex = new Map<string, number>()
    kitLanes.forEach((lane, idx) => {
      if (lane.enabled) laneIdToIndex.set(lane.id, idx)
    })

    // Resolve notes against current kit (one shallow clone per note)
    const resolvedNotes: HighwayNote[] = []
    const usedLaneIndices = new Set<number>()
    if (activeSong) {
      for (const note of activeSong.notes) {
        const laneId = resolveInstrumentLane(note.instrumentClass, kitOverrides)
        const laneIndex = laneId ? (laneIdToIndex.get(laneId) ?? -1) : -1
        if (laneIndex >= 0) usedLaneIndices.add(laneIndex)
        resolvedNotes.push({ ...note, laneIndex })
      }
    }

    const columnLanes: KitLane[] = []
    const laneIndexToColumnPos = new Map<number, number>()
    const laneIndexToFullWidth = new Map<number, KitLane>()
    // Lane indices whose hits fire the hit-line pulse — checked per-frame by the renderer
    const pulseTriggerLanes = new Set<number>()

    kitLanes.forEach((lane, idx) => {
      if (!lane.enabled) return
      if (lane.pulseTrigger) pulseTriggerLanes.add(idx)
      if (!usedLaneIndices.has(idx)) return
      if (lane.isFullWidth) {
        laneIndexToFullWidth.set(idx, lane)
      } else {
        laneIndexToColumnPos.set(idx, columnLanes.length)
        columnLanes.push(lane)
      }
    })

    return { resolvedNotes, columnLanes, laneIndexToColumnPos, laneIndexToFullWidth, pulseTriggerLanes }
  }, [kitLanes, kitOverrides, activeSong])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      const canvas = canvasRef.current
      if (!canvas) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      sizeRef.current = { width, height }
      setReady(true)
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !activeSong) return
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
      currentTime: usePlayerStore.getState().currentTime,
      notes: resolvedNotes,
      bpmEvents: activeSong.bpmEvents,
      columnLanes,
      laneIndexToColumnPos,
      laneIndexToFullWidth,
      thickness: kit.noteThickness,
      glow: kit.glowIntensity,
      gridBrightness: kit.gridBrightness,
      pulseStrength: kit.pulseStrength,
      pulseTriggerLanes,
      lookaheadSeconds: kit.lookaheadSeconds,
    })
  }, [activeSong, resolvedNotes, columnLanes, laneIndexToColumnPos, laneIndexToFullWidth, pulseTriggerLanes, kit.noteThickness, kit.glowIntensity, kit.gridBrightness, kit.pulseStrength, kit.lookaheadSeconds])

  // Animation loop during playback
  useAnimationFrame(() => {
    tick()
    draw()
  }, isPlaying)

  // Initial draw when canvas is ready
  useEffect(() => {
    if (ready && !isPlaying) {
      requestAnimationFrame(draw)
    }
  }, [ready, draw]) // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw on seek while paused (subscribe to store directly, no React re-renders)
  useEffect(() => {
    if (isPlaying) return
    const unsub = usePlayerStore.subscribe((state, prev) => {
      if (state.currentTime !== prev.currentTime) {
        requestAnimationFrame(draw)
      }
    })
    return unsub
  }, [isPlaying, draw])

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  )
}
