import { useRef, useEffect, useCallback } from 'react'
import { Play, Pause, SkipBack } from 'lucide-react'
import { usePlayerStore } from '@/stores/player-store'
import { formatDuration } from '@/lib/rlrr-parser'
import { getCurrentBpm, getCurrentTimeSig } from '../highway/highway-renderer'
import { VolumeSliders } from './volume-sliders'
import { SpeedControl } from './speed-control'
import { OffsetControl } from './offset-control'
import { MetronomeControl } from './metronome-control'

export function TransportBar({ onSeek }: { onSeek: (time: number) => void }) {
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const activeSong = usePlayerStore((s) => s.activeSong)
  const play = usePlayerStore((s) => s.play)
  const pause = usePlayerStore((s) => s.pause)
  const seek = usePlayerStore((s) => s.seek)

  const duration = activeSong?.duration ?? 0
  const rangeRef = useRef<HTMLInputElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  const bpmRef = useRef<HTMLSpanElement>(null)
  const rafRef = useRef<number>(0)
  const isScrubbing = useRef(false)

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    seek(time)
    onSeek(time)
  }

  const handleScrubStart = useCallback(() => {
    isScrubbing.current = true
  }, [])

  const handleScrubEnd = useCallback(() => {
    isScrubbing.current = false
  }, [])

  const handlePlayPause = useCallback(() => {
    if (usePlayerStore.getState().isPlaying) {
      pause()
    } else {
      play()
    }
  }, [play, pause])

  const handleRestart = useCallback(() => {
    seek(0)
    onSeek(0)
  }, [seek, onSeek])

  /** Update BPM display from a given time */
  const updateBpmDisplay = useCallback((t: number) => {
    if (!bpmRef.current || !activeSong) return
    const bpmEvents = activeSong.bpmEvents
    const bpm = getCurrentBpm(t, bpmEvents)
    const sig = getCurrentTimeSig(t, bpmEvents)
    bpmRef.current.textContent = `${Math.round(bpm)} BPM · ${sig[0]}/${sig[1]}`
  }, [activeSong])

  // Update seek bar, time display, and BPM via DOM during playback
  useEffect(() => {
    if (!isPlaying) {
      // When paused, do one final sync
      const t = usePlayerStore.getState().currentTime
      if (rangeRef.current) rangeRef.current.value = String(t)
      if (timeRef.current) timeRef.current.textContent = formatDuration(t)
      updateBpmDisplay(t)
      return
    }

    function update() {
      const t = usePlayerStore.getState().currentTime
      if (!isScrubbing.current && rangeRef.current) rangeRef.current.value = String(t)
      if (timeRef.current) timeRef.current.textContent = formatDuration(t)
      updateBpmDisplay(t)
      rafRef.current = requestAnimationFrame(update)
    }

    rafRef.current = requestAnimationFrame(update)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying, updateBpmDisplay])

  // Also sync when currentTime changes while paused (e.g. after seek)
  useEffect(() => {
    if (!isPlaying) {
      const unsub = usePlayerStore.subscribe((state) => {
        if (rangeRef.current) rangeRef.current.value = String(state.currentTime)
        if (timeRef.current) timeRef.current.textContent = formatDuration(state.currentTime)
        updateBpmDisplay(state.currentTime)
      })
      return unsub
    }
  }, [isPlaying, updateBpmDisplay])

  // Initial BPM display
  useEffect(() => {
    updateBpmDisplay(0)
  }, [updateBpmDisplay])

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-[#0a0a12] border-t border-[#1a1a2e]">
      <button
        onClick={handleRestart}
        className="p-2 text-[#888] hover:text-[#00e5ff] transition-colors"
      >
        <SkipBack size={18} />
      </button>

      <button
        onClick={handlePlayPause}
        className="p-2 rounded-full border border-[#333] hover:border-[#00e5ff] hover:text-[#00e5ff] transition-colors"
      >
        {isPlaying ? <Pause size={20} /> : <Play size={20} />}
      </button>

      <span ref={timeRef} className="text-xs text-[#888] w-[44px] text-right tabular-nums">
        {formatDuration(0)}
      </span>

      <input
        ref={rangeRef}
        type="range"
        min={0}
        max={duration}
        step={0.1}
        defaultValue={0}
        onChange={handleSeek}
        onMouseDown={handleScrubStart}
        onMouseUp={handleScrubEnd}
        onTouchStart={handleScrubStart}
        onTouchEnd={handleScrubEnd}
        className="flex-1 h-1"
      />

      <span className="text-xs text-[#555] w-[44px] tabular-nums">
        {formatDuration(duration)}
      </span>

      {/* BPM & time signature display */}
      <span
        ref={bpmRef}
        className="text-xs text-[#ffcc00] tabular-nums whitespace-nowrap"
        title="Current BPM and time signature"
      >
        120 BPM · 4/4
      </span>

      <div className="flex items-center gap-3 ml-2 border-l border-[#1a1a2e] pl-3">
        <VolumeSliders />
        <MetronomeControl />
        <SpeedControl />
        <OffsetControl />
      </div>
    </div>
  )
}
