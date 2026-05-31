import { create } from 'zustand'
import type { Song } from '@/types/song'
import type { AudioEngine } from '@/lib/audio-engine'
import type { Metronome } from '@/lib/metronome'

interface PlayerState {
  isPlaying: boolean
  currentTime: number
  speed: number
  songVolume: number
  drumVolume: number
  activeSong: Song | null

  /** User-adjustable sync offset in seconds. Positive = notes delayed (audio ahead). */
  userOffset: number

  /**
   * Metronome on/off — session state (not persisted), matching the shipping
   * default of OFF on each launch. The customizable metronome prefs (volume,
   * count-in, subdivision, accent) live in the persisted coach store instead.
   */
  metronomeEnabled: boolean

  /** Audio engine ref — set by HighwayView, used by tick() for audio-locked timing */
  _engine: AudioEngine | null
  /** Metronome ref — set by HighwayView, ticked in animation loop */
  _metronome: Metronome | null
  /**
   * Transient session flag (not persisted, not a UI setter): true while a
   * metronome count-in lead-in is running. During the lead-in the audio engine
   * has NOT been started, so engine.getPlaybackTime() would return a STALE
   * anchor from a prior pause — tick() gates on this flag to keep the highway
   * parked at 0. Set/cleared by HighwayView via usePlayerStore.setState.
   */
  _countInActive: boolean

  loadSong: (song: Song) => void
  play: () => void
  pause: () => void
  seek: (time: number) => void
  setSpeed: (speed: number) => void
  setSongVolume: (vol: number) => void
  setDrumVolume: (vol: number) => void
  setUserOffset: (offset: number) => void
  setMetronomeEnabled: (enabled: boolean) => void
  tick: () => void
  reset: () => void
}

export const usePlayerStore = create<PlayerState>()((set, get) => ({
  isPlaying: false,
  currentTime: 0,
  speed: 1,
  songVolume: 0.8,
  drumVolume: 0.8,
  activeSong: null,
  userOffset: 0,
  metronomeEnabled: false,
  _engine: null,
  _metronome: null,
  _countInActive: false,

  loadSong: (song) => set({
    activeSong: song,
    currentTime: 0,
    isPlaying: false,
  }),

  play: () => {
    const state = get()
    if (state.isPlaying || !state.activeSong) return
    set({ isPlaying: true })
  },

  pause: () => {
    const state = get()
    if (!state.isPlaying) return
    // Read final position from engine (audio clock) if available
    const currentTime = state._engine
      ? state._engine.getPlaybackTime()
      : state.currentTime
    set({ isPlaying: false, currentTime })
  },

  seek: (time) => {
    const state = get()
    const clamped = Math.max(0, Math.min(time, state.activeSong?.duration ?? 0))
    set({ currentTime: clamped })
  },

  setSpeed: (speed) => {
    const state = get()
    if (state.isPlaying && state._engine) {
      // Read current time from engine before changing speed
      const currentTime = state._engine.getPlaybackTime()
      set({ speed, currentTime })
    } else {
      set({ speed })
    }
  },

  setSongVolume: (vol) => set({ songVolume: vol }),
  setDrumVolume: (vol) => set({ drumVolume: vol }),
  setUserOffset: (offset) => set({ userOffset: offset }),
  setMetronomeEnabled: (enabled) => set({ metronomeEnabled: enabled }),

  /**
   * Called every animation frame during playback.
   * Reads playback position from the AudioEngine (audio clock),
   * keeping notes perfectly synced with audio.
   */
  tick: () => {
    const state = get()
    if (!state.isPlaying || !state.activeSong) return

    // During a count-in lead-in the engine hasn't started, so its clock holds a
    // stale anchor. Park the highway at 0 instead of reading that stale value.
    if (get()._countInActive) {
      if (get().currentTime !== 0) set({ currentTime: 0 })
      return
    }

    const engine = state._engine
    if (!engine) return

    // Read from audio clock + apply user offset
    // Positive userOffset = notes delayed (audio ahead of notes)
    const currentTime = engine.getPlaybackTime() - state.userOffset

    // Tick the metronome — schedules upcoming beats via Web Audio
    state._metronome?.tick()

    if (currentTime >= state.activeSong.duration) {
      set({ isPlaying: false, currentTime: state.activeSong.duration })
      return
    }

    set({ currentTime })
  },

  reset: () => set({
    isPlaying: false,
    currentTime: 0,
    speed: 1,
    activeSong: null,
    _countInActive: false,
  }),
}))
