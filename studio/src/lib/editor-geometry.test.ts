import { describe, it, expect } from 'vitest'
import type { StudioNote } from '@studio/types'
import { computeLayout, RULER_W, KICK_W, HEADER_H } from './editor-layout'
import { laneOrder } from './grid'
import {
  isKickClass,
  columnClassFor,
  noteY,
  noteCenterX,
  hitNote,
  topNoteAt,
  noteInRect,
} from './editor-geometry'

// A roomy canvas so columns are wide and easy to reason about.
const WIDTH = RULER_W + KICK_W + 700
const layout = computeLayout(WIDTH)
const VS = 0 // viewStartTime
const PPS = 100 // pxPerSec → 1s = 100px

const order = laneOrder()
const snareClass = 'BP_Snare_C'
const hihatClass = 'BP_HiHat_C'

const note = (id: string, time: number, instrumentClass: string): StudioNote => ({
  id,
  time,
  instrumentClass,
  vel: 100,
})

describe('isKickClass', () => {
  it('detects kick vs non-kick (incl. variant classes via resolver)', () => {
    expect(isKickClass('BP_Kick_C')).toBe(true)
    expect(isKickClass('BP_Snare_C')).toBe(false)
    expect(isKickClass('BP_Crash18_C')).toBe(false)
  })
})

describe('columnClassFor', () => {
  it('maps a lane-variant class to the column representative class', () => {
    // crash variants all resolve to the crash lane → crash column class
    const crashCol = columnClassFor('BP_Crash18_C')
    expect(order).toContain(crashCol)
    expect(columnClassFor('BP_Crash13_C')).toBe(crashCol)
  })
  it('is identity for a class already in laneOrder', () => {
    expect(columnClassFor(snareClass)).toBe(snareClass)
  })
})

describe('noteY', () => {
  it('places earlier time higher (smaller y), offset by the header', () => {
    expect(noteY(0, layout, VS, PPS)).toBe(HEADER_H) // t=0 at top of lane area
    expect(noteY(1, layout, VS, PPS)).toBe(HEADER_H + 100)
    expect(noteY(2, layout, VS, PPS)).toBeGreaterThan(noteY(1, layout, VS, PPS))
  })
})

describe('noteCenterX', () => {
  it('centers non-kick notes on their column and kick across the lane area', () => {
    const snareCx = noteCenterX(snareClass, layout)
    const col = layout.columns.find((c) => c.instrumentClass === columnClassFor(snareClass))!
    expect(snareCx).toBeCloseTo(col.cx, 6)
    expect(noteCenterX('BP_Kick_C', layout)).toBeCloseTo(layout.laneLeft + layout.laneWidth / 2, 6)
  })
})

describe('hitNote', () => {
  const n = note('s1', 1.0, snareClass) // y = HEADER_H + 100
  const cx = noteCenterX(snareClass, layout)
  it('hits at the note center', () => {
    expect(hitNote(n, cx, HEADER_H + 100, layout, VS, PPS)).toBe(true)
  })
  it('misses when y is far from the note', () => {
    expect(hitNote(n, cx, HEADER_H + 140, layout, VS, PPS)).toBe(false)
  })
  it('misses when x is in a different column', () => {
    // pick a column that is NOT the snare column
    const other = layout.columns.find((c) => c.instrumentClass !== columnClassFor(snareClass))!
    expect(hitNote(n, other.cx, HEADER_H + 100, layout, VS, PPS)).toBe(false)
  })
  it('kick note is hit anywhere across the lane width', () => {
    const k = note('k1', 1.0, 'BP_Kick_C')
    expect(hitNote(k, layout.laneLeft + 5, HEADER_H + 100, layout, VS, PPS)).toBe(true)
    expect(hitNote(k, layout.laneLeft + layout.laneWidth - 5, HEADER_H + 100, layout, VS, PPS)).toBe(true)
  })
})

describe('topNoteAt', () => {
  const notes = [
    note('a', 1.0, snareClass),
    note('b', 1.0, hihatClass),
  ]
  it('returns the note in the clicked column', () => {
    const hhCx = noteCenterX(hihatClass, layout)
    expect(topNoteAt(hhCx, HEADER_H + 100, notes, layout, VS, PPS)?.id).toBe('b')
    const snCx = noteCenterX(snareClass, layout)
    expect(topNoteAt(snCx, HEADER_H + 100, notes, layout, VS, PPS)?.id).toBe('a')
  })
  it('returns null over the header band', () => {
    expect(topNoteAt(layout.laneLeft + 10, HEADER_H - 2, notes, layout, VS, PPS)).toBeNull()
  })
  it('returns null on empty space', () => {
    expect(topNoteAt(layout.laneLeft + 10, HEADER_H + 300, notes, layout, VS, PPS)).toBeNull()
  })
})

describe('noteInRect (marquee)', () => {
  const notes = [
    note('a', 1.0, snareClass), // y = HEADER_H+100
    note('b', 2.0, hihatClass), // y = HEADER_H+200
    note('c', 5.0, snareClass), // y = HEADER_H+500 (outside small rect)
  ]
  it('selects notes whose center falls in the rect', () => {
    // a rect covering the whole lane width, y from HEADER_H+50 to HEADER_H+250
    const rect = { x0: layout.laneLeft, y0: HEADER_H + 50, x1: WIDTH, y1: HEADER_H + 250 }
    const ids = notes.filter((n) => noteInRect(n, rect, layout, VS, PPS)).map((n) => n.id)
    expect(ids.sort()).toEqual(['a', 'b'])
  })
  it('excludes notes whose column center is outside the x-range', () => {
    // narrow rect around ONLY the snare column, full y range
    const snCol = layout.columns.find((c) => c.instrumentClass === columnClassFor(snareClass))!
    const rect = { x0: snCol.x, y0: HEADER_H, x1: snCol.x + snCol.width, y1: HEADER_H + 600 }
    const ids = notes.filter((n) => noteInRect(n, rect, layout, VS, PPS)).map((n) => n.id)
    // only the two snare notes (a, c), not the hihat (b)
    expect(ids.sort()).toEqual(['a', 'c'])
  })
  it('kick note is selected by any rect overlapping the lane area at its y', () => {
    const k = note('k', 2.0, 'BP_Kick_C') // y = HEADER_H+200
    const rect = { x0: layout.laneLeft, y0: HEADER_H + 180, x1: layout.laneLeft + 30, y1: HEADER_H + 220 }
    expect(noteInRect(k, rect, layout, VS, PPS)).toBe(true)
  })
})
