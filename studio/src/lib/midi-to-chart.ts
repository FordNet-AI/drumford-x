import { Midi } from '@tonejs/midi'
import { generateId } from '@/lib/rlrr-parser'
import type { StudioChart, StudioNote } from '@studio/types'
import type { RlrrBpmEvent } from '@/types/song'
import { GM_TO_CLASS } from './drum-map'

export function midiToChart(
  buf: ArrayBuffer,
  opts: { title: string; artist: string; creator?: string; difficulty?: string },
): { chart: StudioChart; unmapped: Record<number, number> } {
  const midi = new Midi(buf)
  const notes: StudioNote[] = []
  const unmapped: Record<number, number> = {}
  for (const track of midi.tracks) {
    for (const n of track.notes) {
      const cls = GM_TO_CLASS[n.midi]
      if (!cls) { unmapped[n.midi] = (unmapped[n.midi] || 0) + 1; continue }
      notes.push({ id: generateId(), time: +n.time.toFixed(4), instrumentClass: cls, vel: Math.max(1, Math.round(n.velocity * 127)) })
    }
  }
  notes.sort((a, b) => a.time - b.time)
  const ts0 = (midi.header.timeSignatures[0]?.timeSignature ?? [4, 4]) as [number, number]
  const bpmEvents: RlrrBpmEvent[] = (midi.header.tempos.length ? midi.header.tempos : [{ ticks: 0, bpm: 120 }])
    .map(t => ({ bpm: +t.bpm.toFixed(3), time: +midi.header.ticksToSeconds(t.ticks).toFixed(4), timeSignature: ts0 }))
  const first = bpmEvents[0]
  if (!first || first.time > 0) bpmEvents.unshift({ bpm: 120, time: 0, timeSignature: ts0 })
  const length = +(midi.duration + 1).toFixed(2)
  return {
    chart: {
      meta: { title: opts.title, artist: opts.artist, creator: opts.creator ?? 'DrumFord Studio', difficulty: opts.difficulty ?? 'Expert', complexity: 3, length },
      bpmEvents, notes,
    },
    unmapped,
  }
}
