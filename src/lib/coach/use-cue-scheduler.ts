import { useEffect, useMemo, useRef } from 'react'
import { usePlayerStore } from '@/stores/player-store'
import { useCoachStore, type EventCueKey } from '@/stores/coach-store'
import { useCoachRuntime } from '@/stores/coach-runtime'
import { speak } from '@/lib/coach/speech'
import { analyzeCues, type CueEvent, type CueType } from '@/lib/coach/cue-analysis'

/**
 * Coach Mode cue scheduler.
 *
 * Analyzes the active song into cues once (memoized), then watches the player
 * clock (`currentTime`, updated every animation frame by player-store.tick())
 * and fires each cue when playback reaches its `fireAt` — speaking it and/or
 * flashing a banner ~2 bars ahead of the actual event.
 *
 * Reset semantics:
 *  - When the song changes, the fired-set clears (the memo recomputes and the
 *    effect re-keys on the new cue array).
 *  - When `currentTime` jumps BACKWARD (a seek / rewind), the fired-set clears
 *    so replaying a passage re-fires its cues. A tiny tolerance avoids resetting
 *    on the sub-millisecond clock jitter that can occur frame-to-frame.
 *
 * Gating:
 *  - Does nothing at all when Coach Mode is off (coachEnabled === false).
 *  - Each cue type is gated by its per-event toggle (eventCues.*). Within a
 *    fired cue, voice is gated by voiceEnabled and the banner by bannerEnabled.
 *  - A runtime min-gap (RUNTIME_MIN_GAP_SEC) suppresses spoken cues that would
 *    stack too close together — belt-and-suspenders on top of the analysis-time
 *    spacing/dedup, in case a backward seek lands mid-cluster.
 */

/** Banner display duration (ms). */
const BANNER_MS = 2500

/**
 * Detect a backward jump only when the clock moves back by more than this
 * (seconds). Guards against treating per-frame float jitter as a seek.
 */
const BACKWARD_JUMP_TOLERANCE_SEC = 0.25

/**
 * Minimum spacing between SPOKEN cues at runtime. The analysis already spaces
 * cues, but a rewind can drop the playhead into the middle of a cluster, so we
 * re-enforce it live to avoid two utterances cancelling each other instantly.
 *
 * NOTE: this applies to single-fire cues only. The re-entry countdown beats are
 * intentionally ~1 beat apart and bypass this gate entirely.
 */
const RUNTIME_MIN_GAP_SEC = 1.2

/**
 * Spoken words for the descending count-in. Index 1 → "one", up to the max
 * count beats (REENTRY_MAX_COUNT_BEATS in cue-analysis). The banner shows the
 * digit; the voice speaks the word.
 */
const COUNT_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']

/** Per-count banner duration multiplier over one beat (so the digit lingers ~1 beat). */
const COUNT_BANNER_BEAT_FACTOR = 1.1

/** Brief "GO" flash duration (ms) shown the instant the drummer re-enters. */
const GO_BANNER_MS = 700

/** Map each cue type to the per-event toggle key that gates it. */
const CUE_TYPE_TO_TOGGLE: Record<CueType, EventCueKey> = {
  tempo: 'cueTempo',
  meter: 'cueMeter',
  fill: 'cueFill',
  doubleKick: 'cueDoubleKick',
  section: 'cueSection',
  reentry: 'cueReentry',
}

/** One banner action a tick wants performed. */
export interface BannerAction {
  text: string
  durationMs: number
  kind: string
}

/**
 * Pure result of advancing one re-entry cue to `currentTime` given the count
 * beats already ticked. Side-effect-free so it can be unit-tested without a DOM
 * or speech engine — the hook applies the returned actions.
 */
export interface ReentryTickResult {
  /** Count-beat indices newly crossed this tick (added to the fired set). */
  newBeatIndices: number[]
  /** Banners to show, in order (count digits then optional "GO"). */
  banners: BannerAction[]
  /** Spoken words, in order (e.g. ['four','three']). */
  speaks: string[]
  /** True once the terminal "GO" / hit has been reached this/earlier tick. */
  goFired: boolean
}

/**
 * Advance a single 'reentry' cue to `currentTime`, given which count beats have
 * already fired. Returns the banner/speak actions to perform plus the terminal
 * GO flag — WITHOUT mutating anything or touching the DOM. The hook owns the
 * fired-beat set and the actual `showBanner`/`speak` calls.
 *
 * - Count beats ascend in time; the value spoken DESCENDS (beat index j →
 *   value = countdown.length - j), so 4/4 ticks "four, three, two, one".
 * - The runtime min-gap is intentionally NOT applied here: count beats are ~1
 *   beat apart by design and each must fire.
 * - When `bannerEnabled` / `voiceEnabled` are false, the corresponding action
 *   list is simply empty (the beat is still marked crossed by the caller).
 */
export function planReentryTick(
  cue: CueEvent,
  currentTime: number,
  firedBeats: ReadonlySet<number>,
  opts: { bannerEnabled: boolean; voiceEnabled: boolean },
): ReentryTickResult {
  const result: ReentryTickResult = { newBeatIndices: [], banners: [], speaks: [], goFired: false }
  const beats = cue.countdown
  if (!beats || beats.length === 0) return result
  if (cue.fireAt > currentTime) return result

  // Local beat duration: the last count beat is exactly one beat before the hit.
  const beatDur = Math.max(0.05, cue.time - beats[beats.length - 1]!)

  for (let j = 0; j < beats.length; j++) {
    if (firedBeats.has(j)) continue
    if (beats[j]! > currentTime) break // ascending in time
    result.newBeatIndices.push(j)
    const value = beats.length - j
    if (opts.bannerEnabled) {
      result.banners.push({
        text: String(value),
        durationMs: beatDur * 1000 * COUNT_BANNER_BEAT_FACTOR,
        kind: 'reentry',
      })
    }
    if (opts.voiceEnabled) {
      result.speaks.push(COUNT_WORDS[value] ?? String(value))
    }
  }

  if (currentTime >= cue.time) {
    result.goFired = true
    if (opts.bannerEnabled) {
      result.banners.push({ text: 'GO', durationMs: GO_BANNER_MS, kind: 'reentry' })
    }
  }

  return result
}

export function useCueScheduler(): void {
  const activeSong = usePlayerStore((s) => s.activeSong)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const coachEnabled = useCoachStore((s) => s.coachEnabled)

  // Analyze once per song. Cheap to recompute, but memoizing keeps it off the
  // per-frame path and gives us a stable array identity to key the effect on.
  const cues = useMemo<CueEvent[]>(
    () => (activeSong ? analyzeCues(activeSong) : []),
    [activeSong],
  )

  // Which single-fire cue indices have already fired this pass.
  const firedRef = useRef<Set<number>>(new Set())
  // Per-reentry-cue: which countdown beat indices have already ticked. Keyed by
  // the cue's index in `cues`. A reentry stays "active" across many frames, so
  // it can't live in firedRef (which gates a one-shot + the scan break).
  const reentryBeatsRef = useRef<Map<number, Set<number>>>(new Map())
  // Reentry cue indices whose terminal "GO" / clear has already fired.
  const reentryGoRef = useRef<Set<number>>(new Set())
  // Last clock value we saw — used to detect backward jumps (seek/rewind).
  const lastTimeRef = useRef(0)
  // Wall-clock-independent: the song-time of the last SPOKEN cue (for min-gap).
  const lastSpokenTimeRef = useRef(-Infinity)

  // Reset everything when the cue set changes (i.e. the song changed).
  useEffect(() => {
    firedRef.current = new Set()
    reentryBeatsRef.current = new Map()
    reentryGoRef.current = new Set()
    lastTimeRef.current = 0
    lastSpokenTimeRef.current = -Infinity
  }, [cues])

  useEffect(() => {
    // Detect a backward jump (rewind / seek-back) and reset the fired-sets so
    // the replayed region re-fires. Do this regardless of coachEnabled so
    // toggling Coach on mid-rewind doesn't inherit a stale fired-set.
    if (currentTime < lastTimeRef.current - BACKWARD_JUMP_TOLERANCE_SEC) {
      firedRef.current = new Set()
      reentryBeatsRef.current = new Map()
      reentryGoRef.current = new Set()
      lastSpokenTimeRef.current = -Infinity
    }
    lastTimeRef.current = currentTime

    if (!coachEnabled) return
    if (cues.length === 0) return

    // Read live toggle state (avoids re-subscribing the whole hook to every
    // toggle; firing is gated at the moment a cue would fire).
    const coach = useCoachStore.getState()
    const runtime = useCoachRuntime.getState()

    // --- Single-fire cues (tempo/meter/fill/doubleKick/section) -------------
    // Sorted by fireAt; once we hit a future one the rest are future too.
    // Re-entry cues are NOT single-fire — they're handled in the pass below and
    // skipped here (their multi-beat span would otherwise wrongly trip the
    // early break and stall later cues).
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i]!
      if (cue.type === 'reentry') continue
      if (firedRef.current.has(i)) continue
      if (cue.fireAt > currentTime) break

      // Mark fired immediately so a cue we deliberately suppress (toggle off,
      // min-gap) doesn't re-evaluate every subsequent frame.
      firedRef.current.add(i)

      // Per-type toggle gate.
      if (!coach.eventCues[CUE_TYPE_TO_TOGGLE[cue.type]]) continue

      // Banner — independently gated; the banner component also re-checks the
      // toggles before painting.
      if (coach.bannerEnabled) {
        runtime.showBanner(cue.banner, BANNER_MS, cue.type)
      }

      // Voice — gated + runtime min-gap so utterances don't stack/cancel.
      if (coach.voiceEnabled) {
        if (cue.fireAt - lastSpokenTimeRef.current >= RUNTIME_MIN_GAP_SEC) {
          speak(cue.text)
          lastSpokenTimeRef.current = cue.fireAt
        }
      }
    }

    // --- Re-entry count-ins -------------------------------------------------
    // Each is an atomic multi-beat sequence: tick one descending number per
    // countdown beat as the clock crosses it, then a brief "GO" at the hit.
    // No early break (a reentry stays active across many frames, and later
    // single-fire cues were already handled above). Cheap: few cues total.
    const reentryEnabled = coach.eventCues.cueReentry
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i]!
      if (cue.type !== 'reentry' || !cue.countdown) continue
      // Nothing to do until the first count beat is reached.
      if (cue.fireAt > currentTime) continue
      // Whole sequence already finished (GO fired) — skip.
      if (reentryGoRef.current.has(i)) continue

      // Per-type toggle: if re-entry cues are off, consume the sequence silently
      // (mark GO fired) so it never re-evaluates this pass.
      if (!reentryEnabled) {
        reentryGoRef.current.add(i)
        continue
      }

      let fired = reentryBeatsRef.current.get(i)
      if (!fired) {
        fired = new Set()
        reentryBeatsRef.current.set(i, fired)
      }

      // Pure planning step (unit-tested) → apply its side effects here.
      const plan = planReentryTick(cue, currentTime, fired, {
        bannerEnabled: coach.bannerEnabled,
        voiceEnabled: coach.voiceEnabled,
      })
      for (const j of plan.newBeatIndices) fired.add(j)
      for (const b of plan.banners) runtime.showBanner(b.text, b.durationMs, b.kind)
      // Count beats are intentionally ~1 beat apart and bypass the min-gap.
      for (const word of plan.speaks) speak(word)
      if (plan.goFired) reentryGoRef.current.add(i)
    }
  }, [currentTime, coachEnabled, cues])
}
