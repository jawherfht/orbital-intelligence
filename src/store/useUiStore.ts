import { create } from 'zustand';

export type RightTab = 'info' | 'explain';

interface UiState {
  debug: boolean;
  fps: number;
  /** Drawer state on narrow screens (< 900 px); panels are always open on desktop. */
  leftOpen: boolean;
  rightOpen: boolean;
  layersOpen: boolean;
  rightTab: RightTab;
  toggleDebug: () => void;
  setFps: (fps: number) => void;
  setLeftOpen: (v: boolean) => void;
  setRightOpen: (v: boolean) => void;
  setLayersOpen: (v: boolean) => void;
  setRightTab: (t: RightTab) => void;
}

export const useUiStore = create<UiState>((set) => ({
  debug: false,
  fps: 0,
  leftOpen: false,
  rightOpen: false,
  layersOpen: false,
  rightTab: 'info',
  toggleDebug: () => set((s) => ({ debug: !s.debug })),
  setFps: (fps) => set({ fps }),
  setLeftOpen: (leftOpen) => set({ leftOpen }),
  setRightOpen: (rightOpen) => set({ rightOpen }),
  setLayersOpen: (layersOpen) => set({ layersOpen }),
  setRightTab: (rightTab) => set({ rightTab }),
}));
