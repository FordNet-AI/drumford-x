import { create } from 'zustand'

/**
 * Live, session-only Coach Mode runtime state. NOT persisted — this is purely
 * transient UI state for the current playback session.
 *
 * The on-screen banner overlay (coach-banner.tsx) reads `activeBanner`; the cue
 * scheduler (Phase D) and the "Test cue" button call `showBanner` to flash a
 * message for a fixed duration. A single auto-clear timer is tracked module-side
 * so a newer banner cleanly cancels the previous banner's pending clear —
 * otherwise an old timer could wipe a freshly-shown banner mid-display.
 */
interface CoachRuntime {
  /** The banner currently shown over the highway, or null when none. */
  activeBanner: { text: string; kind?: string } | null
  /**
   * Show `text` as a banner for `durationMs`, then auto-clear. `kind` is an
   * optional tag (e.g. 'tempo', 'fill') the banner can use for styling. Cancels
   * any prior auto-clear timer so the new banner gets its full duration.
   */
  showBanner: (text: string, durationMs: number, kind?: string) => void
  /** Clear the banner now and cancel any pending auto-clear timer. */
  clearBanner: () => void
}

/** Module-scoped auto-clear timer so successive banners don't race each other. */
let bannerTimer: ReturnType<typeof setTimeout> | null = null

function clearBannerTimer(): void {
  if (bannerTimer !== null) {
    clearTimeout(bannerTimer)
    bannerTimer = null
  }
}

export const useCoachRuntime = create<CoachRuntime>()((set) => ({
  activeBanner: null,

  showBanner: (text, durationMs, kind) => {
    clearBannerTimer()
    set({ activeBanner: { text, kind } })
    bannerTimer = setTimeout(() => {
      bannerTimer = null
      set({ activeBanner: null })
    }, durationMs)
  },

  clearBanner: () => {
    clearBannerTimer()
    set({ activeBanner: null })
  },
}))
