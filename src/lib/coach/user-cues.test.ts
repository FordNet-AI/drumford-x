import { describe, it, expect } from 'vitest'
import { analyzeCues, userCuesToCueEvents } from './cue-analysis'
import type { UserCue } from '@/stores/coach-store'
import type { HighwayNote, RlrrBpmEvent, Song } from '@/types/song'

/**
 * Tests for userCuesToCueEvents — the pure helper that maps drummer-authored
 * UserCues onto schedulable CueEvents of type 'user'.
 *
 * Lead time is ~1 BAR at the local tempo/meter (a modest heads-up — half the
 * 2-bar lead the auto cues use), so the banner/voice fire just before the spot.
 */

const SIG_44 = (bpm: number, time = 0): RlrrBpmEvent => ({
  bpm,
  time,
  timeSignature: [4, 4],
})

function uc(id: string, time: number, text: string): UserCue {
  return { id, time, text }
}

describe('userCuesToCueEvents', () => {
  it('maps an empty list to an empty array', () => {
    expect(userCuesToCueEvents([], [SIG_44(120)])).toEqual([])
  })

  it("maps a single cue to a 'user' CueEvent carrying the text in text + banner", () => {
    const events = userCuesToCueEvents([uc('a', 10, 'Watch hands')], [SIG_44(120)])
    expect(events.length).toBe(1)
    const e = events[0]!
    expect(e.type).toBe('user')
    expect(e.time).toBe(10)
    expect(e.text).toBe('Watch hands')
    expect(e.banner).toBe('Watch hands')
  })

  it('uses a ~1-bar lead at the local tempo (4/4 @ 120 → 2.0s before)', () => {
    // 1 bar in 4/4 @ 120bpm = 4 * (60/120) = 2.0s.
    const events = userCuesToCueEvents([uc('a', 10, 'x')], [SIG_44(120)])
    expect(events[0]!.fireAt).toBeCloseTo(8, 5)
  })

  it('scales the lead with tempo (4/4 @ 60 → 4.0s before)', () => {
    // 1 bar in 4/4 @ 60bpm = 4 * 1.0 = 4.0s.
    const events = userCuesToCueEvents([uc('a', 10, 'x')], [SIG_44(60)])
    expect(events[0]!.fireAt).toBeCloseTo(6, 5)
  })

  it('scales the lead with meter (7/8 @ 140 has a different bar length)', () => {
    // 1 bar in 7/8 @ 140bpm = 7 * (60/140) = 3.0s.
    const bpm: RlrrBpmEvent[] = [{ bpm: 140, time: 0, timeSignature: [7, 8] }]
    const events = userCuesToCueEvents([uc('a', 10, 'x')], bpm)
    expect(events[0]!.fireAt).toBeCloseTo(7, 5)
  })

  it('clamps fireAt to >= 0 for a cue near the very start', () => {
    const events = userCuesToCueEvents([uc('a', 0.5, 'x')], [SIG_44(120)])
    expect(events[0]!.fireAt).toBe(0)
  })

  it('returns events sorted by fireAt ascending', () => {
    const events = userCuesToCueEvents(
      [uc('c', 30, 'c'), uc('a', 5, 'a'), uc('b', 12, 'b')],
      [SIG_44(120)],
    )
    expect(events.map((e) => e.text)).toEqual(['a', 'b', 'c'])
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.fireAt).toBeGreaterThanOrEqual(events[i - 1]!.fireAt)
    }
  })

  it('falls back to a sane lead when bpmEvents is empty (no throw, fireAt < time)', () => {
    const events = userCuesToCueEvents([uc('a', 10, 'x')], [])
    expect(events.length).toBe(1)
    expect(events[0]!.fireAt).toBeGreaterThanOrEqual(0)
    expect(events[0]!.fireAt).toBeLessThan(10)
  })
})

// ---------------------------------------------------------------------------
// Dedup decision: a user cue colliding with an auto cue is KEPT (not dropped).
// analyzeCues does the auto dedup; user cues are merged separately, so when we
// concat the two a user cue always survives even right on top of an auto cue.
// ---------------------------------------------------------------------------

const CLASS = { kick: 'BP_Kick_C', snare: 'BP_Snare_C', hihat: 'BP_HiHat_C' } as const

function note(time: number, instrumentClass: string): HighwayNote {
  return { time, laneIndex: 0, velocity: 100, noteType: 'normal', instrumentClass }
}

function steadyGroove(bars: number, bpm: number, startTime = 0): HighwayNote[] {
  const beat = 60 / bpm
  const out: HighwayNote[] = []
  for (let b = 0; b < bars * 4; b++) {
    const t = startTime + b * beat
    out.push(note(t, CLASS.hihat))
    const bi = b % 4
    if (bi === 0 || bi === 2) out.push(note(t, CLASS.kick))
    if (bi === 1 || bi === 3) out.push(note(t, CLASS.snare))
  }
  return out
}

function makeSong(notes: HighwayNote[], bpmEvents: RlrrBpmEvent[], duration: number): Song {
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
    notes: notes.slice().sort((a, b) => a.time - b.time),
    bpmEvents,
    ghostNoteThreshold: 0.3,
    accentNoteThreshold: 0.85,
    calibrationOffset: 0,
  }
}

describe('user cue + auto cue coexistence (dedup decision)', () => {
  it('keeps a user cue whose fireAt collides with an auto cue (within the dedup window)', () => {
    // Tempo change at t=10 (auto, 2-bar lead @120 → fireAt=6). Place the user cue
    // at t=8 so its 1-bar lead (2.0s) yields fireAt=6 too — an exact collision.
    // The merge must keep BOTH: user cues are exempt from being dropped.
    const bpmEvents: RlrrBpmEvent[] = [
      { bpm: 120, time: 0, timeSignature: [4, 4] },
      { bpm: 150, time: 10, timeSignature: [4, 4] },
    ]
    const song = makeSong(steadyGroove(16, 120), bpmEvents, 40)
    const auto = analyzeCues(song)
    const user = userCuesToCueEvents([{ id: 'u', time: 8, text: 'Watch hands' }], bpmEvents)

    const merged = [...auto, ...user].sort((a, b) => a.fireAt - b.fireAt)
    const userEvents = merged.filter((c) => c.type === 'user')
    const tempoEvents = merged.filter((c) => c.type === 'tempo')

    // Both kinds present, neither dropped.
    expect(userEvents.length).toBe(1)
    const tempoAt10 = tempoEvents.find((c) => Math.abs(c.time - 10) < 0.001)
    expect(tempoAt10).toBeDefined()
    // Their fireAt genuinely collides (well within the 1.2s dedup window) yet both survive.
    expect(Math.abs(userEvents[0]!.fireAt - tempoAt10!.fireAt)).toBeLessThan(1.2)
  })
})
