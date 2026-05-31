// Raw .rlrr file format (1:1 with Paradiddle JSON)

export interface RlrrFile {
  version: number
  recordingMetadata: {
    title: string
    artist: string
    creator: string
    length: number
    complexity: number
    coverImagePath: string
    description: string
  }
  audioFileData: {
    songTracks: string[]
    drumTracks: string[]
    songPreview: string
    spectrogramTracks: string[]
    calibrationOffset: number
  }
  highwaySettings: {
    ghostNotes: boolean
    accentNotes: boolean
    ghostNoteThreshold: number
    accentNoteThreshold: number
  }
  instruments: RlrrInstrument[]
  events: RlrrEvent[]
  bpmEvents: RlrrBpmEvent[]
  bookmarks: unknown[]
  editorData: {
    mappingTime: number
    editorVersion: string
  }
}

export interface RlrrInstrument {
  name: string
  class: string
  overrideData: string
  location: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  volumeMultiplier: number
  pitchMultiplier: number
  midiNotes: number[]
}

export interface RlrrEvent {
  name: string
  time: number
  vel: number
  loc: number
}

export interface RlrrBpmEvent {
  bpm: number
  time: number
  timeSignature?: [number, number]
  swing?: number
  delay?: number
}

// Normalized internal types

export type NoteType = 'ghost' | 'normal' | 'accent'

export type LaneId = 'kick' | 'snare' | 'hihat' | 'tom1' | 'tom2' | 'floorTom' | 'crash' | 'ride'

export interface HighwayNote {
  time: number
  /** Index into the active kit's `lanes` array. -1 if the note's instrument has no matching lane in the current kit (note is hidden). */
  laneIndex: number
  velocity: number
  noteType: NoteType
  /** Paradiddle instrument class (e.g. "BP_Crash18_C") — stable identity used to re-resolve laneIndex when the user edits their kit. */
  instrumentClass: string
}

export interface Song {
  id: string
  title: string
  artist: string
  creator: string
  duration: number
  complexity: number
  difficulty: string
  coverImageBlob: Blob | null
  folderName: string
  notes: HighwayNote[]
  bpmEvents: RlrrBpmEvent[]
  /**
   * Author-written chart description from the .rlrr `recordingMetadata.description`
   * (trimmed). Used by Coach Mode as the "pro tip" shown/spoken at song start
   * when present; otherwise an auto-generated summary is used. Absent or empty
   * for most charts.
   */
  description?: string
  /**
   * Song sections / markers parsed from the .rlrr `bookmarks` array (e.g.
   * "Verse", "Chorus"), sorted by time. Used by Coach Mode to announce
   * upcoming section boundaries. Absent or empty for most charts.
   */
  sections?: { time: number; label: string }[]
  ghostNoteThreshold: number
  accentNoteThreshold: number
  calibrationOffset: number
}

export interface SongMeta {
  id: string
  title: string
  artist: string
  creator: string
  duration: number
  complexity: number
  difficulties: string[]
  coverImageBlob: Blob | null
  folderName: string
  hasDrumTrack: boolean
  /**
   * Unique Paradiddle instrument classes hit at least once across all difficulties
   * of this song (e.g. ["BP_Kick_C", "BP_Snare_C", "BP_Crash18_C"]).
   * Used to render a "drum signature" preview on the song card so users can see
   * what kit pieces the chart uses before pressing play.
   */
  instrumentClasses: string[]
  /**
   * When this song was first added to the user's library (ms since epoch).
   * For songs with multiple difficulties, this is the MAX of each chart's
   * `addedAt` — when the most-recent difficulty entered the library, which
   * matches the user's mental model of "when did this song last appear here."
   */
  addedAt: number
}

export interface StoredSongMeta {
  id: string
  title: string
  artist: string
  creator: string
  duration: number
  complexity: number
  difficulty: string
  coverImageBlob: Blob | null
  folderName: string
  hasDrumTrack?: boolean // optional for backward compat with old IndexedDB records
  /** Sorted unique instrument classes hit in this chart's events. Optional for backward compat. */
  instrumentClasses?: string[]
  /** Ms-epoch timestamp of when this chart was imported. Optional for backward compat — old records get Date.now() at migration time. */
  addedAt?: number
}

export interface StoredSong {
  id: string
  title: string
  artist: string
  creator: string
  duration: number
  complexity: number
  difficulty: string
  coverImageBlob: Blob | null
  folderName: string
  rlrrJson: string
  /** All song/backing stems (guitar, vocals, rhythm, etc.) */
  songTrackBlobs: Blob[]
  /** All drum stems (drums_1, drums_2, etc.) */
  drumTrackBlobs: Blob[]
  // Legacy compat — old imports stored singular blobs
  songTrackBlob?: Blob | null
  drumTrackBlob?: Blob | null
}
