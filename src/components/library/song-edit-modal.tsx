import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Upload, Music, Trash2 } from 'lucide-react'
import type { SongMeta } from '@/types/song'
import { useLibraryStore } from '@/stores/library-store'

interface SongEditModalProps {
  song: SongMeta
  onClose: () => void
}

export function SongEditModal({ song, onClose }: SongEditModalProps) {
  const [title, setTitle] = useState(song.title)
  const [artist, setArtist] = useState(song.artist)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [newCoverBlob, setNewCoverBlob] = useState<Blob | null | undefined>(undefined)
  const [isSaving, setIsSaving] = useState(false)
  // Two-click delete confirmation. First click flips to true and morphs the
  // button into a louder "Confirm delete?" with a Cancel beside it; second
  // click actually runs removeSong. State is intentionally NOT persisted
  // across mount — closing & reopening the modal always resets to safe.
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const updateSong = useLibraryStore((s) => s.updateSong)
  const removeSong = useLibraryStore((s) => s.removeSong)

  // Create object URL for current cover
  useEffect(() => {
    if (newCoverBlob !== undefined) return // Using new cover preview
    if (song.coverImageBlob) {
      const url = URL.createObjectURL(song.coverImageBlob)
      setCoverPreview(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [song.coverImageBlob, newCoverBlob])

  const handleCoverChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const blob = new Blob([file], { type: file.type })
    setNewCoverBlob(blob)

    const url = URL.createObjectURL(blob)
    setCoverPreview(url)
    // Clean up will happen on unmount or next change
  }, [])

  const handleRemoveCover = useCallback(() => {
    setNewCoverBlob(null) // null = explicitly remove
    setCoverPreview(null)
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const updates: { title?: string; artist?: string; coverImageBlob?: Blob | null } = {}

      if (title.trim() !== song.title) updates.title = title.trim()
      if (artist.trim() !== song.artist) updates.artist = artist.trim()
      if (newCoverBlob !== undefined) updates.coverImageBlob = newCoverBlob

      if (Object.keys(updates).length > 0) {
        await updateSong(song.folderName, updates)
      }
      onClose()
    } catch (err) {
      console.error('Failed to save:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteClick = async () => {
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true)
      return
    }
    // Second click — actually delete.
    setIsDeleting(true)
    try {
      // removeSong deletes every StoredSong sharing this folderName, which
      // matters here: a paredit-polluted song with 30 autosave records all
      // share the same folderName, so a single call wipes the whole bunch.
      await removeSong(song.folderName)
      onClose()
    } catch (err) {
      console.error('Failed to delete:', err)
      // Reset confirmation state so the user sees the safe state again if
      // the delete failed for some reason (rare — idb-keyval rarely errors).
      setIsConfirmingDelete(false)
    } finally {
      setIsDeleting(false)
    }
  }

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const hasChanges =
    title.trim() !== song.title ||
    artist.trim() !== song.artist ||
    newCoverBlob !== undefined

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#0d1424] border border-[#1a1a2e] rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a1a2e]">
          <h2 className="text-sm font-semibold text-[#ffffffee] tracking-wide">Edit Song</h2>
          <button
            onClick={onClose}
            className="p-1 text-[#555] hover:text-[#aaa] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Cover art */}
          <div className="flex items-start gap-4">
            <div className="w-24 h-24 rounded-lg overflow-hidden bg-[#050508] border border-[#1a1a2e] flex-shrink-0 relative group">
              {coverPreview ? (
                <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music size={28} className="text-[#1a1a2e]" />
                </div>
              )}
              {/* Hover overlay */}
              <div
                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={20} className="text-[#00e5ff]" />
              </div>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-[#00e5ff] hover:text-[#33eeff] transition-colors text-left"
              >
                Upload new cover
              </button>
              {(coverPreview || song.coverImageBlob) && (
                <button
                  onClick={handleRemoveCover}
                  className="text-xs text-[#555] hover:text-[#ff3a5c] transition-colors text-left"
                >
                  Remove cover
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleCoverChange}
              />
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs text-[#555] mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-[#050508] border border-[#1a1a2e] rounded-lg text-sm text-[#ffffffee] placeholder:text-[#333] focus:outline-none focus:border-[#00e5ff40] transition-colors"
              placeholder="Song title"
            />
          </div>

          {/* Artist */}
          <div>
            <label className="block text-xs text-[#555] mb-1.5">Artist</label>
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="w-full px-3 py-2 bg-[#050508] border border-[#1a1a2e] rounded-lg text-sm text-[#ffffffee] placeholder:text-[#333] focus:outline-none focus:border-[#00e5ff40] transition-colors"
              placeholder="Artist name"
            />
          </div>

          {/* Read-only info */}
          <div className="flex items-center gap-4 text-xs text-[#444] pt-1">
            <span>Folder: {song.folderName}</span>
            <span>&middot;</span>
            <span>{song.difficulties.length} difficult{song.difficulties.length === 1 ? 'y' : 'ies'}</span>
          </div>
        </div>

        {/* Footer — Delete on the left (destructive), Cancel + Save on the
            right (constructive). Spacing between them prevents the kind of
            misclick that would be irreversible. */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-[#1a1a2e]">
          {/* Delete cluster (left). In the unconfirmed state it's a single
              muted button; clicking it morphs into a louder confirm + an
              inline Cancel that resets to the safe state. */}
          {isConfirmingDelete ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleDeleteClick}
                disabled={isDeleting}
                className="px-4 py-2 text-xs bg-[#ff3a5c20] border border-[#ff3a5c80] text-[#ff3a5c] rounded-lg hover:bg-[#ff3a5c30] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                <Trash2 size={12} />
                {isDeleting ? 'Deleting…' : 'Confirm Delete?'}
              </button>
              <button
                onClick={() => setIsConfirmingDelete(false)}
                disabled={isDeleting}
                className="text-xs text-[#888] hover:text-[#aaa] transition-colors px-2"
              >
                Keep
              </button>
            </div>
          ) : (
            <button
              onClick={handleDeleteClick}
              disabled={isSaving || isDeleting}
              className="px-3 py-2 text-xs text-[#888] hover:text-[#ff3a5c] transition-colors flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Permanently remove this song from your library"
            >
              <Trash2 size={12} />
              Delete Song
            </button>
          )}

          {/* Save cluster (right) */}
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2 text-xs text-[#888] hover:text-[#aaa] transition-colors disabled:opacity-30"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving || isDeleting || !title.trim()}
              className="px-4 py-2 text-xs bg-[#00e5ff15] border border-[#00e5ff40] text-[#00e5ff] rounded-lg hover:bg-[#00e5ff25] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
