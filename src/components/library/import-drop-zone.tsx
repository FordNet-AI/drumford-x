import { useState, useCallback, useRef } from 'react'
import { Upload, FileArchive } from 'lucide-react'
import { useLibraryStore } from '@/stores/library-store'
import { isCapacitor } from '@/lib/capacitor-bridge'
import { extractSongZip } from '@/lib/zip-import'

/**
 * Library-screen import affordance.
 *
 * Renders one of two UIs based on platform:
 *   - Capacitor (Android): a "Pick a .zip" button that opens the system file
 *     picker. Drag-and-drop is meaningless on a touch UI — there's no
 *     "outside the app" to drag from — so we skip it entirely and lean
 *     into the natural distribution unit (.zip files) for community charts.
 *   - Electron / browser: the classic drag-and-drop folder zone, with a
 *     "click to browse" fallback that uses the folder picker (webkitdirectory).
 *
 * Both paths land in `useLibraryStore.importFromBuffers` ultimately, so the
 * downstream parse / IndexedDB-write pipeline is identical regardless of how
 * the bytes got into the app.
 */
export function ImportDropZone() {
  const [isDragOver, setIsDragOver] = useState(false)
  const importFolder = useLibraryStore((s) => s.importFolder)
  const importFiles = useLibraryStore((s) => s.importFiles)
  const importFromBuffers = useLibraryStore((s) => s.importFromBuffers)
  const importProgress = useLibraryStore((s) => s.importProgress)

  // ── Capacitor (Android): zip picker ────────────────────────────────
  const zipInputRef = useRef<HTMLInputElement>(null)

  const handleZipPick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const bytes = await file.arrayBuffer()
      const { folderName, files } = await extractSongZip(bytes)
      // Use the file name (minus .zip) as a friendly default if the zip's
      // top-level folder is generic ("Unknown" etc.). Common for re-zipped
      // backups.
      const fallbackName = file.name.replace(/\.zip$/i, '')
      const finalFolderName = folderName === 'Unknown' ? fallbackName : folderName
      await importFromBuffers(finalFolderName, files)
    } catch (err) {
      console.error('[import-zip] extraction failed:', err)
    } finally {
      // Reset the input so picking the same file again still fires onChange
      if (e.target) e.target.value = ''
    }
  }, [importFromBuffers])

  if (isCapacitor()) {
    return (
      <div className="relative border-2 border-dashed border-[#2a2a3a] hover:border-[#3a3a5a] bg-[#0d142408] rounded-lg p-8 text-center transition-all">
        {importProgress ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-5 h-5 border-2 border-[#00e5ff] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-[#888]">{importProgress}</span>
          </div>
        ) : (
          <label className="flex flex-col items-center gap-2 cursor-pointer">
            <FileArchive size={24} className="text-[#555]" />
            <span className="text-sm text-[#888]">
              Import Zip file
            </span>
            <input
              ref={zipInputRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={handleZipPick}
            />
          </label>
        )}
      </div>
    )
  }

  // ── Electron / browser: drag-and-drop folder zone ──────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    // Try entry-based API first (gives us directory traversal)
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

    // Fallback: use flat file list (some browsers don't support webkitGetAsEntry)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      await importFiles(Array.from(files))
    }
  }, [importFolder, importFiles])

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    await importFiles(Array.from(files))
  }, [importFiles])

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer
        ${isDragOver
          ? 'border-[#00e5ff] bg-[#00e5ff08]'
          : 'border-[#2a2a3a] hover:border-[#3a3a5a] bg-[#0d142408]'
        }
      `}
    >
      {importProgress ? (
        <div className="flex flex-col items-center gap-2">
          <div className="w-5 h-5 border-2 border-[#00e5ff] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-[#888]">{importProgress}</span>
        </div>
      ) : (
        <label className="flex flex-col items-center gap-2 cursor-pointer">
          <Upload size={24} className={isDragOver ? 'text-[#00e5ff]' : 'text-[#555]'} />
          <span className="text-sm text-[#888]">
            Drop song folders here
          </span>
          <span className="text-xs text-[#555]">
            or click to browse
          </span>
          <input
            type="file"
            className="hidden"
            /* @ts-expect-error webkitdirectory is non-standard */
            webkitdirectory=""
            onChange={handleFileInput}
          />
        </label>
      )}
    </div>
  )
}
