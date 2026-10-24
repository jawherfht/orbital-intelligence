import { create } from 'zustand';

interface UiState {
  debug: boolean;
  fps: number;
  toggleDebug: () => void;
  setFps: (fps: number) => void;
}

export const useUiStore = create<UiState>((set) => ({
  debug: false,
  fps: 0,
  toggleDebug: () => set((s) => ({ debug: !s.debug })),
  setFps: (fps) => set({ fps }),
}));
