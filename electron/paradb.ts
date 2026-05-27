import AdmZip from 'adm-zip'

const PARADB_BASE = 'https://paradb.net'

interface ParaDBDifficulty {
  difficulty: string | null
  difficultyName: string
}

interface ParaDBMap {
  id: string
  title: string
  artist: string
  author: string
  complexity: number
  description: string | null
  downloadCount: number
  submissionDate: string
  albumArt: string | null
  difficulties: ParaDBDifficulty[]
}

interface ParaDBSearchResponse {
  success: boolean
  maps: ParaDBMap[]
}

/** Normalize a raw ParaDB map record into the renderer-facing shape */
function normalizeMap(m: ParaDBMap) {
  return {
    id: m.id,
    title: m.title,
    artist: m.artist,
    creator: m.author,
    difficulty: m.difficulties?.map((d) => d.difficultyName).join(', ') ?? '',
    complexity: m.complexity ?? 0,
    description: m.description ?? '',
    downloadCount: m.downloadCount ?? 0,
    uploadedAt: m.submissionDate ?? '',
    // Album art is stored on S3 at maps.paradb.net/albumArt/{id}/{filename}
    coverUrl: m.albumArt
      ? `https://maps.paradb.net/albumArt/${m.id}/${m.albumArt}`
      : null,
  }
}

/**
 * Search ParaDB for songs matching a query.
 *
 * NOTE: the public `?search=` parameter is silently ignored by ParaDB's API
 * (we verified this — passing different queries returns identical default
 * results). This function is kept for backwards compatibility but the
 * preferred path is `fetchAllMaps()` + client-side filtering.
 *
 * GET /api/maps?search=query — bypasses CORS since we're in the main process.
 */
export async function searchParaDB(query: string) {
  const url = new URL(`${PARADB_BASE}/api/maps`)
  if (query.trim()) {
    url.searchParams.set('search', query.trim())
  }

  const resp = await fetch(url.toString())

  if (!resp.ok) {
    throw new Error(`ParaDB search failed: ${resp.status} ${resp.statusText}`)
  }

  const data = (await resp.json()) as ParaDBSearchResponse

  if (!data.success) {
    throw new Error('ParaDB search returned unsuccessful response')
  }

  return (data.maps ?? []).map(normalizeMap)
}

/**
 * Fetch the entire ParaDB catalog by paginating through `?offset=N&limit=1000`.
 *
 * Since the API doesn't actually implement search-by-query, the only way to
 * give users real filtering is to download the whole catalog (~6,000 maps,
 * ~5–15MB JSON) once and filter client-side. The catalog is small enough
 * that the trade-off is worth it — instant filtering beats broken search.
 *
 * Stops when a page returns fewer than CHUNK_SIZE results, indicating the
 * tail of the catalog. Calls `onProgress` after each successful page so the
 * UI can show a "loading 2,400 / ~6,050" indicator.
 */
export async function fetchAllMaps(
  onProgress?: (loaded: number) => void,
): Promise<ReturnType<typeof normalizeMap>[]> {
  const CHUNK_SIZE = 1000
  const all: ParaDBMap[] = []
  let offset = 0
  // Sanity cap so a buggy API or malformed response can't loop forever.
  // ParaDB has ~6k maps; 20k is plenty of headroom for future growth.
  const MAX_TOTAL = 20000

  while (all.length < MAX_TOTAL) {
    const url = new URL(`${PARADB_BASE}/api/maps`)
    url.searchParams.set('limit', String(CHUNK_SIZE))
    url.searchParams.set('offset', String(offset))

    const resp = await fetch(url.toString())
    if (!resp.ok) {
      throw new Error(`Catalog fetch failed at offset ${offset}: ${resp.status} ${resp.statusText}`)
    }
    const data = (await resp.json()) as ParaDBSearchResponse
    if (!data.success) {
      throw new Error(`Catalog page at offset ${offset} returned unsuccessful`)
    }
    const page = data.maps ?? []
    if (page.length === 0) break

    all.push(...page)
    onProgress?.(all.length)

    if (page.length < CHUNK_SIZE) break // last page reached
    offset += page.length
  }

  return all.map(normalizeMap)
}

/**
 * Download a song zip from ParaDB and extract it.
 * GET /api/maps/[id]/download → 307 redirect → S3 zip
 * Returns extracted file buffers ready for IPC transfer to renderer.
 */
export async function downloadAndExtract(
  mapId: string,
  onProgress?: (progress: number) => void,
) {
  // Step 1: Fetch the zip (follows 307 redirect automatically)
  const url = `${PARADB_BASE}/api/maps/${mapId}/download`
  const resp = await fetch(url, { redirect: 'follow' })

  if (!resp.ok) {
    throw new Error(`ParaDB download failed: ${resp.status} ${resp.statusText}`)
  }

  // Step 2: Read the response as a buffer with progress tracking
  const contentLength = resp.headers.get('content-length')
  const total = contentLength ? parseInt(contentLength, 10) : 0

  let receivedBytes = 0
  const chunks: Uint8Array[] = []

  if (resp.body) {
    const reader = resp.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      receivedBytes += value.length
      if (total > 0 && onProgress) {
        onProgress(Math.min(receivedBytes / total, 1))
      }
    }
  } else {
    // Fallback for environments without streaming
    const buffer = await resp.arrayBuffer()
    chunks.push(new Uint8Array(buffer))
    receivedBytes = buffer.byteLength
  }

  // Combine chunks into a single buffer
  const fullBuffer = Buffer.concat(chunks)

  // Step 3: Extract the zip in memory
  const zip = new AdmZip(fullBuffer)
  const entries = zip.getEntries()

  // Find the song folder name (top-level directory in the zip)
  let folderName = ''
  for (const entry of entries) {
    if (entry.isDirectory) {
      // Use the first top-level directory as folder name
      const parts = entry.entryName.split('/')
      if (parts.length === 2 && parts[1] === '') {
        folderName = parts[0]!
        break
      }
    }
  }

  // If no directory found, derive from first file path
  if (!folderName) {
    const firstFile = entries.find((e) => !e.isDirectory)
    if (firstFile) {
      const parts = firstFile.entryName.split('/')
      folderName = parts.length > 1 ? parts[0]! : 'Unknown'
    }
  }

  // Step 4: Extract files into { name, data, type } objects
  const files: { name: string; data: ArrayBuffer; type: string }[] = []

  for (const entry of entries) {
    if (entry.isDirectory) continue

    const entryName = entry.entryName
    // Strip the top-level folder prefix to get just the filename
    const parts = entryName.split('/')
    const fileName = parts.length > 1 ? parts.slice(1).join('/') : entryName

    // Skip hidden files and macOS metadata
    if (fileName.startsWith('.') || fileName.startsWith('__MACOSX')) continue
    // Also skip __MACOSX in the full path
    if (entryName.includes('__MACOSX')) continue

    const buffer = entry.getData()
    const lower = fileName.toLowerCase()

    let type = 'application/octet-stream'
    if (lower.endsWith('.rlrr')) type = 'application/json'
    else if (lower.endsWith('.ogg')) type = 'audio/ogg'
    else if (lower.endsWith('.mp3')) type = 'audio/mpeg'
    else if (lower.endsWith('.wav')) type = 'audio/wav'
    else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) type = 'image/jpeg'
    else if (lower.endsWith('.png')) type = 'image/png'
    else if (lower.endsWith('.webp')) type = 'image/webp'

    files.push({
      name: fileName,
      data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
      type,
    })
  }

  onProgress?.(1)

  return { folderName: folderName || 'Unknown', files }
}
