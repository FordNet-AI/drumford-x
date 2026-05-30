import { describe, it, expect } from 'vitest'
import {
  computeLayout,
  columnIndexAtX,
  isInKickGutter,
  columnForClass,
  RULER_W,
  KICK_W,
} from './editor-layout'

const classes = ['a', 'b', 'c', 'd']

describe('computeLayout', () => {
  it('lays out N evenly-spaced columns right of the ruler + kick gutter', () => {
    const width = RULER_W + KICK_W + 400 // 400px lane area, 4 cols → 100 each
    const layout = computeLayout(width, classes)
    expect(layout.laneLeft).toBe(RULER_W + KICK_W)
    expect(layout.laneWidth).toBe(400)
    expect(layout.columns).toHaveLength(4)
    expect(layout.columns[0]!.width).toBeCloseTo(100, 6)
    expect(layout.columns[0]!.x).toBe(RULER_W + KICK_W)
    expect(layout.columns[1]!.x).toBeCloseTo(RULER_W + KICK_W + 100, 6)
    expect(layout.columns[0]!.cx).toBeCloseTo(RULER_W + KICK_W + 50, 6)
  })
})

describe('columnIndexAtX', () => {
  const width = RULER_W + KICK_W + 400
  const layout = computeLayout(width, classes)
  it('returns -1 over the ruler / kick gutter', () => {
    expect(columnIndexAtX(layout, 0)).toBe(-1)
    expect(columnIndexAtX(layout, RULER_W + 1)).toBe(-1) // inside kick gutter
  })
  it('maps lane-area x to the right column', () => {
    expect(columnIndexAtX(layout, layout.laneLeft + 1)).toBe(0)
    expect(columnIndexAtX(layout, layout.laneLeft + 150)).toBe(1)
    expect(columnIndexAtX(layout, layout.laneLeft + 399)).toBe(3)
  })
  it('returns -1 past the right edge', () => {
    expect(columnIndexAtX(layout, width + 50)).toBe(-1)
  })
})

describe('isInKickGutter', () => {
  const layout = computeLayout(RULER_W + KICK_W + 400, classes)
  it('is true inside the gutter, false over ruler and lanes', () => {
    expect(isInKickGutter(layout, RULER_W + 1)).toBe(true)
    expect(isInKickGutter(layout, RULER_W - 1)).toBe(false)
    expect(isInKickGutter(layout, layout.laneLeft + 10)).toBe(false)
  })
})

describe('columnForClass', () => {
  const layout = computeLayout(RULER_W + KICK_W + 400, classes)
  it('finds the column for a class', () => {
    expect(columnForClass(layout, 'b')?.instrumentClass).toBe('b')
    expect(columnForClass(layout, 'zzz')).toBeUndefined()
  })
})
