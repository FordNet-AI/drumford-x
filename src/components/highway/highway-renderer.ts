import type { HighwayNote, RlrrBpmEvent } from '@/types/song'
import type { KitLane } from '@/types/kit'

const BG_COLOR = '#050508'
const HIT_LINE_Y_RATIO = 0.85
const TRAIL_SECONDS = 0.5

const NOTE_WIDTH_DRUM = 56
const NOTE_HEIGHT_DRUM = 16
const NOTE_WIDTH_CYMBAL = 68
const NOTE_HEIGHT_CYMBAL = 10
const NOTE_RADIUS = 4
const KICK_LINE_HEIGHT = 4

interface RenderParams {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  currentTime: number
  notes: HighwayNote[]
  bpmEvents: RlrrBpmEvent[]
  /** Lanes from the user's kit. Order = display order. Must be enabled lanes only (renderer trusts the caller filtered). */
  columnLanes: KitLane[]
  /** Map laneIndex (into the full kit) → position in `columnLanes`. -1 / missing = not a column lane. */
  laneIndexToColumnPos: Map<number, number>
  /** Map laneIndex → full-width lane object (for kick-style rendering, drawn behind column notes). */
  laneIndexToFullWidth: Map<number, KitLane>
  /** Multiplier on all note sizes from kit.noteThickness */
  thickness: number
  /** Multiplier on glow effects (accent shadows + lane gradients) from kit.glowIntensity. 0 = none, 1 = default, 2 = punchy */
  glow: number
  /** Multiplier on beat-grid line brightness from kit.gridBrightness. 0 = invisible, 1 = default, 2 = bold */
  gridBrightness: number
  /** Multiplier on hit-line pulse strength from kit.pulseStrength. 0 = no pulse, 1 = default, 2 = punchy */
  pulseStrength: number
  /** Lane indices whose notes fire the hit-line pulse. Empty set = no pulse fires. */
  pulseTriggerLanes: Set<number>
  /** How far into the future notes are shown before the hit line, in seconds. Higher = slower scroll. */
  lookaheadSeconds: number
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Get the BPM at a given time, walking through bpmEvents */
export function getCurrentBpm(time: number, bpmEvents: RlrrBpmEvent[]): number {
  let bpm = 120
  for (const e of bpmEvents) {
    if (e.time <= time) bpm = e.bpm
    else break
  }
  return bpm
}

/** Get the time signature at a given time as [beats, division] (e.g. [4, 4]) */
export function getCurrentTimeSig(time: number, bpmEvents: RlrrBpmEvent[]): [number, number] {
  let sig: [number, number] = [4, 4]
  for (const e of bpmEvents) {
    if (e.time <= time) {
      if (e.timeSignature) sig = e.timeSignature
    } else break
  }
  return sig
}

interface Beat {
  time: number
  /** True for beat 1 of each measure — drawn with a stronger line */
  isDownbeat: boolean
}

/**
 * Generate beat positions over a visible time window, correctly handling
 * tempo changes. Each BPM segment counts its own beats starting at its
 * own `time`, using its own `beatDuration` and time signature — so beats
 * always line up with the actual note grid even across tempo changes.
 *
 * If the chart's first BPM event is later than t=0 (e.g. count-in), we
 * synthesize a virtual 120 BPM 4/4 segment from t=0 up to it so we don't
 * leave the pre-chart region ungridded.
 */
function generateBeats(
  bpmEvents: RlrrBpmEvent[],
  minTime: number,
  maxTime: number,
): Beat[] {
  const beats: Beat[] = []
  const events: { bpm: number; time: number; timeSignature?: [number, number] }[] =
    bpmEvents.length === 0 || bpmEvents[0]!.time > 0
      ? [{ bpm: 120, time: 0, timeSignature: [4, 4] }, ...bpmEvents]
      : bpmEvents

  // Carry the previous segment's time signature forward when the new event
  // omits it (Paradiddle only restates timeSignature when it changes).
  let lastSig: [number, number] = [4, 4]

  for (let i = 0; i < events.length; i++) {
    const seg = events[i]!
    const segStart = seg.time
    const segEnd = i + 1 < events.length ? events[i + 1]!.time : Infinity
    const beatDuration = 60 / seg.bpm
    const sig = seg.timeSignature ?? lastSig
    lastSig = sig
    const beatsPerMeasure = sig[0]

    if (segEnd < minTime) continue
    if (segStart > maxTime) break

    // n = beat index from segment start. Compute by index (not accumulation)
    // to avoid float drift across many beats.
    const startN = Math.max(0, Math.ceil((minTime - segStart) / beatDuration))
    const lastBeatTime = Math.min(maxTime, segEnd - 1e-9)
    const endN = Math.floor((lastBeatTime - segStart) / beatDuration)

    for (let n = startN; n <= endN; n++) {
      beats.push({
        time: segStart + n * beatDuration,
        isDownbeat: n % beatsPerMeasure === 0,
      })
    }
  }

  return beats
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

export function renderHighway(params: RenderParams): void {
  const {
    ctx, width, height, currentTime, notes, bpmEvents,
    columnLanes, laneIndexToColumnPos, laneIndexToFullWidth, thickness, glow, gridBrightness,
    pulseStrength, pulseTriggerLanes, lookaheadSeconds,
  } = params

  const laneCount = columnLanes.length
  const hitLineY = height * HIT_LINE_Y_RATIO
  const laneWidth = laneCount > 0 ? Math.min(90, Math.floor((width * 0.85) / laneCount)) : 0
  const totalLanesWidth = laneWidth * laneCount
  const startX = (width - totalLanesWidth) / 2

  // Background
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, width, height)

  // Lane glows (only if we have column lanes) — gradient alpha scales with glow
  const laneGlowAlpha = 0.04 * glow
  if (laneGlowAlpha > 0) {
    for (let i = 0; i < laneCount; i++) {
      const lane = columnLanes[i]!
      const cx = startX + i * laneWidth + laneWidth / 2
      const gradient = ctx.createLinearGradient(cx - laneWidth / 2, 0, cx + laneWidth / 2, 0)
      gradient.addColorStop(0, 'transparent')
      gradient.addColorStop(0.5, hexToRgba(lane.color, laneGlowAlpha))
      gradient.addColorStop(1, 'transparent')
      ctx.fillStyle = gradient
      ctx.fillRect(cx - laneWidth / 2, 0, laneWidth, height)
    }
  }

  // Lane dividers
  if (laneCount > 0) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
    ctx.lineWidth = 1
    for (let i = 0; i <= laneCount; i++) {
      const x = startX + i * laneWidth
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
  }

  // Beat grid lines — generated per-BPM-segment so tempo changes and pickup
  // measures keep grid lines locked to the same time positions as the notes.
  // Full-width grid spans the whole canvas so kick/hihat-foot bars sit on it visually.
  const gridLeft = laneCount > 0 ? startX : width * 0.075
  const gridRight = laneCount > 0 ? startX + totalLanesWidth : width * 0.925
  if (gridBrightness > 0) {
    const beats = generateBeats(bpmEvents, currentTime - TRAIL_SECONDS, currentTime + lookaheadSeconds)
    // Base alphas — chosen so that gridBrightness=1.0 is "default look",
    // 0.0 hides the grid entirely, 2.0 is bold/punchy.
    const downbeatAlpha = 0.14 * gridBrightness
    const beatAlpha = 0.04 * gridBrightness
    for (const beat of beats) {
      const y = timeToY(beat.time, currentTime, hitLineY, lookaheadSeconds)
      if (y < 0 || y > height) continue
      if (beat.isDownbeat) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${downbeatAlpha})`
        ctx.lineWidth = 1.5
      } else {
        ctx.strokeStyle = `rgba(255, 255, 255, ${beatAlpha})`
        ctx.lineWidth = 1
      }
      ctx.beginPath()
      ctx.moveTo(gridLeft, y)
      ctx.lineTo(gridRight, y)
      ctx.stroke()
    }
  }

  // Notes window — moved above hit-line drawing because pulse intensity
  // needs to scan recently-crossed notes.
  const minTime = currentTime - TRAIL_SECONDS
  const maxTime = currentTime + lookaheadSeconds
  const startIdx = binarySearchFirstVisible(notes, minTime)

  // Hit-line pulse — scan notes that crossed the hit line within the last
  // PULSE_DURATION. Take the freshest (highest-intensity) one, weighted
  // by note type so accents punch harder than ghosts.
  //
  // Only counts notes from lanes flagged with `pulseTrigger: true` in the
  // user's kit. Skipped entirely when pulseStrength is 0 (toggle off).
  //
  // Use a dedicated binary search for the PULSE_DURATION window — starting
  // from `startIdx` (which uses the wider TRAIL_SECONDS) would burn ~3× more
  // iterations on out-of-window notes that get `continue`d.
  const PULSE_DURATION = 0.15
  let pulseIntensity = 0
  if (pulseStrength > 0 && pulseTriggerLanes.size > 0) {
    const pulseStartIdx = binarySearchFirstVisible(notes, currentTime - PULSE_DURATION)
    for (let i = pulseStartIdx; i < notes.length; i++) {
      const note = notes[i]!
      if (note.time > currentTime) break
      if (!pulseTriggerLanes.has(note.laneIndex)) continue
      const age = currentTime - note.time
      const weight =
        note.noteType === 'ghost' ? 0.45 :
        note.noteType === 'accent' ? 1.0 :
        0.75
      const intensity = (1 - age / PULSE_DURATION) * weight
      if (intensity > pulseIntensity) pulseIntensity = intensity
    }
    pulseIntensity *= pulseStrength
  }

  // Hit line — pulses brighter and slightly taller when notes cross it.
  // Bloom band grows ~doubled in fresh pulse, then settles back. Stroke
  // gets a white tint on the freshest hits (>50% intensity) before fading
  // back to cyan. Alphas clamp at 1.0 so pulseStrength > 1 still works.
  const bloomHeight = 16 + Math.min(pulseIntensity, 2) * 18
  const hitFillAlpha = Math.min(1, 0.5 + pulseIntensity * 0.4)
  const hitGradient = ctx.createLinearGradient(gridLeft, hitLineY - bloomHeight / 2, gridLeft, hitLineY + bloomHeight / 2)
  hitGradient.addColorStop(0, 'rgba(0, 229, 255, 0)')
  hitGradient.addColorStop(0.5, `rgba(0, 229, 255, ${hitFillAlpha})`)
  hitGradient.addColorStop(1, 'rgba(0, 229, 255, 0)')
  ctx.fillStyle = hitGradient
  ctx.fillRect(gridLeft, hitLineY - bloomHeight / 2, gridRight - gridLeft, bloomHeight)

  // Stroke — cyan baseline, gets brighter + slightly thicker under pulse
  const strokeAlpha = Math.min(1, 0.7 + pulseIntensity * 0.3)
  const strokeWidth = 2 + Math.min(pulseIntensity, 2) * 1.5
  ctx.strokeStyle = `rgba(0, 229, 255, ${strokeAlpha})`
  ctx.lineWidth = strokeWidth
  ctx.beginPath()
  ctx.moveTo(gridLeft, hitLineY)
  ctx.lineTo(gridRight, hitLineY)
  ctx.stroke()

  // White flash overlay — only fires on freshest impacts (intensity > 0.5).
  // Re-strokes the same line in white at decaying alpha so the moment of
  // impact reads as a quick white pop before settling back to cyan.
  if (pulseIntensity > 0.5) {
    const flashAlpha = Math.min(1, (pulseIntensity - 0.5) * 2 * 0.85)
    ctx.strokeStyle = `rgba(255, 255, 255, ${flashAlpha})`
    ctx.lineWidth = strokeWidth
    ctx.beginPath()
    ctx.moveTo(gridLeft, hitLineY)
    ctx.lineTo(gridRight, hitLineY)
    ctx.stroke()
  }

  // Full-width lanes (kick + any others) — rendered first, behind column notes.
  // Different full-width lanes stack vertically so e.g. kick and hi-hat foot
  // don't overlap on the same horizontal line.
  if (laneIndexToFullWidth.size > 0) {
    for (let i = startIdx; i < notes.length; i++) {
      const note = notes[i]!
      if (note.time > maxTime) break
      const fwLane = laneIndexToFullWidth.get(note.laneIndex)
      if (!fwLane) continue

      const y = timeToY(note.time, currentTime, hitLineY, lookaheadSeconds)

      let alpha = 1
      if (note.time < currentTime) {
        alpha = Math.max(0, 1 - (currentTime - note.time) / TRAIL_SECONDS)
      }

      const isGhost = note.noteType === 'ghost'
      const isAccent = note.noteType === 'accent'

      let lineH = KICK_LINE_HEIGHT * thickness
      if (isGhost) {
        lineH = 2 * thickness
        alpha *= 0.4
      } else if (isAccent) {
        lineH = 6 * thickness
      }

      ctx.globalAlpha = alpha

      const fwAccentGlow = isAccent && alpha > 0.3 && glow > 0
      if (fwAccentGlow) {
        ctx.shadowColor = fwLane.color
        ctx.shadowBlur = 10 * glow
      }

      ctx.fillStyle = fwLane.color
      roundRect(ctx, gridLeft + 2, y - lineH / 2, (gridRight - gridLeft) - 4, lineH, 2)
      ctx.fill()

      if (fwAccentGlow) {
        ctx.shadowColor = 'transparent'
        ctx.shadowBlur = 0
      }
    }
    ctx.globalAlpha = 1
  }

  // Column notes
  for (let i = startIdx; i < notes.length; i++) {
    const note = notes[i]!
    if (note.time > maxTime) break

    const pos = laneIndexToColumnPos.get(note.laneIndex)
    if (pos === undefined) continue

    const lane = columnLanes[pos]!
    const y = timeToY(note.time, currentTime, hitLineY, lookaheadSeconds)

    // Fade out below hit line
    let alpha = 1
    if (note.time < currentTime) {
      alpha = Math.max(0, 1 - (currentTime - note.time) / TRAIL_SECONDS)
    }

    const isGhost = note.noteType === 'ghost'
    const isAccent = note.noteType === 'accent'

    let noteW = (lane.isCymbal ? NOTE_WIDTH_CYMBAL : NOTE_WIDTH_DRUM) * thickness
    let noteH = (lane.isCymbal ? NOTE_HEIGHT_CYMBAL : NOTE_HEIGHT_DRUM) * thickness

    if (isGhost) {
      noteW *= 0.7
      noteH *= 0.7
      alpha *= 0.5
    } else if (isAccent) {
      noteW *= 1.1
      noteH *= 1.1
    }

    // Clamp so notes never overflow their column
    if (noteW > laneWidth - 4) noteW = laneWidth - 4

    const cx = startX + pos * laneWidth + laneWidth / 2
    const nx = cx - noteW / 2
    const ny = y - noteH / 2

    ctx.globalAlpha = alpha

    // Accent glow — scales with kit glowIntensity
    const colAccentGlow = isAccent && alpha > 0.3 && glow > 0
    if (colAccentGlow) {
      ctx.shadowColor = lane.color
      ctx.shadowBlur = 12 * glow
    }

    // Note body
    //   - Cymbals render hollow: bright colored outline + OPAQUE background
    //     fill so beat grid lines, full-width bars, and lane glows behind
    //     the cymbal are cleanly masked. Without this, the hollow ring
    //     shows whatever scrolls underneath through its center, which looks
    //     noisy when the note crosses a horizontal full-width bar.
    //   - Drums render solid: filled pill + white top stripe (classic look).
    if (lane.isCymbal) {
      roundRect(ctx, nx, ny, noteW, noteH, NOTE_RADIUS)
      // Opaque background fill — sits ON TOP of and hides anything underneath
      ctx.fillStyle = BG_COLOR
      ctx.fill()
      // Bright outline — slightly thicker for accents so they pop.
      // Ghosts get a thinner outline; the alpha multiplier (set via globalAlpha)
      // dims them so they still read as quieter than normal hits.
      ctx.strokeStyle = lane.color
      ctx.lineWidth = isAccent ? 2.5 : isGhost ? 1.5 : 2
      ctx.stroke()
    } else {
      // Solid drum
      ctx.fillStyle = lane.color
      roundRect(ctx, nx, ny, noteW, noteH, NOTE_RADIUS)
      ctx.fill()

      // White highlight stripe — drums only (cymbal outline is its own highlight)
      if (!isGhost) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
        roundRect(ctx, nx + 2, ny, noteW - 4, 3, 1.5)
        ctx.fill()
      }
    }

    // Reset shadow
    if (colAccentGlow) {
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
    }
  }

  ctx.globalAlpha = 1

  // Lane labels at top — use short labels when lanes are narrow
  if (laneCount > 0) {
    const labelFontSize = laneWidth < 55 ? 8 : laneWidth < 70 ? 9 : 10
    const useShortLabels = laneWidth < 55
    ctx.font = `${labelFontSize}px "Share Tech Mono", monospace`
    ctx.textAlign = 'center'
    for (let i = 0; i < laneCount; i++) {
      const lane = columnLanes[i]!
      const cx = startX + i * laneWidth + laneWidth / 2
      ctx.fillStyle = hexToRgba(lane.color, 0.5)
      ctx.fillText(useShortLabels ? lane.shortLabel : lane.label, cx, 18)
    }
  }
}

function timeToY(noteTime: number, currentTime: number, hitLineY: number, lookaheadSeconds: number): number {
  const delta = noteTime - currentTime
  return hitLineY - (delta / lookaheadSeconds) * hitLineY
}

function binarySearchFirstVisible(notes: HighwayNote[], minTime: number): number {
  let lo = 0
  let hi = notes.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (notes[mid]!.time < minTime) lo = mid + 1
    else hi = mid
  }
  return lo
}
