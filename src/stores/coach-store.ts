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
 * Per-event cue toggles. Each controls whether one class of coach cue
 * (tempo change, meter change, fill, double-kick run, section boundary,
 * re-entry after a break) fires. Phase D wires these into the scheduler; here
 * they are just persisted booleans the popover edits. All default `true`.
 */
export interface EventCues {
  cueTempo: boolean
  cueMeter: boolean
  cueFill: boolean
  cueDoubleKick: boolean
  cueSection: boolean
  cueReentry: boolean
}

/** Stable key list for EventCues — used to validate/merge persisted values. */
const EVENT_CUE_KEYS = [
  'cueTempo',
  'cueMeter',
  'cueFill',
  'cueDoubleKick',
  'cueSection',
  'cueReentry',
] as const
export type EventCueKey = (typeof EVENT_CUE_KEYS)[number]

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

  /** Master switch for Coach Mode. When false, no cues fire (voice or banner). */
  coachEnabled: boolean
  /** Spoken (Web Speech) cues on/off. Gated by coachEnabled. */
  voiceEnabled: boolean
  /** On-screen banner cues on/off. Gated by coachEnabled. */
  bannerEnabled: boolean
  /** Per-event cue toggles (tempo, meter, fill, double-kick, section, re-entry). */
  eventCues: EventCues
}

const DEFAULT_EVENT_CUES: EventCues = {
  cueTempo: true,
  cueMeter: true,
  cueFill: true,
  cueDoubleKick: true,
  cueSection: true,
  cueReentry: true,
}

const DEFAULT_COACH_PREFS: CoachPrefs = {
  rewindIntervalSeconds: 10,
  countInBars: 1,
  subdivision: 'quarter',
  accentBeat1: true,
  metronomeVolume: 0.4,
  coachEnabled: true,
  voiceEnabled: true,
  bannerEnabled: true,
  eventCues: { ...DEFAULT_EVENT_CUES },
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

/** Coerce a persisted value to boolean, falling back to a default if not a boolean. */
function clampBool(val: unknown, fallback: boolean): boolean {
  return typeof val === 'boolean' ? val : fallback
}

/**
 * Validate a persisted eventCues object. Each key is merged over the defaults,
 * so a partial/legacy object (or a future-added cue key that's missing) falls
 * back to `true` per key rather than dropping the whole object.
 */
function clampEventCues(cues: unknown): EventCues {
  const src = (typeof cues === 'object' && cues !== null ? cues : {}) as Partial<EventCues>
  const out = { ...DEFAULT_EVENT_CUES }
  for (const key of EVENT_CUE_KEYS) {
    out[key] = clampBool(src[key], DEFAULT_EVENT_CUES[key])
  }
  return out
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
      coachEnabled: clampBool(parsed.coachEnabled, DEFAULT_COACH_PREFS.coachEnabled),
      voiceEnabled: clampBool(parsed.voiceEnabled, DEFAULT_COACH_PREFS.voiceEnabled),
      bannerEnabled: clampBool(parsed.bannerEnabled, DEFAULT_COACH_PREFS.bannerEnabled),
      eventCues: clampEventCues(parsed.eventCues),
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

  /** Toggle the Coach Mode master switch. Persists immediately. */
  setCoachEnabled: (on: boolean) => void
  /** Toggle spoken cues. Persists immediately. */
  setVoiceEnabled: (on: boolean) => void
  /** Toggle on-screen banner cues. Persists immediately. */
  setBannerEnabled: (on: boolean) => void
  /** Toggle a single per-event cue (tempo/meter/fill/…). Persists immediately. */
  setEventCue: (key: EventCueKey, on: boolean) => void
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

  setCoachEnabled: (on) => {
    const coachEnabled = !!on
    const next: CoachPrefs = { ...get(), coachEnabled }
    saveCoachPrefs(next)
    set({ coachEnabled })
  },

  setVoiceEnabled: (on) => {
    const voiceEnabled = !!on
    const next: CoachPrefs = { ...get(), voiceEnabled }
    saveCoachPrefs(next)
    set({ voiceEnabled })
  },

  setBannerEnabled: (on) => {
    const bannerEnabled = !!on
    const next: CoachPrefs = { ...get(), bannerEnabled }
    saveCoachPrefs(next)
    set({ bannerEnabled })
  },

  setEventCue: (key, on) => {
    const eventCues: EventCues = { ...get().eventCues, [key]: !!on }
    const next: CoachPrefs = { ...get(), eventCues }
    saveCoachPrefs(next)
    set({ eventCues })
  },
}))
