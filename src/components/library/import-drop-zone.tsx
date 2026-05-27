import { useState, useCallback } from 'react'
import { Upload } from 'lucide-react'
import { useLibraryStore } from '@/stores/library-store'

export function ImportDropZone() {
  const [isDragOver, setIsDragOver] = useState(false)
  const importFolder = useLibraryStore((s) => s.importFolder)
  const importFiles = useLibraryStore((s) => s.importFiles)
  const importProgress = useLibraryStore((s) => s.importProgress)

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
    console.log('[browse] handleFileInput fired, files:', files?.length ?? 0)
    if (!files || files.length === 0) return
    const fileArr = Array.from(files)
    for (const f of fileArr.slice(0, 5)) {
      console.log('[browse] sample file:', f.name, 'webkitRelativePath:', f.webkitRelativePath, 'size:', f.size)
    }
    if (fileArr.length > 5) console.log('[browse] ...and', fileArr.length - 5, 'more files')
    await importFiles(fileArr)
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
          : 'border-[#2a2a3a] hover:border-[#3a3a5a] bg-[#0a0a1208]'
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
