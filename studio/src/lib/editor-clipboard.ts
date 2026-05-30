/**
 * In-memory clipboard for the piano-roll editor (copy / cut / paste).
 *
 * This is a plain module-level singleton — deliberately NOT a zustand store and
 * NOT part of the undo-tracked studio-store. Copying must never push an undo
 * entry, and the clipboard should survive selection/chart edits between a copy
 * and its paste.
 *
 * Notes are stored as RELATIVE offsets from the earliest selected note's time
 * (`dt = note.time - minSelectedTime`). On paste we anchor the whole group at
 * the playhead: each note lands at `anchor + dt`, snapped to the grid, so the
 * internal rhythm of the copied phrase is preserved while it slides to wherever
 * the playhead sits.
 */
import type { StudioNote } from '@studio/types'

/** One clipped note: its time offset from the group anchor, plus class + vel. */
export interface ClipboardNote {
  /** Seconds after the earliest copied note (the group anchor). >= 0. */
  dt: number
  instrumentClass: string
  vel: number
  duration?: number
}

let clipboard: ClipboardNote[] = []

/**
 * Snapshot `notes` into the clipboard as relative offsets. Notes with the
 * smallest `time` become the anchor (dt = 0). Empty input clears the clipboard.
 */
export function copyNotesToClipboard(notes: StudioNote[]): void {
  if (notes.length === 0) {
    clipboard = []
    return
  }
  const minTime = Math.min(...notes.map((n) => n.time))
  clipboard = notes.map((n) => {
    const clip: ClipboardNote = {
      dt: n.time - minTime,
      instrumentClass: n.instrumentClass,
      vel: n.vel,
    }
    if (n.duration !== undefined) clip.duration = n.duration
    return clip
  })
}

/** A defensive copy of the current clipboard contents (never the live array). */
export function getClipboard(): ClipboardNote[] {
  return clipboard.map((c) => ({ ...c }))
}

/** True when there is something to paste. */
export function hasClipboard(): boolean {
  return clipboard.length > 0
}

/** Clear the clipboard (used by tests; not bound to any UI yet). */
export function clearClipboard(): void {
  clipboard = []
}
