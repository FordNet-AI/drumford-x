import { useState, useCallback, useEffect, useMemo } from 'react'
import { Search, Loader2, X } from 'lucide-react'
import { ParaDBCard } from './paradb-card'
import { ParaDBRow } from './paradb-row'
import { ParaDBToolbar, type ParaDBSort, type ParaDBView } from './paradb-toolbar'
import {
  loadCatalog, saveCatalog, isStale, formatCatalogAge,
  type CachedCatalog,
} from '@/lib/paradb-catalog'

/**
 * ParaDB browser — local catalog + instant client-side filter.
 *
 * Architecture:
 *   1. On mount, load the cached catalog from IndexedDB (fast, ~6,000 maps).
 *   2. If no cache OR cache is older than 24h, fetch the full catalog from
 *      ParaDB via the main process (one bulk operation, ~6 paginated calls).
 *   3. ALL search/filter/sort happens client-side on the cached array.
 *
 * Why this design:
 *   - ParaDB's `?search=` query param is silently ignored by their API
 *     (verified). Server-side search just doesn't work.
 *   - The full catalog is small enough (~10MB JSON) to keep in memory.
 *   - Instant keystroke-by-keystroke filtering is dramatically better UX
 *     than any debounced API call.
 *   - Supports search on any field (title / artist / creator / etc.) and
 *     sort options server can't (trending in last 7/30 days).
 */

const SEARCH_FIELDS = [
  { value: 'all',     label: 'All' },
  { value: 'title',   label: 'Title' },
  { value: 'artist',  label: 'Artist' },
  { value: 'creator', label: 'Creator' },
] as const
type SearchField = typeof SEARCH_FIELDS[number]['value']

export function ParaDBBrowser() {
  const [catalog, setCatalog] = useState<CachedCatalog | null>(null)
  // Default to true — we ARE loading from the moment the tab mounts (the
  // IDB cache check is async). Without this default, there's a one-frame
  // flash of "Catalog unavailable" before the useEffect kicks in. False
  // becomes the steady state once we either have a catalog or hit an error.
  const [isLoading, setIsLoading] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  // Default to 'title' — typing a song name is the overwhelmingly common
  // search intent. The 'all' option exists for broader search but lives
  // behind an explicit user choice to avoid landing on a code path that
  // was historically the buggiest (it iterates 3 fields per map across the
  // entire 6,000-entry catalog and was crashing when any field was null).
  const [searchField, setSearchField] = useState<SearchField>('title')

  // Track which songs are currently downloading
  const [downloading, setDownloading] = useState<Map<string, number>>(new Map())

  // View + sort prefs — persisted to localStorage so the user's choice sticks.
  const [view, setView] = useState<ParaDBView>(() => {
    const stored = localStorage.getItem('drumford-paradb-view')
    return stored === 'grid' ? 'grid' : 'list'
  })
  const [sort, setSort] = useState<ParaDBSort>(() => {
    const stored = localStorage.getItem('drumford-paradb-sort')
    if (stored === 'alphabetical' || stored === 'popular' || stored === 'trending7' ||
        stored === 'trending30' || stored === 'recent' || stored === 'complexity') {
      return stored
    }
    return 'popular'
  })

  const handleViewChange = (v: ParaDBView) => {
    setView(v)
    localStorage.setItem('drumford-paradb-view', v)
  }
  const handleSortChange = (s: ParaDBSort) => {
    setSort(s)
    localStorage.setItem('drumford-paradb-sort', s)
  }

  /**
   * Fetch the full catalog from ParaDB via the main process, with progress
   * events streaming back over IPC. The bulk operation makes ~6 paginated
   * calls to /api/maps?offset=N&limit=1000.
   */
  const fetchCatalog = useCallback(async () => {
    // Snapshot the bridge once and narrow it to a local non-null `api`.
    // Avoids belt-and-suspenders `?.` calls below and removes the only two
    // remaining direct `window.electronAPI.*` accesses in this file
    // (the others all use `?.`).
    const api = window.electronAPI
    if (!api) {
      setError('ParaDB requires the Electron app — this feature is unavailable in browser mode.')
      return
    }
    setIsLoading(true)
    setError(null)
    setLoadProgress(0)

    const cleanup = api.onCatalogProgress(({ loaded }) => {
      setLoadProgress(loaded)
    })

    try {
      const maps = await api.paradbCatalog()
      const fresh: CachedCatalog = { maps, fetchedAt: Date.now() }
      await saveCatalog(maps)
      setCatalog(fresh)
    } catch (err) {
      console.error('[paradb] Catalog fetch failed:', err)
      setError(err instanceof Error ? err.message : 'Catalog fetch failed')
    } finally {
      cleanup?.()
      setIsLoading(false)
    }
  }, [])

  // Load cached catalog on mount; fetch fresh if missing.
  // Stale catalog stays usable — user can hit the Refresh button when ready.
  // isLoading starts true (see useState) so the first render shows "Loading…"
  // instead of "Catalog unavailable" while this effect resolves.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const cached = await loadCatalog()
        if (cancelled) return
        if (cached) {
          setCatalog(cached)
          setIsLoading(false)
          if (isStale(cached)) {
            // Surface the staleness via the "updated X ago" label in the toolbar
            // rather than auto-refreshing — auto-refresh would silently consume
            // bandwidth every 24h. User triggers it explicitly.
            console.log('[paradb] cached catalog is stale; user can refresh manually')
          }
        } else {
          // No cache — first time using the ParaDB tab. Fetch automatically.
          // fetchCatalog manages isLoading internally (true on entry, false in finally).
          await fetchCatalog()
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[paradb] cache load failed:', err)
          setError(err instanceof Error ? err.message : 'Failed to load catalog')
          setIsLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [fetchCatalog])

  // Listen for download progress
  useEffect(() => {
    const cleanup = window.electronAPI?.onDownloadProgress(({ mapId, progress }) => {
      setDownloading((prev) => new Map(prev).set(mapId, progress))
    })
    return cleanup
  }, [])

  const handleDownload = useCallback(async (mapId: string) => {
    if (downloading.has(mapId)) return
    const api = window.electronAPI
    if (!api) {
      // The Download button only renders when the catalog is loaded, which
      // already requires electronAPI — this is a TS-narrowing guard, not a
      // runtime branch users can hit.
      return
    }
    setDownloading((prev) => new Map(prev).set(mapId, 0))

    try {
      const { folderName, files } = await api.paradbDownload(mapId)
      const { useLibraryStore } = await import('@/stores/library-store')
      await useLibraryStore.getState().importFromBuffers(folderName, files)

      setDownloading((prev) => new Map(prev).set(mapId, 2))
      setTimeout(() => {
        setDownloading((prev) => {
          const next = new Map(prev)
          next.delete(mapId)
          return next
        })
      }, 3000)
    } catch (err) {
      console.error('[paradb] Download failed:', err)
      setDownloading((prev) => {
        const next = new Map(prev)
        next.delete(mapId)
        return next
      })
    }
  }, [downloading])

  /**
   * Filter the catalog by the search query (matched against the chosen
   * field). Then sort by the user's pick. Heavy work is memoized — only
   * re-runs when catalog / query / sort changes, never per render.
   */
  const filteredAndSorted = useMemo(() => {
    if (!catalog) return []
    const q = query.trim().toLowerCase()

    let filtered = catalog.maps
    if (q) {
      // ParaDB API occasionally returns entries with null title / artist /
      // creator (legacy uploads, broken metadata). Optional chaining means
      // a null field simply doesn't match — better than crashing the whole
      // tab. `?? false` ensures the filter predicate always returns a bool.
      // The outermost `if (!m)` is a belt-and-suspenders guard: a corrupted
      // cached catalog (e.g. from an interrupted IndexedDB write) could
      // contain null entries that would crash on `m.title` access.
      filtered = catalog.maps.filter((m) => {
        if (!m) return false
        switch (searchField) {
          case 'title':   return m.title?.toLowerCase().includes(q) ?? false
          case 'artist':  return m.artist?.toLowerCase().includes(q) ?? false
          case 'creator': return m.creator?.toLowerCase().includes(q) ?? false
          case 'all':
          default:
            return (
              (m.title?.toLowerCase().includes(q) ?? false) ||
              (m.artist?.toLowerCase().includes(q) ?? false) ||
              (m.creator?.toLowerCase().includes(q) ?? false)
            )
        }
      })
    }

    const now = Date.now()
    const DAY = 24 * 60 * 60 * 1000

    const sorted = [...filtered]
    switch (sort) {
      case 'alphabetical':
        sorted.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
        break
      case 'popular':
        sorted.sort((a, b) => b.downloadCount - a.downloadCount)
        break
      case 'recent':
        sorted.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
        break
      case 'complexity':
        sorted.sort((a, b) => b.complexity - a.complexity)
        break
      case 'trending7':
      case 'trending30': {
        // "Trending" = uploaded within the window, sorted by downloads.
        // Anything outside the window sinks to the bottom but still appears.
        const windowDays = sort === 'trending7' ? 7 : 30
        const cutoff = now - windowDays * DAY
        sorted.sort((a, b) => {
          const aRecent = parseTime(a.uploadedAt) >= cutoff
          const bRecent = parseTime(b.uploadedAt) >= cutoff
          if (aRecent !== bRecent) return aRecent ? -1 : 1
          return b.downloadCount - a.downloadCount
        })
        break
      }
    }
    return sorted
  }, [catalog, query, searchField, sort])

  const ageLabel = catalog ? formatCatalogAge(catalog.fetchedAt) : null
  const totalCount = catalog?.maps.length ?? 0

  // ── Render branches ──────────────────────────────────────────────

  // Initial load — no catalog yet, fetching
  if (isLoading && !catalog) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 size={32} className="text-[#00e5ff] animate-spin mb-4" />
        <p className="text-sm text-[#aaa]">Downloading ParaDB catalog…</p>
        <p className="text-xs text-[#555] mt-1 tabular-nums">
          {loadProgress > 0 ? `${loadProgress.toLocaleString()} songs loaded` : 'connecting'}
        </p>
        <p className="text-[10px] text-[#444] mt-3 max-w-sm text-center">
          One-time fetch. After this, search is instant.
        </p>
      </div>
    )
  }

  // No catalog and not loading — error or first-time refusal
  // No catalog AND not loading = a genuine failure. Show whatever error we
  // captured (network failure, IDB error, etc.) or a friendlier fallback,
  // plus a retry button. The "Catalog unavailable" string is intentionally
  // gone — it implied permanent failure, which is misleading since we can
  // always retry the fetch.
  if (!catalog) {
    return (
      <div className="text-center py-12">
        <p className="text-[#aaa] text-sm">
          {error ?? "Couldn't reach ParaDB"}
        </p>
        <p className="text-[#555] text-xs mt-1">
          Check your internet connection, then try again.
        </p>
        <button
          onClick={fetchCatalog}
          className="mt-4 px-4 py-2 text-xs border border-[#1a1a2e] rounded hover:border-[#00e5ff] hover:text-[#00e5ff] transition-colors text-[#888]"
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Sticky search + toolbar — stays visible while results scroll */}
      <div className="sticky top-0 z-20 bg-[#050508] pb-2 -mx-6 px-6 -mt-6 pt-6 border-b border-[#1a1a2e]">
        {/* Search row: field selector + input */}
        <div className="flex items-stretch gap-2">
          {/* Field dropdown — choose what to search in */}
          <select
            value={searchField}
            onChange={(e) => setSearchField(e.target.value as SearchField)}
            className="bg-[#0d1424] border border-[#1a1a2e] rounded-lg px-3 text-sm text-[#aaa] focus:outline-none focus:border-[#00e5ff40] cursor-pointer"
            title="What field to search"
          >
            {SEARCH_FIELDS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>

          {/* Search input */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Filter ${totalCount.toLocaleString()} ParaDB songs…`}
              className="w-full pl-10 pr-10 py-2.5 bg-[#0d1424] border border-[#1a1a2e] rounded-lg text-sm text-[#ddd] placeholder:text-[#444] focus:outline-none focus:border-[#00e5ff40] transition-colors"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#aaa] transition-colors"
                title="Clear filter"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <ParaDBToolbar
          resultCount={filteredAndSorted.length}
          totalCount={totalCount}
          catalogAgeLabel={ageLabel}
          isRefreshing={isLoading}
          onRefresh={fetchCatalog}
          sort={sort}
          onSortChange={handleSortChange}
          view={view}
          onViewChange={handleViewChange}
        />
      </div>

      {/* Error banner (refresh failed, but cache may still be usable) */}
      {error && (
        <div className="text-sm text-[#ff3a5c] bg-[#ff3a5c10] border border-[#ff3a5c30] rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {/* Results */}
      {filteredAndSorted.length > 0 ? (
        view === 'list' ? (
          <div className="flex flex-col gap-1">
            {filteredAndSorted.map((song) => (
              <ParaDBRow
                key={song.id}
                song={song}
                downloadState={downloading.get(song.id) ?? null}
                onDownload={() => handleDownload(song.id)}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredAndSorted.map((song) => (
              <ParaDBCard
                key={song.id}
                song={song}
                downloadState={downloading.get(song.id) ?? null}
                onDownload={() => handleDownload(song.id)}
              />
            ))}
          </div>
        )
      ) : (
        <div className="text-center py-12">
          <p className="text-[#555] text-sm">
            {query ? 'No matches' : 'Catalog is empty'}
          </p>
          {query && (
            <button
              onClick={() => setQuery('')}
              className="mt-2 text-xs text-[#00e5ff] hover:text-[#33eeff] transition-colors"
            >
              Clear filter
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Parse an ISO-8601-ish timestamp to ms epoch. Returns 0 on garbage so old
 *  records sink to the bottom under "trending" sorts. */
function parseTime(s: string): number {
  if (!s) return 0
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : 0
}
