import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Tests for the per-song user cues added to the coach store in Phase G.
 *
 * The store reads/writes localStorage at module-load and in every setter. The
 * test Node env exposes a `localStorage` object that THROWS on use, so we
 * install a real in-memory polyfill and re-import the module fresh per test
 * (vi.resetModules) — that exercises the genuine load → merge → save round-trip
 * (forward-compat included) rather than mocking it away.
 */

const STORAGE_KEY = 'drumford-coach-prefs'

function installMemoryStorage(seed?: Record<string, string>) {
  const map = new Map<string, string>(Object.entries(seed ?? {}))
  const mock = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size
    },
  }
  globalThis.localStorage = mock as unknown as Storage
  return map
}

/** Fresh store module bound to the current localStorage mock. */
async function freshStore() {
  vi.resetModules()
  const mod = await import('./coach-store')
  return mod.useCoachStore
}

describe('coach-store user cues', () => {
  beforeEach(() => {
    installMemoryStorage()
  })

  it('defaults userCues to an empty object', async () => {
    const useStore = await freshStore()
    expect(useStore.getState().userCues).toEqual({})
  })

  it('addUserCue returns a non-empty id and stores the cue under the song id', async () => {
    const useStore = await freshStore()
    const id = useStore.getState().addUserCue('song1', 10, 'Watch hands')
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
    const cues = useStore.getState().userCues['song1']!
    expect(cues.length).toBe(1)
    expect(cues[0]).toMatchObject({ id, time: 10, text: 'Watch hands' })
  })

  it('keeps a song’s cues sorted by time as they are added out of order', async () => {
    const useStore = await freshStore()
    const { addUserCue } = useStore.getState()
    addUserCue('s', 30, 'c')
    addUserCue('s', 5, 'a')
    addUserCue('s', 12, 'b')
    expect(useStore.getState().userCues['s']!.map((c) => c.text)).toEqual(['a', 'b', 'c'])
  })

  it('keeps cues for different songs independent', async () => {
    const useStore = await freshStore()
    const { addUserCue } = useStore.getState()
    addUserCue('s1', 10, 'one')
    addUserCue('s2', 20, 'two')
    expect(useStore.getState().userCues['s1']!.map((c) => c.text)).toEqual(['one'])
    expect(useStore.getState().userCues['s2']!.map((c) => c.text)).toEqual(['two'])
  })

  it('getUserCues returns a song’s cues (and [] for an unknown song)', async () => {
    const useStore = await freshStore()
    useStore.getState().addUserCue('s', 10, 'x')
    expect(useStore.getState().getUserCues('s').map((c) => c.text)).toEqual(['x'])
    expect(useStore.getState().getUserCues('nope')).toEqual([])
  })

  it('updateUserCue patches text, leaving other fields intact', async () => {
    const useStore = await freshStore()
    const id = useStore.getState().addUserCue('s', 10, 'old')
    useStore.getState().updateUserCue('s', id, { text: 'new' })
    const cue = useStore.getState().userCues['s']!.find((c) => c.id === id)!
    expect(cue.text).toBe('new')
    expect(cue.time).toBe(10)
  })

  it('updateUserCue patches time and RE-SORTS the list', async () => {
    const useStore = await freshStore()
    const { addUserCue } = useStore.getState()
    addUserCue('s', 5, 'a')
    const idB = addUserCue('s', 12, 'b')
    addUserCue('s', 30, 'c')
    // Move b to the end.
    useStore.getState().updateUserCue('s', idB, { time: 99 })
    expect(useStore.getState().userCues['s']!.map((c) => c.text)).toEqual(['a', 'c', 'b'])
  })

  it('updateUserCue is a no-op for an unknown song or id', async () => {
    const useStore = await freshStore()
    const id = useStore.getState().addUserCue('s', 10, 'x')
    useStore.getState().updateUserCue('s', 'bogus', { text: 'y' })
    useStore.getState().updateUserCue('other', id, { text: 'y' })
    expect(useStore.getState().userCues['s']![0]!.text).toBe('x')
  })

  it('deleteUserCue removes one cue, keeping the rest', async () => {
    const useStore = await freshStore()
    const { addUserCue } = useStore.getState()
    addUserCue('s', 5, 'a')
    const idB = addUserCue('s', 12, 'b')
    addUserCue('s', 30, 'c')
    useStore.getState().deleteUserCue('s', idB)
    expect(useStore.getState().userCues['s']!.map((c) => c.text)).toEqual(['a', 'c'])
  })

  it('persists userCues across a reload (new store instance reads them back)', async () => {
    const useStore = await freshStore()
    useStore.getState().addUserCue('s', 10, 'persisted')
    // Simulate an app reload: re-import the module (same localStorage backing).
    const reloaded = await freshStore()
    expect(reloaded.getState().userCues['s']!.map((c) => c.text)).toEqual(['persisted'])
  })

  it('forward-compat: an OLD save with no userCues key loads as {}', async () => {
    // Seed storage with a legacy prefs blob lacking userCues entirely.
    installMemoryStorage({
      [STORAGE_KEY]: JSON.stringify({ coachEnabled: true, voiceEnabled: false }),
    })
    const useStore = await freshStore()
    expect(useStore.getState().userCues).toEqual({})
    // And the legacy toggle still loaded.
    expect(useStore.getState().voiceEnabled).toBe(false)
  })

  it('ignores a malformed persisted userCues value (falls back to {})', async () => {
    installMemoryStorage({
      [STORAGE_KEY]: JSON.stringify({ userCues: 'not an object' }),
    })
    const useStore = await freshStore()
    expect(useStore.getState().userCues).toEqual({})
  })
})
