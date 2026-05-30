import { create } from 'zustand'
import { temporal } from 'zundo'
import { generateId } from '@/lib/rlrr-parser'
import type { StudioChart, StudioMeta, StudioNote, SnapValue } from '@studio/types'

/**
 * Editable studio chart store with undo/redo.
 *
 * History (zundo): `partialize` restricts the temporal snapshots to `chart`
 * ONLY, so selection/snap changes never enter the undo stack. All chart
 * mutations are IMMUTABLE (new `notes` array + new note objects) so zundo's
 * shallow snapshot diffing detects changes and the canvas reads never observe
 * an in-place mutation.
 *
 * Undo/redo is on the vanilla temporal store (zundo v2):
 *   useStudioStore.temporal.getState().undo() / .redo() / .clear()
 */
export interface StudioState {
  chart: StudioChart | null
  selection: string[] // selected note ids
  snap: SnapValue // default '1/8'

  loadChart: (chart: StudioChart) => void
  setMeta: (patch: Partial<StudioMeta>) => void
  /** Set or clear the backing audio track; no-op when there is no chart. */
  setAudio: (audio: { blob: Blob; name: string } | null) => void
  /** Append a note; returns its new id ('' when there is no chart). */
  addNote: (note: { time: number; instrumentClass: string; vel: number; duration?: number }) => string
  /**
   * Append several notes in ONE immutable `set` → a single undo entry.
   * Returns the new ids in input order ([] when there is no chart). Used by
   * paste so a multi-note paste is exactly one Ctrl+Z step.
   */
  addNotes: (notes: { time: number; instrumentClass: string; vel: number; duration?: number }[]) => string[]
  /** Shift `ids` in time by `dt`; if `dLaneClass` is set, also change their instrumentClass. */
  moveNotes: (ids: string[], delta: { dt: number; dLaneClass?: string }) => void
  /** Set velocity for `ids`, clamped to 1..127. */
  setVelocity: (ids: string[], vel: number) => void
  deleteNotes: (ids: string[]) => void
  /** Rewrite every note whose instrumentClass === fromClass to toClass. */
  remapClass: (fromClass: string, toClass: string) => void

  setSelection: (ids: string[]) => void
  clearSelection: () => void
  setSnap: (snap: SnapValue) => void
}

const clampVel = (v: number): number => Math.min(127, Math.max(1, Math.round(v)))

export const useStudioStore = create<StudioState>()(
  temporal(
    (set, get) => ({
      chart: null,
      selection: [],
      snap: '1/8',

      loadChart: (chart) => set({ chart }),

      setMeta: (patch) => {
        const chart = get().chart
        if (!chart) return
        set({ chart: { ...chart, meta: { ...chart.meta, ...patch } } })
      },

      setAudio: (audio) => {
        const chart = get().chart
        if (!chart) return
        // New `chart` object so zundo's reference-equality diff records the change.
        if (audio) set({ chart: { ...chart, audio } })
        else {
          const { audio: _drop, ...rest } = chart
          void _drop
          set({ chart: { ...rest } })
        }
      },

      addNote: ({ time, instrumentClass, vel, duration }) => {
        const chart = get().chart
        if (!chart) return ''
        const id = generateId()
        const note: StudioNote = { id, time, instrumentClass, vel: clampVel(vel) }
        if (duration !== undefined) note.duration = duration
        set({ chart: { ...chart, notes: [...chart.notes, note] } })
        return id
      },

      addNotes: (incoming) => {
        const chart = get().chart
        if (!chart) return []
        const created: StudioNote[] = incoming.map((n) => {
          const note: StudioNote = {
            id: generateId(),
            time: n.time,
            instrumentClass: n.instrumentClass,
            vel: clampVel(n.vel),
          }
          if (n.duration !== undefined) note.duration = n.duration
          return note
        })
        // One immutable set → one zundo history entry for the whole batch.
        set({ chart: { ...chart, notes: [...chart.notes, ...created] } })
        return created.map((n) => n.id)
      },

      moveNotes: (ids, { dt, dLaneClass }) => {
        const chart = get().chart
        if (!chart) return
        const idSet = new Set(ids)
        const notes = chart.notes.map((n) =>
          idSet.has(n.id)
            ? { ...n, time: n.time + dt, ...(dLaneClass ? { instrumentClass: dLaneClass } : null) }
            : n,
        )
        set({ chart: { ...chart, notes } })
      },

      setVelocity: (ids, vel) => {
        const chart = get().chart
        if (!chart) return
        const idSet = new Set(ids)
        const clamped = clampVel(vel)
        const notes = chart.notes.map((n) => (idSet.has(n.id) ? { ...n, vel: clamped } : n))
        set({ chart: { ...chart, notes } })
      },

      deleteNotes: (ids) => {
        const chart = get().chart
        if (!chart) return
        const idSet = new Set(ids)
        const notes = chart.notes.filter((n) => !idSet.has(n.id))
        set({ chart: { ...chart, notes } })
      },

      remapClass: (fromClass, toClass) => {
        const chart = get().chart
        if (!chart) return
        const notes = chart.notes.map((n) =>
          n.instrumentClass === fromClass ? { ...n, instrumentClass: toClass } : n,
        )
        set({ chart: { ...chart, notes } })
      },

      setSelection: (ids) => set({ selection: ids }),
      clearSelection: () => set({ selection: [] }),
      setSnap: (snap) => set({ snap }),
    }),
    {
      // Track ONLY `chart` in undo history — selection/snap must not pollute it.
      partialize: (s) => ({ chart: s.chart }),
      // Only record a snapshot when the `chart` reference actually changes.
      // Chart mutations are immutable (new object each time) so real edits get
      // recorded, while selection/snap `set()`s (same chart ref) are skipped —
      // otherwise zundo would push a duplicate snapshot on every `set()`.
      equality: (a, b) => a.chart === b.chart,
      limit: 100,
    },
  ),
)
