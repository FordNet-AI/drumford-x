import { useCallback, useState } from 'react'
import { Download, FileArchive, AudioLines } from 'lucide-react'
import { buildSongZip, sanitizeName } from '@studio/lib/export-zip'
import { useStudioStore } from '@studio/stores/studio-store'

/**
 * Export panel — turns the current chart into a ParaDB-compatible song-folder
 * zip and triggers a browser download.
 *
 * `buildSongZip` produces a single top-level folder containing the `.rlrr`
 * chart plus (when present) its backing audio. We download it with the standard
 * object-URL + temporary anchor dance (revoking the URL right after) so nothing
 * leaks. The button is disabled with no chart loaded.
 */
export function ExportPanel() {
  const chart = useStudioStore((s) => s.chart)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleExport = useCallback(async () => {
    if (!chart) return
    setError(null)
    setBusy(true)
    try {
      const blob = await buildSongZip(chart)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = sanitizeName(chart.meta.title || 'song') + '.zip'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[studio/export] zip build failed', err)
      setError('Could not build the .zip. See the console for details.')
    } finally {
      setBusy(false)
    }
  }, [chart])

  if (!chart) return null

  const folder = sanitizeName(chart.meta.title || 'song')
  const difficulty = sanitizeName(chart.meta.difficulty || 'Expert')
  const rlrrName = `${folder}_${difficulty}.rlrr`
  const audioName = chart.audio ? sanitizeName(chart.audio.name) : null

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-5 px-6 py-10">
      <div>
        <h2 className="text-lg tracking-wide text-[#ffffffee]">Export chart</h2>
        <p className="mt-1 text-sm text-[#8a93a8]">
          Download a song-folder <code className="text-[#cdd3df]">.zip</code> ready to import into
          the DrumFord X player (same layout as a Community Charts download).
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

      {/* What's in the zip */}
      <div className="rounded-md border border-[#1a1a2e] bg-[#0d1424] p-4">
        <div className="flex items-center gap-2 text-[#cdd3df]">
          <FileArchive size={18} className="text-[#8a93a8]" />
          <span className="text-sm font-medium">Contents</span>
        </div>
        <ul className="mt-3 flex flex-col gap-1.5 font-mono text-xs text-[#cdd3df]">
          <li className="text-[#8a93a8]">
            {folder}/
          </li>
          <li className="pl-4">
            {rlrrName} <span className="text-[#8a93a8]">— the chart</span>
          </li>
          {audioName ? (
            <li className="pl-4">
              {audioName} <span className="text-[#8a93a8]">— backing track</span>
            </li>
          ) : (
            <li className="pl-4 text-[#8a93a8]">(no audio attached)</li>
          )}
        </ul>
      </div>

      {/* Audio-required reminder */}
      <div
        className={
          'flex items-start gap-2 rounded-md border px-3 py-2 text-xs ' +
          (chart.audio
            ? 'border-[#1a1a2e] bg-[#0d1424] text-[#8a93a8]'
            : 'border-[#ffd27a55] bg-[#ffd27a11] text-[#ffd27a]')
        }
      >
        <AudioLines size={14} className="mt-0.5 shrink-0" />
        <span>
          {chart.audio
            ? 'Audio is bundled — the chart will play in the player once imported.'
            : 'No backing track attached. The chart needs audio to play in the player — add one on the Import tab before exporting.'}
        </span>
      </div>

      <div>
        <button
          onClick={() => void handleExport()}
          disabled={busy}
          className="flex items-center gap-2 rounded border border-[#00e5ff55] bg-[#00e5ff11] px-4 py-2 text-sm tracking-wide text-[#00e5ff] transition-colors enabled:hover:bg-[#00e5ff22] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download size={16} />
          {busy ? 'Building…' : 'Export .zip'}
        </button>
      </div>
    </div>
  )
}
