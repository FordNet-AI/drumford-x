import { describe, it, expect } from 'vitest'
import { planCountdownTick } from './use-cue-scheduler'
import { analyzeCues, type CueEvent } from './cue-analysis'
import type { HighwayNote, RlrrBpmEvent, Song } from '@/types/song'

/**
 * Unit tests for the re-entry COUNTDOWN stepping (planCountdownTick), the pure
 * core of the scheduler's headline behavior. The hook just dispatches the
 * banner/speak actions this returns, so testing it here exercises the real
 * crossing logic without needing a DOM or speech engine.
 *
 * The reentry cues themselves come from the real analyzeCues so the two stay
 * in lock-step (countdown shape, fireAt, time).
 */

const CLASS = {
  kick: 'BP_Kick_C',
  snare: 'BP_Snare_C',
} as const

function note(time: number, instrumentClass: string): HighwayNote {
  return { time, laneIndex: 0, velocity: 100, noteType: 'normal', instrumentClass }
}

function makeSong(partial: {
  notes?: HighwayNote[]
  bpmEvents?: RlrrBpmEvent[]
  duration?: number
}): Song {
  const notes = (partial.notes ?? []).slice().sort((a, b) => a.time - b.time)
  const bpmEvents = partial.bpmEvents ?? [{ bpm: 120, time: 0, timeSignature: [4, 4] }]
  return {
    id: 'test',
    title: 'Test',
    artist: 'Test',
    creator: 'Test',
    duration: partial.duration ?? 30,
    complexity: 1,
    difficulty: 'Test',
    coverImageBlob: null,
    folderName: 'test',
    notes,
    bpmEvents,
    ghostNoteThreshold: 0.3,
    accentNoteThreshold: 0.85,
    calibrationOffset: 0,
  }
}

/** Pull the single reentry cue out of a synthesized gap song. */
function reentryCue(): CueEvent {
  // First note near 0 (no from-start reentry), then a >= 2-bar gap, then a hit.
  const song = makeSong({
    notes: [note(2, CLASS.kick), note(16, CLASS.snare)],
    bpmEvents: [{ bpm: 120, time: 0, timeSignature: [4, 4] }],
    duration: 25,
  })
  const cues = analyzeCues(song).filter((c) => c.type === 'reentry')
  expect(cues.length).toBe(1)
  return cues[0]!
}

const BOTH_ON = { bannerEnabled: true, voiceEnabled: true }

describe('planCountdownTick', () => {
  it('does nothing before the first count beat', () => {
    const cue = reentryCue() // 4/4@120: beats at 14,14.5,15,15.5; hit 16
    const plan = planCountdownTick(cue, cue.fireAt - 0.1, new Set(), BOTH_ON)
    expect(plan.newBeatIndices).toEqual([])
    expect(plan.banners).toEqual([])
    expect(plan.speaks).toEqual([])
    expect(plan.goFired).toBe(false)
  })

  it('ticks the descending count "four,three,two,one" then "GO" across frames', () => {
    const cue = reentryCue()
    const beats = cue.countdown!
    expect(beats.length).toBe(4)

    const fired = new Set<number>()
    const spoken: string[] = []
    const banners: string[] = []

    // Step frame-by-frame just past each count beat, then past the hit.
    const stops = [...beats, cue.time].map((t) => t + 0.01)
    for (const t of stops) {
      const plan = planCountdownTick(cue, t, fired, BOTH_ON)
      for (const j of plan.newBeatIndices) fired.add(j)
      banners.push(...plan.banners.map((b) => b.text))
      spoken.push(...plan.speaks)
    }

    expect(spoken).toEqual(['four', 'three', 'two', 'one'])
    expect(banners).toEqual(['4', '3', '2', '1', 'GO'])
  })

  it('is idempotent: re-running the same frame fires nothing new', () => {
    const cue = reentryCue()
    const fired = new Set<number>()
    const t = cue.countdown![0]! + 0.01
    const first = planCountdownTick(cue, t, fired, BOTH_ON)
    for (const j of first.newBeatIndices) fired.add(j)
    expect(first.newBeatIndices).toEqual([0])

    const second = planCountdownTick(cue, t, fired, BOTH_ON)
    expect(second.newBeatIndices).toEqual([])
    expect(second.banners).toEqual([])
    expect(second.speaks).toEqual([])
  })

  it('catches up multiple beats crossed in one frame (after a seek)', () => {
    const cue = reentryCue()
    // Jump straight to just before the hit — all 4 count beats are already past.
    const plan = planCountdownTick(cue, cue.time - 0.01, new Set(), BOTH_ON)
    expect(plan.newBeatIndices).toEqual([0, 1, 2, 3])
    expect(plan.speaks).toEqual(['four', 'three', 'two', 'one'])
    expect(plan.goFired).toBe(false) // hit not yet reached
  })

  it('fires GO once the hit time is reached, even if beats were already done', () => {
    const cue = reentryCue()
    const fired = new Set([0, 1, 2, 3]) // all counts already ticked
    const plan = planCountdownTick(cue, cue.time + 0.01, fired, BOTH_ON)
    expect(plan.newBeatIndices).toEqual([])
    expect(plan.goFired).toBe(true)
    expect(plan.banners.map((b) => b.text)).toEqual(['GO'])
  })

  it('suppresses banners when bannerEnabled is false but still speaks', () => {
    const cue = reentryCue()
    const plan = planCountdownTick(cue, cue.time + 0.01, new Set(), {
      bannerEnabled: false,
      voiceEnabled: true,
    })
    expect(plan.banners).toEqual([])
    expect(plan.speaks).toEqual(['four', 'three', 'two', 'one'])
    expect(plan.goFired).toBe(true)
  })

  it('suppresses speech when voiceEnabled is false but still shows banners', () => {
    const cue = reentryCue()
    const plan = planCountdownTick(cue, cue.time + 0.01, new Set(), {
      bannerEnabled: true,
      voiceEnabled: false,
    })
    expect(plan.speaks).toEqual([])
    expect(plan.banners.map((b) => b.text)).toEqual(['4', '3', '2', '1', 'GO'])
  })

  it('count banner duration is ~1.1 beats (0.55s at 120bpm)', () => {
    const cue = reentryCue()
    const plan = planCountdownTick(cue, cue.countdown![0]! + 0.01, new Set(), BOTH_ON)
    const countBanner = plan.banners[0]!
    // beat = 0.5s, factor 1.1 → 550ms
    expect(Math.abs(countBanner.durationMs - 550)).toBeLessThan(1)
    expect(countBanner.kind).toBe('reentry')
  })

  it('honors an 8-beat cap countdown (long meter) with words one..eight', () => {
    // 12/8 → countdown capped to 8 beats. Verify the spoken words map correctly.
    const song = makeSong({
      notes: [note(2, CLASS.kick), note(20, CLASS.snare)],
      bpmEvents: [{ bpm: 120, time: 0, timeSignature: [12, 8] }],
      duration: 30,
    })
    const cue = analyzeCues(song).find((c) => c.type === 'reentry' && Math.abs(c.time - 20) < 0.01)!
    expect(cue.countdown!.length).toBe(8)
    const plan = planCountdownTick(cue, cue.time - 0.01, new Set(), BOTH_ON)
    expect(plan.speaks).toEqual(['eight', 'seven', 'six', 'five', 'four', 'three', 'two', 'one'])
  })

  it('returns nothing for a non-reentry cue / cue without countdown', () => {
    const fake: CueEvent = { time: 10, fireAt: 8, type: 'tempo', text: 'x', banner: 'x' }
    const plan = planCountdownTick(fake, 12, new Set(), BOTH_ON)
    expect(plan.newBeatIndices).toEqual([])
    expect(plan.banners).toEqual([])
    expect(plan.speaks).toEqual([])
    expect(plan.goFired).toBe(false)
  })
})
