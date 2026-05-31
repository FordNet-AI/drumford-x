import { describe, it, expect } from 'vitest'
import { analyzeCues, type CueEvent } from './cue-analysis'
import type { HighwayNote, RlrrBpmEvent, Song } from '@/types/song'

// ---------------------------------------------------------------------------
// Test fixtures — small synthesized Songs built directly (no MIDI / no files).
// laneIndex is kit-dependent and irrelevant to pure analysis, so it's always 0;
// classification is driven by `instrumentClass` (resolved kit-independently).
// ---------------------------------------------------------------------------

const CLASS = {
  kick: 'BP_Kick_C',
  snare: 'BP_Snare_C',
  hihat: 'BP_HiHat_C',
  tom1: 'BP_Tom1_C',
  tom2: 'BP_Tom2_C',
  floorTom: 'BP_FloorTom_C',
  crash: 'BP_Crash18_C',
  ride: 'BP_Ride_C',
} as const

function note(time: number, instrumentClass: string): HighwayNote {
  return { time, laneIndex: 0, velocity: 100, noteType: 'normal', instrumentClass }
}

function makeSong(partial: {
  notes?: HighwayNote[]
  bpmEvents?: RlrrBpmEvent[]
  duration?: number
  sections?: { time: number; label: string }[]
}): Song {
  const notes = (partial.notes ?? []).slice().sort((a, b) => a.time - b.time)
  const bpmEvents = partial.bpmEvents ?? [{ bpm: 120, time: 0, timeSignature: [4, 4] }]
  const duration =
    partial.duration ?? (notes.length ? notes[notes.length - 1]!.time + 1 : 30)
  return {
    id: 'test',
    title: 'Test',
    artist: 'Test',
    creator: 'Test',
    duration,
    complexity: 1,
    difficulty: 'Test',
    coverImageBlob: null,
    folderName: 'test',
    notes,
    bpmEvents,
    sections: partial.sections,
    ghostNoteThreshold: 0.3,
    accentNoteThreshold: 0.85,
    calibrationOffset: 0,
  }
}

/**
 * Build a steady 4/4 kick+snare+hi-hat groove: hi-hat on every 8th, kick on
 * beats 1 & 3, snare on 2 & 4. This is the canonical "no fill here" pattern.
 */
function steadyGroove(bars: number, bpm: number, startTime = 0): HighwayNote[] {
  const beat = 60 / bpm
  const out: HighwayNote[] = []
  for (let b = 0; b < bars * 4; b++) {
    const t = startTime + b * beat
    // hi-hat on the beat and the off-beat 8th
    out.push(note(t, CLASS.hihat))
    out.push(note(t + beat / 2, CLASS.hihat))
    const beatInBar = b % 4
    if (beatInBar === 0 || beatInBar === 2) out.push(note(t, CLASS.kick))
    if (beatInBar === 1 || beatInBar === 3) out.push(note(t, CLASS.snare))
  }
  return out
}

function cuesOfType(cues: CueEvent[], type: string): CueEvent[] {
  return cues.filter((c) => c.type === type)
}

describe('analyzeCues', () => {
  it('emits a tempo cue for a 120→140 change at t=10, fireAt before the event, mentions 140', () => {
    const song = makeSong({
      notes: steadyGroove(16, 120),
      bpmEvents: [
        { bpm: 120, time: 0, timeSignature: [4, 4] },
        { bpm: 140, time: 10, timeSignature: [4, 4] },
      ],
      duration: 40,
    })
    const cues = analyzeCues(song)
    const tempo = cuesOfType(cues, 'tempo')
    expect(tempo.length).toBeGreaterThanOrEqual(1)
    const c = tempo.find((x) => Math.abs(x.time - 10) < 0.001)!
    expect(c).toBeDefined()
    expect(c.fireAt).toBeLessThan(10)
    expect(c.fireAt).toBeGreaterThanOrEqual(0)
    expect(c.text).toContain('140')
    expect(c.text.toLowerCase()).toContain('speeding up')
    expect(c.banner).toContain('140')
  })

  it('uses "Slowing down" wording when the tempo drops', () => {
    const song = makeSong({
      bpmEvents: [
        { bpm: 160, time: 0, timeSignature: [4, 4] },
        { bpm: 120, time: 8, timeSignature: [4, 4] },
      ],
      duration: 20,
    })
    const tempo = cuesOfType(analyzeCues(song), 'tempo')
    expect(tempo.length).toBe(1)
    expect(tempo[0]!.text.toLowerCase()).toContain('slowing down')
    expect(tempo[0]!.text).toContain('120')
  })

  it('does NOT emit a tempo cue for a tiny (<=2 bpm) wobble', () => {
    const song = makeSong({
      bpmEvents: [
        { bpm: 120, time: 0, timeSignature: [4, 4] },
        { bpm: 121, time: 8, timeSignature: [4, 4] },
      ],
      duration: 20,
    })
    expect(cuesOfType(analyzeCues(song), 'tempo').length).toBe(0)
  })

  it('emits a meter cue for a 4/4 → 7/8 change mentioning 7/8', () => {
    const song = makeSong({
      bpmEvents: [
        { bpm: 120, time: 0, timeSignature: [4, 4] },
        { bpm: 120, time: 12, timeSignature: [7, 8] },
      ],
      duration: 30,
    })
    const meter = cuesOfType(analyzeCues(song), 'meter')
    expect(meter.length).toBe(1)
    expect(meter[0]!.text).toContain('7/8')
    expect(meter[0]!.banner).toContain('7/8')
    expect(meter[0]!.fireAt).toBeLessThan(12)
  })

  it('emits a fill cue near the onset of a clear tom+crash burst', () => {
    // 8 bars of steady groove, then a dense tom roll + crash at ~t=16.
    const groove = steadyGroove(8, 120) // ends ~t=16
    const fillStart = 16
    const fill: HighwayNote[] = []
    // 16th-note tom roll across tom1/tom2/floorTom for ~1s, capped by a crash.
    const sixteenth = (60 / 120) / 4 // 0.125s
    const tomCycle = [CLASS.tom1, CLASS.tom2, CLASS.floorTom]
    for (let i = 0; i < 8; i++) {
      fill.push(note(fillStart + i * sixteenth, tomCycle[i % 3]!))
    }
    fill.push(note(fillStart + 8 * sixteenth, CLASS.crash))
    const song = makeSong({ notes: [...groove, ...fill], duration: 24 })

    const fills = cuesOfType(analyzeCues(song), 'fill')
    expect(fills.length).toBeGreaterThanOrEqual(1)
    // The fill cue's EVENT time should be near the burst onset.
    const near = fills.find((f) => Math.abs(f.time - fillStart) < 1.0)
    expect(near).toBeDefined()
    expect(near!.fireAt).toBeLessThanOrEqual(near!.time)
    expect(near!.banner.toUpperCase()).toContain('FILL')
  })

  it('does NOT emit a fill cue for a plain 4/4 kick+snare+hat groove (no false positive)', () => {
    const song = makeSong({ notes: steadyGroove(24, 120), duration: 50 })
    expect(cuesOfType(analyzeCues(song), 'fill').length).toBe(0)
  })

  it('does NOT emit a fill cue for occasional single tom accents in a groove', () => {
    // Groove with one isolated tom hit per bar (a color note, not a fill):
    // never 2+ distinct tom/cymbal lanes inside one 0.75s window.
    const groove = steadyGroove(16, 120)
    const beat = 60 / 120
    const accents: HighwayNote[] = []
    for (let bar = 0; bar < 16; bar++) {
      accents.push(note(bar * 4 * beat + beat * 3, CLASS.tom1)) // one tom on the "and of 4"-ish
    }
    const song = makeSong({ notes: [...groove, ...accents], duration: 40 })
    expect(cuesOfType(analyzeCues(song), 'fill').length).toBe(0)
  })

  it('emits a fill cue for a tom roll layered on top of a continuing hi-hat groove', () => {
    // Groove keeps going (hats + backbeat) AND a 3-lane tom roll rides over it.
    const bpm = 120
    const beat = 60 / bpm
    const sixteenth = beat / 4
    const out: HighwayNote[] = []
    for (let b = 0; b < 12 * 4; b++) {
      const t = b * beat
      out.push(note(t, CLASS.hihat))
      out.push(note(t + beat / 2, CLASS.hihat))
      const bi = b % 4
      if (bi === 0 || bi === 2) out.push(note(t, CLASS.kick))
      if (bi === 1 || bi === 3) out.push(note(t, CLASS.snare))
    }
    const rollStart = 20
    const tomCycle = [CLASS.tom1, CLASS.tom2, CLASS.floorTom]
    for (let i = 0; i < 12; i++) out.push(note(rollStart + i * sixteenth, tomCycle[i % 3]!))
    const song = makeSong({ notes: out, duration: 30 })

    const fills = cuesOfType(analyzeCues(song), 'fill')
    expect(fills.length).toBeGreaterThanOrEqual(1)
    expect(fills.some((f) => Math.abs(f.time - rollStart) < 1.0)).toBe(true)
  })

  it('does NOT emit a fill cue for a busy-but-steady 16th hi-hat groove', () => {
    // Driving 16th hats + backbeat — high density, but only ONE non-kit-fill
    // lane class (hi-hat). Must not be mistaken for a tom/cymbal fill.
    const bpm = 120
    const sixteenth = (60 / bpm) / 4
    const beat = 60 / bpm
    const out: HighwayNote[] = []
    for (let b = 0; b < 16 * 4; b++) {
      const tBeat = b * beat
      for (let s = 0; s < 4; s++) out.push(note(tBeat + s * sixteenth, CLASS.hihat))
      const beatInBar = b % 4
      if (beatInBar === 0 || beatInBar === 2) out.push(note(tBeat, CLASS.kick))
      if (beatInBar === 1 || beatInBar === 3) out.push(note(tBeat, CLASS.snare))
    }
    const song = makeSong({ notes: out, duration: 40 })
    expect(cuesOfType(analyzeCues(song), 'fill').length).toBe(0)
  })

  it('emits a doubleKick cue for a fast sustained kick run', () => {
    // 24 kicks at 16th notes @ 160bpm → inter-onset ~0.094s (< 0.18s), sustained.
    const groove = steadyGroove(8, 160)
    const runStart = 14
    const ioi = 0.09
    const run: HighwayNote[] = []
    for (let i = 0; i < 24; i++) run.push(note(runStart + i * ioi, CLASS.kick))
    const song = makeSong({ notes: [...groove, ...run], duration: 24 })

    const dk = cuesOfType(analyzeCues(song), 'doubleKick')
    expect(dk.length).toBeGreaterThanOrEqual(1)
    const near = dk.find((d) => Math.abs(d.time - runStart) < 0.5)
    expect(near).toBeDefined()
    expect(near!.banner.toUpperCase()).toContain('DOUBLE KICK')
    expect(near!.fireAt).toBeLessThanOrEqual(near!.time)
  })

  it('does NOT emit doubleKick for a normal kick on 1 & 3', () => {
    const song = makeSong({ notes: steadyGroove(16, 120), duration: 35 })
    expect(cuesOfType(analyzeCues(song), 'doubleKick').length).toBe(0)
  })

  it('spacing/dedup keeps the higher-priority cue for near-simultaneous events', () => {
    // A meter change and a fill onset land at essentially the same time.
    // Meter outranks fill → only the meter cue survives.
    const meterTime = 16
    const groove = steadyGroove(8, 120)
    const sixteenth = (60 / 120) / 4
    const tomCycle = [CLASS.tom1, CLASS.tom2, CLASS.floorTom]
    const fill: HighwayNote[] = []
    for (let i = 0; i < 8; i++) fill.push(note(meterTime + i * sixteenth, tomCycle[i % 3]!))
    fill.push(note(meterTime + 8 * sixteenth, CLASS.crash))
    const song = makeSong({
      notes: [...groove, ...fill],
      bpmEvents: [
        { bpm: 120, time: 0, timeSignature: [4, 4] },
        { bpm: 120, time: meterTime, timeSignature: [7, 8] },
      ],
      duration: 24,
    })

    const cues = analyzeCues(song)
    const meter = cuesOfType(cues, 'meter')
    const fills = cuesOfType(cues, 'fill')
    expect(meter.length).toBe(1)
    // The fill that collided with the meter cue (within the spacing window)
    // must have been dropped.
    const collidingFill = fills.find(
      (f) => Math.abs(f.fireAt - meter[0]!.fireAt) < 1.2,
    )
    expect(collidingFill).toBeUndefined()
  })

  it('returns cues sorted by fireAt ascending', () => {
    const song = makeSong({
      notes: steadyGroove(20, 120),
      bpmEvents: [
        { bpm: 120, time: 0, timeSignature: [4, 4] },
        { bpm: 100, time: 8, timeSignature: [4, 4] },
        { bpm: 140, time: 20, timeSignature: [7, 8] },
        { bpm: 90, time: 30, timeSignature: [4, 4] },
      ],
      duration: 45,
    })
    const cues = analyzeCues(song)
    expect(cues.length).toBeGreaterThan(1)
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i]!.fireAt).toBeGreaterThanOrEqual(cues[i - 1]!.fireAt)
    }
  })

  it('clamps fireAt to >= 0 even when leadSeconds exceeds the event time', () => {
    // Tempo change very early (t=1) — lead time would push fireAt negative.
    const song = makeSong({
      bpmEvents: [
        { bpm: 80, time: 0, timeSignature: [4, 4] },
        { bpm: 140, time: 1, timeSignature: [4, 4] },
      ],
      duration: 20,
    })
    const cues = analyzeCues(song)
    for (const c of cues) expect(c.fireAt).toBeGreaterThanOrEqual(0)
  })

  it('handles an empty / note-free song without throwing', () => {
    expect(analyzeCues(makeSong({}))).toEqual([])
  })

  // -------------------------------------------------------------------------
  // Section cues (from .rlrr bookmarks → Song.sections)
  // -------------------------------------------------------------------------

  it('emits a section cue at the section time with the label as text + banner', () => {
    const song = makeSong({
      notes: steadyGroove(24, 120),
      sections: [{ time: 30, label: 'Chorus' }],
      duration: 60,
    })
    const sections = cuesOfType(analyzeCues(song), 'section')
    expect(sections.length).toBe(1)
    const c = sections[0]!
    expect(Math.abs(c.time - 30)).toBeLessThan(0.001)
    expect(c.text).toBe('Chorus')
    expect(c.banner).toBe('Chorus')
    // Lead time ~2 bars before the boundary.
    expect(c.fireAt).toBeLessThan(30)
    expect(c.fireAt).toBeGreaterThanOrEqual(0)
  })

  it('emits one section cue per bookmark', () => {
    const song = makeSong({
      notes: steadyGroove(40, 120),
      sections: [
        { time: 16, label: 'Verse' },
        { time: 40, label: 'Chorus' },
        { time: 64, label: 'Bridge' },
      ],
      duration: 90,
    })
    const sections = cuesOfType(analyzeCues(song), 'section')
    expect(sections.length).toBe(3)
    expect(sections.map((s) => s.banner).sort()).toEqual(['Bridge', 'Chorus', 'Verse'])
  })

  it('emits no section cues when the song has no sections', () => {
    const song = makeSong({ notes: steadyGroove(24, 120), duration: 50 })
    expect(cuesOfType(analyzeCues(song), 'section').length).toBe(0)
  })

  // -------------------------------------------------------------------------
  // Re-entry count-in (the headline)
  // -------------------------------------------------------------------------

  it('emits exactly one reentry cue after a >= 2-bar drum gap, with the right countdown', () => {
    const bpm = 120
    const beat = 60 / bpm // 0.5s
    // Two bars of groove starting near t=0 (first note ~0, so no from-start reentry),
    // a long silence (4 bars = 8s >> 2-bar threshold of 4s), then the re-entry hit.
    const intro = steadyGroove(2, bpm, 0) // notes from 0..~3.5s
    const reentryTime = 12 // gap from last intro note (~3.75s) is ~8s ≥ 4s
    const after = steadyGroove(2, bpm, reentryTime)
    const song = makeSong({ notes: [...intro, ...after], duration: 20 })

    const reentries = cuesOfType(analyzeCues(song), 'reentry')
    expect(reentries.length).toBe(1)
    const c = reentries[0]!
    // time = the re-entry hit.
    expect(Math.abs(c.time - reentryTime)).toBeLessThan(0.001)
    // countdown = last bar of beats (4/4 → 4 beats) leading into the hit.
    expect(c.countdown).toBeDefined()
    expect(c.countdown!.length).toBe(4)
    const expected = [
      reentryTime - 4 * beat,
      reentryTime - 3 * beat,
      reentryTime - 2 * beat,
      reentryTime - 1 * beat,
    ]
    c.countdown!.forEach((t, i) => expect(Math.abs(t - expected[i]!)).toBeLessThan(1e-6))
    // fireAt = first count beat.
    expect(Math.abs(c.fireAt - expected[0]!)).toBeLessThan(1e-6)
    // Counts ascend in time (numbers spoken descend 4,3,2,1).
    for (let i = 1; i < c.countdown!.length; i++) {
      expect(c.countdown![i]!).toBeGreaterThan(c.countdown![i - 1]!)
    }
  })

  it('does NOT emit a reentry cue when there are only small rests (< 2 bars)', () => {
    // Steady groove the whole way — max gap is an 8th note, far under threshold.
    const song = makeSong({ notes: steadyGroove(24, 120), duration: 50 })
    expect(cuesOfType(analyzeCues(song), 'reentry').length).toBe(0)
  })

  it('caps the countdown at min(beatsPerMeasure, 8) beats in long meters', () => {
    // 12/8 feel modeled as 12 beats/bar — countdown must cap at 8, not 12.
    const bpm = 120
    const beat = 60 / bpm
    const reentryTime = 20
    const song = makeSong({
      notes: [note(2, CLASS.kick), note(reentryTime, CLASS.snare)],
      bpmEvents: [{ bpm, time: 0, timeSignature: [12, 8] }],
      duration: 30,
    })
    const reentries = cuesOfType(analyzeCues(song), 'reentry')
    expect(reentries.length).toBeGreaterThanOrEqual(1)
    const c = reentries.find((r) => Math.abs(r.time - reentryTime) < 0.001)!
    expect(c).toBeDefined()
    expect(c.countdown!.length).toBe(8)
    // Last count beat is exactly one beat before the hit.
    const last = c.countdown![c.countdown!.length - 1]!
    expect(Math.abs(last - (reentryTime - beat))).toBeLessThan(1e-6)
  })

  it('does not let a reentry cue suppress a nearby tempo/meter cue (exempt from dedup)', () => {
    // A reentry whose first count beat lands right at a meter change. Both must
    // survive — the reentry is an atomic multi-beat unit, not a single blip.
    const bpm = 120
    const beat = 60 / bpm
    const reentryTime = 16
    // meter change exactly at the reentry's first count beat (t = reentryTime - 4β = 14)
    const meterTime = reentryTime - 4 * beat
    const song = makeSong({
      notes: [note(2, CLASS.kick), note(reentryTime, CLASS.snare)],
      bpmEvents: [
        { bpm, time: 0, timeSignature: [4, 4] },
        { bpm, time: meterTime, timeSignature: [7, 8] },
      ],
      duration: 30,
    })
    const cues = analyzeCues(song)
    expect(cuesOfType(cues, 'reentry').length).toBe(1)
    // The meter cue at meterTime is NOT swallowed by the reentry.
    expect(cuesOfType(cues, 'meter').length).toBe(1)
  })

  it('keeps reentry cues in the fireAt-sorted output', () => {
    const bpm = 120
    const song = makeSong({
      notes: [note(2, CLASS.kick), note(16, CLASS.snare), note(16.5, CLASS.kick)],
      bpmEvents: [{ bpm, time: 0, timeSignature: [4, 4] }],
      duration: 25,
    })
    const cues = analyzeCues(song)
    expect(cuesOfType(cues, 'reentry').length).toBeGreaterThanOrEqual(1)
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i]!.fireAt).toBeGreaterThanOrEqual(cues[i - 1]!.fireAt)
    }
  })
})
