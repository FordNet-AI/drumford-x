import { describe, it, expect } from 'vitest'
import { generateId } from '@/lib/rlrr-parser'
import type { StudioChart, StudioNote } from '@studio/types'
import { chartToRlrr, rlrrToChart } from './chart-io'

function sampleChart(): StudioChart {
  const n = (time: number, instrumentClass: string, vel: number): StudioNote => ({
    id: generateId(), time, instrumentClass, vel,
  })
  return {
    meta: {
      title: 'Round Trip', artist: 'The Testers', creator: 'DrumFord Studio',
      difficulty: 'Expert', complexity: 4, length: 12.5,
    },
    bpmEvents: [
      { bpm: 120, time: 0, timeSignature: [4, 4] },
      { bpm: 140, time: 6.25, timeSignature: [4, 4] },
    ],
    // ≥3 classes incl. a kick + a crash
    notes: [
      n(0, 'BP_Kick_C', 110),
      n(0, 'BP_Crash17_C', 127),
      n(0.5, 'BP_Snare_C', 90),
      n(1.0, 'BP_HiHat_C', 64),
      n(1.5, 'BP_Kick_C', 100),
    ],
  }
}

describe('chart-io round-trip', () => {
  it('chartToRlrr produces a valid .rlrr shape', () => {
    const chart = sampleChart()
    const json = chartToRlrr(chart, 'song.ogg')
    const parsed = JSON.parse(json)
    expect(Array.isArray(parsed.instruments)).toBe(true)
    expect(Array.isArray(parsed.events)).toBe(true)
    expect(Array.isArray(parsed.bpmEvents)).toBe(true)
    expect(parsed.recordingMetadata).toBeTruthy()
    expect(parsed.events.length).toBe(chart.notes.length)
    // distinct used classes → 4 instruments (Kick, Crash, Snare, HiHat)
    expect(parsed.instruments.length).toBe(4)
    expect(parsed.audioFileData.songTracks).toEqual(['song.ogg'])
    // every event's name must match an instrument name
    const instNames = new Set(parsed.instruments.map((i: { name: string }) => i.name))
    for (const ev of parsed.events) expect(instNames.has(ev.name)).toBe(true)
  })

  it('rlrrToChart losslessly recovers notes, bpmEvents, and key meta', () => {
    const chart = sampleChart()
    const json = chartToRlrr(chart, 'song.ogg')
    const back = rlrrToChart(json)

    // notes match on (time, vel, instrumentClass), order-insensitive
    const key = (x: { time: number; vel: number; instrumentClass: string }) =>
      `${x.time}|${x.vel}|${x.instrumentClass}`
    expect(back.notes.map(key).sort()).toEqual(chart.notes.map(key).sort())

    // bpmEvents match
    expect(back.bpmEvents).toEqual(chart.bpmEvents)

    // key meta fields match
    expect(back.meta.title).toBe(chart.meta.title)
    expect(back.meta.artist).toBe(chart.meta.artist)
    expect(back.meta.length).toBe(chart.meta.length)
    expect(back.meta.complexity).toBe(chart.meta.complexity)
  })
})
