import { useEffect, useCallback, useState, useMemo } from 'react'
import { useLibraryStore } from '@/stores/library-store'
import { usePlayerStore } from '@/stores/player-store'
import { useUIStore } from '@/stores/ui-store'
import { sortDifficulties } from '@/lib/rlrr-parser'
import type { SongMeta } from '@/types/song'
import { ImportDropZone } from './import-drop-zone'
import { ImportToast } from './import-toast'
import { SongCard } from './song-card'
import { SongEditModal } from './song-edit-modal'
import { LibraryTabs, type LibraryTab } from './library-tabs'
import { LibraryToolbar, type SortField, type SortDir } from './library-toolbar'
import { ParaDBBrowser } from './paradb-browser'
import { ManualContent } from './manual-content'
import { AboutContent } from './about-content'
import { FordnetLogo } from './fordnet-logo'

const isElectron = !!window.electronAPI

export function SongLibrary() {
  const songs = useLibraryStore((s) => s.songs)
  const isLoading = useLibraryStore((s) => s.isLoading)
  const loadLibrary = useLibraryStore((s) => s.loadLibrary)
  const importFolder = useLibraryStore((s) => s.importFolder)
  const importFiles = useLibraryStore((s) => s.importFiles)
  const loadSongForPlayback = useLibraryStore((s) => s.loadSongForPlayback)
  const loadSong = usePlayerStore((s) => s.loadSong)
  const setScreen = useUIStore((s) => s.setScreen)
  const [isDragOver, setIsDragOver] = useState(false)
  const [activeTab, setActiveTab] = useState<LibraryTab>('my-songs')

  // Sort & filter state
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('title')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [difficultyFilter, setDifficultyFilter] = useState<string | null>(null)

  // "Hide album art" preference — persisted across sessions in localStorage.
  // When true, song cards render text-only (no cover-art block), letting the
  // user scan ~3× more songs per screen for fast navigation.
  const [hideArt, setHideArt] = useState<boolean>(() => {
    return localStorage.getItem('drumford-library-hide-art') === 'true'
  })
  const handleHideArtChange = useCallback((next: boolean) => {
    setHideArt(next)
    localStorage.setItem('drumford-library-hide-art', String(next))
  }, [])

  // Edit modal state
  const [editingSong, setEditingSong] = useState<SongMeta | null>(null)

  useEffect(() => {
    loadLibrary()
  }, [loadLibrary])

  // Compute available difficulties across all songs in skill-progression order
  const availableDifficulties = useMemo(() => {
    const set = new Set<string>()
    for (const song of songs) {
      for (const d of song.difficulties) set.add(d)
    }
    return sortDifficulties([...set])
  }, [songs])

  // Sort + filter
  const filteredSongs = useMemo(() => {
    let result = [...songs]

    // Text search
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q) ||
          s.creator.toLowerCase().includes(q),
      )
    }

    // Difficulty filter
    if (difficultyFilter) {
      result = result.filter((s) => s.difficulties.includes(difficultyFilter))
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'title':
          cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
          break
        case 'artist':
          cmp = a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' })
          break
        case 'complexity':
          cmp = a.complexity - b.complexity
          break
        case 'duration':
          cmp = a.duration - b.duration
          break
        case 'dateAdded':
          // Older songs (lower addedAt) ascend; descending → newest first.
          // Tie-break by title so songs imported in the same batch stay grouped
          // alphabetically rather than in random/insertion order.
          cmp = a.addedAt - b.addedAt
          if (cmp === 0) cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [songs, search, sortField, sortDir, difficultyFilter])

  const handleSortChange = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        // Toggle direction
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return prev
      }
      // New field: pick the direction that feels natural for that field.
      // "Date Added" defaults to newest-first; alphabetical fields default
      // to A→Z; numeric fields ascend (shortest/easiest first).
      setSortDir(field === 'dateAdded' ? 'desc' : 'asc')
      return field
    })
  }, [])

  // Full-page drop handler so the user can drop anywhere
  const handlePageDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handlePageDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget === e.target) setIsDragOver(false)
  }, [])

  const handlePageDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    // Switch to My Songs tab when dropping files
    setActiveTab('my-songs')

    const items = e.dataTransfer.items
    const entries: FileSystemEntry[] = []

    if (items) {
      for (let i = 0; i < items.length; i++) {
        const entry = items[i]?.webkitGetAsEntry?.()
        if (entry) entries.push(entry)
      }
    }

    if (entries.length > 0) {
      await importFolder(entries)
      return
    }

    const files = e.dataTransfer.files
    if (files.length > 0) {
      await importFiles(Array.from(files))
    }
  }, [importFolder, importFiles])

  const handlePlay = async (song: typeof songs[number], difficulty: string) => {
    try {
      const fullSong = await loadSongForPlayback(song.title, difficulty, song.folderName)
      if (!fullSong) {
        console.error('[play] Song not found:', song.title, difficulty, song.folderName)
        return
      }
      loadSong(fullSong)
      setScreen('highway')
    } catch (err) {
      console.error('[play] Failed to load song:', song.title, difficulty, err)
    }
  }

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      onDrop={handlePageDrop}
    >
      {isDragOver && (
        <div className="fixed inset-0 z-50 bg-[#00e5ff08] border-4 border-dashed border-[#00e5ff] pointer-events-none flex items-center justify-center">
          <span className="text-[#00e5ff] text-lg">Drop song folder to import</span>
        </div>
      )}
      <header className="px-6 py-4 border-b border-[#1a1a2e] bg-[#0d1424] flex items-center justify-between">
        <div>
          <h1
            className="text-2xl tracking-[4px] font-black"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            <span className="text-[#00e5ff]">DRUM</span>
            <span className="text-[#ff3a5c]">FORD</span>
            <span className="text-[#888] ml-2 text-lg">X</span>
          </h1>
        </div>
        <FordnetLogo />
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <ImportToast />
        <LibraryTabs activeTab={activeTab} onTabChange={setActiveTab} />

        {activeTab === 'paradb' ? (
          <ParaDBBrowser />
        ) : activeTab === 'manual' ? (
          <ManualContent />
        ) : activeTab === 'about' ? (
          <AboutContent />
        ) : (
          <>
            <ImportDropZone />

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-[#00e5ff] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : songs.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-[#555] text-sm">No songs imported yet</p>
                <p className="text-[#333] text-xs mt-1">
                  {isElectron
                    ? 'Search ParaDB above or drop song folders here'
                    : 'Download songs from paradb.net and drop them here'
                  }
                </p>
                <button
                  onClick={() => setActiveTab('paradb')}
                  className="mt-4 px-4 py-2 text-xs border border-[#1a1a2e] rounded hover:border-[#00e5ff] hover:text-[#00e5ff] transition-colors text-[#888]"
                >
                  Browse ParaDB →
                </button>
              </div>
            ) : (
              <>
                <div className="mt-4">
                  <LibraryToolbar
                    search={search}
                    onSearchChange={setSearch}
                    sortField={sortField}
                    sortDir={sortDir}
                    onSortChange={handleSortChange}
                    difficultyFilter={difficultyFilter}
                    onDifficultyFilterChange={setDifficultyFilter}
                    availableDifficulties={availableDifficulties}
                    hideArt={hideArt}
                    onHideArtChange={handleHideArtChange}
                  />
                </div>

                {filteredSongs.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-[#555] text-sm">No songs match your filters</p>
                    <button
                      onClick={() => { setSearch(''); setDifficultyFilter(null) }}
                      className="mt-2 text-xs text-[#00e5ff] hover:text-[#33eeff] transition-colors"
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  // Grid density adapts to hide-art mode: with art the cards
                  // are tall (aspect-square cover) so we cap at 6 cols; without
                  // art the cards are ~70% shorter so we can fit 8 cols on
                  // wide screens for faster scanning.
                  <div
                    className={
                      hideArt
                        ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 mt-4'
                        : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 mt-4'
                    }
                  >
                    {filteredSongs.map((song) => (
                      <SongCard
                        key={song.folderName}
                        song={song}
                        onPlay={(diff) => handlePlay(song, diff)}
                        onEdit={() => setEditingSong(song)}
                        hideArt={hideArt}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Edit modal */}
      {editingSong && (
        <SongEditModal
          song={editingSong}
          onClose={() => setEditingSong(null)}
        />
      )}
    </div>
  )
}
