/**
 * Web Audio dual-bus engine.
 *
 * Paradiddle songs can have MULTIPLE song stems (guitar, vocals, rhythm, etc.)
 * and MULTIPLE drum stems (drums_1, drums_2, drums_3). All stems on the same
 * bus play simultaneously and share a gain node for volume control.
 *
 *   songBuffers[] → songSources[] → songGain → destination
 *   drumBuffers[] → drumSources[] → drumGain → destination
 *
 * Timing: The engine is the single source of truth for playback time.
 * It tracks _startContextTime (AudioContext.currentTime when play() was called)
 * and _startSongTime (the visual/chart time that corresponds to that moment).
 * getPlaybackTime() returns the visual timeline position — the same coordinate
 * system as note.time — so the renderer reads it directly with no conversion.
 */
export class AudioEngine {
  private ctx: AudioContext
  private songSources: AudioBufferSourceNode[] = []
  private drumSources: AudioBufferSourceNode[] = []
  private songGain: GainNode
  private drumGain: GainNode
  private songBuffers: AudioBuffer[] = []
  private drumBuffers: AudioBuffer[] = []

  // Timing state — anchored to AudioContext.currentTime
  private _startContextTime = 0   // ctx.currentTime when play() was called
  private _startSongTime = 0      // visual/chart time at that moment
  private _speed = 1
  private _isPlaying = false

  constructor() {
    this.ctx = new AudioContext()
    this.songGain = this.ctx.createGain()
    this.drumGain = this.ctx.createGain()
    this.songGain.connect(this.ctx.destination)
    this.drumGain.connect(this.ctx.destination)

    // Log audio latency for diagnostics
    const latency = this.getOutputLatency()
    console.log(`[audio] Output latency: ${(latency * 1000).toFixed(1)}ms (baseLatency: ${(this.ctx.baseLatency * 1000).toFixed(1)}ms)`)
  }

  /** Expose the AudioContext so the metronome can share it */
  get audioContext(): AudioContext {
    return this.ctx
  }

  async loadSongTrack(blob: Blob): Promise<void> {
    const buffer = await blob.arrayBuffer()
    const decoded = await this.ctx.decodeAudioData(buffer)
    this.songBuffers.push(decoded)
  }

  async loadDrumTrack(blob: Blob): Promise<void> {
    const buffer = await blob.arrayBuffer()
    const decoded = await this.ctx.decodeAudioData(buffer)
    this.drumBuffers.push(decoded)
  }

  /**
   * Start playback.
   * @param songTime      Visual/chart time to start from (what the renderer uses)
   * @param speed         Playback rate (1.0 = normal)
   * @param calOffset     Calibration offset — shifts audio buffer position, not notes
   */
  play(songTime: number, speed: number, calOffset = 0): void {
    this.stop()

    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }

    // Anchor timing to audio clock
    this._startContextTime = this.ctx.currentTime
    this._startSongTime = songTime
    this._speed = speed
    this._isPlaying = true

    // Audio buffer position includes calibration offset
    const bufferOffset = songTime + calOffset

    // Start all song stems simultaneously
    for (const buf of this.songBuffers) {
      const source = this.ctx.createBufferSource()
      source.buffer = buf
      source.playbackRate.value = speed
      source.connect(this.songGain)
      source.start(0, bufferOffset)
      this.songSources.push(source)
    }

    // Start all drum stems simultaneously
    for (const buf of this.drumBuffers) {
      const source = this.ctx.createBufferSource()
      source.buffer = buf
      source.playbackRate.value = speed
      source.connect(this.drumGain)
      source.start(0, bufferOffset)
      this.drumSources.push(source)
    }
  }

  stop(): void {
    // Capture last known position before stopping
    if (this._isPlaying) {
      this._startSongTime = this.getPlaybackTime()
    }
    this._isPlaying = false

    for (const s of this.songSources) {
      try { s.stop() } catch { /* already stopped */ }
    }
    for (const s of this.drumSources) {
      try { s.stop() } catch { /* already stopped */ }
    }
    this.songSources = []
    this.drumSources = []
  }

  /**
   * Change playback speed mid-playback.
   * Re-anchors timing so getPlaybackTime() stays continuous.
   */
  setSpeed(speed: number): void {
    if (this._isPlaying) {
      // Re-anchor: capture current position, then reset reference
      const currentSongTime = this.getPlaybackTime()
      this._startSongTime = currentSongTime
      this._startContextTime = this.ctx.currentTime
      this._speed = speed
    }

    for (const s of this.songSources) s.playbackRate.value = speed
    for (const s of this.drumSources) s.playbackRate.value = speed
  }

  /**
   * Read current playback position in visual/chart time.
   * This is the same coordinate system as note.time — the renderer
   * can use it directly with no conversion.
   *
   * Accounts for audio output pipeline latency: ctx.currentTime tracks
   * the processing clock, but audio takes outputLatency seconds to reach
   * the speakers. Without compensation, notes would appear to arrive
   * early (you see the note hit the bar before you hear the drum).
   */
  getPlaybackTime(): number {
    if (!this._isPlaying) return this._startSongTime
    const outputLatency = this.getOutputLatency()
    const elapsed = (this.ctx.currentTime - outputLatency - this._startContextTime) * this._speed
    return this._startSongTime + elapsed
  }

  /**
   * Get the audio output pipeline latency in seconds.
   * outputLatency (Chrome 102+) includes OS/driver latency.
   * baseLatency is a fallback that only covers processing latency.
   */
  private getOutputLatency(): number {
    // outputLatency is not in all TS type definitions yet
    const ctx = this.ctx as AudioContext & { outputLatency?: number }
    return ctx.outputLatency ?? this.ctx.baseLatency ?? 0
  }

  get isPlaying(): boolean {
    return this._isPlaying
  }

  setSongVolume(volume: number): void {
    this.songGain.gain.value = volume
  }

  setDrumVolume(volume: number): void {
    this.drumGain.gain.value = volume
  }

  dispose(): void {
    this.stop()
    this.ctx.close()
  }
}
