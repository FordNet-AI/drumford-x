import { Download, Check, Music, Star, Loader2 } from 'lucide-react'

/**
 * Color a difficulty pill by canonical skill rank. Beginner/Easy reads green
 * (chill), Medium yellow (caution), Hard orange (warming up), Expert / + red
 * (full send). Unknown difficulties get a neutral gray so nothing breaks.
 */
function difficultyColor(diff: string): string {
  const d = diff.toLowerCase()
  if (d === 'beginner' || d === 'easy')         return '#22c55e'
  if (d === 'intermediate' || d === 'medium')   return '#ffcc00'
  if (d === 'advanced' || d === 'hard')         return '#ff8800'
  if (d === 'expert')                            return '#ff3a5c'
  if (d === 'expertplus' || d === 'expert+')    return '#ff44dd'
  return '#888'
}

interface ParaDBRowProps {
  song: ParaDBSearchResult
  /** null = not downloading, 0-1 = progress, 2 = done */
  downloadState: number | null
  onDownload: () => void
}

/**
 * Compact horizontal row for a ParaDB search result.
 *
 * Same information as the card view, packed into ~52px of height so users
 * can scan dozens of songs without scrolling. Cover art shrinks to a 40px
 * thumbnail on the left; title + metadata stack tightly in the middle;
 * download button sits at the right. Hover reveals the download CTA inline
 * with no overlay/cover-image gymnastics.
 */
export function ParaDBRow({ song, downloadState, onDownload }: ParaDBRowProps) {
  const isDownloading = downloadState !== null && downloadState < 2
  const isDone = downloadState === 2

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-[#0a0a12] border border-[#1a1a2e] rounded-md hover:border-[#2a2a4a] transition-colors group">
      {/* Thumbnail */}
      <div className="flex-shrink-0 w-10 h-10 rounded bg-[#050508] overflow-hidden border border-[#1a1a2e]">
        {song.coverUrl ? (
          <img
            src={song.coverUrl}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music size={16} className="text-[#1a1a2e]" />
          </div>
        )}
      </div>

      {/* Title + artist */}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm text-[#ffffffee] truncate leading-tight">{song.title}</h3>
        <p className="text-xs text-[#666] truncate leading-tight">{song.artist}</p>
      </div>

      {/* Difficulty pills — each chart difficulty as its own small badge,
          colored by canonical difficulty rank so Easy reads green, Expert reads red.
          Wrapping rather than truncating means the user sees every difficulty
          available rather than "Easy, Expert, Hard, Medi…" with the rest cut off. */}
      {song.difficulty && (
        <div className="hidden sm:flex items-center gap-1 flex-wrap max-w-[200px] justify-end" title={song.difficulty}>
          {song.difficulty.split(',').map((raw) => {
            const diff = raw.trim()
            if (!diff) return null
            const color = difficultyColor(diff)
            return (
              <span
                key={diff}
                className="text-[9px] px-1.5 py-0.5 rounded font-mono tracking-wide tabular-nums"
                style={{ backgroundColor: `${color}18`, color, border: `1px solid ${color}40` }}
              >
                {diff}
              </span>
            )
          })}
        </div>
      )}

      {/* Complexity stars */}
      {song.complexity > 0 && (
        <div className="hidden md:flex items-center gap-0.5 flex-shrink-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              size={9}
              className={i < song.complexity ? 'text-[#ffcc00] fill-[#ffcc00]' : 'text-[#2a2a3a]'}
            />
          ))}
        </div>
      )}

      {/* Creator + downloads */}
      <div className="hidden lg:block text-[10px] text-[#555] flex-shrink-0 min-w-[110px] text-right truncate" title={`by ${song.creator}`}>
        {song.creator ? `by ${song.creator}` : ''}
      </div>
      <div className="hidden xl:block text-[10px] text-[#555] flex-shrink-0 w-[60px] text-right tabular-nums" title="Downloads">
        {song.downloadCount > 0 ? `${song.downloadCount.toLocaleString()} ↓` : ''}
      </div>

      {/* Download button / state */}
      <div className="flex-shrink-0 w-9 flex justify-center">
        {isDone ? (
          <div className="w-7 h-7 rounded-full bg-[#00e5ff] flex items-center justify-center" title="Downloaded">
            <Check size={14} className="text-[#050508]" />
          </div>
        ) : isDownloading ? (
          <div className="w-7 h-7 relative" title={`Downloading… ${Math.round((downloadState ?? 0) * 100)}%`}>
            <svg className="w-full h-full -rotate-90" viewBox="0 0 28 28">
              <circle cx="14" cy="14" r="11" fill="none" stroke="#ffffff20" strokeWidth="2.5" />
              <circle
                cx="14" cy="14" r="11"
                fill="none"
                stroke="#00e5ff"
                strokeWidth="2.5"
                strokeDasharray={`${(downloadState ?? 0) * 69} 69`}
                strokeLinecap="round"
              />
            </svg>
            <Loader2 size={10} className="absolute inset-0 m-auto text-[#00e5ff] animate-spin" />
          </div>
        ) : (
          <button
            onClick={onDownload}
            className="w-7 h-7 rounded-full bg-[#1a1a2e] border border-[#2a2a4a] hover:bg-[#00e5ff] hover:border-[#00e5ff] text-[#888] hover:text-[#050508] flex items-center justify-center transition-all opacity-50 group-hover:opacity-100"
            title="Download and add to library"
          >
            <Download size={12} />
          </button>
        )}
      </div>
    </div>
  )
}
