import { create } from 'zustand'
import type { KitConfig, KitLane } from '@/types/kit'
import { DEFAULT_KIT } from '@/lib/default-kit'

const KIT_STORAGE_KEY = 'drumford-kit-config'

/**
 * Load kit from localStorage on init, fall back to defaults on first launch
 * or if the stored data is malformed/older schema.
 */
function loadKit(): KitConfig {
  try {
    const raw = localStorage.getItem(KIT_STORAGE_KEY)
    if (!raw) return DEFAULT_KIT
    const parsed = JSON.parse(raw) as Partial<KitConfig>

    // Backfill missing per-lane fields from the default with the matching id
    // (e.g. pulseTrigger added later — pull kick/snare defaults so existing
    // saved kits don't end up with all-false pulse triggers).
    const defaultsById = new Map(DEFAULT_KIT.lanes.map((l) => [l.id, l]))
    const lanes = Array.isArray(parsed.lanes) && parsed.lanes.length > 0
      ? parsed.lanes.map((lane) => {
          const fallback = defaultsById.get(lane.id)
          return {
            ...lane,
            pulseTrigger: lane.pulseTrigger ?? fallback?.pulseTrigger ?? false,
          }
        })
      : DEFAULT_KIT.lanes

    // Forward-compatible merge: any field missing from the stored kit
    // (e.g. a new setting added after the user saved their kit) falls back
    // to the default. Keeps customizations intact across upgrades.
    return {
      ...DEFAULT_KIT,
      ...parsed,
      lanes,
      instrumentOverrides: parsed.instrumentOverrides ?? {},
    }
  } catch (err) {
    console.warn('[kit] failed to load, using defaults', err)
    return DEFAULT_KIT
  }
}

function saveKit(kit: KitConfig): void {
  try {
    localStorage.setItem(KIT_STORAGE_KEY, JSON.stringify(kit))
  } catch (err) {
    console.error('[kit] failed to save', err)
  }
}

interface KitState {
  kit: KitConfig
  /** Replace whole kit (used by reset and import) */
  setKit: (kit: KitConfig) => void
  /** Update a single lane in place — by id */
  updateLane: (id: string, patch: Partial<KitLane>) => void
  /** Reorder lanes — pass the full new ordered array */
  reorderLanes: (lanes: KitLane[]) => void
  /** Add a new lane to the end. Returns false if a lane with that id already exists. */
  addLane: (lane: KitLane) => boolean
  /** Remove a lane (and clear any overrides pointing to it) */
  removeLane: (id: string) => void
  /** Override the lane for a specific instrument class. Pass null to remove the override. */
  setInstrumentOverride: (instrumentClass: string, laneId: string | null) => void
  /** Set global note thickness multiplier (0.5–2.0) */
  setNoteThickness: (thickness: number) => void
  /** Set global glow intensity multiplier (0.0–2.0). 0 = no glow, 1 = default, 2 = punchy */
  setGlowIntensity: (intensity: number) => void
  /** Set beat-grid line brightness multiplier (0.0–2.0). 0 = invisible, 1 = default, 2 = bold */
  setGridBrightness: (brightness: number) => void
  /** Set hit-line pulse strength multiplier (0.0–2.0). 0 = no pulse, 1 = default, 2 = punchy */
  setPulseStrength: (strength: number) => void
  /** Set highway lookahead in seconds (1.5–6.0). Smaller = faster scroll, less reaction time. */
  setLookaheadSeconds: (seconds: number) => void
  /** Reset to factory defaults */
  reset: () => void
}

export const useKitStore = create<KitState>()((set, get) => ({
  kit: loadKit(),

  setKit: (kit) => {
    saveKit(kit)
    set({ kit })
  },

  updateLane: (id, patch) => {
    const kit = get().kit
    const next: KitConfig = {
      ...kit,
      lanes: kit.lanes.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }
    saveKit(next)
    set({ kit: next })
  },

  reorderLanes: (lanes) => {
    const next: KitConfig = { ...get().kit, lanes }
    saveKit(next)
    set({ kit: next })
  },

  addLane: (lane) => {
    const kit = get().kit
    // Don't add duplicate ids — return false so callers can avoid orphan overrides
    if (kit.lanes.some((l) => l.id === lane.id)) return false
    const next: KitConfig = { ...kit, lanes: [...kit.lanes, lane] }
    saveKit(next)
    set({ kit: next })
    return true
  },

  removeLane: (id) => {
    const kit = get().kit
    const overrides = { ...kit.instrumentOverrides }
    // Strip any overrides pointing at the removed lane so future resolves don't dangle
    for (const k of Object.keys(overrides)) {
      if (overrides[k] === id) delete overrides[k]
    }
    const next: KitConfig = {
      ...kit,
      lanes: kit.lanes.filter((l) => l.id !== id),
      instrumentOverrides: overrides,
    }
    saveKit(next)
    set({ kit: next })
  },

  setInstrumentOverride: (instrumentClass, laneId) => {
    const kit = get().kit
    const overrides = { ...kit.instrumentOverrides }
    if (laneId === null) {
      delete overrides[instrumentClass]
    } else {
      overrides[instrumentClass] = laneId
    }
    const next: KitConfig = { ...kit, instrumentOverrides: overrides }
    saveKit(next)
    set({ kit: next })
  },

  setNoteThickness: (thickness) => {
    const clamped = Math.max(0.5, Math.min(2.0, thickness))
    const next: KitConfig = { ...get().kit, noteThickness: clamped }
    saveKit(next)
    set({ kit: next })
  },

  setGlowIntensity: (intensity) => {
    const clamped = Math.max(0, Math.min(2.0, intensity))
    const next: KitConfig = { ...get().kit, glowIntensity: clamped }
    saveKit(next)
    set({ kit: next })
  },

  setGridBrightness: (brightness) => {
    const clamped = Math.max(0, Math.min(2.0, brightness))
    const next: KitConfig = { ...get().kit, gridBrightness: clamped }
    saveKit(next)
    set({ kit: next })
  },

  setPulseStrength: (strength) => {
    const clamped = Math.max(0, Math.min(2.0, strength))
    const next: KitConfig = { ...get().kit, pulseStrength: clamped }
    saveKit(next)
    set({ kit: next })
  },

  setLookaheadSeconds: (seconds) => {
    const clamped = Math.max(1.5, Math.min(6.0, seconds))
    const next: KitConfig = { ...get().kit, lookaheadSeconds: clamped }
    saveKit(next)
    set({ kit: next })
  },

  reset: () => {
    saveKit(DEFAULT_KIT)
    set({ kit: DEFAULT_KIT })
  },
}))
