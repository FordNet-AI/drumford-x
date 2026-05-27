import JSZip from 'jszip'

/**
 * Capacitor "main process" stand-in.
 *
 * On Electron, our main process (electron/paradb.ts) does CORS-bypassed
 * HTTP fetches and zip extraction. The renderer talks to it via IPC through
 * `window.electronAPI`.
 *
 * On Android/Capacitor there IS no main process — the renderer is the
 * whole app, running in a WebView. We re-create the same operations
 * entirely client-side:
 *   - HTTP: CapacitorHttp (enabled in capacitor.config.ts) intercepts
 *     `fetch()` calls and routes them through native HTTP, bypassing CORS.
 *   - Zip extraction: JSZip in JS — slightly slower than adm-zip but
 *     still well under a second for a typical 10MB song zip.
 *
 * The shim object this module creates has the SAME shape as `ElectronAPI`,
 * so the rest of the renderer (highway, kit setup, library, ParaDB browser)
 * works without knowing which platform it's on. Just install this onto
 * `window.electronAPI` at boot and every existing check continues to work.
 */

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

function normalizeMap(m: ParaDBMap): ParaDBSearchResult {
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
    coverUrl: m.albumArt
      ? `https://maps.paradb.net/albumArt/${m.id}/${m.albumArt}`
      : null,
  }
}

/** Search ParaDB (kept for API parity — the search param is ignored upstream) */
async function paradbSearch(query: string): Promise<ParaDBSearchResult[]> {
  const url = new URL(`${PARADB_BASE}/api/maps`)
  if (query.trim()) url.searchParams.set('search', query.trim())
  const resp = await fetch(url.toString())
  if (!resp.ok) throw new Error(`ParaDB search failed: ${resp.status}`)
  const data = (await resp.json()) as ParaDBSearchResponse
  if (!data.success) throw new Error('ParaDB search returned unsuccessful')
  return (data.maps ?? []).map(normalizeMap)
}

/** Paginate through the whole ParaDB catalog (~6,000 entries). */
async function paradbCatalog(onProgress: (loaded: number) => void): Promise<ParaDBSearchResult[]> {
  const CHUNK_SIZE = 1000
  const all: ParaDBMap[] = []
  let offset = 0
  const MAX_TOTAL = 20000

  while (all.length < MAX_TOTAL) {
    const url = new URL(`${PARADB_BASE}/api/maps`)
    url.searchParams.set('limit', String(CHUNK_SIZE))
    url.searchParams.set('offset', String(offset))
    const resp = await fetch(url.toString())
    if (!resp.ok) throw new Error(`Catalog fetch failed at offset ${offset}: ${resp.status}`)
    const data = (await resp.json()) as ParaDBSearchResponse
    if (!data.success) throw new Error(`Catalog page at offset ${offset} returned unsuccessful`)
    const page = data.maps ?? []
    if (page.length === 0) break
    all.push(...page)
    onProgress(all.length)
    if (page.length < CHUNK_SIZE) break
    offset += page.length
  }
  return all.map(normalizeMap)
}

/**
 * Download a song zip from ParaDB and extract it client-side.
 * Returns the same shape as the Electron main-process version so the
 * renderer code can call it without caring about platform.
 */
async function paradbDownload(
  mapId: string,
  onProgress: (progress: number) => void,
): Promise<{ folderName: string; files: { name: string; data: ArrayBuffer; type: string }[] }> {
  // Step 1: Fetch zip with streaming progress
  const url = `${PARADB_BASE}/api/maps/${mapId}/download`
  const resp = await fetch(url, { redirect: 'follow' })
  if (!resp.ok) throw new Error(`ParaDB download failed: ${resp.status}`)

  const contentLength = resp.headers.get('content-length')
  const total = contentLength ? parseInt(contentLength, 10) : 0
  let received = 0
  const chunks: Uint8Array[] = []

  if (resp.body) {
    const reader = resp.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
      if (total > 0) onProgress(Math.min(received / total, 1))
    }
  } else {
    const buf = await resp.arrayBuffer()
    chunks.push(new Uint8Array(buf))
  }

  // Combine into one buffer
  const total2 = chunks.reduce((acc, c) => acc + c.length, 0)
  const merged = new Uint8Array(total2)
  let pos = 0
  for (const c of chunks) {
    merged.set(c, pos)
    pos += c.length
  }

  // Step 2: Extract with JSZip
  const zip = await JSZip.loadAsync(merged)
  const entries = Object.values(zip.files)

  // Find the top-level folder name
  let folderName = ''
  for (const entry of entries) {
    if (entry.dir) {
      const parts = entry.name.split('/')
      if (parts.length === 2 && parts[1] === '') {
        folderName = parts[0]!
        break
      }
    }
  }
  if (!folderName) {
    const firstFile = entries.find((e) => !e.dir)
    if (firstFile) {
      const parts = firstFile.name.split('/')
      folderName = parts.length > 1 ? parts[0]! : 'Unknown'
    }
  }

  // Step 3: Extract each file
  const files: { name: string; data: ArrayBuffer; type: string }[] = []
  for (const entry of entries) {
    if (entry.dir) continue
    if (entry.name.startsWith('.') || entry.name.includes('__MACOSX')) continue

    const parts = entry.name.split('/')
    const fileName = parts.length > 1 ? parts.slice(1).join('/') : entry.name
    if (fileName.startsWith('.')) continue

    const buffer = await entry.async('arraybuffer')
    const lower = fileName.toLowerCase()
    let type = 'application/octet-stream'
    if (lower.endsWith('.rlrr')) type = 'application/json'
    else if (lower.endsWith('.ogg')) type = 'audio/ogg'
    else if (lower.endsWith('.mp3')) type = 'audio/mpeg'
    else if (lower.endsWith('.wav')) type = 'audio/wav'
    else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) type = 'image/jpeg'
    else if (lower.endsWith('.png')) type = 'image/png'
    else if (lower.endsWith('.webp')) type = 'image/webp'

    files.push({ name: fileName, data: buffer, type })
  }

  onProgress(1)
  return { folderName: folderName || 'Unknown', files }
}

/**
 * Build a fresh ElectronAPI-compatible object for Capacitor.
 * Mirrors the shape of `electron/preload.ts` so the rest of the app's
 * `window.electronAPI?.x()` calls work unchanged.
 */
export function makeCapacitorAPI(): ElectronAPI {
  // Local emitters for progress callbacks — replace Electron IPC events.
  type DownloadListener = (data: { mapId: string; progress: number }) => void
  type CatalogListener = (data: { loaded: number }) => void
  const downloadListeners = new Set<DownloadListener>()
  const catalogListeners = new Set<CatalogListener>()

  return {
    // Window controls — no-ops on Android since the OS handles window state.
    // Closing exits the app via Capacitor's App plugin if available; otherwise
    // we let Android's back-button behavior handle it naturally.
    minimize: () => {},
    maximize: () => {},
    close: () => {
      // Lazy-import App plugin so the bundle doesn't pull it for non-Capacitor builds
      void import('@capacitor/app').then(({ App }) => App.exitApp()).catch(() => {})
    },

    paradbSearch,
    paradbCatalog: () => paradbCatalog((loaded) => {
      for (const l of catalogListeners) l({ loaded })
    }),
    paradbDownload: async (mapId: string) => {
      return paradbDownload(mapId, (progress) => {
        for (const l of downloadListeners) l({ mapId, progress })
      })
    },

    onDownloadProgress: (callback) => {
      downloadListeners.add(callback)
      return () => downloadListeners.delete(callback)
    },
    onCatalogProgress: (callback) => {
      catalogListeners.add(callback)
      return () => catalogListeners.delete(callback)
    },

    isElectron: true, // misnomer kept for API compatibility — really means "has native bridge"
  }
}

/** True when running inside a Capacitor native app (Android in our case). */
export function isCapacitor(): boolean {
  return !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor?.isNativePlatform?.()
}
