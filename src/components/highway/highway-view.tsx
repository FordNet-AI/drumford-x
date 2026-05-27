import { useState, useEffect, useRef, useCallback } from 'react'
import { ArrowLeft } from 'lucide-react'
import { usePlayerStore } from '@/stores/player-store'
import { useUIStore } from '@/stores/ui-store'
import { AudioEngine } from '@/lib/audio-engine'
import { Metronome } from '@/lib/metronome'
import { getStoredSong } from '@/lib/song-storage'
import { HighwayCanvas } from './highway-canvas'
import { TransportBar } from '../controls/transport-bar'
import { QuickKitPopover } from '../setup/quick-kit-popover'

export function HighwayView() {
  const activeSong = usePlayerStore((s) => s.activeSong)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const speed = usePlayerStore((s) => s.speed)
  const songVolume = usePlayerStore((s) => s.songVolume)
  const drumVolume = usePlayerStore((s) => s.drumVolume)
  const metronomeEnabled = usePlayerStore((s) => s.metronomeEnabled)
  const metronomeVolume = usePlayerStore((s) => s.metronomeVolume)
  const play = usePlayerStore((s) => s.play)
  const pause = usePlayerStore((s) => s.pause)
  const reset = usePlayerStore((s) => s.reset)
  const setScreen = useUIStore((s) => s.setScreen)

  const [audioReady, setAudioReady] = useState(false)

  const engineRef = useRef<AudioEngine | null>(null)
  const metroRef = useRef<Metronome | null>(null)
  const prevPlayingRef = useRef(false)

  // Create engine + metronome, register with player store, load audio stems
  useEffect(() => {
    const engine = new AudioEngine()
    engineRef.current = engine
    usePlayerStore.setState({ _engine: engine })

    // Create metronome sharing the engine's AudioContext
    const metro = new Metronome(engine.audioContext)
    metroRef.current = metro
    usePlayerStore.setState({ _metronome: metro })

    // Pre-compute beat grid if we have a song
    if (activeSong) {
      metro.setBpmEvents(activeSong.bpmEvents, activeSong.duration)
    }

    let cancelled = false
    setAudioReady(false)
    // Reset playback transition tracking so the play effect treats the next
    // play/pause flip as a fresh transition rather than a stale continuation
    // from the previous song.
    prevPlayingRef.current = false

    async function loadAudio() {
      if (!activeSong) return
      const stored = await getStoredSong(activeSong.id)
      if (!stored || cancelled) return

      // Gather all stem blobs
      const songBlobs = stored.songTrackBlobs?.length
        ? stored.songTrackBlobs
        : stored.songTrackBlob ? [stored.songTrackBlob] : []
      const drumBlobs = stored.drumTrackBlobs?.length
        ? stored.drumTrackBlobs
        : stored.drumTrackBlob ? [stored.drumTrackBlob] : []

      // Decode ALL stems in parallel — song + drum simultaneously
      await Promise.all([
        ...songBlobs.map((b) => engine.loadSongTrack(b)),
        ...drumBlobs.map((b) => engine.loadDrumTrack(b)),
      ])

      if (!cancelled) setAudioReady(true)
    }

    loadAudio()

    return () => {
      cancelled = true
      metro.stop()
      metroRef.current = null
      usePlayerStore.setState({ _metronome: null })
      engine.dispose()
      engineRef.current = null
      usePlayerStore.setState({ _engine: null })
    }
  }, [activeSong])

  // Play/pause — gated on audioReady so play waits for all stems to load.
  // If user presses Play before decoding finishes, this effect re-fires
  // when audioReady becomes true, starting playback automatically.
  useEffect(() => {
    const engine = engineRef.current
    const metro = metroRef.current
    if (!engine || !audioReady) return

    if (isPlaying && !prevPlayingRef.current) {
      const { currentTime, speed, activeSong: song, metronomeEnabled: metroOn } = usePlayerStore.getState()
      const calOffset = song?.calibrationOffset ?? 0
      engine.play(currentTime, speed, calOffset)

      if (metro && metroOn) {
        metro.play(currentTime, speed)
      }
    } else if (!isPlaying && prevPlayingRef.current) {
      engine.stop()
      metro?.stop()
    }
    prevPlayingRef.current = isPlaying
  }, [isPlaying, audioReady])

  useEffect(() => {
    engineRef.current?.setSongVolume(songVolume)
  }, [songVolume])

  useEffect(() => {
    engineRef.current?.setDrumVolume(drumVolume)
  }, [drumVolume])

  // Metronome volume
  useEffect(() => {
    metroRef.current?.setVolume(metronomeVolume)
  }, [metronomeVolume])

  // Metronome enable/disable mid-playback
  useEffect(() => {
    const metro = metroRef.current
    if (!metro) return

    if (metronomeEnabled && isPlaying) {
      const { currentTime, speed } = usePlayerStore.getState()
      metro.play(currentTime, speed)
    } else if (!metronomeEnabled) {
      metro.stop()
    }
  }, [metronomeEnabled, isPlaying])

  // Speed changes re-anchor timing inside the engine and metronome
  useEffect(() => {
    engineRef.current?.setSpeed(speed)
    metroRef.current?.setSpeed(speed)
  }, [speed])

  // Seek while playing — restart engine and metronome at new position
  const handleSeek = useCallback((time: number) => {
    const engine = engineRef.current
    const metro = metroRef.current
    if (!engine) return
    const { isPlaying: wasPlaying, speed, activeSong: song, metronomeEnabled: metroOn } = usePlayerStore.getState()
    if (wasPlaying) {
      const calOffset = song?.calibrationOffset ?? 0
      engine.stop()
      engine.play(time, speed, calOffset)

      if (metro && metroOn) {
        metro.stop()
        metro.play(time, speed)
      }
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault()
        if (usePlayerStore.getState().isPlaying) pause()
        else play()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [play, pause])

  const handleBack = () => {
    engineRef.current?.stop()
    reset()
    setScreen('library')
  }

  if (!activeSong) return null

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 bg-[#0a0a12] border-b border-[#1a1a2e]">
        <button
          onClick={handleBack}
          className="p-1.5 text-[#888] hover:text-[#00e5ff] transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <span className="text-sm text-[#ffffffee] truncate block">
            {activeSong.title}
          </span>
          <span className="text-xs text-[#555]">
            {activeSong.artist} &middot; {activeSong.difficulty}
          </span>
        </div>
      </div>

      <div className="relative flex flex-col flex-1 min-h-0">
        <HighwayCanvas />
        {!audioReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a12]/80 pointer-events-none">
            <div className="flex items-center gap-2 text-[#888] text-sm">
              <div className="w-4 h-4 border-2 border-[#00e5ff] border-t-transparent rounded-full animate-spin" />
              Loading audio…
            </div>
          </div>
        )}
        <QuickKitPopover />
      </div>

      <TransportBar onSeek={handleSeek} />
    </div>
  )
}
