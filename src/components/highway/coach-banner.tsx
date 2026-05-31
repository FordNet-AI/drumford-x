import { useCoachRuntime } from '@/stores/coach-runtime'
import { useCoachStore } from '@/stores/coach-store'

/**
 * Per-kind accent color for the banner text/glow. Falls back to cyan for
 * unknown/absent kinds. Kept small and data-driven so Phase D can add cue kinds
 * without touching layout.
 */
const KIND_COLOR: Record<string, string> = {
  tempo: '#ffcc00', // tempo changes — yellow
  meter: '#ffcc00',
  fill: '#00e5ff', // fills / hits — cyan
  doubleKick: '#ff66aa',
  section: '#88ffcc',
  reentry: '#00e5ff',
  protip: '#ffcc00', // song-start pro tip — yellow (coaching voice)
}
const DEFAULT_COLOR = '#00e5ff'

/**
 * On-screen Coach Mode banner. An absolute overlay pinned near the TOP of the
 * highway so it never covers the hit line at the bottom. Reads the transient
 * coach-runtime `activeBanner` and renders a dark neon pill while one is set.
 *
 * Gated by the persisted master + banner toggles, so flipping Banner off (or
 * Coach off) hides it immediately even if a banner is mid-display.
 *
 * `pointer-events-none` so it never intercepts clicks meant for the canvas /
 * the quick-kit popover below it. Mounted inside highway-view's relative
 * container alongside HighwayCanvas (same layer as the "Loading audio…"
 * overlay).
 */
export function CoachBanner() {
  const coachEnabled = useCoachStore((s) => s.coachEnabled)
  const bannerEnabled = useCoachStore((s) => s.bannerEnabled)
  const activeBanner = useCoachRuntime((s) => s.activeBanner)

  if (!coachEnabled || !bannerEnabled || !activeBanner) return null

  const color = (activeBanner.kind && KIND_COLOR[activeBanner.kind]) || DEFAULT_COLOR

  // The pro tip is a full sentence, not a short cue label — render it as a
  // wider, multiline rounded panel that wraps and centers, rather than a
  // single-line pill that would overflow the highway. All other kinds keep the
  // compact pill (nowrap, wide letter-spacing) they were designed for.
  const isProTip = activeBanner.kind === 'protip'
  const className = isProTip
    ? 'max-w-[80%] whitespace-pre-line rounded-2xl border bg-[#050508]/90 px-5 py-3 text-center font-mono text-sm font-medium leading-snug tracking-normal backdrop-blur-sm'
    : 'whitespace-nowrap rounded-full border bg-[#050508]/85 px-5 py-2 font-mono text-base font-semibold tracking-[2px] backdrop-blur-sm'

  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center px-4">
      <div
        className={className}
        style={{
          color,
          borderColor: `${color}66`,
          // Subtle outer + text glow tinted to the cue color.
          boxShadow: `0 0 18px ${color}55, 0 2px 8px rgba(0,0,0,0.6)`,
          textShadow: `0 0 10px ${color}aa`,
        }}
      >
        {activeBanner.text}
      </div>
    </div>
  )
}
