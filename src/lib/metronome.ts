import type { RlrrBpmEvent } from '@/types/song'

/**
 * Synthesized metronome click track.
 *
 * Pre-computes all beat times from bpmEvents (respecting tempo changes and
 * time signatures), then schedules short oscillator bursts on each animation
 * frame within a 100ms lookahead window. Uses the same AudioContext as the
 * main engine so timing is perfectly locked.
 *
 * Downbeats (beat 1 of each measure) play at 1000Hz.
 * Other beats play at 800Hz.
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

  /**
   * Start the metronome. Call when playback begins.
   */
  play(songOffset: number, speed: number): void {
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
   * Call every animation frame. Schedules any beats that fall
   * within a 100ms lookahead window using precise Web Audio scheduling.
   */
  tick(): void {
    if (!this._isPlaying) return

    const currentSongTime = this.getCurrentSongTime()
    const lookahead = 0.1 // 100ms lookahead in song time

    while (this.nextBeatIndex < this.beatTimes.length) {
      const beatTime = this.beatTimes[this.nextBeatIndex]!
      if (beatTime > currentSongTime + lookahead) break

      // Skip beats that are already in the past
      if (beatTime < currentSongTime - 0.01) {
        this.nextBeatIndex++
        continue
      }

      // Convert song time to audio context time for precise scheduling
      const audioTime = this._startContextTime +
        (beatTime - this._startSongTime) / this._speed

      // Only schedule if it's in the future (avoid glitches from late scheduling)
      if (audioTime > this.ctx.currentTime - 0.01) {
        const scheduleAt = Math.max(audioTime, this.ctx.currentTime)
        this.scheduleClick(scheduleAt, this.downbeats.has(this.nextBeatIndex))
      }

      this.nextBeatIndex++
    }
  }

  private getCurrentSongTime(): number {
    const elapsed = (this.ctx.currentTime - this._startContextTime) * this._speed
    return this._startSongTime + elapsed
  }

  /**
   * Schedule a single click at a precise audio-context time.
   * Uses an oscillator with a fast envelope for a crisp "tick" sound.
   */
  private scheduleClick(audioTime: number, isDownbeat: boolean): void {
    const osc = this.ctx.createOscillator()
    const env = this.ctx.createGain()

    osc.frequency.value = isDownbeat ? 1000 : 800
    osc.type = 'sine'

    osc.connect(env)
    env.connect(this.gain)

    // Sharp attack, fast decay — crisp click sound
    const vol = isDownbeat ? 0.6 : 0.35
    env.gain.setValueAtTime(0, audioTime)
    env.gain.linearRampToValueAtTime(vol, audioTime + 0.002)   // 2ms attack
    env.gain.exponentialRampToValueAtTime(0.001, audioTime + 0.04)  // 40ms decay

    osc.start(audioTime)
    osc.stop(audioTime + 0.05)  // clean up after 50ms
  }
}
