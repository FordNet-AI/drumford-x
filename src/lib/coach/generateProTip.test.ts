import { describe, it, expect } from 'vitest'
import { generateProTip, sanitizeDescription } from './pro-tip'
import type { HighwayNote, RlrrBpmEvent, Song } from '@/types/song'

// ---------------------------------------------------------------------------
// Fixtures — small synthesized Songs (no MIDI/files), mirroring the cue-analysis
// test harness so classification is driven by instrumentClass.
// ---------------------------------------------------------------------------

const CLASS = {
  kick: 'BP_Kick_C',
  snare: 'BP_Snare_C',
  hihat: 'BP_HiHat_C',
  tom1: 'BP_Tom1_C',
  tom2: 'BP_Tom2_C',
  floorTom: 'BP_FloorTom_C',
  crash: 'BP_Crash18_C',
} as const

function note(time: number, instrumentClass: string): HighwayNote {
  return { time, laneIndex: 0, velocity: 100, noteType: 'normal', instrumentClass }
}

function makeSong(partial: {
  notes?: HighwayNote[]
  bpmEvents?: RlrrBpmEvent[]
  duration?: number
  sections?: { time: number; label: string }[]
  description?: string
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
    description: partial.description,
    sections: partial.sections,
    ghostNoteThreshold: 0.3,
    accentNoteThreshold: 0.85,
    calibrationOffset: 0,
  }
}

/** Canonical steady 4/4 kick+snare+hi-hat groove (no fills, no double-kick). */
function steadyGroove(bars: number, bpm: number, startTime = 0): HighwayNote[] {
  const beat = 60 / bpm
  const out: HighwayNote[] = []
  for (let b = 0; b < bars * 4; b++) {
    const t = startTime + b * beat
    out.push(note(t, CLASS.hihat))
    out.push(note(t + beat / 2, CLASS.hihat))
    const beatInBar = b % 4
    if (beatInBar === 0 || beatInBar === 2) out.push(note(t, CLASS.kick))
    if (beatInBar === 1 || beatInBar === 3) out.push(note(t, CLASS.snare))
  }
  return out
}

describe('generateProTip', () => {
  it('mentions the initial bpm + meter, the tempo change, and double-kick for a busy chart', () => {
    // Steady groove + a fast sustained kick run (double-kick) + a tempo change.
    const groove = steadyGroove(8, 120)
    const runStart = 14
    const ioi = 0.09
    const run: HighwayNote[] = []
    for (let i = 0; i < 24; i++) run.push(note(runStart + i * ioi, CLASS.kick))
    const song = makeSong({
      notes: [...groove, ...run],
      bpmEvents: [
        { bpm: 120, time: 0, timeSignature: [4, 4] },
        { bpm: 150, time: 18, timeSignature: [4, 4] },
      ],
      duration: 30,
    })

    const tip = generateProTip(song)
    expect(tip).toContain('120')
    expect(tip).toContain('4/4')
    // double-kick is called out
    expect(tip.toLowerCase()).toContain('double')
    // tempo change is mentioned
    expect(tip.toLowerCase()).toContain('tempo')
    // short — at most ~2 sentences
    expect(tip.split('.').filter((s) => s.trim().length > 0).length).toBeLessThanOrEqual(3)
  })

  it('gives a short steady tip with bpm+meter and no false fill/double-kick claims', () => {
    const song = makeSong({
      notes: steadyGroove(24, 100),
      bpmEvents: [{ bpm: 100, time: 0, timeSignature: [4, 4] }],
      duration: 50,
    })
    const tip = generateProTip(song)
    expect(tip).toContain('100')
    expect(tip).toContain('4/4')
    expect(tip.toLowerCase()).not.toContain('fill')
    expect(tip.toLowerCase()).not.toContain('double')
    expect(tip.toLowerCase()).not.toContain('tempo')
    // The plain-steady path adds a "keep it steady" style nudge.
    expect(tip.toLowerCase()).toContain('steady')
  })

  it('mentions fills when the chart has a clear tom+crash burst', () => {
    const groove = steadyGroove(8, 120)
    const fillStart = 16
    const fill: HighwayNote[] = []
    const sixteenth = 60 / 120 / 4
    const tomCycle = [CLASS.tom1, CLASS.tom2, CLASS.floorTom]
    for (let i = 0; i < 8; i++) fill.push(note(fillStart + i * sixteenth, tomCycle[i % 3]!))
    fill.push(note(fillStart + 8 * sixteenth, CLASS.crash))
    const song = makeSong({ notes: [...groove, ...fill], duration: 24 })

    const tip = generateProTip(song)
    expect(tip.toLowerCase()).toContain('fill')
  })

  it('reflects the meter for a non-4/4 chart', () => {
    const song = makeSong({
      notes: steadyGroove(8, 140),
      bpmEvents: [{ bpm: 140, time: 0, timeSignature: [7, 8] }],
      duration: 20,
    })
    const tip = generateProTip(song)
    expect(tip).toContain('140')
    expect(tip).toContain('7/8')
  })

  it('counts multiple tempo changes', () => {
    const song = makeSong({
      notes: steadyGroove(30, 120),
      bpmEvents: [
        { bpm: 120, time: 0, timeSignature: [4, 4] },
        { bpm: 100, time: 10, timeSignature: [4, 4] },
        { bpm: 140, time: 20, timeSignature: [4, 4] },
        { bpm: 90, time: 40, timeSignature: [4, 4] },
      ],
      duration: 60,
    })
    const tip = generateProTip(song)
    // Three tempo changes from the initial → plural "tempo changes" with a count.
    expect(tip).toMatch(/3 tempo changes/i)
  })

  it('mentions a meter change', () => {
    const song = makeSong({
      notes: steadyGroove(16, 120),
      bpmEvents: [
        { bpm: 120, time: 0, timeSignature: [4, 4] },
        { bpm: 120, time: 16, timeSignature: [7, 8] },
      ],
      duration: 40,
    })
    const tip = generateProTip(song)
    expect(tip.toLowerCase()).toContain('meter')
  })

  it('includes section names when the chart has them', () => {
    const song = makeSong({
      notes: steadyGroove(40, 120),
      sections: [
        { time: 0, label: 'Intro' },
        { time: 16, label: 'Verse' },
        { time: 40, label: 'Chorus' },
      ],
      duration: 90,
    })
    const tip = generateProTip(song)
    expect(tip).toContain('Intro')
    expect(tip).toContain('Verse')
    expect(tip).toContain('Chorus')
  })

  it('does not throw on an empty / note-free song and still states bpm+meter', () => {
    const tip = generateProTip(makeSong({}))
    expect(typeof tip).toBe('string')
    expect(tip.length).toBeGreaterThan(0)
    expect(tip).toContain('120')
    expect(tip).toContain('4/4')
  })

  it('rounds a fractional bpm to a whole number', () => {
    const song = makeSong({
      notes: steadyGroove(8, 120),
      bpmEvents: [{ bpm: 128.6, time: 0, timeSignature: [4, 4] }],
      duration: 20,
    })
    const tip = generateProTip(song)
    expect(tip).toContain('129')
    expect(tip).not.toContain('128.6')
  })

  it('softens an absurd number of tempo changes instead of printing the raw count', () => {
    // A chart with dense tempo automation: dozens of "changes" (the real
    // "Summer of 69" chart in the test library reports ~40). The tip must not
    // read like a changelog of every wobble.
    const bpmEvents: RlrrBpmEvent[] = [{ bpm: 120, time: 0, timeSignature: [4, 4] }]
    for (let i = 1; i <= 40; i++) {
      bpmEvents.push({ bpm: 120 + (i % 2 === 0 ? 10 : -10), time: i * 1.5, timeSignature: [4, 4] })
    }
    const song = makeSong({ notes: steadyGroove(40, 120), bpmEvents, duration: 80 })
    const tip = generateProTip(song)
    // No literal double-digit "NN tempo changes" count …
    expect(tip).not.toMatch(/\d\d tempo changes/)
    // … but still conveys lots of tempo movement.
    expect(tip.toLowerCase()).toContain('tempo')
  })

  it('still prints an exact count for a small number of tempo changes', () => {
    const song = makeSong({
      notes: steadyGroove(30, 120),
      bpmEvents: [
        { bpm: 120, time: 0, timeSignature: [4, 4] },
        { bpm: 100, time: 10, timeSignature: [4, 4] },
        { bpm: 140, time: 20, timeSignature: [4, 4] },
      ],
      duration: 50,
    })
    expect(generateProTip(song)).toMatch(/2 tempo changes/)
  })
})

describe('sanitizeDescription', () => {
  it('strips HTML tags and decodes entities to plain readable text', () => {
    const html = '<h2>🥁 Drum Track Update</h2>\n  <ul>\n  <li>Improved mapping v2</li>\n  </ul>'
    const out = sanitizeDescription(html)
    expect(out).not.toContain('<')
    expect(out).not.toContain('>')
    expect(out).toContain('Drum Track Update')
    expect(out).toContain('Improved mapping v2')
  })

  it('decodes common HTML entities', () => {
    expect(sanitizeDescription('Rock &amp; Roll &lt;3')).toBe('Rock & Roll <3')
  })

  it('collapses whitespace and trims', () => {
    expect(sanitizeDescription('  hello\n\n   world  ')).toBe('hello world')
  })

  it('returns empty string for markup that has no text content', () => {
    expect(sanitizeDescription('<br/><hr>')).toBe('')
    expect(sanitizeDescription('   ')).toBe('')
    expect(sanitizeDescription(undefined)).toBe('')
  })

  it('leaves a plain-text description untouched (aside from trim)', () => {
    expect(sanitizeDescription('Iris - The Goo Goo Dolls')).toBe('Iris - The Goo Goo Dolls')
  })
})
