import type { KitConfig, KitLane } from '@/types/kit'

/**
 * The default kit — matches the original hardcoded 8-lane layout.
 * Used on first launch, when "Reset to defaults" is clicked, and as the
 * source of truth for the default instrument-class → lane-id mapping.
 */

export const DEFAULT_LANES: KitLane[] = [
  { id: 'hihat',    label: 'HI-HAT',  shortLabel: 'HH', color: '#00e5ff', isCymbal: true,  isFullWidth: false, enabled: true, pulseTrigger: false },
  { id: 'snare',    label: 'SNARE',   shortLabel: 'SN', color: '#ffcc00', isCymbal: false, isFullWidth: false, enabled: true, pulseTrigger: true  },
  { id: 'crash',    label: 'CRASH',   shortLabel: 'CR', color: '#ff8800', isCymbal: true,  isFullWidth: false, enabled: true, pulseTrigger: false },
  { id: 'tom1',     label: 'TOM 1',   shortLabel: 'T1', color: '#ff66aa', isCymbal: false, isFullWidth: false, enabled: true, pulseTrigger: false },
  { id: 'tom2',     label: 'TOM 2',   shortLabel: 'T2', color: '#88ffcc', isCymbal: false, isFullWidth: false, enabled: true, pulseTrigger: false },
  { id: 'ride',     label: 'RIDE',    shortLabel: 'RD', color: '#00ffb0', isCymbal: true,  isFullWidth: false, enabled: true, pulseTrigger: false },
  { id: 'floorTom', label: 'FL TOM',  shortLabel: 'FT', color: '#66aaff', isCymbal: false, isFullWidth: false, enabled: true, pulseTrigger: false },
  { id: 'kick',     label: 'KICK',    shortLabel: 'KK', color: '#ff3a5c', isCymbal: false, isFullWidth: true,  enabled: true, pulseTrigger: true  },
]

/**
 * Default mapping from Paradiddle instrument class → lane id.
 * Acts as the base — the user's `instrumentOverrides` takes precedence.
 */
export const DEFAULT_CLASS_TO_LANE: Record<string, string> = {
  // Kick
  'BP_Kick_C':        'kick',
  // Snare
  'BP_Snare_C':       'snare',
  // Hi-hat (stick + foot pedal)
  'BP_HiHat_C':       'hihat',
  'BP_HiHatFoot_C':   'hihat',
  // Toms
  'BP_Tom1_C':        'tom1',
  'BP_Tom2_C':        'tom2',
  'BP_FloorTom_C':    'floorTom',
  // Crashes (all sizes, china, splash) — default into one lane
  'BP_Crash13_C':     'crash',
  'BP_Crash15_C':     'crash',
  'BP_Crash17_C':     'crash',
  'BP_Crash18_C':     'crash',
  'BP_Crash20_C':     'crash',
  'BP_ChinaCrash_C':  'crash',
  'BP_China13_C':     'crash',
  'BP_China15_C':     'crash',
  'BP_China17_C':     'crash',
  'BP_China18_C':     'crash',
  'BP_China20_C':     'crash',
  'BP_Splash_C':      'crash',
  'BP_Splash10_C':    'crash',
  'BP_Splash12_C':    'crash',
  // Rides (all sizes + bell)
  'BP_Ride_C':        'ride',
  'BP_Ride17_C':      'ride',
  'BP_Ride20_C':      'ride',
  'BP_RideBell_C':    'ride',
  'BP_RideBell17_C':  'ride',
  'BP_RideBell20_C':  'ride',
}

/**
 * Optional "common but disabled by default" lanes the user can enable.
 * The Kit Setup UI shows these as add-able presets.
 */
export const OPTIONAL_LANE_PRESETS: KitLane[] = [
  { id: 'china',     label: 'CHINA',  shortLabel: 'CH', color: '#ffaa00', isCymbal: true,  isFullWidth: false, enabled: true, pulseTrigger: false },
  { id: 'splash',    label: 'SPLASH', shortLabel: 'SP', color: '#ff44dd', isCymbal: true,  isFullWidth: false, enabled: true, pulseTrigger: false },
  { id: 'hihatFoot', label: 'HH FT',  shortLabel: 'HF', color: '#88ccff', isCymbal: false, isFullWidth: true,  enabled: true, pulseTrigger: false },
]

/**
 * Instrument classes that should automatically reroute to a preset's lane id
 * when the user adds that preset. Without this, adding CHINA or HH FT would
 * silently leave those classes routed to their default lanes (e.g. china still
 * going to crash). The Kit Setup preset-add handler applies these overrides
 * atomically with the lane.
 */
export const PRESET_AUTO_OVERRIDES: Record<string, string[]> = {
  china: [
    'BP_ChinaCrash_C',
    'BP_China13_C',
    'BP_China15_C',
    'BP_China17_C',
    'BP_China18_C',
    'BP_China20_C',
  ],
  splash: [
    'BP_Splash_C',
    'BP_Splash10_C',
    'BP_Splash12_C',
  ],
  hihatFoot: [
    'BP_HiHatFoot_C',
  ],
}

export const DEFAULT_KIT: KitConfig = {
  version: 1,
  lanes: DEFAULT_LANES,
  instrumentOverrides: {},
  noteThickness: 1.0,
  glowIntensity: 1.0,
  // Default tuned down from the previous hardcoded brightness — the old
  // value made downbeat lines almost as bright as the hit line on fast songs.
  gridBrightness: 0.55,
  pulseStrength: 1.0,
  lookaheadSeconds: 3.0,
}

/**
 * Resolve an instrument class to a lane id using the kit.
 * Order of precedence:
 *   1. User override in `kit.instrumentOverrides`
 *   2. Default class mapping in `DEFAULT_CLASS_TO_LANE`
 *   3. Substring fallback (e.g. "Crash" → 'crash')
 * Returns null if nothing matches.
 *
 * The resolved lane id may not exist as a lane in the kit — caller should
 * check `kit.lanes` membership and treat missing lanes as "skip this note".
 */
export function resolveInstrumentLane(
  instrumentClass: string,
  overrides: Record<string, string>,
): string | null {
  // 1. Explicit user override (empty string means "hidden" — caller should drop)
  if (instrumentClass in overrides) {
    const v = overrides[instrumentClass]
    return v ? v : null
  }
  // 2. Default known class
  if (DEFAULT_CLASS_TO_LANE[instrumentClass]) {
    return DEFAULT_CLASS_TO_LANE[instrumentClass]!
  }
  // 3. Substring fallback
  const lower = instrumentClass.toLowerCase()
  if (lower.includes('kick') || lower.includes('bass')) return 'kick'
  if (lower.includes('snare')) return 'snare'
  if (lower.includes('hihatfoot') || lower.includes('hi_hat_foot')) return 'hihatFoot'
  if (lower.includes('hihat') || lower.includes('hi_hat')) return 'hihat'
  if (lower.includes('tom1') || lower.includes('hightom')) return 'tom1'
  if (lower.includes('tom2') || lower.includes('midtom')) return 'tom2'
  if (lower.includes('floor')) return 'floorTom'
  // China and splash try their own dedicated lane ids first so users who've
  // added the optional CHINA / SPLASH presets get correct routing even for
  // novel class names. If those lanes aren't enabled in the kit, the canvas
  // resolution falls through and the note ends up `laneIndex: -1` (hidden) —
  // which is the correct "user didn't model this in their kit" behavior.
  if (lower.includes('china')) return 'china'
  if (lower.includes('splash')) return 'splash'
  if (lower.includes('crash')) return 'crash'
  if (lower.includes('ride')) return 'ride'
  return null
}
