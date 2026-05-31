import type { HighwayNote, RlrrBpmEvent, Song } from '@/types/song'
import { resolveInstrumentLane } from '@/lib/default-kit'
import { getCurrentBpm, getCurrentTimeSig } from '@/components/highway/highway-renderer'

/**
 * Pure cue analysis for Coach Mode.
 *
 * Given a Song, produce a sorted list of cues (tempo change, meter change,
 * fill, sustained double-kick) each with the song time of the EVENT and a
 * `fireAt` ~2 bars earlier so the scheduler can warn the player ahead of time.
 *
 * Everything here is deterministic and DOM-free so it can be unit-tested and
 * memoized per song. The scheduler (use-cue-scheduler) consumes the output.
 */

export type CueType = 'tempo' | 'meter' | 'fill' | 'doubleKick'

export interface CueEvent {
  time: number // song time of the EVENT
  fireAt: number // = time - leadSeconds (when the cue should be spoken/shown)
  type: CueType
  text: string // short spoken/banner phrase, e.g. 'Speeding up, 140'
  banner: string // short banner label, e.g. '⚡ 140 BPM' (can equal text)
}

// ---------------------------------------------------------------------------
// Tunable thresholds — grouped up top so they're easy to retune.
// ---------------------------------------------------------------------------

/** A tempo change smaller than this (bpm) is treated as a wobble, not a cue. */
const TEMPO_MIN_DELTA_BPM = 2

/** Sliding window (seconds) used to measure note density for fill detection. */
const FILL_WINDOW_SEC = 0.75
/** Window step (seconds). Smaller = finer onset resolution, more work. */
const FILL_STEP_SEC = 0.125
/**
 * A window is a "spike" when its OVERALL density exceeds the song median by this
 * factor. Used as a coarse "something busy is happening here" gate.
 */
const FILL_DENSITY_FACTOR = 1.6
/**
 * Minimum distinct tom/cymbal lanes that must appear within a spike window for
 * it to count as a fill. This is the key groove-vs-fill discriminator: a steady
 * kick+snare+hat backbeat has ZERO tom/cymbal lanes, and a busy 16th-hat groove
 * has only one (hi-hat), so neither can trip the fill detector.
 */
const FILL_MIN_DISTINCT_FILL_LANES = 2
/** Absolute floor on overall density so near-silent passages can't "spike". */
const FILL_MIN_DENSITY_NPS = 4
/**
 * Fill-LANE density floor (tom/cymbal notes per second). A window counts as a
 * fill when it has enough distinct fill lanes AND clusters this many tom/cymbal
 * hits — this catches a tom roll even when it's quieter overall than a busy
 * hi-hat groove (whose fill-lane density is ~0, so it can never trip this).
 * This is the primary signal; the overall-density factor is a secondary gate
 * for fills that ride ON TOP of a groove (toms layered over hats).
 */
const FILL_MIN_FILL_LANE_NPS = 4

/** A run of >= this many kicks at fast IOI counts as a double-kick section. */
const DK_MIN_RUN = 4
/** Max inter-onset interval (seconds) between kicks to be "sustained fast". */
const DK_MAX_IOI_SEC = 0.18

/** Lead time = 2 bars at the local tempo/meter, clamped to this range (sec). */
const LEAD_BARS = 2
const LEAD_MIN_SEC = 1.5
const LEAD_MAX_SEC = 6

/** Two cues whose fireAt fall within this window (sec) collide → keep one. */
const DEDUP_WINDOW_SEC = 1.2

/** Higher number = higher priority. tempo/meter > doubleKick > fill. */
const PRIORITY: Record<CueType, number> = {
  tempo: 3,
  meter: 3,
  doubleKick: 2,
  fill: 1,
}

// ---------------------------------------------------------------------------
// Lane classification (kit-independent — uses the default class→lane mapping).
// ---------------------------------------------------------------------------

type LaneCategory = 'kick' | 'snare' | 'hihat' | 'tom' | 'cymbal' | 'other'

/** Lane ids that are "toms" for fill purposes. */
const TOM_LANE_IDS = new Set(['tom1', 'tom2', 'floorTom'])
/** Lane ids that are cymbals (excluding hi-hat, which grooves) for fill purposes. */
const CYMBAL_LANE_IDS = new Set(['crash', 'ride', 'china', 'splash'])

/**
 * Classify a note by its Paradiddle instrument class into a coarse category.
 * Resolved against the DEFAULT mapping (empty overrides) so analysis is
 * independent of whatever kit the user currently has configured.
 */
function classifyNote(note: HighwayNote): LaneCategory {
  const laneId = resolveInstrumentLane(note.instrumentClass, {})
  if (!laneId) return 'other'
  if (laneId === 'kick') return 'kick'
  if (laneId === 'snare') return 'snare'
  if (laneId === 'hihat' || laneId === 'hihatFoot') return 'hihat'
  if (TOM_LANE_IDS.has(laneId)) return 'tom'
  if (CYMBAL_LANE_IDS.has(laneId)) return 'cymbal'
  return 'other'
}

/** True for lanes that, in numbers, signal a fill (toms + non-hat cymbals). */
function isFillLane(cat: LaneCategory): boolean {
  return cat === 'tom' || cat === 'cymbal'
}

// ---------------------------------------------------------------------------
// Lead time
// ---------------------------------------------------------------------------

/** 2 bars at the tempo/meter in effect at `time`, clamped to [1.5, 6] sec. */
function leadSecondsAt(time: number, bpmEvents: RlrrBpmEvent[]): number {
  const bpm = getCurrentBpm(time, bpmEvents)
  const sig = getCurrentTimeSig(time, bpmEvents)
  const beatsPerMeasure = sig[0] > 0 ? sig[0] : 4
  const safeBpm = bpm > 0 ? bpm : 120
  const raw = (LEAD_BARS * beatsPerMeasure * 60) / safeBpm
  return Math.max(LEAD_MIN_SEC, Math.min(LEAD_MAX_SEC, raw))
}

/** Build a cue, computing fireAt from the local lead time (clamped to >= 0). */
function makeCue(
  time: number,
  type: CueType,
  text: string,
  banner: string,
  bpmEvents: RlrrBpmEvent[],
): CueEvent {
  const lead = leadSecondsAt(time, bpmEvents)
  const fireAt = Math.max(0, time - lead)
  return { time, fireAt, type, text, banner }
}

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

/** tempo + meter cues from consecutive bpmEvents. */
function detectTempoAndMeter(song: Song): CueEvent[] {
  const out: CueEvent[] = []
  const events = song.bpmEvents
  if (events.length === 0) return out

  let prevBpm = events[0]!.bpm
  // Paradiddle only restates timeSignature when it changes; carry it forward.
  let prevSig: [number, number] = events[0]!.timeSignature ?? [4, 4]

  for (let i = 1; i < events.length; i++) {
    const e = events[i]!
    const sig = e.timeSignature ?? prevSig

    // tempo
    if (Math.abs(e.bpm - prevBpm) > TEMPO_MIN_DELTA_BPM) {
      const dir = e.bpm > prevBpm ? 'Speeding up' : 'Slowing down'
      const bpm = Math.round(e.bpm)
      out.push(
        makeCue(e.time, 'tempo', `${dir}, ${bpm}`, `⚡ ${bpm} BPM`, song.bpmEvents),
      )
    }

    // meter — fires when the time signature itself changes
    if (e.timeSignature && (sig[0] !== prevSig[0] || sig[1] !== prevSig[1])) {
      const label = `${sig[0]}/${sig[1]}`
      out.push(makeCue(e.time, 'meter', label, label, song.bpmEvents))
    }

    prevBpm = e.bpm
    prevSig = sig
  }
  return out
}

/**
 * Fill detection via a sliding density window.
 *
 * Steps:
 *  1. Slide a FILL_WINDOW_SEC window across the (sorted) notes, stepping by
 *     FILL_STEP_SEC, recording each window's note density (notes/sec) and how
 *     many DISTINCT fill lanes (toms + non-hat cymbals) it contains.
 *  2. Compute the median window density over windows that actually have notes.
 *  3. A window is a spike when density > median*FILL_DENSITY_FACTOR AND it has
 *     >= FILL_MIN_DISTINCT_FILL_LANES distinct fill lanes (so a steady groove,
 *     even a busy hi-hat one, can never spike — it has 0–1 fill lanes).
 *  4. Merge adjacent/overlapping spike windows into one region; emit ONE cue at
 *     each region's onset (the time of the first fill-lane note in the region).
 */
function detectFills(song: Song): CueEvent[] {
  const out: CueEvent[] = []
  const notes = song.notes
  if (notes.length === 0) return out

  const firstT = notes[0]!.time
  const lastT = notes[notes.length - 1]!.time
  if (lastT <= firstT) return out

  interface Win {
    start: number
    end: number
    count: number
    fillCount: number
    distinctFillLanes: number
    density: number
    fillDensity: number
    isSpike: boolean
  }

  const wins: Win[] = []
  // We scan note indices with a moving [lo, hi) range to keep this O(n).
  let lo = 0
  let hi = 0
  for (let start = firstT; start <= lastT; start += FILL_STEP_SEC) {
    const end = start + FILL_WINDOW_SEC
    while (lo < notes.length && notes[lo]!.time < start) lo++
    while (hi < notes.length && notes[hi]!.time < end) hi++

    let count = 0
    let fillCount = 0
    const fillLaneIds = new Set<string>()
    for (let i = lo; i < hi; i++) {
      const n = notes[i]!
      count++
      const cat = classifyNote(n)
      if (isFillLane(cat)) {
        fillCount++
        // Distinguish lanes by resolved lane id so a 3-tom roll = 3 lanes.
        const laneId = resolveInstrumentLane(n.instrumentClass, {})
        if (laneId) fillLaneIds.add(laneId)
      }
    }
    wins.push({
      start,
      end,
      count,
      fillCount,
      distinctFillLanes: fillLaneIds.size,
      density: count / FILL_WINDOW_SEC,
      fillDensity: fillCount / FILL_WINDOW_SEC,
      isSpike: false,
    })
  }

  // Median OVERALL density over non-empty windows (coarse "busy" baseline).
  const densities = wins.filter((w) => w.count > 0).map((w) => w.density).sort((a, b) => a - b)
  if (densities.length === 0) return out
  const median =
    densities.length % 2 === 1
      ? densities[(densities.length - 1) / 2]!
      : (densities[densities.length / 2 - 1]! + densities[densities.length / 2]!) / 2
  const overallThreshold = Math.max(FILL_MIN_DENSITY_NPS, median * FILL_DENSITY_FACTOR)

  // A window spikes when it has enough DISTINCT fill lanes (toms/cymbals) AND
  // either a strong fill-lane cluster (the primary signal — works even when the
  // fill is quieter overall than a busy hat groove) or an overall-density jump
  // above the song baseline (fills layered on top of a groove). A steady groove
  // has 0–1 fill lanes, so the distinct-lane gate alone keeps it from spiking.
  for (const w of wins) {
    if (w.distinctFillLanes < FILL_MIN_DISTINCT_FILL_LANES) continue
    const fillDense = w.fillDensity >= FILL_MIN_FILL_LANE_NPS
    const overallDense = w.density >= overallThreshold
    w.isSpike = fillDense || overallDense
  }

  // Merge adjacent spike windows into regions. Two spike windows belong to the
  // same region when the later window's start is within FILL_WINDOW_SEC of the
  // previous spike window's start (i.e. they overlap or touch).
  let regionStart: number | null = null
  let prevSpikeStart = -Infinity
  const regions: { start: number; end: number }[] = []
  for (const w of wins) {
    if (w.isSpike) {
      if (regionStart === null || w.start - prevSpikeStart > FILL_WINDOW_SEC) {
        if (regionStart !== null) regions.push({ start: regionStart, end: prevSpikeStart + FILL_WINDOW_SEC })
        regionStart = w.start
      }
      prevSpikeStart = w.start
    }
  }
  if (regionStart !== null) regions.push({ start: regionStart, end: prevSpikeStart + FILL_WINDOW_SEC })

  // Emit one cue per region, at the onset = time of the first fill-lane note
  // inside the region window (falls back to the region start).
  for (const r of regions) {
    let onset = r.start
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i]!
      if (n.time < r.start) continue
      if (n.time > r.end) break
      if (isFillLane(classifyNote(n))) {
        onset = n.time
        break
      }
    }
    out.push(makeCue(onset, 'fill', 'Big fill coming', 'FILL →', song.bpmEvents))
  }
  return out
}

/** doubleKick cues: runs of >= DK_MIN_RUN kicks with IOI <= DK_MAX_IOI_SEC. */
function detectDoubleKick(song: Song): CueEvent[] {
  const out: CueEvent[] = []
  const kicks = song.notes
    .filter((n) => classifyNote(n) === 'kick')
    .map((n) => n.time)
    .sort((a, b) => a - b)
  if (kicks.length < DK_MIN_RUN) return out

  let runStart = 0 // index into kicks
  let runLen = 1
  const flush = (startIdx: number, len: number) => {
    if (len >= DK_MIN_RUN) {
      const onset = kicks[startIdx]!
      out.push(
        makeCue(onset, 'doubleKick', 'Double kick section', 'DOUBLE KICK', song.bpmEvents),
      )
    }
  }

  for (let i = 1; i < kicks.length; i++) {
    const ioi = kicks[i]! - kicks[i - 1]!
    if (ioi <= DK_MAX_IOI_SEC) {
      runLen++
    } else {
      flush(runStart, runLen)
      runStart = i
      runLen = 1
    }
  }
  flush(runStart, runLen)
  return out
}

// ---------------------------------------------------------------------------
// Dedup / spacing
// ---------------------------------------------------------------------------

/**
 * Drop lower-priority cues that fire within DEDUP_WINDOW_SEC of a kept cue.
 * Greedy by priority (then earlier fireAt): walk highest-priority first, keep
 * it, and suppress any not-yet-kept cue whose fireAt is within the window of an
 * already-kept cue.
 */
function dedupBySpacing(cues: CueEvent[]): CueEvent[] {
  // Sort by priority desc, then fireAt asc, so we consider the "most important,
  // earliest" cues first.
  const order = cues
    .map((c, idx) => ({ c, idx }))
    .sort((a, b) => {
      const p = PRIORITY[b.c.type] - PRIORITY[a.c.type]
      if (p !== 0) return p
      if (a.c.fireAt !== b.c.fireAt) return a.c.fireAt - b.c.fireAt
      return a.idx - b.idx
    })

  const kept: CueEvent[] = []
  for (const { c } of order) {
    const collides = kept.some((k) => Math.abs(k.fireAt - c.fireAt) < DEDUP_WINDOW_SEC)
    if (!collides) kept.push(c)
  }
  return kept
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/** Analyze a song into a list of coach cues, sorted by fireAt ascending. */
export function analyzeCues(song: Song): CueEvent[] {
  const all = [
    ...detectTempoAndMeter(song),
    ...detectFills(song),
    ...detectDoubleKick(song),
  ]
  const deduped = dedupBySpacing(all)
  deduped.sort((a, b) => a.fireAt - b.fireAt)
  return deduped
}
