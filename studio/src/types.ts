import type { RlrrBpmEvent } from '@/types/song'

/**
 * Grid snap resolution. Defined ONCE here and shared by the editable store
 * (`studio/src/stores/studio-store.ts`) and the grid geometry helpers
 * (`studio/src/lib/grid.ts`) — do not redeclare this union elsewhere.
 *   '1/4'  quarter note · '1/8' eighth · '1/16' sixteenth · '1/8T' eighth-note triplet
 */
export type SnapValue = '1/4' | '1/8' | '1/16' | '1/8T'

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
