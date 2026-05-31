import { create } from 'zustand'

const COACH_STORAGE_KEY = 'drumford-coach-prefs'

/** Allowed rewind intervals (seconds). The setter clamps to one of these. */
const REWIND_INTERVALS = [5, 10, 20] as const

/** Allowed count-in lengths (bars). The setter clamps to one of these. */
const COUNT_IN_BARS = [0, 1, 2] as const

/** Allowed metronome subdivisions. */
const SUBDIVISIONS = ['quarter', 'eighth', 'sixteenth'] as const
export type Subdivision = (typeof SUBDIVISIONS)[number]

/**
 * Coach Mode user preferences, persisted to localStorage.
 *
 * Loaded prefs are merged OVER the defaults on read (see loadCoachPrefs), so
 * later phases can add fields (voiceEnabled, user cues...) without breaking
 * prefs saved by an earlier version.
 *
 * Phase B adds the metronome prefs (count-in, subdivision, accent, volume).
 * All fields are JSON-serializable, so the `{ ...get() }` save in each setter
 * keeps working unchanged.
 */
export interface CoachPrefs {
  rewindIntervalSeconds: number // 5 | 10 | 20, default 10

  /** Count-in length in bars before the song starts. 0 | 1 | 2, default 1. */
  countInBars: number
  /** Metronome subdivision — quarter (beats only), eighth, or sixteenth. */
  subdivision: Subdivision
  /** When true, beat 1 of each measure is accented (louder, higher pitch). */
  accentBeat1: boolean
  /** Metronome click volume, 0..1, default 0.4. */
  metronomeVolume: number
}

const DEFAULT_COACH_PREFS: CoachPrefs = {
  rewindIntervalSeconds: 10,
  countInBars: 1,
  subdivision: 'quarter',
  accentBeat1: true,
  metronomeVolume: 0.4,
}

/** Snap an arbitrary number to the nearest allowed rewind interval. */
function clampRewindInterval(seconds: number): number {
  if (REWIND_INTERVALS.includes(seconds as (typeof REWIND_INTERVALS)[number])) {
    return seconds
  }
  // Fall back to the default rather than an out-of-set value.
  return DEFAULT_COACH_PREFS.rewindIntervalSeconds
}

/** Snap an arbitrary number to one of the allowed count-in bar counts. */
function clampCountInBars(bars: number): number {
  if (COUNT_IN_BARS.includes(bars as (typeof COUNT_IN_BARS)[number])) {
    return bars
  }
  return DEFAULT_COACH_PREFS.countInBars
}

/** Validate a persisted subdivision, falling back to the default. */
function clampSubdivision(sub: unknown): Subdivision {
  if (typeof sub === 'string' && SUBDIVISIONS.includes(sub as Subdivision)) {
    return sub as Subdivision
  }
  return DEFAULT_COACH_PREFS.subdivision
}

/** Clamp a volume to [0, 1], falling back to the default if not a finite number. */
function clampVolume(vol: unknown): number {
  if (typeof vol === 'number' && Number.isFinite(vol)) {
    return Math.max(0, Math.min(1, vol))
  }
  return DEFAULT_COACH_PREFS.metronomeVolume
}

/**
 * Load coach prefs from localStorage, falling back to defaults on first launch
 * or if the stored data is malformed / from an older schema.
 *
 * Forward-compatible merge: any field missing from the stored object (e.g. a
 * new setting added in a later phase) falls back to the default. Mirrors the
 * load/merge approach in kit-store.
 */
function loadCoachPrefs(): CoachPrefs {
  try {
    const raw = localStorage.getItem(COACH_STORAGE_KEY)
    if (!raw) return DEFAULT_COACH_PREFS
    const parsed = JSON.parse(raw) as Partial<CoachPrefs>
    return {
      ...DEFAULT_COACH_PREFS,
      ...parsed,
      // Validate each persisted field — guard against hand-edited/legacy values.
      rewindIntervalSeconds: clampRewindInterval(
        parsed.rewindIntervalSeconds ?? DEFAULT_COACH_PREFS.rewindIntervalSeconds,
      ),
      countInBars: clampCountInBars(
        parsed.countInBars ?? DEFAULT_COACH_PREFS.countInBars,
      ),
      subdivision: clampSubdivision(parsed.subdivision),
      accentBeat1:
        typeof parsed.accentBeat1 === 'boolean'
          ? parsed.accentBeat1
          : DEFAULT_COACH_PREFS.accentBeat1,
      metronomeVolume: clampVolume(parsed.metronomeVolume),
    }
  } catch (err) {
    console.warn('[coach] failed to load, using defaults', err)
    return DEFAULT_COACH_PREFS
  }
}

function saveCoachPrefs(prefs: CoachPrefs): void {
  try {
    localStorage.setItem(COACH_STORAGE_KEY, JSON.stringify(prefs))
  } catch (err) {
    console.error('[coach] failed to save', err)
  }
}

interface CoachState extends CoachPrefs {
  /** Set the rewind interval. Clamps to one of 5/10/20 and persists immediately. */
  setRewindIntervalSeconds: (n: number) => void
  /** Set the count-in length. Clamps to one of 0/1/2 bars and persists immediately. */
  setCountInBars: (n: number) => void
  /** Set the metronome subdivision. Persists immediately. */
  setSubdivision: (sub: Subdivision) => void
  /** Toggle the accent on beat 1. Persists immediately. */
  setAccentBeat1: (on: boolean) => void
  /** Set the metronome volume (0..1). Clamps and persists immediately. */
  setMetronomeVolume: (vol: number) => void
}

export const useCoachStore = create<CoachState>()((set, get) => ({
  ...loadCoachPrefs(),

  setRewindIntervalSeconds: (n) => {
    const rewindIntervalSeconds = clampRewindInterval(n)
    const next: CoachPrefs = { ...get(), rewindIntervalSeconds }
    saveCoachPrefs(next)
    set({ rewindIntervalSeconds })
  },

  setCountInBars: (n) => {
    const countInBars = clampCountInBars(n)
    const next: CoachPrefs = { ...get(), countInBars }
    saveCoachPrefs(next)
    set({ countInBars })
  },

  setSubdivision: (sub) => {
    const subdivision = clampSubdivision(sub)
    const next: CoachPrefs = { ...get(), subdivision }
    saveCoachPrefs(next)
    set({ subdivision })
  },

  setAccentBeat1: (on) => {
    const accentBeat1 = !!on
    const next: CoachPrefs = { ...get(), accentBeat1 }
    saveCoachPrefs(next)
    set({ accentBeat1 })
  },

  setMetronomeVolume: (vol) => {
    const metronomeVolume = clampVolume(vol)
    const next: CoachPrefs = { ...get(), metronomeVolume }
    saveCoachPrefs(next)
    set({ metronomeVolume })
  },
}))
