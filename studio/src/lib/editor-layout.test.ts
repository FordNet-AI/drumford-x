import { describe, it, expect } from 'vitest'
import {
  computeLayout,
  columnIndexAtX,
  isInKickGutter,
  columnForClass,
  isInRibbon,
  ribbonBarLength,
  ribbonXToVel,
  RIBBON_PAD,
  RULER_W,
  KICK_W,
  RIBBON_W,
} from './editor-layout'

const classes = ['a', 'b', 'c', 'd']

describe('computeLayout', () => {
  it('lays out N evenly-spaced columns between the kick gutter and the ribbon', () => {
    // 400px between kick gutter and right edge; ribbon claims RIBBON_W → 330 lane.
    const width = RULER_W + KICK_W + 400
    const laneW = 400 - RIBBON_W
    const layout = computeLayout(width, classes)
    expect(layout.laneLeft).toBe(RULER_W + KICK_W)
    expect(layout.laneWidth).toBeCloseTo(laneW, 6)
    expect(layout.ribbonW).toBe(RIBBON_W)
    expect(layout.ribbonX).toBeCloseTo(RULER_W + KICK_W + laneW, 6)
    expect(layout.columns).toHaveLength(4)
    expect(layout.columns[0]!.width).toBeCloseTo(laneW / 4, 6)
    expect(layout.columns[0]!.x).toBe(RULER_W + KICK_W)
    expect(layout.columns[0]!.cx).toBeCloseTo(RULER_W + KICK_W + laneW / 8, 6)
  })

  it('collapses the ribbon on very narrow canvases so lanes never go negative', () => {
    const layout = computeLayout(RULER_W + KICK_W + 30, classes)
    expect(layout.ribbonW).toBe(0)
    expect(layout.laneWidth).toBe(30)
    expect(layout.ribbonX).toBe(RULER_W + KICK_W + 30)
  })
})

describe('columnIndexAtX', () => {
  const width = RULER_W + KICK_W + 400
  const layout = computeLayout(width, classes)
  const laneW = layout.laneWidth
  it('returns -1 over the ruler / kick gutter', () => {
    expect(columnIndexAtX(layout, 0)).toBe(-1)
    expect(columnIndexAtX(layout, RULER_W + 1)).toBe(-1) // inside kick gutter
  })
  it('maps lane-area x to the right column', () => {
    expect(columnIndexAtX(layout, layout.laneLeft + 1)).toBe(0)
    expect(columnIndexAtX(layout, layout.laneLeft + laneW / 2)).toBe(2)
    expect(columnIndexAtX(layout, layout.laneLeft + laneW - 1)).toBe(3)
  })
  it('returns -1 past the right edge', () => {
    expect(columnIndexAtX(layout, width + 50)).toBe(-1)
  })
})

describe('velocity ribbon geometry', () => {
  const layout = computeLayout(RULER_W + KICK_W + 400, classes)

  it('isInRibbon is true inside the strip, false in the lanes', () => {
    expect(isInRibbon(layout, layout.ribbonX + 5)).toBe(true)
    expect(isInRibbon(layout, layout.ribbonX + layout.ribbonW)).toBe(true)
    expect(isInRibbon(layout, layout.laneLeft + 5)).toBe(false)
  })

  it('isInRibbon is false when the ribbon is collapsed', () => {
    const narrow = computeLayout(RULER_W + KICK_W + 30, classes)
    expect(isInRibbon(narrow, narrow.ribbonX)).toBe(false)
  })

  it('ribbonBarLength scales 0..127 across the inner width', () => {
    const inner = layout.ribbonW - RIBBON_PAD * 2
    expect(ribbonBarLength(layout, 0)).toBeCloseTo(0, 6)
    expect(ribbonBarLength(layout, 127)).toBeCloseTo(inner, 6)
    expect(ribbonBarLength(layout, 64)).toBeCloseTo((64 / 127) * inner, 6)
  })

  it('ribbonXToVel inverts ribbonBarLength and clamps to 1..127', () => {
    const start = layout.ribbonX + RIBBON_PAD
    const inner = layout.ribbonW - RIBBON_PAD * 2
    // at the start → 1 (clamped up from 0), at the far end → 127
    expect(ribbonXToVel(layout, start)).toBe(1)
    expect(ribbonXToVel(layout, start + inner)).toBe(127)
    expect(ribbonXToVel(layout, start - 50)).toBe(1) // clamp low
    expect(ribbonXToVel(layout, start + inner + 50)).toBe(127) // clamp high
    // round-trips a mid value
    expect(ribbonXToVel(layout, start + ribbonBarLength(layout, 90))).toBe(90)
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
