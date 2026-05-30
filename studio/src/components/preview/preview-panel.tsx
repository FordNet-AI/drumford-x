import { useEffect, useRef, useCallback, useState } from 'react'
import { Play, Pause } from 'lucide-react'
import { AudioEngine } from '@/lib/audio-engine'
import { getCurrentBpm } from '@/components/highway/highway-renderer'
import { formatDuration } from '@/lib/rlrr-parser'
import { useStudioStore } from '@studio/stores/studio-store'
import { usePlaybackStore } from '@studio/stores/playback-store'
import { PreviewCanvas } from './preview-canvas'

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5] as const

/**
 * Preview panel — the highway canvas plus a transport bar (play/pause, scrub
 * slider, speed selector, time/bpm readout).
 *
 * Audio: when the loaded chart has `chart.audio`, an AudioEngine is created and
 * the blob decoded as the song track; play/pause/seek/speed are wired to it,
 * mirroring the player's `highway-view.tsx`. Without audio, playback is a visual
 * no-op (the rAF tick has no clock to advance) but scrubbing still repaints the
 * canvas — fine for v1.
 */
export function PreviewPanel() {
  const chart = useStudioStore((s) => s.chart)

  const currentTime = usePlaybackStore((s) => s.currentTime)
  const isPlaying = usePlaybackStore((s) => s.isPlaying)
  const speed = usePlaybackStore((s) => s.speed)
  const play = usePlaybackStore((s) => s.play)
  const pause = usePlaybackStore((s) => s.pause)
  const seek = usePlaybackStore((s) => s.seek)
  const setSpeed = usePlaybackStore((s) => s.setSpeed)

  const engineRef = useRef<AudioEngine | null>(null)
  const prevPlayingRef = useRef(false)
  // True once the song track has finished decoding. Gates engine.play() so a
  // Play pressed before decode finishes doesn't run against an empty buffer.
  const [audioReady, setAudioReady] = useState(false)

  const length = chart?.meta.length ?? 0
  const bpm = chart ? getCurrentBpm(currentTime, chart.bpmEvents) : 120

  // Create / tear down the AudioEngine when the chart's audio changes.
  // Reset transport to 0 on any chart change so a freshly-loaded chart starts
  // from the top.
  const audioBlob = chart?.audio?.blob ?? null
  useEffect(() => {
    // Always reset the clock when the chart (or its audio) changes.
    usePlaybackStore.setState({ currentTime: 0, isPlaying: false })
    prevPlayingRef.current = false

    if (!audioBlob) {
      // No audio: scrub-only. Mark "ready" so the (engine-less) play path is
      // never gated, and there's no loading overlay.
      setAudioReady(true)
      usePlaybackStore.getState().loadEngine(null)
      return
    }

    setAudioReady(false)
    const engine = new AudioEngine()
    engineRef.current = engine
    usePlaybackStore.getState().loadEngine(engine)

    let cancelled = false
    engine
      .loadSongTrack(audioBlob)
      .then(() => {
        // Don't flip ready if this effect was torn down mid-decode.
        if (!cancelled) setAudioReady(true)
      })
      .catch((err) => {
        console.error('[studio/preview] failed to decode audio', err)
      })

    return () => {
      cancelled = true
      engine.dispose()
      engineRef.current = null
      usePlaybackStore.getState().loadEngine(null)
    }
  }, [audioBlob])

  // Play/pause → drive the engine. Gated on `audioReady` so a Play pressed
  // before decode finishes waits; this effect re-fires when `audioReady` flips
  // true and starts playback then (mirrors the player's highway-view).
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) {
      // No-audio path: visual no-op playback, just track the transition.
      prevPlayingRef.current = isPlaying
      return
    }
    if (!audioReady) return // wait for decode; re-runs when audioReady → true

    if (isPlaying && !prevPlayingRef.current) {
      engine.play(usePlaybackStore.getState().currentTime, usePlaybackStore.getState().speed)
    } else if (!isPlaying && prevPlayingRef.current) {
      engine.stop()
    }
    prevPlayingRef.current = isPlaying
  }, [isPlaying, audioReady])

  // Speed changes re-anchor the engine clock.
  useEffect(() => {
    engineRef.current?.setSpeed(speed)
  }, [speed])

  // Seek — restart the engine at the new position if currently playing.
  // Only touch the engine once audio is ready (otherwise the play effect will
  // start it at the seeked currentTime when decode completes).
  const handleSeek = useCallback((time: number) => {
    seek(time)
    const engine = engineRef.current
    if (engine && audioReady && usePlaybackStore.getState().isPlaying) {
      engine.stop()
      engine.play(time, usePlaybackStore.getState().speed)
    }
  }, [seek, audioReady])

  // Spacebar toggles play/pause (when not focused in an input).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault()
        if (usePlaybackStore.getState().isPlaying) pause()
        else play()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [play, pause])

  if (!chart) return null

  return (
    <div className="flex h-full flex-col">
      <PreviewCanvas />

      <div className="flex items-center gap-4 border-t border-[#1a1a2e] bg-[#0d1424] px-4 py-3">
        <button
          onClick={() => (isPlaying ? pause() : play())}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00e5ff] text-[#050508] transition-colors hover:bg-[#33eaff]"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
        </button>

        <input
          type="range"
          min={0}
          max={length || 1}
          step={0.01}
          value={Math.min(currentTime, length || 1)}
          onChange={(e) => handleSeek(parseFloat(e.target.value))}
          className="h-1 flex-1 cursor-pointer accent-[#00e5ff]"
          aria-label="Seek"
        />

        <span className="shrink-0 font-mono text-xs tabular-nums text-[#888]">
          {formatDuration(currentTime)} / {formatDuration(length)} &middot; {Math.round(bpm)} bpm
        </span>

        <select
          value={speed}
          onChange={(e) => setSpeed(parseFloat(e.target.value))}
          className="shrink-0 rounded border border-[#1a1a2e] bg-[#050508] px-2 py-1 text-xs text-[#ffffffcc]"
          aria-label="Playback speed"
        >
          {SPEED_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
