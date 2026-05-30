import { useSyncExternalStore } from 'react'
import { Undo2, Redo2 } from 'lucide-react'
import { useStudioStore } from '@studio/stores/studio-store'

/**
 * Top-bar Undo / Redo buttons.
 *
 * Undo/redo themselves live on zundo's vanilla temporal store
 * (`useStudioStore.temporal`). The buttons enable/disable off
 * `pastStates.length` / `futureStates.length`, which we read via
 * `useSyncExternalStore` subscribed to that temporal store so they re-render the
 * instant history changes (from button clicks OR the editor's Ctrl+Z/Ctrl+Shift+Z
 * keyboard shortcuts).
 *
 * The snapshot returns primitive lengths (not the state object) so
 * `useSyncExternalStore`'s identity check is stable and never loops.
 */
const temporal = useStudioStore.temporal

function usePastCount(): number {
  return useSyncExternalStore(
    temporal.subscribe,
    () => temporal.getState().pastStates.length,
  )
}

function useFutureCount(): number {
  return useSyncExternalStore(
    temporal.subscribe,
    () => temporal.getState().futureStates.length,
  )
}

export function UndoRedoControls() {
  const canUndo = usePastCount() > 0
  const canRedo = useFutureCount() > 0

  return (
    <div className="flex items-center rounded-md border border-[#1a1a2e] bg-[#0d1424] p-0.5">
      <button
        onClick={() => temporal.getState().undo()}
        disabled={!canUndo}
        className="rounded p-1.5 text-[#8a93a8] transition-colors enabled:hover:text-[#cdd3df] disabled:cursor-not-allowed disabled:opacity-30"
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
      >
        <Undo2 size={15} />
      </button>
      <button
        onClick={() => temporal.getState().redo()}
        disabled={!canRedo}
        className="rounded p-1.5 text-[#8a93a8] transition-colors enabled:hover:text-[#cdd3df] disabled:cursor-not-allowed disabled:opacity-30"
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
      >
        <Redo2 size={15} />
      </button>
    </div>
  )
}
