import { zipSync, strToU8 } from 'fflate'
import type { StudioChart } from '@studio/types'
import { chartToRlrr } from './chart-io'

/**
 * Make a string safe to use as a zip-entry path segment (folder / file name).
 *
 * Whitespace (spaces, tabs, newlines) collapses to a single underscore; any
 * remaining char outside `[\w.\-]` (word chars, dots, dashes) is stripped.
 * Never returns empty — falls back to `'song'` (so a blank title still yields a
 * valid folder name).
 *
 * Order matters: whitespace→'_' happens BEFORE stripping, so a disallowed char
 * sitting between spaces leaves both underscores (`'a & b'` → `'a__b'`), and
 * `'cool track!.ogg'` → `'cool_track.ogg'` (space joined, '!' dropped).
 */
export function sanitizeName(s: string): string {
  const collapsed = s.trim().replace(/\s+/g, '_')
  const stripped = collapsed.replace(/[^\w.\-]+/g, '')
  return stripped.length > 0 ? stripped : 'song'
}

/**
 * Build a ParaDB-compatible song-folder zip from a StudioChart.
 *
 * Layout matches what the DrumFord X player imports: a single top-level folder
 * containing the `.rlrr` chart plus (optionally) its audio file.
 *
 *   <folder>/<folder>_<difficulty>.rlrr
 *   <folder>/<audioName>            (only when chart.audio is present)
 *
 * The `.rlrr`'s `audioFileData.songTracks[0]` is set to `audioName` (or '' when
 * there's no audio) via `chartToRlrr`, so the chart references the bundled file
 * by its sanitized name.
 */
export async function buildSongZip(chart: StudioChart): Promise<Blob> {
  const folder = sanitizeName(chart.meta.title || 'song')
  const difficulty = sanitizeName(chart.meta.difficulty || 'Expert')

  const audioName = chart.audio ? sanitizeName(chart.audio.name) : undefined
  const rlrrFileName = `${folder}_${difficulty}.rlrr`
  const rlrrJson = chartToRlrr(chart, audioName ?? '')

  const files: Record<string, Uint8Array> = {
    [`${folder}/${rlrrFileName}`]: strToU8(rlrrJson),
  }
  if (chart.audio && audioName) {
    files[`${folder}/${audioName}`] = new Uint8Array(await chart.audio.blob.arrayBuffer())
  }

  const zipped = zipSync(files)
  return new Blob([zipped], { type: 'application/zip' })
}
