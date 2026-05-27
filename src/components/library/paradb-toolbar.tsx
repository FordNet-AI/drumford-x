import { useState, useRef, useEffect } from 'react'
import { ArrowUpDown, ChevronDown, LayoutGrid, List, RefreshCw } from 'lucide-react'

export type ParaDBSort =
  | 'alphabetical'
  | 'popular'        // Most downloaded — all time
  | 'trending7'      // Uploaded ≤ 7 days, sorted by downloads
  | 'trending30'     // Uploaded ≤ 30 days, sorted by downloads
  | 'recent'         // Newest by submission date
  | 'complexity'

export type ParaDBView = 'list' | 'grid'

const SORT_OPTIONS: { value: ParaDBSort; label: string }[] = [
  { value: 'popular',       label: 'Most Popular (all time)' },
  { value: 'trending7',     label: 'Trending — Last 7 days' },
  { value: 'trending30',    label: 'Trending — Last 30 days' },
  { value: 'recent',        label: 'Newest' },
  { value: 'complexity',    label: 'Complexity' },
  { value: 'alphabetical',  label: 'A → Z' },
]

interface ParaDBToolbarProps {
  resultCount: number
  totalCount: number
  catalogAgeLabel: string | null
  isRefreshing: boolean
  onRefresh: () => void
  sort: ParaDBSort
  onSortChange: (sort: ParaDBSort) => void
  view: ParaDBView
  onViewChange: (view: ParaDBView) => void
}

/**
 * Below-the-search toolbar for the ParaDB browser. Shows the result count,
 * a sort dropdown, and a view-mode toggle. Sticky-friendly: no internal
 * scrolling or fixed sizing, fits cleanly under a sticky search bar.
 */
export function ParaDBToolbar({
  resultCount, totalCount, catalogAgeLabel, isRefreshing, onRefresh,
  sort, onSortChange, view, onViewChange,
}: ParaDBToolbarProps) {
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sortOpen) return
    const handleClick = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [sortOpen])

  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label ?? 'Most Popular'

  return (
    <div className="flex items-center gap-3 py-1">
      {/* Result count + catalog age */}
      <span className="text-xs text-[#555] tabular-nums">
        {resultCount === totalCount
          ? `${totalCount.toLocaleString()} songs`
          : `${resultCount.toLocaleString()} of ${totalCount.toLocaleString()}`}
      </span>
      {catalogAgeLabel && (
        <span className="text-[10px] text-[#444]" title="When the local catalog was last refreshed from ParaDB">
          · updated {catalogAgeLabel}
        </span>
      )}

      <div className="flex-1" />

      {/* Refresh catalog */}
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#888] bg-[#050508] border border-[#1a1a2e] rounded-lg hover:border-[#2a2a4a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Re-download the catalog from ParaDB"
      >
        <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
        <span>{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
      </button>

      {/* Sort dropdown */}
      <div className="relative" ref={sortRef}>
        <button
          onClick={() => setSortOpen(!sortOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#888] bg-[#050508] border border-[#1a1a2e] rounded-lg hover:border-[#2a2a4a] transition-colors"
        >
          <ArrowUpDown size={12} />
          <span>{currentSortLabel}</span>
          <ChevronDown size={12} className={`text-[#444] transition-transform ${sortOpen ? 'rotate-180' : ''}`} />
        </button>

        {sortOpen && (
          <div className="absolute right-0 top-full mt-1 bg-[#0a0a12] border border-[#1a1a2e] rounded-lg shadow-xl z-30 min-w-[160px] py-1">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onSortChange(opt.value)
                  setSortOpen(false)
                }}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                  sort === opt.value
                    ? 'text-[#00e5ff] bg-[#00e5ff08]'
                    : 'text-[#888] hover:text-[#ddd] hover:bg-[#ffffff06]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* View toggle */}
      <div className="flex items-center bg-[#050508] border border-[#1a1a2e] rounded-lg overflow-hidden">
        <ViewButton
          active={view === 'list'}
          onClick={() => onViewChange('list')}
          title="List view (compact)"
        >
          <List size={14} />
        </ViewButton>
        <ViewButton
          active={view === 'grid'}
          onClick={() => onViewChange('grid')}
          title="Grid view (cover art)"
        >
          <LayoutGrid size={14} />
        </ViewButton>
      </div>
    </div>
  )
}

function ViewButton({
  active, onClick, title, children,
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-2.5 py-1.5 transition-colors ${
        active
          ? 'text-[#00e5ff] bg-[#00e5ff10]'
          : 'text-[#555] hover:text-[#aaa]'
      }`}
    >
      {children}
    </button>
  )
}
