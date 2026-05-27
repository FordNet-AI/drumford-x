import { create } from 'zustand'

export type Screen = 'library' | 'highway' | 'setup'

interface UIState {
  screen: Screen
  setScreen: (screen: Screen) => void
}

export const useUIStore = create<UIState>()((set) => ({
  screen: 'library',
  setScreen: (screen) => set({ screen }),
}))
