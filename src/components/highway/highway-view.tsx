import { useState, useEffect, useRef, useCallback } from 'react'
import { ArrowLeft } from 'lucide-react'
import { usePlayerStore } from '@/stores/player-store'
import { useCoachStore } from '@/stores/coach-store'
import { useUIStore } from '@/stores/ui-store'
import { AudioEngine } from '@/lib/audio-engine'
import { Metronome } from '@/lib/metronome'
import { getStoredSong } from '@/lib/song-storage'
import { useCueScheduler } from '@/lib/coach/use-cue-scheduler'
import { useCoachRuntime } from '@/stores/coach-runtime'
import { speak } from '@/lib/coach/speech'
import { generateProTip, sanitizeDescription } from '@/lib/coach/pro-tip'
import { HighwayCanvas } from './highway-canvas'
import { CoachBanner } from './coach-banner'
import { TransportBar } from '../controls/transport-bar'
import { QuickKitPopover } from '../setup/quick-kit-popover'

/** How long the song-start pro-tip banner lingers (ms). Longer than a cue
 *  blip because it's a full sentence the user needs time to read. */
const PRO_TIP_BANNER_MS = 6000

export function HighwayView() {
  const activeSong = usePlayerStore((s) => s.activeSong)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const speed = usePlayerStore((s) => s.speed)
  const songVolume = usePlayerStore((s) => s.songVolume)
  const drumVolume = usePlayerStore((s) => s.drumVolume)
  const metronomeEnabled = usePlayerStore((s) => s.metronomeEnabled)
  // Metronome prefs live in the (persisted) coach store.
  const metronomeVolume = useCoachStore((s) => s.metronomeVolume)
  const subdivision = useCoachStore((s) => s.subdivision)
  const accentBeat1 = useCoachStore((s) => s.accentBeat1)
  const play = usePlayerStore((s) => s.play)
  const pause = usePlayerStore((s) => s.pause)
  const reset = usePlayerStore((s) => s.reset)
  const setScreen = useUIStore((s) => s.setScreen)

  const [audioReady, setAudioReady] = useState(false)

  // Coach Mode: analyze the active song's cues and fire voice/banner cues as
  // the player clock reaches each cue's lead time. Self-gated on coachEnabled.
  useCueScheduler()

  const engineRef = useRef<AudioEngine | null>(null)
  const metroRef = useRef<Metronome | null>(null)
  const prevPlayingRef = useRef(false)
  // Pro tip: fired ONCE per song activation (reset when activeSong changes, in
  // the engine-setup effect below). So replaying from the top mid-session won't
  // re-nag — the tip only appears the first time you press play after loading a
  // chart. It can overlap the count-in pre-roll, which reads naturally.
  const proTipShownRef = useRef(false)
  // Count-in: a pending lead-in is running. While true, the engine has NOT
  // started yet and the highway stays parked at currentTime 0 — the only
  // sound is the metronome's pre-scheduled count-in clicks. The timer fires
  // the real start; pausing cancels it (see the play effect below).
  const countInTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countInActiveRef = useRef(false)

  // Create engine + metronome, register with player store, load audio stems
  useEffect(() => {
    const engine = new AudioEngine()
    engineRef.current = engine
    usePlayerStore.setState({ _engine: engine })

    // Create metronome sharing the engine's AudioContext
    const metro = new Metronome(engine.audioContext)
    metroRef.current = metro
    usePlayerStore.setState({ _metronome: metro })

    // Apply current (persisted) metronome prefs to the fresh engine.
    const coach = useCoachStore.getState()
    metro.setVolume(coach.metronomeVolume)
    metro.setSubdivision(coach.subdivision)
    metro.setAccentBeat1(coach.accentBeat1)

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
    // New song activation — re-arm the once-per-load pro tip.
    proTipShownRef.current = false
    // Cancel any count-in that was pending for the previous song.
    if (countInTimerRef.current !== null) {
      clearTimeout(countInTimerRef.current)
      countInTimerRef.current = null
    }
    countInActiveRef.current = false

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
      if (countInTimerRef.current !== null) {
        clearTimeout(countInTimerRef.current)
        countInTimerRef.current = null
      }
      countInActiveRef.current = false
      // Clear the tick() gate on teardown/song-change so it never persists.
      usePlayerStore.setState({ _countInActive: false })
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
  //
  // Count-in: when starting from the very top (currentTime ≈ 0) with the
  // metronome on and a count-in configured, we play a standalone lead-in
  // (clicks only, song clock parked at 0) and defer the real start until the
  // lead-in finishes. Every other case — resuming mid-song, count-in Off, or
  // metronome disabled — starts immediately, exactly as before.
  useEffect(() => {
    const engine = engineRef.current
    const metro = metroRef.current
    if (!engine || !audioReady) return

    if (isPlaying && !prevPlayingRef.current) {
      const { currentTime, speed, activeSong: song, metronomeEnabled: metroOn } = usePlayerStore.getState()
      const calOffset = song?.calibrationOffset ?? 0
      const countInBars = useCoachStore.getState().countInBars

      // Count-in only at the very top of the song, with the metronome on.
      const atStart = currentTime <= 0.01

      // Pro tip — show/speak once per song activation when starting from the
      // top. Uses the author's description verbatim if present, else an
      // auto-generated summary. Fires here (before the count-in branch) so it
      // can overlap the count-in pre-roll, which reads naturally. Gated by the
      // master + pro-tip toggles; banner/voice each honor their own toggle.
      if (atStart && !proTipShownRef.current && song) {
        const coach = useCoachStore.getState()
        if (coach.coachEnabled && coach.proTipEnabled) {
          proTipShownRef.current = true
          // Prefer the author's blurb (sanitized — some charts store rich-text
          // HTML), else an auto-generated summary.
          const tip = sanitizeDescription(song.description) || generateProTip(song)
          if (tip) {
            if (coach.bannerEnabled) {
              useCoachRuntime.getState().showBanner(tip, PRO_TIP_BANNER_MS, 'protip')
            }
            if (coach.voiceEnabled) speak(tip)
          }
        }
      }

      const useCountIn = metro != null && metroOn && countInBars > 0 && atStart

      if (useCountIn) {
        // Standalone lead-in. Do NOT start the engine/metronome yet — keep the
        // highway parked at 0 (engine.getPlaybackTime() returns 0 while stopped,
        // so the player tick won't scroll). Schedule the real start after the
        // lead-in's duration.
        const duration = metro!.playCountIn(countInBars, speed)
        countInActiveRef.current = true
        // Park the highway at 0 and gate player-store.tick() so it ignores the
        // engine's stale clock during the lead-in (the engine isn't running).
        usePlayerStore.setState({ currentTime: 0, _countInActive: true })
        if (countInTimerRef.current !== null) clearTimeout(countInTimerRef.current)
        countInTimerRef.current = setTimeout(() => {
          countInTimerRef.current = null
          countInActiveRef.current = false
          // Lead-in done — ungate tick() so it resumes reading the engine clock.
          usePlayerStore.setState({ _countInActive: false })
          // Bail if playback was stopped/torn down while we waited.
          const eng = engineRef.current
          const mtr = metroRef.current
          if (!eng || !usePlayerStore.getState().isPlaying) return
          const st = usePlayerStore.getState()
          const cal = st.activeSong?.calibrationOffset ?? 0
          eng.play(0, st.speed, cal)
          if (mtr && st.metronomeEnabled) mtr.play(0, st.speed)
        }, duration * 1000)
      } else {
        // Normal start — unchanged from before.
        engine.play(currentTime, speed, calOffset)
        if (metro && metroOn) {
          metro.play(currentTime, speed)
        }
      }
    } else if (!isPlaying && prevPlayingRef.current) {
      // Pause. If a count-in lead-in was pending, cancel it cleanly: drop the
      // timer (so the song never starts) and silence the pending clicks. The
      // engine was never started for this play, so engine.stop() is a no-op.
      const wasCountingIn = countInTimerRef.current !== null
      if (countInTimerRef.current !== null) {
        clearTimeout(countInTimerRef.current)
        countInTimerRef.current = null
      }
      countInActiveRef.current = false
      // Always clear the tick() gate so a normal pause after the count-in isn't
      // parked at 0 by mistake.
      usePlayerStore.setState({ _countInActive: false })
      engine.stop()
      metro?.stop()
      // store.pause() set currentTime from engine.getPlaybackTime(); during a
      // count-in the engine never ran for this play, so that reads a STALE
      // position (e.g. a prior partial playthrough left _startSongTime > 0).
      // Snap back to 0 so the highway stays parked and resuming re-arms the
      // count-in from the top.
      if (wasCountingIn) usePlayerStore.getState().seek(0)
    }
    prevPlayingRef.current = isPlaying
  }, [isPlaying, audioReady])

  useEffect(() => {
    engineRef.current?.setSongVolume(songVolume)
  }, [songVolume])

  useEffect(() => {
    engineRef.current?.setDrumVolume(drumVolume)
  }, [drumVolume])

  // Metronome volume (persisted in coach store)
  useEffect(() => {
    metroRef.current?.setVolume(metronomeVolume)
  }, [metronomeVolume])

  // Metronome subdivision (quarter / eighth / sixteenth)
  useEffect(() => {
    metroRef.current?.setSubdivision(subdivision)
  }, [subdivision])

  // Metronome accent on beat 1
  useEffect(() => {
    metroRef.current?.setAccentBeat1(accentBeat1)
  }, [accentBeat1])

  // Metronome enable/disable mid-playback
  useEffect(() => {
    const metro = metroRef.current
    if (!metro) return

    // While a count-in lead-in is pending, the engine hasn't started and the
    // count-in clicks are already scheduled — don't kick off the regular
    // metronome here or it would stomp the lead-in and start early.
    if (metronomeEnabled && isPlaying && !countInActiveRef.current) {
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

  // Seek while playing — restart engine and metronome at new position.
  // Seeking is an immediate jump with NO count-in (matches prior behavior). If
  // a count-in lead-in was pending, cancel it so its deferred start can't fire
  // afterward and snap playback back to 0.
  const handleSeek = useCallback((time: number) => {
    const engine = engineRef.current
    const metro = metroRef.current
    if (!engine) return

    if (countInTimerRef.current !== null) {
      clearTimeout(countInTimerRef.current)
      countInTimerRef.current = null
    }
    countInActiveRef.current = false
    // Clear the tick() gate — seek is an immediate jump, no count-in.
    usePlayerStore.setState({ _countInActive: false })

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
    if (countInTimerRef.current !== null) {
      clearTimeout(countInTimerRef.current)
      countInTimerRef.current = null
    }
    countInActiveRef.current = false
    // reset() also clears this, but clear here too so the gate is never left set
    // on the way out (defensive, and keeps cancel paths uniform).
    usePlayerStore.setState({ _countInActive: false })
    engineRef.current?.stop()
    metroRef.current?.stop()
    reset()
    setScreen('library')
  }

  if (!activeSong) return null

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 bg-[#0d1424] border-b border-[#1a1a2e]">
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
        <CoachBanner />
        {!audioReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0d1424]/80 pointer-events-none">
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
