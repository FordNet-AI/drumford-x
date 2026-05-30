import { describe, it, expect, beforeEach } from 'vitest'
import { advanceWallClock, usePlaybackStore } from './playback-store'

describe('advanceWallClock', () => {
  it('advances time by wall-clock delta at 1x', () => {
    expect(advanceWallClock(0, 1000, 2000, 1, 10)).toEqual({ time: 1, ended: false })
  })

  it('scales by speed', () => {
    expect(advanceWallClock(0, 1000, 2000, 2, 10).time).toBe(2)
    expect(advanceWallClock(0, 1000, 3000, 0.5, 10).time).toBe(1) // 2s * 0.5
  })

  it('continues from the anchor time', () => {
    expect(advanceWallClock(5, 0, 0, 1, 10)).toEqual({ time: 5, ended: false }) // no elapsed
    expect(advanceWallClock(5, 1000, 2000, 1, 10).time).toBe(6)
  })

  it('clamps to duration and reports ended', () => {
    expect(advanceWallClock(9.5, 1000, 2000, 1, 10)).toEqual({ time: 10, ended: true })
  })

  it('does not clamp when duration is unknown (0)', () => {
    expect(advanceWallClock(5, 0, 3000, 1, 0)).toEqual({ time: 8, ended: false })
  })
})

describe('playback-store transitions', () => {
  beforeEach(() => {
    usePlaybackStore.setState({
      currentTime: 0, isPlaying: false, speed: 1, duration: 0, _engine: null,
      _wallStart: 0, _timeAtAnchor: 0,
    })
  })

  it('play starts playback and anchors at the current position', () => {
    usePlaybackStore.setState({ currentTime: 2, duration: 10 })
    usePlaybackStore.getState().play()
    const s = usePlaybackStore.getState()
    expect(s.isPlaying).toBe(true)
    expect(s.currentTime).toBe(2)
    expect(s._timeAtAnchor).toBe(2)
  })

  it('play restarts from the top when parked at the end', () => {
    usePlaybackStore.setState({ duration: 8, currentTime: 8 })
    usePlaybackStore.getState().play()
    const s = usePlaybackStore.getState()
    expect(s.isPlaying).toBe(true)
    expect(s.currentTime).toBe(0)
    expect(s._timeAtAnchor).toBe(0)
  })

  it('pause stops playback (no engine → keeps currentTime)', () => {
    usePlaybackStore.setState({ isPlaying: true, currentTime: 3 })
    usePlaybackStore.getState().pause()
    const s = usePlaybackStore.getState()
    expect(s.isPlaying).toBe(false)
    expect(s.currentTime).toBe(3)
  })

  it('seek clamps to [0, duration]', () => {
    usePlaybackStore.setState({ duration: 10 })
    usePlaybackStore.getState().seek(20)
    expect(usePlaybackStore.getState().currentTime).toBe(10)
    usePlaybackStore.getState().seek(-5)
    expect(usePlaybackStore.getState().currentTime).toBe(0)
  })

  it('tick advances the wall clock when there is no engine', () => {
    usePlaybackStore.setState({ duration: 10 })
    usePlaybackStore.getState().play()
    const before = usePlaybackStore.getState().currentTime
    // Force a measurable wall delta by back-dating the anchor 1s.
    usePlaybackStore.setState({ _wallStart: usePlaybackStore.getState()._wallStart - 1000 })
    usePlaybackStore.getState().tick()
    const after = usePlaybackStore.getState().currentTime
    expect(after).toBeGreaterThan(before)
    expect(after).toBeGreaterThanOrEqual(1)
  })
})
