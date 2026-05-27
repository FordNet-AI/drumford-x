import { Search, ArrowUpDown, ChevronDown } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

export type SortField = 'title' | 'artist' | 'complexity' | 'duration' | 'dateAdded'
export type SortDir = 'asc' | 'desc'

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'dateAdded', label: 'Date Added' },
  { value: 'title', label: 'Title' },
  { value: 'artist', label: 'Artist' },
  { value: 'complexity', label: 'Complexity' },
  { value: 'duration', label: 'Duration' },
]

interface LibraryToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  sortField: SortField
  sortDir: SortDir
  onSortChange: (field: SortField) => void
  difficultyFilter: string | null
  onDifficultyFilterChange: (diff: string | null) => void
  availableDifficulties: string[]
}

export function LibraryToolbar({
  search,
  onSearchChange,
  sortField,
  sortDir,
  onSortChange,
  difficultyFilter,
  onDifficultyFilterChange,
  availableDifficulties,
}: LibraryToolbarProps) {
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
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

  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sortField)?.label ?? 'Title'

  return (
    <div className="flex flex-col gap-3">
      {/* Top row: search + sort */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#444]" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter library..."
            className="w-full pl-8 pr-3 py-1.5 bg-[#050508] border border-[#1a1a2e] rounded-lg text-xs text-[#ddd] placeholder:text-[#333] focus:outline-none focus:border-[#00e5ff40] transition-colors"
          />
        </div>

        {/* Sort dropdown */}
        <div className="relative" ref={sortRef}>
          <button
            onClick={() => setSortOpen(!sortOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#888] bg-[#050508] border border-[#1a1a2e] rounded-lg hover:border-[#2a2a4a] transition-colors"
          >
            <ArrowUpDown size={12} />
            <span>{currentSortLabel}</span>
            <span className="text-[#444]">{sortDir === 'asc' ? '↑' : '↓'}</span>
            <ChevronDown size={12} className={`text-[#444] transition-transform ${sortOpen ? 'rotate-180' : ''}`} />
          </button>

          {sortOpen && (
            <div className="absolute right-0 top-full mt-1 bg-[#0a0a12] border border-[#1a1a2e] rounded-lg shadow-xl z-20 min-w-[140px] py-1">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    onSortChange(opt.value)
                    setSortOpen(false)
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                    sortField === opt.value
                      ? 'text-[#00e5ff] bg-[#00e5ff08]'
                      : 'text-[#888] hover:text-[#ddd] hover:bg-[#ffffff06]'
                  }`}
                >
                  {opt.label}
                  {sortField === opt.value && (
                    <span className="ml-2 text-[#444]">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Difficulty filter chips */}
      {availableDifficulties.length > 1 && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[#444] mr-1">DIFFICULTY</span>
          <button
            onClick={() => onDifficultyFilterChange(null)}
            className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
              difficultyFilter === null
                ? 'border-[#00e5ff40] text-[#00e5ff] bg-[#00e5ff10]'
                : 'border-[#1a1a2e] text-[#555] hover:text-[#888] hover:border-[#2a2a4a]'
            }`}
          >
            All
          </button>
          {availableDifficulties.map((diff) => (
            <button
              key={diff}
              onClick={() => onDifficultyFilterChange(difficultyFilter === diff ? null : diff)}
              className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                difficultyFilter === diff
                  ? 'border-[#00e5ff40] text-[#00e5ff] bg-[#00e5ff10]'
                  : 'border-[#1a1a2e] text-[#555] hover:text-[#888] hover:border-[#2a2a4a]'
              }`}
            >
              {diff}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
