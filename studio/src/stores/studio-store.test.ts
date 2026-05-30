import { describe, it, expect, beforeEach } from 'vitest'
import type { StudioChart } from '@studio/types'
import { useStudioStore } from './studio-store'

/** A fresh, isolated chart for each test — two notes, a single 120bpm region. */
function freshChart(): StudioChart {
  return {
    meta: { title: 'T', artist: 'A', creator: 'C', difficulty: 'Expert', complexity: 3, length: 10 },
    bpmEvents: [{ bpm: 120, time: 0, timeSignature: [4, 4] }],
    notes: [
      { id: 'n1', time: 0.5, instrumentClass: 'BP_HiHat_C', vel: 80 },
      { id: 'n2', time: 1.0, instrumentClass: 'BP_Snare_C', vel: 100 },
    ],
  }
}

const get = () => useStudioStore.getState()
const temporal = () => useStudioStore.temporal.getState()

beforeEach(() => {
  // Isolate every test: reset chart, selection, snap, and undo history.
  useStudioStore.setState({ chart: null, selection: [], snap: '1/8' })
  temporal().clear()
  get().loadChart(freshChart())
  temporal().clear() // loadChart pushed a snapshot — start each test with empty history
})

describe('studio-store: loading & meta', () => {
  it('loadChart sets chart.notes', () => {
    expect(get().chart).not.toBeNull()
    expect(get().chart!.notes).toHaveLength(2)
    expect(get().chart!.notes[0]!.id).toBe('n1')
  })

  it('default snap is 1/8', () => {
    expect(get().snap).toBe('1/8')
  })

  it('setMeta patches metadata immutably', () => {
    const before = get().chart!.meta
    get().setMeta({ title: 'New Title', complexity: 5 })
    expect(get().chart!.meta.title).toBe('New Title')
    expect(get().chart!.meta.complexity).toBe(5)
    expect(get().chart!.meta.artist).toBe('A') // untouched
    expect(get().chart!.meta).not.toBe(before) // new object
  })
})

describe('studio-store: note edits', () => {
  it('addNote increases length by 1 and returns an id that exists', () => {
    const before = get().chart!.notes.length
    const id = get().addNote({ time: 2.0, instrumentClass: 'BP_Kick_C', vel: 90 })
    expect(get().chart!.notes.length).toBe(before + 1)
    expect(typeof id).toBe('string')
    expect(get().chart!.notes.some(n => n.id === id)).toBe(true)
    expect(get().chart!.notes.find(n => n.id === id)!.time).toBe(2.0)
  })

  it('moveNotes shifts time by dt and changes instrumentClass when dLaneClass is set', () => {
    get().moveNotes(['n1'], { dt: 0.25, dLaneClass: 'BP_Tom1_C' })
    const n1 = get().chart!.notes.find(n => n.id === 'n1')!
    expect(n1.time).toBeCloseTo(0.75)
    expect(n1.instrumentClass).toBe('BP_Tom1_C')
    // unrelated note untouched
    expect(get().chart!.notes.find(n => n.id === 'n2')!.time).toBe(1.0)
  })

  it('moveNotes without dLaneClass only shifts time', () => {
    get().moveNotes(['n2'], { dt: -0.5 })
    const n2 = get().chart!.notes.find(n => n.id === 'n2')!
    expect(n2.time).toBeCloseTo(0.5)
    expect(n2.instrumentClass).toBe('BP_Snare_C') // class preserved
  })

  it('setVelocity clamps to 1..127', () => {
    get().setVelocity(['n1'], 200)
    expect(get().chart!.notes.find(n => n.id === 'n1')!.vel).toBe(127)
    get().setVelocity(['n1'], 0)
    expect(get().chart!.notes.find(n => n.id === 'n1')!.vel).toBe(1)
    get().setVelocity(['n1'], 64)
    expect(get().chart!.notes.find(n => n.id === 'n1')!.vel).toBe(64)
  })

  it('deleteNotes removes the targeted ids', () => {
    get().deleteNotes(['n1'])
    expect(get().chart!.notes.some(n => n.id === 'n1')).toBe(false)
    expect(get().chart!.notes).toHaveLength(1)
  })

  it('remapClass rewrites every matching note', () => {
    // add a 2nd hihat so we can prove ALL matches are rewritten
    get().addNote({ time: 3.0, instrumentClass: 'BP_HiHat_C', vel: 70 })
    expect(get().chart!.notes.filter(n => n.instrumentClass === 'BP_HiHat_C').length).toBe(2)
    get().remapClass('BP_HiHat_C', 'BP_Ride_C')
    expect(get().chart!.notes.filter(n => n.instrumentClass === 'BP_HiHat_C').length).toBe(0)
    expect(get().chart!.notes.filter(n => n.instrumentClass === 'BP_Ride_C').length).toBe(2)
    // snare untouched
    expect(get().chart!.notes.filter(n => n.instrumentClass === 'BP_Snare_C').length).toBe(1)
  })
})

describe('studio-store: selection & snap (NOT in undo history)', () => {
  it('setSelection / clearSelection update selection', () => {
    get().setSelection(['n1', 'n2'])
    expect(get().selection).toEqual(['n1', 'n2'])
    get().clearSelection()
    expect(get().selection).toEqual([])
  })

  it('setSnap updates snap', () => {
    get().setSnap('1/16')
    expect(get().snap).toBe('1/16')
  })

  it('selection/snap changes do not pollute undo history', () => {
    expect(temporal().pastStates.length).toBe(0)
    get().setSelection(['n1'])
    get().setSnap('1/4')
    // partialize tracks only `chart`, so these produced no history entries
    expect(temporal().pastStates.length).toBe(0)
  })
})

describe('studio-store: null-chart guards', () => {
  it('mutations are no-ops when chart is null', () => {
    useStudioStore.setState({ chart: null })
    expect(() => {
      get().setMeta({ title: 'x' })
      get().moveNotes(['n1'], { dt: 1 })
      get().setVelocity(['n1'], 50)
      get().deleteNotes(['n1'])
      get().remapClass('BP_HiHat_C', 'BP_Ride_C')
    }).not.toThrow()
    expect(get().chart).toBeNull()
    expect(get().addNote({ time: 1, instrumentClass: 'BP_Kick_C', vel: 90 })).toBe('')
  })
})

describe('studio-store: undo / redo', () => {
  it('undo restores the prior notes length after addNote; redo reapplies', () => {
    const before = get().chart!.notes.length
    get().addNote({ time: 5.0, instrumentClass: 'BP_Kick_C', vel: 90 })
    expect(get().chart!.notes.length).toBe(before + 1)

    temporal().undo()
    expect(get().chart!.notes.length).toBe(before)

    temporal().redo()
    expect(get().chart!.notes.length).toBe(before + 1)
  })

  it('undo reverses a delete', () => {
    get().deleteNotes(['n1'])
    expect(get().chart!.notes.some(n => n.id === 'n1')).toBe(false)
    temporal().undo()
    expect(get().chart!.notes.some(n => n.id === 'n1')).toBe(true)
  })
})
