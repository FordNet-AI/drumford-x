import { create } from 'zustand'

/**
 * Drill Mode — practice looper + tempo ramp (session-only; NOT persisted).
 *
 * Bracket a trouble spot (Set A / Set B at the playhead), loop it, and
 * optionally let the tempo ramp up pass-by-pass until you're at full speed.
 * This store holds only the loop/ramp STATE; the actual seek-back-to-A and
 * setSpeed are driven by use-drill-loop.ts (which owns the audio engine seam).
 *
 * Deliberately transient (like coach-runtime): a drilled loop is ephemeral, so
 * it resets when you change songs or leave the player (resetDrill()).
 */

/** Ramp percent is expressed as % of full tempo and clamped to this range. */
export const RAMP_MIN_PCT = 25
export const RAMP_MAX_PCT = 100
/** Ramp step (% added per clean pass) clamp. */
export const RAMP_STEP_MIN_PCT = 1
export const RAMP_STEP_MAX_PCT = 50

/** Default ramp: start at 70%, +5% per pass, top out at 100% (~7 passes). */
export const DRILL_DEFAULTS = {
  rampStartPct: 70,
  rampStepPct: 5,
  rampTargetPct: 100,
} as const

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n))

/**
 * Advance the ramp one step without overshooting the target.
 * Pure + exported for unit testing.
 */
export function nextRampPct(current: number, step: number, target: number): number {
  return Math.min(target, current + step)
}

/**
 * True when the playhead has reached the loop end and a wrap back to the loop
 * start is due. Pure + exported so the wrap decision is unit-tested without a
 * DOM / audio engine. Requires a valid, armed loop and active playback.
 */
export function shouldWrap(
  currentTime: number,
  loopStart: number | null,
  loopEnd: number | null,
  loopEnabled: boolean,
  isPlaying: boolean,
): boolean {
  return (
    loopEnabled &&
    isPlaying &&
    loopStart != null &&
    loopEnd != null &&
    loopEnd > loopStart &&
    currentTime >= loopEnd
  )
}

interface DrillState {
  /** Loop start (A) / end (B) in song seconds, or null when unset. Invariant:
   *  when both are set, loopEnd > loopStart (enforced by the setters). */
  loopStart: number | null
  loopEnd: number | null
  /** Loop armed — playback wraps B→A while this is on. */
  loopEnabled: boolean

  /** Tempo ramp armed — speed climbs one step per pass while looping. */
  rampEnabled: boolean
  rampStartPct: number
  rampStepPct: number
  rampTargetPct: number
  /** Live ramp speed (%). Walks rampStartPct → rampTargetPct as the loop runs. */
  liveRampPct: number

  setLoopStart: (time: number) => void
  setLoopEnd: (time: number) => void
  clearLoop: () => void
  setLoopEnabled: (on: boolean) => void

  setRampEnabled: (on: boolean) => void
  setRampStartPct: (pct: number) => void
  setRampStepPct: (pct: number) => void
  setRampTargetPct: (pct: number) => void

  /** Reset ramp progress to the start % (called when (re)arming loop/ramp). */
  resetRampProgress: () => void
  /** Advance the live ramp one step; returns the new %. */
  advanceRamp: () => number

  /** Full reset — called on song change / leaving the player. */
  resetDrill: () => void
}

export const useDrillStore = create<DrillState>()((set, get) => ({
  loopStart: null,
  loopEnd: null,
  loopEnabled: false,
  rampEnabled: false,
  rampStartPct: DRILL_DEFAULTS.rampStartPct,
  rampStepPct: DRILL_DEFAULTS.rampStepPct,
  rampTargetPct: DRILL_DEFAULTS.rampTargetPct,
  liveRampPct: DRILL_DEFAULTS.rampStartPct,

  setLoopStart: (time) => {
    const t = Math.max(0, time)
    const { loopEnd } = get()
    // If B is now at/behind the new A, it's invalid — drop it so the user
    // re-marks B after A. Keeps the loopEnd > loopStart invariant.
    set({ loopStart: t, loopEnd: loopEnd != null && loopEnd <= t ? null : loopEnd })
  },

  setLoopEnd: (time) => {
    const t = Math.max(0, time)
    const { loopStart } = get()
    // B must sit after A. If it doesn't, ignore (the UI also disables this).
    if (loopStart != null && t <= loopStart) return
    set({ loopEnd: t })
  },

  clearLoop: () => set({ loopStart: null, loopEnd: null, loopEnabled: false }),

  setLoopEnabled: (on) => {
    // Arming (re)bases the ramp so a fresh drill starts slow again.
    if (on) set({ loopEnabled: true, liveRampPct: get().rampStartPct })
    else set({ loopEnabled: false })
  },

  setRampEnabled: (on) =>
    set({ rampEnabled: on, liveRampPct: on ? get().rampStartPct : get().liveRampPct }),

  setRampStartPct: (pct) => {
    const v = clamp(Math.round(pct), RAMP_MIN_PCT, RAMP_MAX_PCT)
    // Re-baseline the live ramp to the new start (and keep target >= start).
    set({ rampStartPct: v, liveRampPct: v, rampTargetPct: Math.max(v, get().rampTargetPct) })
  },

  setRampStepPct: (pct) =>
    set({ rampStepPct: clamp(Math.round(pct), RAMP_STEP_MIN_PCT, RAMP_STEP_MAX_PCT) }),

  setRampTargetPct: (pct) => {
    const v = clamp(Math.round(pct), RAMP_MIN_PCT, RAMP_MAX_PCT)
    // Target can't dip below the start.
    set({ rampTargetPct: Math.max(v, get().rampStartPct) })
  },

  resetRampProgress: () => set({ liveRampPct: get().rampStartPct }),

  advanceRamp: () => {
    const { liveRampPct, rampStepPct, rampTargetPct } = get()
    const next = nextRampPct(liveRampPct, rampStepPct, rampTargetPct)
    set({ liveRampPct: next })
    return next
  },

  resetDrill: () =>
    set({
      loopStart: null,
      loopEnd: null,
      loopEnabled: false,
      rampEnabled: false,
      rampStartPct: DRILL_DEFAULTS.rampStartPct,
      rampStepPct: DRILL_DEFAULTS.rampStepPct,
      rampTargetPct: DRILL_DEFAULTS.rampTargetPct,
      liveRampPct: DRILL_DEFAULTS.rampStartPct,
    }),
}))
