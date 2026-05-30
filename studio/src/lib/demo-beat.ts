import { Midi } from '@tonejs/midi'

/**
 * TEMP — dev-only demo MIDI generator.
 *
 * Synthesizes the spike's verified 4-bar rock beat (identical to the converter
 * test's `demoBeat`): four bars of kick/snare/hi-hat with a crash on bar 1 and
 * a short tom fill on the last bar. Used by the "Load demo beat" button so the
 * Preview highway is demonstrable before the import panel lands in Phase 5.
 *
 * Counts (post-conversion): 8 kick, 8 snare, 32 hi-hat, 1 crash, 2 tom1,
 * 1 tom2, 1 floor tom = 53 notes.
 */
export function synthDemoBeatMidi(): ArrayBuffer {
  const midi = new Midi()
  midi.header.setTempo(120)
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] })
  const t = midi.addTrack()
  t.channel = 9
  const SPB = 0.5,
    dur = 0.05
  const add = (n: number, beat: number, v = 0.8) =>
    t.addNote({ midi: n, time: beat * SPB, duration: dur, velocity: v })
  for (let bar = 0; bar < 4; bar++) {
    const b = bar * 4
    add(36, b + 0, 0.95)
    add(36, b + 2, 0.9)
    add(38, b + 1, 0.9)
    add(38, b + 3, 0.9)
    for (let e = 0; e < 8; e++) add(42, b + e * 0.5, e % 2 ? 0.5 : 0.7)
    if (bar === 0) add(49, b + 0, 1.0)
  }
  const b4 = 12
  add(48, b4 + 3.0, 0.85)
  add(48, b4 + 3.25, 0.85)
  add(45, b4 + 3.5, 0.9)
  add(41, b4 + 3.75, 0.95)
  // `.buffer` types as ArrayBufferLike (could be SharedArrayBuffer); copy into a
  // fresh Uint8Array to get a clean ArrayBuffer.
  return new Uint8Array(midi.toArray()).buffer
}
