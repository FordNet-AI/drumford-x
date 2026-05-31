import { useEffect, useMemo, useRef } from 'react'
import { usePlayerStore } from '@/stores/player-store'
import { useCoachStore, type EventCueKey, type UserCue } from '@/stores/coach-store'
import { useCoachRuntime } from '@/stores/coach-runtime'
import { speak } from '@/lib/coach/speech'
import {
  analyzeCues,
  userCuesToCueEvents,
  type CueEvent,
  type CueType,
} from '@/lib/coach/cue-analysis'

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
 *  - Each AUTO cue type is gated by its per-event toggle (eventCues.*). USER cues
 *    (drummer-authored, merged in from userCuesToCueEvents) have NO per-type
 *    toggle — they fire whenever Coach + voice/banner are on. Within a fired cue,
 *    voice is gated by voiceEnabled and the banner by bannerEnabled.
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

/**
 * Stable empty user-cue list. Returned by the store selector when the active
 * song has no cues so the selector's identity is constant (no needless memo
 * re-runs / re-renders from a fresh `[]` each call).
 */
const EMPTY_USER_CUES: UserCue[] = []

/** Brief "GO" flash duration (ms) shown the instant the drummer re-enters. */
const GO_BANNER_MS = 700

/**
 * Map each gated cue type to the per-event toggle key that controls it.
 *
 * 'user' is intentionally ABSENT: user cues are explicit drummer intent and have
 * no per-type toggle — they fire whenever Coach + voice/banner are on. ('reentry'
 * is present but handled in its own pass below.)
 */
const CUE_TYPE_TO_TOGGLE: Partial<Record<CueType, EventCueKey>> = {
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
 * Pure result of advancing one countdown cue to `currentTime` given the count
 * beats already ticked. Side-effect-free so it can be unit-tested without a DOM
 * or speech engine — the hook applies the returned actions.
 */
export interface CountdownTickResult {
  /** Count-beat indices newly crossed this tick (added to the fired set). */
  newBeatIndices: number[]
  /** Banners to show, in order (count digits / target, then the terminal flash). */
  banners: BannerAction[]
  /** Spoken words, in order (e.g. ['four','three']). */
  speaks: string[]
  /** True once the terminal hit ("GO" / the change) has been reached. */
  goFired: boolean
}

/**
 * Advance a single COUNTDOWN cue (reentry / tempo / meter) to `currentTime`,
 * given which count beats have already fired. Returns the banner/speak actions
 * plus the terminal flag — WITHOUT mutating anything or touching the DOM. The
 * hook owns the fired-beat set and the actual `showBanner`/`speak` calls.
 *
 * - Count beats ascend in time; the value spoken DESCENDS (beat index j →
 *   value = countdown.length - j), so 4/4 ticks "four, three, two, one".
 * - Banner per beat: a 'reentry' flashes the descending DIGIT; a tempo/meter
 *   change holds its TARGET banner (⚡140 BPM / 7/8) up the whole count. The
 *   terminal is "GO" for a reentry, or one more target flash for tempo/meter
 *   (the change just lands — no "GO"). The banner `kind` is the cue type.
 * - The runtime min-gap is intentionally NOT applied here: count beats are ~1
 *   beat apart by design and each must fire.
 * - When `bannerEnabled` / `voiceEnabled` are false, the corresponding action
 *   list is simply empty (the beat is still marked crossed by the caller).
 */
export function planCountdownTick(
  cue: CueEvent,
  currentTime: number,
  firedBeats: ReadonlySet<number>,
  opts: { bannerEnabled: boolean; voiceEnabled: boolean },
): CountdownTickResult {
  const result: CountdownTickResult = { newBeatIndices: [], banners: [], speaks: [], goFired: false }
  const beats = cue.countdown
  if (!beats || beats.length === 0) return result
  if (cue.fireAt > currentTime) return result

  // Local beat duration: the last count beat is exactly one beat before the hit.
  const beatDur = Math.max(0.05, cue.time - beats[beats.length - 1]!)
  const isReentry = cue.type === 'reentry'

  for (let j = 0; j < beats.length; j++) {
    if (firedBeats.has(j)) continue
    if (beats[j]! > currentTime) break // ascending in time
    result.newBeatIndices.push(j)
    const value = beats.length - j
    if (opts.bannerEnabled) {
      result.banners.push({
        text: isReentry ? String(value) : cue.banner,
        durationMs: beatDur * 1000 * COUNT_BANNER_BEAT_FACTOR,
        kind: cue.type,
      })
    }
    if (opts.voiceEnabled) {
      result.speaks.push(COUNT_WORDS[value] ?? String(value))
    }
  }

  if (currentTime >= cue.time) {
    result.goFired = true
    if (opts.bannerEnabled) {
      // Re-entry flashes "GO"; a tempo/meter change just lands, so hold the
      // target banner a beat longer instead.
      result.banners.push(
        isReentry
          ? { text: 'GO', durationMs: GO_BANNER_MS, kind: 'reentry' }
          : { text: cue.banner, durationMs: BANNER_MS, kind: cue.type },
      )
    }
  }

  return result
}

export function useCueScheduler(): void {
  const activeSong = usePlayerStore((s) => s.activeSong)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const coachEnabled = useCoachStore((s) => s.coachEnabled)

  // Subscribe to JUST this song's user-cue list. Its array identity changes only
  // when the active song's cues are added/updated/deleted (the store builds a new
  // array on every mutation), so the memo below re-runs on edits but NOT when an
  // unrelated song's cues change. Falls back to a stable empty array.
  const userCues = useCoachStore((s) =>
    activeSong ? s.userCues[activeSong.id] ?? EMPTY_USER_CUES : EMPTY_USER_CUES,
  )

  // Analyze once per song, then merge the drummer's own cues in. Cheap to
  // recompute, but memoizing keeps it off the per-frame path and gives us a
  // stable array identity to key the effect on. Re-runs when the song changes OR
  // when this song's user-cue list changes (so edits take effect on the next
  // replay without a reload).
  const cues = useMemo<CueEvent[]>(() => {
    if (!activeSong) return []
    try {
      const auto = analyzeCues(activeSong)
      const user = userCuesToCueEvents(userCues, activeSong.bpmEvents)
      // Merge + re-sort by fireAt. User cues are EXEMPT from the analysis-time
      // priority dedup (explicit drummer intent — never dropped); they coexist
      // with any auto cue at the same spot, just like reentry cues.
      const merged = [...auto, ...user]
      merged.sort((a, b) => a.fireAt - b.fireAt)
      return merged
    } catch (err) {
      // Coach Mode is an ENHANCEMENT — it must never crash the player. If cue
      // analysis throws on some chart's data, degrade to no cues (and log the
      // exact error + offending song so the root cause is fixable) rather than
      // letting the throw unmount the highway into a black screen.
      console.error('[coach] cue analysis failed — coach cues disabled for this song:', activeSong?.title, err)
      return []
    }
  }, [activeSong, userCues])

  // Which single-fire cue indices have already fired this pass.
  const firedRef = useRef<Set<number>>(new Set())
  // Per-countdown-cue: which count beat indices have already ticked. Keyed by
  // the cue's index in `cues`. A countdown (reentry / tempo / meter) stays
  // "active" across many frames, so it can't live in firedRef (which gates a
  // one-shot + the scan break).
  const countdownBeatsRef = useRef<Map<number, Set<number>>>(new Map())
  // Countdown cue indices whose terminal hit ("GO" / the change) has fired.
  const countdownGoRef = useRef<Set<number>>(new Set())
  // Last clock value we saw — used to detect backward jumps (seek/rewind).
  const lastTimeRef = useRef(0)
  // Wall-clock-independent: the song-time of the last SPOKEN cue (for min-gap).
  const lastSpokenTimeRef = useRef(-Infinity)

  // Reset everything when the cue set changes (i.e. the song changed).
  useEffect(() => {
    firedRef.current = new Set()
    countdownBeatsRef.current = new Map()
    countdownGoRef.current = new Set()
    lastTimeRef.current = 0
    lastSpokenTimeRef.current = -Infinity
  }, [cues])

  useEffect(() => {
    // Detect a backward jump (rewind / seek-back) and reset the fired-sets so
    // the replayed region re-fires. Do this regardless of coachEnabled so
    // toggling Coach on mid-rewind doesn't inherit a stale fired-set.
    if (currentTime < lastTimeRef.current - BACKWARD_JUMP_TOLERANCE_SEC) {
      firedRef.current = new Set()
      countdownBeatsRef.current = new Map()
      countdownGoRef.current = new Set()
      lastSpokenTimeRef.current = -Infinity
    }
    lastTimeRef.current = currentTime

    if (!coachEnabled) return
    if (cues.length === 0) return

    // Everything below is wrapped so a runtime throw (speech engine, banner,
    // countdown math) can never crash playback — at worst this frame is skipped.
    try {
      // Read live toggle state (avoids re-subscribing the whole hook to every
      // toggle; firing is gated at the moment a cue would fire).
      const coach = useCoachStore.getState()
      const runtime = useCoachRuntime.getState()

    // --- Single-fire cues (fill / double-kick / section / user, plus any
    //     tempo/meter change with no room to count in) ----------------------
    // Sorted by fireAt; once we hit a future one the rest are future too.
    // COUNTDOWN cues (reentry + tempo/meter that carry a count bar) are handled
    // in the pass below and skipped here — their multi-beat span would otherwise
    // trip the early break and stall later cues.
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i]!
      if (cue.countdown && cue.countdown.length > 0) continue
      if (firedRef.current.has(i)) continue
      if (cue.fireAt > currentTime) break

      // Mark fired immediately so a cue we deliberately suppress (toggle off,
      // min-gap) doesn't re-evaluate every subsequent frame.
      firedRef.current.add(i)

      // Per-type toggle gate. 'user' cues have NO toggle (toggleKey undefined) —
      // they're explicit drummer intent and fire whenever Coach + voice/banner
      // are on, gated only by the master switch (already checked above).
      const toggleKey = CUE_TYPE_TO_TOGGLE[cue.type]
      if (toggleKey && !coach.eventCues[toggleKey]) continue

      // Banner — independently gated; the banner component also re-checks the
      // toggles before painting.
      if (coach.bannerEnabled) {
        runtime.showBanner(cue.banner, BANNER_MS, cue.type)
      }

      // Voice — gated + runtime min-gap so utterances don't stack/cancel.
      // 'user' cues bypass the min-gap (explicit drummer intent — never silently
      // dropped), though they still update lastSpokenTime so a following AUTO cue
      // doesn't immediately talk over them.
      if (coach.voiceEnabled) {
        const isUser = cue.type === 'user'
        if (isUser || cue.fireAt - lastSpokenTimeRef.current >= RUNTIME_MIN_GAP_SEC) {
          speak(cue.text)
          lastSpokenTimeRef.current = cue.fireAt
        }
      }
    }

    // --- Countdown cues (reentry / tempo / meter) ---------------------------
    // Each is an atomic multi-beat sequence: tick one descending number per
    // count beat as the clock crosses it. A reentry flashes the digit + "GO"; a
    // tempo/meter change holds its target banner and just lands. No early break
    // (a countdown stays active across many frames, and the single-fire cues
    // were handled above). Cheap: few cues total.
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i]!
      if (!cue.countdown || cue.countdown.length === 0) continue
      // Nothing to do until the first count beat is reached.
      if (cue.fireAt > currentTime) continue
      // Whole sequence already finished — skip.
      if (countdownGoRef.current.has(i)) continue

      // Per-type toggle (cueReentry / cueTempo / cueMeter): if this cue type is
      // off, consume the sequence silently so it never re-evaluates this pass.
      const toggleKey = CUE_TYPE_TO_TOGGLE[cue.type]
      if (toggleKey && !coach.eventCues[toggleKey]) {
        countdownGoRef.current.add(i)
        continue
      }

      let fired = countdownBeatsRef.current.get(i)
      if (!fired) {
        fired = new Set()
        countdownBeatsRef.current.set(i, fired)
      }

      // Pure planning step (unit-tested) → apply its side effects here.
      const plan = planCountdownTick(cue, currentTime, fired, {
        bannerEnabled: coach.bannerEnabled,
        voiceEnabled: coach.voiceEnabled,
      })
      for (const j of plan.newBeatIndices) fired.add(j)
      for (const b of plan.banners) runtime.showBanner(b.text, b.durationMs, b.kind)
      // Count beats are intentionally ~1 beat apart and bypass the min-gap.
      for (const word of plan.speaks) speak(word)
      if (plan.goFired) countdownGoRef.current.add(i)
    }
    } catch (err) {
      console.error('[coach] cue scheduler tick failed — skipping this frame:', err)
    }
  }, [currentTime, coachEnabled, cues])
}
