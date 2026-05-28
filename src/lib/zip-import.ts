import JSZip from 'jszip'

/**
 * Generic Paradiddle song zip extractor for the renderer.
 *
 * Takes a zip's raw bytes (from a fetch, a file picker, anywhere) and produces
 * the `{ folderName, files }` shape that `useLibraryStore.importFromBuffers`
 * expects — same shape the Electron main process produces via adm-zip for
 * ParaDB downloads.
 *
 * Two callers:
 *   - `capacitor-bridge.ts` paradbDownload — Android ParaDB downloads
 *   - User zip-picker in ImportDropZone — Android local file imports
 *
 * MIME types match what `library-store.importFromBuffers` reads when
 * separating audio stems vs charts vs cover images, so the rest of the
 * import pipeline (parse, store in IndexedDB, dedupe) is the same code
 * path as ParaDB downloads.
 */
export interface ExtractedSong {
  folderName: string
  files: { name: string; data: ArrayBuffer; type: string }[]
}

/**
 * Sniff a file's MIME type from its filename extension.
 * Conservative: unknown extensions fall through as `application/octet-stream`
 * so they're harmless if the importer doesn't recognize them.
 */
function mimeFor(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.rlrr')) return 'application/json'
  if (lower.endsWith('.ogg')) return 'audio/ogg'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.wav')) return 'audio/wav'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'application/octet-stream'
}

/**
 * Extract a Paradiddle song zip into the importer's expected shape.
 *
 * Behaviour notes:
 *   - Detects the top-level folder name from a directory entry, falling back
 *     to the prefix of the first file path. Paradiddle zips always wrap a
 *     song in one folder; we strip that prefix off filenames before returning.
 *   - Skips dotfiles and `__MACOSX/` cruft (macOS tar/zip metadata).
 *   - Returns ArrayBuffer for each file because that's what the Blob
 *     constructor + audio decode pipeline downstream wants.
 */
export async function extractSongZip(
  bytes: ArrayBuffer | Uint8Array,
): Promise<ExtractedSong> {
  const zip = await JSZip.loadAsync(bytes)
  const entries = Object.values(zip.files)

  // Find the top-level folder name. Paradiddle zips wrap each song in a
  // single directory; we use that as the song's folderName.
  let folderName = ''
  for (const entry of entries) {
    if (entry.dir) {
      const parts = entry.name.split('/')
      // A "top-level dir" entry looks like `MySong/` — 2 split parts, the
      // second being empty after the trailing slash.
      if (parts.length === 2 && parts[1] === '') {
        folderName = parts[0]!
        break
      }
    }
  }

  // Fallback: derive from the first non-directory file's path prefix
  if (!folderName) {
    const firstFile = entries.find((e) => !e.dir)
    if (firstFile) {
      const parts = firstFile.name.split('/')
      folderName = parts.length > 1 ? parts[0]! : 'Unknown'
    }
  }

  // Extract each file's bytes + sniff MIME
  const files: ExtractedSong['files'] = []
  for (const entry of entries) {
    if (entry.dir) continue
    // Skip dotfiles and macOS metadata at any path depth
    if (entry.name.startsWith('.') || entry.name.includes('__MACOSX')) continue

    // Strip the wrapping folder name from the file path so downstream code
    // sees plain filenames like `song.ogg` instead of `Foo/song.ogg`.
    const parts = entry.name.split('/')
    const fileName = parts.length > 1 ? parts.slice(1).join('/') : entry.name
    if (fileName.startsWith('.')) continue

    const buffer = await entry.async('arraybuffer')
    files.push({ name: fileName, data: buffer, type: mimeFor(fileName) })
  }

  return { folderName: folderName || 'Unknown', files }
}
