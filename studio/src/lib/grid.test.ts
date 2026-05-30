import { describe, it, expect } from 'vitest'
import type { RlrrBpmEvent } from '@/types/song'
import {
  subdivisionSeconds,
  snapTime,
  timeToY,
  yToTime,
  laneOrder,
} from './grid'

const bpm120: RlrrBpmEvent[] = [{ bpm: 120, time: 0, timeSignature: [4, 4] }]

describe('subdivisionSeconds', () => {
  it('1/4 at 120bpm = 0.5s', () => {
    expect(subdivisionSeconds('1/4', 120)).toBe(0.5)
  })
  it('1/8 at 120bpm = 0.25s', () => {
    expect(subdivisionSeconds('1/8', 120)).toBe(0.25)
  })
  it('1/16 at 120bpm = 0.125s', () => {
    expect(subdivisionSeconds('1/16', 120)).toBe(0.125)
  })
  it('1/8T (eighth triplet) at 120bpm ≈ 0.16667s', () => {
    expect(subdivisionSeconds('1/8T', 120)).toBeCloseTo(0.16667, 4)
  })
})

describe('snapTime', () => {
  it('snaps 0.62 to nearest 1/8 (0.5) at 120bpm', () => {
    expect(snapTime(0.62, '1/8', bpm120)).toBe(0.5)
  })
  it('snaps a triplet time to the nearest 1/8T multiple', () => {
    // sub ≈ 0.16667; 0.30 / sub ≈ 1.8 → rounds to 2 → 0.3333…
    expect(snapTime(0.3, '1/8T', bpm120)).toBeCloseTo(0.33333, 4)
  })
  it('uses the BPM at the given time (tempo change)', () => {
    const evts: RlrrBpmEvent[] = [
      { bpm: 120, time: 0, timeSignature: [4, 4] },
      { bpm: 60, time: 4, timeSignature: [4, 4] },
    ]
    // after t=4, bpm=60 → 1/8 = 0.5s; 5.2 → round(5.2/0.5)=10 → 5.0
    expect(snapTime(5.2, '1/8', evts)).toBe(5.0)
  })
})

describe('timeToY / yToTime round-trip', () => {
  const cases: Array<[number, number]> = [
    [3.2, 2.0],
    [0.0, 0.0],
    [10.5, 7.25],
  ]
  it.each(cases)('round-trips t=%s, c=%s', (t, c) => {
    const pps = 220
    const h = 900
    expect(yToTime(timeToY(t, c, pps, h), c, pps, h)).toBeCloseTo(t, 6)
  })

  it('places currentTime at the playhead and future time ABOVE (smaller y)', () => {
    const pps = 200
    const h = 1000
    const c = 5
    const playheadY = timeToY(c, c, pps, h)
    // future (t > c) is higher up the canvas → smaller y
    expect(timeToY(c + 1, c, pps, h)).toBeLessThan(playheadY)
    // past (t < c) is lower down → larger y
    expect(timeToY(c - 1, c, pps, h)).toBeGreaterThan(playheadY)
  })
})

describe('laneOrder', () => {
  it('excludes BP_Kick_C (kick is a full-width band, not a column)', () => {
    expect(laneOrder()).not.toContain('BP_Kick_C')
  })
  it('includes snare and hi-hat classes', () => {
    expect(laneOrder()).toContain('BP_Snare_C')
    expect(laneOrder()).toContain('BP_HiHat_C')
  })
  it('returns a non-empty, de-duplicated class list', () => {
    const order = laneOrder()
    expect(order.length).toBeGreaterThan(0)
    expect(new Set(order).size).toBe(order.length)
  })
})
