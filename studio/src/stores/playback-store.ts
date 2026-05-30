import { create } from 'zustand'
import type { AudioEngine } from '@/lib/audio-engine'

/**
 * Studio-local playback state for the Preview highway.
 *
 * This intentionally mirrors the player's `src/stores/player-store.ts` shape
 * but is its own studio-scoped store — the studio NEVER imports the player's
 * Zustand stores. It holds only what Preview needs: a transport clock locked
 * to the AudioEngine when audio is present.
 *
 * The AudioEngine reference (`_engine`) is owned/created by PreviewPanel when a
 * chart has audio; without audio it stays null and playback is a visual no-op
 * (scrubbing still repaints via currentTime). `tick()` reads the engine's audio
 * clock during playback so notes stay synced to the audio, exactly like the
 * player.
 */
export interface PlaybackState {
  currentTime: number
  isPlaying: boolean
  speed: number
  /** AudioEngine ref — set by PreviewPanel when the chart has audio. */
  _engine: AudioEngine | null

  loadEngine: (engine: AudioEngine | null) => void
  play: () => void
  pause: () => void
  seek: (time: number) => void
  setSpeed: (speed: number) => void
  /** Called each animation frame during playback; reads the audio clock. */
  tick: () => void
}

export const usePlaybackStore = create<PlaybackState>()((set, get) => ({
  currentTime: 0,
  isPlaying: false,
  speed: 1,
  _engine: null,

  loadEngine: (engine) => set({ _engine: engine }),

  play: () => {
    if (get().isPlaying) return
    set({ isPlaying: true })
  },

  pause: () => {
    const state = get()
    if (!state.isPlaying) return
    // Read the final position from the audio clock if we have an engine.
    const currentTime = state._engine ? state._engine.getPlaybackTime() : state.currentTime
    set({ isPlaying: false, currentTime })
  },

  seek: (time) => set({ currentTime: Math.max(0, time) }),

  setSpeed: (speed) => {
    const state = get()
    if (state.isPlaying && state._engine) {
      // Capture the audio-clock position before changing speed so the clock
      // re-anchors cleanly (engine.setSpeed is wired in PreviewPanel).
      set({ speed, currentTime: state._engine.getPlaybackTime() })
    } else {
      set({ speed })
    }
  },

  tick: () => {
    const state = get()
    if (!state.isPlaying) return
    const engine = state._engine
    // Without audio there is no clock to advance — playback is a visual no-op.
    if (!engine) return
    set({ currentTime: engine.getPlaybackTime() })
  },
}))
