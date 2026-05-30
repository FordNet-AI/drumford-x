import { useRef, useEffect, useCallback, useState } from 'react'
import type { RlrrBpmEvent } from '@/types/song'
import { DEFAULT_KIT, resolveInstrumentLane } from '@/lib/default-kit'
import type { StudioChart, StudioNote, SnapValue } from '@studio/types'
import { editorTimeToY, editorYToTime, subdivisionSeconds } from '@studio/lib/grid'
import {
  computeLayout,
  columnForClass,
  ribbonBarLength,
  RIBBON_PAD,
  type EditorLayout,
} from '@studio/lib/editor-layout'
import { isKickClass, columnClassFor } from '@studio/lib/editor-geometry'
import { useStudioStore } from '@studio/stores/studio-store'
import { useEditorView } from '@studio/stores/editor-view-store'
import { usePlaybackStore } from '@studio/stores/playback-store'
import {
  useEditorInteractions,
  type Marquee,
  type DragPreview,
  type VelPreview,
} from './use-editor-interactions'

/* ───────────────────────── colors / constants ───────────────────────── */

const KICK_LANE = DEFAULT_KIT.lanes.find((l) => l.id === 'kick')!
const KICK_COLOR = KICK_LANE.color // '#ff3a5c'

const BG = '#070a14'
const HEADER_BG = '#0d1424'
const RULER_BG = '#0a0f1c'
const COL_DIVIDER = '#161c2e'
const BEAT_LINE = 'rgba(120,140,180,0.13)'
const SUB_LINE = 'rgba(120,140,180,0.07)'
const BAR_LINE = 'rgba(150,175,220,0.34)'
const TEXT_DIM = '#7a8499'
const NOTE_H = 12 // note block height (px)

/* Velocity shading — mirrors resolve-notes.ts thresholds so the editor's
 * brightness matches what Preview / the player render for the same chart. */
const GHOST_THRESHOLD = 30 // vel <= → ghost (dimmest)
const ACCENT_THRESHOLD = 90 // vel >= → accent (brightest)

/**
 * Fill opacity for a note of velocity `vel` (1..127). Low velocity reads dim,
 * high velocity reads bright/solid. The mapping is piecewise so the ghost and
 * accent BANDS are visually distinct (not just a flat linear ramp): ghosts sit
 * in [0.30, 0.45], normals ramp [0.50, 0.80], accents in [0.85, 1.0].
 */
function velFillAlpha(vel: number): number {
  const v = Math.min(127, Math.max(1, vel))
  if (v <= GHOST_THRESHOLD) {
    // 1..30 → 0.30..0.45
    return 0.3 + (v / GHOST_THRESHOLD) * 0.15
  }
  if (v >= ACCENT_THRESHOLD) {
    // 90..127 → 0.85..1.0
    return 0.85 + ((v - ACCENT_THRESHOLD) / (127 - ACCENT_THRESHOLD)) * 0.15
  }
  // 31..89 → 0.50..0.80
  return 0.5 + ((v - GHOST_THRESHOLD) / (ACCENT_THRESHOLD - GHOST_THRESHOLD)) * 0.3
}

/** Per-class cache of the resolved lane color so we don't resolve every frame. */
const classColorCache = new Map<string, string>()
function colorForClass(instrumentClass: string): string {
  const cached = classColorCache.get(instrumentClass)
  if (cached) return cached
  const laneId = resolveInstrumentLane(instrumentClass, DEFAULT_KIT.instrumentOverrides)
  const lane = laneId ? DEFAULT_KIT.lanes.find((l) => l.id === laneId) : undefined
  const color = lane?.color ?? '#8899bb'
  classColorCache.set(instrumentClass, color)
  return color
}

/* ───────────────────────── beat-grid generation ─────────────────────── */

interface GridLine {
  time: number
  kind: 'sub' | 'beat' | 'bar'
}

/**
 * Generate grid line times across the visible window [minTime, maxTime],
 * honoring tempo changes. Bar lines are strongest, beats medium, snap
 * subdivisions faint. Walks each BPM segment from its own start so lines stay
 * aligned to the real note grid (mirrors highway-renderer's generateBeats).
 */
function generateGridLines(
  bpmEvents: RlrrBpmEvent[],
  snap: SnapValue,
  minTime: number,
  maxTime: number,
): GridLine[] {
  const lines: GridLine[] = []
  if (maxTime <= minTime) return lines

  // Synthesize a virtual 120/4-4 segment from 0 if the first event starts late.
  const events: RlrrBpmEvent[] =
    bpmEvents.length > 0 && bpmEvents[0]!.time <= 0
      ? bpmEvents
      : [{ bpm: 120, time: 0, timeSignature: [4, 4] }, ...bpmEvents]

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!
    const segStart = ev.time
    const segEnd = i + 1 < events.length ? events[i + 1]!.time : maxTime
    if (segEnd < minTime) continue
    if (segStart > maxTime) break

    const bpm = ev.bpm
    const [beatsPerBar] = ev.timeSignature ?? [4, 4]
    const beatDur = 60 / bpm
    const sub = subdivisionSeconds(snap, bpm)

    // Bars & beats: count from the segment start.
    // Start at the first beat index that could be visible.
    const firstBeat = Math.max(0, Math.floor((minTime - segStart) / beatDur))
    for (let bi = firstBeat; ; bi++) {
      const t = segStart + bi * beatDur
      if (t > segEnd + 1e-9 || t > maxTime) break
      if (t < minTime - 1e-9) continue
      lines.push({ time: t, kind: bi % beatsPerBar === 0 ? 'bar' : 'beat' })
    }

    // Subdivisions (skip those that coincide with a beat, already added).
    if (sub < beatDur - 1e-9) {
      const firstSub = Math.max(0, Math.floor((minTime - segStart) / sub))
      for (let si = firstSub; ; si++) {
        const t = segStart + si * sub
        if (t > segEnd + 1e-9 || t > maxTime) break
        if (t < minTime - 1e-9) continue
        // Is this sub on a beat boundary? If so it's already drawn.
        const onBeat = Math.abs((t - segStart) / beatDur - Math.round((t - segStart) / beatDur)) < 1e-6
        if (!onBeat) lines.push({ time: t, kind: 'sub' })
      }
    }
  }
  return lines
}

/** Bar-number labels for the ruler: one per bar line, numbered from 1. */
interface BarLabel {
  time: number
  bar: number
}
function generateBarLabels(
  bpmEvents: RlrrBpmEvent[],
  minTime: number,
  maxTime: number,
): BarLabel[] {
  const labels: BarLabel[] = []
  if (maxTime <= minTime) return labels
  const events: RlrrBpmEvent[] =
    bpmEvents.length > 0 && bpmEvents[0]!.time <= 0
      ? bpmEvents
      : [{ bpm: 120, time: 0, timeSignature: [4, 4] }, ...bpmEvents]

  let barCounter = 0 // running bar count across segments
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!
    const segStart = ev.time
    const segEnd = i + 1 < events.length ? events[i + 1]!.time : Math.max(maxTime, segStart)
    const [beatsPerBar] = ev.timeSignature ?? [4, 4]
    const beatDur = 60 / ev.bpm
    const barDur = beatDur * beatsPerBar
    if (barDur <= 0) continue
    let t = segStart
    let localBar = 0
    while (t <= segEnd + 1e-9) {
      if (t >= minTime - 1e-9 && t <= maxTime + 1e-9) {
        labels.push({ time: t, bar: barCounter + localBar + 1 })
      }
      localBar++
      t = segStart + localBar * barDur
      if (t > maxTime + barDur) break
    }
    // advance running counter by the bars actually spanned by this segment
    const segDur = segEnd - segStart
    barCounter += Math.max(0, Math.round(segDur / barDur))
  }
  return labels
}

/* ───────────────────────────── draw ─────────────────────────────────── */

interface DrawParams {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  chart: StudioChart
  selection: Set<string>
  snap: SnapValue
  viewStartTime: number
  pxPerSec: number
  currentTime: number
  marquee: Marquee | null
  dragPreview: DragPreview | null
  velPreview: VelPreview | null
  layout: EditorLayout
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/**
 * Pure render of the editor onto a 2D context. The context transform/DPR is set
 * up by the caller; everything here works in CSS pixels.
 */
export function drawEditor(p: DrawParams): void {
  const { ctx, width, height, chart, selection, snap, viewStartTime, pxPerSec, currentTime, marquee, dragPreview, velPreview, layout } = p
  const { headerH, laneLeft, laneWidth, columns } = layout

  // Effective velocity for a note, applying the live ribbon-drag preview so the
  // bar (and note shading) follow the cursor without mutating the store.
  const effVel = (n: StudioNote): number =>
    velPreview && velPreview.id === n.id ? velPreview.vel : n.vel

  // Effective (time, class) for a note, applying the live drag preview so the
  // selection follows the cursor without mutating the store.
  const effTime = (n: StudioNote): number =>
    dragPreview && dragPreview.ids.has(n.id) ? n.time + dragPreview.dt : n.time
  const effClass = (n: StudioNote): string =>
    dragPreview && dragPreview.ids.has(n.id) && dragPreview.dLaneClass
      ? dragPreview.dLaneClass
      : n.instrumentClass

  // Visible time window of the lane area (below the header).
  const laneTop = headerH
  const laneH = height - headerH
  const minTime = editorYToTime(0, viewStartTime, pxPerSec)
  const maxTime = editorYToTime(laneH, viewStartTime, pxPerSec)

  // y-in-canvas for an absolute time (lane area is offset by headerH).
  const yOf = (t: number): number => laneTop + editorTimeToY(t, viewStartTime, pxPerSec)

  /* background */
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, width, height)

  /* faint column fills + dividers (lane area only) */
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]!
    // very faint tint of the lane color so columns read as distinct bands
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.012)' : 'rgba(255,255,255,0.028)'
    ctx.fillRect(col.x, laneTop, col.width, laneH)
    ctx.strokeStyle = COL_DIVIDER
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(Math.round(col.x) + 0.5, laneTop)
    ctx.lineTo(Math.round(col.x) + 0.5, height)
    ctx.stroke()
  }
  // right edge of last column
  if (columns.length > 0) {
    const rightX = laneLeft + laneWidth
    ctx.strokeStyle = COL_DIVIDER
    ctx.beginPath()
    ctx.moveTo(Math.round(rightX) - 0.5, laneTop)
    ctx.lineTo(Math.round(rightX) - 0.5, height)
    ctx.stroke()
  }

  /* beat grid (horizontal lines across the lane area) */
  const gridLines = generateGridLines(chart.bpmEvents, snap, minTime, maxTime)
  for (const gl of gridLines) {
    const y = Math.round(yOf(gl.time)) + 0.5
    if (y < laneTop || y > height) continue
    ctx.strokeStyle = gl.kind === 'bar' ? BAR_LINE : gl.kind === 'beat' ? BEAT_LINE : SUB_LINE
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(laneLeft, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }

  /* kick gutter background (tinted) */
  ctx.fillStyle = 'rgba(255,58,92,0.08)'
  ctx.fillRect(layout.kickX, laneTop, layout.kickW, laneH)
  ctx.strokeStyle = 'rgba(255,58,92,0.25)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(layout.kickX + layout.kickW - 0.5, laneTop)
  ctx.lineTo(layout.kickX + layout.kickW - 0.5, height)
  ctx.stroke()

  /* playhead line (currentTime) — subtle, only if visible */
  if (currentTime >= minTime && currentTime <= maxTime) {
    const py = Math.round(yOf(currentTime)) + 0.5
    ctx.strokeStyle = 'rgba(0,229,255,0.55)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(layout.rulerW, py)
    ctx.lineTo(width, py)
    ctx.stroke()
  }

  /* notes */
  // Draw kick bars first (behind column notes), then column notes on top.
  // Filter by EFFECTIVE time so a note dragged into view stays visible.
  const visibleNotes = chart.notes.filter((n) => {
    const t = effTime(n)
    return t >= minTime - 0.5 && t <= maxTime + 0.5
  })

  // Kick full-width bars. Fill opacity encodes velocity (ghost/accent bands).
  for (const n of visibleNotes) {
    const cls = effClass(n)
    if (!isKickClass(cls)) continue
    const y = yOf(effTime(n))
    const selected = selection.has(n.id)
    const a = velFillAlpha(effVel(n))
    const h = NOTE_H - 2
    roundRect(ctx, laneLeft + 1, y - h / 2, laneWidth - 2, h, 3)
    // scale the kick's base alpha (0.32) by the velocity factor so kicks stay
    // subtler than column notes while still reading velocity.
    ctx.fillStyle = withAlpha(KICK_COLOR, a * 0.65)
    ctx.fill()
    ctx.strokeStyle = selected ? '#ffffff' : KICK_COLOR
    ctx.lineWidth = selected ? 2 : 1
    ctx.stroke()
    // also mark in the kick gutter so it's clearly a kick row
    ctx.fillStyle = selected ? '#ffffff' : withAlpha(KICK_COLOR, Math.max(0.5, a))
    roundRect(ctx, layout.kickX + 3, y - h / 2, layout.kickW - 6, h, 2)
    ctx.fill()
  }

  // Column notes. Fill opacity encodes velocity (ghost dim → accent solid).
  for (const n of visibleNotes) {
    const cls = effClass(n)
    if (isKickClass(cls)) continue
    const col = columnForClass(layout, columnClassFor(cls))
    if (!col) continue
    const y = yOf(effTime(n))
    const selected = selection.has(n.id)
    const color = colorForClass(cls)
    const a = velFillAlpha(effVel(n))
    const pad = 4
    const w = col.width - pad * 2
    const x = col.x + pad
    roundRect(ctx, x, y - NOTE_H / 2, w, NOTE_H, 3)
    ctx.fillStyle = withAlpha(color, a)
    ctx.fill()
    if (selected) {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.stroke()
    } else {
      ctx.strokeStyle = withAlpha(color, 0.9)
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }

  /* velocity ribbon (right strip): one bar per visible note, length ∝ vel.
     Drag a bar horizontally to edit that note's velocity (see interactions). */
  if (layout.ribbonW > 0) {
    // strip background
    ctx.fillStyle = 'rgba(255,255,255,0.022)'
    ctx.fillRect(layout.ribbonX, laneTop, layout.ribbonW, laneH)
    ctx.strokeStyle = COL_DIVIDER
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(Math.round(layout.ribbonX) + 0.5, laneTop)
    ctx.lineTo(Math.round(layout.ribbonX) + 0.5, height)
    ctx.stroke()

    const barX = layout.ribbonX + RIBBON_PAD
    const barH = 4
    for (const n of visibleNotes) {
      const y = yOf(effTime(n))
      if (y < laneTop - 4 || y > height + 4) continue
      const color = isKickClass(effClass(n)) ? KICK_COLOR : colorForClass(effClass(n))
      const selected = selection.has(n.id)
      const len = ribbonBarLength(layout, effVel(n))
      // track (faint full-width) then the value bar
      ctx.fillStyle = 'rgba(255,255,255,0.05)'
      roundRect(ctx, barX, y - barH / 2, layout.ribbonW - RIBBON_PAD * 2, barH, 2)
      ctx.fill()
      ctx.fillStyle = withAlpha(color, selected ? 1 : 0.85)
      roundRect(ctx, barX, y - barH / 2, Math.max(2, len), barH, 2)
      ctx.fill()
      // a small handle dot at the bar end aids dragging / reads the value
      ctx.fillStyle = selected ? '#ffffff' : withAlpha(color, 0.95)
      ctx.beginPath()
      ctx.arc(barX + Math.max(2, len), y, selected ? 3 : 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  /* marquee rectangle */
  if (marquee) {
    const x = Math.min(marquee.x0, marquee.x1)
    const y = Math.min(marquee.y0, marquee.y1)
    const w = Math.abs(marquee.x1 - marquee.x0)
    const h = Math.abs(marquee.y1 - marquee.y0)
    ctx.fillStyle = 'rgba(0,229,255,0.10)'
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = 'rgba(0,229,255,0.7)'
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y + 0.5, w, h)
  }

  /* ruler (left) — drawn over a solid strip so it's always legible */
  ctx.fillStyle = RULER_BG
  ctx.fillRect(0, laneTop, layout.rulerW, laneH)
  ctx.strokeStyle = COL_DIVIDER
  ctx.beginPath()
  ctx.moveTo(layout.rulerW - 0.5, 0)
  ctx.lineTo(layout.rulerW - 0.5, height)
  ctx.stroke()
  // beat ticks + bar labels
  ctx.textBaseline = 'middle'
  ctx.font = '10px ui-monospace, monospace'
  for (const gl of gridLines) {
    if (gl.kind === 'sub') continue
    const y = Math.round(yOf(gl.time)) + 0.5
    if (y < laneTop || y > height) continue
    const tickLen = gl.kind === 'bar' ? 12 : 6
    ctx.strokeStyle = gl.kind === 'bar' ? 'rgba(150,175,220,0.7)' : 'rgba(120,140,180,0.4)'
    ctx.beginPath()
    ctx.moveTo(layout.rulerW - tickLen, y)
    ctx.lineTo(layout.rulerW, y)
    ctx.stroke()
  }
  const barLabels = generateBarLabels(chart.bpmEvents, minTime, maxTime)
  ctx.fillStyle = TEXT_DIM
  for (const bl of barLabels) {
    const y = yOf(bl.time)
    if (y < laneTop + 6 || y > height - 4) continue
    ctx.fillText(String(bl.bar), 4, y + 7)
  }

  /* header band (top) — column labels, drawn last over everything */
  ctx.fillStyle = HEADER_BG
  ctx.fillRect(0, 0, width, headerH)
  ctx.strokeStyle = COL_DIVIDER
  ctx.beginPath()
  ctx.moveTo(0, headerH - 0.5)
  ctx.lineTo(width, headerH - 0.5)
  ctx.stroke()
  // kick gutter header label
  ctx.fillStyle = KICK_COLOR
  ctx.font = '9px ui-monospace, monospace'
  ctx.textBaseline = 'middle'
  ctx.save()
  ctx.translate(layout.kickX + layout.kickW / 2, headerH / 2)
  ctx.textAlign = 'center'
  ctx.fillText('KICK', 0, 0)
  ctx.restore()
  // column headers
  ctx.textAlign = 'center'
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif'
  for (const col of columns) {
    const laneId = resolveInstrumentLane(col.instrumentClass, DEFAULT_KIT.instrumentOverrides)
    const lane = laneId ? DEFAULT_KIT.lanes.find((l) => l.id === laneId) : undefined
    ctx.fillStyle = lane?.color ?? TEXT_DIM
    const label = lane?.shortLabel ?? col.instrumentClass
    ctx.fillText(label, col.cx, headerH / 2 + 1)
  }
  // velocity ribbon header label
  if (layout.ribbonW > 0) {
    ctx.fillStyle = TEXT_DIM
    ctx.font = '9px ui-monospace, monospace'
    ctx.fillText('VEL', layout.ribbonX + layout.ribbonW / 2, headerH / 2 + 1)
  }
  ctx.textAlign = 'left'
}

/* ───────────────────── small color helpers ──────────────────────────── */

function withAlpha(hex: string, alpha: number): string {
  // hex '#rrggbb' → 'rgba(r,g,b,alpha)'
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/* ───────────────────────────── component ────────────────────────────── */

export function EditorCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const sizeRef = useRef({ width: 0, height: 0 })
  const [ready, setReady] = useState(false)

  const chart = useStudioStore((s) => s.chart)

  // Subscribe to the pieces that should trigger a redraw via React render.
  const selection = useStudioStore((s) => s.selection)
  const snap = useStudioStore((s) => s.snap)
  const pxPerSec = useEditorView((s) => s.pxPerSec)
  const viewStartTime = useEditorView((s) => s.viewStartTime)

  // Pointer interactions (add/select/move/marquee). Returns the live marquee +
  // drag preview (for drawing) and handlers to attach to the canvas.
  const { marquee, dragPreview, velPreview, handlers } = useEditorInteractions({
    canvasRef,
    getLayout: () => computeLayout(sizeRef.current.width),
  })

  // Always-current ref to draw() so the size observer (mounted once) can repaint
  // after a resize without depending on draw in its effect deps.
  const drawRef = useRef<() => void>(() => {})

  /* size: synchronous seed on mount + ResizeObserver (preview lesson 1).
     Resizing the backing store CLEARS the canvas, and this editor has no rAF
     loop, so we repaint directly after every size change (preview lesson 2). */
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
      drawRef.current() // repaint the freshly-resized (cleared) canvas
    }
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
    if (!canvas || !chart) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { width, height } = sizeRef.current
    if (width === 0 || height === 0) return
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const view = useEditorView.getState()
    drawEditor({
      ctx,
      width,
      height,
      chart,
      selection: new Set(useStudioStore.getState().selection),
      snap: useStudioStore.getState().snap,
      viewStartTime: view.viewStartTime,
      pxPerSec: view.pxPerSec,
      currentTime: usePlaybackStore.getState().currentTime,
      marquee,
      dragPreview,
      velPreview,
      layout: computeLayout(width),
    })
  }, [chart, marquee, dragPreview, velPreview])

  // Keep the ref pointing at the latest draw so the size observer can use it.
  drawRef.current = draw

  /* direct draw whenever inputs change (preview lesson 2 — no rAF dependency) */
  useEffect(() => {
    if (ready) draw()
    // chart/selection/snap/zoom/scroll/marquee/dragPreview/velPreview are deps below
  }, [ready, draw, chart, selection, snap, pxPerSec, viewStartTime, marquee, dragPreview, velPreview])

  /* redraw on playhead movement (scrub/playback) without React re-render */
  useEffect(() => {
    const unsub = usePlaybackStore.subscribe((s, prev) => {
      if (s.currentTime !== prev.currentTime) draw()
    })
    return unsub
  }, [draw])

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none select-none"
        style={{ cursor: 'crosshair' }}
        {...handlers}
      />
    </div>
  )
}
