import { useState, useEffect } from 'react'
import { Music, Star, Pencil } from 'lucide-react'
import type { SongMeta } from '@/types/song'
import { formatDuration } from '@/lib/rlrr-parser'
import { KitSignature } from './kit-signature'

interface SongCardProps {
  song: SongMeta
  onPlay: (difficulty: string) => void
  onEdit: () => void
  /** When true, hide the cover-art block so cards become compact text-only.
   *  Persisted across the library by the parent (localStorage). */
  hideArt: boolean
}

/** Tiny inline SVG snare drum icon */
function DrumIcon({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Drum body (trapezoid-ish cylinder) */}
      <ellipse cx="12" cy="9" rx="9" ry="3" />
      <path d="M3 9v6c0 1.66 4.03 3 9 3s9-1.34 9-3V9" />
      {/* Drumsticks */}
      <line x1="2" y1="3" x2="10" y2="11" />
      <line x1="22" y1="3" x2="14" y2="11" />
    </svg>
  )
}

/**
 * Short, ellipsis-free difficulty labels. The difficulty buttons are
 * content-sized (see render), so labels just need to stay terse:
 *  - "Medium" → "Med"
 *  - "Expert" → "Expert" when there's room (≤3 difficulties on the row), "Exp"
 *    when it's crowded (4+) and the full word wouldn't fit the narrower buttons.
 *  - "Easy" / "Hard" / any custom difficulty pass through unchanged.
 * `count` (the number of difficulties on this card) is a cheap proxy for how
 * much width each button gets — good enough to decide Expert vs Exp without
 * measuring the DOM.
 */
function difficultyLabel(diff: string, count: number): string {
  if (diff === 'Medium') return 'Med'
  if (diff === 'Expert') return count >= 4 ? 'Exp' : 'Expert'
  return diff
}

export function SongCard({ song, onPlay, onEdit, hideArt }: SongCardProps) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null)

  // Skip the object-URL allocation entirely when art is hidden — no reason
  // to decode the blob if we're never rendering it.
  useEffect(() => {
    if (hideArt) {
      setCoverUrl(null)
      return
    }
    if (song.coverImageBlob) {
      const url = URL.createObjectURL(song.coverImageBlob)
      setCoverUrl(url)
      return () => URL.revokeObjectURL(url)
    } else {
      setCoverUrl(null)
    }
  }, [song.coverImageBlob, hideArt])

  // Deduplicate difficulties — a song imported BEFORE the paredit autosave
  // filter shipped will have multiple "Easy" / "Medium" / "Hard" entries
  // because each autosave became its own StoredSong record. Until the user
  // deletes and re-imports, dedup makes the card render cleanly with one
  // button per unique difficulty. Order-preserving: keeps the first
  // occurrence, which matches the order availableDifficulties returns
  // (sorted easiest → hardest via sortDifficulties).
  const uniqueDifficulties = Array.from(new Set(song.difficulties))

  return (
    <div className="bg-[#0d1424] border border-[#1a1a2e] rounded-lg overflow-hidden hover:border-[#2a2a4a] transition-colors group">
      {/* Cover art — omitted entirely in compact mode. The wrapper-div around
          the edit button only renders when there's art to overlay it on. */}
      {!hideArt && (
        <div className="aspect-square relative bg-[#050508] overflow-hidden">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={song.title}
              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music size={48} className="text-[#1a1a2e]" />
            </div>
          )}

          {/* Edit button — bottom-right corner of art */}
          <button
            onClick={onEdit}
            className="absolute bottom-2 right-2 p-1.5 rounded-md bg-black/60 border border-[#ffffff15] text-[#888] opacity-0 group-hover:opacity-100 hover:text-[#00e5ff] hover:border-[#00e5ff40] hover:bg-black/80 transition-all"
            title="Edit song"
          >
            <Pencil size={12} />
          </button>
        </div>
      )}

      <div className="p-3">
        {/* Title row — in compact mode the pencil edit icon moves inline so it
            doesn't get lost (otherwise it lived as an overlay on the art). */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm text-[#ffffffee] truncate">{song.title}</h3>
            <p className="text-xs text-[#555] truncate mt-0.5">{song.artist}</p>
          </div>
          {hideArt && (
            <button
              onClick={onEdit}
              className="flex-shrink-0 p-1 text-[#444] hover:text-[#00e5ff] opacity-0 group-hover:opacity-100 transition-all"
              title="Edit song"
            >
              <Pencil size={12} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 mt-2 text-xs text-[#555]">
          <span>{formatDuration(song.duration)}</span>
          <span>&middot;</span>
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                size={10}
                className={i < song.complexity ? 'text-[#ffcc00] fill-[#ffcc00]' : 'text-[#2a2a3a]'}
              />
            ))}
          </div>

          {/* Drum stem indicator — green drum icon */}
          {song.hasDrumTrack && (
            <>
              <span>&middot;</span>
              <div
                className="flex items-center justify-center w-5 h-5 rounded-full bg-[#22c55e18] border border-[#22c55e40] text-[#22c55e] cursor-default"
                title="Separate drum track — drum volume control available"
              >
                <DrumIcon size={11} />
              </div>
            </>
          )}

          {/* Kit signature — number badge of drums the chart uses, hover for list */}
          <KitSignature instrumentClasses={song.instrumentClasses} />
        </div>

        {/* Difficulty buttons — content-sized pills in a wrapping row. A single
            difficulty stays a compact pill (never a full-width bar), and a
            crowded row wraps gracefully instead of truncating to "Expe…". A
            difficulty button is the ONLY way to enter the song (the whole-card
            click handler was intentionally removed), so each is left-aligned and
            tappable; `min-w` keeps them a tidy minimum size / touch target. */}
        <div className="flex flex-wrap gap-1 mt-3">
          {uniqueDifficulties.map((diff) => (
            <button
              key={diff}
              onClick={() => onPlay(diff)}
              className="px-2.5 py-1 min-w-[2.75rem] text-center text-[11px] bg-[#12121e] border border-[#1a1a2e] rounded hover:border-[#00e5ff] hover:text-[#00e5ff] transition-colors whitespace-nowrap"
              title={diff}
            >
              {difficultyLabel(diff, uniqueDifficulties.length)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
