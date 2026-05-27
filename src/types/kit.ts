/**
 * User-customizable drum kit configuration.
 *
 * The kit defines what lanes the user wants to see, in what order, with
 * which colors, plus a thickness multiplier for note rendering. Songs are
 * resolved against the current kit at parse/load time — every note carries
 * its Paradiddle `instrumentClass` so we can re-resolve laneIndex live
 * when the user edits their kit.
 *
 * Stored in localStorage under KIT_STORAGE_KEY.
 */

export interface KitLane {
  /** Stable identifier — used as the target of instrumentMapping. Lowercase, no spaces. */
  id: string
  /** Display name shown on highway and in setup UI */
  label: string
  /** Short label used when the lane is narrow */
  shortLabel: string
  /** Hex color for note body, lane glow, and label */
  color: string
  /** Cymbals render as wider, thinner pills; drums render as narrower, taller pills */
  isCymbal: boolean
  /** Kick-style lanes render as full-width horizontal bars instead of column notes */
  isFullWidth: boolean
  /** Disabled lanes still exist in config but are hidden + their notes are skipped */
  enabled: boolean
  /**
   * Whether hits on this lane trigger the hit-line pulse animation.
   * Default true for kick + snare (groove backbone), false for everything else
   * so the line doesn't strobe on fast hi-hat patterns.
   */
  pulseTrigger: boolean
}

export interface KitConfig {
  /** Schema version — bump when KitConfig shape changes so we can migrate */
  version: number
  /** Ordered list of lanes. Array order = display order on highway (left to right). */
  lanes: KitLane[]
  /**
   * Maps Paradiddle instrument class (e.g. "BP_China18_C") to a lane id.
   * Falls back to substring detection from default-kit.ts for unknown classes.
   * Use empty string to explicitly hide notes from a class.
   */
  instrumentOverrides: Record<string, string>
  /** Multiplier applied to all note sizes — 0.5 to 2.0 */
  noteThickness: number
  /**
   * Multiplier on glow effects (accent note shadows + lane background gradients).
   * 0.0 = no glow (sharp/flat look). 1.0 = default. 2.0 = punchy/luminous.
   */
  glowIntensity: number
  /**
   * Multiplier on beat-grid line brightness (both downbeats and regular beats).
   * 0.0 = invisible (no grid). 1.0 = default. 2.0 = bold.
   */
  gridBrightness: number
  /**
   * Multiplier on hit-line pulse strength when notes cross the hit line.
   * 0.0 = no pulse (flat hit line). 1.0 = default. 2.0 = punchy.
   */
  pulseStrength: number
  /**
   * Lookahead window in seconds — how far into the future notes are shown
   * on the highway before reaching the hit line. Equivalent to "scroll
   * speed" / "highway speed" in other rhythm games:
   *   - Smaller (e.g. 1.5s) = notes fly past, less reaction time, harder
   *   - Larger (e.g. 6s) = more warning, slower scroll, gentler for learning
   * Note speed in pixels-per-second is inversely proportional to this.
   */
  lookaheadSeconds: number
}
