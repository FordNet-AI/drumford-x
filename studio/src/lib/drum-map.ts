/**
 * Shared drum-mapping tables for DrumFord Studio's pure core.
 *
 * Kept in one place (DRY) so the MIDI→chart converter and the chart↔.rlrr IO
 * agree on how General MIDI percussion notes, Paradiddle instrument classes,
 * and `.rlrr` instrument names relate to one another.
 */

/**
 * General MIDI percussion note number → Paradiddle instrument class.
 * Mirrors the proven spike's mapping. Notes absent here are reported as
 * "unmapped" by the converter rather than silently dropped.
 */
export const GM_TO_CLASS: Record<number, string> = {
  35: 'BP_Kick_C', 36: 'BP_Kick_C',
  37: 'BP_Snare_C', 38: 'BP_Snare_C', 40: 'BP_Snare_C',
  42: 'BP_HiHat_C', 46: 'BP_HiHat_C', 44: 'BP_HiHatFoot_C',
  41: 'BP_FloorTom_C', 43: 'BP_FloorTom_C',
  45: 'BP_Tom2_C', 47: 'BP_Tom2_C', 48: 'BP_Tom1_C', 50: 'BP_Tom1_C',
  49: 'BP_Crash17_C', 57: 'BP_Crash17_C', 55: 'BP_Splash_C', 52: 'BP_ChinaCrash_C',
  51: 'BP_Ride_C', 59: 'BP_Ride_C', 53: 'BP_RideBell_C',
}

/**
 * Paradiddle instrument class → `.rlrr` instrument `name`. `.rlrr` events
 * reference instruments by name, so this is how a chart note's class becomes
 * an event/instrument entry. Classes absent here fall back to the class string
 * itself (see callers' `?? cls`).
 */
export const CLASS_TO_NAME: Record<string, string> = {
  BP_Kick_C: 'Kick', BP_Snare_C: 'Snare', BP_HiHat_C: 'HiHat',
  BP_HiHatFoot_C: 'HiHatFoot', BP_FloorTom_C: 'FloorTom',
  BP_Tom2_C: 'Tom2', BP_Tom1_C: 'Tom1', BP_Crash17_C: 'Crash',
  BP_Splash_C: 'Splash', BP_ChinaCrash_C: 'China', BP_Ride_C: 'Ride',
  BP_RideBell_C: 'RideBell',
}
