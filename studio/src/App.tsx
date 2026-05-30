import { useState } from 'react'
import { useStudioStore } from '@studio/stores/studio-store'
import { PreviewPanel } from '@studio/components/preview/preview-panel'
import { EditorGrid } from '@studio/components/editor/editor-grid'
import { ImportPanel } from '@studio/components/import-panel'
import { MetadataPanel } from '@studio/components/metadata-panel'

type StudioView = 'import' | 'preview' | 'editor' | 'metadata'

// Tabs shown once a chart is loaded. "Import" stays available so the user can
// re-import, open a different chart, or attach/replace the backing track.
const VIEWS: StudioView[] = ['import', 'preview', 'editor', 'metadata']

export default function App() {
  const chart = useStudioStore((s) => s.chart)
  const [view, setView] = useState<StudioView>('preview')

  // With no chart there's nothing to preview/edit — show the import panel.
  const activeView: StudioView = chart ? view : 'import'

  // The import panel calls this after loading a chart. If the imported MIDI left
  // unmapped notes, stay on Import so the remap UI is visible; otherwise jump to
  // Preview so the freshly-loaded chart is shown.
  const handleImported = (info: { hasUnmapped: boolean }) =>
    setView(info.hasUnmapped ? 'import' : 'preview')

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
              {VIEWS.map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={
                    'rounded px-3 py-1 text-xs tracking-wide capitalize transition-colors ' +
                    (activeView === v
                      ? 'bg-[#00e5ff] text-[#050508]'
                      : 'text-[#8a93a8] hover:text-[#cdd3df]')
                  }
                  aria-pressed={activeView === v}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        {activeView === 'import' ? (
          <ImportPanel onImported={handleImported} />
        ) : activeView === 'preview' ? (
          <PreviewPanel />
        ) : activeView === 'editor' ? (
          <EditorGrid />
        ) : (
          <MetadataPanel />
        )}
      </main>
    </div>
  )
}
