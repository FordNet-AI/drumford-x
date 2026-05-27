import type { RlrrFile, HighwayNote, NoteType, RlrrBpmEvent } from '@/types/song'
import type { KitConfig } from '@/types/kit'
import { DEFAULT_KIT, resolveInstrumentLane } from '@/lib/default-kit'

/**
 * Decode an .rlrr file buffer to string.
 *
 * Paradiddle .rlrr files are JSON but their encoding varies:
 * - Older songs (e.g. from Paradiddle itself): UTF-16LE with BOM (FF FE)
 * - Newer community charts (paradb.net): plain UTF-8
 *
 * We detect by checking the first two bytes for a UTF-16LE BOM.
 */
export function decodeRlrr(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)

  // UTF-16LE BOM: FF FE
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    const decoder = new TextDecoder('utf-16le')
    return decoder.decode(buffer.slice(2))  // skip BOM
  }

  // UTF-8 BOM: EF BB BF (rare but possible)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    const decoder = new TextDecoder('utf-8')
    return decoder.decode(buffer.slice(3))
  }

  // Default: UTF-8 (no BOM)
  const decoder = new TextDecoder('utf-8')
  return decoder.decode(buffer)
}

/** @deprecated Use decodeRlrr instead */
export const decodeUtf16le = decodeRlrr

function classifyVelocity(vel: number, ghostThreshold: number, accentThreshold: number): NoteType {
  if (vel <= ghostThreshold) return 'ghost'
  if (vel >= accentThreshold) return 'accent'
  return 'normal'
}

function extractDifficulty(filename: string): string {
  const withoutExt = filename.replace(/\.rlrr$/i, '')
  const match = withoutExt.match(/_([^_]+)$/)
  if (match) {
    const diff = match[1]!
    const known = ['easy', 'medium', 'hard', 'expert', 'expertplus', 'beginner', 'intermediate', 'advanced']
    if (known.includes(diff.toLowerCase())) {
      return diff.charAt(0).toUpperCase() + diff.slice(1)
    }
  }
  return 'Expert'
}

/**
 * Build a fast lookup of lane id → index in kit.lanes.
 * Returns -1 for lanes that aren't enabled or don't exist.
 */
function buildLaneIndexMap(kit: KitConfig): Map<string, number> {
  const map = new Map<string, number>()
  kit.lanes.forEach((lane, idx) => {
    if (lane.enabled) map.set(lane.id, idx)
  })
  return map
}

export function parseRlrr(
  json: string,
  filename: string,
  kit: KitConfig = DEFAULT_KIT,
): {
  notes: HighwayNote[]
  bpmEvents: RlrrBpmEvent[]
  meta: {
    title: string
    artist: string
    creator: string
    duration: number
    complexity: number
    coverImagePath: string
    songTracks: string[]
    drumTracks: string[]
    calibrationOffset: number
    ghostNoteThreshold: number
    accentNoteThreshold: number
  }
  difficulty: string
} {
  const data: RlrrFile = JSON.parse(json)

  const ghostThreshold = data.highwaySettings?.ghostNoteThreshold ?? 30
  const accentThreshold = data.highwaySettings?.accentNoteThreshold ?? 90

  const instrumentNameToClass = new Map<string, string>()
  for (const inst of data.instruments) {
    instrumentNameToClass.set(inst.name, inst.class)
  }

  const laneIndexMap = buildLaneIndexMap(kit)

  const notes: HighwayNote[] = []
  let skipped = 0

  for (const event of data.events) {
    const instClass = instrumentNameToClass.get(event.name)
    if (!instClass) {
      skipped++
      continue
    }

    const laneId = resolveInstrumentLane(instClass, kit.instrumentOverrides)
    // -1 means "hidden in current kit" — note is preserved so it appears
    // again if the user enables the lane later, but renderer skips drawing.
    const laneIndex = laneId ? (laneIndexMap.get(laneId) ?? -1) : -1

    notes.push({
      time: event.time,
      laneIndex,
      velocity: event.vel,
      noteType: classifyVelocity(event.vel, ghostThreshold, accentThreshold),
      instrumentClass: instClass,
    })
  }

  if (skipped > 0) {
    console.warn(`[rlrr-parser] Skipped ${skipped} events with unmapped instruments`)
  }

  notes.sort((a, b) => a.time - b.time)

  const bpmEvents = (data.bpmEvents ?? []).sort((a, b) => a.time - b.time)

  return {
    notes,
    bpmEvents,
    meta: {
      title: data.recordingMetadata.title,
      artist: data.recordingMetadata.artist,
      creator: data.recordingMetadata.creator,
      duration: data.recordingMetadata.length,
      complexity: data.recordingMetadata.complexity,
      coverImagePath: data.recordingMetadata.coverImagePath,
      songTracks: data.audioFileData.songTracks,
      drumTracks: data.audioFileData.drumTracks,
      calibrationOffset: data.audioFileData.calibrationOffset ?? 0,
      ghostNoteThreshold: ghostThreshold,
      accentNoteThreshold: accentThreshold,
    },
    difficulty: extractDifficulty(filename),
  }
}

/**
 * Lightweight extractor for the unique instrument classes actually HIT in a
 * chart (not just listed in `instruments[]`). Returns sorted unique class
 * names — used to display a song's "drum signature" on library cards.
 *
 * Cheap: one JSON parse + one pass over events. No lane resolution, no
 * note-time math. Safe to call at import time on every chart.
 */
export function extractInstrumentClasses(rlrrJson: string): string[] {
  try {
    const data = JSON.parse(rlrrJson)
    if (!Array.isArray(data?.instruments) || !Array.isArray(data?.events)) return []

    const nameToClass = new Map<string, string>()
    for (const inst of data.instruments) {
      if (typeof inst?.name === 'string' && typeof inst?.class === 'string') {
        nameToClass.set(inst.name, inst.class)
      }
    }

    const used = new Set<string>()
    for (const event of data.events) {
      const cls = nameToClass.get(event?.name)
      if (cls) used.add(cls)
    }

    return [...used].sort()
  } catch {
    return []
  }
}

export function generateId(): string {
  return crypto.randomUUID()
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Canonical drum-chart difficulty order, easiest → hardest. Used wherever
 * we surface difficulty lists so the UI always reads in skill progression.
 * Anything not in this list sorts to the end alphabetically.
 */
const DIFFICULTY_ORDER = [
  'Beginner',
  'Easy',
  'Intermediate',
  'Medium',
  'Advanced',
  'Hard',
  'Expert',
  'ExpertPlus',
]

const DIFFICULTY_RANK: Record<string, number> = Object.fromEntries(
  DIFFICULTY_ORDER.map((d, i) => [d.toLowerCase(), i]),
)

/** Compare two difficulty strings in canonical (easiest → hardest) order. */
export function compareDifficulty(a: string, b: string): number {
  const ra = DIFFICULTY_RANK[a.toLowerCase()] ?? Number.MAX_SAFE_INTEGER
  const rb = DIFFICULTY_RANK[b.toLowerCase()] ?? Number.MAX_SAFE_INTEGER
  if (ra !== rb) return ra - rb
  // Fall back to alphabetical for unknown difficulties
  return a.localeCompare(b)
}

/** Returns a new array sorted easiest → hardest. */
export function sortDifficulties(diffs: string[]): string[] {
  return [...diffs].sort(compareDifficulty)
}
