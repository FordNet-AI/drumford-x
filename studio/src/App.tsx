import { useStudioStore } from '@studio/stores/studio-store'
import { midiToChart } from '@studio/lib/midi-to-chart'
import { synthDemoBeatMidi } from '@studio/lib/demo-beat'
import { PreviewPanel } from '@studio/components/preview/preview-panel'

export default function App() {
  const chart = useStudioStore((s) => s.chart)
  const loadChart = useStudioStore((s) => s.loadChart)

  // TEMP: dev demo loader — replaced by the import panel in Phase 5
  const loadDemo = () => {
    const { chart } = midiToChart(synthDemoBeatMidi(), { title: 'Demo Beat', artist: 'DrumFord Lab' })
    loadChart(chart)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[#1a1a2e] px-6 py-4">
        <h1
          className="text-xl tracking-[0.25em] text-[#ffffffee]"
          style={{ fontFamily: "'Orbitron', sans-serif" }}
        >
          DRUMFORD STUDIO
        </h1>
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
          <PreviewPanel />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[#555]">
            Load a chart to preview the highway.
          </div>
        )}
      </main>
    </div>
  )
}
