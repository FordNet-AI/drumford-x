import { get, set, del, keys } from 'idb-keyval'
import { generateId } from '@/lib/rlrr-parser'
import type { StudioChart } from '@studio/types'

/**
 * Studio-local draft persistence over `idb-keyval`.
 *
 * Each draft is one IndexedDB record under `drumford-studio-draft-<id>` holding
 * `{ id, savedAt, chart }`. The chart's `audio.blob` is stored inline — idb-keyval
 * structured-clones Blobs, so no separate blob handling is needed.
 *
 * This is studio-local only: it does NOT touch the player's `drumford-song-*` /
 * `drumford-meta-*` records, so studio drafts and imported player songs coexist.
 */
const DRAFT_PREFIX = 'drumford-studio-draft-'

function draftKey(id: string): string {
  return DRAFT_PREFIX + id
}

/** Lightweight projection for listing — never carries the full chart/audio. */
export interface DraftMeta {
  id: string
  title: string
  artist: string
  savedAt: number
  noteCount: number
}

/** The full stored record. Internal — callers get `StudioChart` / `DraftMeta`. */
interface StoredDraft {
  id: string
  savedAt: number
  chart: StudioChart
}

/**
 * Save (create or overwrite) a draft. Pass `existingId` to update a draft in
 * place; omit it to create a new one. Returns the draft id.
 */
export async function saveDraft(chart: StudioChart, existingId?: string): Promise<string> {
  const id = existingId ?? generateId()
  const record: StoredDraft = { id, savedAt: Date.now(), chart }
  await set(draftKey(id), record)
  return id
}

/** List all drafts as lightweight metas, newest first. */
export async function listDrafts(): Promise<DraftMeta[]> {
  const allKeys = (await keys()) as string[]
  const draftKeys = allKeys.filter((k) => typeof k === 'string' && k.startsWith(DRAFT_PREFIX))

  const metas: DraftMeta[] = []
  for (const key of draftKeys) {
    const record = await get<StoredDraft>(key)
    if (!record) continue
    metas.push({
      id: record.id,
      title: record.chart.meta.title,
      artist: record.chart.meta.artist,
      savedAt: record.savedAt,
      noteCount: record.chart.notes.length,
    })
  }

  // Newest first.
  metas.sort((a, b) => b.savedAt - a.savedAt)
  return metas
}

/** Load a draft's full chart, or null if it doesn't exist. */
export async function loadDraft(id: string): Promise<StudioChart | null> {
  const record = await get<StoredDraft>(draftKey(id))
  return record ? record.chart : null
}

/** Delete a draft. No-op if it doesn't exist. */
export async function deleteDraft(id: string): Promise<void> {
  await del(draftKey(id))
}
