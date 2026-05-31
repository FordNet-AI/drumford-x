import type { RlrrBpmEvent } from '@/types/song'

export type MetronomeSubdivision = 'quarter' | 'eighth' | 'sixteenth'

/** How many clicks per beat for each subdivision (1 = beat only). */
const SUBDIVISION_DIVISIONS: Record<MetronomeSubdivision, number> = {
  quarter: 1,
  eighth: 2,
  sixteenth: 4,
}

/**
 * Synthesized metronome click track.
 *
 * Pre-computes all beat times from bpmEvents (respecting tempo changes and
 * time signatures), then schedules short oscillator bursts on each animation
 * frame within a 100ms lookahead window. Uses the same AudioContext as the
 * main engine so timing is perfectly locked.
 *
 * Sounds:
 *  - Downbeat (beat 1) accent: 1000Hz, louder.
 *  - Other beats: 800Hz.
 *  - Subdivision clicks (eighth/sixteenth in-between hits): 600Hz, quieter.
 *
 * When the accent is disabled (`setAccentBeat1(false)`), downbeats click like
 * normal beats — no louder/higher accent.
 */
export class Metronome {
  private ctx: AudioContext
  private gain: GainNode
  private beatTimes: number[] = []       // pre-computed absolute beat times
  private downbeats: Set<number> = new Set()  // indices that are beat 1
  private nextBeatIndex = 0
  private _startContextTime = 0
  private _startSongTime = 0
  private _speed = 1
  private _isPlaying = false

  private _subdivision: MetronomeSubdivision = 'quarter'
  private _accentBeat1 = true

  // Initial tempo + meter, captured from setBpmEvents, used by the count-in.
  private _initialBpm = 120
  private _initialBeatsPerMeasure = 4

  /**
   * Generation counter. Incremented on every stop()/play()/playCountIn() so
   * that oscillators scheduled by a previous run can be cancelled: each
   * scheduled oscillator captures the generation it belongs to, and we stop
   * any still-pending oscillators when the generation changes.
   */
  private _generation = 0
  /** Oscillators scheduled but not yet finished, tracked so stop() can silence them. */
  private _scheduled: Array<{ osc: OscillatorNode; env: GainNode; gen: number }> = []

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.gain = ctx.createGain()
    this.gain.connect(ctx.destination)
    this.gain.gain.value = 0.4   // default metronome volume
  }

  /**
   * Pre-compute beat grid from bpmEvents + time signatures.
   * Call once after loading a song.
   */
  setBpmEvents(events: RlrrBpmEvent[], duration: number): void {
    this.beatTimes = []
    this.downbeats = new Set()

    // Capture the song's INITIAL tempo + meter for the count-in lead-in.
    const first = events[0]
    this._initialBpm = first?.bpm ?? 120
    this._initialBeatsPerMeasure = first?.timeSignature?.[0] ?? 4

    if (events.length === 0) {
      // No BPM data — use default 120 BPM, 4/4
      const beatDuration = 60 / 120
      let time = 0
      let beat = 0
      while (time <= duration) {
        this.beatTimes.push(time)
        if (beat % 4 === 0) this.downbeats.add(this.beatTimes.length - 1)
        time += beatDuration
        beat++
      }
      return
    }

    // Walk through BPM events, generating beats for each segment
    let beatInMeasure = 0
    let beatsPerMeasure = 4

    for (let i = 0; i < events.length; i++) {
      const event = events[i]!
      const nextTime = i + 1 < events.length ? events[i + 1]!.time : duration
      const bpm = event.bpm

      if (event.timeSignature) {
        beatsPerMeasure = event.timeSignature[0]
        // Reset beat counter on time signature change
        beatInMeasure = 0
      }

      const beatDuration = 60 / bpm
      let time = event.time

      while (time < nextTime + 0.001) {  // small epsilon for floating point
        if (time >= 0) {
          this.beatTimes.push(time)
          if (beatInMeasure === 0) {
            this.downbeats.add(this.beatTimes.length - 1)
          }
        }
        time += beatDuration
        beatInMeasure = (beatInMeasure + 1) % beatsPerMeasure
      }
    }
  }

  /** Change the subdivision. Takes effect on the next scheduled beat. */
  setSubdivision(sub: MetronomeSubdivision): void {
    this._subdivision = sub
  }

  /** Enable/disable the louder accent on beat 1. */
  setAccentBeat1(on: boolean): void {
    this._accentBeat1 = on
  }

  /**
   * Start the metronome. Call when playback begins.
   */
  play(songOffset: number, speed: number): void {
    // New run — invalidate any pending count-in / previous-run oscillators.
    this._generation++
    this.cancelScheduled()

    this._startContextTime = this.ctx.currentTime
    this._startSongTime = songOffset
    this._speed = speed
    this._isPlaying = true

    // Find the first beat at or after the current song position
    this.nextBeatIndex = 0
    for (let i = 0; i < this.beatTimes.length; i++) {
      if (this.beatTimes[i]! >= songOffset - 0.01) {
        this.nextBeatIndex = i
        break
      }
    }
  }

  stop(): void {
    this._isPlaying = false
    // Invalidate the current generation and silence anything still pending
    // (covers a stop during a count-in or mid-playback).
    this._generation++
    this.cancelScheduled()
  }

  setSpeed(speed: number): void {
    if (this._isPlaying) {
      // Re-anchor like the audio engine does
      const currentSongTime = this.getCurrentSongTime()
      this._startSongTime = currentSongTime
      this._startContextTime = this.ctx.currentTime
      this._speed = speed
    }
  }

  setVolume(vol: number): void {
    this.gain.gain.value = vol
  }

  /**
   * Schedule a standalone count-in lead-in using the song's INITIAL tempo and
   * time signature. Schedules `bars * beatsPerMeasure` clicks starting at the
   * current audio time. Beat 1 of each bar is accented when the accent is on.
   *
   * This does NOT touch the song clock or the beat-grid playback state — it is
   * purely a set of pre-scheduled oscillators. Returns the total count-in
   * duration in seconds (already divided by `speed`, i.e. real wall-clock time)
   * so the caller can start the song after it finishes.
   *
   * A subsequent stop()/play() bumps the generation and cancels any clicks of
   * this count-in that have not yet fired.
   */
  playCountIn(bars: number, speed: number): number {
    // New run — cancel anything pending (including a prior count-in).
    this._generation++
    this.cancelScheduled()
    const gen = this._generation

    const safeBars = Math.max(0, Math.floor(bars))
    const beatsPerMeasure = this._initialBeatsPerMeasure
    const effectiveSpeed = speed > 0 ? speed : 1
    // Beat duration at the song's initial tempo, stretched by playback speed
    // so the lead-in matches how fast the song will actually scroll.
    const beatDuration = (60 / this._initialBpm) / effectiveSpeed

    const start = this.ctx.currentTime
    const totalBeats = safeBars * beatsPerMeasure

    for (let i = 0; i < totalBeats; i++) {
      const at = start + i * beatDuration
      const isDownbeat = i % beatsPerMeasure === 0
      this.scheduleClick(at, isDownbeat ? 'downbeat' : 'beat', gen)
    }

    return totalBeats * beatDuration
  }

  /**
   * Call every animation frame. Schedules any beats (and their subdivision
   * clicks) that fall within a 100ms lookahead window using precise Web Audio
   * scheduling.
   */
  tick(): void {
    if (!this._isPlaying) return

    const currentSongTime = this.getCurrentSongTime()
    const lookahead = 0.1 // 100ms lookahead in song time
    const divisions = SUBDIVISION_DIVISIONS[this._subdivision]
    const gen = this._generation

    while (this.nextBeatIndex < this.beatTimes.length) {
      const beatTime = this.beatTimes[this.nextBeatIndex]!
      if (beatTime > currentSongTime + lookahead) break

      // Skip beats that are already in the past
      if (beatTime < currentSongTime - 0.01) {
        this.nextBeatIndex++
        continue
      }

      const isDownbeat = this.downbeats.has(this.nextBeatIndex)

      // Schedule the main beat click.
      this.scheduleAtSongTime(beatTime, isDownbeat ? 'downbeat' : 'beat', gen)

      // Schedule subdivision clicks between this beat and the next one.
      if (divisions > 1) {
        const nextBeatTime = this.beatTimes[this.nextBeatIndex + 1]
        // Use the gap to the next beat as the interval; if there's no next beat
        // (end of song), fall back to nothing — no trailing partial subdivisions.
        if (nextBeatTime !== undefined) {
          const step = (nextBeatTime - beatTime) / divisions
          for (let d = 1; d < divisions; d++) {
            this.scheduleAtSongTime(beatTime + step * d, 'sub', gen)
          }
        }
      }

      this.nextBeatIndex++
    }
  }

  private getCurrentSongTime(): number {
    const elapsed = (this.ctx.currentTime - this._startContextTime) * this._speed
    return this._startSongTime + elapsed
  }

  /**
   * Convert a song-time to audio-context time and schedule a click there,
   * skipping clicks that would land in the past.
   */
  private scheduleAtSongTime(
    songTime: number,
    kind: 'downbeat' | 'beat' | 'sub',
    gen: number,
  ): void {
    const audioTime =
      this._startContextTime + (songTime - this._startSongTime) / this._speed

    // Only schedule if it's in the future (avoid glitches from late scheduling)
    if (audioTime > this.ctx.currentTime - 0.01) {
      const scheduleAt = Math.max(audioTime, this.ctx.currentTime)
      this.scheduleClick(scheduleAt, kind, gen)
    }
  }

  /**
   * Schedule a single click at a precise audio-context time.
   * Uses an oscillator with a fast envelope for a crisp "tick" sound.
   *
   * `kind`:
   *  - 'downbeat' → 1000Hz accent (or falls back to a normal beat when the
   *    accent is disabled).
   *  - 'beat'     → 800Hz.
   *  - 'sub'      → 600Hz subdivision click, quieter.
   */
  private scheduleClick(
    audioTime: number,
    kind: 'downbeat' | 'beat' | 'sub',
    gen: number,
  ): void {
    const osc = this.ctx.createOscillator()
    const env = this.ctx.createGain()

    // When the accent is off, downbeats sound like normal beats.
    const accentedDownbeat = kind === 'downbeat' && this._accentBeat1

    let freq: number
    let vol: number
    if (kind === 'sub') {
      freq = 600
      vol = 0.18
    } else if (accentedDownbeat) {
      freq = 1000
      vol = 0.6
    } else {
      // Normal beat, or a downbeat with the accent disabled.
      freq = 800
      vol = 0.35
    }

    osc.frequency.value = freq
    osc.type = 'sine'

    osc.connect(env)
    env.connect(this.gain)

    // Sharp attack, fast decay — crisp click sound
    env.gain.setValueAtTime(0, audioTime)
    env.gain.linearRampToValueAtTime(vol, audioTime + 0.002)   // 2ms attack
    env.gain.exponentialRampToValueAtTime(0.001, audioTime + 0.04)  // 40ms decay

    osc.start(audioTime)
    osc.stop(audioTime + 0.05)  // clean up after 50ms

    // Track so a stop()/new run can silence it if it hasn't fired yet.
    const entry = { osc, env, gen }
    this._scheduled.push(entry)
    osc.onended = () => {
      const idx = this._scheduled.indexOf(entry)
      if (idx !== -1) this._scheduled.splice(idx, 1)
    }
  }

  /**
   * Silence and tear down every scheduled oscillator that belongs to a
   * superseded generation (i.e. all of them, since callers bump the generation
   * before calling this). Cancels the envelope and stops the oscillator now so
   * pending count-in / beat clicks don't fire after a stop.
   */
  private cancelScheduled(): void {
    const now = this.ctx.currentTime
    for (const { osc, env, gen } of this._scheduled) {
      if (gen !== this._generation) {
        try {
          env.gain.cancelScheduledValues(now)
          env.gain.setValueAtTime(0, now)
        } catch {
          // ignore — node may already be finished
        }
        try {
          osc.stop(now)
        } catch {
          // ignore — already stopped
        }
      }
    }
    // Drop the cancelled entries; surviving (current-gen) ones stay.
    this._scheduled = this._scheduled.filter((e) => e.gen === this._generation)
  }
}
