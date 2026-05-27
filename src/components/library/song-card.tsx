import { useState, useEffect } from 'react'
import { Music, Star, Pencil } from 'lucide-react'
import type { SongMeta } from '@/types/song'
import { formatDuration } from '@/lib/rlrr-parser'
import { KitSignature } from './kit-signature'

interface SongCardProps {
  song: SongMeta
  onPlay: (difficulty: string) => void
  onEdit: () => void
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

export function SongCard({ song, onPlay, onEdit }: SongCardProps) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null)

  useEffect(() => {
    if (song.coverImageBlob) {
      const url = URL.createObjectURL(song.coverImageBlob)
      setCoverUrl(url)
      return () => URL.revokeObjectURL(url)
    } else {
      setCoverUrl(null)
    }
  }, [song.coverImageBlob])

  const handleCardClick = () => {
    if (song.difficulties.length === 1) {
      onPlay(song.difficulties[0]!)
    }
  }

  return (
    <div
      onClick={handleCardClick}
      className={`bg-[#0a0a12] border border-[#1a1a2e] rounded-lg overflow-hidden hover:border-[#2a2a4a] transition-colors group ${song.difficulties.length === 1 ? 'cursor-pointer' : ''}`}
    >
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
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          className="absolute bottom-2 right-2 p-1.5 rounded-md bg-black/60 border border-[#ffffff15] text-[#888] opacity-0 group-hover:opacity-100 hover:text-[#00e5ff] hover:border-[#00e5ff40] hover:bg-black/80 transition-all"
          title="Edit song"
        >
          <Pencil size={12} />
        </button>
      </div>

      <div className="p-3">
        <h3 className="text-sm text-[#ffffffee] truncate">{song.title}</h3>
        <p className="text-xs text-[#555] truncate mt-0.5">{song.artist}</p>

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

        <div className="flex flex-wrap gap-1.5 mt-3">
          {song.difficulties.map((diff) => (
            <button
              key={diff}
              onClick={(e) => {
                e.stopPropagation()
                onPlay(diff)
              }}
              className="px-2.5 py-1 text-xs bg-[#12121e] border border-[#1a1a2e] rounded hover:border-[#00e5ff] hover:text-[#00e5ff] transition-colors"
            >
              {diff}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
