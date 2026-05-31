import { create } from 'zustand'
import type { SongMeta, StoredSong, Song } from '@/types/song'
import { getAllSongMetas, storeSong, getStoredSong, deleteStoredSong, getSongIdByTitleDifficulty, getAllIdsForFolder, updateSongMeta } from '@/lib/song-storage'
import { parseRlrr, generateId, decodeRlrr, isParediEditAutosave } from '@/lib/rlrr-parser'
import { useKitStore } from '@/stores/kit-store'

export interface ImportWarning {
  song: string
  issue: string
  severity: 'info' | 'warn' | 'error'
}

export interface ImportResult {
  imported: number
  skipped: number
  warnings: ImportWarning[]
}

interface LibraryState {
  songs: SongMeta[]
  isLoading: boolean
  importProgress: string | null
  importResult: ImportResult | null
  clearImportResult: () => void
  loadLibrary: () => Promise<void>
  importFolder: (entries: FileSystemEntry[]) => Promise<void>
  importFiles: (files: File[]) => Promise<void>
  importFromBuffers: (folderName: string, files: { name: string; data: ArrayBuffer; type: string }[]) => Promise<void>
  removeSong: (folderName: string) => Promise<void>
  updateSong: (folderName: string, updates: { title?: string; artist?: string; coverImageBlob?: Blob | null }) => Promise<void>
  loadSongForPlayback: (title: string, difficulty: string, folderName: string) => Promise<Song | null>
}

interface CollectedFiles {
  rlrrFiles: { name: string; file: File }[]
  audioFiles: Map<string, File>
  imageFiles: Map<string, File>
  folderName: string
}

async function readEntryAsFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = []
  let batch: FileSystemEntry[] = await new Promise((resolve, reject) => reader.readEntries(resolve, reject))
  while (batch.length > 0) {
    all.push(...batch)
    batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject))
  }
  return all
}

/**
 * Collect files from dropped FileSystemEntry[].
 *
 * Handles two cases:
 * 1. Single song folder (contains .rlrr files directly)
 * 2. Parent folder containing multiple song subfolders
 *
 * Returns one CollectedFiles per song folder found.
 */
async function collectFiles(entries: FileSystemEntry[]): Promise<CollectedFiles[]> {
  console.log('[import] collectFiles called with', entries.length, 'entries')
  for (const e of entries) {
    console.log('[import]   entry:', e.name, 'isFile:', e.isFile, 'isDir:', e.isDirectory)
  }

  const results: CollectedFiles[] = []

  for (const entry of entries) {
    if (entry.isFile) {
      console.log('[import] Skipping loose file:', entry.name)
      continue
    }

    if (!entry.isDirectory) {
      console.log('[import] Skipping non-file non-dir entry:', entry.name)
      continue
    }

    // Skip Autosave folders entirely — paredit dumps editor backups in
    // there, and we don't want them appearing as fake difficulties.
    if (entry.name.toLowerCase() === 'autosave') {
      console.log('[import] Skipping Autosave folder:', entry.name)
      continue
    }

    const dirEntry = entry as FileSystemDirectoryEntry
    const children = await readAllEntries(dirEntry.createReader())
    console.log('[import] Dir', entry.name, '→', children.length, 'children:', children.map(c => c.name).join(', '))

    // Check if this directory itself is a song folder (has .rlrr files)
    // — but ignore autosave-named .rlrr files when making that decision,
    // otherwise a folder that contains *only* autosaves would be treated
    // as a real song folder.
    const hasRlrr = children.some(
      (c) => c.isFile && c.name.toLowerCase().endsWith('.rlrr') && !isParediEditAutosave(c.name)
    )

    if (hasRlrr) {
      console.log('[import] Dir', entry.name, 'is a song folder (has .rlrr)')
      const collected = await collectSingleFolder(entry.name, children)
      console.log('[import] Collected:', collected.folderName, '→', collected.rlrrFiles.length, 'rlrr,', collected.audioFiles.size, 'audio,', collected.imageFiles.size, 'images')
      results.push(collected)
    } else {
      console.log('[import] Dir', entry.name, 'is a parent folder — scanning subdirs')
      for (const child of children) {
        if (!child.isDirectory) {
          console.log('[import]   Skipping non-dir child:', child.name)
          continue
        }
        if (child.name.toLowerCase() === 'autosave') {
          console.log('[import]   Skipping nested Autosave folder:', child.name)
          continue
        }
        const subDir = child as FileSystemDirectoryEntry
        const subChildren = await readAllEntries(subDir.createReader())
        console.log('[import]   Subdir', child.name, '→', subChildren.length, 'files:', subChildren.map(c => c.name).join(', '))
        const subHasRlrr = subChildren.some(
          (c) => c.isFile && c.name.toLowerCase().endsWith('.rlrr') && !isParediEditAutosave(c.name)
        )
        if (subHasRlrr) {
          console.log('[import]   Subdir', child.name, 'has .rlrr — collecting')
          const collected = await collectSingleFolder(child.name, subChildren)
          console.log('[import]   Collected:', collected.folderName, '→', collected.rlrrFiles.length, 'rlrr,', collected.audioFiles.size, 'audio,', collected.imageFiles.size, 'images')
          results.push(collected)
        } else {
          console.log('[import]   Subdir', child.name, 'has no .rlrr — skipping')
        }
      }
    }
  }

  console.log('[import] collectFiles done. Total song folders found:', results.length)
  return results
}

/** Read all files in a flat list of entries into a CollectedFiles object. */
async function collectSingleFolder(
  folderName: string,
  entries: FileSystemEntry[],
): Promise<CollectedFiles> {
  const result: CollectedFiles = {
    rlrrFiles: [],
    audioFiles: new Map(),
    imageFiles: new Map(),
    folderName,
  }

  for (const entry of entries) {
    if (!entry.isFile) continue
    const file = await readEntryAsFile(entry as FileSystemFileEntry)
    const lower = file.name.toLowerCase()

    if (lower.endsWith('.rlrr')) {
      // Skip paredit autosaves so they don't appear as fake difficulties
      if (isParediEditAutosave(file.name)) continue
      result.rlrrFiles.push({ name: file.name, file })
    } else if (lower.endsWith('.ogg') || lower.endsWith('.mp3') || lower.endsWith('.wav')) {
      result.audioFiles.set(file.name, file)
    } else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp')) {
      result.imageFiles.set(file.name, file)
    }
  }

  return result
}

function findFile(files: Map<string, File>, targetName: string): File | null {
  if (files.has(targetName)) return files.get(targetName)!
  const lower = targetName.toLowerCase()
  for (const [name, file] of files) {
    if (name.toLowerCase() === lower) return file
  }
  return null
}

/**
 * Classify File[] from a file input (webkitdirectory).
 *
 * webkitRelativePath gives us e.g. "diddle/Iris/song.ogg".
 * We group files by their song-level folder: the deepest directory that
 * contains at least one .rlrr file. If the top-level folder itself contains
 * .rlrr files, it's a single song folder. Otherwise, the second path segment
 * is the song folder.
 */
function classifyFiles(files: File[]): CollectedFiles[] {
  // Group files by their parent directory (second-to-last path segment)
  const byDir = new Map<string, File[]>()

  for (const file of files) {
    const rel = file.webkitRelativePath || file.name
    // Drop paredit autosaves before grouping — uses the full relative path
    // so the `/Autosave/` segment check works regardless of nesting depth.
    if (isParediEditAutosave(rel)) continue
    const parts = rel.split('/')
    // Determine the grouping key:
    // "diddle/Iris/song.ogg" → 3 parts → group key "Iris"
    // "Iris/song.ogg"        → 2 parts → group key "Iris"
    // "song.ogg"             → 1 part  → group key ""
    let groupKey: string
    if (parts.length >= 3) {
      groupKey = parts[parts.length - 2]!
    } else if (parts.length === 2) {
      groupKey = parts[0]!
    } else {
      groupKey = ''
    }

    if (!byDir.has(groupKey)) byDir.set(groupKey, [])
    byDir.get(groupKey)!.push(file)
  }

  // Now check: if any group is the top-level folder itself (when groupKey matches
  // the root folder name and contains .rlrr files), treat it as a single song.
  // Otherwise, each group with .rlrr files is a separate song folder.
  const results: CollectedFiles[] = []

  for (const [dirName, dirFiles] of byDir) {
    const hasRlrr = dirFiles.some((f) => f.name.toLowerCase().endsWith('.rlrr'))
    if (!hasRlrr) continue

    const result: CollectedFiles = {
      rlrrFiles: [],
      audioFiles: new Map(),
      imageFiles: new Map(),
      folderName: dirName || 'Unknown',
    }

    for (const file of dirFiles) {
      const lower = file.name.toLowerCase()
      if (lower.endsWith('.rlrr')) {
        result.rlrrFiles.push({ name: file.name, file })
      } else if (lower.endsWith('.ogg') || lower.endsWith('.mp3') || lower.endsWith('.wav')) {
        result.audioFiles.set(file.name, file)
      } else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp')) {
        result.imageFiles.set(file.name, file)
      }
    }

    results.push(result)
  }

  return results
}

interface ImportStats {
  imported: number
  skipped: number
  warnings: ImportWarning[]
}

async function importCollected(
  collected: CollectedFiles,
  setProgress: (msg: string | null) => void,
  stats: ImportStats,
): Promise<void> {
  if (collected.rlrrFiles.length === 0) {
    stats.warnings.push({ song: collected.folderName, issue: 'No chart files (.rlrr) found', severity: 'error' })
    stats.skipped++
    return
  }

  for (const { name, file } of collected.rlrrFiles) {
    try {
      setProgress(`Parsing ${name}...`)

      const buffer = await file.arrayBuffer()
      const json = decodeRlrr(buffer)
      const parsed = parseRlrr(json, name)

      const coverImageName = parsed.meta.coverImagePath

      // Resolve ALL song and drum stems
      const songTrackBlobs: Blob[] = []
      const drumTrackBlobs: Blob[] = []
      let missingSong = false
      let missingDrum = false

      for (const trackName of parsed.meta.songTracks) {
        const file = findFile(collected.audioFiles, trackName)
        if (file) {
          songTrackBlobs.push(new Blob([await file.arrayBuffer()], { type: file.type || 'audio/ogg' }))
        } else {
          missingSong = true
        }
      }
      for (const trackName of parsed.meta.drumTracks) {
        const file = findFile(collected.audioFiles, trackName)
        if (file) {
          drumTrackBlobs.push(new Blob([await file.arrayBuffer()], { type: file.type || 'audio/ogg' }))
        } else {
          missingDrum = true
        }
      }

      const coverFile = coverImageName ? findFile(collected.imageFiles, coverImageName) : null

      // Track missing files as warnings
      if (songTrackBlobs.length === 0 && drumTrackBlobs.length === 0) {
        const available = [...collected.audioFiles.keys()]
        if (available.length === 0) {
          stats.warnings.push({ song: collected.folderName, issue: 'No audio files found — song will have no sound', severity: 'warn' })
        } else {
          const referenced = [...parsed.meta.songTracks, ...parsed.meta.drumTracks].join(', ')
          stats.warnings.push({ song: collected.folderName, issue: `Audio "${referenced}" not found (available: ${available.join(', ')})`, severity: 'warn' })
        }
      } else if (missingSong || missingDrum) {
        stats.warnings.push({ song: collected.folderName, issue: 'Some audio stems missing — playback may be incomplete', severity: 'info' })
      }
      if (!coverFile && coverImageName) {
        stats.warnings.push({ song: collected.folderName, issue: 'Cover image not found', severity: 'info' })
      }

      const coverBlob = coverFile ? new Blob([await coverFile.arrayBuffer()], { type: coverFile.type || 'image/jpeg' }) : null

      const stored: StoredSong = {
        id: generateId(),
        title: parsed.meta.title,
        artist: parsed.meta.artist,
        creator: parsed.meta.creator,
        duration: parsed.meta.duration,
        complexity: parsed.meta.complexity,
        difficulty: parsed.difficulty,
        coverImageBlob: coverBlob,
        folderName: collected.folderName || parsed.meta.title,
        rlrrJson: json,
        songTrackBlobs,
        drumTrackBlobs,
      }

      await storeSong(stored)
      stats.imported++
    } catch (err) {
      console.error(`[import] Failed to parse ${name}:`, err)
      stats.warnings.push({ song: collected.folderName, issue: `Failed to parse ${name}: ${err instanceof Error ? err.message : 'Unknown error'}`, severity: 'error' })
      stats.skipped++
    }
  }
}

export const useLibraryStore = create<LibraryState>()((set, get) => ({
  songs: [],
  isLoading: false,
  importProgress: null,
  importResult: null,

  clearImportResult: () => set({ importResult: null }),

  loadLibrary: async () => {
    set({ isLoading: true })
    const songs = await getAllSongMetas()
    set({ songs, isLoading: false })
  },

  importFolder: async (entries) => {
    set({ importProgress: 'Reading files...', importResult: null })
    const stats: ImportStats = { imported: 0, skipped: 0, warnings: [] }
    try {
      const collectedList = await collectFiles(entries)
      if (collectedList.length === 0) {
        set({ importProgress: null, importResult: { imported: 0, skipped: 0, warnings: [{ song: '', issue: 'No song folders found. Drop a folder containing .rlrr chart files.', severity: 'error' }] } })
        return
      }
      for (let i = 0; i < collectedList.length; i++) {
        const collected = collectedList[i]!
        set({ importProgress: `Importing ${collected.folderName} (${i + 1}/${collectedList.length})...` })
        await importCollected(collected, (msg) => set({ importProgress: msg }), stats)
      }
      set({ importProgress: null, importResult: stats })
      await get().loadLibrary()
    } catch (err) {
      console.error('Import failed:', err)
      stats.warnings.push({ song: '', issue: `Import crashed: ${err instanceof Error ? err.message : 'Unknown error'}`, severity: 'error' })
      set({ importProgress: null, importResult: stats })
    }
  },

  importFiles: async (files) => {
    set({ importProgress: 'Reading files...', importResult: null })
    const stats: ImportStats = { imported: 0, skipped: 0, warnings: [] }
    try {
      const collectedList = classifyFiles(files)
      if (collectedList.length === 0) {
        set({ importProgress: null, importResult: { imported: 0, skipped: 0, warnings: [{ song: '', issue: 'No song folders found. Select a folder containing .rlrr chart files.', severity: 'error' }] } })
        return
      }
      for (let i = 0; i < collectedList.length; i++) {
        const collected = collectedList[i]!
        set({ importProgress: `Importing ${collected.folderName} (${i + 1}/${collectedList.length})...` })
        await importCollected(collected, (msg) => set({ importProgress: msg }), stats)
      }
      set({ importProgress: null, importResult: stats })
      await get().loadLibrary()
    } catch (err) {
      console.error('Import failed:', err)
      stats.warnings.push({ song: '', issue: `Import crashed: ${err instanceof Error ? err.message : 'Unknown error'}`, severity: 'error' })
      set({ importProgress: null, importResult: stats })
    }
  },

  importFromBuffers: async (folderName, files) => {
    set({ importProgress: `Importing ${folderName}...`, importResult: null })
    const stats: ImportStats = { imported: 0, skipped: 0, warnings: [] }

    try {
      // Convert ArrayBuffer files into a CollectedFiles object
      const collected: CollectedFiles = {
        rlrrFiles: [],
        audioFiles: new Map(),
        imageFiles: new Map(),
        folderName,
      }

      for (const f of files) {
        const lower = f.name.toLowerCase()
        // Drop paredit autosaves — the f.name from the zip includes the
        // relative path, so the predicate catches both folder and filename
        // patterns.
        if (lower.endsWith('.rlrr') && isParediEditAutosave(f.name)) continue
        // Create a File-like object from the ArrayBuffer
        const blob = new Blob([f.data], { type: f.type })
        const file = new File([blob], f.name, { type: f.type })

        if (lower.endsWith('.rlrr')) {
          collected.rlrrFiles.push({ name: f.name, file })
        } else if (lower.endsWith('.ogg') || lower.endsWith('.mp3') || lower.endsWith('.wav')) {
          collected.audioFiles.set(f.name, file)
        } else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp')) {
          collected.imageFiles.set(f.name, file)
        }
      }

      if (collected.rlrrFiles.length === 0) {
        set({
          importProgress: null,
          importResult: { imported: 0, skipped: 0, warnings: [{ song: folderName, issue: 'No chart files (.rlrr) found in download', severity: 'error' }] },
        })
        return
      }

      await importCollected(collected, (msg) => set({ importProgress: msg }), stats)
      set({ importProgress: null, importResult: stats })
      await get().loadLibrary()
    } catch (err) {
      console.error('Import from buffers failed:', err)
      stats.warnings.push({ song: folderName, issue: `Import crashed: ${err instanceof Error ? err.message : 'Unknown error'}`, severity: 'error' })
      set({ importProgress: null, importResult: stats })
    }
  },

  removeSong: async (folderName) => {
    const ids = await getAllIdsForFolder(folderName)
    for (const id of ids) {
      await deleteStoredSong(id)
    }
    await get().loadLibrary()
  },

  updateSong: async (folderName, updates) => {
    await updateSongMeta(folderName, updates)
    await get().loadLibrary()
  },

  loadSongForPlayback: async (title, difficulty, folderName) => {
    const id = await getSongIdByTitleDifficulty(title, difficulty, folderName)
    if (!id) {
      console.error('[loadSong] No ID found for:', { title, difficulty, folderName })
      return null
    }

    const stored = await getStoredSong(id)
    if (!stored) {
      console.error('[loadSong] Full record missing for ID:', id)
      return null
    }

    // Parse against the current user kit — laneIndex gets resolved via the
    // user's instrument mapping. Notes carry instrumentClass so we can
    // re-resolve later when the user edits their kit mid-session.
    const kit = useKitStore.getState().kit
    const parsed = parseRlrr(stored.rlrrJson, `${title}_${difficulty}.rlrr`, kit)

    return {
      id: stored.id,
      title: stored.title,
      artist: stored.artist,
      creator: stored.creator,
      duration: stored.duration,
      complexity: stored.complexity,
      difficulty: stored.difficulty,
      coverImageBlob: stored.coverImageBlob,
      folderName: stored.folderName,
      notes: parsed.notes,
      bpmEvents: parsed.bpmEvents,
      description: parsed.meta.description,
      sections: parsed.meta.sections,
      ghostNoteThreshold: parsed.meta.ghostNoteThreshold,
      accentNoteThreshold: parsed.meta.accentNoteThreshold,
      calibrationOffset: parsed.meta.calibrationOffset,
    }
  },
}))
