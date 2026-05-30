import type { RlrrBpmEvent } from '@/types/song'

export interface StudioNote {
  id: string                // stable id (generateId) for selection/drag/undo
  time: number              // seconds
  instrumentClass: string   // BP_Kick_C … → lane+color via resolveInstrumentLane
  vel: number               // 1..127
  duration?: number         // reserved for a future piano profile (drums ignore)
}

export interface StudioMeta {
  title: string
  artist: string
  creator: string
  difficulty: string        // e.g. "Expert"
  complexity: number        // 1..5
  length: number            // seconds
}

export interface StudioChart {
  meta: StudioMeta
  bpmEvents: RlrrBpmEvent[]
  notes: StudioNote[]
  audio?: { blob: Blob; name: string }
}
