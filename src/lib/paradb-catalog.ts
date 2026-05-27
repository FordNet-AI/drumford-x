import { get, set, del } from 'idb-keyval'

/**
 * Local persistence layer for the ParaDB catalog.
 *
 * The full catalog (~6,000 maps) is fetched once and cached in IndexedDB so
 * subsequent app opens show songs instantly without re-paginating against
 * the ParaDB API. A timestamp is stored alongside the data so we can decide
 * whether to refresh in the background after some staleness threshold.
 *
 * Stored in IndexedDB (via idb-keyval) — handles the ~5–15MB payload size
 * better than localStorage's 5MB hard cap, and is async (non-blocking).
 *
 * Keys:
 *   `drumford-paradb-catalog`           → ParaDBSearchResult[]
 *   `drumford-paradb-catalog-fetched`   → number (ms timestamp)
 */

const CATALOG_KEY = 'drumford-paradb-catalog'
const TIMESTAMP_KEY = 'drumford-paradb-catalog-fetched'

/** Refresh threshold — older than this and we'll suggest a manual refresh */
export const CATALOG_FRESH_MS = 24 * 60 * 60 * 1000 // 24 hours

export interface CachedCatalog {
  maps: ParaDBSearchResult[]
  fetchedAt: number
}

/** Load the cached catalog from IndexedDB, or null if nothing is stored. */
export async function loadCatalog(): Promise<CachedCatalog | null> {
  try {
    const [maps, fetchedAt] = await Promise.all([
      get<ParaDBSearchResult[]>(CATALOG_KEY),
      get<number>(TIMESTAMP_KEY),
    ])
    if (!Array.isArray(maps) || typeof fetchedAt !== 'number') return null
    return { maps, fetchedAt }
  } catch (err) {
    console.warn('[paradb-catalog] load failed:', err)
    return null
  }
}

/** Persist a freshly-fetched catalog with the current timestamp. */
export async function saveCatalog(maps: ParaDBSearchResult[]): Promise<void> {
  try {
    await Promise.all([
      set(CATALOG_KEY, maps),
      set(TIMESTAMP_KEY, Date.now()),
    ])
  } catch (err) {
    console.error('[paradb-catalog] save failed:', err)
  }
}

/** Wipe the cached catalog entirely (used by a manual reset). */
export async function clearCatalog(): Promise<void> {
  await Promise.all([del(CATALOG_KEY), del(TIMESTAMP_KEY)])
}

/** True if the catalog is missing or older than CATALOG_FRESH_MS. */
export function isStale(catalog: CachedCatalog | null): boolean {
  if (!catalog) return true
  return Date.now() - catalog.fetchedAt > CATALOG_FRESH_MS
}

/** Human-friendly age string e.g. "3 hours ago", "yesterday", "2 days ago" */
export function formatCatalogAge(fetchedAt: number): string {
  const ageMs = Date.now() - fetchedAt
  const minutes = Math.floor(ageMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`
  return `${Math.floor(days / 30)} months ago`
}
