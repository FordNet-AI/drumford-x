import { useCallback, useRef, useState } from 'react'
import { FileMusic, Music2, FolderOpen, Sparkles, X } from 'lucide-react'
import { decodeRlrr } from '@/lib/rlrr-parser'
import { midiToChart } from '@studio/lib/midi-to-chart'
import { rlrrToChart } from '@studio/lib/chart-io'
import { synthDemoBeatMidi } from '@studio/lib/demo-beat'
import { CLASS_TO_NAME } from '@studio/lib/drum-map'
import { laneOrder } from '@studio/lib/grid'
import { useStudioStore } from '@studio/stores/studio-store'
import { useStudioUi } from '@studio/stores/studio-ui-store'
import { useEditorView } from '@studio/stores/editor-view-store'

const KICK_CLASS = 'BP_Kick_C'
const IGNORE = '__ignore__'

/** Target instrument options for the unmapped-note selects: kick first, then the lane order. */
const REMAP_TARGETS: string[] = [KICK_CLASS, ...laneOrder()]

/** Strip the directory + extension from a filename to seed the chart title. */
function titleFromFilename(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/^.*[\\/]/, '') || 'Untitled'
}

function readArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Import panel — the studio's onboarding / re-import surface.
 *
 * Three actions plus a demo-beat shortcut:
 *  1. Import drum MIDI → `midiToChart` → `loadChart`. If the MIDI has GM notes
 *     outside our map, an "Unmapped notes" section lets the user pick a target
 *     instrument (or Ignore) per note, then re-run the conversion with that
 *     `extraMap` (the original ArrayBuffer + opts are kept so re-import is exact).
 *  2. Add backing track → read as Blob → `setAudio` (enabled once a chart exists).
 *  3. Open existing `.rlrr` → `decodeRlrr` → `rlrrToChart` → `loadChart`.
 *
 * Dark styling matches the app shell; drop zones support drag-drop + click-to-
 * browse (same pattern as the player's import-drop-zone, not imported).
 */
export function ImportPanel({
  onImported,
}: {
  /**
   * Called after a chart is loaded. `hasUnmapped` lets the shell keep the
   * import view active (so the remap UI shows) instead of jumping to Preview.
   */
  onImported?: (info: { hasUnmapped: boolean }) => void
} = {}) {
  const chart = useStudioStore((s) => s.chart)
  const loadChart = useStudioStore((s) => s.loadChart)
  const setAudio = useStudioStore((s) => s.setAudio)

  // Kept so "Apply mapping & re-import" re-converts the very same bytes/options.
  const midiBufRef = useRef<ArrayBuffer | null>(null)
  const midiOptsRef = useRef<{ title: string; artist: string } | null>(null)

  const [unmapped, setUnmapped] = useState<Record<number, number>>({})
  // GM note number → chosen target class (or IGNORE). Absent = not yet chosen.
  const [remapChoices, setRemapChoices] = useState<Record<number, string>>({})
  const [dragKind, setDragKind] = useState<null | 'midi' | 'rlrr'>(null)
  const [error, setError] = useState<string | null>(null)

  const audioInputRef = useRef<HTMLInputElement | null>(null)

  /** Reset editor scroll/zoom + clear undo history for a freshly-loaded chart. */
  const onFreshChart = useCallback(() => {
    useEditorView.getState().reset()
    useStudioStore.temporal.getState().clear()
    // A freshly imported chart isn't backed by any saved draft yet, so the next
    // "Save draft" should create a new draft rather than overwrite a prior one.
    useStudioUi.getState().setCurrentDraftId(null)
  }, [])

  const convertAndLoad = useCallback(
    (buf: ArrayBuffer, opts: { title: string; artist: string }, extra?: Record<number, string>) => {
      const { chart: next, unmapped: u } = midiToChart(buf, opts, extra)
      loadChart(next)
      onFreshChart()
      midiBufRef.current = buf
      midiOptsRef.current = opts
      setUnmapped(u)
      setRemapChoices({})
      onImported?.({ hasUnmapped: Object.keys(u).length > 0 })
    },
    [loadChart, onFreshChart, onImported],
  )

  const handleMidiFile = useCallback(
    async (file: File) => {
      setError(null)
      try {
        const buf = await readArrayBuffer(file)
        convertAndLoad(buf, { title: titleFromFilename(file.name), artist: '' })
      } catch (err) {
        console.error('[studio/import] MIDI import failed', err)
        setError(`Could not read MIDI "${file.name}".`)
      }
    },
    [convertAndLoad],
  )

  const handleRlrrFile = useCallback(
    async (file: File) => {
      setError(null)
      try {
        const buf = await readArrayBuffer(file)
        const next = rlrrToChart(decodeRlrr(buf))
        loadChart(next)
        onFreshChart()
        // Opening a chart clears any MIDI re-import context.
        midiBufRef.current = null
        midiOptsRef.current = null
        setUnmapped({})
        setRemapChoices({})
        onImported?.({ hasUnmapped: false })
      } catch (err) {
        console.error('[studio/import] .rlrr open failed', err)
        setError(`Could not open "${file.name}" as an .rlrr chart.`)
      }
    },
    [loadChart, onFreshChart, onImported],
  )

  const handleAudioFile = useCallback(
    async (file: File) => {
      setError(null)
      try {
        // File extends Blob; slice() yields a clean, type-tagged Blob.
        const blob = file.slice(0, file.size, file.type || 'application/octet-stream')
        setAudio({ blob, name: file.name })
      } catch (err) {
        console.error('[studio/import] audio load failed', err)
        setError(`Could not read audio "${file.name}".`)
      }
    },
    [setAudio],
  )

  const handleApplyRemap = useCallback(() => {
    const buf = midiBufRef.current
    const opts = midiOptsRef.current
    if (!buf || !opts) return
    const extra: Record<number, string> = {}
    for (const [gm, target] of Object.entries(remapChoices)) {
      if (target && target !== IGNORE) extra[Number(gm)] = target
    }
    convertAndLoad(buf, opts, extra)
  }, [remapChoices, convertAndLoad])

  const handleDemo = useCallback(() => {
    setError(null)
    convertAndLoad(synthDemoBeatMidi(), { title: 'Demo Beat', artist: 'DrumFord Lab' })
  }, [convertAndLoad])

  // --- drag-drop helpers (mirror the player's import-drop-zone pattern) ---
  const onDrop = useCallback(
    (kind: 'midi' | 'rlrr') => (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragKind(null)
      const file = e.dataTransfer.files?.[0]
      if (!file) return
      if (kind === 'midi') void handleMidiFile(file)
      else void handleRlrrFile(file)
    },
    [handleMidiFile, handleRlrrFile],
  )

  const unmappedEntries = Object.entries(unmapped).sort((a, b) => Number(a[0]) - Number(b[0]))

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-5 px-6 py-10">
      <div>
        <h2 className="text-lg tracking-wide text-[#ffffffee]">Start a chart</h2>
        <p className="mt-1 text-sm text-[#8a93a8]">
          Import a drum MIDI, open an existing <code className="text-[#cdd3df]">.rlrr</code>, or try
          the demo beat. Add a backing track once a chart is loaded.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-[#ff5d5d55] bg-[#ff5d5d11] px-3 py-2 text-sm text-[#ff9b9b]"
        >
          {error}
        </div>
      )}

      {/* 1. Import drum MIDI */}
      <DropZone
        active={dragKind === 'midi'}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragKind('midi')
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragKind(null)
        }}
        onDrop={onDrop('midi')}
        icon={<FileMusic size={22} />}
        title="Import drum MIDI"
        hint="Drop a .mid / .midi file here, or click to browse"
        accept=".mid,.midi,audio/midi,audio/x-midi"
        onPick={handleMidiFile}
      />

      {/* Unmapped notes remap */}
      {unmappedEntries.length > 0 && (
        <div className="rounded-md border border-[#1a1a2e] bg-[#0d1424] p-4">
          <h3 className="text-sm font-medium text-[#ffd27a]">Unmapped notes</h3>
          <p className="mt-1 text-xs text-[#8a93a8]">
            These General MIDI notes have no default instrument. Pick a target (or Ignore), then
            re-import.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {unmappedEntries.map(([gm, count]) => (
              <div key={gm} className="flex items-center gap-3">
                <span className="w-28 shrink-0 font-mono text-xs text-[#cdd3df]">
                  GM {gm}{' '}
                  <span className="text-[#8a93a8]">
                    ×{count}
                  </span>
                </span>
                <select
                  value={remapChoices[Number(gm)] ?? ''}
                  onChange={(e) =>
                    setRemapChoices((prev) => ({ ...prev, [Number(gm)]: e.target.value }))
                  }
                  className="flex-1 rounded border border-[#1a1a2e] bg-[#050508] px-2 py-1 text-xs text-[#ffffffcc]"
                  aria-label={`Target instrument for GM note ${gm}`}
                >
                  <option value="" disabled>
                    Choose instrument…
                  </option>
                  {REMAP_TARGETS.map((cls) => (
                    <option key={cls} value={cls}>
                      {CLASS_TO_NAME[cls] ?? cls}
                    </option>
                  ))}
                  <option value={IGNORE}>Ignore</option>
                </select>
              </div>
            ))}
          </div>
          <button
            onClick={handleApplyRemap}
            className="mt-3 rounded border border-[#00e5ff55] bg-[#00e5ff11] px-3 py-1.5 text-xs tracking-wide text-[#00e5ff] transition-colors hover:bg-[#00e5ff22]"
          >
            Apply mapping &amp; re-import
          </button>
        </div>
      )}

      {/* 2. Backing track */}
      <div className="rounded-md border border-[#1a1a2e] bg-[#0d1424] p-4">
        <div className="flex items-center gap-2 text-[#cdd3df]">
          <Music2 size={18} className="text-[#8a93a8]" />
          <span className="text-sm font-medium">Backing track</span>
        </div>
        <p className="mt-1 text-xs text-[#8a93a8]">
          {chart
            ? 'Add an audio file to play under the chart in Preview.'
            : 'Load a chart first, then attach a backing track here.'}
        </p>

        {chart?.audio ? (
          <div className="mt-3 flex items-center gap-3">
            <span className="flex-1 truncate font-mono text-xs text-[#cdd3df]">
              {chart.audio.name}
            </span>
            <button
              onClick={() => setAudio(null)}
              className="flex items-center gap-1 rounded border border-[#1a1a2e] px-2 py-1 text-xs text-[#8a93a8] transition-colors hover:border-[#ff5d5d55] hover:text-[#ff9b9b]"
              aria-label="Remove backing track"
            >
              <X size={12} /> Remove
            </button>
          </div>
        ) : (
          <div className="mt-3">
            <input
              ref={audioInputRef}
              type="file"
              accept=".mp3,.ogg,.wav,audio/*"
              className="hidden"
              disabled={!chart}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleAudioFile(file)
                e.target.value = '' // allow re-selecting the same file
              }}
            />
            <button
              onClick={() => audioInputRef.current?.click()}
              disabled={!chart}
              className="rounded border border-[#1a1a2e] bg-[#050508] px-3 py-1.5 text-xs text-[#cdd3df] transition-colors enabled:hover:border-[#3a3a5a] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Choose audio file…
            </button>
          </div>
        )}
      </div>

      {/* 3. Open existing .rlrr */}
      <DropZone
        active={dragKind === 'rlrr'}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragKind('rlrr')
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragKind(null)
        }}
        onDrop={onDrop('rlrr')}
        icon={<FolderOpen size={22} />}
        title="Open existing chart"
        hint="Drop a .rlrr file here, or click to browse"
        accept=".rlrr"
        onPick={handleRlrrFile}
      />

      {/* Demo beat shortcut */}
      <div className="flex items-center justify-center pt-1">
        <button
          onClick={handleDemo}
          className="flex items-center gap-2 rounded border border-[#00e5ff55] bg-[#00e5ff11] px-4 py-2 text-xs tracking-wide text-[#00e5ff] transition-colors hover:bg-[#00e5ff22]"
        >
          <Sparkles size={14} />
          Load demo beat
        </button>
      </div>
    </div>
  )
}

/** A dashed drag-drop + click-to-browse tile for a single file kind. */
function DropZone(props: {
  active: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  icon: React.ReactNode
  title: string
  hint: string
  accept: string
  onPick: (file: File) => void | Promise<void>
}) {
  const { active, onDragOver, onDragLeave, onDrop, icon, title, hint, accept, onPick } = props
  return (
    <label
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={
        'relative flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ' +
        (active
          ? 'border-[#00e5ff] bg-[#00e5ff08]'
          : 'border-[#2a2a3a] bg-[#0d142408] hover:border-[#3a3a5a]')
      }
    >
      <span className={active ? 'text-[#00e5ff]' : 'text-[#555]'}>{icon}</span>
      <span className="text-sm text-[#cdd3df]">{title}</span>
      <span className="text-xs text-[#8a93a8]">{hint}</span>
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onPick(file)
          e.target.value = '' // allow re-selecting the same file
        }}
      />
    </label>
  )
}
