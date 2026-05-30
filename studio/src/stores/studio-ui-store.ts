import { create } from 'zustand'

/**
 * Studio-local UI state that is NOT chart data and NOT view state.
 *
 * Kept separate from `useStudioStore` (chart + undo history) and
 * `useEditorView` (zoom/scroll): this holds shell concerns only. Right now
 * that's just `currentDraftId` — the id of the draft the loaded chart came
 * from / was last saved as — so repeated "Save draft" clicks UPDATE that draft
 * in place instead of creating duplicates.
 *
 * Set it when a draft is saved or opened; clear it whenever a fresh chart is
 * imported (so the next Save creates a new draft rather than overwriting an
 * unrelated one).
 */
export interface StudioUiState {
  /** Id of the draft backing the current chart, or null if unsaved/freshly imported. */
  currentDraftId: string | null
  setCurrentDraftId: (id: string | null) => void
}

export const useStudioUi = create<StudioUiState>()((set) => ({
  currentDraftId: null,
  setCurrentDraftId: (id) => set({ currentDraftId: id }),
}))
