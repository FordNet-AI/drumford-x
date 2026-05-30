import { describe, it, expect } from 'vitest'
import * as fflate from 'fflate'
import { generateId } from '@/lib/rlrr-parser'
import type { StudioChart, StudioNote } from '@studio/types'
import { sanitizeName, buildSongZip } from './export-zip'

function sampleChart(withAudio: boolean): StudioChart {
  const n = (time: number, instrumentClass: string, vel: number): StudioNote => ({
    id: generateId(), time, instrumentClass, vel,
  })
  const chart: StudioChart = {
    meta: {
      title: 'My Song!', artist: 'The Testers', creator: 'DrumFord Studio',
      difficulty: 'Expert', complexity: 4, length: 12.5,
    },
    bpmEvents: [{ bpm: 120, time: 0, timeSignature: [4, 4] }],
    notes: [
      n(0, 'BP_Kick_C', 110),
      n(0, 'BP_Crash17_C', 127),
      n(0.5, 'BP_Snare_C', 90),
    ],
  }
  if (withAudio) {
    chart.audio = { blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/ogg' }), name: 'song.ogg' }
  }
  return chart
}

describe('sanitizeName', () => {
  it('keeps word chars, dots, dashes, spaces; collapses whitespace to underscore', () => {
    expect(sanitizeName('My Song')).toBe('My_Song')
    expect(sanitizeName('a  b\tc')).toBe('a_b_c')
  })
  it('strips disallowed characters', () => {
    expect(sanitizeName('My Song!')).toBe('My_Song')
    expect(sanitizeName('Drum & Bass / 2')).toBe('Drum__Bass__2')
  })
  it('preserves dots and dashes', () => {
    expect(sanitizeName('track-01.v2')).toBe('track-01.v2')
  })
  it('falls back to "song" when empty or all-stripped', () => {
    expect(sanitizeName('')).toBe('song')
    expect(sanitizeName('!!!')).toBe('song')
    expect(sanitizeName('   ')).toBe('song')
  })
})

describe('buildSongZip', () => {
  it('builds a folder zip with the .rlrr and audio entries (audio present)', async () => {
    const chart = sampleChart(true)
    const zip = await buildSongZip(chart)
    expect(zip.type).toBe('application/zip')

    const bytes = new Uint8Array(await zip.arrayBuffer())
    const entries = fflate.unzipSync(bytes)

    // title 'My Song!' sanitized → 'My_Song'; difficulty 'Expert'
    const rlrrKey = 'My_Song/My_Song_Expert.rlrr'
    const audioKey = 'My_Song/song.ogg'
    expect(Object.prototype.hasOwnProperty.call(entries, rlrrKey)).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(entries, audioKey)).toBe(true)

    // audio bytes preserved verbatim
    expect(Array.from(entries[audioKey]!)).toEqual([1, 2, 3, 4])

    // .rlrr decodes and references the audio file
    const parsed = JSON.parse(fflate.strFromU8(entries[rlrrKey]!))
    expect(parsed.events.length).toBe(chart.notes.length)
    expect(parsed.audioFileData.songTracks[0]).toBe('song.ogg')
  })

  it('omits the audio entry when the chart has no audio; songTracks is empty-string', async () => {
    const chart = sampleChart(false)
    const zip = await buildSongZip(chart)
    const bytes = new Uint8Array(await zip.arrayBuffer())
    const entries = fflate.unzipSync(bytes)

    const keys = Object.keys(entries)
    const rlrrKey = 'My_Song/My_Song_Expert.rlrr'
    expect(keys).toEqual([rlrrKey]) // exactly the .rlrr, no audio

    const parsed = JSON.parse(fflate.strFromU8(entries[rlrrKey]!))
    expect(parsed.events.length).toBe(chart.notes.length)
    expect(parsed.audioFileData.songTracks).toEqual([''])
  })

  it('sanitizes the audio filename but keeps its extension', async () => {
    const chart = sampleChart(true)
    chart.audio = { blob: new Blob([new Uint8Array([9])], { type: 'audio/ogg' }), name: 'cool track!.ogg' }
    const zip = await buildSongZip(chart)
    const entries = fflate.unzipSync(new Uint8Array(await zip.arrayBuffer()))

    expect(Object.prototype.hasOwnProperty.call(entries, 'My_Song/cool_track.ogg')).toBe(true)
    const parsed = JSON.parse(fflate.strFromU8(entries['My_Song/My_Song_Expert.rlrr']!))
    expect(parsed.audioFileData.songTracks[0]).toBe('cool_track.ogg')
  })

  it('falls back to "song" folder and "Expert" difficulty when meta is blank', async () => {
    const chart = sampleChart(false)
    chart.meta.title = ''
    chart.meta.difficulty = ''
    const zip = await buildSongZip(chart)
    const entries = fflate.unzipSync(new Uint8Array(await zip.arrayBuffer()))
    expect(Object.prototype.hasOwnProperty.call(entries, 'song/song_Expert.rlrr')).toBe(true)
  })
})
