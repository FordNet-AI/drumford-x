import { create } from 'zustand'

const COACH_STORAGE_KEY = 'drumford-coach-prefs'

/** Allowed rewind intervals (seconds). The setter clamps to one of these. */
const REWIND_INTERVALS = [5, 10, 20] as const

/**
 * Coach Mode user preferences, persisted to localStorage.
 *
 * v1 holds only the rewind interval. Loaded prefs are merged OVER the defaults
 * on read (see loadCoachPrefs), so later phases can add fields
 * (voiceEnabled, metronome settings, user cues...) without breaking prefs
 * saved by an earlier version.
 */
export interface CoachPrefs {
  rewindIntervalSeconds: number // 5 | 10 | 20, default 10
}

const DEFAULT_COACH_PREFS: CoachPrefs = {
  rewindIntervalSeconds: 10,
}

/** Snap an arbitrary number to the nearest allowed rewind interval. */
function clampRewindInterval(seconds: number): number {
  if (REWIND_INTERVALS.includes(seconds as (typeof REWIND_INTERVALS)[number])) {
    return seconds
  }
  // Fall back to the default rather than an out-of-set value.
  return DEFAULT_COACH_PREFS.rewindIntervalSeconds
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
      // Validate the persisted interval — guard against hand-edited/legacy values.
      rewindIntervalSeconds: clampRewindInterval(
        parsed.rewindIntervalSeconds ?? DEFAULT_COACH_PREFS.rewindIntervalSeconds,
      ),
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
}

export const useCoachStore = create<CoachState>()((set, get) => ({
  ...loadCoachPrefs(),

  setRewindIntervalSeconds: (n) => {
    const rewindIntervalSeconds = clampRewindInterval(n)
    const next: CoachPrefs = { ...get(), rewindIntervalSeconds }
    saveCoachPrefs(next)
    set({ rewindIntervalSeconds })
  },
}))
