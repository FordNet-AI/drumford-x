import { useCallback, useEffect, useRef, useState } from 'react'
import { Save, FolderOpen, X, Check, Trash2 } from 'lucide-react'
import { saveDraft, listDrafts, loadDraft, deleteDraft, type DraftMeta } from '@studio/lib/drafts'
import { useStudioStore } from '@studio/stores/studio-store'
import { useStudioUi } from '@studio/stores/studio-ui-store'
import { useEditorView } from '@studio/stores/editor-view-store'

/** Compact relative time ("just now", "5m ago", "3h ago", "2d ago"); falls back to a date. */
function relTime(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

/**
 * Drafts menu — top-bar Save / Open controls for studio-local drafts
 * (persisted in IndexedDB via `lib/drafts`).
 *
 * De-dupe: the id returned by `saveDraft` is remembered in the studio UI store
 * (`currentDraftId`). Subsequent saves pass that id so they UPDATE the same
 * draft instead of creating duplicates. Opening a draft also sets it; importing
 * a fresh chart clears it (see import-panel `onFreshChart`).
 */
export function DraftsMenu() {
  const chart = useStudioStore((s) => s.chart)
  const loadChart = useStudioStore((s) => s.loadChart)
  const currentDraftId = useStudioUi((s) => s.currentDraftId)
  const setCurrentDraftId = useStudioUi((s) => s.setCurrentDraftId)

  const [saved, setSaved] = useState(false)
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState<DraftMeta[]>([])
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current)
  }, [])

  const handleSave = useCallback(async () => {
    if (!chart) return
    const id = await saveDraft(chart, currentDraftId ?? undefined)
    setCurrentDraftId(id)
    setSaved(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSaved(false), 1600)
  }, [chart, currentDraftId, setCurrentDraftId])

  const refresh = useCallback(async () => {
    setDrafts(await listDrafts())
  }, [])

  const handleOpenMenu = useCallback(() => {
    setOpen(true)
    void refresh()
  }, [refresh])

  const handleLoad = useCallback(
    async (id: string) => {
      const c = await loadDraft(id)
      if (!c) {
        // Stale row (deleted elsewhere) — just refresh the list.
        void refresh()
        return
      }
      loadChart(c)
      // Loaded chart is now backed by this draft; reset view + undo history.
      useEditorView.getState().reset()
      useStudioStore.temporal.getState().clear()
      setCurrentDraftId(id)
      setOpen(false)
    },
    [loadChart, setCurrentDraftId, refresh],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteDraft(id)
      // If we deleted the draft backing the current chart, unlink it so the next
      // Save creates a new draft.
      if (id === currentDraftId) setCurrentDraftId(null)
      void refresh()
    },
    [currentDraftId, setCurrentDraftId, refresh],
  )

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => void handleSave()}
        disabled={!chart}
        className="flex items-center gap-1.5 rounded border border-[#1a1a2e] bg-[#0d1424] px-2.5 py-1 text-xs text-[#cdd3df] transition-colors enabled:hover:border-[#3a3a5a] disabled:cursor-not-allowed disabled:opacity-40"
        title="Save draft"
      >
        {saved ? (
          <>
            <Check size={13} className="text-[#00e5ff]" /> Saved
          </>
        ) : (
          <>
            <Save size={13} /> Save draft
          </>
        )}
      </button>

      <button
        onClick={handleOpenMenu}
        className="flex items-center gap-1.5 rounded border border-[#1a1a2e] bg-[#0d1424] px-2.5 py-1 text-xs text-[#cdd3df] transition-colors hover:border-[#3a3a5a]"
        title="Open draft"
      >
        <FolderOpen size={13} /> Open
      </button>

      {open && (
        <DraftsModal
          drafts={drafts}
          currentDraftId={currentDraftId}
          onClose={() => setOpen(false)}
          onLoad={handleLoad}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}

/** Modal listing saved drafts, newest first; click a row to load, × to delete. */
function DraftsModal(props: {
  drafts: DraftMeta[]
  currentDraftId: string | null
  onClose: () => void
  onLoad: (id: string) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
}) {
  const { drafts, currentDraftId, onClose, onLoad, onDelete } = props

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[#00000099] pt-24"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Open draft"
    >
      <div
        className="flex max-h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-[#1a1a2e] bg-[#0a0f1c] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#1a1a2e] px-4 py-3">
          <h3 className="text-sm tracking-wide text-[#ffffffee]">Open draft</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-[#8a93a8] transition-colors hover:text-[#cdd3df]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {drafts.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[#8a93a8]">
              No saved drafts yet. Use “Save draft” to store the current chart.
            </p>
          ) : (
            <ul className="flex flex-col">
              {drafts.map((d) => (
                <li
                  key={d.id}
                  className={
                    'group flex items-center gap-3 border-b border-[#11192c] px-4 py-2.5 transition-colors hover:bg-[#0d1424] ' +
                    (d.id === currentDraftId ? 'bg-[#0d1424]' : '')
                  }
                >
                  <button
                    onClick={() => void onLoad(d.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm text-[#ffffffcc]">
                        {d.title || 'Untitled'}
                      </span>
                      {d.id === currentDraftId && (
                        <span className="shrink-0 rounded bg-[#00e5ff22] px-1.5 py-0.5 text-[10px] tracking-wide text-[#00e5ff]">
                          current
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-[#8a93a8]">
                      <span className="truncate">{d.artist || '—'}</span>
                      <span>·</span>
                      <span className="shrink-0 tabular-nums">{d.noteCount} notes</span>
                      <span>·</span>
                      <span className="shrink-0">{relTime(d.savedAt)}</span>
                    </div>
                  </button>
                  <button
                    onClick={() => void onDelete(d.id)}
                    className="shrink-0 rounded p-1.5 text-[#8a93a8] opacity-0 transition-opacity hover:text-[#ff9b9b] group-hover:opacity-100"
                    aria-label={`Delete draft ${d.title || 'Untitled'}`}
                    title="Delete draft"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
