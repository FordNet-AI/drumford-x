import { useEffect, useRef } from 'react'
import { usePlayerStore } from '@/stores/player-store'
import { useDrillStore, shouldWrap } from '@/stores/drill-store'

/**
 * Drill Mode loop driver.
 *
 * Watches the player clock; when an armed loop's end (B) is reached during
 * playback it (optionally) advances the tempo ramp one step, then seeks back to
 * the loop start (A). The seek reuses the player's restart path:
 *
 *  - `seekTo` is HighwayView.handleSeek — it restarts the audio engine +
 *    metronome at the target when playing.
 *  - We pair it with player-store.seek() so the store clock + transport UI jump
 *    immediately too (exactly how the transport's own seek path works).
 *
 * A re-entry guard stops the same end-crossing from firing twice. The wrap is
 * re-armed as soon as the clock is back below B (i.e. the seek landed).
 */
export function useDrillLoop(seekTo: (time: number) => void): void {
  const currentTime = usePlayerStore((s) => s.currentTime)
  const isPlaying = usePlayerStore((s) => s.isPlaying)

  const loopStart = useDrillStore((s) => s.loopStart)
  const loopEnd = useDrillStore((s) => s.loopEnd)
  const loopEnabled = useDrillStore((s) => s.loopEnabled)
  const rampEnabled = useDrillStore((s) => s.rampEnabled)

  // True between detecting the B-crossing and the clock falling back below B —
  // prevents a second wrap (and a second ramp step) on the same crossing.
  const wrappedRef = useRef(false)

  // Loop wrap + ramp advance.
  useEffect(() => {
    if (!shouldWrap(currentTime, loopStart, loopEnd, loopEnabled, isPlaying)) {
      // Not due → re-arm unconditionally. shouldWrap being false already means a
      // wrap isn't pending, so this is safe — and it recovers the loop if the
      // user toggles Loop off while past B and then back on (otherwise the guard
      // would stay stuck and the loop would silently never fire).
      wrappedRef.current = false
      return
    }
    if (wrappedRef.current) return
    wrappedRef.current = true

    const drill = useDrillStore.getState()
    const player = usePlayerStore.getState()

    // Tempo ramp: bump the speed one step before restarting the pass. Write the
    // store speed DIRECTLY (not player.setSpeed) so we don't re-anchor the engine
    // here — seekTo() below restarts the engine and reads this new speed, so a
    // setSpeed() would double-anchor the engine at the loop boundary.
    if (drill.rampEnabled && drill.liveRampPct < drill.rampTargetPct) {
      const pct = drill.advanceRamp()
      usePlayerStore.setState({ speed: pct / 100 })
    }

    // Jump back to A: update the store clock + restart the engine there.
    const target = drill.loopStart ?? 0
    player.seek(target)
    seekTo(target)
  }, [currentTime, isPlaying, loopStart, loopEnd, loopEnabled, seekTo])

  // Arming loop + ramp drops to the start speed so the drill begins slow.
  // (setRampEnabled / setLoopEnabled re-base liveRampPct to the start %.)
  useEffect(() => {
    if (loopEnabled && rampEnabled) {
      const { liveRampPct } = useDrillStore.getState()
      usePlayerStore.getState().setSpeed(liveRampPct / 100)
    }
  }, [loopEnabled, rampEnabled])
}
