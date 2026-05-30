import { describe, it, expect } from 'vitest'
import { resolveChart } from './resolve-notes'
import { DEFAULT_KIT } from '@/lib/default-kit'
import type { StudioNote } from '@studio/types'

// Index of a lane id within DEFAULT_KIT.lanes (mirrors how resolveChart maps
// resolved lane ids back to kit indices).
const laneIndexOf = (id: string) => DEFAULT_KIT.lanes.findIndex((l) => l.id === id)

function note(partial: Partial<StudioNote> & { instrumentClass: string; vel: number }): StudioNote {
  return { id: crypto.randomUUID(), time: 0, ...partial }
}

describe('resolveChart', () => {
  it('routes kick into full-width and snare/hihat into columns', () => {
    const notes: StudioNote[] = [
      note({ instrumentClass: 'BP_Kick_C', vel: 100, time: 0 }),
      note({ instrumentClass: 'BP_Snare_C', vel: 80, time: 0.5 }),
      note({ instrumentClass: 'BP_HiHat_C', vel: 60, time: 1.0 }),
    ]
    const { columnLanes, laneIndexToColumnPos, laneIndexToFullWidth } = resolveChart(notes)

    const kickIdx = laneIndexOf('kick')
    const snareIdx = laneIndexOf('snare')
    const hihatIdx = laneIndexOf('hihat')

    // Kick is full-width → goes in laneIndexToFullWidth, NOT in columns
    expect(laneIndexToFullWidth.has(kickIdx)).toBe(true)
    expect(laneIndexToColumnPos.has(kickIdx)).toBe(false)

    // Snare + hihat are column lanes → in laneIndexToColumnPos, NOT full-width
    expect(laneIndexToColumnPos.has(snareIdx)).toBe(true)
    expect(laneIndexToColumnPos.has(hihatIdx)).toBe(true)
    expect(laneIndexToFullWidth.has(snareIdx)).toBe(false)
    expect(laneIndexToFullWidth.has(hihatIdx)).toBe(false)

    // columnLanes contains exactly the two column lanes that have notes
    expect(columnLanes).toHaveLength(2)
    const colIds = columnLanes.map((l) => l.id).sort()
    expect(colIds).toEqual(['hihat', 'snare'])

    // laneIndexToColumnPos values index into columnLanes correctly
    expect(columnLanes[laneIndexToColumnPos.get(snareIdx)!]!.id).toBe('snare')
    expect(columnLanes[laneIndexToColumnPos.get(hihatIdx)!]!.id).toBe('hihat')
  })

  it('classifies noteType from velocity using default thresholds (30/90)', () => {
    const notes: StudioNote[] = [
      note({ instrumentClass: 'BP_Snare_C', vel: 20, time: 0 }), // ghost
      note({ instrumentClass: 'BP_Snare_C', vel: 60, time: 1 }), // normal
      note({ instrumentClass: 'BP_Snare_C', vel: 100, time: 2 }), // accent
    ]
    const { resolvedNotes } = resolveChart(notes)
    expect(resolvedNotes[0]!.noteType).toBe('ghost')
    expect(resolvedNotes[1]!.noteType).toBe('normal')
    expect(resolvedNotes[2]!.noteType).toBe('accent')
    // velocity carried through from vel
    expect(resolvedNotes[0]!.velocity).toBe(20)
    expect(resolvedNotes[1]!.velocity).toBe(60)
    expect(resolvedNotes[2]!.velocity).toBe(100)
  })

  it('respects boundary thresholds (<= ghost, >= accent)', () => {
    const notes: StudioNote[] = [
      note({ instrumentClass: 'BP_Snare_C', vel: 30, time: 0 }), // exactly ghost threshold → ghost
      note({ instrumentClass: 'BP_Snare_C', vel: 31, time: 1 }), // just above → normal
      note({ instrumentClass: 'BP_Snare_C', vel: 89, time: 2 }), // just below accent → normal
      note({ instrumentClass: 'BP_Snare_C', vel: 90, time: 3 }), // exactly accent threshold → accent
    ]
    const { resolvedNotes } = resolveChart(notes)
    expect(resolvedNotes.map((n) => n.noteType)).toEqual(['ghost', 'normal', 'normal', 'accent'])
  })

  it('honors custom ghost/accent thresholds', () => {
    const notes: StudioNote[] = [note({ instrumentClass: 'BP_Snare_C', vel: 50, time: 0 })]
    expect(resolveChart(notes, { ghostThreshold: 60 }).resolvedNotes[0]!.noteType).toBe('ghost')
    expect(resolveChart(notes, { accentThreshold: 40 }).resolvedNotes[0]!.noteType).toBe('accent')
  })

  it('assigns laneIndex -1 to unknown classes and excludes them from columns/full-width', () => {
    const notes: StudioNote[] = [
      note({ instrumentClass: 'BP_Snare_C', vel: 80, time: 0 }),
      note({ instrumentClass: 'BP_Totally_Unknown_C', vel: 80, time: 1 }),
    ]
    const { resolvedNotes, columnLanes, laneIndexToColumnPos, laneIndexToFullWidth } = resolveChart(notes)

    const unknown = resolvedNotes.find((n) => n.instrumentClass === 'BP_Totally_Unknown_C')!
    expect(unknown.laneIndex).toBe(-1)

    // -1 must never appear as a column or full-width key
    expect(laneIndexToColumnPos.has(-1)).toBe(false)
    expect(laneIndexToFullWidth.has(-1)).toBe(false)

    // Only the snare lane shows up as a column; unknown contributes nothing
    expect(columnLanes.map((l) => l.id)).toEqual(['snare'])
  })

  it('produces HighwayNotes with all required fields', () => {
    const { resolvedNotes } = resolveChart([note({ instrumentClass: 'BP_Kick_C', vel: 100, time: 1.25 })])
    const n = resolvedNotes[0]!
    expect(n).toEqual(
      expect.objectContaining({
        time: 1.25,
        laneIndex: laneIndexOf('kick'),
        velocity: 100,
        noteType: 'accent',
        instrumentClass: 'BP_Kick_C',
      }),
    )
  })
})
