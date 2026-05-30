import { generateId } from '@/lib/rlrr-parser'
import type { RlrrFile, RlrrInstrument, RlrrEvent } from '@/types/song'
import type { StudioChart, StudioNote } from '@studio/types'
import { CLASS_TO_NAME } from './drum-map'

/**
 * Serialize a StudioChart to a valid `.rlrr` JSON string.
 *
 * `.rlrr` events reference instruments BY NAME, so we emit one instrument per
 * DISTINCT used class and label every event with that instrument's name.
 */
export function chartToRlrr(chart: StudioChart, audioFileName: string): string {
  const nameFor = (cls: string) => CLASS_TO_NAME[cls] ?? cls

  // One instrument per distinct used class, preserving first-seen order.
  const usedClasses: string[] = []
  for (const note of chart.notes) {
    if (!usedClasses.includes(note.instrumentClass)) usedClasses.push(note.instrumentClass)
  }
  const instruments: RlrrInstrument[] = usedClasses.map(cls => ({
    name: nameFor(cls),
    class: cls,
    overrideData: '',
    location: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    volumeMultiplier: 1,
    pitchMultiplier: 1,
    midiNotes: [],
  }))

  const events: RlrrEvent[] = chart.notes.map(n => ({
    name: nameFor(n.instrumentClass),
    time: n.time,
    vel: n.vel,
    loc: 0,
  }))

  const rlrr: RlrrFile = {
    version: 1,
    recordingMetadata: {
      title: chart.meta.title,
      artist: chart.meta.artist,
      creator: chart.meta.creator,
      length: chart.meta.length,
      complexity: chart.meta.complexity,
      coverImagePath: '',
      description: '',
    },
    audioFileData: {
      songTracks: [audioFileName],
      drumTracks: [],
      songPreview: '',
      spectrogramTracks: [],
      calibrationOffset: 0,
    },
    highwaySettings: {
      ghostNotes: true,
      accentNotes: true,
      ghostNoteThreshold: 30,
      accentNoteThreshold: 90,
    },
    instruments,
    events,
    bpmEvents: chart.bpmEvents,
    bookmarks: [],
    editorData: {
      mappingTime: 0,
      editorVersion: 'drumford-studio',
    },
  }

  return JSON.stringify(rlrr, null, 2)
}

/**
 * Parse a `.rlrr` JSON string back into a StudioChart.
 *
 * Difficulty isn't stored in `.rlrr`, so it defaults to 'Expert'.
 */
export function rlrrToChart(json: string): StudioChart {
  const data: RlrrFile = JSON.parse(json)

  // `.rlrr` events reference instruments BY NAME, so round-trip fidelity assumes
  // instrument display-names are unique per class. This holds for the built-in
  // `CLASS_TO_NAME` (injective), but a hand-authored note whose `instrumentClass`
  // happens to equal another class's display name could collide here.
  const nameToClass = new Map<string, string>()
  for (const inst of data.instruments) {
    nameToClass.set(inst.name, inst.class)
  }

  const notes: StudioNote[] = data.events.map(event => ({
    id: generateId(),
    time: event.time,
    vel: event.vel,
    instrumentClass: nameToClass.get(event.name) ?? event.name,
  }))

  return {
    meta: {
      title: data.recordingMetadata.title,
      artist: data.recordingMetadata.artist,
      creator: data.recordingMetadata.creator,
      difficulty: 'Expert',
      complexity: data.recordingMetadata.complexity,
      length: data.recordingMetadata.length,
    },
    bpmEvents: data.bpmEvents.map(e => ({ ...e, timeSignature: e.timeSignature ? ([...e.timeSignature] as [number, number]) : undefined })),
    notes,
  }
}
