import { create } from 'zustand'
import type { AudioEngine } from '@/lib/audio-engine'

/**
 * Studio-local playback state for the Preview highway.
 *
 * Mirrors the player's `src/stores/player-store.ts` shape but is its own
 * studio-scoped store — the studio NEVER imports the player's Zustand stores.
 *
 * Two clock sources:
 *  - When the chart HAS audio, `_engine` is set (by PreviewPanel) and `tick()`
 *    reads the audio clock so notes stay synced to the audio, like the player.
 *  - When the chart has NO audio (the common case in Studio — you author the
 *    chart first, add a backing track later), there's no audio clock, so we
 *    advance a wall clock from `performance.now()`. Without this, pressing Play
 *    did nothing because the playhead had no clock to move it.
 *
 * `duration` (set by PreviewPanel from chart.meta.length) lets playback stop at
 * the end and lets Play restart from the top when parked at the end.
 */
export interface PlaybackState {
  currentTime: number
  isPlaying: boolean
  speed: number
  duration: number
  /** AudioEngine ref — set by PreviewPanel when the chart has audio. */
  _engine: AudioEngine | null
  /** performance.now() captured at the last play/seek/speed anchor (wall clock). */
  _wallStart: number
  /** currentTime captured at that same anchor. */
  _timeAtAnchor: number

  loadEngine: (engine: AudioEngine | null) => void
  setDuration: (duration: number) => void
  play: () => void
  pause: () => void
  seek: (time: number) => void
  setSpeed: (speed: number) => void
  /** Called each animation frame during playback; advances the clock. */
  tick: () => void
}

/**
 * Pure wall-clock advance — exported for testing. Given the anchor (the
 * currentTime + wall time captured when playback last started/seeked) and the
 * current wall time, compute the new playhead time, clamped to `duration`.
 */
export function advanceWallClock(
  anchorTime: number,
  wallStartMs: number,
  nowMs: number,
  speed: number,
  duration: number,
): { time: number; ended: boolean } {
  const elapsed = ((nowMs - wallStartMs) / 1000) * speed
  const t = anchorTime + elapsed
  if (duration > 0 && t >= duration) return { time: duration, ended: true }
  return { time: t, ended: false }
}

const now = () => performance.now()

export const usePlaybackStore = create<PlaybackState>()((set, get) => ({
  currentTime: 0,
  isPlaying: false,
  speed: 1,
  duration: 0,
  _engine: null,
  _wallStart: 0,
  _timeAtAnchor: 0,

  loadEngine: (engine) => set({ _engine: engine }),
  setDuration: (duration) => set({ duration }),

  play: () => {
    const s = get()
    if (s.isPlaying) return
    // If parked at (or past) the end, restart from the top.
    const atEnd = s.duration > 0 && s.currentTime >= s.duration - 1e-3
    const startTime = atEnd ? 0 : s.currentTime
    set({ isPlaying: true, currentTime: startTime, _wallStart: now(), _timeAtAnchor: startTime })
  },

  pause: () => {
    const s = get()
    if (!s.isPlaying) return
    // Read the final position from the audio clock if we have an engine.
    const currentTime = s._engine ? s._engine.getPlaybackTime() : s.currentTime
    set({ isPlaying: false, currentTime })
  },

  seek: (time) => {
    const s = get()
    const clamped = s.duration > 0 ? Math.max(0, Math.min(time, s.duration)) : Math.max(0, time)
    // Re-anchor the wall clock so audio-less playback continues from the seek.
    set({ currentTime: clamped, _wallStart: now(), _timeAtAnchor: clamped })
  },

  setSpeed: (speed) => {
    const s = get()
    if (s.isPlaying) {
      // Re-anchor at the current position so the new speed applies from "now".
      const t = s._engine ? s._engine.getPlaybackTime() : s.currentTime
      set({ speed, currentTime: t, _wallStart: now(), _timeAtAnchor: t })
    } else {
      set({ speed })
    }
  },

  tick: () => {
    const s = get()
    if (!s.isPlaying) return

    if (s._engine) {
      const t = s._engine.getPlaybackTime()
      if (s.duration > 0 && t >= s.duration) {
        set({ currentTime: s.duration, isPlaying: false })
        return
      }
      set({ currentTime: t })
      return
    }

    // Audio-less wall clock.
    const { time, ended } = advanceWallClock(s._timeAtAnchor, s._wallStart, now(), s.speed, s.duration)
    if (ended) set({ currentTime: time, isPlaying: false })
    else set({ currentTime: time })
  },
}))
