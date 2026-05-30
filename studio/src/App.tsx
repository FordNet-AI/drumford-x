import { useState } from 'react'
import { useStudioStore } from '@studio/stores/studio-store'
import { useEditorView } from '@studio/stores/editor-view-store'
import { midiToChart } from '@studio/lib/midi-to-chart'
import { synthDemoBeatMidi } from '@studio/lib/demo-beat'
import { PreviewPanel } from '@studio/components/preview/preview-panel'
import { EditorGrid } from '@studio/components/editor/editor-grid'

type StudioView = 'preview' | 'editor'

export default function App() {
  const chart = useStudioStore((s) => s.chart)
  const loadChart = useStudioStore((s) => s.loadChart)
  const [view, setView] = useState<StudioView>('preview')

  // TEMP: dev demo loader — replaced by the import panel in Phase 5
  const loadDemo = () => {
    const { chart } = midiToChart(synthDemoBeatMidi(), { title: 'Demo Beat', artist: 'DrumFord Lab' })
    loadChart(chart)
    useEditorView.getState().reset()
    // clear any stale undo history from a previous chart
    useStudioStore.temporal.getState().clear()
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[#1a1a2e] px-6 py-4">
        <div className="flex items-center gap-6">
          <h1
            className="text-xl tracking-[0.25em] text-[#ffffffee]"
            style={{ fontFamily: "'Orbitron', sans-serif" }}
          >
            DRUMFORD STUDIO
          </h1>

          {chart && (
            <div className="flex items-center rounded-md border border-[#1a1a2e] bg-[#0d1424] p-0.5">
              {(['preview', 'editor'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={
                    'rounded px-3 py-1 text-xs tracking-wide capitalize transition-colors ' +
                    (view === v
                      ? 'bg-[#00e5ff] text-[#050508]'
                      : 'text-[#8a93a8] hover:text-[#cdd3df]')
                  }
                  aria-pressed={view === v}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* TEMP: dev demo loader — replaced by the import panel in Phase 5 */}
        <button
          onClick={loadDemo}
          className="rounded border border-[#00e5ff55] bg-[#00e5ff11] px-3 py-1.5 text-xs tracking-wide text-[#00e5ff] transition-colors hover:bg-[#00e5ff22]"
        >
          Load demo beat
        </button>
      </header>

      <main className="min-h-0 flex-1">
        {chart ? (
          view === 'preview' ? (
            <PreviewPanel />
          ) : (
            <EditorGrid />
          )
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[#555]">
            Load a chart to preview or edit.
          </div>
        )}
      </main>
    </div>
  )
}
