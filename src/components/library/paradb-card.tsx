import { Download, Check, Music, Star } from 'lucide-react'

interface ParaDBCardProps {
  song: ParaDBSearchResult
  /** null = not downloading, 0-1 = progress, 2 = done */
  downloadState: number | null
  onDownload: () => void
}

/**
 * Card for a ParaDB search result.
 * Shows cover art, title, artist, difficulty, and a download button
 * that transforms into a progress bar then a checkmark.
 */
export function ParaDBCard({ song, downloadState, onDownload }: ParaDBCardProps) {
  const isDownloading = downloadState !== null && downloadState < 2
  const isDone = downloadState === 2

  return (
    <div className="bg-[#0a0a12] border border-[#1a1a2e] rounded-lg overflow-hidden hover:border-[#2a2a4a] transition-colors group">
      {/* Cover art */}
      <div className="aspect-square relative bg-[#050508] overflow-hidden">
        {song.coverUrl ? (
          <img
            src={song.coverUrl}
            alt={song.title}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music size={48} className="text-[#1a1a2e]" />
          </div>
        )}

        {/* Download overlay button */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
          {isDone ? (
            <div className="w-10 h-10 rounded-full bg-[#00e5ff] flex items-center justify-center">
              <Check size={20} className="text-[#050508]" />
            </div>
          ) : isDownloading ? (
            <div className="w-10 h-10 relative">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 40 40">
                <circle
                  cx="20" cy="20" r="16"
                  fill="none"
                  stroke="#ffffff20"
                  strokeWidth="3"
                />
                <circle
                  cx="20" cy="20" r="16"
                  fill="none"
                  stroke="#00e5ff"
                  strokeWidth="3"
                  strokeDasharray={`${(downloadState ?? 0) * 100.5} 100.5`}
                  strokeLinecap="round"
                />
              </svg>
            </div>
          ) : (
            <button
              onClick={onDownload}
              className="w-10 h-10 rounded-full bg-[#00e5ff] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 active:scale-95"
            >
              <Download size={18} className="text-[#050508]" />
            </button>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="p-3">
        <h3 className="text-sm text-[#ffffffee] truncate">{song.title}</h3>
        <p className="text-xs text-[#555] truncate mt-0.5">{song.artist}</p>

        <div className="flex items-center gap-2 mt-2 text-xs text-[#555]">
          {song.difficulty && (
            <>
              <span className="text-[#888]">{song.difficulty}</span>
              <span>&middot;</span>
            </>
          )}
          {song.complexity > 0 && (
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={10}
                  className={i < song.complexity ? 'text-[#ffcc00] fill-[#ffcc00]' : 'text-[#2a2a3a]'}
                />
              ))}
            </div>
          )}
          {song.creator && (
            <>
              <span>&middot;</span>
              <span className="truncate">by {song.creator}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
