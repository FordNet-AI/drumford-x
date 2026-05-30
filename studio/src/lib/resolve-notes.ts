import { resolveInstrumentLane, DEFAULT_KIT } from '@/lib/default-kit'
import type { HighwayNote, NoteType } from '@/types/song'
import type { KitLane } from '@/types/kit'
import type { StudioNote } from '@studio/types'

/**
 * Resolve studio chart notes against DEFAULT_KIT for highway rendering.
 *
 * This is the studio-local mirror of the note-resolution block in the player's
 * `src/components/highway/highway-canvas.tsx`. It deliberately reproduces that
 * logic 1:1 — reading {@link DEFAULT_KIT} instead of the player's `useKitStore`
 * — so the Preview highway looks exactly like the player would render the same
 * chart on a default kit.
 *
 * Resolution chain per note:
 *   StudioNote.instrumentClass → resolveInstrumentLane(class, overrides)
 *     → lane id → index into DEFAULT_KIT.lanes (enabled lanes only)
 *     → -1 if no enabled lane matches (note is hidden by the renderer).
 *
 * noteType is derived from velocity using the same threshold rule the player
 * applies when importing .rlrr charts: vel <= ghostThreshold → 'ghost',
 * vel >= accentThreshold → 'accent', otherwise 'normal'.
 *
 * Also builds the three lookups `renderHighway` needs (matching highway-canvas):
 *   - columnLanes:            enabled, non-full-width lanes that have ≥1 note
 *   - laneIndexToColumnPos:   laneIndex → position within columnLanes
 *   - laneIndexToFullWidth:   laneIndex → full-width lane (kick etc.)
 * Lanes with zero notes are omitted so Preview doesn't waste empty columns.
 */
export function resolveChart(
  notes: StudioNote[],
  opts?: { ghostThreshold?: number; accentThreshold?: number },
): {
  resolvedNotes: HighwayNote[]
  columnLanes: KitLane[]
  laneIndexToColumnPos: Map<number, number>
  laneIndexToFullWidth: Map<number, KitLane>
} {
  const ghostThreshold = opts?.ghostThreshold ?? 30
  const accentThreshold = opts?.accentThreshold ?? 90

  const lanes = DEFAULT_KIT.lanes
  const overrides = DEFAULT_KIT.instrumentOverrides

  // Build lane-id → kit index for fast resolution (enabled lanes only).
  const laneIdToIndex = new Map<string, number>()
  lanes.forEach((lane, idx) => {
    if (lane.enabled) laneIdToIndex.set(lane.id, idx)
  })

  // Resolve notes against the kit.
  const resolvedNotes: HighwayNote[] = []
  const usedLaneIndices = new Set<number>()
  for (const note of notes) {
    const laneId = resolveInstrumentLane(note.instrumentClass, overrides)
    const laneIndex = laneId ? (laneIdToIndex.get(laneId) ?? -1) : -1
    if (laneIndex >= 0) usedLaneIndices.add(laneIndex)
    const noteType: NoteType =
      note.vel <= ghostThreshold ? 'ghost' : note.vel >= accentThreshold ? 'accent' : 'normal'
    resolvedNotes.push({
      time: note.time,
      laneIndex,
      velocity: note.vel,
      noteType,
      instrumentClass: note.instrumentClass,
    })
  }

  const columnLanes: KitLane[] = []
  const laneIndexToColumnPos = new Map<number, number>()
  const laneIndexToFullWidth = new Map<number, KitLane>()

  lanes.forEach((lane, idx) => {
    if (!lane.enabled) return
    if (!usedLaneIndices.has(idx)) return
    if (lane.isFullWidth) {
      laneIndexToFullWidth.set(idx, lane)
    } else {
      laneIndexToColumnPos.set(idx, columnLanes.length)
      columnLanes.push(lane)
    }
  })

  return { resolvedNotes, columnLanes, laneIndexToColumnPos, laneIndexToFullWidth }
}
