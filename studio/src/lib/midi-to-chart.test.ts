import { describe, it, expect } from 'vitest'
import { Midi } from '@tonejs/midi'
import { midiToChart } from './midi-to-chart'

function demoBeat(): ArrayBuffer {
  const midi = new Midi(); midi.header.setTempo(120)
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] })
  const t = midi.addTrack(); t.channel = 9
  const SPB = 0.5, dur = 0.05
  const add = (n: number, beat: number, v = 0.8) => t.addNote({ midi: n, time: beat * SPB, duration: dur, velocity: v })
  for (let bar = 0; bar < 4; bar++) {
    const b = bar * 4
    add(36, b + 0, 0.95); add(36, b + 2, 0.9); add(38, b + 1, 0.9); add(38, b + 3, 0.9)
    for (let e = 0; e < 8; e++) add(42, b + e * 0.5, e % 2 ? 0.5 : 0.7)
    if (bar === 0) add(49, b + 0, 1.0)
  }
  const b4 = 12
  add(48, b4 + 3.0, 0.85); add(48, b4 + 3.25, 0.85); add(45, b4 + 3.5, 0.9); add(41, b4 + 3.75, 0.95)
  // `.buffer` types as ArrayBufferLike (could be SharedArrayBuffer); copy into a
  // fresh Uint8Array to get a clean ArrayBuffer. Bytes (and counts) unchanged.
  return new Uint8Array(midi.toArray()).buffer
}

describe('midiToChart', () => {
  it('reproduces the verified demo-beat counts', () => {
    const { chart, unmapped } = midiToChart(demoBeat(), { title: 'X', artist: 'Y' })
    const count = (cls: string) => chart.notes.filter(n => n.instrumentClass === cls).length
    expect(chart.notes.length).toBe(53)
    expect(count('BP_Kick_C')).toBe(8)
    expect(count('BP_Snare_C')).toBe(8)
    expect(count('BP_HiHat_C')).toBe(32)
    expect(count('BP_Crash17_C')).toBe(1)
    expect(count('BP_Tom1_C')).toBe(2)
    expect(count('BP_Tom2_C')).toBe(1)
    expect(count('BP_FloorTom_C')).toBe(1)
    expect(Object.keys(unmapped)).toHaveLength(0)
    expect(chart.bpmEvents[0]?.bpm).toBe(120)
    expect(chart.notes.filter(n => n.time === 0).length).toBe(3) // kick+hat+crash
  })

  it('reports unmapped GM notes instead of dropping them silently', () => {
    const midi = new Midi(); const t = midi.addTrack(); t.channel = 9
    t.addNote({ midi: 39, time: 0, duration: 0.05, velocity: 0.8 }) // 39 = hand clap, not in our map
    const { chart, unmapped } = midiToChart(new Uint8Array(midi.toArray()).buffer, { title: 'X', artist: 'Y' })
    expect(chart.notes.length).toBe(0)
    expect(unmapped[39]).toBe(1)
  })
})
