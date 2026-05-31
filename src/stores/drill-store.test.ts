import { describe, it, expect, beforeEach } from 'vitest'
import {
  useDrillStore,
  nextRampPct,
  shouldWrap,
  DRILL_DEFAULTS,
  RAMP_MIN_PCT,
  RAMP_MAX_PCT,
} from './drill-store'

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
describe('nextRampPct', () => {
  it('adds one step', () => {
    expect(nextRampPct(70, 5, 100)).toBe(75)
  })
  it('never overshoots the target', () => {
    expect(nextRampPct(98, 5, 100)).toBe(100)
  })
  it('stays at the target once reached', () => {
    expect(nextRampPct(100, 5, 100)).toBe(100)
  })
})

describe('shouldWrap', () => {
  const base = { start: 4, end: 8, enabled: true, playing: true }
  const call = (over: Partial<{ t: number; start: number | null; end: number | null; enabled: boolean; playing: boolean }>) =>
    shouldWrap(
      over.t ?? 8,
      'start' in over ? over.start! : base.start,
      'end' in over ? over.end! : base.end,
      over.enabled ?? base.enabled,
      over.playing ?? base.playing,
    )

  it('fires when the playhead reaches the loop end', () => {
    expect(call({ t: 8 })).toBe(true)
    expect(call({ t: 8.5 })).toBe(true)
  })
  it('does not fire before the loop end', () => {
    expect(call({ t: 7.9 })).toBe(false)
  })
  it('does not fire when not looping or not playing', () => {
    expect(call({ t: 9, enabled: false })).toBe(false)
    expect(call({ t: 9, playing: false })).toBe(false)
  })
  it('does not fire with unset or inverted bounds', () => {
    expect(call({ t: 9, start: null })).toBe(false)
    expect(call({ t: 9, end: null })).toBe(false)
    expect(call({ t: 9, start: 8, end: 4 })).toBe(false) // end <= start
  })
})

// ---------------------------------------------------------------------------
// Store invariants
// ---------------------------------------------------------------------------
describe('useDrillStore', () => {
  beforeEach(() => {
    useDrillStore.getState().resetDrill()
  })

  it('starts empty with the default ramp', () => {
    const s = useDrillStore.getState()
    expect(s.loopStart).toBeNull()
    expect(s.loopEnd).toBeNull()
    expect(s.loopEnabled).toBe(false)
    expect(s.rampStartPct).toBe(DRILL_DEFAULTS.rampStartPct)
    expect(s.liveRampPct).toBe(DRILL_DEFAULTS.rampStartPct)
  })

  it('sets A then a valid B', () => {
    useDrillStore.getState().setLoopStart(4)
    useDrillStore.getState().setLoopEnd(8)
    const s = useDrillStore.getState()
    expect(s.loopStart).toBe(4)
    expect(s.loopEnd).toBe(8)
  })

  it('ignores a B at or before A', () => {
    useDrillStore.getState().setLoopStart(8)
    useDrillStore.getState().setLoopEnd(4) // invalid
    expect(useDrillStore.getState().loopEnd).toBeNull()
  })

  it('drops a now-invalid B when A is moved past it', () => {
    useDrillStore.getState().setLoopStart(4)
    useDrillStore.getState().setLoopEnd(8)
    useDrillStore.getState().setLoopStart(10) // A now past B
    expect(useDrillStore.getState().loopEnd).toBeNull()
    expect(useDrillStore.getState().loopStart).toBe(10)
  })

  it('clamps a negative A to 0', () => {
    useDrillStore.getState().setLoopStart(-5)
    expect(useDrillStore.getState().loopStart).toBe(0)
  })

  it('clearLoop wipes the region and disarms', () => {
    useDrillStore.getState().setLoopStart(4)
    useDrillStore.getState().setLoopEnd(8)
    useDrillStore.getState().setLoopEnabled(true)
    useDrillStore.getState().clearLoop()
    const s = useDrillStore.getState()
    expect(s.loopStart).toBeNull()
    expect(s.loopEnd).toBeNull()
    expect(s.loopEnabled).toBe(false)
  })

  it('arming the loop re-bases the live ramp to the start %', () => {
    useDrillStore.getState().setRampStartPct(60)
    useDrillStore.setState({ liveRampPct: 95 }) // pretend a prior drill ramped up
    useDrillStore.getState().setLoopEnabled(true)
    expect(useDrillStore.getState().liveRampPct).toBe(60)
  })

  it('advanceRamp walks start → target by step and clamps', () => {
    // defaults: 70 start, +5 step, 100 target
    const seq: number[] = []
    for (let i = 0; i < 8; i++) seq.push(useDrillStore.getState().advanceRamp())
    expect(seq).toEqual([75, 80, 85, 90, 95, 100, 100, 100])
  })

  it('clamps ramp start/target into range and keeps target >= start', () => {
    useDrillStore.getState().setRampStartPct(999)
    expect(useDrillStore.getState().rampStartPct).toBe(RAMP_MAX_PCT)
    useDrillStore.getState().setRampStartPct(0)
    expect(useDrillStore.getState().rampStartPct).toBe(RAMP_MIN_PCT)

    useDrillStore.getState().setRampStartPct(80)
    useDrillStore.getState().setRampTargetPct(50) // below start
    expect(useDrillStore.getState().rampTargetPct).toBe(80) // bumped up to start
  })

  it('resetDrill restores defaults', () => {
    useDrillStore.getState().setLoopStart(4)
    useDrillStore.getState().setLoopEnd(8)
    useDrillStore.getState().setLoopEnabled(true)
    useDrillStore.getState().setRampEnabled(true)
    useDrillStore.getState().resetDrill()
    const s = useDrillStore.getState()
    expect(s.loopStart).toBeNull()
    expect(s.loopEnabled).toBe(false)
    expect(s.rampEnabled).toBe(false)
    expect(s.liveRampPct).toBe(DRILL_DEFAULTS.rampStartPct)
  })
})
