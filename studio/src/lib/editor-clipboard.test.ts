import { describe, it, expect, beforeEach } from 'vitest'
import type { StudioNote } from '@studio/types'
import {
  copyNotesToClipboard,
  getClipboard,
  hasClipboard,
  clearClipboard,
} from './editor-clipboard'

const note = (id: string, time: number, vel = 100, cls = 'BP_Snare_C'): StudioNote => ({
  id,
  time,
  instrumentClass: cls,
  vel,
})

beforeEach(() => clearClipboard())

describe('editor-clipboard', () => {
  it('starts empty', () => {
    expect(hasClipboard()).toBe(false)
    expect(getClipboard()).toEqual([])
  })

  it('stores notes as offsets relative to the earliest copied note', () => {
    copyNotesToClipboard([
      note('a', 2.0, 90, 'BP_Kick_C'),
      note('b', 2.5, 110, 'BP_Snare_C'),
      note('c', 3.0, 20, 'BP_HiHat_C'),
    ])
    const clip = getClipboard()
    expect(hasClipboard()).toBe(true)
    expect(clip).toHaveLength(3)
    // anchored at the earliest (2.0)
    expect(clip[0]).toEqual({ dt: 0, instrumentClass: 'BP_Kick_C', vel: 90 })
    expect(clip[1]!.dt).toBeCloseTo(0.5)
    expect(clip[2]!.dt).toBeCloseTo(1.0)
    expect(clip[2]!.vel).toBe(20)
  })

  it('uses the minimum time as anchor even when notes are out of order', () => {
    copyNotesToClipboard([note('a', 5.0), note('b', 1.0), note('c', 3.0)])
    const dts = getClipboard().map((c) => c.dt)
    expect(Math.min(...dts)).toBe(0) // earliest -> 0
    expect(dts).toEqual([4.0, 0, 2.0])
  })

  it('copying an empty selection clears the clipboard', () => {
    copyNotesToClipboard([note('a', 1.0)])
    expect(hasClipboard()).toBe(true)
    copyNotesToClipboard([])
    expect(hasClipboard()).toBe(false)
  })

  it('getClipboard returns a defensive copy (mutating it does not affect the store)', () => {
    copyNotesToClipboard([note('a', 1.0)])
    const first = getClipboard()
    first[0]!.dt = 999
    expect(getClipboard()[0]!.dt).toBe(0)
  })
})
