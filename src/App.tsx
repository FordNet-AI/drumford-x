import { useEffect } from 'react'
import { AppShell } from './components/app-shell'
import { storeSong } from '@/lib/song-storage'
import { useLibraryStore } from '@/stores/library-store'
import { usePlayerStore } from '@/stores/player-store'
import { useUIStore } from '@/stores/ui-store'

// ─────────────────────────────────────────────────────────────────────────────
// SPIKE / THROWAWAY — exists only on branch `spike/midi-to-rlrr`.
//
// Auto-loads the MIDI-generated demo chart (public/spike-demo/demo-beat.*) into
// the player and jumps straight to the highway, so we can screenshot a chart
// built by scripts/spike-midi-to-rlrr.cjs actually rendering on the highway —
// the visual half of the "MIDI → .rlrr" proof.
//
// Drive frame-by-frame from the console / preview_eval via window.__spike:
//   window.__spike.seek(2)   // jump to t=2s (repaints even while paused)
//   window.__spike.play()    // start audio playback (needs a user gesture)
//
// DELETE THIS WHOLE BLOCK + the four extra imports + the useEffect before merge.
// ─────────────────────────────────────────────────────────────────────────────
let __spikeLoaded = false
async function loadSpikeChart() {
  if (__spikeLoaded) return // guard against React StrictMode double-invoke
  __spikeLoaded = true
  try {
    const rlrrJson = await (await fetch('./spike-demo/demo-beat.rlrr')).text()
    const meta = JSON.parse(rlrrJson).recordingMetadata
    const wav = await (await fetch('./spike-demo/demo-beat.wav')).blob()

    const title: string = meta.title
    const difficulty = 'Expert'
    const folderName = 'SpikeDemo'

    await storeSong({
      id: 'spike-demo',
      title,
      artist: meta.artist,
      creator: meta.creator,
      duration: meta.length,
      complexity: meta.complexity ?? 3,
      difficulty,
      coverImageBlob: null,
      folderName,
      rlrrJson,
      songTrackBlobs: [wav],
      drumTrackBlobs: [],
    })
    await useLibraryStore.getState().loadLibrary()

    const song = await useLibraryStore
      .getState()
      .loadSongForPlayback(title, difficulty, folderName)
    if (!song) {
      console.error('[spike] loadSongForPlayback returned null')
      return
    }

    usePlayerStore.getState().loadSong(song)
    useUIStore.getState().setScreen('highway')
    ;(window as unknown as { __spike: unknown }).__spike = {
      seek: (t: number) => usePlayerStore.getState().seek(t),
      play: () => usePlayerStore.getState().play(),
      pause: () => usePlayerStore.getState().pause(),
      song,
    }
    console.log(
      `[spike] Loaded "${title}" → highway (${song.notes.length} notes). Drive with window.__spike`,
    )
  } catch (err) {
    console.error('[spike] auto-load failed:', err)
  }
}

export default function App() {
  useEffect(() => {
    loadSpikeChart()
  }, [])
  return <AppShell />
}
