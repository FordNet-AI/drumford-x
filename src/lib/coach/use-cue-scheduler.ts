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
 */
const RUNTIME_MIN_GAP_SEC = 1.2

/** Map each cue type to the per-event toggle key that gates it. */
const CUE_TYPE_TO_TOGGLE: Record<CueType, EventCueKey> = {
  tempo: 'cueTempo',
  meter: 'cueMeter',
  fill: 'cueFill',
  doubleKick: 'cueDoubleKick',
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

  // Which cue indices have already fired this pass.
  const firedRef = useRef<Set<number>>(new Set())
  // Last clock value we saw — used to detect backward jumps (seek/rewind).
  const lastTimeRef = useRef(0)
  // Wall-clock-independent: the song-time of the last SPOKEN cue (for min-gap).
  const lastSpokenTimeRef = useRef(-Infinity)

  // Reset everything when the cue set changes (i.e. the song changed).
  useEffect(() => {
    firedRef.current = new Set()
    lastTimeRef.current = 0
    lastSpokenTimeRef.current = -Infinity
  }, [cues])

  useEffect(() => {
    // Detect a backward jump (rewind / seek-back) and reset the fired-set so the
    // replayed region re-fires. Do this regardless of coachEnabled so toggling
    // Coach on mid-rewind doesn't inherit a stale fired-set.
    if (currentTime < lastTimeRef.current - BACKWARD_JUMP_TOLERANCE_SEC) {
      firedRef.current = new Set()
      lastSpokenTimeRef.current = -Infinity
    }
    lastTimeRef.current = currentTime

    if (!coachEnabled) return
    if (cues.length === 0) return

    // Read live toggle state (avoids re-subscribing the whole hook to every
    // toggle; firing is gated at the moment a cue would fire).
    const coach = useCoachStore.getState()
    const runtime = useCoachRuntime.getState()

    for (let i = 0; i < cues.length; i++) {
      if (firedRef.current.has(i)) continue
      const cue = cues[i]!
      if (cue.fireAt > currentTime) {
        // Cues are sorted by fireAt — once we hit a future one, the rest are
        // future too.
        break
      }

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
  }, [currentTime, coachEnabled, cues])
}
