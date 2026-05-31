import { Rewind } from 'lucide-react'
import { usePlayerStore } from '@/stores/player-store'
import { useCoachStore } from '@/stores/coach-store'

const REWIND_OPTIONS = [5, 10, 20] as const

/**
 * Coach Mode — rewind control for the transport bar.
 *
 * A compact rewind button plus a tiny interval selector (5 / 10 / 20s).
 * Clicking rewinds the playhead by the chosen interval, clamped at 0.
 *
 * Mirrors the transport bar's `handleRestart` (seek + onSeek): `seek` updates
 * the store/highway, and `onSeek` (→ HighwayView's handleSeek) restarts the
 * audio from the new position when playing. Both are required.
 */
export function RewindControl({ onSeek }: { onSeek: (time: number) => void }) {
  // Subscribed so the button label updates live when the interval changes.
  const interval = useCoachStore((s) => s.rewindIntervalSeconds)
  const setInterval = useCoachStore((s) => s.setRewindIntervalSeconds)

  const handleRewind = () => {
    // Imperative read of currentTime (not a subscribed selector) — matches the
    // transport bar's getState() reads in handlePlayPause / handleRestart.
    const t = Math.max(0, usePlayerStore.getState().currentTime - interval)
    usePlayerStore.getState().seek(t)
    onSeek(t)
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        onClick={handleRewind}
        className="flex shrink-0 items-center gap-1 text-xs text-[#888] hover:text-[#00e5ff] transition-colors"
        aria-label={`Rewind ${interval}s`}
        title={`Rewind ${interval}s`}
      >
        <Rewind size={16} />
        <span className="tabular-nums">{interval}s</span>
      </button>

      <select
        value={interval}
        onChange={(e) => setInterval(parseInt(e.target.value, 10))}
        className="shrink-0 bg-[#050508] border border-[#1a1a2e] text-[#ffffffcc] text-xs rounded px-1.5 py-1 tabular-nums hover:border-[#2a2a4a] focus:outline-none focus:border-[#00e5ff] cursor-pointer"
        aria-label="Rewind interval"
        title="Rewind interval"
      >
        {REWIND_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}s
          </option>
        ))}
      </select>
    </div>
  )
}
