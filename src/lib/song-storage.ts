import { get, set, del, keys } from 'idb-keyval'
import type { StoredSong, StoredSongMeta, SongMeta } from '@/types/song'
import { sortDifficulties, extractInstrumentClasses } from '@/lib/rlrr-parser'

const SONG_PREFIX = 'drumford-song-'
const META_PREFIX = 'drumford-meta-'

function songKey(id: string): string {
  return SONG_PREFIX + id
}

function metaKey(id: string): string {
  return META_PREFIX + id
}

/**
 * Build a fresh meta record from a stored song.
 *
 * `addedAt` defaults to "now" — meaning every meta created at first-time
 * import OR rebuilt via the migration path gets stamped. Callers that have
 * a previous addedAt to preserve (e.g. migration of an old record) should
 * read the existing meta first and pass `preserveAddedAt` so we don't
 * overwrite the original import time.
 */
function extractMeta(song: StoredSong, preserveAddedAt?: number): StoredSongMeta {
  const hasDrumTrack =
    (song.drumTrackBlobs?.length ?? 0) > 0 ||
    !!song.drumTrackBlob

  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    creator: song.creator,
    duration: song.duration,
    complexity: song.complexity,
    difficulty: song.difficulty,
    coverImageBlob: song.coverImageBlob,
    folderName: song.folderName,
    hasDrumTrack,
    instrumentClasses: extractInstrumentClasses(song.rlrrJson),
    addedAt: preserveAddedAt ?? Date.now(),
  }
}

export async function storeSong(song: StoredSong): Promise<void> {
  await Promise.all([
    set(songKey(song.id), song),
    set(metaKey(song.id), extractMeta(song)),
  ])
}

export async function getStoredSong(id: string): Promise<StoredSong | null> {
  const result = await get<StoredSong>(songKey(id))
  return result ?? null
}

export async function deleteStoredSong(id: string): Promise<void> {
  await Promise.all([
    del(songKey(id)),
    del(metaKey(id)),
  ])
}

async function ensureMetasExist(): Promise<void> {
  const allKeys = await keys()
  const songIds = new Set(
    (allKeys as string[])
      .filter((k) => k.startsWith(SONG_PREFIX))
      .map((k) => k.slice(SONG_PREFIX.length))
  )
  const metaIds = new Set(
    (allKeys as string[])
      .filter((k) => k.startsWith(META_PREFIX))
      .map((k) => k.slice(META_PREFIX.length))
  )

  // Rebuild metas that are missing entirely
  const missing = [...songIds].filter((id) => !metaIds.has(id))
  for (const id of missing) {
    const song = await get<StoredSong>(songKey(id))
    if (song) await set(metaKey(id), extractMeta(song))
  }

  // Migrate old metas missing fields added after their import time
  // (hasDrumTrack, instrumentClasses, addedAt, …). Rebuild from the full
  // song if so, but preserve `addedAt` if it was already stamped — the
  // user's import history shouldn't reset every time we add a new field.
  for (const id of metaIds) {
    const meta = await get<StoredSongMeta>(metaKey(id))
    if (meta && (
      meta.hasDrumTrack === undefined ||
      meta.instrumentClasses === undefined ||
      meta.addedAt === undefined
    )) {
      const song = await get<StoredSong>(songKey(id))
      if (song) await set(metaKey(id), extractMeta(song, meta.addedAt))
    }
  }
}

async function getAllStoredMetas(): Promise<StoredSongMeta[]> {
  await ensureMetasExist()
  const allKeys = await keys()
  const metaKeys = (allKeys as string[]).filter((k) => k.startsWith(META_PREFIX))

  const metas: StoredSongMeta[] = []
  for (const key of metaKeys) {
    const meta = await get<StoredSongMeta>(key)
    if (meta) metas.push(meta)
  }
  return metas
}

export async function getAllSongMetas(): Promise<SongMeta[]> {
  const allMetas = await getAllStoredMetas()
  const grouped = new Map<string, StoredSongMeta[]>()

  for (const meta of allMetas) {
    const groupKey = `${meta.title}|${meta.artist}|${meta.folderName}`
    const group = grouped.get(groupKey) ?? []
    group.push(meta)
    grouped.set(groupKey, group)
  }

  const result: SongMeta[] = []
  for (const [, metas] of grouped) {
    const first = metas[0]!
    // Union instrument classes across every difficulty of this song —
    // a player picking "Hard" wants to know the kit pieces in scope for
    // any version of the chart they might play.
    const allClasses = new Set<string>()
    for (const m of metas) {
      for (const cls of m.instrumentClasses ?? []) allClasses.add(cls)
    }
    // "Added" = the most recent of any chart for this song. So importing
    // an Expert chart for a song you already have at Easy bumps the song
    // back to the top of the Date Added sort.
    const addedAt = metas.reduce((max, m) => Math.max(max, m.addedAt ?? 0), 0)
    result.push({
      id: first.id,
      title: first.title,
      artist: first.artist,
      creator: first.creator,
      duration: first.duration,
      complexity: first.complexity,
      // Sort by skill progression (Easy → Medium → Hard → Expert), not alphabetical
      difficulties: sortDifficulties(metas.map((m) => m.difficulty)),
      coverImageBlob: first.coverImageBlob,
      folderName: first.folderName,
      hasDrumTrack: metas.some((m) => m.hasDrumTrack === true),
      instrumentClasses: [...allClasses].sort(),
      addedAt,
    })
  }

  return result
}

export async function getSongIdByTitleDifficulty(
  title: string,
  difficulty: string,
  folderName: string
): Promise<string | null> {
  const allMetas = await getAllStoredMetas()
  for (const meta of allMetas) {
    if (meta.title === title && meta.difficulty === difficulty && meta.folderName === folderName) {
      return meta.id
    }
  }
  return null
}

export async function getAllIdsForFolder(folderName: string): Promise<string[]> {
  const allMetas = await getAllStoredMetas()
  return allMetas.filter((m) => m.folderName === folderName).map((m) => m.id)
}

/**
 * Update title, artist, and/or cover art for every difficulty entry in a folder.
 * This keeps all entries in sync so the library groups them correctly.
 */
export async function updateSongMeta(
  folderName: string,
  updates: { title?: string; artist?: string; coverImageBlob?: Blob | null },
): Promise<void> {
  const allMetas = await getAllStoredMetas()
  const matching = allMetas.filter((m) => m.folderName === folderName)

  for (const meta of matching) {
    // Update the lightweight meta record
    const updatedMeta: StoredSongMeta = {
      ...meta,
      ...(updates.title !== undefined && { title: updates.title }),
      ...(updates.artist !== undefined && { artist: updates.artist }),
      ...(updates.coverImageBlob !== undefined && { coverImageBlob: updates.coverImageBlob }),
    }
    await set(metaKey(meta.id), updatedMeta)

    // Also update the full song record so playback picks up the changes
    const full = await get<StoredSong>(songKey(meta.id))
    if (full) {
      const updatedFull: StoredSong = {
        ...full,
        ...(updates.title !== undefined && { title: updates.title }),
        ...(updates.artist !== undefined && { artist: updates.artist }),
        ...(updates.coverImageBlob !== undefined && { coverImageBlob: updates.coverImageBlob }),
      }
      await set(songKey(meta.id), updatedFull)
    }
  }
}
