import { extractSongZip } from './zip-import'

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

/** Pause helper for backoff + polite request pacing. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Exponential backoff with full jitter, capped at 8s. */
function backoffDelay(attempt: number): number {
  const ceil = Math.min(500 * 2 ** attempt, 8000)
  return Math.floor(ceil / 2 + Math.random() * (ceil / 2))
}

/** Parse a Retry-After header (seconds form) → ms, capped 30s. */
function parseRetryAfter(value: string | null): number | null {
  if (!value) return null
  const secs = parseInt(value, 10)
  if (!Number.isNaN(secs) && secs >= 0) return Math.min(secs * 1000, 30_000)
  return null
}

/**
 * fetch() wrapper that retries transient failures (429 + 5xx + network),
 * honoring Retry-After when present, otherwise exponential backoff with
 * jitter. Mirrors the Electron-main implementation in electron/paradb.ts —
 * ParaDB's operator asked third-party clients to be resilient to their rate
 * limits, and Android hits the same API directly (via CapacitorHttp).
 */
async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  opts: { retries?: number; label?: string } = {},
): Promise<Response> {
  const retries = opts.retries ?? 4
  const label = opts.label ?? 'request'
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, init)
      if ((resp.status === 429 || resp.status >= 500) && attempt < retries) {
        const delay = parseRetryAfter(resp.headers.get('retry-after')) ?? backoffDelay(attempt)
        console.warn(`[paradb] ${label}: HTTP ${resp.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`)
        await sleep(delay)
        continue
      }
      return resp
    } catch (err) {
      lastErr = err
      if (attempt >= retries) break
      const delay = backoffDelay(attempt)
      console.warn(`[paradb] ${label}: network error, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`, err)
      await sleep(delay)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`[paradb] ${label} failed after ${retries} retries`)
}

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
  const resp = await fetchWithRetry(url.toString(), undefined, { label: 'search' })
  if (!resp.ok) throw new Error(`ParaDB search failed: ${resp.status}`)
  const data = (await resp.json()) as ParaDBSearchResponse
  if (!data.success) throw new Error('ParaDB search returned unsuccessful')
  return (data.maps ?? []).map(normalizeMap)
}

/** Paginate through the whole ParaDB catalog (~6,000 entries). */
async function paradbCatalog(onProgress: (loaded: number) => void): Promise<ParaDBSearchResult[]> {
  const CHUNK_SIZE = 1000
  // Polite pacing between pages — keeps the ~6 sequential catalog requests
  // from arriving as a tight burst against ParaDB's rate limits.
  const PAGE_DELAY_MS = 300
  const all: ParaDBMap[] = []
  let offset = 0
  const MAX_TOTAL = 20000

  while (all.length < MAX_TOTAL) {
    const url = new URL(`${PARADB_BASE}/api/maps`)
    url.searchParams.set('limit', String(CHUNK_SIZE))
    url.searchParams.set('offset', String(offset))
    const resp = await fetchWithRetry(url.toString(), undefined, { label: `catalog@${offset}` })
    if (!resp.ok) throw new Error(`Catalog fetch failed at offset ${offset}: ${resp.status}`)
    const data = (await resp.json()) as ParaDBSearchResponse
    if (!data.success) throw new Error(`Catalog page at offset ${offset} returned unsuccessful`)
    const page = data.maps ?? []
    if (page.length === 0) break
    all.push(...page)
    onProgress(all.length)
    if (page.length < CHUNK_SIZE) break
    offset += page.length
    await sleep(PAGE_DELAY_MS) // pace requests between pages
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
  // Step 1: Fetch zip with streaming progress (retry through rate limits /
  // transient errors — a download is a single idempotent GET).
  const url = `${PARADB_BASE}/api/maps/${mapId}/download`
  const resp = await fetchWithRetry(url, { redirect: 'follow' }, { label: `download ${mapId}` })
  if (!resp.ok) throw new Error(`ParaDB download failed: ${resp.status}`)

  const contentLength = resp.headers.get('content-length')
  const total = contentLength ? parseInt(contentLength, 10) : 0
  let received = 0
  const chunks: Uint8Array[] = []

  // CapacitorHttp (enabled in capacitor.config.ts) intercepts fetch() and
  // resolves the JS Response with the entire payload already buffered
  // natively — `resp.body` is typically null, so the streaming branch never
  // runs on Android. We keep it for the rare case Capacitor is disabled or a
  // future version supports streaming, and fall through to the arrayBuffer
  // path otherwise. Without a true progress signal there, we emit a single
  // 0.5 ping so the UI bar moves off zero while the zip is being parsed.
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
    onProgress(0.5)
    const buf = await resp.arrayBuffer()
    chunks.push(new Uint8Array(buf))
  }

  // Combine the streamed chunks into one buffer
  const total2 = chunks.reduce((acc, c) => acc + c.length, 0)
  const merged = new Uint8Array(total2)
  let pos = 0
  for (const c of chunks) {
    merged.set(c, pos)
    pos += c.length
  }

  // Step 2: Extract via the shared helper (also used by the user zip-picker)
  const extracted = await extractSongZip(merged)
  onProgress(1)
  return extracted
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
